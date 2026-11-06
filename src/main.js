/**
 * @fileoverview Application entry point: wires storage, reactive store, hash router (`home`,
 * `library`, `scan`, `rotations`, `profiles`, `settings`), CatalogService, ScannerController,
 * Top-Avatar Switcher & Bottom-Sheet Forms, live DOB age preview, and delegated DOM actions.
 */

import './index.css';
import {
  computeAgeFromBirthDate,
  formatProfileAgeLabel,
  inferReadingStageFromAge,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeOwnersList,
} from './types/models.js';
import { createRouter } from './core/router.js';
import { createStorageAdapter, formatStorageBytes } from './core/storage.js';
import { createAppStore } from './core/store.js';
import {
  createPwaManager,
  loadPwaBannerDismissed,
  savePwaBannerDismissed,
} from './features/pwa/pwa-manager.js';
import { createCatalogService } from './features/catalog/catalog-service.js';
import {
  getDeviceBooksProxyUrl,
  setDeviceBooksProxyUrl,
} from './features/catalog/providers/google-books-provider.js';
import { extractCoverColorFromUrl } from './features/catalog/cover-color-extractor.js';
import { compressImageFileToDataUrl } from './features/catalog/cover-image-utils.js';
import { createScannerController } from './features/scan/scanner-controller.js';
import { renderAppShell } from './ui/components/app-shell.js';
import {
  setWelcomeBooksModalDismissed,
  shouldAutoShowWelcomeBooksModal,
} from './ui/components/welcome-setup-modal.js';
import { patchRootHtml } from './ui/dom-patch.js';
import { renderHomeView } from './features/home/home-view.js';
import {
  renderLibraryView,
  toggleUnifiedOwnerSelection,
} from './features/library/library-view.js';
import {
  parseUnifiedCatalogQuery,
  renderScanShellView,
  resolveScanEntryState,
} from './features/scan/scan-shell-view.js';
import { renderRotationsView } from './features/rotations/rotations-view.js';
import {
  createDefaultPresetsUiState,
  renderPresetsView,
} from './features/rotations/presets-view.js';
import {
  buildMonthDayFromParts,
  getAllRotationPresets,
} from './features/rotations/rotation-presets.js';
import {
  createDefaultPlayUiState,
  renderPlayView,
  resolveActivePlayAppId,
} from './features/play/play-view.js';
import {
  createBookHuntChallenge,
  pickStorytimeBooks,
  resolvePlayBookPool,
} from './features/play/play-activities.js';
import { renderProfilesView } from './features/profiles/profiles-view.js';
import { renderSettingsView } from './features/settings/settings-view.js';
import { validateProxyEndpointUrl } from './features/tagging/ai-tag-adapter.js';
import { normalizeLanguage } from './config/index.js';

const rootEl = document.getElementById('app');
const storage = createStorageAdapter();
const store = createAppStore(storage);
const router = createRouter();
const pwa = createPwaManager();
const catalogService = createCatalogService();

/**
 * Creates a fresh default manual book draft aligned to the active reader profile.
 * @param {import('./types/models.js').ChildProfile} [profile]
 */
function createBlankDraft(profile) {
  return {
    title: '',
    authors: '',
    isbn: '',
    publishedYear: '',
    pageCount: '',
    coverUrl: '',
    format: /** @type {import('./types/models.js').BookFormat} */ ('hardcover'),
    readingStage: /** @type {import('./types/models.js').ReadingStage} */ (
      profile?.readingStage || 'picture-book'
    ),
    ageMin: Math.max(1, (profile?.age || 4) - 1),
    ageMax: (profile?.age || 4) + 2,
    tags: '',
    /** @type {import('./types/models.js').BookCondition} */
    condition: 'good',
    customOwners: '',
    /** @type {import('./types/models.js').ProviderSource[] | undefined} */
    sources: undefined,
  };
}

/**
 * Creates a fresh Book Inspector UI state slice for the given book.
 * @param {import('./types/models.js').Book | null | undefined} [book]
 * @returns {import('./ui/components/book-inspector-modal.js').BookInspectorUiState}
 */
function createBlankInspectorUi(book) {
  return {
    isCoverPickerOpen: false,
    isEditingBook: false,
    coverSearchQuery: book ? `${book.title} ${book.authors[0] || ''}`.trim() : '',
    coverSearchLoading: false,
    coverSearchError: '',
    coverSearchResults: [],
    editError: '',
  };
}

const SWAP_REMINDER_STORAGE_KEY = 'lr_dismissed_swap_reminders_v1';
const PRESET_ALERT_STORAGE_KEY = 'lr_dismissed_preset_alerts_v1';
const STALE_SPOTLIGHT_STORAGE_KEY = 'lr_dismissed_stale_spotlights_v1';

/**
 * Loads previously dismissed Swap Day reminder cycle keys from localStorage.
 * @returns {string[]}
 */
function loadDismissedSwapReminders() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(SWAP_REMINDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch (_) {
    return [];
  }
}

/**
 * Persists dismissed Swap Day reminder cycle keys to localStorage.
 * @param {string[]} keys
 */
function saveDismissedSwapReminders(keys) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SWAP_REMINDER_STORAGE_KEY, JSON.stringify(keys.slice(-40)));
    }
  } catch (_) {}
}

/**
 * Loads previously dismissed annual preset start-date alert keys from localStorage.
 * @returns {string[]}
 */
function loadDismissedPresetAlerts() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(PRESET_ALERT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch (_) {
    return [];
  }
}

/**
 * Persists dismissed annual preset start-date alert keys to localStorage.
 * @param {string[]} keys
 */
function saveDismissedPresetAlerts(keys) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(PRESET_ALERT_STORAGE_KEY, JSON.stringify(keys.slice(-60)));
    }
  } catch (_) {}
}

/**
 * Loads previously dismissed Stale Book Spotlight cycle keys from localStorage.
 * @returns {string[]}
 */
function loadDismissedStaleSpotlights() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STALE_SPOTLIGHT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch (_) {
    return [];
  }
}

/**
 * Persists dismissed Stale Book Spotlight cycle keys to localStorage.
 * @param {string[]} keys
 */
function saveDismissedStaleSpotlights(keys) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STALE_SPOTLIGHT_STORAGE_KEY, JSON.stringify(keys.slice(-40)));
    }
  } catch (_) {}
}

const uiState = {
  catalogFilter: 'all',
  ownerFilter: 'active-reader',
  selectedOwners: /** @type {string[]} */ ([]),
  selectedFormats: /** @type {string[]} */ ([]),
  selectedThemes: /** @type {string[]} */ ([]),
  conditionFilter: 'all',
  freshnessFilter: 'all',
  sortBy: 'default',
  isFilterDrawerOpen: false,
  searchQuery: '',
  inspectedBookId: /** @type {string | null} */ (null),
  inspectedRotationId: /** @type {string | null} */ (null),
  inspectorUi: createBlankInspectorUi(),
  dismissedSwapReminderKeys: loadDismissedSwapReminders(),
  dismissedPresetAlertKeys: loadDismissedPresetAlerts(),
  dismissedStaleSpotlightKeys: loadDismissedStaleSpotlights(),
  openFieldHelpIds: /** @type {Set<string>} */ (new Set()),
  pwaBannerDismissed: loadPwaBannerDismissed(),
  /** @type {import('./features/scan/scan-shell-view.js').IntakeTab} */
  intakeTab: 'scanner',
  /** @type {import('./types/models.js').CollectionStatus} */
  intakeTargetStatus: 'owned',
  intakeLoved: false,
  intakeOwners: /** @type {string[]} */ (['shared']),
  /** @type {import('./types/models.js').BookCondition} */
  intakeCondition: 'good',
  activeCandidate: /** @type {import('./features/catalog/normalizer.js').BookCandidate | null} */ (null),
  isFoundSheetOpen: false,
  isbnInput: '',
  isbnLoading: false,
  isbnError: '',
  isbnNotFound: '',
  isbnCandidate: /** @type {import('./features/catalog/normalizer.js').BookCandidate | null} */ (null),
  isbnProviderWarnings: /** @type {string[]} */ ([]),
  lastScanLockBanner: '',
  titleQuery: '',
  authorQuery: '',
  searchLoading: false,
  searchError: '',
  searchHasRun: false,
  searchCandidates: /** @type {import('./features/catalog/normalizer.js').BookCandidate[]} */ ([]),
  searchProviderWarnings: /** @type {string[]} */ ([]),
  manualDraft: createBlankDraft(),
  /** @type {import('./types/models.js').ScanMode} */
  scanMode: 'barcode',
  formError: '',
  shellUi: {
    isProfileSwitcherOpen: false,
    isProfileFormSheetOpen: false,
    editingProfileId: /** @type {string | null} */ (null),
    previewBirthDate: /** @type {string | undefined} */ (undefined),
    isWelcomeModalOpen: false,
  },
  /** @type {import('./features/rotations/rotations-view.js').RotationEditorUiState} */
  rotationEditor: {
    modalMode: null,
    rotationId: null,
    targetBookId: null,
    searchQuery: '',
    selectedAddBookIds: [],
    randomAddCount: 1,
    freshnessFilter: 'all',
    isGeneratorOpen: false,
    editingRotationId: null,
  },
  presetsUi: createDefaultPresetsUiState(),
  playUi: createDefaultPlayUiState(),
  settingsUi: {
    testingAdapter: false,
    enrichingCatalog: false,
    lastAdapterTestReport: '',
    endpointError: '',
    checkingGoogleBooks: false,
    googleBooksHealthReport: '',
    /** @type {'idle' | 'success' | 'error'} */
    googleBooksHealthTone: 'idle',
    /** @type {'unknown' | 'configured' | 'shared-quota' | 'static-host'} */
    googleBooksKeyStatus: 'unknown',
    isGoogleKeyGuideOpen: false,
    deviceBooksProxyUrl: getDeviceBooksProxyUrl(),
    deviceBooksProxyError: '',
    syncingCatalogMetadata: false,
    catalogSyncProgressText: '',
    catalogSyncReport: '',
    /** @type {'idle' | 'success' | 'error'} */
    catalogSyncTone: 'idle',
    browserStorageSummary: '',
    hasCoverCache: false,
  },
};

const scanner = createScannerController({
  onStateChange: () => {
    render();
  },
  onLock: async (lock) => {
    if (lock.kind === 'isbn' && lock.isbn13) {
      uiState.lastScanLockBanner = '';
      // Stay right on the current scanner page and slide up the Found Book bottom sheet when metadata resolves
      await executeIsbnLookup(lock.isbn13, { openSheet: true });
    } else if (lock.kind === 'cover-title' && lock.titleQuery) {
      uiState.lastScanLockBanner = `Extracted cover title "${lock.titleQuery}" via ${lock.sourceLabel} — tap a match below.`;
      uiState.titleQuery = lock.titleQuery;
      uiState.authorQuery = '';
      uiState.intakeTab = 'search';
      await executeProviderSearch();
    }
  },
});

/** @type {ReturnType<typeof setTimeout> | null} */
let searchDebounceTimer = null;
/** @type {AbortController | null} */
let activeSearchAbort = null;

const PRESERVED_INPUT_IDS = new Set([
  'catalog-search-input',
  'provider-title-input',
  'provider-author-input',
  'isbn-lookup-input',
  'rotation-modal-search-input',
  'inspector-new-tag-input',
  'inspector-new-owner-input',
  'inspector-cover-search-input',
  'play-topic-input',
  'presets-search-input',
  'presets-category-select',
  'setting-preset-days-before',
  'setting-preset-days-after',
  'setting-stale-book-days',
  'device-books-proxy-url-input',
]);

/**
 * Checks cache presence to know if cached cover thumbnails exist for the clear-cache action.
 * Note: The padded quota estimate ("Origin cache quota: ... padded by browser") was removed per user request
 * because cross-origin opaque responses pad ~7MB per thumbnail, misleadingly inflating storage metrics.
 */
async function refreshBrowserStorageEstimate() {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const hasCache = await window.caches.has('book-cover-thumbnails');
      uiState.settingsUi.hasCoverCache = Boolean(hasCache);
    }
    uiState.settingsUi.browserStorageSummary = '';
    if (router.getCurrent().route === 'settings') {
      render();
    }
  } catch (_) {}
}

/**
 * Runs a live Google Books connectivity & payload probe (used both by the "Check Google Books API"
 * button and automatically right after saving a Personal Phone PWA Books Proxy URL).
 * @param {{ context?: 'manual' | 'proxy-save' }} [options]
 */
async function verifyGoogleBooksConnection(options = {}) {
  const isProxySave = options.context === 'proxy-save';
  uiState.settingsUi.checkingGoogleBooks = true;
  uiState.settingsUi.googleBooksHealthReport = '';
  uiState.settingsUi.googleBooksHealthTone = 'idle';
  render();
  try {
    const diag = await catalogService.checkProviderHealth('google-books');
    if (diag.keyConfigured === true && !uiState.settingsUi.deviceBooksProxyUrl) {
      uiState.settingsUi.googleBooksKeyStatus = 'configured';
    } else if (diag.keyConfigured === false && !uiState.settingsUi.deviceBooksProxyUrl) {
      uiState.settingsUi.googleBooksKeyStatus = 'shared-quota';
    }
    const keyModeSuffix = uiState.settingsUi.deviceBooksProxyUrl
      ? ' · Auth: Personal device Books proxy'
      : diag.keyConfigured === true
        ? ' · Auth: Dedicated server key (GOOGLE_BOOKS_API_KEY)'
        : diag.keyConfigured === false
          ? ' · Auth: Shared anonymous quota (set GOOGLE_BOOKS_API_KEY on server or connect a personal proxy URL)'
          : '';
    if (diag.ok) {
      uiState.settingsUi.googleBooksHealthTone = 'success';
      const prefixLabel = isProxySave
        ? `Personal proxy saved & verified (${diag.latencyMs} ms)`
        : `Google Books API working (${diag.latencyMs} ms)`;
      uiState.settingsUi.googleBooksHealthReport = `${prefixLabel} · Retrieved "${diag.matchedTitle}"${
        diag.externalId ? ` [id: ${diag.externalId}]` : ''
      } · Cover image: ${diag.hasCover ? 'Yes' : 'None on this edition'}${keyModeSuffix}.`;
      store.notify(
        isProxySave
          ? `Personal Books proxy verified (${diag.latencyMs} ms).`
          : `Google Books API connected (${diag.latencyMs} ms).`,
        'success'
      );
    } else {
      uiState.settingsUi.googleBooksHealthTone = 'error';
      const proxyHint = uiState.settingsUi.deviceBooksProxyUrl
        ? ' Double-check your Worker URL, ALLOWED_ORIGIN CORS header, and GOOGLE_BOOKS_API_KEY Worker secret.'
        : '';
      uiState.settingsUi.googleBooksHealthReport = `${
        isProxySave ? 'Saved proxy URL, but verification failed' : 'Google Books API check failed'
      } (${diag.latencyMs} ms): ${diag.error || 'Unreachable'}${proxyHint}`;
      store.notify(
        isProxySave
          ? 'Proxy URL saved, but verification reported an error.'
          : 'Google Books API check reported an issue.',
        'error'
      );
    }
  } catch (err) {
    uiState.settingsUi.googleBooksHealthTone = 'error';
    uiState.settingsUi.googleBooksHealthReport =
      err instanceof Error ? err.message : 'Google Books API check failed.';
    store.notify('Google Books API check failed.', 'error');
  } finally {
    uiState.settingsUi.checkingGoogleBooks = false;
    render();
  }
}

