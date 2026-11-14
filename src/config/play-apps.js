/**
 * @fileoverview Centralized configuration for Play & Storytime mini-apps/games (`#/play`).
 *
 * HOW TO CUSTOMIZE LOGOS, PREVIEW IMAGES & DESCRIPTIONS:
 * - Each entry in `PLAY_APPS_CONFIG` controls one preview card in the Play Hub and its slide-up game sheet.
 * - `imageUrl`: Relative path or URL to a landscape preview image (e.g. `'assets/play/storytime-picker-preview.jpg'`).
 *   Set `imageUrl: ''` to render the clean vector emblem fallback instead.
 * - `logoUrl`: Relative path or URL to a square app logo image (e.g. `'assets/play/storytime-picker-logo.jpg'`).
 *   Set `logoUrl: ''` to render the built-in `logoIcon` SVG vector badge instead.
 * - `logoIcon`: Built-in crisp icon name (`'dice'`, `'compass'`, `'sparkles'`, `'search'`, `'book'`, `'heart'`).
 * - `accentPalette`: Card color theme (`'forest'` | `'amber'` | `'rose'` | `'indigo'`).
 */

/**
 * @typedef {'storytime-picker' | 'book-hunt' | 'reading-passport'} PlayAppId
 */

/**
 * @typedef {'forest' | 'amber' | 'rose' | 'indigo'} PlayAppAccentPalette
 */

/**
 * @typedef {Object} PlayAppConfig
 * @property {PlayAppId} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string} shortTagline
 * @property {string} description
 * @property {string} badgeLabel
 * @property {string} ctaLabel
 * @property {string} logoIcon
 * @property {string} logoUrl
 * @property {string} imageUrl
 * @property {string} previewImageUrl
 * @property {string} previewImageAlt
 * @property {PlayAppAccentPalette} accentPalette
 */

/**
 * @typedef {PlayAppConfig} PlayAppConfigEntry
 */

/**
 * Editable configuration list for all Play Hub preview cards & games.
 * @type {readonly PlayAppConfig[]}
 */
export const PLAY_APPS_CONFIG = Object.freeze([
  Object.freeze({
    id: 'storytime-picker',
    title: 'Storytime & Topic Picker',
    subtitle: 'Quick Bedtime Draw',
    shortTagline: 'End bedtime negotiation with a quick surprise draw',
    description:
      'Pick any number of books from tonight’s shelf or your home library—optionally filtered by trucks, bedtime, animals, or space.',
    badgeLabel: 'Quick Draw',
    ctaLabel: 'Open Storytime Picker',
    logoIcon: 'dice',
    logoUrl: 'assets/play/storytime-picker-logo.jpg',
    imageUrl: 'assets/play/storytime-picker-preview.jpg',
    previewImageUrl: 'assets/play/storytime-picker-preview.jpg',
    previewImageAlt: 'Storytime & Topic Picker preview',
    accentPalette: 'forest',
  }),
  Object.freeze({
    id: 'book-hunt',
    title: 'Book Hunt (“Find It!”)',
    subtitle: 'Interactive Shelf Game',
    shortTagline: 'Interactive physical-shelf treasure hunt for kids',
    description:
      'Reads out a playful clue (“Find the book with the blue truck!”) so your child can spot the real book on the shelf.',
    badgeLabel: 'Shelf Game',
    ctaLabel: 'Play Book Hunt',
    logoIcon: 'compass',
    logoUrl: 'assets/play/book-hunt-logo.jpg',
    imageUrl: 'assets/play/book-hunt-preview.jpg',
    previewImageUrl: 'assets/play/book-hunt-preview.jpg',
    previewImageAlt: 'Book Hunt game preview',
    accentPalette: 'amber',
  }),
  Object.freeze({
    id: 'reading-passport',
    title: 'Reading Passport & Stamp Book',
    subtitle: 'Printable Activity Book',
    shortTagline: 'Printable passport booklet & bingo cards for stamps and stickers',
    description:
      'Generate a client-side printable passport booklet, reading bingo card, or sticker track populated with book covers from your shelf for physical stamping with young readers.',
    badgeLabel: 'Printable',
    ctaLabel: 'Open Passport Studio',
    logoIcon: 'stamp',
    logoUrl: 'assets/play/reading-passport-logo.jpg',
    imageUrl: 'assets/play/reading-passport-preview.jpg',
    previewImageUrl: 'assets/play/reading-passport-preview.jpg',
    previewImageAlt: 'Reading Passport & Stamp Book preview',
    accentPalette: 'indigo',
  }),
]);

/**
 * Returns normalized Play app configs, merging optional keyed or array overrides cleanly.
 * @param {Partial<Record<PlayAppId, Partial<PlayAppConfig>>> | Array<Partial<PlayAppConfig> & { id: PlayAppId }> | null | undefined} [overrides]
 * @returns {PlayAppConfig[]}
 */
export function getPlayAppsConfig(overrides = null) {
  /** @type {Map<PlayAppId, Partial<PlayAppConfig>>} */
  const overrideMap = new Map();

  if (Array.isArray(overrides)) {
    for (const entry of overrides) {
      if (entry && entry.id) {
        overrideMap.set(entry.id, entry);
      }
    }
  } else if (overrides && typeof overrides === 'object') {
    for (const [key, value] of Object.entries(overrides)) {
      if ((key === 'storytime-picker' || key === 'book-hunt' || key === 'reading-passport') && value && typeof value === 'object') {
        overrideMap.set(key, value);
      }
    }
  }

  return PLAY_APPS_CONFIG.map((base) => {
    const custom = overrideMap.get(base.id);
    if (!custom) return { ...base };

    const resolvedImageUrl =
      custom.imageUrl !== undefined
        ? String(custom.imageUrl).trim()
        : custom.previewImageUrl !== undefined
          ? String(custom.previewImageUrl).trim()
          : base.imageUrl;

    const resolvedLogoUrl =
      custom.logoUrl !== undefined ? String(custom.logoUrl).trim() : base.logoUrl;

    const resolvedSubtitle =
      String(custom.subtitle ?? custom.shortTagline ?? base.subtitle).trim() || base.subtitle;

    return {
      ...base,
      ...custom,
      id: base.id,
      title: String(custom.title ?? base.title).trim() || base.title,
      subtitle: resolvedSubtitle,
      shortTagline: String(custom.shortTagline ?? custom.subtitle ?? base.shortTagline).trim() || base.shortTagline,
      description: String(custom.description ?? base.description).trim() || base.description,
      badgeLabel: String(custom.badgeLabel ?? base.badgeLabel).trim() || base.badgeLabel,
      ctaLabel: String(custom.ctaLabel ?? base.ctaLabel).trim() || base.ctaLabel,
      logoIcon: String(custom.logoIcon ?? base.logoIcon).trim() || base.logoIcon,
      logoUrl: resolvedLogoUrl,
      imageUrl: resolvedImageUrl,
      previewImageUrl: resolvedImageUrl,
      previewImageAlt:
        String(custom.previewImageAlt ?? base.previewImageAlt).trim() || base.previewImageAlt,
      accentPalette: custom.accentPalette || base.accentPalette,
    };
  });
}
