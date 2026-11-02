/**
 * @fileoverview Declarative configuration for Play & Storytime mini-apps (`#/play`).
 *
 * HOW TO CUSTOMIZE LOGOS & PREVIEW ARTWORK:
 * 1. Drop your own square logo (`1:1`) or landscape preview illustration (`4:3` or `16:10`)
 *    into `public/assets/play/` (for example `public/assets/play/my-picker-logo.png`).
 * 2. Update `logoUrl` or `imageUrl` below using a relative path without a leading slash
 *    (e.g. `'assets/play/my-picker-logo.png'`) so it works both locally and on GitHub Pages subpaths,
 *    OR use any `https://...` image URL.
 * 3. Set `logoUrl: ''` or `imageUrl: ''` if you prefer a clean vector-only fallback using `logoIcon`.
 */

/**
 * @typedef {'storytime-picker' | 'book-hunt'} PlayAppId
 */

/**
 * @typedef {Object} PlayAppConfig
 * @property {PlayAppId} id - Stable mini-app identifier
 * @property {string} title - Display name shown on the preview card & slide-up sheet
 * @property {string} subtitle - Short eyebrow subtitle above the title
 * @property {string} description - 1-2 sentence preview summary shown on `#/play`
 * @property {string} imageUrl - Preview banner artwork URL (relative to `public/` or `https://`), or `''` for vector fallback
 * @property {string} logoUrl - Square app logo image URL (relative to `public/` or `https://`), or `''` for icon fallback
 * @property {'dice' | 'compass' | 'sparkles' | 'play' | 'books'} logoIcon - Built-in SVG icon fallback from `src/ui/icons.js`
 * @property {string} ctaLabel - Primary launch button label on the preview card
 */

/** @type {readonly PlayAppConfig[]} */
export const PLAY_APPS_CONFIG = Object.freeze([
  Object.freeze({
    id: 'storytime-picker',
    title: 'Storytime & Topic Picker',
    subtitle: 'Bedtime & Mood Randomizer',
    description:
      'Spin 1 to 4 surprise books from your active shelf or home library—filtered by bedtime, animals, vehicles, or any mood.',
    imageUrl: 'assets/play/storytime-picker-preview.jpg',
    logoUrl: 'assets/play/storytime-picker-logo.jpg',
    logoIcon: 'dice',
    ctaLabel: 'Open Storytime Picker',
  }),
  Object.freeze({
    id: 'book-hunt',
    title: 'Book Hunt (“Find It!”)',
    subtitle: 'Shelf Treasure Search',
    description:
      'Show a cover or read a playful mystery clue aloud so young readers can race to the physical shelf and find the matching book.',
    imageUrl: 'assets/play/book-hunt-preview.jpg',
    logoUrl: 'assets/play/book-hunt-logo.jpg',
    logoIcon: 'compass',
    ctaLabel: 'Play Book Hunt',
  }),
]);

/**
 * Resolves the Play mini-apps configuration list, optionally merging per-app overrides
 * (useful for runtime customization or automated tests).
 *
 * @param {Partial<Record<PlayAppId, Partial<PlayAppConfig>>> | null} [overrides]
 * @returns {PlayAppConfig[]}
 */
export function getPlayAppsConfig(overrides = null) {
  return PLAY_APPS_CONFIG.map((app) => {
    const patch = overrides && overrides[app.id] ? overrides[app.id] : null;
    if (!patch) return { ...app };
    return {
      ...app,
      ...patch,
      id: app.id,
    };
  });
}
