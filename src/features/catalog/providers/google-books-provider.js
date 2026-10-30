/**
 * @fileoverview Google Books public Volumes API adapter implementing the MetadataProvider interface.
 */

import { normalizeGoogleBooksItem } from '../normalizer.js';

const GOOGLE_BOOKS_ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Creates a Google Books metadata provider adapter.
 * @param {ReturnType<typeof import('./http-client.js').createHttpClient>} httpClient
 */
export function createGoogleBooksProvider(httpClient) {
  /**
   * Looks up a single book by normalized ISBN-13.
   * @param {string} isbn13
   * @param {{ retainRaw?: boolean, signal?: AbortSignal }} [options]
   * @returns {Promise<import('../normalizer.js').BookCandidate | null>}
   */
  async function lookupByIsbn(isbn13, options = {}) {
    const params = new URLSearchParams({
      q: `isbn:${isbn13}`,
      maxResults: '5',
      printType: 'books',
    });
    const payload = await httpClient.getJson(`${GOOGLE_BOOKS_ENDPOINT}?${params.toString()}`, {
      signal: options.signal,
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    for (const item of items) {
      const normalized = normalizeGoogleBooksItem(item, {
        retainRaw: options.retainRaw,
        fallbackIsbn: isbn13,
      });
      if (normalized) return normalized;
    }
    return null;
  }

  /**
   * Searches candidate books by title and optional author filter.
   * @param {{ query: string, author?: string }} searchInput
   * @param {{ retainRaw?: boolean, signal?: AbortSignal, limit?: number }} [options]
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
    const params = new URLSearchParams({
      q: terms.join(' '),
      maxResults,
      printType: 'books',
    });

    const payload = await httpClient.getJson(`${GOOGLE_BOOKS_ENDPOINT}?${params.toString()}`, {
      signal: options.signal,
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
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
  };
}
