/**
 * @fileoverview Independent Family Book Catalog page (`#/library`):
 * - Clean, unboxed book cover grid (Dynamic Cover Tint applies ONLY to the clicked Book Detail card)
 * - Conflict-free unified Owner scope:
 *   - Top bar offers 1-tap `For <ActiveChild>` (`[activeProfile.id, 'shared']`) and `All Books` (`[]`),
 *     plus a `Filters` button that opens the Left Slide-In Filter Sidebar (`data-library-filter-drawer="true"`).
 *   - Selecting or multi-selecting owners inside the Left Filter Sidebar (`Maya`, `Leo`, `Clara`, `Shared`, custom owners)
 *     updates the SAME unified owner selection so selecting `Leo` never conflicts with `For Maya`!
 * - Compact icon + tabular count primary quick filters (`All`, `[bookmark] 2`, `[heart] 1` without parentheses)
 * - Left Slide-In Filter Sidebar organized into clean groups:
 *   1. Shelf (`All`, `Owned`, `Wishlist`, `Loved`)
 *   2. Format (`Board Book`, `Paperback`, `Hardcover` — multi-select)
 *   3. Themes & Topics (top tags across the family library — multi-select)
 *   4. Owner (`Maya`, `Leo`, `Shared`, custom household owners — multi-select)
 *   5. Book Care (`Good`, `Needs Care`)
 */

import {
  computeOwnerInitials,
  escapeHtml,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  isBookRotatable,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeOwnersList,
} from '../../types/models.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderBookInspectorModal } from '../../ui/components/book-inspector-modal.js';
import { AVATAR_TONES, renderOwnerBadgesStrip } from '../../ui/components/profile-sheets.js';
import { renderIcon } from '../../ui/icons.js';
import { computeBookUsageSummary } from '../rotations/usage-insights.js';

/**
 * Resolves the effective normalized list of selected owner keys from `uiState`.
 * Returns `[]` when all owners are included (`ownerFilter === 'all'`).
 *
 * @param {{
 *   ownerFilter?: string,
 *   selectedOwners?: string[],
 *   activeProfileId: string
 * }} params
 * @returns {string[]}
 */
export function resolveEffectiveSelectedOwners({
  ownerFilter = 'all',
  selectedOwners = [],
  activeProfileId,
}) {
  if (Array.isArray(selectedOwners) && selectedOwners.length > 0) {
    return normalizeOwnersList(selectedOwners);
  }
  if (ownerFilter === 'active-reader') {
    return normalizeOwnersList([activeProfileId, 'shared']);
  }
  if (ownerFilter && ownerFilter !== 'all' && ownerFilter !== 'custom') {
    return normalizeOwnersList([ownerFilter]);
  }
  return [];
}

/**
 * Toggles an owner in the unified multi-select owner state without ever trapping the user
 * inside an active-reader contradiction (e.g. clicking `Leo` when `For Maya` was active).
 *
 * - If `For Maya` (`'active-reader'`) or `'all'` was active when the user taps a specific owner
 *   in the multi-select list (`toggledOwner`), we start fresh with `[toggledOwner]` if they tapped
 *   a non-active owner (like `Leo`), or toggle within `[activeProfileId, 'shared']` if they unchecked
 *   `Maya` or `Shared`!
 * - Wait: let's make it completely intuitive:
 *   - When `currentSelectedOwners` is already populated (`ownerFilter === 'custom'`), toggle `toggledOwner` in `currentSelectedOwners`
 *     (if none remain, reset to `ownerFilter: 'all', selectedOwners: []`).
 *   - When `currentOwnerFilter === 'all'`, tapping `toggledOwner` selects `[toggledOwner]` (`ownerFilter: 'custom'`).
 *   - When `currentOwnerFilter === 'active-reader'` (`For Maya` = `[Maya, Shared]`):
 *     - If user taps `Leo` (an owner NOT in `[Maya, Shared]`), add `Leo` OR select `Leo`?
 *       Think about both: if `Maya` and `Shared` are shown as checked in the Owner section when `For Maya` is active,
 *       checking `Leo` adds `Leo` -> `[Maya, Shared, Leo]`, OR unchecking `Maya` leaves `[Shared]`!
 *       AND if user wants ONLY `Leo`, unchecking `Maya` & `Shared` or tapping `All Books` -> `Leo` works,
 *       AND in BOTH cases `Leo`'s books immediately appear!
 *
 * @param {{
 *   currentOwnerFilter?: string,
 *   currentSelectedOwners?: string[],
 *   toggledOwner: string,
 *   activeProfileId: string
 * }} params
 * @returns {{ ownerFilter: string, selectedOwners: string[] }}
 */
