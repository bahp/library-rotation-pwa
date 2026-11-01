/**
 * @fileoverview Phase 15 maintainer tests covering:
 * 1) Mobile bottom navigation baseline alignment + elevated circular Scan orb & uniform 22px sibling icons
 * 2) Zero book cover image flashing on book click & close (synchronous cover decode + non-destructive DOM reconciliation)
 * 3) iPhone 11 PWA top status-bar coverage (synced #FFFDF9/#152226 theme-color + html surface + fixed safe-top curtain) & animated launch splash
 * 4) Current rotation Set/Swap schedule display + deterministic on-open "Library Swap Day" reminder & cycle dismissal
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { applyThemeToDom, createAppStore } from '../src/core/store.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderBookCover } from '../src/ui/components/book-cover.js';
import { reconcileDomChildren } from '../src/ui/dom-patch.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { computeRotationSchedule } from '../src/features/rotations/rotation-schedule.js';

/**
 * Minimal lightweight DOM Node/Element implementation for testing `reconcileDomChildren` in Node
 * without external browser dependencies, tracking exact object identity and `setAttribute` calls.
 */
class MiniElement {
  /**
   * @param {string} tagName
   * @param {Record<string, string>} [attrs]
   * @param {Array<MiniElement | MiniText>} [children]
   */
  constructor(tagName, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.namespaceURI = 'http://www.w3.org/1999/xhtml';
    /** @type {Map<string, string>} */
    this._attrs = new Map(Object.entries(attrs));
    /** @type {Array<MiniElement | MiniText>} */
    this.childNodes = [];
    /** @type {MiniElement | null} */
    this.parentNode = null;
    this.srcWriteCount = 0;
    this.checked = attrs.checked !== undefined;
    this.disabled = attrs.disabled !== undefined;
    this.selected = attrs.selected !== undefined;
    this.value = attrs.value || '';
    this.type = attrs.type || 'text';

    this.classList = {
      /** @param {string} token */
      contains: (token) =>
        (this._attrs.get('class') || '')
          .split(/\s+/)
          .filter(Boolean)
          .includes(token),
    };

    for (const c of children) {
      this.appendChild(c);
    }
  }

  get attributes() {
    return Array.from(this._attrs.entries()).map(([name, value]) => ({ name, value }));
  }

  /** @returns {MiniElement | MiniText | null} */
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
    if (name === 'src') {
      this.srcWriteCount += 1;
    }
    this._attrs.set(name, String(value));
  }

  /** @param {string} name */
  removeAttribute(name) {
    this._attrs.delete(name);
  }

  /** @param {MiniElement | MiniText} node */
  appendChild(node) {
    return this.insertBefore(node, null);
  }

  /**
   * @param {MiniElement | MiniText} node
   * @param {MiniElement | MiniText | null} refNode
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

  /** @param {MiniElement | MiniText} node */
  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }
}

class MiniText {
  /** @param {string} text */
  constructor(text) {
    this.nodeType = 3;
    this.nodeValue = text;
    /** @type {MiniElement | null} */
    this.parentNode = null;
  }
}

