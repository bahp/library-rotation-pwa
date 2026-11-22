/**
 * @fileoverview Centralized theme preset registry for Library Rotation.
 *
 * Palette CSS custom properties and font variables for each preset live in `/src/index.css`
 * under `[data-theme="<id>"]`.
 */

/** @type {'bunko'} */
export const DEFAULT_LIGHT_THEME_PRESET = 'bunko';
/** @type {'forest-brass'} */
export const DEFAULT_DARK_THEME_PRESET = 'forest-brass';

/**
 * @typedef {(
 *   | 'bunko'
 *   | 'shiori'
 *   | 'darker-teal'
 *   | 'sunlit-cream'
 *   | 'classic-teal'
 *   | 'antique-paper'
 *   | 'sky-blue'
 *   | 'sage-green'
 *   | 'blush-pink'
 *   | 'classic-light'
 *   | 'mimir'
 *   | 'forest-brass'
 *   | 'hylle-editorial'
 *   | 'midnight-ink'
 *   | 'warm-library'
 *   | 'plum-noir'
 *   | 'slate-minimal'
 *   | 'forest-library'
 *   | 'midnight-library'
 * )} ThemePresetId
 */

/**
 * @typedef {Object} ThemePresetConfig
 * @property {ThemePresetId} id
 * @property {'light' | 'dark'} mode
 * @property {string} label
 * @property {string} shortDescription
 * @property {string} fontDescription
 * @property {'engraving' | 'illustration'} sidebarArtworkDefault
 * @property {'engraving' | 'illustration'} landingArtworkDefault
 * @property {string} themeColorHex
 * @property {string} emblemHex
 * @property {readonly string[]} swatches
 */

