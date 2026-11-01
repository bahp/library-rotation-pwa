/**
 * @fileoverview Phase 11 tests covering:
 * 1) Wishlist, Loved, Collection Statuses ('owned' | 'wishlist' | 'interested' | 'library'),
 *    and Physical Conditions ('good' | 'torn' | 'broken' | 'retired') across intake, Library filters,
 *    Book Inspector, and Rotation Engine exclusion of non-home / unplayable books.
 * 2) QR code book scanning (ISBN URLs & library QR stickers) so books spotted in a library/shop
 *    can be scanned and added directly to Wishlist.
 * 3) Cover Art Dominant Color Extractor (`extractDominantColorFromRgba`) + Settings enable/disable toggle (`dynamicCoverTint`).
 * 4) Multi-Child / Owner assignment (`owners`: child profiles, 'shared', custom labels like "Cousin Maya" / "Grandma's House"),
 *    colored avatar badges on book cards, and instant owner filtering in Library.
 * 5) Google Books API live diagnostic health check (`checkProviderHealth`) & Settings UI readout.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isBookRotatable,
  normalizeBookCondition,
  normalizeCollectionStatus,
  resolveBookOwnerBadges,
} from '../src/types/models.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import {
  extractDominantColorFromRgba,
  resolveBookCardTintHex,
} from '../src/features/catalog/cover-color-extractor.js';
import { parseScannedCodePayload } from '../src/features/scan/isbn-extractor.js';
import { createBarcodeDecoder } from '../src/features/scan/barcode-decoder.js';
import { generateRotationSelection } from '../src/features/rotations/rotation-engine.js';
import { getProfileRecommendations } from '../src/features/tagging/recommendations.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';

describe('Phase 11: Wishlist & States, QR Scan Intake, Dynamic Cover Color Tint, Owner Badges/Filters, and Google Books Diagnostics', () => {
  it('1. Supports wishlist, loved, interested, library, and torn/broken/retired states across all add-book flows while excluding non-home/broken books from rotations', async () => {
    assert.equal(normalizeCollectionStatus(undefined), 'owned');
    assert.equal(normalizeCollectionStatus('wishlist'), 'wishlist');
    assert.equal(normalizeCollectionStatus('interested'), 'interested');
    assert.equal(normalizeCollectionStatus('library'), 'library');
    assert.equal(normalizeBookCondition(undefined), 'good');
    assert.equal(normalizeBookCondition('torn'), 'torn');
    assert.equal(normalizeBookCondition('broken'), 'broken');
    assert.equal(normalizeBookCondition('retired'), 'retired');

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // 1a. Add a scanned/searched candidate directly to Wishlist + Loved
    const wishlistBook = await store.addBookFromCandidate(
      {
        candidateKey: 'isbn:9780399240461',
        isbn13: '9780399240461',
        title: 'The Gruffalo',
        authors: ['Julia Donaldson'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 7,
        readingStage: 'picture-book',
        tags: ['animals', 'woods'],
        spineColor: 'emerald',
        sources: [{ provider: 'google-books', externalId: 'gruffalo-1', fetchedAt: '2026-10-31T00:00:00.000Z' }],
      },
      {
        collectionStatus: 'wishlist',
        loved: true,
        owners: ['profile_maya'],
      }
    );

    assert.equal(wishlistBook.collectionStatus, 'wishlist');
    assert.equal(wishlistBook.loved, true);
    assert.deepEqual(wishlistBook.owners, ['profile_maya']);
    assert.equal(isBookRotatable(wishlistBook), false, 'Wishlist books are not at home yet and should not rotate');

    // 1b. Add a manual book with collectionStatus='library' and condition='torn'
    const libraryLoanBook = await store.addManualBook({
      title: 'Stellaluna',
      authors: ['Janell Cannon'],
      isbn: '9780152802172',
      format: 'hardcover',
      ageMin: 4,
      ageMax: 8,
      readingStage: 'picture-book',
      tags: ['animals', 'friendship'],
      collectionStatus: 'library',
      condition: 'torn',
      loved: false,
      owners: ['shared'],
    });
    assert.equal(libraryLoanBook.collectionStatus, 'library');
    assert.equal(libraryLoanBook.condition, 'torn');
    assert.equal(isBookRotatable(libraryLoanBook), true, 'Checked-out library books at home can be rotated');

    // 1c. Add a manual book with condition='retired' and another with condition='broken'
    const retiredBook = await store.addManualBook({
      title: 'Outgrown ABC Flap Book',
      authors: ['Board Author'],
      format: 'board-book',
      ageMin: 1,
      ageMax: 3,
      readingStage: 'board-toddler',
      tags: ['animals'],
      collectionStatus: 'owned',
      condition: 'retired',
    });
    const brokenBook = await store.addManualBook({
      title: 'Missing Pages Pop-Up',
      authors: ['Pop Author'],
      format: 'hardcover',
      ageMin: 3,
      ageMax: 6,
      readingStage: 'picture-book',
      tags: ['animals'],
      collectionStatus: 'owned',
      condition: 'broken',
    });
    assert.equal(isBookRotatable(retiredBook), false);
    assert.equal(isBookRotatable(brokenBook), false);

    // 1d. Verify rotation engine & off-shelf recommendations exclude wishlist, interested, broken, and retired books
    const stateAfterAdds = store.getState();
    const maya = stateAfterAdds.profiles[0];
    const rotPick = generateRotationSelection({
      books: stateAfterAdds.books,
      profile: maya,
      rules: {
        count: 15,
        objective: 'animals',
        preferredTags: ['animals'],
        cooldownDays: 0,
        seed: 'phase11-eligibility',
      },
    });
    assert.equal(rotPick.selectedBookIds.includes(wishlistBook.id), false);
    assert.equal(rotPick.selectedBookIds.includes(retiredBook.id), false);
    assert.equal(rotPick.selectedBookIds.includes(brokenBook.id), false);
    assert.equal(rotPick.selectedBookIds.includes(libraryLoanBook.id), true);

    const recs = getProfileRecommendations({
      books: stateAfterAdds.books,
      profile: maya,
      rotations: stateAfterAdds.rotations,
      limit: 20,
    });
    assert.equal(recs.some((r) => r.book.id === wishlistBook.id), false);
    assert.equal(recs.some((r) => r.book.id === brokenBook.id), false);

    // 1e. Toggle loved & upgrade wishlist book to owned when purchased
    const toggled = await store.toggleBookLoved(libraryLoanBook.id);
    assert.equal(toggled?.loved, true);

    const upgraded = await store.updateBook(wishlistBook.id, {
      collectionStatus: 'owned',
      condition: 'good',
    });
    assert.equal(upgraded.collectionStatus, 'owned');
    assert.equal(isBookRotatable(upgraded), true);
  });

  it('2. Decodes QR codes containing ISBN URLs or book identifiers so library/bookstore QR scans can be added to Wishlist', async () => {
    const olUrlQr = parseScannedCodePayload('https://openlibrary.org/isbn/9780140501742?ref=qr');
    assert.equal(olUrlQr.matched, true);
    assert.equal(olUrlQr.kind, 'isbn');
    assert.equal(olUrlQr.isbn13, '9780140501742');

    const amazonIsbn10Qr = parseScannedCodePayload('https://www.amazon.com/Goodnight-Moon/dp/0064430170');
    assert.equal(amazonIsbn10Qr.matched, true);
    assert.equal(amazonIsbn10Qr.kind, 'isbn');
    assert.equal(amazonIsbn10Qr.isbn13, '9780064430173');

    const restaurantMenuQr = parseScannedCodePayload('https://cafe.example.com/menu?table=12');
    assert.equal(restaurantMenuQr.matched, false);

    // Native BarcodeDetector returning a QR code URL resolves to a matched ISBN decode outcome
    class MockQrBarcodeDetector {
      static async getSupportedFormats() {
        return ['ean_13', 'qr_code'];
      }
      async detect() {
        return [{ format: 'qr_code', rawValue: 'https://worldcat.org/isbn/978-0-399-24046-1' }];
      }
    }

    const decoder = createBarcodeDecoder({
      globalScope: { BarcodeDetector: MockQrBarcodeDetector },
      zxingDecodeFn: () => null,
    });
    const decoded = await decoder.decodeFrame({
      canvas: /** @type {any} */ ({}),
      imageData: { data: new Uint8ClampedArray(16), width: 2, height: 2 },
    });
    assert.equal(decoded.matched, true);
    assert.equal(decoded.isbn13, '9780399240461');

    // Scan & Search UI exposes destination selector (Owned / Wishlist / Library / Interested) + Add to Wishlist action
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const scanSearchHtml = renderScanShellView({
      state: store.getState(),
      uiState: {
        intakeTab: 'search',
        intakeTargetStatus: 'wishlist',
        intakeLoved: true,
        intakeOwners: ['profile_maya'],
        isbnInput: '',
        isbnLoading: false,
        isbnError: '',
        isbnNotFound: '',
        isbnCandidate: null,
        isbnProviderWarnings: [],
        lastScanLockBanner: '',
        titleQuery: 'Gruffalo',
        authorQuery: '',
        searchLoading: false,
        searchError: '',
        searchHasRun: true,
        searchCandidates: [
          {
            candidateKey: 'isbn:9780399240461',
            isbn13: '9780399240461',
            title: 'The Gruffalo',
            authors: ['Julia Donaldson'],
            format: 'hardcover',
            ageMin: 3,
            ageMax: 7,
            readingStage: 'picture-book',
            tags: ['animals'],
            spineColor: 'emerald',
            sources: [{ provider: 'google-books', fetchedAt: '2026-10-31T00:00:00.000Z' }],
          },
        ],
        searchProviderWarnings: [],
        manualDraft: {
          title: '',
          authors: '',
          isbn: '',
          publishedYear: '',
          pageCount: '',
          coverUrl: '',
          format: 'hardcover',
          readingStage: 'picture-book',
          ageMin: 2,
          ageMax: 6,
          tags: '',
        },
        scanMode: 'barcode',
        formError: '',
      },
      scannerState: {
        mode: 'barcode',
        phase: 'idle',
        statusMessage: 'Ready',
        errorMessage: '',
        ignoredHint: '',
        facingMode: 'environment',
        uploadedPreviewUrl: '',
        lock: null,
        support: null,
      },
    });
    assert.ok(
      scanSearchHtml.includes('data-action="add-candidate-wishlist"') &&
        scanSearchHtml.includes('Wishlist'),
      'Expected Wishlist icon action on Search results'
    );
  });

  it('3. Extracts dominant vibrant cover color from RGBA pixel data and honors Settings enable/disable toggle (dynamicCoverTint)', async () => {
    // Build a 4x4 RGBA image: 4 white border pixels + 12 vibrant terracotta-orange illustration pixels (220, 95, 50)
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      const off = i * 4;
      if (i < 4) {
        // White margin
        rgba[off] = 252;
        rgba[off + 1] = 252;
        rgba[off + 2] = 250;
        rgba[off + 3] = 255;
      } else {
        // Vibrant warm terracotta cover art
        rgba[off] = 220;
        rgba[off + 1] = 95;
        rgba[off + 2] = 50;
        rgba[off + 3] = 255;
      }
    }

    const dominantHex = extractDominantColorFromRgba(rgba, 4, 4);
    assert.ok(dominantHex && /^#[0-9A-F]{6}$/i.test(dominantHex), `Expected hex color, got ${dominantHex}`);
    const r = parseInt(dominantHex.slice(1, 3), 16);
    const b = parseInt(dominantHex.slice(5, 7), 16);
    assert.ok(r > b + 60, `Expected warm red-dominant hex from terracotta cover pixels, got ${dominantHex}`);

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Enabled by default
    assert.equal(store.getState().settings.dynamicCoverTint, true);

    const bookId = store.getState().books[0].id;
    await store.setBookDominantColor(bookId, dominantHex);
    const tintedBook = store.getState().books.find((b) => b.id === bookId);
    assert.equal(tintedBook?.dominantColor, dominantHex.toUpperCase());
    assert.equal(resolveBookCardTintHex(tintedBook), dominantHex.toUpperCase());

    //Clicked Book Detail sheet renders subtle tinted card attribute when dynamicCoverTint is enabled
    const enabledLibInspectorHtml = renderLibraryView({
      state: store.getState(),
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: bookId },
    });
    assert.ok(
      enabledLibInspectorHtml.includes('lr-tinted-card') &&
        enabledLibInspectorHtml.includes('data-cover-tint='),
      'Expected lr-tinted-card and data-cover-tint on clicked Book Detail sheet when dynamicCoverTint is enabled'
    );

    const enabledHomeInspectorHtml = renderHomeView({
      state: store.getState(),
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: bookId },
    });
    assert.ok(enabledHomeInspectorHtml.includes('lr-tinted-card'));

    // Disable dynamicCoverTint in Settings -> tint classes/attributes must disappear from Book Detail sheet
    await store.updateSettings({ dynamicCoverTint: false });
    assert.equal(store.getState().settings.dynamicCoverTint, false);

    const disabledLibInspectorHtml = renderLibraryView({
      state: store.getState(),
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: bookId },
    });
    assert.equal(
      disabledLibInspectorHtml.includes('lr-tinted-card'),
      false,
      'Expected no lr-tinted-card when dynamicCoverTint is disabled in Settings'
    );

    const settingsHtml = renderSettingsView({
      state: store.getState(),
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
    assert.ok(
      settingsHtml.includes('data-action="toggle-dynamic-cover-tint"'),
      'Settings must expose toggle-dynamic-cover-tint switch'
    );
  });

  it('4. Assigns multi-child, Shared, and custom household owners to books, renders avatar badges, and filters Library by owner', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const books = store.getState().books;
    const bookForLeo = books[0];
    const bookForSharedAndGrandma = books[1];
    const bookForCousin = books[2];

    await store.updateBook(bookForLeo.id, {
      owners: ['profile_leo'],
    });
    await store.updateBook(bookForSharedAndGrandma.id, {
      owners: ['shared', "Grandma's House"],
    });
    await store.updateBook(bookForCousin.id, {
      owners: ['Cousin Maya <script>alert(1)</script>'],
    });

    const updatedState = store.getState();
    const leoBook = updatedState.books.find((b) => b.id === bookForLeo.id);
    const sharedGrandmaBook = updatedState.books.find((b) => b.id === bookForSharedAndGrandma.id);
    const cousinBook = updatedState.books.find((b) => b.id === bookForCousin.id);

    assert.ok(leoBook && sharedGrandmaBook && cousinBook);

    const leoBadges = resolveBookOwnerBadges(leoBook, updatedState.profiles);
    assert.equal(leoBadges.length, 1);
    assert.equal(leoBadges[0].label, 'Leo');
    assert.equal(leoBadges[0].shortInitial, 'L');

    const grandmaBadges = resolveBookOwnerBadges(sharedGrandmaBook, updatedState.profiles);
    assert.equal(grandmaBadges.length, 2);
    assert.equal(grandmaBadges[0].label, 'Shared');
    assert.equal(grandmaBadges[1].label, "Grandma's House");
    assert.equal(grandmaBadges[1].shortInitial, 'GH');

    // Filter Library by Leo -> shows Leo's book and hides Cousin Maya's book
    const leoFilteredHtml = renderLibraryView({
      state: updatedState,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'profile_leo',
        searchQuery: '',
        inspectedBookId: null,
      },
    });
    assert.ok(leoFilteredHtml.includes(leoBook.title));
    assert.equal(leoFilteredHtml.includes(sharedGrandmaBook.title), false);
    assert.ok(leoFilteredHtml.includes('data-owner-badge="true"'), 'Expected owner avatar badge on book card');

    // Filter Library by custom owner "Grandma's House" -> shows Grandma's House book
    const grandmaFilteredHtml = renderLibraryView({
      state: updatedState,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: "Grandma's House",
        searchQuery: '',
        inspectedBookId: null,
      },
    });
    assert.ok(grandmaFilteredHtml.includes(sharedGrandmaBook.title));
    assert.equal(grandmaFilteredHtml.includes(leoBook.title), false);

    // Ensure custom owner badge & inspector escape any HTML characters safely
    const allLibHtml = renderLibraryView({
      state: updatedState,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: cousinBook.id,
      },
    });
    assert.equal(allLibHtml.includes('<script>alert(1)</script>'), false, 'Custom owner XSS must be escaped');

    // Book Inspector exposes quick owner toggles & status/loved controls
    const inspectorHtml = renderBookInspectorModal({
      book: sharedGrandmaBook,
      profiles: updatedState.profiles,
      activeRotation: null,
      canSwapInActiveRotation: false,
    });
    assert.ok(inspectorHtml.includes('data-action="toggle-book-loved"'));
    assert.ok(inspectorHtml.includes('data-action="set-book-status"'));
    assert.ok(inspectorHtml.includes('data-action="toggle-book-owner"'));
  });

  it('5. Verifies Google Books API connectivity and retrieved payload fields via checkProviderHealth and Settings diagnostic readout', async () => {
    /** @type {string[]} */
    const requestedUrls = [];
    const mockHttp = createHttpClient({
      fetchImpl: async (input) => {
        const url = String(input);
        requestedUrls.push(url);
        return new Response(
          JSON.stringify({
            totalItems: 1,
            items: [
              {
                id: 'gb-goodnight-moon',
                volumeInfo: {
                  title: 'Goodnight Moon',
                  authors: ['Margaret Wise Brown'],
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780064430173' }],
                  imageLinks: {
                    thumbnail: 'https://books.google.com/books/content?id=gb-goodnight-moon&img=1',
                  },
                },
              },
            ],
          }),
          { status: 200 }
        );
      },
      maxRetries: 0,
      disablePersistentCache: true,
    });

    const catalog = createCatalogService({
      providers: [createGoogleBooksProvider(mockHttp)],
    });

    const diag = await catalog.checkProviderHealth('google-books');
    assert.equal(diag.ok, true);
    assert.equal(diag.providerId, 'google-books');
    assert.equal(diag.matchedTitle, 'Goodnight Moon');
    assert.equal(diag.hasCover, true);
    assert.equal(diag.externalId, 'gb-goodnight-moon');
    assert.ok(typeof diag.latencyMs === 'number' && diag.latencyMs >= 0);
    assert.ok(requestedUrls.some((u) => u.includes('googleapis.com/books/v1/volumes')));

    // Verify failure reporting when Google Books returns HTTP 503
    const failingHttp = createHttpClient({
      fetchImpl: async () => new Response('Service Unavailable', { status: 503 }),
      maxRetries: 0,
      disablePersistentCache: true,
    });
    const failingCatalog = createCatalogService({
      providers: [createGoogleBooksProvider(failingHttp)],
    });
    const failedDiag = await failingCatalog.checkProviderHealth('google-books');
    assert.equal(failedDiag.ok, false);
    assert.ok(failedDiag.error && failedDiag.error.length > 0);

    // Settings view exposes the Check Google Books API button and renders diagnostic status
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const settingsHtml = renderSettingsView({
      state: store.getState(),
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
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport: 'Google Books API OK (42 ms) · Retrieved "Goodnight Moon" with cover image.',
      },
    });
    assert.ok(settingsHtml.includes('data-action="check-google-books-api"'));
    assert.ok(settingsHtml.includes('Google Books API OK (42 ms)'));
  });
});