export function toggleUnifiedOwnerSelection({
  currentOwnerFilter = 'all',
  currentSelectedOwners = [],
  toggledOwner,
  activeProfileId,
}) {
  const cleanTarget = String(toggledOwner || '').trim();
  if (!cleanTarget) {
    return { ownerFilter: 'all', selectedOwners: [] };
  }

  const baseList =
    currentOwnerFilter === 'custom' && currentSelectedOwners.length > 0
      ? normalizeOwnersList(currentSelectedOwners)
      : currentOwnerFilter === 'active-reader'
        ? normalizeOwnersList([activeProfileId, 'shared'])
        : currentOwnerFilter !== 'all' && currentOwnerFilter !== 'custom'
          ? normalizeOwnersList([currentOwnerFilter])
          : [];

  const targetLower = cleanTarget.toLowerCase();
  const exists = baseList.some((o) => o.toLowerCase() === targetLower);
  const nextList = exists
    ? baseList.filter((o) => o.toLowerCase() !== targetLower)
    : normalizeOwnersList([...baseList, cleanTarget]);

  if (nextList.length === 0) {
    return { ownerFilter: 'all', selectedOwners: [] };
  }

  // Check if nextList exactly matches `[activeProfileId, 'shared']`
  const lowerSet = new Set(nextList.map((o) => o.toLowerCase()));
  if (
    lowerSet.size === 2 &&
    lowerSet.has(activeProfileId.toLowerCase()) &&
    lowerSet.has('shared')
  ) {
    return { ownerFilter: 'active-reader', selectedOwners: [] };
  }

  return {
    ownerFilter: 'custom',
    selectedOwners: nextList,
  };
}

/**
 * Renders the slide-in Left Filter Sidebar (`data-library-filter-drawer="true"`).
 * @param {{
 *   isOpen: boolean,
 *   catalogFilter: string,
 *   selectedFormats: string[],
 *   selectedThemes: string[],
 *   effectiveOwners: string[],
 *   conditionFilter: string,
 *   freshnessFilter: string,
 *   sortBy: string,
 *   showRotationHistory: boolean,
 *   availableThemes: Array<{ tag: string, count: number }>,
 *   ownerChoices: Array<{ key: string, label: string, initial: string, tone: string }>,
 *   filteredCount: number,
 *   activeFilterCount: number
 * }} params
 * @returns {string}
 */
