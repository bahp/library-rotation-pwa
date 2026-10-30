/**
 * @fileoverview Pluggable Optional AI Enrichment Adapters for Library Rotation.
 *
 * Security & Privacy Architecture:
 * - Zero secrets or API keys in frontend source or browser storage.
 * - Adapters never run unless `settings.aiEnrichmentOptIn === true`.
 * - Ships with two keyless built-in adapters:
 *   1) `browser-prompt-api`: Uses on-device W3C/Chromium `LanguageModel` (`window.ai`) so
 *      book metadata never leaves the phone/computer.
 *   2) `custom-endpoint`: Sends sanitized public book metadata to a user-owned HTTPS or
 *      localhost proxy webhook (e.g. Cloudflare Worker / Cloud Run `/api/enrich` / local Ollama
 *      bridge) and rejects URLs containing embedded API keys or insecure remote HTTP.
 * - Custom adapters can be registered at runtime via `TaggingService.registerAdapter(...)`.
 */

import { sanitizeTagList, VALID_READING_STAGES } from './rule-tagger.js';

/**
 * @typedef {Object} TaggingBookInput
 * @property {string} title
 * @property {string[]} [authors]
 * @property {string} [isbn13]
 * @property {import('../../types/models.js').BookFormat} [format]
 * @property {number} [pageCount]
 * @property {number} [publishedYear]
 * @property {number} [ageMin]
 * @property {number} [ageMax]
 * @property {import('../../types/models.js').ReadingStage} [readingStage]
 * @property {string[]} [tags]
 * @property {string} [summary]
 * @property {string[]} [subjects]
 */

/**
 * @typedef {Object} AiEnrichmentPayload
 * @property {string[]} tags
 * @property {number} [ageMin]
 * @property {number} [ageMax]
 * @property {import('../../types/models.js').ReadingStage} [readingStage]
 * @property {string} [readingLevelHint]
 */

/**
 * @typedef {Object} AiTagEnrichmentAdapter
 * @property {string} id - Unique adapter identifier (e.g. 'browser-prompt-api', 'custom-endpoint')
 * @property {string} label - Concise human-facing title
 * @property {'on-device' | 'proxy-webhook' | 'custom'} transportKind
 * @property {string} privacyNote - Clear explanation of what data goes where
 * @property {(settings: import('../../types/models.js').AppSettings) => { available: boolean, reason: string }} checkAvailability
 * @property {(input: TaggingBookInput, context: { settings: import('../../types/models.js').AppSettings, signal?: AbortSignal }) => Promise<AiEnrichmentPayload>} enrichBook
 */

const SECRET_QUERY_PARAM_PATTERN = /(?:^|[?&])(api[-_]?key|key|token|secret|auth|bearer|password)=/i;

/**
 * Validates a user-configured keyless webhook/proxy URL.
 * Allows `https://` endpoints or loopback `http://localhost` / `http://127.0.0.1` for local bridges,
 * and rejects embedded query-string credentials so secrets are never persisted in browser state.
 *
 * @param {string | undefined | null} rawUrl
 * @returns {{ valid: boolean, normalizedUrl: string, error?: string }}
 */
export function validateProxyEndpointUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Enter an HTTPS proxy URL (or http://localhost port) to use the Custom Proxy adapter.',
    };
  }

  // Allow same-origin relative proxy paths such as `/api/enrich-book`
  if (trimmed.startsWith('/api/')) {
    if (SECRET_QUERY_PARAM_PATTERN.test(trimmed)) {
      return {
        valid: false,
        normalizedUrl: '',
        error: 'Do not include API keys or tokens in the endpoint URL. Keep credentials server-side.',
      };
    }
    return { valid: true, normalizedUrl: trimmed };
  }

  /** @type {URL} */
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Endpoint must be a valid URL starting with https://, http://localhost, or /api/.',
    };
  }

  if (parsed.username || parsed.password || SECRET_QUERY_PARAM_PATTERN.test(parsed.search)) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Do not embed credentials or API keys in the endpoint URL. Authenticate inside your proxy.',
    };
  }

  const isLoopbackHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (parsed.protocol !== 'https:' && !isLoopbackHttp) {
    return {
      valid: false,
      normalizedUrl: '',
      error: 'Remote proxy endpoints must use HTTPS (http:// is only allowed for localhost).',
    };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

/**
 * Extracts and parses a JSON object from raw model text (tolerating markdown code fences).
 * @param {string} rawText
 * @returns {Record<string, unknown>}
 */
export function parseLooseJsonObject(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const slice =
    firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;

  const parsed = JSON.parse(slice);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI adapter response did not contain a JSON object.');
  }
  return /** @type {Record<string, unknown>} */ (parsed);
}

