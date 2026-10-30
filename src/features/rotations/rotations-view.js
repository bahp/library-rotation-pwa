/**
 * @fileoverview Space-efficient Book Rotations View & Post-Generation Shelf Editor:
 * - Active & saved rotation shelves for the active reader (selected via top avatar)
 * - Compact `+` button (`open-generate-rotation-sheet`) that opens the Rotation Engine form
 *   as a slide-up bottom sheet (`max-h-[85vh]`) from below
 * - Full post-generation slot operations: Random Swap, Manual Replace picker sheet,
 *   Multi-book / Random Additions, Read check-off, Remove slot, Activate, and Delete
 */

import {
  escapeHtml,
  formatBookBinding,
  formatProfileAgeLabel,
  formatReadingStage,
} from '../../types/models.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderIcon } from '../../ui/icons.js';
import { scoreEligibleBooks } from './rotation-engine.js';

/**
 * @typedef {Object} RotationEditorUiState
 * @property {'replace' | 'add' | null} modalMode
 * @property {string | null} rotationId
 * @property {string | null} targetBookId - Populated when modalMode === 'replace'
 * @property {string} searchQuery
 * @property {string[]} selectedAddBookIds - Multi-select IDs when modalMode === 'add'
 * @property {number} randomAddCount - Count for random batch add inside modal
 * @property {boolean} [isGeneratorOpen] - Whether the Generate Shelf bottom sheet is open
 */

/**
 * Renders the slide-up Generate Shelf bottom sheet (`max-h-[85vh]`) when `+` is clicked.
 * @param {{
 *   activeProfile: import('../../types/models.js').ChildProfile,
 *   isOpen: boolean
 * }} params
 * @returns {string}
 */
