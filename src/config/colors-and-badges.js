/**
 * @fileoverview Centralized color palettes and 4-corner book cover overlay badge taxonomy.
 *
 * COVER BADGE TAXONOMY (4 Fixed, Non-Overlapping Corner Slots):
 * -------------------------------------------------------------
 * 1. `top-left` (`catalog-state` — Mutually Exclusive, max 1 badge):
 *    Shown ONLY when a book is NOT in standard rotatable inventory (`Owned` + `Good`):
 *    Priority: `Wishlist` > `Loan` (`library`) > `Saved` (`interested`) > Care issue (`Torn` / `Broken` / `Retired`).
 *    Standard `Owned + Good` books display nothing in `top-left` so cover artwork stays unobstructed.
 *
 * 2. `top-right` (`affection` — Independent boolean, max 1 badge):
 *    `Loved` (`♥` heart pill). Combinable with any catalog state, shelf state, or owner badge.
 *
 * 3. `bottom-left` (`rotation-state` — Mutually Exclusive, max 1 badge, rotatable books only):
 *    Shown on `Owned + Good` rotatable books in `#/library` when `showCoverUsageAdornos` is enabled
 *    (and on `#/home` as the interactive Read checkmark button).
 *    Strictly ONE winning state in priority order, with explicit prefixes on numeric badges so
 *    days on shelf (`Shelf 12d`) vs. cooldown days remaining (`Rest 15d`) can never be confused:
 *      1) `shelf-read`    -> `✓ Read` (solid forest green: on active shelf & read this cycle)
 *      2) `stale-unread`  -> `⏱ Shelf Xd` (solid amber: on active shelf >= staleBookDays & unread)
 *      3) `on-shelf`      -> `▤ Shelf` (solid dark ink: currently out on active shelf)
 *      4) `cooldown`      -> `⏱ Rest Xd` (warm amber tint: resting in box cooldown with X days left)
 *      5) `never-rotated` -> `✦ New` (sky/teal tint: never placed on any rotation shelf yet)
 *      6) `read-history`  -> `✓ Read` (subtle ivory pill: off-shelf book previously read together)
 *    Note: Normal off-shelf box age (`Off shelf 26d`) is intentionally NOT shown as a cover sticker;
 *    it appears cleanly in the 1-line text caption underneath the cover.
 *
 * 4. `bottom-right` (`owners` — Independent list):
 *    Compact circular child/household avatar initials (`M`, `L`, etc.; hidden when `Shared` only).
 */

/**
 * Profile and owner avatar solid badge classes.
 * @type {Record<string, string>}
 */
export const AVATAR_TONES = Object.freeze({
  teal: 'bg-[#1F6E75] text-white',
  amber: 'bg-[#9A5B25] text-white',
  indigo: 'bg-[#2C4257] text-white',
  rose: 'bg-[#963E47] text-white',
  emerald: 'bg-[#2E6B4E] text-white',
});

/**
 * Profile and owner avatar adaptive light/dark classes.
 * @type {Record<string, string>}
 */
export const AVATAR_TONE_CLASSES = AVATAR_TONES;

/**
 * Selectable profile avatar tone swatches for Add/Edit Reader Profile forms.
 */
export const PROFILE_AVATAR_TONE_OPTIONS = Object.freeze([
  { id: 'teal', label: 'Forest Teal', swatch: 'bg-forest-700' },
  { id: 'amber', label: 'Warm Bronze', swatch: 'bg-amber-600' },
  { id: 'indigo', label: 'Deep Slate', swatch: 'bg-indigo-600' },
  { id: 'rose', label: 'Berry Rose', swatch: 'bg-rose-600' },
  { id: 'emerald', label: 'Moss Green', swatch: 'bg-emerald-600' },
]);

/**
 * Keyed cloth-bound spine palettes used by `renderBookCover` when a book has no external cover image.
 * @type {Record<string, { bg: string, spine: string, text: string }>}
 */
