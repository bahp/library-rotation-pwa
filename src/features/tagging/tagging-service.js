/**
 * @fileoverview Tagging & Enrichment Orchestrator Service.
 * Combines fast offline rule-based tagging (`rule-tagger.js`) with optional, explicit user-opt-in
 * AI enrichment adapters (`ai-tag-adapter.js`), enforcing bounded timeouts and graceful fallback.
 */

import { enrichBookWithLocalRules, sanitizeTagList } from './rule-tagger.js';
import {
  createBrowserPromptApiAdapter,
  createCustomEndpointAiAdapter,
} from './ai-tag-adapter.js';

/**
 * @typedef {Object} BookEnrichmentResult
 * @property {string[]} tags
 * @property {string[]} addedTags
 * @property {number} ageMin
 * @property {number} ageMax
 * @property {import('../../types/models.js').ReadingStage} readingStage
 * @property {string} readingLevelHint
 * @property {boolean} usedAi
 * @property {string} adapterId
 * @property {string} [fallbackReason]
 * @property {import('../../types/models.js').ProviderSource} [aiProvenance]
 */

/**
 * Creates the Tagging & AI Enrichment orchestrator.
 * @param {{
 *   adapters?: import('./ai-tag-adapter.js').AiTagEnrichmentAdapter[],
 *   fetchImpl?: typeof fetch,
 *   globalScope?: Record<string, any>
 * }} [config]
 */
export function createTaggingService(config = {}) {
  /** @type {import('./ai-tag-adapter.js').AiTagEnrichmentAdapter[]} */
  const adapters = config.adapters
    ? [...config.adapters]
    : [
        createBrowserPromptApiAdapter({ globalScope: config.globalScope }),
        createCustomEndpointAiAdapter({ fetchImpl: config.fetchImpl }),
      ];

  /**
   * Registers or replaces an optional AI enrichment adapter at runtime.
   * @param {import('./ai-tag-adapter.js').AiTagEnrichmentAdapter} adapter
   */
  function registerAdapter(adapter) {
    if (!adapter || !adapter.id) {
      throw new Error('Adapter must define a non-empty string id.');
    }
    const existingIdx = adapters.findIndex((a) => a.id === adapter.id);
    if (existingIdx >= 0) {
      adapters[existingIdx] = adapter;
    } else {
      adapters.push(adapter);
    }
  }

  /**
   * Returns metadata and live availability diagnostics for all registered AI adapters.
   * @param {import('../../types/models.js').AppSettings} settings
   */
  function getAdapterDiagnostics(settings) {
    return adapters.map((adapter) => {
      const status = adapter.checkAvailability(settings);
      return {
        id: adapter.id,
        label: adapter.label,
        transportKind: adapter.transportKind,
        privacyNote: adapter.privacyNote,
        available: status.available,
        reason: status.reason,
      };
    });
  }

  /**
   * Enriches a book record using Local Rules first, then optionally merges output from the
   * user-selected AI adapter ONLY when `settings.aiEnrichmentOptIn === true`.
   *
   * @param {import('./ai-tag-adapter.js').TaggingBookInput} bookInput
   * @param {import('../../types/models.js').AppSettings} settings
   * @param {{ forceLocalRules?: boolean, preserveExplicitAgeAndStage?: boolean }} [options]
   * @returns {Promise<BookEnrichmentResult>}
   */
  async function enrichBook(bookInput, settings, options = {}) {
    const shouldRunLocal = options.forceLocalRules || settings.autoLocalTagging !== false;

    const baseLocal = shouldRunLocal
      ? enrichBookWithLocalRules(bookInput, {
          preserveExplicitAgeAndStage: options.preserveExplicitAgeAndStage,
        })
      : {
          tags: sanitizeTagList(bookInput.tags || [], 8),
          addedTags: [],
          ageMin: typeof bookInput.ageMin === 'number' ? bookInput.ageMin : 3,
          ageMax: typeof bookInput.ageMax === 'number' ? bookInput.ageMax : 7,
          readingStage: bookInput.readingStage || 'picture-book',
          readingLevelHint: '',
        };

    // Strict Privacy & Safe-Default Gate: NEVER invoke AI adapters unless explicitly opted in
    if (!settings.aiEnrichmentOptIn) {
      return {
        ...baseLocal,
        usedAi: false,
        adapterId: 'local-rules',
        fallbackReason: 'ai-opt-in-disabled',
      };
    }

    const adapter =
      adapters.find((a) => a.id === settings.aiAdapterId) || adapters[0] || null;

    if (!adapter) {
      return {
        ...baseLocal,
        usedAi: false,
        adapterId: 'local-rules',
        fallbackReason: 'no-adapter-registered',
      };
    }

    const availability = adapter.checkAvailability(settings);
    if (!availability.available) {
      return {
        ...baseLocal,
        usedAi: false,
        adapterId: 'local-rules',
        fallbackReason: availability.reason,
      };
    }

    const timeoutMs = Math.max(1000, Math.min(20000, Number(settings.aiTimeoutMs) || 6000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const aiResult = await adapter.enrichBook(
        {
          ...bookInput,
          tags: baseLocal.tags,
        },
        {
          settings,
          signal: controller.signal,
        }
      );

      const originalSet = new Set(sanitizeTagList(bookInput.tags || [], 8));
      const mergedTags = sanitizeTagList([...baseLocal.tags, ...aiResult.tags], 8);
      const addedTags = mergedTags.filter((t) => !originalSet.has(t));

      const finalAgeMin =
        !options.preserveExplicitAgeAndStage && aiResult.ageMin !== undefined
          ? aiResult.ageMin
          : baseLocal.ageMin;
      const finalAgeMax =
        !options.preserveExplicitAgeAndStage && aiResult.ageMax !== undefined
          ? Math.max(finalAgeMin, aiResult.ageMax)
          : Math.max(finalAgeMin, baseLocal.ageMax);
      const finalStage =
        !options.preserveExplicitAgeAndStage && aiResult.readingStage
          ? aiResult.readingStage
          : baseLocal.readingStage;

      const finalHint = aiResult.readingLevelHint || baseLocal.readingLevelHint;

      return {
        tags: mergedTags,
        addedTags,
        ageMin: finalAgeMin,
        ageMax: finalAgeMax,
        readingStage: finalStage,
        readingLevelHint: finalHint,
        usedAi: true,
        adapterId: adapter.id,
        aiProvenance: {
          provider: `ai:${adapter.id}`,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      const reason =
        controller.signal.aborted
          ? `Adapter "${adapter.label}" timed out after ${timeoutMs}ms — used Local Rules.`
          : err instanceof Error
            ? err.message
            : 'AI adapter failed — used Local Rules.';

      return {
        ...baseLocal,
        usedAi: false,
        adapterId: 'local-rules',
        fallbackReason: reason,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Probes the currently configured tagging pipeline using a safe public-domain sample record
   * so users can verify their Settings provider setup without mutating their catalog.
   *
   * @param {import('../../types/models.js').AppSettings} settings
   */
  async function testAdapterConnection(settings) {
    const sampleBook = {
      title: 'The Snowy Day',
      authors: ['Ezra Jack Keats'],
      format: /** @type {const} */ ('hardcover'),
      pageCount: 40,
      summary: 'A young boy explores crisp winter snow drifts in his neighborhood.',
    };
    return enrichBook(sampleBook, settings, { forceLocalRules: true });
  }

  return {
    getAdapters: () => [...adapters],
    registerAdapter,
    getAdapterDiagnostics,
    enrichBook,
    testAdapterConnection,
  };
}
