/**
 * @fileoverview Phase 3 Book Intake & Scanner Workspace:
 * 1) Live Camera + Gallery Upload Scanner with 3 distinct frame geometries:
 *    - `barcode`: Wide horizontal EAN-13 / Bookland ISBN target (Native BarcodeDetector + ZXing fallback)
 *    - `isbn-ocr`: Narrow single-line printed ISBN-13 / ISBN-10 target (Contrast-stretched Tesseract OCR)
 *    - `cover`: 3:4 portrait book jacket guide (Passive back-barcode + Capture Cover OCR title/ISBN handoff)
 *    Includes animated scan-line sweep on live & uploaded images, emerald detection-lock feedback,
 *    browser compatibility diagnostics, and graceful camera-denied fallbacks.
 * 2) Title / Author Search across Google Books + Open Library with debounced query & tap-to-select candidates
 * 3) ISBN-10 / ISBN-13 Auto-Lookup with multi-provider metadata merging & optional raw JSON inspector
 * 4) Manual / Pre-filled Book Editor for offline intake or fine-tuning enriched metadata
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
    caption: 'Wide horizontal EAN-13 / Bookland 978·979 target',
    frameClass: 'w-64 sm:w-80 h-24 sm:h-28 rounded-xl',
    hint: 'Center the back-cover ISBN barcode inside the wide guide.',
  },
  'isbn-ocr': {
    label: 'ISBN Text OCR',
    caption: 'Narrow single-line printed ISBN-13 / ISBN-10 guide',
    frameClass: 'w-64 sm:w-80 h-12 sm:h-14 rounded-lg',
    hint: 'Align only the printed "ISBN 978-..." digits inside the narrow text guide.',
  },
  cover: {
    label: 'Cover Frame',
    caption: '3:4 portrait jacket guide · OCR title/ISBN handoff (visual cover matching post-MVP)',
    frameClass: 'w-40 sm:w-48 h-52 sm:h-60 rounded-2xl',
    hint: 'Frame the book cover and tap Capture Cover (or Upload Photo) to extract title or ISBN.',
  },
};

const SAMPLE_ISBNS = [
  { isbn: '9780140501742', label: 'Corduroy' },
  { isbn: '9780064431781', label: 'Where the Wild Things Are' },
  { isbn: '9780399240461', label: 'The Gruffalo' },
];

/**
 * Renders a candidate card for search or ISBN lookup results using unboxed typographic metadata.
 * @param {{
 *   candidate: import('../catalog/normalizer.js').BookCandidate,
 *   index: number,
 *   alreadyOwned: boolean,
 *   showRawToggle: boolean
 * }} params
 * @returns {string}
 */
