/**
 * @fileoverview Resilient 3:4 book cover renderer with warm cloth-bound archival fallback.
 * Supports fixed thumbnail sizes ('xs', 'sm', 'md', 'lg') and fluid responsive 'grid' cover tiles.
 */

import { escapeHtml } from '../../types/models.js';
import { BOOK_SPINE_PALETTES_BY_KEY } from '../../config/index.js';

/**
 * Renders a book cover card ('portrait' 3:4 or 'square' 1:1) with automatic image fallback to an archival cloth edition design.
 * @param {import('../../types/models.js').Book} book
 * @param {'xs' | 'sm' | 'md' | 'lg' | 'grid'} [size]
 * @param {import('../../types/models.js').CoverAspectRatio} [aspectRatio]
 * @returns {string}
 */
export function renderBookCover(book, size = 'md', aspectRatio = 'square') {
  const palette = BOOK_SPINE_PALETTES_BY_KEY[book.spineColor] || BOOK_SPINE_PALETTES_BY_KEY.teal;
  const isGrid = size === 'grid';
  const isSquare = aspectRatio !== 'portrait';

  const dims = isSquare
    ? isGrid
      ? 'w-full aspect-square rounded-xl shadow-xs'
      : size === 'xs'
        ? 'w-11 h-11 aspect-square rounded-lg'
        : size === 'sm'
          ? 'w-14 h-14 aspect-square rounded-lg'
          : size === 'lg'
            ? 'w-28 h-28 aspect-square rounded-xl'
            : 'w-20 h-20 aspect-square rounded-xl'
    : isGrid
      ? 'w-full aspect-[3/4] rounded-xl shadow-xs'
      : size === 'xs'
        ? 'w-11 h-[58px] rounded-lg'
        : size === 'sm'
          ? 'w-14 h-[74px] rounded-lg'
          : size === 'lg'
            ? 'w-28 h-[148px] rounded-xl'
            : 'w-20 h-[106px] rounded-xl';

  const radiusClass = isGrid || size === 'md' || size === 'lg' ? 'rounded-xl' : 'rounded-lg';

  const titleSnippet =
    book.title.length > 34 ? `${book.title.slice(0, 32).trim()}…` : book.title;
  const authorLast = (book.authors[0] || '').split(' ').pop() || '';

  const fallbackMarkup = `
    <div class="lr-cover-fallback absolute inset-0 flex overflow-hidden ${radiusClass} ${palette.bg} ${palette.text} border border-black/10 dark:border-white/10 select-none">
      <div class="${isGrid ? 'w-3' : 'w-2'} h-full shrink-0 ${palette.spine}"></div>
      <div class="flex-1 ${isGrid ? 'p-2.5 sm:p-3' : 'p-2'} flex flex-col justify-between min-w-0 text-left">
        <span class="font-display ${
          isGrid ? 'text-xs sm:text-sm' : 'text-[10px]'
        } leading-snug font-semibold line-clamp-3 break-words">${escapeHtml(titleSnippet)}</span>
        <span class="${isGrid ? 'text-[10px]' : 'text-[9px]'} opacity-85 truncate">${escapeHtml(authorLast)}</span>
      </div>
    </div>
  `;

  if (book.coverUrl) {
    return `
      <div class="relative ${isGrid ? '' : 'shrink-0'} ${dims} overflow-hidden bg-linen-100 dark:bg-night-800">
        ${fallbackMarkup}
        <img
          src="${escapeHtml(book.coverUrl)}"
          alt="Cover of ${escapeHtml(book.title)}"
          width="180"
          height="${isSquare ? '180' : '240'}"
          referrerpolicy="no-referrer"
          decoding="sync"
          class="relative z-10 w-full h-full object-cover"
          onerror="this.style.display='none'"
        />
      </div>
    `;
  }

  return `
    <div class="relative ${isGrid ? '' : 'shrink-0'} ${dims} overflow-hidden">
      ${fallbackMarkup}
    </div>
  `;
}