/**
 * Evaluates whether the first-run Google Books welcome modal should auto-open once status resolves.
 */
function maybeAutoOpenWelcomeBooksModal() {
  if (!store.isInitialized()) return;
  const googleEnabled = store
    .getState()
    .settings.enabledMetadataProviders.includes('google-books');
  if (
    shouldAutoShowWelcomeBooksModal({
      googleBooksKeyStatus: uiState.settingsUi.googleBooksKeyStatus,
      deviceBooksProxyUrl: uiState.settingsUi.deviceBooksProxyUrl,
      googleBooksEnabled: googleEnabled,
    })
  ) {
    uiState.shellUi.isWelcomeModalOpen = true;
  }
}

/**
 * Queries the leak-free server status endpoint (`/api/books/status`) to display whether
 * `GOOGLE_BOOKS_API_KEY` is configured on the server without ever exposing or storing the secret.
 */
async function refreshGoogleBooksKeyStatus() {
  if (typeof fetch !== 'function') return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch('/api/books/status', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const contentType = res.headers?.get?.('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      uiState.settingsUi.googleBooksKeyStatus = 'static-host';
      maybeAutoOpenWelcomeBooksModal();
      render();
      return;
    }
    const payload = await res.json();
    if (payload && payload.ok === true) {
      uiState.settingsUi.googleBooksKeyStatus =
        payload.keyConfigured === true ? 'configured' : 'shared-quota';
    } else {
      uiState.settingsUi.googleBooksKeyStatus = 'static-host';
    }
    maybeAutoOpenWelcomeBooksModal();
    render();
  } catch (_) {
    if (uiState.settingsUi.googleBooksKeyStatus === 'unknown') {
      uiState.settingsUi.googleBooksKeyStatus = 'static-host';
      maybeAutoOpenWelcomeBooksModal();
      render();
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the Storytime / Topic Picker against the active reader's pool and updates `uiState.playUi`.
 */
function runStorytimeRandomizer() {
  const state = store.getState();
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const activeRotation =
    state.rotations.find(
      (r) => r.profileId === activeProfile.id && r.status === 'active'
    ) || null;

  const result = pickStorytimeBooks({
    books: state.books,
    activeRotation,
    activeProfile,
    count: uiState.playUi.randomizerCount,
    scope: uiState.playUi.randomizerScope,
    selectedRotationId: uiState.playUi.randomizerRotationId,
    rotations: state.rotations,
    topicQuery: uiState.playUi.randomizerTopic,
    unreadFirst: uiState.playUi.randomizerUnreadFirst,
  });

  uiState.playUi = {
    ...uiState.playUi,
    pickedBookIds: result.selectedBooks.map((b) => b.id),
    pickedReasonsByBookId: result.matchedReasonsByBookId,
    randomizerHasRun: true,
    randomizerNoTopicMatches: result.noTopicMatches,
    randomizerExpandedToLibrary: result.expandedToLibraryForTopic,
  };
}

/**
 * Picks a new target book & treasure clue for Book Hunt ("Find It!").
 */
function startNextBookHunt() {
  const state = store.getState();
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const activeRotation =
    state.rotations.find(
      (r) => r.profileId === activeProfile.id && r.status === 'active'
    ) || null;

  const challenge = createBookHuntChallenge({
    books: state.books,
    activeRotation,
    activeProfile,
    scope: uiState.playUi.huntScope,
    previousBookId: uiState.playUi.huntBookId,
  });

  if (!challenge) {
    uiState.playUi = {
      ...uiState.playUi,
      huntBookId: null,
      huntPrompt: '',
      huntClueLine: '',
      huntPeekRevealed: false,
      huntCelebrated: false,
    };
    return;
  }

  uiState.playUi = {
    ...uiState.playUi,
    huntBookId: challenge.book.id,
    huntPrompt: challenge.prompt,
    huntClueLine: challenge.clueLine,
    huntPeekRevealed: false,
    huntCelebrated: false,
  };
}

/** @type {Set<string>} */
const attemptedCoverColorKeys = new Set();

/**
 * Applies `--lr-cover-tint` custom properties to visible `.lr-tinted-card` elements
 * and asynchronously samples dominant cover colors for unsampled cover URLs when enabled.
 */
function syncDynamicCoverTints() {
  if (!rootEl) return;
  const state = store.getState();
  if (state.settings.dynamicCoverTint === false) return;

  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const tintedEls = rootEl.querySelectorAll('[data-cover-tint]');
  tintedEls.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const hex = el.getAttribute('data-cover-tint');
    if (hex) {
      el.style.setProperty('--lr-cover-tint', hex);
    }

    const bookId = el.getAttribute('data-tint-book-id');
    if (bookId) {
      const book = bookMap.get(bookId);
      if (!book || !book.coverUrl || book.dominantColor) return;

      const cacheKey = `${book.id}::${book.coverUrl}`;
      if (attemptedCoverColorKeys.has(cacheKey)) return;
      attemptedCoverColorKeys.add(cacheKey);

      extractCoverColorFromUrl(book.coverUrl).then((sampledHex) => {
        if (sampledHex) {
          store.setBookDominantColor(book.id, sampledHex);
        }
      });
      return;
    }

    const previewCoverUrl = el.getAttribute('data-cover-tint-url');
    if (previewCoverUrl) {
      extractCoverColorFromUrl(previewCoverUrl).then((sampledHex) => {
        if (sampledHex && el.isConnected) {
          el.style.setProperty('--lr-cover-tint', sampledHex);
        }
      });
    }
  });
}

/** @type {string | null} */
let lastModalTriggerSelector = null;
let isClosingSheet = false;

/**
 * Captures a selector for the button that opened a sheet/modal so focus can be restored on close.
 * @param {Element} el
 */
function rememberModalTrigger(el) {
  const action = el.getAttribute('data-action');
  const bookId = el.getAttribute('data-book-id');
  const rotId = el.getAttribute('data-rotation-id');
  const profId = el.getAttribute('data-profile-id');
  const playAppId = el.getAttribute('data-play-app-id');
  if (action && bookId && rotId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-rotation-id="${rotId}"][data-book-id="${bookId}"]`;
  } else if (action && bookId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-book-id="${bookId}"]`;
  } else if (action && rotId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-rotation-id="${rotId}"]`;
  } else if (action && profId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-profile-id="${profId}"]`;
  } else if (action && playAppId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-play-app-id="${playAppId}"]`;
  } else if (action) {
    lastModalTriggerSelector = `[data-action="${action}"]`;
  } else {
    lastModalTriggerSelector = null;
  }
}

/**
 * Restores keyboard focus to the button that opened the sheet/modal if it still exists in the DOM.
 */
function restoreModalTriggerFocus() {
  if (!lastModalTriggerSelector || !rootEl) return;
  const selector = lastModalTriggerSelector;
  lastModalTriggerSelector = null;
  const trigger = rootEl.querySelector(selector);
  if (trigger instanceof HTMLElement) {
    trigger.focus();
  }
}

/**
 * Moves initial focus inside the topmost open modal/sheet dialog on first open.
 */
function focusActiveDialogControl() {
  if (!rootEl) return;
  const dialogs = rootEl.querySelectorAll('[role="dialog"]');
  const dialog = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
  if (!(dialog instanceof HTMLElement)) return;
  const preferred =
    dialog.querySelector('input:not([disabled]), button:not([disabled])') || dialog;
  if (preferred instanceof HTMLElement) {
    preferred.focus();
  }
}

/**
 * Smoothly animates the topmost active Material Design bottom sheet downward before unmounting it.
 * @param {() => void} applyCloseState
 */
function closeSheetWithMotion(applyCloseState) {
  if (!rootEl) {
    applyCloseState();
    render();
    restoreModalTriggerFocus();
    return;
  }

  const backdrops = rootEl.querySelectorAll('.sheet-backdrop');
  const backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!(backdrop instanceof HTMLElement) || prefersReducedMotion || isClosingSheet) {
    isClosingSheet = false;
    applyCloseState();
    render();
    restoreModalTriggerFocus();
    return;
  }

  isClosingSheet = true;
  backdrop.removeAttribute('data-sheet-settled');
  backdrop.classList.add('is-closing');

  setTimeout(() => {
    isClosingSheet = false;
    applyCloseState();
    render();
    restoreModalTriggerFocus();
  }, 185);
}

function render() {
  if (!rootEl) return;

  if (!store.isInitialized()) {
    // Keep the inline animated Book Rotation splash from index.html running smoothly until IndexedDB resolves
    if (rootEl.querySelector('[data-app-splash="true"]')) {
      return;
    }
    rootEl.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-linen-50 dark:bg-night-950 p-6">
        <p class="text-sm font-medium text-stone-ink dark:text-slate-400">Loading family library…</p>
      </div>
    `;
    return;
  }

  const prevDialogIds = new Set();
  for (const dlg of rootEl.querySelectorAll('[role="dialog"]')) {
    const id = dlg.getAttribute('aria-labelledby');
    if (id) prevDialogIds.add(id);
  }

  const { route } = router.getCurrent();
  const state = store.getState();

  const activeElement = document.activeElement;
  const isPreservedField =
    (activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement) &&
    Boolean(
      activeElement.id &&
        (PRESERVED_INPUT_IDS.has(activeElement.id) || activeElement.id.startsWith('edit-rot-'))
    );
  const focusedId = isPreservedField && activeElement instanceof HTMLElement ? activeElement.id : null;
  const selectionStart =
    focusedId &&
    (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
      ? activeElement.selectionStart
      : null;

  let contentHtml = '';
  switch (route) {
    case 'library':
      contentHtml = renderLibraryView({ state, uiState });
      break;
    case 'scan':
      contentHtml = renderScanShellView({
        state,
        uiState,
        scannerState: scanner.getState(),
      });
      break;
    case 'rotations':
      contentHtml = renderRotationsView({
        state,
        editorState: uiState.rotationEditor,
        inspectedBookId: uiState.inspectedBookId,
        inspectedRotationId: uiState.inspectedRotationId,
        inspectorUiState: uiState.inspectorUi,
        dismissedSwapReminderKeys: uiState.dismissedSwapReminderKeys,
        dismissedPresetAlertKeys: uiState.dismissedPresetAlertKeys,
        dismissedStaleSpotlightKeys: uiState.dismissedStaleSpotlightKeys,
      });
      break;
    case 'presets':
      contentHtml = renderPresetsView({
        state,
        presetsUiState: uiState.presetsUi,
        dismissedPresetAlertKeys: uiState.dismissedPresetAlertKeys,
      });
      break;
    case 'play':
      contentHtml = renderPlayView({
        state,
        playUiState: uiState.playUi,
        inspectedBookId: uiState.inspectedBookId,
        inspectorUiState: uiState.inspectorUi,
      });
      break;
    case 'profiles':
      contentHtml = renderProfilesView({
        state,
        profilesUiState: {
          isFormOpen: uiState.shellUi.isProfileFormSheetOpen,
          editingProfileId: uiState.shellUi.editingProfileId,
          previewBirthDate: uiState.shellUi.previewBirthDate,
        },
      });
      break;
    case 'settings':
      contentHtml = renderSettingsView({
        state,
        storageBackend: store.getStorageBackend(),
        pwaStatus: pwa.getStatus(),
        adapterDiagnostics: store.getTaggingService().getAdapterDiagnostics(state.settings),
        settingsUiState: uiState.settingsUi,
      });
      break;
    case 'home':
    default:
      contentHtml = renderHomeView({
        state,
        uiState,
        pwaStatus: pwa.getStatus(),
      });
      break;
  }

  const nextShellHtml = renderAppShell({
    activeRoute: route,
    state,
    toast: store.getToast(),
    pwaStatus: pwa.getStatus(),
    shellUiState: {
      ...uiState.shellUi,
      googleBooksKeyStatus: uiState.settingsUi.googleBooksKeyStatus,
    },
    contentHtml,
  });

  // Patch live DOM in place so unchanged book cover <img> nodes never unmount, re-decode, or flash
  patchRootHtml(rootEl, nextShellHtml);

  // Mark every already-open sheet as settled so typing/toggling or stacking a child modal does not replay entrance motion
  for (const backdrop of rootEl.querySelectorAll('.sheet-backdrop')) {
    const dlg = backdrop.querySelector('[role="dialog"]');
    const id = dlg instanceof HTMLElement ? dlg.getAttribute('aria-labelledby') : null;
    if (id && prevDialogIds.has(id) && backdrop instanceof HTMLElement) {
      backdrop.setAttribute('data-sheet-settled', 'true');
    }
  }

  if (route === 'scan' && uiState.intakeTab === 'scanner') {
    const videoEl = document.getElementById('scanner-live-video');
    if (videoEl && videoEl.tagName && videoEl.tagName.toUpperCase() === 'VIDEO') {
      scanner.attachVideoElement(/** @type {HTMLVideoElement} */ (videoEl));
    }
  }

  if (focusedId) {
    const nextField = document.getElementById(focusedId);
    if (
      nextField instanceof HTMLInputElement ||
      nextField instanceof HTMLTextAreaElement ||
      nextField instanceof HTMLSelectElement
    ) {
      nextField.focus();
      if (
        selectionStart !== null &&
        (nextField instanceof HTMLInputElement || nextField instanceof HTMLTextAreaElement)
      ) {
        try {
          nextField.setSelectionRange(selectionStart, selectionStart);
        } catch (_) {}
      }
    }
  }

  syncDynamicCoverTints();
  syncAutoResizeTextareas();
  syncOpenFieldHelpPanels();
  syncAllClearInputButtons();
}

/**
 * Toggles the visibility (`hidden` vs `flex`) of an inline `×` clear button paired with `inputEl`.
 * @param {HTMLInputElement} inputEl
 */
function syncClearInputButtonForInput(inputEl) {
  if (!rootEl || !inputEl.id) return;
  const escapedId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(inputEl.id)
      : inputEl.id;
  const clearBtns = rootEl.querySelectorAll(
    `[data-action="clear-input"][data-target-input="${escapedId}"]`
  );
  const hasText = String(inputEl.value || '').length > 0;
  for (const btn of clearBtns) {
    if (btn instanceof HTMLElement) {
      btn.classList.toggle('hidden', !hasText);
      btn.classList.toggle('flex', hasText);
    }
  }
}

/**
 * Ensures every clearable input's `×` button reflects its live DOM value after patching.
 */
