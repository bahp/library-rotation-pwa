/**
 * @fileoverview Client-side Semantic Vector Store (`bunko_vectors_v1`), zero-dependency
 * local TF-IDF hashed embedder fallback, optional browser Transformers.js embedder,
 * cosine similarity utilities, and per-profile positive/negative taste centroid calculation.
 */

import { getBookUserRating } from '../../types/models.js';
import { embedTextsWithLlm } from '../llm/llm-client.js';

const VECTOR_DB_NAME = 'bunko_vectors_v1';
const VECTOR_DB_VERSION = 1;
const VECTOR_STORE_NAME = 'vectors';
const VECTOR_LS_KEY = 'bunko_vectors_ls_v1';
const LOCAL_TFIDF_DIMENSIONS = 256;

/** @type {Map<string, StoredVectorRecord>} */
const memoryVectorStore = new Map();

/** @type {Promise<any> | null} */
let transformersPipelinePromise = null;

/**
 * @typedef {Object} StoredVectorRecord
 * @property {string} key - Canonical key (`${engine}::${bookKey}`)
 * @property {string} bookKey - Book ID, candidateKey, or ISBN-13
 * @property {string} engine - Embedding engine identifier
 * @property {string} textHash - Fingerprint of source text to detect metadata updates
 * @property {number[]} vector - L2-normalized dense vector
 * @property {string} updatedAt - ISO-8601 timestamp
 */

/**
 * Computes a short deterministic hash for change detection on book embedding text.
 * @param {string} text
 * @returns {string}
 */
export function hashEmbeddingText(text) {
  let h1 = 2166136261;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (h2 ^ (ch + (i & 255))) >>> 0;
    h2 = Math.imul(h2, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}_${h2.toString(36)}_${text.length}`;
}

/**
 * Builds a structured semantic representation of a Book or BookCandidate for embedding.
 * @param {Record<string, any>} book
 * @returns {string}
 */
export function buildBookEmbeddingText(book) {
  if (!book || typeof book !== 'object') return '';
  const title = String(book.title || '').trim();
  const authors = Array.isArray(book.authors) ? book.authors.filter(Boolean).join(', ') : '';
  const stage = String(book.readingStage || '').trim();
  const format = String(book.format || '').trim();
  const ageSpan =
    typeof book.ageMin === 'number'
      ? `ages ${book.ageMin}-${typeof book.ageMax === 'number' ? book.ageMax : book.ageMin}`
      : '';
  const lang = book.language ? `language ${book.language}` : '';
  const tags = Array.isArray(book.tags) ? book.tags.slice(0, 10).join(', ') : '';
  const subjects = Array.isArray(book.categories || book.subjects)
    ? (book.categories || book.subjects).slice(0, 8).join(', ')
    : '';
  const desc = String(book.description || book.summary || '').trim().slice(0, 900);

  return [
    title && `Title: ${title}`,
    authors && `Authors: ${authors}`,
    [stage, format, ageSpan, lang].filter(Boolean).join(' | '),
    tags && `Themes: ${tags}`,
    subjects && `Subjects: ${subjects}`,
    desc && `Synopsis: ${desc}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1800);
}

/**
 * Resolves a stable identifier for caching a book or candidate vector.
 * @param {Record<string, any>} item
 * @returns {string}
 */
export function resolveVectorEntityKey(item) {
  if (!item || typeof item !== 'object') return '';
  if (typeof item.id === 'string' && item.id) return item.id;
  if (typeof item.isbn13 === 'string' && item.isbn13) return `isbn:${item.isbn13}`;
  if (typeof item.candidateKey === 'string' && item.candidateKey) return item.candidateKey;
  return `title:${String(item.title || '').toLowerCase().trim()}`;
}

/**
 * Normalizes a numeric vector to unit L2 length.
 * @param {number[]} values
 * @returns {number[]}
 */
export function l2Normalize(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  let sumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]) || 0;
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  if (norm <= 1e-12) return values.map(() => 0);
  return values.map((v) => Math.round(((Number(v) || 0) / norm) * 1e6) / 1e6);
}

/**
 * Computes cosine similarity between two equal-dimension vectors in [-1, 1].
 * Safely returns 0 if either vector is missing or dimensions differ.
 * @param {number[] | null | undefined} a
 * @param {number[] | null | undefined} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = Number(a[i]) || 0;
    const vb = Number(b[i]) || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 1e-12) return 0;
  return dot / denom;
}

const LOCAL_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'about',
  'book',
  'books',
  'story',
  'stories',
  'title',
  'authors',
  'themes',
  'subjects',
  'synopsis',
  'ages',
  'read',
  'little',
]);

/**
 * Deterministic hashed feature projection (`embedTextsLocal`) with word unigrams,
 * word bigrams, and 3-char subword n-grams plus sublinear TF weighting and L2 normalization.
 * Runs synchronously offline in <1ms with zero external dependencies.
 *
 * @param {string[]} texts
 * @param {number} [dimensions]
 * @returns {number[][]}
 */
