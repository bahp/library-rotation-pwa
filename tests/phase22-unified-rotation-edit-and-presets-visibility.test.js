/**
 * @fileoverview Phase 22 maintainer regression tests covering:
 * 1) Unified Rotation Editing (`toggle-edit-rotation`):
 *    - Single Edit/Done button (no separate pen rename button and no separate Save button)
 *    - Same typographic font scale (`font-display text-lg font-bold` title & `font-sans text-xs` description)
 *      with slim compact boxes (`h-9` / `h-8`)
 *    - Editing all rotation parameters (`title`, `description`, `swapDays`, `cooldownDays`, `count`,
 *      `requiredFormat`, `preferredTags`, `seed`, `varietyMix`) via `store.updateRotationDetails`
 * 2) Collection Presets (`#/presets`) iPhone browser visibility:
 *    - Wrapped high-contrast bordered filter buttons (no `overflow-x-auto` clipping or low-contrast tabs)
 *    - Theme match count (`X theme matches in Y shelf books`) placed on its own full line below `Seed:`
 * 3) Settings optional proxy form collapsed inside `data-advanced-proxy-disclosure="true"` by default
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  createDefaultPresetsUiState,
  renderPresetsView,
} from '../src/features/rotations/presets-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';

/**
 * Creates an isolated in-memory app store for deterministic unit tests.
 */
async function createIsolatedStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 22 — Unified Rotation Editing (Title, Description, Rules & Books Without Separate Save)', () => {
  it('exposes title, description, all rotation parameters, and book controls under one Edit/Done toggle with matching compact fonts', async () => {
    const store = await createIsolatedStore();
    const targetRot = store.getState().rotations[0];
    assert.ok(targetRot, 'Expected starter rotation');

    // 1. Compact view: no separate pen rename button, no form inputs
    const compactHtml = renderRotationsView({
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
      referenceDate: '2026-11-01',
    });

    assert.equal(
      compactHtml.includes('data-action="start-rename-rotation"'),
      false,
      'Must not split editing between a separate pen icon and the Edit button'
    );
    assert.equal(compactHtml.includes('data-form="edit-rotation-details"'), false);

    // 2. Unified Edit mode (`editingRotationId === targetRot.id`):
    //    Title, description, rotation parameters, AND book slot controls appear together with NO separate Save button
    const unifiedEditHtml = renderRotationsView({
      state: store.getState(),
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
      referenceDate: '2026-11-01',
    });

    assert.equal(unifiedEditHtml.includes('data-form="edit-rotation-details"'), true);
    assert.equal(
      unifiedEditHtml.includes('type="submit"'),
      false,
      'Unified rotation edit form must not require clicking a separate Save button'
    );

    // Same font classes & slim textbox sizing (not oversized h-12 or 16px text-base overrides)
    assert.match(
      unifiedEditHtml,
      new RegExp(`id="edit-rot-title-${targetRot.id}"[\\s\\S]*?h-9[^"]*font-display text-lg font-bold`)
    );
    assert.match(
      unifiedEditHtml,
      new RegExp(`id="edit-rot-desc-${targetRot.id}"[\\s\\S]*?font-sans text-xs leading-relaxed`)
    );

    // All rotation parameters are editable alongside the book cards
    for (const fieldName of [
      'title',
      'description',
      'swapDays',
      'cooldownDays',
      'count',
      'requiredFormat',
      'preferredTags',
      'seed',
      'varietyMix',
    ]) {
      assert.equal(
        unifiedEditHtml.includes(`name="${fieldName}"`),
        true,
        `Unified Edit mode must include rotation parameter "${fieldName}"`
      );
    }
    assert.equal(
      unifiedEditHtml.includes('data-action="replace-book-random"'),
      true,
      'Book slot controls must be visible at the same time in unified Edit mode'
    );

    // 3. Updating all rotation parameters via store.updateRotationDetails persists rules & updates schedule
    const updated = await store.updateRotationDetails(
      targetRot.id,
      {
        title: 'Autumn Cozy Basket',
        description: 'Warm woodland tales and bedtime rhymes.',
        swapDays: 7,
        cooldownDays: 28,
        count: 6,
        requiredFormat: 'board-book',
        preferredTags: 'woodland, bedtime, autumn',
        seed: 'autumn-2026-seed',
        varietyMix: false,
      },
      { silent: true }
    );

    assert.equal(updated.title, 'Autumn Cozy Basket');
    assert.equal(updated.rules.objective, 'Warm woodland tales and bedtime rhymes.');
    assert.equal(updated.rules.swapDays, 7);
    assert.equal(updated.rules.cooldownDays, 28);
    assert.equal(updated.rules.count, 6);
    assert.equal(updated.rules.requiredFormat, 'board-book');
    assert.deepEqual(updated.rules.preferredTags, ['woodland', 'bedtime', 'autumn']);
    assert.equal(updated.rules.seed, 'autumn-2026-seed');
    assert.equal(updated.rules.varietyMix, false);

    // skipIfUnchanged returns existing rotation without bumping updatedAt when nothing changed
    const unchanged = await store.updateRotationDetails(
      targetRot.id,
      {
        title: 'Autumn Cozy Basket',
        description: 'Warm woodland tales and bedtime rhymes.',
      },
      { silent: true, skipIfUnchanged: true }
    );
    assert.equal(unchanged.updatedAt, updated.updatedAt);
  });
});

describe('Phase 22 — Presets iPhone Filter Contrast, Unclipped Theme Matches & Simplified Settings', () => {
  it('renders scalable category select + year calendar and places library topic match counts on a dedicated line below Seed', async () => {
    const store = await createIsolatedStore();
    const html = renderPresetsView({
      state: store.getState(),
      presetsUiState: {
        ...createDefaultPresetsUiState(),
        categoryFilter: 'seasonal-holidays',
      },
      referenceDate: '2026-11-01',
    });

    // Scalable <select> avoids multi-row pill sprawl while keeping high contrast on iPhone browsers
    assert.equal(html.includes('id="presets-category-select"'), true);
    assert.match(html, /<option value="seasonal-holidays" selected>/);
    assert.equal(html.includes('data-presets-year-calendar="true"'), true);

    // Library topic match count sits on its own dedicated `<p data-preset-theme-matches="...">` line below `Seed:` (without truncate)
    assert.match(
      html,
      /<p class="font-mono-tabular break-all">\s*Seed:[\s\S]*?<\/p>\s*<p data-preset-theme-matches="[^"]+" class="font-mono-tabular text-forest-800 dark:text-slate-300">\s*\d+ topic match(?:es)? in library \(\d+ owned rotatable[^)]*\)\s*<\/p>/
    );
  });

  it('tucks the optional custom proxy URL form into a collapsed Advanced disclosure in Settings by default', async () => {
    const store = await createIsolatedStore();
    const defaultSettingsHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: true,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        deviceBooksProxyUrl: '',
        deviceBooksProxyError: '',
      },
    });

    const disclosureMatch = defaultSettingsHtml.match(
      /<details\s+data-advanced-proxy-disclosure="true"[^>]*>/
    );
    assert.ok(disclosureMatch, 'Expected Advanced proxy disclosure in Settings');
    assert.equal(
      /\bopen\b/.test(disclosureMatch[0]),
      false,
      'Advanced proxy disclosure should stay collapsed by default when unused'
    );
  });
});
