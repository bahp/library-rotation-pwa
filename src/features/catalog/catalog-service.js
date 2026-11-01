/**
 * @fileoverview Extensible provider registry and catalog lookup orchestrator.
 * Queries configured providers in parallel, tolerates partial provider outages,
 * deduplicates search candidates, merges complementary metadata fields, and
 * automatically enriches missing ISBN edition covers from matching sibling editions.
 */

import { normalizeIsbn } from '../../types/models.js';
import { stripDiacritics } from '../tagging/rule-tagger.js';
import { mergeBookCandidates } from './normalizer.js';
import { createHttpClient } from './providers/http-client.js';
import { createGoogleBooksProvider } from './providers/google-books-provider.js';
import { createOpenLibraryProvider } from './providers/open-library-provider.js';

/**
 * @typedef {Object} MetadataProvider
 * @property {string} id
 * @property {string} label
 * @property {(isbn13: string, options?: { retainRaw?: boolean, signal?: AbortSignal, bypassCooldown?: boolean }) => Promise<import('./normalizer.js').BookCandidate | null>} lookupByIsbn
 * @property {(input: { query: string, author?: string }, options?: { retainRaw?: boolean, signal?: AbortSignal, limit?: number }) => Promise<import('./normalizer.js').BookCandidate[]>} searchBooks
 */

/**
 * Normalizes a book title to its core alphanumeric stem (before subtitles `:` / `—`)
 * so sibling-edition cover searches only adopt covers belonging to the same book.
 * @param {string} rawTitle
 * @returns {string}
 */
