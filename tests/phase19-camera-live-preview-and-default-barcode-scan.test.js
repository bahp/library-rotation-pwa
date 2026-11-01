/**
 * @fileoverview Phase 19 regression tests for:
 * 1. Live camera video rendering inside the scanner box:
 *    - `patchRootHtml` materializes `<video>` via `ownerDocument.createElement('video')` in the active
 *      browsing-context document instead of mounting inert `<template>`-parsed `<video>` elements (both
 *      direct and nested inside the `div` container mounted when switching from `<button>` to streaming `<div>`).
 *    - Subsequent `patchRootHtml` updates preserve the live `<video>` node and its active `srcObject`.
 * 2. `scannerController.startCamera()` emits `streaming` before binding `#scanner-live-video` so DOM
 *    elements mounted during `onStateChange` always receive `srcObject = activeStream` and `.play()`.
 * 3. Streaming scanner viewport avoids `isolate` and oversized `9999px` spread `box-shadow` masks that
 *    trigger WebKit GPU compositing occlusion over `<video>`, while keeping the Scan page style intact.
 * 4. Bottom-nav `Scan` button (`href="#/scan"`, `data-nav-scan="true"`) opens `Camera` + `Barcode / QR`
 *    scanning by default (`resolveScanEntryState`), while preserving explicit `?tab=` / `?mode=` deep links.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createScannerController } from '../src/features/scan/scanner-controller.js';
import {
  renderScanShellView,
  resolveScanEntryState,
} from '../src/features/scan/scan-shell-view.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { patchRootHtml } from '../src/ui/dom-patch.js';

/**
 * Lightweight DOM Element mock supporting `ownerDocument`, `createElement('video')`,
 * `querySelectorAll('video')`, `replaceChild`, and attribute reflection to verify
 * active-document vs inert-template `<video>` instantiation deterministically in Node.
 */
class MockDomElement {
  /**
   * @param {string} tagName
   * @param {any} ownerDoc
   * @param {Record<string, string>} [attrs]
   * @param {MockDomElement[]} [children]
   */
  constructor(tagName, ownerDoc, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = 'http://www.w3.org/1999/xhtml';
    this.ownerDocument = ownerDoc;
    /** @type {Map<string, string>} */
    this._attrs = new Map(Object.entries(attrs));
    /** @type {MockDomElement[]} */
    this.childNodes = [];
    /** @type {MockDomElement | null} */
    this.parentNode = null;
    this.muted = false;
    this.defaultMuted = false;
    this.playsInline = false;
    this.autoplay = false;
    /** @type {any} */
    this.srcObject = null;

    this.classList = {
      /** @param {string} token */
      contains: (token) =>
        (this._attrs.get('class') || '')
          .split(/\s+/)
          .filter(Boolean)
          .includes(token),
    };

    for (const child of children) {
      this.appendChild(child);
    }
  }

  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }

  /** @returns {MockDomElement | null} */
  get lastChild() {
    return this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1] : null;
  }

  /** @param {string} name */
  hasAttribute(name) {
    return this._attrs.has(name);
  }

  /** @param {string} name */
  getAttribute(name) {
    return this._attrs.has(name) ? /** @type {string} */ (this._attrs.get(name)) : null;
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  setAttribute(name, value) {
    this._attrs.set(name, String(value));
  }

  /** @param {string} name */
  removeAttribute(name) {
    this._attrs.delete(name);
  }

  /** @param {MockDomElement} child */
  appendChild(child) {
    return this.insertBefore(child, null);
  }

  /**
   * @param {MockDomElement} node
   * @param {MockDomElement | null} refNode
   */
  insertBefore(node, refNode) {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    if (!refNode) {
      this.childNodes.push(node);
      return node;
    }
    const idx = this.childNodes.indexOf(refNode);
    if (idx === -1) {
      this.childNodes.push(node);
    } else {
      this.childNodes.splice(idx, 0, node);
    }
    return node;
  }

  /**
   * @param {MockDomElement} newChild
   * @param {MockDomElement} oldChild
   */
  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx === -1) return oldChild;
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    oldChild.parentNode = null;
    newChild.parentNode = this;
    this.childNodes[idx] = newChild;
    return oldChild;
  }

  /** @param {MockDomElement} child */
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  /**
   * Minimal tag selector supporting `'video'`.
   * @param {string} selector
   * @returns {MockDomElement[]}
   */
  querySelectorAll(selector) {
    const targetTag = selector.trim().toUpperCase();
    /** @type {MockDomElement[]} */
    const matches = [];
    /** @param {MockDomElement} cur */
    const walk = (cur) => {
      for (const c of cur.childNodes) {
        if (c.tagName === targetTag) {
          matches.push(c);
        }
        walk(c);
      }
    };
    walk(this);
    return matches;
  }
}

