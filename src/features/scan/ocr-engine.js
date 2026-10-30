/**
 * @fileoverview Lazy-loaded Optical Character Recognition (OCR) adapter powered by `tesseract.js`.
 * Configures character whitelists and page segmentation modes tailored to:
 * - `isbn-ocr`: Narrow printed "ISBN 978-..." text line above book barcodes
 * - `cover`: Front/back book jacket text extraction (detects ISBN if present, or extracts title keywords)
 */

import { extractCoverTitleQuery, extractIsbnsFromText } from './isbn-extractor.js';

/**
 * @typedef {Object} OcrScanOutcome
 * @property {boolean} matchedIsbn - True when a valid ISBN-13 or ISBN-10 was extracted
 * @property {string} isbn13 - Verified 13-digit ISBN if matched
 * @property {string} [isbn10] - Optional 10-digit ISBN
 * @property {'exact' | 'ocr-repaired'} [confidence] - Extraction confidence
 * @property {string} rawText - Raw recognized text snippet
 * @property {string} suggestedTitleQuery - Extracted cover title query when no ISBN was found
 */

/**
 * Creates a lazy-initializing OCR engine wrapper with progress reporting and clean worker termination.
 *
 * @param {{
 *   workerFactory?: (onStatus?: (statusText: string) => void) => Promise<any>
 * }} [options]
 */
export function createOcrEngine(options = {}) {
  /** @type {any | null} */
  let workerInstance = null;
  /** @type {Promise<any> | null} */
  let workerInitPromise = null;
  /** @type {((msg: string) => void) | null} */
  let activeStatusListener = null;

  async function defaultWorkerFactory() {
    const TesseractModule = await import('tesseract.js');
    const createWorker =
      TesseractModule.createWorker ||
      (TesseractModule.default && TesseractModule.default.createWorker);

    if (typeof createWorker !== 'function') {
      throw new Error('OCR worker factory is unavailable in this environment.');
    }

    return createWorker('eng', 1, {
      logger: (message) => {
        if (activeStatusListener && message && typeof message.status === 'string') {
          const pct =
            typeof message.progress === 'number'
              ? ` (${Math.round(message.progress * 100)}%)`
              : '';
          activeStatusListener(`${message.status}${pct}`);
        }
      },
    });
  }

  const factory = options.workerFactory || defaultWorkerFactory;

  /**
   * Lazily boots the WebAssembly OCR worker only when the user runs an OCR scan.
   * @param {(statusText: string) => void} [onStatus]
   */
  async function getWorker(onStatus) {
    if (onStatus) activeStatusListener = onStatus;
    if (workerInstance) return workerInstance;
    if (!workerInitPromise) {
      workerInitPromise = factory(onStatus)
        .then((worker) => {
          workerInstance = worker;
          return worker;
        })
        .catch((err) => {
          workerInitPromise = null;
          throw err;
        });
    }
    return workerInitPromise;
  }

  /**
   * Runs OCR on a preprocessed canvas or image buffer and extracts verified ISBNs or cover title text.
   *
   * @param {HTMLCanvasElement | OffscreenCanvas | unknown} imageSource
   * @param {{
   *   mode: import('../../types/models.js').ScanMode,
   *   onStatus?: (statusText: string) => void
   * }} params
   * @returns {Promise<OcrScanOutcome>}
   */
  async function recognizeFrame(imageSource, { mode, onStatus }) {
    const worker = await getWorker(onStatus);

    if (typeof worker.setParameters === 'function') {
      if (mode === 'isbn-ocr') {
        await worker.setParameters({
          // PSM 6 = Assume a single uniform block of text; whitelist digits + ISBN letters + hyphens
          tessedit_pageseg_mode: '6',
          tessedit_char_whitelist: '0123456789XxISBNisbn-: ',
        });
      } else {
        await worker.setParameters({
          // PSM 3 = Fully automatic page segmentation for book covers / back jackets
          tessedit_pageseg_mode: '3',
          tessedit_char_whitelist: '',
        });
      }
    }

    const result = await worker.recognize(imageSource);
    const rawText = String(result?.data?.text || '').trim();
    const isbnMatches = extractIsbnsFromText(rawText);

    if (isbnMatches.length > 0) {
      const best = isbnMatches[0];
      return {
        matchedIsbn: true,
        isbn13: best.isbn13,
        isbn10: best.isbn10,
        confidence: best.confidence,
        rawText,
        suggestedTitleQuery: '',
      };
    }

    return {
      matchedIsbn: false,
      isbn13: '',
      rawText,
      suggestedTitleQuery: extractCoverTitleQuery(rawText),
    };
  }

  /**
   * Frees WebWorker memory when no longer needed.
   */
  async function terminate() {
    activeStatusListener = null;
    if (workerInstance && typeof workerInstance.terminate === 'function') {
      try {
        await workerInstance.terminate();
      } catch (_) {}
    }
    workerInstance = null;
    workerInitPromise = null;
  }

  return {
    recognizeFrame,
    terminate,
  };
}