function renderLibraryFilterDrawer({
  isOpen,
  catalogFilter,
  selectedFormats,
  selectedThemes,
  effectiveOwners,
  conditionFilter,
  freshnessFilter,
  sortBy,
  showRotationHistory,
  availableThemes,
  ownerChoices,
  filteredCount,
  activeFilterCount,
}) {
  if (!isOpen) return '';

  const shelfOptions = [
    { id: 'all', label: 'All Books' },
    { id: 'owned', label: 'Owned' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'loved', label: 'Loved' },
  ];

  const formatOptions = [
    { id: 'board-book', label: 'Board Book' },
    { id: 'paperback', label: 'Paperback' },
    { id: 'hardcover', label: 'Hardcover' },
  ];

  const freshnessOptions = [
    { id: 'all', label: 'Any Shelf History' },
    { id: 'long-unseen', label: 'Long Unseen (2+ cycles / Never)' },
    { id: 'never-rotated', label: 'Never Rotated' },
    { id: 'ready', label: 'Ready (Out of Cooldown)' },
    { id: 'in-cooldown', label: 'In Cooldown' },
    { id: 'unread', label: 'Unread' },
  ];

  const sortOptions = [
    { id: 'default', label: 'Library Default' },
    { id: 'longest-off-shelf', label: 'Longest Off-Shelf First' },
    { id: 'recently-rotated', label: 'Recently Rotated First' },
    { id: 'title', label: 'Title (A–Z)' },
  ];

  const conditionOptions = [
    { id: 'all', label: 'Any Condition' },
    { id: 'good', label: 'Good Only' },
    { id: 'needs-care', label: 'Needs Care (Torn / Broken / Retired)' },
  ];

  return `
    <div
      data-library-filter-drawer="true"
      data-backdrop-action="close-library-filters"
      class="sheet-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex justify-start"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-filter-drawer-title"
    >
      <aside
        class="animate-drawer-left w-[94vw] sm:w-[440px] md:w-[480px] max-w-[95vw] h-full bg-ivory dark:bg-night-900 border-r border-linen-200 dark:border-night-700 shadow-2xl flex flex-col pt-safe"
      >
        <!-- Drawer Header -->
        <div class="px-5 py-4 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            ${renderIcon('filter', 'w-4 h-4 text-forest-700 dark:text-[#5ED3DA]')}
            <h2 id="library-filter-drawer-title" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              Filter Library
            </h2>
          </div>

          <button
            type="button"
            data-action="close-library-filters"
            aria-label="Close filters sidebar"
            class="min-h-[40px] min-w-[40px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center transition-colors"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <!-- Grouped Filter Sections -->
        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <!-- Group 1: Shelf -->
          <section aria-labelledby="filter-group-shelf" class="space-y-2">
            <h3 id="filter-group-shelf" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
              Shelf
            </h3>
            <div class="flex flex-wrap gap-1.5">
              ${shelfOptions
                .map((opt) => {
                  const active = catalogFilter === opt.id;
                  return `
                    <button
                      type="button"
                      data-action="set-catalog-filter"
                      data-filter="${opt.id}"
                      aria-pressed="${active ? 'true' : 'false'}"
                      class="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                          : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:bg-linen-100 dark:hover:bg-night-800'
                      }"
                    >
                      ${escapeHtml(opt.label)}
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>

          <!-- Group 2: Format / Type (Multi-select) -->
          <section aria-labelledby="filter-group-format" class="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <h3 id="filter-group-format" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                Book Type
              </h3>
              <span class="text-[11px] text-stone-ink/80 dark:text-slate-400">Multi-select</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              ${formatOptions
                .map((fmt) => {
                  const active = selectedFormats.includes(fmt.id);
                  return `
                    <button
                      type="button"
                      data-action="toggle-library-format"
                      data-format="${fmt.id}"
                      aria-pressed="${active ? 'true' : 'false'}"
                      class="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                          : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:bg-linen-100 dark:hover:bg-night-800'
                      }"
                    >
                      ${escapeHtml(fmt.label)}
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>

          <!-- Group 3: Owner / Reader (Unified Multi-select) -->
          <section aria-labelledby="filter-group-owner" class="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
            <div class="flex items-center justify-between gap-2">
              <h3 id="filter-group-owner" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                Owner / Reader
              </h3>
              ${
                effectiveOwners.length > 0
                  ? `<button
                      type="button"
                      data-action="set-owner-filter"
                      data-owner="all"
                      class="text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline"
                    >
                      Include All
                    </button>`
                  : `<span class="text-[11px] text-stone-ink/80 dark:text-slate-400">All included</span>`
              }
            </div>
            <p class="text-[11px] text-stone-ink dark:text-slate-400 leading-snug">
              Select any combination of readers or Shared books.
            </p>
            <div class="flex flex-wrap gap-1.5">
              ${ownerChoices
                .map((chip) => {
                  const active = effectiveOwners.some(
                    (o) => o.toLowerCase() === chip.key.toLowerCase()
                  );
                  return `
                    <button
                      type="button"
                      data-action="toggle-library-owner"
                      data-owner="${escapeHtml(chip.key)}"
                      aria-pressed="${active ? 'true' : 'false'}"
                      class="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                          : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:bg-linen-100 dark:hover:bg-night-800'
                      }"
                    >
                      <span class="w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${
                        AVATAR_TONES[chip.tone] || AVATAR_TONES.teal
                      }">${escapeHtml(chip.initial)}</span>
                      <span>${escapeHtml(chip.label)}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>

          <!-- Group 4: Themes & Topics (Multi-select) -->
          ${
            availableThemes.length > 0
              ? `
                <section aria-labelledby="filter-group-themes" class="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <h3 id="filter-group-themes" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                      Themes & Topics
                    </h3>
                    <span class="text-[11px] text-stone-ink/80 dark:text-slate-400">Multi-select</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    ${availableThemes
                      .map((item) => {
                        const active = selectedThemes.some(
                          (t) => t.toLowerCase() === item.tag.toLowerCase()
                        );
                        return `
                          <button
                            type="button"
                            data-action="toggle-library-theme"
                            data-theme-tag="${escapeHtml(item.tag)}"
                            aria-pressed="${active ? 'true' : 'false'}"
                            class="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                                : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                            }"
                          >
                            <span>${escapeHtml(item.tag)}</span>
                            <span class="text-[10px] font-mono-tabular opacity-75">${item.count}</span>
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </section>
              `
              : ''
          }

          ${
            showRotationHistory
              ? `
                <!-- Group 5: Rotation Freshness -->
                <section aria-labelledby="filter-group-freshness" class="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
                  <h3 id="filter-group-freshness" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                    Shelf Freshness
                  </h3>
                  <div class="flex flex-wrap gap-1.5">
                    ${freshnessOptions
                      .map((opt) => {
                        const active = freshnessFilter === opt.id;
                        return `
                          <button
                            type="button"
                            data-action="set-library-freshness"
                            data-freshness="${opt.id}"
                            aria-pressed="${active ? 'true' : 'false'}"
                            class="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                                : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                            }"
                          >
                            ${escapeHtml(opt.label)}
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </section>

                <!-- Group 6: Sort Order -->
                <section aria-labelledby="filter-group-sort" class="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
                  <h3 id="filter-group-sort" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                    Sort Order
                  </h3>
                  <div class="flex flex-wrap gap-1.5">
                    ${sortOptions
                      .map((opt) => {
                        const active = sortBy === opt.id;
                        return `
                          <button
                            type="button"
                            data-action="set-library-sort"
                            data-sort="${opt.id}"
                            aria-pressed="${active ? 'true' : 'false'}"
                            class="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                                : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                            }"
                          >
                            ${escapeHtml(opt.label)}
                          </button>
                        `;
                      })
                      .join('')}
                  </div>
                </section>
              `
              : ''
          }

          <!-- Group 7: Book Care / Condition -->
          <section aria-labelledby="filter-group-condition" class="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
            <h3 id="filter-group-condition" class="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
              Book Care
            </h3>
            <div class="flex flex-wrap gap-1.5">
              ${conditionOptions
                .map((cond) => {
                  const active = conditionFilter === cond.id;
                  return `
                    <button
                      type="button"
                      data-action="set-library-condition"
                      data-condition-filter="${cond.id}"
                      aria-pressed="${active ? 'true' : 'false'}"
                      class="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                          : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                      }"
                    >
                      ${escapeHtml(cond.label)}
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>
        </div>

        <!-- Drawer Footer -->
        <div class="p-4 pb-safe border-t border-linen-200/80 dark:border-night-800 bg-linen-50/80 dark:bg-night-950/60 flex items-center justify-between gap-2.5">
          <button
            type="button"
            data-action="reset-library-filters"
            ${activeFilterCount === 0 ? 'disabled' : ''}
            class="min-h-[44px] px-3.5 py-2 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-45 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            Reset
          </button>

          <button
            type="button"
            data-action="close-library-filters"
            class="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Show <span class="font-mono-tabular">${filteredCount}</span> ${
              filteredCount === 1 ? 'Book' : 'Books'
            }
          </button>
        </div>
      </aside>
    </div>
  `;
}

/**
 * Renders the dedicated Family Library (Book Catalog) view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   uiState: {
 *     catalogFilter: string,
 *     ownerFilter?: string,
 *     selectedOwners?: string[],
 *     selectedFormats?: string[],
 *     selectedThemes?: string[],
 *     conditionFilter?: string,
 *     freshnessFilter?: string,
 *     sortBy?: string,
 *     isFilterDrawerOpen?: boolean,
 *     searchQuery: string,
 *     inspectedBookId: string | null,
 *     inspectorUi?: import('../../ui/components/book-inspector-modal.js').BookInspectorUiState
 *   },
 *   referenceDate?: Date | string | number
 * }} params
 * @returns {string}
 */
export function renderLibraryView({ state, uiState, referenceDate = new Date() }) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const coverAspectRatio = state.settings.coverAspectRatio;
  const dynamicTint = state.settings.dynamicCoverTint !== false;
  const showRotationHistory = state.settings.enableRotationHistoryInsights !== false;
  const staleBookDays = state.settings.staleBookDays ?? 10;
  const ownerFilter = uiState.ownerFilter || 'all';
  const freshnessFilter = uiState.freshnessFilter || 'all';
  const sortBy = uiState.sortBy || 'default';
  const activeRotation =
    state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') || null;

  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const inActiveSet = new Set(activeRotation ? activeRotation.bookIds : []);
  const usageByBookId = new Map();
  for (const book of state.books) {
    usageByBookId.set(
      book.id,
      computeBookUsageSummary(book, {
        profiles: state.profiles,
        rotations: state.rotations,
        activeProfile,
        activeRotation,
        staleBookDays,
        referenceDate,
      })
    );
  }

  const wishlistCount = state.books.filter(
    (b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist'
  ).length;
  const lovedCount = state.books.filter((b) => Boolean(b.loved)).length;

  // Normalize multi-select filter slices (supporting legacy single-format/condition catalogFilter values cleanly)
  const selectedFormats = Array.isArray(uiState.selectedFormats)
    ? [...uiState.selectedFormats]
    : uiState.catalogFilter === 'hardcover' ||
        uiState.catalogFilter === 'board-book' ||
        uiState.catalogFilter === 'paperback'
      ? [uiState.catalogFilter]
      : [];

  const selectedThemes = Array.isArray(uiState.selectedThemes) ? [...uiState.selectedThemes] : [];
  const conditionFilter =
    uiState.conditionFilter || (uiState.catalogFilter === 'needs-care' ? 'needs-care' : 'all');

  const effectiveOwners = resolveEffectiveSelectedOwners({
    ownerFilter,
    selectedOwners: uiState.selectedOwners,
    activeProfileId: activeProfile.id,
  });

  // Collect custom owners across books (beyond profile IDs and 'shared')
  const profileIdsLower = new Set(state.profiles.map((p) => p.id.toLowerCase()));
  /** @type {Map<string, string>} */
  const customOwnerMap = new Map();
  /** @type {Map<string, number>} */
  const themeCounts = new Map();

  for (const book of state.books) {
    for (const rawOwner of normalizeOwnersList(book.owners)) {
      const lower = rawOwner.toLowerCase();
      if (lower !== 'shared' && !profileIdsLower.has(lower) && !customOwnerMap.has(lower)) {
        customOwnerMap.set(lower, rawOwner);
      }
    }
    for (const rawTag of book.tags || []) {
      const tag = String(rawTag || '').trim().toLowerCase();
      if (!tag) continue;
      themeCounts.set(tag, (themeCounts.get(tag) || 0) + 1);
    }
  }

  const availableThemes = Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 18)
    .map(([tag, count]) => ({ tag, count }));

  const effectiveOwnersLower = new Set(effectiveOwners.map((o) => o.toLowerCase()));
  const selectedThemesLower = new Set(selectedThemes.map((t) => t.toLowerCase()));
  const query = uiState.searchQuery.trim().toLowerCase();

  const filteredBooks = state.books.filter((book) => {
    const status = normalizeCollectionStatus(book.collectionStatus);
    const condition = normalizeBookCondition(book.condition);

    switch (uiState.catalogFilter) {
      case 'owned':
        if (status !== 'owned') return false;
        break;
      case 'wishlist':
        if (status !== 'wishlist') return false;
        break;
      case 'loved':
        if (!book.loved) return false;
        break;
      case 'hardcover':
      case 'board-book':
      case 'paperback':
        if (book.format !== uiState.catalogFilter) return false;
        break;
      case 'needs-care':
        if (condition === 'good') return false;
        break;
      case 'all':
      default:
        break;
    }

    if (selectedFormats.length > 0 && !selectedFormats.includes(book.format)) {
      return false;
    }

    if (conditionFilter === 'good' && condition !== 'good') {
      return false;
    }
    if (conditionFilter === 'needs-care' && condition === 'good') {
      return false;
    }

    if (selectedThemesLower.size > 0) {
      const bookTagsLower = (book.tags || []).map((t) => String(t).toLowerCase());
      const matchesAnyTheme = bookTagsLower.some((t) => selectedThemesLower.has(t));
      if (!matchesAnyTheme) return false;
    }

    if (effectiveOwnersLower.size > 0) {
      const rawBookOwners = Array.isArray(book.owners) ? book.owners.filter(Boolean) : [];
      // Books without explicit owners behave as ['shared']
      const bookOwnersLower =
        rawBookOwners.length > 0
          ? rawBookOwners.map((o) => String(o).trim().toLowerCase())
          : ['shared'];
      const matchesSelectedOwner = bookOwnersLower.some((o) => effectiveOwnersLower.has(o));
      if (!matchesSelectedOwner) {
        return false;
      }
    }

    if (freshnessFilter !== 'all') {
      const usage = usageByBookId.get(book.id);
      const rotatable = isBookRotatable(book);
      switch (freshnessFilter) {
        case 'never-rotated':
          if (!rotatable || !usage || !usage.neverRotated) return false;
          break;
        case 'long-unseen':
          if (!rotatable || !usage || (!usage.neverRotated && !usage.isLongUnseen)) return false;
          break;
        case 'ready':
          if (!rotatable || !usage || usage.isCurrentlyOnActiveShelf || usage.inCooldown) {
            return false;
          }
          break;
        case 'in-cooldown':
          if (!usage || !usage.inCooldown) return false;
          break;
        case 'unread':
          if (!rotatable || !usage || usage.isReadByActiveProfile) return false;
          break;
        default:
          break;
      }
    }

    if (!query) return true;
    const haystack = [
      book.title,
      book.authors.join(' '),
      book.isbn13,
      book.tags.join(' '),
      book.readingLevelHint || '',
      formatCollectionStatus(status),
      formatBookCondition(condition),
      ...(book.owners || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  if (sortBy === 'longest-off-shelf') {
    filteredBooks.sort((a, b) => {
      const ua = usageByBookId.get(a.id);
      const ub = usageByBookId.get(b.id);
      // Put active-shelf books and non-rotatable wishlist items below ready off-shelf books
      const aRank = !isBookRotatable(a) ? 3 : ua?.isCurrentlyOnActiveShelf ? 2 : ua?.neverRotated ? 0 : 1;
      const bRank = !isBookRotatable(b) ? 3 : ub?.isCurrentlyOnActiveShelf ? 2 : ub?.neverRotated ? 0 : 1;
      if (aRank !== bRank) return aRank - bRank;
      const aDays = ua?.daysSinceLastRotated ?? -1;
      const bDays = ub?.daysSinceLastRotated ?? -1;
      if (bDays !== aDays) return bDays - aDays;
      const aCycles = ua?.rotationsSinceLastOut ?? 0;
      const bCycles = ub?.rotationsSinceLastOut ?? 0;
      if (bCycles !== aCycles) return bCycles - aCycles;
      return a.title.localeCompare(b.title);
    });
  } else if (sortBy === 'recently-rotated') {
    filteredBooks.sort((a, b) => {
      const aMs = a.lastRotatedAt ? Date.parse(a.lastRotatedAt) || 0 : 0;
      const bMs = b.lastRotatedAt ? Date.parse(b.lastRotatedAt) || 0 : 0;
      if (bMs !== aMs) return bMs - aMs;
      return a.title.localeCompare(b.title);
    });
  } else if (sortBy === 'title') {
    filteredBooks.sort((a, b) => a.title.localeCompare(b.title));
  }

  const isForActiveReader =
    ownerFilter === 'active-reader' &&
    (!Array.isArray(uiState.selectedOwners) || uiState.selectedOwners.length === 0);
  const isAllBooksScope = effectiveOwners.length === 0;
  const isCustomOwnerScope = !isForActiveReader && !isAllBooksScope;
  const activeToneClass = AVATAR_TONES[activeProfile.avatarTone || 'teal'] || AVATAR_TONES.teal;

  const activeFilterCount =
    (selectedFormats.length > 0 ? 1 : 0) +
    (selectedThemes.length > 0 ? 1 : 0) +
    (conditionFilter !== 'all' ? 1 : 0) +
    (freshnessFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0) +
    (isCustomOwnerScope ? 1 : 0) +
    (uiState.catalogFilter !== 'all' &&
    uiState.catalogFilter !== 'wishlist' &&
    uiState.catalogFilter !== 'loved'
      ? 1
      : 0);

  // Compact Quick Filter Pills: `All`, `[bookmark icon] 2` (no parentheses), `[heart icon] 1` (no parentheses)
  const isAllCatalogFilter = uiState.catalogFilter === 'all';
  const isWishlistFilter = uiState.catalogFilter === 'wishlist';
  const isLovedFilter = uiState.catalogFilter === 'loved';

  const primaryFilterChipsHtml = `
    <button
      type="button"
      data-action="set-catalog-filter"
      data-filter="all"
      aria-pressed="${isAllCatalogFilter ? 'true' : 'false'}"
      class="min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
        isAllCatalogFilter
          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
          : 'bg-ivory dark:bg-night-900 text-stone-ink dark:text-slate-300 border border-linen-200 dark:border-night-700 hover:text-forest-900 dark:hover:text-white'
      }"
    >
      All
    </button>

    <button
      type="button"
      data-action="set-catalog-filter"
      data-filter="wishlist"
      aria-pressed="${isWishlistFilter ? 'true' : 'false'}"
      aria-label="Wishlist, ${wishlistCount} ${wishlistCount === 1 ? 'book' : 'books'}"
      title="Wishlist"
      class="min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
        isWishlistFilter
          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
          : 'bg-ivory dark:bg-night-900 text-espresso-800 dark:text-amber-200 border border-linen-200 dark:border-night-700 hover:text-forest-900 dark:hover:text-white'
      }"
    >
      ${renderIcon('bookmark', 'w-3.5 h-3.5')}
      <span class="font-mono-tabular">${wishlistCount}</span>
    </button>

    <button
      type="button"
      data-action="set-catalog-filter"
      data-filter="loved"
      aria-pressed="${isLovedFilter ? 'true' : 'false'}"
      aria-label="Loved, ${lovedCount} ${lovedCount === 1 ? 'book' : 'books'}"
      title="Loved favorites"
      class="min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
        isLovedFilter
          ? 'bg-rose-600 text-white shadow-2xs'
          : 'bg-ivory dark:bg-night-900 text-rose-600 dark:text-rose-400 border border-linen-200 dark:border-night-700 hover:bg-linen-50 dark:hover:bg-night-800'
      }"
    >
      ${renderIcon(isLovedFilter ? 'heartFilled' : 'heart', 'w-3.5 h-3.5')}
      <span class="font-mono-tabular">${lovedCount}</span>
    </button>
  `;

  /** @type {Array<{ key: string, label: string, initial: string, tone: string }>} */
  const ownerChoices = [
    ...state.profiles.map((p) => ({
      key: p.id,
      label: p.name,
      initial: computeOwnerInitials(p.name),
      tone: p.avatarTone || 'teal',
    })),
    { key: 'shared', label: 'Shared', initial: 'S', tone: 'emerald' },
    ...Array.from(customOwnerMap.values()).map((customLabel) => ({
      key: customLabel,
      label: customLabel,
      initial: computeOwnerInitials(customLabel),
      tone: 'indigo',
    })),
  ];

  // Active filter summary pills below the bar when drawer filters are active
  const profileNameMap = new Map(state.profiles.map((p) => [p.id.toLowerCase(), p.name]));
  const activeSummaryPills = [];
  for (const fmt of selectedFormats) {
    activeSummaryPills.push({
      action: 'toggle-library-format',
      attr: `data-format="${escapeHtml(fmt)}"`,
      label: formatBookBinding(/** @type {any} */ (fmt)),
    });
  }
  for (const th of selectedThemes) {
    activeSummaryPills.push({
      action: 'toggle-library-theme',
      attr: `data-theme-tag="${escapeHtml(th)}"`,
      label: `#${th}`,
    });
  }
  if (isCustomOwnerScope) {
    for (const own of effectiveOwners) {
      const lower = own.toLowerCase();
      const label = lower === 'shared' ? 'Shared' : profileNameMap.get(lower) || own;
      activeSummaryPills.push({
        action: 'toggle-library-owner',
        attr: `data-owner="${escapeHtml(own)}"`,
        label,
      });
    }
  }
  if (conditionFilter !== 'all') {
    activeSummaryPills.push({
      action: 'set-library-condition',
      attr: 'data-condition-filter="all"',
      label: conditionFilter === 'good' ? 'Good Condition' : 'Needs Care',
    });
  }
  if (freshnessFilter !== 'all') {
    const freshnessLabels = {
      'long-unseen': 'Long Unseen',
      'never-rotated': 'Never Rotated',
      ready: 'Ready (Out of Cooldown)',
      'in-cooldown': 'In Cooldown',
      unread: 'Unread',
    };
    activeSummaryPills.push({
      action: 'set-library-freshness',
      attr: 'data-freshness="all"',
      label: freshnessLabels[/** @type {keyof typeof freshnessLabels} */ (freshnessFilter)] || freshnessFilter,
    });
  }
  if (sortBy !== 'default') {
    const sortLabels = {
      'longest-off-shelf': 'Sort: Longest Off-Shelf',
      'recently-rotated': 'Sort: Recently Rotated',
      title: 'Sort: Title A–Z',
    };
    activeSummaryPills.push({
      action: 'set-library-sort',
      attr: 'data-sort="default"',
      label: sortLabels[/** @type {keyof typeof sortLabels} */ (sortBy)] || sortBy,
    });
  }

  const activeSummaryBarHtml =
    activeSummaryPills.length > 0
      ? `
        <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
          ${activeSummaryPills
            .map(
              (pill) => `
                <button
                  type="button"
                  data-action="${pill.action}"
                  ${pill.attr}
                  class="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                >
                  <span>${escapeHtml(pill.label)}</span>
                  <span aria-hidden="true">×</span>
                </button>
              `
            )
            .join('')}
          <button
            type="button"
            data-action="reset-library-filters"
            class="text-[11px] font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white px-1.5 py-0.5"
          >
            Clear all
          </button>
        </div>
      `
      : '';

  const catalogGridHtml =
    filteredBooks.length > 0
      ? `
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-4 pt-1">
          ${filteredBooks
            .map((book) => {
              const primaryAuthor = book.authors[0] || 'Unknown Author';
              const isOnActiveShelf = inActiveSet.has(book.id);
              const status = normalizeCollectionStatus(book.collectionStatus);
              const condition = normalizeBookCondition(book.condition);
              const ownerBadgesHtml = renderOwnerBadgesStrip(book, state.profiles);

              let statusBadgeHtml = '';
              if (status === 'wishlist') {
                statusBadgeHtml = `<span class="pointer-events-none absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 rounded-md bg-amber-900/90 text-amber-50 text-[9px] font-bold tracking-wide shadow-2xs">Wishlist</span>`;
              } else if (condition !== 'good') {
                statusBadgeHtml = `<span class="pointer-events-none absolute top-1.5 left-1.5 z-20 px-1.5 py-0.5 rounded-md bg-rose-900/90 text-rose-50 text-[9px] font-bold tracking-wide shadow-2xs">${escapeHtml(
                  formatBookCondition(condition)
                )}</span>`;
              }

              return `
                <article data-book-card="${escapeHtml(book.id)}" class="flex flex-col min-w-0">
                  <div class="relative">
                    <button
                      type="button"
                      data-action="inspect-book"
                      data-book-id="${escapeHtml(book.id)}"
                      aria-label="Inspect ${escapeHtml(book.title)} by ${escapeHtml(primaryAuthor)}"
                      class="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.98]"
                    >
                      ${renderBookCover(book, 'grid', coverAspectRatio)}
                    </button>
                    ${statusBadgeHtml}
                    ${
                      book.loved
                        ? `<span class="pointer-events-none absolute top-1.5 right-1.5 z-20 w-5 h-5 rounded-full bg-ivory/92 dark:bg-night-900/92 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-2xs" title="Loved favorite">${renderIcon(
                            'heartFilled',
                            'w-3 h-3'
                          )}</span>`
                        : isOnActiveShelf
                          ? `<span class="pointer-events-none absolute top-1.5 right-1.5 z-20 w-2.5 h-2.5 rounded-full bg-forest-700 dark:bg-[#5ED3DA] ring-2 ring-ivory dark:ring-night-900" title="Currently in ${escapeHtml(
                              activeProfile.name
                            )}’s active rotation"></span>`
                          : ''
                    }
                    ${
                      ownerBadgesHtml
                        ? `<div class="pointer-events-none absolute bottom-1.5 right-1.5 z-20">${ownerBadgesHtml}</div>`
                        : ''
                    }
                  </div>

                  <button
                    type="button"
                    data-action="inspect-book"
                    data-book-id="${escapeHtml(book.id)}"
                    class="mt-2 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-forest-700 rounded"
                  >
                    <h2 class="font-sans text-xs sm:text-[13px] font-bold text-forest-900 dark:text-white leading-snug line-clamp-2">
                      ${escapeHtml(book.title)}
                    </h2>
                    <p class="text-[11px] text-stone-ink dark:text-slate-400 truncate mt-0.5">
                      ${escapeHtml(primaryAuthor)}
                    </p>
                    <p class="text-[10px] text-stone-ink/80 dark:text-slate-500 truncate mt-0.5">
                      Ages ${book.ageMin}–${book.ageMax} · ${escapeHtml(formatBookBinding(book.format))}
                    </p>
                    ${
                      showRotationHistory && isBookRotatable(book)
                        ? (() => {
                            const usage = usageByBookId.get(book.id);
                            if (!usage) return '';
                            return `<p data-library-usage-line="true" class="text-[10px] truncate mt-0.5 ${
                              usage.inCooldown
                                ? 'text-amber-700 dark:text-amber-400'
                                : usage.isCurrentlyOnActiveShelf
                                  ? 'text-forest-700 dark:text-[#5ED3DA] font-medium'
                                  : 'text-stone-ink/90 dark:text-slate-400'
                            }">${escapeHtml(usage.shortRecencyLabel)}</p>`;
                          })()
                        : ''
                    }
                  </button>
                </article>
              `;
            })
            .join('')}
        </div>
      `
      : `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-7 text-center space-y-2.5">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            No books match these filters
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400">
            ${
              !isAllBooksScope || activeFilterCount > 0
                ? 'Reset filters or switch to All Books to include titles across all readers.'
                : 'Clear your search or tap + to scan a book or save one to your Wishlist.'
            }
          </p>
          ${
            !isAllBooksScope || activeFilterCount > 0
              ? `
                <div class="pt-1 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    data-action="reset-library-filters"
                    class="min-h-[40px] px-4 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors"
                  >
                    Show All Books
                  </button>
                </div>
              `
              : ''
          }
        </div>
      `;

  const inspectedBook = uiState.inspectedBookId ? bookMap.get(uiState.inspectedBookId) : null;
  const rotatableCatalogCount = state.books.filter((b) => isBookRotatable(b)).length;
  const canSwapInActiveRotation = activeRotation
    ? rotatableCatalogCount > activeRotation.bookIds.length
    : false;

  return `
    <div class="space-y-3.5">
      <!-- Compact Header with + Add Book Trigger -->
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            ${
              isForActiveReader
                ? `For ${escapeHtml(activeProfile.name)} & Shared`
                : isAllBooksScope
                  ? 'All Household Books'
                  : 'Custom Reader Selection'
            }
          </p>
          <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
            Family Library
            <span class="text-sm font-sans font-medium text-stone-ink dark:text-slate-400 font-mono-tabular ml-1">
              ${filteredBooks.length}/${state.books.length}
            </span>
          </h1>
        </div>

        <a
          href="#/scan"
          aria-label="Scan or add a new book"
          title="Scan or add a new book"
          class="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          ${renderIcon('plus', 'w-5 h-5')}
          <span class="hidden sm:inline">Add Book</span>
        </a>
      </div>

      <!-- Compact Search + Filter Sidebar Trigger, Unified Reader Scope & Icon Quick Filters -->
      <div class="space-y-2">
        <div class="relative">
          <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-ink dark:text-slate-400">
            ${renderIcon('search', 'w-4 h-4')}
          </span>
          <input
            type="search"
            id="catalog-search-input"
            value="${escapeHtml(uiState.searchQuery)}"
            placeholder="Search title, author, ISBN, owner, or topic…"
            aria-label="Filter family catalog"
            class="w-full h-12 pl-9 pr-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white placeholder:text-stone-ink/70 focus:outline-2 focus:outline-forest-700"
          />
        </div>

        <!-- Single-Row Filter Sidebar Trigger + Reader Scope + Icon Quick Filters -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            data-action="open-library-filters"
            aria-label="Open library filters sidebar"
            class="min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
              activeFilterCount > 0
                ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                : 'bg-ivory dark:bg-night-900 text-forest-900 dark:text-slate-200 border border-linen-200 dark:border-night-700 hover:bg-linen-100 dark:hover:bg-night-800'
            }"
          >
            ${renderIcon('filter', 'w-3.5 h-3.5')}
            <span>Filters</span>
            ${
              activeFilterCount > 0
                ? `<span class="px-1.5 py-0.2 rounded-md bg-white/20 dark:bg-night-900/20 font-mono-tabular text-[11px]">${activeFilterCount}</span>`
                : ''
            }
          </button>

          <div role="group" aria-label="Reader book scope" class="inline-flex items-center p-0.5 rounded-xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 shrink-0">
            <button
              type="button"
              data-action="set-owner-filter"
              data-owner="active-reader"
              aria-pressed="${isForActiveReader ? 'true' : 'false'}"
              class="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isForActiveReader
                  ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                  : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
              }"
            >
              <span class="w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${activeToneClass}">${escapeHtml(
                computeOwnerInitials(activeProfile.name)
              )}</span>
              <span>For ${escapeHtml(activeProfile.name)}</span>
            </button>
            <button
              type="button"
              data-action="set-owner-filter"
              data-owner="all"
              aria-pressed="${isAllBooksScope ? 'true' : 'false'}"
              class="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                isAllBooksScope
                  ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                  : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
              }"
            >
              All Books
            </button>
          </div>

          ${primaryFilterChipsHtml}
        </div>

        ${activeSummaryBarHtml}
      </div>

      ${catalogGridHtml}

      ${renderLibraryFilterDrawer({
        isOpen: Boolean(uiState.isFilterDrawerOpen),
        catalogFilter: uiState.catalogFilter,
        selectedFormats,
        selectedThemes,
        effectiveOwners,
        conditionFilter,
        freshnessFilter,
        sortBy,
        showRotationHistory,
        availableThemes,
        ownerChoices,
        filteredCount: filteredBooks.length,
        activeFilterCount,
      })}

      ${renderBookInspectorModal({
        book: inspectedBook,
        profiles: state.profiles,
        rotations: state.rotations,
        activeProfile,
        activeRotation,
        canSwapInActiveRotation,
        coverAspectRatio,
        dynamicCoverTint: dynamicTint,
        showRotationHistory,
        staleBookDays,
        referenceDate,
        inspectorUiState: uiState.inspectorUi,
      })}
    </div>
  `;
}