export function embedTextsLocal(texts, dimensions = LOCAL_TFIDF_DIMENSIONS) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const dim = Math.max(64, Math.min(512, Math.trunc(dimensions)));

  /** @param {string} feat */
  const hashFeature = (feat) => {
    let h = 2166136261;
    for (let i = 0; i < feat.length; i++) {
      h ^= feat.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const idx = h % dim;
    const sign = (h >>> 31) & 1 ? -1 : 1;
    return { idx, sign };
  };

  /** @param {string} rawText */
  const extractFeatures = (rawText) => {
    const normalized = String(rawText || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = normalized
      .split(' ')
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !LOCAL_STOP_WORDS.has(w));

    /** @type {Map<string, number>} */
    const counts = new Map();
    const bump = (/** @type {string} */ k, /** @type {number} */ weight) => {
      counts.set(k, (counts.get(k) || 0) + weight);
    };

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      bump(`w:${w}`, 2.0);
      if (i + 1 < words.length) {
        bump(`bi:${w}_${words[i + 1]}`, 1.4);
      }
      if (w.length >= 4) {
        for (let j = 0; j <= w.length - 3; j++) {
          bump(`tri:${w.slice(j, j + 3)}`, 0.45);
        }
      }
    }
    return counts;
  };

  const docFeatureMaps = texts.map((t) => extractFeatures(t));
  // Compute mild inverse-document-frequency damping across the current batch
  /** @type {Map<string, number>} */
  const df = new Map();
  for (const map of docFeatureMaps) {
    for (const key of map.keys()) {
      df.set(key, (df.get(key) || 0) + 1);
    }
  }
  const nDocs = Math.max(1, texts.length);

  return docFeatureMaps.map((counts) => {
    const vec = new Array(dim).fill(0);
    for (const [feat, tf] of counts.entries()) {
      const idf = texts.length > 2 ? Math.log(1 + nDocs / (1 + (df.get(feat) || 1))) : 1;
      const weight = (1 + Math.log(tf)) * idf;
      const { idx, sign } = hashFeature(feat);
      vec[idx] += sign * weight;
    }
    return l2Normalize(vec);
  });
}

/**
 * Optional browser-only Transformers.js (`Xenova/all-MiniLM-L6-v2`) lazy loader via CDN ESM.
 * Zero build/bundle impact; gracefully returns null when offline or blocked so TF-IDF handles it.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][] | null>}
 */
export async function embedTextsWithTransformersBrowser(texts) {
  if (typeof window === 'undefined' || !Array.isArray(texts) || texts.length === 0) {
    return null;
  }
  try {
    if (!transformersPipelinePromise) {
      const dynamicImport = new Function('u', 'return import(u)');
      transformersPipelinePromise = dynamicImport(
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
      ).then(async (/** @type {any} */ mod) => {
        if (mod?.env) {
          mod.env.allowLocalModels = false;
        }
        return mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      });
    }
    const extractor = await Promise.race([
      transformersPipelinePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Transformers timeout')), 12000)),
    ]);
    const vectors = [];
    for (const text of texts) {
      const output = await extractor(text.slice(0, 1200), {
        pooling: 'mean',
        normalize: true,
      });
      const raw = Array.from(output?.data || []);
      vectors.push(l2Normalize(/** @type {number[]} */ (raw)));
    }
    return vectors.length === texts.length && vectors[0]?.length > 0 ? vectors : null;
  } catch (_) {
    transformersPipelinePromise = null;
    return null;
  }
}

/**
 * Embeds texts using the selected engine (`gemini-with-fallback` | `local-tfidf` | `transformers-browser`)
 * with guaranteed deterministic local fallback if remote or browser ONNX models are unavailable.
 *
 * @param {{
 *   texts: string[],
 *   engine?: import('../../types/models.js').DiscoveryEmbeddingEngine,
 *   settings?: import('../../types/models.js').AppSettings | null,
 *   taskType?: 'SEMANTIC_SIMILARITY' | 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'CLUSTERING'
 * }} params
 * @returns {Promise<{
 *   vectors: number[][],
 *   engineUsed: string,
 *   dimensions: number,
 *   fellBack: boolean
 * }>}
 */
