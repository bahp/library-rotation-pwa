/**
 * @fileoverview Phase 9 regression tests covering:
 * 1) Rotations Edit mode rich book details (1-row-per-book on phones, multi-column on wider screens)
 * 2) Settings configuration for Book Cover Aspect Ratio (Original 3:4 vs. Square 1:1)
 * 3) Easy Book Cover replacement (Phone Gallery, Camera capture, Online Google/OpenLibrary cover search) & Edit Book Info
 * 4) Uniform height between form <select> dropdowns and <input> fields (appearance: none + h-12)
 * 5) Floating sticky top bar housing the reader profile switcher on mobile & desktop
 * 6) Material Design bottom-sheet slide-up & slide-down motion transitions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderBookCover } from '../src/ui/components/book-cover.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';
import { renderProfileFormSheet } from '../src/ui/components/profile-sheets.js';

describe('Phase 9 UX Polish: Rich Rotation Edit Rows, Square/Portrait Covers, Cover & Book Editor, Uniform Selects, Floating Header, and Material Sheets', () => {
  it('1. Displays 1-per-row on mobile and multi-column on wider screens with rich book details when editing a rotation', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();
    const activeRotation = state.rotations.find(
      (r) => r.profileId === state.activeProfileId && r.status === 'active'
    );
    assert.ok(activeRotation);

    const editingHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: activeRotation.id,
      },
    });

    // Responsive 1-column mobile -> 2+ column tablet/desktop layout
    assert.match(
      editingHtml,
      /grid-cols-1\s+md:grid-cols-2/,
      'Expected 1 book per row on phones and multiple columns on tablet/desktop in Edit mode'
    );

    // Includes cover, title, author, age range, binding format, and topics so user can decide whether to swap
    assert.ok(editingHtml.includes('Owl Moon'), 'Expected book title in Edit row');
    assert.ok(editingHtml.includes('Jane Yolen'), 'Expected book author in Edit row');
    assert.match(editingHtml, /Ages\s+\d+–\d+/, 'Expected age range in Edit row');
    assert.match(editingHtml, /Hardcover|Board Book|Paperback/, 'Expected binding format in Edit row');
    assert.match(editingHtml, /Topics:/i, 'Expected topic tags in Edit row');
  });

  it('2. Supports configurable Original (3:4) vs. Square (1:1) book covers in Settings and across views', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Default is 'square' (1:1)
    assert.equal(store.getState().settings.coverAspectRatio, 'square');
    const sampleBook = store.getState().books[0];
    assert.match(renderBookCover(sampleBook, 'grid'), /aspect-square/);
    assert.match(renderBookCover(sampleBook, 'grid', 'portrait'), /aspect-\[3\/4\]/);
    assert.match(renderBookCover(sampleBook, 'grid', 'square'), /aspect-square/);

    // Switch to 'portrait' and back to 'square' in Settings
    await store.updateSettings({ coverAspectRatio: 'portrait' });
    assert.equal(store.getState().settings.coverAspectRatio, 'portrait');
    await store.updateSettings({ coverAspectRatio: 'square' });
    assert.equal(store.getState().settings.coverAspectRatio, 'square');

    const squareState = store.getState();
    const settingsHtml = renderSettingsView({
      state: squareState,
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
      settingsHtml.includes('data-action="set-cover-aspect"'),
      'Settings should expose cover aspect ratio selector'
    );

    const homeSquareHtml = renderHomeView({
      state: squareState,
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.match(homeSquareHtml, /aspect-square/, 'Home grid covers should render square when configured');

    const libSquareHtml = renderLibraryView({
      state: squareState,
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.match(libSquareHtml, /aspect-square/, 'Library grid covers should render square when configured');
  });

  it('3. Allows changing book covers (phone photo, camera capture, or Google/online cover search) and editing book info', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const targetBook = store.getState().books[0];
    assert.equal(typeof store.updateBook, 'function', 'Expected store.updateBook action');

    // Update book metadata and cover via store.updateBook (supports data:image/... and https://)
    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
    const updated = await store.updateBook(targetBook.id, {
      title: 'Owl Moon (Anniversary Edition)',
      authors: ['Jane Yolen', 'John Schoenherr'],
      format: 'hardcover',
      readingStage: 'picture-book',
      ageMin: 3,
      ageMax: 7,
      pageCount: 36,
      publishedYear: 1987,
      tags: ['winter', 'owls', 'family'],
      coverUrl: sampleDataUrl,
    });

    assert.equal(updated.title, 'Owl Moon (Anniversary Edition)');
    assert.deepEqual(updated.authors, ['Jane Yolen', 'John Schoenherr']);
    assert.equal(updated.pageCount, 36);
    assert.equal(updated.coverUrl, sampleDataUrl);

    // Clicking the book cover in Book Inspector opens Cover Studio (Gallery, Camera, Search Covers)
    const coverStudioHtml = renderBookInspectorModal({
      book: updated,
      activeRotation: null,
      canSwapInActiveRotation: false,
      inspectorUiState: {
        isCoverPickerOpen: true,
        isEditingBook: false,
        coverSearchQuery: 'Owl Moon',
        coverSearchLoading: false,
        coverSearchError: '',
        coverSearchResults: [
          {
            title: 'Owl Moon',
            author: 'Jane Yolen',
            coverUrl: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
            source: 'google-books',
          },
        ],
        editError: '',
      },
    });

    assert.ok(
      coverStudioHtml.includes('data-action="toggle-cover-picker"'),
      'Book cover should be clickable to toggle cover picker'
    );
    assert.ok(
      coverStudioHtml.includes('id="inspector-cover-gallery-input"'),
      'Cover picker must allow selecting a picture from phone gallery'
    );
    assert.match(
      coverStudioHtml,
      /id="inspector-cover-camera-input"[^>]*capture="environment"/,
      'Cover picker must allow taking a picture with phone camera'
    );
    assert.ok(
      coverStudioHtml.includes('data-action="search-book-covers"'),
      'Cover picker must allow searching online book covers'
    );
    assert.ok(
      coverStudioHtml.includes('data-action="select-searched-cover"'),
      'Searched cover thumbnails must be tap-to-apply'
    );

    // Toggling Edit Info renders #edit-book-form pre-populated with book details
    const editInfoHtml = renderBookInspectorModal({
      book: updated,
      activeRotation: null,
      canSwapInActiveRotation: false,
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
    assert.ok(editInfoHtml.includes('id="edit-book-form"'), 'Expected inline edit-book-form');
    assert.ok(editInfoHtml.includes('Owl Moon (Anniversary Edition)'));
  });

  it('4. Normalizes <select> dropdowns to match <input> height (h-12 + appearance: none)', async () => {
    const rootDir = process.cwd();
    const indexCss = await fs.readFile(path.join(rootDir, 'src', 'index.css'), 'utf8');

    assert.match(
      indexCss,
      /appearance:\s*none/i,
      'Global CSS must reset native select appearance so OS chrome does not make dropdowns thinner'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const profileSheetHtml = renderProfileFormSheet({
      state,
      isOpen: true,
      editingProfileId: null,
    });
    assert.match(
      profileSheetHtml,
      /<input[^>]*id="profile-name"[^>]*\bh-12\b/,
      'Profile input should use explicit h-12 height'
    );
    assert.match(
      profileSheetHtml,
      /<select[^>]*id="profile-stage"[^>]*\bh-12\b/,
      'Profile select dropdown should use matching explicit h-12 height'
    );
  });

  it('5. Renders the top profile/brand bar as a floating sticky capsule across mobile and desktop', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const shellHtml = renderAppShell({
      activeRoute: 'home',
      state,
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: '<div>Body</div>',
    });

    // Header must be pinned flush at top-0 across mobile & desktop down to its bottom border, and include brand app icon
    assert.match(
      shellHtml,
      /<header[^>]*class="[^"]*\b(?:fixed|sticky)\s+top-0\b[^"]*\bborder-b\b/,
      'Header should pin flush to top-0 down to its bottom border line'
    );
    assert.ok(
      shellHtml.includes('data-brand-icon="true"'),
      'Header should display the app icon on the left side next to the title'
    );
  });

  it('6. Uses Material Design slide-up & slide-down transitions for bottom-sheet dialogs', async () => {
    const rootDir = process.cwd();
    const indexCss = await fs.readFile(path.join(rootDir, 'src', 'index.css'), 'utf8');
    const mainJs = await fs.readFile(path.join(rootDir, 'src', 'main.js'), 'utf8');

    assert.match(
      indexCss,
      /translateY\(100%\)/,
      'Bottom sheets should glide from/to translateY(100%) like Material Design sheets'
    );
    assert.match(
      indexCss,
      /cubic-bezier\(0\.05,\s*0\.7,\s*0\.1,\s*1(\.0)?\)/,
      'Bottom sheets should use Material Design 3 emphasized decelerate curve'
    );
    assert.match(
      indexCss,
      /\.is-closing/,
      'CSS should define .is-closing exit animation for smooth sheet dismissal'
    );
    assert.match(
      mainJs,
      /closeSheetWithMotion/,
      'main.js should animate bottom sheets closed before unmounting them'
    );
  });
});