function renderCandidateCard({ candidate, index, alreadyOwned, showRawToggle }) {
  const pseudoBook = /** @type {import('../../types/models.js').Book} */ ({
    ...candidate,
    id: `cand_${index}`,
    addedAt: '',
  });

  const sourceNames = candidate.sources.map((s) => s.provider).join(' + ');
  const hasRaw =
    showRawToggle && candidate.sources.some((s) => Boolean(s.rawPayload));

  return `
    <article class="rounded-2xl bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col gap-3">
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3.5 min-w-0">
          ${renderBookCover(pseudoBook, 'md')}
          <div class="min-w-0">
            <h3 class="font-display text-base font-semibold text-slate-900 dark:text-white leading-snug">
              ${escapeHtml(candidate.title)}
            </h3>
            <p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
              ${escapeHtml(candidate.authors.join(', '))}
            </p>

            <!-- Unboxed typographic metadata with subtle separators -->
            <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
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
              ${
                candidate.pageCount
                  ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${candidate.pageCount} pp</span>`
                  : ''
              }
            </div>

            <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              ${
                candidate.isbn13
                  ? `<span class="font-mono-tabular">ISBN ${escapeHtml(candidate.isbn13)}</span><span aria-hidden="true">·</span>`
                  : ''
              }
              <span>Source: ${escapeHtml(sourceNames)}</span>
            </div>

            ${
              candidate.readingLevelHint
                ? `<p class="text-[11px] text-teal-700 dark:text-teal-400 mt-1">${escapeHtml(
                    candidate.readingLevelHint
                  )}</p>`
                : ''
            }

            ${
              candidate.tags.length
                ? `<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Topics: ${escapeHtml(
                    candidate.tags.join(' · ')
                  )}</p>`
                : ''
            }
          </div>
        </div>
      </div>

      <div class="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2.5">
        ${
          alreadyOwned
            ? `<span class="text-xs font-semibold text-teal-700 dark:text-teal-400 px-2 py-1">Already in Family Library</span>`
            : `
              <button
                type="button"
                data-action="edit-candidate"
                data-candidate-index="${index}"
                class="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                Review & Edit
              </button>
              <button
                type="button"
                data-action="add-candidate"
                data-candidate-index="${index}"
                class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
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
            <details class="text-xs text-slate-600 dark:text-slate-400 pt-1">
              <summary class="cursor-pointer font-semibold hover:text-slate-900 dark:hover:text-white">
                Raw Provider Payload (${escapeHtml(sourceNames)})
              </summary>
              <pre class="mt-2 p-3 rounded-xl bg-slate-900 text-slate-100 font-mono-tabular text-[11px] overflow-x-auto max-h-56">${escapeHtml(
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
 * Renders the Phase 3 Camera & Gallery Upload Scanner panel with 3 distinct frame guides,
 * animated scan sweep overlay, emerald lock transition, and compatibility diagnostics.
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
          class="flex-1 min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
            selected
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(SCAN_MODES[modeKey].label)}
        </button>
      `;
    })
    .join('');

  const frameBorderClasses = isLocked
    ? 'border-emerald-400 bg-emerald-950/25 shadow-[0_0_0_4px_rgba(16,185,129,0.28)]'
    : isActiveSweep
      ? 'border-teal-300/95 shadow-[0_0_0_9999px_rgba(2,6,23,0.48)]'
      : 'border-white/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.38)]';

  const sweepLineClasses = isLocked
    ? 'bg-emerald-400 top-1/2 -translate-y-1/2 h-0.5 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
    : isActiveSweep
      ? 'bg-teal-400 top-0 h-0.5 shadow-[0_0_12px_rgba(45,212,191,0.95)] animate-scan-sweep'
      : 'bg-white/40 top-1/2 -translate-y-1/2 h-px';

  let lockReadoutText = activeMode.label;
  if (isLocked && scannerState.lock) {
    lockReadoutText =
      scannerState.lock.kind === 'isbn'
        ? `LOCKED · ISBN ${scannerState.lock.isbn13}`
        : `LOCKED · "${scannerState.lock.titleQuery}"`;
  } else if (isAnalyzingUpload) {
    lockReadoutText = 'SCANNING UPLOADED PHOTO…';
  } else if (isStarting) {
    lockReadoutText = 'STARTING CAMERA…';
  }

  const support = scannerState.support;
  const compatibilityLine = support
    ? `
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>Camera API: <strong class="font-medium text-slate-700 dark:text-slate-200">${
          support.cameraApi ? 'Available' : 'Fallback to Upload'
        }</strong></span>
        <span aria-hidden="true">·</span>
        <span>Barcode: <strong class="font-medium text-slate-700 dark:text-slate-200">${escapeHtml(
          support.barcodeEngineLabel
        )}</strong></span>
        <span aria-hidden="true">·</span>
        <span>OCR: <strong class="font-medium text-slate-700 dark:text-slate-200">${
          support.webAssembly ? 'Tesseract WASM Ready' : 'Unavailable'
        }</strong></span>
      </div>
    `
    : '';

  return `
    <section aria-labelledby="scan-frame-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
      <div class="pb-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 id="scan-frame-heading" class="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Scan Barcode, ISBN Line, or Cover
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Use your phone’s rear camera or upload a photo from your library with automatic ISBN checksum verification.
          </p>
        </div>
      </div>

      <!-- 3-Mode Scan Frame Switcher -->
      <div class="mt-4 flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 max-w-xl">
        ${modeTabsHtml}
      </div>

      <!-- Camera / Uploaded Photo Viewport with Mode-Specific Guide & Detection Lock -->
      <div class="mt-4 relative h-72 sm:h-80 rounded-2xl bg-slate-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-slate-800">
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
                class="absolute inset-0 w-full h-full object-contain bg-slate-950"
              />`
            : ''
        }

        <!-- Mode-specific target frame with animated sweep line & emerald lock feedback -->
        <div
          data-scan-guide="${escapeHtml(uiState.scanMode)}"
          data-scan-locked="${isLocked ? 'true' : 'false'}"
          class="relative z-10 flex items-center justify-center border-2 ${frameBorderClasses} ${activeMode.frameClass} transition-all duration-150 overflow-hidden"
        >
          <div class="absolute inset-x-2 ${sweepLineClasses}"></div>

          <span class="px-2.5 py-1 rounded-md bg-slate-950/75 text-[11px] font-mono-tabular tracking-wide text-center ${
            isLocked ? 'text-emerald-300 font-semibold' : 'text-slate-200'
          }">
            ${escapeHtml(lockReadoutText)}
          </span>
        </div>

        <p class="relative z-10 mt-4 px-3 py-1 rounded-lg bg-slate-950/75 text-xs text-slate-200 text-center max-w-md">
          ${escapeHtml(activeMode.hint)}
        </p>
      </div>

      <!-- Live Status & Detection / Non-ISBN Feedback -->
      <div class="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <p role="status" aria-live="polite" class="font-medium ${
          isLocked
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-slate-700 dark:text-slate-300'
        }">
          ${escapeHtml(scannerState.statusMessage)}
        </p>
        <span class="text-slate-500 dark:text-slate-400">
          ${escapeHtml(activeMode.caption)}
        </span>
      </div>

      ${
        scannerState.ignoredHint
          ? `
            <p class="mt-2 text-xs text-amber-700 dark:text-amber-300">
              ${escapeHtml(scannerState.ignoredHint)}
            </p>
          `
          : ''
      }

      ${
        scannerState.errorMessage
          ? `
            <div role="alert" class="mt-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p class="text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
                ${escapeHtml(scannerState.errorMessage)}
              </p>
              <div class="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  data-action="select-intake-tab"
                  data-intake-tab="isbn"
                  class="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap"
                >
                  Type ISBN
                </button>
              </div>
            </div>
          `
          : ''
      }

      <!-- Primary Camera & Gallery Upload Controls -->
      <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
        ${
          isStreaming
            ? `
              <button
                type="button"
                data-action="stop-camera-scan"
                class="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                ${renderIcon('close', 'w-4 h-4')}
                Stop Camera
              </button>
              ${
                uiState.scanMode === 'cover' || uiState.scanMode === 'isbn-ocr'
                  ? `
                    <button
                      type="button"
                      data-action="capture-live-frame"
                      class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      ${renderIcon('camera', 'w-4 h-4')}
                      ${uiState.scanMode === 'cover' ? 'Capture Cover' : 'Read ISBN Now'}
                    </button>
                  `
                  : ''
              }
              <button
                type="button"
                data-action="flip-camera"
                class="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('flip', 'w-4 h-4')}
                Flip Camera
              </button>
            `
            : `
              <button
                type="button"
                data-action="start-camera-scan"
                ${isStarting || isAnalyzingUpload ? 'disabled' : ''}
                class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap"
              >
                ${renderIcon('camera', 'w-4 h-4')}
                ${isStarting ? 'Starting Camera…' : 'Start Camera'}
              </button>
            `
        }

        <label
          for="scan-photo-upload-input"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
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
                class="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap"
              >
                Clear Scan
              </button>
            `
            : ''
        }
      </div>

      <!-- Browser Compatibility & Graceful Degradation Notes -->
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
        ${compatibilityLine}
        <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Compatibility note: Chrome/Android use hardware <code>BarcodeDetector</code>; iOS Safari, Firefox, and desktop browsers automatically fall back to pure-JS ZXing barcode decoding + Tesseract WebAssembly OCR. Visual cover-artwork similarity matching is reserved for a post-MVP phase; Cover mode currently extracts printed cover titles or back-jacket ISBNs via OCR.
        </p>
      </div>
    </section>
  `;
}