export async function embedTextsWithEngine({
  texts,
  engine = 'gemini-with-fallback',
  settings = null,
  taskType = 'SEMANTIC_SIMILARITY',
}) {
  const cleanTexts = Array.isArray(texts) ? texts.map((t) => String(t || '').trim()) : [];
  if (cleanTexts.length === 0) {
    return { vectors: [], engineUsed: 'local-tfidf', dimensions: LOCAL_TFIDF_DIMENSIONS, fellBack: false };
  }

  if (engine === 'transformers-browser') {
    const tfVectors = await embedTextsWithTransformersBrowser(cleanTexts);
    if (tfVectors && tfVectors.length === cleanTexts.length) {
      return {
        vectors: tfVectors,
        engineUsed: 'transformers-browser',
        dimensions: tfVectors[0]?.length || 384,
        fellBack: false,
      };
    }
    return {
      vectors: embedTextsLocal(cleanTexts),
      engineUsed: 'local-tfidf',
      dimensions: LOCAL_TFIDF_DIMENSIONS,
      fellBack: true,
    };
  }

  if (engine === 'gemini-with-fallback' && typeof fetch === 'function') {
    const remote = await embedTextsWithLlm({
      texts: cleanTexts,
      settings,
      taskType,
    });
    if (remote.ok && remote.vectors.length === cleanTexts.length) {
      return {
        vectors: remote.vectors,
        engineUsed: remote.modelUsed || 'gemini-embedding-2',
        dimensions: remote.dimensions || remote.vectors[0]?.length || 0,
        fellBack: false,
      };
    }
    return {
      vectors: embedTextsLocal(cleanTexts),
      engineUsed: 'local-tfidf',
      dimensions: LOCAL_TFIDF_DIMENSIONS,
      fellBack: true,
    };
  }

  return {
    vectors: embedTextsLocal(cleanTexts),
    engineUsed: 'local-tfidf',
    dimensions: LOCAL_TFIDF_DIMENSIONS,
    fellBack: false,
  };
}

function openVectorDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(VECTOR_DB_NAME, VECTOR_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VECTOR_STORE_NAME)) {
        db.createObjectStore(VECTOR_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Vector DB open error'));
  });
}

function readLocalStorageVectors() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(VECTOR_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeLocalStorageVectors(/** @type {Record<string, StoredVectorRecord>} */ mapObj) {
  try {
    if (typeof localStorage === 'undefined') return;
    // Keep localStorage fallback compact (latest 220 vectors)
    const entries = Object.entries(mapObj)
      .sort((a, b) => String(b[1]?.updatedAt || '').localeCompare(String(a[1]?.updatedAt || '')))
      .slice(0, 220);
    localStorage.setItem(VECTOR_LS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch (_) {}
}

/**
 * Loads all cached vectors from `bunko_vectors_v1` IndexedDB (or localStorage/memory fallback).
 * @returns {Promise<Map<string, StoredVectorRecord>>}
 */
export async function loadVectorCache() {
  try {
    const db = await openVectorDb();
    /** @type {StoredVectorRecord[]} */
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, 'readonly');
      const store = tx.objectStore(VECTOR_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
    const out = new Map(memoryVectorStore);
    for (const row of rows) {
      if (row && typeof row.key === 'string' && Array.isArray(row.vector)) {
        out.set(row.key, row);
        memoryVectorStore.set(row.key, row);
      }
    }
    return out;
  } catch (_) {
    const lsMap = readLocalStorageVectors();
    const out = new Map(memoryVectorStore);
    for (const [k, v] of Object.entries(lsMap)) {
      if (v && Array.isArray(v.vector)) {
        out.set(k, v);
        memoryVectorStore.set(k, v);
      }
    }
    return out;
  }
}

/**
 * Persists newly computed vector records into `bunko_vectors_v1` (plus memory & LS fallback).
 * @param {StoredVectorRecord[]} records
 * @returns {Promise<void>}
 */
export async function saveVectorRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return;
  for (const rec of records) {
    if (!rec?.key || !Array.isArray(rec.vector)) continue;
    memoryVectorStore.set(rec.key, rec);
  }
  try {
    const db = await openVectorDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VECTOR_STORE_NAME);
      for (const rec of records) {
        if (rec?.key && Array.isArray(rec.vector)) {
          store.put(rec);
        }
      }
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {
    const lsMap = readLocalStorageVectors();
    for (const rec of records) {
      if (rec?.key && Array.isArray(rec.vector)) {
        lsMap[rec.key] = rec;
      }
    }
    writeLocalStorageVectors(lsMap);
  }
}

/**
 * Clears cached vectors (useful when switching embedding engines or testing).
 * @returns {Promise<void>}
 */
export async function clearVectorCache() {
  memoryVectorStore.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(VECTOR_LS_KEY);
    }
  } catch (_) {}
  try {
    const db = await openVectorDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VECTOR_STORE_NAME, 'readwrite');
      tx.objectStore(VECTOR_STORE_NAME).clear();
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch (_) {}
}

