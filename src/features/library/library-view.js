/**
 * @fileoverview Independent Family Book Catalog page (`#/library`):
 * - Compact search bar + binding filter tabs (All, Hardcover, Board, Paperback)
 * - Quick `+` button to scan or add books (`#/scan`)
 * - Space-efficient 3-column mobile / 6-column desktop cover grid with Title, Author, and age band
 * - Tapping any book opens the slide-up Book Inspector for full metadata, topic tags, or removal
 */

import { escapeHtml, formatBookBinding } from '../../types/models.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderBookInspectorModal } from '../../ui/components/book-inspector-modal.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * Renders the dedicated Family Library (Book Catalog) view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   uiState: {
 *     catalogFilter: string,
 *     searchQuery: string,
 *     inspectedBookId: string | null,
 *     inspectorUi?: import('../../ui/components/book-inspector-modal.js').BookInspectorUiState
 *   }
 * }} params
 * @returns {string}
 */
export function renderLibraryView({ state, uiState }) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const coverAspectRatio = state.settings.coverAspectRatio;
  const activeRotation =
    state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') || null;

  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const inActiveSet = new Set(activeRotation ? activeRotation.bookIds : []);

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
    { id: 'all', label: 'All' },
    { id: 'hardcover', label: 'Hardcover' },
    { id: 'board-book', label: 'Board' },
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
          class="min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
            active
              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
              : 'bg-ivory dark:bg-night-900 text-stone-ink dark:text-slate-300 border border-linen-200 dark:border-night-700 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(tab.label)}
        </button>
      `;
    })
    .join('');

  const catalogGridHtml =
    filteredBooks.length > 0
      ? `
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-4 pt-1">
          ${filteredBooks
            .map((book) => {
              const primaryAuthor = book.authors[0] || 'Unknown Author';
              const isOnActiveShelf = inActiveSet.has(book.id);

              return `
                <article class="flex flex-col min-w-0">
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
                    ${
                      isOnActiveShelf
                        ? `<span class="pointer-events-none absolute top-1.5 right-1.5 z-20 w-2.5 h-2.5 rounded-full bg-forest-700 dark:bg-[#5ED3DA] ring-2 ring-ivory dark:ring-night-900" title="Currently in ${escapeHtml(
                            activeProfile.name
                          )}’s active rotation"></span>`
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
                  </button>
                </article>
              `;
            })
            .join('')}
        </div>
      `
      : `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-7 text-center">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            No books match your filter
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-1">
            Clear your search or tap + to scan or add a new book to your library.
          </p>
        </div>
      `;

  const inspectedBook = uiState.inspectedBookId ? bookMap.get(uiState.inspectedBookId) : null;
  const canSwapInActiveRotation = activeRotation
    ? state.books.length > activeRotation.bookIds.length
    : false;

  return `
    <div class="space-y-4">
      <!-- Compact Header with + Add Book Trigger -->
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            Active Collection
          </p>
          <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
            Family Library
            <span class="text-sm font-sans font-medium text-stone-ink dark:text-slate-400 font-mono-tabular ml-1">
              (${filteredBooks.length}/${state.books.length})
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

      <!-- Compact Search & Binding Filters -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div class="relative flex-1">
          <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-ink dark:text-slate-400">
            ${renderIcon('search', 'w-4 h-4')}
          </span>
          <input
            type="search"
            id="catalog-search-input"
            value="${escapeHtml(uiState.searchQuery)}"
            placeholder="Search title, author, ISBN, or topic…"
            aria-label="Filter family catalog"
            class="w-full h-12 pl-9 pr-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white placeholder:text-stone-ink/70 focus:outline-2 focus:outline-forest-700"
          />
        </div>
        <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          ${filterBarHtml}
        </div>
      </div>

      ${catalogGridHtml}

      ${renderBookInspectorModal({
        book: inspectedBook,
        activeRotation,
        canSwapInActiveRotation,
        coverAspectRatio,
        inspectorUiState: uiState.inspectorUi,
      })}
    </div>
  `;
}
