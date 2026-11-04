/**
 * @fileoverview Phase 29 Regression & Feature Tests:
 * 1) Profile DOB (`#profile-birth-date`) mobile overflow fix (`min-w-0 max-w-full appearance-none` + CSS rules).
 * 2) Inline `×` clear button (`data-action="clear-input"`) across text/search/URL inputs.
 * 3) Removal of 15-book cap per rotation across Profile, Rotation Engine, Store, Presets, and UI inputs.
 * 4) Games / Storytime Picker (`#/play`) `− N books +` stepper alongside scope + unmistakable `Unread first` button.
 * 5) Create Rotation sheet preset callout (`data-preset-sheet-callout="true"`) full-width prompt + right-aligned link below.
 * 6 & 7) 4-slot cover overlay badge taxonomy (`catalog-state`, `affection`, `rotation-state`, `owners`),
 *        explicit `Rest Xd` / `Shelf Xd` prefixes, and removal of bare off-shelf `26d` cover clutter.
 * 8) Rotation deletion data lifecycle (`store.deleteRotation` rolls back deleted shelf's `rotationHistory` /
 *    `lastRotatedAt` / `rotationCount` while preserving `readHistoryBookIds` and `lastReadAt`, plus `updateBook` history preservation).
 * 9) Centralized `/src/config/` folder + YAML multi-language (`en`, `es`, `it`) support.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  NUMERIC_BOUNDS,
  COVER_BADGE_SLOTS,
  DEFAULT_ROTATION_PRESETS,
  PLAY_APPS_CONFIG,
  SUPPORTED_LANGUAGES,
  getLocaleDictionary,
  t,
} from '../src/config/index.js';
import { renderInputClearButton } from '../src/ui/components/clearable-input.js';
import { renderProfileFormSheet } from '../src/ui/components/profile-sheets.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { createScannerController } from '../src/features/scan/scanner-controller.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { generateRotationSelection } from '../src/features/rotations/rotation-engine.js';
import {
  createDefaultPresetsUiState,
  renderPresetsView,
} from '../src/features/rotations/presets-view.js';
import { normalizeRotationPresetInput } from '../src/features/rotations/rotation-presets.js';
import {
  computeBookUsageSummary,
  renderBookCoverUsageAdorno,
} from '../src/features/rotations/usage-insights.js';
import {
  createDefaultPlayUiState,
  renderPlayView,
} from '../src/features/play/play-view.js';
import { pickStorytimeBooks } from '../src/features/play/play-activities.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 29 — Mobile DOB Fit, Clearable Inputs & Unlimited Rotation Size', () => {
  it('1. Constrains #profile-birth-date width on narrow mobile viewports in both markup and CSS', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const profile = state.profiles[0];

    const sheetHtml = renderProfileFormSheet({
      state,
      isOpen: true,
      editingProfileId: profile.id,
    });

    const dobInputMatch = sheetHtml.match(/<input[^>]*id="profile-birth-date"[^>]*>/);
    assert.ok(dobInputMatch, 'Expected #profile-birth-date input in profile sheet');
    assert.match(dobInputMatch[0], /w-full/);
    assert.match(dobInputMatch[0], /max-w-full/);
    assert.match(dobInputMatch[0], /min-w-0/);
    assert.match(dobInputMatch[0], /appearance-none/);

    const cssText = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    assert.match(cssText, /input\[type=['"]date['"]\]/);
    assert.match(cssText, /max-width:\s*100%/);
  });

  it('2. Renders inline × clear buttons (`data-action="clear-input"`) across search, scan, manual, rotation, preset, play, profile, and settings inputs', async () => {
    const emptyBtn = renderInputClearButton({
      targetId: 'demo-input',
      value: '',
      label: 'Clear demo',
    });
    assert.match(emptyBtn, /data-action="clear-input"/);
    assert.match(emptyBtn, /data-target-input="demo-input"/);
    assert.match(emptyBtn, /class="hidden\b/);

    const filledBtn = renderInputClearButton({
      targetId: 'demo-input',
      value: 'dinosaurs',
      label: 'Clear demo',
    });
    assert.match(filledBtn, /class="flex\b/);
    assert.doesNotMatch(filledBtn, /class="hidden\b/);

    const store = await createTestStore();
    const state = store.getState();

    const libHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: 'moon',
        inspectedBookId: state.books[0].id,
        inspectorUi: {
          isCoverPickerOpen: true,
          isEditingBook: false,
          coverSearchQuery: 'Goodnight Moon',
          coverSearchLoading: false,
          coverSearchError: '',
          coverSearchResults: [],
          editError: '',
        },
      },
    });
    assert.match(libHtml, /data-target-input="catalog-search-input"[\s\S]*?\bflex\b/);
    assert.match(libHtml, /data-target-input="inspector-cover-search-input"/);

    const scanner = createScannerController();
    const scanSearchHtml = renderScanShellView({
      state,
      uiState: {
        intakeTab: 'search',
        scanMode: 'barcode',
        isbnInput: '9780064430173',
        isbnLoading: false,
        isbnError: '',
        isbnNotFound: '',
        isbnCandidate: null,
        isbnProviderWarnings: [],
        lastScanLockBanner: '',
        titleQuery: 'Moon',
        authorQuery: 'Brown',
        searchLoading: false,
        searchError: '',
        searchCandidates: [],
        searchProviderWarnings: [],
        searchHasRun: false,
        activeCandidate: null,
        isFoundSheetOpen: false,
        manualDraft: {
          title: 'Draft Book',
          authors: '',
          isbn: '',
          publishedYear: '',
          pageCount: '',
          coverUrl: '',
          format: 'hardcover',
          readingStage: 'picture-book',
          ageMin: 2,
          ageMax: 5,
          tags: '',
          condition: 'good',
          customOwners: '',
        },
        intakeTargetStatus: 'owned',
        intakeCondition: 'good',
        intakeLoved: false,
        intakeOwners: ['shared'],
        formError: '',
      },
      scannerState: scanner.getState(),
    });
    assert.match(scanSearchHtml, /data-target-input="provider-title-input"/);
    assert.match(scanSearchHtml, /data-target-input="provider-author-input"/);

    const presetsHtml = renderPresetsView({
      state,
      presetsUiState: {
        ...createDefaultPresetsUiState(),
        searchQuery: 'winter',
        isFormOpen: true,
      },
    });
    assert.match(presetsHtml, /data-target-input="presets-search-input"/);
    assert.match(presetsHtml, /data-target-input="preset-title"/);
  });

  it('3. Removes the 15-book cap per rotation across Profile, Rotation Engine, Store, Presets, and number inputs', async () => {
    const store = await createTestStore();
    const state0 = store.getState();
    const activeProfile = state0.profiles[0];

    // Add 25 extra rotatable books so we have > 30 owned books in the library
    for (let i = 1; i <= 25; i += 1) {
      await store.addManualBook({
        title: `Volume ${i} of the Big Shelf`,
        authors: [`Author ${i}`],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 2,
        ageMax: 6,
        tags: [`topic-${i % 5}`, 'bedtime'],
        collectionStatus: 'owned',
        condition: 'good',
      });
    }

    await store.updateProfile(activeProfile.id, { defaultRotationSize: 28 });
    assert.equal(
      store.getState().profiles.find((p) => p.id === activeProfile.id)?.defaultRotationSize,
      28,
      'Profile defaultRotationSize must allow values > 15 without clamping'
    );

    const engineSelection = generateRotationSelection({
      books: store.getState().books,
      profile: store.getState().profiles[0],
      rules: {
        count: 25,
        objective: '',
        cooldownDays: 0,
        requiredFormat: 'any',
        preferredTags: [],
        varietyMix: true,
        seed: 'unlimited-check',
      },
    });
    assert.equal(
      engineSelection.selectedBooks.length,
      25,
      'Rotation engine must select all 25 requested books without clamping at 15 or 20'
    );

    const createdRot = await store.generateRotation({
      title: 'Classroom Mega Shelf',
      count: 24,
      cooldownDays: 0,
      seed: 'mega-shelf-24',
    });
    assert.equal(createdRot.rules.count, 24);
    assert.equal(createdRot.bookIds.length, 24);

    await store.updateRotationDetails(createdRot.id, { count: 32 });
    const updatedRot = store.getState().rotations.find((r) => r.id === createdRot.id);
    assert.equal(updatedRot?.rules.count, 32);

    const normalizedPreset = normalizeRotationPresetInput({
      title: 'Summer Reading Marathon',
      description: 'Sunny ocean adventures and long summer afternoons.',
      category: 'seasonal-holidays',
      count: 30,
      preferredTags: ['summer'],
    });
    assert.equal(normalizedPreset.count, 30);

    // Verify no `max="15"` remains in Profile, Rotation, or Preset count inputs
    const profileSheetHtml = renderProfileFormSheet({
      state: store.getState(),
      isOpen: true,
      editingProfileId: store.getState().profiles[0].id,
    });
    assert.doesNotMatch(profileSheetHtml, /id="profile-size"[^>]*max="15"/);

    const rotationsHtml = renderRotationsView({
      state: store.getState(),
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        freshnessFilter: 'all',
        isGeneratorOpen: true,
        editingRotationId: createdRot.id,
      },
    });
    assert.doesNotMatch(rotationsHtml, /id="rot-count"[^>]*max="15"/);
    assert.doesNotMatch(rotationsHtml, new RegExp(`id="edit-rot-count-${createdRot.id}"[^>]*max="15"`));
  });
});

describe('Phase 29 — Storytime Controls, Preset Callout Layout & Cover Badge Taxonomy', () => {
  it('4. Renders Storytime − N + count stepper next to scope pills and styles Unread first as a clear interactive switch button', async () => {
    const store = await createTestStore();
    const state = store.getState();

    const playHtml = renderPlayView({
      state,
      playUiState: {
        ...createDefaultPlayUiState(),
        activeAppId: 'storytime-picker',
        randomizerCount: 5,
        randomizerUnreadFirst: true,
      },
    });

    assert.match(playHtml, /data-randomizer-stepper="true"/);
    assert.match(playHtml, /data-action="step-randomizer-count"[\s\S]*?data-step="-1"/);
    assert.match(playHtml, /data-action="step-randomizer-count"[\s\S]*?data-step="1"/);
    assert.match(playHtml, /5 books/);
    // Old 4-pill segmented buttons (`set-randomizer-count`) should no longer crowd out scope
    assert.doesNotMatch(playHtml, /data-action="set-randomizer-count"/);

    // Unread first must be a clear button with switch semantics
    assert.match(playHtml, /data-unread-toggle-button="true"/);
    assert.match(
      playHtml,
      /role="switch"[\s\S]*?data-action="toggle-randomizer-unread"|data-action="toggle-randomizer-unread"[\s\S]*?role="switch"/
    );
    assert.match(playHtml, /aria-checked="true"/);

    // pickStorytimeBooks supports > 6 books when requested
    const activeRotation =
      state.rotations.find((r) => r.profileId === state.profiles[0].id && r.status === 'active') ||
      null;
    const pickMany = pickStorytimeBooks({
      books: state.books,
      activeRotation,
      activeProfile: state.profiles[0],
      count: 8,
      scope: 'owned-library',
      unreadFirst: true,
    });
    assert.equal(pickMany.selectedBooks.length, 8);
  });

  it('5. Renders Create Rotation preset callout with full-width prompt above right-aligned Browse Presets link', async () => {
    const store = await createTestStore();
    const rotationsHtml = renderRotationsView({
      state: store.getState(),
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        freshnessFilter: 'all',
        isGeneratorOpen: true,
        editingRotationId: null,
      },
    });

    const calloutMatch = rotationsHtml.match(
      /<div\s+data-preset-sheet-callout="true"[\s\S]*?<\/div>\s*<\/div>/
    );
    assert.ok(calloutMatch, 'Expected data-preset-sheet-callout="true" block in Create Rotation sheet');
    assert.match(calloutMatch[0], /Seasonal holiday, milestone, or anytime seed\?/);
    assert.match(calloutMatch[0], /justify-end[\s\S]*?href="#\/presets"/);
  });

  it('6 & 7. Enforces 4 non-overlapping cover slots, adds explicit Rest/Shelf prefixes to day badges, and omits bare 26d box age from cover overlays', async () => {
    const store = await createTestStore();
    const refDate = '2026-11-03T12:00:00.000Z';
    const state = store.getState();
    const maya = state.profiles[0];

    // Verify 4 distinct corner slots in config
    const corners = new Set([
      COVER_BADGE_SLOTS.catalogState.corner,
      COVER_BADGE_SLOTS.affection.corner,
      COVER_BADGE_SLOTS.rotationState.corner,
      COVER_BADGE_SLOTS.owners.corner,
    ]);
    assert.equal(corners.size, 4, 'All 4 cover badge slots must map to 4 distinct corners');

    // Cooldown book -> bottom-left rotation-state slot with explicit "Rest" prefix + "19d"
    const cooldownBook = {
      ...state.books[0],
      id: 'b_rest_19d',
      collectionStatus: /** @type {const} */ ('owned'),
      condition: /** @type {const} */ ('good'),
      lastRotatedAt: '2026-11-01T12:00:00.000Z',
    };
    const cooldownUsage = computeBookUsageSummary(cooldownBook, {
      profiles: [maya],
      rotations: [],
      activeProfile: maya,
      activeRotation: null,
      cooldownDays: 21,
      referenceDate: refDate,
    });
    const cooldownBadge = renderBookCoverUsageAdorno(cooldownBook, cooldownUsage, { enabled: true });
    assert.match(cooldownBadge, /data-cover-slot="rotation-state"/);
    assert.match(cooldownBadge, />Rest</);
    assert.match(cooldownBadge, />19d</);

    // Off-shelf book rested 26 days past cooldown (`long-unseen`) -> NO `26d` cover badge!
    const restedBoxBook = {
      ...state.books[0],
      id: 'b_box_26d',
      collectionStatus: /** @type {const} */ ('owned'),
      condition: /** @type {const} */ ('good'),
      lastRotatedAt: '2026-10-08T12:00:00.000Z',
      rotationCount: 2,
    };
    const restedUsage = computeBookUsageSummary(restedBoxBook, {
      profiles: [maya],
      rotations: [],
      activeProfile: maya,
      activeRotation: null,
      cooldownDays: 14,
      referenceDate: refDate,
    });
    assert.equal(restedUsage.daysSinceLastRotated, 26);
    assert.equal(restedUsage.inCooldown, false);
    assert.equal(restedUsage.compactRecencyLabel, 'Off shelf 26d');

    const restedBadge = renderBookCoverUsageAdorno(restedBoxBook, restedUsage, { enabled: true });
    assert.equal(
      restedBadge,
      '',
      'Normal off-shelf box age (26d) must stay in the text caption below and not clutter cover art'
    );

    // Non-rotatable Wishlist book with Loved=true and owner=Maya -> top-left Wishlist, top-right Heart, bottom-right Owner, NO bottom-left rotation badge
    await store.addManualBook({
      title: 'Wishlist Starlight Book',
      authors: ['Star Author'],
      format: 'hardcover',
      readingStage: 'picture-book',
      ageMin: 2,
      ageMax: 6,
      tags: ['space'],
      collectionStatus: 'wishlist',
      condition: 'good',
      loved: true,
      owners: [maya.id],
    });
    const wishlistBook = store
      .getState()
      .books.find((b) => b.title === 'Wishlist Starlight Book');
    assert.ok(wishlistBook);

    const libHtml = renderLibraryView({
      state: store.getState(),
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: 'Wishlist Starlight Book',
        inspectedBookId: null,
      },
      referenceDate: refDate,
    });
    assert.match(libHtml, /data-cover-slot="catalog-state"[\s\S]*?Wishlist/);
    assert.match(libHtml, /data-cover-slot="affection"/);
    assert.match(libHtml, /data-cover-slot="owners"/);
    assert.doesNotMatch(libHtml, /data-cover-slot="rotation-state"/);
  });
});

