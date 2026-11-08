/**
 * @fileoverview Phase 6 End-to-End Smoke Journeys, Accessibility Landmark Verification,
 * XSS Sanitization Audits, and Backup/Restore Fidelity Tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createCatalogService } from '../src/features/catalog/catalog-service.js';
import { createHttpClient } from '../src/features/catalog/providers/http-client.js';
import { createGoogleBooksProvider } from '../src/features/catalog/providers/google-books-provider.js';
import { createOpenLibraryProvider } from '../src/features/catalog/providers/open-library-provider.js';
import { extractIsbnsFromText } from '../src/features/scan/isbn-extractor.js';
import { getProfileRecommendations } from '../src/features/tagging/recommendations.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderProfilesView } from '../src/features/profiles/profiles-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';

/**
 * Creates a mocked HttpClient serving realistic Google Books & Open Library JSON fixtures.
 */
function createMockedHttpClient() {
  /** @type {typeof fetch} */
  const mockFetch = async (input) => {
    const url = String(input);

    if (url.includes('googleapis.com/books/v1/volumes') && url.includes('9780064431781')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'gb-wild-things',
              volumeInfo: {
                title: 'Where the Wild Things Are',
                authors: ['Maurice Sendak'],
                publishedDate: '1988',
                pageCount: 40,
                printType: 'BOOK',
                categories: [
                  'Juvenile Fiction / Monsters',
                  'Juvenile Fiction / Imagination & Play',
                ],
                description:
                  'Max sails to an island of wild monsters in this classic bedtime adventure picture book.',
                industryIdentifiers: [
                  { type: 'ISBN_13', identifier: '9780064431781' },
                  { type: 'ISBN_10', identifier: '0064431789' },
                ],
                imageLinks: {
                  thumbnail:
                    'http://books.google.com/books/content?id=gb-wild-things&printsec=frontcover&img=1&zoom=1',
                },
              },
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (url.includes('openlibrary.org/api/books') && url.includes('9780064431781')) {
      return new Response(
        JSON.stringify({
          'ISBN:9780064431781': {
            title: 'Where the Wild Things Are',
            authors: [{ name: 'Maurice Sendak' }],
            number_of_pages: 40,
            publish_date: '1988',
            subjects: [{ name: 'Monsters' }, { name: 'Bedtime' }, { name: 'Adventure' }],
            cover: {
              medium: 'https://covers.openlibrary.org/b/id/8228691-M.jpg',
            },
          },
        }),
        { status: 200 }
      );
    }

    if (url.includes('googleapis.com/books/v1/volumes') && url.includes('Polar')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'gb-polar-express',
              volumeInfo: {
                title: 'The Polar Express',
                authors: ['Chris Van Allsburg'],
                publishedDate: '1985',
                pageCount: 32,
                categories: ['Juvenile Fiction / Holidays & Celebrations / Christmas'],
                description: 'A magical winter train journey to the North Pole on Christmas Eve.',
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780395389492' }],
              },
            },
          ],
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ items: [], docs: [] }), { status: 200 });
  };

  return createHttpClient({
    fetchImpl: mockFetch,
    maxRetries: 0,
    disablePersistentCache: true,
  });
}

