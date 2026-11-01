/**
 * @fileoverview Google Books Volumes API adapter implementing the MetadataProvider interface.
 * Supports leak-free server-side `/api/books/volumes` proxying (when `useServerProxy: true`) so
 * `GOOGLE_BOOKS_API_KEY` stays strictly on the server, with automatic fallback to keyless
 * `https://www.googleapis.com/books/v1/volumes` on static hosts (e.g. GitHub Pages).
 * Includes resilient multi-volume cover merging, ISBN-10 / full-text ISBN fallbacks for Spanish (`978-84`),
 * Italian (`978-88` / `979-12`), and international printings, plus a temporary circuit-breaker cooldown
 * when Google's unauthenticated anonymous daily quota returns HTTP 429 so Open Library fallback stays instant.
 */

import { computeIsbn10FromIsbn13, normalizeIsbn } from '../../../types/models.js';
import { explainGoogleBooksQuotaError } from '../../../server/books-proxy.js';
import { mergeBookCandidates, normalizeGoogleBooksItem } from '../normalizer.js';

const GOOGLE_BOOKS_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';
const SERVER_PROXY_ENDPOINT = '/api/books/volumes';
const QUOTA_COOLDOWN_MS = 1000 * 60 * 5; // 5 minutes cooldown on anonymous 429 quota exhaustion

/**
 * Checks whether a raw Google Books volume item explicitly matches the target ISBN-13 or ISBN-10.
 * Used when querying without the `isbn:` prefix so unrelated books are never matched.
 * @param {Record<string, any>} item
 * @param {string} isbn13
 * @param {string | undefined} isbn10
 * @returns {boolean}
 */
function itemMatchesQueriedIsbn(item, isbn13, isbn10) {
  const info = item && typeof item.volumeInfo === 'object' ? item.volumeInfo : null;
  if (!info) return false;

  if (Array.isArray(info.industryIdentifiers)) {
    for (const ident of info.industryIdentifiers) {
      if (!ident || !ident.identifier) continue;
      const checked = normalizeIsbn(String(ident.identifier));
      if (checked.valid && checked.isbn13 === isbn13) {
        return true;
      }
    }
  }

  const serialized = JSON.stringify(info).replace(/[-\s]/g, '').toUpperCase();
  if (serialized.includes(isbn13)) return true;
  if (isbn10 && serialized.includes(isbn10)) return true;
  return false;
}

/**
 * Normalizes and merges all matching Google Books items for a single ISBN so that if `items[0]`
 * lacks `imageLinks` while `items[1]` has `imageLinks`, the cover artwork is preserved.
 * @param {any[]} items
 * @param {{ isbn13: string, isbn10?: string, retainRaw?: boolean, requireIdentifierMatch?: boolean }} opts
 * @returns {import('../normalizer.js').BookCandidate | null}
 */
function mergeMatchingIsbnItems(items, opts) {
  /** @type {import('../normalizer.js').BookCandidate | null} */
  let merged = null;

  for (const item of items) {
    if (
      opts.requireIdentifierMatch &&
      !itemMatchesQueriedIsbn(item, opts.isbn13, opts.isbn10)
    ) {
      continue;
    }
    const normalized = normalizeGoogleBooksItem(item, {
      retainRaw: opts.retainRaw,
      fallbackIsbn: opts.isbn13,
    });
    if (!normalized) continue;
    merged = merged ? mergeBookCandidates(merged, normalized) : normalized;
  }

  if (merged && merged.sources.length > 1) {
    merged = {
      ...merged,
      sources: [merged.sources[0]],
    };
  }
  return merged;
}

/**
 * Checks whether an error indicates Google's per-IP / daily quota exhaustion.
 * @param {unknown} err
 * @returns {boolean}
 */
function isQuotaError(err) {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /HTTP 429|quota exceeded|queries per day|dailylimitexceeded/i.test(msg);
}

/**
 * Checks whether a `/api/books/volumes` error simply means the app is hosted statically
 * (e.g. GitHub Pages 404 or SPA HTML fallback) rather than an upstream API error.
 * @param {unknown} err
 * @returns {boolean}
 */
function isProxyRouteMissingError(err) {
  const msg = err instanceof Error ? err.message : String(err || '');
  return /HTTP 404|HTTP 405|Expected JSON payload|Failed to parse URL|Invalid URL/i.test(msg);
}

/**
 * Creates a Google Books metadata provider adapter.
 * @param {ReturnType<typeof import('./http-client.js').createHttpClient>} httpClient
 * @param {{ useServerProxy?: boolean, proxyEndpoint?: string }} [providerOptions]
 */
