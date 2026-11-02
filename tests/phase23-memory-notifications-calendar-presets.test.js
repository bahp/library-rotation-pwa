/**
 * @fileoverview Phase 23 maintainer regression tests covering:
 * 1) Memory footprint displayed right next to `Version <APP_VERSION>` in `#/settings`
 * 2) Configurable advance (`presetAlertDaysBefore`) and past-due grace (`presetAlertDaysAfter`)
 *    preset notifications ("Starts in X days" & "Notification appeared X days ago") including
 *    dismissal persistence and Dec/Jan year rollover
 * 3) Unambiguous library match wording (`X topic matches in library (13 owned rotatable of 16 total)`)
 *    clearly distinguishing eligible library books from wishlist/broken books and active shelf books
 * 4) Top-right corner preset SVG motif decorations + `#/settings` toggle + in-place `Edit` & `Reset`
 *    for built-in presets alongside `Clone & Tweak`
 * 5) Scalable `<select id="presets-category-select">` + interactive 12-Month Year Calendar strip
 * 6) Calibrated default presets (`DEFAULT_ROTATION_PRESETS`) with global cultural celebrations,
 *    sensible festival vs. season counts/cycles, and undated everyday family presets
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStorageAdapter,
  estimateAppStorageUsage,
} from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { DEFAULT_ROTATION_PRESETS } from '../src/data/rotation-presets-config.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import {
  createDefaultPresetsUiState,
  formatPresetLibraryMatchSummary,
  renderPresetsView,
} from '../src/features/rotations/presets-view.js';
import {
  countMatchingCatalogBooksForPreset,
  findMatchingStartDatePresets,
  getAllRotationPresets,
  renderPresetStartDateAlertBanner,
} from '../src/features/rotations/rotation-presets.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { APP_VERSION } from '../src/version.js';

/**
 * Creates an isolated in-memory app store for deterministic tests.
 */
async function createIsolatedStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 23 — Memory Usage Near Version in Settings', () => {
  it('computes deterministic state memory usage and renders it directly beside Version in #/settings', async () => {
    const store = await createIsolatedStore();
    const initialUsage = estimateAppStorageUsage(store.getState());
    assert.ok(initialUsage.totalBytes > 500, 'Expected non-zero serialized state footprint');
    assert.match(initialUsage.formatted, /^\d+(\.\d+)?\s*(B|KB|MB)$/);

    const settingsHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'indexeddb',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
    });

    assert.equal(settingsHtml.includes('data-settings-version-memory="true"'), true);
    assert.equal(settingsHtml.includes(APP_VERSION), true);
    assert.equal(settingsHtml.includes(initialUsage.formatted), true);

    // Adding a book with an inline data URL cover photo increases reported bytes and photo breakdown
    const fakePhotoDataUrl = `data:image/jpeg;base64,${'A'.repeat(4096)}`;
    await store.addManualBook({
      title: 'Homemade Family Photo Album',
      authors: ['Parent'],
      format: 'board-book',
      readingStage: 'board-toddler',
      ageMin: 1,
      ageMax: 4,
      tags: ['family'],
      coverUrl: fakePhotoDataUrl,
    });

    const updatedUsage = estimateAppStorageUsage(store.getState());
    assert.ok(updatedUsage.totalBytes > initialUsage.totalBytes + 4000);
    assert.ok(updatedUsage.coverDataUrlBytes >= 4096);
  });
});