/**
 * Sanitizes and clamps untrusted AI/webhook JSON output into a safe `AiEnrichmentPayload`.
 * @param {unknown} raw
 * @returns {AiEnrichmentPayload}
 */
export function normalizeAiEnrichmentPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid AI enrichment payload.');
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);

  const rawTags = Array.isArray(obj.tags) ? obj.tags : [];
  const tags = sanitizeTagList(rawTags, 8);

  /** @type {number | undefined} */
  let ageMin;
  /** @type {number | undefined} */
  let ageMax;
  if (typeof obj.ageMin === 'number' && Number.isFinite(obj.ageMin)) {
    ageMin = Math.max(0, Math.min(14, Math.trunc(obj.ageMin)));
  }
  if (typeof obj.ageMax === 'number' && Number.isFinite(obj.ageMax)) {
    ageMax = Math.max(ageMin ?? 1, Math.min(16, Math.trunc(obj.ageMax)));
  }

  /** @type {import('../../types/models.js').ReadingStage | undefined} */
  let readingStage;
  if (typeof obj.readingStage === 'string' && VALID_READING_STAGES.has(obj.readingStage)) {
    readingStage = /** @type {import('../../types/models.js').ReadingStage} */ (obj.readingStage);
  }

  /** @type {string | undefined} */
  let readingLevelHint;
  if (typeof obj.readingLevelHint === 'string' && obj.readingLevelHint.trim()) {
    readingLevelHint = obj.readingLevelHint.trim().replace(/\s+/g, ' ').slice(0, 96);
  }

  return {
    tags,
    ...(ageMin !== undefined ? { ageMin } : {}),
    ...(ageMax !== undefined ? { ageMax } : {}),
    ...(readingStage ? { readingStage } : {}),
    ...(readingLevelHint ? { readingLevelHint } : {}),
  };
}

/**
 * Resolves the on-device browser Prompt API factory if supported by the current browser.
 * Supports both `globalThis.LanguageModel` (Chromium standard) and `globalThis.ai.languageModel`.
 *
 * @param {Record<string, any>} scope
 * @returns {{ create: (opts?: Record<string, any>) => Promise<{ prompt: (input: string, opts?: Record<string, any>) => Promise<string>, destroy?: () => void }> } | null}
 */
function resolveBrowserLanguageModelFactory(scope) {
  if (!scope || typeof scope !== 'object') return null;
  if (scope['LanguageModel'] && typeof scope['LanguageModel'].create === 'function') {
    return scope['LanguageModel'];
  }
  if (
    scope['ai'] &&
    scope['ai'].languageModel &&
    typeof scope['ai'].languageModel.create === 'function'
  ) {
    return scope['ai'].languageModel;
  }
  return null;
}

/**
 * Built-in Adapter 1: On-Device Browser Prompt API (`window.LanguageModel` / `window.ai`).
 * Runs 100% locally inside supported browsers with zero network traffic and zero API keys.
 *
 * @param {{ globalScope?: Record<string, any> }} [options]
 * @returns {AiTagEnrichmentAdapter}
 */