function normalizeTitleStem(rawTitle) {
  const base = String(rawTitle || '').split(/[:—–(]/)[0];
  return stripDiacritics(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Verifies that a searched sibling candidate shares the same core title stem as the ISBN hit.
 * @param {string} targetTitle
 * @param {string} candidateTitle
 * @returns {boolean}
 */
function titlesMatchForCoverEnrichment(targetTitle, candidateTitle) {
  const a = normalizeTitleStem(targetTitle);
  const b = normalizeTitleStem(candidateTitle);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

/**
 * Creates the catalog metadata lookup service with pluggable providers.
 * @param {{
 *   providers?: MetadataProvider[],
 *   httpClient?: ReturnType<typeof createHttpClient>,
 *   useServerProxy?: boolean
 * }} [config]
 */
export function createCatalogService(config = {}) {
  const client = config.httpClient || createHttpClient();
  const useServerProxy =
    config.useServerProxy !== undefined
      ? config.useServerProxy
      : typeof window !== 'undefined' && !config.httpClient;
  /** @type {MetadataProvider[]} */
  const providers = config.providers
    ? [...config.providers]
    : [
        createGoogleBooksProvider(client, { useServerProxy }),
        createOpenLibraryProvider(client),
      ];

  /**
   * Registers an additional external metadata provider adapter at runtime.
   * @param {MetadataProvider} provider
   */
  function registerProvider(provider) {
    const existingIdx = providers.findIndex((p) => p.id === provider.id);
    if (existingIdx >= 0) {
      providers[existingIdx] = provider;
    } else {
      providers.push(provider);
    }
  }

  /**
   * Resolves active providers filtered by optional `enabledProviderIds`.
   * @param {string[] | undefined} enabledProviderIds
   * @returns {MetadataProvider[]}
   */
  function resolveActiveProviders(enabledProviderIds) {
    if (!Array.isArray(enabledProviderIds)) return providers;
    const allowed = new Set(enabledProviderIds);
    return providers.filter((p) => allowed.has(p.id));
  }

  /**
   * Searches sibling editions by title + primary author to find a verified cover URL when a
   * specific ISBN printing lacks cover art in both Google Books and Open Library.
   * @param {import('./normalizer.js').BookCandidate} target
   * @param {MetadataProvider[]} activeProviders
   * @param {AbortSignal} [signal]
   * @returns {Promise<string | undefined>}
   */
  async function findSiblingCoverUrl(target, activeProviders, signal) {
    const baseTitle = String(target.title || '').split(':')[0].trim();
    if (!baseTitle) return undefined;
    const primaryAuthor =
      target.authors[0] && target.authors[0] !== 'Unknown Author' ? target.authors[0] : undefined;

    const searchSettled = await Promise.allSettled(
      activeProviders.map((provider) =>
        provider.searchBooks(
          { query: baseTitle, author: primaryAuthor },
          { retainRaw: false, signal, limit: 6 }
        )
      )
    );

    for (const res of searchSettled) {
      if (res.status !== 'fulfilled' || !Array.isArray(res.value)) continue;
      for (const cand of res.value) {
        if (cand.coverUrl && titlesMatchForCoverEnrichment(target.title, cand.title)) {
          return cand.coverUrl;
        }
      }
    }
    return undefined;
  }

  /**
   * Validates ISBN-10/ISBN-13 and queries all active providers concurrently,
   * merging metadata when multiple providers match and automatically enriching
   * missing edition covers from matching title+author sibling editions.
   * @param {string} rawIsbn
   * @param {{ retainRaw?: boolean, signal?: AbortSignal, enabledProviderIds?: string[] }} [options]
   * @returns {Promise<{
   *   candidate: import('./normalizer.js').BookCandidate | null,
   *   isbn13: string,
   *   isbn10?: string,
   *   providerErrors: Array<{ providerId: string, message: string }>
   * }>}
   */
  async function lookupByIsbn(rawIsbn, options = {}) {
    const checked = normalizeIsbn(rawIsbn);
    if (!checked.valid || !checked.isbn13) {
      throw new Error(checked.error || 'Enter a valid 10-digit or 13-digit ISBN to look up.');
    }

    const activeProviders = resolveActiveProviders(options.enabledProviderIds);
    if (activeProviders.length === 0) {
      throw new Error(
        'All external metadata providers are disabled in Settings. Re-enable Google Books or Open Library, or enter book details manually.'
      );
    }

    const settled = await Promise.allSettled(
      activeProviders.map((provider) =>
        provider.lookupByIsbn(checked.isbn13, {
          retainRaw: options.retainRaw,
          signal: options.signal,
        })
      )
    );

    /** @type {import('./normalizer.js').BookCandidate[]} */
    const hits = [];
    /** @type {Array<{ providerId: string, message: string }>} */
    const providerErrors = [];

    settled.forEach((result, idx) => {
      const provider = activeProviders[idx];
      if (result.status === 'fulfilled') {
        if (result.value) hits.push(result.value);
      } else {
        providerErrors.push({
          providerId: provider.id,
          message: result.reason instanceof Error ? result.reason.message : 'Provider failed',
        });
      }
    });

    if (hits.length === 0 && providerErrors.length === activeProviders.length) {
      throw new Error(
        'Could not reach book metadata providers. Check your internet connection or add details manually below.'
      );
    }

    let merged = hits[0] || null;
    for (let i = 1; i < hits.length; i++) {
      merged = mergeBookCandidates(merged, hits[i]);
    }

    if (merged && checked.isbn10 && !merged.isbn10) {
      merged = { ...merged, isbn10: checked.isbn10 };
    }

    // If the scanned ISBN edition returned bibliographic metadata without cover art,
    // automatically search sibling editions by title + author to recover the book's cover.
    if (merged && !merged.coverUrl) {
      const siblingCover = await findSiblingCoverUrl(merged, activeProviders, options.signal);
      if (siblingCover) {
        merged = { ...merged, coverUrl: siblingCover };
      }
    }

    return {
      candidate: merged,
      isbn13: checked.isbn13,
      isbn10: checked.isbn10,
      providerErrors,
    };
  }

  /**
   * Searches across all active providers concurrently and deduplicates matching editions.
   * @param {{ query: string, author?: string }} input
   * @param {{ retainRaw?: boolean, signal?: AbortSignal, limit?: number, enabledProviderIds?: string[] }} [options]
   * @returns {Promise<{
   *   candidates: import('./normalizer.js').BookCandidate[],
   *   providerErrors: Array<{ providerId: string, message: string }>
   * }>}
   */
  async function searchBooks(input, options = {}) {
    const q = (input.query || '').trim();
    const author = (input.author || '').trim();
    if (!q && !author) {
      return { candidates: [], providerErrors: [] };
    }

    const activeProviders = resolveActiveProviders(options.enabledProviderIds);
    if (activeProviders.length === 0) {
      throw new Error(
        'All external metadata providers are disabled in Settings. Re-enable Google Books or Open Library, or add books manually.'
      );
    }

    const settled = await Promise.allSettled(
      activeProviders.map((provider) =>
        provider.searchBooks(
          { query: q, author },
          {
            retainRaw: options.retainRaw,
            signal: options.signal,
            limit: options.limit || 8,
          }
        )
      )
    );

    /** @type {Map<string, import('./normalizer.js').BookCandidate>} */
    const deduped = new Map();
    /** @type {Array<{ providerId: string, message: string }>} */
    const providerErrors = [];

    settled.forEach((result, idx) => {
      const provider = activeProviders[idx];
      if (result.status === 'fulfilled') {
        for (const candidate of result.value) {
          const existing = deduped.get(candidate.candidateKey);
          if (existing) {
            deduped.set(candidate.candidateKey, mergeBookCandidates(existing, candidate));
          } else {
            deduped.set(candidate.candidateKey, candidate);
          }
        }
      } else {
        providerErrors.push({
          providerId: provider.id,
          message: result.reason instanceof Error ? result.reason.message : 'Provider failed',
        });
      }
    });

    if (deduped.size === 0 && providerErrors.length === activeProviders.length) {
      throw new Error(
        'Book search is unavailable offline or rate-limited. You can still add books manually.'
      );
    }

    // Prioritize candidates with cover images and verified ISBNs
    const ranked = Array.from(deduped.values()).sort((a, b) => {
      const aScore = (a.coverUrl ? 2 : 0) + (a.isbn13 ? 1 : 0);
      const bScore = (b.coverUrl ? 2 : 0) + (b.isbn13 ? 1 : 0);
      return bScore - aScore;
    });

    return {
      candidates: ranked.slice(0, options.limit || 12),
      providerErrors,
    };
  }

  /**
   * Executes a live connectivity & payload probe against a specific metadata provider
   * (defaults to `'google-books'` with ISBN `9780064430173` — *Goodnight Moon*) so users can
   * verify in-app that the API is reachable and returning volume title, ID, and cover image links.
   *
   * @param {string} [providerId='google-books']
   * @param {{ probeIsbn?: string, signal?: AbortSignal }} [options]
   * @returns {Promise<{
   *   ok: boolean,
   *   providerId: string,
   *   providerLabel: string,
   *   probeIsbn: string,
   *   latencyMs: number,
   *   matchedTitle: string,
   *   hasCover: boolean,
   *   externalId: string,
   *   endpointUrl: string,
   *   checkedAt: string,
   *   keyConfigured?: boolean,
   *   error?: string
   * }>}
   */
  async function checkProviderHealth(providerId = 'google-books', options = {}) {
    const probeIsbn = options.probeIsbn || '9780064430173';
    const endpointUrl =
      providerId === 'google-books'
        ? `https://www.googleapis.com/books/v1/volumes?q=isbn%3A${probeIsbn}&maxResults=5`
        : `https://openlibrary.org/api/books?bibkeys=ISBN:${probeIsbn}&format=json&jscmd=data`;
    const checkedAt = new Date().toISOString();
    const provider = providers.find((p) => p.id === providerId);

    if (!provider) {
      return {
        ok: false,
        providerId,
        providerLabel: providerId,
        probeIsbn,
        latencyMs: 0,
        matchedTitle: '',
        hasCover: false,
        externalId: '',
        endpointUrl,
        checkedAt,
        error: `Provider "${providerId}" is not registered.`,
      };
    }

    const startMs = Date.now();
    try {
      const candidate = await provider.lookupByIsbn(probeIsbn, {
        retainRaw: false,
        signal: options.signal,
        bypassCooldown: true,
      });
      const latencyMs = Math.max(0, Date.now() - startMs);
      if (!candidate) {
        return {
          ok: false,
          providerId: provider.id,
          providerLabel: provider.label,
          probeIsbn,
          latencyMs,
          matchedTitle: '',
          hasCover: false,
          externalId: '',
          endpointUrl,
          checkedAt,
          error: `Connected to ${provider.label}, but no book record was returned for ISBN ${probeIsbn}.`,
        };
      }
      const proxyDiag =
        typeof (/** @type {any} */ (provider).getProxyDiagnostics) === 'function'
          ? /** @type {any} */ (provider).getProxyDiagnostics()
          : null;
      return {
        ok: true,
        providerId: provider.id,
        providerLabel: provider.label,
        probeIsbn,
        latencyMs,
        matchedTitle: candidate.title || '',
        hasCover: Boolean(candidate.coverUrl),
        externalId: candidate.sources?.[0]?.externalId || '',
        endpointUrl,
        checkedAt,
        keyConfigured: proxyDiag?.keyConfigured,
      };
    } catch (err) {
      const latencyMs = Math.max(0, Date.now() - startMs);
      const proxyDiag =
        typeof (/** @type {any} */ (provider).getProxyDiagnostics) === 'function'
          ? /** @type {any} */ (provider).getProxyDiagnostics()
          : null;
      return {
        ok: false,
        providerId: provider.id,
        providerLabel: provider.label,
        probeIsbn,
        latencyMs,
        matchedTitle: '',
        hasCover: false,
        externalId: '',
        endpointUrl,
        checkedAt,
        keyConfigured: proxyDiag?.keyConfigured,
        error: err instanceof Error ? err.message : String(err || 'Provider request failed'),
      };
    }
  }

  return {
    getProviders: () => [...providers],
    registerProvider,
    lookupByIsbn,
    searchBooks,
    checkProviderHealth,
  };
}
