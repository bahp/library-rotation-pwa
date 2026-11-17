/**
 * @fileoverview Centralized color palettes and 4-corner book cover overlay badge taxonomy.
 * Restrained Dark Academia & Antique Paper palettes aligned across both Light & Dark themes.
 */

/**
 * Profile and owner avatar solid badge classes.
 * @type {Record<string, string>}
 */
export const AVATAR_TONES = Object.freeze({
  teal: 'bg-[#244B40] text-[#FFFCF5] dark:bg-[#82A699] dark:text-[#142321]',
  amber: 'bg-[#9E6E32] text-[#FFFCF5] dark:bg-[#D0AD55] dark:text-[#142321]',
  indigo: 'bg-[#394E61] text-[#FFFCF5] dark:bg-[#94A8B8] dark:text-[#142321]',
  rose: 'bg-[#8C4A4F] text-[#FFFCF5] dark:bg-[#C48A8E] dark:text-[#142321]',
  emerald: 'bg-[#4B6F52] text-[#FFFCF5] dark:bg-[#A8B59A] dark:text-[#142321]',
});

/**
 * Selected topic/chip pill classes keyed by reader avatar tone so per-reader tags reflect their profile color.
 * @type {Record<string, string>}
 */
export const AVATAR_TONE_PILL_STYLES = Object.freeze({
  teal: 'bg-[#244B40] text-[#FFFCF5] border-[#244B40] dark:bg-[#243831] dark:text-[#F0E7D5] dark:border-[#82A699] shadow-2xs',
  amber: 'bg-[#9E6E32] text-[#FFFCF5] border-[#9E6E32] dark:bg-[#2E2A1E] dark:text-[#F0E7D5] dark:border-[#D0AD55] shadow-2xs',
  indigo: 'bg-[#394E61] text-[#FFFCF5] border-[#394E61] dark:bg-[#222E38] dark:text-[#F0E7D5] dark:border-[#94A8B8] shadow-2xs',
  rose: 'bg-[#8C4A4F] text-[#FFFCF5] border-[#8C4A4F] dark:bg-[#332224] dark:text-[#F0E7D5] dark:border-[#C48A8E] shadow-2xs',
  emerald: 'bg-[#4B6F52] text-[#FFFCF5] border-[#4B6F52] dark:bg-[#223328] dark:text-[#F0E7D5] dark:border-[#A8B59A] shadow-2xs',
});

/**
 * Border-only reader selector pill classes keyed by avatar tone (neutral paper interior + profile-colored border).
 * @type {Record<string, string>}
 */
export const AVATAR_TONE_BORDER_STYLES = Object.freeze({
  teal: 'bg-surface text-ink border-2 border-[#244B40] dark:border-[#82A699] shadow-2xs',
  amber: 'bg-surface text-ink border-2 border-[#9E6E32] dark:border-[#D0AD55] shadow-2xs',
  indigo: 'bg-surface text-ink border-2 border-[#394E61] dark:border-[#94A8B8] shadow-2xs',
  rose: 'bg-surface text-ink border-2 border-[#8C4A4F] dark:border-[#C48A8E] shadow-2xs',
  emerald: 'bg-surface text-ink border-2 border-[#4B6F52] dark:border-[#A8B59A] shadow-2xs',
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
  { id: 'teal', label: 'Forest Leaf', swatch: 'bg-[#244B40] dark:bg-[#82A699]' },
  { id: 'amber', label: 'Antique Brass', swatch: 'bg-[#9E6E32] dark:bg-[#D0AD55]' },
  { id: 'indigo', label: 'Slate Ink', swatch: 'bg-[#394E61] dark:bg-[#94A8B8]' },
  { id: 'rose', label: 'Pressed Rose', swatch: 'bg-[#8C4A4F] dark:bg-[#C48A8E]' },
  { id: 'emerald', label: 'Dried Sage', swatch: 'bg-[#4B6F52] dark:bg-[#A8B59A]' },
]);

/**
 * Keyed cloth-bound spine palettes used by `renderBookCover` when a book has no external cover image.
 * @type {Record<string, { bg: string, spine: string, text: string }>}
 */
export const BOOK_SPINE_PALETTES_BY_KEY = Object.freeze({
  teal: {
    bg: 'bg-[#244B40] dark:bg-[#1E3F35]',
    spine: 'bg-[#17312A]/65',
    text: 'text-[#F5F0E5]',
  },
  indigo: {
    bg: 'bg-[#324352] dark:bg-[#273542]',
    spine: 'bg-[#1C2833]/65',
    text: 'text-[#F5F0E5]',
  },
  amber: {
    bg: 'bg-[#8F652E] dark:bg-[#765122]',
    spine: 'bg-[#563B17]/60',
    text: 'text-[#FFFCF5]',
  },
  rose: {
    bg: 'bg-[#7E4044] dark:bg-[#673337]',
    spine: 'bg-[#4C2326]/60',
    text: 'text-[#FFFAF9]',
  },
  emerald: {
    bg: 'bg-[#3B5942] dark:bg-[#2E4634]',
    spine: 'bg-[#223627]/60',
    text: 'text-[#F5F0E5]',
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
    'bg-surface-elevated/95 text-ink border border-accent/60',
  libraryLoan:
    'bg-surface/95 text-ink border border-edge',
  saved:
    'bg-surface-subtle/95 text-ink border border-secondary/60',
  torn: 'bg-accent/95 text-[#FFFCF5] border border-accent',
  damaged: 'bg-[#8C4A4F]/95 text-[#FFFCF5] border border-[#8C4A4F]',
});

/**
 * Visual styling map for mutually-exclusive bottom-left rotation status adornos (`data-cover-adorno`).
 */
export const COVER_ROTATION_ADORNO_STYLES = Object.freeze({
  'shelf-read': {
    icon: 'check',
    pillClass:
      'bg-primary/95 text-primary-fg border-edge/60',
  },
  'stale-unread': {
    icon: 'clock',
    pillClass:
      'bg-accent/95 text-[#FFFCF5] border-edge/50',
  },
  'on-shelf': {
    icon: 'library',
    pillClass:
      'bg-surface/95 text-ink border-edge',
  },
  cooldown: {
    icon: 'clock',
    pillClass:
      'bg-surface-elevated/95 text-accent border-accent/45',
  },
  'never-rotated': {
    icon: 'sparkles',
    pillClass:
      'bg-surface/95 text-primary border-primary/40',
  },
  'read-history': {
    icon: 'check',
    pillClass:
      'bg-surface/95 text-ink-secondary border-edge',
  },
});
