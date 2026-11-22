/**
 * @fileoverview Centralized color palettes and 4-corner book cover overlay badge taxonomy.
 * Restrained Dark Academia & Antique Paper palettes aligned across both Light & Dark themes.
 */

/**
 * Profile and owner avatar solid badge classes.
 * @type {Record<string, string>}
 */
export const AVATAR_TONES = Object.freeze({
  teal: 'bg-reader-teal text-reader-teal-fg',
  amber: 'bg-reader-amber text-reader-amber-fg',
  indigo: 'bg-reader-indigo text-reader-indigo-fg',
  rose: 'bg-reader-rose text-reader-rose-fg',
  emerald: 'bg-reader-emerald text-reader-emerald-fg',
});

/**
 * Selected topic/chip pill classes keyed by reader avatar tone so per-reader tags reflect their profile color.
 * @type {Record<string, string>}
 */
export const AVATAR_TONE_PILL_STYLES = Object.freeze({
  teal: 'lr-reader-pill-teal shadow-2xs',
  amber: 'lr-reader-pill-amber shadow-2xs',
  indigo: 'lr-reader-pill-indigo shadow-2xs',
  rose: 'lr-reader-pill-rose shadow-2xs',
  emerald: 'lr-reader-pill-emerald shadow-2xs',
});

/**
 * Border-only reader selector pill classes keyed by avatar tone (neutral paper interior + profile-colored border).
 * @type {Record<string, string>}
 */
export const AVATAR_TONE_BORDER_STYLES = Object.freeze({
  teal: 'bg-surface text-ink border-2 border-reader-teal shadow-2xs',
  amber: 'bg-surface text-ink border-2 border-reader-amber shadow-2xs',
  indigo: 'bg-surface text-ink border-2 border-reader-indigo shadow-2xs',
  rose: 'bg-surface text-ink border-2 border-reader-rose shadow-2xs',
  emerald: 'bg-surface text-ink border-2 border-reader-emerald shadow-2xs',
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
  { id: 'teal', label: 'Forest Leaf', swatch: 'bg-reader-teal' },
  { id: 'amber', label: 'Antique Brass', swatch: 'bg-reader-amber' },
  { id: 'indigo', label: 'Slate Ink', swatch: 'bg-reader-indigo' },
  { id: 'rose', label: 'Pressed Rose', swatch: 'bg-reader-rose' },
  { id: 'emerald', label: 'Dried Sage', swatch: 'bg-reader-emerald' },
]);

/**
 * Keyed cloth-bound spine palettes used by `renderBookCover` when a book has no external cover image.
 * @type {Record<string, { bg: string, spine: string, text: string }>}
 */
export const BOOK_SPINE_PALETTES_BY_KEY = Object.freeze({
  teal: {
    bg: 'bg-spine-teal',
    spine: 'bg-spine-teal-edge/65',
    text: 'text-spine-teal-fg',
  },
  indigo: {
    bg: 'bg-spine-indigo',
    spine: 'bg-spine-indigo-edge/65',
    text: 'text-spine-indigo-fg',
  },
  amber: {
    bg: 'bg-spine-amber',
    spine: 'bg-spine-amber-edge/60',
    text: 'text-spine-amber-fg',
  },
  rose: {
    bg: 'bg-spine-rose',
    spine: 'bg-spine-rose-edge/60',
    text: 'text-spine-rose-fg',
  },
  emerald: {
    bg: 'bg-spine-emerald',
    spine: 'bg-spine-emerald-edge/60',
    text: 'text-spine-emerald-fg',
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
  torn: 'bg-accent/95 text-accent-fg border border-accent',
  damaged: 'bg-danger-solid/95 text-danger-solid-fg border border-danger-solid',
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
      'bg-accent/95 text-accent-fg border-edge/50',
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
