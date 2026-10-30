/**
 * @fileoverview Resilient JSON HTTP client with bounded TTL caching, request timeouts,
 * and exponential backoff retry on HTTP 429 / 5xx responses.
 */

const CACHE_STORAGE_KEY = 'lr_provider_cache_v1';
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_CACHE_ENTRIES = 60;

/**
 * Sleeps for the specified duration unless aborted.
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true }
      );
    }
  });
}

/**
 * Creates a rate-limit-aware cached JSON client.
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 *   maxRetries?: number,
 *   baseDelayMs?: number,
 *   ttlMs?: number,
 *   disablePersistentCache?: boolean
 * }} [config]
 */
export function createHttpClient(config = {}) {
  const fetchFn = config.fetchImpl || globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 7000;
  const maxRetries = config.maxRetries ?? 2;
  const baseDelayMs = config.baseDelayMs ?? 300;
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;

  /** @type {Map<string, { expiresAt: number, value: unknown }>} */
  const memoryCache = new Map();

  if (!config.disablePersistentCache && typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const entries = JSON.parse(raw);
        if (Array.isArray(entries)) {
          const now = Date.now();
          for (const [k, v] of entries) {
            if (v && typeof v.expiresAt === 'number' && v.expiresAt > now) {
              memoryCache.set(k, v);
            }
          }
        }
      }
    } catch (_) {}
  }

  function persistCache() {
    if (config.disablePersistentCache || typeof sessionStorage === 'undefined') return;
    try {
      const serialized = JSON.stringify(Array.from(memoryCache.entries()));
      sessionStorage.setItem(CACHE_STORAGE_KEY, serialized);
    } catch (_) {}
  }

  /**
   * Stores a JSON payload in the bounded LRU cache.
   * @param {string} key
   * @param {unknown} value
   */
  function setCached(key, value) {
    if (memoryCache.has(key)) memoryCache.delete(key);
    memoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
    while (memoryCache.size > MAX_CACHE_ENTRIES) {
      const oldestKey = memoryCache.keys().next().value;
      if (oldestKey !== undefined) memoryCache.delete(oldestKey);
    }
    persistCache();
  }

  /**
   * Fetches JSON with cache lookup, timeout, and retry/backoff on 429/5xx.
   * @param {string} url
   * @param {{ signal?: AbortSignal, bypassCache?: boolean }} [options]
   * @returns {Promise<any>}
   */
  async function getJson(url, options = {}) {
    if (!options.bypassCache) {
      const hit = memoryCache.get(url);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.value;
      }
      if (hit) memoryCache.delete(url);
    }

    if (typeof fetchFn !== 'function') {
      throw new Error('Network fetch API is unavailable in this environment.');
    }

    let attempt = 0;
    while (true) {
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      options.signal?.addEventListener('abort', onExternalAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchFn(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json();
          setCached(url, data);
          return data;
        }

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= maxRetries) {
          throw new Error(`HTTP ${response.status} from metadata provider`);
        }

        const retryAfterHeader = response.headers?.get?.('Retry-After');
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const waitMs =
          !Number.isNaN(retryAfterSec) && retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 4000)
            : baseDelayMs * Math.pow(2, attempt);

        attempt += 1;
        await delay(waitMs, options.signal);
      } catch (err) {
        if (options.signal?.aborted) {
          throw err;
        }
        const isNetworkOrTimeout =
          err instanceof TypeError || (err instanceof Error && err.name === 'AbortError');
        if (!isNetworkOrTimeout || attempt >= maxRetries) {
          throw err;
        }
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        attempt += 1;
        await delay(waitMs, options.signal);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  function clearCache() {
    memoryCache.clear();
    persistCache();
  }

  return {
    getJson,
    clearCache,
    getCacheSize: () => memoryCache.size,
  };
}
