/**
 * @fileoverview Phase 17 tests:
 * 1. Per-device Phone PWA keyless Google Books proxy URL (`getDeviceBooksProxyUrl`, `setDeviceBooksProxyUrl`,
 *    Settings `#device-books-proxy-form`, `validateProxyEndpointUrl` secret rejection, zero backup leakage).
 * 2. Scan page redesign (`SCAN_REDESIGN_TRACE`): removed step-1/2 subtitle, unified `Camera | Search & ISBN | Manual`,
 *    smart `parseUnifiedCatalogQuery` ISBN vs Title/Author/Keyword detection, and optical corner reticles.
 * 3. Rear camera hardware Flashlight (`toggleTorch` via `MediaStreamTrack.applyConstraints` + live `Flashlight` button).
 * 4. Wider Library filter sidebar (`w-[94vw]`) & unmistakable active-page highlight on bottom navigation icons.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import {
  DEVICE_BOOKS_PROXY_STORAGE_KEY,
  createGoogleBooksProvider,
  getDeviceBooksProxyUrl,
  setDeviceBooksProxyUrl,
} from '../src/features/catalog/providers/google-books-provider.js';
import { validateProxyEndpointUrl } from '../src/features/tagging/ai-tag-adapter.js';
import {
  SCAN_REDESIGN_TRACE,
  parseUnifiedCatalogQuery,
  renderScanShellView,
} from '../src/features/scan/scan-shell-view.js';
import { createScannerController } from '../src/features/scan/scanner-controller.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';

/**
 * Minimal in-memory `Storage` mock for Node tests.
 */
function createMemoryWebStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    /** @param {string} k */
    getItem: (k) => (map.has(k) ? map.get(k) || null : null),
    /**
     * @param {string} k
     * @param {string} v
     */
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    /** @param {string} k */
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

function createBaseScanUiState(overrides = {}) {
  return {
    intakeTab: /** @type {import('../src/features/scan/scan-shell-view.js').IntakeTab} */ ('scanner'),
    isbnInput: '',
    isbnLoading: false,
    isbnError: '',
    isbnNotFound: '',
    isbnCandidate: null,
    isbnProviderWarnings: [],
    lastScanLockBanner: '',
    titleQuery: '',
    authorQuery: '',
    searchLoading: false,
    searchError: '',
    searchHasRun: false,
    searchCandidates: [],
    searchProviderWarnings: [],
    manualDraft: {
      title: '',
      authors: '',
      isbn: '',
      publishedYear: '',
      pageCount: '',
      coverUrl: '',
      format: /** @type {const} */ ('hardcover'),
      readingStage: /** @type {const} */ ('picture-book'),
      ageMin: 2,
      ageMax: 6,
      tags: '',
    },
    scanMode: /** @type {const} */ ('barcode'),
    formError: '',
    ...overrides,
  };
}