function syncAllClearInputButtons() {
  if (!rootEl) return;
  const clearBtns = rootEl.querySelectorAll('[data-action="clear-input"][data-target-input]');
  for (const btn of clearBtns) {
    if (!(btn instanceof HTMLElement)) continue;
    const targetId = btn.getAttribute('data-target-input');
    if (!targetId) continue;
    const inputEl = document.getElementById(targetId);
    if (inputEl instanceof HTMLInputElement) {
      const hasText = String(inputEl.value || '').length > 0;
      btn.classList.toggle('hidden', !hasText);
      btn.classList.toggle('flex', hasText);
    }
  }
}

/**
 * Re-applies open `(i)` field help panel states across DOM patches so toggled explanations stay open
 * until dismissed, while allowing clicks on `(i)` to mutate the DOM directly without re-rendering forms.
 */
function syncOpenFieldHelpPanels() {
  if (!rootEl || uiState.openFieldHelpIds.size === 0) return;
  for (const panelId of uiState.openFieldHelpIds) {
    const panelEl = document.getElementById(panelId);
    if (panelEl instanceof HTMLElement) {
      panelEl.hidden = false;
    }
    const triggerBtns = rootEl.querySelectorAll(
      `[data-action="toggle-field-help"][data-help-target="${panelId}"]`
    );
    for (const btn of triggerBtns) {
      if (btn instanceof HTMLElement) {
        btn.setAttribute('aria-expanded', 'true');
      }
    }
  }
}

/**
 * Ensures any visible auto-resize `<textarea>` expands to show all of its content without clipping
 * while staying compact (`32px` min) for short 1-line notes.
 */
function syncAutoResizeTextareas() {
  if (!rootEl) return;
  const textareas = rootEl.querySelectorAll('textarea[data-auto-resize="true"]');
  for (const el of textareas) {
    if (el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto';
      if (el.scrollHeight > 0) {
        el.style.height = `${Math.max(el.scrollHeight + 2, 32)}px`;
      }
    }
  }
}

/**
 * Reads any open unified rotation edit form (`form[data-form="edit-rotation-details"]`)
 * and persists updated title, description, and rule parameters without needing a separate Save button.
 * @param {string | null | undefined} rotationId
 * @param {{ silent?: boolean }} [options]
 */
async function flushOpenRotationEdits(rotationId, options = {}) {
  if (!rotationId || !rootEl) return;
  const escapedId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(rotationId)
      : rotationId;
  const detailsForm = rootEl.querySelector(
    `form[data-form="edit-rotation-details"][data-rotation-id="${escapedId}"]`
  );
  if (!(detailsForm instanceof HTMLFormElement)) return;

  const currentRot = store.getState().rotations.find((r) => r.id === rotationId);
  if (!currentRot) return;

  const fd = new FormData(detailsForm);
  const rawTitle = String(fd.get('title') || '').trim();
  const safeTitle = rawTitle || currentRot.title;

  await store.updateRotationDetails(
    rotationId,
    {
      title: safeTitle,
      description: String(fd.get('description') || ''),
      swapDays: fd.get('swapDays') !== null ? Number(fd.get('swapDays')) : undefined,
      cooldownDays: fd.get('cooldownDays') !== null ? Number(fd.get('cooldownDays')) : undefined,
      count: fd.get('count') !== null ? Number(fd.get('count')) : undefined,
      requiredFormat: /** @type {import('./types/models.js').BookFormat | 'any'} */ (
        fd.get('requiredFormat') || 'any'
      ),
      preferredTags: String(fd.get('preferredTags') || ''),
      seed: String(fd.get('seed') || ''),
      varietyMix: fd.get('varietyMix') !== null,
    },
    {
      silent: Boolean(options.silent),
      skipIfUnchanged: true,
    }
  );
}

/**
 * Searches Google Books & Open Library for cover artwork inside the Book Inspector Cover Studio.
 * @param {string} [queryOverride]
 */
async function executeInspectorCoverSearch(queryOverride) {
  const book = store.getState().books.find((b) => b.id === uiState.inspectedBookId);
  const query = (
    queryOverride !== undefined ? queryOverride : uiState.inspectorUi.coverSearchQuery
  ).trim();

  const effectiveQuery = query || (book ? `${book.title} ${book.authors[0] || ''}`.trim() : '');
  if (!effectiveQuery) {
    uiState.inspectorUi.coverSearchError = 'Enter a book title or author to search covers.';
    render();
    return;
  }

  uiState.inspectorUi.coverSearchQuery = effectiveQuery;
  uiState.inspectorUi.coverSearchLoading = true;
  uiState.inspectorUi.coverSearchError = '';
  render();

  try {
    const { enabledMetadataProviders } = store.getState().settings;
    const response = await catalogService.searchBooks(
      { query: effectiveQuery },
      {
        retainRaw: false,
        enabledProviderIds: enabledMetadataProviders,
        limit: 10,
      }
    );

    const seenUrls = new Set();
    const covers = [];
    for (const cand of response.candidates) {
      if (!cand.coverUrl || seenUrls.has(cand.coverUrl)) continue;
      seenUrls.add(cand.coverUrl);
      covers.push({
        title: cand.title,
        author: cand.authors[0] || '',
        coverUrl: cand.coverUrl,
        source: cand.sources[0]?.provider === 'open-library' ? 'Open Library' : 'Google Books',
      });
      if (covers.length >= 8) break;
    }

    uiState.inspectorUi.coverSearchLoading = false;
    uiState.inspectorUi.coverSearchResults = covers;
    if (covers.length === 0) {
      uiState.inspectorUi.coverSearchError =
        'No cover images found for that search — try shorter keywords or select a photo from your phone.';
    }
    render();
  } catch (err) {
    uiState.inspectorUi.coverSearchLoading = false;
    uiState.inspectorUi.coverSearchError =
      err instanceof Error
        ? err.message
        : 'Online cover search is unavailable right now. You can still choose or take a photo.';
    render();
  }
}

/**
 * Runs a title/author search across external providers with cancellation for stale queries.
 */
async function executeProviderSearch() {
  const query = uiState.titleQuery.trim();
  const author = uiState.authorQuery.trim();

  if (activeSearchAbort) {
    activeSearchAbort.abort();
    activeSearchAbort = null;
  }

  if (!query && !author) {
    uiState.searchLoading = false;
    uiState.searchError = '';
    uiState.searchHasRun = false;
    uiState.searchCandidates = [];
    uiState.searchProviderWarnings = [];
    render();
    return;
  }

  const controller = new AbortController();
  activeSearchAbort = controller;
  uiState.isbnError = '';
  uiState.isbnNotFound = '';
  uiState.isbnCandidate = null;
  uiState.searchLoading = true;
  uiState.searchError = '';
  render();

  try {
    const { retainRawProviderPayloads: retainRaw, enabledMetadataProviders } =
      store.getState().settings;
    const response = await catalogService.searchBooks(
      { query, author },
      {
        retainRaw,
        enabledProviderIds: enabledMetadataProviders,
        signal: controller.signal,
        limit: 10,
      }
    );
    if (controller.signal.aborted) return;

    uiState.searchCandidates = response.candidates;
    uiState.searchProviderWarnings = response.providerErrors.map((e) => e.providerId);
    uiState.searchHasRun = true;
    uiState.searchLoading = false;
    render();
  } catch (err) {
    if (controller.signal.aborted) return;
    uiState.searchLoading = false;
    uiState.searchHasRun = true;
    uiState.searchCandidates = [];
    uiState.searchError =
      err instanceof Error ? err.message : 'Unable to search metadata providers.';
    render();
  }
}

/**
 * Runs either a checksum-verified ISBN lookup or a parallel Title/Author/Keyword search
 * from the unified `Search & ISBN` input.
 * @param {{ fromSubmit?: boolean }} [opts]
 */
async function executeUnifiedCatalogSearch(opts = {}) {
  const parsed = parseUnifiedCatalogQuery(uiState.titleQuery, uiState.authorQuery);
  if (parsed.mode === 'empty') {
    uiState.isbnError = '';
    uiState.isbnNotFound = '';
    uiState.isbnCandidate = null;
    await executeProviderSearch();
    return;
  }
  if (parsed.mode === 'isbn') {
    uiState.searchLoading = false;
    uiState.searchError = '';
    uiState.searchHasRun = false;
    uiState.searchCandidates = [];
    await executeIsbnLookup(parsed.isbn13, { openSheet: true });
    return;
  }
  if (parsed.mode === 'invalid-isbn') {
    if (opts.fromSubmit) {
      uiState.searchLoading = false;
      uiState.searchCandidates = [];
      uiState.isbnCandidate = null;
      uiState.isbnNotFound = '';
      uiState.isbnError = parsed.error;
      render();
    }
    return;
  }
  await executeProviderSearch();
}

/**
 * Schedules a debounced provider search (or verified ISBN lookup) while the user types.
 */
function scheduleDebouncedSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeUnifiedCatalogSearch({ fromSubmit: false });
  }, 380);
}

/**
 * Executes an ISBN-10 / ISBN-13 metadata lookup across registered providers.
 * @param {string} rawIsbn
 * @param {{ openSheet?: boolean }} [options]
 */
async function executeIsbnLookup(rawIsbn, options = {}) {
  const shouldOpenSheet = options.openSheet !== false;
  uiState.isbnInput = rawIsbn;
  uiState.isbnLoading = true;
  uiState.isbnError = '';
  uiState.isbnNotFound = '';
  uiState.isbnCandidate = null;
  uiState.activeCandidate = null;
  uiState.isFoundSheetOpen = false;
  uiState.isbnProviderWarnings = [];
  render();

  try {
    const { retainRawProviderPayloads: retainRaw, enabledMetadataProviders } =
      store.getState().settings;
    const result = await catalogService.lookupByIsbn(rawIsbn, {
      retainRaw,
      enabledProviderIds: enabledMetadataProviders,
    });
    uiState.isbnLoading = false;
    uiState.isbnProviderWarnings = result.providerErrors.map((e) => e.providerId);

    if (result.candidate) {
      uiState.isbnCandidate = result.candidate;
      if (shouldOpenSheet) {
        uiState.activeCandidate = result.candidate;
        uiState.isFoundSheetOpen = true;
      }
    } else {
      uiState.isbnNotFound = result.isbn13;
    }
    render();
    if (result.candidate && shouldOpenSheet) {
      focusActiveDialogControl();
    }
  } catch (err) {
    uiState.isbnLoading = false;
    uiState.isbnError = err instanceof Error ? err.message : 'ISBN lookup failed.';
    render();
  }
}

/**
 * Resets transient book intake flags back to clean defaults (`Shared` + `Owned` + `Good`) after saving.
 */
function resetIntakeSelectionDefaults() {
  uiState.intakeTargetStatus = 'owned';
  uiState.intakeLoved = false;
  uiState.intakeCondition = 'good';
  uiState.intakeOwners = ['shared'];
  uiState.activeCandidate = null;
  uiState.isFoundSheetOpen = false;
}

/**
 * Populates the Manual Editor draft from a normalized BookCandidate and opens the Manual tab.
 * @param {import('./features/catalog/normalizer.js').BookCandidate} candidate
 */
function loadCandidateIntoManualDraft(candidate) {
  uiState.manualDraft = {
    title: candidate.title,
    authors: candidate.authors.join(', '),
    isbn: candidate.isbn13 || candidate.isbn10 || '',
    publishedYear: candidate.publishedYear ? String(candidate.publishedYear) : '',
    pageCount: candidate.pageCount ? String(candidate.pageCount) : '',
    coverUrl: candidate.coverUrl || '',
    format: candidate.format,
    readingStage: candidate.readingStage,
    ageMin: candidate.ageMin,
    ageMax: candidate.ageMax,
    tags: candidate.tags.join(', '),
    condition: uiState.intakeCondition || 'good',
    customOwners: '',
    sources: candidate.sources,
  };
  uiState.activeCandidate = null;
  uiState.isFoundSheetOpen = false;
  uiState.formError = '';
  uiState.intakeTab = 'manual';
  render();
}

