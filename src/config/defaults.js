/**
 * @fileoverview Centralized default application settings and numeric configuration bounds.
 *
 * Edit this file to adjust default shelf sizes, swap/cooldown intervals, notification windows,
 * stale-book thresholds, or starter preferences across the entire app.
 */

/**
 * Numeric bounds and fallback defaults shared by Store, Rotation Engine, Presets, Play, and UI forms.
 * Note: `rotationBooksMax` is intentionally `null` (unlimited) so families and classrooms can create
 * shelves of any size (>= 1 book).
 */
export const NUMERIC_BOUNDS = Object.freeze({
  rotationBooksMin: 1,
  /** @type {number | null} */
  rotationBooksMax: null,
  profileDefaultRotationSize: 5,
  rotationGeneratorDefaultCount: 4,
  presetDefaultCount: 5,
  defaultSwapDays: 14,
  swapDaysMin: 1,
  swapDaysMax: 90,
  defaultCooldownDays: 14,
  cooldownDaysMin: 0,
  cooldownDaysMax: 180,
  presetAlertDaysBeforeDefault: 2,
  presetAlertDaysBeforeMin: 0,
  presetAlertDaysBeforeMax: 30,
  presetAlertDaysAfterDefault: 5,
  presetAlertDaysAfterMin: 0,
  presetAlertDaysAfterMax: 30,
  staleBookDaysDefault: 10,
  staleBookDaysMin: 3,
  staleBookDaysMax: 60,
  storytimeCountDefault: 3,
  storytimeCountMin: 1,
  storytimeCountMax: 50,
  aiTimeoutDefaultMs: 6000,
  aiTimeoutMinMs: 1500,
  aiTimeoutMaxMs: 20000,
  bookCardCustomWidthDefault: 136,
  bookCardCustomWidthMin: 88,
  bookCardCustomWidthMax: 260,
});

/**
 * Normalizes a requested books-per-rotation count to any positive integer (`>= 1`) with no upper cap.
 *
 * @param {unknown} rawCount
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizePositiveBookCount(
  rawCount,
  fallback = NUMERIC_BOUNDS.rotationGeneratorDefaultCount
) {
  const safeFallback = Math.max(NUMERIC_BOUNDS.rotationBooksMin, Math.trunc(Number(fallback) || 4));
  const parsed = Number(rawCount);
  if (!Number.isFinite(parsed) || parsed < NUMERIC_BOUNDS.rotationBooksMin) {
    return safeFallback;
  }
  return Math.max(NUMERIC_BOUNDS.rotationBooksMin, Math.trunc(parsed));
}

/**
 * Default onboarding progress state helper.
 * @param {Partial<import('../types/models.js').OnboardingProgressState>} [overrides]
 * @returns {import('../types/models.js').OnboardingProgressState}
 */
export function createDefaultOnboardingState(overrides = {}) {
  return {
    status: overrides.status || 'completed',
    currentStep: typeof overrides.currentStep === 'number' ? overrides.currentStep : 6,
    completedSteps: Array.isArray(overrides.completedSteps) ? [...overrides.completedSteps] : [],
    skippedSteps: Array.isArray(overrides.skippedSteps) ? [...overrides.skippedSteps] : [],
    ...(overrides.previewMode ? { previewMode: true } : {}),
    ...(overrides.startedAt ? { startedAt: overrides.startedAt } : {}),
    ...(overrides.completedAt ? { completedAt: overrides.completedAt } : {}),
  };
}

export const DEFAULT_PRESET_ILLUSTRATION_PROMPT =
  'Subtle editorial storybook watercolor spot illustration in the top-right corner on a clean solid #FAF6EE warm cream background for "{title}" ({description}). Delicate hand-painted matte botanical and literary charm, generous empty margin across bottom-left for seamless blending, zero text, zero borders.';

/** @type {readonly import('../types/models.js').BookCardMetaField[]} */
export const DEFAULT_BOOK_CARD_FIELDS = Object.freeze([
  'title',
  'author',
  'ageFormat',
  'usage',
]);

/** @type {readonly import('../types/models.js').BookCardMetaField[]} */
export const ALL_BOOK_CARD_FIELDS = Object.freeze([
  'title',
  'author',
  'year',
  'pages',
  'ageFormat',
  'usage',
]);

