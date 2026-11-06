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

  it('7. Book inspector positions 5-star user rating below ISBN tag and includes responsive container sizing', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const book = { ...st.books[0], isbn13: '9780545010221', userRating: 3 };

    const html = renderBookInspectorModal({
      book,
      profiles: st.profiles,
      rotations: st.rotations,
    });

    const isbnIndex = html.indexOf('ISBN 9780545010221');
    const ratingIndex = html.indexOf('data-action="set-book-user-rating"');

    assert.ok(isbnIndex > 0, 'ISBN tag must be rendered');
    assert.ok(ratingIndex > 0, 'User rating widget must be rendered');
    assert.ok(ratingIndex > isbnIndex, 'User rating widget must appear AFTER the ISBN tag in DOM order');

    // Dialog has responsive container classes for mobile vertical and computer screens
    assert.match(html, /max-w-lg\s+sm:max-w-xl\s+lg:max-w-2xl/);
  });
});

