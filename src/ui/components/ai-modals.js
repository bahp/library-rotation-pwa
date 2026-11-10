/**
 * @fileoverview Modals & Sheets for the three LLM Actions:
 * 1. AI Book Tagging Assistant (Categorized interactive, developmental & freeform tags)
 * 2. AI Rotation Shelf Curator (Picks books from the user's library with tailored explanations)
 * 3. AI Library Recommendations (Discovers new books to fill collection gaps or match favorites)
 */

import { escapeHtml, formatReadingStage } from '../../types/models.js';
import { renderBookCover } from './book-cover.js';
import { renderInputClearButton } from './clearable-input.js';
import { renderIcon } from '../icons.js';
import {
  INTERACTIVE_FORMAT_CATEGORIES,
  DEVELOPMENTAL_THEME_CATEGORIES,
  CONCEPT_CATEGORIES,
} from '../../features/llm/llm-client.js';

/**
 * ACTION 1 MODAL: AI Tagging & Categorization Assistant
 * Allows parents/readers to preview categorized tags returned by the LLM and select which to save.
 *
 * @param {{
 *   book: import('../../types/models.js').Book | null,
 *   isOpen: boolean,
 *   isLoading: boolean,
 *   error: string,
 *   tagResults: {
 *     interactiveFormats: string[],
 *     developmentalThemes: string[],
 *     concepts: string[],
 *     freeform: string[],
 *     allTags: string[],
 *     readingStage?: string,
 *     readingLevelHint?: string
 *   } | null,
 *   selectedTags: Set<string>
 * }} params
 * @returns {string}
 */
