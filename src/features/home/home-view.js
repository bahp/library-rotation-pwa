/**
 * @fileoverview Home view: Active reader profile switcher, current rotation shelf check-off,
 * Phase 5 personalized next-read recommendations & topic coverage insights,
 * searchable/filterable family book catalog, and book provenance / tag curation modal.
 */

import {
  escapeHtml,
  formatBookBinding,
  formatReadingStage,
} from '../../types/models.js';
import {
  getProfileRecommendations,
  getTopicCoverageInsights,
} from '../tagging/recommendations.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * Renders the Home view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   uiState: { catalogFilter: string, searchQuery: string, inspectedBookId: string | null }
 * }} params
 * @returns {string}
 */
export function renderHomeView({ state, uiState }) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

  const activeRotation = state.rotations.find(
    (r) => r.profileId === activeProfile.id && r.status === 'active'
  );

  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const rotationBooks = activeRotation
    ? activeRotation.bookIds
        .map((id) => bookMap.get(id))
        .filter(/** @returns {b is import('../../types/models.js').Book} */ (b) => Boolean(b))
    : [];

  const completedCount = activeRotation
    ? activeRotation.completedBookIds.filter((id) => activeRotation.bookIds.includes(id)).length
    : 0;

  const profileButtonsHtml = state.profiles
    .map((profile) => {
      const selected = profile.id === activeProfile.id;
      return `
        <button
          type="button"
          data-action="switch-profile"
          data-profile-id="${escapeHtml(profile.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
          class="min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-600 ${
            selected
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(profile.name)} (Age ${profile.age})
        </button>
      `;
    })
    .join('');

  const activeShelfHtml = activeRotation
    ? `
      <section aria-labelledby="active-shelf-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p class="text-xs font-medium text-teal-700 dark:text-teal-400">
              Current Rotation for ${escapeHtml(activeProfile.name)}
            </p>
            <h1 id="active-shelf-heading" class="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-0.5">
              ${escapeHtml(activeRotation.title)}
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              ${escapeHtml(activeRotation.rules.objective)}
            </p>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular whitespace-nowrap shrink-0">
            <span>${completedCount} of ${rotationBooks.length} read together</span>
            <span aria-hidden="true"> · </span>
            <a href="#/rotations" class="font-sans font-semibold text-teal-700 dark:text-teal-400 hover:underline">Manage shelf</a>
          </div>
        </div>

        <div class="divide-y divide-slate-100 dark:divide-slate-800/80 mt-2">
          ${rotationBooks
            .map((book) => {
              const isRead = activeRotation.completedBookIds.includes(book.id);
              return `
                <div class="py-4 flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3.5 min-w-0">
                    ${renderBookCover(book, 'sm')}
                    <div class="min-w-0">
                      <button
                        type="button"
                        data-action="inspect-book"
                        data-book-id="${escapeHtml(book.id)}"
                        class="text-left font-display text-base font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 truncate block max-w-full ${
                          isRead ? 'line-through opacity-65' : ''
                        }"
                      >
                        ${escapeHtml(book.title)}
                      </button>
                      <p class="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                        ${escapeHtml(book.authors.join(', '))}
                      </p>
                      <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span>Ages ${book.ageMin}–${book.ageMax}</span>
                        <span aria-hidden="true">·</span>
                        <span>${escapeHtml(formatBookBinding(book.format))}</span>
                        ${
                          book.tags.length
                            ? `<span aria-hidden="true">·</span><span>${escapeHtml(
                                book.tags.slice(0, 3).join(', ')
                              )}</span>`
                            : ''
                        }
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    ${
                      state.books.length > rotationBooks.length
                        ? `
                          <button
                            type="button"
                            data-action="replace-book-random"
                            data-rotation-id="${escapeHtml(activeRotation.id)}"
                            data-book-id="${escapeHtml(book.id)}"
                            title="Swap with a random eligible book"
                            aria-label="Swap ${escapeHtml(book.title)} with a random eligible book"
                            class="min-h-[44px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            ${renderIcon('shuffle', 'w-4 h-4')}
                            <span class="hidden sm:inline">Swap</span>
                          </button>
                        `
                        : ''
                    }
                    <button
                      type="button"
                      data-action="toggle-rotation-read"
                      data-rotation-id="${escapeHtml(activeRotation.id)}"
                      data-book-id="${escapeHtml(book.id)}"
                      aria-pressed="${isRead ? 'true' : 'false'}"
                      class="min-h-[44px] min-w-[96px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
                        isRead
                          ? 'bg-teal-700 text-white dark:bg-teal-600'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200'
                      }"
                    >
                      ${isRead ? `${renderIcon('check', 'w-4 h-4')} Read` : 'Mark Read'}
                    </button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </section>
    `
    : `
      <section class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 text-center">
        <h1 class="font-display text-2xl font-bold text-slate-900 dark:text-white">
          No Active Shelf for ${escapeHtml(activeProfile.name)}
        </h1>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Create a fresh weekly book rotation tailored to ${escapeHtml(activeProfile.name)}’s age and favorite topics.
        </p>
        <div class="mt-5 flex justify-center">
          <a
            href="#/rotations"
            class="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Create Starter Rotation
          </a>
        </div>
      </section>
    `;

  // Phase 5: Personalized Recommendations & Topic Coverage Insights
  const recommendations = getProfileRecommendations({
    books: state.books,
    profile: activeProfile,
    rotations: state.rotations,
    limit: 3,
  });
  const coverage = getTopicCoverageInsights({
    books: state.books,
    profile: activeProfile,
  });

  const recommendationsHtml =
    recommendations.length > 0
      ? `
        <section aria-labelledby="recommendations-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
          <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 id="recommendations-heading" class="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Recommended Next for ${escapeHtml(activeProfile.name)}
              </h2>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ranked from off-shelf books by age fit, ${escapeHtml(
                  activeProfile.favoriteTopics.join(', ') || 'variety'
                )}, and reading freshness.
              </p>
            </div>
            ${
              coverage.lowCoverageTopics.length > 0
                ? `<p class="text-xs text-slate-500 dark:text-slate-400">
                    Collection gap hint: fewer than 2 books tagged <strong class="font-medium text-slate-700 dark:text-slate-200">${escapeHtml(
                      coverage.lowCoverageTopics.join(', ')
                    )}</strong>
                  </p>`
                : ''
            }
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            ${recommendations
              .map((rec) => {
                const { book } = rec;
                return `
                  <article class="rounded-xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800 p-3.5 flex flex-col justify-between gap-3">
                    <div class="flex items-start gap-3 min-w-0">
                      ${renderBookCover(book, 'sm')}
                      <div class="min-w-0">
                        <button
                          type="button"
                          data-action="inspect-book"
                          data-book-id="${escapeHtml(book.id)}"
                          class="text-left font-display text-sm font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 leading-snug"
                        >
                          ${escapeHtml(book.title)}
                        </button>
                        <p class="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                          ${escapeHtml(book.authors.join(', '))}
                        </p>
                        <p class="text-[11px] text-teal-700 dark:text-teal-400 mt-1.5 leading-relaxed">
                          ${escapeHtml(rec.matchReasons.join(' · '))}
                        </p>
                      </div>
                    </div>

                    ${
                      activeRotation
                        ? `
                          <div class="pt-2 border-t border-slate-200/60 dark:border-slate-800/80 flex justify-end">
                            <button
                              type="button"
                              data-action="add-recommended-to-shelf"
                              data-rotation-id="${escapeHtml(activeRotation.id)}"
                              data-book-id="${escapeHtml(book.id)}"
                              class="min-h-[38px] px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              ${renderIcon('plus', 'w-3.5 h-3.5')}
                              Add to Active Shelf
                            </button>
                          </div>
                        `
                        : ''
                    }
                  </article>
                `;
              })
              .join('')}
          </div>
        </section>
      `
      : '';

  const query = uiState.searchQuery.trim().toLowerCase();
  const filteredBooks = state.books.filter((book) => {
    if (uiState.catalogFilter !== 'all' && book.format !== uiState.catalogFilter) {
      return false;
    }
    if (!query) return true;
    const haystack = [
      book.title,
      book.authors.join(' '),
      book.isbn13,
      book.tags.join(' '),
      book.readingLevelHint || '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  const filterTabs = [
    { id: 'all', label: 'All Books' },
    { id: 'hardcover', label: 'Hardcover' },
    { id: 'board-book', label: 'Board Books' },
    { id: 'paperback', label: 'Paperback' },
  ];

  const filterBarHtml = filterTabs
    .map((tab) => {
      const active = uiState.catalogFilter === tab.id;
      return `
        <button
          type="button"
          data-action="set-catalog-filter"
          data-filter="${tab.id}"
          aria-pressed="${active ? 'true' : 'false'}"
          class="min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-600 ${
            active
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(tab.label)}
        </button>
      `;
    })
    .join('');

  const catalogListHtml =
    filteredBooks.length > 0
      ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          ${filteredBooks
            .map((book) => {
              const providersText = book.sources.map((s) => s.provider).join(' + ');
              return `
                <article class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 flex items-start justify-between gap-4">
                  <div class="flex items-start gap-3.5 min-w-0">
                    ${renderBookCover(book, 'md')}
                    <div class="min-w-0">
                      <button
                        type="button"
                        data-action="inspect-book"
                        data-book-id="${escapeHtml(book.id)}"
                        class="text-left font-display text-base font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-400 leading-snug transition-colors"
                      >
                        ${escapeHtml(book.title)}
                      </button>
                      <p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                        ${escapeHtml(book.authors.join(', '))}
                      </p>
                      <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
                        <span>${escapeHtml(formatReadingStage(book.readingStage))}</span>
                        <span aria-hidden="true">·</span>
                        <span>Ages ${book.ageMin}–${book.ageMax}</span>
                        <span aria-hidden="true">·</span>
                        <span>${escapeHtml(formatBookBinding(book.format))}</span>
                        ${
                          book.publishedYear
                            ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${book.publishedYear}</span>`
                            : ''
                        }
                      </div>
                      ${
                        book.readingLevelHint
                          ? `<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(
                              book.readingLevelHint
                            )}</p>`
                          : ''
                      }
                      <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        ${
                          book.isbn13
                            ? `<span class="font-mono-tabular">ISBN ${escapeHtml(book.isbn13)}</span><span aria-hidden="true">·</span>`
                            : ''
                        }
                        <span>${escapeHtml(providersText)}</span>
                      </div>
                      ${
                        book.tags.length
                          ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Topics: ${escapeHtml(
                              book.tags.join(' · ')
                            )}</p>`
                          : ''
                      }
                    </div>
                  </div>
                  <button
                    type="button"
                    data-action="delete-book"
                    data-book-id="${escapeHtml(book.id)}"
                    aria-label="Remove ${escapeHtml(book.title)} from catalog"
                    class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                  >
                    ${renderIcon('trash', 'w-4 h-4')}
                  </button>
                </article>
              `;
            })
            .join('')}
        </div>
      `
      : `
        <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 text-center mt-4">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            No books match your current filter.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Clear the search filter or add a new book to your home library.
          </p>
        </div>
      `;

  const inspectedBook = uiState.inspectedBookId ? bookMap.get(uiState.inspectedBookId) : null;
  const inspectedModalHtml = inspectedBook
    ? `
      <div
        data-backdrop-action="close-inspect-book"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      >
        <div role="dialog" aria-modal="true" aria-labelledby="inspect-book-title" class="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4 min-w-0">
              ${renderBookCover(inspectedBook, 'md')}
              <div class="min-w-0">
                <h2 id="inspect-book-title" class="font-display text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  ${escapeHtml(inspectedBook.title)}
                </h2>
                <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  ${escapeHtml(inspectedBook.authors.join(', '))}
                </p>
                <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
                  <span>Ages ${inspectedBook.ageMin}–${inspectedBook.ageMax}</span>
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(formatReadingStage(inspectedBook.readingStage))}</span>
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(formatBookBinding(inspectedBook.format))}</span>
                  ${
                    inspectedBook.pageCount
                      ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${inspectedBook.pageCount} pages</span>`
                      : ''
                  }
                  ${
                    inspectedBook.publishedYear
                      ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${inspectedBook.publishedYear}</span>`
                      : ''
                  }
                </div>
                ${
                  inspectedBook.readingLevelHint
                    ? `<p class="text-xs text-teal-700 dark:text-teal-400 mt-1.5">${escapeHtml(
                        inspectedBook.readingLevelHint
                      )}</p>`
                    : ''
                }
                ${
                  inspectedBook.isbn13
                    ? `<p class="text-xs font-mono-tabular text-slate-500 dark:text-slate-400 mt-1">ISBN-13: ${escapeHtml(
                        inspectedBook.isbn13
                      )}${
                        inspectedBook.isbn10 ? ` · ISBN-10: ${escapeHtml(inspectedBook.isbn10)}` : ''
                      }</p>`
                    : ''
                }
              </div>
            </div>
            <button
              type="button"
              data-action="close-inspect-book"
              aria-label="Close book details"
              class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              ${renderIcon('close', 'w-4 h-4')}
            </button>
          </div>

          <!-- Phase 5 Tag Curation & Auto-Enrichment Controls -->
          <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-slate-900 dark:text-white">Topics & Themes</strong>
              <button
                type="button"
                data-action="enrich-book-tags"
                data-book-id="${escapeHtml(inspectedBook.id)}"
                class="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                ${renderIcon('sparkles', 'w-3.5 h-3.5')}
                Auto-Enrich Tags
              </button>
            </div>

            ${
              inspectedBook.tags.length > 0
                ? `
                  <div class="flex flex-wrap items-center gap-2">
                    ${inspectedBook.tags
                      .map(
                        (tag) => `
                          <button
                            type="button"
                            data-action="remove-book-tag"
                            data-book-id="${escapeHtml(inspectedBook.id)}"
                            data-tag="${escapeHtml(tag)}"
                            title="Remove topic ${escapeHtml(tag)}"
                            aria-label="Remove topic ${escapeHtml(tag)}"
                            class="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/50 text-xs font-medium text-slate-700 hover:text-rose-700 dark:text-slate-200 dark:hover:text-rose-300 inline-flex items-center gap-1.5 transition-colors"
                          >
                            <span>${escapeHtml(tag)}</span>
                            <span aria-hidden="true" class="text-slate-400">×</span>
                          </button>
                        `
                      )
                      .join('')}
                  </div>
                `
                : `<p class="text-slate-500 dark:text-slate-400">No topics tagged yet.</p>`
            }

            <form id="inspector-add-tag-form" data-book-id="${escapeHtml(inspectedBook.id)}" class="flex items-center gap-2 pt-1">
              <label for="inspector-new-tag-input" class="sr-only">Add topic tag</label>
              <input
                id="inspector-new-tag-input"
                name="tag"
                type="text"
                placeholder="Add topic (e.g., christmas, dinosaurs, feelings)"
                class="flex-1 min-h-[40px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
              <button
                type="submit"
                class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Add Tag
              </button>
            </form>

            <p class="pt-2 border-t border-slate-100 dark:border-slate-800">
              <strong>Metadata Provenance:</strong> ${escapeHtml(
                inspectedBook.sources.map((s) => s.provider).join(' · ')
              )}
            </p>
            ${
              inspectedBook.sources.some((s) => Boolean(s.rawPayload))
                ? `
                  <details class="pt-1">
                    <summary class="cursor-pointer font-semibold text-teal-700 dark:text-teal-400">
                      View Captured Raw Provider Payloads
                    </summary>
                    <pre class="mt-2 p-3 rounded-xl bg-slate-950 text-slate-100 font-mono-tabular text-[11px] overflow-x-auto max-h-56">${escapeHtml(
                      JSON.stringify(inspectedBook.sources, null, 2)
                    )}</pre>
                  </details>
                `
                : ''
            }
          </div>
        </div>
      </div>
    `
    : '';

  return `
    <div class="space-y-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto max-w-full">
          ${profileButtonsHtml}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular">
          <span>${state.books.length} cataloged books</span>
          <span aria-hidden="true"> · </span>
          <span>${activeProfile.readHistoryBookIds.length} read with ${escapeHtml(activeProfile.name)}</span>
        </div>
      </div>

      ${activeShelfHtml}

      ${recommendationsHtml}

      <section aria-labelledby="catalog-heading" class="pt-2">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 id="catalog-heading" class="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Family Book Catalog
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Tap any book title to inspect reading-level hints, edit topic tags, or view provider provenance.
            </p>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div class="relative flex-1 sm:w-64">
              <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                ${renderIcon('search', 'w-4 h-4')}
              </span>
              <input
                type="search"
                id="catalog-search-input"
                value="${escapeHtml(uiState.searchQuery)}"
                placeholder="Filter title, author, ISBN, topic…"
                aria-label="Filter family catalog"
                class="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-2 focus:outline-teal-600"
              />
            </div>
            <div class="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
              ${filterBarHtml}
            </div>
          </div>
        </div>

        ${catalogListHtml}
      </section>

      ${inspectedModalHtml}
    </div>
  `;
}
