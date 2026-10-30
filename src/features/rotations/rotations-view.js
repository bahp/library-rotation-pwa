/**
 * @fileoverview Phase 4 Rotations View & Post-Generation Shelf Editor:
 * - Profile-scoped active & saved rotation shelves
 * - Full Rotation Engine rule builder (count, free-text objective, topic preferences, cooldown days,
 *   binding constraint, variety mix toggle, and deterministic seed input)
 * - Post-generation edit operations on any shelf:
 *   1) Random Swap (`replace-book-random`) on each book slot
 *   2) Manual Replace (`open-manual-replace-modal`) with searchable eligible catalog modal
 *   3) Add Books (`open-add-books-modal` for multi-select manual additions + quick `+1 Random` / `+2 Random`)
 *   4) Mark Read check-off, Remove slot, Activate saved shelf, and Delete shelf
 */

import {
  escapeHtml,
  formatBookBinding,
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
 */

/**
 * Renders the searchable modal dialog for Manual Book Replacement or Multi-Book Addition.
 *
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

  // Score eligible books outside current shelf so best fits appear at the top of the picker
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
              <div class="rounded-xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-3 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  ${renderBookCover(book, 'sm')}
                  <div class="min-w-0">
                    <h4 class="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                      ${escapeHtml(book.title)}
                    </h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
                      ${escapeHtml(book.authors.join(', '))}
                    </p>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Ages ${book.ageMin}–${book.ageMax}
                      <span aria-hidden="true">·</span>
                      ${escapeHtml(formatBookBinding(book.format))}
                      ${
                        inCooldown
                          ? `<span aria-hidden="true">·</span><span class="text-amber-700 dark:text-amber-400">Recent rotation</span>`
                          : `<span aria-hidden="true">·</span><span class="text-teal-700 dark:text-teal-400">Fresh</span>`
                      }
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
                        class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
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
                            ? 'bg-teal-700 text-white dark:bg-teal-600'
                            : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
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
        <div class="rounded-xl border border-slate-200/80 dark:border-slate-800 p-6 text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
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
      class="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotation-picker-modal-title"
    >
      <div class="w-full max-w-xl max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <!-- Modal Header -->
        <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h3 id="rotation-picker-modal-title" class="font-display text-lg font-bold text-slate-900 dark:text-white">
              ${
                isReplace
                  ? `Replace "${escapeHtml(targetBook?.title || 'Book')}"`
                  : `Add Books to "${escapeHtml(rotation.title)}"`
              }
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ${
                isReplace
                  ? `Ranked by fit for ${escapeHtml(profile.name)} (Age ${profile.age}). Tap Select to swap.`
                  : `Select one or multiple catalog books below, or add random eligible picks.`
              }
            </p>
          </div>
          <button
            type="button"
            data-action="close-rotation-modal"
            class="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0"
            aria-label="Close modal"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <!-- Search & Random Quick Bar -->
        <div class="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div class="relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              ${renderIcon('search', 'w-4 h-4')}
            </span>
            <input
              id="rotation-modal-search-input"
              type="search"
              value="${escapeHtml(editorState.searchQuery)}"
              placeholder="Filter available books by title, author, or topic…"
              class="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
            />
          </div>

          ${
            !isReplace && rankedCandidates.length > 0
              ? `
                <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span class="text-xs text-slate-500 dark:text-slate-400">
                    Or auto-fill random eligible books (${rankedCandidates.length} available):
                  </span>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      data-action="add-random-books"
                      data-rotation-id="${escapeHtml(rotation.id)}"
                      data-count="1"
                      class="min-h-[36px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
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
                            class="min-h-[36px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
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

        <!-- Candidate List -->
        <div class="p-5 overflow-y-auto space-y-2.5 flex-1">
          ${candidateRowsHtml}
        </div>

        ${
          !isReplace
            ? `
              <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-slate-600 dark:text-slate-300 font-mono-tabular">
                  ${selectedSet.size} selected
                </span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    data-action="close-rotation-modal"
                    class="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-action="confirm-manual-add-books"
                    ${selectedSet.size === 0 ? 'disabled' : ''}
                    class="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
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
 * Renders a single rotation card with read progress and post-generation slot editing controls.
 *
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
    <article class="rounded-2xl bg-white dark:bg-slate-900 border ${
      isActive
        ? 'border-teal-600/40 dark:border-teal-500/40'
        : 'border-slate-200/80 dark:border-slate-800'
    } p-5 sm:p-6 space-y-4">
      <!-- Shelf Header & Unboxed Rule Metadata -->
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span class="${
              isActive ? 'font-semibold text-teal-700 dark:text-teal-400' : 'font-medium'
            }">${isActive ? 'Active Shelf' : 'Saved Rotation'}</span>
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

          <h2 class="font-display text-xl font-bold text-slate-900 dark:text-white mt-1 leading-snug">
            ${escapeHtml(rot.title)}
          </h2>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            Objective: ${escapeHtml(rot.rules.objective)}
          </p>
          ${
            rot.rules.preferredTags.length > 0
              ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Preferred topics: ${escapeHtml(
                  rot.rules.preferredTags.join(' · ')
                )}</p>`
              : ''
          }
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          ${
            !isActive
              ? `
                <button
                  type="button"
                  data-action="activate-rotation"
                  data-rotation-id="${escapeHtml(rot.id)}"
                  class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-900 dark:text-white transition-colors whitespace-nowrap"
                >
                  Make Active
                </button>
              `
              : ''
          }
          <button
            type="button"
            data-action="delete-rotation"
            data-rotation-id="${escapeHtml(rot.id)}"
            class="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-xs font-semibold text-slate-600 hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
            aria-label="Delete rotation ${escapeHtml(rot.title)}"
          >
            ${renderIcon('trash', 'w-3.5 h-3.5')}
            Delete
          </button>
        </div>
      </div>

      <!-- Shelf Book Slots with Post-Generation Edit Controls -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        ${books
          .map((book) => {
            const isRead = completedSet.has(book.id);
            return `
              <div class="rounded-xl bg-slate-50/70 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 p-3.5 flex flex-col justify-between gap-3">
                <div class="flex items-start gap-3 min-w-0">
                  ${renderBookCover(book, 'sm')}
                  <div class="min-w-0 flex-1">
                    <h3 class="font-display text-sm font-semibold text-slate-900 dark:text-white leading-snug ${
                      isRead ? 'line-through opacity-75' : ''
                    }">
                      ${escapeHtml(book.title)}
                    </h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      ${escapeHtml(book.authors.join(', '))}
                    </p>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Ages ${book.ageMin}–${book.ageMax}
                      <span aria-hidden="true">·</span>
                      ${escapeHtml(formatBookBinding(book.format))}
                      <span aria-hidden="true">·</span>
                      ${escapeHtml(formatReadingStage(book.readingStage))}
                    </p>
                  </div>
                </div>

                <!-- Per-Slot Edit Bar: Mark Read | Random Swap | Manual Replace | Remove -->
                <div class="pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
                  <button
                    type="button"
                    data-action="toggle-rotation-read"
                    data-rotation-id="${escapeHtml(rot.id)}"
                    data-book-id="${escapeHtml(book.id)}"
                    aria-pressed="${isRead ? 'true' : 'false'}"
                    class="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap ${
                      isRead
                        ? 'bg-teal-700 text-white dark:bg-teal-600'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }"
                  >
                    ${renderIcon('check', 'w-3.5 h-3.5')}
                    ${isRead ? 'Read' : 'Mark Read'}
                  </button>

                  <div class="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-action="replace-book-random"
                      data-rotation-id="${escapeHtml(rot.id)}"
                      data-book-id="${escapeHtml(book.id)}"
                      ${!hasOffShelfBooks ? 'disabled title="No off-shelf books available"' : ''}
                      class="min-h-[36px] px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-45 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                      Swap
                    </button>
                    <button
                      type="button"
                      data-action="open-manual-replace-modal"
                      data-rotation-id="${escapeHtml(rot.id)}"
                      data-book-id="${escapeHtml(book.id)}"
                      ${!hasOffShelfBooks ? 'disabled title="No off-shelf books available"' : ''}
                      class="min-h-[36px] px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-45 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                    >
                      Replace…
                    </button>
                    ${
                      books.length > 1
                        ? `
                          <button
                            type="button"
                            data-action="remove-rotation-book"
                            data-rotation-id="${escapeHtml(rot.id)}"
                            data-book-id="${escapeHtml(book.id)}"
                            class="min-h-[36px] min-w-[36px] p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
                            aria-label="Remove ${escapeHtml(book.title)} from shelf"
                          >
                            ${renderIcon('close', 'w-3.5 h-3.5')}
                          </button>
                        `
                        : ''
                    }
                  </div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <!-- Shelf-Level Post-Generation Addition Footer -->
      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
        <span class="text-xs text-slate-500 dark:text-slate-400">
          Need more books on this shelf?
        </span>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-action="add-random-books"
            data-rotation-id="${escapeHtml(rot.id)}"
            data-count="1"
            ${!hasOffShelfBooks ? 'disabled' : ''}
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-45 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            ${renderIcon('shuffle', 'w-3.5 h-3.5')}
            +1 Random Eligible
          </button>
          <button
            type="button"
            data-action="open-add-books-modal"
            data-rotation-id="${escapeHtml(rot.id)}"
            ${!hasOffShelfBooks ? 'disabled' : ''}
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-45 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            ${renderIcon('plus', 'w-3.5 h-3.5')}
            Add Books…
          </button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renders the complete Phase 4 Rotations View & Generator.
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

  const profileTabsHtml = state.profiles
    .map((p) => {
      const selected = p.id === activeProfile.id;
      return `
        <button
          type="button"
          data-action="switch-profile"
          data-profile-id="${escapeHtml(p.id)}"
          class="min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            selected
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(p.name)}’s Shelves
        </button>
      `;
    })
    .join('');

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
        <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            No rotations saved for ${escapeHtml(activeProfile.name)} yet.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure rules in the Rotation Engine panel to generate ${escapeHtml(
              activeProfile.name
            )}’s first shelf.
          </p>
        </div>
      `;

  return `
    <div class="space-y-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Book Rotations
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Generate rule-based shelves per child and fine-tune slots with random or manual swaps.
          </p>
        </div>
        <div class="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
          ${profileTabsHtml}
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <!-- Active & Saved Rotation Shelves -->
        <div class="lg:col-span-8 space-y-5">
          ${rotationsListHtml}
        </div>

        <!-- Phase 4 Rotation Engine Generator Form -->
        <aside class="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
          <div class="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 class="font-display text-lg font-bold text-slate-900 dark:text-white">
              Generate Shelf for ${escapeHtml(activeProfile.name)}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Age ${activeProfile.age} · ${escapeHtml(
                formatReadingStage(activeProfile.readingStage)
              )} · Balances age fit, topic tags, author variety, and cooldown recency.
            </p>
          </div>

          <form id="generate-rotation-form" class="mt-4 space-y-4">
            <div>
              <label for="rot-title" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Shelf Title
              </label>
              <input
                id="rot-title"
                name="title"
                type="text"
                placeholder="${escapeHtml(activeProfile.name)}’s Weekly Shelf"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="rot-objective" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Rotation Objective / Description
              </label>
              <input
                id="rot-objective"
                name="objective"
                type="text"
                placeholder="e.g., hardcover + winter & nature themes"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Tip: Mention bindings (hardcover, board book) or themes (Christmas, space, bedtime).
              </p>
            </div>

            <div>
              <label for="rot-tags" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Topic Preferences (comma-separated)
              </label>
              <input
                id="rot-tags"
                name="preferredTags"
                type="text"
                value="${escapeHtml(activeProfile.favoriteTopics.join(', '))}"
                placeholder="animals, nature, bedtime"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="rot-count" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Book Count
                </label>
                <input
                  id="rot-count"
                  name="count"
                  type="number"
                  min="1"
                  max="15"
                  value="${activeProfile.defaultRotationSize}"
                  class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
                />
              </div>

              <div>
                <label for="rot-cooldown" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Cooldown (days)
                </label>
                <input
                  id="rot-cooldown"
                  name="cooldownDays"
                  type="number"
                  min="0"
                  max="90"
                  value="${activeProfile.cooldownDays}"
                  class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
                />
              </div>
            </div>

            <div>
              <label for="rot-format" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Binding Filter
              </label>
              <select
                id="rot-format"
                name="requiredFormat"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              >
                <option value="any" selected>Any Binding</option>
                <option value="hardcover">Hardcover Preferred</option>
                <option value="board-book">Board Book Preferred</option>
                <option value="paperback">Paperback Preferred</option>
              </select>
            </div>

            <label class="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                name="varietyMix"
                checked
                class="mt-0.5 h-4 w-4 rounded accent-teal-700"
              />
              <span>
                <strong class="font-semibold">Enforce author & topic variety</strong>
                <span class="block text-slate-500 dark:text-slate-400">Prevents multiple books by the same author from crowding one shelf.</span>
              </span>
            </label>

            <div>
              <label for="rot-seed" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Deterministic Seed (optional)
              </label>
              <input
                id="rot-seed"
                name="seed"
                type="text"
                placeholder="e.g., dec-holiday-01 (leave blank for random)"
                class="w-full min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <button
              type="submit"
              class="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Generate Rotation List
            </button>
          </form>
        </aside>
      </div>

      ${renderRotationPickerModal({ state, editorState })}
    </div>
  `;
}
