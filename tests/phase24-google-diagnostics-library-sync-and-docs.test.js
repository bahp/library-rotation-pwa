/**
 * @fileoverview Phase 24 maintainer regression tests covering:
 * 1) Origin cache quota clarity & one-tap `Clear Cover Cache` (`data-action="clear-cover-cache"`)
 * 2) Google Books API check visual feedback in `#/settings`:
 *    - Reddish alert box (`role="alert"`, `data-google-health-box="error"`) + `×` icon (`data-google-check-icon="error"`) on error
 *    - Green status box (`role="status"`, `data-google-health-box="success"`) + `✓` tick (`data-google-check-icon="ok"`) on success
 *    - `Save & Verify` proxy form + direct Cloudflare Worker guide link (`data-cloudflare-guide-link="true"`) + zero raw `api_key` inputs
 * 3) Clean Open Library external IDs (`OL7353617M`, `OL45804W` without `/books/` or `/works/` prefixes)
 *    in both `normalizer.js` and `provider-attribution.js` (including legacy saved books)
 * 4) Retroactive library sync (`store.syncExistingCatalogMetadata`) enriching books originally scanned
 *    with Open Library only while preserving `loved`, `collectionStatus`, `condition`, `owners`,
 *    custom `data:image/` photos, and user-curated tags
 * 5) Complete 5-minute step-by-step Cloudflare Worker proxy guide in `/public/docs/configuration.html`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  cleanProviderExternalId,
  mergeBookCandidates,
  normalizeGoogleBooksItem,
  normalizeOpenLibraryDataRecord,
  normalizeOpenLibrarySearchDoc,
} from '../src/features/catalog/normalizer.js';
import {
  renderSettingsView,
  resolveGoogleBooksHealthTone,
} from '../src/features/settings/settings-view.js';
import {
  describeProviderProvenance,
  renderProviderAttribution,
} from '../src/ui/components/provider-attribution.js';
import { APP_DOCS_LINKS, APP_VERSION } from '../src/version.js';

/**
 * Creates an isolated in-memory app store for deterministic tests.
 */
async function createIsolatedStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

const DEFAULT_PWA_STATUS = {
  isInstallable: false,
  isInstalled: true,
  isIOS: false,
  isOnline: true,
  swReady: true,
  showIosInstructions: false,
};

describe('Phase 24 — Clean Open Library External IDs & Dual-Provider Merging', () => {
  it('strips /books/, /works/, /authors/, and /editions/ prefixes from Open Library IDs while keeping bare IDs intact', () => {
    assert.equal(cleanProviderExternalId('/books/OL7353617M'), 'OL7353617M');
    assert.equal(cleanProviderExternalId('/works/OL45804W'), 'OL45804W');
    assert.equal(cleanProviderExternalId('/editions/OL12345M'), 'OL12345M');
    assert.equal(cleanProviderExternalId('gb_corduroy_01'), 'gb_corduroy_01');
    assert.equal(cleanProviderExternalId('  /books/OL999M  '), 'OL999M');
    assert.equal(cleanProviderExternalId(''), undefined);
    assert.equal(cleanProviderExternalId(null), undefined);

    const olEdition = normalizeOpenLibraryDataRecord(
      {
        key: '/books/OL7353617M',
        title: 'Madeline',
        authors: [{ name: 'Ludwig Bemelmans' }],
        number_of_pages: 48,
        publish_date: '1939',
      },
      { queriedIsbn: '9780140564396' }
    );
    assert.ok(olEdition);
    assert.equal(olEdition.sources[0].provider, 'open-library');
    assert.equal(olEdition.sources[0].externalId, 'OL7353617M');

    const olWork = normalizeOpenLibrarySearchDoc({
      key: '/works/OL45804W',
      title: 'Blueberries for Sal',
      author_name: ['Robert McCloskey'],
      first_publish_year: 1948,
    });
    assert.ok(olWork);
    assert.equal(olWork.sources[0].externalId, 'OL45804W');
  });

  it('cleans legacy saved /books/... prefixes at display time in describeProviderProvenance & renderProviderAttribution', () => {
    const legacySources = [
      { provider: 'open-library', externalId: '/books/OL7353617M', fetchedAt: '2026-01-01T00:00:00Z' },
    ];
    const provenance = describeProviderProvenance(legacySources);
    assert.equal(provenance.orderedProviders[0].externalId, 'OL7353617M');

    const html = renderProviderAttribution(legacySources, {
      prefix: 'Retrieved from',
      includeExternalIds: true,
    });
    assert.ok(html.includes('(OL7353617M)'), 'Expected bare Open Library code in detail attribution');
    assert.equal(html.includes('/books/OL7353617M'), false, 'Must not show /books/ path prefix');
  });

  it('merges Google Books (primary) with Open Library (gap-filler + tag/source union)', () => {
    const gb = normalizeGoogleBooksItem({
      id: 'gb_madeline_1',
      volumeInfo: {
        title: 'Madeline',
        authors: ['Ludwig Bemelmans'],
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780140564396' }],
        imageLinks: { thumbnail: 'http://books.google.com/books/content?id=gb_madeline_1&zoom=1' },
        categories: ['Paris'],
      },
    });
    const ol = normalizeOpenLibraryDataRecord(
      {
        key: '/books/OL7353617M',
        title: 'Madeline (Picture Puffin)',
        authors: [{ name: 'Ludwig Bemelmans' }],
        number_of_pages: 48,
        publish_date: '1939',
        subjects: [{ name: 'Friendship' }],
      },
      { queriedIsbn: '9780140564396' }
    );
    assert.ok(gb && ol);

    const merged = mergeBookCandidates(gb, ol);
    assert.equal(merged.title, 'Madeline', 'Google Books wins primary title');
    assert.equal(
      merged.coverUrl,
      'https://books.google.com/books/content?id=gb_madeline_1&zoom=1',
      'Google Books wins primary cover (upgraded to https)'
    );
    assert.equal(merged.pageCount, 48, 'Open Library fills missing pageCount');
    assert.equal(merged.publishedYear, 1939, 'Open Library fills missing publishedYear');
    assert.equal(merged.sources.length, 2, 'Both providers recorded in provenance');
    assert.deepEqual(
      merged.sources.map((s) => `${s.provider}:${s.externalId}`),
      ['google-books:gb_madeline_1', 'open-library:OL7353617M']
    );
  });
});

