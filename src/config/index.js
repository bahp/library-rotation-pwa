/**
 * @fileoverview Single centralized configuration barrel for the Library Rotation PWA (`/src/config/`).
 *
 * QUICK CUSTOMIZATION DIRECTORY:
 * - `/src/config/defaults.js`          -> Default app settings & numeric bounds (no 15-book cap)
 * - `/src/config/themes.js`            -> Multi-theme presets (Classic Teal, Antique Paper, Midnight Library, Forest Library)
 * - `/src/config/onboarding-slides.js` -> Configurable onboarding intro slideshow highlights
 * - `/src/config/colors-and-badges.js` -> Spine palettes, avatar tones & 4-corner cover badge rules
 * - `/src/config/presets.js`           -> Built-in seasonal, milestone & thematic shelf presets
 * - `/src/config/play-apps.js`         -> Play Hub mini-app titles, icons & custom preview image URLs
 * - `/src/config/locales/en.yaml`      -> English UI copy
 * - `/src/config/locales/es.yaml`      -> Spanish UI copy (Español)
 * - `/src/config/locales/it.yaml`      -> Italian UI copy (Italiano)
 * - `/src/config/i18n.js`              -> `t(lang, key, vars)` translation helper & language metadata
 */

export {
  NUMERIC_BOUNDS,
  DEFAULT_PRESET_ILLUSTRATION_PROMPT,
  DEFAULT_BOOK_CARD_FIELDS,
  ALL_BOOK_CARD_FIELDS,
  VALID_BOOK_CARD_SECTIONS,
  normalizePositiveBookCount,
  normalizeSidebarDividerStyle,
  normalizeBookCardInfoPlacement,
  normalizeBookCardFields,
  normalizeBookCardSectionOverrides,
  resolveBookCardDisplayConfig,
  createDefaultAppSettings,
} from './defaults.js';

export {
  DEFAULT_LIGHT_THEME_PRESET,
  DEFAULT_DARK_THEME_PRESET,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  LIGHT_THEME_PRESET_IDS,
  DARK_THEME_PRESET_IDS,
  normalizeThemePresetId,
  resolveEffectiveThemeConfig,
} from './themes.js';

export {
  ONBOARDING_LANDING_DEFAULT_MODE,
  ONBOARDING_INTRO_SLIDES,
} from './onboarding-slides.js';

export {
  AVATAR_TONES,
  AVATAR_TONE_CLASSES,
  AVATAR_TONE_PILL_STYLES,
  AVATAR_TONE_BORDER_STYLES,
  PROFILE_AVATAR_TONE_OPTIONS,
  BOOK_SPINE_PALETTES,
  BOOK_SPINE_PALETTES_BY_KEY,
  COVER_BADGE_SLOTS,
  COVER_CATALOG_BADGE_STYLES,
  COVER_ROTATION_ADORNO_STYLES,
} from './colors-and-badges.js';

export { DEFAULT_ROTATION_PRESETS } from './presets.js';

export {
  COLLECTION_ILLUSTRATIONS,
  PRESET_ILLUSTRATION_MAP,
  getIllustrationById,
  getSuggestedIllustrationForPreset,
  isLegacyOpaqueArtworkUrl,
} from './illustrations.js';

export { PLAY_APPS_CONFIG, getPlayAppsConfig } from './play-apps.js';

export { parseSimpleYaml } from './yaml-lite.js';

export {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  detectDeviceLanguage,
  getLocaleDictionary,
  t,
} from './i18n.js';