function renderGenerateRotationSheet({ activeProfile, isOpen }) {
  if (!isOpen) return '';
  const ageLabel = formatProfileAgeLabel(activeProfile);

  return `
    <div
      data-backdrop-action="close-generate-rotation-sheet"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-rotation-sheet-title"
    >
      <div class="animate-sheet-up w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden">
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <div class="px-5 pt-3 pb-3.5 border-b border-linen-200 dark:border-night-700 flex items-start justify-between gap-3">
          <div>
            <h2 id="generate-rotation-sheet-title" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              Generate Shelf for ${escapeHtml(activeProfile.name)}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(ageLabel)} · ${escapeHtml(
                formatReadingStage(activeProfile.readingStage)
              )} · Balances age fit, topics, and cooldown.
            </p>
          </div>
          <button
            type="button"
            data-action="close-generate-rotation-sheet"
            aria-label="Close generate shelf form"
            class="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center shrink-0"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <form id="generate-rotation-form" class="flex-1 overflow-y-auto p-5 space-y-3.5">
          <div>
            <label for="rot-title" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Shelf Title
            </label>
            <input
              id="rot-title"
              name="title"
              type="text"
              placeholder="${escapeHtml(activeProfile.name)}’s Winter Reads"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div>
            <label for="rot-objective" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Rotation Objective / Description
            </label>
            <input
              id="rot-objective"
              name="objective"
              type="text"
              placeholder="e.g., hardcover + winter & nature themes"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div>
            <label for="rot-tags" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Topic Preferences (comma-separated)
            </label>
            <input
              id="rot-tags"
              name="preferredTags"
              type="text"
              value="${escapeHtml(activeProfile.favoriteTopics.join(', '))}"
              placeholder="animals, nature, bedtime"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="rot-count" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Book Count
              </label>
              <input
                id="rot-count"
                name="count"
                type="number"
                min="1"
                max="15"
                value="${activeProfile.defaultRotationSize}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="rot-cooldown" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Cooldown (days)
              </label>
              <input
                id="rot-cooldown"
                name="cooldownDays"
                type="number"
                min="0"
                max="90"
                value="${activeProfile.cooldownDays}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="rot-format" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Binding Filter
              </label>
              <select
                id="rot-format"
                name="requiredFormat"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="any" selected>Any Binding</option>
                <option value="hardcover">Hardcover Preferred</option>
                <option value="board-book">Board Book Preferred</option>
                <option value="paperback">Paperback Preferred</option>
              </select>
            </div>

            <div>
              <label for="rot-seed" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Deterministic Seed (optional)
              </label>
              <input
                id="rot-seed"
                name="seed"
                type="text"
                placeholder="e.g., dec-holiday-01"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <label class="flex items-start gap-2.5 text-xs text-forest-900 dark:text-slate-300 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              name="varietyMix"
              checked
              class="mt-0.5 h-4 w-4 rounded accent-[#1F6E75]"
            />
            <span>
              <strong class="font-semibold">Enforce author & topic variety</strong>
              <span class="block text-stone-ink dark:text-slate-400">Prevents multiple books by the same author crowding one shelf.</span>
            </span>
          </label>

          <div class="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              data-action="close-generate-rotation-sheet"
              class="min-h-[46px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 sm:flex-initial min-h-[46px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Generate Rotation List
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renders the searchable bottom-sheet dialog for Manual Book Replacement or Multi-Book Addition.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   editorState: RotationEditorUiState
 * }} params
 * @returns {string}
 */
function renderRotationPickerModal({ state, editorState }) {
  if (!editorState.modalMode || !editorState.rotationId) return '';

  const rotation = state.rotations.find((r) => r.id === editorState.rotationId);
  if (!rotation) return '';

  const profile =
    state.profiles.find((p) => p.id === rotation.profileId) || state.profiles[0];
  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const targetBook = editorState.targetBookId
    ? bookMap.get(editorState.targetBookId)
    : undefined;

  const isReplace = editorState.modalMode === 'replace';

  const rankedCandidates = scoreEligibleBooks({
    books: state.books,
    profile,
    rules: { ...rotation.rules, requiredFormat: 'any' },
    excludeBookIds: rotation.bookIds,
  }).sort((a, b) => b.baseScore - a.baseScore);

  const q = editorState.searchQuery.trim().toLowerCase();
  const filteredCandidates = q
    ? rankedCandidates.filter(({ book }) => {
        const hay = `${book.title} ${book.authors.join(' ')} ${book.tags.join(' ')} ${book.isbn13}`.toLowerCase();
        return hay.includes(q);
      })
    : rankedCandidates;

  const selectedSet = new Set(editorState.selectedAddBookIds);

  const candidateRowsHtml =
    filteredCandidates.length > 0
      ? filteredCandidates
          .map(({ book, inCooldown }) => {
            const checked = selectedSet.has(book.id);
            return `
              <div class="rounded-xl bg-linen-50/90 dark:bg-night-950/60 border border-linen-200 dark:border-night-700 p-2.5 flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  ${renderBookCover(book, 'xs')}
                  <div class="min-w-0">
                    <h4 class="font-display text-sm font-semibold text-forest-900 dark:text-white truncate">
                      ${escapeHtml(book.title)}
                    </h4>
                    <p class="text-xs text-stone-ink dark:text-slate-400 truncate">
                      ${escapeHtml(book.authors.join(', '))}
                    </p>
                    <p class="text-[11px] text-stone-ink dark:text-slate-400">
                      Ages ${book.ageMin}–${book.ageMax} · ${escapeHtml(formatBookBinding(book.format))} ·
                      <span class="${
                        inCooldown
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-forest-700 dark:text-[#5ED3DA]'
                      }">${inCooldown ? 'Recent' : 'Fresh'}</span>
                    </p>
                  </div>
                </div>

                ${
                  isReplace
                    ? `
                      <button
                        type="button"
                        data-action="confirm-manual-replace"
                        data-book-id="${escapeHtml(book.id)}"
                        class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        Select
                      </button>
                    `
                    : `
                      <button
                        type="button"
                        data-action="toggle-add-book-selection"
                        data-book-id="${escapeHtml(book.id)}"
                        aria-pressed="${checked ? 'true' : 'false'}"
                        class="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                          checked
                            ? 'bg-forest-700 text-white'
                            : 'bg-ivory dark:bg-night-900 text-forest-900 dark:text-slate-200 border border-linen-200 dark:border-night-700'
                        }"
                      >
                        ${checked ? `${renderIcon('check', 'w-3.5 h-3.5')} Selected` : 'Select'}
                      </button>
                    `
                }
              </div>
            `;
          })
          .join('')
      : `
        <div class="rounded-xl border border-linen-200 dark:border-night-700 p-6 text-center">
          <p class="text-sm font-medium text-forest-900 dark:text-slate-300">
            ${
              rankedCandidates.length === 0
                ? 'Every book in your family catalog is already on this rotation shelf.'
                : 'No off-shelf books match that search query.'
            }
          </p>
        </div>
      `;

  return `
    <div
      data-backdrop-action="close-rotation-modal"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotation-picker-modal-title"
    >
      <div class="animate-sheet-up w-full max-w-xl max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden">
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <div class="px-5 pt-3 pb-3 border-b border-linen-200 dark:border-night-700 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h3 id="rotation-picker-modal-title" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              ${
                isReplace
                  ? `Replace "${escapeHtml(targetBook?.title || 'Book')}"`
                  : `Add Books to "${escapeHtml(rotation.title)}"`
              }
            </h3>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${
                isReplace
                  ? `Ranked by fit for ${escapeHtml(profile.name)} (${escapeHtml(
                      formatProfileAgeLabel(profile)
                    )}).`
                  : `Select catalog books below, or add random eligible picks.`
              }
            </p>
          </div>
          <button
            type="button"
            data-action="close-rotation-modal"
            class="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center shrink-0"
            aria-label="Close modal"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <div class="px-5 pt-3 pb-3 border-b border-linen-200 dark:border-night-700 space-y-2.5">
          <div class="relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-ink dark:text-slate-400 pointer-events-none">
              ${renderIcon('search', 'w-4 h-4')}
            </span>
            <input
              id="rotation-modal-search-input"
              type="search"
              aria-label="Filter available off-shelf books"
              value="${escapeHtml(editorState.searchQuery)}"
              placeholder="Filter available books by title, author, or topic…"
              class="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          ${
            !isReplace && rankedCandidates.length > 0
              ? `
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs text-stone-ink dark:text-slate-400">
                    Quick random (${rankedCandidates.length} available):
                  </span>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      data-action="add-random-books"
                      data-rotation-id="${escapeHtml(rotation.id)}"
                      data-count="1"
                      class="min-h-[36px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                      +1 Random
                    </button>
                    ${
                      rankedCandidates.length >= 2
                        ? `
                          <button
                            type="button"
                            data-action="add-random-books"
                            data-rotation-id="${escapeHtml(rotation.id)}"
                            data-count="2"
                            class="min-h-[36px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                            +2 Random
                          </button>
                        `
                        : ''
                    }
                  </div>
                </div>
              `
              : ''
          }
        </div>

        <div class="p-4 overflow-y-auto space-y-2 flex-1">
          ${candidateRowsHtml}
        </div>

        ${
          !isReplace
            ? `
              <div class="p-4 border-t border-linen-200 dark:border-night-700 bg-linen-50/80 dark:bg-night-950/60 flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-stone-ink dark:text-slate-300 font-mono-tabular">
                  ${selectedSet.size} selected
                </span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    data-action="close-rotation-modal"
                    class="min-h-[42px] px-4 py-2 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-300 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-action="confirm-manual-add-books"
                    ${selectedSet.size === 0 ? 'disabled' : ''}
                    class="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    Add Selected (${selectedSet.size})
                  </button>
                </div>
              </div>
            `
            : ''
        }
      </div>
    </div>
  `;
}

/**
 * Renders a single rotation card with compact book slots and post-generation slot editing controls.
 * @param {{
 *   rot: import('../../types/models.js').RotationList,
 *   bookMap: Map<string, import('../../types/models.js').Book>,
 *   totalCatalogCount: number
 * }} params
 * @returns {string}
 */
function renderRotationCard({ rot, bookMap, totalCatalogCount }) {
  const books = rot.bookIds
    .map((id) => bookMap.get(id))
    .filter(/** @returns {b is import('../../types/models.js').Book} */ (b) => Boolean(b));
  const completedSet = new Set(rot.completedBookIds);
  const isActive = rot.status === 'active';
  const hasOffShelfBooks = totalCatalogCount > books.length;

  return `
    <article class="rounded-2xl bg-ivory dark:bg-night-900 border ${
      isActive
        ? 'border-forest-700/45 dark:border-[#5ED3DA]/40'
        : 'border-linen-200 dark:border-night-800'
    } p-4 sm:p-5 space-y-3.5">
      <div class="flex items-start justify-between gap-3 pb-3 border-b border-linen-200/80 dark:border-night-800">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400">
            <span class="${
              isActive
                ? 'font-bold text-espresso-800 dark:text-[#5ED3DA]'
                : 'font-medium'
            }">${isActive ? 'Active Rotation' : 'Saved Rotation'}</span>
            <span aria-hidden="true">·</span>
            <span class="font-mono-tabular">${completedSet.size}/${books.length} read</span>
            <span aria-hidden="true">·</span>
            <span class="font-mono-tabular">${rot.rules.cooldownDays}d cooldown</span>
            ${
              rot.rules.seed
                ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">Seed: ${escapeHtml(
                    rot.rules.seed
                  )}</span>`
                : ''
            }
          </div>

          <h2 class="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white mt-0.5 leading-snug">
            ${escapeHtml(rot.title)}
          </h2>
          <p class="text-xs text-stone-ink dark:text-slate-400 truncate mt-0.5">
            ${escapeHtml(rot.rules.objective)}
          </p>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          ${
            !isActive
              ? `
                <button
                  type="button"
                  data-action="activate-rotation"
                  data-rotation-id="${escapeHtml(rot.id)}"
                  class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors whitespace-nowrap"
                >
                  Activate
                </button>
              `
              : ''
          }
          <button
            type="button"
            data-action="delete-rotation"
            data-rotation-id="${escapeHtml(rot.id)}"
            class="min-h-[40px] min-w-[40px] p-2 rounded-xl text-stone-ink hover:text-rose-700 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/40 transition-colors flex items-center justify-center"
            aria-label="Delete rotation ${escapeHtml(rot.title)}"
          >
            ${renderIcon('trash', 'w-4 h-4')}
          </button>
        </div>
      </div>

      <!-- Compact Book Slots -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        ${books
          .map((book) => {
            const isRead = completedSet.has(book.id);
            return `
              <div class="rounded-xl bg-linen-50/75 dark:bg-night-950/55 border border-linen-200/80 dark:border-night-800 p-2.5 flex items-center justify-between gap-2.5">
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  ${renderBookCover(book, 'xs')}
                  <div class="min-w-0 flex-1">
                    <h3 class="font-sans text-xs sm:text-sm font-bold text-forest-900 dark:text-white truncate ${
                      isRead ? 'line-through opacity-70' : ''
                    }">
                      ${escapeHtml(book.title)}
                    </h3>
                    <p class="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                      ${escapeHtml(book.authors[0] || '')} · Ages ${book.ageMin}–${book.ageMax}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    data-action="toggle-rotation-read"
                    data-rotation-id="${escapeHtml(rot.id)}"
                    data-book-id="${escapeHtml(book.id)}"
                    aria-pressed="${isRead ? 'true' : 'false'}"
                    aria-label="${isRead ? 'Mark unread' : 'Mark read'}"
                    title="${isRead ? 'Read' : 'Mark Read'}"
                    class="min-h-[38px] min-w-[38px] px-2 rounded-xl text-xs font-semibold transition-colors inline-flex items-center justify-center ${
                      isRead
                        ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                        : 'bg-ivory dark:bg-night-900 text-stone-ink dark:text-slate-300 border border-linen-200 dark:border-night-700'
                    }"
                  >
                    ${renderIcon('check', 'w-3.5 h-3.5')}
                  </button>

                  <button
                    type="button"
                    data-action="replace-book-random"
                    data-rotation-id="${escapeHtml(rot.id)}"
                    data-book-id="${escapeHtml(book.id)}"
                    ${!hasOffShelfBooks ? 'disabled title="No off-shelf books available"' : 'title="Swap with random eligible book"'}
                    aria-label="Swap ${escapeHtml(book.title)} randomly"
                    class="min-h-[38px] min-w-[38px] px-2 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-45 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors inline-flex items-center justify-center"
                  >
                    ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                  </button>

                  <button
                    type="button"
                    data-action="open-manual-replace-modal"
                    data-rotation-id="${escapeHtml(rot.id)}"
                    data-book-id="${escapeHtml(book.id)}"
                    ${!hasOffShelfBooks ? 'disabled title="No off-shelf books available"' : ''}
                    class="min-h-[38px] px-2.5 py-1 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-45 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-[11px] font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
                  >
                    Replace
                  </button>

                  ${
                    books.length > 1
                      ? `
                        <button
                          type="button"
                          data-action="remove-rotation-book"
                          data-rotation-id="${escapeHtml(rot.id)}"
                          data-book-id="${escapeHtml(book.id)}"
                          class="min-h-[38px] min-w-[38px] p-1.5 rounded-xl text-stone-ink hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 hover:bg-linen-100 dark:hover:bg-night-800 transition-colors flex items-center justify-center"
                          aria-label="Remove ${escapeHtml(book.title)} from shelf"
                        >
                          ${renderIcon('close', 'w-3.5 h-3.5')}
                        </button>
                      `
                      : ''
                  }
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <!-- Compact Shelf Addition Footer -->
      <div class="pt-2.5 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
        <span class="text-[11px] text-stone-ink dark:text-slate-400">
          Add to shelf
        </span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-action="add-random-books"
            data-rotation-id="${escapeHtml(rot.id)}"
            data-count="1"
            ${!hasOffShelfBooks ? 'disabled' : ''}
            class="min-h-[38px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 disabled:opacity-45 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
          >
            ${renderIcon('shuffle', 'w-3.5 h-3.5')}
            +1 Random
          </button>
          <button
            type="button"
            data-action="open-add-books-modal"
            data-rotation-id="${escapeHtml(rot.id)}"
            ${!hasOffShelfBooks ? 'disabled' : ''}
            class="min-h-[38px] px-3 py-1 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-45 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap"
          >
            ${renderIcon('plus', 'w-3.5 h-3.5')}
            Add Books
          </button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renders the Book Rotations view with compact `+` generator sheet trigger.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   editorState: RotationEditorUiState
 * }} params
 * @returns {string}
 */
