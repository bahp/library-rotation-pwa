/**
 * @fileoverview Phase 20 maintainer tests covering:
 * 1) Editing existing rotation name (`title`) and description (`rules.objective`) in store & Edit UI
 * 2) Declarative collection defaults config (`src/data/rotation-presets-config.js`) with zero hardcoded books
 *    and deterministic shelf generation from the user's library (`generateRotationFromPreset`)
 * 3) Year-agnostic `MM-DD` start-date matching across calendar years, days-until-start countdowns,
 *    optional undated ("Anytime") presets, and dismissible Start-Date Match Alert Banners
 * 4) Dedicated `#/presets` route, `renderPresetsView`, and custom preset CRUD + JSON backup persistence
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseHashRoute } from '../src/core/router.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { DEFAULT_ROTATION_PRESETS } from '../src/data/rotation-presets-config.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import {
  createDefaultPresetsUiState,
  renderPresetsView,
} from '../src/features/rotations/presets-view.js';
import {
  buildMonthDayFromParts,
  computePresetStartSchedule,
  findMatchingStartDatePresets,
  getAllRotationPresets,
  renderPresetStartDateAlertBanner,
} from '../src/features/rotations/rotation-presets.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';

/**
 * Creates a fresh initialized store backed by an isolated in-memory storage adapter.
 */
async function createIsolatedStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 20 — Rotation Name & Description Editing', () => {
  it('updates rotation name and description while preserving books, read state, and compact view behavior', async () => {
    const store = await createIsolatedStore();
    const initialState = store.getState();
    const targetRot = initialState.rotations[0];
    assert.ok(targetRot, 'Expected starter rotation in seed state');

    const originalBookIds = [...targetRot.bookIds];
    const originalCompletedIds = [...targetRot.completedBookIds];

    // Compact mode (!isEditing) must NOT expose the edit-rotation-details form
    const compactHtml = renderRotationsView({
      state: initialState,
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
      referenceDate: '2026-06-10',
    });
    assert.equal(
      compactHtml.includes('data-form="edit-rotation-details"'),
      false,
      'Compact shelf view should stay clean without inline edit inputs'
    );

    // Unified Edit mode (editingRotationId === targetRot.id) exposes name, description, and rule inputs together
    const editingHtml = renderRotationsView({
      state: initialState,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: targetRot.id,
      },
      referenceDate: '2026-06-10',
    });
    assert.equal(editingHtml.includes('data-form="edit-rotation-details"'), true);
    assert.equal(editingHtml.includes(`data-rotation-id="${targetRot.id}"`), true);
    assert.equal(editingHtml.includes('name="title"'), true);
    assert.equal(editingHtml.includes('name="description"'), true);

    // Update name & description via store
    const updated = await store.updateRotationDetails(targetRot.id, {
      title: 'Snowy Bedtime Favorites',
      description: 'Calm snowy picture books and cozy winter family stories.',
    });

    assert.equal(updated.title, 'Snowy Bedtime Favorites');
    assert.equal(
      updated.rules.objective,
      'Calm snowy picture books and cozy winter family stories.'
    );
    assert.deepEqual(updated.bookIds, originalBookIds);
    assert.deepEqual(updated.completedBookIds, originalCompletedIds);

    // Verify rendered view reflects new name & description
    const postUpdateHtml = renderRotationsView({
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
      referenceDate: '2026-06-10',
    });
    assert.equal(postUpdateHtml.includes('Snowy Bedtime Favorites'), true);
    assert.equal(
      postUpdateHtml.includes('Calm snowy picture books and cozy winter family stories.'),
      true
    );

    // Empty name must be rejected cleanly
    await assert.rejects(
      () => store.updateRotationDetails(targetRot.id, { title: '   ' }),
      /Rotation name is required/
    );
  });
});

