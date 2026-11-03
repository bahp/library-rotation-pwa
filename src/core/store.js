/**
 * @fileoverview Observable application state store with domain actions, Phase 4 Rotation Engine,
 * Phase 5 Tagging & Optional AI Enrichment integration, and theme synchronization.
 */

import {
  computeAgeFromBirthDate,
  createId,
  formatCollectionStatus,
  inferReadingStageFromAge,
  normalizeBirthDate,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeIsbn,
  normalizeOwnersList,
} from '../types/models.js';
import { createSeedState } from '../data/seed.js';
import { createSafeDefaultSettings, isValidAppState, migrateState } from './storage.js';
import {
  candidateToBook,
  cleanProviderExternalId,
  sanitizeCoverUrl,
} from '../features/catalog/normalizer.js';
import { normalizeHexColor } from '../features/catalog/cover-color-extractor.js';
import {
  applyBookAdditions,
  applyBookReplacement,
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
  getAllRotationPresets,
  normalizeRotationPresetInput,
} from '../features/rotations/rotation-presets.js';
import {
  inferReadingLevelHint,
  sanitizeTag,
  sanitizeTagList,
  stripDiacritics,
} from '../features/tagging/rule-tagger.js';
import { createTaggingService } from '../features/tagging/tagging-service.js';

const SPINE_COLORS = ['teal', 'indigo', 'amber', 'rose', 'emerald'];

/**
 * Applies light/dark class on document.documentElement according to user preference.
 * @param {import('../types/models.js').ThemeMode} theme
 */