describe('Phase 24 — Google Books API Check Feedback, Proxy Verification & Cache Controls in Settings', () => {
  it('resolves health tone accurately and renders green box + tick on success and reddish alert box + x on error', async () => {
    assert.equal(resolveGoogleBooksHealthTone('idle', ''), 'idle');
    assert.equal(
      resolveGoogleBooksHealthTone(undefined, 'Google Books API reachable (HTTP 200) · 2 results'),
      'success'
    );
    assert.equal(
      resolveGoogleBooksHealthTone(undefined, 'Proxy check failed: HTTP 403 Forbidden'),
      'error'
    );

    const store = await createIsolatedStore();

    const successHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport:
          'Personal proxy verified! Google Books API reachable via https://books-proxy.example.workers.dev (HTTP 200 · 1 sample match).',
        googleBooksHealthTone: 'success',
        googleBooksKeyStatus: 'configured',
        deviceBooksProxyUrl: 'https://books-proxy.example.workers.dev',
        browserStorageSummary: 'Origin cache quota: 663.0 MB (padded by browser)',
      },
    });

    assert.ok(
      successHtml.includes('data-google-check-state="success"'),
      'Check button should carry success state'
    );
    assert.ok(
      successHtml.includes('data-google-check-icon="ok"'),
      'Check button should show green tick icon inside button when healthy'
    );
    assert.ok(
      successHtml.includes('data-google-health-box="success"'),
      'Health report should render inside green status box'
    );
    assert.ok(
      successHtml.includes('Save & Verify'),
      'Proxy form submit button should advertise automatic verification'
    );
    assert.ok(
      successHtml.includes('data-cloudflare-guide-link="true"'),
      'Settings should link directly to the 5-minute Cloudflare Worker setup guide'
    );
    assert.ok(
      successHtml.includes('data-action="clear-cover-cache"'),
      'About card should offer Clear Cover Cache button next to Origin cache quota'
    );
    // Security invariant from Phase 16/17: never include raw api_key form inputs
    assert.equal(successHtml.includes('api_key'), false);
    assert.equal(/name=["'][^"']*api[_-]?key/i.test(successHtml), false);

    const errorHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport:
          'Personal proxy saved, but check failed: Network or CORS error reaching proxy.',
        googleBooksHealthTone: 'error',
        googleBooksKeyStatus: 'static-host',
        deviceBooksProxyUrl: 'https://broken-proxy.example.workers.dev',
        deviceBooksProxyError: 'Enter a valid HTTPS proxy URL.',
      },
    });

    assert.ok(
      errorHtml.includes('data-google-check-state="error"'),
      'Check button should carry error state'
    );
    assert.ok(
      errorHtml.includes('data-google-check-icon="error"'),
      'Check button should show x icon inside button when failing'
    );
    assert.ok(
      errorHtml.includes('data-google-health-box="error"') &&
        errorHtml.includes('role="alert"'),
      'Error report should render inside reddish alert box below button'
    );
    assert.ok(
      errorHtml.includes('data-proxy-url-error="true"'),
      'Proxy URL validation error should also render in reddish alert box'
    );
  });
});

