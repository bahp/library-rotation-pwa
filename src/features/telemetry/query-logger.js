/**
 * @fileoverview Internal API query usage tracker, logger, and quota alert monitor:
 * - Tracks daily request counts for Google Books (1,000 queries/day default limit),
 *   Gemini API, OpenAI-compatible BYOK endpoints, and Open Library fallback.
 * - Maintains a rolling, bounded audit log of recent API calls with latency, status codes,
 *   and query details.
 * - Provides threshold warnings (e.g. alert at 80% / 800 calls) and quota exhaustion alerts.
 * - Supports CSV & JSON export, counter reset, and live pub/sub subscriptions for UI components.
 */

/**
 * @typedef {'google-books' | 'gemini' | 'openai' | 'open-library' | 'other'} ApiServiceId
 */

/**
 * @typedef {Object} QueryLogEntry
 * @property {string} id
 * @property {string} timestamp - ISO string
 * @property {ApiServiceId} service
 * @property {string} endpoint
 * @property {number} status
 * @property {string} statusText
 * @property {number} latencyMs
 * @property {boolean} [cached]
 * @property {string} [error]
 */

/**
 * @typedef {Object} ServiceQuotaConfig
 * @property {number} dailyLimit
 * @property {number} warningThresholdPercent
 */

/**
 * @typedef {Object} ServiceQuotaStatus
 * @property {ApiServiceId} service
 * @property {number} count
 * @property {number} limit
 * @property {number} remaining
 * @property {number} percent
 * @property {boolean} isWarning
 * @property {boolean} isExceeded
 */

/**
 * @typedef {Object} StoredQueryUsage
 * @property {number} schemaVersion
 * @property {Record<string, Record<string, number>>} dailyCounts
 * @property {QueryLogEntry[]} logs
 * @property {Record<string, ServiceQuotaConfig>} limits
 */

const STORAGE_KEY = 'lr_query_usage_v1';
const MAX_LOGS = 200;

/** @type {Record<ApiServiceId, ServiceQuotaConfig>} */
export const DEFAULT_LIMITS = Object.freeze({
  'google-books': Object.freeze({ dailyLimit: 1000, warningThresholdPercent: 80 }),
  'gemini': Object.freeze({ dailyLimit: 1500, warningThresholdPercent: 85 }),
  'openai': Object.freeze({ dailyLimit: 500, warningThresholdPercent: 85 }),
  'open-library': Object.freeze({ dailyLimit: 0, warningThresholdPercent: 100 }),
  'other': Object.freeze({ dailyLimit: 0, warningThresholdPercent: 100 }),
});

/**
 * @returns {string}
 */
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @returns {Storage | null}
 */
function getSafeStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (_) {}
  return null;
}

class QueryLoggerService {
  constructor() {
    /** @type {StoredQueryUsage} */
    this.inMemory = {
      schemaVersion: 1,
      dailyCounts: {},
      logs: [],
      limits: { ...DEFAULT_LIMITS },
    };

    /** @type {Set<() => void>} */
    this.listeners = new Set();

    this.load();
  }

