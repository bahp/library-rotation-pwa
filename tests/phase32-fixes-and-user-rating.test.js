/**
 * @fileoverview Phase 32 Regression & Feature Tests:
 * 1) Settings enabled/disabled translation keys correctly resolved (`common.enabled` / `common.disabled`).
 * 2) Profile birth date input styled correctly with left alignment and uniform padding.
 * 3) Store supports setting and updating user rating (1-5 stars) on books.
 * 4) Catalog normalizer preserves Google Books API metadata (language, dimensions, averageRating, ratingsCount, publisher, previewLink).
 * 5) Book inspector modal renders 1-5 star user rating interactive widget.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderProfileFormSheet } from '../src/ui/components/profile-sheets.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { normalizeGoogleBooksItem } from '../src/features/catalog/normalizer.js';

async function createTestStore() {
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

describe('Phase 32 — Bug Fixes & User Rating Verification', () => {
  it('1. Settings view renders Enabled/Disabled correctly without literal settings.enabled leaks', async () => {
    const store = await createTestStore();
    const st = store.getState();

    const html = renderSettingsView({
      state: st,
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
    });

    assert.equal(html.includes('settings.enabled'), false);
    assert.equal(html.includes('settings.disabled'), false);
    assert.match(html, /Enabled|Disabled/);
  });

  it('2. Profile birth date input is styled correctly with text-left and px-3.5 padding', async () => {
    const store = await createTestStore();
    const st = store.getState();

    const html = renderProfileFormSheet({
      state: st,
      isOpen: true,
      editingProfileId: null,
    });

    assert.match(html, /id="profile-birth-date"[\s\S]*?class="[^"]*text-left[^"]*"/);
    assert.match(html, /id="profile-birth-date"[\s\S]*?class="[^"]*px-3\.5[^"]*"/);
  });

  it('3. Store supports setting and updating 1-5 star user ratings on books', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = st.books[0];

    assert.equal(book.userRating, undefined);

    const updated = await store.setUserRating(book.id, 5);
    assert.equal(updated?.userRating, 5);

    const cleared = await store.setUserRating(book.id, 0);
    assert.equal(cleared?.userRating, undefined);
  });

  it('4. Catalog normalizer extracts language, dimensions, ratings, and publisher from Google Books items', () => {
    const mockItem = {
      id: 'vol_123',
      volumeInfo: {
        title: 'El Monstruo de Colores',
        authors: ['Anna Llenas'],
        language: 'es',
        dimensions: { height: '22 cm', width: '22 cm' },
        averageRating: 4.8,
        ratingsCount: 350,
        publisher: 'Fondo de Cultura Economica',
        previewLink: 'http://books.google.com/preview?id=123',
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9788493883325' }],
      },
    };

    const candidate = normalizeGoogleBooksItem(mockItem);
    assert.ok(candidate);
    assert.equal(candidate.language, 'spanish');
    assert.deepEqual(candidate.dimensions, { height: '22 cm', width: '22 cm' });
    assert.equal(candidate.averageRating, 4.8);
    assert.equal(candidate.ratingsCount, 350);
    assert.equal(candidate.publisher, 'Fondo de Cultura Economica');
    assert.equal(candidate.previewLink, 'http://books.google.com/preview?id=123');
  });

  it('5. Book inspector modal renders 1-5 star user rating interactive widget', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = { ...st.books[0], userRating: 4 };

    const html = renderBookInspectorModal({
      book,
      profiles: st.profiles,
      rotations: st.rotations,
    });

    assert.match(html, /data-action="set-book-user-rating"/);
    assert.match(html, /data-rating="5"/);
    assert.match(html, /svg/);
  });

  it('6. Settings view has perfectly balanced <a> tags and never corrupts the mobile bottom navigation bar', async () => {
    const store = await createTestStore();
    const st = store.getState();

    const contentHtml = renderSettingsView({
      state: st,
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
      adapterDiagnostics: [],
    });

    // Verify all <a> tags inside Settings view are closed
    const openA = (contentHtml.match(/<a\b/gi) || []).length;
    const closeA = (contentHtml.match(/<\/a>/gi) || []).length;
    assert.equal(openA, closeA, 'All <a> tags in settings view must be properly closed');

    // Verify full app shell on settings route preserves bottom navigation structure
    const fullHtml = renderAppShell({
      activeRoute: 'settings',
      state: st,
      toast: null,
      pwaStatus: DEFAULT_PWA_STATUS,
      contentHtml,
    });

    const fullOpenA = (fullHtml.match(/<a\b/gi) || []).length;
    const fullCloseA = (fullHtml.match(/<\/a>/gi) || []).length;
    assert.equal(fullOpenA, fullCloseA, 'Full app shell on settings route must have balanced <a> tags');

    // Bottom navigation container must contain all 5 nav links cleanly
    assert.match(fullHtml, /<nav[^>]*aria-label="Mobile bottom navigation"/);
    assert.match(fullHtml, /href="#\/home"/);
    assert.match(fullHtml, /href="#\/library"/);
    assert.match(fullHtml, /href="#\/scan"/);
    assert.match(fullHtml, /href="#\/rotations"/);
    assert.match(fullHtml, /href="#\/play"/);
  });

  it('7. Book inspector renders 5 stars under cover, separate ISBN line, bold ages, and green storytime hints', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = {
      ...st.books[0],
      isbn13: '9780545010221',
      userRating: 3,
      readingLevelHint: 'Storytime Read-Aloud · Rich illustrations · ~5–7 min',
    };

    const html = renderBookInspectorModal({
      book,
      profiles: st.profiles,
      rotations: st.rotations,
    });

    // 5 stars are positioned directly underneath the cover image
    assert.match(html, /data-inspector-cover-stars="true"/);
    const coverIndex = html.indexOf('data-action="toggle-cover-picker"');
    const starsIndex = html.indexOf('data-inspector-cover-stars="true"');
    assert.ok(starsIndex > coverIndex, '5 stars must be rendered in the cover column under the cover');

    // ISBN is rendered on its own separated line with uniform text color
    assert.match(
      html,
      /<div[^>]*font-mono-tabular[^>]*>[\s\S]*?<span>ISBN\s+9780545010221<\/span>[\s\S]*?<\/div>/
    );

    // Ages are rendered darker and bold
    assert.match(
      html,
      /<span class="font-bold text-forest-900 dark:text-white">Ages\s+\d+–\d+<\/span>/
    );

    // Storytime, rich illustration, and read duration are colored green
    assert.match(
      html,
      /<span class="text-emerald-700 dark:text-emerald-400 font-medium">Storytime Read-Aloud<\/span>/
    );
    assert.match(
      html,
      /<span class="text-emerald-700 dark:text-emerald-400 font-medium">Rich illustrations<\/span>/
    );
    assert.match(
      html,
      /<span class="text-emerald-700 dark:text-emerald-400 font-medium">~5–7 min<\/span>/
    );

    // Atomic wrapping: each metadata item is wrapped in whitespace-nowrap so multi-word items never break internally
    assert.match(html, /class="[^"]*whitespace-nowrap[^"]*"/);

    // Option A: Active star (star 3) has data-rating="0" to toggle clear when tapped again
    assert.match(html, /data-rating="0"[\s\S]*?aria-label="Remove rating"/);

    // No clutter text underneath stars (no "Clear" text button, no "4/5" or "Rate book")
    assert.equal(html.includes('Clear</button>'), false);

    // No artificial dividing line separating metadata from stars
    assert.equal(html.includes('border-t border-linen-200/70 dark:border-night-800/80'), false);

    // Dialog has responsive container classes for mobile vertical and computer screens
    assert.match(html, /max-w-lg\s+sm:max-w-xl\s+lg:max-w-2xl/);
  });

  it('8. searchWhileTyping setting defaults to off (false), persists across updates, and renders in Settings', async () => {
    const store = await createTestStore();
    const st = store.getState();

    // Default must be false so typing in search does not spam network requests before clicking Find
    assert.equal(st.settings.searchWhileTyping, false);

    // Toggle setting on
    await store.updateSettings({ searchWhileTyping: true });
    assert.equal(store.getState().settings.searchWhileTyping, true);

    // Renders switch in Settings view with localized title and switch role
    const html = renderSettingsView({
      state: store.getState(),
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
    });

    assert.match(html, /data-action="toggle-search-while-typing"/);
    assert.match(html, /role="switch"[\s\S]*?aria-checked="true"/);
    assert.match(html, /Search Quickly While Typing/);
  });

  it('9. Metadata lines have reduced vertical spacing (space-y-0.5 leading-snug) and profile birth date container does not clip outline', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = { ...st.books[0], isbn13: '9780545010221', readingLevelHint: 'Storytime Read-Aloud · ~5–7 min' };

    const modalHtml = renderBookInspectorModal({
      book,
      profiles: st.profiles,
      rotations: st.rotations,
    });

    // Space between the 3 lines is reduced to space-y-0.5 leading-snug
    assert.match(modalHtml, /leading-snug[^"]*space-y-0\.5|space-y-0\.5[^"]*leading-snug/);

    // Profile form birth date input wrapper does NOT have overflow-hidden
    const profileHtml = renderProfileFormSheet({
      state: st,
      isOpen: true,
      editingProfileId: null,
    });
    // Ensure the wrapper for profile-birth-date does not restrict focus outline with overflow-hidden
    assert.equal(profileHtml.includes('<div class="min-w-0 overflow-hidden">'), false);
  });

  it('10. Allows books to be excluded from rotations via excludeFromRotations flag and toggleBookRotationEligibility', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = st.books[0];

    // Starts eligible
    assert.equal(book.excludeFromRotations, undefined);

    // Toggle to exclude
    const excluded = await store.toggleBookRotationEligibility(book.id);
    assert.equal(excluded?.excludeFromRotations, true);

    // Inspection modal renders Rotations row with Excluded status and switch button
    const htmlExcluded = renderBookInspectorModal({
      book: excluded,
      profiles: st.profiles,
      rotations: st.rotations,
    });
    assert.match(htmlExcluded, /data-customize-row="rotations"/);
    assert.match(htmlExcluded, /data-action="toggle-book-rotation-eligibility"/);
    assert.match(htmlExcluded, /Excluded\s*<\/button>/);
    assert.match(htmlExcluded, /Excluded from shelf rotations/);

    // For off-shelf books, quick shelf bar informs that it is excluded from auto-rotations
    const offShelfBook = st.books.find((b) => !st.rotations.some((r) => r.bookIds.includes(b.id)));
    if (offShelfBook) {
      const offExcluded = { ...offShelfBook, excludeFromRotations: true };
      const offHtml = renderBookInspectorModal({
        book: offExcluded,
        profiles: st.profiles,
        rotations: st.rotations,
      });
      assert.match(offHtml, /Excluded from auto-rotations/);
    }

    // Toggle back to include
    const included = await store.toggleBookRotationEligibility(book.id);
    assert.equal(included?.excludeFromRotations, undefined);

    const htmlIncluded = renderBookInspectorModal({
      book: included,
      profiles: st.profiles,
      rotations: st.rotations,
    });
    assert.match(htmlIncluded, /Included\s*<\/button>/);
    assert.match(htmlIncluded, /Eligible for shelf rotations/);
  });

  it('11. Auto-computed parameters indicator ✦ is rendered for estimated age and storytime line', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = st.books[0];

    const html = renderBookInspectorModal({
      book,
      profiles: st.profiles,
      rotations: st.rotations,
    });

    // Contains ✦ indicator on the Age span with descriptive title/aria-label
    assert.match(html, /<span[^>]*aria-label="Auto-computed age parameter"[^>]*>✦<\/span>/);

    // Contains ✦ indicator on the storytime read-aloud line with descriptive title/aria-label
    assert.match(html, /<span[^>]*aria-label="Auto-computed pacing and duration"[^>]*>✦<\/span>/);
  });
});

