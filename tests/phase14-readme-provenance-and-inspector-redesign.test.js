/**
 * @fileoverview Phase 14 TDD regression tests covering:
 * 1) README documentation for configuring & restricting `GOOGLE_BOOKS_API_KEY` safely without `VITE_` client exposure.
 * 2) Clear provider provenance (`Google Books`, `Open Library`, or `Google Books + Open Library` with inline logos)
 *    during ISBN/Scan/Search queries AND posteriorly on saved books in the Book Individual Card.
 * 3) Redesigned Book Individual Card (`renderBookInspectorModal`):
 *    - Single clickable cover trigger (`data-action="toggle-cover-picker"`) with a horizontally centered camera badge
 *      (eliminating the off-center `right-1` badge and the duplicate `Change Cover` button).
 *    - Unified `Customize` rows (`Reader`, `Shelf`, `Condition`) aligned left-label / right-controls matching Scan/ISBN.
 *    - Non-redundant `#edit-book-form` that preserves `collectionStatus`, `condition`, and `tags` via hidden inputs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  describeProviderProvenance,
  renderProviderAttribution,
} from '../src/ui/components/provider-attribution.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';

/**
 * Helper building minimal scannerState for view tests.
 */
function createIdleScannerState() {
  return {
    mode: /** @type {const} */ ('barcode'),
    phase: /** @type {const} */ ('idle'),
    statusMessage: 'Ready',
    errorMessage: '',
    ignoredHint: '',
    facingMode: /** @type {const} */ ('environment'),
    uploadedPreviewUrl: '',
    lock: null,
    support: null,
  };
}