describe('Phase 6 End-to-End Smoke Journeys & Release Hardening', () => {
  it('Journey 1: Profile creation -> OCR ISBN extraction -> Dual-provider lookup -> Auto-tagging -> Deterministic rotation -> Post-gen edits -> Read history', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const http = createMockedHttpClient();
    const catalog = createCatalogService({
      providers: [createGoogleBooksProvider(http), createOpenLibraryProvider(http)],
    });

    // 1. Add a new child reader profile
    await store.addProfile({
      name: 'Clara',
      age: 4,
      readingStage: 'picture-book',
      avatarTone: 'rose',
      defaultRotationSize: 3,
      cooldownDays: 14,
      favoriteTopics: ['adventure', 'bedtime', 'winter'],
    });

    const clara = store.getState().profiles.find((p) => p.name === 'Clara');
    assert.ok(clara, 'Expected Clara profile to exist');
    assert.equal(store.getState().activeProfileId, clara.id, 'New profile becomes active');

    // 2. Simulate OCR scan lock extracting printed ISBN-13 from back cover text
    const ocrMatches = extractIsbnsFromText('Printed in USA · ISBN 978-0-06-443178-1 · $8.99');
    assert.ok(ocrMatches.length > 0);
    assert.equal(ocrMatches[0].isbn13, '9780064431781');

    // 3. Enrich metadata across Google Books + Open Library and add to family catalog
    const lookup = await catalog.lookupByIsbn(ocrMatches[0].isbn13, { retainRaw: true });
    assert.ok(lookup.candidate, 'Expected merged book candidate from providers');
    assert.equal(lookup.candidate.sources.length, 2, 'Both providers merged into provenance');
    assert.match(lookup.candidate.coverUrl || '', /^https:\/\//, 'HTTP cover upgraded to HTTPS');

    const addedBook = await store.addBookFromCandidate(lookup.candidate);
    assert.ok(addedBook.tags.includes('bedtime') || addedBook.tags.includes('adventure'));
    assert.ok(addedBook.readingLevelHint && addedBook.readingLevelHint.length > 0);

    // 4. Generate a deterministic 3-book rotation with a fixed seed
    const rotation = await store.generateRotation({
      title: 'Clara Bedtime Adventure Shelf',
      objective: 'bedtime + adventure stories',
      count: 3,
      preferredTags: ['bedtime', 'adventure'],
      cooldownDays: 14,
      varietyMix: true,
      seed: 'release-v1-seed',
    });

    assert.equal(rotation.bookIds.length, 3);
    assert.equal(rotation.profileId, clara.id);

    // 5. Post-generation edit #1: Swap first slot with a random eligible off-shelf book
    const originalFirstId = rotation.bookIds[0];
    const swappedBook = await store.replaceRotationBookRandom(rotation.id, originalFirstId, {
      seedOverride: 'smoke-swap-1',
    });
    assert.notEqual(swappedBook.id, originalFirstId);
    const updatedRotAfterSwap = store.getState().rotations.find((r) => r.id === rotation.id);
    assert.ok(updatedRotAfterSwap);
    assert.equal(updatedRotAfterSwap.bookIds[0], swappedBook.id);

    // 6. Post-generation edit #2: Manually replace slot 0 back to originalFirstId
    await store.replaceRotationBookManual(rotation.id, swappedBook.id, originalFirstId);
    const updatedRotAfterManual = store.getState().rotations.find((r) => r.id === rotation.id);
    assert.ok(updatedRotAfterManual);
    assert.equal(updatedRotAfterManual.bookIds[0], originalFirstId);

    // 7. Post-generation edit #3: Add 1 random off-shelf book to expand shelf from 3 -> 4 books
    const randomAddedBooks = await store.addBooksToRotationRandom(rotation.id, 1, {
      seedOverride: 'smoke-add-1',
    });
    assert.equal(randomAddedBooks.length, 1);
    const expandedRot = store.getState().rotations.find((r) => r.id === rotation.id);
    assert.ok(expandedRot);
    assert.equal(expandedRot.bookIds.length, 4);

    // 8. Check off a book as read together & verify Clara's read history updates
    await store.toggleRotationBookRead(rotation.id, originalFirstId);
    const claraUpdated = store.getState().profiles.find((p) => p.id === clara.id);
    assert.ok(claraUpdated?.readHistoryBookIds.includes(originalFirstId));
  });

  it('Journey 2: Search intake -> Holiday/Winter auto-tagging -> Personalized recommendations -> Lossless JSON backup & restore', async () => {
    const storageA = createStorageAdapter({ forceMemory: true });
    const storeA = createAppStore(storageA);
    await storeA.init();

    const http = createMockedHttpClient();
    const catalog = createCatalogService({
      providers: [createGoogleBooksProvider(http)],
    });

    const searchRes = await catalog.searchBooks({ query: 'Polar Express' });
    assert.equal(searchRes.candidates.length, 1);

    const polarBook = await storeA.addBookFromCandidate(searchRes.candidates[0]);
    assert.ok(polarBook.tags.includes('christmas'), 'Local rule tagger inferred christmas theme');
    assert.ok(polarBook.tags.includes('winter') || polarBook.tags.includes('vehicles'));

    // Configure non-default safe settings to verify full state roundtrip
    await storeA.updateSettings({
      theme: 'dark',
      preferredScanMode: 'isbn-ocr',
      retainRawProviderPayloads: true,
      autoLocalTagging: true,
      aiEnrichmentOptIn: false,
    });

    const stateBeforeExport = storeA.getState();
    const activeProfile = stateBeforeExport.profiles[0];
    const recs = getProfileRecommendations({
      books: stateBeforeExport.books,
      profile: activeProfile,
      rotations: stateBeforeExport.rotations,
      limit: 3,
    });
    assert.ok(recs.length > 0, 'Expected personalized off-shelf recommendations');

    // Export full JSON backup
    const backupJson = JSON.stringify(stateBeforeExport, null, 2);

    // Restore into a completely separate fresh store instance
    const storageB = createStorageAdapter({ forceMemory: true });
    const storeB = createAppStore(storageB);
    await storeB.init();
    await storeB.resetToSeedData();

    await storeB.importBackupJson(backupJson);
    const restored = storeB.getState();

    assert.equal(restored.books.length, stateBeforeExport.books.length);
    assert.ok(restored.books.some((b) => b.isbn13 === '9780395389492'));
    assert.equal(restored.settings.theme, 'dark');
    assert.equal(restored.settings.preferredScanMode, 'isbn-ocr');
    assert.equal(restored.settings.retainRawProviderPayloads, true);
    assert.equal(restored.settings.aiEnrichmentOptIn, false);
  });

  it('Journey 3: Accessibility landmarks, modal ARIA contracts, and XSS HTML escaping across all 5 views', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Inject adversarial XSS strings into a manual book
    const xssBook = await store.addManualBook({
      title: '<script>window.__xss=1</script>Bedtime "Stars"',
      authors: ['Margaret <img src=x onerror=alert(1)> Wise'],
      isbn: '9780064430180',
      format: 'board-book',
      readingStage: 'board-toddler',
      ageMin: 1,
      ageMax: 4,
      tags: ['bedtime', '<b>xss-tag</b>'],
    });

    const state = store.getState();
    const activeRotation = state.rotations[0];

    const homeHtml = renderHomeView({
      state,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: xssBook.id,
      },
    });

    const shellHtml = renderAppShell({
      activeRoute: 'home',
      state,
      toast: { id: 't1', message: 'Saved <book>', tone: 'success' },
      pwaStatus: {
        isInstallable: true,
        isInstalled: false,
        isIOS: false,
        isOnline: false,
        swReady: true,
        showIosInstructions: true,
      },
      contentHtml: homeHtml,
    });

    // Verify skip link, main landmark, offline status banner, live toast, and dialog ARIA attributes
    assert.ok(shellHtml.includes('href="#main-content"'), 'Skip to main content link present');
    assert.ok(
      shellHtml.includes('<main id="main-content" tabindex="-1"'),
      'Focusable main landmark present'
    );
    assert.ok(shellHtml.includes('aria-live="polite"'), 'Toast polite live region present');
    assert.ok(shellHtml.includes('role="dialog"'), 'Modal role="dialog" present');
    assert.ok(shellHtml.includes('aria-modal="true"'), 'Modal aria-modal="true" present');
    assert.ok(
      shellHtml.includes('data-backdrop-action="close-inspect-book"'),
      'Book modal backdrop dismissal wired'
    );

    // Verify adversarial tags are escaped and never rendered raw
    assert.ok(!shellHtml.includes('<script>window.__xss=1</script>'), 'Script tag escaped');
    assert.ok(
      !shellHtml.includes('<img src=x onerror=alert(1)>'),
      'Event handler injection escaped'
    );
    assert.ok(!shellHtml.includes('<b>xss-tag</b>'), 'HTML tag in topic escaped');
    assert.ok(
      !shellHtml.includes('undefined'),
      'Zero literal "undefined" leaked in Home + Shell HTML'
    );

    // Render Rotations view with open Replace modal
    const rotationsHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: 'replace',
        rotationId: activeRotation.id,
        targetBookId: activeRotation.bookIds[0],
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
      },
    });
    assert.ok(rotationsHtml.includes('id="rotation-picker-modal-title"'));
    assert.ok(rotationsHtml.includes('data-backdrop-action="close-rotation-modal"'));
    assert.ok(!rotationsHtml.includes('<script>window.__xss=1</script>'));

    // Render Scan view
    const scanHtml = renderScanShellView({
      state,
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
          sources: undefined,
        },
        scanMode: 'barcode',
        formError: '',
      },
      scannerState: {
        mode: 'barcode',
        phase: 'idle',
        statusMessage: 'Ready to scan.',
        errorMessage: '',
        ignoredHint: '',
        facingMode: 'environment',
        uploadedPreviewUrl: '',
        lock: null,
        support: {
          secureContext: true,
          cameraApi: true,
          nativeBarcodeDetector: false,
          webAssembly: true,
          barcodeEngineLabel: 'ZXing Pure-JS Fallback',
        },
      },
    });
    assert.ok(scanHtml.includes('Scan & Add Books'));
    assert.ok(!scanHtml.includes('undefined'));

    // Render Profiles and Settings views
    const profilesHtml = renderProfilesView({ state });
    assert.ok(profilesHtml.includes(state.profiles[0].name));
    assert.ok(!profilesHtml.includes('<script>window.__xss=1</script>'));

    const settingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: true,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      adapterDiagnostics: store.getTaggingService().getAdapterDiagnostics(state.settings),
    });
    assert.ok(settingsHtml.includes('Optional AI Enrichment'));
    assert.ok(!settingsHtml.includes('api_key'), 'No API key input rendered in Settings');
  });

  it('Journey 4 (CI Deployment Contract): GitHub Pages workflow succeeds with or without package-lock.json and avoids setup-node v4 punycode cache crash', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const rootDir = process.cwd();
    const workflowPath = path.join(rootDir, '.github', 'workflows', 'deploy.yml');
    const gitignorePath = path.join(rootDir, '.gitignore');

    const workflowYaml = await fs.readFile(workflowPath, 'utf8');
    const gitignoreText = await fs.readFile(gitignorePath, 'utf8');

    // 1. setup-node must NOT hardcode `cache: 'npm'` (which crashes when package-lock.json is absent)
    assert.equal(
      /cache:\s*['"]?npm['"]?/.test(workflowYaml),
      false,
      'setup-node must not set cache: npm when package-lock.json may be absent in exported repos'
    );

    // 2. Suppress Node [DEP0040] punycode warning inside setup-node action runner and use lockfile-safe actions/cache@v4
    assert.match(
      workflowYaml,
      /NODE_NO_WARNINGS:\s*['"]?1['"]?/,
      'Expected NODE_NO_WARNINGS: "1" on setup-node to silence [DEP0040] punycode deprecation noise'
    );
    assert.match(
      workflowYaml,
      /uses:\s*actions\/cache@v4/,
      'Expected actions/cache@v4 hashed on package-lock.json / package.json'
    );

    // 3. Configure GitHub Pages explicitly before building & uploading artifact
    assert.match(
      workflowYaml,
      /uses:\s*actions\/configure-pages@v5/,
      'Expected actions/configure-pages@v5 step for reliable GitHub Pages enablement'
    );

    // 4. Dependency install step must gracefully fall back when package-lock.json is absent
    assert.equal(
      /^\s*run:\s*npm ci\s*$/m.test(workflowYaml),
      false,
      'Bare `run: npm ci` fails when package-lock.json is not committed'
    );
    assert.match(
      workflowYaml,
      /if\s*\[\s*-f\s+package-lock\.json\s*\];\s*then\s+npm ci;\s*else\s+npm install/,
      'Install step should run npm ci when package-lock.json exists and fall back to npm install otherwise'
    );

    // 5. .gitignore should ignore dev-dist/ so local Vite PWA dev artifacts are never committed
    assert.match(gitignoreText, /^dev-dist\/?$/m, '.gitignore should ignore dev-dist/');

    // 6. package.json devDependencies.esbuild must satisfy vite@8 peerOptional ("^0.27.0 || ^0.28.0")
    //    and `npm install --dry-run` must exit 0 without ERESOLVE peer conflicts.
    const pkgJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
    const esbuildRange = String(pkgJson.devDependencies?.esbuild || '');
    assert.equal(
      esbuildRange.startsWith('^0.25'),
      false,
      `esbuild range "${esbuildRange}" conflicts with vite@8 peerOptional esbuild@"^0.27.0 || ^0.28.0"`
    );

    const { execFileSync } = await import('node:child_process');
    const dryRunOutput = execFileSync(
      'npm',
      ['install', '--dry-run', '--no-audit', '--no-fund'],
      { cwd: rootDir, encoding: 'utf8' }
    );
    assert.ok(typeof dryRunOutput === 'string');
  });
});