describe('Phase 24 — Retroactive Library Sync (Update Existing Library with Google Books)', () => {
  it('enriches Open Library-only books with Google Books covers, pages, years, tags & provenance without losing user personalizations', async () => {
    const store = await createIsolatedStore();

    // Add a book originally scanned with Open Library only (missing cover, pageCount, publishedYear, and legacy /books/ prefix)
    const olOnlyBook = await store.addBookFromCandidate(
      {
        candidateKey: 'isbn:9780140501780',
        isbn13: '9780140501780',
        title: 'Tikki Tikki Tembo',
        authors: ['Arlene Mosel'],
        format: 'paperback',
        ageMin: 3,
        ageMax: 7,
        readingStage: 'picture-book',
        tags: ['folktale', 'family-favorite'],
        spineColor: 'amber',
        sources: [
          {
            provider: 'open-library',
            externalId: '/books/OL7777777M',
            fetchedAt: '2026-02-01T10:00:00.000Z',
          },
        ],
      },
      {
        collectionStatus: 'wishlist',
        condition: 'torn',
        loved: true,
        owners: ['Maya'],
      }
    );
    assert.ok(olOnlyBook);

    // Add a second book with a custom camera cover photo (`data:image/png;base64,...`) to ensure custom photos are never overwritten
    const customCoverDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQYV2P4z8BQDwAEgAF/posBPQAAAABJRU5ErkJggg==';
    const customPhotoBook = await store.addBookFromCandidate({
      candidateKey: 'isbn:9780140564341',
      isbn13: '9780140564341',
      title: 'Make Way for Ducklings',
      authors: ['Robert McCloskey'],
      coverUrl: customCoverDataUrl,
      format: 'board-book',
      ageMin: 0,
      ageMax: 3,
      readingStage: 'board-toddler',
      tags: ['animals'],
      spineColor: 'emerald',
      sources: [
        {
          provider: 'open-library',
          externalId: '/books/OL8888888M',
          fetchedAt: '2026-02-01T10:05:00.000Z',
        },
      ],
    });
    assert.ok(customPhotoBook);

    /** @type {Array<{ current: number, total: number, title: string }>} */
    const progressEvents = [];

    /**
     * @type {{
     *   lookupByIsbn: (rawIsbn: string) => Promise<{ candidate: import('../src/features/catalog/normalizer.js').BookCandidate | null }>,
     *   searchBooks: () => Promise<{ candidates: import('../src/features/catalog/normalizer.js').BookCandidate[] }>
     * }}
     */
    const mockCatalogService = {
      async lookupByIsbn(rawIsbn) {
        if (rawIsbn === '9780140501780') {
          return {
            candidate: {
              candidateKey: 'isbn:9780140501780',
              isbn13: '9780140501780',
              title: 'Tikki Tikki Tembo',
              authors: ['Arlene Mosel'],
              publishedYear: 1968,
              pageCount: 48,
              coverUrl: 'https://books.google.com/books/content?id=gb_tikki&zoom=1',
              format: 'paperback',
              ageMin: 4,
              ageMax: 8,
              readingStage: 'picture-book',
              tags: ['classic', 'humor'],
              spineColor: 'teal',
              sources: [
                {
                  provider: 'google-books',
                  externalId: 'gb_tikki',
                  fetchedAt: '2026-11-02T12:00:00.000Z',
                },
                {
                  provider: 'open-library',
                  externalId: 'OL7777777M',
                  fetchedAt: '2026-11-02T12:00:00.000Z',
                },
              ],
            },
          };
        }
        if (rawIsbn === '9780140564341') {
          return {
            candidate: {
              candidateKey: 'isbn:9780140564341',
              isbn13: '9780140564341',
              title: 'Make Way for Ducklings',
              authors: ['Robert McCloskey'],
              publishedYear: 1941,
              pageCount: 68,
              coverUrl: 'https://books.google.com/books/content?id=gb_ducklings&zoom=1',
              format: 'board-book',
              ageMin: 0,
              ageMax: 3,
              readingStage: 'board-toddler',
              tags: ['boston'],
              spineColor: 'emerald',
              sources: [
                {
                  provider: 'google-books',
                  externalId: 'gb_ducklings',
                  fetchedAt: '2026-11-02T12:00:00.000Z',
                },
              ],
            },
          };
        }
        return { candidate: null };
      },
      async searchBooks() {
        return { candidates: [] };
      },
    };

    const summary = await store.syncExistingCatalogMetadata(mockCatalogService, {
      onProgress: (p) => progressEvents.push(p),
    });

    assert.ok(summary.checkedCount >= 2, 'Should check books missing Google Books provenance');
    assert.ok(summary.updatedCount >= 2, 'Should update both test books');
    assert.ok(summary.addedCoversCount >= 1, 'Should add remote cover to the book missing a cover');
    assert.ok(summary.addedGoogleSourceCount >= 2, 'Should attach Google Books provenance to both books');
    assert.ok(progressEvents.length >= 2, 'Should emit progress updates');

    const updatedTikki = store.getState().books.find((b) => b.id === olOnlyBook.id);
    assert.ok(updatedTikki);
    assert.equal(
      updatedTikki.coverUrl,
      'https://books.google.com/books/content?id=gb_tikki&zoom=1',
      'Missing cover filled from Google Books'
    );
    assert.equal(updatedTikki.pageCount, 48, 'Missing pageCount filled');
    assert.equal(updatedTikki.publishedYear, 1968, 'Missing publishedYear filled');
    assert.ok(updatedTikki.tags.includes('family-favorite'), 'User tag preserved');
    assert.ok(updatedTikki.tags.includes('classic'), 'Google Books tag merged');
    assert.equal(updatedTikki.collectionStatus, 'wishlist', 'Wishlist status preserved');
    assert.equal(updatedTikki.condition, 'torn', 'Condition preserved');
    assert.equal(updatedTikki.loved, true, 'Loved flag preserved');
    assert.deepEqual(updatedTikki.owners, ['Maya'], 'Owners preserved');
    assert.deepEqual(
      updatedTikki.sources.map((s) => `${s.provider}:${s.externalId}`),
      ['google-books:gb_tikki', 'open-library:OL7777777M'],
      'Legacy /books/ prefix cleaned and Google Books + Open Library provenance merged'
    );

    const updatedDucklings = store.getState().books.find((b) => b.id === customPhotoBook.id);
    assert.ok(updatedDucklings);
    assert.equal(
      updatedDucklings.coverUrl,
      customCoverDataUrl,
      'Custom camera data:image/ cover photo must never be overwritten by remote provider cover'
    );
    assert.equal(updatedDucklings.pageCount, 68, 'Missing pageCount still enriched');
    assert.equal(updatedDucklings.publishedYear, 1941, 'Missing publishedYear still enriched');
  });
});

