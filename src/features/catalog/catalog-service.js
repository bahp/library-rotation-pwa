/**
 * @fileoverview Extensible provider registry and catalog lookup orchestrator.
 * Queries configured providers in parallel, tolerates partial provider outages,
 * deduplicates search candidates, and merges complementary metadata fields.
 */

import { normalizeIsbn } from '../../types/models.js';
import { mergeBookCandidates } from './normalizer.js';
import { createHttpClient } from './providers/http-client.js';
import { createGoogleBooksProvider } from './providers/google-books-provider.js';
import { createOpenLibraryProvider } from './providers/open-library-provider.js';

/**
 * @typedef {Object} MetadataProvider
 * @property {string} id
 * @property {string} label
 * @property {(isbn13: string, options?: { retainRaw?: boolean, signal?: AbortSignal }) => Promise<import('./normalizer.js').BookCandidate | null>} lookupByIsbn
 * @property {(input: { query: string, author?: string }, options?: { retainRaw?: boolean, signal?: AbortSignal, limit?: number }) => Promise<import('./normalizer.js').BookCandidate[]>} searchBooks
 */

/**
 * Creates the catalog metadata lookup service with pluggable providers.
 * @param {{
 *   providers?: MetadataProvider[],
 *   httpClient?: ReturnType<typeof createHttpClient>
 * }} [config]
 */
export function createCatalogService(config = {}) {
  const client = config.httpClient || createHttpClient();
  /** @type {MetadataProvider[]} */
  const providers = config.providers
    ? [...config.providers]
    : [createGoogleBooksProvider(client), createOpenLibraryProvider(client)];

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
   * Validates ISBN-10/ISBN-13 and queries all active providers concurrently,
   * merging metadata when multiple providers match.
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

  return {
    getProviders: () => [...providers],
    registerProvider,
    lookupByIsbn,
    searchBooks,
  };
}