describe('Phase 19 — Live Camera Preview Rendering & Default Barcode/QR Scan Entry', () => {
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

  it('1. Replaces inert <template> <video> nodes with genuine live-document createElement("video") elements and preserves active srcObject across updates', () => {
    const inertTemplateDoc = { isInertTemplateDoc: true };
    /** @type {MockDomElement[]} */
    const createdLiveVideos = [];

    /** @type {MockDomElement[]} */
    let nextTemplateNodes = [];

    const liveDoc = {
      isLiveBrowsingContextDoc: true,
      /** @param {MockDomElement} node */
      adoptNode(node) {
        const markOwner = (/** @type {MockDomElement} */ el) => {
          el.ownerDocument = liveDoc;
          for (const ch of el.childNodes) markOwner(ch);
        };
        markOwner(node);
        return node;
      },
      /** @param {string} tag */
      createElement(tag) {
        if (tag === 'template') {
          return {
            set innerHTML(/** @type {string} */ _html) {},
            content: {
              childNodes: nextTemplateNodes,
            },
          };
        }
        const el = new MockDomElement(tag, liveDoc);
        if (tag.toLowerCase() === 'video') {
          /** @type {any} */ (el).createdInLiveBrowsingContext = true;
          createdLiveVideos.push(el);
        }
        return el;
      },
    };

    const rootEl = /** @type {any} */ (new MockDomElement('div', liveDoc, { id: 'app' }));

    // Step A: Initial idle state renders <button data-action="start-camera-scan">
    nextTemplateNodes = [
      new MockDomElement('button', inertTemplateDoc, { 'data-action': 'start-camera-scan' }),
    ];
    patchRootHtml(rootEl, '<button data-action="start-camera-scan"></button>');
    assert.equal(rootEl.childNodes[0].tagName, 'BUTTON');

    // Step B: Camera starts -> <button> transitions to <div> containing inert-template <video id="scanner-live-video">
    const inertVideoFromTemplate = new MockDomElement('video', inertTemplateDoc, {
      id: 'scanner-live-video',
      autoplay: '',
      muted: '',
      playsinline: '',
      'webkit-playsinline': '',
      class: 'block absolute inset-0 z-0 w-full h-full object-cover pointer-events-none',
    });
    /** @type {any} */ (inertVideoFromTemplate).createdInInertTemplate = true;

    const streamingBoxFromTemplate = new MockDomElement(
      'div',
      inertTemplateDoc,
      { class: 'w-full relative h-60 sm:h-72 rounded-2xl bg-night-950' },
      [inertVideoFromTemplate]
    );
    nextTemplateNodes = [streamingBoxFromTemplate];

    patchRootHtml(rootEl, '<div><video id="scanner-live-video"></video></div>');

    const mountedBox = rootEl.childNodes[0];
    assert.equal(mountedBox.tagName, 'DIV');
    const mountedVideo = mountedBox.childNodes[0];
    assert.equal(mountedVideo.tagName, 'VIDEO');
    assert.notEqual(
      mountedVideo,
      inertVideoFromTemplate,
      'Must NOT mount the inert <template>-parsed <video> instance; must replace with liveDoc.createElement("video")'
    );
    assert.equal(/** @type {any} */ (mountedVideo).createdInLiveBrowsingContext, true);
    assert.equal(createdLiveVideos.length, 1);
    assert.equal(mountedVideo.getAttribute('id'), 'scanner-live-video');
    assert.equal(mountedVideo.muted, true);
    assert.equal(mountedVideo.defaultMuted, true);
    assert.equal(mountedVideo.playsInline, true);
    assert.equal(mountedVideo.autoplay, true);

    // Attach active stream and simulate a polling status update re-render
    const fakeMediaStream = { id: 'live-camera-stream-1' };
    mountedVideo.srcObject = fakeMediaStream;

    const nextInertVideoOnTick = new MockDomElement('video', inertTemplateDoc, {
      id: 'scanner-live-video',
      autoplay: '',
      muted: '',
      playsinline: '',
      'webkit-playsinline': '',
      class: 'block absolute inset-0 z-0 w-full h-full object-cover pointer-events-none',
    });
    const nextBoxOnTick = new MockDomElement(
      'div',
      inertTemplateDoc,
      { class: 'w-full relative h-60 sm:h-72 rounded-2xl bg-night-950' },
      [nextInertVideoOnTick]
    );
    nextTemplateNodes = [nextBoxOnTick];

    patchRootHtml(rootEl, '<div><video id="scanner-live-video"></video></div>');

    assert.equal(
      rootEl.childNodes[0].childNodes[0],
      mountedVideo,
      'Existing live <video id="scanner-live-video"> must stay mounted across polling updates'
    );
    assert.equal(
      rootEl.childNodes[0].childNodes[0].srcObject,
      fakeMediaStream,
      'Active camera MediaStream (srcObject) must remain intact across DOM updates'
    );
  });

  it('2. Emits streaming state BEFORE binding #scanner-live-video so a video element mounted on streaming transition always receives srcObject and plays', async () => {
    const fakeStream = /** @type {any} */ ({
      getVideoTracks: () => [{ getCapabilities: () => ({ torch: false }), stop() {} }],
      getTracks: () => [{ stop() {} }],
    });

    /** @type {any} */
    let liveMountedVideo = null;
    let playInvocations = 0;

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => fakeStream,
        },
      },
    });

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        getElementById: (/** @type {string} */ id) =>
          id === 'scanner-live-video' ? liveMountedVideo : null,
      },
    });

    // Simulate render() only mounting `#scanner-live-video` once scanner.getState().phase === 'streaming'
    /** @type {ReturnType<typeof createScannerController>} */
    let scanner;
    scanner = createScannerController({
      onStateChange: () => {
        if (scanner.getState().phase === 'streaming' && !liveMountedVideo) {
          liveMountedVideo = {
            tagName: 'VIDEO',
            muted: false,
            defaultMuted: false,
            playsInline: false,
            autoplay: false,
            paused: true,
            srcObject: null,
            setAttribute() {},
            play() {
              playInvocations += 1;
              this.paused = false;
              return Promise.resolve();
            },
            pause() {
              this.paused = true;
            },
          };
        }
      },
    });

    await scanner.startCamera();

    assert.ok(liveMountedVideo, 'Expected streaming state emission to mount #scanner-live-video');
    assert.equal(
      liveMountedVideo.srcObject,
      fakeStream,
      'startCamera() must emit streaming BEFORE querying #scanner-live-video so newly mounted video gets srcObject'
    );
    assert.equal(liveMountedVideo.paused, false);
    assert.ok(playInvocations >= 1);

    scanner.stopCamera();
  });

  it('3. Removes WebKit-clipping 9999px spread box-shadows and isolate stacking from the streaming scanner viewport while keeping Scan UI intact', async () => {
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
      scannerState: {
        mode: 'barcode',
        phase: 'streaming',
        statusMessage: 'Align a 978/979 ISBN barcode inside the wide guide…',
        errorMessage: '',
        ignoredHint: '',
        facingMode: 'environment',
        torchSupported: true,
        torchOn: false,
        uploadedPreviewUrl: '',
        lock: null,
        support: null,
      },
    });

    assert.equal(
      streamingHtml.includes('9999px'),
      false,
      'Scanner guide must not use a 9999px spread shadow over <video> (causes WebKit GPU texture clipping)'
    );
    assert.doesNotMatch(
      streamingHtml,
      /\bisolate\b[^>]*h-60 sm:h-72/,
      'Scanner viewport container must not use CSS isolation over hardware-composited <video>'
    );
    assert.match(
      streamingHtml,
      /<video[\s\S]*?id="scanner-live-video"[\s\S]*?class="block absolute inset-0 z-0 w-full h-full object-cover pointer-events-none"/
    );
    // Preserves current Scan page controls & tabs
    assert.ok(streamingHtml.includes('Search &amp; ISBN'));
    assert.ok(streamingHtml.includes('Barcode / QR'));
    assert.ok(streamingHtml.includes('data-action="toggle-camera-torch"'));
  });

  it('4. Opens Camera + Barcode / QR scanning by default when tapping the Scan button in the bottom nav bar', async () => {
    // Bare #/scan (no query params) always opens Camera ('scanner') + Barcode / QR ('barcode')
    assert.deepEqual(resolveScanEntryState(new URLSearchParams('')), {
      intakeTab: 'scanner',
      scanMode: 'barcode',
    });
    assert.deepEqual(resolveScanEntryState(null), {
      intakeTab: 'scanner',
      scanMode: 'barcode',
    });

    // Explicit deep links continue to work unchanged
    assert.deepEqual(resolveScanEntryState(new URLSearchParams('tab=search')), {
      intakeTab: 'search',
      scanMode: 'barcode',
    });
    assert.deepEqual(resolveScanEntryState(new URLSearchParams('tab=manual')), {
      intakeTab: 'manual',
      scanMode: 'barcode',
    });
    assert.deepEqual(resolveScanEntryState(new URLSearchParams('mode=cover')), {
      intakeTab: 'scanner',
      scanMode: 'cover',
    });

    // Bottom navigation Scan button carries `href="#/scan"` and `data-nav-scan="true"` so tapping it
    // resets back to Camera + Barcode / QR even if the user was viewing Search & ISBN or Manual on #/scan
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const shellHtml = renderAppShell({
      activeRoute: 'scan',
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
      contentHtml: '<div>Scan</div>',
    });

    const bottomNavHtml = (
      shellHtml.match(/<nav[^>]*aria-label="Mobile bottom navigation"[\s\S]*?<\/nav>/) || ['']
    )[0];
    assert.match(
      bottomNavHtml,
      /<a[^>]*href="#\/scan"[^>]*data-nav-scan="true"/,
      'Bottom nav Scan button must carry data-nav-scan="true" and href="#/scan"'
    );
  });
});