export function createGoogleBooksProvider(httpClient, providerOptions = {}) {
  let quotaCooldownUntilMs = 0;
  let lastQuotaErrorMessage = 'HTTP 429: Google Books anonymous daily quota temporarily exhausted';
  let serverProxyAvailable = Boolean(providerOptions.useServerProxy);
  let lastKnownKeyConfigured = /** @type {boolean | undefined} */ (undefined);
  const proxyBase = providerOptions.proxyEndpoint || SERVER_PROXY_ENDPOINT;

  /**
   * Executes a single Google Books Volumes query with optional leak-free server proxy + static fallback
   * and quota circuit-breaker protection.
   * @param {string} q
   * @param {string} maxResults
   * @param {{ signal?: AbortSignal, bypassCooldown?: boolean }} [reqOpts]
   * @returns {Promise<any[]>}
   */
  async function fetchVolumeItems(q, maxResults, reqOpts = {}) {
    if (!reqOpts.bypassCooldown && quotaCooldownUntilMs > Date.now()) {
      throw new Error(lastQuotaErrorMessage);
    }

    const params = new URLSearchParams({
      q,
      maxResults,
      printType: 'books',
    });

    try {
      /** @type {any} */
      let payload;
      if (serverProxyAvailable) {
        try {
          payload = await httpClient.getJson(`${proxyBase}?${params.toString()}`, {
            signal: reqOpts.signal,
            bypassCache: Boolean(reqOpts.bypassCooldown),
          });
          if (payload && typeof payload.keyConfigured === 'boolean') {
            lastKnownKeyConfigured = payload.keyConfigured;
          }
        } catch (proxyErr) {
          if (isProxyRouteMissingError(proxyErr)) {
            serverProxyAvailable = false;
            payload = await httpClient.getJson(`${GOOGLE_BOOKS_ENDPOINT}?${params.toString()}`, {
              signal: reqOpts.signal,
              bypassCache: Boolean(reqOpts.bypassCooldown),
            });
          } else {
            throw proxyErr;
          }
        }
      } else {
        payload = await httpClient.getJson(`${GOOGLE_BOOKS_ENDPOINT}?${params.toString()}`, {
          signal: reqOpts.signal,
          bypassCache: Boolean(reqOpts.bypassCooldown),
        });
      }

      quotaCooldownUntilMs = 0;
      return Array.isArray(payload?.items) ? payload.items : [];
    } catch (err) {
      if (isQuotaError(err)) {
        const rawMsg = err instanceof Error ? err.message : 'HTTP 429: Google Books quota exceeded';
        const explained = rawMsg.includes('Why this happens:')
          ? rawMsg
          : explainGoogleBooksQuotaError(rawMsg, {
              keyConfigured: Boolean(lastKnownKeyConfigured),
            });
        quotaCooldownUntilMs = Date.now() + QUOTA_COOLDOWN_MS;
        lastQuotaErrorMessage = explained;
        throw new Error(explained);
      }
      throw err;
    }
  }

  /**
   * Looks up a single book by normalized ISBN-13, with automatic fallback to derived ISBN-10
   * and verified unprefixed ISBN search for Spanish, Italian, and international editions.
   * Secondary fallback steps never discard an already-found primary candidate on rate limits.
   * @param {string} isbn13
   * @param {{ retainRaw?: boolean, signal?: AbortSignal, bypassCooldown?: boolean }} [options]
   * @returns {Promise<import('../normalizer.js').BookCandidate | null>}
   */
  async function lookupByIsbn(isbn13, options = {}) {
    const isbn10 = computeIsbn10FromIsbn13(isbn13);
    const reqOpts = {
      signal: options.signal,
      bypassCooldown: options.bypassCooldown,
    };

    // 1. Primary lookup: `q=isbn:<isbn13>` merging all returned duplicate records for cover preservation
    const primaryItems = await fetchVolumeItems(`isbn:${isbn13}`, '5', reqOpts);
    let candidate = mergeMatchingIsbnItems(primaryItems, {
      isbn13,
      isbn10,
      retainRaw: options.retainRaw,
      requireIdentifierMatch: false,
    });

    if (candidate && candidate.coverUrl) {
      return candidate;
    }

    // 2. Fallback for Spanish (`84...`), Italian (`88...`), and older European printings indexed only by ISBN-10
    if (isbn10) {
      try {
        const isbn10Items = await fetchVolumeItems(`isbn:${isbn10}`, '5', reqOpts);
        const isbn10Candidate = mergeMatchingIsbnItems(isbn10Items, {
          isbn13,
          isbn10,
          retainRaw: options.retainRaw,
          requireIdentifierMatch: false,
        });
        if (isbn10Candidate) {
          candidate = candidate ? mergeBookCandidates(candidate, isbn10Candidate) : isbn10Candidate;
          if (candidate.sources.length > 1) {
            candidate = { ...candidate, sources: [candidate.sources[0]] };
          }
          if (candidate.coverUrl) return candidate;
        }
      } catch (err) {
        if (candidate) return candidate;
        throw err;
      }
    }

    // 3. Fallback for non-English books omitted from Google's `isbn:` index: verified full-text ISBN query
    if (!candidate) {
      const rawIsbnItems = await fetchVolumeItems(isbn13, '5', reqOpts);
      candidate = mergeMatchingIsbnItems(rawIsbnItems, {
        isbn13,
        isbn10,
        retainRaw: options.retainRaw,
        requireIdentifierMatch: true,
      });
    }

    return candidate;
  }

  /**
   * Searches candidate books by title and optional author filter across all languages.
   * @param {{ query: string, author?: string }} searchInput
   * @param {{ retainRaw?: boolean, signal?: AbortSignal, limit?: number, bypassCooldown?: boolean }} [options]
   * @returns {Promise<import('../normalizer.js').BookCandidate[]>}
   */
  async function searchBooks(searchInput, options = {}) {
    const terms = [];
    if (searchInput.query.trim()) {
      terms.push(searchInput.query.trim());
    }
    if (searchInput.author && searchInput.author.trim()) {
      terms.push(`inauthor:${searchInput.author.trim()}`);
    }
    if (terms.length === 0) return [];

    const maxResults = String(Math.min(20, Math.max(1, options.limit || 8)));
    const items = await fetchVolumeItems(terms.join(' '), maxResults, {
      signal: options.signal,
      bypassCooldown: options.bypassCooldown,
    });
    /** @type {import('../normalizer.js').BookCandidate[]} */
    const results = [];
    for (const item of items) {
      const candidate = normalizeGoogleBooksItem(item, { retainRaw: options.retainRaw });
      if (candidate) results.push(candidate);
    }
    return results;
  }

  return {
    id: 'google-books',
    label: 'Google Books',
    lookupByIsbn,
    searchBooks,
    getProxyDiagnostics: () => ({
      serverProxyActive: serverProxyAvailable,
      keyConfigured: lastKnownKeyConfigured,
    }),
  };
}