  load() {
    const store = getSafeStorage();
    if (!store) return;
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.inMemory = {
            schemaVersion: 1,
            dailyCounts: parsed.dailyCounts || {},
            logs: Array.isArray(parsed.logs) ? parsed.logs.slice(-MAX_LOGS) : [],
            limits: { ...DEFAULT_LIMITS, ...(parsed.limits || {}) },
          };
        }
      }
    } catch (_) {}
  }

  save() {
    const store = getSafeStorage();
    if (!store) return;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(this.inMemory));
    } catch (_) {}
  }

  notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  }

  /**
   * @param {() => void} listener
   * @returns {() => void}
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Records a query invocation across Google Books, Gemini, OpenAI, or Open Library.
   * @param {{
   *   service: ApiServiceId,
   *   endpoint: string,
   *   status: number,
   *   statusText?: string,
   *   latencyMs: number,
   *   cached?: boolean,
   *   error?: string
   * }} params
   */
  recordQuery(params) {
    const today = getTodayKey();
    if (!this.inMemory.dailyCounts[today]) {
      this.inMemory.dailyCounts[today] = {};
    }

    const currentCount = this.inMemory.dailyCounts[today][params.service] || 0;
    this.inMemory.dailyCounts[today][params.service] = currentCount + 1;

    let statusText = params.statusText || (params.status === 200 ? 'OK' : `HTTP ${params.status}`);
    if (params.status === 429) {
      statusText = 'Quota Exceeded (HTTP 429)';
    }

    /** @type {QueryLogEntry} */
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      service: params.service,
      endpoint: String(params.endpoint || '').slice(0, 160),
      status: Number(params.status) || 0,
      statusText,
      latencyMs: Math.max(0, Math.round(Number(params.latencyMs) || 0)),
      cached: Boolean(params.cached),
      error: params.error ? String(params.error).slice(0, 200) : undefined,
    };

    this.inMemory.logs.push(entry);
    if (this.inMemory.logs.length > MAX_LOGS) {
      this.inMemory.logs = this.inMemory.logs.slice(-MAX_LOGS);
    }

    this.save();
    this.notify();
  }

  /**
   * @param {ApiServiceId} service
   * @param {string} [dateStr]
   * @returns {number}
   */
  getDailyCount(service, dateStr = getTodayKey()) {
    return this.inMemory.dailyCounts[dateStr]?.[service] || 0;
  }

  /**
   * @param {string} [dateStr]
   * @returns {Record<string, number>}
   */
  getDailyCounts(dateStr = getTodayKey()) {
    return { ...(this.inMemory.dailyCounts[dateStr] || {}) };
  }

  /**
   * @param {ApiServiceId} service
   * @returns {ServiceQuotaStatus}
   */
  getServiceQuota(service) {
    const count = this.getDailyCount(service);
    const config = this.inMemory.limits[service] || DEFAULT_LIMITS[service] || { dailyLimit: 0, warningThresholdPercent: 100 };
    const limit = config.dailyLimit;
    const remaining = limit > 0 ? Math.max(0, limit - count) : Infinity;
    const percent = limit > 0 ? Math.round((count / limit) * 100) : 0;
    const isWarning = limit > 0 && percent >= config.warningThresholdPercent && percent < 100;
    const isExceeded = limit > 0 && count >= limit;

    return {
      service,
      count,
      limit,
      remaining,
      percent,
      isWarning,
      isExceeded,
    };
  }

  /**
   * @param {ApiServiceId} service
   * @param {number} limit
   */
  setDailyLimit(service, limit) {
    const current = this.inMemory.limits[service] || { ...DEFAULT_LIMITS[service] };
    this.inMemory.limits[service] = {
      ...current,
      dailyLimit: Math.max(0, Number(limit) || 0),
    };
    this.save();
    this.notify();
  }

  /**
   * @param {ApiServiceId} service
   * @param {number} thresholdPercent
   */
  setWarningThreshold(service, thresholdPercent) {
    const current = this.inMemory.limits[service] || { ...DEFAULT_LIMITS[service] };
    this.inMemory.limits[service] = {
      ...current,
      warningThresholdPercent: Math.max(10, Math.min(100, Number(thresholdPercent) || 80)),
    };
    this.save();
    this.notify();
  }

  /**
   * @param {ApiServiceId | 'all'} [filterService]
   * @param {number} [limit=100]
   * @returns {QueryLogEntry[]}
   */
  getRecentLogs(filterService = 'all', limit = 100) {
    const all = [...this.inMemory.logs].reverse();
    if (!filterService || filterService === 'all') {
      return all.slice(0, limit);
    }
    return all.filter((l) => l.service === filterService).slice(0, limit);
  }

  clearLogs() {
    this.inMemory.logs = [];
    this.save();
    this.notify();
  }

  resetTodayCounts() {
    const today = getTodayKey();
    this.inMemory.dailyCounts[today] = {};
    this.save();
    this.notify();
  }

  clearAll() {
    this.inMemory.dailyCounts = {};
    this.inMemory.logs = [];
    this.save();
    this.notify();
  }

  /**
   * @returns {{
   *   hasAlert: boolean,
   *   level: 'warning' | 'error' | 'none',
   *   service: ApiServiceId | null,
   *   message: string
   * }}
   */
  getGlobalQuotaAlert() {
    const googleQuota = this.getServiceQuota('google-books');
    if (googleQuota.isExceeded) {
      return {
        hasAlert: true,
        level: 'error',
        service: 'google-books',
        message: `Google Books daily limit reached (${googleQuota.count}/${googleQuota.limit} queries today). Fallback to Open Library is active until midnight.`,
      };
    }
    if (googleQuota.isWarning) {
      return {
        hasAlert: true,
        level: 'warning',
        service: 'google-books',
        message: `Google Books daily usage alert: ${googleQuota.count} / ${googleQuota.limit} queries used today (${googleQuota.percent}%). Open Library will seamlessly handle scans if limit is reached.`,
      };
    }

    const geminiQuota = this.getServiceQuota('gemini');
    if (geminiQuota.isExceeded) {
      return {
        hasAlert: true,
        level: 'error',
        service: 'gemini',
        message: `Gemini daily query budget reached (${geminiQuota.count}/${geminiQuota.limit} calls).`,
      };
    }

    return {
      hasAlert: false,
      level: 'none',
      service: null,
      message: '',
    };
  }

  /**
   * @returns {string}
   */
  exportLogsAsJson() {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        todayCounts: this.getDailyCounts(),
        logs: this.inMemory.logs,
      },
      null,
      2
    );
  }

  /**
   * @returns {string}
   */
  exportLogsAsCsv() {
    const headers = ['Timestamp', 'Service', 'Status', 'Status Text', 'Latency (ms)', 'Cached', 'Endpoint', 'Error'];
    const rows = this.inMemory.logs.map((l) => [
      l.timestamp,
      l.service,
      l.status,
      `"${(l.statusText || '').replace(/"/g, '""')}"`,
      l.latencyMs,
      l.cached ? 'yes' : 'no',
      `"${(l.endpoint || '').replace(/"/g, '""')}"`,
      `"${(l.error || '').replace(/"/g, '""')}"`,
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

export const queryLogger = new QueryLoggerService();