describe('Phase 23 — Advance & Past-Due Grace Preset Notification Windows', () => {
  it('shows upcoming ("Starts in X days") and unactioned past-due ("Notification appeared X days ago") alerts based on settings, and silences on dismiss or generate', async () => {
    const store = await createIsolatedStore();
    await store.updateSettings({
      presetAlertDaysBefore: 2,
      presetAlertDaysAfter: 5,
    });

    const baseUiState = {
      catalogFilter: 'all',
      searchQuery: '',
      inspectedBookId: null,
      dismissedSwapReminderKeys: /** @type {string[]} */ ([]),
      dismissedPresetAlertKeys: /** @type {string[]} */ ([]),
    };

    // Halloween preset is '10-15':
    // 1) 3 days before ('2028-10-12') -> outside 2d lead window -> hidden
    const html3dBefore = renderHomeView({
      state: store.getState(),
      uiState: baseUiState,
      referenceDate: '2028-10-12',
    });
    assert.equal(html3dBefore.includes('data-preset-start-alert="preset-halloween-spooky"'), false);

    // 2) 2 days before ('2028-10-13') -> inside 2d lead window -> "Starts in 2 days (Oct 15)"
    const html2dBefore = renderHomeView({
      state: store.getState(),
      uiState: baseUiState,
      referenceDate: '2028-10-13',
    });
    assert.equal(html2dBefore.includes('data-preset-start-alert="preset-halloween-spooky"'), true);
    assert.equal(html2dBefore.includes('data-preset-alert-status="upcoming"'), true);
    assert.equal(html2dBefore.includes('Starts in 2 days (Oct 15)'), true);

    // 3) 3 days AFTER ('2028-10-18') when user has NOT clicked yes/no -> "Notification appeared 3 days ago (Suggested Oct 15)"
    const html3dAfter = renderHomeView({
      state: store.getState(),
      uiState: baseUiState,
      referenceDate: '2028-10-18',
    });
    assert.equal(html3dAfter.includes('data-preset-start-alert="preset-halloween-spooky"'), true);
    assert.equal(html3dAfter.includes('data-preset-alert-status="past-due"'), true);
    assert.equal(html3dAfter.includes('Notification appeared 3 days ago (Suggested Oct 15)'), true);

    // 4) 6 days AFTER ('2028-10-21') -> outside 5d grace window -> hidden
    const html6dAfter = renderHomeView({
      state: store.getState(),
      uiState: baseUiState,
      referenceDate: '2028-10-21',
    });
    assert.equal(html6dAfter.includes('data-preset-start-alert="preset-halloween-spooky"'), false);

    // 5) Dismissing once during the window silences the entire 2028 occurrence (even 4 days after)
    const dismissalKey = 'preset-start::preset-halloween-spooky::2028-10-15';
    const htmlAfterDismiss = renderHomeView({
      state: store.getState(),
      uiState: {
        ...baseUiState,
        dismissedPresetAlertKeys: [dismissalKey],
      },
      referenceDate: '2028-10-19',
    });
    assert.equal(htmlAfterDismiss.includes('data-preset-start-alert="preset-halloween-spooky"'), false);

    // 6) Verify Dec -> Jan year-boundary math (e.g., Dec 30preset checked on Jan 2 = 3 days ago in previous year)
    const customNewYearEve = await store.addRotationPreset({
      title: 'Year-End Countdown Tales',
      description: 'Clocks, stars, and new year wishes.',
      category: 'calendar-events',
      preferredTags: ['holidays'],
      count: 3,
      swapDays: 7,
      cooldownDays: 30,
      suggestedStartMonthDay: '12-30',
    });

    const jan2Matches = findMatchingStartDatePresets(
      [customNewYearEve],
      '2027-01-02',
      { daysBefore: 2, daysAfter: 5 }
    );
    assert.equal(jan2Matches.length, 1);
    assert.equal(jan2Matches[0].schedule.windowStatus, 'past-due');
    assert.equal(jan2Matches[0].schedule.signedDaysFromStart, 3);
    assert.equal(
      jan2Matches[0].schedule.alertKey,
      `preset-start::${customNewYearEve.id}::2026-12-30`
    );

    const bannerJan2 = renderPresetStartDateAlertBanner({
      presets: [customNewYearEve],
      activeProfile: store.getState().profiles[0],
      daysBefore: 2,
      daysAfter: 5,
      referenceDate: '2027-01-02',
    });
    assert.equal(bannerJan2.includes('Notification appeared 3 days ago (Suggested Dec 30)'), true);
  });
});

