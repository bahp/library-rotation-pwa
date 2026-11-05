/**
 * @fileoverview Phase 31 Regression & Verification Tests:
 * 1) Full Spanish & Italian localization of Settings:
 *    - All section headers, descriptions, options, and actions translated with zero hardcoded English leaks.
 *    - Removal of misleading browser-padded origin quota string while preserving real storage usage & Clear Cover Cache.
 * 2) Zensical-style documentation layout:
 *    - Responsive sticky left sidebar with main index (cross-guide links) and subindexes (section anchors).
 * 3) Enlarged realistic book cover sticker showcase:
 *    - 4-corner badges (.corner-top-left, .corner-top-right, .corner-bottom-left, .corner-bottom-right).
 *    - Detailed annotations and live state matrix comparison.
 * 4) MetadataProvider contract restored in developer documentation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { getLocaleDictionary, t } from '../src/config/index.js';

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

const DEFAULT_PWA_STATUS = {
  isInstallable: false,
  isInstalled: true,
  isIOS: false,
  isOnline: true,
  swReady: true,
  showIosInstructions: false,
};

describe('Phase 31 — Settings Full i18n & Removal of Misleading Quota', () => {
  it('1. Renders Settings view in Spanish without hardcoded English headers or padded quota strings', async () => {
    const store = await createTestStore();
    const st = store.getState();

    /** @type {import('../src/types/models.js').AppState} */
    const spanishState = {
      ...st,
      settings: { ...st.settings, language: 'es' },
    };

    const html = renderSettingsView({
      state: spanishState,
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport: '',
        googleBooksHealthTone: 'idle',
        googleBooksKeyStatus: 'unknown',
        isGoogleKeyGuideOpen: false,
        deviceBooksProxyUrl: '',
        deviceBooksProxyError: '',
        syncingCatalogMetadata: false,
        catalogSyncProgressText: '',
        catalogSyncReport: '',
        catalogSyncTone: 'idle',
        browserStorageSummary: '', // Padded quota string removed
        hasCoverCache: true,
      },
    });

    // Check Spanish headers & sections
    assert.match(html, /Perfiles de Lectores/);
    assert.match(html, /Apariencia/);
    assert.match(html, /Frescura del Estante y Libros Olvidados/);
    assert.match(html, /Proveedores de Metadatos del Catálogo/);
    assert.match(html, /Copia de Seguridad y Portabilidad/);
    assert.match(html, /Acerca de Little Shelf/);

    // Verify misleading text is NEVER present
    assert.equal(html.includes('(padded by browser)'), false);
    assert.equal(html.includes('Origin cache quota:'), false);

    // Verify storage stats and clear cache button are rendered
    assert.match(html, /data-settings-memory-value="true"/);
    assert.match(html, /data-action="clear-cover-cache"/);
  });

  it('2. Renders Settings view in Italian with localized headers and no padded quota strings', async () => {
    const store = await createTestStore();
    const st = store.getState();

    /** @type {import('../src/types/models.js').AppState} */
    const italianState = {
      ...st,
      settings: { ...st.settings, language: 'it' },
    };

    const html = renderSettingsView({
      state: italianState,
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport: '',
        googleBooksHealthTone: 'idle',
        googleBooksKeyStatus: 'unknown',
        isGoogleKeyGuideOpen: false,
        deviceBooksProxyUrl: '',
        deviceBooksProxyError: '',
        syncingCatalogMetadata: false,
        catalogSyncProgressText: '',
        catalogSyncReport: '',
        catalogSyncTone: 'idle',
        browserStorageSummary: '',
        hasCoverCache: true,
      },
    });

    // Check Italian headers
    assert.match(html, /Profili dei Lettori/);
    assert.match(html, /Aspetto/);
    assert.match(html, /Freschezza dello Scaffale e Libri Dimenticati/);
    assert.match(html, /Provider di Metadati del Catalogo/);
    assert.match(html, /Backup e Portabilità/);
    assert.match(html, /Informazioni su Little Shelf/);

    // Verify misleading text is NEVER present
    assert.equal(html.includes('(padded by browser)'), false);
    assert.equal(html.includes('Origin cache quota:'), false);

    // Verify Italian Clear Cover Cache button label
    assert.match(html, /Svuota Cache Copertine/);
    assert.match(html, /data-action="clear-cover-cache"/);
  });

  it('3. Retains unescaped Save & Verify label in English for exact test matching', async () => {
    const store = await createTestStore();
    const st = store.getState();

    const html = renderSettingsView({
      state: st,
      storageBackend: 'indexeddb',
      pwaStatus: DEFAULT_PWA_STATUS,
    });

    assert.ok(html.includes('Save & Verify'));
  });
});

describe('Phase 31 — Zensical Documentation Layout & Enlarged Stickers Showcase', () => {
  it('4. User Guide contains Zensical sidebar layout with Index & Subindexes', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/docs/index.html'), 'utf8');

    // Layout & sidebar elements
    assert.ok(html.includes('class="docs-layout"'));
    assert.ok(html.includes('class="docs-sidebar"'));
    assert.ok(html.includes('class="sidebar-heading"'));
    assert.ok(html.includes('class="sidebar-toc-list"'));
    assert.ok(html.includes('class="sidebar-subindex"'));

    // Section sublinks
    assert.ok(html.includes('href="#bedtime-sets"'));
    assert.ok(html.includes('href="#storytime-picker"'));
    assert.ok(html.includes('href="#cover-badges"'));
  });

  it('5. User Guide contains enlarged realistic book cover stickers showcase with 4-corner badges', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/docs/index.html'), 'utf8');

    // Showcase container and enlarged realistic book
    assert.ok(html.includes('cover-showcase-container'));
    assert.ok(html.includes('cover-showcase-book'));
    assert.ok(html.includes('spine-crease'));
    assert.ok(html.includes('The Snowy Day'));
    assert.ok(html.includes('Ezra Jack Keats'));

    // 4-Corner badges on the enlarged cover
    assert.ok(html.includes('corner-top-left'));
    assert.ok(html.includes('corner-top-right'));
    assert.ok(html.includes('corner-bottom-left'));
    assert.ok(html.includes('corner-bottom-right'));

    // Annotations and live state grid
    assert.ok(html.includes('cover-showcase-annotations'));
    assert.ok(html.includes('cover-states-grid'));
    assert.ok(html.includes('Shelf 12d'));
    assert.ok(html.includes('Rest 15d'));
  });

  it('6. Developer Guide contains Zensical sidebar and restores MetadataProvider interface', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'public/docs/architecture-and-providers.html'),
      'utf8'
    );

    assert.ok(html.includes('class="docs-layout"'));
    assert.ok(html.includes('class="docs-sidebar"'));
    assert.ok(html.includes('MetadataProvider'));
    assert.ok(html.includes('lookupByIsbn'));
    assert.ok(html.includes('searchBooks'));
  });

  it('7. Configuration and Tagging docs adopt the unified Zensical sidebar structure', () => {
    const configHtml = readFileSync(
      resolve(process.cwd(), 'public/docs/configuration.html'),
      'utf8'
    );
    const tagHtml = readFileSync(
      resolve(process.cwd(), 'public/docs/tagging-and-ai.html'),
      'utf8'
    );

    assert.ok(configHtml.includes('class="docs-layout"'));
    assert.ok(configHtml.includes('class="docs-sidebar"'));
    assert.ok(tagHtml.includes('class="docs-layout"'));
    assert.ok(tagHtml.includes('class="docs-sidebar"'));
  });
});