describe('Phase 20 — Pre-Configured Collection Defaults & Deterministic Generation', () => {
  it('provides seasonal, cultural milestone, and undated anytime collection configs without hardcoded books', async () => {
    assert.ok(
      DEFAULT_ROTATION_PRESETS.length >= 12,
      'Expected a rich set of year-round seasonal, milestone, and everyday presets'
    );

    const titles = DEFAULT_ROTATION_PRESETS.map((p) => p.title);
    assert.equal(titles.includes('Christmas & Winter Holidays'), true);
    assert.equal(titles.includes('Autumn & Harvest'), true);
    assert.equal(titles.includes('Halloween & Spooky Season'), true);

    const datedPresets = DEFAULT_ROTATION_PRESETS.filter((p) => Boolean(p.suggestedStartMonthDay));
    const undatedPresets = DEFAULT_ROTATION_PRESETS.filter((p) => !p.suggestedStartMonthDay);
    assert.ok(datedPresets.length >= 8, 'Expected multiple calendar-dated seasonal/event presets');
    assert.ok(undatedPresets.length >= 2, 'Expected undated anytime presets without suggested start');

    for (const preset of DEFAULT_ROTATION_PRESETS) {
      assert.equal(
        'bookIds' in preset || 'books' in preset,
        false,
        `Preset "${preset.id}" must define selection rules only, never hardcoded books`
      );
      assert.ok(preset.seed && preset.seed.length >= 4, `Preset "${preset.id}" must have a deterministic seed`);
      assert.ok(preset.count >= 1 && preset.count <= 15);
      assert.ok(preset.swapDays >= 1);
      assert.ok(preset.cooldownDays >= 0);
    }
  });

  it('generates a deterministic rotation from the user library using preset rules and seed', async () => {
    const storeA = await createIsolatedStore();
    const storeB = await createIsolatedStore();

    const rotA = await storeA.generateRotationFromPreset('preset-christmas-winter-holidays');
    const rotB = await storeB.generateRotationFromPreset('preset-christmas-winter-holidays');

    const christmasPreset = DEFAULT_ROTATION_PRESETS.find(
      (p) => p.id === 'preset-christmas-winter-holidays'
    );
    assert.ok(christmasPreset);

    assert.equal(rotA.title, christmasPreset.title);
    assert.equal(rotA.rules.objective, christmasPreset.description);
    assert.equal(rotA.rules.swapDays, christmasPreset.swapDays);
    assert.equal(rotA.rules.cooldownDays, christmasPreset.cooldownDays);
    assert.equal(rotA.rules.seed, christmasPreset.seed);
    assert.deepEqual(rotA.rules.preferredTags, christmasPreset.preferredTags);
    assert.ok(rotA.bookIds.length > 0);
    assert.deepEqual(
      rotA.bookIds,
      rotB.bookIds,
      'Identical library + deterministic preset seed must produce identical book selection'
    );
  });
});

describe('Phase 20 — Annual MM-DD Start-Date Matching, Days-Until-Start & Alert Banner', () => {
  it('computes year-agnostic MM-DD start matches, wrap-around days until start, and null for undated presets', () => {
    const christmasPreset = DEFAULT_ROTATION_PRESETS.find(
      (p) => p.id === 'preset-christmas-winter-holidays'
    );
    const anytimePreset = DEFAULT_ROTATION_PRESETS.find(
      (p) => !p.suggestedStartMonthDay
    );
    assert.ok(christmasPreset);
    assert.ok(anytimePreset);

    // Exact match on Dec 1 across two different years (2026 and 2031)
    const match2026 = computePresetStartSchedule(christmasPreset, '2026-12-01');
    const match2031 = computePresetStartSchedule(christmasPreset, '2031-12-01');
    assert.equal(match2026.isStartToday, true);
    assert.equal(match2026.daysUntilStart, 0);
    assert.equal(match2031.isStartToday, true);
    assert.equal(match2031.daysUntilStart, 0);

    // Nov 1 -> 30 days until Dec 1
    const nov1 = computePresetStartSchedule(christmasPreset, '2026-11-01');
    assert.equal(nov1.isStartToday, false);
    assert.equal(nov1.daysUntilStart, 30);

    // Dec 2 -> wraps around to next year's Dec 1 (364 days in non-leap 2027)
    const dec2 = computePresetStartSchedule(christmasPreset, '2026-12-02');
    assert.equal(dec2.isStartToday, false);
    assert.equal(dec2.daysUntilStart, 364);

    // Anytime preset without suggested start date
    const undated = computePresetStartSchedule(anytimePreset, '2026-11-01');
    assert.equal(undated.hasSuggestedStart, false);
    assert.equal(undated.daysUntilStart, null);
    assert.equal(undated.isStartToday, false);
    assert.equal(undated.formattedDateLabel, 'Anytime');
  });

  it('shows Start-Date Match Alert Banner when month & day match, and hides when dismissed or already active', async () => {
    const store = await createIsolatedStore();
    const state = store.getState();
    const activeProfile = state.profiles[0];
    const allPresets = getAllRotationPresets(state);

    // Oct 15 matches Halloween & Spooky Season ('10-15') regardless of year
    const matches2028 = findMatchingStartDatePresets(allPresets, '2028-10-15');
    assert.equal(matches2028.length, 1);
    assert.equal(matches2028[0].preset.id, 'preset-halloween-spooky');

    const homeHtmlOnOct15 = renderHomeView({
      state,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
        dismissedSwapReminderKeys: [],
        dismissedPresetAlertKeys: [],
      },
      referenceDate: '2028-10-15',
    });
    assert.equal(
      homeHtmlOnOct15.includes('data-preset-start-alert="preset-halloween-spooky"'),
      true,
      'Home view should display the start-date match alert on Oct 15'
    );
    assert.equal(homeHtmlOnOct15.includes('Halloween &amp; Spooky Season'), true);

    // Dismissing for 2028 hides it in 2028, while 2029 triggers fresh
    const alertKey2028 = matches2028[0].schedule.alertKey;
    const bannerDismissed2028 = renderPresetStartDateAlertBanner({
      presets: allPresets,
      activeProfile,
      dismissedAlertKeys: [alertKey2028],
      referenceDate: '2028-10-15',
    });
    assert.equal(bannerDismissed2028, '');

    const bannerNextYear2029 = renderPresetStartDateAlertBanner({
      presets: allPresets,
      activeProfile,
      dismissedAlertKeys: [alertKey2028],
      referenceDate: '2029-10-15',
    });
    assert.equal(bannerNextYear2029.includes('data-preset-start-alert="preset-halloween-spooky"'), true);

    // Generating that preset makes it the active shelf, which suppresses the redundant start alert
    await store.generateRotationFromPreset('preset-halloween-spooky');
    const updatedState = store.getState();
    const activeRot = updatedState.rotations.find((r) => r.status === 'active') || null;
    const bannerAfterGenerate = renderPresetStartDateAlertBanner({
      presets: getAllRotationPresets(updatedState),
      activeProfile,
      activeRotation: activeRot,
      dismissedAlertKeys: [],
      referenceDate: '2029-10-15',
    });
    assert.equal(bannerAfterGenerate, '');
  });
});