describe('Phase 23 — Clarified Library Match Count vs. Active Shelf Count', () => {
  it('explains owned rotatable library books vs. total catalog books (wishlist/broken), never confusing with active rotation size', () => {
    /** @type {any[]} */
    const sampleCatalog = [];
    // 13 owned rotatable books (3 matching 'winter') + 2 wishlist books + 1 torn/broken book = 16 total books
    for (let i = 1; i <= 13; i += 1) {
      sampleCatalog.push({
        id: `b_${i}`,
        title: `Owned Book ${i}`,
        authors: ['Author'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 2,
        ageMax: 6,
        tags: i <= 3 ? ['winter'] : ['vehicles'],
        collectionStatus: 'owned',
        condition: 'good',
      });
    }
    sampleCatalog.push(
      {
        id: 'b_wish_1',
        title: 'Wishlist Winter Book',
        authors: ['Author'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 2,
        ageMax: 6,
        tags: ['winter'],
        collectionStatus: 'wishlist',
        condition: 'good',
      },
      {
        id: 'b_wish_2',
        title: 'Wishlist Space Book',
        authors: ['Author'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 2,
        ageMax: 6,
        tags: ['space'],
        collectionStatus: 'wishlist',
        condition: 'good',
      },
      {
        id: 'b_broken_1',
        title: 'Broken Spine Book',
        authors: ['Author'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 2,
        ageMax: 6,
        tags: ['winter'],
        collectionStatus: 'owned',
        condition: 'broken',
      }
    );

    const winterPreset = DEFAULT_ROTATION_PRESETS.find((p) => p.id === 'preset-winter-cozy');
    assert.ok(winterPreset);

    const counts = countMatchingCatalogBooksForPreset(sampleCatalog, winterPreset);
    assert.equal(counts.thematicMatchCount, 3);
    assert.equal(counts.rotatableTotalCount, 13);
    assert.equal(counts.totalCatalogCount, 16);

    const label = formatPresetLibraryMatchSummary(counts);
    assert.equal(
      label,
      '3 topic matches in library (13 owned rotatable of 16 total)'
    );
  });
});

describe('Phase 23 — Corner Motif Decorations, Built-In Edit/Reset, Year Calendar & Global Presets', () => {
  it('renders togglable corner SVG motifs, compact 12-month calendar filtering, and in-place Edit + Reset on built-in presets', async () => {
    const store = await createIsolatedStore();

    // 1. Default presets include diverse world traditions + >= 6 undated everyday presets with sensible counts
    const culturalPresets = DEFAULT_ROTATION_PRESETS.filter(
      (p) => p.category === 'cultural-traditions'
    );
    const undatedPresets = DEFAULT_ROTATION_PRESETS.filter((p) => !p.suggestedStartMonthDay);
    assert.ok(culturalPresets.length >= 10, 'Expected diverse global & cultural presets');
    assert.ok(undatedPresets.length >= 6, 'Expected multiple undated everyday/developmental presets');

    const hanukkah = DEFAULT_ROTATION_PRESETS.find((p) => p.id === 'preset-hanukkah-lights');
    const lunar = DEFAULT_ROTATION_PRESETS.find((p) => p.id === 'preset-lunar-new-year');
    const bedtime = DEFAULT_ROTATION_PRESETS.find((p) => p.id === 'preset-calm-bedtime');
    assert.ok(hanukkah && hanukkah.swapDays === 8 && hanukkah.count === 4);
    assert.ok(lunar && lunar.category === 'cultural-traditions');
    assert.ok(bedtime && !bedtime.suggestedStartMonthDay && bedtime.count === 3);

    // 2. Decorations visible by default, hidden when showPresetDecorations = false
    const defaultPresetsHtml = renderPresetsView({
      state: store.getState(),
      presetsUiState: createDefaultPresetsUiState(),
      referenceDate: '2026-11-01',
    });
    assert.equal(defaultPresetsHtml.includes('data-preset-decoration='), true);
    assert.equal(defaultPresetsHtml.includes('data-presets-year-calendar="true"'), true);

    await store.updateSettings({ showPresetDecorations: false });
    const noDecorationsHtml = renderPresetsView({
      state: store.getState(),
      presetsUiState: createDefaultPresetsUiState(),
      referenceDate: '2026-11-01',
    });
    assert.equal(noDecorationsHtml.includes('data-preset-decoration='), false);

    // 3. Year Calendar month filter (selecting December = month 12 shows only December presets)
    const decFilteredHtml = renderPresetsView({
      state: store.getState(),
      presetsUiState: {
        ...createDefaultPresetsUiState(),
        selectedMonth: 12,
      },
      referenceDate: '2026-11-01',
    });
    assert.equal(decFilteredHtml.includes('data-preset-card="preset-christmas-winter-holidays"'), true);
    assert.equal(decFilteredHtml.includes('data-preset-card="preset-hanukkah-lights"'), true);
    assert.equal(decFilteredHtml.includes('data-preset-card="preset-halloween-spooky"'), false);

    // 4. Built-in presets can be edited directly in place AND reset back to factory defaults
    const editedBuiltIn = await store.updateRotationPreset('preset-christmas-winter-holidays', {
      title: 'December Advent Basket',
      count: 3,
      swapDays: 12,
      suggestedStartMonthDay: '12-03',
    });
    assert.equal(editedBuiltIn.isCustom, false);
    assert.equal(editedBuiltIn.isBuiltInOverride, true);
    assert.equal(editedBuiltIn.title, 'December Advent Basket');
    assert.equal(editedBuiltIn.count, 3);

    const mergedAfterEdit = getAllRotationPresets(store.getState()).find(
      (p) => p.id === 'preset-christmas-winter-holidays'
    );
    assert.equal(mergedAfterEdit?.title, 'December Advent Basket');
    assert.equal(mergedAfterEdit?.isBuiltInOverride, true);

    // Backup/restore preserves built-in presetOverrides
    const backupJson = JSON.stringify(store.getState());
    const restoredStore = await createIsolatedStore();
    await restoredStore.importBackupJson(backupJson);
    const restoredOverride = getAllRotationPresets(restoredStore.getState()).find(
      (p) => p.id === 'preset-christmas-winter-holidays'
    );
    assert.equal(restoredOverride?.title, 'December Advent Basket');

    // Reset restores factory title & parameters
    const wasReset = await store.resetBuiltInPreset('preset-christmas-winter-holidays');
    assert.equal(wasReset, true);
    const afterReset = getAllRotationPresets(store.getState()).find(
      (p) => p.id === 'preset-christmas-winter-holidays'
    );
    assert.equal(afterReset?.title, 'Christmas & Winter Holidays');
    assert.equal(afterReset?.isBuiltInOverride, false);
  });
});
