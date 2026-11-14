/**
 * @fileoverview Resilient JSON HTTP client with bounded TTL caching, request timeouts,
 * upstream error message extraction, and smart retry/backoff on transient HTTP 429 / 5xx responses
 * (failing fast without stalling when daily quota exhaustion is reported without Retry-After).
 */

import { queryLogger } from '../../telemetry/query-logger.js';

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
 * Extracts a concise human-readable upstream error reason from a non-OK HTTP response body if JSON.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readUpstreamErrorDetail(response) {
  try {
    const text = await response.text();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      const msg =
        (parsed && typeof parsed.error === 'object' && parsed.error?.message) ||
        (typeof parsed?.error === 'string' ? parsed.error : '') ||
        (typeof parsed?.message === 'string' ? parsed.message : '');
      return msg ? String(msg).trim() : '';
    } catch (_) {
      return text.length <= 140 ? text.trim() : '';
    }
  } catch (_) {
    return '';
  }
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
  const fetchFn =
    config.fetchImpl ||
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
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
   * @param {string} urlStr
   * @returns {import('../../telemetry/query-logger.js').ApiServiceId}
   */
  function inferService(urlStr) {
    const s = String(urlStr || '').toLowerCase();
    if (s.includes('googleapis.com') || s.includes('/api/books')) return 'google-books';
    if (s.includes('openlibrary.org')) return 'open-library';
    return 'other';
  }

  /**
   * @param {string} urlStr
   * @returns {string}
   */
  function formatEndpoint(urlStr) {
    try {
      const u = new URL(urlStr, 'http://localhost');
      return u.searchParams.get('q') || u.searchParams.get('bibkeys') || u.pathname || urlStr;
    } catch (_) {
      return String(urlStr || '').slice(0, 120);
    }
  }

  /**
   * Fetches JSON with cache lookup, timeout, and retry/backoff on transient 429/5xx.
   * @param {string} url
   * @param {{ signal?: AbortSignal, bypassCache?: boolean }} [options]
   * @returns {Promise<any>}
   */
  async function getJson(url, options = {}) {
    const service = inferService(url);
    const endpointLabel = formatEndpoint(url);
    const startTime = Date.now();

    if (!options.bypassCache) {
      const hit = memoryCache.get(url);
      if (hit && hit.expiresAt > Date.now()) {
        try {
          queryLogger?.recordQuery?.({
            service,
            endpoint: endpointLabel,
            status: 200,
            statusText: 'Cached',
            latencyMs: 0,
            cached: true,
          });
        } catch (_) {}
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
          const contentType = response.headers?.get?.('content-type') || '';
          if (contentType && /text\/html/i.test(contentType)) {
            throw new Error('Expected JSON payload but received HTML document');
          }
          const data = await response.json();
          setCached(url, data);
          try {
            queryLogger?.recordQuery?.({
              service,
              endpoint: endpointLabel,
              status: response.status,
              statusText: 'OK',
              latencyMs: Date.now() - startTime,
            });
          } catch (_) {}
          return data;
        }

        const retryAfterHeader = response.headers?.get?.('Retry-After');
        const detail = await readUpstreamErrorDetail(response);
        const isHardQuotaExhausted =
          (response.status === 429 || response.status === 403) &&
          !retryAfterHeader &&
          /quota exceeded|queries per day|dailylimitexceeded/i.test(detail);

        try {
          queryLogger?.recordQuery?.({
            service,
            endpoint: endpointLabel,
            status: response.status,
            statusText: isHardQuotaExhausted ? 'Quota Exceeded (HTTP 429)' : `HTTP ${response.status}`,
            latencyMs: Date.now() - startTime,
            error: detail || undefined,
          });
        } catch (_) {}

        const retryable =
          !isHardQuotaExhausted && (response.status === 429 || response.status >= 500);

        if (!retryable || attempt >= maxRetries) {
          const suffix = detail ? `: ${detail}` : ' from metadata provider';
          throw new Error(`HTTP ${response.status}${suffix}`);
        }

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
          try {
            queryLogger?.recordQuery?.({
              service,
              endpoint: endpointLabel,
              status: 0,
              statusText: isNetworkOrTimeout ? 'Network/Timeout' : 'Error',
              latencyMs: Date.now() - startTime,
              error: err instanceof Error ? err.message : String(err),
            });
          } catch (_) {}
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
