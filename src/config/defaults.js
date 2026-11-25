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
    showBookDescription: true,
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
    homeActiveRotationStyle: 'card',
    matchingWeights: createDefaultMatchingWeights(),
    taggingRules: createDefaultTaggingRulesConfig(),
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

/**
 * Normalizes Home active rotation card vs seamless presentation ('card' | 'seamless').
 * @param {unknown} raw
 * @returns {import('../types/models.js').HomeActiveRotationStyle}
 */
export function normalizeHomeActiveRotationStyle(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'seamless') return 'seamless';
  return 'card';
}

/** @type {import('../types/models.js').MatchingWeightsConfig} */
export const DEFAULT_MATCHING_WEIGHTS = Object.freeze({
  profile: Object.freeze({
    exactAge: 36,
    nearAge: 20,
    outOfAge: 4,
    readingStage: 18,
    favoriteTopicPerMatch: 14,
    favoriteTopicMax: 36,
    unreadBonus: 16,
    offCooldownBonus: 22,
    neverRotatedBonus: 12,
    cooldownPenalty: -25,
    lovedBonus: 8,
  }),
  similarity: Object.freeze({
    sharedAuthor: 26,
    sharedTag: 22,
    sharedTagMaxCount: 3,
    sameStage: 10,
    ageOverlap: 6,
    unreadBonus: 8,
    offCooldownBonus: 6,
    cooldownPenalty: -14,
    diversityPenalty: -8,
  }),
  rotation: Object.freeze({
    base: 20,
    exactAge: 32,
    nearAge: 16,
    outOfAgePenalty: -18,
    readingStage: 16,
    preferredTagPerMatch: 12,
    preferredTagMax: 30,
    objectiveFormatMatch: 26,
    objectiveFormatMismatch: -10,
    objectiveStageMatch: 14,
    objectiveKeywordPerHit: 16,
    objectiveKeywordMax: 36,
    offCooldownBonus: 14,
    neverRotatedBonus: 10,
    cooldownPenalty: -45,
    unreadBonus: 6,
    lovedBonus: 10,
    repeatedAuthorPenalty: -22,
    repeatedTagPenalty: -10,
  }),
});

/**
 * Returns a fresh deep copy of default matching weights.
 * @returns {import('../types/models.js').MatchingWeightsConfig}
 */
export function createDefaultMatchingWeights() {
  return {
    profile: { ...DEFAULT_MATCHING_WEIGHTS.profile },
    similarity: { ...DEFAULT_MATCHING_WEIGHTS.similarity },
    rotation: { ...DEFAULT_MATCHING_WEIGHTS.rotation },
  };
}

/**
 * @param {unknown} rawVal
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampWeightNumber(rawVal, fallback, min, max) {
  if (rawVal === undefined || rawVal === null || rawVal === '') return fallback;
  const num = Number(rawVal);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

/**
 * Normalizes and bounds custom matching/similarity/rotation scoring weights.
 * @param {unknown} raw
 * @returns {import('../types/models.js').MatchingWeightsConfig}
 */