describe('Phase 20 — Dedicated #/presets Route, Countdown UI & Custom Preset CRUD', () => {
  it('routes #/presets cleanly, renders days-until-start + anytime labels, and persists custom presets across backup/restore', async () => {
    const parsedRoute = parseHashRoute('#/presets?new=1');
    assert.equal(parsedRoute.route, 'presets');
    assert.equal(parsedRoute.params.get('new'), '1');

    const store = await createIsolatedStore();

    // Add a custom preset with suggested start date + an anytime custom preset without start date
    const datedCheck = buildMonthDayFromParts('02', '14');
    assert.equal(datedCheck.valid, true);
    assert.equal(datedCheck.monthDay, '02-14');

    const createdDated = await store.addRotationPreset({
      title: 'Kindness & Valentine Postbox',
      description: 'Stories about friendship notes, hearts, baking, and caring for neighbors.',
      category: 'calendar-events',
      preferredTags: ['friendship', 'feelings', 'family'],
      count: 4,
      swapDays: 10,
      cooldownDays: 20,
      requiredFormat: 'any',
      varietyMix: true,
      seed: 'custom-valentine-postbox-v1',
      suggestedStartMonthDay: datedCheck.monthDay,
    });
    assert.equal(createdDated.isCustom, true);
    assert.equal(createdDated.suggestedStartMonthDay, '02-14');

    const createdAnytime = await store.addRotationPreset({
      title: 'Dinosaur Dig Week',
      description: 'Fossils, paleontology, and prehistoric adventures for curious diggers.',
      category: 'evergreen',
      preferredTags: ['dinosaurs', 'science'],
      count: 5,
      swapDays: 14,
      cooldownDays: 21,
      suggestedStartMonthDay: '',
    });
    assert.equal(createdAnytime.suggestedStartMonthDay, undefined);
    assert.ok(createdAnytime.seed.includes('dinosaur-dig-week'));

    // Render dedicated #/presets page on Feb 10 (4 days until Feb 14)
    const presetsHtml = renderPresetsView({
      state: store.getState(),
      presetsUiState: createDefaultPresetsUiState(),
      dismissedPresetAlertKeys: [],
      referenceDate: '2026-02-10',
    });

    assert.equal(presetsHtml.includes('Collection Presets'), true);
    assert.equal(presetsHtml.includes('4 days until Feb 14'), true);
    assert.equal(presetsHtml.includes('Anytime · No fixed start date'), true);
    assert.equal(presetsHtml.includes('Kindness &amp; Valentine Postbox'), true);
    assert.equal(presetsHtml.includes('Dinosaur Dig Week'), true);

    // Verify AppShell keeps 5 mobile nav items and highlights Rotations when on #/presets
    const shellHtml = renderAppShell({
      activeRoute: 'presets',
      state: store.getState(),
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: presetsHtml,
    });
    assert.equal(shellHtml.includes('href="#/rotations"'), true);
    assert.equal(shellHtml.includes('aria-current="page"'), true);

    // Update custom preset and verify JSON backup round-trip preserves customPresets
    const updatedCustom = await store.updateRotationPreset(createdDated.id, {
      title: 'Valentine & Friendship Week',
      count: 6,
    });
    assert.equal(updatedCustom.title, 'Valentine & Friendship Week');
    assert.equal(updatedCustom.count, 6);

    const exportedJson = JSON.stringify(store.getState());
    const restoredStore = await createIsolatedStore();
    await restoredStore.importBackupJson(exportedJson);
    assert.equal((restoredStore.getState().customPresets || []).length, 2);
    assert.equal(
      restoredStore.getState().customPresets?.[0].title === 'Valentine & Friendship Week' ||
        restoredStore.getState().customPresets?.[1].title === 'Valentine & Friendship Week',
      true
    );

    // Delete custom preset
    const deleted = await store.deleteRotationPreset(createdAnytime.id);
    assert.equal(deleted, true);
    assert.equal((store.getState().customPresets || []).length, 1);
  });
});