/** @type {Record<ThemePresetId, ThemePresetConfig>} */
export const THEME_PRESETS = Object.freeze({
  bunko: Object.freeze({
    id: 'bunko',
    mode: 'light',
    label: 'Bunko',
    shortDescription: 'Warm Japanese washi paper, vermilion & deep pine-spruce',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#F6EFE3',
    emblemHex: '#25423A',
    swatches: ['#F3E5D0', '#B63D2B', '#25423A', '#D8BA8E'],
  }),
  shiori: Object.freeze({
    id: 'shiori',
    mode: 'light',
    label: 'Shiori',
    shortDescription: 'Graceful sakura-pearl paper, rose coral & twilight celadon',
    fontDescription: 'Cormorant Garamond + Plus Jakarta Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#FAF2ED',
    emblemHex: '#444756',
    swatches: ['#FBF4F0', '#E0918A', '#5B6E70', '#6B697E'],
  }),
  'darker-teal': Object.freeze({
    id: 'darker-teal',
    mode: 'light',
    label: 'Darker Teal',
    shortDescription: 'Ivory linen canvas with deep spruce-teal sidebar rgb(30, 50, 44)',
    fontDescription: 'Fraunces + Plus Jakarta Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#F7F5EE',
    emblemHex: '#1E322C',
    swatches: ['#F7F5EE', '#FFFFFF', '#1E322C', '#B38B43'],
  }),
  'sunlit-cream': Object.freeze({
    id: 'sunlit-cream',
    mode: 'light',
    label: 'Sunlit Cream',
    shortDescription: 'Warm honeyed linen, terracotta ink & soft oak',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#F7F1E7',
    emblemHex: '#9E572C',
    swatches: ['#F7F1E7', '#EDE2D1', '#A65E32', '#C6A77B'],
  }),
  'classic-teal': Object.freeze({
    id: 'classic-teal',
    mode: 'light',
    label: 'Classic Teal',
    shortDescription: 'Warm ivory linen, botanical teal & slate-blue accents',
    fontDescription: 'Fraunces + Plus Jakarta Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#F8F5EE',
    emblemHex: '#115953',
    swatches: ['#F8F5EE', '#FFFFFF', '#115953', '#2D6F8A'],
  }),
  'antique-paper': Object.freeze({
    id: 'antique-paper',
    mode: 'light',
    label: 'Antique Paper',
    shortDescription: 'Archival cream parchment & deep forest green',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#F5F0E5',
    emblemHex: '#244B40',
    swatches: ['#F5F0E5', '#FFFCF5', '#244B40', '#B38B43'],
  }),
  'sky-blue': Object.freeze({
    id: 'sky-blue',
    mode: 'light',
    label: 'Sky Blue',
    shortDescription: 'Fresh coastal air, crisp white & maritime blue',
    fontDescription: 'Fraunces + Plus Jakarta Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#F0F5FA',
    emblemHex: '#2F6CA8',
    swatches: ['#F0F5FA', '#E0EAF4', '#3979B8', '#8DB6D9'],
  }),
  'sage-green': Object.freeze({
    id: 'sage-green',
    mode: 'light',
    label: 'Sage Green',
    shortDescription: 'Natural meadow sage, soft olive & calm moss',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#F1F3EA',
    emblemHex: '#4B683B',
    swatches: ['#F1F3EA', '#E2E8D9', '#597747', '#A5B58B'],
  }),
  'blush-pink': Object.freeze({
    id: 'blush-pink',
    mode: 'light',
    label: 'Blush Pink',
    shortDescription: 'Soft rose petal paper, plum ink & warm berry',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#FBF0EF',
    emblemHex: '#9E4357',
    swatches: ['#FBF0EF', '#F2DEDF', '#A94E62', '#D99AA6'],
  }),
  'classic-light': Object.freeze({
    id: 'classic-light',
    mode: 'light',
    label: 'Classic Light',
    shortDescription: 'Clean gallery stone, crisp charcoal & timeless balance',
    fontDescription: 'Fraunces + Plus Jakarta Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#F5F5F3',
    emblemHex: '#353B40',
    swatches: ['#F5F5F3', '#E9EAE8', '#353B40', '#A5ADB2'],
  }),
  mimir: Object.freeze({
    id: 'mimir',
    mode: 'dark',
    label: 'Mimir',
    shortDescription: 'Mythic Norse wisdom, deep forest-obsidian & antique gold',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#0B1713',
    emblemHex: '#12211C',
    swatches: ['#0A1512', '#CFA84E', '#F2ECE0', '#5E7369'],
  }),
  'forest-brass': Object.freeze({
    id: 'forest-brass',
    mode: 'dark',
    label: 'Forest & Brass',
    shortDescription: 'Deep evergreen study, sage highlights & warm brass',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#101713',
    emblemHex: '#19251F',
    swatches: ['#101713', '#19251F', '#C49A55', '#91A58A'],
  }),
  'midnight-ink': Object.freeze({
    id: 'midnight-ink',
    mode: 'dark',
    label: 'Midnight Ink',
    shortDescription: 'Deep nocturnal navy, slate blue & crisp sky mist',
    fontDescription: 'Fraunces + Plus Jakarta Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#0B1420',
    emblemHex: '#152538',
    swatches: ['#0B1420', '#152538', '#4B91C7', '#9CC8E8'],
  }),
  'warm-library': Object.freeze({
    id: 'warm-library',
    mode: 'dark',
    label: 'Warm Library',
    shortDescription: 'Toasted espresso walnut, amber lampglow & parchment ink',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#17120E',
    emblemHex: '#292017',
    swatches: ['#17120E', '#292017', '#D49A50', '#E8BC78'],
  }),
  'plum-noir': Object.freeze({
    id: 'plum-noir',
    mode: 'dark',
    label: 'Plum Noir',
    shortDescription: 'Velvet dusk aubergine, dusty rose & soft orchid',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#19121C',
    emblemHex: '#2B1D30',
    swatches: ['#19121C', '#2B1D30', '#C477A6', '#DCA4C6'],
  }),
  'slate-minimal': Object.freeze({
    id: 'slate-minimal',
    mode: 'dark',
    label: 'Slate Minimal',
    shortDescription: 'Cool graphite charcoal, seafoam teal & mineral grey',
    fontDescription: 'Fraunces + Plus Jakarta Sans',
    sidebarArtworkDefault: 'illustration',
    landingArtworkDefault: 'illustration',
    themeColorHex: '#15191D',
    emblemHex: '#242C33',
    swatches: ['#15191D', '#242C33', '#39B8C3', '#8CABB2'],
  }),
  'forest-library': Object.freeze({
    id: 'forest-library',
    mode: 'dark',
    label: 'Forest Library',
    shortDescription: 'Spruce study walls, mossy ink & antique brass accents',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#142321',
    emblemHex: '#1C2D29',
    swatches: ['#142321', '#1C2D29', '#A8B59A', '#D0AD55'],
  }),
  'midnight-library': Object.freeze({
    id: 'midnight-library',
    mode: 'dark',
    label: 'Midnight Library',
    shortDescription: 'Matte warm charcoal, obsidian surfaces & brushed gold',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#0F100F',
    emblemHex: '#181918',
    swatches: ['#0F100F', '#181918', '#9E9B92', '#E0B654'],
  }),
  'hylle-editorial': Object.freeze({
    id: 'hylle-editorial',
    mode: 'dark',
    label: 'Hylle Noir',
    shortDescription: 'Obsidian book journal, deep olive cards & brushed champagne gold',
    fontDescription: 'Cormorant Garamond + DM Sans',
    sidebarArtworkDefault: 'engraving',
    landingArtworkDefault: 'engraving',
    themeColorHex: '#0B0D0C',
    emblemHex: '#141513',
    swatches: ['#0B0D0C', '#141513', '#D2B35B', '#F3EFE6'],
  }),
});