/**
 * Ensures vectors exist for a list of books (reusing cached vectors matching `textHash` + `engine`).
 *
 * @param {{
 *   books: Array<Record<string, any>>,
 *   engine: import('../../types/models.js').DiscoveryEmbeddingEngine,
 *   settings?: import('../../types/models.js').AppSettings | null
 * }} params
 * @returns {Promise<{
 *   vectorsByBookKey: Map<string, number[]>,
 *   engineUsed: string,
 *   dimensions: number
 * }>}
 */
export async function ensureBookVectors({ books, engine = 'gemini-with-fallback', settings = null }) {
  const cache = await loadVectorCache();
  const engineNamespace = engine === 'gemini-with-fallback' ? 'gemini-embedding-2' : engine;

  /** @type {Map<string, number[]>} */
  const vectorsByBookKey = new Map();
  /** @type {Array<{ item: Record<string, any>, bookKey: string, text: string, textHash: string }>} */
  const missing = [];

  for (const item of books || []) {
    const bookKey = resolveVectorEntityKey(item);
    if (!bookKey) continue;
    const text = buildBookEmbeddingText(item);
    if (!text) continue;
    const textHash = hashEmbeddingText(text);

    const primaryRecord = cache.get(`${engineNamespace}::${bookKey}`);
    if (primaryRecord && primaryRecord.textHash === textHash && primaryRecord.vector.length > 0) {
      vectorsByBookKey.set(bookKey, primaryRecord.vector);
      continue;
    }

    if (engine !== 'local-tfidf') {
      const fallbackRecord = cache.get(`local-tfidf::${bookKey}`);
      if (fallbackRecord && fallbackRecord.textHash === textHash && fallbackRecord.vector.length > 0) {
        vectorsByBookKey.set(bookKey, fallbackRecord.vector);
      }
    }

    missing.push({ item, bookKey, text, textHash });
  }

  let effectiveEngine = engineNamespace;
  let dimensions = 0;

  if (missing.length > 0) {
    const embedded = await embedTextsWithEngine({
      texts: missing.map((m) => m.text),
      engine,
      settings,
      taskType: 'SEMANTIC_SIMILARITY',
    });
    effectiveEngine = embedded.engineUsed;
    dimensions = embedded.dimensions;
    const nowIso = new Date().toISOString();
    /** @type {StoredVectorRecord[]} */
    const toPersist = [];

    for (let i = 0; i < missing.length; i++) {
      const vec = embedded.vectors[i];
      if (!vec || vec.length === 0) continue;
      const entry = missing[i];
      vectorsByBookKey.set(entry.bookKey, vec);
      toPersist.push({
        key: `${effectiveEngine}::${entry.bookKey}`,
        bookKey: entry.bookKey,
        engine: effectiveEngine,
        textHash: entry.textHash,
        vector: vec,
        updatedAt: nowIso,
      });
    }

    await saveVectorRecords(toPersist);

    // Filter out mismatched-dimension fallback entries if the active batch succeeded in a different dim
    if (dimensions > 0) {
      for (const [k, vec] of vectorsByBookKey.entries()) {
        if (vec.length !== dimensions) {
          vectorsByBookKey.delete(k);
        }
      }
    }
  } else {
    const firstVec = vectorsByBookKey.values().next().value;
    dimensions = Array.isArray(firstVec) ? firstVec.length : LOCAL_TFIDF_DIMENSIONS;
  }

  return {
    vectorsByBookKey,
    engineUsed: effectiveEngine,
    dimensions,
  };
}

/**
 * Computes L2-normalized Positive Taste Centroid and Negative Discard Centroid vectors
 * for a given ChildProfile, plus sets of disliked authors & tags for hybrid reranking.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   vectorsByBookKey: Map<string, number[]>
 * }} params
 * @returns {{
 *   positiveVector: number[] | null,
 *   negativeVector: number[] | null,
 *   dimensions: number,
 *   positiveCount: number,
 *   negativeCount: number,
 *   dislikedAuthors: Set<string>,
 *   dislikedTags: Set<string>,
 *   lovedAuthors: Set<string>
 * }}
 */
