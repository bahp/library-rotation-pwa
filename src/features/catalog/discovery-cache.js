/**
 * @fileoverview Free, zero-API-quota IndexedDB-cached discovery feed client using Open Library
 * public Subject JSON feeds (`openlibrary.org/subjects/<slug>.json`) with 7-day TTL and
 * graceful localStorage / memory fallback.
 */

import {
  cleanBookDescription,
  cleanProviderCategories,
  inferAgeAndStage,
  inferBookFormat,
  pickDeterministicSpineColor,
} from './normalizer.js';
import { sanitizeTagList } from '../tagging/rule-tagger.js';

const DISCOVERY_DB_NAME = 'bunko_discovery_cache_v1';
const DISCOVERY_STORE_NAME = 'subject_feeds';
const DISCOVERY_LS_PREFIX = 'bunko_subj_cache_v1_';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** @type {Map<string, { fetchedAt: number, items: import('./normalizer.js').BookCandidate[] }>} */
const memorySubjectCache = new Map();

/**
 * Curated free Open Library subject shelves for kids' discovery.
 * Zero Google Books quota used; cached in IndexedDB for 7 days.
 */
export const CURATED_SUBJECT_FEEDS = [
  {
    id: 'award-winners',
    slug: 'caldecott_medal',
    title: 'Award-Winning Picture Books',
    subtitle: 'Caldecott honorees & celebrated illustrators',
    ranked: true,
    limit: 10,
  },
  {
    id: 'timeless-classics',
    slug: 'juvenile_literature',
    title: 'Timeless Children’s Classics',
    subtitle: 'Beloved read-alouds across generations',
    ranked: false,
    limit: 10,
  },
  {
    id: 'popular-picture-books',
    slug: 'picture_books',
    title: 'Popular Picture Books',
    subtitle: 'Most cataloged illustrated stories',
    ranked: true,
    limit: 10,
  },
];

/**
 * @returns {Promise<IDBDatabase | null>}
 */
function openDiscoveryDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DISCOVERY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DISCOVERY_STORE_NAME)) {
          db.createObjectStore(DISCOVERY_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * @param {string} key
 * @returns {Promise<{ fetchedAt: number, items: import('./normalizer.js').BookCandidate[] } | null>}
 */
async function readCachedFeed(key) {
  const mem = memorySubjectCache.get(key);
  if (mem) return mem;

  const db = await openDiscoveryDb();
  if (db) {
    try {
      const record = await new Promise((resolve) => {
        const tx = db.transaction(DISCOVERY_STORE_NAME, 'readonly');
        const req = tx.objectStore(DISCOVERY_STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      db.close();
      if (record && Array.isArray(record.items)) {
        memorySubjectCache.set(key, record);
        return record;
      }
    } catch (_) {
      try {
        db.close();
      } catch (_) {}
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`${DISCOVERY_LS_PREFIX}${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          memorySubjectCache.set(key, parsed);
          return parsed;
        }
      }
    }
  } catch (_) {}

  return null;
}

/**
 * @param {string} key
 * @param {{ fetchedAt: number, items: import('./normalizer.js').BookCandidate[] }} entry
 */
async function writeCachedFeed(key, entry) {
  memorySubjectCache.set(key, entry);

  const db = await openDiscoveryDb();
  if (db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction(DISCOVERY_STORE_NAME, 'readwrite');
        tx.objectStore(DISCOVERY_STORE_NAME).put(entry, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
      db.close();
      return;
    } catch (_) {
      try {
        db.close();
      } catch (_) {}
    }
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${DISCOVERY_LS_PREFIX}${key}`, JSON.stringify(entry));
    }
  } catch (_) {}
}

/**
 * Converts an Open Library `/subjects/<slug>.json` work entry into a BookCandidate.
 * @param {Record<string, any>} work
 * @param {string} subjectSlug
 * @returns {import('./normalizer.js').BookCandidate | null}
 */
export function normalizeOpenLibrarySubjectWork(work, subjectSlug) {
  if (!work || typeof work !== 'object' || !work.title) return null;
  const title = String(work.title).trim();
  const authors =
    Array.isArray(work.authors) && work.authors.length > 0
      ? work.authors
          .map((/** @type {any} */ a) => String(a?.name || '').trim())
          .filter(Boolean)
      : ['Unknown Author'];

  const subjects = Array.isArray(work.subject)
    ? work.subject.slice(0, 14).map((/** @type {unknown} */ s) => String(s))
    : [];

  const format = inferBookFormat([...subjects, title], undefined);
  const { ageMin, ageMax, readingStage } = inferAgeAndStage({
    hints: [title, ...subjects],
    format,
    autoInferAgeRange: false,
  });
  const categories = cleanProviderCategories(subjects);

  const coverId = typeof work.cover_id === 'number' && work.cover_id > 0 ? work.cover_id : 0;
  const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined;
  const publishedYear =
    typeof work.first_publish_year === 'number' && work.first_publish_year > 1500
      ? Math.trunc(work.first_publish_year)
      : undefined;

  const extraTag =
    subjectSlug === 'caldecott_medal'
      ? 'award-winner'
      : subjectSlug === 'picture_books'
        ? 'picture-book'
        : 'classic';
  const tags = sanitizeTagList([extraTag], 8);
  const summary = cleanBookDescription(work.first_sentence);
  const extKey = typeof work.key === 'string' ? work.key.replace(/^\/works\//, '') : undefined;

  return {
    candidateKey: `ol-subj:${work.key || title.toLowerCase()}`,
    isbn13: '',
    title,
    authors,
    ...(publishedYear ? { publishedYear } : {}),
    format,
    ...(typeof ageMin === 'number' ? { ageMin } : {}),
    ...(typeof ageMax === 'number' ? { ageMax } : {}),
    readingStage,
    ...(categories.length > 0 ? { categories } : {}),
    tags,
    ...(coverUrl ? { coverUrl } : {}),
    ...(summary ? { summary } : {}),
    ...(subjects.length > 0 ? { subjects: subjects.slice(0, 10) } : {}),
    spineColor: pickDeterministicSpineColor(title),
    sources: [
      {
        provider: 'open-library',
        ...(extKey ? { externalId: extKey } : {}),
        fetchedAt: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Fetches an Open Library subject feed with persistent IndexedDB TTL caching.
 * Returns stale cached items immediately on network error; never throws.
 *
 * @param {string} subjectSlug
 * @param {{ limit?: number, ttlMs?: number, fetchImpl?: typeof fetch, forceRefresh?: boolean }} [options]
 * @returns {Promise<{ items: import('./normalizer.js').BookCandidate[], fromCache: boolean }>}
 */
export async function fetchOpenLibrarySubjectShelf(subjectSlug, options = {}) {
  const cleanSlug = String(subjectSlug || '').trim().toLowerCase();
  if (!cleanSlug) return { items: [], fromCache: false };

  const limit = Math.min(20, Math.max(4, options.limit || 10));
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const cacheKey = `${cleanSlug}:${limit}`;

  const cached = await readCachedFeed(cacheKey);
  const now = Date.now();
  if (!options.forceRefresh && cached && now - cached.fetchedAt < ttlMs && cached.items.length > 0) {
    return { items: cached.items, fromCache: true };
  }

  const fetchFn = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchFn) {
    return { items: cached?.items || [], fromCache: Boolean(cached) };
  }

  try {
    const url = `https://openlibrary.org/subjects/${encodeURIComponent(cleanSlug)}.json?limit=${limit + 4}`;
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return { items: cached?.items || [], fromCache: Boolean(cached) };
    }
    const json = await res.json();
    const works = Array.isArray(json?.works) ? json.works : [];
    /** @type {import('./normalizer.js').BookCandidate[]} */
    const items = [];
    for (const work of works) {
      const normalized = normalizeOpenLibrarySubjectWork(work, cleanSlug);
      if (normalized && normalized.coverUrl) {
        items.push(normalized);
      }
      if (items.length >= limit) break;
    }
    if (items.length > 0) {
      await writeCachedFeed(cacheKey, { fetchedAt: now, items });
    }
    return { items: items.length > 0 ? items : cached?.items || [], fromCache: false };
  } catch (_) {
    return { items: cached?.items || [], fromCache: Boolean(cached) };
  }
}