/** @type {readonly import('../types/models.js').BookCardSectionKey[]} */
export const VALID_BOOK_CARD_SECTIONS = Object.freeze([
  'library',
  'homeShelf',
  'homeSuggested',
  'rotations',
]);

const VALID_BOOK_CARD_SIZES = new Set(['compact', 'regular', 'large', 'custom']);
const VALID_BOOK_CARD_PLACEMENTS = new Set(['below', 'overlay', 'cover-only']);
const VALID_BOOK_CARD_FRAMES = new Set(['framed', 'borderless']);
/** @type {Set<string>} */
const VALID_BOOK_CARD_FIELDS_SET = new Set(ALL_BOOK_CARD_FIELDS);
/** @type {Set<string>} */
const VALID_BOOK_CARD_SECTIONS_SET = new Set(VALID_BOOK_CARD_SECTIONS);

/**
 * @param {unknown} rawSize
 * @returns {import('../types/models.js').BookCardSize}
 */
export function normalizeBookCardSize(rawSize) {
  const val = String(rawSize || '').trim().toLowerCase();
  if (VALID_BOOK_CARD_SIZES.has(val)) {
    return /** @type {import('../types/models.js').BookCardSize} */ (val);
  }
  return 'compact';
}

/**
 * @param {unknown} rawWidth
 * @returns {number}
 */
export function normalizeBookCardCustomWidth(rawWidth) {
  const num = Number(rawWidth);
  if (!Number.isFinite(num)) {
    return NUMERIC_BOUNDS.bookCardCustomWidthDefault;
  }
  return Math.max(
    NUMERIC_BOUNDS.bookCardCustomWidthMin,
    Math.min(NUMERIC_BOUNDS.bookCardCustomWidthMax, Math.round(num))
  );
}

/**
 * @param {unknown} rawPlacement
 * @returns {import('../types/models.js').BookCardInfoPlacement}
 */
export function normalizeBookCardInfoPlacement(rawPlacement) {
  const val = String(rawPlacement || '').trim().toLowerCase();
  if (VALID_BOOK_CARD_PLACEMENTS.has(val)) {
    return /** @type {import('../types/models.js').BookCardInfoPlacement} */ (val);
  }
  return 'below';
}

/**
 * @param {unknown} rawFrame
 * @returns {import('../types/models.js').BookCardFrame}
 */
export function normalizeBookCardFrame(rawFrame) {
  const val = String(rawFrame || '').trim().toLowerCase();
  if (VALID_BOOK_CARD_FRAMES.has(val)) {
    return /** @type {import('../types/models.js').BookCardFrame} */ (val);
  }
  return 'framed';
}

/**
 * @param {unknown} rawFields
 * @param {readonly import('../types/models.js').BookCardMetaField[]} [fallback]
 * @returns {import('../types/models.js').BookCardMetaField[]}
 */
export function normalizeBookCardFields(rawFields, fallback = DEFAULT_BOOK_CARD_FIELDS) {
  if (!Array.isArray(rawFields)) {
    return [...fallback];
  }
  const seen = new Set();
  /** @type {import('../types/models.js').BookCardMetaField[]} */
  const clean = [];
  for (const item of rawFields) {
    const val = String(item || '').trim();
    if (VALID_BOOK_CARD_FIELDS_SET.has(val) && !seen.has(val)) {
      seen.add(val);
      clean.push(/** @type {import('../types/models.js').BookCardMetaField} */ (val));
    }
  }
  return clean;
}

/**
 * @param {unknown} rawOverrides
 * @returns {Partial<Record<import('../types/models.js').BookCardSectionKey, import('../types/models.js').BookCardDisplayConfig>>}
 */
