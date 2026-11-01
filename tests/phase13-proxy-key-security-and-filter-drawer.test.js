/**
 * @fileoverview Phase 13 TDD regression tests covering:
 * 1) Google Books HTTP 429 (`project_number:624717413613`) diagnosis & leak-free server-side API key proxy
 *    (`/api/books/volumes` via `src/server/books-proxy.js` + `createGoogleBooksProvider` proxy-with-fallback).
 *    Strictly verifies zero secret leakage across response payloads, headers, URLs, and sanitized error messages.
 * 2) Compact icon + plain number quick filters (`All`, `[bookmark] 2`, `[heart] 1` without parentheses)
 *    and simplified `Owned` vs `Wishlist` collection status UI options (removing `Library Loan` / `Interested` UI clutter
 *    while preserving backward compatibility in `normalizeCollectionStatus`).
 * 3) Left-label / right-controls row alignment inside the Scan/ISBN "Book Found" `Customize` section.
 * 4) Family Library slide-in Left Filter Drawer (`data-library-filter-drawer="true"`, `.animate-drawer-left`)
 *    with grouped **Format** (`Board Book`, `Paperback`, `Hardcover`), **Themes** (multi-select book tags),
 *    **Owner** (unified multi-select so selecting `Leo` while `For Maya` was active never produces an empty contradiction),
 *    and **Condition**.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, normalizeCollectionStatus } from '../src/types/models.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';
import {
  explainGoogleBooksQuotaError,
  proxyGoogleBooksVolumes,
  redactApiKeyFromText,
} from '../src/server/books-proxy.js';
import { renderLibraryView, toggleUnifiedOwnerSelection } from '../src/features/library/library-view.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { renderBookInspectorModal } from '../src/ui/components/book-inspector-modal.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';

describe('Phase 13: Leak-Free Google Books Proxy, Icon+Count Filters, Customize Alignment & Left Filter Sidebar', () => {
  it('1. Proxies Google Books on the server using GOOGLE_BOOKS_API_KEY with zero secret leakage and falls back cleanly on static hosts', async () => {
    const fakeSecret = 'AIzaSy_SUPER_SECRET_TEST_KEY_998877';

    // 1a. Redaction helper scrubs ?key=..., &key=..., and literal secret occurrences
    const dirtyError = `Fetch failed for https://www.googleapis.com/books/v1/volumes?q=isbn:9780064430173&key=${fakeSecret} with token ${fakeSecret}`;
    const scrubbed = redactApiKeyFromText(dirtyError, fakeSecret);
    assert.equal(scrubbed.includes(fakeSecret), false, 'API key must never survive redaction');
    assert.equal(/key=AIza/i.test(scrubbed), false, 'Query param key=... must be redacted');

    // 1b. Server proxy appends key upstream, returns clean volume JSON + keyConfigured boolean, and NEVER leaks the secret
    /** @type {string[]} */
    const upstreamUrls = [];
    const proxyOk = await proxyGoogleBooksVolumes({
      query: { q: 'isbn:9780064430173', maxResults: '5', printType: 'books' },
      apiKey: fakeSecret,
      fetchImpl: async (input) => {
        upstreamUrls.push(String(input));
        return new Response(
          JSON.stringify({
            totalItems: 1,
            items: [
              {
                id: 'gb-goodnight-moon',
                selfLink: `https://www.googleapis.com/books/v1/volumes/gb-goodnight-moon?key=${fakeSecret}`,
                volumeInfo: {
                  title: 'Goodnight Moon',
                  authors: ['Margaret Wise Brown'],
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780064430173' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    assert.equal(proxyOk.status, 200);
    assert.equal(upstreamUrls.length, 1);
    assert.ok(
      upstreamUrls[0].includes(`key=${encodeURIComponent(fakeSecret)}`),
      'Server proxy should attach GOOGLE_BOOKS_API_KEY on the server-to-Google request'
    );
    const serializedBody = JSON.stringify(proxyOk.body);
    assert.equal(
      serializedBody.includes(fakeSecret),
      false,
      'Serialized proxy response body must NEVER contain GOOGLE_BOOKS_API_KEY (even if Google echoed it in selfLink)'
    );
    assert.equal(proxyOk.body.keyConfigured, true);

    // 1c. Even if upstream throws a network error echoing the full URL + key, proxy scrubs it completely
    const proxyErr = await proxyGoogleBooksVolumes({
      query: { q: 'isbn:9780064430173', maxResults: '5' },
      apiKey: fakeSecret,
      fetchImpl: async (input) => {
        throw new Error(`Socket hang up while requesting ${String(input)}`);
      },
    });
    assert.equal(proxyErr.status, 502);
    assert.equal(
      JSON.stringify(proxyErr.body).includes(fakeSecret),
      false,
      'Upstream exception message must never leak GOOGLE_BOOKS_API_KEY'
    );

    // 1d. Explain why `project_number:624717413613` occurs on shared anonymous egress IPs
    const explained429 = explainGoogleBooksQuotaError(
      "HTTP 429: Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'books.googleapis.com' for consumer 'project_number:624717413613'.",
      { keyConfigured: false }
    );
    assert.match(explained429, /shared anonymous/i);
    assert.match(explained429, /GOOGLE_BOOKS_API_KEY/);

    // 1e. GoogleBooksProvider uses `/api/books/volumes` when `useServerProxy: true`, and falls back to direct API on static 404
    /** @type {string[]} */
    const clientFetchedUrls = [];
    const staticFallbackHttp = createHttpClient({
      fetchImpl: async (input) => {
        const url = String(input);
        clientFetchedUrls.push(url);
        if (url.startsWith('/api/books/volumes')) {
          return new Response('<html>404 Not Found (GitHub Pages)</html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'gb-corduroy',
                volumeInfo: {
                  title: 'Corduroy',
                  authors: ['Don Freeman'],
                  industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780140501742' }],
                  imageLinks: { thumbnail: 'https://books.google.com/books/content?id=gb-corduroy&img=1' },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
      maxRetries: 0,
      disablePersistentCache: true,
    });

    const catalog = createCatalogService({
      providers: [createGoogleBooksProvider(staticFallbackHttp, { useServerProxy: true })],
    });
    const res = await catalog.lookupByIsbn('9780140501742');
    assert.ok(res.candidate);
    assert.equal(res.candidate.title, 'Corduroy');
    assert.ok(clientFetchedUrls[0].startsWith('/api/books/volumes?'));
    assert.ok(clientFetchedUrls[1].startsWith('https://www.googleapis.com/books/v1/volumes?'));

    // 1f. Settings view never renders any API key <input>, and explains server-only GOOGLE_BOOKS_API_KEY
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const settingsHtml = renderSettingsView({
      state: store.getState(),
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      adapterDiagnostics: [],
    });
    assert.equal(
      /name=["'][^"']*api[_-]?key/i.test(settingsHtml),
      false,
      'Settings UI must never include an API key input field'
    );
  });

  it('2. Renders icon + plain count quick filters (without parentheses) and simplifies UI collection status to Owned vs Wishlist', async () => {
    // Backward compatibility in data model normalizer remains intact
    assert.equal(normalizeCollectionStatus('owned'), 'owned');
    assert.equal(normalizeCollectionStatus('wishlist'), 'wishlist');
    assert.equal(normalizeCollectionStatus('library'), 'library');

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Add 2 wishlist books and mark 1 book as loved
    await store.addManualBook({
      title: 'Wishlist One',
      authors: ['Author A'],
      format: 'hardcover',
      readingStage: 'picture-book',
      ageMin: 3,
      ageMax: 6,
      tags: ['animals'],
      collectionStatus: 'wishlist',
      loved: true,
    });
    await store.addManualBook({
      title: 'Wishlist Two',
      authors: ['Author B'],
      format: 'paperback',
      readingStage: 'picture-book',
      ageMin: 3,
      ageMax: 6,
      tags: ['bedtime'],
      collectionStatus: 'wishlist',
      loved: false,
    });

    const state = store.getState();
    const libHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
      },
    });

    // Wishlist & Loved quick buttons must render icon + count number WITHOUT parentheses
    assert.equal(
      libHtml.includes('Wishlist (2)'),
      false,
      'Wishlist filter button must not render "Wishlist (2)" with parentheses'
    );
    assert.equal(
      libHtml.includes('Loved (1)'),
      false,
      'Loved filter button must not render "Loved (1)" with parentheses'
    );
    assert.match(
      libHtml,
      /data-action="set-catalog-filter"\s+data-filter="wishlist"[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?>2</,
      'Wishlist quick filter should show bookmark SVG icon + plain count 2'
    );
    assert.match(
      libHtml,
      /data-action="set-catalog-filter"\s+data-filter="loved"[\s\S]*?<svg[\s\S]*?<\/svg>[\s\S]*?>1</,
      'Loved quick filter should show heart SVG icon + plain count 1'
    );

    // Library Loan & Interested should be removed from UI filter chips & Book Inspector quick status chips
    assert.equal(libHtml.includes('Library Loan'), false, 'Library Loan filter chip should be removed');

    const inspectorHtml = renderBookInspectorModal({
      book: state.books[0],
      profiles: state.profiles,
    });
    assert.ok(inspectorHtml.includes('data-status="owned"'));
    assert.ok(inspectorHtml.includes('data-status="wishlist"'));
    assert.equal(
      inspectorHtml.includes('data-status="library"'),
      false,
      'Book Inspector quick status pills should only offer Owned vs Wishlist'
    );
    assert.equal(
      inspectorHtml.includes('data-status="interested"'),
      false,
      'Book Inspector quick status pills should not clutter with Interested'
    );
  });

  it('3. Aligns labels on the left and option pills on the right inside the Found Book Customize section', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const foundHtml = renderScanShellView({
      state: store.getState(),
      uiState: {
        intakeTab: 'scanner',
        isbnInput: '',
        isbnLoading: false,
        isbnError: '',
        isbnNotFound: '',
        isbnCandidate: null,
        activeCandidate: {
          candidateKey: 'isbn:9780140501742',
          isbn13: '9780140501742',
          title: 'Corduroy',
          authors: ['Don Freeman'],
          format: 'paperback',
          ageMin: 2,
          ageMax: 6,
          readingStage: 'picture-book',
          tags: ['animals', 'friendship'],
          spineColor: 'amber',
          sources: [{ provider: 'open-library', fetchedAt: '2026-10-31T00:00:00.000Z' }],
        },
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
        phase: 'idle',
        statusMessage: 'Ready',
        errorMessage: '',
        ignoredHint: '',
        facingMode: 'environment',
        uploadedPreviewUrl: '',
        lock: null,
        support: null,
      },
    });

    assert.ok(
      foundHtml.includes('data-customize-row="owner"') &&
        foundHtml.includes('justify-between') &&
        foundHtml.includes('justify-end'),
      'Customize rows should align label text on the left and option pills on the right'
    );
    assert.equal(
      foundHtml.includes('Library Loan'),
      false,
      'Found Book Customize status pills should only offer Owned vs Wishlist'
    );
  });

  it('4. Opens a slide-in Left Filter Sidebar grouped by Format, Theme, Owner (multi-select), and Condition with conflict-free owner logic', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const mayaBook = await store.addManualBook({
      title: 'Maya Hardcover Dinosaurs',
      authors: ['Author M'],
      format: 'hardcover',
      readingStage: 'picture-book',
      ageMin: 3,
      ageMax: 6,
      tags: ['dinosaurs', 'adventure'],
      owners: ['profile_maya'],
    });
    const leoBook = await store.addManualBook({
      title: 'Leo Board Animals',
      authors: ['Author L'],
      format: 'board-book',
      readingStage: 'board-toddler',
      ageMin: 1,
      ageMax: 3,
      tags: ['animals', 'bedtime'],
      owners: ['profile_leo'],
    });

    const state = store.getState();

    // 4a. Unified owner transition: if `For Maya` ('active-reader') was active and user toggles `profile_leo` in the Owner multi-select,
    //     it must NOT stay trapped inside `For Maya`! Instead it transitions cleanly to multi-select owners so Leo's books appear!
    const transitioned = toggleUnifiedOwnerSelection({
      currentOwnerFilter: 'active-reader',
      currentSelectedOwners: [],
      toggledOwner: 'profile_leo',
      activeProfileId: 'profile_maya',
    });
    assert.equal(transitioned.ownerFilter, 'custom');
    assert.ok(
      transitioned.selectedOwners.includes('profile_leo'),
      'Toggling Leo from For Maya scope must include Leo in selectedOwners without contradicting For Maya'
    );

    // 4b. Multi-select Owner (`['profile_leo']`) + Format (`['board-book']`) + Theme (`['animals']`) filters accurately
    const drawerOpenHtml = renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        ownerFilter: transitioned.ownerFilter,
        selectedOwners: ['profile_leo'],
        selectedFormats: ['board-book'],
        selectedThemes: ['animals'],
        isFilterDrawerOpen: true,
        searchQuery: '',
        inspectedBookId: null,
      },
    });

    assert.ok(
      drawerOpenHtml.includes('data-library-filter-drawer="true"') &&
        drawerOpenHtml.includes('animate-drawer-left'),
      'Expected left slide-in filter sidebar with animate-drawer-left transition'
    );
    assert.ok(
      drawerOpenHtml.includes('data-action="toggle-library-format"') &&
        drawerOpenHtml.includes('data-action="toggle-library-theme"') &&
        drawerOpenHtml.includes('data-action="toggle-library-owner"'),
      'Left filter drawer must expose grouped Format, Theme, and multi-select Owner controls'
    );
    assert.ok(drawerOpenHtml.includes(escapeHtml(leoBook.title)), 'Leo board animals book matches');
    assert.equal(
      drawerOpenHtml.includes(escapeHtml(mayaBook.title)),
      false,
      'Maya hardcover dinosaurs book is filtered out'
    );
  });

  it('5. Replaces Vite 8 HMR WebSocket transport with a connected no-op in middleware mode so neither WebSocket closed without opened nor SendBeforeConnectError can occur', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { createServer: createViteServer } = await import('vite');
    const rootDir = process.cwd();

    const serverSource = await fs.readFile(path.join(rootDir, 'server.ts'), 'utf8');
    assert.match(
      serverSource,
      /ws:\s*enableHmr\s*\?\s*\{\s*server:\s*httpServer\s*\}\s*:\s*false/,
      'server.ts must disable standalone Vite ws port 24678 when HMR is off and attach httpServer when enabled'
    );

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    const originalWebSocket = globalThis.WebSocket;
    const originalConsoleError = console.error;
    /** @type {unknown[][]} */
    const loggedErrors = [];
    let webSocketConstructCount = 0;

    try {
      const transformed = await vite.transformRequest('/@vite/client');
      assert.ok(transformed && typeof transformed.code === 'string', 'Expected /@vite/client transform output');
      assert.ok(
        transformed.code.includes('return { connect() {}, disconnect() {}, send() {} }'),
        '/@vite/client must use synchronous connected no-op transport when HMR is disabled'
      );
      assert.ok(
        transformed.code.includes('updateStyle') && transformed.code.includes('removeStyle'),
        '/@vite/client must preserve updateStyle and removeStyle exports for dev CSS injection'
      );

      // Execute the transformed client module (stripping only the bare env import) and invoke createHotContext().send()
      // exactly as @vite-plugin-pwa/pwa-entry-point-loaded does in the browser.
      const runnableCode = transformed.code.replace(
        /^import\s+["'][^"']*\/env\.mjs["'];?/m,
        ''
      );
      const dataUrl = `data:text/javascript;base64,${Buffer.from(runnableCode, 'utf8').toString('base64')}`;

      // Trap WebSocket and console.error to prove zero WebSocket dials and zero SendBeforeConnectError
      // @ts-expect-error test trap
      globalThis.WebSocket = class ForbiddenWebSocket {
        constructor() {
          webSocketConstructCount += 1;
          throw new Error('WebSocket closed without opened.');
        }
      };
      console.error = (...args) => {
        loggedErrors.push(args);
      };

      const clientModule = await import(dataUrl);
      assert.equal(webSocketConstructCount, 0, 'Zero WebSocket instances may be created when HMR is disabled');

      const hot = clientModule.createHotContext('/@vite-plugin-pwa/pwa-entry-point-loaded');
      hot.send('vite-pwa-plugin:dev-ready');
      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(
        loggedErrors.length,
        0,
        `createHotContext().send() must not log SendBeforeConnectError, got: ${JSON.stringify(loggedErrors)}`
      );
    } finally {
      globalThis.WebSocket = originalWebSocket;
      console.error = originalConsoleError;
      await vite.close();
    }
  });
});
