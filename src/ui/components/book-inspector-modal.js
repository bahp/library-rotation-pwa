/**
 * @fileoverview Slide-up bottom-sheet Book Inspector used across Home, Library, and Rotations views:
 * - Tapping the book cover opens Cover Studio (choose picture from phone gallery, take camera photo,
 *   or search online book covers via Google Books & Open Library)
 * - Inline "Edit Info" form (`#edit-book-form`) with uniform `h-12` inputs & dropdowns to edit book metadata
 * - Quick active-shelf actions (Mark Read / Swap Book / Add to Active Shelf), Phase 5 tag curation, and provenance
 */

import {
  escapeHtml,
  formatBookBinding,
  formatReadingStage,
} from '../../types/models.js';
import { renderBookCover } from './book-cover.js';
import { renderIcon } from '../icons.js';

/**
 * @typedef {Object} BookInspectorUiState
 * @property {boolean} isCoverPickerOpen
 * @property {boolean} isEditingBook
 * @property {string} coverSearchQuery
 * @property {boolean} coverSearchLoading
 * @property {string} coverSearchError
 * @property {Array<{ title: string, author: string, coverUrl: string, source: string }>} coverSearchResults
 * @property {string} editError
 */

/**
 * Renders the slide-up Book Details, Cover Studio, Book Info Editor & Tag Curation sheet when `book` is non-null.
 * @param {{
 *   book: import('../../types/models.js').Book | null | undefined,
 *   activeRotation?: import('../../types/models.js').RotationList | null,
 *   canSwapInActiveRotation?: boolean,
 *   coverAspectRatio?: import('../../types/models.js').CoverAspectRatio,
 *   inspectorUiState?: BookInspectorUiState
 * }} params
 * @returns {string}
 */
