/**
 * @fileoverview Resilient client-side storage engine using IndexedDB as primary store
 * with automatic localStorage and in-memory fallbacks for restricted browser contexts.
 */

import { CURRENT_SCHEMA_VERSION } from '../types/models.js';
import { createSeedState } from '../data/seed.js';

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

/**
 * Migrates older or partial state snapshots forward to CURRENT_SCHEMA_VERSION.
 * @param {import('../types/models.js').AppState} state
 * @returns {import('../types/models.js').AppState}
 */
export function migrateState(state) {
  const activeExists = state.profiles.some((p) => p.id === state.activeProfileId);
  return {
    ...state,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: activeExists ? state.activeProfileId : state.profiles[0].id,
    settings: {
      theme: state.settings?.theme || 'system',
      retainRawProviderPayloads: Boolean(state.settings?.retainRawProviderPayloads),
      aiEnrichmentOptIn: Boolean(state.settings?.aiEnrichmentOptIn),
      preferredScanMode: state.settings?.preferredScanMode || 'barcode',
    },
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
