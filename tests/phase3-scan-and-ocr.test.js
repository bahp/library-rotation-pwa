/**
 * @fileoverview Phase 3 unit & adapter tests covering:
 * - Noisy OCR ISBN-13 / ISBN-10 extraction & optical confusion repair (O->0, I/l->1, S->5, B->8)
 * - Bookland barcode validation (accepting 978/979 + 5-digit price add-ons, rejecting non-book retail EAN/UPC)
 * - Cover title keyword extraction fallback
 * - Dual-engine BarcodeDecoder (Native BarcodeDetector primary + ZXing pure-JS fallback)
 * - OCR Engine adapter parameter tuning & ISBN/cover extraction
 * - ROI crop geometry & contrast-stretching RGBA enhancement
 * - Graceful camera error messaging & browser capability probing
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCoverTitleQuery,
  extractIsbnsFromText,
  repairOcrIsbnToken,
  validateBarcodeAsIsbn,
} from '../src/features/scan/isbn-extractor.js';
import {
  computeModeCropBox,
  enhanceRgbaForOcr,
  getModeNormalizedRoi,
} from '../src/features/scan/frame-processor.js';
import {
  createBarcodeDecoder,
  rgbaToLuminanceBuffer,
} from '../src/features/scan/barcode-decoder.js';
import { createOcrEngine } from '../src/features/scan/ocr-engine.js';
import {
  describeCameraError,
  probeBrowserScanSupport,
} from '../src/features/scan/scanner-controller.js';

test('extractIsbnsFromText recovers clean and OCR-corrupted ISBN-13 and ISBN-10 strings', () => {
  // Exact hyphenated ISBN-13 + 5-digit price supplement on same line
  const cleanText = 'US $18.99 / CAN $24.99\nISBN 978-0-14-050174-2 51899\nPrinted in China';
  const cleanMatches = extractIsbnsFromText(cleanText);
  assert.equal(cleanMatches.length, 1);
  assert.equal(cleanMatches[0].isbn13, '9780140501742');
  assert.equal(cleanMatches[0].confidence, 'exact');

  // Noisy OCR where '0' became 'O', '1' became 'I' or 'l', and '5' became 'S'
  // Target ISBN: 9780140501742 -> 978-O-I4-OS0l74-2
  const noisyOcr = '1SBN-13: 978-O-I4-OS0l74-2';
  const repairedMatches = extractIsbnsFromText(noisyOcr);
  assert.equal(repairedMatches.length, 1);
  assert.equal(repairedMatches[0].isbn13, '9780140501742');
  assert.equal(repairedMatches[0].confidence, 'ocr-repaired');

  // Vintage ISBN-10 ending in 'X' (0-8044-2957-X -> valid check digit, converts to 9780804429573)
  const isbn10X = 'Library Edition ISBN 0-8044-2957-X';
  const isbn10Matches = extractIsbnsFromText(isbn10X);
  assert.equal(isbn10Matches.length, 1);
  assert.equal(isbn10Matches[0].isbn10, '080442957X');
  assert.equal(isbn10Matches[0].isbn13, '9780804429573');

  // Rejects random 13-digit numbers with invalid checksums
  const bogus = 'Order #9780140501749 Reference 1234567890';
  assert.equal(extractIsbnsFromText(bogus).length, 0);
});

test('repairOcrIsbnToken repairs common digit confusions while rejecting alphabetic words', () => {
  const ok = repairOcrIsbnToken('97B-O06-443I78-1');
  assert.equal(ok.repaired, true);
  assert.equal(ok.cleaned, '9780064431781');

  const word = repairOcrIsbnToken('CHILDRENS-BOOK');
  assert.equal(word.cleaned, '');
});

test('validateBarcodeAsIsbn accepts Bookland 978/979 & EAN+5 supplements and rejects non-book retail barcodes', () => {
  const stdBook = validateBarcodeAsIsbn('9780064431781');
  assert.equal(stdBook.valid, true);
  assert.equal(stdBook.isbn13, '9780064431781');

  const withPriceAddon = validateBarcodeAsIsbn('978039924046150999');
  assert.equal(withPriceAddon.valid, true);
  assert.equal(withPriceAddon.isbn13, '9780399240461');

  const cerealBoxEan = validateBarcodeAsIsbn('0016000275287');
  assert.equal(cerealBoxEan.valid, false);
  assert.match(cerealBoxEan.reason || '', /not a 978\/979 Bookland ISBN/i);
});

test('extractCoverTitleQuery filters publisher boilerplate and extracts prominent cover title lines', () => {
  const coverText = `
    NEW YORK TIMES BESTSELLER
    CALDECOTT MEDAL
    Where the Wild Things Are
    Story and Pictures by Maurice Sendak
    HARPERCOLLINS
  `;
  assert.equal(extractCoverTitleQuery(coverText), 'Where the Wild Things Are');
});

test('createBarcodeDecoder uses Native BarcodeDetector when available and falls back to ZXing pure-JS engine', async () => {
  // 1. Native BarcodeDetector skips non-ISBN retail code and locks onto valid Bookland ISBN
  class MockNativeBarcodeDetector {
    static async getSupportedFormats() {
      return ['ean_13', 'qr_code'];
    }
    async detect() {
      return [
        { rawValue: '0012345678905' }, // Non-book UPC/EAN -> ignored
        { rawValue: '9780140501742' }, // Corduroy ISBN-13 -> locked!
      ];
    }
  }

  const nativeDecoder = createBarcodeDecoder({
    globalScope: { BarcodeDetector: MockNativeBarcodeDetector },
    zxingDecodeFn: () => null,
  });

  const capsNative = await nativeDecoder.getCapabilities();
  assert.equal(capsNative.nativeBarcodeDetector, true);

  const dummyImageData = {
    data: new Uint8ClampedArray(16),
    width: 2,
    height: 2,
  };
  const nativeHit = await nativeDecoder.decodeFrame({
    canvas: /** @type {any} */ ({}),
    imageData: dummyImageData,
  });
  assert.equal(nativeHit.matched, true);
  assert.equal(nativeHit.isbn13, '9780140501742');
  assert.equal(nativeHit.engine, 'native-barcode-detector');

  // 2. Safari / Firefox environment without BarcodeDetector falls back seamlessly to ZXing
  const fallbackDecoder = createBarcodeDecoder({
    globalScope: {},
    zxingDecodeFn: () => '9780399240461',
  });

  const capsFallback = await fallbackDecoder.getCapabilities();
  assert.equal(capsFallback.nativeBarcodeDetector, false);

  const zxingHit = await fallbackDecoder.decodeFrame({
    imageData: dummyImageData,
  });
  assert.equal(zxingHit.matched, true);
  assert.equal(zxingHit.isbn13, '9780399240461');
  assert.equal(zxingHit.engine, 'zxing-js');
});

