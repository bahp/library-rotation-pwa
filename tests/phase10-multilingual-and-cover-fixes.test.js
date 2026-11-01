/**
 * @fileoverview Phase 10 regression & feature tests covering:
 * 1) Square (1:1) default cover size in Settings, Storage, Seed, and BookCover renderer
 * 2) Flush top-to-bottom sticky header bar (`sticky top-0` + `border-b` + `pt-safe`) with left-side app icon
 * 3) Open Library ISBN fallback to `search.json` (rescuing Spanish/Italian books & Work `cover_i`) + eliminating broken 404 cover URLs
 * 4) Google Books ISBN fallback to derived ISBN-10 (`84...` / `88...`), multi-item cover merging, and verified full-text ISBN lookup
 * 5) Automatic sibling-edition cover enrichment during `catalogService.lookupByIsbn` when the scanned ISBN record lacks cover art
 * 6) Multilingual Spanish & Italian diacritic normalization, binding inference, language tags, and children's topic extraction
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeIsbn10FromIsbn13, normalizeIsbn } from '../src/types/models.js';
import { createSafeDefaultSettings, createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderBookCover } from '../src/ui/components/book-cover.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { normalizeOpenLibraryDataRecord } from '../src/features/catalog/normalizer.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import { createOpenLibraryProvider } from '../src/features/catalog/providers/open-library-provider.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';
import { enrichBookWithLocalRules, sanitizeTag } from '../src/features/tagging/rule-tagger.js';

describe('Phase 10: 1:1 Default Covers, Flush Sticky App-Icon Header, ISBN Cover Enrichment & Spanish/Italian Book Support', () => {
  it('1. Uses Square (1:1) as the default cover aspect ratio across settings, seed state, and renderers', async () => {
    assert.equal(createSafeDefaultSettings().coverAspectRatio, 'square');
    assert.equal(
      createSafeDefaultSettings({ coverAspectRatio: 'portrait' }).coverAspectRatio,
      'portrait'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    assert.equal(state.settings.coverAspectRatio, 'square');
    assert.match(renderBookCover(state.books[0], 'grid'), /aspect-square/);

    const settingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      adapterDiagnostics: [],
    });

    assert.match(
      settingsHtml,
      /data-cover-aspect="square"[\s\S]*?aria-pressed="true"/,
      'Square (1:1) button in Settings should be active by default'
    );
  });

  it('2. Spans sticky top header flush from bottom border line to top edge with a left-side app icon', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const shellHtml = renderAppShell({
      activeRoute: 'home',
      state: store.getState(),
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: '<div>Content</div>',
    });

    assert.match(
      shellHtml,
      /<header[^>]*class="[^"]*\b(?:fixed|sticky)\s+top-0\b[^"]*\bborder-b\b/,
      'Top header must pin flush at top-0 and span down to its bottom border'
    );
    assert.doesNotMatch(
      shellHtml,
      /<header[^>]*class="[^"]*\bpt-2\b/,
      'Top header must not leave an un-covered gap above the bar'
    );
    assert.ok(
      shellHtml.includes('data-brand-icon="true"'),
      'Top header left brand link must include the app icon emblem'
    );
  });

  it('3. Fixes Open Library missing Spanish/Italian editions and prevents unverified 404 cover URLs', async () => {
    // Edition record without `record.cover` must NOT invent a broken 404 covers.openlibrary.org URL
    const noCoverRecord = normalizeOpenLibraryDataRecord(
      {
        key: '/books/OL12345M',
        title: 'El monstruo de colores',
        authors: [{ name: 'Anna Llenas' }],
        identifiers: { isbn_13: ['9788494157295'] },
      },
      { queriedIsbn: '9788494157295' }
    );
    assert.ok(noCoverRecord);
    assert.equal(
      noCoverRecord.coverUrl,
      undefined,
      'Must leave coverUrl undefined when Open Library edition record has no cover object'
    );

    // When `api/books` returns {} for an Italian ISBN (9788867222278), Open Library provider falls back to `search.json?isbn=...`
    /** @type {typeof fetch} */
    const mockFetch = async (input) => {
      const url = String(input);
      if (url.includes('openlibrary.org/api/books')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes('openlibrary.org/search.json') && url.includes('9788867222278')) {
        return new Response(
          JSON.stringify({
            numFound: 1,
            docs: [
              {
                key: '/works/OL20001W',
                title: 'Piccolo blu e piccolo giallo',
                author_name: ['Leo Lionni'],
                first_publish_year: 1959,
                isbn: ['9788867222278'],
                number_of_pages_median: 48,
                subject: ['Amicizia', 'Colori', 'Libri per bambini'],
                cover_i: 9988776,
                format: ['Copertina rigida'],
                language: ['ita'],
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const client = createHttpClient({
      fetchImpl: mockFetch,
      maxRetries: 0,
      disablePersistentCache: true,
    });
    const olProvider = createOpenLibraryProvider(client);
    const italianHit = await olProvider.lookupByIsbn('9788867222278');

    assert.ok(italianHit, 'Open Library should recover Italian edition via search.json ISBN fallback');
    assert.equal(italianHit.title, 'Piccolo blu e piccolo giallo');
    assert.equal(italianHit.isbn13, '9788867222278');
    assert.equal(italianHit.coverUrl, 'https://covers.openlibrary.org/b/id/9988776-M.jpg');
    assert.ok(italianHit.tags.includes('italian'));
  });

  it('4. Rescues Spanish & Italian ISBNs in Google Books via derived ISBN-10, multi-item cover merge, and verified raw ISBN fallback', async () => {
    // Derived ISBN-10 from Spanish 978-84 ISBN-13
    assert.equal(computeIsbn10FromIsbn13('9788484648918'), '8484648915');
    const normSpanish = normalizeIsbn('978-84-8464-891-8');
    assert.equal(normSpanish.valid, true);
    assert.equal(normSpanish.isbn13, '9788484648918');
    assert.equal(normSpanish.isbn10, '8484648915');

    /** @type {typeof fetch} */
    const mockFetch = async (input) => {
      const url = new URL(String(input));
      const q = url.searchParams.get('q') || '';

      // Case A: q=isbn:9788484648918 returns 2 items — item[0] has NO cover, item[1] HAS cover!
      if (q === 'isbn:9788484648918') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'es_no_cover',
                volumeInfo: {
                  title: 'Donde viven los monstruos',
                  authors: ['Maurice Sendak'],
                  language: 'es',
                  pageCount: 40,
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788484648918' }],
                },
              },
              {
                id: 'es_with_cover',
                volumeInfo: {
                  title: 'Donde viven los monstruos',
                  authors: ['Maurice Sendak'],
                  language: 'es',
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788484648918' }],
                  imageLinks: {
                    thumbnail: 'https://books.google.com/books/content?id=es_with_cover&img=1',
                  },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      // Case B: Italian book 9788804668299 returns 0 items for `isbn:9788804668299`,
      // but succeeds on derived `isbn:8804668296`!
      if (q === 'isbn:9788804668299') {
        return new Response(JSON.stringify({ totalItems: 0 }), { status: 200 });
      }
      if (q === 'isbn:8804668296') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'it_favole',
                volumeInfo: {
                  title: 'Favole al telefono',
                  authors: ['Gianni Rodari'],
                  language: 'it',
                  categories: ['Brossura'],
                  industryIdentifiers: [{ type: 'ISBN_10', identifier: '8804668296' }],
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ totalItems: 0 }), { status: 200 });
    };

    const client = createHttpClient({
      fetchImpl: mockFetch,
      maxRetries: 0,
      disablePersistentCache: true,
    });
    const gbProvider = createGoogleBooksProvider(client);

    const spanishBook = await gbProvider.lookupByIsbn('9788484648918');
    assert.ok(spanishBook);
    assert.equal(
      spanishBook.coverUrl,
      'https://books.google.com/books/content?id=es_with_cover&img=1',
      'Should merge duplicate Google Books ISBN items so cover image on item[1] is not lost'
    );
    assert.ok(spanishBook.tags.includes('spanish'));

    const italianBook = await gbProvider.lookupByIsbn('9788804668299');
    assert.ok(italianBook, 'Should find Italian book via derived ISBN-10 fallback');
    assert.equal(italianBook.title, 'Favole al telefono');
    assert.equal(italianBook.isbn13, '9788804668299');
    assert.equal(italianBook.format, 'paperback');
    assert.ok(italianBook.tags.includes('italian'));
  });

  it('5. Automatically enriches missing ISBN edition covers via title + author sibling search during scan', async () => {
    // Simulates the exact real-world bug: scanning ISBN 9788494157295 returns bibliographic metadata WITHOUT imageLinks,
    // while searching by title + author ("El monstruo de colores" + "Anna Llenas") DOES have a cover image!
    /** @type {typeof fetch} */
    const mockFetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname.includes('googleapis.com')) {
        const q = url.searchParams.get('q') || '';
        if (q.startsWith('isbn:') || /^\d+$/.test(q)) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'monstruo_isbn_print_no_img',
                  volumeInfo: {
                    title: 'El monstruo de colores',
                    authors: ['Anna Llenas'],
                    language: 'es',
                    pageCount: 44,
                    categories: ['Tapa dura', 'Emociones'],
                    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788494157295' }],
                    // Notice: NO imageLinks on this specific ISBN printing!
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }

        if (q.includes('El monstruo de colores')) {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: 'unrelated_book',
                  volumeInfo: {
                    title: 'Completely Different Book',
                    authors: ['Someone Else'],
                    imageLinks: {
                      thumbnail: 'https://books.google.com/books/content?id=wrong_cover&img=1',
                    },
                  },
                },
                {
                  id: 'monstruo_sibling_edition',
                  volumeInfo: {
                    title: 'El monstruo de colores: Edición álbum',
                    authors: ['Anna Llenas'],
                    imageLinks: {
                      thumbnail: 'https://books.google.com/books/content?id=monstruo_real_cover&img=1',
                    },
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
      }

      return new Response(JSON.stringify({ docs: [] }), { status: 200 });
    };

    const client = createHttpClient({
      fetchImpl: mockFetch,
      maxRetries: 0,
      disablePersistentCache: true,
    });
    const service = createCatalogService({
      providers: [createGoogleBooksProvider(client), createOpenLibraryProvider(client)],
    });

    const scanResult = await service.lookupByIsbn('9788494157295');
    assert.ok(scanResult.candidate);
    assert.equal(scanResult.candidate.title, 'El monstruo de colores');
    assert.equal(
      scanResult.candidate.coverUrl,
      'https://books.google.com/books/content?id=monstruo_real_cover&img=1',
      'ISBN lookup should automatically enrich missing cover from matching title+author sibling edition'
    );
  });

  it('6. Preserves Spanish & Italian accented words during tag sanitization and extracts multilingual topics', () => {
    // Previously `música` became `m-sica` and `fantasía` became `fantas-a`
    assert.equal(sanitizeTag('Música'), 'musica');
    assert.equal(sanitizeTag('Fantasía'), 'fantasia');

    const spanishEnriched = enrichBookWithLocalRules({
      title: 'Buenas noches, pequeño oso',
      subjects: ['Cuentos infantiles', 'Animales del bosque', 'Hora de dormir'],
      summary: 'Un cuento tierno de invierno y nieve para niños de 2 a 5 años.',
    });
    assert.ok(spanishEnriched.tags.includes('bedtime'));
    assert.ok(spanishEnriched.tags.includes('animals'));
    assert.ok(spanishEnriched.tags.includes('nature'));
    assert.ok(spanishEnriched.tags.includes('winter'));
    assert.equal(spanishEnriched.tags.includes('cuentos-infantiles'), false);

    const italianEnriched = enrichBookWithLocalRules({
      title: 'Buonanotte piccolo gufo',
      subjects: ['Libri per bambini', 'Emozioni e amicizia', 'Animali'],
      summary: 'Una storia dolce della buonanotte da 3 a 6 anni.',
    });
    assert.ok(italianEnriched.tags.includes('bedtime'));
    assert.ok(italianEnriched.tags.includes('animals'));
    assert.ok(italianEnriched.tags.includes('feelings'));
    assert.ok(italianEnriched.tags.includes('friendship'));
  });
});
