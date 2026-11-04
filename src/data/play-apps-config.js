/**
 * @fileoverview Backward-compatible re-export for Play Hub app configurations & JSDoc typedefs.
 * All editable app configuration now lives in `/src/config/` (`/src/config/play-apps.js`).
 */

/**
 * @typedef {import('../config/play-apps.js').PlayAppId} PlayAppId
 * @typedef {import('../config/play-apps.js').PlayAppAccentPalette} PlayAppAccentPalette
 * @typedef {import('../config/play-apps.js').PlayAppConfig} PlayAppConfig
 * @typedef {import('../config/play-apps.js').PlayAppConfigEntry} PlayAppConfigEntry
 */

export { PLAY_APPS_CONFIG, getPlayAppsConfig } from '../config/play-apps.js';
