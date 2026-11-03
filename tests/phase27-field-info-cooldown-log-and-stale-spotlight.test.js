/**
 * @fileoverview Phase 27 Regression & Feature Tests:
 * 1) Clickable `(i)` Field Help Icons (`field-help.js` + Generate Shelf, Unified Rotation Editor,
 *    Presets Form, Profile Form, and Settings) with accessible `aria-expanded` / `aria-controls`
 *    and zero `<button>`-inside-`<label>` nesting.
 * 2) Rotation History / "Cooldown" Log (`usage-insights.js`, `store.js`, `rotation-engine.js`,
 *    `recommendations.js`, `book-inspector-modal.js`, `rotations-view.js`, `library-view.js`,
 *    and structured AI library usage context in `ai-tag-adapter.js`).
 * 3) "Stale Book" Spotlight (`findStaleShelfBooks`, `renderStaleBooksSpotlightBanner`,
 *    `home-view.js`, `rotations-view.js`, and Settings configuration toggles).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  FIELD_HELP_COPY,
  buildFieldHelpPanelId,
  renderFieldInfoButton,
  renderFieldInfoPanel,
} from '../src/ui/components/field-help.js';
import {
  computeBookUsageSummary,
  countRotationsSinceLastSeen,
  findStaleShelfBooks,
  recordBooksRotated,
  renderStaleBooksSpotlightBanner,
  buildAiLibraryUsageContext,
} from '../src/features/rotations/usage-insights.js';
import {
  generateRotationSelection,
  scoreEligibleBooks,
} from '../src/features/rotations/rotation-engine.js';
import { getProfileRecommendations } from '../src/features/tagging/recommendations.js';
import { createCustomEndpointAiAdapter } from '../src/features/tagging/ai-tag-adapter.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderPresetsView, createDefaultPresetsUiState } from '../src/features/rotations/presets-view.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderProfileFormSheet } from '../src/ui/components/profile-sheets.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 27 — Clickable (i) Field Help Icons Across Rotation, Preset, Profile & Settings Forms', () => {
  it('1. Renders accessible (i) info buttons & collapsible panels for Cooldown, Swap Cycle, Seed, Objective, Book Count, Variety & Thresholds without nesting buttons inside <label>', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const activeRotation = state.rotations.find((r) => r.status === 'active') || state.rotations[0];

    // Unit check on field-help primitives
    assert.ok(FIELD_HELP_COPY.cooldownDays.body.includes('rests in the storage box'));
    assert.ok(FIELD_HELP_COPY.swapDays.body.includes('Swap Day'));
    assert.ok(FIELD_HELP_COPY.seed.body.includes('same seed'));
    const panelId = buildFieldHelpPanelId('cooldownDays', 'gen-rot');
    const btnHtml = renderFieldInfoButton({ helpKey: 'cooldownDays', scope: 'gen-rot' });
    const panelHtml = renderFieldInfoPanel({ helpKey: 'cooldownDays', scope: 'gen-rot' });
    assert.match(btnHtml, new RegExp(`data-action="toggle-field-help"`));
    assert.match(btnHtml, new RegExp(`data-help-target="${panelId}"`));
    assert.match(btnHtml, /aria-expanded="false"/);
    assert.match(panelHtml, new RegExp(`id="${panelId}"`));
    assert.match(panelHtml, /\bhidden\b/);

    // 1a. Rotations view: Generate Shelf sheet + Unified Inline Edit form
    const rotationsHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        freshnessFilter: 'all',
        isGeneratorOpen: true,
        editingRotationId: activeRotation.id,
      },
    });

    for (const key of ['objective', 'bookCount', 'swapDays', 'cooldownDays', 'seed', 'varietyMix']) {
      assert.match(
        rotationsHtml,
        new RegExp(`data-help-target="field-help-gen-rot-${key}"`),
        `Generate Shelf sheet should render (i) button for ${key}`
      );
      assert.match(
        rotationsHtml,
        new RegExp(`id="field-help-gen-rot-${key}"[^>]*hidden`),
        `Generate Shelf sheet should render hidden help panel for ${key}`
      );
    }

    for (const key of ['swapDays', 'cooldownDays', 'bookCount', 'seed', 'varietyMix']) {
      assert.match(
        rotationsHtml,
        new RegExp(`data-help-target="field-help-edit-${activeRotation.id}-${key}"`),
        `Unified inline rotation editor should render (i) button for ${key}`
      );
    }

    // 1b. Presets form sheet
    const presetsHtml = renderPresetsView({
      state,
      presetsUiState: {
        ...createDefaultPresetsUiState(),
        isFormOpen: true,
      },
    });
    for (const key of ['suggestedStart', 'bookCount', 'swapDays', 'cooldownDays', 'seed', 'varietyMix']) {
      assert.match(
        presetsHtml,
        new RegExp(`data-help-target="field-help-preset-${key}"`),
        `Preset form should render (i) button for ${key}`
      );
    }

    // 1c. Profile form sheet
    const profileSheetHtml = renderProfileFormSheet({
      state,
      isOpen: true,
      editingProfileId: state.profiles[0].id,
    });
    assert.match(profileSheetHtml, /data-help-target="field-help-profile-defaultRotationSize"/);
    assert.match(profileSheetHtml, /data-help-target="field-help-profile-cooldownDays"/);

    // 1d. Settings view
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
    assert.match(settingsHtml, /data-help-target="field-help-settings-presetDaysBefore"/);
    assert.match(settingsHtml, /data-help-target="field-help-settings-presetDaysAfter"/);
    assert.match(settingsHtml, /data-help-target="field-help-settings-staleBookDays"/);

    // Ensure no <label> wraps a toggle-field-help <button> (prevents accidental checkbox toggling)
    for (const html of [rotationsHtml, presetsHtml, profileSheetHtml, settingsHtml]) {
      const labelBlocks = html.match(/<label\b[\s\S]*?<\/label>/g) || [];
      for (const lbl of labelBlocks) {
        assert.doesNotMatch(
          lbl,
          /data-action="toggle-field-help"/,
          'Field help button must never be nested inside a <label> element'
        );
      }
    }
  });
});

describe('Phase 27 — Rotation History / "Cooldown" Log, Multi-Cycle Freshness Boost & Parent Discovery', () => {
  it('2. Tracks rotationCount, rotationHistory, slotAddedAt, and lastReadAt across generate, activate, replace, add, and read actions', async () => {
    const store = await createTestStore();

    // Generate a new shelf for Maya
    const created = await store.generateRotation({
      title: 'Fresh Autumn Picks',
      count: 3,
      cooldownDays: 14,
      swapDays: 10,
      seed: 'phase27-log-test',
    });

    assert.equal(created.bookIds.length, 3);
    assert.ok(created.slotAddedAt, 'Generated rotation must track per-book slotAddedAt timestamps');
    const createdSlots = created.slotAddedAt || {};
    for (const id of created.bookIds) {
      assert.equal(typeof createdSlots[id], 'string');
      const book = store.getState().books.find((b) => b.id === id);
      assert.ok(book, `Expected book ${id}`);
      assert.ok(book.lastRotatedAt, 'Rotated book must stamp lastRotatedAt');
      assert.ok((book.rotationCount || 0) >= 1, 'Rotated book must increment rotationCount');
      assert.ok(Array.isArray(book.rotationHistory) && book.rotationHistory.length >= 1);
      assert.equal(book.rotationHistory[0]?.rotationId, created.id);
    }

    // Mark first book as read -> stamps book.lastReadAt
    const firstBookId = created.bookIds[0];
    await store.toggleRotationBookRead(created.id, firstBookId);
    const readBook = store.getState().books.find((b) => b.id === firstBookId);
    assert.ok(readBook?.lastReadAt, 'Marking a rotation book read must stamp book.lastReadAt');

    // Manual replace updates slotAddedAt and rotationHistory for the incoming book
    const offShelfBook = store
      .getState()
      .books.find((b) => !created.bookIds.includes(b.id) && b.collectionStatus !== 'wishlist');
    assert.ok(offShelfBook, 'Expected an off-shelf book to swap in');
    const priorCount =
      typeof offShelfBook.rotationCount === 'number'
        ? offShelfBook.rotationCount
        : offShelfBook.lastRotatedAt
          ? 1
          : 0;
    await store.replaceRotationBookManual(created.id, created.bookIds[1], offShelfBook.id);

    const updatedBook = store.getState().books.find((b) => b.id === offShelfBook.id);
    const updatedRot = store.getState().rotations.find((r) => r.id === created.id);
    assert.equal(updatedBook?.rotationCount, priorCount + 1);
    assert.ok(updatedRot?.slotAddedAt?.[offShelfBook.id]);
  });

  it('3. Boosts books unseen for 2–3+ rotations or never rotated in both Rotation Engine and Suggested Next recommendations', () => {
    /** @type {import('../src/types/models.js').ChildProfile} */
    const profile = {
      id: 'child_maya',
      name: 'Maya',
      age: 4,
      avatarTone: 'teal',
      readingStage: 'picture-book',
      favoriteTopics: ['animals'],
      defaultRotationSize: 2,
      cooldownDays: 7,
      readHistoryBookIds: [],
      createdAt: '2026-08-01T00:00:00.000Z',
    };

    /** @type {import('../src/types/models.js').Book[]} */
    const books = [
      {
        id: 'b_never',
        isbn13: '9780000000001',
        title: 'Never Out Bear',
        authors: ['Author A'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 3,
        ageMax: 6,
        tags: ['animals'],
        spineColor: '#2B5B6C',
        sources: [],
        addedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'b_three_cycles_ago',
        isbn13: '9780000000002',
        title: 'Three Cycles Ago Fox',
        authors: ['Author B'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 3,
        ageMax: 6,
        tags: ['animals'],
        spineColor: '#5B4B3A',
        lastRotatedAt: '2026-09-01T00:00:00.000Z',
        rotationCount: 1,
        sources: [],
        addedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'b_prev_cycle',
        isbn13: '9780000000003',
        title: 'Just Out Last Cycle Owl',
        authors: ['Author C'],
        format: 'hardcover',
        readingStage: 'picture-book',
        ageMin: 3,
        ageMax: 6,
        tags: ['animals'],
        spineColor: '#3D6B58',
        // Out of 7-day cooldown (10 days ago), so NOT in cooldown, but was on the very last shelf!
        lastRotatedAt: '2026-10-24T00:00:00.000Z',
        rotationCount: 3,
        sources: [],
        addedAt: '2026-08-01T00:00:00.000Z',
      },
    ];

    /** @type {import('../src/types/models.js').RotationList[]} */
    const rotations = [
      {
        id: 'rot_3_old',
        profileId: 'child_maya',
        title: 'Cycle 1',
        status: 'archived',
        bookIds: ['b_three_cycles_ago'],
        completedBookIds: [],
        rules: { count: 1, cooldownDays: 7, requiredFormat: 'any', preferredTags: [], varietyMix: true, objective: '' },
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        activatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'rot_2_mid',
        profileId: 'child_maya',
        title: 'Cycle 2',
        status: 'archived',
        bookIds: ['b_other_1'],
        completedBookIds: [],
        rules: { count: 1, cooldownDays: 7, requiredFormat: 'any', preferredTags: [], varietyMix: true, objective: '' },
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        activatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'rot_1_recent',
        profileId: 'child_maya',
        title: 'Cycle 3',
        status: 'archived',
        bookIds: ['b_prev_cycle'],
        completedBookIds: [],
        rules: { count: 1, cooldownDays: 7, requiredFormat: 'any', preferredTags: [], varietyMix: true, objective: '' },
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
        activatedAt: '2026-10-24T00:00:00.000Z',
      },
    ];

    const nowIso = '2026-11-03T12:00:00.000Z';
    assert.equal(countRotationsSinceLastSeen(books[0], rotations, 'child_maya'), null);
    assert.equal(countRotationsSinceLastSeen(books[1], rotations, 'child_maya'), 2);
    assert.equal(countRotationsSinceLastSeen(books[2], rotations, 'child_maya'), 0);

    const scored = scoreEligibleBooks({
      books,
      profile,
      rules: {
        count: 2,
        cooldownDays: 7,
        requiredFormat: 'any',
        preferredTags: ['animals'],
        varietyMix: true,
        objective: 'Animals',
      },
      rotations,
      nowIso,
    });

    const scoreMap = new Map(scored.map((s) => [s.book.id, s.baseScore]));
    assert.ok(
      (scoreMap.get('b_never') ?? 0) > (scoreMap.get('b_prev_cycle') ?? 0),
      'Never-rotated book must outscore book from the previous rotation'
    );
    assert.ok(
      (scoreMap.get('b_three_cycles_ago') ?? 0) > (scoreMap.get('b_prev_cycle') ?? 0),
      'Book unseen for 2+ rotations must outscore book from the previous rotation'
    );

    const selection = generateRotationSelection({
      books,
      profile,
      rules: {
        count: 2,
        cooldownDays: 7,
        requiredFormat: 'any',
        preferredTags: ['animals'],
        varietyMix: true,
        objective: 'Animals',
        seed: 'diverse-cycle',
      },
      rotations,
      nowIso,
    });
    assert.deepEqual(
      new Set(selection.selectedBookIds),
      new Set(['b_never', 'b_three_cycles_ago']),
      '2-book rotation should pick the never-rotated book and the 2-rotations-unseen book over the previous-cycle book'
    );

    const recs = getProfileRecommendations({ books, profile, rotations, limit: 3 });
    assert.equal(recs[0]?.book.id, 'b_never');
    assert.ok(recs[0]?.matchReasons.includes('Never on shelf yet'));
    const threeAgoRec = recs.find((r) => r.book.id === 'b_three_cycles_ago');
    assert.ok(
      threeAgoRec?.matchReasons.some((reason) => reason.includes('Unseen for 2 rotations')),
      'Recommendations should surface "Unseen for N rotations" reason'
    );
  });

  it('4. Surfaces shelf history in Book Inspector, Picker Modal (with Long Unseen filter), Library filters/sorting, and structured AI usage context', async () => {
    const store = await createTestStore();
    const refDate = '2026-11-15T12:00:00.000Z';
    const state = store.getState();
    const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    const activeRotation = state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active');
    assert.ok(activeRotation, 'Expected active seed rotation');

    // Pick a never-rotated off-shelf book and an active-shelf book
    const offShelfNeverRotated = state.books.find(
      (b) => !b.lastRotatedAt && !activeRotation.bookIds.includes(b.id) && b.collectionStatus !== 'wishlist'
    );
    assert.ok(offShelfNeverRotated, 'Expected at least one never-rotated book in seed library');

    // 4a. Book Inspector shows usage summary when enabled, hides when disabled
    const inspectorOnHtml = renderBookInspectorModal({
      book: offShelfNeverRotated,
      profiles: state.profiles,
      rotations: state.rotations,
      activeProfile,
      activeRotation,
      showRotationHistory: true,
      referenceDate: refDate,
    });
    assert.match(inspectorOnHtml, /data-book-usage-summary="true"/);
    assert.match(inspectorOnHtml, /Never rotated/);

    const inspectorOffHtml = renderBookInspectorModal({
      book: offShelfNeverRotated,
      profiles: state.profiles,
      rotations: state.rotations,
      activeProfile,
      activeRotation,
      showRotationHistory: false,
      referenceDate: refDate,
    });
    assert.doesNotMatch(inspectorOffHtml, /data-book-usage-summary="true"/);

    // 4b. Replace Picker Modal renders usage lines and filters Long Unseen
    const pickerAllHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: 'replace',
        rotationId: activeRotation.id,
        targetBookId: activeRotation.bookIds[0] || null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        freshnessFilter: 'unseen',
        isGeneratorOpen: false,
        editingRotationId: null,
      },
      referenceDate: refDate,
    });
    assert.match(pickerAllHtml, /data-action="set-picker-freshness-filter"/);
    assert.match(pickerAllHtml, /data-picker-usage-line="true"/);
    assert.match(pickerAllHtml, /Never rotated/);

    // 4c. Library View supports freshnessFilter ('never-rotated') and sortBy ('longest-off-shelf')
    const libraryNeverRotatedHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        freshnessFilter: 'never-rotated',
        sortBy: 'longest-off-shelf',
        isFilterDrawerOpen: true,
        searchQuery: '',
        inspectedBookId: null,
      },
      referenceDate: refDate,
    });
    assert.match(libraryNeverRotatedHtml, /data-action="set-library-freshness"/);
    assert.match(libraryNeverRotatedHtml, /data-action="set-library-sort"/);
    assert.match(libraryNeverRotatedHtml, /data-library-usage-line="true"/);
    assert.doesNotMatch(
      libraryNeverRotatedHtml,
      new RegExp(`data-book-card="${activeRotation.bookIds[0]}"`),
      'never-rotated filter must exclude books currently on the active shelf'
    );

    // 4d. Structured AI Library Usage Context + Custom Endpoint payload includes usage digest
    const digest = store.getLibraryUsageContext(refDate);
    assert.equal(digest.summaryCounts.totalBooks, state.books.length);
    assert.ok(digest.summaryCounts.neverRotatedCount >= 1);
    assert.ok(Array.isArray(digest.books));

    /** @type {any} */
    let capturedBody = null;
    const customAdapter = createCustomEndpointAiAdapter({
      fetchImpl: /** @type {typeof fetch} */ (async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            tags: ['animals', 'bedtime'],
            ageMin: 2,
            ageMax: 5,
            readingStage: 'picture-book',
            readingLevelHint: 'Ages 2–5',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }),
    });

    const singleUsage = computeBookUsageSummary(offShelfNeverRotated, {
      profiles: state.profiles,
      rotations: state.rotations,
      activeProfile,
      activeRotation,
      referenceDate: refDate,
    });
    await customAdapter.enrichBook(
      {
        title: offShelfNeverRotated.title,
        authors: offShelfNeverRotated.authors,
        format: offShelfNeverRotated.format,
        tags: offShelfNeverRotated.tags,
        usageContext: {
          loved: singleUsage.loved,
          freshnessTier: singleUsage.freshnessTier,
          rotationCount: singleUsage.rotationCount,
          lastRotatedAt: singleUsage.lastRotatedAt,
          daysSinceLastRotated: singleUsage.daysSinceLastRotated,
          rotationsSinceLastOut: singleUsage.rotationsSinceLastOut,
          inCooldown: singleUsage.inCooldown,
          isCurrentlyOnActiveShelf: singleUsage.isCurrentlyOnActiveShelf,
          isReadByActiveProfile: singleUsage.isReadByActiveProfile,
          lastReadAt: singleUsage.lastReadAt,
        },
      },
      {
        settings: {
          ...state.settings,
          aiEnrichmentOptIn: true,
          aiAdapterId: 'custom-endpoint',
          aiEndpointUrl: 'https://example.org/ai-enrich',
        },
      }
    );
    assert.ok(capturedBody?.book?.usage, 'Custom AI endpoint payload must receive structured book.usage context');
    assert.equal(capturedBody.book.usage.freshnessTier, 'never-rotated');
  });
});

