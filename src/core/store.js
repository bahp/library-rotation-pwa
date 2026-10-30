/**
 * @fileoverview Observable application state store with domain actions and theme synchronization.
 */

import { createId, normalizeIsbn } from '../types/models.js';
import { createSeedState } from '../data/seed.js';
import { isValidAppState, migrateState } from './storage.js';
import { candidateToBook, sanitizeCoverUrl } from '../features/catalog/normalizer.js';

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
   * Creates a starter rotation shelf for the active child profile using age-eligible books.
   * @param {{ title: string, objective: string, count: number }} input
   */
  async function createStarterRotation(input) {
    const profile =
      state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    const desiredCount = Math.max(1, Math.min(12, Number(input.count) || profile.defaultRotationSize));

    const scoredBooks = [...state.books].sort((a, b) => {
      const aAgeFit = profile.age >= a.ageMin && profile.age <= a.ageMax ? 1 : 0;
      const bAgeFit = profile.age >= b.ageMin && profile.age <= b.ageMax ? 1 : 0;
      if (aAgeFit !== bAgeFit) return bAgeFit - aAgeFit;
      const aTopicOverlap = a.tags.filter((t) => profile.favoriteTopics.includes(t)).length;
      const bTopicOverlap = b.tags.filter((t) => profile.favoriteTopics.includes(t)).length;
      return bTopicOverlap - aTopicOverlap;
    });

    const selectedIds = scoredBooks.slice(0, desiredCount).map((b) => b.id);
    if (selectedIds.length === 0) {
      throw new Error('Add at least one book to your catalog before creating a rotation.');
    }

    const now = new Date().toISOString();
    /** @type {import('../types/models.js').RotationList} */
    const newRotation = {
      id: createId('rot'),
      profileId: profile.id,
      title: input.title.trim() || `${profile.name}'s Weekly Shelf`,
      rules: {
        count: desiredCount,
        objective: input.objective.trim() || `Starter shelf matched to ${profile.name} (Age ${profile.age})`,
        preferredTags: [...profile.favoriteTopics],
        cooldownDays: profile.cooldownDays,
      },
      bookIds: selectedIds,
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

    await commit({
      ...state,
      rotations: [newRotation, ...updatedExisting],
    });
    notify(`Activated "${newRotation.title}" for ${profile.name}.`, 'success');
    return newRotation;
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
    createStarterRotation,
    setActiveRotation,
    updateSettings,
    importBackupJson,
    resetToSeedData,
  };
}
