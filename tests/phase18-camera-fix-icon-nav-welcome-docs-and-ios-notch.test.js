/**
 * @fileoverview Phase 18 regression & feature tests:
 * 1. Camera scanning fix: synchronous user-gesture `getUserMedia` call, `<template>`-parsed `<video>`
 *    IDL property hydration (`muted`, `defaultMuted`, `playsInline`, `autoplay`), paused stream retry,
 *    and unobstructed live camera viewport (`z-0`, `h-60 sm:h-72`).
 * 2. Bottom navigation active icon coloring without filled pill backgrounds (`stroke-width="2.35"` active
 *    vs `"1.8"` inactive, `text-forest-700 dark:text-[#5ED3DA]`, zero `bg-forest-900` pill fill on icon slots).
 * 3. Startup Google Books Welcome / Setup Modal when unconfigured (with direct Google Cloud Console link,
 *    Open Library explanation, dismissal persistence, and zero raw API-key inputs).
 * 4. HTML User & Developer Documentation suite (`/public/docs/*.html`), PWA Workbox `navigateFallbackDenylist`,
 *    and bottom "About Book Rotation" section in Settings with version + doc links.
 * 5. iOS PWA notch / status-bar edge-to-edge coverage (`viewport-fit=cover`, `black-translucent`,
 *    fixed `top-0` header with `pt-safe` + matching `data-header-spacer="true"`).
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createScannerController } from '../src/features/scan/scanner-controller.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import {
  GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL,
  WELCOME_BOOKS_MODAL_DISMISSED_KEY,
  isWelcomeBooksModalDismissed,
  renderWelcomeBooksSetupModal,
  setWelcomeBooksModalDismissed,
  shouldAutoShowWelcomeBooksModal,
} from '../src/ui/components/welcome-setup-modal.js';
import { patchRootHtml } from '../src/ui/dom-patch.js';
import { APP_DOCS_LINKS, APP_VERSION } from '../src/version.js';

function createMemoryStorage() {
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
  };
}

describe('Phase 18 — Camera Fix, Colored Nav Icons, Startup Welcome Modal, HTML Docs & iOS Notch Header', () => {
  const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocumentDesc = Object.getOwnPropertyDescriptor(globalThis, 'document');

  afterEach(() => {
    if (originalNavigatorDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDesc);
    }
    if (originalDocumentDesc) {
      Object.defineProperty(globalThis, 'document', originalDocumentDesc);
    } else {
      delete /** @type {any} */ (globalThis).document;
    }
  });

  it('1. Invokes getUserMedia synchronously within user gesture, hydrates <video> muted/playsInline properties, and retries play()', async () => {
    let getUserMediaCalledSynchronously = false;
    let microtaskTicked = false;

    const fakeStream = /** @type {any} */ ({
      getVideoTracks: () => [{ getCapabilities: () => ({}), stop() {} }],
      getTracks: () => [{ stop() {} }],
    });

    let playCalls = 0;
    const fakeVideoEl = /** @type {any} */ ({
      tagName: 'VIDEO',
      muted: false,
      defaultMuted: false,
      playsInline: false,
      autoplay: false,
      paused: true,
      srcObject: null,
      attrs: /** @type {Record<string, string>} */ ({}),
      /**
       * @param {string} k
       * @param {string} v
       */
      setAttribute(k, v) {
        this.attrs[k] = v;
      },
      play() {
        playCalls += 1;
        // Require muted === true & playsInline === true just like iOS Safari / WebKit autoplay policy!
        if (!this.muted || !this.playsInline) {
          return Promise.reject(new Error('NotAllowedError: unmuted autoplay blocked'));
        }
        this.paused = false;
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
      },
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            getUserMediaCalledSynchronously = !microtaskTicked;
            return fakeStream;
          },
        },
      },
    });

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        getElementById: (/** @type {string} */ id) =>
          id === 'scanner-live-video' ? fakeVideoEl : null,
      },
    });

    const scanner = createScannerController();
    const startPromise = scanner.startCamera();
    Promise.resolve().then(() => {
      microtaskTicked = true;
    });
    await startPromise;

    assert.equal(
      getUserMediaCalledSynchronously,
      true,
      'getUserMedia must be invoked synchronously before any microtask yield so iOS Safari preserves user gesture'
    );
    assert.equal(scanner.getState().phase, 'streaming');
    assert.equal(fakeVideoEl.muted, true, 'attachVideoElement must set videoEl.muted = true');
    assert.equal(fakeVideoEl.defaultMuted, true, 'attachVideoElement must set videoEl.defaultMuted = true');
    assert.equal(fakeVideoEl.playsInline, true, 'attachVideoElement must set videoEl.playsInline = true');
    assert.equal(fakeVideoEl.srcObject, fakeStream, 'Active MediaStream must be bound to #scanner-live-video');
    assert.equal(fakeVideoEl.paused, false, 'Video playback must succeed under strict muted autoplay rules');
    assert.ok(playCalls >= 1);

    // Simulate browser pausing the video element (e.g. orientation/tab glitch) -> re-attaching resumes play()
    fakeVideoEl.paused = true;
    scanner.attachVideoElement(fakeVideoEl);
    assert.equal(fakeVideoEl.paused, false, 'attachVideoElement must resume playback if videoEl became paused');

    // Verify Scan streaming UI renders z-0 video inside proven h-60 sm:h-72 viewport with unobstructed center frame
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const streamingHtml = renderScanShellView({
      state: store.getState(),
      uiState: {
        intakeTab: 'scanner',
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
          format: 'hardcover',
          readingStage: 'picture-book',
          ageMin: 2,
          ageMax: 6,
          tags: '',
        },
        scanMode: 'barcode',
        formError: '',
      },
      scannerState: scanner.getState(),
    });
    assert.match(
      streamingHtml,
      /<video[\s\S]*?id="scanner-live-video"[\s\S]*?webkit-playsinline[\s\S]*?z-0 w-full h-full object-cover/
    );
    assert.ok(streamingHtml.includes('h-60 sm:h-72'));

    // Also verify dom-patch hydrates muted/playsInline IDL properties when adopting <video> from <template>
    const insertedVideo = /** @type {any} */ ({
      nodeType: 1,
      tagName: 'VIDEO',
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      muted: false,
      defaultMuted: false,
      playsInline: false,
      autoplay: false,
      attributes: [
        { name: 'id', value: 'scanner-live-video' },
        { name: 'muted', value: '' },
        { name: 'playsinline', value: '' },
        { name: 'autoplay', value: '' },
      ],
      hasAttribute(/** @type {string} */ k) {
        return this.attributes.some((/** @type {any} */ a) => a.name === k);
      },
      getAttribute(/** @type {string} */ k) {
        const hit = this.attributes.find((/** @type {any} */ a) => a.name === k);
        return hit ? hit.value : null;
      },
      querySelectorAll: () => [],
      childNodes: [],
    });

    let adoptCalled = false;
    const fakeOwnerDoc = {
      adoptNode(/** @type {any} */ n) {
        adoptCalled = true;
        n.ownerDocument = fakeOwnerDoc;
        return n;
      },
      createElement(/** @type {string} */ tag) {
        if (tag === 'template') {
          return {
            set innerHTML(/** @type {string} */ _v) {},
            content: {
              childNodes: [insertedVideo],
            },
          };
        }
        return {};
      },
    };
    insertedVideo.ownerDocument = {}; // Simulate inert template document

    const fakeRoot = /** @type {any} */ ({
      nodeType: 1,
      ownerDocument: fakeOwnerDoc,
      childNodes: [],
      insertBefore(/** @type {any} */ node) {
        this.childNodes.push(node);
      },
      removeChild() {},
    });

    patchRootHtml(fakeRoot, '<video id="scanner-live-video" muted playsinline autoplay></video>');
    assert.equal(adoptCalled, true, 'dom-patch must adopt nodes out of inert template ownerDocument');
    assert.equal(insertedVideo.muted, true, 'dom-patch must initialize video.muted = true');
    assert.equal(insertedVideo.playsInline, true, 'dom-patch must initialize video.playsInline = true');
    assert.equal(insertedVideo.autoplay, true, 'dom-patch must initialize video.autoplay = true');

    scanner.stopCamera();
  });

  it('2. Styles bottom navigation active tab via crisp icon color & stroke weight instead of filled pill capsules', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const shellHtml = renderAppShell({
      activeRoute: 'rotations',
      state: store.getState(),
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: '<div>Rotations</div>',
    });

    const navHtml = (
      shellHtml.match(/<nav[^>]*aria-label="Mobile bottom navigation"[\s\S]*?<\/nav>/) || ['']
    )[0];
    assert.ok(navHtml, 'Expected mobile bottom navigation');

    // Must NOT put heavy bg-forest-900 pill fill on standard icon slots
    assert.doesNotMatch(
      navHtml,
      /data-nav-icon-slot="true"[^>]*bg-forest-900/,
      'Standard bottom bar icon slots must not use filled pill backgrounds'
    );

    // Active tab (`rotations`) has colored icon slot, bolder stroke-width="2.35", and bold colored label
    assert.match(
      navHtml,
      /href="#\/rotations"[\s\S]*?aria-current="page"[\s\S]*?data-nav-icon-slot="true"[^>]*text-forest-700 dark:text-\[#5ED3DA\][\s\S]*?stroke-width="2\.35"[\s\S]*?font-bold text-forest-700 dark:text-\[#5ED3DA\]/
    );

    // Inactive tabs use lighter stroke-width="1.8"
    const inactiveStrokes = navHtml.match(/stroke-width="1\.8"/g) || [];
    assert.equal(inactiveStrokes.length, 4, 'All 4 inactive bottom tabs should use lighter 1.8 stroke');
  });

  it('3. Auto-triggers the Google Books startup welcome modal when unconfigured (with Cloud Console link & zero raw key inputs)', async () => {
    const mem = createMemoryStorage();

    // Unknown status -> wait until probe finishes
    assert.equal(
      shouldAutoShowWelcomeBooksModal({
        googleBooksKeyStatus: 'unknown',
        deviceBooksProxyUrl: '',
        storage: mem,
      }),
      false
    );

    // Configured server key -> do not nag
    assert.equal(
      shouldAutoShowWelcomeBooksModal({
        googleBooksKeyStatus: 'configured',
        deviceBooksProxyUrl: '',
        storage: mem,
      }),
      false
    );

    // Configured personal device proxy -> do not nag
    assert.equal(
      shouldAutoShowWelcomeBooksModal({
        googleBooksKeyStatus: 'static-host',
        deviceBooksProxyUrl: 'https://my-books.workers.dev/volumes',
        storage: mem,
      }),
      false
    );

    // Unconfigured shared-quota or static-host -> auto-show welcome prompt!
    assert.equal(
      shouldAutoShowWelcomeBooksModal({
        googleBooksKeyStatus: 'static-host',
        deviceBooksProxyUrl: '',
        storage: mem,
      }),
      true
    );
    assert.equal(
      shouldAutoShowWelcomeBooksModal({
        googleBooksKeyStatus: 'shared-quota',
        deviceBooksProxyUrl: '',
        storage: mem,
      }),
      true
    );

    const modalHtml = renderWelcomeBooksSetupModal({
      isOpen: true,
      googleBooksKeyStatus: 'static-host',
    });
    assert.ok(modalHtml.includes('data-google-welcome-modal="true"'));
    assert.ok(modalHtml.includes(GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL));
    assert.ok(modalHtml.includes('Google Cloud Console'));
    assert.ok(modalHtml.includes('Open Library'));
    assert.ok(modalHtml.includes('data-action="open-settings-from-welcome"'));
    assert.ok(modalHtml.includes('data-action="dismiss-welcome-books-modal"'));
    assert.equal(/<input/i.test(modalHtml), false, 'Welcome modal must never contain raw API-key <input> elements');

    // Dismissing persists to storage and suppresses repeat auto-popups
    setWelcomeBooksModalDismissed(true, mem);
    assert.equal(isWelcomeBooksModalDismissed(mem), true);
    assert.equal(mem.getItem(WELCOME_BOOKS_MODAL_DISMISSED_KEY), '1');
    assert.equal(
      shouldAutoShowWelcomeBooksModal({
        googleBooksKeyStatus: 'static-host',
        deviceBooksProxyUrl: '',
        storage: mem,
      }),
      false
    );
  });

  it('4. Ships complete HTML User & Developer docs in /public/docs/ and renders About Book Rotation in Settings', async () => {
    const rootDir = process.cwd();
    const docFiles = [
      'index.html',
      'configuration.html',
      'tagging-and-ai.html',
      'architecture-and-providers.html',
      'docs.css',
    ];

    for (const file of docFiles) {
      const fullPath = path.join(rootDir, 'public', 'docs', file);
      const text = await fs.readFile(fullPath, 'utf8');
      assert.ok(text.length > 400, `Expected non-empty documentation asset public/docs/${file}`);
    }

    const taggingDoc = await fs.readFile(
      path.join(rootDir, 'public', 'docs', 'tagging-and-ai.html'),
      'utf8'
    );
    assert.ok(taggingDoc.includes('src/features/tagging/rule-tagger.js'));
    assert.ok(taggingDoc.includes('TAXONOMY_RULES'));
    assert.ok(taggingDoc.includes('AiTagEnrichmentAdapter'));

    const archDoc = await fs.readFile(
      path.join(rootDir, 'public', 'docs', 'architecture-and-providers.html'),
      'utf8'
    );
    assert.ok(archDoc.includes('MetadataProvider'));
    assert.ok(archDoc.includes('lookupByIsbn'));
    assert.ok(archDoc.includes('searchBooks'));

    const viteConfig = await fs.readFile(path.join(rootDir, 'vite.config.ts'), 'utf8');
    assert.match(
      viteConfig,
      /navigateFallbackDenylist:[\s\S]*?\\\/docs\\\//,
      'VitePWA workbox must exclude /docs/* from SPA navigateFallback'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const settingsHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'indexeddb',
      pwaStatus: {
        isInstallable: false,
        isInstalled: true,
        isIOS: true,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
    });

    assert.ok(settingsHtml.includes('data-about-app-section="true"'));
    assert.ok(settingsHtml.includes('About Book Rotation'));
    assert.ok(settingsHtml.includes(APP_VERSION));
    assert.ok(settingsHtml.includes(APP_DOCS_LINKS.overview));
    assert.ok(settingsHtml.includes(APP_DOCS_LINKS.configuration));
    assert.ok(settingsHtml.includes(APP_DOCS_LINKS.taggingAndAi));
    assert.ok(settingsHtml.includes(APP_DOCS_LINKS.architectureAndProviders));
  });

  it('5. Configures iOS PWA edge-to-edge notch header (viewport-fit=cover, black-translucent, fixed top-0 pt-safe header + spacer)', async () => {
    const rootDir = process.cwd();
    const indexHtml = await fs.readFile(path.join(rootDir, 'index.html'), 'utf8');
    const indexCss = await fs.readFile(path.join(rootDir, 'src', 'index.css'), 'utf8');

    assert.match(indexHtml, /viewport-fit=cover/, 'index.html viewport must include viewport-fit=cover');
    assert.match(
      indexHtml,
      /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"\s*\/>/,
      'iOS standalone status bar must use black-translucent so webview extends behind clock & battery with zero white gap'
    );
    assert.match(
      indexCss,
      /\.pt-safe\s*\{\s*padding-top:\s*env\(safe-area-inset-top,\s*0px\);/,
      'index.css must define .pt-safe using env(safe-area-inset-top, 0px)'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const shellHtml = renderAppShell({
      activeRoute: 'home',
      state: store.getState(),
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: true,
        isIOS: true,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: '<div>Home</div>',
    });

    assert.match(
      shellHtml,
      /<header[^>]*data-top-header="true"[^>]*fixed top-0 left-0 right-0[^>]*pt-safe/,
      'Top header must be fixed at top:0 with pt-safe so its background extends under the iOS notch while inner content sits below it'
    );
    assert.match(
      shellHtml,
      /data-header-spacer="true"[^>]*pt-safe/,
      'AppShell must render a matching pt-safe spacer so page content starts cleanly below the fixed header'
    );
  });
});