describe('Phase 29 — Rotation Deletion Data Lifecycle & Centralized Config + Multi-Language', () => {
  it('8. Deleting a rotation rolls back its rotationHistory / lastRotatedAt / rotationCount while preserving read history and promoting saved shelves; updateBook preserves rotationHistory', async () => {
    const store = await createTestStore();
    const state0 = store.getState();
    const maya = state0.profiles[0];
    const originalActive = state0.rotations.find(
      (r) => r.profileId === maya.id && r.status === 'active'
    );
    assert.ok(originalActive);

    // Find a book that has NEVER been rotated yet
    const freshBookBefore = state0.books.find(
      (b) =>
        !b.lastRotatedAt &&
        (!b.rotationHistory || b.rotationHistory.length === 0) &&
        (!b.collectionStatus || b.collectionStatus === 'owned')
    );
    assert.ok(freshBookBefore, 'Expected at least one never-rotated owned seed book');

    // Create a new shelf containing that fresh book via manual add after a 1-book generation
    const tempRot = await store.generateRotation({
      title: 'Accidental Test Shelf',
      count: 1,
      cooldownDays: 14,
      seed: 'delete-lifecycle-test',
    });
    if (!tempRot.bookIds.includes(freshBookBefore.id)) {
      await store.addBooksToRotationManual(tempRot.id, [freshBookBefore.id]);
    }

    // Mark freshBookBefore as Read on this shelf!
    await store.toggleRotationBookRead(tempRot.id, freshBookBefore.id);

    // Verify book now has rotationHistory for `tempRot.id` AND is marked Read for Maya
    const midBook = store.getState().books.find((b) => b.id === freshBookBefore.id);
    assert.ok(midBook?.lastRotatedAt, 'Expected lastRotatedAt to be stamped when placed on shelf');
    assert.ok(
      midBook?.rotationHistory?.some((e) => e.rotationId === tempRot.id),
      'Expected rotationHistory entry referencing tempRot.id'
    );
    assert.ok(
      store.getState().profiles[0].readHistoryBookIds.includes(freshBookBefore.id),
      'Expected book in Maya readHistoryBookIds'
    );

    // Also verify updateBook preserves rotationHistory, rotationCount, and lastReadAt
    await store.updateBook(freshBookBefore.id, { title: `${freshBookBefore.title} (Updated)` });
    const afterEditBook = store.getState().books.find((b) => b.id === freshBookBefore.id);
    assert.equal(afterEditBook?.rotationHistory?.length, midBook?.rotationHistory?.length);
    assert.equal(afterEditBook?.rotationCount, midBook?.rotationCount);
    assert.ok(afterEditBook?.lastReadAt);

    // Now delete `tempRot`!
    await store.deleteRotation(tempRot.id);

    const afterDeleteState = store.getState();
    const afterDeleteBook = afterDeleteState.books.find((b) => b.id === freshBookBefore.id);

    // 1) Deleted rotation's cooldown/history entry is rolled back so book isn't trapped in phantom cooldown
    assert.equal(afterDeleteBook?.lastRotatedAt, undefined);
    assert.equal(afterDeleteBook?.rotationCount || 0, 0);
    assert.equal(afterDeleteBook?.rotationHistory?.length || 0, 0);

    // 2) Reader's real reading accomplishment (`readHistoryBookIds` + `lastReadAt`) is preserved!
    assert.equal(
      afterDeleteState.profiles[0].readHistoryBookIds.includes(freshBookBefore.id),
      true,
      'Deleting a shelf must preserve child readHistoryBookIds'
    );
    assert.ok(
      afterDeleteBook?.lastReadAt,
      'Deleting a shelf must preserve book.lastReadAt'
    );

    // 3) Previous saved rotation (`originalActive.id`) is promoted back to `'active'`
    const restoredRot = afterDeleteState.rotations.find((r) => r.id === originalActive.id);
    assert.equal(restoredRot?.status, 'active');
  });

  it('9. Centralizes defaults, colors/badges, presets, play apps, and YAML locales (`en`, `es`, `it`) under /src/config/ and translates UI views cleanly', async () => {
    assert.equal(NUMERIC_BOUNDS.rotationBooksMax, null);
    assert.ok(DEFAULT_ROTATION_PRESETS.length >= 18);
    assert.equal(PLAY_APPS_CONFIG.length, 2);
    assert.deepEqual(
      SUPPORTED_LANGUAGES.map((l) => l.code),
      ['en', 'es', 'it']
    );

    const enDict = getLocaleDictionary('en');
    const esDict = getLocaleDictionary('es');
    const itDict = getLocaleDictionary('it');
    for (const section of [
      'nav',
      'common',
      'home',
      'library',
      'rotations',
      'presets',
      'play',
      'profiles',
      'settings',
      'badges',
    ]) {
      assert.ok(section in enDict, `Missing ${section} in en.yaml`);
      assert.ok(section in esDict, `Missing ${section} in es.yaml`);
      assert.ok(section in itDict, `Missing ${section} in it.yaml`);
    }

    assert.equal(t('es', 'nav.library'), 'Biblioteca');
    assert.equal(t('it', 'nav.library'), 'Libreria');
    assert.equal(t('es', 'play.pickBtnPlural', { count: 5 }), 'Elegir 5 cuentos');
    assert.equal(t('it', 'play.pickBtnPlural', { count: 5 }), 'Scegli 5 libri');

    const store = await createTestStore();
    await store.updateSettings({ language: 'es' });
    const esState = store.getState();
    assert.equal(esState.settings.language, 'es');

    const shellEs = renderAppShell({
      activeRoute: 'home',
      toast: null,
      contentHtml: renderHomeView({
        state: esState,
        uiState: {
          catalogFilter: 'all',
          searchQuery: '',
          inspectedBookId: null,
        },
      }),
      state: esState,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: false,
        showIosInstructions: false,
      },
    });
    assert.match(shellEs, /Biblioteca/);
    assert.match(shellEs, /Rotaciones/);
    assert.match(shellEs, /Jugar/);

    const settingsItState = {
      ...esState,
      settings: { ...esState.settings, language: /** @type {const} */ ('it') },
    };
    const settingsItHtml = renderSettingsView({
      state: settingsItState,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: false,
        showIosInstructions: false,
      },
      adapterDiagnostics: store.getTaggingService().getAdapterDiagnostics(settingsItState.settings),
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
      },
    });
    assert.match(settingsItHtml, /data-settings-language-picker="true"/);
    assert.match(settingsItHtml, /data-action="set-language"[\s\S]*?data-language="it"/);
    assert.match(settingsItHtml, /Impostazioni/);
    assert.match(settingsItHtml, /Lingua dell’app/);
  });
});
