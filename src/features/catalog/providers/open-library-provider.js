/**
 * @fileoverview Open Library API adapter implementing the MetadataProvider interface.
 */

import {
  normalizeOpenLibraryDataRecord,
  normalizeOpenLibrarySearchDoc,
} from '../normalizer.js';

const OPEN_LIBRARY_BOOKS_ENDPOINT = 'https://openlibrary.org/api/books';
const OPEN_LIBRARY_SEARCH_ENDPOINT = 'https://openlibrary.org/search.json';

/**
 * Creates an Open Library metadata provider adapter.
 * @param {ReturnType<typeof import('./http-client.js').createHttpClient>} httpClient
 */
export function createOpenLibraryProvider(httpClient) {
  /**
   * Looks up a single book by normalized ISBN-13 using Open Library Books API (`jscmd=data`).
   * @param {string} isbn13
   * @param {{ retainRaw?: boolean, signal?: AbortSignal }} [options]
   * @returns {Promise<import('../normalizer.js').BookCandidate | null>}
   */
  async function lookupByIsbn(isbn13, options = {}) {
    const bibkey = `ISBN:${isbn13}`;
    const params = new URLSearchParams({
      bibkeys: bibkey,
      format: 'json',
      jscmd: 'data',
    });
    const payload = await httpClient.getJson(
      `${OPEN_LIBRARY_BOOKS_ENDPOINT}?${params.toString()}`,
      { signal: options.signal }
    );
    if (!payload || typeof payload !== 'object') return null;
    const record = payload[bibkey] || Object.values(payload)[0];
    if (!record) return null;
    return normalizeOpenLibraryDataRecord(record, {
      retainRaw: options.retainRaw,
      queriedIsbn: isbn13,
    });
  }

  /**
   * Searches candidate books by title/keywords and optional author filter.
   * @param {{ query: string, author?: string }} searchInput
   * @param {{ retainRaw?: boolean, signal?: AbortSignal, limit?: number }} [options]
   * @returns {Promise<import('../normalizer.js').BookCandidate[]>}
   */
  async function searchBooks(searchInput, options = {}) {
    const q = searchInput.query.trim();
    const author = (searchInput.author || '').trim();
    if (!q && !author) return [];

    const params = new URLSearchParams({
      limit: String(Math.min(20, Math.max(1, options.limit || 8))),
      fields:
        'key,title,author_name,first_publish_year,isbn,number_of_pages_median,subject,cover_i,format',
    });
    if (q && author) {
      params.set('title', q);
      params.set('author', author);
    } else if (author) {
      params.set('author', author);
    } else {
      params.set('q', q);
    }

    const payload = await httpClient.getJson(
      `${OPEN_LIBRARY_SEARCH_ENDPOINT}?${params.toString()}`,
      { signal: options.signal }
    );
    const docs = Array.isArray(payload?.docs) ? payload.docs : [];
    /** @type {import('../normalizer.js').BookCandidate[]} */
    const results = [];
    for (const doc of docs) {
      const candidate = normalizeOpenLibrarySearchDoc(doc, { retainRaw: options.retainRaw });
      if (candidate) results.push(candidate);
    }
    return results;
  }

  return {
    id: 'open-library',
    label: 'Open Library',
    lookupByIsbn,
    searchBooks,
  };
}
