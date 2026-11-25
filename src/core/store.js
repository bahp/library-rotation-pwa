/**
 * @fileoverview Observable application state store with domain actions, Phase 4 Rotation Engine,
 * Phase 5 Tagging & Optional AI Enrichment integration, and theme synchronization.
 */

import {
  computeAgeFromBirthDate,
  createId,
  formatCollectionStatus,
  inferReadingStageFromAge,
  isBookRotatable,
  normalizeBirthDate,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeIsbn,
  normalizeOwnersList,
  resolveBookTagOrigin,
} from '../types/models.js';
import { createSeedState } from '../data/seed.js';
import {
  clearAuxiliaryLocalStorageKeys,
  clearQaUserSnapshot,
  createEmptyOnboardingState,
  createSafeDefaultSettings,
  deleteBookAudioBlob,
  isValidAppState,
  loadQaUserSnapshot,
  migrateState,
  resolveNotificationDedupeKey,
  saveBookAudioBlob,
  saveQaUserSnapshot,
} from './storage.js';
import {
  candidateToBook,
  cleanBookDescription,
  cleanProviderExternalId,
  sanitizeCoverUrl,
} from '../features/catalog/normalizer.js';
import {
  extractCoverPaletteFromUrl,
  normalizeHexColor,
} from '../features/catalog/cover-color-extractor.js';
import {
  applyBookAdditions,
  applyBookReplacement,
  computeRedrawnRotationBooks,
  findMatchingNewBooksForRotation,
  generateRotationSelection,
  pickRandomEligibleBooks,
} from '../features/rotations/rotation-engine.js';
import {
  buildAiLibraryUsageContext,
  computeBookUsageSummary,
  recordBooksRotated,
  syncRotationSlotAddedAt,
} from '../features/rotations/usage-insights.js';
import { DEFAULT_ROTATION_PRESETS } from '../data/rotation-presets-config.js';
import {
  findMatchingStartDatePresets,
  getAllRotationPresets,
  normalizeRotationPresetInput,
} from '../features/rotations/rotation-presets.js';
import { computeRotationSchedule } from '../features/rotations/rotation-schedule.js';
import {
  inferReadingLevelHint,
  sanitizeTag,
  sanitizeTagList,
  stripDiacritics,
} from '../features/tagging/rule-tagger.js';
import { createTaggingService } from '../features/tagging/tagging-service.js';
import {
  normalizeBookCardShadow,
  normalizeLanguage,
  normalizePositiveBookCount,
  resolveEffectiveThemeConfig,
} from '../config/index.js';
import {
  queryBookCategorizedTags,
  querySmartRotationPlan,
  queryLibraryRecommendations,
} from '../features/llm/llm-client.js';

const SPINE_COLORS = ['teal', 'indigo', 'amber', 'rose', 'emerald'];

/**
 * Applies light/dark class, `data-theme`, `data-card-shadow`, `<meta name="theme-color">`, and `<html lang>`
 * on document.documentElement according to user preference, active theme preset, and card shadow setting.
 * @param {import('../types/models.js').ThemeMode} theme
 * @param {string} [language]
 * @param {string} [themePreset]
 * @param {import('../types/models.js').BookCardShadowMode} [bookCardShadow]
 */
export function applyThemeToDom(theme, language = 'en', themePreset, bookCardShadow = 'subtle') {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveConfig = resolveEffectiveThemeConfig(theme, themePreset, prefersDark);
  const isDark = effectiveConfig.mode === 'dark';
  const effectiveShadow = normalizeBookCardShadow(bookCardShadow);

  try {
    if (typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('lr_theme_pref', theme);
      if (themePreset || effectiveConfig.id) {
        window.localStorage.setItem('lr_theme_preset', String(themePreset || effectiveConfig.id));
      }
      window.localStorage.setItem('lr_card_shadow', effectiveShadow);
    }
  } catch (_) {}

  document.documentElement.classList.toggle('dark', isDark);
  if (document.documentElement.dataset) {
    document.documentElement.dataset.theme = effectiveConfig.id;
    document.documentElement.dataset.cardShadow = effectiveShadow;
  } else if (typeof document.documentElement.setAttribute === 'function') {
    document.documentElement.setAttribute('data-theme', effectiveConfig.id);
    document.documentElement.setAttribute('data-card-shadow', effectiveShadow);
  }
  if (typeof document.documentElement.setAttribute === 'function') {
    document.documentElement.setAttribute('lang', normalizeLanguage(language));
  }
  const themeMeta =
    document.getElementById('lr-theme-color') ||
    document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', effectiveConfig.themeColorHex);
  }
}

/**
 * Builds the optional per-book usage context passed to opted-in AI enrichment adapters.
 * @param {import('../types/models.js').Book} book
 * @param {import('../types/models.js').AppState} currentState
 */
function buildBookUsagePayload(book, currentState) {
  const activeProfile =
    currentState.profiles.find((p) => p.id === currentState.activeProfileId) ||
    currentState.profiles[0] ||
    null;
  const usage = computeBookUsageSummary(book, {
    profiles: currentState.profiles,
    rotations: currentState.rotations,
    activeProfile,
    staleBookDays: currentState.settings?.staleBookDays ?? 10,
  });
  return {
    loved: usage.loved,
    collectionStatus: book.collectionStatus || 'owned',
    freshnessTier: usage.freshnessTier,
    rotationCount: usage.rotationCount,
    lastRotatedAt: usage.lastRotatedAt,
    daysSinceLastRotated: usage.daysSinceLastRotated,
    rotationsSinceLastOut: usage.rotationsSinceLastOut,
    inCooldown: usage.inCooldown,
    isCurrentlyOnActiveShelf: usage.isCurrentlyOnActiveShelf,
    daysOnActiveShelf: usage.daysOnActiveShelf,
    isStaleUnreadOnShelf: usage.isStaleUnreadOnShelf,
    isReadByActiveProfile: usage.isReadByActiveProfile,
    lastReadAt: usage.lastReadAt,
  };
}

const TAG_ORIGIN_PRIORITY = {
  manual: 4,
  provider: 3,
  ai: 2,
  rules: 1,
};

/**
 * Merges tag origin provenance for the surviving `tags` list, preserving higher-trust origins
 * (`manual` > `provider` > `ai` > `rules`).
 *
 * @param {Record<string, import('../types/models.js').TagOrigin> | undefined} existingOrigins
 * @param {string[]} tags
 * @param {{
 *   manual?: string[],
 *   provider?: string[],
 *   ai?: string[],
 *   rules?: string[]
 * }} [additions]
 * @returns {Record<string, import('../types/models.js').TagOrigin> | undefined}
 */