export function computeTasteProfileVectors({ books, profile = null, vectorsByBookKey }) {
  const profileId = profile?.id || '';
  const readSet = new Set(profile?.readHistoryBookIds || []);
  const favTopicSet = new Set((profile?.favoriteTopics || []).map((t) => t.toLowerCase().trim()));

  /** @type {Array<{ vec: number[], weight: number }>} */
  const positiveSamples = [];
  /** @type {Array<{ vec: number[], weight: number }>} */
  const negativeSamples = [];

  /** @type {Set<string>} */
  const dislikedAuthors = new Set();
  /** @type {Set<string>} */
  const likedAuthors = new Set();
  /** @type {Set<string>} */
  const likedTags = new Set();
  /** @type {Map<string, number>} */
  const discardedTagCounts = new Map();

  for (const book of books || []) {
    const key = resolveVectorEntityKey(book);
    const vec = vectorsByBookKey.get(key);
    const rating = getBookUserRating(book, profileId);
    const isDiscarded =
      Boolean(book.discardedAt) ||
      (profileId &&
        Array.isArray(book.discardedByProfileIds) &&
        book.discardedByProfileIds.includes(profileId));

    if (isDiscarded || (rating > 0 && rating <= 2)) {
      const negWeight = isDiscarded ? 1.5 : 1.0;
      if (vec && vec.length > 0) {
        negativeSamples.push({ vec, weight: negWeight });
      }
      for (const a of book.authors || []) {
        const cleanA = String(a || '').trim().toLowerCase();
        if (cleanA && cleanA !== 'unknown author') {
          dislikedAuthors.add(cleanA);
        }
      }
      for (const t of book.tags || []) {
        const cleanT = String(t || '').trim().toLowerCase();
        if (cleanT) {
          discardedTagCounts.set(cleanT, (discardedTagCounts.get(cleanT) || 0) + 1);
        }
      }
      continue;
    }

    // Only build positive taste centroid from household-owned / wishlist / rated books (never uncurated suggestions)
    const status = String(book.collectionStatus || 'owned');
    if (status === 'interested' && !book.loved && rating < 4) continue;

    let posWeight = 0;
    if (book.loved) posWeight += 3.0;
    if (rating >= 4) posWeight += rating === 5 ? 3.0 : 2.0;
    if (readSet.has(book.id)) posWeight += 1.4;
    if (status === 'owned' || status === 'library') posWeight += 0.6;
    if ((book.tags || []).some((t) => favTopicSet.has(String(t).toLowerCase()))) posWeight += 1.0;

    if (posWeight > 0) {
      if (vec && vec.length > 0) {
        positiveSamples.push({ vec, weight: posWeight });
      }
      if (book.loved || rating >= 4) {
        for (const a of book.authors || []) {
          const cleanA = String(a || '').trim().toLowerCase();
          if (cleanA && cleanA !== 'unknown author') likedAuthors.add(cleanA);
        }
      }
      for (const t of book.tags || []) {
        const cleanT = String(t || '').trim().toLowerCase();
        if (cleanT) likedTags.add(cleanT);
      }
    }
  }

  // Only penalize tags from discarded books that are NOT liked elsewhere in the family library
  /** @type {Set<string>} */
  const dislikedTags = new Set();
  for (const [tag, count] of discardedTagCounts.entries()) {
    if (!likedTags.has(tag) && !favTopicSet.has(tag) && count >= 1) {
      dislikedTags.add(tag);
    }
  }
  for (const likedA of likedAuthors) {
    dislikedAuthors.delete(likedA);
  }

  const computeCentroid = (/** @type {Array<{ vec: number[], weight: number }>} */ samples) => {
    if (samples.length === 0) return null;
    // Choose dominant dimensionality so mixed caches never collide
    /** @type {Map<number, number>} */
    const dimCounts = new Map();
    for (const s of samples) {
      dimCounts.set(s.vec.length, (dimCounts.get(s.vec.length) || 0) + 1);
    }
    const targetDim = [...dimCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
    if (targetDim <= 0) return null;
    const sum = new Array(targetDim).fill(0);
    for (const s of samples) {
      if (s.vec.length !== targetDim) continue;
      for (let i = 0; i < targetDim; i++) {
        sum[i] += s.vec[i] * s.weight;
      }
    }
    return l2Normalize(sum);
  };

  const positiveVector = computeCentroid(positiveSamples);
  const negativeVector = computeCentroid(negativeSamples);
  const dimensions = positiveVector?.length || negativeVector?.length || 0;

  return {
    positiveVector,
    negativeVector,
    dimensions,
    positiveCount: positiveSamples.length,
    negativeCount: negativeSamples.length,
    dislikedAuthors,
    dislikedTags,
    lovedAuthors: likedAuthors,
  };
}
