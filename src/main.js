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
} from './types/models.js';
import { createRouter } from './core/router.js';
import { createStorageAdapter } from './core/storage.js';
import { createAppStore } from './core/store.js';
import { createPwaManager } from './features/pwa/pwa-manager.js';
import { createCatalogService } from './features/catalog/catalog-service.js';
import { createScannerController } from './features/scan/scanner-controller.js';
import { renderAppShell } from './ui/components/app-shell.js';
import { renderHomeView } from './features/home/home-view.js';
import { renderLibraryView } from './features/library/library-view.js';
import { renderScanShellView } from './features/scan/scan-shell-view.js';
import { renderRotationsView } from './features/rotations/rotations-view.js';
import { renderProfilesView } from './features/profiles/profiles-view.js';
import { renderSettingsView } from './features/settings/settings-view.js';
import { validateProxyEndpointUrl } from './features/tagging/ai-tag-adapter.js';

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
    /** @type {import('./types/models.js').ProviderSource[] | undefined} */
    sources: undefined,
  };
}

const uiState = {
  catalogFilter: 'all',
  searchQuery: '',
  inspectedBookId: /** @type {string | null} */ (null),
  /** @type {import('./features/scan/scan-shell-view.js').IntakeTab} */
  intakeTab: 'scanner',
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
  },
  /** @type {import('./features/rotations/rotations-view.js').RotationEditorUiState} */
  rotationEditor: {
    modalMode: null,
    rotationId: null,
    targetBookId: null,
    searchQuery: '',
    selectedAddBookIds: [],
    randomAddCount: 1,
    isGeneratorOpen: false,
    editingRotationId: null,
  },
  settingsUi: {
    testingAdapter: false,
    enrichingCatalog: false,
    lastAdapterTestReport: '',
    endpointError: '',
  },
};

const scanner = createScannerController({
  onStateChange: () => {
    render();
  },
  onLock: async (lock) => {
    if (lock.kind === 'isbn' && lock.isbn13) {
      uiState.lastScanLockBanner = `Locked ISBN ${lock.isbn13} via ${lock.sourceLabel} — enriched metadata loaded below.`;
      uiState.intakeTab = 'isbn';
      await executeIsbnLookup(lock.isbn13);
    } else if (lock.kind === 'cover-title' && lock.titleQuery) {
      uiState.lastScanLockBanner = `Extracted cover title "${lock.titleQuery}" via ${lock.sourceLabel} — matching editions loaded below.`;
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
]);

/** @type {string | null} */
let lastModalTriggerSelector = null;

/**
 * Captures a selector for the button that opened a sheet/modal so focus can be restored on close.
 * @param {Element} el
 */
function rememberModalTrigger(el) {
  const action = el.getAttribute('data-action');
  const bookId = el.getAttribute('data-book-id');
  const rotId = el.getAttribute('data-rotation-id');
  const profId = el.getAttribute('data-profile-id');
  if (action && bookId && rotId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-rotation-id="${rotId}"][data-book-id="${bookId}"]`;
  } else if (action && bookId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-book-id="${bookId}"]`;
  } else if (action && rotId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-rotation-id="${rotId}"]`;
  } else if (action && profId) {
    lastModalTriggerSelector = `[data-action="${action}"][data-profile-id="${profId}"]`;
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
 * Moves initial focus inside the open modal/sheet dialog on first open.
 */
function focusActiveDialogControl() {
  if (!rootEl) return;
  const dialog = rootEl.querySelector('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) return;
  const preferred =
    dialog.querySelector('input:not([disabled]), button:not([disabled])') || dialog;
  if (preferred instanceof HTMLElement) {
    preferred.focus();
  }
}

function render() {
  if (!rootEl) return;

  if (!store.isInitialized()) {
    rootEl.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-linen-50 dark:bg-night-950 p-6">
        <p class="text-sm font-medium text-stone-ink dark:text-slate-400">Loading family library…</p>
      </div>
    `;
    return;
  }

  const { route } = router.getCurrent();
  const state = store.getState();

  const activeElement = document.activeElement;
  const focusedId =
    activeElement instanceof HTMLInputElement && PRESERVED_INPUT_IDS.has(activeElement.id)
      ? activeElement.id
      : null;
  const selectionStart =
    focusedId && activeElement instanceof HTMLInputElement ? activeElement.selectionStart : null;

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
      contentHtml = renderHomeView({ state, uiState });
      break;
  }

  rootEl.innerHTML = renderAppShell({
    activeRoute: route,
    state,
    toast: store.getToast(),
    pwaStatus: pwa.getStatus(),
    shellUiState: uiState.shellUi,
    contentHtml,
  });

  if (route === 'scan' && uiState.intakeTab === 'scanner') {
    const videoEl = document.getElementById('scanner-live-video');
    if (videoEl instanceof HTMLVideoElement) {
      scanner.attachVideoElement(videoEl);
    }
  }

  if (focusedId) {
    const nextInput = document.getElementById(focusedId);
    if (nextInput instanceof HTMLInputElement) {
      nextInput.focus();
      if (selectionStart !== null) {
        try {
          nextInput.setSelectionRange(selectionStart, selectionStart);
        } catch (_) {}
      }
    }
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
 * Schedules a debounced provider search while the user types.
 */
function scheduleDebouncedSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeProviderSearch();
  }, 380);
}