export function normalizeBookCardSectionOverrides(rawOverrides) {
  if (!rawOverrides || typeof rawOverrides !== 'object') return {};
  /** @type {Partial<Record<import('../types/models.js').BookCardSectionKey, import('../types/models.js').BookCardDisplayConfig>>} */
  const result = {};
  for (const [sectionKey, rawCfg] of Object.entries(rawOverrides)) {
    if (!VALID_BOOK_CARD_SECTIONS_SET.has(sectionKey) || !rawCfg || typeof rawCfg !== 'object') {
      continue;
    }
    const cfg = /** @type {Record<string, unknown>} */ (rawCfg);
    /** @type {import('../types/models.js').BookCardDisplayConfig} */
    const nextCfg = {};
    if (typeof cfg.size === 'string' && VALID_BOOK_CARD_SIZES.has(cfg.size)) {
      nextCfg.size = /** @type {import('../types/models.js').BookCardSize} */ (cfg.size);
    }
    if (cfg.customWidth !== undefined && cfg.customWidth !== null && Number.isFinite(Number(cfg.customWidth))) {
      nextCfg.customWidth = normalizeBookCardCustomWidth(cfg.customWidth);
    }
    if (typeof cfg.infoPlacement === 'string' && VALID_BOOK_CARD_PLACEMENTS.has(cfg.infoPlacement)) {
      nextCfg.infoPlacement = /** @type {import('../types/models.js').BookCardInfoPlacement} */ (
        cfg.infoPlacement
      );
    }
    if (typeof cfg.cardFrame === 'string' && VALID_BOOK_CARD_FRAMES.has(cfg.cardFrame)) {
      nextCfg.cardFrame = /** @type {import('../types/models.js').BookCardFrame} */ (
        cfg.cardFrame
      );
    }
    if (typeof cfg.showCoverOverlays === 'boolean') {
      nextCfg.showCoverOverlays = cfg.showCoverOverlays;
    }
    if (Array.isArray(cfg.fields)) {
      nextCfg.fields = normalizeBookCardFields(cfg.fields);
    }
    if (Object.keys(nextCfg).length > 0) {
      result[/** @type {import('../types/models.js').BookCardSectionKey} */ (sectionKey)] = nextCfg;
    }
  }
  return result;
}

/**
 * Resolves effective BookCoverCard display settings for a given section (or global defaults).
 *
 * @param {Partial<import('../types/models.js').AppSettings> | null | undefined} settings
 * @param {import('../types/models.js').BookCardSectionKey} [section]
 * @returns {{
 *   size: import('../types/models.js').BookCardSize,
 *   customWidth: number,
 *   infoPlacement: import('../types/models.js').BookCardInfoPlacement,
 *   cardFrame: import('../types/models.js').BookCardFrame,
 *   showCoverOverlays: boolean,
 *   fields: import('../types/models.js').BookCardMetaField[],
 *   aspectRatio: import('../types/models.js').CoverAspectRatio,
 *   hasCustomOverride: boolean,
 * }}
 */
export function resolveBookCardDisplayConfig(settings, section) {
  const globalSize = normalizeBookCardSize(settings?.bookCardSize);
  const globalCustomWidth = normalizeBookCardCustomWidth(settings?.bookCardCustomWidth);
  const globalPlacement = normalizeBookCardInfoPlacement(settings?.bookCardInfoPlacement);
  const globalFrame = normalizeBookCardFrame(settings?.bookCardFrame);
  const globalOverlays = settings?.showBookCoverOverlays !== false;
  const globalFields = Array.isArray(settings?.bookCardFields)
    ? normalizeBookCardFields(settings.bookCardFields)
    : [...DEFAULT_BOOK_CARD_FIELDS];
  const aspectRatio = settings?.coverAspectRatio === 'portrait' ? 'portrait' : 'square';

  const sectionOverride =
    section && settings?.bookCardSectionOverrides?.[section]
      ? settings.bookCardSectionOverrides[section]
      : undefined;

  return {
    size: sectionOverride?.size || globalSize,
    customWidth:
      sectionOverride?.customWidth !== undefined
        ? normalizeBookCardCustomWidth(sectionOverride.customWidth)
        : globalCustomWidth,
    infoPlacement: sectionOverride?.infoPlacement || globalPlacement,
    cardFrame: sectionOverride?.cardFrame || globalFrame,
    showCoverOverlays:
      typeof sectionOverride?.showCoverOverlays === 'boolean'
        ? sectionOverride.showCoverOverlays
        : globalOverlays,
    fields: Array.isArray(sectionOverride?.fields)
      ? normalizeBookCardFields(sectionOverride.fields)
      : globalFields,
    aspectRatio,
    hasCustomOverride: Boolean(sectionOverride && Object.keys(sectionOverride).length > 0),
  };
}

/**
 * Default safe settings object used for new installations and settings migrations.
 * @returns {import('../types/models.js').AppSettings}
 */
