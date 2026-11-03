/**
 * @fileoverview Phase 28 Regression & Feature Tests:
 * 1) Two-Way Read Sync (`toggleRotationBookRead` & `toggleProfileBookRead`):
 *    - Unmarking Read clears `rotation.completedBookIds`, `profile.readHistoryBookIds`, and `book.lastReadAt`
 *      so neither cover badges nor `"On shelf Xd · Read"` / `"Read with <Child>"` remain stuck.
 *    - Off-shelf books expose `data-action="toggle-profile-book-read"` (`Mark Read` / `Read · Undo`)
 *      and inspecting a Saved shelf on `#/rotations` binds to that exact shelf via `inspectedRotationId`.
 * 2) Cover Status Adornos & Compact Phone Labels (`renderBookCoverUsageAdorno` + `compactRecencyLabel`):
 *    - Replaces the ambiguous bare teal dot (`w-2.5 h-2.5`) in `#/library` with clear icon+code frosted adornos
 *      (`shelf-read`, `on-shelf`, `stale-unread`, `cooldown`, `never-rotated`, `long-unseen`, `read-history`).
 *    - Keeps narrow 3-column mobile card usage lines concise (`Cooldown · 19d left`, `Off shelf 2d`) with
 *      full detail preserved in `title` and Book Inspector.
 *    - Configurable via `#/settings` (`showCoverUsageAdornos` + `toggle-cover-usage-adornos` + `(i)` field help).
 * 3) Maintainer Audit Hardening:
 *    - `migrateState` enforces at most one `'active'` rotation per reader profile and strips orphaned
 *      `completedBookIds` and duplicate `readHistoryBookIds`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml } from '../src/types/models.js';
import { createStorageAdapter, migrateState } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  computeBookUsageSummary,
  renderBookCoverUsageAdorno,
} from '../src/features/rotations/usage-insights.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 28 — Two-Way Read Sync Across Active Shelf, Saved Shelves & Off-Shelf Library Books', () => {
  it('1. Unmarking Read on an active-shelf book immediately clears cover Read adorno, "On shelf Xd · Read", readHistoryBookIds, and lastReadAt', async () => {
    const store = await createTestStore();
    const refDate = '2026-11-03T12:00:00.000Z';

    const initialState = store.getState();
    const activeProfile =
      initialState.profiles.find((p) => p.id === initialState.activeProfileId) ||
      initialState.profiles[0];
    const activeRotation = initialState.rotations.find(
      (r) => r.profileId === activeProfile.id && r.status === 'active'
    );
    assert.ok(activeRotation, 'Expected active seed rotation for Maya');

    // In seed data, `book_goodnight_moon` starts marked as Read on Maya's active shelf AND in readHistoryBookIds
    const readBookId = 'book_goodnight_moon';
    assert.ok(activeRotation.completedBookIds.includes(readBookId));
    assert.ok(activeProfile.readHistoryBookIds.includes(readBookId));

    const libBeforeHtml = renderLibraryView({
      state: initialState,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: readBookId,
      },
      referenceDate: refDate,
    });

    // Extract Goodnight Moon card block before unmarking
    const cardRegex = new RegExp(
      `<article data-book-card="${readBookId}"[\\s\\S]*?<\\/article>`
    );
    const cardBefore = libBeforeHtml.match(cardRegex)?.[0] || '';
    assert.match(cardBefore, /data-cover-adorno="shelf-read"/);
    assert.match(cardBefore, /On shelf 4d · Read/);
    assert.match(libBeforeHtml, /Read · Undo/);
    assert.match(libBeforeHtml, /Read with Maya/);

    // Now unmark Read!
    await store.toggleRotationBookRead(activeRotation.id, readBookId);

    const afterUnmarkState = store.getState();
    const afterProfile = afterUnmarkState.profiles.find((p) => p.id === activeProfile.id);
    const afterRot = afterUnmarkState.rotations.find((r) => r.id === activeRotation.id);
    const afterBook = afterUnmarkState.books.find((b) => b.id === readBookId);

    assert.equal(
      afterRot?.completedBookIds.includes(readBookId),
      false,
      'completedBookIds must remove unmarked book'
    );
    assert.equal(
      afterProfile?.readHistoryBookIds.includes(readBookId),
      false,
      'profile.readHistoryBookIds must also remove unmarked book so Read state never sticks'
    );
    assert.equal(
      afterBook?.lastReadAt,
      undefined,
      'book.lastReadAt must clear when no profile still has the book marked read'
    );

    const libAfterHtml = renderLibraryView({
      state: afterUnmarkState,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: readBookId,
      },
      referenceDate: refDate,
    });

    const cardAfter = libAfterHtml.match(cardRegex)?.[0] || '';
    assert.doesNotMatch(
      cardAfter,
      /data-cover-adorno="shelf-read"/,
      'Read cover adorno must disappear immediately after unmarking Read'
    );
    assert.match(
      cardAfter,
      /data-cover-adorno="on-shelf"/,
      'Active-shelf unread book should show distinct on-shelf adorno instead of read badge'
    );
    assert.doesNotMatch(
      cardAfter,
      /On shelf 4d · Read/,
      '"On shelf 4d · Read" must immediately drop "· Read" when unmarked'
    );
    assert.match(cardAfter, /On shelf 4d/);
    assert.doesNotMatch(
      libAfterHtml,
      /Read with Maya/,
      'Book Inspector usage summary must no longer say "Read with Maya" after unmarking'
    );
    assert.match(libAfterHtml, /Unread together/);
  });

  it('2. Allows marking and unmarking Read on off-shelf catalog books via toggleProfileBookRead and binds Saved shelf inspection accurately', async () => {
    const store = await createTestStore();
    const refDate = '2026-11-03T12:00:00.000Z';
    const state0 = store.getState();
    const maya = state0.profiles[0];
    const activeRot0 = state0.rotations.find(
      (r) => r.profileId === maya.id && r.status === 'active'
    );
    assert.ok(activeRot0, 'Expected active seed rotation');

    // Pick a rotatable catalog book that is genuinely OFF Maya's active shelf
    const offShelfBook0 = state0.books.find(
      (b) => !activeRot0.bookIds.includes(b.id) && b.collectionStatus !== 'wishlist'
    );
    assert.ok(offShelfBook0, 'Expected at least one off-shelf catalog book');
    const offShelfId = offShelfBook0.id;

    // Mark off-shelf book read for Maya -> stamps lastReadAt, readHistoryBookIds, and renders Read · Undo
    await store.toggleProfileBookRead(maya.id, offShelfId);
    const stateMarked = store.getState();
    assert.equal(stateMarked.profiles[0].readHistoryBookIds.includes(offShelfId), true);
    assert.ok(stateMarked.books.find((b) => b.id === offShelfId)?.lastReadAt);

    const inspectorMarked = renderBookInspectorModal({
      book: stateMarked.books.find((b) => b.id === offShelfId),
      profiles: stateMarked.profiles,
      rotations: stateMarked.rotations,
      activeProfile: stateMarked.profiles[0],
      activeRotation: activeRot0,
      referenceDate: refDate,
    });
    assert.match(inspectorMarked, /data-action="toggle-profile-book-read"/);
    assert.match(inspectorMarked, /aria-pressed="true"/);
    assert.match(inspectorMarked, /Read · Undo/);
    assert.match(inspectorMarked, /Read with Maya/);

    // Unmark off-shelf book read!
    await store.toggleProfileBookRead(maya.id, offShelfId);
    const stateUnmarked = store.getState();
    assert.equal(stateUnmarked.profiles[0].readHistoryBookIds.includes(offShelfId), false);

    const inspectorAfterUnmark = renderBookInspectorModal({
      book: stateUnmarked.books.find((b) => b.id === offShelfId),
      profiles: stateUnmarked.profiles,
      rotations: stateUnmarked.rotations,
      activeProfile: stateUnmarked.profiles[0],
      activeRotation: stateUnmarked.rotations.find(
        (r) => r.profileId === maya.id && r.status === 'active'
      ),
      referenceDate: refDate,
    });
    assert.match(inspectorAfterUnmark, /aria-pressed="false"/);
    assert.doesNotMatch(inspectorAfterUnmark, /Read with Maya/);

    // Inspecting a book inside a Saved shelf on `#/rotations` binds to that Saved shelf
    // Generate a second rotation (becomes active, demoting the previous active shelf to `'saved'`)
    await store.generateRotation({
      title: 'Winter Bedtime Mix',
      count: 2,
      seed: 'phase28-saved-test',
    });
    const state3 = store.getState();
    const savedRot = state3.rotations.find(
      (r) => r.profileId === maya.id && r.status === 'saved'
    );
    assert.ok(savedRot, 'Expected a saved rotation after generating a new active shelf');
    const savedBookId = savedRot.bookIds[0];

    const rotationsHtml = renderRotationsView({
      state: state3,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        freshnessFilter: 'all',
        isGeneratorOpen: false,
        editingRotationId: null,
      },
      inspectedBookId: savedBookId,
      inspectedRotationId: savedRot.id,
      referenceDate: refDate,
    });
    assert.match(rotationsHtml, new RegExp(`In saved shelf “${escapeHtml(savedRot.title)}”`));
    assert.match(
      rotationsHtml,
      new RegExp(`data-action="toggle-rotation-read"[\\s\\S]*?data-rotation-id="${savedRot.id}"`)
    );
  });
});

describe('Phase 28 — Cover Status Adornos, Compact Phone Labels & Settings Toggle', () => {
  it('3. Replaces ambiguous bare teal cover dot with accessible cover adornos, formats mobile cooldown text concisely, and respects Settings toggle', async () => {
    const store = await createTestStore();
    const refDate = '2026-11-03T12:00:00.000Z';
    const state = store.getState();
    const maya = state.profiles[0];

    const libHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
      },
      referenceDate: refDate,
    });

    // Ambiguous bare unlabeled teal dot (`w-2.5 h-2.5 rounded-full`) must be completely gone
    assert.doesNotMatch(
      libHtml,
      /w-2\.5 h-2\.5 rounded-full/,
      'Ambiguous bare cover dot must be removed from Library book covers'
    );
    assert.match(libHtml, /data-cover-adorno="shelf-read"/);
    assert.match(libHtml, /data-cover-adorno="on-shelf"/);
    assert.match(libHtml, /data-cover-adorno="never-rotated"/);

    // Cooldown book check: 2d ago with 21d cooldown -> 19d left
    const cooldownBook = {
      ...state.books[0],
      id: 'b_cooldown_check',
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

    assert.equal(cooldownUsage.inCooldown, true);
    assert.equal(cooldownUsage.cooldownDaysRemaining, 19);
    // Full label preserved for tooltips / wide surfaces; compact label fits narrow phone grid
    assert.equal(cooldownUsage.shortRecencyLabel, 'Last out 2d ago · 19d cooldown');
    assert.equal(cooldownUsage.compactRecencyLabel, 'Cooldown · 19d left');
    assert.ok(
      cooldownUsage.compactRecencyLabel.length <= 20,
      'Compact mobile recency label must stay <= 20 chars so 3-col phone cards do not clip cooldown info'
    );

    const cooldownAdornoHtml = renderBookCoverUsageAdorno(cooldownBook, cooldownUsage, {
      enabled: true,
    });
    assert.match(cooldownAdornoHtml, /data-cover-adorno="cooldown"/);
    assert.match(cooldownAdornoHtml, />19d</);

    // Stale unread on shelf adorno check
    const staleShelfRot = {
      id: 'rot_stale',
      profileId: maya.id,
      title: 'Stale Shelf',
      status: /** @type {const} */ ('active'),
      bookIds: [cooldownBook.id],
      completedBookIds: [],
      rules: {
        count: 1,
        cooldownDays: 14,
        swapDays: 14,
        requiredFormat: /** @type {const} */ ('any'),
        preferredTags: [],
        varietyMix: true,
        objective: '',
      },
      createdAt: '2026-10-18T12:00:00.000Z',
      updatedAt: '2026-10-18T12:00:00.000Z',
      activatedAt: '2026-10-18T12:00:00.000Z',
    };
    const staleUsage = computeBookUsageSummary(cooldownBook, {
      profiles: [maya],
      rotations: [staleShelfRot],
      activeProfile: maya,
      activeRotation: staleShelfRot,
      staleBookDays: 10,
      referenceDate: refDate,
    });
    const staleAdornoHtml = renderBookCoverUsageAdorno(cooldownBook, staleUsage, {
      enabled: true,
    });
    assert.match(staleAdornoHtml, /data-cover-adorno="stale-unread"/);
    assert.match(staleAdornoHtml, />16d</);

    // Settings view exposes Cover Status Adornos switch + (i) field help (not nested inside <label>)
    const settingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: false,
        showIosInstructions: false,
      },
      adapterDiagnostics: store.getTaggingService().getAdapterDiagnostics(state.settings),
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
      },
    });
    assert.match(settingsHtml, /data-action="toggle-cover-usage-adornos"/);
    assert.match(settingsHtml, /data-help-target="field-help-settings-coverUsageAdornos"/);
    const labelBlocks = settingsHtml.match(/<label\b[\s\S]*?<\/label>/g) || [];
    for (const lbl of labelBlocks) {
      assert.doesNotMatch(lbl, /data-action="toggle-field-help"/);
    }

    // Turning off showCoverUsageAdornos in Settings hides all cover adornos cleanly
    await store.updateSettings({ showCoverUsageAdornos: false });
    assert.equal(store.getState().settings.showCoverUsageAdornos, false);

    const libAdornosHiddenHtml = renderLibraryView({
      state: store.getState(),
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
      },
      referenceDate: refDate,
    });
    assert.doesNotMatch(
      libAdornosHiddenHtml,
      /data-cover-adorno=/,
      'Disabling Cover Status Adornos in Settings must hide all cover adornos in Library'
    );
  });

  it('4. Maintainer Audit: migrateState enforces at most one active rotation per profile and strips orphaned completedBookIds', async () => {
    const store = await createTestStore();
    const raw = store.getState();
    const mayaId = raw.profiles[0].id;

    const pollutedSnapshot = {
      ...raw,
      profiles: raw.profiles.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              readHistoryBookIds: ['book_goodnight_moon', 'book_goodnight_moon', ''],
            }
          : p
      ),
      rotations: [
        {
          ...raw.rotations[0],
          id: 'rot_dup_active_1',
          profileId: mayaId,
          status: /** @type {const} */ ('active'),
          bookIds: ['book_goodnight_moon', 'book_goodnight_moon'],
          completedBookIds: ['book_goodnight_moon', 'orphan_removed_book_id'],
        },
        {
          ...raw.rotations[0],
          id: 'rot_dup_active_2',
          profileId: mayaId,
          status: /** @type {const} */ ('active'),
          bookIds: ['book_snowy_day'],
          completedBookIds: [],
        },
      ],
    };

    const cleaned = migrateState(pollutedSnapshot, '2026-11-03T12:00:00.000Z');
    const activeForMaya = cleaned.rotations.filter(
      (r) => r.profileId === mayaId && r.status === 'active'
    );
    assert.equal(
      activeForMaya.length,
      1,
      'migrateState must guarantee at most one active rotation per child profile'
    );
    assert.equal(cleaned.rotations[1].status, 'saved');
    assert.deepEqual(cleaned.rotations[0].bookIds, ['book_goodnight_moon']);
    assert.deepEqual(
      cleaned.rotations[0].completedBookIds,
      ['book_goodnight_moon'],
      'migrateState must prune orphaned completedBookIds not present on the shelf'
    );
    assert.deepEqual(cleaned.profiles[0].readHistoryBookIds, ['book_goodnight_moon']);
  });
});