describe('Phase 24 — 5-Minute Step-by-Step Cloudflare Worker Documentation', () => {
  it('documents all 4 Cloudflare Worker deployment steps, ALLOWED_ORIGIN, GOOGLE_BOOKS_API_KEY, and library sync in docs/configuration.html', () => {
    assert.equal(APP_VERSION, '1.20.0');
    assert.equal(APP_DOCS_LINKS.cloudflareWorkerGuide, 'docs/configuration.html#phone-proxy');

    const configDocPath = resolve(process.cwd(), 'public/docs/configuration.html');
    const html = readFileSync(configDocPath, 'utf8');

    assert.ok(html.includes('id="phone-proxy"'), 'Must include #phone-proxy anchor');
    assert.ok(
      html.includes('Step 1: Create a Free Cloudflare Account'),
      'Must include Step 1 heading'
    );
    assert.ok(
      html.includes('Step 2: Paste Your Worker Code'),
      'Must include Step 2 heading'
    );
    assert.ok(
      html.includes('Step 3: Add Your Environment Variables'),
      'Must include Step 3 heading'
    );
    assert.ok(
      html.includes('Step 4: Copy Your Proxy URL'),
      'Must include Step 4 heading'
    );
    assert.ok(html.includes('ALLOWED_ORIGIN'), 'Must document ALLOWED_ORIGIN variable');
    assert.ok(html.includes('GOOGLE_BOOKS_API_KEY'), 'Must document encrypted GOOGLE_BOOKS_API_KEY secret');
    assert.ok(html.includes('Save &amp; Verify'), 'Must reference Save & Verify auto-check');
    assert.ok(
      html.includes('Update Existing Library with Google Books'),
      'Must document retroactive library metadata sync'
    );
  });
});