export function createDefaultAppSettings() {
  return {
    language: 'en',
    householdName: '',
    preferredBookTypes: [],
    onboarding: createDefaultOnboardingState({ status: 'completed', currentStep: 6 }),
    devModeUnlocked: false,
    showMiniWizards: true,
    theme: 'light',
    themePreset: 'bunko',
    bookDetailStyle: 'editorial',
    bookViewMode: 'grid',
    bookCardSize: 'compact',
    bookCardCustomWidth: NUMERIC_BOUNDS.bookCardCustomWidthDefault,
    bookCardInfoPlacement: 'below',
    bookCardFrame: 'framed',
    showBookCoverOverlays: true,
    bookCardFields: [...DEFAULT_BOOK_CARD_FIELDS],
    bookCardSectionOverrides: {},
    sidebarArtworkMode: 'theme',
    sidebarArtworkId: 'books-reading-lamp',
    sidebarArtworkStyle: 'integrated',
    sidebarDividerStyle: 'laurel',
    onboardingLandingMode: 'slideshow',
    nativeAppStyle: true,
    translucentTopBar: true,
    translucentBottomBar: true,
    bottomNavStyle: 'floating',
    bookCardShadow: 'subtle',
    notificationsEnabled: false,
    coverAspectRatio: 'square',
    dynamicCoverTint: true,
    dynamicCoverTintStyle: 'circular',
    dynamicCoverTintBehavior: 'fixed',
    dynamicCoverTintMode: 'prominent',
    dynamicCoverTintCircularFade: 310,
    dynamicCoverTintLinearFade: 92,
    showPresetDecorations: true,
    presetCornerArtSize: 'sm',
    presetIllustrationPromptTemplate: DEFAULT_PRESET_ILLUSTRATION_PROMPT,
    presetAlertDaysBefore: NUMERIC_BOUNDS.presetAlertDaysBeforeDefault,
    presetAlertDaysAfter: NUMERIC_BOUNDS.presetAlertDaysAfterDefault,
    enableRotationHistoryInsights: true,
    showCoverUsageAdornos: true,
    enableStaleBookSpotlight: true,
    staleBookDays: NUMERIC_BOUNDS.staleBookDaysDefault,
    preferredScanMode: 'barcode',
    enabledMetadataProviders: ['google-books', 'open-library'],
    retainRawProviderPayloads: false,
    searchWhileTyping: false,
    autoLocalTagging: true,
    aiEnrichmentOptIn: false,
    aiAdapterId: 'local-rules',
    aiEndpointUrl: '',
    aiTimeoutMs: NUMERIC_BOUNDS.aiTimeoutDefaultMs,
    llmProvider: 'server-gemini',
    llmModel: 'gemini-2.5-flash',
    llmCloudflareUrl: '',
    llmBaseUrl: '',
    llmApiKey: '',
    llmCustomPromptHint: '',
    enabledGiftStores: ['bookshop', 'amazon'],
    amazonDomain: 'amazon.com',
    customGiftStoreName: '',
    customGiftStoreUrl: '',
  };
}

const VALID_SIDEBAR_DIVIDER_STYLES = new Set([
  'line',
  'laurel',
  'folio',
  'japanese',
  'minimal',
  'random',
]);

/**
 * Normalizes persisted or user-selected sidebar divider styles, seamlessly migrating legacy `'illustration'` to `'laurel'`.
 * @param {unknown} raw
 * @returns {import('../types/models.js').SidebarDividerStyle}
 */
export function normalizeSidebarDividerStyle(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'illustration') return 'laurel';
  if (VALID_SIDEBAR_DIVIDER_STYLES.has(val)) {
    return /** @type {import('../types/models.js').SidebarDividerStyle} */ (val);
  }
  return 'laurel';
}

/**
 * Normalizes mobile bottom navigation geometry ('floating' | 'full').
 * @param {unknown} raw
 * @returns {import('../types/models.js').BottomNavStyle}
 */
export function normalizeBottomNavStyle(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'full') return 'full';
  return 'floating';
}

/**
 * Normalizes book card shadow elevation preset ('none' | 'subtle' | 'elevated').
 * @param {unknown} raw
 * @returns {import('../types/models.js').BookCardShadowMode}
 */
export function normalizeBookCardShadow(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'none' || val === 'elevated' || val === 'subtle') {
    return /** @type {import('../types/models.js').BookCardShadowMode} */ (val);
  }
  return 'subtle';
}