describe('Phase 14: README API Key Guide, Provider Provenance Logos & Book Individual Card Redesign', () => {
  it('1. Documents step-by-step GOOGLE_BOOKS_API_KEY setup, Books API restriction, and anti-VITE_ leak rules in README.md', async () => {
    const readme = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8');

    assert.match(
      readme,
      /GOOGLE_BOOKS_API_KEY/,
      'README.md must document GOOGLE_BOOKS_API_KEY'
    );
    assert.match(
      readme,
      /books\.googleapis\.com|Books API/,
      'README.md must explain enabling & restricting to the Google Books API in Google Cloud Console'
    );
    assert.match(
      readme,
      /VITE_GOOGLE_BOOKS_API_KEY/,
      'README.md must explicitly warn against prefixing GOOGLE_BOOKS_API_KEY with VITE_'
    );
    assert.match(
      readme,
      /\/api\/books\/status/,
      'README.md must document how to verify server key status via Settings or /api/books/status'
    );
  });

  it('2. Displays Google Books, Open Library, or both (with inline SVG logos) when querying ISBN/Scan/Search and posteriorly on saved books', async () => {
    // 2a. Unit verification of provenance descriptor & inline logos for Google only, Open Library only, and Both
    const googleOnly = describeProviderProvenance([
      { provider: 'google-books', externalId: 'gb-1' },
    ]);
    assert.equal(googleOnly.key, 'google-books');
    assert.equal(googleOnly.summaryText, 'Google Books');
    assert.equal(googleOnly.isBothCatalogs, false);

    const openOnly = describeProviderProvenance([{ provider: 'open-library' }]);
    assert.equal(openOnly.key, 'open-library');
    assert.equal(openOnly.summaryText, 'Open Library');
    assert.equal(openOnly.isBothCatalogs, false);

    const bothSources = [
      { provider: 'open-library', fetchedAt: '2026-10-31T00:00:00.000Z' },
      { provider: 'google-books', externalId: 'gb-wild', fetchedAt: '2026-10-31T00:00:00.000Z' },
    ];
    const both = describeProviderProvenance(bothSources);
    assert.equal(both.key, 'google-books+open-library');
    assert.equal(both.summaryText, 'Google Books + Open Library');
    assert.equal(both.isBothCatalogs, true);

    const bothHtml = renderProviderAttribution(bothSources);
    assert.ok(bothHtml.includes('data-provider-provenance="google-books+open-library"'));
    assert.ok(bothHtml.includes('data-provider-logo="google-books"'));
    assert.ok(bothHtml.includes('data-provider-logo="open-library"'));
    assert.ok(bothHtml.includes('Google Books'));
    assert.ok(bothHtml.includes('Open Library'));

    // 2b. During query (Found Book Sheet & Search/ISBN candidate row) shows provider logos + names
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const dualCandidate = {
      candidateKey: 'isbn:9780064431781',
      isbn13: '9780064431781',
      title: 'Where the Wild Things Are',
      authors: ['Maurice Sendak'],
      format: /** @type {const} */ ('hardcover'),
      ageMin: 3,
      ageMax: 7,
      readingStage: /** @type {const} */ ('picture-book'),
      tags: ['adventure', 'monsters'],
      spineColor: 'teal',
      sources: bothSources,
    };

    const scanFoundHtml = renderScanShellView({
      state: store.getState(),
      uiState: {
        intakeTab: 'isbn',
        isbnInput: '9780064431781',
        isbnLoading: false,
        isbnError: '',
        isbnNotFound: '',
        isbnCandidate: dualCandidate,
        activeCandidate: dualCandidate,
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
          format: 'hardcover',
          readingStage: 'picture-book',
          ageMin: 2,
          ageMax: 6,
          tags: '',
        },
        scanMode: 'barcode',
        formError: '',
      },
      scannerState: createIdleScannerState(),
    });

    assert.ok(
      scanFoundHtml.includes('data-provider-provenance="google-books+open-library"') &&
        scanFoundHtml.includes('data-provider-logo="google-books"') &&
        scanFoundHtml.includes('data-provider-logo="open-library"'),
      'Scan/ISBN lookup must display both Google Books and Open Library logos + names when merged from both'
    );

    // 2c. Posteriorly on saved Book Individual Card
    const savedBook = await store.addBookFromCandidate(dualCandidate);
    const posteriorInspectorHtml = renderBookInspectorModal({
      book: savedBook,
      profiles: store.getState().profiles,
    });
    assert.ok(
      posteriorInspectorHtml.includes('data-provider-provenance="google-books+open-library"') &&
        posteriorInspectorHtml.includes('Google Books') &&
        posteriorInspectorHtml.includes('Open Library'),
      'Saved book individual card must posteriorly display whether metadata came from Google Books, Open Library, or both'
    );
  });

  it('3. Redesigns Book Individual Card: single centered cover trigger, unified left/right Customize rows, and non-redundant Edit form', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const book = await store.addManualBook({
      title: 'The Snowy Day',
      authors: ['Ezra Jack Keats'],
      isbn: '9780140501827',
      format: 'hardcover',
      readingStage: 'picture-book',
      ageMin: 2,
      ageMax: 5,
      tags: ['winter', 'nature'],
      collectionStatus: 'wishlist',
      condition: 'torn',
      loved: true,
      owners: ['profile_maya'],
    });

    const cardHtml = renderBookInspectorModal({
      book,
      profiles: store.getState().profiles,
    });

    // 3a. Exactly ONE `data-action="toggle-cover-picker"` button (no duplicate Change Cover button!)
    const coverPickerTriggers = cardHtml.match(/data-action="toggle-cover-picker"/g) || [];
    assert.equal(
      coverPickerTriggers.length,
      1,
      `Expected exactly 1 cover-picker button on the book card, found ${coverPickerTriggers.length}`
    );

    // 3b. Cover camera badge is horizontally centered (`data-cover-badge="centered"` + `inset-x-1.5` + `flex justify-center`, NOT `right-1`)
    assert.ok(
      cardHtml.includes('data-cover-badge="centered"') &&
        cardHtml.includes('inset-x-1.5') &&
        cardHtml.includes('flex justify-center'),
      'Cover camera badge inside book cover must be horizontally centered'
    );
    assert.equal(
      cardHtml.includes('bottom-1 right-1'),
      false,
      'Off-center bottom-1 right-1 cover badge placement must be removed'
    );

    // 3c. Unified Customize section aligns Reader, Shelf, and Condition labels on left and option buttons on right
    assert.ok(cardHtml.includes('data-customize-row="owner"'));
    assert.ok(cardHtml.includes('data-customize-row="status"'));
    assert.ok(cardHtml.includes('data-customize-row="condition"'));

    // 3d. Opening Edit Info shows streamlined bibliographic form without duplicating status/condition dropdowns,
    //     while preserving collectionStatus, condition, and tags via hidden inputs
    const editModeHtml = renderBookInspectorModal({
      book,
      profiles: store.getState().profiles,
      inspectorUiState: {
        isCoverPickerOpen: false,
        isEditingBook: true,
        coverSearchQuery: '',
        coverSearchLoading: false,
        coverSearchError: '',
        coverSearchResults: [],
        editError: '',
      },
    });
    assert.ok(editModeHtml.includes('id="edit-book-form"'));
    assert.equal(
      editModeHtml.includes('id="edit-book-status"'),
      false,
      'Edit form should not duplicate Collection Status select already present in Customize'
    );
    assert.equal(
      editModeHtml.includes('id="edit-book-condition"'),
      false,
      'Edit form should not duplicate Condition select already present in Customize'
    );
    assert.match(
      editModeHtml,
      /<input[^>]+type="hidden"[^>]+name="collectionStatus"[^>]+value="wishlist"/,
      'Hidden collectionStatus input preserves Wishlist state during bibliographic edits'
    );
    assert.match(
      editModeHtml,
      /<input[^>]+type="hidden"[^>]+name="condition"[^>]+value="torn"/,
      'Hidden condition input preserves Torn state during bibliographic edits'
    );
    assert.match(
      editModeHtml,
      /<input[^>]+type="hidden"[^>]+name="tags"[^>]+value="[^"]*winter/,
      'Hidden tags input preserves existing topics during bibliographic edits'
    );
  });
});