export function createBrowserPromptApiAdapter(options = {}) {
  const scope = /** @type {Record<string, any>} */ (options.globalScope || globalThis);

  return {
    id: 'browser-prompt-api',
    label: 'On-Device Browser AI (Prompt API)',
    transportKind: 'on-device',
    privacyNote:
      'Runs locally inside browsers supporting the W3C/Chromium on-device LanguageModel API. Zero book data or keys leave your device.',

    checkAvailability() {
      const factory = resolveBrowserLanguageModelFactory(scope);
      if (!factory) {
        return {
          available: false,
          reason:
            'On-device Prompt API not detected in this browser — automatic fallback to Local Rules is active.',
        };
      }
      return {
        available: true,
        reason: 'On-device Browser LanguageModel API detected and ready.',
      };
    },

    async enrichBook(input, context) {
      const factory = resolveBrowserLanguageModelFactory(scope);
      if (!factory) {
        throw new Error('On-device Browser Prompt API is unavailable in this browser.');
      }

      const session = await factory.create({
        systemPrompt:
          'You are a children’s librarian cataloging assistant. Respond ONLY with compact valid JSON matching {"tags":["lowercase-topic"],"ageMin":3,"ageMax":7,"readingStage":"picture-book","readingLevelHint":"short pacing note"}. Allowed readingStage values: board-toddler, picture-book, early-reader, chapter-book.',
      });

      try {
        const prompt = JSON.stringify({
          title: input.title,
          authors: input.authors || [],
          format: input.format || 'hardcover',
          pageCount: input.pageCount || null,
          subjects: (input.subjects || []).slice(0, 10),
          existingTags: input.tags || [],
          summary: (input.summary || '').slice(0, 280),
        });
        const rawReply = await session.prompt(
          `Suggest up to 6 normalized children's theme tags (e.g. christmas, winter, nature, animals, space, bedtime, feelings, rhyme) and reading level metadata for: ${prompt}`,
          context.signal ? { signal: context.signal } : undefined
        );
        return normalizeAiEnrichmentPayload(parseLooseJsonObject(rawReply));
      } finally {
        if (typeof session.destroy === 'function') {
          try {
            session.destroy();
          } catch (_) {}
        }
      }
    },
  };
}

/**
 * Built-in Adapter 2: Keyless Custom Proxy / Localhost Bridge Webhook.
 * Posts sanitized public book fields to an HTTPS proxy or `http://localhost` service.
 *
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {AiTagEnrichmentAdapter}
 */
export function createCustomEndpointAiAdapter(options = {}) {
  const fetchFn =
    options.fetchImpl ||
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

  return {
    id: 'custom-endpoint',
    label: 'Keyless Proxy / Localhost Webhook',
    transportKind: 'proxy-webhook',
    privacyNote:
      'Sends public book title, author, format, and summary JSON to your configured HTTPS proxy or localhost bridge. Never accepts client-side API keys.',

    checkAvailability(settings) {
      if (!fetchFn) {
        return { available: false, reason: 'Fetch API unavailable in current runtime.' };
      }
      const check = validateProxyEndpointUrl(settings.aiEndpointUrl);
      if (!check.valid) {
        return {
          available: false,
          reason: check.error || 'Proxy endpoint URL not configured.',
        };
      }
      return {
        available: true,
        reason: `Configured proxy endpoint ready (${check.normalizedUrl}).`,
      };
    },

    async enrichBook(input, context) {
      if (!fetchFn) {
        throw new Error('Fetch API unavailable.');
      }
      const urlCheck = validateProxyEndpointUrl(context.settings.aiEndpointUrl);
      if (!urlCheck.valid) {
        throw new Error(urlCheck.error || 'Invalid AI proxy endpoint URL.');
      }

      const response = await fetchFn(urlCheck.normalizedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          task: 'library-rotation-book-enrichment-v1',
          book: {
            title: input.title,
            authors: input.authors || [],
            isbn13: input.isbn13 || '',
            format: input.format || 'hardcover',
            pageCount: input.pageCount || null,
            publishedYear: input.publishedYear || null,
            existingTags: input.tags || [],
            subjects: (input.subjects || []).slice(0, 10),
            summary: (input.summary || '').slice(0, 320),
          },
        }),
        signal: context.signal,
      });

      if (!response.ok) {
        throw new Error(`Proxy endpoint returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      const targetPayload =
        data && typeof data === 'object' && 'enrichment' in data ? data.enrichment : data;
      return normalizeAiEnrichmentPayload(targetPayload);
    },
  };
}