export function renderAiTaggingModal({
  book,
  isOpen,
  isLoading,
  error = '',
  tagResults = null,
  selectedTags = new Set(),
}) {
  if (!isOpen || !book) return '';

  const formatLabels = new Map(INTERACTIVE_FORMAT_CATEGORIES.map((c) => [c.id, c.label]));
  const themeLabels = new Map(DEVELOPMENTAL_THEME_CATEGORIES.map((c) => [c.id, c.label]));
  const conceptLabels = new Map(CONCEPT_CATEGORIES.map((c) => [c.id, c.label]));

  const renderTagChip = (/** @type {string} */ tag, /** @type {string} */ categoryName) => {
    const isSelected = selectedTags.has(tag);
    let label = tag;
    if (categoryName === 'format') label = formatLabels.get(tag) || tag;
    else if (categoryName === 'theme') label = themeLabels.get(tag) || tag;
    else if (categoryName === 'concept') label = conceptLabels.get(tag) || tag;

    return `
      <button
        type="button"
        data-action="toggle-ai-suggested-tag"
        data-tag="${escapeHtml(tag)}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
        class="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
          isSelected
            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
            : 'bg-linen-100 hover:bg-linen-200 text-forest-900 dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-200 border border-linen-200 dark:border-night-700'
        }"
      >
        <span>${escapeHtml(label)}</span>
        <span class="text-[10px] opacity-75">${isSelected ? '✓' : '+'}</span>
      </button>
    `;
  };

  return `
    <div
      data-backdrop-action="close-ai-tag-modal"
      class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-tag-modal-title"
        class="animate-sheet-up w-full max-w-lg sm:max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <!-- Top bar -->
        <div class="px-5 pt-3.5 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
              ${renderIcon('sparkles', 'w-4 h-4')}
            </span>
            <div>
              <h2 id="ai-tag-modal-title" class="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                AI Tagging &amp; Categorization
              </h2>
              <p class="text-[11px] text-stone-ink dark:text-slate-400 truncate max-w-[240px] sm:max-w-sm">
                ${escapeHtml(book.title)} · ${escapeHtml(book.authors[0] || '')}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-action="close-ai-tag-modal"
            aria-label="Close"
            class="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          ${
            isLoading
              ? `
                <div class="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div class="w-10 h-10 rounded-full border-3 border-forest-200 border-t-forest-700 dark:border-night-700 dark:border-t-[#5ED3DA] animate-spin"></div>
                  <div>
                    <p class="text-sm font-semibold text-forest-900 dark:text-white">
                      Querying LLM for Categorized Tags…
                    </p>
                    <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      Identifying interactive features, developmental themes, and story topics.
                    </p>
                  </div>
                </div>
              `
              : error
                ? `
                  <div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 p-4 space-y-2">
                    <p class="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                      ${renderIcon('close', 'w-4 h-4 text-rose-600')}
                      <span>LLM Query Error</span>
                    </p>
                    <p class="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                      ${escapeHtml(error)}
                    </p>
                    <button
                      type="button"
                      data-action="retry-ai-tag-query"
                      data-book-id="${escapeHtml(book.id)}"
                      class="mt-1 min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      ${renderIcon('sparkles', 'w-3.5 h-3.5')}
                      <span>Retry Query</span>
                    </button>
                  </div>
                `
                : tagResults
                  ? `
                    <!-- Tag Results by Category -->
                    <div class="space-y-4">
                      <!-- 1. Interactive / Physical Book Features -->
                      <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                          <p class="font-bold text-forest-900 dark:text-white text-xs inline-flex items-center gap-1.5">
                            <span>📖</span>
                            <span>Interactive &amp; Format Features</span>
                          </p>
                          <span class="text-[11px] text-stone-ink dark:text-slate-400">
                            Lift-the-flap, sliders, textures, sounds
                          </span>
                        </div>
                        ${
                          tagResults.interactiveFormats.length > 0
                            ? `<div class="flex flex-wrap gap-1.5">
                                ${tagResults.interactiveFormats.map((t) => renderTagChip(t, 'format')).join('')}
                              </div>`
                            : `<p class="text-stone-ink dark:text-slate-400 italic">No specific interactive format identified (standard reading book).</p>`
                        }
                      </div>

                      <!-- 2. Developmental Themes & Daily Life -->
                      <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                          <p class="font-bold text-forest-900 dark:text-white text-xs inline-flex items-center gap-1.5">
                            <span>🌱</span>
                            <span>Developmental &amp; Emotional Themes</span>
                          </p>
                          <span class="text-[11px] text-stone-ink dark:text-slate-400">
                            Bedtime, emotions, routines, family
                          </span>
                        </div>
                        ${
                          tagResults.developmentalThemes.length > 0
                            ? `<div class="flex flex-wrap gap-1.5">
                                ${tagResults.developmentalThemes.map((t) => renderTagChip(t, 'theme')).join('')}
                              </div>`
                            : `<p class="text-stone-ink dark:text-slate-400 italic">No developmental routine tags identified.</p>`
                        }
                      </div>

                      <!-- 3. Early Learning Concepts -->
                      <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                          <p class="font-bold text-forest-900 dark:text-white text-xs inline-flex items-center gap-1.5">
                            <span>🔍</span>
                            <span>Early Concepts &amp; Knowledge</span>
                          </p>
                          <span class="text-[11px] text-stone-ink dark:text-slate-400">
                            Counting, nature, animals, vehicles
                          </span>
                        </div>
                        ${
                          tagResults.concepts.length > 0
                            ? `<div class="flex flex-wrap gap-1.5">
                                ${tagResults.concepts.map((t) => renderTagChip(t, 'concept')).join('')}
                              </div>`
                            : `<p class="text-stone-ink dark:text-slate-400 italic">No concept tags identified.</p>`
                        }
                      </div>

                      <!-- 4. Story & Thematic Freeform Tags -->
                      <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                          <p class="font-bold text-forest-900 dark:text-white text-xs inline-flex items-center gap-1.5">
                            <span>✨</span>
                            <span>Free-Form Story Topics</span>
                          </p>
                          <span class="text-[11px] text-stone-ink dark:text-slate-400">
                            Specific story elements
                          </span>
                        </div>
                        ${
                          tagResults.freeform.length > 0
                            ? `<div class="flex flex-wrap gap-1.5">
                                ${tagResults.freeform.map((t) => renderTagChip(t, 'freeform')).join('')}
                              </div>`
                            : `<p class="text-stone-ink dark:text-slate-400 italic">No freeform tags generated.</p>`
                        }
                      </div>

                      <!-- Reading Stage Suggestion -->
                      ${
                        tagResults.readingStage || tagResults.readingLevelHint
                          ? `
                            <div class="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 p-3 space-y-1">
                              <p class="text-[11px] font-bold text-forest-900 dark:text-white">
                                Suggested Stage &amp; Pacing:
                              </p>
                              <p class="text-xs text-stone-ink dark:text-slate-300">
                                <strong>${escapeHtml(formatReadingStage(/** @type {any} */ (tagResults.readingStage || book.readingStage)))}</strong>
                                ${tagResults.readingLevelHint ? ` · ${escapeHtml(tagResults.readingLevelHint)}` : ''}
                              </p>
                            </div>
                          `
                          : ''
                      }
                    </div>
                  `
                  : `
                    <div class="py-6 text-center space-y-3">
                      <p class="text-sm font-semibold text-forest-900 dark:text-white">
                        Ready to analyze "${escapeHtml(book.title)}"?
                      </p>
                      <p class="text-xs text-stone-ink dark:text-slate-400 max-w-sm mx-auto">
                        We'll query the LLM to identify hands-on formats (like lift-the-flap or sensory sliders), developmental themes, and specific story topics.
                      </p>
                      <button
                        type="button"
                        data-action="start-ai-tag-query"
                        data-book-id="${escapeHtml(book.id)}"
                        class="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-xs"
                      >
                        ${renderIcon('sparkles', 'w-4 h-4')}
                        <span>Query LLM for Tags</span>
                      </button>
                    </div>
                  `
          }
        </div>

        <!-- Footer Actions -->
        ${
          tagResults && !isLoading
            ? `
              <div class="px-5 py-3 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-3 bg-linen-50/50 dark:bg-night-950/50">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    data-action="select-all-ai-tags"
                    class="text-xs font-semibold text-forest-700 hover:underline dark:text-[#5ED3DA]"
                  >
                    Select All
                  </button>
                  <span class="text-stone-ink/40">·</span>
                  <button
                    type="button"
                    data-action="clear-all-ai-tags"
                    class="text-xs font-semibold text-stone-ink hover:underline dark:text-slate-400"
                  >
                    Clear
                  </button>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    data-action="close-ai-tag-modal"
                    class="min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs font-semibold text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-action="save-ai-tags-to-book"
                    data-book-id="${escapeHtml(book.id)}"
                    ${selectedTags.size === 0 ? 'disabled' : ''}
                    class="min-h-[42px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    ${renderIcon('check', 'w-4 h-4')}
                    <span>Apply ${selectedTags.size} Tag${selectedTags.size === 1 ? '' : 's'}</span>
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
 * ACTION 2 MODAL: AI Rotation Shelf Curator
 * Lets the user describe the desired rotation, queries the LLM to select matching books from the library,
 * and provides transparent reasons for each book.
 *
 * @param {{
 *   activeProfile: import('../../types/models.js').ChildProfile,
 *   isOpen: boolean,
 *   isCurating: boolean,
 *   curatorPlan: {
 *     themeTitle: string,
 *     curatorNote: string,
 *     selectedBooks: Array<{ bookId: string, book?: import('../../types/models.js').Book, title: string, reason: string }>
 *   } | null,
 *   error: string,
 *   objectiveInput: string,
 *   bookCount: number,
 *   selectedBookIds: Set<string>,
 *   rotatableCatalogCount: number
 * }} params
 * @returns {string}
 */
export function renderAiRotationCuratorModal({
  activeProfile,
  isOpen,
  isCurating,
  curatorPlan = null,
  error = '',
  objectiveInput = '',
  bookCount = 5,
  selectedBookIds = new Set(),
  rotatableCatalogCount = 0,
}) {
  if (!isOpen || !activeProfile) return '';

  const quickObjectives = [
    'Bedtime routines, lullabies & calming stories',
    'Interactive lift-the-flap and sensory books',
    'Woodland animals, nature & forest discoveries',
    'Early STEM, counting numbers & big machines',
    'Unread hidden gems from our family collection',
  ];

  return `
    <div
      data-backdrop-action="close-ai-rotation-curator"
      class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-curator-modal-title"
        class="animate-sheet-up w-full max-w-xl sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <!-- Top bar -->
        <div class="px-5 pt-3.5 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
              ${renderIcon('sparkles', 'w-4 h-4')}
            </span>
            <div>
              <h2 id="ai-curator-modal-title" class="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                Smart Shelf Curator (AI Assistant)
              </h2>
              <p class="text-[11px] text-stone-ink dark:text-slate-400">
                Curating rotation for <strong>${escapeHtml(activeProfile.name)}</strong> (Age ${activeProfile.age} · ${escapeHtml(formatReadingStage(activeProfile.readingStage))})
              </p>
            </div>
          </div>
          <button
            type="button"
            data-action="close-ai-rotation-curator"
            aria-label="Close"
            class="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          ${
            rotatableCatalogCount < 2
              ? `
                <div class="p-6 text-center space-y-2">
                  <p class="text-sm font-bold text-forest-900 dark:text-white">Need More Books in Library</p>
                  <p class="text-xs text-stone-ink dark:text-slate-400">
                    You currently have ${rotatableCatalogCount} available book. Add a few books to your catalog so the AI Curator can select a balanced rotation shelf!
                  </p>
                </div>
              `
              : `
                <!-- Curate Form -->
                <form id="ai-rotation-curator-form" class="space-y-3" novalidate>
                  <div>
                    <label for="ai-rotation-objective-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                      Rotation Theme, Mood or Goal
                    </label>
                    <div class="relative min-w-0">
                      <input
                        id="ai-rotation-objective-input"
                        name="objective"
                        type="text"
                        value="${escapeHtml(objectiveInput)}"
                        placeholder="e.g. Lift-the-flap books & bedtime animal stories"
                        class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                      ${renderInputClearButton({
                        targetId: 'ai-rotation-objective-input',
                        value: objectiveInput,
                        label: 'Clear rotation theme',
                      })}
                    </div>
                  </div>

                  <!-- Quick Idea Chips -->
                  <div>
                    <p class="text-[11px] font-semibold text-stone-ink dark:text-slate-400 mb-1.5">
                      Quick Themes:
                    </p>
                    <div class="flex flex-wrap gap-1.5">
                      ${quickObjectives
                        .map(
                          (opt) => `
                            <button
                              type="button"
                              data-action="pick-ai-rotation-theme-chip"
                              data-theme="${escapeHtml(opt)}"
                              class="min-h-[30px] px-2.5 py-1 rounded-lg bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-[11px] font-medium text-forest-900 dark:text-slate-200 transition-colors"
                            >
                              ${escapeHtml(opt)}
                            </button>
                          `
                        )
                        .join('')}
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label for="ai-rotation-count-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                        Shelf Size (Books)
                      </label>
                      <input
                        id="ai-rotation-count-input"
                        name="count"
                        type="number"
                        min="1"
                        max="15"
                        value="${escapeHtml(bookCount)}"
                        class="w-full h-11 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                    </div>
                    <div class="flex items-end">
                      <button
                        type="submit"
                        ${isCurating ? 'disabled' : ''}
                        class="w-full h-11 px-4 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
                      >
                        ${
                          isCurating
                            ? `${renderIcon('sparkles', 'w-4 h-4 animate-spin')}<span>Curating…</span>`
                            : `${renderIcon('sparkles', 'w-4 h-4')}<span>Curate Shelf</span>`
                        }
                      </button>
                    </div>
                  </div>
                </form>

                ${
                  error
                    ? `
                      <div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 p-3.5 space-y-1">
                        <p class="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                          ${renderIcon('close', 'w-4 h-4 text-rose-600')}
                          <span>Curator Error</span>
                        </p>
                        <p class="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                          ${escapeHtml(error)}
                        </p>
                      </div>
                    `
                    : ''
                }

                ${
                  curatorPlan
                    ? `
                      <!-- Curator Results -->
                      <div class="pt-3 border-t border-linen-200/80 dark:border-night-800 space-y-3">
                        <div class="rounded-xl bg-forest-50/80 dark:bg-forest-950/40 border border-forest-700/20 dark:border-[#5ED3DA]/30 p-3.5 space-y-1">
                          <p class="text-xs font-bold text-forest-900 dark:text-[#5ED3DA]">
                            ${escapeHtml(curatorPlan.themeTitle)}
                          </p>
                          <p class="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                            ${escapeHtml(curatorPlan.curatorNote)}
                          </p>
                        </div>

                        <div class="space-y-2">
                          <p class="text-xs font-bold text-forest-900 dark:text-white">
                            Selected Books (${curatorPlan.selectedBooks.length}):
                          </p>
                          <div class="space-y-2">
                            ${curatorPlan.selectedBooks
                              .map((item) => {
                                const isChecked = selectedBookIds.has(item.bookId);
                                const book = item.book;
                                return `
                                  <div class="rounded-xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3 flex items-start justify-between gap-3">
                                    <div class="flex items-start gap-3 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        data-action="toggle-curated-book-selection"
                                        data-book-id="${escapeHtml(item.bookId)}"
                                        ${isChecked ? 'checked' : ''}
                                        class="mt-1 h-4 w-4 rounded accent-[#1F6E75] shrink-0"
                                      />
                                      ${
                                        book
                                          ? renderBookCover(book, 'xs', 'square')
                                          : `<div class="w-10 h-10 rounded-lg bg-linen-200 dark:bg-night-800 shrink-0"></div>`
                                      }
                                      <div class="min-w-0">
                                        <p class="text-xs font-bold text-forest-900 dark:text-white truncate">
                                          ${escapeHtml(item.title || book?.title || 'Unknown Book')}
                                        </p>
                                        <p class="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                                          ${escapeHtml(book?.authors?.[0] || '')}
                                          ${book?.readingStage ? ` · ${escapeHtml(formatReadingStage(book.readingStage))}` : ''}
                                        </p>
                                        <p class="text-xs text-forest-700 dark:text-[#5ED3DA] mt-1 leading-relaxed">
                                          ${escapeHtml(item.reason)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                `;
                              })
                              .join('')}
                          </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="pt-3 flex flex-wrap items-center justify-end gap-2.5">
                          <button
                            type="button"
                            data-action="save-curated-rotation"
                            data-activate="false"
                            ${selectedBookIds.size === 0 ? 'disabled' : ''}
                            class="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            Save as Saved Shelf
                          </button>
                          <button
                            type="button"
                            data-action="save-curated-rotation"
                            data-activate="true"
                            ${selectedBookIds.size === 0 ? 'disabled' : ''}
                            class="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
                          >
                            ${renderIcon('check', 'w-4 h-4')}
                            <span>Put on Active Shelf (${selectedBookIds.size})</span>
                          </button>
                        </div>
                      </div>
                    `
                    : ''
                }
              `
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * ACTION 3 MODAL: AI Library Recommendations
 * Analyzes current collection to suggest new books filling gaps, matching favorites, or preparing for the next stage.
 *
 * @param {{
 *   activeProfile: import('../../types/models.js').ChildProfile,
 *   isOpen: boolean,
 *   isLoading: boolean,
 *   recommendations: Array<{
 *     title: string,
 *     author: string,
 *     ageRange: string,
 *     readingStage: string,
 *     category: string,
 *     reason: string,
 *     gapFilled: string
 *   }>,
 *   summary: string,
 *   error: string,
 *   activeGoal: 'gaps' | 'similar-favorites' | 'next-stage' | 'custom',
 *   customPrompt: string,
 *   count: number,
 *   existingLibraryTitles: Set<string>
 * }} params
 * @returns {string}
 */
export function renderAiRecommendationsModal({
  activeProfile,
  isOpen,
  isLoading,
  recommendations = [],
  summary = '',
  error = '',
  activeGoal = 'gaps',
  customPrompt = '',
  count = 4,
  existingLibraryTitles = new Set(),
}) {
  if (!isOpen || !activeProfile) return '';

  const goals = [
    { id: 'gaps', label: 'Fill Missing Gaps', icon: '🎯' },
    { id: 'similar-favorites', label: 'Like Loved Books', icon: '❤️' },
    { id: 'next-stage', label: 'Next Reading Stage', icon: '🚀' },
    { id: 'custom', label: 'Custom Wish', icon: '💬' },
  ];

  return `
    <div
      data-backdrop-action="close-ai-recommendations"
      class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-recs-modal-title"
        class="animate-sheet-up w-full max-w-xl sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <!-- Top bar -->
        <div class="px-5 pt-3.5 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
              ${renderIcon('sparkles', 'w-4 h-4')}
            </span>
            <div>
              <h2 id="ai-recs-modal-title" class="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                Book Recommendations &amp; Gap Analysis
              </h2>
              <p class="text-[11px] text-stone-ink dark:text-slate-400">
                Tailored for <strong>${escapeHtml(activeProfile.name)}</strong> (Age ${activeProfile.age} · ${escapeHtml(formatReadingStage(activeProfile.readingStage))})
              </p>
            </div>
          </div>
          <button
            type="button"
            data-action="close-ai-recommendations"
            aria-label="Close"
            class="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          <!-- Goal Tabs -->
          <div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-800">
              ${goals
                .map((g) => {
                  const isActive = activeGoal === g.id;
                  return `
                    <button
                      type="button"
                      data-action="set-ai-rec-goal"
                      data-goal="${escapeHtml(g.id)}"
                      class="min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors ${
                        isActive
                          ? 'bg-ivory dark:bg-night-900 text-forest-900 dark:text-white shadow-2xs'
                          : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                      }"
                    >
                      <span>${g.icon}</span>
                      <span class="truncate">${escapeHtml(g.label)}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          <!-- Prompt / Count Controls -->
          <form id="ai-recommendations-query-form" class="space-y-3" novalidate>
            ${
              activeGoal === 'custom'
                ? `
                  <div>
                    <label for="ai-rec-custom-prompt" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                      What books are you looking for?
                    </label>
                    <div class="relative min-w-0">
                      <input
                        id="ai-rec-custom-prompt"
                        name="customPrompt"
                        type="text"
                        value="${escapeHtml(customPrompt)}"
                        placeholder="e.g. Spanish bilingual books about trucks and sharing"
                        class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                      ${renderInputClearButton({
                        targetId: 'ai-rec-custom-prompt',
                        value: customPrompt,
                        label: 'Clear wish prompt',
                      })}
                    </div>
                  </div>
                `
                : ''
            }

            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <label for="ai-rec-count-select" class="text-xs font-semibold text-forest-900 dark:text-slate-200">
                  Recommendations:
                </label>
                <select
                  id="ai-rec-count-select"
                  name="count"
                  class="h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                >
                  <option value="3" ${count === 3 ? 'selected' : ''}>3 books (Quota friendly)</option>
                  <option value="4" ${count === 4 ? 'selected' : ''}>4 books (Balanced)</option>
                  <option value="6" ${count === 6 ? 'selected' : ''}>6 books (Detailed)</option>
                </select>
              </div>

              <button
                type="submit"
                ${isLoading ? 'disabled' : ''}
                class="min-h-[42px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
              >
                ${
                  isLoading
                    ? `${renderIcon('sparkles', 'w-4 h-4 animate-spin')}<span>Analyzing…</span>`
                    : `${renderIcon('sparkles', 'w-4 h-4')}<span>Get Recommendations</span>`
                }
              </button>
            </div>
          </form>

          ${
            error
              ? `
                <div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 p-3.5 space-y-1">
                  <p class="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                    ${renderIcon('close', 'w-4 h-4 text-rose-600')}
                    <span>Recommendation Error</span>
                  </p>
                  <p class="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                    ${escapeHtml(error)}
                  </p>
                </div>
              `
              : ''
          }

          ${
            summary
              ? `
                <div class="rounded-xl bg-forest-50/80 dark:bg-forest-950/40 border border-forest-700/20 dark:border-[#5ED3DA]/30 p-3.5 space-y-1">
                  <p class="text-xs font-bold text-forest-900 dark:text-[#5ED3DA]">
                    Collection &amp; Reader Analysis:
                  </p>
                  <p class="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                    ${escapeHtml(summary)}
                  </p>
                </div>
              `
              : ''
          }

          ${
            recommendations.length > 0
              ? `
                <div class="space-y-3">
                  ${recommendations
                    .map((rec) => {
                      const inCatalog = existingLibraryTitles.has(rec.title.toLowerCase().trim());
                      return `
                        <div class="rounded-xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-2">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <h3 class="font-display text-sm font-bold text-forest-900 dark:text-white truncate">
                                ${escapeHtml(rec.title)}
                              </h3>
                              <p class="text-xs text-stone-ink dark:text-slate-400">
                                by <strong>${escapeHtml(rec.author)}</strong>
                                ${rec.ageRange ? ` · Ages ${escapeHtml(rec.ageRange)}` : ''}
                                ${rec.readingStage ? ` · ${escapeHtml(formatReadingStage(/** @type {any} */ (rec.readingStage)))}` : ''}
                              </p>
                            </div>
                            <div class="shrink-0 flex items-center gap-1.5">
                              ${
                                inCatalog
                                  ? `
                                    <span class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[11px] font-semibold">
                                      In Library
                                    </span>
                                  `
                                  : `
                                    <button
                                      type="button"
                                      data-action="add-rec-to-wishlist"
                                      data-rec-title="${escapeHtml(rec.title)}"
                                      data-rec-author="${escapeHtml(rec.author)}"
                                      data-rec-stage="${escapeHtml(rec.readingStage || '')}"
                                      data-rec-category="${escapeHtml(rec.category || '')}"
                                      data-rec-gap="${escapeHtml(rec.gapFilled || '')}"
                                      data-rec-reason="${escapeHtml(rec.reason || '')}"
                                      class="min-h-[36px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-forest-700 hover:text-white dark:bg-night-800 dark:hover:bg-[#5ED3DA] dark:hover:text-night-950 text-forest-900 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                                    >
                                      ${renderIcon('bookmark', 'w-3.5 h-3.5')}
                                      <span>Add to Wishlist</span>
                                    </button>
                                  `
                              }
                              <a
                                href="#/scan?tab=search&q=${encodeURIComponent(rec.title)}"
                                class="min-h-[36px] px-2.5 py-1.5 rounded-xl text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                                title="Search details and covers in catalog"
                              >
                                ${renderIcon('search', 'w-3.5 h-3.5')}
                              </a>
                            </div>
                          </div>

                          <p class="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                            ${escapeHtml(rec.reason)}
                          </p>

                          ${
                            rec.gapFilled
                              ? `
                                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-forest-50 dark:bg-forest-950/60 text-forest-800 dark:text-[#5ED3DA] text-[11px] font-medium">
                                  <span>✨ Gap Filled:</span>
                                  <span>${escapeHtml(rec.gapFilled)}</span>
                                </div>
                              `
                              : ''
                          }
                        </div>
                      `;
                    })
                    .join('')}
                </div>
              `
              : !isLoading && !error
                ? `
                  <div class="py-8 text-center space-y-2">
                    <p class="text-sm font-semibold text-forest-900 dark:text-white">
                      Discover tailored books for ${escapeHtml(activeProfile.name)}
                    </p>
                    <p class="text-xs text-stone-ink dark:text-slate-400 max-w-sm mx-auto">
                      Choose a goal above and click "Get Recommendations" to see award-winning children's books that expand your collection!
                    </p>
                  </div>
                `
                : ''
          }
        </div>
      </div>
    </div>
  `;
}
