/**
 * @fileoverview Resilient client-side storage engine using IndexedDB as primary store
 * with automatic localStorage and in-memory fallbacks for restricted browser contexts.
 */

import {
  CURRENT_SCHEMA_VERSION,
  getEffectiveProfileAge,
  normalizeBirthDate,
} from '../types/models.js';
import { createSeedState } from '../data/seed.js';
import { normalizeRotationPresetInput } from '../features/rotations/rotation-presets.js';
import {
  DEFAULT_DARK_THEME_PRESET,
  DEFAULT_LIGHT_THEME_PRESET,
  DEFAULT_PRESET_ILLUSTRATION_PROMPT,
  NUMERIC_BOUNDS,
  detectDeviceLanguage,
  normalizeBookCardCustomWidth,
  normalizeBookCardFields,
  normalizeBookCardFrame,
  normalizeBookCardInfoPlacement,
  normalizeBookCardSectionOverrides,
  normalizeBookCardShadow,
  normalizeBookCardSize,
  normalizeBottomNavStyle,
  normalizeDiscoverySettings,
  normalizeHomeActiveRotationStyle,
  normalizeLanguage,
  normalizeMatchingWeights,
  normalizeSidebarDividerStyle,
  normalizeTaggingRulesConfig,
  normalizeThemePresetId,
} from '../config/index.js';

const DB_NAME = 'library_rotation_db';
const DB_VERSION = 2;
const STORE_NAME = 'app_state';
const AUDIO_STORE_NAME = 'audio_blobs';
const RECORD_KEY = 'primary_v1';
const LOCAL_STORAGE_KEY = 'library_rotation_state_v1';
export const QA_SNAPSHOT_STORAGE_KEY = 'lr_qa_existing_user_snapshot_v1';

/** @type {Map<string, any>} */
const memoryAudioBlobs = new Map();

const AUXILIARY_STORAGE_KEYS = [
  'lr_theme_pref',
  'lr_theme_preset',
  'lr_card_shadow',
  'lr_sidebar_collapsed',
  'lr_dismissed_swap_reminders_v1',
  'lr_dismissed_preset_alerts_v1',
  'lr_dismissed_stale_spotlights_v1',
  'lr_device_books_proxy_v1',
  'lr_device_google_books_api_key_v1',
  'lr_welcome_books_modal_dismissed_v1',
];

/** @type {string | null} */
let memoryQaSnapshotJson = null;

/**
 * Validates whether an arbitrary parsed object satisfies the structural AppState contract.
 * Zero-profile states are accepted only when onboarding is explicitly pending, in progress, or skipped.
 * @param {unknown} candidate
 * @returns {candidate is import('../types/models.js').AppState}
 */
export function isValidAppState(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (candidate);
  const settingsObj =
    obj.settings && typeof obj.settings === 'object'
      ? /** @type {Record<string, unknown>} */ (obj.settings)
      : null;
  const onboardingObj =
    settingsObj?.onboarding && typeof settingsObj.onboarding === 'object'
      ? /** @type {Record<string, unknown>} */ (settingsObj.onboarding)
      : null;
  const onboardingStatus = onboardingObj?.status;
  const allowZeroProfiles =
    onboardingStatus === 'pending' ||
    onboardingStatus === 'in_progress' ||
    onboardingStatus === 'skipped';

  return (
    typeof obj.schemaVersion === 'number' &&
    typeof obj.activeProfileId === 'string' &&
    Array.isArray(obj.profiles) &&
    (obj.profiles.length > 0 || allowZeroProfiles) &&
    Array.isArray(obj.books) &&
    Array.isArray(obj.rotations) &&
    Boolean(settingsObj)
  );
}

export const DEFAULT_METADATA_PROVIDERS = ['google-books', 'open-library'];

/**
 * Normalizes onboarding progress metadata, preserving existing users as `'completed'`.
 * @param {unknown} rawOnboarding
 * @param {{ hasExistingData?: boolean }} [opts]
 * @returns {import('../types/models.js').OnboardingProgressState}
 */
export function normalizeOnboardingState(rawOnboarding, { hasExistingData = false } = {}) {
  const validStatuses = new Set(['pending', 'in_progress', 'completed', 'skipped']);
  if (!rawOnboarding || typeof rawOnboarding !== 'object') {
    return hasExistingData
      ? {
          status: 'completed',
          currentStep: 6,
          completedSteps: [],
          skippedSteps: [],
        }
      : {
          status: 'pending',
          currentStep: 0,
          completedSteps: [],
          skippedSteps: [],
        };
  }

  const raw = /** @type {Record<string, unknown>} */ (rawOnboarding);
  const status = validStatuses.has(String(raw.status))
    ? /** @type {import('../types/models.js').OnboardingStatus} */ (String(raw.status))
    : hasExistingData
      ? 'completed'
      : 'pending';

  const parsedStep = Number(raw.currentStep);
  const currentStep = Number.isFinite(parsedStep)
    ? Math.max(0, Math.min(6, Math.trunc(parsedStep)))
    : status === 'completed'
      ? 6
      : 0;

  const sanitizeStepList = (/** @type {unknown} */ input) =>
    Array.isArray(input)
      ? Array.from(
          new Set(
            input
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
          )
        )
      : [];

  return {
    status,
    currentStep,
    completedSteps: sanitizeStepList(raw.completedSteps),
    skippedSteps: sanitizeStepList(raw.skippedSteps),
    ...(raw.previewMode ? { previewMode: true } : {}),
    ...(typeof raw.startedAt === 'string' && raw.startedAt ? { startedAt: raw.startedAt } : {}),
    ...(typeof raw.completedAt === 'string' && raw.completedAt
      ? { completedAt: raw.completedAt }
      : {}),
  };
}