export function normalizeMatchingWeights(raw) {
  const defaults = DEFAULT_MATCHING_WEIGHTS;
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, any>} */ (raw) : {};
  const p = src.profile && typeof src.profile === 'object' ? src.profile : {};
  const s = src.similarity && typeof src.similarity === 'object' ? src.similarity : {};
  const r = src.rotation && typeof src.rotation === 'object' ? src.rotation : {};

  return {
    profile: {
      exactAge: clampWeightNumber(p.exactAge, defaults.profile.exactAge, 0, 100),
      nearAge: clampWeightNumber(p.nearAge, defaults.profile.nearAge, 0, 100),
      outOfAge: clampWeightNumber(p.outOfAge, defaults.profile.outOfAge, -50, 50),
      readingStage: clampWeightNumber(p.readingStage, defaults.profile.readingStage, 0, 100),
      favoriteTopicPerMatch: clampWeightNumber(p.favoriteTopicPerMatch, defaults.profile.favoriteTopicPerMatch, 0, 50),
      favoriteTopicMax: clampWeightNumber(p.favoriteTopicMax, defaults.profile.favoriteTopicMax, 0, 150),
      unreadBonus: clampWeightNumber(p.unreadBonus, defaults.profile.unreadBonus, 0, 60),
      offCooldownBonus: clampWeightNumber(p.offCooldownBonus, defaults.profile.offCooldownBonus, 0, 60),
      neverRotatedBonus: clampWeightNumber(p.neverRotatedBonus, defaults.profile.neverRotatedBonus, 0, 60),
      cooldownPenalty: clampWeightNumber(p.cooldownPenalty, defaults.profile.cooldownPenalty, -120, 0),
      lovedBonus: clampWeightNumber(p.lovedBonus, defaults.profile.lovedBonus, 0, 60),
    },
    similarity: {
      sharedAuthor: clampWeightNumber(s.sharedAuthor, defaults.similarity.sharedAuthor, 0, 100),
      sharedTag: clampWeightNumber(s.sharedTag, defaults.similarity.sharedTag, 0, 100),
      sharedTagMaxCount: clampWeightNumber(s.sharedTagMaxCount, defaults.similarity.sharedTagMaxCount, 1, 8),
      sameStage: clampWeightNumber(s.sameStage, defaults.similarity.sameStage, 0, 60),
      ageOverlap: clampWeightNumber(s.ageOverlap, defaults.similarity.ageOverlap, 0, 60),
      unreadBonus: clampWeightNumber(s.unreadBonus, defaults.similarity.unreadBonus, 0, 60),
      offCooldownBonus: clampWeightNumber(s.offCooldownBonus, defaults.similarity.offCooldownBonus, 0, 60),
      cooldownPenalty: clampWeightNumber(s.cooldownPenalty, defaults.similarity.cooldownPenalty, -120, 0),
      diversityPenalty: clampWeightNumber(s.diversityPenalty, defaults.similarity.diversityPenalty, -60, 0),
    },
    rotation: {
      base: clampWeightNumber(r.base, defaults.rotation.base, 0, 100),
      exactAge: clampWeightNumber(r.exactAge, defaults.rotation.exactAge, 0, 100),
      nearAge: clampWeightNumber(r.nearAge, defaults.rotation.nearAge, 0, 100),
      outOfAgePenalty: clampWeightNumber(r.outOfAgePenalty, defaults.rotation.outOfAgePenalty, -100, 0),
      readingStage: clampWeightNumber(r.readingStage, defaults.rotation.readingStage, 0, 100),
      preferredTagPerMatch: clampWeightNumber(r.preferredTagPerMatch, defaults.rotation.preferredTagPerMatch, 0, 50),
      preferredTagMax: clampWeightNumber(r.preferredTagMax, defaults.rotation.preferredTagMax, 0, 150),
      objectiveFormatMatch: clampWeightNumber(r.objectiveFormatMatch, defaults.rotation.objectiveFormatMatch, 0, 100),
      objectiveFormatMismatch: clampWeightNumber(r.objectiveFormatMismatch, defaults.rotation.objectiveFormatMismatch, -100, 0),
      objectiveStageMatch: clampWeightNumber(r.objectiveStageMatch, defaults.rotation.objectiveStageMatch, 0, 60),
      objectiveKeywordPerHit: clampWeightNumber(r.objectiveKeywordPerHit, defaults.rotation.objectiveKeywordPerHit, 0, 50),
      objectiveKeywordMax: clampWeightNumber(r.objectiveKeywordMax, defaults.rotation.objectiveKeywordMax, 0, 150),
      offCooldownBonus: clampWeightNumber(r.offCooldownBonus, defaults.rotation.offCooldownBonus, 0, 60),
      neverRotatedBonus: clampWeightNumber(r.neverRotatedBonus, defaults.rotation.neverRotatedBonus, 0, 60),
      cooldownPenalty: clampWeightNumber(r.cooldownPenalty, defaults.rotation.cooldownPenalty, -150, 0),
      unreadBonus: clampWeightNumber(r.unreadBonus, defaults.rotation.unreadBonus, 0, 60),
      lovedBonus: clampWeightNumber(r.lovedBonus, defaults.rotation.lovedBonus, 0, 60),
      repeatedAuthorPenalty: clampWeightNumber(r.repeatedAuthorPenalty, defaults.rotation.repeatedAuthorPenalty, -100, 0),
      repeatedTagPenalty: clampWeightNumber(r.repeatedTagPenalty, defaults.rotation.repeatedTagPenalty, -80, 0),
    },
  };
}