describe('Phase 15: Bottom Nav Alignment, Zero Cover Flash, iPhone 11 PWA Status Bar & Launch Splash, and Library Swap Day Planner', () => {
  it('1. Aligns all 5 mobile bottom navigation labels on a shared bottom baseline with an elevated circular Scan button', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const shellHtml = renderAppShell({
      activeRoute: 'home',
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
      contentHtml: '<div>Content</div>',
    });

    const navMatch = shellHtml.match(
      /<nav[^>]*aria-label="Mobile bottom navigation"[^>]*>([\s\S]*?)<\/nav>/
    );
    assert.ok(navMatch, 'Expected mobile bottom navigation landmark');
    const navInner = navMatch[1];

    // Grid aligns items to bottom (`items-end`) and all 5 links end-align (`justify-end`) with identical `pb-1.5`
    assert.match(navInner, /\bgrid-cols-5\s+items-end\b/, 'Bottom nav grid should align items to bottom edge');
    const labelSpans = navInner.match(/data-nav-label="true"/g) || [];
    assert.equal(labelSpans.length, 5, 'All 5 mobile tabs must render baseline-aligned label spans');

    const bottomAlignedLinks = navInner.match(/justify-end\s+h-full\s+min-h-\[48px\]\s+min-w-\[48px\][^\n"]*pb-1\.5/g) || [];
    assert.equal(
      bottomAlignedLinks.length,
      5,
      'Every mobile tab link (including Scan) must use identical bottom padding & end alignment so labels align'
    );

    // Center Scan action renders inside an elevated circular floating orb, while the other 4 tabs use 22px icon slots
    assert.match(
      navInner,
      /data-nav-scan-orb="true"[^>]*-mt-6[^>]*w-12\s+h-12\s+rounded-full/,
      'Scan action should sit inside an elevated circular orb rising above the bar line'
    );
    const siblingIconSlots = navInner.match(/data-nav-icon-slot="true"/g) || [];
    assert.equal(siblingIconSlots.length, 4, 'Other 4 tabs should use uniform icon slots');
    const sizedIcons = navInner.match(/w-\[22px\]\s+h-\[22px\]/g) || [];
    assert.equal(sizedIcons.length, 5, 'All 5 bottom nav icons should use balanced 22px sizing');
  });

  it('2. Eliminates book cover flashing when opening & closing a book card via sync decoding and in-place DOM reconciliation', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const sampleBook = {
      ...store.getState().books[0],
      coverUrl: 'https://covers.openlibrary.org/b/id/8228691-M.jpg',
    };

    const coverHtml = renderBookCover(sampleBook, 'grid', 'square');
    assert.doesNotMatch(
      coverHtml,
      /loading="lazy"/,
      'Book cover thumbnails must not use lazy-loading that flashes fallback cloth on re-render'
    );
    assert.doesNotMatch(
      coverHtml,
      /decoding="async"/,
      'Book cover thumbnails must not defer bitmap paint via decoding="async"'
    );
    assert.match(coverHtml, /decoding="sync"/, 'Book cover thumbnails should decode synchronously from cache');

    // Simulate live DOM tree: shelf grid with 2 book cover <img> elements, then opening Book Inspector, then closing it
    /** @param {boolean} withModalOpen */
    const buildTree = (withModalOpen) => {
      const img1 = new MiniElement('img', {
        src: 'https://covers.openlibrary.org/b/id/111-M.jpg',
        alt: 'Cover 1',
        class: 'w-full h-full object-cover',
      });
      const img2 = new MiniElement('img', {
        src: 'https://covers.openlibrary.org/b/id/222-M.jpg',
        alt: 'Cover 2',
        class: 'w-full h-full object-cover',
      });
      const card1 = new MiniElement('article', { 'data-book-card': 'b1', class: 'card' }, [img1]);
      const card2 = new MiniElement('article', { 'data-book-card': 'b2', class: 'card' }, [img2]);
      const grid = new MiniElement('div', { class: 'grid' }, [card1, card2]);

      const mainChildren = [grid];
      if (withModalOpen) {
        mainChildren.push(
          new MiniElement(
            'div',
            {
              'data-backdrop-action': 'close-inspect-book',
              class: 'sheet-backdrop',
              role: 'dialog',
            },
            [new MiniText('Book Inspector')]
          )
        );
      }

      const shell = new MiniElement('div', { 'data-app-shell': 'true' }, [
        new MiniElement('main', { id: 'main-content' }, mainChildren),
      ]);
      return new MiniElement('div', { id: 'app' }, [shell]);
    };

    const liveRoot = buildTree(false);
    const initialMain = /** @type {MiniElement} */ (
      /** @type {MiniElement} */ (liveRoot.childNodes[0]).childNodes[0]
    );
    const initialGrid = /** @type {MiniElement} */ (initialMain.childNodes[0]);
    const liveCard1 = /** @type {MiniElement} */ (initialGrid.childNodes[0]);
    const liveCard2 = /** @type {MiniElement} */ (initialGrid.childNodes[1]);
    const liveImg1 = /** @type {MiniElement} */ (liveCard1.childNodes[0]);
    const liveImg2 = /** @type {MiniElement} */ (liveCard2.childNodes[0]);

    // Simulate runtime `onerror="this.style.display='none'"` on img2 before opening modal
    liveImg2.setAttribute('style', 'display: none;');
    assert.equal(liveImg1.srcWriteCount, 0);

    // Step A: User clicks a book -> modal opens
    const openModalSpec = buildTree(true);
    reconcileDomChildren(
      /** @type {any} */ (liveRoot),
      /** @type {any} */ (openModalSpec)
    );

    const mainAfterOpen = /** @type {MiniElement} */ (
      /** @type {MiniElement} */ (liveRoot.childNodes[0]).childNodes[0]
    );
    assert.equal(mainAfterOpen.childNodes.length, 2, 'Modal dialog appended to main');
    const gridAfterOpen = /** @type {MiniElement} */ (mainAfterOpen.childNodes[0]);
    assert.equal(
      /** @type {MiniElement} */ (gridAfterOpen.childNodes[0]).childNodes[0],
      liveImg1,
      'Cover <img> 1 must remain the exact same mounted DOM node when book modal opens'
    );
    assert.equal(
      /** @type {MiniElement} */ (gridAfterOpen.childNodes[1]).childNodes[0],
      liveImg2,
      'Cover <img> 2 must remain the exact same mounted DOM node when book modal opens'
    );
    assert.equal(liveImg1.srcWriteCount, 0, 'Unchanged img[src] must never be re-assigned');
    assert.equal(
      liveImg2.getAttribute('style'),
      'display: none;',
      'Runtime onerror display:none style on broken cover must stay intact'
    );

    // Step B: User goes back / closes book modal -> modal unmounts without flashing any covers
    const closedModalSpec = buildTree(false);
    reconcileDomChildren(
      /** @type {any} */ (liveRoot),
      /** @type {any} */ (closedModalSpec)
    );

    const mainAfterClose = /** @type {MiniElement} */ (
      /** @type {MiniElement} */ (liveRoot.childNodes[0]).childNodes[0]
    );
    assert.equal(mainAfterClose.childNodes.length, 1, 'Modal dialog cleanly removed on close');
    const gridAfterClose = /** @type {MiniElement} */ (mainAfterClose.childNodes[0]);
    assert.equal(
      /** @type {MiniElement} */ (gridAfterClose.childNodes[0]).childNodes[0],
      liveImg1,
      'Cover <img> 1 must remain the exact same mounted DOM node after modal closes'
    );
    assert.equal(
      /** @type {MiniElement} */ (gridAfterClose.childNodes[1]).childNodes[0],
      liveImg2,
      'Cover <img> 2 must remain the exact same mounted DOM node after modal closes'
    );
    assert.equal(liveImg1.srcWriteCount, 0, 'Unchanged img[src] must still have 0 re-assignments after close');
  });

  it('3. Covers the top iPhone 11 status-bar notch area seamlessly and shows an animated launch splash instead of a black screen', async () => {
    const rootDir = process.cwd();
    const indexHtml = await fs.readFile(path.join(rootDir, 'index.html'), 'utf8');
    const indexCss = await fs.readFile(path.join(rootDir, 'src', 'index.css'), 'utf8');
    const viteConfig = await fs.readFile(path.join(rootDir, 'vite.config.ts'), 'utf8');

    // 1. Authoritative theme-color matches top bar (#FFFDF9 light / #152226 dark) in HTML, Manifest, and runtime theme switcher
    assert.match(
      indexHtml,
      /<meta[^>]+id="lr-theme-color"[^>]+name="theme-color"[^>]+content="#FFFDF9"/i,
      'index.html should declare #lr-theme-color aligned with the ivory top bar (#FFFDF9)'
    );
    assert.match(
      indexHtml,
      /setAttribute\(['"]content['"],\s*isDark\s*\?\s*['"]#152226['"]\s*:\s*['"]#FFFDF9['"]\)/,
      'Inline head script should sync theme-color to #152226 (dark) or #FFFDF9 (light) before first paint'
    );
    assert.match(
      viteConfig,
      /theme_color:\s*['"]#FFFDF9['"]/,
      'PWA manifest theme_color should match the top navigation bar (#FFFDF9)'
    );
    assert.match(
      indexCss,
      /html\s*\{[\s\S]*?background-color:\s*var\(--color-ivory\)/,
      'html root background should match top bar surface in light mode'
    );
    assert.match(
      indexCss,
      /html\.dark\s*\{[\s\S]*?background-color:\s*var\(--color-night-900\)/,
      'html.dark root background should match top bar surface in dark mode'
    );

    // 2. Shell includes fixed safe-area top curtain + pt-safe sticky header
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
      contentHtml: '<div>Body</div>',
    });
    assert.ok(
      shellHtml.includes('data-safe-top-cover="true"'),
      'AppShell should render a fixed top safe-area curtain covering clock/battery during overscroll'
    );

    // 3. Animated Book Rotation splash is present right inside #app in index.html + iOS startup image synthesis
    assert.ok(
      indexHtml.includes('data-app-splash="true"'),
      'index.html #app should contain an immediate animated launch splash so cold PWA startup is never blank/black'
    );
    assert.match(indexHtml, /@keyframes\s+lr-splash-bounce/, 'Splash should gently bounce the emblem');
    assert.match(indexHtml, /@keyframes\s+lr-splash-spin/, 'Splash should smoothly rotate the arrows');
    assert.match(
      indexHtml,
      /apple-touch-startup-image/,
      'Startup script should synthesize an apple-touch-startup-image on iOS so WebClip launch never flashes black'
    );

    // Verify applyThemeToDom updates both localStorage and #lr-theme-color in DOM environments
    let updatedMetaContent = '';
    let storedTheme = '';
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    try {
      globalThis.document = /** @type {any} */ ({
        documentElement: {
          classList: { toggle() {} },
        },
        /** @param {string} id */
        getElementById(id) {
          if (id === 'lr-theme-color') {
            return {
              /**
               * @param {string} _k
               * @param {string} val
               */
              setAttribute(_k, val) {
                updatedMetaContent = val;
              },
            };
          }
          return null;
        },
        querySelector() {
          return null;
        },
      });
      globalThis.window = /** @type {any} */ ({
        localStorage: {
          /**
           * @param {string} _k
           * @param {string} val
           */
          setItem(_k, val) {
            storedTheme = val;
          },
        },
        matchMedia: () => ({ matches: false }),
      });

      applyThemeToDom('dark');
      assert.equal(storedTheme, 'dark');
      assert.equal(updatedMetaContent, '#152226');

      applyThemeToDom('light');
      assert.equal(storedTheme, 'light');
      assert.equal(updatedMetaContent, '#FFFDF9');
    } finally {
      globalThis.document = prevDoc;
      globalThis.window = prevWin;
    }
  });

  it('4. Displays current rotation Set/Swap dates and triggers a dismissible Library Swap Day alert on open when due', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Generate a shelf with an explicit 10-day swap cycle
    const createdRot = await store.generateRotation({
      title: 'Maya Autumn Woods',
      objective: 'nature + bedtime',
      count: 3,
      swapDays: 10,
      cooldownDays: 14,
      seed: 'phase15-swap-seed',
    });

    assert.ok(createdRot.activatedAt, 'Newly generated active rotation stamps activatedAt');
    assert.equal(createdRot.rules.swapDays, 10, 'Explicit swapDays saved on rotation rules');

    const activeProfile = store
      .getState()
      .profiles.find((p) => p.id === store.getState().activeProfileId);
    assert.ok(activeProfile);

    // Fix activatedAt to a known UTC timestamp: Oct 1, 2026 -> Due Oct 11, 2026 (10-day cycle)
    const testRot = {
      ...createdRot,
      createdAt: '2026-10-01T12:00:00.000Z',
      activatedAt: '2026-10-01T12:00:00.000Z',
    };
    const customState = {
      ...store.getState(),
      rotations: store
        .getState()
        .rotations.map((r) => (r.id === createdRot.id ? testRot : r)),
    };

    // Case A: 4 days after setting (Oct 5, 2026) -> NOT due yet, shows "Set Oct 1 · Swap Oct 11 · in 6 days", NO alert banner
    const oct5 = '2026-10-05T12:00:00.000Z';
    const earlySchedule = computeRotationSchedule(testRot, activeProfile, oct5);
    assert.equal(earlySchedule.isDue, false);
    assert.equal(earlySchedule.daysRemaining, 6);
    assert.equal(earlySchedule.activeScheduleLine, 'Set Oct 1 · Swap Oct 11 · in 6 days');

    const earlyHomeHtml = renderHomeView({
      state: customState,
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
      referenceDate: oct5,
    });
    assert.ok(
      earlyHomeHtml.includes('Set Oct 1 · Swap Oct 11 · in 6 days'),
      'Home view displays when the current rotation was set and when it needs to be swapped'
    );
    assert.equal(
      earlyHomeHtml.includes('data-swap-day-alert="true"'),
      false,
      'Swap Day reminder banner must remain hidden before Swap Day'
    );

    // Case B: App opened on Oct 13, 2026 (2 days past Swap Day) -> shows overdue schedule + Library Swap Day reminder banner!
    const oct13 = '2026-10-13T15:00:00.000Z';
    const overdueSchedule = computeRotationSchedule(testRot, activeProfile, oct13);
    assert.equal(overdueSchedule.isDue, true);
    assert.equal(overdueSchedule.daysOverdue, 2);
    assert.equal(overdueSchedule.activeScheduleLine, 'Set Oct 1 · Swap Oct 11 · 2d overdue');

    const dueHomeHtml = renderHomeView({
      state: customState,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
        dismissedSwapReminderKeys: [],
      },
      referenceDate: oct13,
    });
    assert.ok(
      dueHomeHtml.includes('data-swap-day-alert="true"'),
      'Opening Home on or after Swap Day displays the Library Swap Day reminder banner'
    );
    assert.ok(
      dueHomeHtml.includes('data-action="start-swap-day-rotation"'),
      'Swap Day banner provides a 1-tap Rotate Shelf action'
    );
    assert.ok(
      dueHomeHtml.includes('Set Oct 1 · Swap Oct 11 · 2d overdue'),
      'Active shelf header updates to show overdue status'
    );

    const dueRotationsHtml = renderRotationsView({
      state: customState,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: null,
      },
      dismissedSwapReminderKeys: [],
      referenceDate: oct13,
    });
    assert.ok(
      dueRotationsHtml.includes('data-swap-day-alert="true"'),
      'Rotations view also shows the Library Swap Day reminder banner when due'
    );
    assert.ok(
      dueRotationsHtml.includes('data-rotation-schedule="saved"'),
      'Saved rotations display their Created date & cycle length'
    );

    // Case C: Dismissing the reminder hides it for this activation cycle, but re-activating stamps a fresh activatedAt cycle
    const dismissedHomeHtml = renderHomeView({
      state: customState,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
        dismissedSwapReminderKeys: [overdueSchedule.reminderKey],
      },
      referenceDate: oct13,
    });
    assert.equal(
      dismissedHomeHtml.includes('data-swap-day-alert="true"'),
      false,
      'Dismissed Swap Day reminder stays hidden for the current cycle'
    );

    const savedShelf = store
      .getState()
      .rotations.find((r) => r.profileId === activeProfile.id && r.status === 'saved');
    assert.ok(savedShelf);
    await store.setActiveRotation(savedShelf.id);
    const newlyActivated = store.getState().rotations.find((r) => r.id === savedShelf.id);
    assert.ok(newlyActivated?.activatedAt, 'Activating a saved shelf stamps a fresh activatedAt timestamp');
  });
});
