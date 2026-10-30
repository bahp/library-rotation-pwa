/**
 * @fileoverview Warm Editorial Book Intake & Tap-to-Scan Workspace:
 * 1) Live Camera + Gallery Upload Scanner with 3 distinct frame geometries (`barcode`, `isbn-ocr`, `cover`):
 *    - Clicking/tapping directly on the idle barcode/scanner frame area immediately starts the camera
 *    - Animated scan-line sweep on live & uploaded images, emerald detection-lock feedback,
 *      collapsible browser compatibility diagnostics, and graceful camera-denied fallbacks
 * 2) Title / Author Search across Google Books + Open Library with flat editorial candidate rows
 * 3) ISBN-10 / ISBN-13 Auto-Lookup with multi-provider metadata merging & optional raw JSON inspector
 * 4) Manual / Pre-filled Book Editor styled in warm linen/ivory surfaces with mobile zoom-safe 16px inputs
 */

import {
  escapeHtml,
  formatBookBinding,
  formatReadingStage,
} from '../../types/models.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * @typedef {'scanner' | 'search' | 'isbn' | 'manual'} IntakeTab
 */

/** @type {Record<import('../../types/models.js').ScanMode, { label: string, caption: string, frameClass: string, hint: string }>} */
const SCAN_MODES = {
  barcode: {
    label: 'Barcode',
    caption: 'EAN-13 / Bookland 978·979',
    frameClass: 'w-60 sm:w-80 h-24 sm:h-28 rounded-xl',
    hint: 'Center the back-cover ISBN barcode inside the guide.',
  },
  'isbn-ocr': {
    label: 'ISBN Text',
    caption: 'Printed ISBN-13 / ISBN-10 OCR',
    frameClass: 'w-60 sm:w-80 h-12 sm:h-14 rounded-lg',
    hint: 'Align the printed "ISBN 978-..." digits inside the narrow strip.',
  },
  cover: {
    label: 'Cover',
    caption: '3:4 jacket · OCR title/ISBN handoff',
    frameClass: 'w-36 sm:w-44 h-48 sm:h-56 rounded-2xl',
    hint: 'Frame the book cover and tap Capture Cover to extract title or ISBN.',
  },
};

const SAMPLE_ISBNS = [
  { isbn: '9780140501742', label: 'Corduroy' },
  { isbn: '9780064431781', label: 'Wild Things' },
  { isbn: '9780399240461', label: 'Gruffalo' },
];

/**
 * Renders a flat editorial candidate row for search or ISBN lookup results (zero nested boxes).
 * @param {{
 *   candidate: import('../catalog/normalizer.js').BookCandidate,
 *   index: number,
 *   alreadyOwned: boolean,
 *   showRawToggle: boolean
 * }} params
 * @returns {string}
 */