/**
 * Executes an ISBN-10 / ISBN-13 metadata lookup across registered providers.
 * @param {string} rawIsbn
 */
async function executeIsbnLookup(rawIsbn) {
  uiState.isbnInput = rawIsbn;
  uiState.isbnLoading = true;
  uiState.isbnError = '';
  uiState.isbnNotFound = '';
  uiState.isbnCandidate = null;
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
    } else {
      uiState.isbnNotFound = result.isbn13;
    }
    render();
  } catch (err) {
    uiState.isbnLoading = false;
    uiState.isbnError = err instanceof Error ? err.message : 'ISBN lookup failed.';
    render();
  }
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
    sources: candidate.sources,
  };
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

  // Release camera tracks immediately if browser tab is backgrounded
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scanner.stopCamera();
    }
  });

  // Global keyboard handler: Escape closes active bottom sheets/modals & Tab traps focus inside open [role="dialog"]
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (uiState.shellUi.isProfileFormSheetOpen) {
        event.preventDefault();
        uiState.shellUi.isProfileFormSheetOpen = false;
        uiState.shellUi.editingProfileId = null;
        uiState.shellUi.previewBirthDate = undefined;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (uiState.shellUi.isProfileSwitcherOpen) {
        event.preventDefault();
        uiState.shellUi.isProfileSwitcherOpen = false;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (uiState.inspectedBookId) {
        event.preventDefault();
        uiState.inspectedBookId = null;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (uiState.rotationEditor.isGeneratorOpen) {
        event.preventDefault();
        uiState.rotationEditor.isGeneratorOpen = false;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (uiState.rotationEditor.modalMode) {
        event.preventDefault();
        uiState.rotationEditor.modalMode = null;
        uiState.rotationEditor.selectedAddBookIds = [];
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (pwa.getStatus().showIosInstructions) {
        event.preventDefault();
        pwa.closeIosGuide();
        restoreModalTriggerFocus();
        return;
      }
      if (store.getToast()) {
        store.dismissToast();
      }
      return;
    }

    if (event.key === 'Tab' && rootEl) {
      const dialog = rootEl.querySelector('[role="dialog"]');
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
        uiState.shellUi.isProfileSwitcherOpen = false;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (backdropAction === 'close-profile-form-sheet') {
        uiState.shellUi.isProfileFormSheetOpen = false;
        uiState.shellUi.editingProfileId = null;
        uiState.shellUi.previewBirthDate = undefined;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (backdropAction === 'close-inspect-book') {
        uiState.inspectedBookId = null;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (backdropAction === 'close-generate-rotation-sheet') {
        uiState.rotationEditor.isGeneratorOpen = false;
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (backdropAction === 'close-rotation-modal') {
        uiState.rotationEditor.modalMode = null;
        uiState.rotationEditor.selectedAddBookIds = [];
        render();
        restoreModalTriggerFocus();
        return;
      }
      if (backdropAction === 'close-ios-guide') {
        pwa.closeIosGuide();
        restoreModalTriggerFocus();
        return;
      }
    }

    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!target) return;

    const action = target.getAttribute('data-action');
    switch (action) {
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
      case 'close-ios-guide':
        pwa.closeIosGuide();
        restoreModalTriggerFocus();
        break;
      case 'install-pwa':
        rememberModalTrigger(target);
        await pwa.triggerInstall();
        break;
      case 'open-profile-switcher': {
        rememberModalTrigger(target);
        uiState.shellUi.isProfileSwitcherOpen = true;
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-profile-switcher': {
        uiState.shellUi.isProfileSwitcherOpen = false;
        render();
        restoreModalTriggerFocus();
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
        uiState.shellUi.isProfileFormSheetOpen = false;
        uiState.shellUi.editingProfileId = null;
        uiState.shellUi.previewBirthDate = undefined;
        render();
        restoreModalTriggerFocus();
        break;
      }
      case 'switch-profile': {
        const profileId = target.getAttribute('data-profile-id');
        uiState.shellUi.isProfileSwitcherOpen = false;
        if (profileId) await store.setActiveProfile(profileId);
        break;
      }
      case 'delete-profile': {
        const profileId = target.getAttribute('data-profile-id');
        if (profileId) await store.deleteProfile(profileId);
        break;
      }
      case 'set-catalog-filter': {
        uiState.catalogFilter = target.getAttribute('data-filter') || 'all';
        render();
        break;
      }
      case 'inspect-book': {
        rememberModalTrigger(target);
        uiState.inspectedBookId = target.getAttribute('data-book-id');
        render();
        focusActiveDialogControl();
        break;
      }
      case 'close-inspect-book': {
        uiState.inspectedBookId = null;
        render();
        restoreModalTriggerFocus();
        break;
      }
      case 'delete-book': {
        const bookId = target.getAttribute('data-book-id');
        if (bookId) {
          if (uiState.inspectedBookId === bookId) {
            uiState.inspectedBookId = null;
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
        uiState.rotationEditor.isGeneratorOpen = false;
        render();
        restoreModalTriggerFocus();
        break;
      }
      case 'toggle-rotation-read': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          await store.toggleRotationBookRead(rotationId, bookId);
        }
        break;
      }
      case 'toggle-edit-rotation': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) {
          uiState.rotationEditor.editingRotationId =
            uiState.rotationEditor.editingRotationId === rotationId ? null : rotationId;
          render();
        }
        break;
      }
      case 'activate-rotation': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) await store.setActiveRotation(rotationId);
        break;
      }
      case 'delete-rotation': {
        const rotationId = target.getAttribute('data-rotation-id');
        if (rotationId) {
          if (uiState.rotationEditor.editingRotationId === rotationId) {
            uiState.rotationEditor.editingRotationId = null;
          }
          await store.deleteRotation(rotationId);
        }
        break;
      }
      case 'remove-rotation-book': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          await store.removeBookFromRotation(rotationId, bookId);
        }
        break;
      }
      case 'replace-book-random': {
        const rotationId = target.getAttribute('data-rotation-id');
        const bookId = target.getAttribute('data-book-id');
        if (rotationId && bookId) {
          try {
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
          rememberModalTrigger(target);
          uiState.rotationEditor = {
            ...uiState.rotationEditor,
            modalMode: 'replace',
            rotationId,
            targetBookId: bookId,
            searchQuery: '',
            selectedAddBookIds: [],
            randomAddCount: 1,
          };
          render();
          focusActiveDialogControl();
        }
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
          rememberModalTrigger(target);
          uiState.rotationEditor = {
            ...uiState.rotationEditor,
            modalMode: 'add',
            rotationId,
            targetBookId: null,
            searchQuery: '',
            selectedAddBookIds: [],
            randomAddCount: 1,
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
        uiState.rotationEditor.modalMode = null;
        uiState.rotationEditor.selectedAddBookIds = [];
        render();
        restoreModalTriggerFocus();
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
        uiState.intakeTab = tab;
        uiState.formError = '';
        render();
        break;
      }
      case 'scan-another-book': {
        uiState.lastScanLockBanner = '';
        uiState.intakeTab = 'scanner';
        scanner.resetLock();
        render();
        break;
      }
      case 'start-camera-scan': {
        uiState.lastScanLockBanner = '';
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
      case 'capture-live-frame': {
        await scanner.captureCurrentFrame();
        break;
      }
      case 'reset-scanner': {
        uiState.lastScanLockBanner = '';
        scanner.resetLock();
        break;
      }
      case 'fill-sample-isbn': {
        const sampleIsbn = target.getAttribute('data-isbn') || '';
        if (sampleIsbn) await executeIsbnLookup(sampleIsbn);
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
      case 'add-candidate': {
        const idx = Number(target.getAttribute('data-candidate-index'));
        const candidate =
          idx === -1 ? uiState.isbnCandidate : uiState.searchCandidates[idx] || null;
        if (!candidate) break;
        try {
          await store.addBookFromCandidate(candidate);
        } catch (err) {
          store.notify(err instanceof Error ? err.message : 'Could not add book.', 'error');
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
      case 'toggle-raw-payloads': {
        const current = store.getState().settings.retainRawProviderPayloads;
        await store.updateSettings({ retainRawProviderPayloads: !current });
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
    if (!(target instanceof HTMLInputElement)) return;

    if (target.id === 'catalog-search-input') {
      uiState.searchQuery = target.value;
      render();
    } else if (target.id === 'provider-title-input') {
      uiState.titleQuery = target.value;
      if (uiState.titleQuery.trim().length >= 2 || !uiState.titleQuery.trim()) {
        scheduleDebouncedSearch();
      }
    } else if (target.id === 'provider-author-input') {
      uiState.authorQuery = target.value;
      if (uiState.authorQuery.trim().length >= 2 || uiState.titleQuery.trim().length >= 2) {
        scheduleDebouncedSearch();
      }
    } else if (target.id === 'isbn-lookup-input') {
      uiState.isbnInput = target.value;
    } else if (target.id === 'rotation-modal-search-input') {
      uiState.rotationEditor.searchQuery = target.value;
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
      await executeProviderSearch();
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
      };

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
          sources: uiState.manualDraft.sources,
        });
        const state = store.getState();
        const activeProfile =
          state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
        uiState.manualDraft = createBlankDraft(activeProfile);
        uiState.lastScanLockBanner = '';
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
    if (next.route === 'rotations') {
      if (next.params.get('new') === '1') {
        uiState.rotationEditor.isGeneratorOpen = true;
      }
      const editRotId = next.params.get('edit');
      uiState.rotationEditor.editingRotationId = editRotId || null;
    }
    if (next.route === 'library') {
      const filterParam = next.params.get('filter');
      if (
        filterParam === 'all' ||
        filterParam === 'hardcover' ||
        filterParam === 'board-book' ||
        filterParam === 'paperback'
      ) {
        uiState.catalogFilter = filterParam;
      }
    }
    const modeParam = next.params.get('mode');
    if (modeParam === 'barcode' || modeParam === 'isbn-ocr' || modeParam === 'cover') {
      uiState.scanMode = modeParam;
      scanner.setMode(modeParam);
      uiState.intakeTab = 'scanner';
    }
    const tabParam = next.params.get('tab');
    if (
      tabParam === 'search' ||
      tabParam === 'isbn' ||
      tabParam === 'manual' ||
      tabParam === 'scanner'
    ) {
      uiState.intakeTab = tabParam;
      if (tabParam !== 'scanner') {
        scanner.stopCamera();
      }
    }
    render();
  });

  pwa.init();
  await store.init();
  const state = store.getState();
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  uiState.manualDraft = createBlankDraft(activeProfile);
  uiState.scanMode = state.settings.preferredScanMode || 'barcode';
  scanner.setMode(uiState.scanMode);
  await scanner.initSupport();
  router.start();
  render();
}

bootstrap();
