/**
 * @fileoverview Two-Stage Discovery & Recommendation Pipeline:
 * Stage 1: Gemini Flash Query Expansion (with deterministic local fallback) ->
 *          Multi-query candidate retrieval (configurable 20..150+ pool size) ->
 *          Modern recency / edition-count / age / adult-noise filtering.
 * Stage 2: Semantic embedding reranking (`gemini-embedding-2` or local TF-IDF / Transformers.js)
 *          blending Positive Taste Centroid similarity, Negative Discard Centroid contrast,
 *          age/stage/language alignment, recency, and edition popularity.
 */

import { queryDiscoveryExpansionWithLlm } from '../llm/llm-client.js';
import {
  buildBookEmbeddingText,
  computeTasteProfileVectors,
  cosineSimilarity,
  embedTextsWithEngine,
  ensureBookVectors,
  resolveVectorEntityKey,
} from './vector-store.js';
import { normalizeCollectionStatus } from '../../types/models.js';
import { cleanBookDescription } from '../catalog/normalizer.js';
import { inferLocalTopicTags } from './rule-tagger.js';

const NON_CHILDREN_NOISE_REGEX =
  /\b(price catalog|catalogue|annual report|directory|bibliography|textbook|study guide|workbook|exam prep|curriculum|teacher's guide|thesis|dissertation|proceedings|journal of|statutes|ordinances|complete works|collected essays|literary criticism)\b/i;

/**
 * Checks whether a book has been discarded globally or for a specific child profile.
 *
 * @param {import('../../types/models.js').Book | null | undefined} book
 * @param {string | null | undefined} [profileId]
 * @returns {boolean}
 */
export function isBookDiscardedForProfile(book, profileId) {
  if (!book) return false;
  if (Array.isArray(book.discardedByProfileIds) && profileId) {
    if (book.discardedByProfileIds.includes(profileId)) return true;
  }
  return Boolean(book.discardedAt);
}

/**
 * Deterministic Stage 1 local query expansion when Gemini Flash is offline or unconfigured.
 * Builds focused modern children's book search queries honoring age, reading stage, topic,
 * and language without drifting into archaic 19th-century catalogs.
 *
 * @param {{
 *   intent: string,
 *   topic?: string,
 *   seedBook?: import('../../types/models.js').Book | null,
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   language?: string,
 *   page?: number,
 *   recencyPreference?: 'modern' | 'balanced' | 'include-classics'
 * }} params
 * @returns {{
 *   queries: string[],
 *   subjects: string[],
 *   avoidTerms: string[],
 *   rationale: string
 * }}
 */
export function expandDiscoveryQueriesLocal({
  intent,
  topic = '',
  seedBook = null,
  profile = null,
  language = '',
  recencyPreference = 'modern',
}) {
  const stage = seedBook?.readingStage || profile?.readingStage || 'picture-book';
  const stagePhrase =
    stage === 'board-toddler'
      ? 'toddler board book'
      : stage === 'early-reader'
        ? 'early reader children book'
        : stage === 'chapter-book'
          ? 'children chapter book'
          : stage === 'middle-grade'
            ? 'middle grade fiction'
            : stage === 'teen-ya'
              ? 'young adult fiction'
              : 'children picture book';

  const cleanTopic = String(topic || '').trim();
  const favTopics = (profile?.favoriteTopics || [])
    .map((t) => String(t || '').replace(/-/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);

  /** @type {string[]} */
  const queries = [];
  /** @type {string[]} */
  const subjects = [];

  if (seedBook) {
    const primaryAuthor = seedBook.authors?.[0] && seedBook.authors[0] !== 'Unknown Author'
      ? seedBook.authors[0]
      : '';
    const seedTags = (seedBook.tags || [])
      .filter((t) => !['picture-book', 'board-book', 'early-reader', 'chapter-book'].includes(t))
      .slice(0, 3)
      .map((t) => t.replace(/-/g, ' '));
    if (primaryAuthor) {
      queries.push(`${primaryAuthor} ${stagePhrase}`);
    }
    if (seedTags.length > 0) {
      queries.push(`${seedTags.join(' ')} ${stagePhrase}`);
      subjects.push(...seedTags);
    }
    queries.push(`"${seedBook.title.split(/[:(]/)[0].trim()}" similar ${stagePhrase}`);
  }

  if (cleanTopic) {
    queries.push(`${cleanTopic} ${stagePhrase}`);
    queries.push(`illustrated ${cleanTopic} children story`);
    subjects.push(cleanTopic);
  }

  if (intent === 'bedtime') {
    queries.push(`goodnight bedtime ${stagePhrase}`);
    queries.push(`sleepy animals cozy bedtime children book`);
    subjects.push('bedtime', 'sleep');
  } else if (intent === 'award-modern') {
    queries.push(`caldecott honor illustrated ${stagePhrase}`);
    queries.push(`award winning modern ${stagePhrase}`);
    subjects.push('picture books', 'juvenile fiction');
  } else if (intent === 'language' && language && language !== 'english') {
    queries.push(`${language} ${stagePhrase}`);
    queries.push(`cuentos infantiles ${language === 'spanish' ? 'ilustrados' : language}`);
    subjects.push(`${language} children books`);
  } else if (intent === 'seasonal' && cleanTopic) {
    queries.push(`${cleanTopic} celebration ${stagePhrase}`);
    subjects.push(cleanTopic);
  } else if (favTopics.length > 0) {
    queries.push(`${favTopics[0]} ${stagePhrase}`);
    if (favTopics[1]) {
      queries.push(`${favTopics[1]} illustrated ${stagePhrase}`);
    }
    subjects.push(...favTopics);
  }

  if (queries.length < 3) {
    queries.push(`beloved modern ${stagePhrase}`);
    queries.push(`read aloud illustrated ${stagePhrase}`);
  }

  if (recencyPreference === 'modern' && queries.length < 5) {
    queries.push(`new illustrated ${cleanTopic || favTopics[0] || 'nature'} ${stagePhrase}`);
  }

  return {
    queries: Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean))).slice(0, 6),
    subjects: Array.from(new Set(subjects.map((s) => s.trim().toLowerCase()).filter(Boolean))).slice(0, 4),
    avoidTerms: ['catalog', 'textbook', 'workbook', 'study guide'],
    rationale: cleanTopic
      ? `Targeted ${stagePhrase} picks centered on ${cleanTopic}.`
      : `Tailored ${stagePhrase} picks for ${profile?.name || 'your reader'}.`,
  };
}