/**
 * Renders the Phase 3 Intake & Scan view.
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
      <div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 px-4 py-3 flex items-center justify-between gap-3">
        <p class="text-xs sm:text-sm font-medium text-emerald-900 dark:text-emerald-200">
          ${escapeHtml(uiState.lastScanLockBanner)}
        </p>
        <button
          type="button"
          data-action="scan-another-book"
          class="min-h-[38px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0"
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
          <p class="text-xs text-amber-700 dark:text-amber-300 mt-3">
            Partial provider response (${escapeHtml(
              uiState.searchProviderWarnings.join(', ')
            )} unavailable) — showing available results.
          </p>
        `
        : '';

    let resultsAreaHtml = '';
    if (uiState.searchLoading) {
      resultsAreaHtml = `
        <div role="status" class="mt-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            Searching Google Books & Open Library…
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Normalizing editions, ISBNs, and reading stages.
          </p>
        </div>
      `;
    } else if (uiState.searchError) {
      resultsAreaHtml = `
        <div role="alert" class="mt-5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p class="text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
            ${escapeHtml(uiState.searchError)}
          </p>
          <button
            type="button"
            data-action="select-intake-tab"
            data-intake-tab="manual"
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0"
          >
            Open Manual Form
          </button>
        </div>
      `;
    } else if (uiState.searchCandidates.length > 0) {
      resultsAreaHtml = `
        ${warningsHtml}
        <div class="mt-5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Select a matching edition to add directly or review its fields first:</span>
          <span class="font-mono-tabular">${uiState.searchCandidates.length} candidates</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          ${uiState.searchCandidates
            .map((candidate, index) =>
              renderCandidateCard({
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
        <div class="mt-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 text-center">
          <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No matching books found for that query.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Try fewer title keywords, check spelling, or switch to the Manual Form tab.
          </p>
        </div>
      `;
    } else {
      resultsAreaHtml = `
        <div class="mt-6 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/70 dark:border-slate-800 p-6 text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
            Type a children’s book title or author above to search Google Books & Open Library together.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Results are automatically deduplicated by ISBN and enriched with age & topic hints.
          </p>
        </div>
      `;
    }

    activePanelHtml = `
      <section aria-labelledby="title-search-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <div class="pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 id="title-search-heading" class="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Search by Title or Author
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Queries Google Books and Open Library in parallel with automatic deduplication and local response caching.
          </p>
        </div>

        <form id="provider-search-form" class="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div class="sm:col-span-6">
            <label for="provider-title-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Title or Keywords
            </label>
            <input
              id="provider-title-input"
              name="query"
              type="search"
              value="${escapeHtml(uiState.titleQuery)}"
              placeholder="e.g., Stellaluna, Frog and Toad, Corduroy"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
            />
          </div>
          <div class="sm:col-span-4">
            <label for="provider-author-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Author (optional)
            </label>
            <input
              id="provider-author-input"
              name="author"
              type="search"
              value="${escapeHtml(uiState.authorQuery)}"
              placeholder="e.g., Arnold Lobel"
              class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
            />
          </div>
          <div class="sm:col-span-2 flex items-end">
            <button
              type="submit"
              class="w-full min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
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
          class="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
        >
          ${escapeHtml(item.label)} (${item.isbn})
        </button>
      `
    ).join('');

    let isbnResultHtml = '';
    if (uiState.isbnLoading) {
      isbnResultHtml = `
        <div role="status" class="mt-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            Verifying ISBN checksum & fetching metadata…
          </p>
        </div>
      `;
    } else if (uiState.isbnError) {
      isbnResultHtml = `
        <div role="alert" class="mt-5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
          ${escapeHtml(uiState.isbnError)}
        </div>
      `;
    } else if (uiState.isbnCandidate) {
      isbnResultHtml = `
        <div class="mt-5 space-y-2">
          ${
            uiState.isbnProviderWarnings.length > 0
              ? `<p class="text-xs text-amber-700 dark:text-amber-300">Note: ${escapeHtml(
                  uiState.isbnProviderWarnings.join(', ')
                )} did not respond; enriched from remaining provider.</p>`
              : ''
          }
          ${renderCandidateCard({
            candidate: uiState.isbnCandidate,
            index: -1,
            alreadyOwned: Boolean(
              uiState.isbnCandidate.isbn13 && ownedIsbns.has(uiState.isbnCandidate.isbn13)
            ),
            showRawToggle: state.settings.retainRawProviderPayloads,
          })}
        </div>
      `;
    } else if (uiState.isbnNotFound) {
      isbnResultHtml = `
        <div class="mt-5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
              No external record found for ISBN <span class="font-mono-tabular">${escapeHtml(
                uiState.isbnNotFound
              )}</span>
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              The ISBN check digit is valid, so you can finish adding this edition manually with the ISBN pre-filled.
            </p>
          </div>
          <button
            type="button"
            data-action="prefill-manual-isbn"
            data-isbn="${escapeHtml(uiState.isbnNotFound)}"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Complete Manually
          </button>
        </div>
      `;
    }

    activePanelHtml = `
      <section aria-labelledby="isbn-lookup-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <div class="pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 id="isbn-lookup-heading" class="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Lookup by ISBN-13 or ISBN-10
          </h2>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Validates check digits locally, converts ISBN-10 to ISBN-13, and merges metadata from Google Books and Open Library.
          </p>
        </div>

        <form id="isbn-lookup-form" class="mt-4 flex flex-col sm:flex-row gap-3">
          <div class="flex-1">
            <label for="isbn-lookup-input" class="sr-only">ISBN-13 or ISBN-10</label>
            <input
              id="isbn-lookup-input"
              name="isbn"
              type="text"
              inputmode="text"
              value="${escapeHtml(uiState.isbnInput)}"
              placeholder="Enter ISBN (e.g., 978-0-14-050174-2 or 0064431789)"
              class="w-full min-h-[48px] px-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
            />
          </div>
          <button
            type="submit"
            class="min-h-[48px] px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Look Up ISBN
          </button>
        </form>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <span class="text-xs text-slate-500 dark:text-slate-400">Quick test ISBNs:</span>
          ${sampleButtonsHtml}
        </div>

        ${isbnResultHtml}
      </section>
    `;
  } else {
    const draft = uiState.manualDraft;
    const provenanceNote =
      draft.sources && draft.sources.length > 0
        ? `<p class="text-xs text-teal-700 dark:text-teal-400 mt-1">Pre-filled from ${escapeHtml(
            draft.sources.map((s) => s.provider).join(' + ')
          )} — edit any field before saving.</p>`
        : `<p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Add vintage, unnumbered, or custom books completely offline.</p>`;

    activePanelHtml = `
      <section aria-labelledby="manual-intake-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <div class="pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div>
            <h2 id="manual-intake-heading" class="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Manual & Review Book Editor
            </h2>
            ${provenanceNote}
          </div>
          <button
            type="button"
            data-action="clear-manual-draft"
            class="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0"
          >
            Clear Fields
          </button>
        </div>

        ${
          uiState.formError
            ? `
              <div role="alert" class="mt-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
                ${escapeHtml(uiState.formError)}
              </div>
            `
            : ''
        }

        <form id="manual-book-form" class="mt-5 space-y-4" novalidate>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label for="book-title" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Book Title *
              </label>
              <input
                id="book-title"
                name="title"
                type="text"
                required
                value="${escapeHtml(draft.title)}"
                placeholder="e.g., Make Way for Ducklings"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="book-authors" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Author(s) (comma-separated)
              </label>
              <input
                id="book-authors"
                name="authors"
                type="text"
                value="${escapeHtml(draft.authors)}"
                placeholder="e.g., Robert McCloskey"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="book-isbn" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                ISBN-13 or ISBN-10 (optional)
              </label>
              <input
                id="book-isbn"
                name="isbn"
                type="text"
                inputmode="text"
                value="${escapeHtml(draft.isbn)}"
                placeholder="978-0-670-45149-4"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="book-year" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
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
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="book-pages" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
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
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="book-format" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Binding Format
              </label>
              <select
                id="book-format"
                name="format"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              >
                <option value="hardcover" ${draft.format === 'hardcover' ? 'selected' : ''}>Hardcover</option>
                <option value="board-book" ${draft.format === 'board-book' ? 'selected' : ''}>Board Book</option>
                <option value="paperback" ${draft.format === 'paperback' ? 'selected' : ''}>Paperback</option>
              </select>
            </div>

            <div>
              <label for="book-stage" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Reading Stage
              </label>
              <select
                id="book-stage"
                name="readingStage"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              >
                <option value="picture-book" ${draft.readingStage === 'picture-book' ? 'selected' : ''}>Picture Book</option>
                <option value="board-toddler" ${draft.readingStage === 'board-toddler' ? 'selected' : ''}>Board & Toddler</option>
                <option value="early-reader" ${draft.readingStage === 'early-reader' ? 'selected' : ''}>Early Reader</option>
                <option value="chapter-book" ${draft.readingStage === 'chapter-book' ? 'selected' : ''}>Chapter Book</option>
              </select>
            </div>

            <div>
              <label for="book-age-min" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Min Age (years)
              </label>
              <input
                id="book-age-min"
                name="ageMin"
                type="number"
                min="0"
                max="14"
                value="${draft.ageMin}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="book-age-max" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Max Age (years)
              </label>
              <input
                id="book-age-max"
                name="ageMax"
                type="number"
                min="1"
                max="16"
                value="${draft.ageMax}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="book-cover-url" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                HTTPS Cover Image URL (optional)
              </label>
              <input
                id="book-cover-url"
                name="coverUrl"
                type="url"
                value="${escapeHtml(draft.coverUrl)}"
                placeholder="https://covers.openlibrary.org/..."
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div class="sm:col-span-2">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <label for="book-tags" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Topics & Themes (comma-separated)
                </label>
                <button
                  type="button"
                  data-action="suggest-draft-tags"
                  class="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  ${renderIcon('sparkles', 'w-3.5 h-3.5')}
                  Suggest Tags from Title
                </button>
              </div>
              <input
                id="book-tags"
                name="tags"
                type="text"
                value="${escapeHtml(draft.tags)}"
                placeholder="animals, christmas, winter, family, bedtime"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>
          </div>

          <div class="pt-2 flex flex-wrap items-center justify-end gap-3">
            <button
              type="submit"
              class="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
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
    <div class="space-y-4">
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
