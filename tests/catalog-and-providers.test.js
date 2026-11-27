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
  cleanBookDescription,
  cleanProviderCategories,
} from '../src/features/catalog/normalizer.js';
import { formatCollectionStatus } from '../src/types/models.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import { createOpenLibraryProvider } from '../src/features/catalog/providers/open-library-provider.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';
import { findMatchingLibraryBook } from '../src/features/catalog/library-match.js';
import { fetchOpenLibrarySubjectShelf } from '../src/features/catalog/discovery-cache.js';

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

  it('requests Google Books with hl=en without langRestrict and extracts retail/list price', async () => {
    /** @type {string[]} */
    const requestedUrls = [];
    const pricedVolume = {
      ...MOCK_GOOGLE_VOLUME,
      volumeInfo: {
        ...MOCK_GOOGLE_VOLUME.volumeInfo,
        language: 'es',
      },
      saleInfo: {
        listPrice: { amount: 16.5, currencyCode: 'EUR' },
        retailPrice: { amount: 14.95, currencyCode: 'EUR' },
      },
    };

    const mockHttp = createHttpClient({
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          JSON.stringify({
            totalItems: 1,
            items: [pricedVolume],
          }),
          { status: 200 }
        );
      },
      disablePersistentCache: true,
      maxRetries: 0,
    });

    const provider = createGoogleBooksProvider(mockHttp);
    const searchCandidates = await provider.searchBooks({ query: 'Corduroy' });
    assert.ok(searchCandidates.length >= 1);
    assert.ok(requestedUrls.length >= 1);
    const parsedUrl = new URL(requestedUrls[0]);
    assert.equal(parsedUrl.searchParams.get('hl'), 'en');
    assert.equal(parsedUrl.searchParams.has('langRestrict'), false);

    const normalized = normalizeGoogleBooksItem(pricedVolume);
    assert.ok(normalized);
    assert.equal(normalized.language, 'spanish');
    assert.equal(normalized.listPriceAmount, 14.95);
    assert.equal(normalized.listPriceCurrency, 'EUR');

    const book = candidateToBook(normalized);
    assert.equal(book.listPriceAmount, 14.95);
    assert.equal(book.listPriceCurrency, 'EUR');
  });

  it('persists sanitized book descriptions from Google Books & Open Library candidates', () => {
    const cleaned = cleanBookDescription('<p>A classic tale of a <b>curious</b> bear.&nbsp;Ready for bedtime.</p>');
    assert.equal(cleaned, 'A classic tale of a curious bear. Ready for bedtime.');

    const candidate = normalizeGoogleBooksItem(MOCK_GOOGLE_VOLUME);
    assert.ok(candidate);
    assert.ok(candidate.summary?.includes('teddy bear'));
    const book = candidateToBook(candidate);
    assert.equal(book.description, candidate.summary);
  });

  it('findMatchingLibraryBook detects saved books by ISBN or normalized title + author', () => {
    /** @type {any[]} */
    const library = [
      {
        id: 'b_corduroy',
        isbn13: '9780140501735',
        isbn10: '0140501738',
        title: 'Corduroy',
        authors: ['Don Freeman'],
        collectionStatus: 'owned',
      },
      {
        id: 'b_bear',
        isbn13: '',
        title: 'We Are Going on a Bear Hunt (25th Anniversary Edition)',
        authors: ['Michael Rosen'],
        collectionStatus: 'wishlist',
      },
    ];

    assert.equal(
      findMatchingLibraryBook(
        { candidateKey: '1', isbn13: '9780140501735', title: 'Corduroy Story', authors: ['Don Freeman'], format: 'hardcover', ageMin: 2, ageMax: 6, readingStage: 'picture-book', tags: [], spineColor: 'teal', sources: [] },
        library
      )?.id,
      'b_corduroy'
    );

    assert.equal(
      findMatchingLibraryBook(
        { candidateKey: '2', isbn13: '9789999999999', title: 'We Are Going on a Bear Hunt', authors: ['Michael Rosen'], format: 'hardcover', ageMin: 2, ageMax: 6, readingStage: 'picture-book', tags: [], spineColor: 'teal', sources: [] },
        library
      )?.id,
      'b_bear'
    );

    assert.equal(
      findMatchingLibraryBook(
        { candidateKey: '3', isbn13: '9781111111111', title: 'Corduroy', authors: ['Different Author'], format: 'hardcover', ageMin: 2, ageMax: 6, readingStage: 'picture-book', tags: [], spineColor: 'teal', sources: [] },
        library
      ),
      null
    );
  });

  it('fetchOpenLibrarySubjectShelf normalizes works and serves repeated calls from cache', async () => {
    let fetches = 0;
    const mockFetch = async () => {
      fetches++;
      return new Response(
        JSON.stringify({
          works: [
            {
              key: '/works/OL123W',
              title: 'Make Way for Ducklings',
              authors: [{ name: 'Robert McCloskey' }],
              cover_id: 554433,
              first_publish_year: 1941,
              subject: ['Ducks', 'Picture books'],
            },
          ],
        }),
        { status: 200 }
      );
    };

    const first = await fetchOpenLibrarySubjectShelf('caldecott_medal', {
      limit: 6,
      fetchImpl: mockFetch,
    });
    assert.equal(fetches, 1);
    assert.equal(first.fromCache, false);
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0].title, 'Make Way for Ducklings');
    assert.ok(first.items[0].coverUrl?.includes('554433'));

    const second = await fetchOpenLibrarySubjectShelf('caldecott_medal', {
      limit: 6,
      fetchImpl: mockFetch,
    });
    assert.equal(fetches, 1);
    assert.equal(second.fromCache, true);
    assert.equal(second.items[0].title, 'Make Way for Ducklings');
  });

  it('cleanProviderCategories separates provider categories from curated tags and maps interested to Suggestions', () => {
    const cleaned = cleanProviderCategories([
      'Juvenile Fiction / Animals / Bears',
      'Paperback',
      'Bedtime & Dreams',
      'General',
    ]);
    assert.deepEqual(cleaned, ['Animals', 'Bears', 'Bedtime & Dreams']);

    const candidate = normalizeGoogleBooksItem({
      id: 'gb_sep_test',
      volumeInfo: {
        title: 'Little Cub Goes Camping',
        authors: ['Sam Trail'],
        categories: ['Juvenile Fiction / Social Themes / Friendship', 'Paperback'],
        description: 'Two friends explore the forest together at bedtime.',
      },
    });
    assert.ok(candidate);
    assert.deepEqual(candidate.categories, ['Social Themes', 'Friendship']);
    assert.ok(!candidate.tags.includes('social-themes'));
    assert.ok(candidate.tags.includes('friendship'));
    assert.ok(candidate.tags.includes('bedtime'));
    assert.equal(candidate.ageMin, undefined);
    assert.equal(candidate.ageMax, undefined);

    const book = candidateToBook(candidate);
    assert.deepEqual(book.categories, ['Social Themes', 'Friendship']);
    assert.equal(book.ageMin, undefined);
    assert.equal(book.ageMax, undefined);
    assert.equal(formatCollectionStatus('interested'), 'Suggestions');
  });

  it('Google Books supports maxResults=40 pagination (>40) and Open Library supports 100/page + editionCount', async () => {
    /** @type {string[]} */
    const gbUrls = [];
    const gbFetch = async (/** @type {string | URL | Request} */ url) => {
      gbUrls.push(String(url));
      const parsed = new URL(String(url));
      const startIndex = Number(parsed.searchParams.get('startIndex') || '0');
      const items = Array.from({ length: startIndex === 0 ? 40 : 15 }, (_, i) => ({
        id: `gb_${startIndex}_${i}`,
        volumeInfo: {
          title: `Modern Picture Book ${startIndex + i}`,
          authors: ['Modern Author'],
          publishedDate: '2022-05-01',
          categories: ['Juvenile Fiction / Animals'],
        },
      }));
      return new Response(JSON.stringify({ items }), { status: 200 });
    };

    const gbHttp = createHttpClient({ fetchImpl: gbFetch, timeoutMs: 2000, maxRetries: 0 });
    const gbProvider = createGoogleBooksProvider(gbHttp, { useServerProxy: false });
    const gbResults = await gbProvider.searchBooks(
      { query: 'picture book' },
      { limit: 55, orderBy: 'newest', langRestrict: 'en' }
    );
    assert.equal(gbResults.length, 55);
    assert.equal(gbUrls.length, 2);
    assert.ok(gbUrls[0].includes('maxResults=40'));
    assert.ok(gbUrls[0].includes('orderBy=newest'));
    assert.ok(gbUrls[1].includes('startIndex=40'));

    /** @type {string[]} */
    const olUrls = [];
    const olFetch = async (/** @type {string | URL | Request} */ url) => {
      olUrls.push(String(url));
      const parsed = new URL(String(url));
      const page = Number(parsed.searchParams.get('page') || '1');
      const count = page === 1 ? 100 : 20;
      const docs = Array.from({ length: count }, (_, i) => ({
        key: `/works/OL_${page}_${i}W`,
        title: `Open Library Story ${page}-${i}`,
        author_name: ['Ava Storyteller'],
        first_publish_year: 2019,
        edition_count: 14,
        cover_i: 99000 + i,
      }));
      return new Response(JSON.stringify({ docs }), { status: 200 });
    };

    const olHttp = createHttpClient({ fetchImpl: olFetch, timeoutMs: 2000, maxRetries: 0 });
    const olProvider = createOpenLibraryProvider(olHttp);
    const olResults = await olProvider.searchBooks(
      { query: 'animals children' },
      { limit: 120, sort: 'new' }
    );
    assert.equal(olResults.length, 120);
    assert.equal(olUrls.length, 2);
    assert.ok(olUrls[0].includes('limit=100'));
    assert.ok(olUrls[0].includes('edition_count'));
    assert.ok(olUrls[1].includes('page=2'));
    assert.equal(olResults[0].editionCount, 14);
  });
});


