/**
 * @fileoverview Phase 12 regression tests covering:
 * 1) Dynamic Cover Color Tint applied ONLY to the clicked Book Detail sheet (`renderBookInspectorModal`),
 *    keeping main Library, Home, and Rotations book grids clean and unboxed.
 * 2) Google Books HTTP 429 daily-quota resilience (fast fail without wasted retries, temporary cooldown
 *    circuit-breaker, secondary-query protection, and zero noisy warning banners when Open Library succeeds).
 * 3) Default `Shared` (`['shared']`) ownership on book intake + active-reader-aware Library scope (`active-reader`
 *    showing active child + Shared books by default, with 1-tap `All Books` toggle and clean `More` filters).
 * 4) Redesigned Scan & Add wizard with slide-up "Book Found" bottom sheet (`data-found-book-sheet="true"`),
 *    preserving the 3 scan guide shapes (`barcode`, `isbn-ocr`, `cover`) and exposing Re-scan + Love, Wishlist,
 *    and Add to Library icon actions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml } from '../src/types/models.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import { createOpenLibraryProvider } from '../src/features/catalog/providers/open-library-provider.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';

describe('Phase 12: Inspector-Only Cover Tint, Google Books 429 Resilience, Smart Shared/Reader Scope & Scan Found Sheet', () => {
  it('1. Applies Dynamic Cover Art Color Tint ONLY to the clicked Book Inspector card, not main Library/Home/Rotation grids', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const targetBook = store.getState().books[0];
    await store.setBookDominantColor(targetBook.id, '#DC5F32');

    // A) Main Library, Home, and Rotations grids with NO book clicked must NOT have lr-tinted-card
    const libGridHtml = renderLibraryView({
      state: store.getState(),
      uiState: { catalogFilter: 'all', ownerFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.equal(
      libGridHtml.includes('lr-tinted-card'),
      false,
      'Main Library book grid should remain clean without tinted card boxes'
    );

    const homeGridHtml = renderHomeView({
      state: store.getState(),
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.equal(
      homeGridHtml.includes('lr-tinted-card'),
      false,
      'Main Home shelf grid should remain clean without tinted card boxes'
    );

    const rotationsGridHtml = renderRotationsView({
      state: store.getState(),
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: null,
      },
      inspectedBookId: null,
    });
    assert.equal(
      rotationsGridHtml.includes('lr-tinted-card'),
      false,
      'Main Rotations grid should remain clean without tinted card boxes'
    );

    // B) Clicking a book (`inspectedBookId: targetBook.id`) tints the Book Inspector modal card!
    const libWithClickedBookHtml = renderLibraryView({
      state: store.getState(),
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: targetBook.id,
      },
    });
    assert.ok(
      libWithClickedBookHtml.includes('lr-tinted-card') &&
        libWithClickedBookHtml.includes('data-cover-tint="#DC5F32"'),
      'Clicked Book Inspector sheet should receive lr-tinted-card and extracted dominant hex color'
    );

    // C) Disabling dynamicCoverTint in Settings removes tint from the Book Inspector sheet too
    await store.updateSettings({ dynamicCoverTint: false });
    const libTintDisabledHtml = renderLibraryView({
      state: store.getState(),
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: targetBook.id,
      },
    });
    assert.equal(
      libTintDisabledHtml.includes('lr-tinted-card'),
      false,
      'Disabling dynamicCoverTint in Settings should remove tint from the Book Inspector card'
    );

    // Direct renderBookInspectorModal check
    const directModalTinted = renderBookInspectorModal({
      book: store.getState().books[0],
      dynamicCoverTint: true,
    });
    assert.ok(directModalTinted.includes('lr-tinted-card'));
  });

  it('2. Handles Google Books HTTP 429 daily quota without retry stalls, engages cooldown, and hides false warning banners when Open Library finds the book', async () => {
    let googleFetchCalls = 0;
    let openLibraryFetchCalls = 0;

    /** @type {typeof fetch} */
    const mockFetch = async (input) => {
      const url = String(input);
      if (url.includes('googleapis.com/books/v1/volumes')) {
        googleFetchCalls += 1;
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              message:
                "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'books.googleapis.com'.",
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('openlibrary.org/api/books')) {
        openLibraryFetchCalls += 1;
        return new Response(
          JSON.stringify({
            'ISBN:9780140501742': {
              key: '/books/OL7353617M',
              title: 'Corduroy',
              authors: [{ name: 'Don Freeman' }],
              publish_date: '1976',
              number_of_pages: 32,
              identifiers: { isbn_13: ['9780140501742'] },
              cover: { medium: 'https://covers.openlibrary.org/b/id/8231456-M.jpg' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ docs: [] }), { status: 200 });
    };

    const http = createHttpClient({
      fetchImpl: mockFetch,
      maxRetries: 2,
      baseDelayMs: 50,
      disablePersistentCache: true,
    });

    const catalog = createCatalogService({
      providers: [createGoogleBooksProvider(http), createOpenLibraryProvider(http)],
    });

    // First sample ISBN lookup: Google Books returns 429 daily quota exceeded
    const firstLookup = await catalog.lookupByIsbn('9780140501742');
    assert.ok(firstLookup.candidate, 'Expected Corduroy to resolve cleanly from Open Library');
    assert.equal(firstLookup.candidate.title, 'Corduroy');
    assert.equal(
      googleFetchCalls,
      1,
      'Daily quota 429 without Retry-After should fail fast in 1 request instead of burning retries'
    );
    assert.equal(openLibraryFetchCalls, 1);

    // Second ISBN lookup right away: Google Books provider circuit-breaker skips network hit during cooldown
    const secondLookup = await catalog.lookupByIsbn('9780064431781');
    assert.equal(
      googleFetchCalls,
      1,
      'Expected Google Books quota circuit-breaker to skip redundant 429 network calls during cooldown'
    );
    assert.ok(secondLookup);

    // Explicit checkProviderHealth('google-books') bypasses cooldown to report actionable quota reason
    const health = await catalog.checkProviderHealth('google-books');
    assert.equal(health.ok, false);
    assert.match(health.error || '', /429|Quota exceeded/i);

    // Scan/ISBN UI must NOT display "Note: google-books did not respond" when candidate WAS found!
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const isbnSuccessHtml = renderScanShellView({
      state: store.getState(),
      uiState: {
        intakeTab: 'isbn',
        isbnInput: '9780140501742',
        isbnLoading: false,
        isbnError: '',
        isbnNotFound: '',
        isbnCandidate: firstLookup.candidate,
        isbnProviderWarnings: ['google-books'],
        lastScanLockBanner: '',
        titleQuery: '',
        authorQuery: '',
        searchLoading: false,
        searchError: '',
        searchHasRun: false,
        searchCandidates: [],
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
    assert.equal(
      isbnSuccessHtml.includes('did not respond'),
      false,
      'Should not show alarming provider failure note when book metadata succeeded from Open Library'
    );
  });

  it('3. Defaults newly added books to Shared ownership and filters Library for the active reader + Shared with 1-tap All Books toggle', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Saving a book without specifying owners defaults to ['shared']
    const sharedByDefault = await store.addManualBook({
      title: 'Shared Bedtime Treasury',
      authors: ['Classic Author'],
      format: 'hardcover',
      readingStage: 'picture-book',
      ageMin: 2,
      ageMax: 6,
      tags: ['bedtime'],
    });
    assert.deepEqual(sharedByDefault.owners, ['shared']);

    const mayaExclusive = await store.addManualBook({
      title: 'Maya Chapter Mystery',
      authors: ['Mystery Author'],
      format: 'paperback',
      readingStage: 'early-reader',
      ageMin: 5,
      ageMax: 8,
      tags: ['mystery'],
      owners: ['profile_maya'],
    });

    const leoExclusive = await store.addManualBook({
      title: 'Leo Baby Touch & Feel',
      authors: ['Board Author'],
      format: 'board-book',
      readingStage: 'board-toddler',
      ageMin: 0,
      ageMax: 2,
      tags: ['animals'],
      owners: ['profile_leo'],
    });

    // Active profile in seed state is Maya ('profile_maya')
    const state = store.getState();
    assert.equal(state.activeProfileId, 'profile_maya');

    // When ownerFilter is 'active-reader' (For Maya), Maya sees her books + Shared books, NOT Leo-only books
    const forMayaHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'active-reader',
        searchQuery: '',
        inspectedBookId: null,
      },
    });
    assert.ok(forMayaHtml.includes(sharedByDefault.title), 'Active reader scope must include Shared books');
    assert.ok(forMayaHtml.includes(mayaExclusive.title), 'Active reader scope must include Maya books');
    assert.equal(
      forMayaHtml.includes(escapeHtml(leoExclusive.title)),
      false,
      'Active reader scope for Maya should hide Leo-exclusive books until All Books is toggled'
    );
    assert.ok(
      forMayaHtml.includes('data-action="set-owner-filter"') &&
        forMayaHtml.includes('data-owner="all"'),
      'Library must expose a 1-tap button to view All Books across all profiles'
    );

    // Toggling to 'all' reveals Leo's book too
    const allBooksHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
      },
    });
    assert.ok(allBooksHtml.includes(escapeHtml(leoExclusive.title)));
  });

  it('4. Redesigns Scan & Add without pre-scan Save-as clutter, preserves 3 scan guide shapes, and slides up a Found Book sheet with Re-scan & icon actions', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const baseScannerState = {
      mode: /** @type {'barcode'} */ ('barcode'),
      phase: /** @type {'idle'} */ ('idle'),
      statusMessage: 'Tap the frame to scan.',
      errorMessage: '',
      ignoredHint: '',
      facingMode: /** @type {'environment'} */ ('environment'),
      uploadedPreviewUrl: '',
      lock: null,
      support: null,
    };

    const baseUi = {
      intakeTab: /** @type {'scanner'} */ ('scanner'),
      isbnInput: '',
      isbnLoading: false,
      isbnError: '',
      isbnNotFound: '',
      isbnCandidate: null,
      activeCandidate: null,
      isbnProviderWarnings: [],
      lastScanLockBanner: '',
      titleQuery: '',
      authorQuery: '',
      searchLoading: false,
      searchError: '',
      searchHasRun: false,
      searchCandidates: [],
      searchProviderWarnings: [],
      manualDraft: {
        title: '',
        authors: '',
        isbn: '',
        publishedYear: '',
        pageCount: '',
        coverUrl: '',
        format: /** @type {'hardcover'} */ ('hardcover'),
        readingStage: /** @type {'picture-book'} */ ('picture-book'),
        ageMin: 2,
        ageMax: 6,
        tags: '',
      },
      scanMode: /** @type {'barcode'} */ ('barcode'),
      formError: '',
    };

    // A) Idle scanner has NO pre-scan "Save as:" bar cluttering the top, and preserves all 3 guide frame shapes
    const idleScanHtml = renderScanShellView({
      state,
      uiState: baseUi,
      scannerState: baseScannerState,
    });
    assert.equal(
      idleScanHtml.includes('Save as:'),
      false,
      'Pre-scan screen should not clutter the top with Save as: buttons before a book is found'
    );
    assert.equal(
      idleScanHtml.includes('data-found-book-sheet="true"'),
      false,
      'Found Book sheet stays hidden until a book is scanned or looked up'
    );

    // Verify all 3 scan modes keep distinct guide geometry classes
    const barcodeHtml = renderScanShellView({
      state,
      uiState: { ...baseUi, scanMode: 'barcode' },
      scannerState: baseScannerState,
    });
    const ocrHtml = renderScanShellView({
      state,
      uiState: { ...baseUi, scanMode: 'isbn-ocr' },
      scannerState: { ...baseScannerState, mode: 'isbn-ocr' },
    });
    const coverHtml = renderScanShellView({
      state,
      uiState: { ...baseUi, scanMode: 'cover' },
      scannerState: { ...baseScannerState, mode: 'cover' },
    });
    assert.match(barcodeHtml, /data-scan-guide="barcode"[^>]*h-24/);
    assert.match(ocrHtml, /data-scan-guide="isbn-ocr"[^>]*h-12/);
    assert.match(coverHtml, /data-scan-guide="cover"[^>]*h-48/);

    // B) When a book is found during scanning (staying right on the Scanner tab!), a bottom sheet slides up
    //    with book details, Re-scan, Wishlist icon action, Love icon action, Add to Library icon action, and manual customization
    const foundCandidate = {
      candidateKey: 'isbn:9780140501742',
      isbn13: '9780140501742',
      title: 'Corduroy',
      authors: ['Don Freeman'],
      format: /** @type {'paperback'} */ ('paperback'),
      ageMin: 2,
      ageMax: 6,
      readingStage: /** @type {'picture-book'} */ ('picture-book'),
      tags: ['animals', 'friendship'],
      spineColor: /** @type {'amber'} */ ('amber'),
      coverUrl: 'https://covers.openlibrary.org/b/id/8231456-M.jpg',
      sources: [{ provider: 'open-library', fetchedAt: '2026-10-31T00:00:00.000Z' }],
    };

    const foundSheetHtml = renderScanShellView({
      state,
      uiState: {
        ...baseUi,
        intakeTab: 'scanner',
        activeCandidate: foundCandidate,
      },
      scannerState: baseScannerState,
    });

    assert.ok(
      foundSheetHtml.includes('data-found-book-sheet="true"'),
      'Expected slide-up Found Book bottom sheet when a book is scanned/retrieved'
    );
    assert.ok(foundSheetHtml.includes('animate-sheet-up'), 'Found Book sheet should slide up from bottom');
    assert.ok(foundSheetHtml.includes('Corduroy') && foundSheetHtml.includes('Don Freeman'));
    assert.ok(foundSheetHtml.includes('data-action="rescan-book"'), 'Expected Re-scan button in Found Book sheet');
    assert.ok(
      foundSheetHtml.includes('data-action="save-found-wishlist"'),
      'Expected Wishlist icon action in Found Book sheet'
    );
    assert.ok(
      foundSheetHtml.includes('data-action="toggle-intake-loved"'),
      'Expected Love/Favorite icon action in Found Book sheet'
    );
    assert.ok(
      foundSheetHtml.includes('data-action="save-found-library"'),
      'Expected Add to Library icon action in Found Book sheet'
    );
    assert.ok(
      foundSheetHtml.includes('data-action="edit-found-book-manual"'),
      'Expected manual configuration trigger in Found Book sheet'
    );
  });
});