export function renderBookInspectorModal({
  book,
  activeRotation = null,
  canSwapInActiveRotation = false,
  coverAspectRatio = 'portrait',
  inspectorUiState = {
    isCoverPickerOpen: false,
    isEditingBook: false,
    coverSearchQuery: '',
    coverSearchLoading: false,
    coverSearchError: '',
    coverSearchResults: [],
    editError: '',
  },
}) {
  if (!book) return '';

  const inActiveShelf = Boolean(activeRotation && activeRotation.bookIds.includes(book.id));
  const isReadInActive = Boolean(
    activeRotation && activeRotation.completedBookIds.includes(book.id)
  );

  const searchSeed =
    inspectorUiState.coverSearchQuery ||
    `${book.title} ${book.authors[0] || ''}`.trim();

  const coverStudioHtml = inspectorUiState.isCoverPickerOpen
    ? `
      <div class="mt-4 pt-3.5 border-t border-linen-200 dark:border-night-700 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-xs font-bold text-forest-900 dark:text-white">
              Change Book Cover
            </p>
            <p class="text-[11px] text-stone-ink dark:text-slate-400">
              Select a photo from your phone, take a picture, or search Google Books & Open Library.
            </p>
          </div>
          ${
            book.coverUrl
              ? `
                <button
                  type="button"
                  data-action="clear-book-cover"
                  data-book-id="${escapeHtml(book.id)}"
                  class="min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-semibold text-stone-ink hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 transition-colors shrink-0"
                >
                  Cloth Cover
                </button>
              `
              : ''
          }
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <label
            for="inspector-cover-gallery-input"
            class="min-h-[44px] px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            ${renderIcon('photo', 'w-4 h-4')}
            <span>From Phone</span>
            <input
              id="inspector-cover-gallery-input"
              type="file"
              accept="image/*"
              class="sr-only"
            />
          </label>

          <label
            for="inspector-cover-camera-input"
            class="min-h-[44px] px-3 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            ${renderIcon('camera', 'w-4 h-4')}
            <span>Take Picture</span>
            <input
              id="inspector-cover-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
            />
          </label>
        </div>

        <form id="inspector-cover-search-form" class="flex items-center gap-2">
          <label for="inspector-cover-search-input" class="sr-only">Search book covers online</label>
          <input
            id="inspector-cover-search-input"
            name="coverQuery"
            type="search"
            value="${escapeHtml(searchSeed)}"
            placeholder="Search Google Books / Open Library covers…"
            class="flex-1 h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
          />
          <button
            type="submit"
            data-action="search-book-covers"
            ${inspectorUiState.coverSearchLoading ? 'disabled' : ''}
            class="h-12 px-3.5 rounded-xl bg-forest-900 hover:bg-forest-800 disabled:opacity-55 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            ${renderIcon('search', 'w-3.5 h-3.5')}
            <span>${inspectorUiState.coverSearchLoading ? 'Searching…' : 'Search'}</span>
          </button>
        </form>

        ${
          inspectorUiState.coverSearchError
            ? `<p role="alert" class="text-xs text-rose-700 dark:text-rose-300">${escapeHtml(
                inspectorUiState.coverSearchError
              )}</p>`
            : ''
        }

        ${
          inspectorUiState.coverSearchResults.length > 0
            ? `
              <div class="grid grid-cols-4 gap-2 pt-0.5">
                ${inspectorUiState.coverSearchResults
                  .map(
                    (res) => `
                      <button
                        type="button"
                        data-action="select-searched-cover"
                        data-book-id="${escapeHtml(book.id)}"
                        data-cover-url="${escapeHtml(res.coverUrl)}"
                        title="Use cover from ${escapeHtml(res.source)}"
                        aria-label="Apply cover for ${escapeHtml(res.title)}"
                        class="group flex flex-col items-center text-left rounded-xl p-1 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-forest-700"
                      >
                        <div class="w-full ${
                          coverAspectRatio === 'square' ? 'aspect-square' : 'aspect-[3/4]'
                        } rounded-lg overflow-hidden bg-linen-100 dark:bg-night-800">
                          <img
                            src="${escapeHtml(res.coverUrl)}"
                            alt="${escapeHtml(res.title)}"
                            referrerpolicy="no-referrer"
                            loading="lazy"
                            class="w-full h-full object-cover"
                          />
                        </div>
                        <span class="mt-1 text-[10px] text-stone-ink dark:text-slate-400 truncate w-full text-center">
                          ${escapeHtml(res.source)}
                        </span>
                      </button>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }
      </div>
    `
    : '';

  const httpsCoverUrlValue =
    book.coverUrl && book.coverUrl.startsWith('https://') ? book.coverUrl : '';

  const editBookFormHtml = inspectorUiState.isEditingBook
    ? `
      <form
        id="edit-book-form"
        data-book-id="${escapeHtml(book.id)}"
        class="mt-4 pt-3.5 border-t border-linen-200 dark:border-night-700 space-y-3"
        novalidate
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-bold text-forest-900 dark:text-white">
            Edit Book Details
          </p>
          <span class="text-[11px] text-stone-ink dark:text-slate-400">
            Saved directly to device library
          </span>
        </div>

        ${
          inspectorUiState.editError
            ? `<div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3.5 py-2 text-xs font-medium text-rose-800 dark:text-rose-200">${escapeHtml(
                inspectorUiState.editError
              )}</div>`
            : ''
        }

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label for="edit-book-title" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Title *
            </label>
            <input
              id="edit-book-title"
              name="title"
              type="text"
              required
              value="${escapeHtml(book.title)}"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div>
            <label for="edit-book-authors" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Author(s) (comma-separated)
            </label>
            <input
              id="edit-book-authors"
              name="authors"
              type="text"
              value="${escapeHtml(book.authors.join(', '))}"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div>
            <label for="edit-book-isbn" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              ISBN (optional)
            </label>
            <input
              id="edit-book-isbn"
              name="isbn"
              type="text"
              value="${escapeHtml(book.isbn13 || book.isbn10 || '')}"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div>
            <label for="edit-book-format" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Binding Format
            </label>
            <select
              id="edit-book-format"
              name="format"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            >
              <option value="hardcover" ${book.format === 'hardcover' ? 'selected' : ''}>Hardcover</option>
              <option value="board-book" ${book.format === 'board-book' ? 'selected' : ''}>Board Book</option>
              <option value="paperback" ${book.format === 'paperback' ? 'selected' : ''}>Paperback</option>
            </select>
          </div>

          <div>
            <label for="edit-book-stage" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Reading Stage
            </label>
            <select
              id="edit-book-stage"
              name="readingStage"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            >
              <option value="board-toddler" ${book.readingStage === 'board-toddler' ? 'selected' : ''}>Board & Toddler</option>
              <option value="picture-book" ${book.readingStage === 'picture-book' ? 'selected' : ''}>Picture Book</option>
              <option value="early-reader" ${book.readingStage === 'early-reader' ? 'selected' : ''}>Early Reader</option>
              <option value="chapter-book" ${book.readingStage === 'chapter-book' ? 'selected' : ''}>Chapter Book</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label for="edit-book-age-min" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Min Age
              </label>
              <input
                id="edit-book-age-min"
                name="ageMin"
                type="number"
                min="0"
                max="16"
                value="${book.ageMin}"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="edit-book-age-max" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Max Age
              </label>
              <input
                id="edit-book-age-max"
                name="ageMax"
                type="number"
                min="0"
                max="18"
                value="${book.ageMax}"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label for="edit-book-pages" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Pages
              </label>
              <input
                id="edit-book-pages"
                name="pageCount"
                type="number"
                min="1"
                max="2000"
                value="${book.pageCount ? book.pageCount : ''}"
                placeholder="—"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="edit-book-year" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Year
              </label>
              <input
                id="edit-book-year"
                name="publishedYear"
                type="number"
                min="1800"
                max="2100"
                value="${book.publishedYear ? book.publishedYear : ''}"
                placeholder="—"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="sm:col-span-2">
            <label for="edit-book-cover-url" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              HTTPS Cover URL (optional${
                book.coverUrl && book.coverUrl.startsWith('data:image/')
                  ? ' · custom photo saved'
                  : ''
              })
            </label>
            <input
              id="edit-book-cover-url"
              name="coverUrl"
              type="url"
              value="${escapeHtml(httpsCoverUrlValue)}"
              placeholder="https://covers.openlibrary.org/..."
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div class="sm:col-span-2">
            <label for="edit-book-tags" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Topics & Themes (comma-separated)
            </label>
            <input
              id="edit-book-tags"
              name="tags"
              type="text"
              value="${escapeHtml(book.tags.join(', '))}"
              placeholder="winter, animals, bedtime"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
        </div>

        <div class="pt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            data-action="toggle-edit-book-info"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="min-h-[44px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Save Changes
          </button>
        </div>
      </form>
    `
    : '';

  const quickShelfBarHtml = activeRotation
    ? `
      <div class="mt-4 pt-3.5 border-t border-linen-200 dark:border-night-700 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs font-medium text-stone-ink dark:text-slate-300">
          ${inActiveShelf ? 'On current rotation shelf' : 'Available in family library'}
        </span>
        <div class="flex flex-wrap items-center gap-2">
          ${
            inActiveShelf
              ? `
                <button
                  type="button"
                  data-action="toggle-rotation-read"
                  data-rotation-id="${escapeHtml(activeRotation.id)}"
                  data-book-id="${escapeHtml(book.id)}"
                  aria-pressed="${isReadInActive ? 'true' : 'false'}"
                  class="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                    isReadInActive
                      ? 'bg-forest-700 text-white dark:bg-forest-600'
                      : 'bg-linen-100 hover:bg-linen-200 text-forest-900 dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-100'
                  }"
                >
                  ${renderIcon('check', 'w-3.5 h-3.5')}
                  ${isReadInActive ? 'Read' : 'Mark Read'}
                </button>
                ${
                  canSwapInActiveRotation
                    ? `
                      <button
                        type="button"
                        data-action="replace-book-random"
                        data-rotation-id="${escapeHtml(activeRotation.id)}"
                        data-book-id="${escapeHtml(book.id)}"
                        class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                        Swap Book
                      </button>
                    `
                    : ''
                }
              `
              : `
                <button
                  type="button"
                  data-action="add-recommended-to-shelf"
                  data-rotation-id="${escapeHtml(activeRotation.id)}"
                  data-book-id="${escapeHtml(book.id)}"
                  class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  ${renderIcon('plus', 'w-3.5 h-3.5')}
                  Add to Active Shelf
                </button>
              `
          }
        </div>
      </div>
    `
    : '';

  return `
    <div
      data-backdrop-action="close-inspect-book"
      class="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-book-title"
        class="animate-sheet-up w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 px-5 pb-6 pt-3 sm:p-6 shadow-2xl"
      >
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true"></div>

        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3.5 min-w-0">
            <!-- Clickable Book Cover Trigger -> Opens Cover Studio (Gallery / Camera / Search) -->
            <button
              type="button"
              data-action="toggle-cover-picker"
              aria-expanded="${inspectorUiState.isCoverPickerOpen ? 'true' : 'false'}"
              aria-label="Change cover for ${escapeHtml(book.title)}"
              title="Tap to change book cover"
              class="group relative shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-95"
            >
              ${renderBookCover(book, 'md', coverAspectRatio)}
              <span class="pointer-events-none absolute bottom-1 right-1 z-20 px-1.5 py-0.5 rounded-md bg-night-950/80 text-ivory text-[10px] font-semibold inline-flex items-center gap-1 shadow-xs">
                ${renderIcon('camera', 'w-3 h-3')}
                <span>Cover</span>
              </span>
            </button>

            <div class="min-w-0">
              <h2 id="inspect-book-title" class="font-display text-lg font-bold text-forest-900 dark:text-white leading-snug">
                ${escapeHtml(book.title)}
              </h2>
              <p class="text-xs sm:text-sm text-stone-ink dark:text-slate-300 mt-0.5">
                ${escapeHtml(book.authors.join(', '))}
              </p>
              <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-stone-ink dark:text-slate-400 mt-1.5">
                <span>Ages ${book.ageMin}–${book.ageMax}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(formatReadingStage(book.readingStage))}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(formatBookBinding(book.format))}</span>
                ${
                  book.pageCount
                    ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${book.pageCount} pp</span>`
                    : ''
                }
                ${
                  book.publishedYear
                    ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${book.publishedYear}</span>`
                    : ''
                }
              </div>
              ${
                book.readingLevelHint
                  ? `<p class="text-xs text-forest-700 dark:text-[#5ED3DA] mt-1.5">${escapeHtml(
                      book.readingLevelHint
                    )}</p>`
                  : ''
              }
              ${
                book.isbn13
                  ? `<p class="text-[11px] font-mono-tabular text-stone-ink dark:text-slate-400 mt-1">ISBN ${escapeHtml(
                      book.isbn13
                    )}${book.isbn10 ? ` · ${escapeHtml(book.isbn10)}` : ''}</p>`
                  : ''
              }

              <!-- Quick Cover & Metadata Edit Triggers -->
              <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-action="toggle-cover-picker"
                  aria-pressed="${inspectorUiState.isCoverPickerOpen ? 'true' : 'false'}"
                  class="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    inspectorUiState.isCoverPickerOpen
                      ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                      : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
                  }"
                >
                  ${renderIcon('camera', 'w-3.5 h-3.5')}
                  <span>Change Cover</span>
                </button>

                <button
                  type="button"
                  data-action="toggle-edit-book-info"
                  aria-pressed="${inspectorUiState.isEditingBook ? 'true' : 'false'}"
                  class="min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    inspectorUiState.isEditingBook
                      ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                      : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
                  }"
                >
                  ${renderIcon('edit', 'w-3.5 h-3.5')}
                  <span>Edit Info</span>
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            data-action="close-inspect-book"
            aria-label="Close book details"
            class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 shrink-0"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        ${coverStudioHtml}
        ${editBookFormHtml}
        ${quickShelfBarHtml}

        <!-- Phase 5 Tag Curation & Auto-Enrichment Controls -->
        <div class="mt-4 pt-4 border-t border-linen-200 dark:border-night-700 space-y-3 text-xs text-stone-ink dark:text-slate-300">
          <div class="flex items-center justify-between gap-2">
            <strong class="text-forest-900 dark:text-white">Topics & Themes</strong>
            <button
              type="button"
              data-action="enrich-book-tags"
              data-book-id="${escapeHtml(book.id)}"
              class="min-h-[38px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              ${renderIcon('sparkles', 'w-3.5 h-3.5')}
              Auto-Enrich Tags
            </button>
          </div>

          ${
            book.tags.length > 0
              ? `
                <div class="flex flex-wrap items-center gap-2">
                  ${book.tags
                    .map(
                      (tag) => `
                        <button
                          type="button"
                          data-action="remove-book-tag"
                          data-book-id="${escapeHtml(book.id)}"
                          data-tag="${escapeHtml(tag)}"
                          title="Remove topic ${escapeHtml(tag)}"
                          aria-label="Remove topic ${escapeHtml(tag)}"
                          class="min-h-[36px] px-2.5 py-1 rounded-lg bg-linen-100 hover:bg-rose-50 dark:bg-night-800 dark:hover:bg-rose-950/50 text-xs font-medium text-forest-900 hover:text-rose-700 dark:text-slate-200 dark:hover:text-rose-300 inline-flex items-center gap-1.5 transition-colors"
                        >
                          <span>${escapeHtml(tag)}</span>
                          <span aria-hidden="true" class="opacity-60">×</span>
                        </button>
                      `
                    )
                    .join('')}
                </div>
              `
              : `<p class="text-stone-ink dark:text-slate-400">No topics tagged yet.</p>`
          }

          <form id="inspector-add-tag-form" data-book-id="${escapeHtml(book.id)}" class="flex items-center gap-2 pt-1">
            <label for="inspector-new-tag-input" class="sr-only">Add topic tag</label>
            <input
              id="inspector-new-tag-input"
              name="tag"
              type="text"
              placeholder="Add topic (e.g., christmas, dinosaurs, feelings)"
              class="flex-1 h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
            <button
              type="submit"
              class="h-12 px-3.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Add Tag
            </button>
          </form>

          <div class="pt-3 border-t border-linen-200 dark:border-night-700 flex items-center justify-between gap-3">
            <p class="truncate">
              <strong class="text-forest-900 dark:text-slate-200">Source:</strong> ${escapeHtml(
                book.sources.map((s) => s.provider).join(' · ')
              )}
            </p>
            <button
              type="button"
              data-action="delete-book"
              data-book-id="${escapeHtml(book.id)}"
              aria-label="Remove ${escapeHtml(book.title)} from catalog"
              class="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              ${renderIcon('trash', 'w-3.5 h-3.5')}
              Remove Book
            </button>
          </div>

          ${
            book.sources.some((s) => Boolean(s.rawPayload))
              ? `
                <details class="pt-1">
                  <summary class="cursor-pointer font-semibold text-forest-700 dark:text-[#5ED3DA]">
                    View Captured Raw Provider Payloads
                  </summary>
                  <pre class="mt-2 p-3 rounded-xl bg-night-950 text-slate-100 font-mono-tabular text-[11px] overflow-x-auto max-h-52">${escapeHtml(
                    JSON.stringify(book.sources, null, 2)
                  )}</pre>
                </details>
              `
              : ''
          }
        </div>
      </div>
    </div>
  `;
}