export function renderRotationsView({ state, editorState }) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

  const profileRotations = state.rotations.filter((r) => r.profileId === activeProfile.id);
  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const ageLabel = formatProfileAgeLabel(activeProfile);

  const rotationsListHtml =
    profileRotations.length > 0
      ? profileRotations
          .map((rot) =>
            renderRotationCard({
              rot,
              bookMap,
              totalCatalogCount: state.books.length,
            })
          )
          .join('')
      : `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-7 text-center">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            No rotations saved for ${escapeHtml(activeProfile.name)} yet
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-1">
            Tap the + button to generate ${escapeHtml(activeProfile.name)}’s first curated book shelf.
          </p>
          <div class="mt-4 flex justify-center">
            <button
              type="button"
              data-action="open-generate-rotation-sheet"
              class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              ${renderIcon('plus', 'w-4 h-4')}
              New Rotation Shelf
            </button>
          </div>
        </div>
      `;

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            ${escapeHtml(activeProfile.name)} · ${escapeHtml(ageLabel)}
          </p>
          <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
            Book Rotations
          </h1>
        </div>

        <button
          type="button"
          data-action="open-generate-rotation-sheet"
          aria-label="Generate new rotation shelf"
          title="Generate new rotation shelf"
          class="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          ${renderIcon('plus', 'w-5 h-5')}
          <span class="hidden sm:inline">New Shelf</span>
        </button>
      </div>

      <div class="space-y-4">
        ${rotationsListHtml}
      </div>

      ${renderGenerateRotationSheet({
        activeProfile,
        isOpen: Boolean(editorState.isGeneratorOpen),
      })}
      ${renderRotationPickerModal({ state, editorState })}
    </div>
  `;
}