/**
 * Formats a byte count into a concise human-readable memory string (`840 B`, `42.6 KB`, `1.4 MB`).
 * @param {number} bytes
 * @returns {string}
 */
export function formatStorageBytes(bytes) {
  const safe = Math.max(0, Math.trunc(Number(bytes) || 0));
  if (safe < 1024) return `${safe} B`;
  const kb = safe / 1024;
  if (kb < 1024) {
    return `${kb >= 100 ? Math.round(kb) : kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

/**
 * Deterministically computes the UTF-8 memory/storage footprint of the current app state
 * (including any inline `data:image/` cover photos and device preference keys).
 * @param {import('../types/models.js').AppState} state
 * @returns {{
 *   stateBytes: number,
 *   auxBytes: number,
 *   totalBytes: number,
 *   coverDataUrlBytes: number,
 *   formatted: string
 * }}
 */
export function estimateAppStorageUsage(state) {
  let stateBytes = 0;
  try {
    const serialized = JSON.stringify(state || {});
    stateBytes =
      typeof TextEncoder !== 'undefined'
        ? new TextEncoder().encode(serialized).length
        : serialized.length;
  } catch (_) {
    stateBytes = 0;
  }

  let coverDataUrlBytes = 0;
  if (state && Array.isArray(state.books)) {
    for (const book of state.books) {
      if (typeof book.coverUrl === 'string' && book.coverUrl.startsWith('data:image/')) {
        coverDataUrlBytes += book.coverUrl.length;
      }
    }
  }

  let auxBytes = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      for (const key of AUXILIARY_STORAGE_KEYS) {
        const val = localStorage.getItem(key);
        if (typeof val === 'string') {
          auxBytes += key.length + val.length;
        }
      }
    }
  } catch (_) {
    auxBytes = 0;
  }

  const totalBytes = stateBytes + auxBytes;
  return {
    stateBytes,
    auxBytes,
    totalBytes,
    coverDataUrlBytes,
    formatted: formatStorageBytes(totalBytes),
  };
}

/**
 * Inspects IndexedDB audio blobs, inline cover photos, catalog metadata, local preferences,
 * and browser cache storage to produce a detailed category breakdown.
 * Safe in non-browser/Node test environments.
 * @param {import('../types/models.js').AppState} state
 * @returns {Promise<{
 *   coverPhotoBytes: number,
 *   coverPhotoCount: number,
 *   audioBytes: number,
 *   audioClipCount: number,
 *   customPresetArtBytes: number,
 *   catalogMetadataBytes: number,
 *   auxLocalStorageBytes: number,
 *   totalAppBytes: number,
 *   cacheNames: string[],
 *   browserUsageBytes: number | null,
 *   browserQuotaBytes: number | null
 * }>}
 */
export async function getDetailedStorageBreakdown(state) {
  const base = estimateAppStorageUsage(state);

  let coverPhotoCount = 0;
  if (state && Array.isArray(state.books)) {
    for (const book of state.books) {
      if (typeof book.coverUrl === 'string' && book.coverUrl.startsWith('data:image/')) {
        coverPhotoCount += 1;
      }
    }
  }

  let customPresetArtBytes = 0;
  if (state && Array.isArray(state.customPresets)) {
    for (const p of state.customPresets) {
      if (typeof p?.illustrationUrl === 'string' && p.illustrationUrl.startsWith('data:image/')) {
        customPresetArtBytes += p.illustrationUrl.length;
      }
    }
  }
  if (state && state.presetOverrides && typeof state.presetOverrides === 'object') {
    for (const p of Object.values(state.presetOverrides)) {
      if (typeof p?.illustrationUrl === 'string' && p.illustrationUrl.startsWith('data:image/')) {
        customPresetArtBytes += p.illustrationUrl.length;
      }
    }
  }

  let audioBytes = 0;
  let audioClipCount = 0;
  try {
    const db = await openIndexedDb();
    const idbStats = await new Promise((resolve) => {
      try {
        const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
        const store = tx.objectStore(AUDIO_STORE_NAME);
        const req = store.openCursor();
        let bytes = 0;
        let count = 0;
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            count += 1;
            const val = cursor.value;
            if (val && typeof val.size === 'number') {
              bytes += val.size;
            }
            cursor.continue();
          } else {
            resolve({ bytes, count });
          }
        };
        req.onerror = () => resolve({ bytes: 0, count: 0 });
      } catch (_) {
        resolve({ bytes: 0, count: 0 });
      }
    });
    db.close();
    audioBytes = idbStats.bytes;
    audioClipCount = idbStats.count;
  } catch (_) {
    // Fallback to memoryAudioBlobs
    for (const blob of memoryAudioBlobs.values()) {
      audioClipCount += 1;
      if (blob && typeof blob.size === 'number') {
        audioBytes += blob.size;
      }
    }
  }

  if (audioClipCount === 0 && memoryAudioBlobs.size > 0) {
    for (const blob of memoryAudioBlobs.values()) {
      audioClipCount += 1;
      if (blob && typeof blob.size === 'number') {
        audioBytes += blob.size;
      }
    }
  }

  const catalogMetadataBytes = Math.max(
    0,
    base.stateBytes - base.coverDataUrlBytes - customPresetArtBytes
  );
  const totalAppBytes = base.totalBytes + audioBytes;

  /** @type {string[]} */
  let cacheNames = [];
  try {
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      cacheNames = await caches.keys();
    }
  } catch (_) {}

  let browserUsageBytes = null;
  let browserQuotaBytes = null;
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const est = await navigator.storage.estimate();
      if (typeof est.usage === 'number') browserUsageBytes = est.usage;
      if (typeof est.quota === 'number') browserQuotaBytes = est.quota;
    }
  } catch (_) {}

  return {
    coverPhotoBytes: base.coverDataUrlBytes,
    coverPhotoCount,
    audioBytes,
    audioClipCount,
    customPresetArtBytes,
    catalogMetadataBytes,
    auxLocalStorageBytes: base.auxBytes,
    totalAppBytes,
    cacheNames,
    browserUsageBytes,
    browserQuotaBytes,
  };
}

/**
 * Creates a fresh copy of safe privacy-first provider & appearance settings.
 * @param {Partial<import('../types/models.js').AppSettings>} [overrides]
 * @returns {import('../types/models.js').AppSettings}
 */
export function createSafeDefaultSettings(overrides = {}) {
  const rawProviders = Array.isArray(overrides.enabledMetadataProviders)
    ? overrides.enabledMetadataProviders.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : DEFAULT_METADATA_PROVIDERS;

  const rawTimeout = Number(overrides.aiTimeoutMs);
  const clampedTimeout =
    Number.isFinite(rawTimeout) && rawTimeout >= 1500 && rawTimeout <= 20000
      ? Math.trunc(rawTimeout)
      : 6000;

  const rawBefore =
    overrides.presetAlertDaysBefore !== undefined && overrides.presetAlertDaysBefore !== null
      ? Number(overrides.presetAlertDaysBefore)
      : 2;
  const clampedBefore = Number.isFinite(rawBefore)
    ? Math.max(0, Math.min(30, Math.trunc(rawBefore)))
    : 2;

  const rawAfter =
    overrides.presetAlertDaysAfter !== undefined && overrides.presetAlertDaysAfter !== null
      ? Number(overrides.presetAlertDaysAfter)
      : 5;
  const clampedAfter = Number.isFinite(rawAfter)
    ? Math.max(0, Math.min(30, Math.trunc(rawAfter)))
    : 5;

    const rawStaleDays =
      overrides.staleBookDays !== undefined && overrides.staleBookDays !== null
        ? Number(overrides.staleBookDays)
        : NUMERIC_BOUNDS.staleBookDaysDefault;
    const clampedStaleDays = Number.isFinite(rawStaleDays)
      ? Math.max(
          NUMERIC_BOUNDS.staleBookDaysMin,
          Math.min(NUMERIC_BOUNDS.staleBookDaysMax, Math.trunc(rawStaleDays))
        )
      : NUMERIC_BOUNDS.staleBookDaysDefault;

    const cleanHouseholdName =
      typeof overrides.householdName === 'string'
        ? overrides.householdName.trim().slice(0, 80)
        : '';

    const cleanPromptTemplate =
      typeof overrides.presetIllustrationPromptTemplate === 'string' &&
      overrides.presetIllustrationPromptTemplate.trim()
        ? overrides.presetIllustrationPromptTemplate.trim().slice(0, 600)
        : DEFAULT_PRESET_ILLUSTRATION_PROMPT;

    return {
      language: normalizeLanguage(overrides.language),
      householdName: cleanHouseholdName,
      preferredBookTypes: Array.isArray(overrides.preferredBookTypes)
        ? Array.from(new Set(overrides.preferredBookTypes.map((v) => String(v).trim()).filter(Boolean)))
        : [],
      ...(overrides.onboarding
        ? {
            onboarding: normalizeOnboardingState(overrides.onboarding, {
              hasExistingData: false,
            }),
          }
        : {}),
      devModeUnlocked: Boolean(overrides.devModeUnlocked),
      showMiniWizards: overrides.showMiniWizards !== false,
      theme: overrides.theme || 'light',
      themePreset:
        normalizeThemePresetId(overrides.themePreset) ||
        (overrides.theme === 'dark' ? DEFAULT_DARK_THEME_PRESET : DEFAULT_LIGHT_THEME_PRESET),
      bookDetailStyle: overrides.bookDetailStyle === 'compact' ? 'compact' : 'editorial',
      showBookDescription: overrides.showBookDescription !== false,
      bookViewMode: overrides.bookViewMode === 'list' ? 'list' : 'grid',
      bookCardSize: normalizeBookCardSize(overrides.bookCardSize),
      bookCardCustomWidth: normalizeBookCardCustomWidth(overrides.bookCardCustomWidth),
      bookCardInfoPlacement: normalizeBookCardInfoPlacement(overrides.bookCardInfoPlacement),
      bookCardFrame: normalizeBookCardFrame(overrides.bookCardFrame),
      showBookCoverOverlays: overrides.showBookCoverOverlays !== false,
      bookCardFields: normalizeBookCardFields(overrides.bookCardFields),
      bookCardSectionOverrides: normalizeBookCardSectionOverrides(
        overrides.bookCardSectionOverrides
      ),
      sidebarArtworkMode:
        overrides.sidebarArtworkMode === 'engraving' ||
        overrides.sidebarArtworkMode === 'illustration' ||
        overrides.sidebarArtworkMode === 'none'
          ? overrides.sidebarArtworkMode
          : 'theme',
      sidebarArtworkId:
        typeof overrides.sidebarArtworkId === 'string' && overrides.sidebarArtworkId.trim()
          ? overrides.sidebarArtworkId.trim().toLowerCase()
          : 'books-reading-lamp',
      sidebarArtworkStyle:
        overrides.sidebarArtworkStyle === 'natural' || overrides.sidebarArtworkStyle === 'muted'
          ? overrides.sidebarArtworkStyle
          : 'integrated',
      sidebarDividerStyle: normalizeSidebarDividerStyle(overrides.sidebarDividerStyle),
      onboardingLandingMode: overrides.onboardingLandingMode === 'compact' ? 'compact' : 'slideshow',
      nativeAppStyle: overrides.nativeAppStyle !== false,
      translucentTopBar:
        typeof overrides.translucentTopBar === 'boolean'
          ? overrides.translucentTopBar
          : overrides.nativeAppStyle !== false,
      translucentBottomBar:
        typeof overrides.translucentBottomBar === 'boolean'
          ? overrides.translucentBottomBar
          : overrides.nativeAppStyle !== false,
      bottomNavStyle: normalizeBottomNavStyle(overrides.bottomNavStyle),
      bookCardShadow: normalizeBookCardShadow(overrides.bookCardShadow),
      notificationsEnabled: Boolean(overrides.notificationsEnabled),
      coverAspectRatio: overrides.coverAspectRatio === 'portrait' ? 'portrait' : 'square',
      dynamicCoverTint: overrides.dynamicCoverTint !== false,
      dynamicCoverTintAccent: Boolean(overrides.dynamicCoverTintAccent),
      dynamicCoverTintStyle: overrides.dynamicCoverTintStyle === 'linear' ? 'linear' : 'circular',
      dynamicCoverTintBehavior: overrides.dynamicCoverTintBehavior === 'scroll' ? 'scroll' : 'fixed',
      dynamicCoverTintMode:
        overrides.dynamicCoverTintMode === 'dominant' || overrides.dynamicCoverTintMode === 'soft'
          ? overrides.dynamicCoverTintMode
          : 'prominent',
      dynamicCoverTintCircularFade: (() => {
        const raw = Number(overrides.dynamicCoverTintCircularFade);
        return Number.isFinite(raw) ? Math.max(180, Math.min(520, Math.round(raw))) : 310;
      })(),
      dynamicCoverTintLinearFade: (() => {
        const raw = Number(overrides.dynamicCoverTintLinearFade);
        return Number.isFinite(raw) ? Math.max(35, Math.min(100, Math.round(raw))) : 92;
      })(),
      retainRawProviderPayloads: Boolean(overrides.retainRawProviderPayloads),
      searchWhileTyping: Boolean(overrides.searchWhileTyping),
      enabledMetadataProviders:
        rawProviders.length > 0 ? Array.from(new Set(rawProviders)) : [...DEFAULT_METADATA_PROVIDERS],
      autoLocalTagging: overrides.autoLocalTagging !== false,
      autoInferAgeRange: Boolean(overrides.autoInferAgeRange),
      aiEnrichmentOptIn: Boolean(overrides.aiEnrichmentOptIn),
      aiAdapterId:
        typeof overrides.aiAdapterId === 'string' && overrides.aiAdapterId.trim()
          ? overrides.aiAdapterId.trim()
          : 'browser-prompt-api',
      aiEndpointUrl:
        typeof overrides.aiEndpointUrl === 'string' ? overrides.aiEndpointUrl.trim() : '',
      aiTimeoutMs: clampedTimeout,
      preferredScanMode: overrides.preferredScanMode || 'barcode',
      presetAlertDaysBefore: clampedBefore,
      presetAlertDaysAfter: clampedAfter,
      showPresetDecorations: overrides.showPresetDecorations !== false,
      presetCornerArtSize:
        overrides.presetCornerArtSize === 'md' || overrides.presetCornerArtSize === 'lg'
          ? overrides.presetCornerArtSize
          : 'sm',
      presetIllustrationPromptTemplate: cleanPromptTemplate,
      enableRotationHistoryInsights: overrides.enableRotationHistoryInsights !== false,
      showCoverUsageAdornos: overrides.showCoverUsageAdornos !== false,
      enableStaleBookSpotlight: overrides.enableStaleBookSpotlight !== false,
      staleBookDays: clampedStaleDays,
      llmProvider:
        overrides.llmProvider === 'cloudflare-worker' ||
        overrides.llmProvider === 'byok-gemini' ||
        overrides.llmProvider === 'byok-openai'
          ? overrides.llmProvider
          : 'server-gemini',
      llmModel:
        typeof overrides.llmModel === 'string' && overrides.llmModel.trim()
          ? overrides.llmModel.trim()
          : 'gemini-2.5-flash',
      llmCloudflareUrl:
        typeof overrides.llmCloudflareUrl === 'string' ? overrides.llmCloudflareUrl.trim() : '',
      llmBaseUrl: typeof overrides.llmBaseUrl === 'string' ? overrides.llmBaseUrl.trim() : '',
      llmApiKey: typeof overrides.llmApiKey === 'string' ? overrides.llmApiKey.trim() : '',
      llmCustomPromptHint:
        typeof overrides.llmCustomPromptHint === 'string' ? overrides.llmCustomPromptHint.trim() : '',
      enabledGiftStores: Array.isArray(overrides.enabledGiftStores)
        ? Array.from(
            new Set(
              overrides.enabledGiftStores.filter((id) => id === 'bookshop' || id === 'amazon')
            )
          )
        : ['bookshop', 'amazon'],
      amazonDomain:
        typeof overrides.amazonDomain === 'string' &&
        [
          'amazon.com',
          'amazon.co.uk',
          'amazon.es',
          'amazon.it',
          'amazon.de',
          'amazon.fr',
          'amazon.ca',
        ].includes(overrides.amazonDomain.trim().toLowerCase())
          ? overrides.amazonDomain.trim().toLowerCase()
          : 'amazon.com',
      customGiftStoreName:
        typeof overrides.customGiftStoreName === 'string'
          ? overrides.customGiftStoreName.trim().slice(0, 60)
          : '',
      customGiftStoreUrl:
        typeof overrides.customGiftStoreUrl === 'string'
          ? overrides.customGiftStoreUrl.trim().slice(0, 300)
          : '',
      homeActiveRotationStyle: normalizeHomeActiveRotationStyle(overrides.homeActiveRotationStyle),
      matchingWeights: normalizeMatchingWeights(overrides.matchingWeights),
      taggingRules: normalizeTaggingRulesConfig(overrides.taggingRules),
      discoverySettings: normalizeDiscoverySettings(overrides.discoverySettings),
    };
  }

/**
 * Creates a clean-slate initial AppState ready for the guided first-time onboarding wizard.
 * @param {Partial<import('../types/models.js').AppSettings>} [settingsOverrides]
 * @returns {import('../types/models.js').AppState}
 */
export function createEmptyOnboardingState(settingsOverrides = {}) {
  const now = new Date().toISOString();
  const initialLanguage =
    settingsOverrides.language !== undefined
      ? normalizeLanguage(settingsOverrides.language)
      : detectDeviceLanguage();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: '',
    profiles: [],
    books: [],
    rotations: [],
    customPresets: [],
    presetOverrides: {},
    notifications: [],
    settings: createSafeDefaultSettings({
      ...settingsOverrides,
      language: initialLanguage,
      onboarding: {
        status: 'pending',
        currentStep: 0,
        completedSteps: [],
        skippedSteps: [],
        startedAt: now,
        ...(settingsOverrides.onboarding || {}),
      },
    }),
    updatedAt: now,
  };
}

/**
 * Builds a canonical semantic deduplication key for an AppNotification.
 * @param {Partial<import('../types/models.js').AppNotification>} item
 * @returns {string}
 */
export function resolveNotificationDedupeKey(item) {
  if (!item || typeof item !== 'object') return '';
  const alertKey = typeof item.alertKey === 'string' ? item.alertKey.trim() : '';
  if (item.kind === 'preset-upcoming' && item.presetId) {
    const yearMatch = /(?:^|::)(\d{4})[-/]/.exec(alertKey) || /^(\d{4})-/.exec(String(item.createdAt || ''));
    const year = yearMatch ? yearMatch[1] : 'current';
    return `preset::${item.presetId}::${item.profileId || ''}::${year}`;
  }
  if (item.kind === 'swap-due' && item.rotationId) {
    return alertKey || `swap::${item.rotationId}::${item.profileId || ''}`;
  }
  return alertKey || String(item.id || '');
}

/**
 * Migrates older or partial state snapshots forward to CURRENT_SCHEMA_VERSION,
 * automatically refreshing each profile's `age` from `birthDate` when present
 * and enforcing single-active-rotation + clean read-history invariants.
 * @param {import('../types/models.js').AppState} state
 * @param {string | Date} [referenceDate]
 * @returns {import('../types/models.js').AppState}
 */
export function migrateState(state, referenceDate = new Date()) {
  const normalizedProfiles = state.profiles.map((profile) => {
    const dobCheck = normalizeBirthDate(profile.birthDate, referenceDate);
    const cleanDob = dobCheck.valid && dobCheck.birthDate ? dobCheck.birthDate : undefined;
    const effectiveAge = getEffectiveProfileAge(
      { age: profile.age, birthDate: cleanDob },
      referenceDate
    );
    const cleanReadHistory = Array.isArray(profile.readHistoryBookIds)
      ? Array.from(
          new Set(profile.readHistoryBookIds.filter((id) => typeof id === 'string' && id))
        )
      : [];
    const readHistorySet = new Set(cleanReadHistory);
    const cleanCurrentlyReading = Array.isArray(profile.currentlyReadingBookIds)
      ? Array.from(
          new Set(
            profile.currentlyReadingBookIds.filter(
              (id) => typeof id === 'string' && id && !readHistorySet.has(id)
            )
          )
        )
      : [];
    return {
      ...profile,
      ...(cleanDob ? { birthDate: cleanDob } : {}),
      age: effectiveAge,
      readHistoryBookIds: cleanReadHistory,
      currentlyReadingBookIds: cleanCurrentlyReading,
    };
  });

  /** @type {Set<string>} */
  const seenActiveProfileIds = new Set();
  const normalizedRotations = Array.isArray(state.rotations)
    ? state.rotations.map((rot) => {
        const cleanBookIds = Array.isArray(rot.bookIds)
          ? Array.from(new Set(rot.bookIds.filter((id) => typeof id === 'string' && id)))
          : [];
        const validSet = new Set(cleanBookIds);
        const cleanCompletedIds = Array.isArray(rot.completedBookIds)
          ? Array.from(
              new Set(
                rot.completedBookIds.filter((id) => typeof id === 'string' && validSet.has(id))
              )
            )
          : [];
        const cleanPickedIds = Array.isArray(rot.pickedBookIds)
          ? Array.from(
              new Set(
                rot.pickedBookIds.filter((id) => typeof id === 'string' && validSet.has(id))
              )
            )
          : [...cleanCompletedIds];
        const pickedSet = new Set(cleanPickedIds);
        const cleanPickedAutoReadIds = Array.isArray(rot.pickedAutoReadBookIds)
          ? Array.from(
              new Set(
                rot.pickedAutoReadBookIds.filter(
                  (id) => typeof id === 'string' && validSet.has(id) && pickedSet.has(id)
                )
              )
            )
          : [];
        const cleanPickedCycleOnlyReadIds = Array.isArray(rot.pickedCycleOnlyReadBookIds)
          ? Array.from(
              new Set(
                rot.pickedCycleOnlyReadBookIds.filter(
                  (id) => typeof id === 'string' && validSet.has(id) && pickedSet.has(id)
                )
              )
            )
          : [];
        const cleanPlacedIds = Array.isArray(rot.placedBookIds)
          ? Array.from(
              new Set(
                rot.placedBookIds.filter((id) => typeof id === 'string' && validSet.has(id))
              )
            )
          : [];
        let cleanStatus = rot.status;
        if (cleanStatus === 'active') {
          if (seenActiveProfileIds.has(rot.profileId)) {
            cleanStatus = 'saved';
          } else {
            seenActiveProfileIds.add(rot.profileId);
          }
        }
        return {
          ...rot,
          bookIds: cleanBookIds,
          completedBookIds: cleanCompletedIds,
          pickedBookIds: cleanPickedIds,
          pickedAutoReadBookIds: cleanPickedAutoReadIds,
          pickedCycleOnlyReadBookIds: cleanPickedCycleOnlyReadIds,
          placedBookIds: cleanPlacedIds,
          status: cleanStatus,
        };
      })
    : [];

  /** @type {import('../types/models.js').RotationPreset[]} */
  const normalizedCustomPresets = [];
  if (Array.isArray(state.customPresets)) {
    for (const rawPreset of state.customPresets) {
      try {
        normalizedCustomPresets.push(normalizeRotationPresetInput(rawPreset));
      } catch (_) {
        // Skip malformed custom preset entries without breaking state load
      }
    }
  }

  /** @type {Record<string, import('../types/models.js').RotationPreset>} */
  const normalizedPresetOverrides = {};
  if (state.presetOverrides && typeof state.presetOverrides === 'object') {
    for (const [presetId, rawOverride] of Object.entries(state.presetOverrides)) {
      if (!presetId || !rawOverride || typeof rawOverride !== 'object') continue;
      try {
        normalizedPresetOverrides[presetId] = normalizeRotationPresetInput(
          { ...rawOverride, id: presetId },
          { isCustom: false, isBuiltInOverride: true }
        );
      } catch (_) {
        // Ignore malformed built-in override entry cleanly
      }
    }
  }

  const validOriginSet = new Set(['provider', 'ai', 'rules', 'manual']);
  const normalizedBooks = Array.isArray(state.books)
    ? state.books.map((book) => {
        if (!book || typeof book !== 'object') return book;
        const nextBook = { ...book };
        if (book.userRatings && typeof book.userRatings === 'object') {
          /** @type {Record<string, number>} */
          const cleanRatings = {};
          for (const [pid, rawVal] of Object.entries(book.userRatings)) {
            if (!pid) continue;
            const num = Math.trunc(Number(rawVal));
            if (num >= 1 && num <= 5) {
              cleanRatings[pid] = num;
            }
          }
          nextBook.userRatings = cleanRatings;
        }
        if (Array.isArray(book.categories)) {
          const cleanCategories = Array.from(
            new Set(
              book.categories
                .map((c) => String(c || '').trim())
                .filter(Boolean)
            )
          ).slice(0, 12);
          if (cleanCategories.length > 0) {
            nextBook.categories = cleanCategories;
          } else {
            delete nextBook.categories;
          }
        }
        if (book.tagOrigins && typeof book.tagOrigins === 'object') {
          const currentTags = new Set(Array.isArray(book.tags) ? book.tags : []);
          /** @type {Record<string, import('../types/models.js').TagOrigin>} */
          const cleanOrigins = {};
          for (const [tagKey, originVal] of Object.entries(book.tagOrigins)) {
            if (currentTags.has(tagKey) && validOriginSet.has(originVal)) {
              cleanOrigins[tagKey] = originVal;
            }
          }
          if (Object.keys(cleanOrigins).length > 0) {
            nextBook.tagOrigins = cleanOrigins;
          } else {
            delete nextBook.tagOrigins;
          }
        }
        if (Array.isArray(book.bookNotes)) {
          const cleanNotes = book.bookNotes
            .filter((n) => n && typeof n === 'object' && typeof n.text === 'string' && n.text.trim())
            .map((n) => ({
              id: String(n.id || `note_${book.id}`),
              text: n.text.trim().slice(0, 1500),
              ...(typeof n.authorProfileId === 'string' && n.authorProfileId
                ? { authorProfileId: n.authorProfileId }
                : {}),
              ...(typeof n.forProfileId === 'string' && n.forProfileId
                ? { forProfileId: n.forProfileId }
                : {}),
              createdAt:
                typeof n.createdAt === 'string' && n.createdAt
                  ? n.createdAt
                  : book.addedAt || new Date().toISOString(),
              ...(typeof n.updatedAt === 'string' && n.updatedAt ? { updatedAt: n.updatedAt } : {}),
            }));
          if (cleanNotes.length > 0) {
            nextBook.bookNotes = cleanNotes;
          } else {
            delete nextBook.bookNotes;
          }
        } else if (typeof book.notes === 'string' && book.notes.trim()) {
          nextBook.bookNotes = [
            {
              id: `note_legacy_${book.id}`,
              text: book.notes.trim().slice(0, 1500),
              createdAt: book.addedAt || new Date().toISOString(),
            },
          ];
        }
        if (Array.isArray(book.recordings)) {
          const cleanRecs = book.recordings
            .filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id)
            .map((r) => ({
              id: String(r.id),
              ...(typeof r.title === 'string' && r.title.trim()
                ? { title: r.title.trim().slice(0, 80) }
                : {}),
              durationSec: Math.max(0, Number(r.durationSec) || 0),
              mimeType: typeof r.mimeType === 'string' && r.mimeType ? r.mimeType : 'audio/webm',
              ...(typeof r.authorProfileId === 'string' && r.authorProfileId
                ? { authorProfileId: r.authorProfileId }
                : {}),
              ...(typeof r.forProfileId === 'string' && r.forProfileId
                ? { forProfileId: r.forProfileId }
                : {}),
              createdAt:
                typeof r.createdAt === 'string' && r.createdAt
                  ? r.createdAt
                  : new Date().toISOString(),
            }));
          if (cleanRecs.length > 0) {
            nextBook.recordings = cleanRecs;
          } else {
            delete nextBook.recordings;
          }
        }
        if (typeof book.editionCount === 'number' && Number.isFinite(book.editionCount) && book.editionCount > 0) {
          nextBook.editionCount = Math.trunc(book.editionCount);
        } else {
          delete nextBook.editionCount;
        }
        if (typeof book.discardedAt === 'string' && book.discardedAt.trim()) {
          nextBook.discardedAt = book.discardedAt.trim();
        } else {
          delete nextBook.discardedAt;
        }
        if (Array.isArray(book.discardedByProfileIds)) {
          const cleanDiscardedIds = Array.from(
            new Set(
              book.discardedByProfileIds
                .map((pid) => String(pid || '').trim())
                .filter(Boolean)
            )
          );
          if (cleanDiscardedIds.length > 0) {
            nextBook.discardedByProfileIds = cleanDiscardedIds;
          } else {
            delete nextBook.discardedByProfileIds;
          }
        }
        return nextBook;
      })
    : [];

  const activeExists = normalizedProfiles.some((p) => p.id === state.activeProfileId);
  const hasExistingData =
    normalizedProfiles.length > 0 || normalizedBooks.length > 0 || normalizedRotations.length > 0;
  const safeSettings = createSafeDefaultSettings(state.settings || {});
  safeSettings.onboarding = normalizeOnboardingState(state.settings?.onboarding, {
    hasExistingData,
  });

  const validNotifKinds = new Set(['preset-upcoming', 'swap-due', 'system']);
  /** @type {import('../types/models.js').AppNotification[]} */
  const normalizedNotifications = [];
  if (Array.isArray(state.notifications)) {
    const seenIds = new Set();
    /** @type {Map<string, number>} */
    const indexByDedupeKey = new Map();
    for (const item of state.notifications) {
      if (!item || typeof item !== 'object') continue;
      const id = String(item.id || '').trim();
      const title = String(item.title || '').trim();
      const message = String(item.message || '').trim();
      if (!id || !title || seenIds.has(id)) continue;
      seenIds.add(id);

      /** @type {import('../types/models.js').AppNotification} */
      const entry = {
        id,
        kind: validNotifKinds.has(item.kind) ? item.kind : 'system',
        title,
        message,
        ...(typeof item.alertKey === 'string' && item.alertKey ? { alertKey: item.alertKey } : {}),
        ...(typeof item.presetId === 'string' && item.presetId ? { presetId: item.presetId } : {}),
        ...(typeof item.rotationId === 'string' && item.rotationId
          ? { rotationId: item.rotationId }
          : {}),
        ...(typeof item.profileId === 'string' && item.profileId
          ? { profileId: item.profileId }
          : {}),
        ...(typeof item.daysRemaining === 'number' && Number.isFinite(item.daysRemaining)
          ? { daysRemaining: item.daysRemaining }
          : {}),
        createdAt:
          typeof item.createdAt === 'string' && item.createdAt
            ? item.createdAt
            : new Date().toISOString(),
        ...(typeof item.readAt === 'string' && item.readAt ? { readAt: item.readAt } : {}),
        ...(item.dismissed ? { dismissed: true } : {}),
      };

      const dedupeKey = resolveNotificationDedupeKey(entry);
      if (dedupeKey && indexByDedupeKey.has(dedupeKey)) {
        const existingIdx = indexByDedupeKey.get(dedupeKey);
        if (existingIdx !== undefined) {
          const prev = normalizedNotifications[existingIdx];
          normalizedNotifications[existingIdx] = {
            ...prev,
            ...(prev.dismissed || entry.dismissed ? { dismissed: true } : {}),
            ...((prev.readAt || entry.readAt) ? { readAt: prev.readAt || entry.readAt } : {}),
          };
        }
        continue;
      }

      if (dedupeKey) {
        indexByDedupeKey.set(dedupeKey, normalizedNotifications.length);
      }
      normalizedNotifications.push(entry);
      if (normalizedNotifications.length >= 80) break;
    }
  }

  return {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: activeExists ? state.activeProfileId : normalizedProfiles[0]?.id || '',
    profiles: normalizedProfiles,
    books: normalizedBooks,
    rotations: normalizedRotations,
    customPresets: normalizedCustomPresets,
    presetOverrides: normalizedPresetOverrides,
    notifications: normalizedNotifications,
    settings: safeSettings,
  };
}

/**
 * Opens IndexedDB database if supported in the current runtime.
 * @returns {Promise<IDBDatabase>}
 */
function openIndexedDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Persists an audio recording Blob into IndexedDB `audio_blobs` (with memory fallback).
 * @param {string} recordingId
 * @param {any} blob
 * @returns {Promise<void>}
 */
export async function saveBookAudioBlob(recordingId, blob) {
  if (!recordingId || !blob) return;
  memoryAudioBlobs.set(recordingId, blob);
  try {
    const db = await openIndexedDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      tx.objectStore(AUDIO_STORE_NAME).put(blob, recordingId);
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {
    // Keep memory fallback seamlessly
  }
}

/**
 * Retrieves an audio recording Blob from IndexedDB `audio_blobs` (or memory fallback).
 * @param {string} recordingId
 * @returns {Promise<Blob | null>}
 */
export async function getBookAudioBlob(recordingId) {
  if (!recordingId) return null;
  try {
    const db = await openIndexedDb();
    const res = await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
      const req = tx.objectStore(AUDIO_STORE_NAME).get(recordingId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (res) return res;
  } catch (_) {
    // Fallback below
  }
  return memoryAudioBlobs.get(recordingId) || null;
}

/**
 * Deletes an audio recording Blob from IndexedDB `audio_blobs` and memory fallback.
 * @param {string} recordingId
 * @returns {Promise<void>}
 */
export async function deleteBookAudioBlob(recordingId) {
  if (!recordingId) return;
  memoryAudioBlobs.delete(recordingId);
  try {
    const db = await openIndexedDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      tx.objectStore(AUDIO_STORE_NAME).delete(recordingId);
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {
    // Best-effort cleanup
  }
}

/**
 * Persists an isolated snapshot of the current library state for QA Dev Tools switching.
 * @param {import('../types/models.js').AppState} state
 */
export function saveQaUserSnapshot(state) {
  const serialized = JSON.stringify(state);
  memoryQaSnapshotJson = serialized;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(QA_SNAPSHOT_STORAGE_KEY, serialized);
    }
  } catch (_) {}
}

/**
 * Reads the saved QA Existing User snapshot if present and structurally valid.
 * @returns {import('../types/models.js').AppState | null}
 */
export function loadQaUserSnapshot() {
  let raw = memoryQaSnapshotJson;
  try {
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(QA_SNAPSHOT_STORAGE_KEY) || memoryQaSnapshotJson;
    }
  } catch (_) {}
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isValidAppState(parsed) ? migrateState(parsed) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Returns true if an Existing User QA snapshot is stored.
 * @returns {boolean}
 */
export function hasQaUserSnapshot() {
  return Boolean(loadQaUserSnapshot());
}

/**
 * Deletes the stored QA snapshot.
 */
export function clearQaUserSnapshot() {
  memoryQaSnapshotJson = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(QA_SNAPSHOT_STORAGE_KEY);
    }
  } catch (_) {}
}

/**
 * Removes dismissed banner / device cache flags cleanly without touching QA snapshot.
 */
export function clearAuxiliaryLocalStorageKeys() {
  try {
    if (typeof localStorage !== 'undefined') {
      for (const key of AUXILIARY_STORAGE_KEYS) {
        localStorage.removeItem(key);
      }
    }
  } catch (_) {}
}

/**
 * Creates a storage adapter with IndexedDB -> localStorage -> Memory automatic fallback.
 * @param {{ forceMemory?: boolean, seedOnEmpty?: boolean }} [options]
 */
export function createStorageAdapter(options = {}) {
  const seedOnEmpty = options.seedOnEmpty !== false;
  /** @type {import('../types/models.js').AppState | null} */
  let memorySnapshot = null;
  /** @type {'indexeddb' | 'localstorage' | 'memory'} */
  let activeBackend = 'memory';

  const createInitialState = () =>
    migrateState(seedOnEmpty ? createSeedState() : createEmptyOnboardingState());

  /**
   * Loads persisted state or initializes on first launch.
   * @returns {Promise<import('../types/models.js').AppState>}
   */
  async function load() {
    if (!options.forceMemory) {
      // 1. Attempt IndexedDB primary store
      try {
        const db = await openIndexedDb();
        const stored = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(RECORD_KEY);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        db.close();
        activeBackend = 'indexeddb';
        if (isValidAppState(stored)) {
          return migrateState(stored);
        }
        const initial = createInitialState();
        await save(initial);
        return initial;
      } catch (_) {
        // Fall through to localStorage
      }

      // 2. Attempt localStorage fallback (Safari Private Mode / restricted webviews)
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
          activeBackend = 'localstorage';
          if (raw) {
            const parsed = JSON.parse(raw);
            if (isValidAppState(parsed)) {
              return migrateState(parsed);
            }
          }
          const initial = createInitialState();
          await save(initial);
          return initial;
        }
      } catch (_) {
        // Fall through to memory
      }
    }

    // 3. In-memory fallback (Node test runner or storage-blocked sandbox)
    activeBackend = 'memory';
    if (memorySnapshot && isValidAppState(memorySnapshot)) {
      return migrateState(memorySnapshot);
    }
    memorySnapshot = createInitialState();
    return memorySnapshot;
  }

  /**
   * Persists the complete application state atomically.
   * @param {import('../types/models.js').AppState} nextState
   * @returns {Promise<void>}
   */
  async function save(nextState) {
    const stamped = {
      ...nextState,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };
    memorySnapshot = stamped;

    if (options.forceMemory) {
      activeBackend = 'memory';
      return;
    }

    // Keep theme preference accessible synchronously to index.html zero-FOUC script
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('lr_theme_pref', stamped.settings.theme);
        if (stamped.settings.themePreset) {
          localStorage.setItem('lr_theme_preset', stamped.settings.themePreset);
        }
      }
    } catch (_) {}

    try {
      const db = await openIndexedDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(stamped, RECORD_KEY);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      activeBackend = 'indexeddb';
      return;
    } catch (_) {
      // Fallback to localStorage
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stamped));
        activeBackend = 'localstorage';
        return;
      }
    } catch (_) {}

    activeBackend = 'memory';
  }

  function getBackendName() {
    return activeBackend;
  }

  return {
    load,
    save,
    getBackendName,
  };
}