describe('Phase 27 — "Stale Book" Spotlight & Settings Toggles', () => {
  it('5. Highlights unread books sitting on the active shelf >= staleBookDays, respects slotAddedAt swaps, dismissals, and Settings toggles', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    const activeRotation = state.rotations.find(
      (r) => r.profileId === activeProfile.id && r.status === 'active'
    );
    assert.ok(activeRotation, 'Expected active seed rotation for Maya');

    // Seed rotation was activated on 2026-10-30T12:00:00.000Z:
    // - After 4 days (2026-11-03), 0 books exceed default 10-day stale threshold
    const earlyCheck = findStaleShelfBooks({
      rotation: activeRotation,
      books: state.books,
      staleBookDays: 10,
      referenceDate: '2026-11-03T12:00:00.000Z',
    });
    assert.equal(earlyCheck.staleItems.length, 0);

    // - After 16 days (2026-11-15), unread shelf books are flagged while already-read book_goodnight_moon is excluded!
    const staleCheck = findStaleShelfBooks({
      rotation: activeRotation,
      books: state.books,
      staleBookDays: 10,
      referenceDate: '2026-11-15T12:00:00.000Z',
    });
    assert.equal(
      staleCheck.staleItems.length,
      activeRotation.bookIds.length - activeRotation.completedBookIds.length
    );
    assert.ok(
      staleCheck.staleItems.every((item) => !activeRotation.completedBookIds.includes(item.book.id)),
      'Books already marked read on the active shelf must never appear in Stale Book Spotlight'
    );

    // If one unread book was swapped in just 2 days ago via slotAddedAt, it is NOT flagged stale!
    const recentlySwappedId = staleCheck.staleItems[0].book.id;
    const rotWithRecentSwap = {
      ...activeRotation,
      slotAddedAt: {
        [recentlySwappedId]: '2026-11-13T12:00:00.000Z',
      },
    };
    const afterSwapCheck = findStaleShelfBooks({
      rotation: rotWithRecentSwap,
      books: state.books,
      staleBookDays: 10,
      referenceDate: '2026-11-15T12:00:00.000Z',
    });
    assert.ok(
      afterSwapCheck.staleItems.every((item) => item.book.id !== recentlySwappedId),
      'Book swapped onto the shelf 2 days ago must not be flagged stale at 10-day threshold'
    );

    // Home view renders the compact Stale Book Spotlight banner with Mark Read, Swap Fresh, and Dismiss
    const homeWithStaleHtml = renderHomeView({
      state,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
        dismissedStaleSpotlightKeys: [],
      },
      referenceDate: '2026-11-15T12:00:00.000Z',
    });
    assert.match(homeWithStaleHtml, /data-stale-spotlight-banner="true"/);
    assert.match(homeWithStaleHtml, /Stale Book Spotlight/);
    assert.match(homeWithStaleHtml, /Mark Read/);
    assert.match(homeWithStaleHtml, /Swap Fresh/);
    assert.match(homeWithStaleHtml, /data-action="dismiss-stale-spotlight"/);

    // Dismissing the banner key suppresses it cleanly
    const homeDismissedHtml = renderHomeView({
      state,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
        dismissedStaleSpotlightKeys: [staleCheck.dismissKey],
      },
      referenceDate: '2026-11-15T12:00:00.000Z',
    });
    assert.doesNotMatch(homeDismissedHtml, /data-stale-spotlight-banner="true"/);

    // Disabling Stale Book Spotlight or raising staleBookDays in Settings persists & suppresses the banner
    await store.updateSettings({
      enableStaleBookSpotlight: false,
      staleBookDays: 21,
      enableRotationHistoryInsights: false,
    });
    const updatedSettings = store.getState().settings;
    assert.equal(updatedSettings.enableStaleBookSpotlight, false);
    assert.equal(updatedSettings.staleBookDays, 21);
    assert.equal(updatedSettings.enableRotationHistoryInsights, false);

    const homeDisabledHtml = renderHomeView({
      state: store.getState(),
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
        dismissedStaleSpotlightKeys: [],
      },
      referenceDate: '2026-11-15T12:00:00.000Z',
    });
    assert.doesNotMatch(homeDisabledHtml, /data-stale-spotlight-banner="true"/);

    // Record helper also preserves legacy lastRotatedAt when upgrading older catalog entries
    const upgraded = recordBooksRotated(
      [
        {
          ...state.books[0],
          lastRotatedAt: '2026-09-10T00:00:00.000Z',
          rotationCount: undefined,
          rotationHistory: undefined,
        },
      ],
      [state.books[0].id],
      { rotatedAt: '2026-11-03T12:00:00.000Z', rotationId: 'rot_new', profileId: activeProfile.id }
    );
    assert.equal(upgraded[0]?.rotationCount, 2);
    assert.equal(upgraded[0]?.rotationHistory?.length, 2);
    assert.equal(upgraded[0]?.rotationHistory?.[0]?.rotatedAt, '2026-11-03T12:00:00.000Z');
    assert.equal(upgraded[0]?.rotationHistory?.[1]?.rotatedAt, '2026-09-10T00:00:00.000Z');

    // buildAiLibraryUsageContext produces complete machine-readable summary
    const aiDigest = buildAiLibraryUsageContext({
      books: state.books,
      profiles: state.profiles,
      rotations: state.rotations,
      activeProfileId: activeProfile.id,
      staleBookDays: 10,
      referenceDate: '2026-11-15T12:00:00.000Z',
    });
    assert.ok(aiDigest.summaryCounts.staleOnShelfCount >= 1);
  });
});
