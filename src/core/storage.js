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
import { NUMERIC_BOUNDS, normalizeLanguage } from '../config/index.js';

const DB_NAME = 'library_rotation_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const RECORD_KEY = 'primary_v1';
const LOCAL_STORAGE_KEY = 'library_rotation_state_v1';

/**
 * Validates whether an arbitrary parsed object satisfies the structural AppState contract.
 * @param {unknown} candidate
 * @returns {candidate is import('../types/models.js').AppState}
 */
export function isValidAppState(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = /** @type {Record<string, unknown>} */ (candidate);
  return (
    typeof obj.schemaVersion === 'number' &&
    typeof obj.activeProfileId === 'string' &&
    Array.isArray(obj.profiles) &&
    obj.profiles.length > 0 &&
    Array.isArray(obj.books) &&
    Array.isArray(obj.rotations) &&
    Boolean(obj.settings && typeof obj.settings === 'object')
  );
}

export const DEFAULT_METADATA_PROVIDERS = ['google-books', 'open-library'];

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
      for (const key of [
        'lr_theme_pref',
        'lr_dismissed_swap_reminders_v1',
        'lr_dismissed_preset_alerts_v1',
        'lr_dismissed_stale_spotlights_v1',
        'lr_device_books_proxy_v1',
        'lr_device_google_books_api_key_v1',
        'lr_welcome_books_modal_dismissed_v1',
      ]) {
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

    return {
      language: normalizeLanguage(overrides.language),
      theme: overrides.theme || 'system',
      coverAspectRatio: overrides.coverAspectRatio === 'portrait' ? 'portrait' : 'square',
      dynamicCoverTint: overrides.dynamicCoverTint !== false,
      retainRawProviderPayloads: Boolean(overrides.retainRawProviderPayloads),
      searchWhileTyping: Boolean(overrides.searchWhileTyping),
      enabledMetadataProviders:
        rawProviders.length > 0 ? Array.from(new Set(rawProviders)) : [...DEFAULT_METADATA_PROVIDERS],
      autoLocalTagging: overrides.autoLocalTagging !== false,
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
    };
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
    return {
      ...profile,
      ...(cleanDob ? { birthDate: cleanDob } : {}),
      age: effectiveAge,
      readHistoryBookIds: cleanReadHistory,
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
        return nextBook;
      })
    : [];

  const activeExists = normalizedProfiles.some((p) => p.id === state.activeProfileId);
  return {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: activeExists ? state.activeProfileId : normalizedProfiles[0].id,
    profiles: normalizedProfiles,
    books: normalizedBooks,
    rotations: normalizedRotations,
    customPresets: normalizedCustomPresets,
    presetOverrides: normalizedPresetOverrides,
    settings: createSafeDefaultSettings(state.settings || {}),
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Creates a storage adapter with IndexedDB -> localStorage -> Memory automatic fallback.
 * @param {{ forceMemory?: boolean }} [options]
 */
export function createStorageAdapter(options = {}) {
  /** @type {import('../types/models.js').AppState | null} */
  let memorySnapshot = null;
  /** @type {'indexeddb' | 'localstorage' | 'memory'} */
  let activeBackend = 'memory';

  /**
   * Loads persisted state or initializes with seed data on first launch.
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
        const seeded = createSeedState();
        await save(seeded);
        return seeded;
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
          const seeded = createSeedState();
          await save(seeded);
          return seeded;
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
    memorySnapshot = createSeedState();
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