test('createOcrEngine configures single-line ISBN whitelist in isbn-ocr mode and extracts cover titles in cover mode', async () => {
  /** @type {Record<string, any>[]} */
  const appliedParams = [];
  let mockTextToReturn = 'ISBN 978-0-06-443178-1';

  const ocr = createOcrEngine({
    workerFactory: async () => ({
      /** @param {Record<string, any>} params */
      async setParameters(params) {
        appliedParams.push(params);
      },
      async recognize() {
        return { data: { text: mockTextToReturn } };
      },
      async terminate() {},
    }),
  });

  const isbnOutcome = await ocr.recognizeFrame({}, { mode: 'isbn-ocr' });
  assert.equal(isbnOutcome.matchedIsbn, true);
  assert.equal(isbnOutcome.isbn13, '9780064431781');
  assert.equal(appliedParams[0].tessedit_pageseg_mode, '6');
  assert.match(appliedParams[0].tessedit_char_whitelist, /ISBN/);

  mockTextToReturn = 'NEW YORK TIMES BESTSELLER\nCorduroy\nBy Don Freeman';
  const coverOutcome = await ocr.recognizeFrame({}, { mode: 'cover' });
  assert.equal(coverOutcome.matchedIsbn, false);
  assert.equal(coverOutcome.suggestedTitleQuery, 'Corduroy');
  assert.equal(appliedParams[1].tessedit_pageseg_mode, '3');

  await ocr.terminate();
});

test('computeModeCropBox and enhanceRgbaForOcr produce distinct scan mode ROIs and high-contrast grayscale buffers', () => {
  const barcodeRoi = getModeNormalizedRoi('barcode');
  const ocrRoi = getModeNormalizedRoi('isbn-ocr');
  const coverRoi = getModeNormalizedRoi('cover');

  // ISBN-OCR strip is narrower vertically than Barcode, which is shorter than 3:4 Cover Frame
  assert.ok(ocrRoi.height < barcodeRoi.height);
  assert.ok(barcodeRoi.height < coverRoi.height);

  const crop = computeModeCropBox({
    sourceWidth: 1280,
    sourceHeight: 720,
    mode: 'isbn-ocr',
    containerWidth: 640,
    containerHeight: 320,
  });
  assert.ok(crop.sw > 0 && crop.sh > 0);
  assert.ok(crop.sx >= 0 && crop.sy >= 0);
  assert.ok(crop.sx + crop.sw <= 1280);
  assert.ok(crop.sy + crop.sh <= 720);

  // Contrast stretching pushes dark ink darker and light paper brighter
  const pixels = new Uint8ClampedArray([
    60, 65, 70, 255, // dark ink pixel
    210, 212, 205, 255, // warm paper pixel
  ]);
  enhanceRgbaForOcr(pixels);
  assert.equal(pixels[0], pixels[1]); // grayscale R===G===B
  assert.ok(pixels[0] < 30);
  assert.ok(pixels[4] > 240);

  const lum = rgbaToLuminanceBuffer(pixels, 2, 1);
  assert.equal(lum.length, 2);
});

test('probeBrowserScanSupport and describeCameraError report actionable graceful degradation guidance', async () => {
  const support = await probeBrowserScanSupport({
    isSecureContext: true,
    navigator: { mediaDevices: { getUserMedia: async () => ({}) } },
    WebAssembly: {},
  });
  assert.equal(support.cameraApi, true);
  assert.equal(support.nativeBarcodeDetector, false);
  assert.match(support.barcodeEngineLabel, /ZXing/i);

  const deniedMsg = describeCameraError({ name: 'NotAllowedError' });
  assert.match(deniedMsg, /Upload Photo/i);

  const missingCamMsg = describeCameraError({ name: 'NotFoundError' });
  assert.match(missingCamMsg, /No camera hardware/i);
});