/**
 * Stage 1 Query Expansion: Uses Gemini Flash (`gemini-4-hydrogen`) when enabled and reachable,
 * seamlessly falling back to deterministic local query expansion.
 *
 * @param {{
 *   intent: string,
 *   topic?: string,
 *   seedBook?: import('../../types/models.js').Book | null,
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   books?: import('../../types/models.js').Book[],
 *   language?: string,
 *   recencyPreference?: 'modern' | 'balanced' | 'include-classics',
 *   settings?: import('../../types/models.js').AppSettings | null
 * }} params
 * @returns {Promise<{
 *   queries: string[],
 *   subjects: string[],
 *   avoidTerms: string[],
 *   rationale: string,
 *   usedFlash: boolean,
 *   modelUsed?: string
 * }>}
 */
export async function expandDiscoveryQueries({
  intent,
  topic = '',
  seedBook = null,
  profile = null,
  books = [],
  language = '',
  recencyPreference = 'modern',
  settings = null,
}) {
  const local = expandDiscoveryQueriesLocal({
    intent,
    topic,
    seedBook,
    profile,
    language,
    recencyPreference,
  });

  const useFlash = settings?.discoverySettings?.useFlashQueryExpansion !== false;
  if (!useFlash || typeof fetch !== 'function') {
    return { ...local, usedFlash: false };
  }

  const lovedTitles = (books || [])
    .filter((b) => b.loved && !isBookDiscardedForProfile(b, profile?.id))
    .slice(0, 6)
    .map((b) => b.title);

  const dislikedTitles = (books || [])
    .filter((b) => isBookDiscardedForProfile(b, profile?.id))
    .slice(0, 5)
    .map((b) => b.title);

  try {
    const llmOut = await queryDiscoveryExpansionWithLlm({
      intent,
      topic,
      seedBook,
      profile,
      lovedTitles,
      dislikedTitles,
      language,
      recencyPreference,
      settings: /** @type {import('../../types/models.js').AppSettings} */ (settings),
    });

    if (Array.isArray(llmOut.queries) && llmOut.queries.length > 0) {
      return {
        queries: Array.from(new Set([...llmOut.queries, ...local.queries])).slice(0, 6),
        subjects: llmOut.subjects.length > 0 ? llmOut.subjects : local.subjects,
        avoidTerms: llmOut.avoidTerms.length > 0 ? llmOut.avoidTerms : local.avoidTerms,
        rationale: llmOut.rationale || local.rationale,
        usedFlash: true,
        modelUsed: llmOut.modelUsed,
      };
    }
  } catch (_) {
    // Graceful local fallback when offline, unconfigured, or rate-limited
  }

  return { ...local, usedFlash: false };
}

