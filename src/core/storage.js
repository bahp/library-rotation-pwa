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

  return {
    theme: overrides.theme || 'system',
    coverAspectRatio: overrides.coverAspectRatio === 'portrait' ? 'portrait' : 'square',
    dynamicCoverTint: overrides.dynamicCoverTint !== false,
    retainRawProviderPayloads: Boolean(overrides.retainRawProviderPayloads),
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
  };
}

/**
 * Migrates older or partial state snapshots forward to CURRENT_SCHEMA_VERSION,
 * automatically refreshing each profile's `age` from `birthDate` when present.
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
    return {
      ...profile,
      ...(cleanDob ? { birthDate: cleanDob } : {}),
      age: effectiveAge,
    };
  });

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

  const activeExists = normalizedProfiles.some((p) => p.id === state.activeProfileId);
  return {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: activeExists ? state.activeProfileId : normalizedProfiles[0].id,
    profiles: normalizedProfiles,
    customPresets: normalizedCustomPresets,
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
