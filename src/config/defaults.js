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
 * Default safe settings object used for new installations and settings migrations.
 * @returns {import('../types/models.js').AppSettings}
 */
export function createDefaultAppSettings() {
  return {
    language: 'en',
    theme: 'system',
    coverAspectRatio: 'portrait',
    dynamicCoverTint: true,
    showPresetDecorations: true,
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
    llmModel: 'gemini-3.8-flash',
    llmCloudflareUrl: '',
    llmBaseUrl: '',
    llmApiKey: '',
    llmCustomPromptHint: '',
  };
}
