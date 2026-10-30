/**
 * @fileoverview Phase 8 regression tests covering:
 * 1) Mobile input focus auto-zoom prevention (viewport meta + 16px mobile input font-size + touch-action)
 * 2) Rotations compact cover-only default view + per-rotation Edit toggle with icon-only slot controls (including `replace` icon)
 * 3) Scan page warm editorial restyling + starting live camera by clicking directly on the barcode/scanner viewport area
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderIcon } from '../src/ui/icons.js';
import { renderLibraryView } from '../src/features/library/library-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderScanShellView } from '../src/features/scan/scan-shell-view.js';

describe('Phase 8 Mobile App Polish: No Input Zoom, Compact Cover-Only Rotations, and Tap-to-Scan Editorial Scanner', () => {
  it('1. Disables mobile text-field focus zoom via viewport configuration, touch-action, and >=16px mobile input font size', async () => {
    const rootDir = process.cwd();
    const indexHtml = await fs.readFile(path.join(rootDir, 'index.html'), 'utf8');
    const indexCss = await fs.readFile(path.join(rootDir, 'src', 'index.css'), 'utf8');

    assert.match(
      indexHtml,
      /<meta[^>]+name="viewport"[^>]+maximum-scale=1(\.0)?[^>]*>/i,
      'Viewport meta should include maximum-scale=1.0 to behave like a native phone app'
    );
    assert.match(
      indexHtml,
      /<meta[^>]+name="viewport"[^>]+user-scalable=no[^>]*>/i,
      'Viewport meta should include user-scalable=no to prevent mobile text-field zoom jumps'
    );
    assert.match(
      indexCss,
      /touch-action:\s*manipulation/i,
      'Global CSS should enable touch-action: manipulation'
    );
    assert.match(
      indexCss,
      /font-size:\s*16px/i,
      'Global CSS should enforce 16px minimum font-size on mobile form controls to block iOS/Android input zoom'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const libraryHtml = renderLibraryView({
      state,
      uiState: { catalogFilter: 'all', searchQuery: '', inspectedBookId: null },
    });
    assert.match(
      libraryHtml,
      /id="catalog-search-input"[\s\S]*?text-base/,
      'Library search input should use text-base (16px) on mobile'
    );
  });

  it('2. Shows brief rotation info + book covers only by default, and reveals icon controls (read, swap, replace icon, x) when Edit is toggled', async () => {
    // Dedicated replace icon must exist and not fall back to generic book icon
    const replaceSvg = renderIcon('replace', 'w-4 h-4');
    const fallbackBookSvg = renderIcon('book', 'w-4 h-4');
    assert.notEqual(
      replaceSvg,
      fallbackBookSvg,
      'Expected a dedicated replace SVG icon in icons.js'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    // Create a second saved rotation for Maya so we verify multi-rotation isolation
    await store.generateRotation({
      title: 'Maya Bedtime Favorites',
      objective: 'bedtime + animals',
      count: 3,
      cooldownDays: 0,
      seed: 'maya-second-rot',
    });

    const state = store.getState();
    const mayaRotations = state.rotations.filter((r) => r.profileId === state.activeProfileId);
    assert.ok(mayaRotations.length >= 2, 'Expected at least 2 rotations for active profile');
    const targetRot = mayaRotations[0];

    // A) Default view (editingRotationId: null) -> brief info + covers + Edit button, NO per-book action buttons
    const compactHtml = renderRotationsView({
      state,
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
    });

    assert.equal(
      compactHtml.includes(`data-action="toggle-edit-rotation"`),
      true,
      'Each rotation should expose an Edit toggle button'
    );
    assert.equal(
      compactHtml.includes('data-action="replace-book-random"'),
      false,
      'Default compact rotation view must hide random swap buttons until Edit is clicked'
    );
    assert.equal(
      compactHtml.includes('data-action="open-manual-replace-modal"'),
      false,
      'Default compact rotation view must hide manual replace buttons until Edit is clicked'
    );
    assert.equal(
      compactHtml.includes('data-action="remove-rotation-book"'),
      false,
      'Default compact rotation view must hide remove (x) buttons until Edit is clicked'
    );
    assert.equal(
      compactHtml.includes('data-action="toggle-rotation-read"'),
      false,
      'Default compact rotation view must hide read toggle buttons until Edit is clicked'
    );

    // B) Edit mode active for targetRot -> reveals read, swap, replace (icon), and remove (x) ONLY for targetRot
    const editingHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: targetRot.id,
      },
    });

    assert.equal(
      editingHtml.includes(`data-action="toggle-rotation-read" data-rotation-id="${targetRot.id}"`) ||
        editingHtml.includes(`data-rotation-id="${targetRot.id}"\n                        data-book-id=`) ||
        editingHtml.includes('data-action="toggle-rotation-read"'),
      true,
      'Edit mode must reveal read toggle button'
    );
    assert.equal(
      editingHtml.includes('data-action="replace-book-random"'),
      true,
      'Edit mode must reveal random swap button'
    );
    assert.equal(
      editingHtml.includes('data-action="open-manual-replace-modal"'),
      true,
      'Edit mode must reveal manual replace button'
    );
    assert.equal(
      editingHtml.includes('data-action="remove-rotation-book"'),
      true,
      'Edit mode must reveal remove (x) button'
    );
    // Non-edited second rotation remains compact
    const secondRot = mayaRotations[1];
    assert.equal(
      editingHtml.includes(`data-rotation-id="${secondRot.id}" data-book-id=`),
      false,
      'Non-edited rotations should remain in compact cover-only mode'
    );
    // Manual replace button uses SVG icon, not visible text ">Replace<"
    assert.equal(
      />\s*Replace\s*<\/button>/.test(editingHtml),
      false,
      'Manual replace control should use an icon instead of a text "Replace" button'
    );
  });

  it('3. Restyles Scan page to warm editorial theme and starts camera when clicking the barcode viewport area', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const baseUiState = {
      intakeTab: /** @type {'scanner' | 'search' | 'isbn' | 'manual'} */ ('scanner'),
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
        format: /** @type {'hardcover'} */ ('hardcover'),
        readingStage: /** @type {'picture-book'} */ ('picture-book'),
        ageMin: 2,
        ageMax: 6,
        tags: '',
        sources: undefined,
      },
      scanMode: /** @type {'barcode'} */ ('barcode'),
      formError: '',
    };

    const idleScannerState = {
      mode: /** @type {'barcode'} */ ('barcode'),
      phase: /** @type {'idle'} */ ('idle'),
      statusMessage: 'Ready to scan.',
      errorMessage: '',
      ignoredHint: '',
      facingMode: /** @type {'environment'} */ ('environment'),
      uploadedPreviewUrl: '',
      lock: null,
      support: {
        secureContext: true,
        cameraApi: true,
        nativeBarcodeDetector: false,
        webAssembly: true,
        barcodeEngineLabel: 'ZXing Pure-JS Fallback',
      },
    };

    const scannerHtml = renderScanShellView({
      state,
      uiState: baseUiState,
      scannerState: idleScannerState,
    });

    // Barcode frame area itself is an interactive button triggering `start-camera-scan`
    assert.match(
      scannerHtml,
      /<button[^>]*data-action="start-camera-scan"[\s\S]*?data-scan-guide="barcode"/,
      'Clicking directly on the idle barcode scanner frame area should trigger start-camera-scan'
    );

    // Check all 4 intake tabs use warm editorial surfaces (no legacy bg-slate-* or bg-teal-* classes)
    for (const tab of /** @type {const} */ (['scanner', 'search', 'isbn', 'manual'])) {
      const tabHtml = renderScanShellView({
        state,
        uiState: { ...baseUiState, intakeTab: tab },
        scannerState: idleScannerState,
      });
      assert.equal(
        /\bbg-slate-\d+\b|\bbg-teal-\d+\b|\bborder-slate-\d+\b/.test(tabHtml),
        false,
        `Scan tab "${tab}" should use warm editorial tokens instead of legacy slate/teal classes`
      );
    }

    // When streaming, viewport renders live <video> instead of a start-camera button wrapper
    const streamingHtml = renderScanShellView({
      state,
      uiState: baseUiState,
      scannerState: { ...idleScannerState, phase: 'streaming' },
    });
    assert.ok(streamingHtml.includes('id="scanner-live-video"'));
    assert.equal(
      /<button[^>]*data-action="start-camera-scan"[\s\S]*?data-scan-guide="barcode"/.test(
        streamingHtml
      ),
      false,
      'Streaming viewport should render live video rather than start-camera trigger'
    );
  });
});
