/**
 * @fileoverview Consolidated UI & Components Suite:
 * - Book Inspector modal: 1-5 stars under cover, separate ISBN line, bold ages, green storytime hints,
 *   atomic whitespace-nowrap, auto-computed ✦ indicators, dynamic cover tint, and rotation eligibility switch.
 * - App Shell: Mobile bottom navigation baseline alignment, elevated scan button, perfectly balanced <a> tags.
 * - Settings View: Enabled/Disabled translation keys, searchWhileTyping toggle switch, PWA install guide.
 * - Profile Sheet: Left-aligned birth date input and form styling.
 * - Play View & Activities: Storytime & topic picker with rotation scope selection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderProfileFormSheet } from '../src/ui/components/profile-sheets.js';
import { renderPlayView, createDefaultPlayUiState } from '../src/features/play/play-view.js';
import { resolvePlayBookPool, pickStorytimeBooks } from '../src/features/play/play-activities.js';
import { resolveBookCardTintHex } from '../src/features/catalog/cover-color-extractor.js';
import { getBookUserRating, resolveBookTagOrigin } from '../src/types/models.js';
import { normalizeGoogleBooksItem } from '../src/features/catalog/normalizer.js';
import { SUPPORTED_LANGUAGES, t } from '../src/config/i18n.js';

const DEFAULT_PWA_STATUS = {
  isInstallable: false,
  isInstalled: true,
  isIOS: false,
  isOnline: true,
  swReady: true,
  showIosInstructions: false,
};

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('UI & Components Suite', () => {
  it('Book inspector renders 5 stars under cover, separate ISBN line, bold ages, and green storytime hints', async () => {
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
    assert.ok(starsIndex > coverIndex);

    // ISBN is rendered on its own separated line
    assert.match(html, /ISBN\s+9780545010221/);

    // Ages are rendered darker and bold
    assert.match(html, /<span class="font-bold text-forest-900 dark:text-white">Ages\s+\d+–\d+<\/span>/);

    // Storytime, rich illustration, and read duration are colored green
    assert.match(html, /<span class="text-emerald-700 dark:text-emerald-400 font-medium">Storytime Read-Aloud<\/span>/);

    // Atomic wrapping: each metadata item is wrapped in whitespace-nowrap
    assert.match(html, /class="[^"]*whitespace-nowrap[^"]*"/);

    // Active star (star 3) has data-rating="0" to toggle clear when tapped again
    assert.match(html, /data-rating="0"[\s\S]*?aria-label="Remove rating"/);

    // Auto-computed indicator ✦
    assert.match(html, /<span[^>]*aria-label="Auto-computed age parameter"[^>]*>✦<\/span>/);

    // Responsive container classes
    assert.match(html, /max-w-lg\s+sm:max-w-xl\s+lg:max-w-2xl/);
  });

  it('Book inspector renders rotation eligibility row and honors excludeFromRotations toggle', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const eligibleBook = st.books[0];

    const eligibleHtml = renderBookInspectorModal({
      book: eligibleBook,
      profiles: st.profiles,
      rotations: st.rotations,
    });
    assert.match(eligibleHtml, /data-customize-row="rotations"/);
    assert.match(eligibleHtml, /Included\s*<\/button>/);

    const excludedBook = { ...eligibleBook, excludeFromRotations: true };
    const excludedHtml = renderBookInspectorModal({
      book: excludedBook,
      profiles: st.profiles,
      rotations: st.rotations,
    });
    assert.match(excludedHtml, /Excluded\s*<\/button>/);
    assert.match(excludedHtml, /Excluded from shelf rotations/);
  });

  it('Settings view renders without leaked keys, balances <a> tags, and toggles searchWhileTyping', async () => {
    const store = await createTestStore();
    const st = store.getState();

    const html = renderSettingsView({
      state: st,
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
    });

    // Translation keys resolved
    assert.equal(html.includes('settings.enabled'), false);
    assert.equal(html.includes('settings.disabled'), false);

    // Search while typing switch
    assert.match(html, /data-action="toggle-search-while-typing"/);
    assert.match(html, /Search Quickly While Typing/);

    // Balanced <a> tags
    const openA = (html.match(/<a\b/gi) || []).length;
    const closeA = (html.match(/<\/a>/gi) || []).length;
    assert.equal(openA, closeA);
  });

  it('App shell renders all 5 bottom nav items with shared baseline and balanced markup', async () => {
    const store = await createTestStore();
    const st = store.getState();

    const fullHtml = renderAppShell({
      activeRoute: 'settings',
      state: st,
      toast: null,
      pwaStatus: DEFAULT_PWA_STATUS,
      contentHtml: '<div>Settings Content</div>',
    });

    const openA = (fullHtml.match(/<a\b/gi) || []).length;
    const closeA = (fullHtml.match(/<\/a>/gi) || []).length;
    assert.equal(openA, closeA);

    assert.match(fullHtml, /href="#\/home"/);
    assert.match(fullHtml, /href="#\/library"/);
    assert.match(fullHtml, /href="#\/scan"/);
    assert.match(fullHtml, /href="#\/rotations"/);
    assert.match(fullHtml, /href="#\/play"/);
  });

  it('Profile birth date input is styled correctly with text-left and px-3.5 padding', async () => {
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

  it('Play view and activities support storytime rotation scoping', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const maya = st.profiles[0];
    const activeRot = st.rotations.find((r) => r.profileId === maya.id && r.status === 'active');

    // Drawing from active shelf
    const poolInfo = resolvePlayBookPool({
      books: st.books,
      activeRotation: activeRot,
      activeProfile: maya,
      rotations: st.rotations,
      scope: 'active-shelf',
    });
    assert.equal(poolInfo.pool.length, activeRot?.bookIds.length);

    // Picking 2 bedtime books
    const outcome = pickStorytimeBooks({
      books: st.books,
      activeRotation: activeRot,
      activeProfile: maya,
      count: 2,
    });
    assert.equal(outcome.selectedBooks.length, 2);

    // Renders play view preview cards
    const playHtml = renderPlayView({
      state: st,
      playUiState: createDefaultPlayUiState(),
    });
    assert.match(playHtml, /data-action="open-play-app"/);
    assert.match(playHtml, /data-play-app-id="storytime-picker"/);
  });

  it('Per-reader star ratings isolate each reader profile while preserving legacy fallback', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const p1 = st.profiles[0];
    const p2 = st.profiles[1];
    assert.ok(p1 && p2 && p1.id !== p2.id);
    const book = st.books[0];

    // Legacy single-user rating falls back cleanly when userRatings is absent
    assert.equal(getBookUserRating({ userRating: 4 }, p1.id), 4);
    assert.equal(getBookUserRating({ userRating: 4 }, p2.id), 4);

    // Setting p1 rating stores per-profile rating and avoids leaking to p2
    await store.setUserRating(book.id, 5, p1.id);
    let updated = store.getState().books.find((b) => b.id === book.id);
    assert.equal(getBookUserRating(updated, p1.id), 5);
    assert.equal(getBookUserRating(updated, p2.id), 0);

    // Setting p2 rating keeps p1 intact
    await store.setUserRating(book.id, 2, p2.id);
    updated = store.getState().books.find((b) => b.id === book.id);
    assert.equal(getBookUserRating(updated, p1.id), 5);
    assert.equal(getBookUserRating(updated, p2.id), 2);

    // Clearing p1 rating returns 0 for p1 without reverting to legacy rating
    await store.setUserRating(book.id, 0, p1.id);
    updated = store.getState().books.find((b) => b.id === book.id);
    assert.equal(getBookUserRating(updated, p1.id), 0);
    assert.equal(getBookUserRating(updated, p2.id), 2);
  });

  it('Tag provenance distinguishes provider, ai, rules, and manual origins', async () => {
    const candidate = normalizeGoogleBooksItem({
      id: 'vol_123',
      volumeInfo: {
        title: 'Moonlight Bedtime Train',
        authors: ['Jane Doe'],
        categories: ['Animals'],
        description: 'A cozy bedtime train journey under the stars.',
        industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780545010221' }],
      },
    });
    assert.ok(candidate);
    assert.equal(candidate.tagOrigins?.animals, 'provider');
    assert.equal(candidate.tagOrigins?.bedtime, 'rules');

    const store = await createTestStore();
    const book = store.getState().books[0];

    await store.addBookTag(book.id, 'family-favorite');
    let updated = store.getState().books.find((b) => b.id === book.id);
    assert.equal(resolveBookTagOrigin(updated, 'family-favorite'), 'manual');

    await store.applyLlmTagsToBook(book.id, {
      tags: [...(updated?.tags || []), 'lift-the-flap'],
    });
    updated = store.getState().books.find((b) => b.id === book.id);
    assert.equal(resolveBookTagOrigin(updated, 'family-favorite'), 'manual');
    assert.equal(resolveBookTagOrigin(updated, 'lift-the-flap'), 'ai');

    await store.enrichSingleBook(book.id);
    updated = store.getState().books.find((b) => b.id === book.id);
    assert.equal(resolveBookTagOrigin(updated, 'family-favorite'), 'manual');
    assert.equal(resolveBookTagOrigin(updated, 'lift-the-flap'), 'ai');
  });

  it('Settings Force Refresh i18n keys resolve in en, es, and it', () => {
    for (const lang of ['en', 'es', 'it']) {
      const btn = t(lang, 'settings.forceRefreshBtn');
      const hint = t(lang, 'settings.forceRefreshHint');
      assert.ok(btn && btn !== 'settings.forceRefreshBtn');
      assert.ok(hint && hint !== 'settings.forceRefreshHint');
    }
  });

  it('Settings Hub groups, rows, switches, and language flags resolve cleanly in en, es, and it', () => {
    assert.equal(SUPPORTED_LANGUAGES.length, 3);
    for (const entry of SUPPORTED_LANGUAGES) {
      assert.ok(entry.flag && entry.flag.length > 0, `Expected flag for ${entry.code}`);
      assert.ok(entry.nativeLabel);
    }

    const keys = [
      'common.on',
      'common.off',
      'settings.groupHousehold',
      'settings.groupLibraryAi',
      'settings.groupDataDevice',
      'settings.groupUpdatesGuides',
      'settings.groupLegal',
      'settings.groupOther',
      'settings.rowLanguageTitle',
      'settings.rowShelfRulesTitle',
      'settings.rowCatalogTitle',
      'settings.rowAiTitle',
      'settings.rowOfflineStorageTitle',
      'settings.rowBackupTitle',
      'settings.rowWhatsNewTitle',
      'settings.rowGuidesTitle',
      'settings.rowPrivacyTitle',
      'settings.rowTermsTitle',
      'settings.rowImpressumTitle',
      'settings.rowRateAppTitle',
      'settings.rowSendFeedbackTitle',
      'settings.rowDonateTitle',
      'settings.resetSeedConfirmTitle',
      'settings.resetSeedConfirmAction',
    ];

    for (const lang of ['en', 'es', 'it']) {
      for (const key of keys) {
        const val = t(lang, key);
        assert.ok(val && val !== key, `Missing ${lang} translation for ${key}`);
      }
    }
  });
});