export const BOOK_SPINE_PALETTES_BY_KEY = Object.freeze({
  teal: {
    bg: 'bg-[#1D5C63] dark:bg-[#194E54]',
    spine: 'bg-[#0F363B]/60',
    text: 'text-[#FAF6EE]',
  },
  indigo: {
    bg: 'bg-[#2C4257] dark:bg-[#25384A]',
    spine: 'bg-[#182635]/60',
    text: 'text-[#FAF6EE]',
  },
  amber: {
    bg: 'bg-[#9A5B25] dark:bg-[#824B1D]',
    spine: 'bg-[#5C3311]/55',
    text: 'text-[#FFF9F0]',
  },
  rose: {
    bg: 'bg-[#963E47] dark:bg-[#7D323A]',
    spine: 'bg-[#591F26]/55',
    text: 'text-[#FFF5F6]',
  },
  emerald: {
    bg: 'bg-[#2D6247] dark:bg-[#24503A]',
    spine: 'bg-[#183828]/55',
    text: 'text-[#F4FBF6]',
  },
});

export const BOOK_SPINE_PALETTES = Object.freeze(Object.values(BOOK_SPINE_PALETTES_BY_KEY));

/**
 * Canonical 4-slot cover overlay layout definition.
 */
export const COVER_BADGE_SLOTS = Object.freeze({
  catalogState: {
    slot: 'catalog-state',
    corner: 'top-left',
    exclusive: true,
    positionClass: 'pointer-events-none absolute top-1.5 left-1.5 z-20',
  },
  affection: {
    slot: 'affection',
    corner: 'top-right',
    exclusive: false,
    positionClass: 'pointer-events-none absolute top-1.5 right-1.5 z-20',
  },
  rotationState: {
    slot: 'rotation-state',
    corner: 'bottom-left',
    exclusive: true,
    positionClass: 'pointer-events-none absolute bottom-1.5 left-1.5 z-20',
  },
  owners: {
    slot: 'owners',
    corner: 'bottom-right',
    exclusive: false,
    positionClass: 'pointer-events-none absolute bottom-1.5 right-1.5 z-20',
  },
});

/**
 * Visual styling map for top-left catalog/condition exception badges.
 */
export const COVER_CATALOG_BADGE_STYLES = Object.freeze({
  wishlist:
    'bg-amber-100/95 text-amber-950 border border-amber-300/80 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-800',
  libraryLoan:
    'bg-ivory/95 text-forest-900 border border-linen-200/80 dark:bg-night-900/95 dark:text-slate-200 dark:border-night-700',
  saved:
    'bg-sky-100/95 text-sky-950 border border-sky-300/80 dark:bg-sky-950/90 dark:text-sky-200 dark:border-sky-800',
  torn: 'bg-amber-600/95 text-white',
  damaged: 'bg-rose-700/95 text-white',
});

/**
 * Visual styling map for mutually-exclusive bottom-left rotation status adornos (`data-cover-adorno`).
 */
export const COVER_ROTATION_ADORNO_STYLES = Object.freeze({
  'shelf-read': {
    icon: 'check',
    pillClass:
      'bg-forest-800/95 text-white border-ivory/75 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-night-950',
  },
  'stale-unread': {
    icon: 'clock',
    pillClass:
      'bg-amber-600/95 text-white border-amber-200/80 dark:bg-amber-400 dark:text-night-950 dark:border-night-950',
  },
  'on-shelf': {
    icon: 'library',
    pillClass:
      'bg-espresso-900/90 text-ivory border-ivory/70 dark:bg-night-950/92 dark:text-[#5ED3DA] dark:border-[#5ED3DA]/55',
  },
  cooldown: {
    icon: 'clock',
    pillClass:
      'bg-amber-50/95 text-amber-950 border-amber-300/90 dark:bg-night-900/95 dark:text-amber-300 dark:border-amber-700/70',
  },
  'never-rotated': {
    icon: 'sparkles',
    pillClass:
      'bg-sky-50/95 text-sky-950 border-sky-300/90 dark:bg-night-900/95 dark:text-sky-300 dark:border-sky-700/70',
  },
  'read-history': {
    icon: 'check',
    pillClass:
      'bg-ivory/94 text-forest-800 border-linen-200/90 dark:bg-night-900/92 dark:text-[#5ED3DA] dark:border-night-700',
  },
});
