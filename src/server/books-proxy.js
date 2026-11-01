/**
 * @fileoverview Leak-free server-side Google Books Volumes API proxy & quota diagnostic helpers.
 *
 * Why `project_number:624717413613` hits HTTP 429 even with few personal queries:
 * - When `books.googleapis.com/books/v1/volumes` is queried WITHOUT an API key (`key=...`),
 *   Google attributes every unauthenticated call from the same shared egress IP / NAT / cloud
 *   preview gateway to Google's internal anonymous default consumer (`project_number:624717413613`).
 * - Thousands of other users sharing that cloud NAT or carrier IP exhaust that shared daily pool.
 *
 * Security & Zero-Leak Guarantees:
 * - `GOOGLE_BOOKS_API_KEY` is read strictly on the server (`process.env.GOOGLE_BOOKS_API_KEY`)
 *   and NEVER prefixed with `VITE_`, NEVER accepted from client query/body, and NEVER echoed back.
 * - Any `?key=...` / `&key=...` parameters and literal key substrings are recursively scrubbed from
 *   upstream payloads (such as Google's `selfLink` / `accessInfo` URLs) and upstream error messages.
 */

const GOOGLE_BOOKS_UPSTREAM = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Scrubs any `key=...` query parameters and literal secret values from arbitrary text.
 * @param {string} text
 * @param {string} [apiKey]
 * @returns {string}
 */
export function redactApiKeyFromText(text, apiKey = '') {
  let out = String(text || '');
  const trimmedKey = String(apiKey || '').trim();
  if (trimmedKey) {
    out = out.split(trimmedKey).join('[REDACTED]');
    const encodedKey = encodeURIComponent(trimmedKey);
    if (encodedKey !== trimmedKey) {
      out = out.split(encodedKey).join('[REDACTED]');
    }
  }
  // Scrub any URL query parameter `key=...` regardless of encoding
  out = out.replace(/([?&]key=)[^&\s"'<>]+/gi, '$1[REDACTED]');
  return out;
}

/**
 * Recursively clones JSON-compatible data while redacting any accidental key appearances in strings
 * (e.g., if an upstream response embeds `?key=...` inside `selfLink` or error metadata).
 * @param {unknown} value
 * @param {string} [apiKey]
 * @returns {any}
 */
export function sanitizeUpstreamPayload(value, apiKey = '') {
  if (typeof value === 'string') {
    return redactApiKeyFromText(value, apiKey);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUpstreamPayload(entry, apiKey));
  }
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase() === 'apikey' || k.toLowerCase() === 'api_key') {
        continue;
      }
      clean[k] = sanitizeUpstreamPayload(v, apiKey);
    }
    return clean;
  }
  return value;
}

/**
 * Translates raw Google Books HTTP 429 messages (especially `project_number:624717413613`)
 * into a clear, accurate maintainer explanation without exposing any secret values.
 * @param {string} rawMessage
 * @param {{ keyConfigured?: boolean }} [opts]
 * @returns {string}
 */
export function explainGoogleBooksQuotaError(rawMessage, opts = {}) {
  const cleanMsg = redactApiKeyFromText(rawMessage);
  const isSharedAnonymousBucket =
    cleanMsg.includes('624717413613') || (!opts.keyConfigured && /429|quota exceeded/i.test(cleanMsg));

  if (isSharedAnonymousBucket && !opts.keyConfigured) {
    return `${cleanMsg} — Why this happens: without a server API key, Google routes keyless requests through its shared anonymous IP pool (project 624717413613), which other cloud/NAT users can exhaust even if you ran almost no queries. Open Library fallback remains active automatically, or set GOOGLE_BOOKS_API_KEY in server environment secrets for a dedicated 1,000 queries/day quota.`;
  }

  if (opts.keyConfigured && /429|quota exceeded/i.test(cleanMsg)) {
    return `${cleanMsg} — Your configured GOOGLE_BOOKS_API_KEY project reached its Google Cloud Books API quota limit, or Books API v1 is not enabled yet in Google Cloud Console. Open Library fallback remains active.`;
  }

  return cleanMsg;
}

/**
 * Executes a validated, server-side proxied query to Google Books Volumes API v1.
 *
 * @param {{
 *   query: { q?: string, maxResults?: string, printType?: string },
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number
 * }} params
 * @returns {Promise<{ status: number, body: Record<string, any> }>}
 */
export async function proxyGoogleBooksVolumes({
  query,
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 7500,
}) {
  const q = String(query?.q || '').trim();
  if (!q || q.length > 300) {
    return {
      status: 400,
      body: {
        error: {
          code: 400,
          message: 'Query parameter "q" is required (1–300 characters).',
        },
        keyConfigured: Boolean(String(apiKey || '').trim()),
      },
    };
  }

  const parsedMax = Number.parseInt(String(query?.maxResults || '8'), 10);
  const clampedMax = Number.isFinite(parsedMax) ? String(Math.min(20, Math.max(1, parsedMax))) : '8';
  const printType = query?.printType === 'magazines' ? 'magazines' : 'books';

  const trimmedKey = String(apiKey || '').trim();
  const keyConfigured = Boolean(trimmedKey);

  const upstreamParams = new URLSearchParams({
    q,
    maxResults: clampedMax,
    printType,
  });
  if (keyConfigured) {
    upstreamParams.set('key', trimmedKey);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamRes = await fetchImpl(`${GOOGLE_BOOKS_UPSTREAM}?${upstreamParams.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    const rawText = await upstreamRes.text();
    /** @type {any} */
    let parsed = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = null;
    }

    if (!upstreamRes.ok) {
      const upstreamDetail =
        parsed && typeof parsed === 'object' && typeof parsed.error?.message === 'string'
          ? parsed.error.message
          : upstreamRes.statusText || 'Upstream Google Books error';

      const safeMessage = explainGoogleBooksQuotaError(
        `HTTP ${upstreamRes.status}: ${redactApiKeyFromText(upstreamDetail, trimmedKey)}`,
        { keyConfigured }
      );

      return {
        status: upstreamRes.status,
        body: {
          error: {
            code: upstreamRes.status,
            message: safeMessage,
          },
          keyConfigured,
        },
      };
    }

    const sanitized = sanitizeUpstreamPayload(parsed || { items: [] }, trimmedKey);
    return {
      status: 200,
      body: {
        totalItems: typeof sanitized?.totalItems === 'number' ? sanitized.totalItems : 0,
        items: Array.isArray(sanitized?.items) ? sanitized.items : [],
        keyConfigured,
      },
    };
  } catch (err) {
    const rawErrMsg = err instanceof Error ? err.message : 'Upstream network error';
    const safeErrMsg = redactApiKeyFromText(rawErrMsg, trimmedKey);
    return {
      status: 502,
      body: {
        error: {
          code: 502,
          message: `Google Books proxy could not reach upstream API: ${safeErrMsg}`,
        },
        keyConfigured,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
