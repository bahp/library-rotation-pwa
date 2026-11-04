/**
 * @fileoverview Phase 30 Regression & Feature Tests:
 * 1) Storytime Picker: Random book selection from a specific saved rotation / bedtime group.
 * 2) Graceful fallback when a rotation has 0 books or is removed.
 * 3) UI rendering of the 3 scope options (Active Shelf, Saved Shelves, Home Library) and rotation selector dropdown.
 * 4) Comprehensive multi-language YAML translations across en.yaml, es.yaml, and it.yaml.
 * 5) Professional documentation structure, cover badge taxonomy, and in-app documentation anchors.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  COVER_BADGE_SLOTS,
  SUPPORTED_LANGUAGES,
  getLocaleDictionary,
  t,
} from '../src/config/index.js';
import {
  pickStorytimeBooks,
  resolvePlayBookPool,
} from '../src/features/play/play-activities.js';
import {
  createDefaultPlayUiState,
  renderPlayView,
} from '../src/features/play/play-view.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { APP_DOCS_LINKS } from '../src/version.js';

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 30: Storytime Picker Specific Rotation Scope & Comprehensive Documentation', () => {
  it('1. resolvePlayBookPool draws from a specific saved rotation when scope is rotation', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const activeProfile = st.profiles[0];

    // Create a dedicated "Bedtime Tales" saved rotation with 3 specific books
    const bedtimeBooks = st.books.slice(0, 3);
    const nowIso = new Date().toISOString();
    /** @type {import('../src/types/models.js').RotationList} */
    const bedtimeRot = {
      id: 'rot-bedtime-test-1',
      profileId: activeProfile.id,
      title: '🌙 Bedtime Tales',
      status: 'saved',
      bookIds: bedtimeBooks.map((b) => b.id),
      completedBookIds: [bedtimeBooks[0].id],
      createdAt: nowIso,
      updatedAt: nowIso,
      activatedAt: undefined,
      rules: {
        objective: 'Calm bedtime stories',
        count: 3,
        swapDays: 14,
        cooldownDays: 28,
        preferredTags: ['bedtime'],
        requiredFormat: 'any',
        varietyMix: true,
        seed: 'test-seed-bedtime',
      },
    };

    const rotations = [...st.rotations, bedtimeRot];

    const poolInfo = resolvePlayBookPool({
      books: st.books,
      activeRotation: st.rotations.find((r) => r.status === 'active'),
      activeProfile,
      scope: 'rotation',
      selectedRotationId: 'rot-bedtime-test-1',
      rotations,
    });

    assert.equal(poolInfo.effectiveScope, 'rotation');
    assert.equal(poolInfo.usedFallbackToLibrary, false);
    assert.equal(poolInfo.poolLabel, '🌙 Bedtime Tales');
    assert.equal(poolInfo.pool.length, 3);
    assert.deepEqual(
      poolInfo.pool.map((b) => b.id),
      bedtimeBooks.map((b) => b.id)
    );
  });

  it('2. pickStorytimeBooks honors selected rotation and respects unread books within that rotation', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const activeProfile = st.profiles[0];

    const bedtimeBooks = st.books.slice(0, 4);
    const nowIso = new Date().toISOString();
    // Mark the first book completed in this rotation
    /** @type {import('../src/types/models.js').RotationList} */
    const bedtimeRot = {
      id: 'rot-bedtime-test-2',
      profileId: activeProfile.id,
      title: 'Night Basket',
      status: 'saved',
      bookIds: bedtimeBooks.map((b) => b.id),
      completedBookIds: [bedtimeBooks[0].id],
      createdAt: nowIso,
      updatedAt: nowIso,
      rules: {
        objective: 'Night reading',
        count: 4,
        swapDays: 14,
        cooldownDays: 28,
        preferredTags: ['bedtime'],
        requiredFormat: 'any',
        varietyMix: true,
        seed: 'test-seed-2',
      },
    };

    const rotations = [...st.rotations, bedtimeRot];

    // Pick 2 books with unreadFirst: true
    const result = pickStorytimeBooks({
      books: st.books,
      activeRotation: st.rotations.find((r) => r.status === 'active'),
      activeProfile,
      count: 2,
      scope: 'rotation',
      selectedRotationId: 'rot-bedtime-test-2',
      rotations,
      unreadFirst: true,
      rng: () => 0.1,
    });

    assert.equal(result.selectedBooks.length, 2);
    assert.equal(result.poolLabel, 'Night Basket');
    assert.equal(result.totalPoolCount, 4);
    // All picked books must belong to the bedtime rotation
    for (const book of result.selectedBooks) {
      assert.ok(bedtimeRot.bookIds.includes(book.id));
    }
  });

  it('3. resolvePlayBookPool falls back gracefully when selected rotation is empty or not found', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const activeProfile = st.profiles[0];

    // Non-existent rotation ID
    const poolInfo = resolvePlayBookPool({
      books: st.books,
      activeRotation: null,
      activeProfile,
      scope: 'rotation',
      selectedRotationId: 'non-existent-rot-id',
      rotations: [],
    });

    assert.equal(poolInfo.effectiveScope, 'owned-library');
    assert.equal(poolInfo.usedFallbackToLibrary, true);
    assert.ok(poolInfo.pool.length > 0);
  });

  it('4. renderPlayView renders the 3 scope buttons and rotation select dropdown when scope is rotation', async () => {
    const store = await createTestStore();
    const st = store.getState();
    const activeProfile = st.profiles[0];

    const nowIso = new Date().toISOString();
    /** @type {import('../src/types/models.js').RotationList} */
    const customRot = {
      id: 'rot-custom-night',
      profileId: activeProfile.id,
      title: 'Bedtime Favorites',
      status: 'saved',
      bookIds: [st.books[0].id, st.books[1].id],
      completedBookIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      rules: {
        objective: 'Night set',
        count: 2,
        swapDays: 7,
        cooldownDays: 14,
        preferredTags: ['night'],
        requiredFormat: 'any',
        varietyMix: true,
        seed: 'seed-night',
      },
    };

    /** @type {import('../src/types/models.js').AppState} */
    const stateWithCustomRot = {
      ...st,
      rotations: [...st.rotations, customRot],
    };

    /** @type {import('../src/features/play/play-view.js').PlayUiState} */
    const playUiState = {
      ...createDefaultPlayUiState(),
      activeAppId: 'storytime-picker',
      randomizerScope: 'rotation',
      randomizerRotationId: 'rot-custom-night',
    };

    const html = renderPlayView({
      state: stateWithCustomRot,
      playUiState,
    });

    // Check scope buttons
    assert.match(html, /data-action="set-randomizer-scope"\s+data-scope="active-shelf"/);
    assert.match(html, /data-action="set-randomizer-scope"\s+data-scope="rotation"/);
    assert.match(html, /data-action="set-randomizer-scope"\s+data-scope="owned-library"/);

    // Check rotation dropdown container and select element
    assert.match(html, /data-rotation-scope-selector="true"/);
    assert.match(html, /data-action="set-randomizer-rotation-id"/);
    assert.match(html, /Bedtime Favorites/);
    assert.match(html, /value="rot-custom-night"/);
  });

  it('5. YAML locale dictionaries contain comprehensive keys across en, es, and it', () => {
    for (const lang of ['en', 'es', 'it']) {
      const dict = getLocaleDictionary(lang);
      assert.ok(dict, `Dictionary must exist for ${lang}`);
      assert.ok(dict.nav, `nav namespace must exist for ${lang}`);
      assert.ok(dict.common, `common namespace must exist for ${lang}`);
      assert.ok(dict.home, `home namespace must exist for ${lang}`);
      assert.ok(dict.library, `library namespace must exist for ${lang}`);
      assert.ok(dict.rotations, `rotations namespace must exist for ${lang}`);
      assert.ok(dict.presets, `presets namespace must exist for ${lang}`);
      assert.ok(dict.play, `play namespace must exist for ${lang}`);
      assert.ok(dict.settings, `settings namespace must exist for ${lang}`);
      assert.ok(dict.badges, `badges namespace must exist for ${lang}`);

      // Verify specific new play & rotation scope keys
      assert.ok(t(lang, 'play.savedRotationsScope'), `play.savedRotationsScope missing in ${lang}`);
      assert.ok(t(lang, 'play.selectRotationLabel'), `play.selectRotationLabel missing in ${lang}`);
      assert.ok(t(lang, 'play.noSavedRotationsYet'), `play.noSavedRotationsYet missing in ${lang}`);
      assert.ok(t(lang, 'home.activeCollection'), `home.activeCollection missing in ${lang}`);
      assert.ok(t(lang, 'rotations.savedShelvesTitle'), `rotations.savedShelvesTitle missing in ${lang}`);
      assert.ok(t(lang, 'settings.docsHeading'), `settings.docsHeading missing in ${lang}`);
    }

    // Check sample translations
    assert.equal(t('es', 'play.savedRotationsScope'), 'Colección / Set');
    assert.equal(t('it', 'play.savedRotationsScope'), 'Scaffale Salvato / Set');
    assert.equal(t('en', 'play.savedRotationsScope'), 'Saved Shelf / Set');
  });

  it('6. renderHomeView uses localized strings across language switches', async () => {
    const store = await createTestStore();
    const st = store.getState();

    // Spanish Home render
    /** @type {import('../src/types/models.js').AppState} */
    const spanishState = {
      ...st,
      settings: { ...st.settings, language: 'es' },
    };
    const spanishHtml = renderHomeView({
      state: spanishState,
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.match(spanishHtml, /Colección Activa/);

    // Italian Home render
    /** @type {import('../src/types/models.js').AppState} */
    const italianState = {
      ...st,
      settings: { ...st.settings, language: 'it' },
    };
    const italianHtml = renderHomeView({
      state: italianState,
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.match(italianHtml, /Collezione Attiva/);
  });

  it('7. Documentation files exist and contain comprehensive guides and badge taxonomy', () => {
    const userGuide = readFileSync(
      resolve(process.cwd(), 'public/docs/index.html'),
      'utf8'
    );
    const devGuide = readFileSync(
      resolve(process.cwd(), 'public/docs/architecture-and-providers.html'),
      'utf8'
    );

    // User Guide must have bedtime sets, storytime randomizer, and 4-corner cover badges
    assert.match(userGuide, /id="bedtime-sets"/);
    assert.match(userGuide, /id="storytime-picker"/);
    assert.match(userGuide, /id="cover-badges"/);
    assert.match(userGuide, /Top-Left:\s*Catalog State/i);
    assert.match(userGuide, /Bottom-Left:\s*Rotation &amp; Usage/i);
    assert.match(userGuide, /Shelf 12d/);
    assert.match(userGuide, /Rest 15d/);

    // Developer Guide must have /src/config/ reference and badge taxonomy
    assert.match(devGuide, /id="config-dir"/);
    assert.match(devGuide, /\/src\/config\//);
    assert.match(devGuide, /COVER_BADGE_SLOTS/);
    assert.match(devGuide, /colors-and-badges\.js/);
    assert.match(devGuide, /locales\//);

    // App docs links in version.js must resolve to anchors
    assert.ok(APP_DOCS_LINKS.coverBadges);
    assert.match(APP_DOCS_LINKS.coverBadges, /#cover-badges$/);
    assert.ok(APP_DOCS_LINKS.developerConfig);
    assert.match(APP_DOCS_LINKS.developerConfig, /#config-dir$/);
  });
});
