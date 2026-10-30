import test from 'node:test';
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

const MOCK_OPEN_LIBRARY_SEARCH = {
  numFound: 2,
  docs: [
    {
      key: '/works/OL45804W',
      title: 'Corduroy',
      author_name: ['Don Freeman'],
      first_publish_year: 1968,
      isbn: ['9780140501735', '0140501738'],
      number_of_pages_median: 32,
      subject: ['Bears', 'Animals', 'Friendship'],
      cover_i: 8231456,
      format: ['Paperback'],
    },
    {
      key: '/works/OL99999W',
      title: 'A Pocket for Corduroy',
      author_name: ['Don Freeman'],
      first_publish_year: 1978,
      isbn: ['9780140503524'],
      number_of_pages_median: 32,
      subject: ['Bears', 'Family'],
      cover_i: 8231999,
      format: ['Hardcover'],
    },
  ],
};

test('sanitizeCoverUrl upgrades http to https and strips Google Books curl param', () => {
  const cleaned = sanitizeCoverUrl(
    'http://books.google.com/books/content?id=abc&img=1&edge=curl&source=gbs_api'
  );
  assert.equal(
    cleaned,
    'https://books.google.com/books/content?id=abc&img=1&source=gbs_api'
  );
  assert.equal(sanitizeCoverUrl('ftp://invalid.example.com/a.jpg'), undefined);
});

test('normalizer maps Google Books and Open Library items and respects retainRaw flag', () => {
  const gbClean = normalizeGoogleBooksItem(MOCK_GOOGLE_VOLUME, { retainRaw: false });
  assert.ok(gbClean);
  assert.equal(gbClean.isbn13, '9780140501735');
  assert.equal(gbClean.isbn10, '0140501738');
  assert.equal(gbClean.publishedYear, 1976);
  assert.equal(gbClean.format, 'paperback');
  assert.equal(gbClean.readingStage, 'picture-book');
  assert.ok(gbClean.tags.includes('animals'));
  assert.ok(gbClean.tags.includes('bedtime'));
  assert.ok(gbClean.coverUrl?.startsWith('https://books.google.com/'));
  assert.equal(gbClean.sources[0].rawPayload, undefined);

  const olWithRaw = normalizeOpenLibraryDataRecord(MOCK_OPEN_LIBRARY_DATA['ISBN:9780140501735'], {
    retainRaw: true,
  });
  assert.ok(olWithRaw);
  assert.equal(olWithRaw.isbn13, '9780140501735');
  assert.ok(olWithRaw.sources[0].rawPayload);

  const merged = mergeBookCandidates(gbClean, olWithRaw);
  assert.equal(merged.sources.length, 2);
  assert.deepEqual(
    merged.sources.map((s) => s.provider),
    ['google-books', 'open-library']
  );

  // Materialize to Book with retainRaw: false strips rawPayload cleanly
  const savedBook = candidateToBook(merged, { retainRaw: false });
  assert.ok(savedBook.id.startsWith('book_'));
  assert.equal(savedBook.sources.every((s) => s.rawPayload === undefined), true);
});

test('normalizeOpenLibrarySearchDoc parses search docs and cover_i URLs', () => {
  const docCandidate = normalizeOpenLibrarySearchDoc(MOCK_OPEN_LIBRARY_SEARCH.docs[0]);
  assert.ok(docCandidate);
  assert.equal(docCandidate.title, 'Corduroy');
  assert.equal(docCandidate.publishedYear, 1968);
  assert.equal(docCandidate.coverUrl, 'https://covers.openlibrary.org/b/id/8231456-M.jpg');
});

test('httpClient caches GET JSON responses and retries transient HTTP 429 responses', async () => {
  let callCount = 0;
  /** @type {typeof fetch} */
  const mockFetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response('Rate limited', {
        status: 429,
        headers: { 'Retry-After': '0.01' },
      });
    }
    return new Response(JSON.stringify({ ok: true, seq: callCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createHttpClient({
    fetchImpl: mockFetch,
    baseDelayMs: 10,
    maxRetries: 2,
    disablePersistentCache: true,
  });

  const first = await client.getJson('https://api.example.test/books');
  assert.deepEqual(first, { ok: true, seq: 2 });
  assert.equal(callCount, 2);

  // Second request should hit in-memory TTL cache without invoking mockFetch
  const second = await client.getJson('https://api.example.test/books');
  assert.deepEqual(second, { ok: true, seq: 2 });
  assert.equal(callCount, 2);
});

test('catalogService merges dual-provider ISBN lookups, deduplicates search, and survives partial outages', async () => {
  let failOpenLibrary = false;

  /** @type {typeof fetch} */
  const mockFetch = async (input) => {
    const url = String(input);
    if (url.includes('googleapis.com/books/v1/volumes')) {
      return new Response(JSON.stringify({ items: [MOCK_GOOGLE_VOLUME] }), { status: 200 });
    }
    if (url.includes('openlibrary.org/api/books')) {
      if (failOpenLibrary) {
        return new Response('Upstream error', { status: 503 });
      }
      return new Response(JSON.stringify(MOCK_OPEN_LIBRARY_DATA), { status: 200 });
    }
    if (url.includes('openlibrary.org/search.json')) {
      return new Response(JSON.stringify(MOCK_OPEN_LIBRARY_SEARCH), { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  };

  const client = createHttpClient({
    fetchImpl: mockFetch,
    maxRetries: 0,
    disablePersistentCache: true,
  });

  const service = createCatalogService({
    providers: [createGoogleBooksProvider(client), createOpenLibraryProvider(client)],
  });

  // 1. Lookup using hyphenated ISBN-10 -> normalized to ISBN-13 & merged across both providers
  const lookupRes = await service.lookupByIsbn('0-14-050173-8', { retainRaw: true });
  assert.equal(lookupRes.isbn13, '9780140501735');
  assert.equal(lookupRes.providerErrors.length, 0);
  assert.ok(lookupRes.candidate);
  assert.equal(lookupRes.candidate.sources.length, 2);

  // 2. Search deduplicates matching ISBN 9780140501735 across Google Books + Open Library
  const searchRes = await service.searchBooks({ query: 'Corduroy', author: 'Freeman' });
  assert.equal(searchRes.candidates.length, 2); // 'Corduroy' (merged) + 'A Pocket for Corduroy'
  const mergedCorduroy = searchRes.candidates.find((c) => c.isbn13 === '9780140501735');
  assert.ok(mergedCorduroy);
  assert.equal(mergedCorduroy.sources.length, 2);

  // 3. Partial outage resilience when Open Library fails
  client.clearCache();
  failOpenLibrary = true;
  const degradedRes = await service.lookupByIsbn('9780140501735');
  assert.ok(degradedRes.candidate);
  assert.equal(degradedRes.candidate.title, 'Corduroy');
  assert.equal(degradedRes.providerErrors.length, 1);
  assert.equal(degradedRes.providerErrors[0].providerId, 'open-library');

  // 4. Custom provider extension registration
  service.registerProvider({
    id: 'custom-local-archive',
    label: 'Custom Archive',
    async lookupByIsbn(isbn13) {
      return {
        candidateKey: `isbn:${isbn13}`,
        isbn13,
        title: 'Corduroy',
        authors: ['Don Freeman'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['classic'],
        spineColor: 'teal',
        sources: [{ provider: 'custom-local-archive', fetchedAt: new Date().toISOString() }],
      };
    },
    async searchBooks() {
      return [];
    },
  });
  assert.equal(service.getProviders().length, 3);
});