/**
 * Checks whether a candidate matches a book already owned/on-wishlist or discarded in the library.
 * @param {import('../catalog/normalizer.js').BookCandidate} candidate
 * @param {import('../../types/models.js').Book[]} existingBooks
 * @param {string | undefined} profileId
 * @returns {{ alreadyInLibrary: boolean, isDiscarded: boolean, matchedBook?: import('../../types/models.js').Book }}
 */
export function matchCandidateInLibrary(candidate, existingBooks, profileId) {
  const candTitle = String(candidate.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const candAuthor = String(candidate.authors?.[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const book of existingBooks || []) {
    const isbnMatch =
      Boolean(candidate.isbn13 && book.isbn13 && candidate.isbn13 === book.isbn13) ||
      Boolean(candidate.isbn10 && book.isbn10 && candidate.isbn10 === book.isbn10);
    const bookTitle = String(book.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const bookAuthor = String(book.authors?.[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const titleAuthorMatch =
      Boolean(candTitle && bookTitle && candTitle === bookTitle) &&
      (!candAuthor || !bookAuthor || candAuthor === bookAuthor || bookAuthor === 'unknownauthor');

    if (isbnMatch || titleAuthorMatch) {
      const status = normalizeCollectionStatus(book.collectionStatus);
      const isDiscarded = isBookDiscardedForProfile(book, profileId);
      const alreadyInLibrary = status === 'owned' || status === 'library' || status === 'wishlist';
      return { alreadyInLibrary, isDiscarded, matchedBook: book };
    }
  }
  return { alreadyInLibrary: false, isDiscarded: false };
}

/**
 * Filters out stale obscure catalogs, academic noise, and already-owned/discarded books.
 * Preserves high-edition modern classics while blocking random 19th-century / low-edition ephemera.
 *
 * @param {import('../catalog/normalizer.js').BookCandidate} candidate
 * @param {{
 *   recencyPreference?: 'modern' | 'balanced' | 'include-classics',
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   existingBooks?: import('../../types/models.js').Book[],
 *   avoidTerms?: string[]
 * }} [options]
 * @returns {boolean}
 */
export function isDiscoveryCandidateEligible(candidate, options = {}) {
  if (!candidate || !candidate.title) return false;
  const recencyPreference = options.recencyPreference || 'modern';
  const year = candidate.publishedYear;
  const editionCount = typeof candidate.editionCount === 'number' ? candidate.editionCount : 0;

  const textBlob = `${candidate.title} ${(candidate.subjects || []).join(' ')} ${candidate.summary || ''}`;
  if (NON_CHILDREN_NOISE_REGEX.test(textBlob)) {
    return false;
  }

  if (Array.isArray(options.avoidTerms) && options.avoidTerms.length > 0) {
    const titleLower = candidate.title.toLowerCase();
    for (const term of options.avoidTerms) {
      const cleanTerm = String(term || '').trim().toLowerCase();
      if (cleanTerm.length >= 4 && titleLower.includes(cleanTerm)) {
        return false;
      }
    }
  }

  // Reject adult-length encyclopedic works for early readers unless stage matches
  const readerAge = typeof options.profile?.age === 'number' ? options.profile.age : 5;
  if (readerAge <= 8 && typeof candidate.pageCount === 'number' && candidate.pageCount > 320) {
    return false;
  }

  // Recency & obscure-public-domain guard (directly addresses "old books from price catalogs")
  if (typeof year === 'number' && year > 0) {
    if (recencyPreference === 'modern') {
      if (year < 1975 && editionCount < 12) return false;
    } else if (recencyPreference === 'balanced') {
      if (year < 1955 && editionCount < 8) return false;
    } else {
      if (year < 1920 && editionCount < 6) return false;
    }
  }

  const libMatch = matchCandidateInLibrary(
    candidate,
    options.existingBooks || [],
    options.profile?.id
  );
  if (libMatch.alreadyInLibrary || libMatch.isDiscarded) {
    return false;
  }

  return true;
}

const LANGUAGE_TO_ISO2 = /** @type {Record<string, string>} */ ({
  english: 'en',
  spanish: 'es',
  italian: 'it',
  french: 'fr',
  german: 'de',
  portuguese: 'pt',
});

const LANGUAGE_TO_OL3 = /** @type {Record<string, string>} */ ({
  english: 'eng',
  spanish: 'spa',
  italian: 'ita',
  french: 'fre',
  german: 'ger',
  portuguese: 'por',
});

/**
 * Fetches a configurable candidate pool (`candidatePoolSize`: 20–150+, default 60) across
 * expanded queries & subjects using Google Books and Open Library in parallel.
 *
 * @param {{
 *   queries: string[],
 *   subjects?: string[],
 *   catalogService: { searchBooks: (input: { query: string, author?: string }, opts?: any) => Promise<{ candidates: import('../catalog/normalizer.js').BookCandidate[], providerErrors: any[] }> },
 *   settings?: import('../../types/models.js').AppSettings | null,
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   existingBooks?: import('../../types/models.js').Book[],
 *   candidatePoolSize?: number,
 *   page?: number,
 *   recencyPreference?: 'modern' | 'balanced' | 'include-classics',
 *   language?: string,
 *   avoidTerms?: string[],
 *   signal?: AbortSignal
 * }} params
 * @returns {Promise<{
 *   candidates: import('../catalog/normalizer.js').BookCandidate[],
 *   rawFetchedCount: number,
 *   providerErrors: Array<{ providerId: string, message: string }>
 * }>}
 */
export async function fetchDiscoveryCandidatePool({
  queries,
  catalogService,
  settings = null,
  profile = null,
  existingBooks = [],
  candidatePoolSize = 60,
  page = 1,
  recencyPreference = 'modern',
  language = '',
  avoidTerms = [],
  signal,
}) {
  const poolSize = Math.max(20, Math.min(150, Math.round(candidatePoolSize || 60)));
  const cleanQueries = (queries || []).map((q) => String(q || '').trim()).filter(Boolean).slice(0, 4);
  if (cleanQueries.length === 0) {
    return { candidates: [], rawFetchedCount: 0, providerErrors: [] };
  }

  const perQueryLimit = Math.min(80, Math.max(18, Math.ceil((poolSize * 1.35) / cleanQueries.length)));
  const pageNum = Math.max(1, Math.trunc(page || 1));
  const googleStartIndex = (pageNum - 1) * Math.min(40, perQueryLimit);

  const normalizedLang = String(language || '').trim().toLowerCase();
  const langRestrict = normalizedLang && normalizedLang !== 'english' ? LANGUAGE_TO_ISO2[normalizedLang] : undefined;
  const olLanguage = normalizedLang && normalizedLang !== 'english' ? LANGUAGE_TO_OL3[normalizedLang] : undefined;
  const enabledProviderIds = settings?.enabledMetadataProviders;

  const queryResults = await Promise.allSettled(
    cleanQueries.map((q, idx) =>
      catalogService.searchBooks(
        { query: q },
        {
          limit: perQueryLimit,
          enabledProviderIds,
          startIndex: googleStartIndex,
          page: pageNum,
          orderBy: recencyPreference === 'modern' && idx === 0 ? 'newest' : 'relevance',
          sort: recencyPreference === 'modern' && idx === 0 ? 'new' : 'rating',
          ...(langRestrict ? { langRestrict } : {}),
          ...(olLanguage ? { language: olLanguage } : {}),
          signal,
        }
      )
    )
  );

  /** @type {Map<string, import('../catalog/normalizer.js').BookCandidate>} */
  const dedupedRaw = new Map();
  /** @type {Array<{ providerId: string, message: string }>} */
  const providerErrors = [];

  queryResults.forEach((res, idx) => {
    const queryUsed = cleanQueries[idx];
    if (res.status === 'fulfilled') {
      for (const cand of res.value.candidates || []) {
        const key = cand.isbn13 ? `isbn:${cand.isbn13}` : cand.candidateKey;
        if (!dedupedRaw.has(key)) {
          dedupedRaw.set(key, {
            ...cand,
            discoveryQuery: cand.discoveryQuery || queryUsed,
          });
        }
      }
      if (Array.isArray(res.value.providerErrors)) {
        providerErrors.push(...res.value.providerErrors);
      }
    } else {
      providerErrors.push({
        providerId: 'catalog',
        message: res.reason instanceof Error ? res.reason.message : 'Discovery query failed',
      });
    }
  });

  const rawCandidates = Array.from(dedupedRaw.values());
  const eligible = rawCandidates.filter((cand) =>
    isDiscoveryCandidateEligible(cand, {
      recencyPreference,
      profile,
      existingBooks,
      avoidTerms,
    })
  );

  // If strict modern filter pruned too aggressively, gracefully include balanced fallback from raw
  const finalPool =
    eligible.length >= Math.min(8, poolSize) || recencyPreference === 'include-classics'
      ? eligible
      : rawCandidates.filter((cand) =>
          isDiscoveryCandidateEligible(cand, {
            recencyPreference: 'balanced',
            profile,
            existingBooks,
            avoidTerms,
          })
        );

  return {
    candidates: finalPool.slice(0, poolSize),
    rawFetchedCount: rawCandidates.length,
    providerErrors,
  };
}

/**
 * Stage 2 Semantic Reranking:
 * Embeds candidate books on the fly (Gemini `gemini-embedding-2`, optional browser Transformers.js,
 * or deterministic TF-IDF local fallback) and ranks them by blending Positive Taste Centroid,
 * Seed Book Similarity, Negative Discard contrast, age/stage/language match, recency, and edition popularity.
 *
 * @param {{
 *   candidates: import('../catalog/normalizer.js').BookCandidate[],
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   existingBooks?: import('../../types/models.js').Book[],
 *   seedBook?: import('../../types/models.js').Book | null,
 *   engine?: import('../../types/models.js').DiscoveryEmbeddingEngine,
 *   settings?: import('../../types/models.js').AppSettings | null,
 *   recencyPreference?: 'modern' | 'balanced' | 'include-classics',
 *   language?: string,
 *   topic?: string
 * }} params
 * @returns {Promise<{
 *   ranked: Array<{
 *     candidate: import('../catalog/normalizer.js').BookCandidate,
 *     score: number,
 *     semanticScore: number,
 *     matchReasons: string[]
 *   }>,
 *   engineUsed: string
 * }>}
 */
export async function rerankDiscoveryCandidates({
  candidates,
  profile = null,
  existingBooks = [],
  seedBook = null,
  engine = 'gemini-with-fallback',
  settings = null,
  recencyPreference = 'modern',
  language = '',
  topic = '',
}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ranked: [], engineUsed: engine };
  }

  // 1. Ensure vectors for library books (loved + read + discarded) using the configured engine
  const libraryContextBooks = (existingBooks || []).filter((b) => {
    const st = normalizeCollectionStatus(b.collectionStatus);
    return st !== 'interested' || Boolean(b.discardedAt) || Boolean(b.loved);
  });

  const { vectorsByBookKey, engineUsed: libEngineUsed } = await ensureBookVectors({
    books: seedBook
      ? [seedBook, ...libraryContextBooks.filter((b) => b.id !== seedBook.id)]
      : libraryContextBooks,
    engine,
    settings,
  });

  const taste = computeTasteProfileVectors({
    books: libraryContextBooks,
    profile,
    vectorsByBookKey,
  });

  const seedVector = seedBook ? vectorsByBookKey.get(resolveVectorEntityKey(seedBook)) || null : null;

  // 2. Embed candidate books on the fly in a single batch
  const candidateTexts = candidates.map((c) => buildBookEmbeddingText(c));
  const candEmbedResult = await embedTextsWithEngine({
    texts: candidateTexts,
    engine: /** @type {import('../../types/models.js').DiscoveryEmbeddingEngine} */ (
      libEngineUsed === 'local-tfidf' && engine === 'gemini-with-fallback'
        ? 'local-tfidf'
        : engine
    ),
    settings,
    taskType: 'SEMANTIC_SIMILARITY',
  });

  const favTopics = new Set((profile?.favoriteTopics || []).map((t) => t.toLowerCase().trim()));
  if (topic) favTopics.add(topic.toLowerCase().trim());

  const targetAge = typeof profile?.age === 'number' ? profile.age : null;
  const targetStage = seedBook?.readingStage || profile?.readingStage || 'picture-book';
  const targetLang = String(language || '').trim().toLowerCase();

  const scored = candidates.map((candidate, idx) => {
    const candVec = candEmbedResult.vectors[idx] || null;
    const posCos =
      candVec && taste.positiveVector ? cosineSimilarity(candVec, taste.positiveVector) : 0;
    const negCos =
      candVec && taste.negativeVector ? cosineSimilarity(candVec, taste.negativeVector) : 0;
    const seedCos = candVec && seedVector ? cosineSimilarity(candVec, seedVector) : 0;

    // Semantic similarity in normalized range [-35..+65]
    const semanticScore = Math.round((posCos * 42 + seedCos * 30 - negCos * 36) * 10) / 10;

    let score = semanticScore;
    /** @type {string[]} */
    const reasons = [];

    if (seedBook && seedCos >= 0.25) {
      reasons.push(`Similar vibe to ${seedBook.title}`);
    } else if (posCos >= 0.22) {
      reasons.push('Matches your favorites');
    }

    // Age & reading stage alignment
    if (targetAge !== null && typeof candidate.ageMin === 'number') {
      const ageMax = typeof candidate.ageMax === 'number' ? candidate.ageMax : candidate.ageMin + 3;
      if (targetAge >= candidate.ageMin && targetAge <= ageMax) {
        score += 18;
        reasons.push(`Ages ${candidate.ageMin}–${ageMax}`);
      } else if (
        Math.min(Math.abs(targetAge - candidate.ageMin), Math.abs(targetAge - ageMax)) <= 1
      ) {
        score += 9;
      } else if (candidate.ageMin > targetAge + 4) {
        score -= 18;
      }
    }

    if (candidate.readingStage === targetStage) {
      score += 14;
    }

    // Language boost
    if (targetLang && targetLang !== 'english') {
      if (String(candidate.language || '').toLowerCase() === targetLang) {
        score += 18;
        reasons.push(`${targetLang.charAt(0).toUpperCase()}${targetLang.slice(1)}`);
      }
    } else if (candidate.language && candidate.language !== 'english') {
      // Gently downrank non-English books in default English shelves unless household reads them
      score -= 6;
    }

    // Topic overlap & local keyword enrichment check
    const candTags = new Set(
      (candidate.tags || []).length > 0
        ? candidate.tags.map((t) => t.toLowerCase())
        : inferLocalTopicTags({ title: candidate.title, summary: candidate.summary }).map((t) =>
            t.toLowerCase()
          )
    );
    let matchedTopics = 0;
    for (const tag of candTags) {
      if (favTopics.has(tag)) matchedTopics += 1;
      if (taste.dislikedTags.has(tag)) score -= 10;
    }
    if (matchedTopics > 0) {
      score += Math.min(20, matchedTopics * 8);
    }

    // Author feedback (loved vs discarded)
    const candAuthorsLower = (candidate.authors || []).map((a) => String(a).trim().toLowerCase());
    if (candAuthorsLower.some((a) => taste.dislikedAuthors.has(a))) {
      score -= 30;
    } else if (candAuthorsLower.some((a) => taste.lovedAuthors.has(a))) {
      score += 12;
      reasons.push(`By ${candidate.authors[0]}`);
    }

    // Negative contrast safeguard when candidate closely matches discarded books
    if (negCos >= 0.45 && posCos < negCos) {
      score -= 18;
    }

    // Recency & edition popularity bonuses
    const year = candidate.publishedYear;
    if (typeof year === 'number' && year > 0) {
      if (recencyPreference !== 'include-classics') {
        if (year >= 2015) score += 12;
        else if (year >= 2000) score += 8;
        else if (year >= 1985) score += 4;
      }
    }
    if (typeof candidate.editionCount === 'number' && candidate.editionCount >= 10) {
      score += 7;
    }

    // Metadata richness & cover quality
    if (candidate.coverUrl) score += 10;
    if (cleanBookDescription(candidate.summary || '').length >= 40) score += 6;
    if (typeof candidate.averageRating === 'number' && candidate.averageRating >= 4.0) score += 6;
    if (candidate.isbn13) score += 3;

    if (reasons.length === 0) {
      if (typeof year === 'number' && year >= 2005) {
        reasons.push(`Published ${year}`);
      } else if (candidate.tags?.[0]) {
        reasons.push(candidate.tags[0].replace(/-/g, ' '));
      } else {
        reasons.push('Discovery pick');
      }
    }

    return {
      candidate,
      score: Math.round(score * 10) / 10,
      semanticScore,
      matchReasons: reasons.slice(0, 2),
    };
  });

  scored.sort((a, b) => b.score - a.score || (b.candidate.coverUrl ? 1 : 0) - (a.candidate.coverUrl ? 1 : 0));

  return {
    ranked: scored,
    engineUsed: candEmbedResult.engineUsed || libEngineUsed,
  };
}

/**
 * Convenience end-to-end Two-Stage Discovery Pipeline:
 * Stage 1 (Expand + Fetch Pool) -> Stage 2 (Embed + Taste Contrast Rerank).
 *
 * @param {{
 *   intent: string,
 *   topic?: string,
 *   seedBook?: import('../../types/models.js').Book | null,
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   existingBooks?: import('../../types/models.js').Book[],
 *   catalogService: any,
 *   settings?: import('../../types/models.js').AppSettings | null,
 *   candidatePoolSize?: number,
 *   page?: number,
 *   language?: string,
 *   limit?: number,
 *   signal?: AbortSignal
 * }} params
 */
export async function runTwoStageDiscoveryPipeline({
  intent,
  topic = '',
  seedBook = null,
  profile = null,
  existingBooks = [],
  catalogService,
  settings = null,
  candidatePoolSize,
  page = 1,
  language = '',
  limit = 16,
  signal,
}) {
  const ds = settings?.discoverySettings;
  const poolSize = candidatePoolSize || ds?.candidatePoolSize || 60;
  const recencyPreference = ds?.recencyPreference || 'modern';
  const engine = ds?.embeddingEngine || 'gemini-with-fallback';

  const expansion = await expandDiscoveryQueries({
    intent,
    topic,
    seedBook,
    profile,
    books: existingBooks,
    language,
    recencyPreference,
    settings,
  });

  const fetched = await fetchDiscoveryCandidatePool({
    queries: expansion.queries,
    subjects: expansion.subjects,
    catalogService,
    settings,
    profile,
    existingBooks,
    candidatePoolSize: poolSize,
    page,
    recencyPreference,
    language,
    avoidTerms: expansion.avoidTerms,
    signal,
  });

  const reranked = await rerankDiscoveryCandidates({
    candidates: fetched.candidates,
    profile,
    existingBooks,
    seedBook,
    engine,
    settings,
    recencyPreference,
    language,
    topic,
  });

  return {
    items: reranked.ranked.slice(0, limit),
    allFetchedCandidates: fetched.candidates,
    rawFetchedCount: fetched.rawFetchedCount,
    queriesUsed: expansion.queries,
    rationale: expansion.rationale,
    usedFlash: expansion.usedFlash,
    engineUsed: reranked.engineUsed,
    providerErrors: fetched.providerErrors,
  };
}