describe('Phase 17 — Phone PWA Proxy, Pro Scan Redesign + Flashlight, Wide Filter Drawer & Active Nav', () => {
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    }
  });

  it('1. Allows each phone PWA user to configure a device-only keyless Google Books proxy URL without exposing raw API keys or leaking into JSON backups', async () => {
    const memLocal = createMemoryWebStorage();
    assert.equal(getDeviceBooksProxyUrl(memLocal), '');

    // Rejects URLs with embedded `?key=...` secrets
    const rejectedWithSecret = validateProxyEndpointUrl(
      'https://my-books-proxy.workers.dev/volumes?key=AIzaSyFakeSecret123'
    );
    assert.equal(rejectedWithSecret.valid, false);

    // Accepts clean keyless HTTPS proxy URL and persists in device-local storage only
    const validProxy = validateProxyEndpointUrl('https://my-books-proxy.workers.dev/volumes');
    assert.equal(validProxy.valid, true);
    setDeviceBooksProxyUrl(validProxy.normalizedUrl, memLocal);
    assert.equal(
      memLocal.getItem(DEVICE_BOOKS_PROXY_STORAGE_KEY),
      'https://my-books-proxy.workers.dev/volumes'
    );
    assert.equal(getDeviceBooksProxyUrl(memLocal), 'https://my-books-proxy.workers.dev/volumes');

    // Google Books provider routes requests through the user's personal device proxy URL
    /** @type {string[]} */
    const requestedUrls = [];
    const http = createHttpClient({
      disablePersistentCache: true,
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'gb-corduroy',
                volumeInfo: {
                  title: 'Corduroy',
                  authors: ['Don Freeman'],
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780140501742' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const provider = createGoogleBooksProvider(http, {
      useServerProxy: false,
      getCustomProxyUrl: () => getDeviceBooksProxyUrl(memLocal),
    });

    const hit = await provider.lookupByIsbn('9780140501742');
    assert.ok(hit);
    assert.equal(hit.title, 'Corduroy');
    assert.ok(
      requestedUrls[0].startsWith('https://my-books-proxy.workers.dev/volumes?'),
      `Expected lookup to use personal device proxy, got ${requestedUrls[0]}`
    );
    assert.equal(provider.getProxyDiagnostics().customProxyUrl, 'https://my-books-proxy.workers.dev/volumes');

    // Settings UI renders the personal phone proxy form & status with zero raw `api_key` inputs, and backups never contain it
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const settingsHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: true,
        isIOS: true,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        deviceBooksProxyUrl: 'https://my-books-proxy.workers.dev/volumes',
        deviceBooksProxyError: '',
      },
    });

    assert.ok(settingsHtml.includes('id="device-books-proxy-form"'));
    assert.ok(settingsHtml.includes('data-google-key-status="device-proxy"'));
    assert.ok(settingsHtml.includes('Personal Phone Proxy Active'));
    assert.equal(settingsHtml.includes('api_key'), false, 'Must never render raw api_key input');
    assert.equal(/name=["'][^"']*api[_-]?key/i.test(settingsHtml), false);

    const backupJson = JSON.stringify(store.getState(), null, 2);
    assert.equal(
      backupJson.includes('my-books-proxy.workers.dev'),
      false,
      'Device-local proxy URL must never leak into exported library JSON backups'
    );

    setDeviceBooksProxyUrl('', memLocal);
    assert.equal(getDeviceBooksProxyUrl(memLocal), '');
  });

  it('2. Redesigns Scan page cleanly: removes step-1/2 subtitle, combines Search & ISBN with smart query detection, and records traceable changes', async () => {
    assert.equal(SCAN_REDESIGN_TRACE.length, 4);
    assert.deepEqual(
      SCAN_REDESIGN_TRACE.map((t) => t.id),
      ['TRACE-SCAN-1', 'TRACE-SCAN-2', 'TRACE-SCAN-3', 'TRACE-SCAN-4']
    );

    // Smart query classification: ISBN-13, ISBN-10, prefixed ISBN, invalid checksum ISBN, and Title/Author/Keyword queries
    assert.deepEqual(parseUnifiedCatalogQuery('978-0-14-050174-2'), {
      mode: 'isbn',
      isbn13: '9780140501742',
      rawIsbn: '978-0-14-050174-2',
    });
    assert.deepEqual(parseUnifiedCatalogQuery('0140501746'), {
      mode: 'isbn',
      isbn13: '9780140501742',
      rawIsbn: '0140501746',
    });
    assert.deepEqual(parseUnifiedCatalogQuery('ISBN: 9780064431781'), {
      mode: 'isbn',
      isbn13: '9780064431781',
      rawIsbn: '9780064431781',
    });
    const invalidIsbn = parseUnifiedCatalogQuery('9780140501749');
    assert.equal(invalidIsbn.mode, 'invalid-isbn');

    assert.deepEqual(parseUnifiedCatalogQuery('The Gruffalo', 'Julia Donaldson'), {
      mode: 'search',
      query: 'The Gruffalo',
      author: 'Julia Donaldson',
    });
    assert.deepEqual(parseUnifiedCatalogQuery('bedtime bears'), {
      mode: 'search',
      query: 'bedtime bears',
      author: '',
    });

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const idleScannerState = {
      mode: /** @type {const} */ ('barcode'),
      phase: /** @type {const} */ ('idle'),
      statusMessage: 'Ready to scan.',
      errorMessage: '',
      ignoredHint: '',
      facingMode: /** @type {const} */ ('environment'),
      torchSupported: false,
      torchOn: false,
      uploadedPreviewUrl: '',
      lock: null,
      support: null,
    };

    const cameraHtml = renderScanShellView({
      state,
      uiState: createBaseScanUiState({ intakeTab: 'scanner' }),
      scannerState: idleScannerState,
    });

    assert.equal(
      cameraHtml.includes('1. Scan or find'),
      false,
      'Must remove the old "1. Scan or find · 2. Save to Library or Wishlist" subtitle'
    );
    assert.ok(cameraHtml.includes('Scan &amp; Add Books') || cameraHtml.includes('Scan & Add Books'));

    // Top switcher has exactly 3 unified tabs: Camera, Search & ISBN, Manual
    const topTabButtons = cameraHtml.match(/data-action="select-intake-tab"/g) || [];
    assert.equal(topTabButtons.length, 3, 'Expected 3 unified top intake tabs');
    assert.ok(cameraHtml.includes('Search &amp; ISBN'));

    // Unified Search & ISBN tab renders both unified search form and quick ISBN sample triggers
    const unifiedSearchHtml = renderScanShellView({
      state,
      uiState: createBaseScanUiState({ intakeTab: 'search', titleQuery: '9780140501742' }),
      scannerState: idleScannerState,
    });
    assert.ok(unifiedSearchHtml.includes('id="provider-search-form"'));
    assert.ok(unifiedSearchHtml.includes('Title, Keywords, or ISBN'));
    assert.ok(unifiedSearchHtml.includes('data-action="fill-sample-isbn"'));
  });

  it('3. Supports hardware rear-camera Flashlight (torch) toggling and renders live Flashlight control', async () => {
    /** @type {any[]} */
    const appliedConstraints = [];
    let trackStopped = false;

    const fakeVideoTrack = {
      getCapabilities: () => ({ torch: true }),
      /** @param {any} constraints */
      applyConstraints: async (constraints) => {
        appliedConstraints.push(constraints);
      },
      stop: () => {
        trackStopped = true;
      },
    };

    const fakeStream = /** @type {any} */ ({
      getVideoTracks: () => [fakeVideoTrack],
      getTracks: () => [fakeVideoTrack],
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => fakeStream,
        },
      },
    });

    const scanner = createScannerController();
    await scanner.startCamera();
    assert.equal(scanner.getState().phase, 'streaming');
    assert.equal(scanner.getState().torchSupported, true);
    assert.equal(scanner.getState().torchOn, false);

    // Toggle flashlight ON
    const onRes = await scanner.toggleTorch();
    assert.deepEqual(onRes, { ok: true, torchOn: true });
    assert.equal(scanner.getState().torchOn, true);
    assert.deepEqual(appliedConstraints[0], { advanced: [{ torch: true }] });

    // Render streaming Scan UI with torch active
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const streamingHtml = renderScanShellView({
      state: store.getState(),
      uiState: createBaseScanUiState({ intakeTab: 'scanner' }),
      scannerState: scanner.getState(),
    });
    assert.ok(streamingHtml.includes('data-action="toggle-camera-torch"'));
    assert.ok(streamingHtml.includes('aria-pressed="true"'));
    assert.ok(streamingHtml.includes('Light On'));

    // Toggle flashlight OFF and stop camera
    const offRes = await scanner.toggleTorch();
    assert.deepEqual(offRes, { ok: true, torchOn: false });
    scanner.stopCamera();
    assert.equal(trackStopped, true);
    assert.equal(scanner.getState().torchOn, false);
  });

  it('4. Widens the Library filter drawer to nearly full mobile width (w-[94vw]) and makes the active bottom nav tab unmistakably clear', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const drawerHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'active-reader',
        isFilterDrawerOpen: true,
        searchQuery: '',
        inspectedBookId: null,
      },
    });
    assert.ok(
      drawerHtml.includes('w-[94vw]'),
      'Expected Library filter drawer to span nearly the full mobile viewport width (94vw)'
    );

    const pwaStatus = {
      isInstallable: false,
      isInstalled: false,
      isIOS: false,
      isOnline: true,
      swReady: true,
      showIosInstructions: false,
    };

    // Active standard tab (`library`) renders top active bar + filled icon capsule + bold label
    const libraryShellHtml = renderAppShell({
      activeRoute: 'library',
      state,
      toast: null,
      pwaStatus,
      contentHtml: '<section>Library</section>',
    });
    const navMatch = libraryShellHtml.match(
      /<nav[^>]*aria-label="Mobile bottom navigation"[\s\S]*?<\/nav>/
    );
    assert.ok(navMatch, 'Expected mobile bottom navigation');
    const navHtml = navMatch[0];

    const indicators = navHtml.match(/data-nav-active-indicator="true"/g) || [];
    assert.equal(indicators.length, 1, 'Exactly 1 bottom tab must show the top active indicator bar');
    assert.match(
      navHtml,
      /href="#\/library"[\s\S]*?aria-current="page"[\s\S]*?data-nav-active-indicator="true"[\s\S]*?bg-forest-900 text-ivory[\s\S]*?font-bold/
    );

    // Active center `scan` tab also shows top active indicator + active scan orb styling
    const scanShellHtml = renderAppShell({
      activeRoute: 'scan',
      state,
      toast: null,
      pwaStatus,
      contentHtml: '<section>Scan</section>',
    });
    const scanNav = (
      scanShellHtml.match(/<nav[^>]*aria-label="Mobile bottom navigation"[\s\S]*?<\/nav>/) || ['']
    )[0];
    assert.match(
      scanNav,
      /href="#\/scan"[\s\S]*?aria-current="page"[\s\S]*?data-nav-active-indicator="true"[\s\S]*?data-nav-scan-orb="true"/
    );
  });
});