export function applyThemeToDom(theme) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  try {
    if (typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('lr_theme_pref', theme);
    }
  } catch (_) {}
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
  const themeMeta =
    document.getElementById('lr-theme-color') ||
    document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', isDark ? '#152226' : '#FFFDF9');
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
    applyThemeToDom(state.settings.theme);
    emit();
    await storage.save(state);
  }

  /**
   * Initializes store from browser storage and binds OS color-scheme listener.
   */
  async function init() {
    state = await storage.load();
    initialized = true;
    applyThemeToDom(state.settings.theme);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', () => {
        if (state.settings.theme === 'system') {
          applyThemeToDom('system');
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
        : Math.max(0, Math.min(18, Number.isFinite(Number(input.age)) ? Number(input.age) : 4));

    /** @type {import('../types/models.js').ChildProfile} */
    const profile = {
      id: createId('profile'),
      name,
      ...(dobCheck.birthDate ? { birthDate: dobCheck.birthDate } : {}),
      age: effectiveAge,
      readingStage: input.readingStage || inferReadingStageFromAge(effectiveAge),
      favoriteTopics: (input.favoriteTopics || []).filter(Boolean),
      defaultRotationSize: Math.max(2, Math.min(15, Number(input.defaultRotationSize) || 5)),
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
          ? Math.max(0, Math.min(18, Number(patch.age) || 0))
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
          ? Math.max(2, Math.min(15, Number(patch.defaultRotationSize) || 5))
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
    if (state.profiles.length <= 1) {
      notify('At least one reader profile is required.', 'error');
      return false;
    }
    const remaining = state.profiles.filter((p) => p.id !== profileId);
    const nextActive =
      state.activeProfileId === profileId ? remaining[0].id : state.activeProfileId;
    const remainingRotations = state.rotations.filter((r) => r.profileId !== profileId);
    await commit({
      ...state,
      activeProfileId: nextActive,
      profiles: remaining,
      rotations: remainingRotations,
    });
    notify('Removed reader profile and its saved rotations.', 'info');
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
      format: input.format || 'hardcover',
      ageMin: enriched.ageMin,
      ageMax: enriched.ageMax,
      readingStage: enriched.readingStage,
      ...(enriched.readingLevelHint ? { readingLevelHint: enriched.readingLevelHint } : {}),
      tags: enriched.tags,
      collectionStatus,
      condition,
      loved,
      owners,
      ...(dominantColor ? { dominantColor } : {}),
      spineColor: SPINE_COLORS[colorIndex],
      addedAt: now,
      sources: finalSources,
    };

    await commit({
      ...state,
      books: [book, ...state.books],
    });
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
   *   dominantColor?: string
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
        summary: candidate.summary,
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
      collectionStatus,
      condition,
      loved,
      owners,
      ...(dominantColor ? { dominantColor } : {}),
      sources,
    };

    await commit({
      ...state,
      books: [book, ...state.books],
    });
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
   *   format?: import('../types/models.js').BookFormat,
   *   ageMin?: number,
   *   ageMax?: number,
   *   readingStage?: import('../types/models.js').ReadingStage,
   *   tags?: string[],
   *   collectionStatus?: import('../types/models.js').CollectionStatus,
   *   condition?: import('../types/models.js').BookCondition,
   *   loved?: boolean,
   *   owners?: string[],
   *   dominantColor?: string | null
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
        ? Math.max(0, Math.min(16, Math.trunc(Number(patch.ageMin) || 0)))
        : existing.ageMin;
    const nextAgeMax =
      patch.ageMax !== undefined
        ? Math.max(nextAgeMin, Math.min(18, Math.trunc(Number(patch.ageMax) || nextAgeMin)))
        : Math.max(nextAgeMin, existing.ageMax);

    const nextTags =
      patch.tags !== undefined ? sanitizeTagList(patch.tags, 10) : existing.tags;

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
    let nextDominantColor = existing.dominantColor;
    if (patch.dominantColor !== undefined) {
      nextDominantColor = patch.dominantColor ? normalizeHexColor(patch.dominantColor) : undefined;
    } else if (coverChanged) {
      // Clear cached dominant color when cover art changes so extractor re-samples the new cover
      nextDominantColor = undefined;
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
      ...(nextCollectionStatus ? { collectionStatus: nextCollectionStatus } : {}),
      ...(nextCondition ? { condition: nextCondition } : {}),
      ...(nextLoved !== undefined ? { loved: nextLoved } : {}),
      ...(nextOwners && nextOwners.length > 0 ? { owners: nextOwners } : {}),
      ...(nextCoverUrl ? { coverUrl: nextCoverUrl } : {}),
      ...(nextDominantColor ? { dominantColor: nextDominantColor } : {}),
      spineColor: existing.spineColor,
      addedAt: existing.addedAt,
      ...(existing.lastRotatedAt ? { lastRotatedAt: existing.lastRotatedAt } : {}),
      sources: existing.sources,
    };

    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? updatedBook : b)),
    });
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
   * Silently caches a sampled dominant cover hex color onto a book record without triggering a toast.
   * @param {string} bookId
   * @param {string} rawHex
   */
  async function setBookDominantColor(bookId, rawHex) {
    const cleanHex = normalizeHexColor(rawHex);
    if (!cleanHex) return null;
    const target = state.books.find((b) => b.id === bookId);
    if (!target || target.dominantColor === cleanHex) return target || null;
    const updatedBook = { ...target, dominantColor: cleanHex };
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
    const updatedBook = { ...target, tags: updatedTags };
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
    await commit({
      ...state,
      books: state.books.map((b) => (b.id === bookId ? { ...b, tags: nextTags } : b)),
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

    const updatedBook = {
      ...target,
      tags: res.tags,
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

      nextBooks.push({
        ...book,
        tags: res.tags,
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
      return !hasGoogle || !b.coverUrl || !b.pageCount || !b.publishedYear;
    };

    const candidatesToSync = state.books.filter(needsCatalogSync);
    const totalToCheck = candidatesToSync.length;

    let checkedCount = 0;
    let updatedCount = 0;
    let addedCoversCount = 0;
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
          summary: matchedCandidate.summary,
          subjects: matchedCandidate.subjects,
        },
        state.settings,
        { preserveExplicitAgeAndStage: true }
      );
      const nextTags = sanitizeTagList([...book.tags, ...enriched.tags], 10);
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
        ...(coverWasAdded ? {} : book.dominantColor ? { dominantColor: book.dominantColor } : {}),
        ...(nextReadingLevelHint ? { readingLevelHint: nextReadingLevelHint } : {}),
        tags: nextTags,
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
          : 'All library books already include Google Books metadata and covers.',
      updatedCount > 0 ? 'success' : 'info'
    );

    return {
      checkedCount,
      updatedCount,
      addedCoversCount,
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
    await commit({
      ...state,
      books: state.books.filter((b) => b.id !== bookId),
      rotations: state.rotations.map((rot) => ({
        ...rot,
        bookIds: rot.bookIds.filter((id) => id !== bookId),
        completedBookIds: rot.completedBookIds.filter((id) => id !== bookId),
      })),
    });
    notify(`Removed "${target.title}" from library.`, 'info');
  }

  /**
   * Toggles read/completed state for a book inside a rotation and records profile history.
   * @param {string} rotationId
   * @param {string} bookId
   */
  async function toggleRotationBookRead(rotationId, bookId) {
    const rotation = state.rotations.find((r) => r.id === rotationId);
    if (!rotation) return;
    const isDone = rotation.completedBookIds.includes(bookId);
    const nextCompleted = isDone
      ? rotation.completedBookIds.filter((id) => id !== bookId)
      : [...rotation.completedBookIds, bookId];

    const now = new Date().toISOString();
    const nextRotations = state.rotations.map((r) =>
      r.id === rotationId
        ? { ...r, completedBookIds: nextCompleted, updatedAt: now }
        : r
    );

    const nextProfiles = state.profiles.map((p) => {
      if (p.id !== rotation.profileId) return p;
      const historySet = new Set(p.readHistoryBookIds);
      if (!isDone) historySet.add(bookId);
      return { ...p, readHistoryBookIds: Array.from(historySet) };
    });

    const nextBooks = !isDone
      ? state.books.map((b) => (b.id === bookId ? { ...b, lastReadAt: now } : b))
      : state.books;

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
   *   count?: number,
   *   preferredTags?: string[],
   *   cooldownDays?: number,
   *   swapDays?: number,
   *   varietyMix?: boolean,
   *   requiredFormat?: import('../types/models.js').BookFormat | 'any',
   *   seed?: string,
   *   profileId?: string
   * }} input
   */
  async function generateRotation(input) {
    const profile =
      state.profiles.find((p) => p.id === (input.profileId || state.activeProfileId)) ||
      state.profiles[0];

    if (state.books.length === 0) {
      throw new Error('Add at least one book to your catalog before generating a rotation.');
    }

    const desiredCount = Math.max(
      1,
      Math.min(15, Number(input.count) || profile.defaultRotationSize || 4)
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

    const newRotId = createId('rot');
    /** @type {import('../types/models.js').RotationList} */
    const newRotation = {
      id: newRotId,
      profileId: profile.id,
      title: String(input.title || '').trim() || `${profile.name}'s Curated Shelf`,
      rules,
      bookIds: engineOut.selectedBookIds,
      completedBookIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
      activatedAt: now,
      slotAddedAt: syncRotationSlotAddedAt(undefined, engineOut.selectedBookIds, now, {
        resetAll: true,
      }),
    };

    const updatedExisting = state.rotations.map((r) =>
      r.profileId === profile.id && r.status === 'active'
        ? { ...r, status: /** @type {const} */ ('saved') }
        : r
    );

    const updatedBooks = recordBooksRotated(state.books, engineOut.selectedBookIds, {
      rotatedAt: now,
      rotationId: newRotId,
      profileId: profile.id,
    });

    await commit({
      ...state,
      books: updatedBooks,
      rotations: [newRotation, ...updatedExisting],
    });

    const cooldownNote =
      engineOut.relaxedCooldownCount > 0
        ? ` (${engineOut.relaxedCooldownCount} included from cooldown due to small catalog)`
        : '';
    notify(`Generated "${newRotation.title}" for ${profile.name}${cooldownNote}.`, 'success');
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

    const safeCount = Math.max(1, Math.min(10, Math.trunc(Number(count) || 1)));
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
   * Deletes an entire saved or active rotation shelf.
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
        remaining[candidateIndex] = {
          ...remaining[candidateIndex],
          status: 'active',
          activatedAt: promotedNow,
          updatedAt: promotedNow,
        };
      }
    }

    await commit({ ...state, rotations: remaining });
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
          slotAddedAt: syncRotationSlotAddedAt(r.slotAddedAt, r.bookIds, now, {
            resetAll: true,
          }),
          updatedAt: now,
        };
      }
      if (r.status === 'active') return { ...r, status: /** @type {const} */ ('saved') };
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
   *   count?: number,
   *   swapDays?: number,
   *   cooldownDays?: number,
   *   preferredTags?: string[] | string,
   *   requiredFormat?: import('../types/models.js').BookFormat | 'any' | '',
   *   varietyMix?: boolean,
   *   seed?: string
   * }} patch
   * @param {{ silent?: boolean, skipIfUnchanged?: boolean }} [options]
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
        ? Math.max(1, Math.min(15, Math.trunc(Number(patch.count) || 1)))
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
    /** @type {import('../types/models.js').RotationList} */
    const updatedRotation = {
      ...existing,
      title: nextTitle,
      rules: nextRules,
      updatedAt: now,
    };

    await commit({
      ...state,
      rotations: state.rotations.map((r) => (r.id === rotationId ? updatedRotation : r)),
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
   * Generates a curated rotation shelf from any built-in or custom `RotationPreset` using the
   * user's library books and the preset's title, description, topic preferences, book count,
   * swap cycle, cooldown, binding preference, and deterministic seed.
   *
   * @param {string} presetId
   * @param {{ profileId?: string }} [options]
   */
  async function generateRotationFromPreset(presetId, options = {}) {
    const allPresets = getAllRotationPresets(state);
    const preset = allPresets.find((p) => p.id === presetId);
    if (!preset) {
      throw new Error('Collection preset not found.');
    }

    return generateRotation({
      title: preset.title,
      objective: preset.description,
      count: preset.count,
      preferredTags: preset.preferredTags,
      cooldownDays: preset.cooldownDays,
      swapDays: preset.swapDays,
      varietyMix: preset.varietyMix,
      requiredFormat: preset.requiredFormat,
      seed: preset.seed,
      profileId: options.profileId,
    });
  }

  /**
   * Updates user settings (theme, provider configuration, AI opt-in, scan mode).
   * @param {Partial<import('../types/models.js').AppSettings>} patch
   */
  async function updateSettings(patch) {
    await commit({
      ...state,
      settings: createSafeDefaultSettings({
        ...state.settings,
        ...patch,
      }),
    });
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
   * while preserving user theme and camera scan-mode preferences.
   */
  async function resetProviderSettingsToSafeDefaults() {
    const safeDefaults = createSafeDefaultSettings({
      theme: state.settings.theme,
      coverAspectRatio: state.settings.coverAspectRatio,
      dynamicCoverTint: state.settings.dynamicCoverTint,
      preferredScanMode: state.settings.preferredScanMode,
    });
    await commit({
      ...state,
      settings: safeDefaults,
    });
    notify('Restored safe privacy-first provider & AI defaults.', 'info');
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
    await commit({
      ...seeded,
      settings: state.settings,
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
    addBookTag,
    removeBookTag,
    enrichSingleBook,
    enrichAllCatalogBooks,
    syncExistingCatalogMetadata,
    deleteBook,
    toggleRotationBookRead,
    generateRotation,
    createStarterRotation,
    replaceRotationBookRandom,
    replaceRotationBookManual,
    addBooksToRotationManual,
    addBooksToRotationRandom,
    removeBookFromRotation,
    deleteRotation,
    setActiveRotation,
    updateRotationDetails,
    addRotationPreset,
    updateRotationPreset,
    resetBuiltInPreset,
    deleteRotationPreset,
    generateRotationFromPreset,
    updateSettings,
    toggleMetadataProvider,
    resetProviderSettingsToSafeDefaults,
    importBackupJson,
    resetToSeedData,
  };
}
