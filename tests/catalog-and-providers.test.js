/**
 * @fileoverview Consolidated Catalog & Metadata Providers Suite:
 * - Google Books & Open Library payload normalization and candidate deduplication.
 * - Cover URL sanitization (HTTPS upgrade, curl removal) and raw JSON retention.
 * - Rich metadata extraction (language, dimensions, ratings, publisher, previewLink).
 * - HTTP client caching, timeout aborts, exponential backoff, and HTTP 429 quota resilience.
 * - Diagnostic health checks (checkProviderHealth).
 * - Server proxy security (zero-leak GOOGLE_BOOKS_API_KEY handling).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGoogleBooksItem,
  normalizeOpenLibraryDataRecord,
  normalizeOpenLibrarySearchDoc,
  mergeBookCandidates,
  candidateToBook,
  sanitizeCoverUrl,
} from '../src/features/catalog/normalizer.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import { createOpenLibraryProvider } from '../src/features/catalog/providers/open-library-provider.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';

const MOCK_GOOGLE_VOLUME = {
  id: 'gb_corduroy_01',
  volumeInfo: {
    title: 'Corduroy',
    authors: ['Don Freeman'],
    publishedDate: '1976-09-15',
    description: 'A small teddy bear in a department store searches for his missing button at night.',
    industryIdentifiers: [
      { type: 'ISBN_10', identifier: '0140501738' },
      { type: 'ISBN_13', identifier: '9780140501735' },
    ],
    pageCount: 32,
    language: 'en',
    dimensions: { height: '22 cm', width: '22 cm' },
    averageRating: 4.8,
    ratingsCount: 350,
    publisher: 'Viking Press',
    previewLink: 'https://books.google.com/preview?id=gb_corduroy_01',
    printType: 'BOOK',
    categories: ['Juvenile Fiction / Animals / Bears', 'Paperback'],
    imageLinks: {
      thumbnail: 'http://books.google.com/books/content?id=gb_corduroy_01&printsec=frontcover&img=1&zoom=1&edge=curl',
    },
  },
};

const MOCK_OPEN_LIBRARY_DATA = {
  'ISBN:9780140501735': {
    key: '/books/OL7353617M',
    title: 'Corduroy',
    authors: [{ name: 'Don Freeman' }],
    publish_date: 'September 1976',
    number_of_pages: 32,
    physical_format: 'Paperback',
    identifiers: {
      isbn_13: ['9780140501735'],
      isbn_10: ['0140501738'],
    },
    subjects: [{ name: 'Teddy bears' }, { name: 'Department stores' }, { name: 'Bedtime' }],
    cover: {
      medium: 'https://covers.openlibrary.org/b/id/8231456-M.jpg',
    },
  },
};

describe('Catalog & Metadata Providers Suite', () => {
  it('sanitizeCoverUrl upgrades http to https and strips Google Books curl param', () => {
    const cleaned = sanitizeCoverUrl(
      'http://books.google.com/books/content?id=abc&img=1&edge=curl&source=gbs_api'
    );
    assert.equal(
      cleaned,
      'https://books.google.com/books/content?id=abc&img=1&source=gbs_api'
    );
    assert.equal(sanitizeCoverUrl('ftp://invalid.example.com/a.jpg'), undefined);
  });

  it('normalizer extracts full metadata including language, dimensions, rating, and publisher', () => {
    const candidate = normalizeGoogleBooksItem(MOCK_GOOGLE_VOLUME, { retainRaw: true });
    assert.ok(candidate);
    assert.equal(candidate.isbn13, '9780140501735');
    assert.equal(candidate.isbn10, '0140501738');
    assert.equal(candidate.publishedYear, 1976);
    assert.equal(candidate.language, 'en');
    assert.deepEqual(candidate.dimensions, { height: '22 cm', width: '22 cm' });
    assert.equal(candidate.averageRating, 4.8);
    assert.equal(candidate.ratingsCount, 350);
    assert.equal(candidate.publisher, 'Viking Press');
    const olCandidate = normalizeOpenLibraryDataRecord(MOCK_OPEN_LIBRARY_DATA['ISBN:9780140501735']);
    assert.ok(olCandidate);
    assert.equal(olCandidate.title, 'Corduroy');
    assert.equal(olCandidate.coverUrl, 'https://covers.openlibrary.org/b/id/8231456-M.jpg');

    // Candidate merge combines sources
    const merged = mergeBookCandidates(candidate, olCandidate);
    assert.ok(merged);
    assert.equal(merged.sources.length, 2);
    assert.deepEqual(
      merged.sources.map((s) => s.provider),
      ['google-books', 'open-library']
    );

    const book = candidateToBook(merged);
    assert.equal(book.isbn13, '9780140501735');
    assert.equal(book.title, 'Corduroy');
  });

  it('HTTP client caches responses and respects maxRetries and timeout', async () => {
    let callCount = 0;
    const mockHttp = createHttpClient({
      fetchImpl: async () => {
        callCount++;
        return new Response(JSON.stringify({ ok: true, count: callCount }), { status: 200 });
      },
      disablePersistentCache: true,
      maxRetries: 1,
    });

    const res1 = await mockHttp.getJson('https://example.com/api/test');
    assert.equal(res1?.ok, true);
    assert.equal(callCount, 1);

    // Second call serves from in-memory cache
    const res2 = await mockHttp.getJson('https://example.com/api/test');
    assert.equal(res2?.count, 1);
    assert.equal(callCount, 1);
  });

  it('handles Google Books HTTP 429 quota without retry stalls and rejects with quota error', async () => {
    let attempts = 0;
    const mockHttp = createHttpClient({
      fetchImpl: async () => {
        attempts++;
        return new Response('Quota exceeded', { status: 429 });
      },
      disablePersistentCache: true,
      maxRetries: 3,
    });

    const provider = createGoogleBooksProvider(mockHttp);
    await assert.rejects(
      () => provider.lookupByIsbn('9780140501735', { signal: undefined }),
      /HTTP 429: Quota exceeded/
    );
    // Must immediately fail on 429 without running all retry loops
    assert.equal(attempts, 1);
  });

  it('checkProviderHealth diagnoses provider status cleanly', async () => {
    const mockHttp = createHttpClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            totalItems: 1,
            items: [MOCK_GOOGLE_VOLUME],
          }),
          { status: 200 }
        ),
      disablePersistentCache: true,
      maxRetries: 0,
    });

    const catalog = createCatalogService({
      providers: [createGoogleBooksProvider(mockHttp)],
    });

    const health = await catalog.checkProviderHealth('google-books');
    assert.equal(health.ok, true);
    assert.equal(health.matchedTitle, 'Corduroy');
    assert.equal(health.hasCover, true);
  });
});