/** @type {readonly ThemePresetId[]} */
export const THEME_PRESET_IDS = Object.freeze([
  'bunko',
  'shiori',
  'darker-teal',
  'sunlit-cream',
  'classic-teal',
  'antique-paper',
  'sky-blue',
  'sage-green',
  'blush-pink',
  'classic-light',
  'mimir',
  'forest-brass',
  'hylle-editorial',
  'midnight-ink',
  'warm-library',
  'plum-noir',
  'slate-minimal',
  'forest-library',
  'midnight-library',
]);

/** @type {readonly ThemePresetId[]} */
export const LIGHT_THEME_PRESET_IDS = Object.freeze(
  THEME_PRESET_IDS.filter((id) => THEME_PRESETS[id].mode === 'light')
);

/** @type {readonly ThemePresetId[]} */
export const DARK_THEME_PRESET_IDS = Object.freeze(
  THEME_PRESET_IDS.filter((id) => THEME_PRESETS[id].mode === 'dark')
);

/**
 * Validates and normalizes an arbitrary theme preset string.
 * @param {unknown} raw
 * @returns {ThemePresetId | undefined}
 */
export function normalizeThemePresetId(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (val && Object.prototype.hasOwnProperty.call(THEME_PRESETS, val)) {
    return /** @type {ThemePresetId} */ (val);
  }
  return undefined;
}

/**
 * Resolves the active theme preset configuration given `theme` ('light' | 'dark' | 'system'),
 * optional `themePreset`, and OS `prefersDark`.
 *
 * @param {'light' | 'dark' | 'system' | undefined} theme
 * @param {string | undefined} themePreset
 * @param {boolean} [prefersDark]
 * @returns {ThemePresetConfig}
 */
export function resolveEffectiveThemeConfig(theme, themePreset, prefersDark = false) {
  const normalizedPreset = normalizeThemePresetId(themePreset);
  const effectiveDark = theme === 'dark' || (theme === 'system' && Boolean(prefersDark));

  if (effectiveDark) {
    if (normalizedPreset && THEME_PRESETS[normalizedPreset].mode === 'dark') {
      return THEME_PRESETS[normalizedPreset];
    }
    return THEME_PRESETS[DEFAULT_DARK_THEME_PRESET];
  }

  if (normalizedPreset && THEME_PRESETS[normalizedPreset].mode === 'light') {
    return THEME_PRESETS[normalizedPreset];
  }
  return THEME_PRESETS[DEFAULT_LIGHT_THEME_PRESET];
}
