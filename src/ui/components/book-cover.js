/**
 * @fileoverview Resilient 3:4 book cover renderer with cloth-bound archival fallback.
 * Complies with Zero-Broken-Image policy: never renders a broken image box.
 */

import { escapeHtml } from '../../types/models.js';

/** @type {Record<string, { bg: string, spine: string, text: string }>} */
const PALETTES = {
  teal: {
    bg: 'bg-teal-800 dark:bg-teal-900',
    spine: 'bg-teal-950/50',
    text: 'text-teal-50',
  },
  indigo: {
    bg: 'bg-slate-800 dark:bg-slate-800',
    spine: 'bg-slate-950/60',
    text: 'text-slate-50',
  },
  amber: {
    bg: 'bg-amber-800 dark:bg-amber-900',
    spine: 'bg-amber-950/50',
    text: 'text-amber-50',
  },
  rose: {
    bg: 'bg-rose-800 dark:bg-rose-900',
    spine: 'bg-rose-950/50',
    text: 'text-rose-50',
  },
  emerald: {
    bg: 'bg-emerald-800 dark:bg-emerald-900',
    spine: 'bg-emerald-950/50',
    text: 'text-emerald-50',
  },
};

/**
 * Renders a 3:4 book cover card with automatic image fallback to an archival cloth edition design.
 * @param {import('../../types/models.js').Book} book
 * @param {'sm' | 'md' | 'lg'} [size]
 * @returns {string}
 */
export function renderBookCover(book, size = 'md') {
  const palette = PALETTES[book.spineColor] || PALETTES.teal;
  const dims =
    size === 'sm'
      ? 'w-14 h-[74px]'
      : size === 'lg'
        ? 'w-28 h-[148px]'
        : 'w-20 h-[106px]';

  const titleSnippet =
    book.title.length > 28 ? `${book.title.slice(0, 26).trim()}…` : book.title;
  const authorLast = (book.authors[0] || '').split(' ').pop() || '';

  const fallbackMarkup = `
    <div class="lr-cover-fallback absolute inset-0 flex overflow-hidden rounded-lg ${palette.bg} ${palette.text} shadow-sm select-none">
      <div class="w-2.5 h-full shrink-0 ${palette.spine}"></div>
      <div class="flex-1 p-2 flex flex-col justify-between min-w-0">
        <span class="font-display text-[11px] leading-tight font-semibold line-clamp-3 break-words">${escapeHtml(titleSnippet)}</span>
        <span class="text-[9px] opacity-80 truncate">${escapeHtml(authorLast)}</span>
      </div>
    </div>
  `;

  if (book.coverUrl) {
    return `
      <div class="relative shrink-0 ${dims} rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-800">
        ${fallbackMarkup}
        <img
          src="${escapeHtml(book.coverUrl)}"
          alt="Cover of ${escapeHtml(book.title)}"
          referrerpolicy="no-referrer"
          loading="lazy"
          class="relative z-10 w-full h-full object-cover transition-opacity duration-150"
          onerror="this.style.display='none'"
        />
      </div>
    `;
  }

  return `
    <div class="relative shrink-0 ${dims} rounded-lg overflow-hidden">
      ${fallbackMarkup}
    </div>
  `;
}