function downloadBackupJson() {
  const payload = JSON.stringify(store.getState(), null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `library-rotation-backup-${dateStamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  store.notify('Downloaded family library JSON backup.', 'success');
}

function bindEvents() {
  if (!rootEl) return;

  // Release camera tracks immediately if browser tab is backgrounded; recompute Swap Day schedule on resume
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scanner.stopCamera();
    } else if (store.isInitialized()) {
      render();
    }
  });

  // Global keyboard handler: Escape closes active bottom sheets/modals & Tab traps focus inside open [role="dialog"]
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (uiState.shellUi.isProfileFormSheetOpen) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.shellUi.isProfileFormSheetOpen = false;
          uiState.shellUi.editingProfileId = null;
          uiState.shellUi.previewBirthDate = undefined;
        });
        return;
      }
      if (uiState.shellUi.isProfileSwitcherOpen) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.shellUi.isProfileSwitcherOpen = false;
        });
        return;
      }
      if (uiState.inspectedBookId) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.inspectedBookId = null;
          uiState.inspectedRotationId = null;
          uiState.inspectorUi = createBlankInspectorUi();
        });
        return;
      }
      if (router.getCurrent().route === 'play' && resolveActivePlayAppId(uiState.playUi)) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.playUi.activeAppId = null;
          uiState.playUi.sheetClosedExplicitly = true;
        });
        return;
      }
      if (uiState.rotationEditor.isGeneratorOpen) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.rotationEditor.isGeneratorOpen = false;
        });
        return;
      }
      if (uiState.presetsUi.isFormOpen) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.presetsUi.isFormOpen = false;
          uiState.presetsUi.editingPresetId = null;
          uiState.presetsUi.formError = '';
        });
        return;
      }
      if (uiState.rotationEditor.modalMode) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.rotationEditor.modalMode = null;
          uiState.rotationEditor.selectedAddBookIds = [];
        });
        return;
      }
      if (uiState.activeCandidate || uiState.isFoundSheetOpen) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.activeCandidate = null;
          uiState.isFoundSheetOpen = false;
        });
        return;
      }
      if (uiState.isFilterDrawerOpen) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          uiState.isFilterDrawerOpen = false;
        });
        return;
      }
      if (uiState.shellUi.isWelcomeModalOpen) {
        event.preventDefault();
        setWelcomeBooksModalDismissed(true);
        closeSheetWithMotion(() => {
          uiState.shellUi.isWelcomeModalOpen = false;
        });
        return;
      }
      if (pwa.getStatus().showIosInstructions) {
        event.preventDefault();
        closeSheetWithMotion(() => {
          pwa.closeIosGuide();
        });
        return;
      }
      if (store.getToast()) {
        store.dismissToast();
      }
      return;
    }

    if (event.key === 'Tab' && rootEl) {
      const dialogs = rootEl.querySelectorAll('[role="dialog"]');
      const dialog = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
      if (!(dialog instanceof HTMLElement)) return;
      const focusable = Array.from(
        dialog.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el instanceof HTMLElement);
      if (focusable.length === 0) return;
      const first = /** @type {HTMLElement} */ (focusable[0]);
      const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  rootEl.addEventListener('click', async (event) => {
    // Allow clicking outside bottom-sheet/modal content on [data-backdrop-action] overlay to close cleanly
    if (event.target instanceof Element && event.target.hasAttribute('data-backdrop-action')) {
      const backdropAction = event.target.getAttribute('data-backdrop-action');
      if (backdropAction === 'close-profile-switcher') {
        closeSheetWithMotion(() => {
          uiState.shellUi.isProfileSwitcherOpen = false;
        });
        return;
      }
      if (backdropAction === 'close-profile-form-sheet') {
        closeSheetWithMotion(() => {
          uiState.shellUi.isProfileFormSheetOpen = false;
          uiState.shellUi.editingProfileId = null;
          uiState.shellUi.previewBirthDate = undefined;
        });
        return;
      }
      if (backdropAction === 'close-inspect-book') {
        closeSheetWithMotion(() => {
          uiState.inspectedBookId = null;
          uiState.inspectedRotationId = null;
          uiState.inspectorUi = createBlankInspectorUi();
        });
        return;
      }
      if (backdropAction === 'close-generate-rotation-sheet') {
        closeSheetWithMotion(() => {
          uiState.rotationEditor.isGeneratorOpen = false;
        });
        return;
      }
      if (backdropAction === 'close-preset-form-sheet') {
        closeSheetWithMotion(() => {
          uiState.presetsUi.isFormOpen = false;
          uiState.presetsUi.editingPresetId = null;
          uiState.presetsUi.formError = '';
        });
        return;
      }
      if (backdropAction === 'close-rotation-modal') {
        closeSheetWithMotion(() => {
          uiState.rotationEditor.modalMode = null;
          uiState.rotationEditor.selectedAddBookIds = [];
        });
        return;
      }
      if (backdropAction === 'close-found-book-sheet') {
        closeSheetWithMotion(() => {
          uiState.activeCandidate = null;
          uiState.isFoundSheetOpen = false;
        });
        return;
      }
      if (backdropAction === 'close-library-filters') {
        closeSheetWithMotion(() => {
          uiState.isFilterDrawerOpen = false;
        });
        return;
      }
      if (backdropAction === 'close-welcome-books-modal') {
        setWelcomeBooksModalDismissed(true);
        closeSheetWithMotion(() => {
          uiState.shellUi.isWelcomeModalOpen = false;
        });
        return;
      }
      if (backdropAction === 'close-ios-guide') {
        closeSheetWithMotion(() => {
          pwa.closeIosGuide();
        });
        return;
      }
      if (backdropAction === 'close-play-app-sheet') {
        closeSheetWithMotion(() => {
          uiState.playUi.activeAppId = null;
          uiState.playUi.sheetClosedExplicitly = true;
        });
        return;
      }
    }

    const navScanLink =
      event.target instanceof Element ? event.target.closest('a[data-nav-scan="true"]') : null;
    if (navScanLink) {
      uiState.activeCandidate = null;
      uiState.isFoundSheetOpen = false;
      uiState.lastScanLockBanner = '';
      uiState.formError = '';
      uiState.intakeTab = 'scanner';
      uiState.scanMode = 'barcode';
      scanner.setMode('barcode');
      scanner.initSupport();
      if (router.getCurrent().route === 'scan') {
        render();
      }
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;

    const action = target.getAttribute('data-action');
    switch (action) {
      case 'toggle-field-help': {
        event.preventDefault();
        const panelId = target.getAttribute('data-help-target') || '';
        if (!panelId) break;
        const panelEl = document.getElementById(panelId);
        if (panelEl instanceof HTMLElement) {
          const willOpen = panelEl.hidden;
          panelEl.hidden = !willOpen;
          target.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          if (willOpen) {
            uiState.openFieldHelpIds.add(panelId);
          } else {
            uiState.openFieldHelpIds.delete(panelId);
          }
        }
        break;
      }
      case 'skip-to-main': {
        event.preventDefault();
        const mainEl = document.getElementById('main-content');
        if (mainEl instanceof HTMLElement) {
          mainEl.focus();
          mainEl.scrollIntoView({ block: 'start' });
        }
        break;
      }
      case 'dismiss-toast':
        store.dismissToast();
        break;
      case 'dismiss-stale-spotlight': {
        const dismissKey = target.getAttribute('data-stale-dismiss-key');
        if (dismissKey && !uiState.dismissedStaleSpotlightKeys.includes(dismissKey)) {
          uiState.dismissedStaleSpotlightKeys = [
            ...uiState.dismissedStaleSpotlightKeys,
            dismissKey,
          ];
          saveDismissedStaleSpotlights(uiState.dismissedStaleSpotlightKeys);
          render();
        }
        break;
      }
      case 'dismiss-welcome-books-modal': {
        setWelcomeBooksModalDismissed(true);
        closeSheetWithMotion(() => {
          uiState.shellUi.isWelcomeModalOpen = false;
        });
        break;
      }
      case 'open-settings-from-welcome': {
        setWelcomeBooksModalDismissed(true);
        uiState.shellUi.isWelcomeModalOpen = false;
        uiState.settingsUi.isGoogleKeyGuideOpen = true;
        router.navigate('settings');
        render();
        break;
      }
      case 'open-welcome-books-modal': {
        rememberModalTrigger(target);
        uiState.shellUi.isWelcomeModalOpen = true;
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-ios-guide':
        closeSheetWithMotion(() => {
          pwa.closeIosGuide();
        });
        break;
      case 'install-pwa': {
        rememberModalTrigger(target);
        const installOutcome = await pwa.triggerInstall();
        if (installOutcome === 'accepted') {
          uiState.pwaBannerDismissed = true;
          savePwaBannerDismissed(true);
          render();
        } else if (pwa.getStatus().showIosInstructions) {
          focusActiveDialogControl();
        }
        break;
      }
      case 'dismiss-pwa-install-banner': {
        uiState.pwaBannerDismissed = true;
        savePwaBannerDismissed(true);
        render();
        break;
      }
      case 'open-profile-switcher': {
        rememberModalTrigger(target);
        uiState.shellUi.isProfileSwitcherOpen = true;
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-profile-switcher': {
        closeSheetWithMotion(() => {
          uiState.shellUi.isProfileSwitcherOpen = false;
        });
        break;
      }
      case 'open-add-profile-sheet': {
        rememberModalTrigger(target);
        uiState.shellUi.isProfileSwitcherOpen = false;
        uiState.shellUi.isProfileFormSheetOpen = true;
        uiState.shellUi.editingProfileId = null;
        uiState.shellUi.previewBirthDate = undefined;
        render();
        focusActiveDialogControl();
        break;
      }
      case 'open-edit-profile-sheet': {
        const profileId = target.getAttribute('data-profile-id');
        if (profileId) {
          rememberModalTrigger(target);
          uiState.shellUi.isProfileSwitcherOpen = false;
          uiState.shellUi.isProfileFormSheetOpen = true;
          uiState.shellUi.editingProfileId = profileId;
          uiState.shellUi.previewBirthDate = undefined;
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'close-profile-form-sheet': {
        closeSheetWithMotion(() => {
          uiState.shellUi.isProfileFormSheetOpen = false;
          uiState.shellUi.editingProfileId = null;
          uiState.shellUi.previewBirthDate = undefined;
        });
        break;
      }
      case 'switch-profile': {
        const profileId = target.getAttribute('data-profile-id');
        uiState.shellUi.isProfileSwitcherOpen = false;
        if (profileId) {
          uiState.playUi = {
            ...uiState.playUi,
            pickedBookIds: [],
            pickedReasonsByBookId: {},
            randomizerNoTopicMatches: false,
            randomizerExpandedToLibrary: false,
            huntBookId: null,
            huntPrompt: '',
            huntClueLine: '',
            huntPeekRevealed: false,
            huntCelebrated: false,
          };
          await store.setActiveProfile(profileId);
        }
        break;
      }
      case 'delete-profile': {
        const profileId = target.getAttribute('data-profile-id');
        if (profileId) await store.deleteProfile(profileId);
        break;
      }
      case 'open-library-filters': {
        rememberModalTrigger(target);
        uiState.isFilterDrawerOpen = true;
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-library-filters': {
        closeSheetWithMotion(() => {
          uiState.isFilterDrawerOpen = false;
        });
        break;
      }
      case 'reset-library-filters': {
        uiState.catalogFilter = 'all';
        uiState.ownerFilter = 'all';
        uiState.selectedOwners = [];
        uiState.selectedFormats = [];
        uiState.selectedThemes = [];
        uiState.conditionFilter = 'all';
        uiState.freshnessFilter = 'all';
        uiState.sortBy = 'default';
        render();
        break;
      }
      case 'set-catalog-filter': {
        uiState.catalogFilter = target.getAttribute('data-filter') || 'all';
        render();
        break;
      }
      case 'set-owner-filter': {
        uiState.ownerFilter = target.getAttribute('data-owner') || 'all';
        uiState.selectedOwners = [];
        render();
        break;
      }
      case 'toggle-library-owner': {
        const toggledOwner = target.getAttribute('data-owner') || '';
        const state = store.getState();
        const activeProfile =
          state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
        const next = toggleUnifiedOwnerSelection({
          currentOwnerFilter: uiState.ownerFilter,
          currentSelectedOwners: uiState.selectedOwners,
          toggledOwner,
          activeProfileId: activeProfile.id,
        });
        uiState.ownerFilter = next.ownerFilter;
        uiState.selectedOwners = next.selectedOwners;
        render();
        break;
      }
      case 'toggle-library-format': {
        const fmt = target.getAttribute('data-format') || '';
        if (!fmt) break;
        const exists = uiState.selectedFormats.includes(fmt);
        uiState.selectedFormats = exists
          ? uiState.selectedFormats.filter((f) => f !== fmt)
          : [...uiState.selectedFormats, fmt];
        if (
          uiState.catalogFilter === 'hardcover' ||
          uiState.catalogFilter === 'board-book' ||
          uiState.catalogFilter === 'paperback'
        ) {
          uiState.catalogFilter = 'all';
        }
        render();
        break;
      }
      case 'toggle-library-theme': {
        const tag = (target.getAttribute('data-theme-tag') || '').trim().toLowerCase();
        if (!tag) break;
        const exists = uiState.selectedThemes.some((t) => t.toLowerCase() === tag);
        uiState.selectedThemes = exists
          ? uiState.selectedThemes.filter((t) => t.toLowerCase() !== tag)
          : [...uiState.selectedThemes, tag];
        render();
        break;
      }
      case 'set-library-condition': {
        uiState.conditionFilter = target.getAttribute('data-condition-filter') || 'all';
        if (uiState.catalogFilter === 'needs-care') {
          uiState.catalogFilter = 'all';
        }
        render();
        break;
      }
      case 'set-library-freshness': {
        uiState.freshnessFilter = target.getAttribute('data-freshness') || 'all';
        render();
        break;
      }
      case 'set-library-sort': {
        uiState.sortBy = target.getAttribute('data-sort') || 'default';
        render();
        break;
      }
      case 'set-intake-status': {
        uiState.intakeTargetStatus = normalizeCollectionStatus(
          target.getAttribute('data-status') || 'owned'
        );
        render();
        break;
      }
      case 'set-intake-condition': {
        uiState.intakeCondition = normalizeBookCondition(
          target.getAttribute('data-condition') || 'good'
        );
        render();
        break;
      }
      case 'toggle-intake-loved': {
        uiState.intakeLoved = !uiState.intakeLoved;
        render();
        break;
      }
      case 'toggle-intake-owner': {
        const ownerKey = (target.getAttribute('data-owner') || '').trim();
        if (!ownerKey) break;
        const exists = uiState.intakeOwners.some(
          (o) => o.toLowerCase() === ownerKey.toLowerCase()
        );
        const nextOwners = exists
          ? uiState.intakeOwners.filter((o) => o.toLowerCase() !== ownerKey.toLowerCase())
          : normalizeOwnersList([...uiState.intakeOwners, ownerKey]);
        uiState.intakeOwners = nextOwners.length > 0 ? nextOwners : ['shared'];
        render();
        break;
      }
      case 'inspect-book': {
        rememberModalTrigger(target);
        const bookId = target.getAttribute('data-book-id');
        const rotationId = target.getAttribute('data-rotation-id') || null;
        const book = store.getState().books.find((b) => b.id === bookId);
        uiState.activeCandidate = null;
        uiState.isFoundSheetOpen = false;
        uiState.inspectedBookId = bookId;
        uiState.inspectedRotationId = rotationId;
        uiState.inspectorUi = createBlankInspectorUi(book);
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-inspect-book': {
        closeSheetWithMotion(() => {
          uiState.inspectedBookId = null;
          uiState.inspectedRotationId = null;
          uiState.inspectorUi = createBlankInspectorUi();
        });
        break;
      }
      case 'toggle-cover-picker': {
        const nextOpen = !uiState.inspectorUi.isCoverPickerOpen;
        uiState.inspectorUi.isCoverPickerOpen = nextOpen;
        if (nextOpen) {
          uiState.inspectorUi.isEditingBook = false;
          render();
          if (
            uiState.inspectorUi.coverSearchResults.length === 0 &&
            !uiState.inspectorUi.coverSearchLoading &&
            pwa.getStatus().isOnline
          ) {
            await executeInspectorCoverSearch();
          }
        } else {
          render();
        }
        break;
      }
      case 'toggle-edit-book-info': {
        const nextEditing = !uiState.inspectorUi.isEditingBook;
        uiState.inspectorUi.isEditingBook = nextEditing;
        uiState.inspectorUi.editError = '';
        if (nextEditing) {
          uiState.inspectorUi.isCoverPickerOpen = false;
        }
        render();
        break;
      }
      case 'select-searched-cover': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        const coverUrl = target.getAttribute('data-cover-url');
        if (bookId && coverUrl) {
          try {
            await store.updateBook(bookId, { coverUrl });
            uiState.inspectorUi.isCoverPickerOpen = false;
            render();
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not update cover.', 'error');
          }
        }
        break;
      }
      case 'clear-book-cover': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        if (bookId) {
          try {
            await store.updateBook(bookId, { coverUrl: '' });
            uiState.inspectorUi.isCoverPickerOpen = false;
            render();
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not clear cover.', 'error');
          }
        }
        break;
      }
      case 'toggle-book-loved': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        if (bookId) {
          await store.toggleBookLoved(bookId);
        }
        break;
      }
      case 'set-book-user-rating': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        const requestedRating = Number(target.getAttribute('data-rating') || 0);
        if (bookId) {
          const currentBook = store.getState().books.find((b) => b.id === bookId);
          const finalRating =
            currentBook && currentBook.userRating === requestedRating ? 0 : requestedRating;
          await store.setUserRating(bookId, finalRating);
        }
        break;
      }
      case 'set-book-status': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        const status = normalizeCollectionStatus(target.getAttribute('data-status'));
        if (bookId) {
          await store.updateBook(bookId, { collectionStatus: status });
        }
        break;
      }
      case 'set-book-condition': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        const condition = normalizeBookCondition(target.getAttribute('data-condition'));
        if (bookId) {
          await store.updateBook(bookId, { condition });
        }
        break;
      }
      case 'toggle-book-owner': {
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        const ownerKey = (target.getAttribute('data-owner') || '').trim();
        if (bookId && ownerKey) {
          const existing = store.getState().books.find((b) => b.id === bookId);
          if (existing) {
            const currentOwners = normalizeOwnersList(existing.owners);
            const hasOwner = currentOwners.some(
              (o) => o.toLowerCase() === ownerKey.toLowerCase()
            );
            const nextOwners = hasOwner
              ? currentOwners.filter((o) => o.toLowerCase() !== ownerKey.toLowerCase())
              : [...currentOwners, ownerKey];
            await store.updateBook(bookId, { owners: nextOwners });
          }
        }
        break;
      }
      case 'upgrade-existing-owned': {
        const bookId = target.getAttribute('data-book-id');
        if (bookId) {
          await store.updateBook(bookId, { collectionStatus: 'owned' });
        }
        break;
      }
      case 'delete-book': {
        const bookId = target.getAttribute('data-book-id');
        if (bookId) {
          if (uiState.inspectedBookId === bookId) {
            uiState.inspectedBookId = null;
            uiState.inspectedRotationId = null;
            uiState.inspectorUi = createBlankInspectorUi();
          }
          await store.deleteBook(bookId);
        }
        break;
      }
      case 'open-generate-rotation-sheet': {
        rememberModalTrigger(target);
        uiState.rotationEditor.isGeneratorOpen = true;
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-generate-rotation-sheet': {
        closeSheetWithMotion(() => {
          uiState.rotationEditor.isGeneratorOpen = false;
        });
        break;
      }
      case 'toggle-rotation-read': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          await flushOpenRotationEdits(rotationId, { silent: true });
          await store.toggleRotationBookRead(rotationId, bookId);
        }
        break;
      }
      case 'toggle-profile-book-read': {
        const profileId = target.getAttribute('data-profile-id') || undefined;
        const bookId = target.getAttribute('data-book-id') || uiState.inspectedBookId;
        if (bookId) {
          await store.toggleProfileBookRead(profileId, bookId);
        }
        break;
      }
      case 'browse-presets-from-sheet': {
        uiState.rotationEditor.isGeneratorOpen = false;
        break;
      }
      case 'toggle-edit-rotation': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) {
          const prevEditingId = uiState.rotationEditor.editingRotationId;
          const isClosingEdit = prevEditingId === rotationId;
          if (prevEditingId) {
            try {
              await flushOpenRotationEdits(prevEditingId, { silent: false });
            } catch (err) {
              store.notify(
                err instanceof Error ? err.message : 'Could not update rotation details.',
                'error'
              );
            }
          }
          uiState.rotationEditor.editingRotationId = isClosingEdit ? null : rotationId;
          render();
        }
        break;
      }
      case 'activate-rotation': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) await store.setActiveRotation(rotationId);
        break;
      }
      case 'start-swap-day-rotation': {
        rememberModalTrigger(target);
        uiState.rotationEditor.isGeneratorOpen = true;
        if (router.getCurrent().route !== 'rotations') {
          window.location.hash = '#/rotations?new=1';
        } else {
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'dismiss-swap-reminder': {
        const reminderKey = target.getAttribute('data-reminder-key');
        if (reminderKey && !uiState.dismissedSwapReminderKeys.includes(reminderKey)) {
          uiState.dismissedSwapReminderKeys = [
            ...uiState.dismissedSwapReminderKeys,
            reminderKey,
          ];
          saveDismissedSwapReminders(uiState.dismissedSwapReminderKeys);
          render();
        }
        break;
      }
      case 'dismiss-preset-start-alert': {
        const alertKey = target.getAttribute('data-alert-key');
        if (alertKey && !uiState.dismissedPresetAlertKeys.includes(alertKey)) {
          uiState.dismissedPresetAlertKeys = [
            ...uiState.dismissedPresetAlertKeys,
            alertKey,
          ];
          saveDismissedPresetAlerts(uiState.dismissedPresetAlertKeys);
          render();
        }
        break;
      }
      case 'apply-rotation-preset': {
        const presetId = target.getAttribute('data-preset-id');
        const alertKey = target.getAttribute('data-alert-key');
        if (presetId) {
          try {
            await store.generateRotationFromPreset(presetId);
            if (alertKey && !uiState.dismissedPresetAlertKeys.includes(alertKey)) {
              uiState.dismissedPresetAlertKeys = [
                ...uiState.dismissedPresetAlertKeys,
                alertKey,
              ];
              saveDismissedPresetAlerts(uiState.dismissedPresetAlertKeys);
            }
            if (router.getCurrent().route === 'presets') {
              router.navigate('rotations');
            } else {
              render();
            }
          } catch (err) {
            store.notify(
              err instanceof Error ? err.message : 'Could not generate shelf from preset.',
              'error'
            );
          }
        }
        break;
      }
      case 'set-preset-category-filter': {
        const nextFilter = /** @type {import('./features/rotations/presets-view.js').PresetFilterId} */ (
          target.getAttribute('data-preset-filter') || 'all'
        );
        uiState.presetsUi.categoryFilter = nextFilter;
        if (nextFilter === 'evergreen') {
          uiState.presetsUi.selectedMonth = null;
        }
        render();
        break;
      }
      case 'select-preset-calendar-month': {
        const rawMonth = target.getAttribute('data-month');
        if (!rawMonth || rawMonth === 'all') {
          uiState.presetsUi.selectedMonth = null;
        } else {
          const parsedMonth = Number(rawMonth);
          if (parsedMonth >= 1 && parsedMonth <= 12) {
            uiState.presetsUi.selectedMonth =
              uiState.presetsUi.selectedMonth === parsedMonth ? null : parsedMonth;
            if (
              uiState.presetsUi.selectedMonth !== null &&
              uiState.presetsUi.categoryFilter === 'evergreen'
            ) {
              uiState.presetsUi.categoryFilter = 'all';
            }
          }
        }
        render();
        break;
      }
      case 'open-preset-form-sheet': {
        rememberModalTrigger(target);
        uiState.presetsUi = {
          ...uiState.presetsUi,
          isFormOpen: true,
          editingPresetId: null,
          formDraft: null,
          formError: '',
        };
        render();
        focusActiveDialogControl();
        break;
      }
      case 'customize-rotation-preset': {
        const presetId = target.getAttribute('data-preset-id');
        const preset = getAllRotationPresets(store.getState()).find((p) => p.id === presetId);
        if (preset) {
          rememberModalTrigger(target);
          uiState.presetsUi = {
            ...uiState.presetsUi,
            isFormOpen: true,
            editingPresetId: null,
            formDraft: {
              ...preset,
              title: `${preset.title} (Custom)`,
              seed: `${preset.seed}-custom`,
            },
            formError: '',
          };
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'edit-rotation-preset': {
        const presetId = target.getAttribute('data-preset-id');
        const preset = getAllRotationPresets(store.getState()).find((p) => p.id === presetId);
        if (preset) {
          rememberModalTrigger(target);
          uiState.presetsUi = {
            ...uiState.presetsUi,
            isFormOpen: true,
            editingPresetId: preset.id,
            formDraft: { ...preset },
            formError: '',
          };
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'reset-builtin-preset': {
        const presetId = target.getAttribute('data-preset-id');
        if (presetId) {
          await store.resetBuiltInPreset(presetId);
        }
        break;
      }
      case 'close-preset-form-sheet': {
        closeSheetWithMotion(() => {
          uiState.presetsUi.isFormOpen = false;
          uiState.presetsUi.editingPresetId = null;
          uiState.presetsUi.formError = '';
        });
        break;
      }
      case 'delete-rotation-preset': {
        const presetId = target.getAttribute('data-preset-id');
        if (presetId) {
          await store.deleteRotationPreset(presetId);
        }
        break;
      }
      case 'delete-rotation': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) {
          if (uiState.rotationEditor.editingRotationId === rotationId) {
            uiState.rotationEditor.editingRotationId = null;
          }
          if (uiState.inspectedRotationId === rotationId) {
            uiState.inspectedRotationId = null;
          }
          await store.deleteRotation(rotationId);
        }
        break;
      }
      case 'remove-rotation-book': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          await flushOpenRotationEdits(rotationId, { silent: true });
          await store.removeBookFromRotation(rotationId, bookId);
        }
        break;
      }
      case 'replace-book-random': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          try {
            await flushOpenRotationEdits(rotationId, { silent: true });
            const swapped = await store.replaceRotationBookRandom(rotationId, bookId);
            if (uiState.inspectedBookId === bookId && swapped) {
              uiState.inspectedBookId = swapped.id;
              render();
            }
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not swap book.', 'error');
          }
        }
        break;
      }
      case 'open-manual-replace-modal': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          await flushOpenRotationEdits(rotationId, { silent: true });
          rememberModalTrigger(target);
          uiState.rotationEditor = {
            ...uiState.rotationEditor,
            modalMode: 'replace',
            rotationId,
            targetBookId: bookId,
            searchQuery: '',
            selectedAddBookIds: [],
            randomAddCount: 1,
            freshnessFilter: 'all',
          };
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'set-picker-freshness-filter': {
        const mode = target.getAttribute('data-freshness-filter') === 'unseen' ? 'unseen' : 'all';
        uiState.rotationEditor.freshnessFilter = mode;
        render();
        break;
      }
      case 'confirm-manual-replace': {
        const replacementBookId = target.getAttribute('data-book-id');
        const { rotationId, targetBookId } = uiState.rotationEditor;
        if (rotationId && targetBookId && replacementBookId) {
          try {
            await store.replaceRotationBookManual(rotationId, targetBookId, replacementBookId);
            uiState.rotationEditor.modalMode = null;
            render();
            restoreModalTriggerFocus();
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not replace book.', 'error');
          }
        }
        break;
      }
      case 'open-add-books-modal': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) {
          await flushOpenRotationEdits(rotationId, { silent: true });
          rememberModalTrigger(target);
          uiState.rotationEditor = {
            ...uiState.rotationEditor,
            modalMode: 'add',
            rotationId,
            targetBookId: null,
            searchQuery: '',
            selectedAddBookIds: [],
            randomAddCount: 1,
            freshnessFilter: 'all',
          };
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'toggle-add-book-selection': {
        const bookId = target.getAttribute('data-book-id');
        if (!bookId) break;
        const current = new Set(uiState.rotationEditor.selectedAddBookIds);
        if (current.has(bookId)) {
          current.delete(bookId);
        } else {
          current.add(bookId);
        }
        uiState.rotationEditor.selectedAddBookIds = Array.from(current);
        render();
        break;
      }
      case 'confirm-manual-add-books': {
        const { rotationId, selectedAddBookIds } = uiState.rotationEditor;
        if (rotationId && selectedAddBookIds.length > 0) {
          try {
            await store.addBooksToRotationManual(rotationId, selectedAddBookIds);
            uiState.rotationEditor.modalMode = null;
            uiState.rotationEditor.selectedAddBookIds = [];
            render();
            restoreModalTriggerFocus();
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not add books.', 'error');
          }
        }
        break;
      }
      case 'add-random-books': {
        const rotationId =
          target.getAttribute('data-rotation-id') || uiState.rotationEditor.rotationId;
        const count = Number(target.getAttribute('data-count') || 1);
        if (rotationId) {
          try {
            await flushOpenRotationEdits(rotationId, { silent: true });
            await store.addBooksToRotationRandom(rotationId, count);
            if (uiState.rotationEditor.modalMode === 'add') {
              uiState.rotationEditor.modalMode = null;
              render();
              restoreModalTriggerFocus();
            }
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not add random books.', 'error');
          }
        }
        break;
      }
      case 'close-rotation-modal': {
        closeSheetWithMotion(() => {
          uiState.rotationEditor.modalMode = null;
          uiState.rotationEditor.selectedAddBookIds = [];
          uiState.rotationEditor.freshnessFilter = 'all';
        });
        break;
      }
      case 'select-intake-tab': {
        const tab = /** @type {import('./features/scan/scan-shell-view.js').IntakeTab} */ (
          target.getAttribute('data-intake-tab') || 'scanner'
        );
        if (tab !== 'scanner') {
          scanner.stopCamera();
        } else {
          scanner.initSupport();
        }
        uiState.activeCandidate = null;
        uiState.isFoundSheetOpen = false;
        uiState.intakeTab = tab;
        uiState.formError = '';
        render();
        break;
      }
      case 'close-found-book-sheet': {
        closeSheetWithMotion(() => {
          uiState.activeCandidate = null;
          uiState.isFoundSheetOpen = false;
        });
        break;
      }
      case 'rescan-book':
      case 'scan-another-book': {
        uiState.lastScanLockBanner = '';
        uiState.activeCandidate = null;
        uiState.isFoundSheetOpen = false;
        uiState.isbnCandidate = null;
        uiState.isbnNotFound = '';
        uiState.isbnError = '';
        uiState.intakeTab = 'scanner';
        scanner.resetLock();
        render();
        if (action === 'rescan-book') {
          await scanner.startCamera();
        }
        break;
      }
      case 'start-camera-scan': {
        uiState.lastScanLockBanner = '';
        uiState.activeCandidate = null;
        uiState.isFoundSheetOpen = false;
        uiState.isbnNotFound = '';
        uiState.isbnError = '';
        await scanner.startCamera();
        break;
      }
      case 'stop-camera-scan': {
        scanner.stopCamera();
        break;
      }
      case 'flip-camera': {
        await scanner.flipCamera();
        break;
      }
      case 'toggle-camera-torch': {
        const res = await scanner.toggleTorch();
        if (!res.ok && res.message) {
          store.notify(res.message, 'info');
        }
        break;
      }
      case 'capture-live-frame': {
        await scanner.captureCurrentFrame();
        break;
      }
      case 'reset-scanner': {
        uiState.lastScanLockBanner = '';
        uiState.activeCandidate = null;
        uiState.isFoundSheetOpen = false;
        uiState.isbnNotFound = '';
        uiState.isbnError = '';
        scanner.resetLock();
        break;
      }
      case 'fill-sample-isbn': {
        const sampleIsbn = target.getAttribute('data-isbn') || '';
        if (sampleIsbn) {
          uiState.titleQuery = sampleIsbn;
          uiState.authorQuery = '';
          await executeIsbnLookup(sampleIsbn, { openSheet: true });
        }
        break;
      }
      case 'prefill-manual-isbn': {
        const isbn = target.getAttribute('data-isbn') || '';
        const state = store.getState();
        const activeProfile =
          state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
        uiState.manualDraft = {
          ...createBlankDraft(activeProfile),
          isbn,
        };
        uiState.activeCandidate = null;
        uiState.isFoundSheetOpen = false;
        uiState.isbnNotFound = '';
        uiState.intakeTab = 'manual';
        render();
        break;
      }
      case 'clear-manual-draft': {
        const state = store.getState();
        const activeProfile =
          state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
        uiState.manualDraft = createBlankDraft(activeProfile);
        uiState.formError = '';
        render();
        break;
      }
      case 'open-candidate-sheet': {
        rememberModalTrigger(target);
        const idx = Number(target.getAttribute('data-candidate-index'));
        const candidate =
          idx === -1 ? uiState.isbnCandidate : uiState.searchCandidates[idx] || null;
        if (candidate) {
          uiState.activeCandidate = candidate;
          uiState.isFoundSheetOpen = true;
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'save-found-library': {
        const candidate = uiState.activeCandidate || uiState.isbnCandidate;
        if (!candidate) break;
        const saveStatus =
          uiState.intakeTargetStatus === 'wishlist' ? 'owned' : uiState.intakeTargetStatus;
        try {
          await store.addBookFromCandidate(candidate, {
            collectionStatus: saveStatus,
            condition: uiState.intakeCondition,
            loved: uiState.intakeLoved,
            owners: uiState.intakeOwners.length > 0 ? uiState.intakeOwners : ['shared'],
          });
          resetIntakeSelectionDefaults();
          scanner.resetLock();
          render();
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Could not add book.', 'error');
        }
        break;
      }
      case 'save-found-wishlist': {
        const candidate = uiState.activeCandidate || uiState.isbnCandidate;
        if (!candidate) break;
        try {
          await store.addBookFromCandidate(candidate, {
            collectionStatus: 'wishlist',
            condition: uiState.intakeCondition,
            loved: uiState.intakeLoved,
            owners: uiState.intakeOwners.length > 0 ? uiState.intakeOwners : ['shared'],
          });
          resetIntakeSelectionDefaults();
          scanner.resetLock();
          render();
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Could not save to Wishlist.', 'error');
        }
        break;
      }
      case 'edit-found-book-manual': {
        const candidate = uiState.activeCandidate || uiState.isbnCandidate;
        if (candidate) {
          loadCandidateIntoManualDraft(candidate);
        }
        break;
      }
      case 'add-candidate': {
        const idx = Number(target.getAttribute('data-candidate-index'));
        const candidate =
          idx === -1 ? uiState.isbnCandidate : uiState.searchCandidates[idx] || null;
        if (!candidate) break;
        const saveStatus =
          uiState.intakeTargetStatus === 'wishlist' ? 'owned' : uiState.intakeTargetStatus;
        try {
          await store.addBookFromCandidate(candidate, {
            collectionStatus: saveStatus,
            condition: uiState.intakeCondition,
            loved: uiState.intakeLoved,
            owners: uiState.intakeOwners.length > 0 ? uiState.intakeOwners : ['shared'],
          });
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Could not add book.', 'error');
        }
        break;
      }
      case 'add-candidate-wishlist': {
        const idx = Number(target.getAttribute('data-candidate-index'));
        const candidate =
          idx === -1 ? uiState.isbnCandidate : uiState.searchCandidates[idx] || null;
        if (!candidate) break;
        try {
          await store.addBookFromCandidate(candidate, {
            collectionStatus: 'wishlist',
            condition: uiState.intakeCondition,
            loved: uiState.intakeLoved,
            owners: uiState.intakeOwners.length > 0 ? uiState.intakeOwners : ['shared'],
          });
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Could not save to Wishlist.', 'error');
        }
        break;
      }
      case 'edit-candidate': {
        const idx = Number(target.getAttribute('data-candidate-index'));
        const candidate =
          idx === -1 ? uiState.isbnCandidate : uiState.searchCandidates[idx] || null;
        if (candidate) {
          loadCandidateIntoManualDraft(candidate);
        }
        break;
      }
      case 'select-scan-mode': {
        const mode = /** @type {import('./types/models.js').ScanMode} */ (
          target.getAttribute('data-scan-mode') || 'barcode'
        );
        uiState.scanMode = mode;
        uiState.lastScanLockBanner = '';
        scanner.setMode(mode);
        await store.updateSettings({ preferredScanMode: mode });
        break;
      }
      case 'set-theme': {
        const theme = /** @type {import('./types/models.js').ThemeMode} */ (
          target.getAttribute('data-theme') || 'system'
        );
        await store.updateSettings({ theme });
        break;
      }
      case 'set-language': {
        const language = normalizeLanguage(target.getAttribute('data-language'));
        await store.updateSettings({ language });
        break;
      }
      case 'clear-input': {
        const targetId = target.getAttribute('data-target-input') || '';
        const inputEl = targetId ? document.getElementById(targetId) : null;
        if (inputEl instanceof HTMLInputElement) {
          inputEl.value = '';
          syncClearInputButtonForInput(inputEl);

          if (targetId === 'catalog-search-input') {
            uiState.searchQuery = '';
            render();
          } else if (targetId === 'provider-title-input') {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            uiState.titleQuery = '';
            uiState.isbnInput = '';
            uiState.isbnError = '';
            uiState.isbnNotFound = '';
            uiState.isbnCandidate = null;
            if (uiState.authorQuery.trim().length >= 2) {
              await executeUnifiedCatalogSearch();
            } else {
              uiState.searchCandidates = [];
              uiState.searchHasRun = false;
              uiState.searchError = '';
              render();
            }
          } else if (targetId === 'provider-author-input') {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            uiState.authorQuery = '';
            if (uiState.titleQuery.trim().length >= 2) {
              await executeUnifiedCatalogSearch();
            } else {
              uiState.searchCandidates = [];
              uiState.searchHasRun = false;
              uiState.searchError = '';
              render();
            }
          } else if (targetId === 'isbn-lookup-input') {
            uiState.isbnInput = '';
            uiState.isbnError = '';
            uiState.isbnNotFound = '';
            render();
          } else if (targetId === 'rotation-modal-search-input') {
            uiState.rotationEditor.searchQuery = '';
            render();
          } else if (targetId === 'presets-search-input') {
            uiState.presetsUi.searchQuery = '';
            render();
          } else if (targetId === 'play-topic-input') {
            uiState.playUi.randomizerTopic = '';
            uiState.playUi.randomizerNoTopicMatches = false;
            if (uiState.playUi.randomizerHasRun) {
              runStorytimeRandomizer();
            }
            render();
          } else if (targetId === 'inspector-cover-search-input') {
            uiState.inspectorUi.coverSearchQuery = '';
          } else if (!targetId.startsWith('edit-rot-title-')) {
            const rotForm = inputEl.closest('form[data-form="edit-rotation-details"]');
            if (rotForm instanceof HTMLFormElement) {
              const rotId = rotForm.getAttribute('data-rotation-id');
              if (rotId) {
                try {
                  await flushOpenRotationEdits(rotId, { silent: true });
                } catch (_) {}
              }
            }
          }

          const refocused = document.getElementById(targetId);
          if (refocused instanceof HTMLInputElement) {
            refocused.focus();
          }
        }
        break;
      }
      case 'set-cover-aspect': {
        const aspect = /** @type {import('./types/models.js').CoverAspectRatio} */ (
          target.getAttribute('data-cover-aspect') === 'square' ? 'square' : 'portrait'
        );
        await store.updateSettings({ coverAspectRatio: aspect });
        break;
      }
      case 'toggle-dynamic-cover-tint': {
        const current = store.getState().settings.dynamicCoverTint !== false;
        await store.updateSettings({ dynamicCoverTint: !current });
        store.notify(
          !current
            ? 'Enabled Dynamic Cover Art Card Tint.'
            : 'Disabled Dynamic Cover Art Card Tint.',
          'info'
        );
        break;
      }
      case 'toggle-preset-decorations': {
        const current = store.getState().settings.showPresetDecorations !== false;
        await store.updateSettings({ showPresetDecorations: !current });
        store.notify(
          !current
            ? 'Enabled Preset Card Corner Decorations.'
            : 'Disabled Preset Card Corner Decorations.',
          'info'
        );
        break;
      }
      case 'toggle-rotation-history-insights': {
        const current = store.getState().settings.enableRotationHistoryInsights !== false;
        await store.updateSettings({ enableRotationHistoryInsights: !current });
        store.notify(
          !current
            ? 'Enabled Rotation History & Cooldown Log insights.'
            : 'Hidden Rotation History & Cooldown Log labels.',
          'info'
        );
        break;
      }
      case 'toggle-cover-usage-adornos': {
        const current = store.getState().settings.showCoverUsageAdornos !== false;
        await store.updateSettings({ showCoverUsageAdornos: !current });
        store.notify(
          !current
            ? 'Enabled Cover Status Adornos in Library.'
            : 'Hidden Cover Status Adornos in Library.',
          'info'
        );
        break;
      }
      case 'toggle-stale-book-spotlight': {
        const current = store.getState().settings.enableStaleBookSpotlight !== false;
        await store.updateSettings({ enableStaleBookSpotlight: !current });
        store.notify(
          !current
            ? 'Enabled Stale Book Spotlight nudge.'
            : 'Disabled Stale Book Spotlight nudge.',
          'info'
        );
        break;
      }
      case 'clear-device-books-proxy': {
        setDeviceBooksProxyUrl('');
        uiState.settingsUi.deviceBooksProxyUrl = '';
        uiState.settingsUi.deviceBooksProxyError = '';
        uiState.settingsUi.googleBooksHealthReport = '';
        uiState.settingsUi.googleBooksHealthTone = 'idle';
        store.notify('Cleared personal phone Books proxy URL.', 'info');
        await refreshGoogleBooksKeyStatus();
        render();
        break;
      }
      case 'check-google-books-api': {
        await verifyGoogleBooksConnection({ context: 'manual' });
        break;
      }
      case 'sync-library-metadata': {
        uiState.settingsUi.syncingCatalogMetadata = true;
        uiState.settingsUi.catalogSyncProgressText = 'Updating Library…';
        uiState.settingsUi.catalogSyncReport = '';
        uiState.settingsUi.catalogSyncTone = 'idle';
        render();
        try {
          const summary = await store.syncExistingCatalogMetadata(catalogService, {
            onProgress: ({ current, total }) => {
              uiState.settingsUi.catalogSyncProgressText = `Updating ${current}/${total}…`;
              render();
            },
          });
          if (summary.updatedCount === 0 && summary.errorsCount > 0) {
            uiState.settingsUi.catalogSyncTone = 'error';
            uiState.settingsUi.catalogSyncReport = `Could not reach catalog providers for ${summary.errorsCount} book(s). Verify your Google Books connection above and try again.`;
          } else {
            uiState.settingsUi.catalogSyncTone = 'success';
            const parts = [
              `Checked ${summary.checkedCount} book(s)`,
              `${summary.updatedCount} updated`,
              summary.addedGoogleSourceCount > 0
                ? `${summary.addedGoogleSourceCount} linked to Google Books`
                : '',
              summary.addedCoversCount > 0
                ? `${summary.addedCoversCount} new cover(s) added`
                : '',
              summary.skippedCount > 0 ? `${summary.skippedCount} already complete` : '',
            ].filter(Boolean);
            uiState.settingsUi.catalogSyncReport = `${parts.join(' · ')}.`;
          }
        } catch (err) {
          uiState.settingsUi.catalogSyncTone = 'error';
          uiState.settingsUi.catalogSyncReport =
            err instanceof Error ? err.message : 'Library metadata update failed.';
        } finally {
          uiState.settingsUi.syncingCatalogMetadata = false;
          uiState.settingsUi.catalogSyncProgressText = '';
          render();
        }
        break;
      }
      case 'clear-cover-cache': {
        try {
          if (typeof window !== 'undefined' && 'caches' in window) {
            await window.caches.delete('book-cover-thumbnails');
          }
          store.notify(
            'Cleared cached offline cover thumbnails. Your library & profiles are untouched.',
            'info'
          );
          await refreshBrowserStorageEstimate();
          render();
        } catch (_) {
          store.notify('Could not clear browser cover cache.', 'error');
        }
        break;
      }
      case 'open-play-app': {
        const appId = target.getAttribute('data-play-app-id');
        if (appId === 'storytime-picker' || appId === 'book-hunt') {
          rememberModalTrigger(target);
          uiState.playUi.activeAppId = appId;
          uiState.playUi.sheetClosedExplicitly = false;
          render();
          focusActiveDialogControl();
        }
        break;
      }
      case 'close-play-app-sheet': {
        closeSheetWithMotion(() => {
          uiState.playUi.activeAppId = null;
          uiState.playUi.sheetClosedExplicitly = true;
        });
        break;
      }
      case 'set-randomizer-count': {
        const nextCount = Math.max(1, Math.min(50, Number(target.getAttribute('data-count') || 3)));
        uiState.playUi.randomizerCount = nextCount;
        if (uiState.playUi.randomizerHasRun) {
          runStorytimeRandomizer();
        }
        render();
        break;
      }
      case 'step-randomizer-count': {
        const delta = Number(
          target.getAttribute('data-step') ?? target.getAttribute('data-delta') ?? 0
        );
        const st = store.getState();
        const activeProfile =
          st.profiles.find((p) => p.id === st.activeProfileId) || st.profiles[0] || null;
        const activeRotation = activeProfile
          ? st.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') ||
            null
          : null;
        const pool = resolvePlayBookPool({
          books: st.books,
          activeRotation,
          activeProfile,
          scope: uiState.playUi.randomizerScope,
          selectedRotationId: uiState.playUi.randomizerRotationId,
          rotations: st.rotations,
        }).pool;
        const maxStepperCount = Math.max(1, Math.min(50, Math.max(pool.length || 0, 20)));
        const currentCount = Number(uiState.playUi.randomizerCount) || 2;
        const nextCount = Math.max(1, Math.min(maxStepperCount, currentCount + delta));
        uiState.playUi.randomizerCount = nextCount;
        if (uiState.playUi.randomizerHasRun) {
          runStorytimeRandomizer();
        }
        render();
        break;
      }
      case 'set-randomizer-scope': {
        const rawScope = target.getAttribute('data-scope');
        const scope =
          rawScope === 'owned-library'
            ? 'owned-library'
            : rawScope === 'rotation'
              ? 'rotation'
              : 'active-shelf';
        uiState.playUi.randomizerScope = scope;
        if (uiState.playUi.randomizerHasRun) {
          runStorytimeRandomizer();
        }
        render();
        break;
      }
      case 'set-randomizer-rotation-id': {
        const rotId =
          target.getAttribute('data-rotation-id') ||
          (target instanceof HTMLSelectElement ? target.value : null);
        if (rotId) {
          uiState.playUi.randomizerRotationId = rotId;
          uiState.playUi.randomizerScope = 'rotation';
          if (uiState.playUi.randomizerHasRun) {
            runStorytimeRandomizer();
          }
          render();
        }
        break;
      }
      case 'toggle-randomizer-unread': {
        uiState.playUi.randomizerUnreadFirst = !uiState.playUi.randomizerUnreadFirst;
        if (uiState.playUi.randomizerHasRun) {
          runStorytimeRandomizer();
        }
        render();
        break;
      }
      case 'set-randomizer-topic': {
        const topic = target.getAttribute('data-topic') || '';
        uiState.playUi.randomizerTopic = topic;
        uiState.playUi.randomizerNoTopicMatches = false;
        if (uiState.playUi.randomizerHasRun || topic) {
          runStorytimeRandomizer();
        }
        render();
        break;
      }
      case 'spin-storytime-randomizer': {
        runStorytimeRandomizer();
        render();
        if (rootEl) {
          const resultsEl = rootEl.querySelector('[data-storytime-results="true"]');
          if (resultsEl instanceof HTMLElement && typeof resultsEl.scrollIntoView === 'function') {
            resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
        break;
      }
      case 'set-book-hunt-mode': {
        const clueMode =
          target.getAttribute('data-clue-mode') === 'clue-first'
            ? 'clue-first'
            : 'cover-and-clue';
        uiState.playUi.huntClueMode = clueMode;
        uiState.playUi.huntPeekRevealed = false;
        render();
        break;
      }
      case 'set-book-hunt-scope': {
        const scope =
          target.getAttribute('data-scope') === 'owned-library'
            ? 'owned-library'
            : 'active-shelf';
        uiState.playUi.huntScope = scope;
        if (uiState.playUi.huntBookId) {
          startNextBookHunt();
        }
        render();
        break;
      }
      case 'start-book-hunt': {
        startNextBookHunt();
        render();
        if (rootEl) {
          const activeHuntEl = rootEl.querySelector('[data-book-hunt-active="true"]');
          if (
            activeHuntEl instanceof HTMLElement &&
            typeof activeHuntEl.scrollIntoView === 'function'
          ) {
            activeHuntEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
        break;
      }
      case 'toggle-book-hunt-peek': {
        uiState.playUi.huntPeekRevealed = !uiState.playUi.huntPeekRevealed;
        render();
        break;
      }
      case 'complete-book-hunt': {
        if (uiState.playUi.huntBookId && !uiState.playUi.huntCelebrated) {
          uiState.playUi.huntCelebrated = true;
          uiState.playUi.huntPeekRevealed = true;
          uiState.playUi.huntFoundCount += 1;
          store.notify('Book found! Awesome shelf treasure hunting!', 'success');
          render();
        }
        break;
      }
      case 'toggle-raw-payloads': {
        const current = store.getState().settings.retainRawProviderPayloads;
        await store.updateSettings({ retainRawProviderPayloads: !current });
        break;
      }
      case 'toggle-search-while-typing': {
        const current = Boolean(store.getState().settings.searchWhileTyping);
        await store.updateSettings({ searchWhileTyping: !current });
        store.notify(
          !current
            ? 'Enabled live search while typing in Scan & Search.'
            : 'Disabled live search while typing. Click Find to run searches.',
          'info'
        );
        break;
      }
      case 'toggle-metadata-provider': {
        const providerId = target.getAttribute('data-provider-id');
        if (providerId) {
          await store.toggleMetadataProvider(providerId);
        }
        break;
      }
      case 'toggle-auto-local-tagging': {
        const current = store.getState().settings.autoLocalTagging;
        await store.updateSettings({ autoLocalTagging: !current });
        break;
      }
      case 'toggle-ai-opt-in': {
        const current = store.getState().settings.aiEnrichmentOptIn;
        uiState.settingsUi.lastAdapterTestReport = '';
        await store.updateSettings({ aiEnrichmentOptIn: !current });
        store.notify(
          !current
            ? 'Enabled Optional AI Enrichment (with automatic Local Rules fallback).'
            : 'Disabled Optional AI Enrichment — using Local Rules only.',
          'info'
        );
        break;
      }
      case 'select-ai-adapter': {
        const adapterId = target.getAttribute('data-adapter-id');
        if (adapterId) {
          uiState.settingsUi.endpointError = '';
          uiState.settingsUi.lastAdapterTestReport = '';
          await store.updateSettings({ aiAdapterId: adapterId });
        }
        break;
      }
      case 'enrich-all-books': {
        uiState.settingsUi.enrichingCatalog = true;
        render();
        try {
          await store.enrichAllCatalogBooks();
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Catalog enrichment failed.', 'error');
        } finally {
          uiState.settingsUi.enrichingCatalog = false;
          render();
        }
        break;
      }
      case 'test-ai-adapter': {
        uiState.settingsUi.testingAdapter = true;
        uiState.settingsUi.lastAdapterTestReport = '';
        render();
        try {
          const settings = store.getState().settings;
          const probe = await store.getTaggingService().testAdapterConnection(settings);
          const engineDesc = probe.usedAi
            ? `AI Adapter (${probe.adapterId})`
            : `Local Rules (${probe.fallbackReason || 'offline'})`;
          uiState.settingsUi.lastAdapterTestReport = `Sample probe ("The Snowy Day") -> Topics: ${probe.tags.join(
            ', '
          )} · ${probe.readingLevelHint} · Engine: ${engineDesc}`;
        } catch (err) {
          uiState.settingsUi.lastAdapterTestReport =
            err instanceof Error ? err.message : 'Pipeline test failed.';
        } finally {
          uiState.settingsUi.testingAdapter = false;
          render();
        }
        break;
      }
      case 'reset-provider-defaults': {
        uiState.settingsUi.endpointError = '';
        uiState.settingsUi.lastAdapterTestReport = '';
        await store.resetProviderSettingsToSafeDefaults();
        break;
      }
      case 'add-recommended-to-shelf': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          try {
            await store.addBooksToRotationManual(rotationId, [bookId]);
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not add book.', 'error');
          }
        }
        break;
      }
      case 'enrich-book-tags': {
        const bookId = target.getAttribute('data-book-id');
        if (bookId) {
          try {
            await store.enrichSingleBook(bookId);
          } catch (err) {
            store.notify(err instanceof Error ? err.message : 'Could not enrich book.', 'error');
          }
        }
        break;
      }
      case 'remove-book-tag': {
        const bookId = target.getAttribute('data-book-id');
        const tag = target.getAttribute('data-tag');
        if (bookId && tag) {
          await store.removeBookTag(bookId, tag);
        }
        break;
      }
      case 'suggest-draft-tags': {
        const formEl = document.getElementById('manual-book-form');
        if (formEl instanceof HTMLFormElement) {
          const fd = new FormData(formEl);
          uiState.manualDraft = {
            ...uiState.manualDraft,
            title: String(fd.get('title') || ''),
            authors: String(fd.get('authors') || ''),
            isbn: String(fd.get('isbn') || ''),
            publishedYear: String(fd.get('publishedYear') || '').trim(),
            pageCount: String(fd.get('pageCount') || '').trim(),
            coverUrl: String(fd.get('coverUrl') || '').trim(),
            format: /** @type {import('./types/models.js').BookFormat} */ (
              fd.get('format') || 'hardcover'
            ),
            readingStage: /** @type {import('./types/models.js').ReadingStage} */ (
              fd.get('readingStage') || 'picture-book'
            ),
            ageMin: Number(fd.get('ageMin') || 2),
            ageMax: Number(fd.get('ageMax') || 6),
            tags: String(fd.get('tags') || ''),
          };
        }

        if (!uiState.manualDraft.title.trim()) {
          uiState.formError = 'Enter a Book Title first so we can suggest matching topic tags.';
          render();
          break;
        }

        uiState.formError = '';
        const res = await store.getTaggingService().enrichBook(
          {
            title: uiState.manualDraft.title,
            authors: uiState.manualDraft.authors
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
            format: uiState.manualDraft.format,
            pageCount: uiState.manualDraft.pageCount
              ? Number(uiState.manualDraft.pageCount)
              : undefined,
            tags: uiState.manualDraft.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          },
          store.getState().settings,
          { forceLocalRules: true }
        );

        uiState.manualDraft = {
          ...uiState.manualDraft,
          tags: res.tags.join(', '),
          ageMin: res.ageMin,
          ageMax: res.ageMax,
          readingStage: res.readingStage,
        };
        store.notify(
          res.tags.length > 0
            ? `Suggested topics: ${res.tags.join(', ')}`
            : 'No specific topic keywords matched that title yet — add custom tags separated by commas.',
          'info'
        );
        render();
        break;
      }
      case 'export-backup':
        downloadBackupJson();
        break;
      case 'reset-seed-data':
        await store.resetToSeedData();
        break;
      default:
        break;
    }
  });

  rootEl.addEventListener('input', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLTextAreaElement &&
      target.getAttribute('data-auto-resize') === 'true'
    ) {
      target.style.height = 'auto';
      if (target.scrollHeight > 0) {
        target.style.height = `${Math.max(target.scrollHeight + 2, 32)}px`;
      }
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    syncClearInputButtonForInput(target);

    if (target.id === 'catalog-search-input') {
      uiState.searchQuery = target.value;
      render();
    } else if (target.id === 'provider-title-input') {
      uiState.titleQuery = target.value;
      if (store.getState().settings.searchWhileTyping) {
        if (uiState.titleQuery.trim().length >= 2 || !uiState.titleQuery.trim()) {
          scheduleDebouncedSearch();
        }
      }
    } else if (target.id === 'provider-author-input') {
      uiState.authorQuery = target.value;
      if (store.getState().settings.searchWhileTyping) {
        if (uiState.authorQuery.trim().length >= 2 || uiState.titleQuery.trim().length >= 2) {
          scheduleDebouncedSearch();
        }
      }
    } else if (target.id === 'isbn-lookup-input') {
      uiState.isbnInput = target.value;
    } else if (target.id === 'rotation-modal-search-input') {
      uiState.rotationEditor.searchQuery = target.value;
      render();
    } else if (target.id === 'inspector-cover-search-input') {
      uiState.inspectorUi.coverSearchQuery = target.value;
    } else if (target.id === 'play-topic-input') {
      uiState.playUi.randomizerTopic = target.value;
      uiState.playUi.randomizerNoTopicMatches = false;
      render();
    } else if (target.id === 'presets-search-input') {
      uiState.presetsUi.searchQuery = target.value;
      render();
    } else if (target.id === 'profile-birth-date') {
      // Live in-DOM preview of auto-computed age & stage without disrupting native date picker focus
      const rawDob = target.value;
      const computedAge = computeAgeFromBirthDate(rawDob);
      const badgeEl = document.getElementById('profile-computed-age-badge');
      if (badgeEl) {
        badgeEl.textContent =
          computedAge !== null
            ? formatProfileAgeLabel({ age: computedAge, birthDate: rawDob })
            : 'Invalid date';
      }
      if (computedAge !== null && !uiState.shellUi.editingProfileId) {
        const stageSelect = document.getElementById('profile-stage');
        if (stageSelect instanceof HTMLSelectElement) {
          stageSelect.value = inferReadingStageFromAge(computedAge);
        }
      }
    }
  });

  rootEl.addEventListener('change', async (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      const rotForm = target.closest('form[data-form="edit-rotation-details"]');
      if (rotForm instanceof HTMLFormElement) {
        const rotId = rotForm.getAttribute('data-rotation-id');
        if (rotId) {
          try {
            await flushOpenRotationEdits(rotId, { silent: true });
          } catch (_) {}
          return;
        }
      }
    }
    if (target instanceof HTMLSelectElement && target.id === 'presets-category-select') {
      uiState.presetsUi.categoryFilter =
        /** @type {import('./features/rotations/presets-view.js').PresetFilterId} */ (
          target.value || 'all'
        );
      if (uiState.presetsUi.categoryFilter === 'evergreen') {
        uiState.presetsUi.selectedMonth = null;
      }
      render();
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      (target.id === 'setting-preset-days-before' || target.id === 'setting-preset-days-after')
    ) {
      const clampedVal = Math.max(0, Math.min(30, Math.trunc(Number(target.value) || 0)));
      if (target.id === 'setting-preset-days-before') {
        await store.updateSettings({ presetAlertDaysBefore: clampedVal });
      } else {
        await store.updateSettings({ presetAlertDaysAfter: clampedVal });
      }
      return;
    }
    if (target instanceof HTMLInputElement && target.id === 'setting-stale-book-days') {
      const clampedDays = Math.max(3, Math.min(60, Math.trunc(Number(target.value) || 10)));
      await store.updateSettings({ staleBookDays: clampedDays });
      return;
    }
    if (
      target instanceof HTMLSelectElement &&
      target.getAttribute('data-action') === 'set-randomizer-rotation-id'
    ) {
      uiState.playUi.randomizerRotationId = target.value;
      uiState.playUi.randomizerScope = 'rotation';
      if (uiState.playUi.randomizerHasRun) {
        runStorytimeRandomizer();
      }
      render();
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;

    if (target.id === 'import-backup-input') {
      const file = target.files && target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await store.importBackupJson(text);
      } catch (err) {
        store.notify(err instanceof Error ? err.message : 'Failed to import backup.', 'error');
      } finally {
        target.value = '';
      }
    } else if (target.id === 'scan-photo-upload-input') {
      const file = target.files && target.files[0];
      if (!file) return;
      uiState.lastScanLockBanner = '';
      try {
        await scanner.scanUploadedFile(file);
      } finally {
        target.value = '';
      }
    } else if (
      target.id === 'inspector-cover-gallery-input' ||
      target.id === 'inspector-cover-camera-input'
    ) {
      const file = target.files && target.files[0];
      if (!file || !uiState.inspectedBookId) return;
      try {
        const dataUrl = await compressImageFileToDataUrl(file);
        await store.updateBook(uiState.inspectedBookId, { coverUrl: dataUrl });
        uiState.inspectorUi.isCoverPickerOpen = false;
        render();
      } catch (err) {
        store.notify(
          err instanceof Error ? err.message : 'Could not load selected cover image.',
          'error'
        );
      } finally {
        target.value = '';
      }
    }
  });

  rootEl.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const data = new FormData(form);

    if (form.id === 'provider-search-form') {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      uiState.titleQuery = String(data.get('query') || '');
      uiState.authorQuery = String(data.get('author') || '');
      await executeUnifiedCatalogSearch({ fromSubmit: true });
    } else if (form.id === 'isbn-lookup-form') {
      const rawIsbn = String(data.get('isbn') || '');
      await executeIsbnLookup(rawIsbn);
    } else if (form.id === 'manual-book-form') {
      uiState.formError = '';
      const authorsRaw = String(data.get('authors') || '');
      const tagsRaw = String(data.get('tags') || '');
      const pubYearRaw = String(data.get('publishedYear') || '').trim();
      const pagesRaw = String(data.get('pageCount') || '').trim();
      const coverUrlRaw = String(data.get('coverUrl') || '').trim();
      const conditionVal = normalizeBookCondition(data.get('condition'));
      const customOwnersRaw = String(data.get('customOwners') || '');

      uiState.manualDraft = {
        ...uiState.manualDraft,
        title: String(data.get('title') || ''),
        authors: authorsRaw,
        isbn: String(data.get('isbn') || ''),
        publishedYear: pubYearRaw,
        pageCount: pagesRaw,
        coverUrl: coverUrlRaw,
        format: /** @type {import('./types/models.js').BookFormat} */ (
          data.get('format') || 'hardcover'
        ),
        readingStage: /** @type {import('./types/models.js').ReadingStage} */ (
          data.get('readingStage') || 'picture-book'
        ),
        ageMin: Number(data.get('ageMin') || 2),
        ageMax: Number(data.get('ageMax') || 6),
        tags: tagsRaw,
        condition: conditionVal,
        customOwners: customOwnersRaw,
      };

      const mergedOwners = normalizeOwnersList([
        ...uiState.intakeOwners,
        ...customOwnersRaw
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ]);

      try {
        await store.addManualBook({
          title: uiState.manualDraft.title,
          authors: authorsRaw
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          isbn: uiState.manualDraft.isbn,
          publishedYear: pubYearRaw ? Number(pubYearRaw) : undefined,
          pageCount: pagesRaw ? Number(pagesRaw) : undefined,
          coverUrl: coverUrlRaw || undefined,
          format: uiState.manualDraft.format,
          readingStage: uiState.manualDraft.readingStage,
          ageMin: uiState.manualDraft.ageMin,
          ageMax: uiState.manualDraft.ageMax,
          tags: tagsRaw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          collectionStatus: uiState.intakeTargetStatus,
          condition: conditionVal,
          loved: uiState.intakeLoved,
          owners: mergedOwners,
          sources: uiState.manualDraft.sources,
        });
        const state = store.getState();
        const activeProfile =
          state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
        const savedStatus = uiState.intakeTargetStatus;
        uiState.manualDraft = createBlankDraft(activeProfile);
        uiState.lastScanLockBanner = '';
        resetIntakeSelectionDefaults();
        if (savedStatus === 'wishlist') {
          uiState.catalogFilter = 'wishlist';
        }
        router.navigate('library');
      } catch (err) {
        uiState.formError = err instanceof Error ? err.message : 'Could not save book.';
        render();
      }
    } else if (form.id === 'add-profile-form') {
      try {
        const editingId = form.getAttribute('data-editing-profile-id');
        const topicsRaw = String(data.get('favoriteTopics') || '');
        const birthDate = String(data.get('birthDate') || '').trim();
        const payload = {
          name: String(data.get('name') || ''),
          birthDate: birthDate || undefined,
          age: data.get('age') !== null ? Number(data.get('age')) : undefined,
          readingStage: /** @type {import('./types/models.js').ReadingStage} */ (
            data.get('readingStage') || 'picture-book'
          ),
          avatarTone: String(data.get('avatarTone') || 'teal'),
          defaultRotationSize: Number(data.get('defaultRotationSize') || 5),
          cooldownDays: Number(data.get('cooldownDays') || 14),
          favoriteTopics: topicsRaw
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
        };

        if (editingId) {
          await store.updateProfile(editingId, payload);
        } else {
          await store.addProfile(payload);
        }

        uiState.shellUi.isProfileFormSheetOpen = false;
        uiState.shellUi.editingProfileId = null;
        uiState.shellUi.previewBirthDate = undefined;
        render();
        restoreModalTriggerFocus();
      } catch (err) {
        store.notify(err instanceof Error ? err.message : 'Could not save profile.', 'error');
      }
    } else if (form.id === 'generate-rotation-form' || form.id === 'starter-rotation-form') {
      try {
        const tagsRaw = String(data.get('preferredTags') || '');
        const formatVal = /** @type {import('./types/models.js').BookFormat | 'any'} */ (
          data.get('requiredFormat') || 'any'
        );
        const varietyChecked =
          form.id === 'generate-rotation-form' ? data.get('varietyMix') !== null : true;

        await store.generateRotation({
          title: String(data.get('title') || ''),
          objective: String(data.get('objective') || ''),
          count: Number(data.get('count') || 4),
          preferredTags: tagsRaw
            ? tagsRaw
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean)
            : undefined,
          cooldownDays:
            data.get('cooldownDays') !== null ? Number(data.get('cooldownDays')) : undefined,
          swapDays: data.get('swapDays') !== null ? Number(data.get('swapDays')) : undefined,
          requiredFormat: formatVal,
          varietyMix: varietyChecked,
          seed: String(data.get('seed') || ''),
        });
        uiState.rotationEditor.isGeneratorOpen = false;
        render();
        restoreModalTriggerFocus();
      } catch (err) {
        store.notify(err instanceof Error ? err.message : 'Could not generate rotation.', 'error');
      }
    } else if (form.getAttribute('data-form') === 'edit-rotation-details') {
      const rotationId = form.getAttribute('data-rotation-id');
      if (!rotationId) return;
      try {
        await flushOpenRotationEdits(rotationId, { silent: false });
      } catch (err) {
        store.notify(
          err instanceof Error ? err.message : 'Could not update rotation details.',
          'error'
        );
      }
    } else if (form.id === 'rotation-preset-form') {
      const monthCheck = buildMonthDayFromParts(
        String(data.get('suggestedMonth') || ''),
        String(data.get('suggestedDay') || '')
      );
      const rawTags = String(data.get('preferredTags') || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const draftSnapshot = {
        title: String(data.get('title') || ''),
        description: String(data.get('description') || ''),
        category: /** @type {import('./types/models.js').PresetCategory} */ (
          data.get('category') || 'seasonal-holidays'
        ),
        preferredTags: rawTags,
        count: Number(data.get('count') || 5),
        swapDays: Number(data.get('swapDays') || 14),
        cooldownDays: Number(data.get('cooldownDays') || 21),
        requiredFormat: /** @type {import('./types/models.js').BookFormat | 'any'} */ (
          data.get('requiredFormat') || 'any'
        ),
        varietyMix: data.get('varietyMix') !== null,
        seed: String(data.get('seed') || ''),
        suggestedStartMonthDay: monthCheck.monthDay,
        motif: String(data.get('motif') || '').trim(),
      };

      if (!monthCheck.valid) {
        uiState.presetsUi.formDraft = draftSnapshot;
        uiState.presetsUi.formError =
          monthCheck.error || 'Select a valid suggested start month and day.';
        render();
        return;
      }

      try {
        if (uiState.presetsUi.editingPresetId) {
          await store.updateRotationPreset(uiState.presetsUi.editingPresetId, draftSnapshot);
        } else {
          await store.addRotationPreset(draftSnapshot);
        }
        uiState.presetsUi.isFormOpen = false;
        uiState.presetsUi.editingPresetId = null;
        uiState.presetsUi.formDraft = null;
        uiState.presetsUi.formError = '';
        render();
        restoreModalTriggerFocus();
      } catch (err) {
        uiState.presetsUi.formDraft = draftSnapshot;
        uiState.presetsUi.formError =
          err instanceof Error ? err.message : 'Could not save collection preset.';
        render();
      }
    } else if (form.id === 'inspector-cover-search-form') {
      const rawCoverQuery = String(data.get('coverQuery') || '');
      await executeInspectorCoverSearch(rawCoverQuery);
    } else if (form.id === 'edit-book-form') {
      const bookId = form.getAttribute('data-book-id') || uiState.inspectedBookId;
      if (!bookId) return;
      const existing = store.getState().books.find((b) => b.id === bookId);
      const authorsRaw = String(data.get('authors') || '');
      const tagsRaw = String(data.get('tags') || '');
      const pubYearRaw = String(data.get('publishedYear') || '').trim();
      const pagesRaw = String(data.get('pageCount') || '').trim();
      const coverUrlInput = String(data.get('coverUrl') || '').trim();

      // If the book currently has a custom phone/camera photo (data:image/) and the HTTPS URL input was left blank, preserve the photo
      const nextCoverPatch =
        coverUrlInput !== ''
          ? coverUrlInput
          : existing?.coverUrl && existing.coverUrl.startsWith('data:image/')
            ? existing.coverUrl
            : '';

      try {
        await store.updateBook(bookId, {
          title: String(data.get('title') || ''),
          authors: authorsRaw
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          isbn: String(data.get('isbn') || ''),
          format: /** @type {import('./types/models.js').BookFormat} */ (
            data.get('format') || 'hardcover'
          ),
          readingStage: /** @type {import('./types/models.js').ReadingStage} */ (
            data.get('readingStage') || 'picture-book'
          ),
          ageMin: Number(data.get('ageMin') || 0),
          ageMax: Number(data.get('ageMax') || 6),
          pageCount: pagesRaw ? Number(pagesRaw) : null,
          publishedYear: pubYearRaw ? Number(pubYearRaw) : null,
          coverUrl: nextCoverPatch,
          collectionStatus: normalizeCollectionStatus(data.get('collectionStatus')),
          condition: normalizeBookCondition(data.get('condition')),
          tags: tagsRaw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        });
        uiState.inspectorUi.isEditingBook = false;
        uiState.inspectorUi.editError = '';
        render();
      } catch (err) {
        uiState.inspectorUi.editError =
          err instanceof Error ? err.message : 'Could not update book details.';
        render();
      }
    } else if (form.id === 'inspector-add-owner-form') {
      const bookId = form.getAttribute('data-book-id') || uiState.inspectedBookId;
      const rawOwner = String(data.get('owner') || '').trim();
      if (bookId && rawOwner) {
        const existing = store.getState().books.find((b) => b.id === bookId);
        if (existing) {
          const nextOwners = normalizeOwnersList([...(existing.owners || []), rawOwner]);
          await store.updateBook(bookId, { owners: nextOwners });
          form.reset();
        }
      }
    } else if (form.id === 'inspector-add-tag-form') {
      const bookId = form.getAttribute('data-book-id');
      const rawTag = String(data.get('tag') || '');
      if (bookId && rawTag.trim()) {
        try {
          await store.addBookTag(bookId, rawTag);
          form.reset();
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Could not add tag.', 'error');
        }
      }
    } else if (form.id === 'ai-provider-config-form') {
      const rawUrl = String(data.get('aiEndpointUrl') || '').trim();
      const timeoutMs = Number(data.get('aiTimeoutMs') || 6000);

      if (rawUrl) {
        const check = validateProxyEndpointUrl(rawUrl);
        if (!check.valid) {
          uiState.settingsUi.endpointError = check.error || 'Invalid endpoint URL.';
          render();
          return;
        }
        uiState.settingsUi.endpointError = '';
        await store.updateSettings({
          aiEndpointUrl: check.normalizedUrl,
          aiTimeoutMs: timeoutMs,
        });
        store.notify('Saved keyless proxy endpoint configuration.', 'success');
      } else {
        uiState.settingsUi.endpointError = '';
        await store.updateSettings({
          aiEndpointUrl: '',
          aiTimeoutMs: timeoutMs,
        });
        store.notify('Cleared custom proxy URL.', 'info');
      }
    } else if (form.id === 'device-books-proxy-form') {
      const rawUrl = String(data.get('deviceBooksProxyUrl') || '').trim();
      if (rawUrl) {
        const check = validateProxyEndpointUrl(rawUrl);
        if (!check.valid) {
          uiState.settingsUi.deviceBooksProxyError =
            check.error || 'Enter a valid keyless HTTPS proxy URL.';
          render();
          return;
        }
        setDeviceBooksProxyUrl(check.normalizedUrl);
        uiState.settingsUi.deviceBooksProxyUrl = check.normalizedUrl;
        uiState.settingsUi.deviceBooksProxyError = '';
        await verifyGoogleBooksConnection({ context: 'proxy-save' });
      } else {
        setDeviceBooksProxyUrl('');
        uiState.settingsUi.deviceBooksProxyUrl = '';
        uiState.settingsUi.deviceBooksProxyError = '';
        uiState.settingsUi.googleBooksHealthReport = '';
        uiState.settingsUi.googleBooksHealthTone = 'idle';
        store.notify('Cleared personal Books proxy URL on this device.', 'info');
        render();
      }
    }
  });
}

async function bootstrap() {
  render();
  bindEvents();
  store.subscribe(render);
  pwa.subscribe(render);
  router.subscribe((next) => {
    uiState.formError = '';
    uiState.shellUi.isProfileSwitcherOpen = false;
    if (next.route !== 'scan') {
      scanner.stopCamera();
    } else {
      scanner.initSupport();
    }
    if (uiState.rotationEditor.editingRotationId && next.route !== 'rotations') {
      void flushOpenRotationEdits(uiState.rotationEditor.editingRotationId, { silent: true });
    }
    if (next.route === 'rotations') {
      if (next.params.get('new') === '1') {
        uiState.rotationEditor.isGeneratorOpen = true;
      }
      const editRotId = next.params.get('edit');
      uiState.rotationEditor.editingRotationId = editRotId || null;
    }
    if (next.route === 'presets') {
      if (next.params.get('new') === '1') {
        uiState.presetsUi.isFormOpen = true;
        uiState.presetsUi.editingPresetId = null;
        uiState.presetsUi.formDraft = null;
        uiState.presetsUi.formError = '';
      }
    }
    if (next.route === 'library') {
      const filterParam = next.params.get('filter');
      if (
        filterParam === 'all' ||
        filterParam === 'owned' ||
        filterParam === 'wishlist' ||
        filterParam === 'loved' ||
        filterParam === 'library' ||
        filterParam === 'interested' ||
        filterParam === 'needs-care' ||
        filterParam === 'hardcover' ||
        filterParam === 'board-book' ||
        filterParam === 'paperback'
      ) {
        uiState.catalogFilter = filterParam;
      }
      const ownerParam = next.params.get('owner');
      if (ownerParam) {
        uiState.ownerFilter = ownerParam;
      }
    }
    const statusParam = next.params.get('status');
    if (
      statusParam === 'owned' ||
      statusParam === 'wishlist' ||
      statusParam === 'library' ||
      statusParam === 'interested'
    ) {
      uiState.intakeTargetStatus = statusParam;
    }
    if (next.route === 'scan') {
      const scanEntry = resolveScanEntryState(next.params);
      uiState.activeCandidate = null;
      uiState.isFoundSheetOpen = false;
      uiState.intakeTab = scanEntry.intakeTab;
      uiState.scanMode = scanEntry.scanMode;
      scanner.setMode(scanEntry.scanMode);
      if (scanEntry.intakeTab !== 'scanner') {
        scanner.stopCamera();
      }
    }
    if (next.route === 'settings') {
      refreshGoogleBooksKeyStatus();
      void refreshBrowserStorageEstimate();
    }
    render();
  });

  pwa.init();
  await store.init();
  const state = store.getState();
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  uiState.manualDraft = createBlankDraft(activeProfile);
  uiState.scanMode = 'barcode';
  scanner.setMode('barcode');
  await scanner.initSupport();
  router.start();
  render();
  refreshGoogleBooksKeyStatus();
  void refreshBrowserStorageEstimate();
}

bootstrap();