function renderCandidateRow({ candidate, index, alreadyOwned, showRawToggle }) {
  const pseudoBook = /** @type {import('../../types/models.js').Book} */ ({
    ...candidate,
    id: `cand_${index}`,
    addedAt: '',
  });

  const sourceNames = candidate.sources.map((s) => s.provider).join(' + ');
  const hasRaw =
    showRawToggle && candidate.sources.some((s) => Boolean(s.rawPayload));

  return `
    <article class="py-3.5 first:pt-1 border-b border-linen-200/80 dark:border-night-800 last:border-b-0 flex flex-col gap-2.5">
      <div class="flex items-start gap-3 min-w-0">
        ${renderBookCover(pseudoBook, 'sm')}
        <div class="min-w-0 flex-1">
          <h3 class="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white leading-snug">
            ${escapeHtml(candidate.title)}
          </h3>
          <p class="text-xs text-stone-ink dark:text-slate-300 mt-0.5 truncate">
            ${escapeHtml(candidate.authors.join(', '))}
          </p>

          <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400 mt-1">
            <span>${escapeHtml(formatReadingStage(candidate.readingStage))}</span>
            <span aria-hidden="true">·</span>
            <span>Ages ${candidate.ageMin}–${candidate.ageMax}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(formatBookBinding(candidate.format))}</span>
            ${
              candidate.publishedYear
                ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${candidate.publishedYear}</span>`
                : ''
            }
          </div>

          <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
            ${
              candidate.isbn13
                ? `<span class="font-mono-tabular">ISBN ${escapeHtml(candidate.isbn13)}</span><span aria-hidden="true">·</span>`
                : ''
            }
            <span>${escapeHtml(sourceNames)}</span>
          </div>

          ${
            candidate.tags.length
              ? `<p class="text-[11px] text-forest-700 dark:text-[#5ED3DA] mt-1 truncate">Topics: ${escapeHtml(
                  candidate.tags.join(' · ')
                )}</p>`
              : ''
          }
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        ${
          alreadyOwned
            ? `<span class="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] px-2 py-1">Already in Library</span>`
            : `
              <button
                type="button"
                data-action="edit-candidate"
                data-candidate-index="${index}"
                class="min-h-[42px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                Review
              </button>
              <button
                type="button"
                data-action="add-candidate"
                data-candidate-index="${index}"
                class="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('plus', 'w-4 h-4')}
                Add to Library
              </button>
            `
        }
      </div>

      ${
        hasRaw
          ? `
            <details class="text-xs text-stone-ink dark:text-slate-400 pt-0.5">
              <summary class="cursor-pointer font-semibold hover:text-forest-900 dark:hover:text-white">
                Raw Provider Payload (${escapeHtml(sourceNames)})
              </summary>
              <pre class="mt-2 p-3 rounded-xl bg-night-950 text-slate-100 font-mono-tabular text-[11px] overflow-x-auto max-h-52">${escapeHtml(
                JSON.stringify(
                  candidate.sources.map((s) => ({ provider: s.provider, rawPayload: s.rawPayload })),
                  null,
                  2
                )
              )}</pre>
            </details>
          `
          : ''
      }
    </article>
  `;
}

/**
 * Renders the warm editorial Camera & Gallery Upload Scanner panel.
 * Tapping directly on the idle barcode/scanner viewport area starts the live camera.
 *
 * @param {{
 *   uiState: {
 *     scanMode: import('../../types/models.js').ScanMode
 *   },
 *   scannerState: ReturnType<ReturnType<typeof import('./scanner-controller.js').createScannerController>['getState']>
 * }} params
 * @returns {string}
 */
function renderScannerPanel({ uiState, scannerState }) {
  const activeMode = SCAN_MODES[uiState.scanMode] || SCAN_MODES.barcode;
  const isLocked = scannerState.phase === 'locked' && Boolean(scannerState.lock);
  const isStreaming = scannerState.phase === 'streaming';
  const isStarting = scannerState.phase === 'starting-camera';
  const isAnalyzingUpload = scannerState.phase === 'analyzing-upload';
  const isActiveSweep = isStreaming || isAnalyzingUpload;
  const canTapViewportToStart = !isStreaming && !isStarting && !isAnalyzingUpload;

  const modeTabsHtml = /** @type {Array<import('../../types/models.js').ScanMode>} */ ([
    'barcode',
    'isbn-ocr',
    'cover',
  ])
    .map((modeKey) => {
      const selected = uiState.scanMode === modeKey;
      return `
        <button
          type="button"
          data-action="select-scan-mode"
          data-scan-mode="${modeKey}"
          aria-pressed="${selected ? 'true' : 'false'}"
          class="flex-1 min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            selected
              ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-xs'
              : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(SCAN_MODES[modeKey].label)}
        </button>
      `;
    })
    .join('');

  const frameBorderClasses = isLocked
    ? 'border-emerald-400 bg-emerald-950/30 shadow-[0_0_0_4px_rgba(16,185,129,0.28)]'
    : isActiveSweep
      ? 'border-[#5ED3DA] shadow-[0_0_0_9999px_rgba(14,22,24,0.52)]'
      : 'border-[#FAF6EE]/80 group-hover:border-[#5ED3DA] shadow-[0_0_0_9999px_rgba(14,22,24,0.40)]';

  const sweepLineClasses = isLocked
    ? 'bg-emerald-400 top-1/2 -translate-y-1/2 h-0.5 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
    : isActiveSweep
      ? 'bg-[#5ED3DA] top-0 h-0.5 shadow-[0_0_12px_rgba(94,211,218,0.95)] animate-scan-sweep'
      : 'bg-[#FAF6EE]/35 top-1/2 -translate-y-1/2 h-px';

  let lockReadoutText = canTapViewportToStart
    ? `Tap to Scan · ${activeMode.label}`
    : activeMode.label;
  if (isLocked && scannerState.lock) {
    lockReadoutText =
      scannerState.lock.kind === 'isbn'
        ? `LOCKED · ISBN ${scannerState.lock.isbn13}`
        : `LOCKED · "${scannerState.lock.titleQuery}"`;
  } else if (isAnalyzingUpload) {
    lockReadoutText = 'SCANNING PHOTO…';
  } else if (isStarting) {
    lockReadoutText = 'STARTING CAMERA…';
  }

  const viewportInnerHtml = `
    ${
      isStreaming || isStarting
        ? `<video
            id="scanner-live-video"
            autoplay
            muted
            playsinline
            class="absolute inset-0 w-full h-full object-cover"
          ></video>`
        : ''
    }

    ${
      scannerState.uploadedPreviewUrl
        ? `<img
            src="${escapeHtml(scannerState.uploadedPreviewUrl)}"
            alt="Uploaded book scan preview"
            class="absolute inset-0 w-full h-full object-contain bg-night-950"
          />`
        : ''
    }

    <div
      data-scan-guide="${escapeHtml(uiState.scanMode)}"
      data-scan-locked="${isLocked ? 'true' : 'false'}"
      class="relative z-10 flex items-center justify-center border-2 ${frameBorderClasses} ${activeMode.frameClass} transition-all duration-150 overflow-hidden"
    >
      <div class="absolute inset-x-2 ${sweepLineClasses}"></div>

      <span class="px-2.5 py-1 rounded-lg bg-night-950/80 text-[11px] font-mono-tabular tracking-wide inline-flex items-center gap-1.5 text-center ${
        isLocked ? 'text-emerald-300 font-semibold' : 'text-[#FAF6EE]'
      }">
        ${canTapViewportToStart && !isLocked ? renderIcon('camera', 'w-3.5 h-3.5') : ''}
        <span>${escapeHtml(lockReadoutText)}</span>
      </span>
    </div>

    <span class="relative z-10 mt-3 px-3 py-1 rounded-lg bg-night-950/75 text-[11px] text-[#FAF6EE]/90 text-center max-w-sm">
      ${escapeHtml(activeMode.hint)}
    </span>
  `;

  const viewportHtml = canTapViewportToStart
    ? `
      <button
        type="button"
        data-action="start-camera-scan"
        aria-label="Start camera in ${escapeHtml(activeMode.label)} mode"
        class="group w-full relative h-60 sm:h-72 rounded-2xl bg-night-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-linen-200 dark:border-night-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.995]"
      >
        ${viewportInnerHtml}
      </button>
    `
    : `
      <div class="w-full relative h-60 sm:h-72 rounded-2xl bg-night-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-linen-200 dark:border-night-700">
        ${viewportInnerHtml}
      </div>
    `;

  const support = scannerState.support;
  const compatibilityDetailsHtml = support
    ? `
      <details class="text-xs text-stone-ink dark:text-slate-400 pt-1">
        <summary class="cursor-pointer font-medium hover:text-forest-900 dark:hover:text-white select-none">
          Scanner compatibility · ${escapeHtml(support.barcodeEngineLabel)}
        </summary>
        <div class="mt-2 space-y-1 text-[11px] leading-relaxed">
          <p>
            Camera API: <strong class="text-forest-900 dark:text-slate-200">${
              support.cameraApi ? 'Available' : 'Fallback to Upload'
            }</strong> ·
            Barcode: <strong class="text-forest-900 dark:text-slate-200">${escapeHtml(
              support.barcodeEngineLabel
            )}</strong> ·
            OCR: <strong class="text-forest-900 dark:text-slate-200">${
              support.webAssembly ? 'Tesseract WASM Ready' : 'Unavailable'
            }</strong>
          </p>
          <p>
            Chrome/Android use hardware <code>BarcodeDetector</code>; iOS Safari, Firefox, and desktop browsers fall back to pure-JS ZXing + Tesseract WebAssembly OCR.
          </p>
        </div>
      </details>
    `
    : '';

  return `
    <section aria-label="Camera and photo scanner" class="space-y-3">
      <!-- Compact 3-Mode Frame Switcher -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex flex-1 items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 max-w-md">
          ${modeTabsHtml}
        </div>
        <span class="hidden sm:inline text-xs text-stone-ink dark:text-slate-400">
          ${escapeHtml(activeMode.caption)}
        </span>
      </div>

      <!-- Tap-to-Start Barcode / OCR / Cover Viewport -->
      ${viewportHtml}

      <!-- Concise Live Status -->
      <div class="flex items-center justify-between gap-2 text-xs">
        <p role="status" aria-live="polite" class="font-medium truncate ${
          isLocked
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-forest-900 dark:text-slate-300'
        }">
          ${escapeHtml(scannerState.statusMessage)}
        </p>
        <span class="sm:hidden text-[11px] text-stone-ink dark:text-slate-400 shrink-0">
          ${escapeHtml(activeMode.caption)}
        </span>
      </div>

      ${
        scannerState.ignoredHint
          ? `<p class="text-xs text-amber-800 dark:text-amber-300">${escapeHtml(
              scannerState.ignoredHint
            )}</p>`
          : ''
      }

      ${
        scannerState.errorMessage
          ? `
            <div role="alert" class="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <p class="text-xs font-medium text-rose-800 dark:text-rose-200">
                ${escapeHtml(scannerState.errorMessage)}
              </p>
              <button
                type="button"
                data-action="select-intake-tab"
                data-intake-tab="isbn"
                class="min-h-[40px] px-3 py-1.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white whitespace-nowrap shrink-0"
              >
                Type ISBN
              </button>
            </div>
          `
          : ''
      }

      <!-- Compact Camera & Photo Controls -->
      <div class="flex flex-wrap items-center gap-2.5">
        ${
          isStreaming
            ? `
              <button
                type="button"
                data-action="stop-camera-scan"
                class="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('close', 'w-4 h-4')}
                Stop
              </button>
              ${
                uiState.scanMode === 'cover' || uiState.scanMode === 'isbn-ocr'
                  ? `
                    <button
                      type="button"
                      data-action="capture-live-frame"
                      class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      ${renderIcon('camera', 'w-4 h-4')}
                      ${uiState.scanMode === 'cover' ? 'Capture Cover' : 'Read ISBN'}
                    </button>
                  `
                  : ''
              }
              <button
                type="button"
                data-action="flip-camera"
                class="min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('flip', 'w-4 h-4')}
                Flip
              </button>
            `
            : `
              <button
                type="button"
                data-action="start-camera-scan"
                ${isStarting || isAnalyzingUpload ? 'disabled' : ''}
                class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('camera', 'w-4 h-4')}
                ${isStarting ? 'Starting…' : 'Start Camera'}
              </button>
            `
        }

        <label
          for="scan-photo-upload-input"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          ${renderIcon('photo', 'w-4 h-4')}
          Upload Photo
          <input
            id="scan-photo-upload-input"
            type="file"
            accept="image/*"
            class="sr-only"
          />
        </label>

        ${
          isLocked || scannerState.uploadedPreviewUrl
            ? `
              <button
                type="button"
                data-action="reset-scanner"
                class="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                Clear
              </button>
            `
            : ''
        }
      </div>

      ${compatibilityDetailsHtml}
    </section>
  `;
}

/**
 * Renders the warm editorial Scan & Add Books view.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   uiState: {
 *     intakeTab: IntakeTab,
 *     isbnInput: string,
 *     isbnLoading: boolean,
 *     isbnError: string,
 *     isbnNotFound: string,
 *     isbnCandidate: import('../catalog/normalizer.js').BookCandidate | null,
 *     isbnProviderWarnings: string[],
 *     lastScanLockBanner: string,
 *     titleQuery: string,
 *     authorQuery: string,
 *     searchLoading: boolean,
 *     searchError: string,
 *     searchHasRun: boolean,
 *     searchCandidates: import('../catalog/normalizer.js').BookCandidate[],
 *     searchProviderWarnings: string[],
 *     manualDraft: {
 *       title: string,
 *       authors: string,
 *       isbn: string,
 *       publishedYear: string,
 *       pageCount: string,
 *       coverUrl: string,
 *       format: import('../../types/models.js').BookFormat,
 *       readingStage: import('../../types/models.js').ReadingStage,
 *       ageMin: number,
 *       ageMax: number,
 *       tags: string,
 *       sources?: import('../../types/models.js').ProviderSource[]
 *     },
 *     scanMode: import('../../types/models.js').ScanMode,
 *     formError: string
 *   },
 *   scannerState: ReturnType<ReturnType<typeof import('./scanner-controller.js').createScannerController>['getState']>
 * }} params
 * @returns {string}
 */
export function renderScanShellView({ state, uiState, scannerState }) {
  const ownedIsbns = new Set(state.books.map((b) => b.isbn13).filter(Boolean));

  const tabs = /** @type {Array<{ id: IntakeTab, label: string }>} */ ([
    { id: 'scanner', label: 'Scan' },
    { id: 'search', label: 'Search' },
    { id: 'isbn', label: 'ISBN' },
    { id: 'manual', label: 'Manual' },
  ]);

  const intakeTabsHtml = tabs
    .map((tab) => {
      const selected = uiState.intakeTab === tab.id;
      return `
        <button
          type="button"
          data-action="select-intake-tab"
          data-intake-tab="${tab.id}"
          aria-pressed="${selected ? 'true' : 'false'}"
          class="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            selected
              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(tab.label)}
        </button>
      `;
    })
    .join('');

  const scanHandoffBannerHtml = uiState.lastScanLockBanner
    ? `
      <div class="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 px-4 py-3 flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-emerald-900 dark:text-emerald-200">
          ${escapeHtml(uiState.lastScanLockBanner)}
        </p>
        <button
          type="button"
          data-action="scan-another-book"
          class="min-h-[38px] px-3 py-1.5 rounded-xl bg-ivory dark:bg-night-900 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0"
        >
          Scan Another
        </button>
      </div>
    `
    : '';

  let activePanelHtml = '';

  if (uiState.intakeTab === 'scanner') {
    activePanelHtml = renderScannerPanel({ uiState, scannerState });
  } else if (uiState.intakeTab === 'search') {
    const warningsHtml =
      uiState.searchProviderWarnings.length > 0
        ? `
          <p class="text-xs text-amber-800 dark:text-amber-300">
            Partial provider response (${escapeHtml(
              uiState.searchProviderWarnings.join(', ')
            )} unavailable) — showing available results.
          </p>
        `
        : '';

    let resultsAreaHtml = '';
    if (uiState.searchLoading) {
      resultsAreaHtml = `
        <div role="status" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-6 text-center">
          <p class="text-sm font-medium text-forest-900 dark:text-slate-200">
            Searching Google Books & Open Library…
          </p>
        </div>
      `;
    } else if (uiState.searchError) {
      resultsAreaHtml = `
        <div role="alert" class="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p class="text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
            ${escapeHtml(uiState.searchError)}
          </p>
          <button
            type="button"
            data-action="select-intake-tab"
            data-intake-tab="manual"
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-ivory dark:bg-night-900 text-xs font-semibold text-forest-900 dark:text-white border border-linen-200 dark:border-night-700 whitespace-nowrap shrink-0"
          >
            Manual Form
          </button>
        </div>
      `;
    } else if (uiState.searchCandidates.length > 0) {
      resultsAreaHtml = `
        ${warningsHtml}
        <div class="flex items-center justify-between text-xs text-stone-ink dark:text-slate-400">
          <span>Matching editions</span>
          <span class="font-mono-tabular">${uiState.searchCandidates.length} found</span>
        </div>
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-1">
          ${uiState.searchCandidates
            .map((candidate, index) =>
              renderCandidateRow({
                candidate,
                index,
                alreadyOwned: Boolean(candidate.isbn13 && ownedIsbns.has(candidate.isbn13)),
                showRawToggle: state.settings.retainRawProviderPayloads,
              })
            )
            .join('')}
        </div>
      `;
    } else if (uiState.searchHasRun) {
      resultsAreaHtml = `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-6 text-center">
          <p class="text-sm font-semibold text-forest-900 dark:text-slate-200">
            No matching books found
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-1">
            Try fewer title keywords or add the book in the Manual tab.
          </p>
        </div>
      `;
    } else {
      resultsAreaHtml = `
        <p class="text-xs text-stone-ink dark:text-slate-400">
          Searches Google Books and Open Library together with automatic ISBN deduplication.
        </p>
      `;
    }

    activePanelHtml = `
      <section aria-label="Search by title or author" class="space-y-3.5">
        <form id="provider-search-form" class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div class="sm:col-span-6">
            <label for="provider-title-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
              Title or Keywords
            </label>
            <input
              id="provider-title-input"
              name="query"
              type="search"
              value="${escapeHtml(uiState.titleQuery)}"
              placeholder="e.g., Stellaluna, Corduroy"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
          <div class="sm:col-span-4">
            <label for="provider-author-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
              Author (optional)
            </label>
            <input
              id="provider-author-input"
              name="author"
              type="search"
              value="${escapeHtml(uiState.authorQuery)}"
              placeholder="e.g., Arnold Lobel"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
          <div class="sm:col-span-2 flex items-end">
            <button
              type="submit"
              class="w-full min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </form>

        ${resultsAreaHtml}
      </section>
    `;
  } else if (uiState.intakeTab === 'isbn') {
    const sampleButtonsHtml = SAMPLE_ISBNS.map(
      (item) => `
        <button
          type="button"
          data-action="fill-sample-isbn"
          data-isbn="${item.isbn}"
          class="min-h-[36px] px-2.5 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-medium text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
        >
          ${escapeHtml(item.label)} (${item.isbn})
        </button>
      `
    ).join('');

    let isbnResultHtml = '';
    if (uiState.isbnLoading) {
      isbnResultHtml = `
        <div role="status" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 text-center">
          <p class="text-sm font-medium text-forest-900 dark:text-slate-200">
            Verifying ISBN checksum & fetching metadata…
          </p>
        </div>
      `;
    } else if (uiState.isbnError) {
      isbnResultHtml = `
        <div role="alert" class="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
          ${escapeHtml(uiState.isbnError)}
        </div>
      `;
    } else if (uiState.isbnCandidate) {
      isbnResultHtml = `
        <div class="space-y-2">
          ${
            uiState.isbnProviderWarnings.length > 0
              ? `<p class="text-xs text-amber-800 dark:text-amber-300">Note: ${escapeHtml(
                  uiState.isbnProviderWarnings.join(', ')
                )} did not respond; enriched from remaining provider.</p>`
              : ''
          }
          <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-1">
            ${renderCandidateRow({
              candidate: uiState.isbnCandidate,
              index: -1,
              alreadyOwned: Boolean(
                uiState.isbnCandidate.isbn13 && ownedIsbns.has(uiState.isbnCandidate.isbn13)
              ),
              showRawToggle: state.settings.retainRawProviderPayloads,
            })}
          </div>
        </div>
      `;
    } else if (uiState.isbnNotFound) {
      isbnResultHtml = `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              No external record for ISBN <span class="font-mono-tabular">${escapeHtml(
                uiState.isbnNotFound
              )}</span>
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Valid check digit — finish adding this edition manually with the ISBN pre-filled.
            </p>
          </div>
          <button
            type="button"
            data-action="prefill-manual-isbn"
            data-isbn="${escapeHtml(uiState.isbnNotFound)}"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Complete Manually
          </button>
        </div>
      `;
    }

    activePanelHtml = `
      <section aria-label="Lookup by ISBN" class="space-y-3.5">
        <form id="isbn-lookup-form" class="flex flex-col sm:flex-row gap-2.5">
          <div class="flex-1">
            <label for="isbn-lookup-input" class="sr-only">ISBN-13 or ISBN-10</label>
            <input
              id="isbn-lookup-input"
              name="isbn"
              type="text"
              inputmode="text"
              value="${escapeHtml(uiState.isbnInput)}"
              placeholder="Enter ISBN (e.g., 978-0-14-050174-2)"
              class="w-full min-h-[46px] px-4 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
          <button
            type="submit"
            class="min-h-[46px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Look Up ISBN
          </button>
        </form>

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-stone-ink dark:text-slate-400">Sample ISBNs:</span>
          ${sampleButtonsHtml}
        </div>

        ${isbnResultHtml}
      </section>
    `;
  } else {
    const draft = uiState.manualDraft;
    const provenanceNote =
      draft.sources && draft.sources.length > 0
        ? `<p class="text-xs text-forest-700 dark:text-[#5ED3DA]">Pre-filled from ${escapeHtml(
            draft.sources.map((s) => s.provider).join(' + ')
          )} — review any field before saving.</p>`
        : `<p class="text-xs text-stone-ink dark:text-slate-400">Add vintage, unnumbered, or custom books offline.</p>`;

    activePanelHtml = `
      <section aria-labelledby="manual-intake-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-4">
        <div class="pb-3 border-b border-linen-200 dark:border-night-800 flex items-start justify-between gap-3">
          <div>
            <h2 id="manual-intake-heading" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              Manual Book Entry
            </h2>
            ${provenanceNote}
          </div>
          <button
            type="button"
            data-action="clear-manual-draft"
            class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0"
          >
            Clear
          </button>
        </div>

        ${
          uiState.formError
            ? `
              <div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs font-medium text-rose-800 dark:text-rose-200">
                ${escapeHtml(uiState.formError)}
              </div>
            `
            : ''
        }

        <form id="manual-book-form" class="space-y-3.5" novalidate>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div class="sm:col-span-2">
              <label for="book-title" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Book Title *
              </label>
              <input
                id="book-title"
                name="title"
                type="text"
                required
                value="${escapeHtml(draft.title)}"
                placeholder="e.g., Make Way for Ducklings"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-authors" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Author(s) (comma-separated)
              </label>
              <input
                id="book-authors"
                name="authors"
                type="text"
                value="${escapeHtml(draft.authors)}"
                placeholder="e.g., Robert McCloskey"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-isbn" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                ISBN-13 or ISBN-10 (optional)
              </label>
              <input
                id="book-isbn"
                name="isbn"
                type="text"
                inputmode="text"
                value="${escapeHtml(draft.isbn)}"
                placeholder="978-0-670-45149-4"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-year" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Published Year
              </label>
              <input
                id="book-year"
                name="publishedYear"
                type="number"
                min="1800"
                max="2100"
                value="${escapeHtml(draft.publishedYear)}"
                placeholder="1941"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-pages" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Page Count
              </label>
              <input
                id="book-pages"
                name="pageCount"
                type="number"
                min="1"
                max="2000"
                value="${escapeHtml(draft.pageCount)}"
                placeholder="64"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-format" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Binding Format
              </label>
              <select
                id="book-format"
                name="format"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="hardcover" ${draft.format === 'hardcover' ? 'selected' : ''}>Hardcover</option>
                <option value="board-book" ${draft.format === 'board-book' ? 'selected' : ''}>Board Book</option>
                <option value="paperback" ${draft.format === 'paperback' ? 'selected' : ''}>Paperback</option>
              </select>
            </div>

            <div>
              <label for="book-stage" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Reading Stage
              </label>
              <select
                id="book-stage"
                name="readingStage"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="picture-book" ${draft.readingStage === 'picture-book' ? 'selected' : ''}>Picture Book</option>
                <option value="board-toddler" ${draft.readingStage === 'board-toddler' ? 'selected' : ''}>Board & Toddler</option>
                <option value="early-reader" ${draft.readingStage === 'early-reader' ? 'selected' : ''}>Early Reader</option>
                <option value="chapter-book" ${draft.readingStage === 'chapter-book' ? 'selected' : ''}>Chapter Book</option>
              </select>
            </div>

            <div>
              <label for="book-age-min" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Min Age (years)
              </label>
              <input
                id="book-age-min"
                name="ageMin"
                type="number"
                min="0"
                max="14"
                value="${draft.ageMin}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-age-max" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Max Age (years)
              </label>
              <input
                id="book-age-max"
                name="ageMax"
                type="number"
                min="1"
                max="16"
                value="${draft.ageMax}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="book-cover-url" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                HTTPS Cover Image URL (optional)
              </label>
              <input
                id="book-cover-url"
                name="coverUrl"
                type="url"
                value="${escapeHtml(draft.coverUrl)}"
                placeholder="https://covers.openlibrary.org/..."
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div class="sm:col-span-2">
              <div class="flex items-center justify-between gap-2 mb-1">
                <label for="book-tags" class="block text-xs font-semibold text-forest-900 dark:text-slate-300">
                  Topics & Themes (comma-separated)
                </label>
                <button
                  type="button"
                  data-action="suggest-draft-tags"
                  class="min-h-[34px] px-2.5 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  ${renderIcon('sparkles', 'w-3.5 h-3.5')}
                  Suggest Tags
                </button>
              </div>
              <input
                id="book-tags"
                name="tags"
                type="text"
                value="${escapeHtml(draft.tags)}"
                placeholder="animals, christmas, winter, family, bedtime"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="pt-1 flex items-center justify-end">
            <button
              type="submit"
              class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              ${renderIcon('plus', 'w-4 h-4')}
              Save Book to Library
            </button>
          </div>
        </form>
      </section>
    `;
  }

  return `
    <div class="space-y-3.5">
      <div>
        <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
          Catalog Intake
        </p>
        <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
          Scan & Add Books
        </h1>
      </div>

      <!-- Segmented Intake Method Switcher -->
      <div class="flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 max-w-xl">
        ${intakeTabsHtml}
      </div>

      ${scanHandoffBannerHtml}

      ${activePanelHtml}
    </div>
  `;
}