/** @type {import('../types/models.js').TaggingRulesConfig} */
export const DEFAULT_TAGGING_RULES_CONFIG = Object.freeze({
  disabledBuiltInTags: /** @type {string[]} */ ([]),
  extraKeywordsByTag: /** @type {Record<string, string[]>} */ ({}),
  customRules: /** @type {import('../types/models.js').CustomTagRule[]} */ ([]),
  extraNoiseWords: /** @type {string[]} */ ([]),
});

/**
 * Returns a fresh copy of default tagging rules customization config.
 * @returns {import('../types/models.js').TaggingRulesConfig}
 */
export function createDefaultTaggingRulesConfig() {
  return {
    disabledBuiltInTags: [],
    extraKeywordsByTag: {},
    customRules: [],
    extraNoiseWords: [],
  };
}

/**
 * Sanitizes a list of tag rule keywords cleanly.
 * @param {unknown} rawList
 * @returns {string[]}
 */
function sanitizeKeywordList(rawList) {
  const arr = Array.isArray(rawList)
    ? rawList
    : typeof rawList === 'string'
      ? rawList.split(/[,\n]/)
      : [];
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of arr) {
    const clean = String(item || '').trim().toLowerCase().slice(0, 48);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 60) break;
  }
  return out;
}

/**
 * Normalizes a tag slug for custom/override rule keys (`a-z0-9-`, 2..24 chars).
 * @param {unknown} rawTag
 * @returns {string}
 */
function normalizeRuleTagSlug(rawTag) {
  return String(rawTag || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

/**
 * Normalizes user-customized local tagging rules config.
 * @param {unknown} raw
 * @returns {import('../types/models.js').TaggingRulesConfig}
 */
export function normalizeTaggingRulesConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return createDefaultTaggingRulesConfig();
  }
  const src = /** @type {Record<string, any>} */ (raw);

  const disabledBuiltInTags = Array.isArray(src.disabledBuiltInTags)
    ? Array.from(
        new Set(
          src.disabledBuiltInTags
            .map((t) => normalizeRuleTagSlug(t))
            .filter(Boolean)
        )
      )
    : [];

  /** @type {Record<string, string[]>} */
  const extraKeywordsByTag = {};
  if (src.extraKeywordsByTag && typeof src.extraKeywordsByTag === 'object') {
    for (const [rawTag, rawKeywords] of Object.entries(src.extraKeywordsByTag)) {
      const slug = normalizeRuleTagSlug(rawTag);
      if (!slug) continue;
      const keywords = sanitizeKeywordList(rawKeywords);
      if (keywords.length > 0) {
        extraKeywordsByTag[slug] = keywords;
      }
    }
  }

  /** @type {import('../types/models.js').CustomTagRule[]} */
  const customRules = [];
  const seenCustom = new Set();
  if (Array.isArray(src.customRules)) {
    for (const item of src.customRules) {
      if (!item || typeof item !== 'object') continue;
      const slug = normalizeRuleTagSlug(item.tag);
      const keywords = sanitizeKeywordList(item.keywords);
      if (!slug || slug.length < 2 || keywords.length === 0 || seenCustom.has(slug)) continue;
      seenCustom.add(slug);
      customRules.push({ tag: slug, keywords });
      if (customRules.length >= 40) break;
    }
  }

  const extraNoiseWords = sanitizeKeywordList(src.extraNoiseWords);

  return {
    disabledBuiltInTags,
    extraKeywordsByTag,
    customRules,
    extraNoiseWords,
  };
}

