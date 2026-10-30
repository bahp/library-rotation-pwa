/**
 * @fileoverview Slide-up bottom-sheet Book Inspector used across Home and Library views.
 * Surfaces full book metadata, quick active-shelf actions (Mark Read / Random Swap / Add to Shelf),
 * Phase 5 topic tag curation, auto-enrichment, and metadata provenance.
 */

import {
  escapeHtml,
  formatBookBinding,
  formatReadingStage,
} from '../../types/models.js';
import { renderBookCover } from './book-cover.js';
import { renderIcon } from '../icons.js';

/**
 * Renders the slide-up Book Details & Tag Curation sheet when `book` is non-null.
 * @param {{
 *   book: import('../../types/models.js').Book | null | undefined,
 *   activeRotation?: import('../../types/models.js').RotationList | null,
 *   canSwapInActiveRotation?: boolean
 * }} params
 * @returns {string}
 */
export function renderBookInspectorModal({
  book,
  activeRotation = null,
  canSwapInActiveRotation = false,
}) {
  if (!book) return '';

  const inActiveShelf = Boolean(activeRotation && activeRotation.bookIds.includes(book.id));
  const isReadInActive = Boolean(
    activeRotation && activeRotation.completedBookIds.includes(book.id)
  );

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
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
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
            ${renderBookCover(book, 'md')}
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
              class="flex-1 min-h-[44px] px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
            <button
              type="submit"
              class="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
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
