/**
 * @fileoverview Observable application state store with domain actions, Phase 4 Rotation Engine
 * integration, post-generation shelf editing operations, and theme synchronization.
 */

import { createId, normalizeIsbn } from '../types/models.js';
import { createSeedState } from '../data/seed.js';
import { isValidAppState, migrateState } from './storage.js';
import { candidateToBook, sanitizeCoverUrl } from '../features/catalog/normalizer.js';
import {
  applyBookAdditions,
  applyBookReplacement,
  generateRotationSelection,
  pickRandomEligibleBooks,
} from '../features/rotations/rotation-engine.js';

const SPINE_COLORS = ['teal', 'indigo', 'amber', 'rose', 'emerald'];

/**
 * Applies light/dark class on document.documentElement according to user preference.
 * @param {import('../types/models.js').ThemeMode} theme
 */
export function applyThemeToDom(theme) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const prefersDark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

/**
 * Stamps `lastRotatedAt` onto any catalog books included in `rotatedBookIds`.
 * @param {import('../types/models.js').Book[]} books
 * @param {Iterable<string>} rotatedBookIds
 * @param {string} nowIso
 * @returns {import('../types/models.js').Book[]}
 */
function stampBooksRotated(books, rotatedBookIds, nowIso) {
  const targetSet = new Set(rotatedBookIds);
  if (targetSet.size === 0) return books;
  return books.map((b) => (targetSet.has(b.id) ? { ...b, lastRotatedAt: nowIso } : b));
}

/**
 * Creates the central Library Rotation store.
 * @param {ReturnType<typeof import('./storage.js').createStorageAdapter>} storage
 */
export function createAppStore(storage) {
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
   * Creates a new child profile and makes it active.
   * @param {{ name: string, age: number, readingStage: import('../types/models.js').ReadingStage, favoriteTopics: string[], defaultRotationSize: number, cooldownDays: number, avatarTone: string }} input
   */
  async function addProfile(input) {
    const name = input.name.trim();
    if (!name) throw new Error('Child name is required.');
    /** @type {import('../types/models.js').ChildProfile} */
    const profile = {
      id: createId('profile'),
      name,
      age: Math.max(0, Math.min(16, Number(input.age) || 4)),
      readingStage: input.readingStage || 'picture-book',
      favoriteTopics: input.favoriteTopics.filter(Boolean),
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
      ageMin: Math.max(0, Number(input.ageMin) || 2),
      ageMax: Math.max(Number(input.ageMin) || 2, Number(input.ageMax) || 6),
      readingStage: input.readingStage || 'picture-book',
      tags: input.tags.map((t) => t.toLowerCase().trim()).filter(Boolean),
      spineColor: SPINE_COLORS[colorIndex],
      addedAt: now,
      sources: incomingSources,
    };

    await commit({
      ...state,
      books: [book, ...state.books],
    });
    notify(`Added "${book.title}" to your library.`, 'success');
    return book;
  }

  /**
   * Saves a normalized provider BookCandidate directly to the catalog in one tap.
   * @param {import('../features/catalog/normalizer.js').BookCandidate} candidate
   */
  async function addBookFromCandidate(candidate) {
    if (candidate.isbn13 && state.books.some((b) => b.isbn13 === candidate.isbn13)) {
      throw new Error(`"${candidate.title}" (ISBN ${candidate.isbn13}) is already in your library.`);
    }
    const book = candidateToBook(candidate, {
      retainRaw: state.settings.retainRawProviderPayloads,
    });
    await commit({
      ...state,
      books: [book, ...state.books],
    });
    notify(`Added "${book.title}" to your library.`, 'success');
    return book;
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

    const nextRotations = state.rotations.map((r) =>
      r.id === rotationId
        ? { ...r, completedBookIds: nextCompleted, updatedAt: new Date().toISOString() }
        : r
    );

    const nextProfiles = state.profiles.map((p) => {
      if (p.id !== rotation.profileId) return p;
      const historySet = new Set(p.readHistoryBookIds);
      if (!isDone) historySet.add(bookId);
      return { ...p, readHistoryBookIds: Array.from(historySet) };
    });

    await commit({
      ...state,
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
      nowIso: now,
    });

    if (engineOut.selectedBookIds.length === 0) {
      throw new Error('No eligible books matched those rotation rules.');
    }

    /** @type {import('../types/models.js').RotationList} */
    const newRotation = {
      id: createId('rot'),
      profileId: profile.id,
      title: String(input.title || '').trim() || `${profile.name}'s Curated Shelf`,
      rules,
      bookIds: engineOut.selectedBookIds,
      completedBookIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const updatedExisting = state.rotations.map((r) =>
      r.profileId === profile.id && r.status === 'active'
        ? { ...r, status: /** @type {const} */ ('saved') }
        : r
    );

    const updatedBooks = stampBooksRotated(state.books, engineOut.selectedBookIds, now);

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
    const updatedBooks = stampBooksRotated(state.books, [replacement.id], now);

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
    const updatedBooks = stampBooksRotated(state.books, [replacement.id], now);

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

    const updatedBooks = stampBooksRotated(state.books, addedIds, now);
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
    const updatedBooks = stampBooksRotated(state.books, addedIds, now);

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
    const nextRotations = state.rotations.map((r) =>
      r.id === rotationId
        ? {
            ...r,
            bookIds: r.bookIds.filter((id) => id !== bookId),
            completedBookIds: r.completedBookIds.filter((id) => id !== bookId),
            updatedAt: now,
          }
        : r
    );
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
      const candidateNext = remaining.find((r) => r.profileId === target.profileId);
      if (candidateNext) {
        candidateNext.status = 'active';
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
    const nextRotations = state.rotations.map((r) => {
      if (r.profileId !== target.profileId) return r;
      if (r.id === rotationId)
        return { ...r, status: /** @type {const} */ ('active'), updatedAt: new Date().toISOString() };
      if (r.status === 'active') return { ...r, status: /** @type {const} */ ('saved') };
      return r;
    });
    await commit({ ...state, rotations: nextRotations });
    notify(`Switched active shelf to "${target.title}".`, 'success');
  }

  /**
   * Updates user settings (theme, debug toggles, preferred scan mode).
   * @param {Partial<import('../types/models.js').AppSettings>} patch
   */
  async function updateSettings(patch) {
    await commit({
      ...state,
      settings: {
        ...state.settings,
        ...patch,
      },
    });
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
    subscribe: (/** @type {() => void} */ cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    notify,
    dismissToast,
    setActiveProfile,
    addProfile,
    deleteProfile,
    addManualBook,
    addBookFromCandidate,
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
    updateSettings,
    importBackupJson,
    resetToSeedData,
  };
}