function mergeTagOrigins(existingOrigins, tags, additions = {}) {
  const cleanTags = Array.isArray(tags) ? tags : [];
  if (cleanTags.length === 0) return undefined;

  /** @type {Record<string, import('../types/models.js').TagOrigin>} */
  const next = {};
  const tagSet = new Set(cleanTags);

  if (existingOrigins && typeof existingOrigins === 'object') {
    for (const tag of cleanTags) {
      const origin = existingOrigins[tag];
      if (origin && TAG_ORIGIN_PRIORITY[origin]) {
        next[tag] = origin;
      }
    }
  }

  /** @type {Array<[import('../types/models.js').TagOrigin, string[] | undefined]>} */
  const layers = [
    ['rules', additions.rules],
    ['ai', additions.ai],
    ['provider', additions.provider],
    ['manual', additions.manual],
  ];

  for (const [origin, list] of layers) {
    if (!Array.isArray(list)) continue;
    for (const rawTag of list) {
      if (!tagSet.has(rawTag)) continue;
      const prev = next[rawTag];
      if (!prev || TAG_ORIGIN_PRIORITY[origin] > TAG_ORIGIN_PRIORITY[prev]) {
        next[rawTag] = origin;
      }
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Normalizes a cover tint mode string to one of the valid modes.
 * @param {unknown} rawMode
 * @returns {import('../types/models.js').DynamicCoverTintMode}
 */
function normalizeTintMode(rawMode) {
  return rawMode === 'dominant' || rawMode === 'soft' ? rawMode : 'prominent';
}

/**
 * Normalizes an optional array of `#RRGGBB` palette swatches.
 * @param {unknown} rawSwatches
 * @returns {string[] | undefined}
 */
function normalizeSwatchList(rawSwatches) {
  if (!Array.isArray(rawSwatches)) return undefined;
  const cleaned = [];
  const seen = new Set();
  for (const item of rawSwatches) {
    const hex = normalizeHexColor(typeof item === 'string' ? item : '');
    if (hex && !seen.has(hex)) {
      seen.add(hex);
      cleaned.push(hex);
      if (cleaned.length >= 6) break;
    }
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Creates the central Library Rotation store.
 * @param {ReturnType<typeof import('./storage.js').createStorageAdapter>} storage
 * @param {{ taggingService?: ReturnType<typeof createTaggingService> }} [deps]
 */
export function createAppStore(storage, deps = {}) {
  const tagging = deps.taggingService || createTaggingService();
  /** @type {import('../types/models.js').AppState} */
  let state = createSeedState();
  /** @type {{ id: string, message: string, tone: 'success' | 'error' | 'info' } | null} */
  let toast = null;

  /**
   * Silently extracts & saves cover tint palette onto a newly added or updated book in browser environments.
   * @param {string} bookId
   * @param {string} coverUrl
   * @param {{ mode?: import('../types/models.js').DynamicCoverTintMode }} [options]
   */
  function resolveAndPersistBookCoverTint(bookId, coverUrl, options = {}) {
    if (
      !bookId ||
      !coverUrl ||
      typeof document === 'undefined' ||
      typeof Image === 'undefined'
    ) {
      return;
    }
    const mode = normalizeTintMode(options.mode || state.settings?.dynamicCoverTintMode);
    extractCoverPaletteFromUrl(coverUrl, { mode })
      .then((palette) => {
        if (!palette || !palette.primary) return;
        const latest = state.books.find((b) => b.id === bookId);
        if (!latest || latest.coverUrl !== coverUrl) return;
        if (latest.dominantColorSource === 'manual') return;
        const swatches = normalizeSwatchList(palette.swatches);
        const alreadySame =
          normalizeHexColor(latest.dominantColor) === palette.primary &&
          latest.dominantColorMode === mode &&
          JSON.stringify(latest.dominantColorSwatches || []) === JSON.stringify(swatches || []);
        if (alreadySame) return;
        return commit({
          ...state,
          books: state.books.map((b) =>
            b.id === bookId
              ? {
                  ...b,
                  dominantColor: palette.primary || undefined,
                  dominantColorSource: 'auto',
                  dominantColorMode: mode,
                  ...(swatches ? { dominantColorSwatches: swatches } : {}),
                }
              : b
          ),
        });
      })
      .catch(() => {});
  }
  let initialized = false;

  /** @type {Set<() => void>} */
  const listeners = new Set();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  /**
   * Commits a state update and persists asynchronously.
   * @param {import('../types/models.js').AppState} next
   */
  async function commit(next) {
    state = migrateState(next);
    applyThemeToDom(
      state.settings.theme,
      state.settings.language,
      state.settings.themePreset,
      state.settings.bookCardShadow
    );
    emit();
    await storage.save(state);
  }

  /**
   * Initializes store from browser storage and binds OS color-scheme listener.
   */
  async function init() {
    state = await storage.load();
    initialized = true;
    applyThemeToDom(
      state.settings.theme,
      state.settings.language,
      state.settings.themePreset,
      state.settings.bookCardShadow
    );

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', () => {
        if (state.settings.theme === 'system') {
          applyThemeToDom(
            'system',
            state.settings.language,
            state.settings.themePreset,
            state.settings.bookCardShadow
          );
        }
      });
    }
    emit();
  }

  /**
   * Shows a transient status banner/toast.
   * @param {string} message
   * @param {'success' | 'error' | 'info'} [tone]
   */
  function notify(message, tone = 'success') {
    const id = createId('toast');
    toast = { id, message, tone };
    emit();
    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        if (toast && toast.id === id) {
          toast = null;
          emit();
        }
      }, 3600);
    }
  }

  function dismissToast() {
    toast = null;
    emit();
  }

  /**
   * Switches the active child profile.
   * @param {string} profileId
   */
  async function setActiveProfile(profileId) {
    if (!state.profiles.some((p) => p.id === profileId)) return;
    await commit({ ...state, activeProfileId: profileId });
  }

  /**
   * Creates a new child profile (computing age automatically from `birthDate` when provided) and makes it active.
   * @param {{
   *   name: string,
   *   birthDate?: string,
   *   age?: number,
   *   readingStage?: import('../types/models.js').ReadingStage,
   *   favoriteTopics: string[],
   *   defaultRotationSize: number,
   *   cooldownDays: number,
   *   avatarTone: string
   * }} input
   */
  async function addProfile(input) {
    const name = input.name.trim();
    if (!name) throw new Error('Child name is required.');

    const dobCheck = normalizeBirthDate(input.birthDate);
    if (!dobCheck.valid) {
      throw new Error(dobCheck.error || 'Invalid birth date.');
    }

    const computedAge = dobCheck.birthDate
      ? computeAgeFromBirthDate(dobCheck.birthDate)
      : null;
    const effectiveAge =
      computedAge !== null
        ? computedAge
        : Math.max(0, Math.min(120, Number.isFinite(Number(input.age)) ? Number(input.age) : 4));

    /** @type {import('../types/models.js').ChildProfile} */
    const profile = {
      id: createId('profile'),
      name,
      ...(dobCheck.birthDate ? { birthDate: dobCheck.birthDate } : {}),
      age: effectiveAge,
      readingStage: input.readingStage || inferReadingStageFromAge(effectiveAge),
      favoriteTopics: (input.favoriteTopics || []).filter(Boolean),
      defaultRotationSize: normalizePositiveBookCount(input.defaultRotationSize, 5),
      cooldownDays: Math.max(0, Math.min(90, Number(input.cooldownDays) || 14)),
      avatarTone: input.avatarTone || 'teal',
      readHistoryBookIds: [],
      createdAt: new Date().toISOString(),
    };
    await commit({
      ...state,
      activeProfileId: profile.id,
      profiles: [...state.profiles, profile],
    });
    notify(`Created reader profile for ${profile.name}.`, 'success');
    return profile;
  }

  /**
   * Updates an existing child profile (automatically recomputing `age` when `birthDate` is provided).
   * @param {string} profileId
   * @param {{
   *   name?: string,
   *   birthDate?: string,
   *   age?: number,
   *   readingStage?: import('../types/models.js').ReadingStage,
   *   favoriteTopics?: string[],
   *   defaultRotationSize?: number,
   *   cooldownDays?: number,
   *   avatarTone?: string
   * }} patch
   */
  async function updateProfile(profileId, patch) {
    const existing = state.profiles.find((p) => p.id === profileId);
    if (!existing) throw new Error('Reader profile not found.');

    const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
    if (!nextName) throw new Error('Child name is required.');

    let nextBirthDate = existing.birthDate;
    if (patch.birthDate !== undefined) {
      const dobCheck = normalizeBirthDate(patch.birthDate);
      if (!dobCheck.valid) {
        throw new Error(dobCheck.error || 'Invalid birth date.');
      }
      nextBirthDate = dobCheck.birthDate || undefined;
    }

    const computedAge = nextBirthDate ? computeAgeFromBirthDate(nextBirthDate) : null;
    const nextAge =
      computedAge !== null
        ? computedAge
        : patch.age !== undefined
          ? Math.max(0, Math.min(120, Number(patch.age) || 0))
          : existing.age;

    /** @type {import('../types/models.js').ChildProfile} */
    const updated = {
      ...existing,
      name: nextName,
      age: nextAge,
      readingStage: patch.readingStage || existing.readingStage,
      favoriteTopics:
        patch.favoriteTopics !== undefined
          ? patch.favoriteTopics.filter(Boolean)
          : existing.favoriteTopics,
      defaultRotationSize:
        patch.defaultRotationSize !== undefined
          ? normalizePositiveBookCount(patch.defaultRotationSize, 5)
          : existing.defaultRotationSize,
      cooldownDays:
        patch.cooldownDays !== undefined
          ? Math.max(0, Math.min(90, Number(patch.cooldownDays) || 14))
          : existing.cooldownDays,
      avatarTone: patch.avatarTone || existing.avatarTone,
    };

    if (nextBirthDate) {
      updated.birthDate = nextBirthDate;
    } else {
      delete updated.birthDate;
    }

    await commit({
      ...state,
      profiles: state.profiles.map((p) => (p.id === profileId ? updated : p)),
    });
    notify(`Updated ${updated.name}’s profile.`, 'success');
    return updated;
  }

  /**
   * Deletes a child profile (preventing deletion of the last remaining profile).
   * @param {string} profileId
   */
  async function deleteProfile(profileId) {
    const onboardingStatus = state.settings.onboarding?.status;
    const isOnboardingActive = onboardingStatus === 'pending' || onboardingStatus === 'in_progress';
    if (state.profiles.length <= 1 && !isOnboardingActive) {
      notify('At least one reader profile is required.', 'error');
      return false;
    }
    const remaining = state.profiles.filter((p) => p.id !== profileId);
    const nextActive =
      state.activeProfileId === profileId ? (remaining[0]?.id || '') : state.activeProfileId;
    const remainingRotations = state.rotations.filter((r) => r.profileId !== profileId);
    await commit({
      ...state,
      activeProfileId: nextActive,
      profiles: remaining,
      rotations: remainingRotations,
    });
    notify('Removed reader profile.', 'info');
    return true;
  }

  /**
   * Adds a validated manual or pre-filled book to the family catalog.
   * @param {{
   *   title: string,
   *   authors: string[],
   *   isbn?: string,
   *   publishedYear?: number,
   *   pageCount?: number,
   *   coverUrl?: string,
   *   format: import('../types/models.js').BookFormat,
   *   ageMin: number,
   *   ageMax: number,
   *   readingStage: import('../types/models.js').ReadingStage,
   *   tags: string[],
   *   collectionStatus?: import('../types/models.js').CollectionStatus,
   *   condition?: import('../types/models.js').BookCondition,
   *   loved?: boolean,
   *   owners?: string[],
   *   dominantColor?: string,
   *   dominantColorSwatches?: string[],
   *   dominantColorMode?: import('../types/models.js').DynamicCoverTintMode,
   *   description?: string,
   *   notes?: string,
   *   needsScanReview?: boolean,
   *   sources?: import('../types/models.js').ProviderSource[]
   * }} input
   */
  async function addManualBook(input) {
    const title = input.title.trim();
    if (!title) {
      throw new Error('Book title is required.');
    }
    const isbnCheck = normalizeIsbn(input.isbn || '');
    if (!isbnCheck.valid) {
      throw new Error(isbnCheck.error || 'Invalid ISBN.');
    }
    if (isbnCheck.isbn13 && state.books.some((b) => b.isbn13 === isbnCheck.isbn13)) {
      throw new Error(`ISBN ${isbnCheck.isbn13} is already in your family library.`);
    }

    const now = new Date().toISOString();
    const colorIndex = (title.length + state.books.length) % SPINE_COLORS.length;
    const cleanCover = sanitizeCoverUrl(input.coverUrl);
    const pubYear =
      input.publishedYear && input.publishedYear >= 1800 && input.publishedYear <= 2100
        ? Math.trunc(input.publishedYear)
        : undefined;
    const pages =
      input.pageCount && input.pageCount > 0 ? Math.trunc(input.pageCount) : undefined;

    const incomingSources =
      Array.isArray(input.sources) && input.sources.length > 0
        ? input.sources.map((src) => {
            if (state.settings.retainRawProviderPayloads) return src;
            const { rawPayload: _omitted, ...rest } = src;
            return rest;
          })
        : [{ provider: 'manual', fetchedAt: now }];

    const cleanDescription = cleanBookDescription(input.description || '');
    const explicitAgeMin = Math.max(0, Number(input.ageMin) || 2);
    const explicitAgeMax = Math.max(explicitAgeMin, Number(input.ageMax) || 6);
    const explicitStage = input.readingStage || 'picture-book';
    const baseTags = sanitizeTagList(input.tags || [], 8);

    const enriched = await tagging.enrichBook(
      {
        title,
        authors: input.authors.length ? input.authors : ['Unknown Author'],
        isbn13: isbnCheck.isbn13,
        format: input.format || 'hardcover',
        pageCount: pages,
        publishedYear: pubYear,
        ageMin: explicitAgeMin,
        ageMax: explicitAgeMax,
        readingStage: explicitStage,
        tags: baseTags,
        ...(cleanDescription ? { summary: cleanDescription } : {}),
      },
      state.settings,
      { preserveExplicitAgeAndStage: true }
    );

    const finalSources = enriched.aiProvenance
      ? [...incomingSources, enriched.aiProvenance]
      : incomingSources;

    const collectionStatus = normalizeCollectionStatus(input.collectionStatus);
    const condition = normalizeBookCondition(input.condition);
    const loved = Boolean(input.loved);
    const parsedOwners = normalizeOwnersList(input.owners);
    const owners = parsedOwners.length > 0 ? parsedOwners : ['shared'];
    const dominantColor = normalizeHexColor(input.dominantColor);
    const dominantColorSwatches = normalizeSwatchList(input.dominantColorSwatches);
    const dominantColorMode =
      dominantColor || dominantColorSwatches
        ? normalizeTintMode(input.dominantColorMode || state.settings?.dynamicCoverTintMode)
        : undefined;
    const cleanNotes =
      typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 1000) : '';

    const tagOrigins = mergeTagOrigins(undefined, enriched.tags, {
      manual: baseTags,
      rules: enriched.ruleAddedTags,
      ai: enriched.aiAddedTags,
    });

    /** @type {import('../types/models.js').Book} */
    const book = {
      id: createId('book'),
      isbn13: isbnCheck.isbn13,
      ...(isbnCheck.isbn10 ? { isbn10: isbnCheck.isbn10 } : {}),
      title,
      authors: input.authors.length ? input.authors : ['Unknown Author'],
      ...(pubYear ? { publishedYear: pubYear } : {}),
      ...(pages ? { pageCount: pages } : {}),
      ...(cleanCover ? { coverUrl: cleanCover } : {}),
      ...(cleanDescription ? { description: cleanDescription } : {}),
      format: input.format || 'hardcover',
      ageMin: enriched.ageMin,
      ageMax: enriched.ageMax,
      readingStage: enriched.readingStage,
      ...(enriched.readingLevelHint ? { readingLevelHint: enriched.readingLevelHint } : {}),
      tags: enriched.tags,
      ...(tagOrigins ? { tagOrigins } : {}),
      collectionStatus,
      condition,
      loved,
      owners,
      ...(dominantColor ? { dominantColor: dominantColor, dominantColorSource: 'auto' } : {}),
      ...(dominantColorSwatches ? { dominantColorSwatches } : {}),
      ...(dominantColorMode ? { dominantColorMode } : {}),
      ...(cleanNotes ? { notes: cleanNotes } : {}),
      ...(input.needsScanReview ? { needsScanReview: true } : {}),
      spineColor: SPINE_COLORS[colorIndex],
      addedAt: now,
      sources: finalSources,
    };

    await commit({
      ...state,
      books: [book, ...state.books],
    });
    if (book.coverUrl && !book.dominantColor) {
      resolveAndPersistBookCoverTint(book.id, book.coverUrl);
    }
    const destLabel =
      collectionStatus === 'owned' ? 'your library' : formatCollectionStatus(collectionStatus);
    notify(`Added "${book.title}" to ${destLabel}.`, 'success');
    return book;
  }

  /**
   * Saves a normalized provider BookCandidate directly to the catalog in one tap,
   * applying local rule tagging + optional user-opt-in AI enrichment and optional
   * intake overrides (e.g. saving directly to Wishlist, Loved, or child owners).
   * @param {import('../features/catalog/normalizer.js').BookCandidate} candidate
   * @param {{
   *   collectionStatus?: import('../types/models.js').CollectionStatus,
   *   condition?: import('../types/models.js').BookCondition,
   *   loved?: boolean,
   *   owners?: string[],
   *   dominantColor?: string,
   *   dominantColorSwatches?: string[],
   *   dominantColorMode?: import('../types/models.js').DynamicCoverTintMode,
   *   notes?: string,
   *   needsScanReview?: boolean
   * }} [intakeOptions]
   */
  async function addBookFromCandidate(candidate, intakeOptions = {}) {
    if (candidate.isbn13 && state.books.some((b) => b.isbn13 === candidate.isbn13)) {
      throw new Error(`"${candidate.title}" (ISBN ${candidate.isbn13}) is already in your library.`);
    }
    const baseBook = candidateToBook(candidate, {
      retainRaw: state.settings.retainRawProviderPayloads,
    });

    const enriched = await tagging.enrichBook(
      {
        title: baseBook.title,
        authors: baseBook.authors,
        isbn13: baseBook.isbn13,
        format: baseBook.format,
        pageCount: baseBook.pageCount,
        publishedYear: baseBook.publishedYear,
        ageMin: baseBook.ageMin,
        ageMax: baseBook.ageMax,
        readingStage: baseBook.readingStage,
        tags: baseBook.tags,
        summary: candidate.summary || baseBook.description,
        subjects: candidate.subjects,
      },
      state.settings
    );

    const sources =
      enriched.aiProvenance &&
      !baseBook.sources.some((s) => s.provider === enriched.aiProvenance?.provider)
        ? [...baseBook.sources, enriched.aiProvenance]
        : baseBook.sources;

    const collectionStatus = normalizeCollectionStatus(intakeOptions.collectionStatus);
    const condition = normalizeBookCondition(intakeOptions.condition);
    const loved = Boolean(intakeOptions.loved);
    const parsedOwners = normalizeOwnersList(intakeOptions.owners);
    const owners = parsedOwners.length > 0 ? parsedOwners : ['shared'];
    const dominantColor = normalizeHexColor(intakeOptions.dominantColor);
    const dominantColorSwatches = normalizeSwatchList(intakeOptions.dominantColorSwatches);
    const dominantColorMode =
      dominantColor || dominantColorSwatches
        ? normalizeTintMode(intakeOptions.dominantColorMode || state.settings?.dynamicCoverTintMode)
        : undefined;
    const cleanNotes =
      typeof intakeOptions.notes === 'string' && intakeOptions.notes.trim()
        ? intakeOptions.notes.trim().slice(0, 1000)
        : '';

    const tagOrigins = mergeTagOrigins(baseBook.tagOrigins, enriched.tags, {
      rules: enriched.ruleAddedTags,
      ai: enriched.aiAddedTags,
    });

    /** @type {import('../types/models.js').Book} */
    const book = {
      ...baseBook,
      ageMin: enriched.ageMin,
      ageMax: enriched.ageMax,
      readingStage: enriched.readingStage,
      ...(enriched.readingLevelHint
        ? { readingLevelHint: enriched.readingLevelHint }
        : {}),
      tags: enriched.tags,
      ...(tagOrigins ? { tagOrigins } : {}),
      collectionStatus,
      condition,
      loved,
      owners,
      ...(dominantColor ? { dominantColor, dominantColorSource: 'auto' } : {}),
      ...(dominantColorSwatches ? { dominantColorSwatches } : {}),
      ...(dominantColorMode ? { dominantColorMode } : {}),
      ...(cleanNotes ? { notes: cleanNotes } : {}),
      ...(intakeOptions.needsScanReview ? { needsScanReview: true } : {}),
      sources,
    };

    await commit({
      ...state,
      books: [book, ...state.books],
    });
    if (book.coverUrl && !book.dominantColor) {
      resolveAndPersistBookCoverTint(book.id, book.coverUrl);
    }
    const destLabel =
      collectionStatus === 'owned' ? 'your library' : formatCollectionStatus(collectionStatus);
    notify(`Added "${book.title}" to ${destLabel}.`, 'success');
    return book;
  }

  /**
   * Updates an existing catalog book's metadata and/or cover image (`https://` or `data:image/`).
   * @param {string} bookId
   * @param {{
   *   title?: string,
   *   authors?: string[],
   *   isbn?: string,
   *   publishedYear?: number | null,
   *   pageCount?: number | null,
   *   coverUrl?: string | null,
   *   description?: string | null,
   *   format?: import('../types/models.js').BookFormat,
   *   ageMin?: number,
   *   ageMax?: number,
   *   readingStage?: import('../types/models.js').ReadingStage,
   *   tags?: string[],
   *   collectionStatus?: import('../types/models.js').CollectionStatus,
   *   condition?: import('../types/models.js').BookCondition,
   *   loved?: boolean,
   *   owners?: string[],
   *   dominantColor?: string | null,
   *   dominantColorSource?: 'auto' | 'manual',
   *   dominantColorSwatches?: string[] | null,
   *   dominantColorMode?: import('../types/models.js').DynamicCoverTintMode | null,
   *   excludeFromRotations?: boolean,
   *   notes?: string | null,
   *   needsScanReview?: boolean,
   *   verifiedAt?: string | null,
   *   language?: string | null,
   *   publisher?: string | null,
   *   edition?: string | null,
   *   estimatedValue?: number | null,
   *   estimatedCurrency?: string | null,
   *   listPriceAmount?: number | null,
   *   listPriceCurrency?: string | null,
   *   dimensions?: string | Record<string, unknown> | null
   * }} patch
   */
  async function updateBook(bookId, patch) {
    const existing = state.books.find((b) => b.id === bookId);
    if (!existing) throw new Error('Book not found.');

    const nextTitle = patch.title !== undefined ? patch.title.trim() : existing.title;
    if (!nextTitle) {
      throw new Error('Book title is required.');
    }

    let nextIsbn13 = existing.isbn13;
    let nextIsbn10 = existing.isbn10;
    if (patch.isbn !== undefined) {
      const isbnCheck = normalizeIsbn(patch.isbn);
      if (!isbnCheck.valid) {
        throw new Error(isbnCheck.error || 'Invalid ISBN.');
      }
      if (
        isbnCheck.isbn13 &&
        state.books.some((b) => b.id !== bookId && b.isbn13 === isbnCheck.isbn13)
      ) {
        throw new Error(`ISBN ${isbnCheck.isbn13} is already assigned to another book in your library.`);
      }
      nextIsbn13 = isbnCheck.isbn13;
      nextIsbn10 = isbnCheck.isbn10;
    }

    const cleanedAuthors =
      patch.authors !== undefined
        ? patch.authors.map((a) => String(a || '').trim()).filter(Boolean)
        : existing.authors;
    const nextAuthors = cleanedAuthors.length > 0 ? cleanedAuthors : ['Unknown Author'];

    let nextCoverUrl = existing.coverUrl;
    if (patch.coverUrl !== undefined) {
      const rawCover = String(patch.coverUrl || '').trim();
      if (!rawCover) {
        nextCoverUrl = undefined;
      } else {
        const sanitized = sanitizeCoverUrl(rawCover);
        if (!sanitized) {
          throw new Error('Enter a valid HTTPS image URL or choose a photo.');
        }
        nextCoverUrl = sanitized;
      }
    }

    let nextPubYear = existing.publishedYear;
    if (patch.publishedYear !== undefined) {
      if (patch.publishedYear === null || patch.publishedYear === 0) {
        nextPubYear = undefined;
      } else if (patch.publishedYear >= 1800 && patch.publishedYear <= 2100) {
        nextPubYear = Math.trunc(patch.publishedYear);
      } else {
        nextPubYear = undefined;
      }
    }

    let nextPages = existing.pageCount;
    if (patch.pageCount !== undefined) {
      nextPages =
        patch.pageCount && patch.pageCount > 0 ? Math.trunc(patch.pageCount) : undefined;
    }

    const nextFormat = patch.format || existing.format;
    const nextStage = patch.readingStage || existing.readingStage;
    const nextAgeMin =
      patch.ageMin !== undefined
        ? Math.max(0, Math.min(120, Math.trunc(Number(patch.ageMin) || 0)))
        : existing.ageMin;
    const nextAgeMax =
      patch.ageMax !== undefined
        ? Math.max(nextAgeMin, Math.min(120, Math.trunc(Number(patch.ageMax) || nextAgeMin)))
        : Math.max(nextAgeMin, existing.ageMax);

    const nextTags =
      patch.tags !== undefined ? sanitizeTagList(patch.tags, 10) : existing.tags;
    const newlyAddedPatchTags =
      patch.tags !== undefined
        ? nextTags.filter((tag) => !existing.tags.includes(tag))
        : [];
    const nextTagOrigins = mergeTagOrigins(existing.tagOrigins, nextTags, {
      manual: newlyAddedPatchTags,
    });

    const nextReadingLevelHint = inferReadingLevelHint({
      readingStage: nextStage,
      format: nextFormat,
      pageCount: nextPages,
      tags: nextTags,
      textCorpus: nextTitle,
    });

    const nextCollectionStatus =
      patch.collectionStatus !== undefined
        ? normalizeCollectionStatus(patch.collectionStatus)
        : existing.collectionStatus;
    const nextCondition =
      patch.condition !== undefined
        ? normalizeBookCondition(patch.condition)
        : existing.condition;
    const nextLoved =
      patch.loved !== undefined ? Boolean(patch.loved) : existing.loved;
    const nextOwners =
      patch.owners !== undefined ? normalizeOwnersList(patch.owners) : existing.owners;

    const coverChanged = patch.coverUrl !== undefined && nextCoverUrl !== existing.coverUrl;
    const coverCleared = patch.coverUrl !== undefined && !nextCoverUrl;
    let nextDominantColor = existing.dominantColor;
    let nextDominantColorSource = existing.dominantColorSource;
    let nextDominantColorSwatches = existing.dominantColorSwatches;
    let nextDominantColorMode = existing.dominantColorMode;

    if (patch.dominantColor !== undefined) {
      nextDominantColor = patch.dominantColor ? normalizeHexColor(patch.dominantColor) : undefined;
      nextDominantColorSource = nextDominantColor
        ? patch.dominantColorSource === 'manual'
          ? 'manual'
          : 'auto'
        : undefined;
      if (!nextDominantColor) {
        nextDominantColorSwatches = undefined;
        nextDominantColorMode = undefined;
      }
    } else if (coverChanged || coverCleared) {
      // Clear cached tint & swatches when cover art changes or is cleared so precomputation refreshes cleanly
      nextDominantColor = undefined;
      nextDominantColorSource = undefined;
      nextDominantColorSwatches = undefined;
      nextDominantColorMode = undefined;
    }

    if (patch.dominantColorSwatches !== undefined) {
      nextDominantColorSwatches =
        patch.dominantColorSwatches === null
          ? undefined
          : normalizeSwatchList(patch.dominantColorSwatches);
    }
    if (patch.dominantColorMode !== undefined) {
      nextDominantColorMode =
        patch.dominantColorMode === null ? undefined : normalizeTintMode(patch.dominantColorMode);
    } else if (patch.dominantColor !== undefined && nextDominantColor && !nextDominantColorMode) {
      nextDominantColorMode = normalizeTintMode(state.settings?.dynamicCoverTintMode);
    }

    const nextDescription =
      patch.description !== undefined
        ? cleanBookDescription(patch.description || '') || undefined
        : existing.description;

    const nextExcludeFromRotations =
      patch.excludeFromRotations !== undefined
        ? Boolean(patch.excludeFromRotations)
        : existing.excludeFromRotations;
    const nextNotes =
      patch.notes !== undefined
        ? String(patch.notes || '').trim().slice(0, 1000) || undefined
        : existing.notes;
    const nextNeedsScanReview =
      patch.needsScanReview !== undefined
        ? Boolean(patch.needsScanReview)
        : existing.needsScanReview;
    const nextVerifiedAt =
      patch.verifiedAt !== undefined
        ? patch.verifiedAt || undefined
        : existing.verifiedAt;
    const nextLanguage =
      patch.language !== undefined
        ? String(patch.language || '').trim() || undefined
        : existing.language;
    const nextPublisher =
      patch.publisher !== undefined
        ? String(patch.publisher || '').trim() || undefined
        : existing.publisher;
    const nextEdition =
      patch.edition !== undefined
        ? String(patch.edition || '').trim().slice(0, 120) || undefined
        : existing.edition;

    let nextEstimatedValue = existing.estimatedValue;
    if (patch.estimatedValue !== undefined) {
      if (patch.estimatedValue === null || Number.isNaN(Number(patch.estimatedValue))) {
        nextEstimatedValue = undefined;
      } else {
        const val = Number(patch.estimatedValue);
        nextEstimatedValue = val >= 0 ? Math.round(val * 100) / 100 : undefined;
      }
    }
    const nextEstimatedCurrency =
      patch.estimatedCurrency !== undefined
        ? String(patch.estimatedCurrency || '').trim().toUpperCase().slice(0, 6) || undefined
        : existing.estimatedCurrency;

    let nextListPriceAmount = existing.listPriceAmount;
    if (patch.listPriceAmount !== undefined) {
      const val = Number(patch.listPriceAmount);
      nextListPriceAmount =
        patch.listPriceAmount !== null && Number.isFinite(val) && val >= 0
          ? Math.round(val * 100) / 100
          : undefined;
    }
    const nextListPriceCurrency =
      patch.listPriceCurrency !== undefined
        ? String(patch.listPriceCurrency || '').trim().toUpperCase().slice(0, 6) || undefined
        : existing.listPriceCurrency;

    let nextDimensions = existing.dimensions;
    if (patch.dimensions !== undefined) {
      if (patch.dimensions === null) {
        nextDimensions = undefined;
      } else if (typeof patch.dimensions === 'string') {
        nextDimensions = patch.dimensions.trim().slice(0, 80) || undefined;
      } else if (typeof patch.dimensions === 'object') {
        nextDimensions = patch.dimensions;
      }
    }

    // Keep multi-entry bookNotes synchronized when legacy patch.notes is set directly
    let nextBookNotes = Array.isArray(existing.bookNotes) ? [...existing.bookNotes] : undefined;
    if (patch.notes !== undefined) {
      if (!nextNotes) {
        if (nextBookNotes && nextBookNotes.length <= 1) {
          nextBookNotes = undefined;
        }
      } else if (nextBookNotes && nextBookNotes.length > 0) {
        nextBookNotes = [
          { ...nextBookNotes[0], text: nextNotes, updatedAt: new Date().toISOString() },
          ...nextBookNotes.slice(1),
        ];
      } else {
        nextBookNotes = [
          {
            id: createId('note'),
            text: nextNotes,
            ...(state.activeProfileId ? { authorProfileId: state.activeProfileId } : {}),
            createdAt: new Date().toISOString(),
          },
        ];
      }
    }

    /** @type {import('../types/models.js').Book} */
    const updatedBook = {
      id: existing.id,
      isbn13: nextIsbn13,
      ...(nextIsbn10 ? { isbn10: nextIsbn10 } : {}),
      title: nextTitle,
      authors: nextAuthors,
      ...(nextPubYear ? { publishedYear: nextPubYear } : {}),
      ...(nextPages ? { pageCount: nextPages } : {}),
      format: nextFormat,
      ageMin: nextAgeMin,
      ageMax: nextAgeMax,
      readingStage: nextStage,
      ...(nextReadingLevelHint ? { readingLevelHint: nextReadingLevelHint } : {}),
      tags: nextTags,
      ...(nextTagOrigins ? { tagOrigins: nextTagOrigins } : {}),
      ...(nextCollectionStatus ? { collectionStatus: nextCollectionStatus } : {}),
      ...(nextCondition ? { condition: nextCondition } : {}),
      ...(nextLoved !== undefined ? { loved: nextLoved } : {}),
      ...(nextOwners && nextOwners.length > 0 ? { owners: nextOwners } : {}),
      ...(nextCoverUrl ? { coverUrl: nextCoverUrl } : {}),
      ...(nextDescription ? { description: nextDescription } : {}),
      ...(nextDominantColor ? { dominantColor: nextDominantColor } : {}),
      ...(nextDominantColor && nextDominantColorSource
        ? { dominantColorSource: nextDominantColorSource }
        : {}),
      ...(nextDominantColorSwatches ? { dominantColorSwatches: nextDominantColorSwatches } : {}),
      ...(nextDominantColorMode ? { dominantColorMode: nextDominantColorMode } : {}),
      ...(nextExcludeFromRotations ? { excludeFromRotations: true } : {}),
      ...(nextNotes ? { notes: nextNotes } : {}),
      ...(nextBookNotes && nextBookNotes.length > 0 ? { bookNotes: nextBookNotes } : {}),
      ...(Array.isArray(existing.recordings) && existing.recordings.length > 0
        ? { recordings: existing.recordings }
        : {}),
      ...(nextNeedsScanReview !== undefined ? { needsScanReview: nextNeedsScanReview } : {}),
      ...(nextVerifiedAt ? { verifiedAt: nextVerifiedAt } : {}),
      ...(typeof existing.userRating === 'number' ? { userRating: existing.userRating } : {}),
      ...(existing.userRatings && typeof existing.userRatings === 'object'
        ? { userRatings: { ...existing.userRatings } }
        : {}),
      ...(typeof existing.averageRating === 'number' ? { averageRating: existing.averageRating } : {}),
      ...(typeof existing.ratingsCount === 'number' ? { ratingsCount: existing.ratingsCount } : {}),
      ...(nextPublisher ? { publisher: nextPublisher } : {}),
      ...(nextEdition ? { edition: nextEdition } : {}),
      ...(nextEstimatedValue !== undefined ? { estimatedValue: nextEstimatedValue } : {}),
      ...(nextEstimatedCurrency ? { estimatedCurrency: nextEstimatedCurrency } : {}),
      ...(nextListPriceAmount !== undefined ? { listPriceAmount: nextListPriceAmount } : {}),
      ...(nextListPriceCurrency ? { listPriceCurrency: nextListPriceCurrency } : {}),
      ...(existing.previewLink ? { previewLink: existing.previewLink } : {}),
      ...(nextLanguage ? { language: nextLanguage } : {}),
      ...(nextDimensions ? { dimensions: nextDimensions } : {}),
      spineColor: existing.spineColor,
      addedAt: existing.addedAt,
      ...(existing.lastRotatedAt ? { lastRotatedAt: existing.lastRotatedAt } : {}),
      ...(typeof existing.rotationCount === 'number'
        ? { rotationCount: existing.rotationCount }
        : {}),
      ...(Array.isArray(existing.rotationHistory) && existing.rotationHistory.length > 0
        ? { rotationHistory: existing.rotationHistory }
        : {}),
      ...(existing.lastReadAt ? { lastReadAt: existing.lastReadAt } : {}),
      sources: existing.sources,
    };

    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    if (coverChanged && nextCoverUrl && !nextDominantColor) {
      resolveAndPersistBookCoverTint(updatedBook.id, nextCoverUrl);
    }
    notify(`Updated "${updatedBook.title}".`, 'success');
    return updatedBook;
  }

  /**
   * Toggles a book's Loved favorite flag in one tap.
   * @param {string} bookId
   */
  async function toggleBookLoved(bookId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return null;
    const nextLoved = !target.loved;
    const updatedBook = { ...target, loved: nextLoved };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify(
      nextLoved
        ? `Marked "${target.title}" as Loved.`
        : `Removed Loved mark from "${target.title}".`,
      'info'
    );
    return updatedBook;
  }

  /**
   * Sets or updates a book's user rating (1 to 5 stars) scoped to the active or given reader profile.
   * @param {string} bookId
   * @param {number} rating
   * @param {string} [profileId]
   */
  async function setUserRating(bookId, rating, profileId) {
    const cleanRating = Math.max(0, Math.min(5, Math.trunc(Number(rating) || 0)));
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return null;

    const effectiveProfileId =
      String(profileId || state.activeProfileId || state.profiles[0]?.id || 'shared').trim() ||
      'shared';
    const readerProfile = state.profiles.find((p) => p.id === effectiveProfileId);

    const nextRatings =
      target.userRatings && typeof target.userRatings === 'object'
        ? { ...target.userRatings }
        : {};
    if (cleanRating > 0) {
      nextRatings[effectiveProfileId] = cleanRating;
    } else {
      delete nextRatings[effectiveProfileId];
    }

    /** @type {import('../types/models.js').Book} */
    const updatedBook = { ...target, userRatings: nextRatings };
    delete updatedBook.userRating;

    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });

    const readerPrefix = readerProfile?.name ? `${readerProfile.name} rated` : 'Rated';
    notify(
      cleanRating > 0
        ? `${readerPrefix} "${target.title}" ${cleanRating} star${cleanRating === 1 ? '' : 's'}.`
        : `Removed${readerProfile?.name ? ` ${readerProfile.name}’s` : ''} rating from "${target.title}".`,
      'info'
    );
    return updatedBook;
  }

  /**
   * Appends a quote or reading note with reader attribution and optional photo onto a catalog book.
   * @param {string} bookId
   * @param {{ text?: string, imageDataUrl?: string, authorProfileId?: string, forProfileId?: string }} input
   */
  async function addBookNote(bookId, input) {
    const cleanText = String(input?.text || '').trim().slice(0, 1500);
    const cleanImage =
      typeof input?.imageDataUrl === 'string' && input.imageDataUrl.startsWith('data:image/')
        ? input.imageDataUrl
        : '';
    if (!cleanText && !cleanImage) {
      throw new Error('Enter a quote, note, or photo before saving.');
    }
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');

    const existingList = Array.isArray(target.bookNotes)
      ? [...target.bookNotes]
      : target.notes
        ? [
            {
              id: `note_legacy_${target.id}`,
              text: target.notes,
              createdAt: target.addedAt || new Date().toISOString(),
            },
          ]
        : [];

    /** @type {import('../types/models.js').BookNote} */
    const newNote = {
      id: createId('note'),
      text: cleanText,
      ...(cleanImage ? { imageDataUrl: cleanImage } : {}),
      ...(input.authorProfileId ? { authorProfileId: String(input.authorProfileId) } : {}),
      ...(input.forProfileId ? { forProfileId: String(input.forProfileId) } : {}),
      createdAt: new Date().toISOString(),
    };

    const nextList = [newNote, ...existingList];
    const summaryText = nextList.find((n) => n.text)?.text?.slice(0, 1000);
    const updatedBook = {
      ...target,
      bookNotes: nextList,
      ...(summaryText ? { notes: summaryText } : {}),
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify(`Saved note for "${target.title}".`, 'success');
    return newNote;
  }

  /**
   * Updates an existing attributed quote or note on a catalog book.
   * @param {string} bookId
   * @param {string} noteId
   * @param {{ text?: string, imageDataUrl?: string, authorProfileId?: string, forProfileId?: string }} patch
   */
  async function updateBookNote(bookId, noteId, patch) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');
    const existingList = Array.isArray(target.bookNotes)
      ? [...target.bookNotes]
      : target.notes
        ? [
            {
              id: `note_legacy_${target.id}`,
              text: target.notes,
              createdAt: target.addedAt || new Date().toISOString(),
            },
          ]
        : [];
    const legacyAliasId = `legacy_${target.id}`;
    const canonicalLegacyId = `note_legacy_${target.id}`;
    const noteIndex = existingList.findIndex(
      (n) => n.id === noteId || (noteId === legacyAliasId && n.id === canonicalLegacyId)
    );
    if (noteIndex === -1) throw new Error('Note not found.');

    const current = existingList[noteIndex];
    const nextText =
      patch.text !== undefined ? String(patch.text || '').trim().slice(0, 1500) : current.text || '';
    const nextImage =
      patch.imageDataUrl !== undefined
        ? typeof patch.imageDataUrl === 'string' && patch.imageDataUrl.startsWith('data:image/')
          ? patch.imageDataUrl
          : ''
        : current.imageDataUrl || '';
    if (!nextText && !nextImage) throw new Error('Note text or photo cannot be empty.');

    /** @type {import('../types/models.js').BookNote} */
    const nextNote = {
      ...current,
      text: nextText,
      ...(nextImage ? { imageDataUrl: nextImage } : {}),
      ...(patch.authorProfileId !== undefined
        ? patch.authorProfileId
          ? { authorProfileId: String(patch.authorProfileId) }
          : {}
        : current.authorProfileId
          ? { authorProfileId: current.authorProfileId }
          : {}),
      ...(patch.forProfileId !== undefined
        ? patch.forProfileId
          ? { forProfileId: String(patch.forProfileId) }
          : {}
        : current.forProfileId
          ? { forProfileId: current.forProfileId }
          : {}),
      updatedAt: new Date().toISOString(),
    };
    if (!nextImage) delete nextNote.imageDataUrl;
    if (patch.authorProfileId === '') delete nextNote.authorProfileId;
    if (patch.forProfileId === '') delete nextNote.forProfileId;

    const nextList = existingList.map((n, idx) => (idx === noteIndex ? nextNote : n));
    const summaryText = nextList.find((n) => n.text)?.text?.slice(0, 1000) || undefined;
    const updatedBook = {
      ...target,
      bookNotes: nextList,
      notes: summaryText,
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify('Updated quote & note.', 'success');
    return nextNote;
  }

  /**
   * Deletes an attributed quote or note from a catalog book.
   * @param {string} bookId
   * @param {string} noteId
   */
  async function deleteBookNote(bookId, noteId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return false;
    const existingList = Array.isArray(target.bookNotes)
      ? [...target.bookNotes]
      : target.notes
        ? [
            {
              id: `note_legacy_${target.id}`,
              text: target.notes,
              createdAt: target.addedAt || new Date().toISOString(),
            },
          ]
        : [];
    const legacyAliasId = `legacy_${target.id}`;
    const canonicalLegacyId = `note_legacy_${target.id}`;
    const nextList = existingList.filter(
      (n) => n.id !== noteId && !(noteId === legacyAliasId && n.id === canonicalLegacyId)
    );
    if (nextList.length === existingList.length) return false;

    const updatedBook = { ...target };
    if (nextList.length > 0) {
      updatedBook.bookNotes = nextList;
      updatedBook.notes = nextList[0].text.slice(0, 1000);
    } else {
      delete updatedBook.bookNotes;
      delete updatedBook.notes;
    }
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify('Removed note.', 'info');
    return true;
  }

  /**
   * Saves a voice/reading audio clip in IndexedDB and attaches its metadata to the book.
   * @param {string} bookId
   * @param {{
   *   blob: any,
   *   durationSec: number,
   *   mimeType?: string,
   *   title?: string,
   *   authorProfileId?: string,
   *   forProfileId?: string
   * }} input
   */
  async function addBookRecording(bookId, input) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');
    if (!input || !input.blob) throw new Error('Missing audio recording data.');

    const recId = createId('rec');
    await saveBookAudioBlob(recId, input.blob);

    /** @type {import('../types/models.js').BookAudioRecording} */
    const recording = {
      id: recId,
      ...(input.title && String(input.title).trim()
        ? { title: String(input.title).trim().slice(0, 80) }
        : {}),
      durationSec: Math.max(0, Math.round((Number(input.durationSec) || 0) * 10) / 10),
      mimeType: String(input.mimeType || input.blob.type || 'audio/webm'),
      ...(input.authorProfileId ? { authorProfileId: String(input.authorProfileId) } : {}),
      ...(input.forProfileId ? { forProfileId: String(input.forProfileId) } : {}),
      createdAt: new Date().toISOString(),
    };

    const existingRecs = Array.isArray(target.recordings) ? target.recordings : [];
    const updatedBook = {
      ...target,
      recordings: [recording, ...existingRecs],
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify(`Saved audio recording for "${target.title}".`, 'success');
    return recording;
  }

  /**
   * Updates metadata (title, recorder attribution, target reader) on an existing audio clip.
   * @param {string} bookId
   * @param {string} recordingId
   * @param {{ title?: string, authorProfileId?: string, forProfileId?: string }} patch
   */
  async function updateBookRecording(bookId, recordingId, patch) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');
    const existingRecs = Array.isArray(target.recordings) ? target.recordings : [];
    const recIdx = existingRecs.findIndex((r) => r.id === recordingId);
    if (recIdx === -1) throw new Error('Recording not found.');

    const current = existingRecs[recIdx];
    /** @type {import('../types/models.js').BookAudioRecording} */
    const nextRec = { ...current };
    if (patch.title !== undefined) {
      const cleanTitle = String(patch.title || '').trim().slice(0, 80);
      if (cleanTitle) {
        nextRec.title = cleanTitle;
      } else {
        delete nextRec.title;
      }
    }
    if (patch.authorProfileId !== undefined) {
      if (patch.authorProfileId) {
        nextRec.authorProfileId = String(patch.authorProfileId);
      } else {
        delete nextRec.authorProfileId;
      }
    }
    if (patch.forProfileId !== undefined) {
      if (patch.forProfileId) {
        nextRec.forProfileId = String(patch.forProfileId);
      } else {
        delete nextRec.forProfileId;
      }
    }

    const nextRecs = existingRecs.map((r, idx) => (idx === recIdx ? nextRec : r));
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? { ...target, recordings: nextRecs } : b)),
    });
    notify('Updated audio recording.', 'success');
    return nextRec;
  }

  /**
   * Removes an audio recording metadata entry and deletes its binary blob from IndexedDB.
   * @param {string} bookId
   * @param {string} recordingId
   */
  async function deleteBookRecording(bookId, recordingId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return false;
    const existingRecs = Array.isArray(target.recordings) ? target.recordings : [];
    const nextRecs = existingRecs.filter((r) => r.id !== recordingId);
    if (nextRecs.length === existingRecs.length) return false;

    await deleteBookAudioBlob(recordingId);
    const updatedBook = { ...target };
    if (nextRecs.length > 0) {
      updatedBook.recordings = nextRecs;
    } else {
      delete updatedBook.recordings;
    }
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify('Deleted audio recording.', 'info');
    return true;
  }

  /**
   * Toggles whether a book is eligible for automated shelf rotations.
   * @param {string} bookId
   */
  async function toggleBookRotationEligibility(bookId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return null;
    const nextExcluded = !target.excludeFromRotations;
    const updatedBook = {
      ...target,
      excludeFromRotations: nextExcluded ? true : undefined,
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify(
      nextExcluded
        ? `Excluded "${target.title}" from shelf rotations.`
        : `Included "${target.title}" in shelf rotations.`,
      'info'
    );
    return updatedBook;
  }

  /**
   * Silently caches a sampled dominant cover hex color + palette swatches onto a book record without triggering a toast,
   * or stores/clears a manual swatch override when requested.
   * @param {string} bookId
   * @param {string | null | undefined} rawHex
   * @param {{
   *   manual?: boolean,
   *   swatches?: string[],
   *   mode?: import('../types/models.js').DynamicCoverTintMode
   * }} [options]
   * @returns {Promise<import('../types/models.js').Book | null>}
   */
  async function setBookDominantColor(bookId, rawHex, options = {}) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return null;
    if (!rawHex) {
      if (
        !target.dominantColor &&
        !target.dominantColorSource &&
        !target.dominantColorSwatches &&
        !target.dominantColorMode
      ) {
        return target;
      }
      const {
        dominantColor: _removedColor,
        dominantColorSource: _removedSrc,
        dominantColorSwatches: _removedSwatches,
        dominantColorMode: _removedMode,
        ...restRaw
      } = target;
      const rest = /** @type {import('../types/models.js').Book} */ (restRaw);
      await commit({
        ...state,
        books: state.books.map((b) => (b.id === bookId ? rest : b)),
      });
      return rest;
    }
    const cleanHex = normalizeHexColor(rawHex);
    if (!cleanHex) return null;
    /** @type {'manual' | 'auto'} */
    const nextSource = options.manual ? 'manual' : 'auto';
    const nextSwatches = normalizeSwatchList(options.swatches) || target.dominantColorSwatches;
    const nextMode =
      options.mode !== undefined
        ? normalizeTintMode(options.mode)
        : target.dominantColorMode || normalizeTintMode(state.settings?.dynamicCoverTintMode);
    if (
      target.dominantColor === cleanHex &&
      target.dominantColorSource === nextSource &&
      target.dominantColorMode === nextMode &&
      JSON.stringify(target.dominantColorSwatches || []) === JSON.stringify(nextSwatches || [])
    ) {
      return target;
    }
    /** @type {import('../types/models.js').Book} */
    const updatedBook = {
      ...target,
      dominantColor: cleanHex,
      dominantColorSource: nextSource,
      dominantColorMode: nextMode,
      ...(nextSwatches ? { dominantColorSwatches: nextSwatches } : {}),
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    return updatedBook;
  }

  /**
   * Appends a single sanitized tag to an existing catalog book.
   * @param {string} bookId
   * @param {string} rawTag
   */
  async function addBookTag(bookId, rawTag) {
    const clean = sanitizeTag(rawTag);
    if (!clean) {
      throw new Error('Enter a valid topic tag (2–22 letters, numbers, or hyphens).');
    }
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');
    if (target.tags.includes(clean)) {
      notify(`Tag "${clean}" is already on "${target.title}".`, 'info');
      return target;
    }

    const updatedTags = sanitizeTagList([clean, ...target.tags], 10);
    const nextTagOrigins = mergeTagOrigins(target.tagOrigins, updatedTags, {
      manual: [clean],
    });
    const updatedBook = {
      ...target,
      tags: updatedTags,
      ...(nextTagOrigins ? { tagOrigins: nextTagOrigins } : {}),
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify(`Added topic "${clean}" to "${target.title}".`, 'success');
    return updatedBook;
  }

  /**
   * Removes a tag from an existing catalog book.
   * @param {string} bookId
   * @param {string} tagToRemove
   */
  async function removeBookTag(bookId, tagToRemove) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return;
    const nextTags = target.tags.filter((t) => t !== tagToRemove);
    const nextTagOrigins = mergeTagOrigins(target.tagOrigins, nextTags);
    const updatedBook = { ...target, tags: nextTags };
    if (nextTagOrigins) {
      updatedBook.tagOrigins = nextTagOrigins;
    } else {
      delete updatedBook.tagOrigins;
    }
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
  }

  /**
   * Runs Local Rule-Based Tagging + optional opted-in AI enrichment on a single catalog book.
   * @param {string} bookId
   */
  async function enrichSingleBook(bookId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');

    const res = await tagging.enrichBook(
      {
        title: target.title,
        authors: target.authors,
        isbn13: target.isbn13,
        format: target.format,
        pageCount: target.pageCount,
        publishedYear: target.publishedYear,
        ageMin: target.ageMin,
        ageMax: target.ageMax,
        readingStage: target.readingStage,
        language: target.language,
        edition: target.edition,
        notes: target.notes,
        bookNotes: target.bookNotes,
        summary: target.description,
        tags: target.tags,
        usageContext: buildBookUsagePayload(target, state),
      },
      state.settings,
      { forceLocalRules: true, preserveExplicitAgeAndStage: true }
    );

    const nextSources =
      res.aiProvenance && !target.sources.some((s) => s.provider === res.aiProvenance?.provider)
        ? [...target.sources, res.aiProvenance]
        : target.sources;

    const nextTagOrigins = mergeTagOrigins(target.tagOrigins, res.tags, {
      rules: res.ruleAddedTags,
      ai: res.aiAddedTags,
    });

    const updatedBook = {
      ...target,
      tags: res.tags,
      ...(nextTagOrigins ? { tagOrigins: nextTagOrigins } : {}),
      ...(res.readingLevelHint ? { readingLevelHint: res.readingLevelHint } : {}),
      sources: nextSources,
    };

    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });

    const sourceLabel = res.usedAi ? `Local Rules + ${res.adapterId}` : 'Local Rules';
    notify(
      res.addedTags.length > 0
        ? `Added ${res.addedTags.length} tag(s) (${res.addedTags.join(', ')}) via ${sourceLabel}.`
        : `Verified tags & reading hint for "${target.title}" (${sourceLabel}).`,
      'success'
    );
    return res;
  }

  /**
   * Re-enriches all books in the family catalog using Local Rules + optional opted-in AI adapter.
   */
  async function enrichAllCatalogBooks() {
    if (state.books.length === 0) {
      notify('Add books to your catalog first.', 'info');
      return { updatedBooksCount: 0, newTagsCount: 0, usedAiCount: 0 };
    }

    let updatedBooksCount = 0;
    let newTagsCount = 0;
    let usedAiCount = 0;

    /** @type {import('../types/models.js').Book[]} */
    const nextBooks = [];

    for (const book of state.books) {
      const res = await tagging.enrichBook(
        {
          title: book.title,
          authors: book.authors,
          isbn13: book.isbn13,
          format: book.format,
          pageCount: book.pageCount,
          publishedYear: book.publishedYear,
          ageMin: book.ageMin,
          ageMax: book.ageMax,
          readingStage: book.readingStage,
          language: book.language,
          edition: book.edition,
          notes: book.notes,
          bookNotes: book.bookNotes,
          summary: book.description,
          tags: book.tags,
          usageContext: buildBookUsagePayload(book, state),
        },
        state.settings,
        { forceLocalRules: true, preserveExplicitAgeAndStage: true }
      );

      if (res.usedAi) usedAiCount += 1;
      newTagsCount += res.addedTags.length;

      const changed =
        res.addedTags.length > 0 ||
        (res.readingLevelHint && res.readingLevelHint !== book.readingLevelHint);

      if (changed) updatedBooksCount += 1;

      const nextSources =
        res.aiProvenance && !book.sources.some((s) => s.provider === res.aiProvenance?.provider)
          ? [...book.sources, res.aiProvenance]
          : book.sources;

      const nextTagOrigins = mergeTagOrigins(book.tagOrigins, res.tags, {
        rules: res.ruleAddedTags,
        ai: res.aiAddedTags,
      });

      nextBooks.push({
        ...book,
        tags: res.tags,
        ...(nextTagOrigins ? { tagOrigins: nextTagOrigins } : {}),
        ...(res.readingLevelHint ? { readingLevelHint: res.readingLevelHint } : {}),
        sources: nextSources,
      });
    }

    await commit({
      ...state,
      books: nextBooks,
    });

    notify(
      `Catalog enrichment complete: ${updatedBooksCount} of ${state.books.length} books updated (${newTagsCount} new tags).`,
      'success'
    );
    return { updatedBooksCount, newTagsCount, usedAiCount };
  }

  /**
   * Action 1: Queries LLM for categorized (interactive format, developmental, concepts) + freeform tags.
   * @param {string} bookId
   */
  async function queryCategorizedTagsForBook(bookId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');
    return queryBookCategorizedTags(target, state.settings);
  }

  /**
   * Applies user-approved or LLM tags & metadata to a catalog book.
   * @param {string} bookId
   * @param {{ tags?: string[], readingStage?: import('../types/models.js').ReadingStage, readingLevelHint?: string }} patch
   */
  async function applyLlmTagsToBook(bookId, patch = {}) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) throw new Error('Book not found.');
    const existingTags = Array.isArray(target.tags) ? target.tags : [];
    const preservedNonAiTags = existingTags.filter(
      (tag) => resolveBookTagOrigin(target, tag) !== 'ai'
    );
    const mergedTags = sanitizeTagList(
      [...preservedNonAiTags, ...(patch.tags || existingTags)],
      20
    );
    const existingSet = new Set(existingTags);
    const aiAdded = mergedTags.filter((tag) => !existingSet.has(tag));
    const nextTagOrigins = mergeTagOrigins(target.tagOrigins, mergedTags, {
      ai: aiAdded,
    });
    const aiProviderKey = `ai:${state.settings.llmProvider || 'gemini'}`;
    const hasAiProvider = target.sources.some(
      (s) => String(s?.provider || '').toLowerCase() === aiProviderKey.toLowerCase()
    );
    const updatedBook = {
      ...target,
      tags: mergedTags,
      ...(nextTagOrigins ? { tagOrigins: nextTagOrigins } : {}),
      ...(patch.readingStage ? { readingStage: patch.readingStage } : {}),
      ...(patch.readingLevelHint ? { readingLevelHint: patch.readingLevelHint } : {}),
      sources: hasAiProvider
        ? target.sources
        : [
            ...target.sources,
            {
              provider: aiProviderKey,
              fetchedAt: new Date().toISOString(),
            },
          ],
    };
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
    notify(`Saved ${mergedTags.length} tags for "${target.title}".`, 'success');
    return updatedBook;
  }

  /**
   * Action 2: Smart Library Rotation Assistant
   * Asks the LLM to curate the best rotation from the user's library matching criteria.
   * @param {{ profileId?: string, objective?: string, count?: number, requiredFormat?: string }} options
   */
  async function curateRotationWithLlm(options = {}) {
    const profile =
      state.profiles.find((p) => p.id === (options.profileId || state.activeProfileId)) ||
      state.profiles[0];
    if (!profile) throw new Error('No active reader profile found.');

    const plan = await querySmartRotationPlan({
      libraryBooks: state.books,
      profile,
      rules: {
        count: options.count || profile.defaultRotationSize || 5,
        objective: options.objective || 'Balanced storytime rotation',
        requiredFormat: options.requiredFormat || 'any',
      },
      rotations: state.rotations,
      settings: state.settings,
    });
    return plan;
  }

  /**
   * Saves or activates a curated rotation plan.
   * @param {{ title?: string, objective?: string, bookIds: string[], profileId?: string, setActive?: boolean, keepOtherActive?: boolean, swapDays?: number, cooldownDays?: number, preferredTags?: string[] }} params
   */
  async function saveCuratedRotation(params) {
    const profileId = params.profileId || state.activeProfileId;
    const bookIds = Array.isArray(params.bookIds) ? params.bookIds : [];
    if (bookIds.length === 0) throw new Error('Select at least one book for rotation.');

    const newRotationId = createId('rot');
    const nowIso = new Date().toISOString();
    const shouldActivate = Boolean(params.setActive);
    const swapDays =
      params.swapDays !== undefined && Number(params.swapDays) >= 1
        ? Math.max(1, Math.min(90, Math.trunc(Number(params.swapDays))))
        : 14;
    const cooldownDays =
      params.cooldownDays !== undefined && !Number.isNaN(Number(params.cooldownDays))
        ? Math.max(0, Math.min(90, Math.trunc(Number(params.cooldownDays))))
        : 14;
    const preferredTags = Array.isArray(params.preferredTags)
      ? params.preferredTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];

    const newRotation = {
      id: newRotationId,
      profileId,
      title: params.title || 'Curated Rotation',
      rules: {
        count: bookIds.length,
        objective: params.objective || 'AI Curated Shelf',
        preferredTags,
        cooldownDays,
        swapDays,
        varietyMix: true,
        requiredFormat: /** @type {const} */ ('any'),
        seed: createId('seed'),
      },
      bookIds,
      completedBookIds: [],
      pickedBookIds: [],
      placedBookIds: [],
      status: /** @type {'active' | 'saved'} */ (shouldActivate ? 'active' : 'saved'),
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(shouldActivate ? { activatedAt: nowIso, lastActiveAt: nowIso } : {}),
      slotAddedAt: syncRotationSlotAddedAt(undefined, bookIds, nowIso, {
        resetAll: true,
      }),
    };

    let nextRotations = state.rotations;
    if (shouldActivate && !params.keepOtherActive) {
      nextRotations = nextRotations.map((r) =>
        r.profileId === profileId && r.status === 'active'
          ? {
              ...r,
              status: /** @type {const} */ ('saved'),
              lastActiveAt: nowIso,
              updatedAt: nowIso,
            }
          : r
      );
    }
    nextRotations = [newRotation, ...nextRotations];

    const updatedBooks = shouldActivate
      ? recordBooksRotated(state.books, bookIds, {
          rotatedAt: nowIso,
          rotationId: newRotationId,
          profileId,
        })
      : state.books;

    await commit({
      ...state,
      books: updatedBooks,
      rotations: nextRotations,
    });

    notify(
      shouldActivate
        ? `Activated rotation "${newRotation.title}" with ${bookIds.length} books!`
        : `Saved rotation "${newRotation.title}" (${bookIds.length} books).`,
      'success'
    );
    return newRotation;
  }

  /**
   * Action 3: Smart Library Recommendations
   * Queries LLM to suggest books filling gaps, matching favorites, or preparing for next stage.
   * @param {{ profileId?: string, goal?: 'gaps' | 'similar-favorites' | 'next-stage' | 'custom', customPrompt?: string, count?: number }} options
   */
  async function generateLibraryRecommendationsWithLlm(options = {}) {
    const profile =
      state.profiles.find((p) => p.id === (options.profileId || state.activeProfileId)) ||
      state.profiles[0];
    if (!profile) throw new Error('No active reader profile found.');

    const res = await queryLibraryRecommendations({
      libraryBooks: state.books,
      profile,
      goal: options.goal || 'gaps',
      customPrompt: options.customPrompt || '',
      count: options.count || 4,
      settings: state.settings,
    });

    const nowIso = new Date().toISOString();
    await commit({
      ...state,
      aiRecommendations: res.recommendations || [],
      aiRecommendationsGoal: options.goal || 'gaps',
      aiRecommendationsPrompt: options.customPrompt || '',
      aiRecommendationsGeneratedAt: nowIso,
    });

    notify(`Generated ${res.recommendations.length} recommendations for ${profile.name}!`, 'success');
    return res;
  }

  /**
   * 1-tap converts an AI recommendation into a saved 'wishlist' book in the user's library.
   * @param {{ title: string, author?: string, ageRange?: string, readingStage?: string, category?: string, reason?: string, gapFilled?: string }} rec
   * @param {string} [profileId]
   */
  async function addRecommendedBookToWishlist(rec, profileId) {
    if (!rec || !rec.title) throw new Error('Invalid recommendation.');
    const effectiveProfileId = profileId || state.activeProfileId || 'shared';
    const cleanTitle = String(rec.title).trim();
    const cleanAuthor = String(rec.author || 'Unknown Author').trim();

    // Check if already in catalog
    const existing = state.books.find(
      (b) =>
        b.title.toLowerCase() === cleanTitle.toLowerCase() &&
        b.authors.some((a) => a.toLowerCase() === cleanAuthor.toLowerCase())
    );
    if (existing) {
      notify(
        `"${cleanTitle}" is already in your library (${formatCollectionStatus(existing.collectionStatus)}).`,
        'info'
      );
      return existing;
    }

    /** @type {import('../types/models.js').ReadingStage} */
    const stage =
      rec.readingStage &&
      ['board-toddler', 'picture-book', 'early-reader', 'chapter-book'].includes(rec.readingStage)
        ? /** @type {import('../types/models.js').ReadingStage} */ (rec.readingStage)
        : 'picture-book';

    const tags = sanitizeTagList(
      [
        ...(rec.category ? [rec.category] : []),
        ...(rec.gapFilled ? [rec.gapFilled] : []),
        'wishlist',
        'ai-recommended',
      ],
      6
    );

    const tagOrigins = mergeTagOrigins(undefined, tags, { ai: tags });

    const nowIso = new Date().toISOString();
    /** @type {import('../types/models.js').Book} */
    const newBook = {
      id: createId('book'),
      isbn13: '',
      title: cleanTitle,
      authors: [cleanAuthor],
      format: stage === 'board-toddler' ? 'board-book' : 'hardcover',
      ageMin: stage === 'board-toddler' ? 1 : stage === 'early-reader' ? 5 : 3,
      ageMax: stage === 'board-toddler' ? 3 : stage === 'early-reader' ? 8 : 7,
      readingStage: stage,
      readingLevelHint: rec.reason ? rec.reason.slice(0, 80) : '',
      tags,
      ...(tagOrigins ? { tagOrigins } : {}),
      collectionStatus: 'wishlist',
      condition: 'good',
      loved: false,
      owners: [effectiveProfileId],
      spineColor: SPINE_COLORS[Math.floor(Math.random() * SPINE_COLORS.length)],
      addedAt: nowIso,
      sources: [
        {
          provider: 'ai:recommendation',
          fetchedAt: nowIso,
        },
      ],
    };

    await commit({
      ...state,
      books: [newBook, ...state.books],
    });

    notify(`Added "${cleanTitle}" to your Wishlist!`, 'success');
    return newBook;
  }

  /**
   * Re-queries saved catalog books against currently enabled metadata providers (e.g. after a user
   * configures Google Books or a personal phone proxy) and safely merges missing covers, page counts,
   * publication years, topic tags, and provider provenance (`Google Books + Open Library`) without
   * overwriting user-curated personalizations (`loved`, `collectionStatus`, `condition`, `owners`,
   * custom `data:image/` cover photos, or existing tags).
   *
   * @param {{
   *   lookupByIsbn: (rawIsbn: string, opts?: any) => Promise<{ candidate: import('../features/catalog/normalizer.js').BookCandidate | null }>,
   *   searchBooks: (input: { query: string, author?: string }, opts?: any) => Promise<{ candidates: import('../features/catalog/normalizer.js').BookCandidate[] }>
   * }} catalogService
   * @param {{
   *   forceAll?: boolean,
   *   onProgress?: (progress: { current: number, total: number, title: string }) => void
   * }} [options]
   */
  async function syncExistingCatalogMetadata(catalogService, options = {}) {
    if (state.books.length === 0) {
      notify('Add books to your catalog first.', 'info');
      return {
        checkedCount: 0,
        updatedCount: 0,
        addedCoversCount: 0,
        addedDescriptionsCount: 0,
        addedGoogleSourceCount: 0,
        skippedCount: 0,
        errorsCount: 0,
      };
    }

    /**
     * @param {string} rawTitle
     */
    const toTitleStem = (rawTitle) =>
      stripDiacritics(String(rawTitle || '').split(/[:—–(]/)[0])
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');

    /**
     * @param {import('../types/models.js').Book} b
     */
    const needsCatalogSync = (b) => {
      if (options.forceAll) return true;
      const hasGoogle = b.sources.some(
        (s) => String(s?.provider || '').toLowerCase() === 'google-books'
      );
      return !hasGoogle || !b.coverUrl || !b.pageCount || !b.publishedYear || !b.description;
    };

    const candidatesToSync = state.books.filter(needsCatalogSync);
    const totalToCheck = candidatesToSync.length;

    let checkedCount = 0;
    let updatedCount = 0;
    let addedCoversCount = 0;
    let addedDescriptionsCount = 0;
    let addedGoogleSourceCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;

    /** @type {import('../types/models.js').Book[]} */
    const nextBooks = [];

    for (const book of state.books) {
      const cleanedExistingSources = book.sources.map((src) => {
        const cleanExt = cleanProviderExternalId(src.externalId);
        const { externalId: _oldExt, ...restSrc } = src;
        return cleanExt ? { ...restSrc, externalId: cleanExt } : restSrc;
      });
      const sourceIdCleanedOnly =
        JSON.stringify(cleanedExistingSources) !== JSON.stringify(book.sources);

      if (!needsCatalogSync(book)) {
        skippedCount += 1;
        if (sourceIdCleanedOnly) updatedCount += 1;
        nextBooks.push(
          sourceIdCleanedOnly ? { ...book, sources: cleanedExistingSources } : book
        );
        continue;
      }

      checkedCount += 1;
      if (typeof options.onProgress === 'function') {
        options.onProgress({
          current: checkedCount,
          total: totalToCheck,
          title: book.title,
        });
      }

      /** @type {import('../features/catalog/normalizer.js').BookCandidate | null} */
      let matchedCandidate = null;
      try {
        const lookupIsbn = book.isbn13 || book.isbn10 || '';
        if (lookupIsbn) {
          const res = await catalogService.lookupByIsbn(lookupIsbn, {
            enabledProviderIds: state.settings.enabledMetadataProviders,
            retainRaw: state.settings.retainRawProviderPayloads,
          });
          matchedCandidate = res.candidate || null;
        } else {
          const primaryAuthor =
            book.authors[0] && book.authors[0] !== 'Unknown Author'
              ? book.authors[0]
              : undefined;
          const searchRes = await catalogService.searchBooks(
            { query: book.title, author: primaryAuthor },
            {
              limit: 4,
              enabledProviderIds: state.settings.enabledMetadataProviders,
              retainRaw: state.settings.retainRawProviderPayloads,
            }
          );
          const targetStem = toTitleStem(book.title);
          matchedCandidate =
            searchRes.candidates.find((c) => {
              const candStem = toTitleStem(c.title);
              return (
                targetStem &&
                candStem &&
                (targetStem === candStem ||
                  (targetStem.length >= 5 &&
                    candStem.length >= 5 &&
                    (targetStem.startsWith(candStem) || candStem.startsWith(targetStem))))
              );
            }) || null;
        }
      } catch (_) {
        errorsCount += 1;
        nextBooks.push(
          sourceIdCleanedOnly ? { ...book, sources: cleanedExistingSources } : book
        );
        continue;
      }

      if (!matchedCandidate) {
        nextBooks.push(
          sourceIdCleanedOnly ? { ...book, sources: cleanedExistingSources } : book
        );
        if (sourceIdCleanedOnly) updatedCount += 1;
        continue;
      }

      const hadGoogleBefore = cleanedExistingSources.some(
        (s) => String(s?.provider || '').toLowerCase() === 'google-books'
      );

      // Avoid assigning a newly discovered ISBN-13 if another library book already owns it
      const canAdoptCandidateIsbn =
        !book.isbn13 &&
        matchedCandidate.isbn13 &&
        !state.books.some((other) => other.id !== book.id && other.isbn13 === matchedCandidate.isbn13);
      const nextIsbn13 = book.isbn13 || (canAdoptCandidateIsbn ? matchedCandidate.isbn13 : '');
      const nextIsbn10 =
        book.isbn10 ||
        (book.isbn13 || canAdoptCandidateIsbn ? matchedCandidate.isbn10 : undefined);

      const mergedAuthorsList =
        book.authors[0] === 'Unknown Author' && matchedCandidate.authors[0] !== 'Unknown Author'
          ? matchedCandidate.authors
          : Array.from(new Set([...book.authors, ...matchedCandidate.authors])).filter(
              (a) => a && a !== 'Unknown Author'
            );
      const nextAuthors = mergedAuthorsList.length > 0 ? mergedAuthorsList : book.authors;

      const nextPublishedYear = book.publishedYear || matchedCandidate.publishedYear;
      const nextPageCount = book.pageCount || matchedCandidate.pageCount;

      const nextCoverUrl = book.coverUrl || sanitizeCoverUrl(matchedCandidate.coverUrl);
      const coverWasAdded = !book.coverUrl && Boolean(nextCoverUrl);
      if (coverWasAdded) {
        addedCoversCount += 1;
      }

      const candidateDescription = cleanBookDescription(matchedCandidate.summary || '');
      const nextDescription = book.description || candidateDescription || undefined;
      if (!book.description && nextDescription) {
        addedDescriptionsCount += 1;
      }

      const nextLanguage = book.language || matchedCandidate.language;
      const nextPublisher = book.publisher || matchedCandidate.publisher;
      const nextDimensions = book.dimensions || matchedCandidate.dimensions;
      const nextAverageRating = book.averageRating ?? matchedCandidate.averageRating;
      const nextRatingsCount = book.ratingsCount ?? matchedCandidate.ratingsCount;
      const nextPreviewLink = book.previewLink || matchedCandidate.previewLink;
      const nextListPriceAmount = book.listPriceAmount ?? matchedCandidate.listPriceAmount;
      const nextListPriceCurrency = book.listPriceCurrency || matchedCandidate.listPriceCurrency;

      const combinedSeedTags = sanitizeTagList([...book.tags, ...matchedCandidate.tags], 10);
      const enriched = await tagging.enrichBook(
        {
          title: book.title,
          authors: nextAuthors,
          isbn13: nextIsbn13,
          format: book.format,
          pageCount: nextPageCount,
          publishedYear: nextPublishedYear,
          ageMin: book.ageMin,
          ageMax: book.ageMax,
          readingStage: book.readingStage,
          tags: combinedSeedTags,
          summary: candidateDescription || nextDescription,
          subjects: matchedCandidate.subjects,
        },
        state.settings,
        { preserveExplicitAgeAndStage: true }
      );
      const nextTags = sanitizeTagList([...book.tags, ...enriched.tags], 10);
      const candidateProviderTags = matchedCandidate.tags.filter(
        (t) => matchedCandidate.tagOrigins?.[t] === 'provider'
      );
      const candidateRuleTags = matchedCandidate.tags.filter(
        (t) => matchedCandidate.tagOrigins?.[t] === 'rules'
      );
      const nextTagOrigins = mergeTagOrigins(book.tagOrigins, nextTags, {
        provider: candidateProviderTags,
        rules: [...candidateRuleTags, ...(enriched.ruleAddedTags || [])],
        ai: enriched.aiAddedTags,
      });
      const nextReadingLevelHint =
        book.readingLevelHint ||
        enriched.readingLevelHint ||
        matchedCandidate.readingLevelHint;

      // Merge & deduplicate provider sources cleanly
      /** @type {Map<string, import('../types/models.js').ProviderSource>} */
      const sourceMap = new Map();
      /** @type {import('../types/models.js').ProviderSource[]} */
      const rawCombinedSources = [
        ...matchedCandidate.sources.map((src) => {
          if (state.settings.retainRawProviderPayloads) return src;
          const { rawPayload: _omitted, ...cleanSrc } = src;
          return cleanSrc;
        }),
        ...cleanedExistingSources,
        ...(enriched.aiProvenance ? [enriched.aiProvenance] : []),
      ];

      for (const src of rawCombinedSources) {
        const key = String(src?.provider || '').trim().toLowerCase();
        if (!key) continue;
        const cleanExt = cleanProviderExternalId(src.externalId);
        const { externalId: _prevExt, ...restSrc } = src;
        /** @type {import('../types/models.js').ProviderSource} */
        const normalizedSrc = {
          ...restSrc,
          provider: key,
          ...(cleanExt ? { externalId: cleanExt } : {}),
        };
        const prev = sourceMap.get(key);
        if (!prev) {
          sourceMap.set(key, normalizedSrc);
        } else if (!prev.externalId && normalizedSrc.externalId) {
          sourceMap.set(key, { ...prev, externalId: normalizedSrc.externalId });
        }
      }

      if (sourceMap.has('google-books') || sourceMap.has('open-library')) {
        sourceMap.delete('seed');
      }

      const nextSources = Array.from(sourceMap.values());
      const hasGoogleAfter = sourceMap.has('google-books');
      if (!hadGoogleBefore && hasGoogleAfter) {
        addedGoogleSourceCount += 1;
      }

      /** @type {import('../types/models.js').Book} */
      const updatedBook = {
        ...book,
        isbn13: nextIsbn13,
        ...(nextIsbn10 ? { isbn10: nextIsbn10 } : {}),
        authors: nextAuthors,
        ...(nextPublishedYear ? { publishedYear: nextPublishedYear } : {}),
        ...(nextPageCount ? { pageCount: nextPageCount } : {}),
        ...(nextCoverUrl ? { coverUrl: nextCoverUrl } : {}),
        ...(nextDescription ? { description: nextDescription } : {}),
        ...(nextLanguage ? { language: nextLanguage } : {}),
        ...(nextPublisher ? { publisher: nextPublisher } : {}),
        ...(nextDimensions ? { dimensions: nextDimensions } : {}),
        ...(nextAverageRating !== undefined ? { averageRating: nextAverageRating } : {}),
        ...(nextRatingsCount !== undefined ? { ratingsCount: nextRatingsCount } : {}),
        ...(nextPreviewLink ? { previewLink: nextPreviewLink } : {}),
        ...(nextListPriceAmount !== undefined ? { listPriceAmount: nextListPriceAmount } : {}),
        ...(nextListPriceCurrency ? { listPriceCurrency: nextListPriceCurrency } : {}),
        ...(coverWasAdded ? {} : book.dominantColor ? { dominantColor: book.dominantColor } : {}),
        ...(nextReadingLevelHint ? { readingLevelHint: nextReadingLevelHint } : {}),
        tags: nextTags,
        ...(nextTagOrigins ? { tagOrigins: nextTagOrigins } : {}),
        sources: nextSources,
      };
      if (coverWasAdded) {
        delete updatedBook.dominantColor;
      }

      const didChange = JSON.stringify(updatedBook) !== JSON.stringify(book);
      if (didChange) {
        updatedCount += 1;
      }
      nextBooks.push(didChange ? updatedBook : book);
    }

    if (updatedCount > 0) {
      await commit({
        ...state,
        books: nextBooks,
      });
    }

    const details = [
      addedGoogleSourceCount > 0 ? `${addedGoogleSourceCount} linked to Google Books` : '',
      addedCoversCount > 0 ? `${addedCoversCount} new cover(s)` : '',
      addedDescriptionsCount > 0 ? `${addedDescriptionsCount} new description(s)` : '',
    ]
      .filter(Boolean)
      .join(', ');

    notify(
      updatedCount > 0
        ? `Updated ${updatedCount} library ${updatedCount === 1 ? 'book' : 'books'}${
            details ? ` (${details})` : ''
          }.`
        : checkedCount > 0
          ? `Checked ${checkedCount} ${checkedCount === 1 ? 'book' : 'books'} — library metadata is already up to date.`
          : 'All library books already include Google Books metadata, covers, and descriptions.',
      updatedCount > 0 ? 'success' : 'info'
    );

    return {
      checkedCount,
      updatedCount,
      addedCoversCount,
      addedDescriptionsCount,
      addedGoogleSourceCount,
      skippedCount,
      errorsCount,
    };
  }

  /**
   * Removes a book from catalog and cleans references in rotations.
   * @param {string} bookId
   */
  async function deleteBook(bookId) {
    const target = state.books.find((b) => b.id === bookId);
    if (!target) return;
    if (Array.isArray(target.recordings)) {
      for (const rec of target.recordings) {
        if (rec?.id) {
          await deleteBookAudioBlob(rec.id);
        }
      }
    }
    await commit({
      ...state,
      books: state.books.filter((b) => b.id !== bookId),
      rotations: state.rotations.map((rot) => ({
        ...rot,
        bookIds: rot.bookIds.filter((id) => id !== bookId),
        completedBookIds: rot.completedBookIds.filter((id) => id !== bookId),
        pickedBookIds: Array.isArray(rot.pickedBookIds)
          ? rot.pickedBookIds.filter((id) => id !== bookId)
          : [],
        pickedAutoReadBookIds: Array.isArray(rot.pickedAutoReadBookIds)
          ? rot.pickedAutoReadBookIds.filter((id) => id !== bookId)
          : [],
        pickedCycleOnlyReadBookIds: Array.isArray(rot.pickedCycleOnlyReadBookIds)
          ? rot.pickedCycleOnlyReadBookIds.filter((id) => id !== bookId)
          : [],
        placedBookIds: Array.isArray(rot.placedBookIds)
          ? rot.placedBookIds.filter((id) => id !== bookId)
          : [],
      })),
    });
    notify(`Removed "${target.title}" from library.`, 'info');
  }

  /**
   * Explicitly updates per-rotation `picked` and/or `read` state for a book inside a rotation.
   * When `picked` is marked `true` and `read` is not explicitly provided (`undefined`), `read`
   * automatically defaults to `true` (and keeps profile `readHistoryBookIds` + `lastReadAt` synced).
   *
   * @param {string} rotationId
   * @param {string} bookId
   * @param {{
   *   picked?: boolean,
   *   read?: boolean,
   *   _pickOrigin?: 'auto-from-pick' | 'prior-read' | 'already-in-cycle',
   *   _preservePriorRead?: boolean
   * }} statusPatch
   */
  async function setRotationBookStatus(rotationId, bookId, statusPatch = {}) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation || !rotation.bookIds.includes(bookId)) return;

    const wasRead = rotation.completedBookIds.includes(bookId);
    const currentPicked = Array.isArray(rotation.pickedBookIds) ? rotation.pickedBookIds : [];
    const currentPickedAutoRead = Array.isArray(rotation.pickedAutoReadBookIds)
      ? rotation.pickedAutoReadBookIds
      : [];
    const currentPickedCycleOnlyRead = Array.isArray(rotation.pickedCycleOnlyReadBookIds)
      ? rotation.pickedCycleOnlyReadBookIds
      : [];
    const wasPicked = currentPicked.includes(bookId);

    const nextPickedBool =
      statusPatch.picked !== undefined ? Boolean(statusPatch.picked) : wasPicked;
    // Picking a book automatically marks it as read unless `read: false` is explicitly supplied
    const nextReadBool =
      statusPatch.read !== undefined
        ? Boolean(statusPatch.read)
        : statusPatch.picked === true
          ? true
          : wasRead;

    let nextPickedAutoRead = currentPickedAutoRead;
    let nextPickedCycleOnlyRead = currentPickedCycleOnlyRead;

    if (statusPatch._pickOrigin === 'auto-from-pick' && nextPickedBool && nextReadBool) {
      nextPickedAutoRead = Array.from(new Set([...currentPickedAutoRead, bookId]));
      nextPickedCycleOnlyRead = currentPickedCycleOnlyRead.filter((id) => id !== bookId);
    } else if (statusPatch._pickOrigin === 'prior-read' && nextPickedBool && nextReadBool) {
      nextPickedAutoRead = currentPickedAutoRead.filter((id) => id !== bookId);
      nextPickedCycleOnlyRead = Array.from(new Set([...currentPickedCycleOnlyRead, bookId]));
    } else if (
      statusPatch._pickOrigin === 'already-in-cycle' ||
      statusPatch.read !== undefined ||
      statusPatch.picked === false
    ) {
      nextPickedAutoRead = currentPickedAutoRead.filter((id) => id !== bookId);
      nextPickedCycleOnlyRead = currentPickedCycleOnlyRead.filter((id) => id !== bookId);
    }

    const originChanged =
      nextPickedAutoRead.length !== currentPickedAutoRead.length ||
      nextPickedCycleOnlyRead.length !== currentPickedCycleOnlyRead.length;

    if (nextPickedBool === wasPicked && nextReadBool === wasRead && !originChanged) {
      return;
    }

    const nextCompleted = nextReadBool
      ? wasRead
        ? rotation.completedBookIds
        : [...rotation.completedBookIds, bookId]
      : rotation.completedBookIds.filter((id) => id !== bookId);

    const nextPicked = nextPickedBool
      ? wasPicked
        ? currentPicked
        : [...currentPicked, bookId]
      : currentPicked.filter((id) => id !== bookId);

    const now = new Date().toISOString();
    const readChanged = nextReadBool !== wasRead;
    const preservePriorRead = Boolean(statusPatch._preservePriorRead);

    const nextRotations = state.rotations.map((r) => {
      if (r.id === rotationId) {
        return {
          ...r,
          completedBookIds: nextCompleted,
          pickedBookIds: nextPicked,
          pickedAutoReadBookIds: nextPickedAutoRead,
          pickedCycleOnlyReadBookIds: nextPickedCycleOnlyRead,
          updatedAt: now,
        };
      }
      // If unmarking read on the profile's active shelf (and not merely reverting a pick on a previously read book),
      // keep active shelves for the same child consistent.
      if (
        readChanged &&
        !nextReadBool &&
        !preservePriorRead &&
        r.profileId === rotation.profileId &&
        r.status === 'active' &&
        r.completedBookIds.includes(bookId)
      ) {
        return {
          ...r,
          completedBookIds: r.completedBookIds.filter((id) => id !== bookId),
          updatedAt: now,
        };
      }
      return r;
    });

    if (!readChanged || (!nextReadBool && preservePriorRead)) {
      await commit({
        ...state,
        rotations: nextRotations,
      });
      return;
    }

    const stillReadOnProfileShelf = nextRotations.some(
      (r) =>
        r.profileId === rotation.profileId &&
        r.status === 'active' &&
        r.completedBookIds.includes(bookId)
    );

    const nextProfiles = state.profiles.map((p) => {
      if (p.id !== rotation.profileId) return p;
      const historySet = new Set(p.readHistoryBookIds);
      const readingSet = new Set(Array.isArray(p.currentlyReadingBookIds) ? p.currentlyReadingBookIds : []);
      if (nextReadBool) {
        historySet.add(bookId);
        readingSet.delete(bookId);
      } else if (!stillReadOnProfileShelf) {
        historySet.delete(bookId);
      }
      return {
        ...p,
        readHistoryBookIds: Array.from(historySet),
        currentlyReadingBookIds: Array.from(readingSet),
      };
    });

    const anyProfileStillRead = nextProfiles.some(
      (p) => Array.isArray(p.readHistoryBookIds) && p.readHistoryBookIds.includes(bookId)
    );

    const nextBooks = state.books.map((b) => {
      if (b.id !== bookId) return b;
      if (nextReadBool) {
        return { ...b, lastReadAt: now };
      }
      if (!anyProfileStillRead) {
        const { lastReadAt: _cleared, ...rest } = b;
        return rest;
      }
      return b;
    });

    await commit({
      ...state,
      books: nextBooks,
      profiles: nextProfiles,
      rotations: nextRotations,
    });
  }

  /**
   * Toggles whether a book was picked during a specific rotation.
   * Picking a book automatically marks it as read in that rotation and updates reading history.
   * Unpicking a book that was already read in a prior rotation (or read manually before picking)
   * removes only the picked marker for this rotation while preserving its pre-existing Read status.
   *
   * @param {string} rotationId
   * @param {string} bookId
   */
  async function toggleRotationBookPicked(rotationId, bookId) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) return;
    const isPicked = Array.isArray(rotation.pickedBookIds) && rotation.pickedBookIds.includes(bookId);
    if (!isPicked) {
      const profile = state.profiles.find((p) => p.id === rotation.profileId);
      const wasInCycleCompleted = rotation.completedBookIds.includes(bookId);
      const wasInPriorHistory =
        Boolean(profile && Array.isArray(profile.readHistoryBookIds) && profile.readHistoryBookIds.includes(bookId)) ||
        state.rotations.some(
          (r) =>
            r.id !== rotationId &&
            r.profileId === rotation.profileId &&
            Array.isArray(r.completedBookIds) &&
            r.completedBookIds.includes(bookId)
        );
      const _pickOrigin = wasInCycleCompleted
        ? 'already-in-cycle'
        : wasInPriorHistory
          ? 'prior-read'
          : 'auto-from-pick';
      await setRotationBookStatus(rotationId, bookId, {
        picked: true,
        read: true,
        _pickOrigin,
      });
      return;
    }

    const isAutoFromPick =
      Array.isArray(rotation.pickedAutoReadBookIds) &&
      rotation.pickedAutoReadBookIds.includes(bookId);
    const isCycleOnlyFromPriorRead =
      Array.isArray(rotation.pickedCycleOnlyReadBookIds) &&
      rotation.pickedCycleOnlyReadBookIds.includes(bookId);

    if (isAutoFromPick) {
      const hasOtherRotationRead = state.rotations.some(
        (r) =>
          r.id !== rotationId &&
          r.profileId === rotation.profileId &&
          Array.isArray(r.completedBookIds) &&
          r.completedBookIds.includes(bookId)
      );
      await setRotationBookStatus(rotationId, bookId, {
        picked: false,
        read: false,
        _preservePriorRead: hasOtherRotationRead,
      });
    } else if (isCycleOnlyFromPriorRead) {
      await setRotationBookStatus(rotationId, bookId, {
        picked: false,
        read: false,
        _preservePriorRead: true,
      });
    } else {
      await setRotationBookStatus(rotationId, bookId, { picked: false });
    }
  }

  /**
   * Toggles read/completed state for a book inside a rotation and keeps profile `readHistoryBookIds`
   * and book `lastReadAt` cleanly synchronized in both directions (marking AND unmarking).
   * @param {string} rotationId
   * @param {string} bookId
   */
  async function toggleRotationBookRead(rotationId, bookId) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) return;
    const isDone = rotation.completedBookIds.includes(bookId);
    await setRotationBookStatus(rotationId, bookId, { read: !isDone });
  }

  /**
   * Toggles physical shelf placement check-off for a book inside a rotation (for stocking/cleanup).
   * @param {string} rotationId
   * @param {string} bookId
   */
  async function toggleRotationBookPlaced(rotationId, bookId) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation || !rotation.bookIds.includes(bookId)) return;
    const currentPlaced = Array.isArray(rotation.placedBookIds) ? rotation.placedBookIds : [];
    const isPlaced = currentPlaced.includes(bookId);
    const nextPlaced = isPlaced
      ? currentPlaced.filter((id) => id !== bookId)
      : [...currentPlaced, bookId];

    const now = new Date().toISOString();
    await commit({
      ...state,
      rotations: state.rotations.map((r) =>
        r.id === rotationId ? { ...r, placedBookIds: nextPlaced, updatedAt: now } : r
      ),
    });
  }

  /**
   * Batch sets physical shelf placement check-offs for a rotation (e.g. Check All, Check Completed, or Clear).
   * @param {string} rotationId
   * @param {string[]} bookIds
   */
  async function setRotationBooksPlaced(rotationId, bookIds) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) return;
    const validSet = new Set(rotation.bookIds);
    const nextPlaced = Array.from(
      new Set((bookIds || []).filter((id) => typeof id === 'string' && validSet.has(id)))
    );
    const now = new Date().toISOString();
    await commit({
      ...state,
      rotations: state.rotations.map((r) =>
        r.id === rotationId ? { ...r, placedBookIds: nextPlaced, updatedAt: now } : r
      ),
    });
  }

  /**
   * Toggles read status for any catalog book (including off-shelf books in the storage box)
   * for a specific child profile, keeping any active rotation shelf in sync.
   * @param {string | undefined} profileId
   * @param {string} bookId
   */
  async function toggleProfileBookRead(profileId, bookId) {
    const profile =
      state.profiles.find((p) => p.id === (profileId || state.activeProfileId)) ||
      state.profiles[0];
    if (!profile) return;
    const bookExists = state.books.some((b) => b.id === bookId);
    if (!bookExists) return;

    const activeRot = state.rotations.find(
      (r) => r.profileId === profile.id && r.status === 'active'
    );
    const isCurrentlyRead =
      profile.readHistoryBookIds.includes(bookId) ||
      Boolean(activeRot && activeRot.completedBookIds.includes(bookId));

    const now = new Date().toISOString();
    const nextProfiles = state.profiles.map((p) => {
      if (p.id !== profile.id) return p;
      const historySet = new Set(p.readHistoryBookIds);
      const readingSet = new Set(Array.isArray(p.currentlyReadingBookIds) ? p.currentlyReadingBookIds : []);
      if (isCurrentlyRead) {
        historySet.delete(bookId);
      } else {
        historySet.add(bookId);
        readingSet.delete(bookId);
      }
      return {
        ...p,
        readHistoryBookIds: Array.from(historySet),
        currentlyReadingBookIds: Array.from(readingSet),
      };
    });

    const nextRotations = state.rotations.map((r) => {
      if (r.profileId !== profile.id) return r;
      if (isCurrentlyRead && r.completedBookIds.includes(bookId)) {
        return {
          ...r,
          completedBookIds: r.completedBookIds.filter((id) => id !== bookId),
          updatedAt: now,
        };
      }
      if (
        !isCurrentlyRead &&
        r.status === 'active' &&
        r.bookIds.includes(bookId) &&
        !r.completedBookIds.includes(bookId)
      ) {
        return {
          ...r,
          completedBookIds: [...r.completedBookIds, bookId],
          updatedAt: now,
        };
      }
      return r;
    });

    const anyProfileStillRead = nextProfiles.some(
      (p) => Array.isArray(p.readHistoryBookIds) && p.readHistoryBookIds.includes(bookId)
    );

    const nextBooks = state.books.map((b) => {
      if (b.id !== bookId) return b;
      if (!isCurrentlyRead) {
        return { ...b, lastReadAt: now };
      }
      if (!anyProfileStillRead) {
        const { lastReadAt: _cleared, ...rest } = b;
        return rest;
      }
      return b;
    });

    await commit({
      ...state,
      books: nextBooks,
      profiles: nextProfiles,
      rotations: nextRotations,
    });
  }

  /**
   * Explicitly sets a reader's reading progress state for any book (`to-read` | `reading` | `read`),
   * keeping `currentlyReadingBookIds`, `readHistoryBookIds`, active rotation `completedBookIds`,
   * and `book.lastReadAt` cleanly synchronized.
   *
   * @param {string | undefined} profileId
   * @param {string} bookId
   * @param {import('../types/models.js').BookReadingStatus} status
   */
  async function setProfileBookReadingStatus(profileId, bookId, status) {
    const profile =
      state.profiles.find((p) => p.id === (profileId || state.activeProfileId)) ||
      state.profiles[0];
    if (!profile) return;
    const bookExists = state.books.some((b) => b.id === bookId);
    if (!bookExists) return;

    const cleanStatus = status === 'read' || status === 'reading' ? status : 'to-read';
    const now = new Date().toISOString();

    const nextProfiles = state.profiles.map((p) => {
      if (p.id !== profile.id) return p;
      const historySet = new Set(p.readHistoryBookIds);
      const readingSet = new Set(Array.isArray(p.currentlyReadingBookIds) ? p.currentlyReadingBookIds : []);
      if (cleanStatus === 'read') {
        historySet.add(bookId);
        readingSet.delete(bookId);
      } else if (cleanStatus === 'reading') {
        readingSet.delete(bookId);
        readingSet.add(bookId);
        historySet.delete(bookId);
      } else {
        readingSet.delete(bookId);
        historySet.delete(bookId);
      }
      return {
        ...p,
        readHistoryBookIds: Array.from(historySet),
        currentlyReadingBookIds: Array.from(readingSet),
      };
    });

    const nextRotations = state.rotations.map((r) => {
      if (r.profileId !== profile.id) return r;
      if (cleanStatus === 'read') {
        if (
          r.status === 'active' &&
          r.bookIds.includes(bookId) &&
          !r.completedBookIds.includes(bookId)
        ) {
          return {
            ...r,
            completedBookIds: [...r.completedBookIds, bookId],
            updatedAt: now,
          };
        }
        return r;
      }
      if (r.completedBookIds.includes(bookId)) {
        return {
          ...r,
          completedBookIds: r.completedBookIds.filter((id) => id !== bookId),
          updatedAt: now,
        };
      }
      return r;
    });

    const anyProfileStillRead = nextProfiles.some(
      (p) => Array.isArray(p.readHistoryBookIds) && p.readHistoryBookIds.includes(bookId)
    );

    const nextBooks = state.books.map((b) => {
      if (b.id !== bookId) return b;
      if (cleanStatus === 'read') {
        return { ...b, lastReadAt: now };
      }
      if (!anyProfileStillRead) {
        const { lastReadAt: _cleared, ...rest } = b;
        return rest;
      }
      return b;
    });

    await commit({
      ...state,
      books: nextBooks,
      profiles: nextProfiles,
      rotations: nextRotations,
    });
  }

  /**
   * Generates a full Phase 4 rotation shelf using the Rotation Engine (age fit, topic tags,
   * free-text objective, recency cooldown, variety constraints, and optional deterministic seed).
   *
   * @param {{
   *   title?: string,
   *   objective?: string,
   *   status?: 'active' | 'saved',
   *   count?: number,
   *   preferredTags?: string[],
   *   cooldownDays?: number,
   *   swapDays?: number,
   *   varietyMix?: boolean,
   *   requiredFormat?: import('../types/models.js').BookFormat | 'any',
   *   seed?: string,
   *   profileId?: string,
   *   keepOtherActive?: boolean
   * }} input
   */
  async function generateRotation(input) {
    const profile =
      state.profiles.find((p) => p.id === (input.profileId || state.activeProfileId)) ||
      state.profiles[0];

    if (!profile) {
      throw new Error('Create a reader profile before generating a rotation.');
    }

    if (state.books.length === 0) {
      throw new Error('Add at least one book to your catalog before generating a rotation.');
    }

    const desiredCount = normalizePositiveBookCount(
      input.count,
      profile.defaultRotationSize || 4
    );
    const cooldownDays =
      input.cooldownDays !== undefined && !Number.isNaN(Number(input.cooldownDays))
        ? Math.max(0, Math.min(90, Number(input.cooldownDays)))
        : profile.cooldownDays;
    const swapDays =
      input.swapDays !== undefined &&
      input.swapDays !== null &&
      !Number.isNaN(Number(input.swapDays)) &&
      Number(input.swapDays) >= 1
        ? Math.max(1, Math.min(90, Math.trunc(Number(input.swapDays))))
        : cooldownDays >= 1
          ? cooldownDays
          : profile.cooldownDays || 14;

    const cleanTags = Array.isArray(input.preferredTags)
      ? input.preferredTags.map((t) => t.toLowerCase().trim()).filter(Boolean)
      : [...profile.favoriteTopics];

    const cleanSeed = String(input.seed || '').trim();
    const objective =
      String(input.objective || '').trim() ||
      `Matched to ${profile.name} (Age ${profile.age})`;

    /** @type {import('../types/models.js').RotationRuleConfig} */
    const rules = {
      count: desiredCount,
      objective,
      preferredTags: cleanTags,
      cooldownDays,
      swapDays,
      varietyMix: input.varietyMix !== false,
      ...(input.requiredFormat && input.requiredFormat !== 'any'
        ? { requiredFormat: input.requiredFormat }
        : {}),
      ...(cleanSeed ? { seed: cleanSeed } : {}),
    };

    const now = new Date().toISOString();
    const engineOut = generateRotationSelection({
      books: state.books,
      profile,
      rules,
      rotations: state.rotations,
      nowIso: now,
    });

    if (engineOut.selectedBookIds.length === 0) {
      throw new Error('No eligible books matched those rotation rules.');
    }

    const targetStatus = input.status === 'saved' ? 'saved' : 'active';
    const newRotId = createId('rot');
    /** @type {import('../types/models.js').RotationList} */
    const newRotation = {
      id: newRotId,
      profileId: profile.id,
      title: String(input.title || '').trim() || `${profile.name}'s Curated Shelf`,
      rules,
      bookIds: engineOut.selectedBookIds,
      completedBookIds: [],
      pickedBookIds: [],
      placedBookIds: [],
      status: targetStatus,
      createdAt: now,
      updatedAt: now,
      ...(targetStatus === 'active' ? { activatedAt: now, lastActiveAt: now } : {}),
      slotAddedAt: syncRotationSlotAddedAt(undefined, engineOut.selectedBookIds, now, {
        resetAll: true,
      }),
    };

    const updatedExisting =
      targetStatus === 'active' && !input.keepOtherActive
        ? state.rotations.map((r) =>
            r.profileId === profile.id && r.status === 'active'
              ? {
                  ...r,
                  status: /** @type {const} */ ('saved'),
                  lastActiveAt: now,
                  updatedAt: now,
                }
              : r
          )
        : state.rotations;

    const updatedBooks =
      targetStatus === 'active'
        ? recordBooksRotated(state.books, engineOut.selectedBookIds, {
            rotatedAt: now,
            rotationId: newRotId,
            profileId: profile.id,
          })
        : state.books;

    await commit({
      ...state,
      books: updatedBooks,
      rotations: [newRotation, ...updatedExisting],
    });

    const cooldownNote =
      engineOut.relaxedCooldownCount > 0
        ? ` (${engineOut.relaxedCooldownCount} included from cooldown due to small catalog)`
        : '';
    const savedHint = targetStatus === 'saved' ? ' as Saved shelf' : '';
    notify(`Generated "${newRotation.title}"${savedHint} for ${profile.name}${cooldownNote}.`, 'success');
    return newRotation;
  }

  /**
   * Backward-compatible alias used by quick starter calls.
   * @param {{ title: string, objective: string, count: number }} input
   */
  async function createStarterRotation(input) {
    return generateRotation(input);
  }

  /**
   * Post-generation Edit Operation 1:
   * Replaces a selected book inside `rotationId` with a random eligible book from the catalog.
   *
   * @param {string} rotationId
   * @param {string} targetBookId
   * @param {{ seedOverride?: string }} [opts]
   */
  async function replaceRotationBookRandom(rotationId, targetBookId, opts = {}) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) throw new Error('Rotation shelf not found.');
    const profile =
      state.profiles.find((p) => p.id === rotation.profileId) || state.profiles[0];

    const now = new Date().toISOString();
    const candidates = pickRandomEligibleBooks({
      books: state.books,
      profile,
      rotation,
      rotations: state.rotations,
      count: 1,
      seedOverride: opts.seedOverride,
      nowIso: now,
    });

    if (candidates.length === 0) {
      throw new Error(
        'All books in your family library are already on this shelf — add more books first.'
      );
    }

    const replacement = candidates[0];
    const updatedRotation = applyBookReplacement(rotation, targetBookId, replacement.id, now);
    const updatedBooks = recordBooksRotated(state.books, [replacement.id], {
      rotatedAt: now,
      rotationId: rotation.id,
      profileId: rotation.profileId,
    });

    await commit({
      ...state,
      books: updatedBooks,
      rotations: state.rotations.map((r) => (r.id === rotationId ? updatedRotation : r)),
    });

    notify(`Swapped in "${replacement.title}".`, 'success');
    return replacement;
  }

  /**
   * Post-generation Edit Operation 2:
   * Replaces a selected book inside `rotationId` with an explicit user-chosen `replacementBookId`.
   *
   * @param {string} rotationId
   * @param {string} targetBookId
   * @param {string} replacementBookId
   */
  async function replaceRotationBookManual(rotationId, targetBookId, replacementBookId) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) throw new Error('Rotation shelf not found.');
    const replacement = state.books.find((b) => b.id === replacementBookId);
    if (!replacement) throw new Error('Replacement book not found in catalog.');

    const now = new Date().toISOString();
    const updatedRotation = applyBookReplacement(rotation, targetBookId, replacement.id, now);
    const updatedBooks = recordBooksRotated(state.books, [replacement.id], {
      rotatedAt: now,
      rotationId: rotation.id,
      profileId: rotation.profileId,
    });

    await commit({
      ...state,
      books: updatedBooks,
      rotations: state.rotations.map((r) => (r.id === rotationId ? updatedRotation : r)),
    });

    notify(`Replaced slot with "${replacement.title}".`, 'success');
    return updatedRotation;
  }

  /**
   * Post-generation Edit Operation 3a:
   * Appends one or multiple manually selected books to `rotationId`.
   *
   * @param {string} rotationId
   * @param {string[]} bookIdsToAdd
   */
  async function addBooksToRotationManual(rotationId, bookIdsToAdd) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) throw new Error('Rotation shelf not found.');

    const validIds = bookIdsToAdd.filter((id) => state.books.some((b) => b.id === id));
    const now = new Date().toISOString();
    const { rotation: updatedRotation, addedIds } = applyBookAdditions(rotation, validIds, now);

    if (addedIds.length === 0) {
      throw new Error('Select at least one book that is not already on this shelf.');
    }

    const updatedBooks = recordBooksRotated(state.books, addedIds, {
      rotatedAt: now,
      rotationId: rotation.id,
      profileId: rotation.profileId,
    });
    await commit({
      ...state,
      books: updatedBooks,
      rotations: state.rotations.map((r) => (r.id === rotationId ? updatedRotation : r)),
    });

    notify(
      `Added ${addedIds.length} ${addedIds.length === 1 ? 'book' : 'books'} to "${rotation.title}".`,
      'success'
    );
    return addedIds;
  }

  /**
   * Post-generation Edit Operation 3b:
   * Appends `count` random eligible books to `rotationId`.
   *
   * @param {string} rotationId
   * @param {number} [count]
   * @param {{ seedOverride?: string }} [opts]
   */
  async function addBooksToRotationRandom(rotationId, count = 1, opts = {}) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) throw new Error('Rotation shelf not found.');
    const profile =
      state.profiles.find((p) => p.id === rotation.profileId) || state.profiles[0];

    const safeCount = normalizePositiveBookCount(count, 1);
    const now = new Date().toISOString();
    const picked = pickRandomEligibleBooks({
      books: state.books,
      profile,
      rotation,
      rotations: state.rotations,
      count: safeCount,
      seedOverride: opts.seedOverride,
      nowIso: now,
    });

    if (picked.length === 0) {
      throw new Error('No additional catalog books are available outside this shelf.');
    }

    const { rotation: updatedRotation, addedIds } = applyBookAdditions(
      rotation,
      picked.map((b) => b.id),
      now
    );
    const updatedBooks = recordBooksRotated(state.books, addedIds, {
      rotatedAt: now,
      rotationId: rotation.id,
      profileId: rotation.profileId,
    });

    await commit({
      ...state,
      books: updatedBooks,
      rotations: state.rotations.map((r) => (r.id === rotationId ? updatedRotation : r)),
    });

    notify(
      `Added ${addedIds.length} random eligible ${addedIds.length === 1 ? 'book' : 'books'} to "${rotation.title}".`,
      'success'
    );
    return picked;
  }

  /**
   * Refreshes an existing rotation shelf from its rules against the current family library
   * (e.g. after buying new books that match its tags, binding, or objective).
   *
   * - `'add-matches'`: Appends newly matching off-shelf library books (preserving all existing shelf books & progress).
   * - `'redraw-unread'`: Keeps read and picked books on the shelf and re-draws the remaining slots up to `rules.count`.
   *
   * @param {string} rotationId
   * @param {{
   *   mode?: 'add-matches' | 'redraw-unread',
   *   bookIds?: string[],
   *   limit?: number,
   *   rulesPatch?: Partial<import('../types/models.js').RotationRuleConfig>
   * }} [options]
   */
  async function refreshRotationFromRules(rotationId, options = {}) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) throw new Error('Rotation shelf not found.');
    const profile =
      state.profiles.find((p) => p.id === rotation.profileId) || state.profiles[0];

    const now = new Date().toISOString();
    const mode = options.mode === 'redraw-unread' ? 'redraw-unread' : 'add-matches';
    const nextRules = options.rulesPatch
      ? {
          ...rotation.rules,
          ...options.rulesPatch,
        }
      : rotation.rules;
    const workingRotation = options.rulesPatch
      ? { ...rotation, rules: nextRules }
      : rotation;

    if (mode === 'add-matches') {
      let idsToAdd = Array.isArray(options.bookIds)
        ? options.bookIds.filter((id) => !rotation.bookIds.includes(id))
        : [];

      if (idsToAdd.length === 0) {
        const { matchingBooks } = findMatchingNewBooksForRotation({
          books: state.books,
          profile,
          rotation: workingRotation,
          rotations: state.rotations,
          nowIso: now,
        });
        const maxToAdd =
          typeof options.limit === 'number' && options.limit > 0
            ? Math.trunc(options.limit)
            : Math.max(1, Number(nextRules.count) || 5);
        idsToAdd = matchingBooks.slice(0, maxToAdd).map((entry) => entry.book.id);
      }

      if (idsToAdd.length === 0) {
        throw new Error('No new off-shelf library books match these rotation rules yet.');
      }

      const { rotation: appendedRotation, addedIds } = applyBookAdditions(
        workingRotation,
        idsToAdd,
        now
      );
      if (addedIds.length === 0) {
        throw new Error('Matching books are already on this rotation shelf.');
      }

      const updatedBooks =
        rotation.status === 'active'
          ? recordBooksRotated(state.books, addedIds, {
              rotatedAt: now,
              rotationId: rotation.id,
              profileId: rotation.profileId,
            })
          : state.books;

      await commit({
        ...state,
        books: updatedBooks,
        rotations: state.rotations.map((r) => (r.id === rotationId ? appendedRotation : r)),
      });

      notify(
        `Added ${addedIds.length} new matching ${addedIds.length === 1 ? 'book' : 'books'} to "${rotation.title}".`,
        'success'
      );
      return { rotation: appendedRotation, addedIds, removedIds: [] };
    }

    const redrawn = computeRedrawnRotationBooks({
      books: state.books,
      profile,
      rotation: workingRotation,
      rotations: state.rotations,
      nowIso: now,
    });

    if (redrawn.nextBookIds.length === 0) {
      throw new Error('No eligible library books matched those rotation rules.');
    }

    const nextSet = new Set(redrawn.nextBookIds);
    const baseSlots = syncRotationSlotAddedAt(
      rotation.slotAddedAt,
      redrawn.nextBookIds,
      now,
      { fallbackStartIso: rotation.activatedAt || rotation.createdAt || now }
    );
    for (const addedId of redrawn.addedBookIds) {
      baseSlots[addedId] = now;
    }

    /** @type {import('../types/models.js').RotationList} */
    const updatedRotation = {
      ...workingRotation,
      bookIds: redrawn.nextBookIds,
      completedBookIds: (rotation.completedBookIds || []).filter((id) => nextSet.has(id)),
      pickedBookIds: (rotation.pickedBookIds || []).filter((id) => nextSet.has(id)),
      pickedAutoReadBookIds: (rotation.pickedAutoReadBookIds || []).filter((id) =>
        nextSet.has(id)
      ),
      pickedCycleOnlyReadBookIds: (rotation.pickedCycleOnlyReadBookIds || []).filter((id) =>
        nextSet.has(id)
      ),
      placedBookIds: (rotation.placedBookIds || []).filter((id) => nextSet.has(id)),
      slotAddedAt: baseSlots,
      updatedAt: now,
    };

    const updatedBooks =
      rotation.status === 'active' && redrawn.addedBookIds.length > 0
        ? recordBooksRotated(state.books, redrawn.addedBookIds, {
            rotatedAt: now,
            rotationId: rotation.id,
            profileId: rotation.profileId,
          })
        : state.books;

    await commit({
      ...state,
      books: updatedBooks,
      rotations: state.rotations.map((r) => (r.id === rotationId ? updatedRotation : r)),
    });

    notify(
      redrawn.addedBookIds.length > 0
        ? `Updated "${rotation.title}" with ${redrawn.addedBookIds.length} fresh ${redrawn.addedBookIds.length === 1 ? 'book' : 'books'}.`
        : `"${rotation.title}" is already up to date with your library.`,
      'success'
    );
    return {
      rotation: updatedRotation,
      addedIds: redrawn.addedBookIds,
      removedIds: redrawn.removedBookIds,
    };
  }

  /**
   * Removes a single book slot from a rotation shelf (while keeping the book in the family library).
   * @param {string} rotationId
   * @param {string} bookId
   */
  async function removeBookFromRotation(rotationId, bookId) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) return;
    if (rotation.bookIds.length <= 1) {
      notify('A rotation shelf needs at least one book. Use Replace instead.', 'error');
      return;
    }
    const now = new Date().toISOString();
    const nextRotations = state.rotations.map((r) => {
      if (r.id !== rotationId) return r;
      const nextBookIds = r.bookIds.filter((id) => id !== bookId);
      return {
        ...r,
        bookIds: nextBookIds,
        completedBookIds: r.completedBookIds.filter((id) => id !== bookId),
        pickedBookIds: Array.isArray(r.pickedBookIds)
          ? r.pickedBookIds.filter((id) => id !== bookId)
          : [],
        pickedAutoReadBookIds: Array.isArray(r.pickedAutoReadBookIds)
          ? r.pickedAutoReadBookIds.filter((id) => id !== bookId)
          : [],
        pickedCycleOnlyReadBookIds: Array.isArray(r.pickedCycleOnlyReadBookIds)
          ? r.pickedCycleOnlyReadBookIds.filter((id) => id !== bookId)
          : [],
        placedBookIds: Array.isArray(r.placedBookIds)
          ? r.placedBookIds.filter((id) => id !== bookId)
          : [],
        slotAddedAt: syncRotationSlotAddedAt(r.slotAddedAt, nextBookIds, now, {
          fallbackStartIso: r.activatedAt || r.createdAt || now,
        }),
        updatedAt: now,
      };
    });
    await commit({ ...state, rotations: nextRotations });
    notify('Removed book from rotation shelf.', 'info');
  }

  /**
   * Deletes an entire saved or active rotation shelf while:
   * - Keeping all catalog books (`state.books`) and child reading accomplishments (`profile.readHistoryBookIds`
   *   and `book.lastReadAt`) completely intact.
   * - Rolling back any cooldown/rotation-history entries created specifically by `rotationId` so deleting
   *   an accidental or test rotation never leaves its books stuck in a phantom cooldown.
   * - Automatically promoting the profile's next saved rotation to `'active'` if the deleted shelf was active.
   *
   * @param {string} rotationId
   */
  async function deleteRotation(rotationId) {
    const target = state.rotations.find((r) => r.id === rotationId);
    if (!target) return;
    const remaining = state.rotations.filter((r) => r.id !== rotationId);

    // If we deleted the active shelf for this profile, promote their next most recent shelf if one exists
    if (target.status === 'active') {
      const candidateIndex = remaining.findIndex((r) => r.profileId === target.profileId);
      if (candidateIndex !== -1) {
        const promotedNow = new Date().toISOString();
        const candidate = remaining[candidateIndex];
        remaining[candidateIndex] = {
          ...candidate,
          status: 'active',
          activatedAt: promotedNow,
          lastActiveAt: promotedNow,
          slotAddedAt: syncRotationSlotAddedAt(
            candidate.slotAddedAt,
            candidate.bookIds,
            promotedNow,
            {
              fallbackStartIso: candidate.activatedAt || candidate.createdAt || promotedNow,
            }
          ),
          updatedAt: promotedNow,
        };
      }
    }

    const targetBookSet = new Set(target.bookIds);
    const reconciledBooks = state.books.map((book) => {
      const prevHistory = Array.isArray(book.rotationHistory) ? book.rotationHistory : [];
      const filteredHistory = prevHistory.filter((entry) => entry?.rotationId !== rotationId);
      const removedHistoryCount = prevHistory.length - filteredHistory.length;

      // Also handle legacy seed/imported books that had `lastRotatedAt === target.createdAt` without `rotationHistory`
      const hadLegacyStampOnly =
        prevHistory.length === 0 &&
        targetBookSet.has(book.id) &&
        book.lastRotatedAt &&
        (book.lastRotatedAt === target.activatedAt || book.lastRotatedAt === target.createdAt);

      if (removedHistoryCount === 0 && !hadLegacyStampOnly) {
        return book;
      }

      // Determine latest remaining rotation timestamp for this book across surviving history or surviving shelves
      let latestRemainingIso =
        filteredHistory.length > 0
          ? filteredHistory[filteredHistory.length - 1].rotatedAt
          : undefined;
      if (!latestRemainingIso) {
        for (const survivingRot of remaining) {
          if (survivingRot.bookIds.includes(book.id)) {
            const rotStamp = survivingRot.activatedAt || survivingRot.createdAt;
            if (rotStamp && (!latestRemainingIso || rotStamp > latestRemainingIso)) {
              latestRemainingIso = rotStamp;
            }
          }
        }
      }

      const prevCount =
        typeof book.rotationCount === 'number'
          ? book.rotationCount
          : Math.max(prevHistory.length, book.lastRotatedAt ? 1 : 0);
      const decrementedCount = Math.max(
        filteredHistory.length,
        latestRemainingIso ? 1 : 0,
        prevCount - Math.max(1, removedHistoryCount)
      );

      const nextBook = { ...book };
      if (filteredHistory.length > 0) {
        nextBook.rotationHistory = filteredHistory;
      } else {
        delete nextBook.rotationHistory;
      }
      if (latestRemainingIso) {
        nextBook.lastRotatedAt = latestRemainingIso;
      } else {
        delete nextBook.lastRotatedAt;
      }
      if (decrementedCount > 0) {
        nextBook.rotationCount = decrementedCount;
      } else {
        delete nextBook.rotationCount;
      }
      return nextBook;
    });

    await commit({ ...state, books: reconciledBooks, rotations: remaining });
    notify(`Deleted rotation "${target.title}".`, 'info');
  }

  /**
   * Makes an existing saved rotation the active shelf for its profile.
   * @param {string} rotationId
   */
  async function setActiveRotation(rotationId) {
    const target = state.rotations.find((r) => r.id === rotationId);
    if (!target) return;
    const now = new Date().toISOString();
    const nextRotations = state.rotations.map((r) => {
      if (r.profileId !== target.profileId) return r;
      if (r.id === rotationId) {
        return {
          ...r,
          status: /** @type {const} */ ('active'),
          activatedAt: now,
          lastActiveAt: now,
          slotAddedAt: syncRotationSlotAddedAt(r.slotAddedAt, r.bookIds, now, {
            resetAll: true,
          }),
          updatedAt: now,
        };
      }
      if (r.status === 'active') {
        return {
          ...r,
          status: /** @type {const} */ ('saved'),
          lastActiveAt: now,
          updatedAt: now,
        };
      }
      return r;
    });
    const updatedBooks = recordBooksRotated(state.books, target.bookIds, {
      rotatedAt: now,
      rotationId: target.id,
      profileId: target.profileId,
    });
    await commit({ ...state, books: updatedBooks, rotations: nextRotations });
    notify(`Switched active shelf to "${target.title}".`, 'success');
  }

  /**
   * Toggles a rotation between `'active'` and `'saved'` without displacing other active shelves,
   * allowing multiple simultaneous active shelves (e.g., Home and Grandma's House).
   * @param {string} rotationId
   */
  async function toggleRotationActive(rotationId) {
    const target = state.rotations.find((r) => r.id === rotationId);
    if (!target) return;
    const now = new Date().toISOString();
    const activating = target.status !== 'active';
    const nextStatus = activating ? /** @type {const} */ ('active') : /** @type {const} */ ('saved');

    const nextRotations = state.rotations.map((r) => {
      if (r.id !== rotationId) return r;
      return {
        ...r,
        status: nextStatus,
        ...(activating
          ? {
              activatedAt: now,
              lastActiveAt: now,
              slotAddedAt: syncRotationSlotAddedAt(r.slotAddedAt, r.bookIds, now, {
                resetAll: true,
              }),
            }
          : target.status === 'active'
            ? { lastActiveAt: now }
            : {}),
        updatedAt: now,
      };
    });

    const updatedBooks = activating
      ? recordBooksRotated(state.books, target.bookIds, {
          rotatedAt: now,
          rotationId: target.id,
          profileId: target.profileId,
        })
      : state.books;

    await commit({ ...state, books: updatedBooks, rotations: nextRotations });
    notify(
      activating
        ? `"${target.title}" is now an active rotation.`
        : `Moved "${target.title}" to saved shelves.`,
      activating ? 'success' : 'info'
    );
  }

  /**
   * Updates an existing rotation shelf's name (`title`), description (`rules.objective`),
   * and any rotation rule parameters (`count`, `swapDays`, `cooldownDays`, `preferredTags`,
   * `requiredFormat`, `varietyMix`, `seed`) while preserving books, read completion status,
   * and schedule creation/activation timestamps.
   *
   * @param {string} rotationId
   * @param {{
   *   title?: string,
   *   description?: string,
   *   objective?: string,
   *   status?: 'active' | 'saved',
   *   count?: number,
   *   swapDays?: number,
   *   cooldownDays?: number,
   *   preferredTags?: string[] | string,
   *   requiredFormat?: import('../types/models.js').BookFormat | 'any' | '',
   *   varietyMix?: boolean,
   *   seed?: string
   * }} patch
   * @param {{ silent?: boolean, skipIfUnchanged?: boolean, keepOtherActive?: boolean }} [options]
   */
  async function updateRotationDetails(rotationId, patch, options = {}) {
    const existing = state.rotations.find((r) => r.id === rotationId);
    if (!existing) {
      throw new Error('Rotation shelf not found.');
    }

    const nextTitle =
      patch.title !== undefined ? String(patch.title).trim() : existing.title;
    if (!nextTitle) {
      throw new Error('Rotation name is required.');
    }

    const rawDesc =
      patch.description !== undefined
        ? patch.description
        : patch.objective !== undefined
          ? patch.objective
          : existing.rules.objective;
    const nextObjective = String(rawDesc ?? '').trim();

    const nextCount =
      patch.count !== undefined && !Number.isNaN(Number(patch.count))
        ? normalizePositiveBookCount(patch.count, 1)
        : existing.rules.count;

    const nextCooldownDays =
      patch.cooldownDays !== undefined && !Number.isNaN(Number(patch.cooldownDays))
        ? Math.max(0, Math.min(90, Math.trunc(Number(patch.cooldownDays))))
        : existing.rules.cooldownDays;

    const nextSwapDays =
      patch.swapDays !== undefined && !Number.isNaN(Number(patch.swapDays))
        ? Math.max(1, Math.min(90, Math.trunc(Number(patch.swapDays) || 1)))
        : existing.rules.swapDays;

    let nextPreferredTags = existing.rules.preferredTags || [];
    if (patch.preferredTags !== undefined) {
      const rawList = Array.isArray(patch.preferredTags)
        ? patch.preferredTags
        : String(patch.preferredTags || '').split(',');
      nextPreferredTags = Array.from(
        new Set(rawList.map((t) => String(t || '').toLowerCase().trim()).filter(Boolean))
      );
    }

    const nextVarietyMix =
      patch.varietyMix !== undefined
        ? Boolean(patch.varietyMix)
        : existing.rules.varietyMix !== false;

    const rawFormat =
      patch.requiredFormat !== undefined
        ? patch.requiredFormat
        : existing.rules.requiredFormat || 'any';
    const nextRequiredFormat =
      rawFormat === 'hardcover' || rawFormat === 'board-book' || rawFormat === 'paperback'
        ? rawFormat
        : undefined;

    const rawSeed =
      patch.seed !== undefined ? String(patch.seed || '').trim() : existing.rules.seed || '';
    const nextSeed = rawSeed || undefined;

    const nextStatus =
      patch.status === 'active' || patch.status === 'saved' ? patch.status : existing.status;

    /** @type {import('../types/models.js').RotationRuleConfig} */
    const nextRules = {
      count: nextCount,
      objective: nextObjective,
      preferredTags: nextPreferredTags,
      cooldownDays: nextCooldownDays,
      ...(nextSwapDays !== undefined ? { swapDays: nextSwapDays } : {}),
      varietyMix: nextVarietyMix,
      ...(nextRequiredFormat ? { requiredFormat: nextRequiredFormat } : {}),
      ...(nextSeed ? { seed: nextSeed } : {}),
    };

    const rulesUnchanged =
      existing.title === nextTitle &&
      existing.status === nextStatus &&
      existing.rules.count === nextRules.count &&
      (existing.rules.objective || '') === nextRules.objective &&
      JSON.stringify(existing.rules.preferredTags || []) ===
        JSON.stringify(nextRules.preferredTags) &&
      existing.rules.cooldownDays === nextRules.cooldownDays &&
      existing.rules.swapDays === nextRules.swapDays &&
      (existing.rules.varietyMix !== false) === Boolean(nextRules.varietyMix) &&
      (existing.rules.requiredFormat || undefined) === nextRules.requiredFormat &&
      (existing.rules.seed || undefined) === nextRules.seed;

    if (rulesUnchanged && options.skipIfUnchanged) {
      return existing;
    }

    const now = new Date().toISOString();
    const activatingNow = nextStatus === 'active' && existing.status !== 'active';
    const deactivatingNow = nextStatus === 'saved' && existing.status === 'active';

    /** @type {import('../types/models.js').RotationList} */
    const updatedRotation = {
      ...existing,
      title: nextTitle,
      status: nextStatus,
      rules: nextRules,
      updatedAt: now,
      ...(activatingNow
        ? { activatedAt: now, lastActiveAt: now }
        : deactivatingNow
          ? { lastActiveAt: now }
          : {}),
    };

    const nextRotations = state.rotations.map((r) => {
      if (r.id === rotationId) return updatedRotation;
      if (!options.keepOtherActive && activatingNow && r.profileId === existing.profileId && r.status === 'active') {
        return {
          ...r,
          status: /** @type {const} */ ('saved'),
          lastActiveAt: now,
          updatedAt: now,
        };
      }
      return r;
    });

    const nextBooks = activatingNow
      ? recordBooksRotated(state.books, existing.bookIds, {
          rotatedAt: now,
          rotationId: existing.id,
          profileId: existing.profileId,
        })
      : state.books;

    await commit({
      ...state,
      books: nextBooks,
      rotations: nextRotations,
    });
    if (!options.silent) {
      notify(`Updated "${updatedRotation.title}".`, 'success');
    }
    return updatedRotation;
  }

  /**
   * Adds a new user-defined `RotationPreset` configuration to `state.customPresets`.
   * @param {Parameters<typeof normalizeRotationPresetInput>[0]} input
   */
  async function addRotationPreset(input) {
    const preset = normalizeRotationPresetInput({
      ...input,
      id: undefined,
    });
    const currentCustom = Array.isArray(state.customPresets) ? state.customPresets : [];
    await commit({
      ...state,
      customPresets: [preset, ...currentCustom],
    });
    notify(`Saved collection preset "${preset.title}".`, 'success');
    return preset;
  }

  /**
   * Updates either an existing user-defined custom `RotationPreset` OR saves an in-place
   * override for a built-in default preset in `state.presetOverrides`.
   * @param {string} presetId
   * @param {Parameters<typeof normalizeRotationPresetInput>[0]} patch
   */
  async function updateRotationPreset(presetId, patch) {
    const currentCustom = Array.isArray(state.customPresets) ? state.customPresets : [];
    const existingCustom = currentCustom.find((p) => p.id === presetId);
    if (existingCustom) {
      const updated = normalizeRotationPresetInput(
        {
          ...existingCustom,
          ...patch,
          id: existingCustom.id,
          createdAt: existingCustom.createdAt,
        },
        { isCustom: true }
      );

      await commit({
        ...state,
        customPresets: currentCustom.map((p) => (p.id === presetId ? updated : p)),
      });
      notify(`Updated collection preset "${updated.title}".`, 'success');
      return updated;
    }

    const builtInBase = DEFAULT_ROTATION_PRESETS.find((p) => p.id === presetId);
    if (builtInBase) {
      const currentOverrides =
        state.presetOverrides && typeof state.presetOverrides === 'object'
          ? state.presetOverrides
          : {};
      const existingEffective = currentOverrides[presetId]
        ? { ...builtInBase, ...currentOverrides[presetId] }
        : builtInBase;

      const updatedBuiltIn = normalizeRotationPresetInput(
        {
          ...existingEffective,
          ...patch,
          id: builtInBase.id,
        },
        { isCustom: false, isBuiltInOverride: true }
      );

      await commit({
        ...state,
        presetOverrides: {
          ...currentOverrides,
          [presetId]: updatedBuiltIn,
        },
      });
      notify(`Updated preset "${updatedBuiltIn.title}".`, 'success');
      return updatedBuiltIn;
    }

    throw new Error('Collection preset not found.');
  }

  /**
   * Restores an edited built-in `RotationPreset` back to its factory configuration.
   * @param {string} presetId
   */
  async function resetBuiltInPreset(presetId) {
    const builtInBase = DEFAULT_ROTATION_PRESETS.find((p) => p.id === presetId);
    const currentOverrides =
      state.presetOverrides && typeof state.presetOverrides === 'object'
        ? state.presetOverrides
        : {};
    if (!builtInBase || !currentOverrides[presetId]) return false;

    const nextOverrides = { ...currentOverrides };
    delete nextOverrides[presetId];

    await commit({
      ...state,
      presetOverrides: nextOverrides,
    });
    notify(`Restored "${builtInBase.title}" to default settings.`, 'info');
    return true;
  }

  /**
   * Deletes a user-defined custom `RotationPreset`.
   * @param {string} presetId
   */
  async function deleteRotationPreset(presetId) {
    const currentCustom = Array.isArray(state.customPresets) ? state.customPresets : [];
    const target = currentCustom.find((p) => p.id === presetId);
    if (!target) return false;

    await commit({
      ...state,
      customPresets: currentCustom.filter((p) => p.id !== presetId),
    });
    notify(`Removed preset "${target.title}".`, 'info');
    return true;
  }

  /**
   * Toggles whether a preset is Active (participates in notifications) or Paused.
   * @param {string} presetId
   */
  async function togglePresetActive(presetId) {
    const all = getAllRotationPresets(state);
    const target = all.find((p) => p.id === presetId);
    if (!target) {
      throw new Error('Collection preset not found.');
    }
    const nextIsActive = target.isActive === false;
    return updateRotationPreset(presetId, { isActive: nextIsActive });
  }

  /**
   * Generates a curated rotation shelf from any built-in or custom `RotationPreset` using the
   * user's library books and the preset's title, description, topic preferences, book count,
   * swap cycle, cooldown, binding preference, and deterministic seed.
   *
   * @param {string} presetId
   * @param {{ profileId?: string, status?: 'active' | 'saved', keepOtherActive?: boolean, title?: string, count?: number, swapDays?: number }} [options]
   */
  async function generateRotationFromPreset(presetId, options = {}) {
    const allPresets = getAllRotationPresets(state);
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) {
      throw new Error('Collection preset not found.');
    }

    return generateRotation({
      title: options.title?.trim() || preset.title,
      objective: preset.description,
      status: options.status,
      count: options.count ?? preset.count,
      preferredTags: preset.preferredTags,
      cooldownDays: preset.cooldownDays,
      swapDays: options.swapDays ?? preset.swapDays,
      varietyMix: preset.varietyMix,
      requiredFormat: preset.requiredFormat,
      seed: preset.seed,
      profileId: options.profileId,
      keepOtherActive: options.keepOtherActive,
    });
  }

  /** @type {Promise<any>} */
  let syncNotificationsQueue = Promise.resolve();

  /**
   * Scans active presets within `presetAlertDaysBefore` / `presetAlertDaysAfter` and active shelf Swap Day
   * reminders, appending persistent unread `AppNotification` records without duplicating existing `alertKey`s
   * or semantic cycle alerts. Serialized via a promise queue so concurrent calls cannot create duplicates.
   *
   * @param {Date | string | number} [referenceDate]
   */
  function syncNotifications(referenceDate = new Date()) {
    const run = async () => {
      const activeProfile =
        state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0] || null;
      if (!activeProfile) return state.notifications || [];

      const activeRotation =
        state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') || null;
      const profileRotations = state.rotations.filter((r) => r.profileId === activeProfile.id);

      const rawExistingList = Array.isArray(state.notifications) ? state.notifications : [];
      /** @type {import('../types/models.js').AppNotification[]} */
      const existingList = [];
      /** @type {Map<string, number>} */
      const dedupeIndexMap = new Map();
      let dedupedExistingChanged = false;

      for (const item of rawExistingList) {
        const dKey = resolveNotificationDedupeKey(item);
        if (dKey && dedupeIndexMap.has(dKey)) {
          const prevIdx = dedupeIndexMap.get(dKey);
          if (prevIdx !== undefined) {
            const prev = existingList[prevIdx];
            existingList[prevIdx] = {
              ...prev,
              ...(prev.dismissed || item.dismissed ? { dismissed: true } : {}),
              ...(prev.readAt || item.readAt ? { readAt: prev.readAt || item.readAt } : {}),
            };
          }
          dedupedExistingChanged = true;
          continue;
        }
        if (dKey) dedupeIndexMap.set(dKey, existingList.length);
        existingList.push(item);
      }

      const byAlertKey = new Map();
      const byDedupeKey = new Map();
      for (const n of existingList) {
        if (n.alertKey) byAlertKey.set(n.alertKey, n);
        const dk = resolveNotificationDedupeKey(n);
        if (dk && !byDedupeKey.has(dk)) byDedupeKey.set(dk, n);
      }

      const nowIso = new Date().toISOString();
      let changed = dedupedExistingChanged;
      /** @type {import('../types/models.js').AppNotification[]} */
      const added = [];
      /** @type {Set<string>} */
      const queuedKeys = new Set();
      /** @type {Map<string, Partial<import('../types/models.js').AppNotification>>} */
      const patchById = new Map();

      // 1. Seasonal / Tradition Preset Reminders (skipping paused presets via findMatchingStartDatePresets)
      const allPresets = getAllRotationPresets(state);
      const presetMatches = findMatchingStartDatePresets(allPresets, referenceDate, {
        activeRotation,
        profileRotations,
        daysBefore: state.settings.presetAlertDaysBefore ?? 2,
        daysAfter: state.settings.presetAlertDaysAfter ?? 5,
      });

      for (const { preset, schedule } of presetMatches) {
        if (!schedule.alertKey) continue;
        const scopedAlertKey = `${schedule.alertKey}::${activeProfile.id}`;
        const signed = schedule.signedDaysFromStart || 0;
        const daysRemaining = signed < 0 ? Math.abs(signed) : 0;
        const timingHeadline =
          signed < 0
            ? `Available in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} (${schedule.formattedDateLabel})`
            : signed === 0
              ? `Suggested today (${schedule.formattedDateLabel})`
              : `Suggested ${signed} ${signed === 1 ? 'day' : 'days'} ago (${schedule.formattedDateLabel})`;

        const title = `${preset.title} · ${timingHeadline}`;
        const message = `${preset.description} (${preset.count} books · ${preset.swapDays}d cycle for ${activeProfile.name})`;

        const candidateNotif = {
          id: '',
          kind: /** @type {const} */ ('preset-upcoming'),
          title,
          message,
          alertKey: scopedAlertKey,
          presetId: preset.id,
          profileId: activeProfile.id,
          daysRemaining,
          createdAt: nowIso,
        };
        const semanticKey = resolveNotificationDedupeKey(candidateNotif);
        if (queuedKeys.has(scopedAlertKey) || (semanticKey && queuedKeys.has(semanticKey))) {
          continue;
        }
        queuedKeys.add(scopedAlertKey);
        if (semanticKey) queuedKeys.add(semanticKey);

        const existing =
          byAlertKey.get(scopedAlertKey) ||
          (semanticKey ? byDedupeKey.get(semanticKey) : undefined);
        if (!existing) {
          added.push({
            ...candidateNotif,
            id: createId('notif'),
          });
          changed = true;
        } else if (
          !existing.dismissed &&
          (existing.title !== title || existing.daysRemaining !== daysRemaining)
        ) {
          patchById.set(existing.id, { title, message, daysRemaining });
          changed = true;
        }
      }

      // 2. Active Shelf Swap Day Reminder
      if (activeRotation) {
        const swapSched = computeRotationSchedule(activeRotation, activeProfile, referenceDate);
        if (swapSched.isDue) {
          const swapKey = `swap::${swapSched.reminderKey}`;
          const timing =
            swapSched.daysOverdue > 0
              ? `${swapSched.daysOverdue}d overdue (${swapSched.dueDateLabel})`
              : `due today (${swapSched.dueDateLabel})`;
          const title = `Swap Day ${timing}: ${activeRotation.title}`;
          const message = `${activeProfile.name}’s ${swapSched.cycleDays}-day shelf cycle is ready for a fresh rotation.`;

          const candidateSwap = {
            id: '',
            kind: /** @type {const} */ ('swap-due'),
            title,
            message,
            alertKey: swapKey,
            rotationId: activeRotation.id,
            profileId: activeProfile.id,
            daysRemaining: 0,
            createdAt: nowIso,
          };
          const semanticSwapKey = resolveNotificationDedupeKey(candidateSwap);
          if (!queuedKeys.has(swapKey) && (!semanticSwapKey || !queuedKeys.has(semanticSwapKey))) {
            queuedKeys.add(swapKey);
            if (semanticSwapKey) queuedKeys.add(semanticSwapKey);

            const existing =
              byAlertKey.get(swapKey) ||
              (semanticSwapKey ? byDedupeKey.get(semanticSwapKey) : undefined);
            if (!existing) {
              added.push({
                ...candidateSwap,
                id: createId('notif'),
              });
              changed = true;
            } else if (!existing.dismissed && existing.title !== title) {
              patchById.set(existing.id, { title, message });
              changed = true;
            }
          }
        }
      }

      if (!changed) return existingList;

      const updatedExisting = existingList.map((n) =>
        patchById.has(n.id) ? { ...n, ...patchById.get(n.id) } : n
      );
      const nextList = [...added, ...updatedExisting].slice(0, 80);
      await commit({
        ...state,
        notifications: nextList,
      });
      return nextList;
    };

    const nextTask = syncNotificationsQueue.then(run, run);
    syncNotificationsQueue = nextTask.catch(() => {});
    return nextTask;
  }

  /**
   * Marks a single notification as read in persistent history.
   * @param {string} notificationId
   */
  async function markNotificationRead(notificationId) {
    const existingList = Array.isArray(state.notifications) ? state.notifications : [];
    const target = existingList.find((n) => n.id === notificationId);
    if (!target || target.readAt) return;
    const nowIso = new Date().toISOString();
    await commit({
      ...state,
      notifications: existingList.map((n) =>
        n.id === notificationId ? { ...n, readAt: nowIso } : n
      ),
    });
  }

  /**
   * Marks all notifications in history as read.
   */
  async function markAllNotificationsRead() {
    const existingList = Array.isArray(state.notifications) ? state.notifications : [];
    if (!existingList.some((n) => !n.readAt)) return;
    const nowIso = new Date().toISOString();
    await commit({
      ...state,
      notifications: existingList.map((n) => (n.readAt ? n : { ...n, readAt: nowIso })),
    });
  }

  /**
   * Dismisses an active notification alert (marking it read & dismissed while keeping it in history).
   * @param {string} notificationId
   */
  async function dismissNotificationAlert(notificationId) {
    const existingList = Array.isArray(state.notifications) ? state.notifications : [];
    const target = existingList.find((n) => n.id === notificationId);
    if (!target || target.dismissed) return;
    const nowIso = new Date().toISOString();
    await commit({
      ...state,
      notifications: existingList.map((n) =>
        n.id === notificationId ? { ...n, dismissed: true, readAt: n.readAt || nowIso } : n
      ),
    });
  }

  /**
   * Clears all notification history entries.
   */
  async function clearNotificationHistory() {
    const existingList = Array.isArray(state.notifications) ? state.notifications : [];
    if (existingList.length === 0) return;
    await commit({
      ...state,
      notifications: [],
    });
    notify('Cleared notification history.', 'info');
  }

  /**
   * Updates user settings (theme, provider configuration, AI opt-in, scan mode).
   * @param {Partial<import('../types/models.js').AppSettings>} patch
   */
  async function updateSettings(patch) {
    const prevTintMode = normalizeTintMode(state.settings?.dynamicCoverTintMode);
    const nextSettings = createSafeDefaultSettings({
      ...state.settings,
      ...patch,
    });
    await commit({
      ...state,
      settings: nextSettings,
    });
    const nextTintMode = normalizeTintMode(nextSettings.dynamicCoverTintMode);
    if (nextTintMode !== prevTintMode && typeof document !== 'undefined') {
      for (const b of state.books) {
        if (b.coverUrl && b.dominantColorSource !== 'manual') {
          resolveAndPersistBookCoverTint(b.id, b.coverUrl, { mode: nextTintMode });
        }
      }
    }
  }

  /**
   * Toggles an external book metadata provider (`google-books` or `open-library`),
   * keeping at least one provider enabled so lookups remain functional.
   * @param {string} providerId
   */
  async function toggleMetadataProvider(providerId) {
    const current = new Set(state.settings.enabledMetadataProviders);
    if (current.has(providerId)) {
      if (current.size <= 1) {
        notify('Keep at least one catalog metadata provider enabled.', 'error');
        return false;
      }
      current.delete(providerId);
    } else {
      current.add(providerId);
    }
    await updateSettings({ enabledMetadataProviders: Array.from(current) });
    return true;
  }

  /**
   * Restores all metadata & AI enrichment settings to safe, privacy-first defaults
   * while preserving household identity, onboarding state, theme, and camera preferences.
   */
  async function resetProviderSettingsToSafeDefaults() {
    const safeDefaults = createSafeDefaultSettings({
      language: state.settings.language,
      householdName: state.settings.householdName,
      onboarding: state.settings.onboarding,
      devModeUnlocked: state.settings.devModeUnlocked,
      showMiniWizards: state.settings.showMiniWizards,
      theme: state.settings.theme,
      themePreset: state.settings.themePreset,
      bookDetailStyle: state.settings.bookDetailStyle,
      bookViewMode: state.settings.bookViewMode,
      bookCardSize: state.settings.bookCardSize,
      bookCardCustomWidth: state.settings.bookCardCustomWidth,
      bookCardInfoPlacement: state.settings.bookCardInfoPlacement,
      bookCardFrame: state.settings.bookCardFrame,
      showBookCoverOverlays: state.settings.showBookCoverOverlays,
      bookCardFields: state.settings.bookCardFields,
      bookCardSectionOverrides: state.settings.bookCardSectionOverrides,
      sidebarArtworkMode: state.settings.sidebarArtworkMode,
      sidebarArtworkId: state.settings.sidebarArtworkId,
      sidebarArtworkStyle: state.settings.sidebarArtworkStyle,
      sidebarDividerStyle: state.settings.sidebarDividerStyle,
      onboardingLandingMode: state.settings.onboardingLandingMode,
      nativeAppStyle: state.settings.nativeAppStyle,
      translucentTopBar: state.settings.translucentTopBar,
      translucentBottomBar: state.settings.translucentBottomBar,
      bottomNavStyle: state.settings.bottomNavStyle,
      bookCardShadow: state.settings.bookCardShadow,
      notificationsEnabled: state.settings.notificationsEnabled,
      coverAspectRatio: state.settings.coverAspectRatio,
      dynamicCoverTint: state.settings.dynamicCoverTint,
      dynamicCoverTintStyle: state.settings.dynamicCoverTintStyle,
      dynamicCoverTintBehavior: state.settings.dynamicCoverTintBehavior,
      dynamicCoverTintMode: state.settings.dynamicCoverTintMode,
      dynamicCoverTintCircularFade: state.settings.dynamicCoverTintCircularFade,
      dynamicCoverTintLinearFade: state.settings.dynamicCoverTintLinearFade,
      showPresetDecorations: state.settings.showPresetDecorations,
      presetCornerArtSize: state.settings.presetCornerArtSize,
      preferredScanMode: state.settings.preferredScanMode,
    });
    await commit({
      ...state,
      settings: safeDefaults,
    });
    notify('Restored safe privacy-first provider & AI defaults.', 'info');
  }

  /**
   * Updates the optional parent or household display name inside `settings.householdName`.
   * @param {string} rawName
   * @param {{ silent?: boolean }} [options]
   */
  async function setHouseholdName(rawName, options = {}) {
    const cleanName = String(rawName || '').trim().slice(0, 80);
    await commit({
      ...state,
      settings: createSafeDefaultSettings({
        ...state.settings,
        householdName: cleanName,
      }),
    });
    if (!options.silent) {
      notify(
        cleanName
          ? `Saved household name "${cleanName}".`
          : 'Cleared household display name.',
        'success'
      );
    }
  }

  /**
   * Updates guided onboarding wizard progress cleanly without disturbing catalog or profiles.
   * @param {Partial<import('../types/models.js').OnboardingProgressState>} patch
   */
  async function updateOnboarding(patch = {}) {
    const prev = state.settings.onboarding || {
      status: 'pending',
      currentStep: 0,
      completedSteps: [],
      skippedSteps: [],
    };
    const nextOnboarding = {
      ...prev,
      ...patch,
      completedSteps: Array.isArray(patch.completedSteps)
        ? patch.completedSteps
        : prev.completedSteps || [],
      skippedSteps: Array.isArray(patch.skippedSteps)
        ? patch.skippedSteps
        : prev.skippedSteps || [],
    };
    await commit({
      ...state,
      settings: {
        ...state.settings,
        onboarding: nextOnboarding,
      },
    });
  }

  /**
   * Marks onboarding completed or skipped (or exits QA preview cleanly without losing real data).
   * @param {{ skipped?: boolean }} [options]
   */
  async function completeOnboarding(options = {}) {
    const prev = state.settings.onboarding;
    if (prev?.previewMode) {
      return exitPreviewOnboarding();
    }
    const now = new Date().toISOString();
    const skipped = Boolean(options.skipped);
    await commit({
      ...state,
      settings: {
        ...state.settings,
        onboarding: {
          status: skipped ? 'skipped' : 'completed',
          currentStep: 6,
          completedSteps: Array.isArray(prev?.completedSteps) ? prev.completedSteps : [],
          skippedSteps: Array.isArray(prev?.skippedSteps) ? prev.skippedSteps : [],
          ...(prev?.startedAt ? { startedAt: prev.startedAt } : {}),
          completedAt: now,
        },
      },
    });
  }

  /**
   * Additively imports the predefined starter sample books into the current family catalog
   * without overwriting the user's household name, created child profiles, or existing books.
   * @param {{ assignToProfileId?: string, silent?: boolean }} [options]
   */
  async function importSampleCollectionAdditive(options = {}) {
    const seedBooks = createSeedState().books;
    const existingIds = new Set(state.books.map((b) => b.id));
    const existingIsbns = new Set(
      state.books.map((b) => b.isbn13).filter((isbn) => typeof isbn === 'string' && isbn.length > 0)
    );
    const assignProfileId =
      options.assignToProfileId || state.activeProfileId || state.profiles[0]?.id || '';
    const owners = assignProfileId ? [assignProfileId, 'shared'] : ['shared'];
    const now = new Date().toISOString();

    /** @type {import('../types/models.js').Book[]} */
    const addedBooks = [];
    let skippedDuplicatesCount = 0;

    for (const sample of seedBooks) {
      if (existingIds.has(sample.id) || (sample.isbn13 && existingIsbns.has(sample.isbn13))) {
        skippedDuplicatesCount += 1;
        continue;
      }
      const { lastRotatedAt: _ignoredLastRotated, ...restSample } = sample;
      addedBooks.push({
        ...restSample,
        owners,
        addedAt: now,
      });
    }

    if (addedBooks.length > 0) {
      await commit({
        ...state,
        books: [...addedBooks, ...state.books],
      });
    }

    if (!options.silent) {
      notify(
        addedBooks.length > 0
          ? `Added ${addedBooks.length} sample books to your family library.`
          : 'All sample starter books are already in your library.',
        addedBooks.length > 0 ? 'success' : 'info'
      );
    }

    return { addedBooks, skippedDuplicatesCount };
  }

  /**
   * Replaces the workspace with the full predefined sample family (Maya, Leo, curated sample books, 2 shelves).
   * Preserves language, theme, and devModeUnlocked.
   * @param {{ preserveOnboarding?: boolean }} [options]
   */
  async function loadFullSampleHousehold(options = {}) {
    const seeded = createSeedState();
    const now = new Date().toISOString();
    await commit({
      ...seeded,
      settings: {
        ...state.settings,
        ...seeded.settings,
        language: state.settings.language,
        theme: state.settings.theme,
        themePreset: state.settings.themePreset,
        bookDetailStyle: state.settings.bookDetailStyle,
        bookViewMode: state.settings.bookViewMode,
        bookCardSize: state.settings.bookCardSize,
        bookCardCustomWidth: state.settings.bookCardCustomWidth,
        bookCardInfoPlacement: state.settings.bookCardInfoPlacement,
        bookCardFrame: state.settings.bookCardFrame,
        showBookCoverOverlays: state.settings.showBookCoverOverlays,
        bookCardFields: state.settings.bookCardFields,
        bookCardSectionOverrides: state.settings.bookCardSectionOverrides,
        sidebarArtworkMode: state.settings.sidebarArtworkMode,
        sidebarArtworkId: state.settings.sidebarArtworkId,
        sidebarArtworkStyle: state.settings.sidebarArtworkStyle,
        sidebarDividerStyle: state.settings.sidebarDividerStyle,
        dynamicCoverTint: state.settings.dynamicCoverTint,
        dynamicCoverTintStyle: state.settings.dynamicCoverTintStyle,
        dynamicCoverTintBehavior: state.settings.dynamicCoverTintBehavior,
        dynamicCoverTintMode: state.settings.dynamicCoverTintMode,
        dynamicCoverTintCircularFade: state.settings.dynamicCoverTintCircularFade,
        dynamicCoverTintLinearFade: state.settings.dynamicCoverTintLinearFade,
        onboardingLandingMode: state.settings.onboardingLandingMode,
        devModeUnlocked: state.settings.devModeUnlocked,
        showMiniWizards: state.settings.showMiniWizards,
        onboarding: options.preserveOnboarding
          ? state.settings.onboarding
          : {
              status: 'completed',
              currentStep: 6,
              completedSteps: [0, 1, 2, 3, 4, 5, 6],
              skippedSteps: [],
              completedAt: now,
            },
      },
    });
    notify(`Loaded full sample family (Maya, Leo & ${seeded.books.length} curated books).`, 'success');
  }

  /**
   * Enters an ephemeral QA Preview of the first-time onboarding flow after backing up
   * the user's current library state into the isolated QA snapshot key.
   */
  async function previewOnboarding() {
    if (!state.settings.onboarding?.previewMode) {
      saveQaUserSnapshot(state);
    }
    const now = new Date().toISOString();
    await commit({
      ...state,
      settings: {
        ...state.settings,
        onboarding: {
          status: 'in_progress',
          currentStep: 0,
          completedSteps: [],
          skippedSteps: [],
          previewMode: true,
          startedAt: now,
        },
      },
    });
  }

  /**
   * Exits Onboarding Preview Mode and restores the backed-up library snapshot safely.
   */
  async function exitPreviewOnboarding() {
    const snapshot = loadQaUserSnapshot();
    const now = new Date().toISOString();
    if (snapshot) {
      await commit({
        ...snapshot,
        settings: {
          ...snapshot.settings,
          devModeUnlocked: state.settings.devModeUnlocked || snapshot.settings.devModeUnlocked,
          onboarding: {
            status: 'completed',
            currentStep: 6,
            completedSteps: snapshot.settings.onboarding?.completedSteps || [],
            skippedSteps: snapshot.settings.onboarding?.skippedSteps || [],
            completedAt: snapshot.settings.onboarding?.completedAt || now,
          },
        },
      });
      notify('Exited onboarding preview and restored your library.', 'info');
      return true;
    }

    await commit({
      ...state,
      settings: {
        ...state.settings,
        onboarding: {
          status: 'completed',
          currentStep: 6,
          completedSteps: [],
          skippedSteps: [],
          completedAt: now,
        },
      },
    });
    notify('Exited onboarding preview.', 'info');
    return true;
  }

  /**
   * Restarts the onboarding wizard at Step 0 while keeping existing profiles and books intact.
   */
  async function restartOnboarding() {
    const now = new Date().toISOString();
    await commit({
      ...state,
      settings: {
        ...state.settings,
        onboarding: {
          status: 'in_progress',
          currentStep: 0,
          completedSteps: [],
          skippedSteps: [],
          startedAt: now,
        },
      },
    });
  }

  /**
   * Resets only the onboarding completion flag back to `'pending'` while preserving all user data.
   */
  async function resetOnboardingCompletionFlag() {
    const now = new Date().toISOString();
    await commit({
      ...state,
      settings: {
        ...state.settings,
        onboarding: {
          status: 'pending',
          currentStep: 0,
          completedSteps: [],
          skippedSteps: [],
          startedAt: now,
        },
      },
    });
    notify('Onboarding flag reset to pending (data preserved).', 'info');
  }

  /**
   * Archives the active user's library into the QA snapshot key (when non-empty) and switches
   * into a fresh zero-profile clean-slate New User onboarding state.
   */
  async function switchToNewUserCleanSlate() {
    const hasData =
      state.profiles.length > 0 ||
      state.books.length > 0 ||
      state.rotations.length > 0 ||
      Boolean(state.settings.householdName);
    if (hasData && !state.settings.onboarding?.previewMode) {
      saveQaUserSnapshot(state);
    }
    clearAuxiliaryLocalStorageKeys();
    const clean = createEmptyOnboardingState({
      language: state.settings.language,
      theme: state.settings.theme,
      themePreset: state.settings.themePreset,
      devModeUnlocked: state.settings.devModeUnlocked,
      showMiniWizards: state.settings.showMiniWizards,
    });
    await commit(clean);
    notify('Switched to a clean-slate New User onboarding state.', 'info');
  }

  /**
   * Restores the previously archived Existing User QA snapshot from storage.
   */
  async function restoreExistingUserSnapshot() {
    const snapshot = loadQaUserSnapshot();
    if (!snapshot) {
      throw new Error('No saved Existing User snapshot found.');
    }
    const now = new Date().toISOString();
    await commit({
      ...snapshot,
      settings: {
        ...snapshot.settings,
        devModeUnlocked: state.settings.devModeUnlocked || snapshot.settings.devModeUnlocked,
        onboarding: {
          status: 'completed',
          currentStep: 6,
          completedSteps: snapshot.settings.onboarding?.completedSteps || [],
          skippedSteps: snapshot.settings.onboarding?.skippedSteps || [],
          completedAt: snapshot.settings.onboarding?.completedAt || now,
        },
      },
    });
    notify('Restored Existing User library snapshot.', 'success');
    return snapshot;
  }

  /**
   * Wipes all local catalog, profile, rotation, and QA snapshot data back to a clean slate.
   */
  async function clearAllTestData() {
    clearQaUserSnapshot();
    clearAuxiliaryLocalStorageKeys();
    const clean = createEmptyOnboardingState({
      language: state.settings.language,
      theme: state.settings.theme,
      themePreset: state.settings.themePreset,
      devModeUnlocked: state.settings.devModeUnlocked,
      showMiniWizards: state.settings.showMiniWizards,
    });
    await commit(clean);
    notify('Cleared all local test data and reset to fresh onboarding.', 'info');
  }

  /**
   * Imports a validated JSON backup snapshot.
   * @param {string} rawJson
   */
  async function importBackupJson(rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch (_) {
      throw new Error('Selected file is not valid JSON.');
    }
    if (!isValidAppState(parsed)) {
      throw new Error(
        'Backup file is missing required Library Rotation fields (profiles, books, rotations).'
      );
    }
    await commit(migrateState(parsed));
    notify(
      `Restored ${parsed.books.length} books and ${parsed.profiles.length} profiles.`,
      'success'
    );
  }

  /**
   * Resets local database back to starter sample seed data.
   */
  async function resetToSeedData() {
    const seeded = createSeedState();
    const now = new Date().toISOString();
    await commit({
      ...seeded,
      settings: {
        ...state.settings,
        onboarding: {
          status: 'completed',
          currentStep: 6,
          completedSteps: state.settings.onboarding?.completedSteps || [],
          skippedSteps: state.settings.onboarding?.skippedSteps || [],
          completedAt: now,
        },
      },
    });
    notify('Library reset to sample family seed data.', 'info');
  }

  return {
    init,
    getState: () => state,
    isInitialized: () => initialized,
    getToast: () => toast,
    getStorageBackend: () => storage.getBackendName(),
    getTaggingService: () => tagging,
    getLibraryUsageContext: (/** @type {Date | string | number | undefined} */ refDate) =>
      buildAiLibraryUsageContext({
        books: state.books,
        profiles: state.profiles,
        rotations: state.rotations,
        activeProfileId: state.activeProfileId,
        staleBookDays: state.settings.staleBookDays ?? 10,
        referenceDate: refDate,
      }),
    subscribe: (/** @type {() => void} */ cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    notify,
    dismissToast,
    setActiveProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    addManualBook,
    addBookFromCandidate,
    updateBook,
    toggleBookLoved,
    setBookDominantColor,
    setUserRating,
    addBookNote,
    updateBookNote,
    deleteBookNote,
    addBookRecording,
    updateBookRecording,
    deleteBookRecording,
    toggleBookRotationEligibility,
    addBookTag,
    removeBookTag,
    enrichSingleBook,
    enrichAllCatalogBooks,
    syncExistingCatalogMetadata,
    deleteBook,
    setRotationBookStatus,
    toggleRotationBookPicked,
    toggleRotationBookRead,
    toggleRotationBookPlaced,
    setRotationBooksPlaced,
    toggleProfileBookRead,
    setProfileBookReadingStatus,
    generateRotation,
    createStarterRotation,
    replaceRotationBookRandom,
    replaceRotationBookManual,
    addBooksToRotationManual,
    addBooksToRotationRandom,
    refreshRotationFromRules,
    removeBookFromRotation,
    deleteRotation,
    setActiveRotation,
    toggleRotationActive,
    updateRotationDetails,
    addRotationPreset,
    updateRotationPreset,
    togglePresetActive,
    resetBuiltInPreset,
    deleteRotationPreset,
    generateRotationFromPreset,
    syncNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    dismissNotificationAlert,
    clearNotificationHistory,
    updateSettings,
    setHouseholdName,
    updateOnboarding,
    completeOnboarding,
    importSampleCollectionAdditive,
    loadFullSampleHousehold,
    previewOnboarding,
    exitPreviewOnboarding,
    restartOnboarding,
    resetOnboardingCompletionFlag,
    switchToNewUserCleanSlate,
    restoreExistingUserSnapshot,
    clearAllTestData,
    toggleMetadataProvider,
    resetProviderSettingsToSafeDefaults,
    queryCategorizedTagsForBook,
    applyLlmTagsToBook,
    curateRotationWithLlm,
    saveCuratedRotation,
    generateLibraryRecommendationsWithLlm,
    addRecommendedBookToWishlist,
    importBackupJson,
    resetToSeedData,
  };
}
