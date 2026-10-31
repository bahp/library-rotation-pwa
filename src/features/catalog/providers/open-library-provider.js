/**
 * @fileoverview Open Library API adapter implementing the MetadataProvider interface.
 * Combines `api/books?jscmd=data` with a `search.json?isbn=...` fallback so Spanish, Italian,
 * and translated editions indexed in Open Library's Solr search index (or inheriting a parent
 * Work's `cover_i` jacket image) are found reliably.
 */

import { computeIsbn10FromIsbn13 } from '../../../types/models.js';
import {
  mergeBookCandidates,
  normalizeOpenLibraryDataRecord,
  normalizeOpenLibrarySearchDoc,
} from '../normalizer.js';

const OPEN_LIBRARY_BOOKS_ENDPOINT = 'https://openlibrary.org/api/books';
const OPEN_LIBRARY_SEARCH_ENDPOINT = 'https://openlibrary.org/search.json';
const SEARCH_FIELDS =
  'key,title,author_name,first_publish_year,isbn,number_of_pages_median,subject,cover_i,format,language';

/**
 * Creates an Open Library metadata provider adapter.
 * @param {ReturnType<typeof import('./http-client.js').createHttpClient>} httpClient
 */
export function createOpenLibraryProvider(httpClient) {
  /**
   * Looks up a single book by normalized ISBN-13 using Open Library Books API (`jscmd=data`),
   * and falls back to `search.json?isbn=...` when the edition is missing from `api/books` or
   * lacks an edition-specific cover (inheriting the parent Work's `cover_i` when available).
   * @param {string} isbn13
   * @param {{ retainRaw?: boolean, signal?: AbortSignal }} [options]
   * @returns {Promise<import('../normalizer.js').BookCandidate | null>}
   */
  async function lookupByIsbn(isbn13, options = {}) {
    const isbn10 = computeIsbn10FromIsbn13(isbn13);
    const bibkey13 = `ISBN:${isbn13}`;
    const bibkey10 = isbn10 ? `ISBN:${isbn10}` : '';
    const bibkeys = bibkey10 ? `${bibkey13},${bibkey10}` : bibkey13;

    const params = new URLSearchParams({
      bibkeys,
      format: 'json',
      jscmd: 'data',
    });

    const payload = await httpClient.getJson(
      `${OPEN_LIBRARY_BOOKS_ENDPOINT}?${params.toString()}`,
      { signal: options.signal }
    );

    /** @type {import('../normalizer.js').BookCandidate | null} */
    let dataCandidate = null;
    if (payload && typeof payload === 'object') {
      const record =
        payload[bibkey13] ||
        (bibkey10 ? payload[bibkey10] : undefined) ||
        Object.values(payload)[0];
      if (record) {
        dataCandidate = normalizeOpenLibraryDataRecord(record, {
          retainRaw: options.retainRaw,
          queriedIsbn: isbn13,
        });
      }
    }

    if (dataCandidate && dataCandidate.coverUrl) {
      return dataCandidate;
    }

    // Secondary Solr lookup: rescues Spanish/Italian editions missing from `api/books`
    // and attaches parent Work `cover_i` covers when edition-specific covers weren't uploaded.
    try {
      const searchParams = new URLSearchParams({
        isbn: isbn13,
        limit: '3',
        fields: SEARCH_FIELDS,
      });
      const searchPayload = await httpClient.getJson(
        `${OPEN_LIBRARY_SEARCH_ENDPOINT}?${searchParams.toString()}`,
        { signal: options.signal }
      );
      const docs = Array.isArray(searchPayload?.docs) ? searchPayload.docs : [];
      for (const doc of docs) {
        const searchCandidate = normalizeOpenLibrarySearchDoc(doc, {
          retainRaw: options.retainRaw,
          queriedIsbn: isbn13,
        });
        if (!searchCandidate) continue;
        if (dataCandidate) {
          const merged = mergeBookCandidates(dataCandidate, searchCandidate);
          return {
            ...merged,
            sources: [merged.sources[0]],
          };
        }
        return searchCandidate;
      }
    } catch (_) {
      // Non-fatal: return whatever `api/books` produced if Solr search fallback is unreachable
    }

    return dataCandidate;
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
      fields: SEARCH_FIELDS,
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
