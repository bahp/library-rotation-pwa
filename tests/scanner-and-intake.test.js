/**
 * @fileoverview Consolidated Scanner, OCR & Intake Suite:
 * - Optical ISBN recovery & confusion repair (O->0, I/l->1, S->5, B->8).
 * - Bookland EAN-13 (978/979) + price add-on barcode validation & non-book rejection.
 * - Cover title OCR extraction & publisher noise stripping.
 * - QR code URL & book identifier parsing for Wishlist intake.
 * - Camera ROI cropping & contrast-stretched grayscale preprocessing.
 * - Browser capability probing & graceful camera error reporting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCoverTitleQuery,
  extractIsbnsFromText,
  parseScannedCodePayload,
  repairOcrIsbnToken,
  validateBarcodeAsIsbn,
} from '../src/features/scan/isbn-extractor.js';
import {
  computeModeCropBox,
  enhanceRgbaForOcr,
  getModeNormalizedRoi,
} from '../src/features/scan/frame-processor.js';
import {
  describeCameraError,
  probeBrowserScanSupport,
} from '../src/features/scan/scanner-controller.js';

describe('Scanner, OCR & Intake Suite', () => {
  it('extractIsbnsFromText recovers clean, hyphenated, and OCR-corrupted ISBNs', () => {
    // Clean hyphenated ISBN-13 with price addon
    const cleanText = 'US $18.99 / CAN $24.99\nISBN 978-0-14-050174-2 51899\nPrinted in China';
    const cleanMatches = extractIsbnsFromText(cleanText);
    assert.equal(cleanMatches.length, 1);
    assert.equal(cleanMatches[0].isbn13, '9780140501742');

    // Noisy OCR digit confusions: '0' -> 'O', '1' -> 'I'/'l', '5' -> 'S'
    const noisyOcr = '1SBN-13: 978-O-I4-OS0l74-2';
    const repaired = extractIsbnsFromText(noisyOcr);
    assert.equal(repaired.length, 1);
    assert.equal(repaired[0].isbn13, '9780140501742');

    // ISBN-10 with check digit 'X'
    const isbn10X = 'Library Edition ISBN 0-8044-2957-X';
    const isbn10Matches = extractIsbnsFromText(isbn10X);
    assert.equal(isbn10Matches.length, 1);
    assert.equal(isbn10Matches[0].isbn10, '080442957X');
    assert.equal(isbn10Matches[0].isbn13, '9780804429573');

    // Rejects invalid check digits
    assert.equal(extractIsbnsFromText('Order #9780140501749 Reference 1234567890').length, 0);
  });

  it('repairOcrIsbnToken repairs common character confusions and rejects words', () => {
    const repaired = repairOcrIsbnToken('97B-O06-443I78-1');
    assert.equal(repaired.repaired, true);
    assert.equal(repaired.cleaned, '9780064431781');

    const word = repairOcrIsbnToken('CHILDRENS-STORY');
    assert.equal(word.cleaned, '');
  });

  it('validateBarcodeAsIsbn accepts Bookland 978/979 and rejects retail barcodes', () => {
    const std = validateBarcodeAsIsbn('9780064431781');
    assert.equal(std.valid, true);
    assert.equal(std.isbn13, '9780064431781');

    const addon = validateBarcodeAsIsbn('978039924046150999');
    assert.equal(addon.valid, true);
    assert.equal(addon.isbn13, '9780399240461');

    const cereal = validateBarcodeAsIsbn('0016000275287');
    assert.equal(cereal.valid, false);
    assert.match(cereal.reason || '', /not a 978\/979 Bookland ISBN/i);
  });

  it('extractCoverTitleQuery strips publisher and medal boilerplate', () => {
    const coverText = `
      NEW YORK TIMES BESTSELLER
      CALDECOTT MEDAL
      Where the Wild Things Are
      Story and Pictures by Maurice Sendak
      HARPERCOLLINS
    `;
    assert.equal(extractCoverTitleQuery(coverText), 'Where the Wild Things Are');
  });

  it('parseScannedCodePayload extracts ISBNs from QR URLs and library identifiers', () => {
    // Amazon/Goodreads/OpenLibrary QR URL
    const qrUrl = 'https://openlibrary.org/isbn/9780140501735?ref=qr';
    const parsed = parseScannedCodePayload(qrUrl);
    assert.equal(parsed?.isbn13, '9780140501735');
    assert.equal(parsed?.matched, true);

    // Raw ISBN string
    const parsedRaw = parseScannedCodePayload('9780064430173');
    assert.equal(parsedRaw?.isbn13, '9780064430173');
    assert.equal(parsedRaw?.matched, true);

    // Non-book QR URL returns matched: false
    const nonBook = parseScannedCodePayload('https://example.com/menu');
    assert.equal(nonBook?.matched, false);
  });

  it('computeModeCropBox and getModeNormalizedRoi compute valid scan targets', () => {
    const ocrRoi = getModeNormalizedRoi('isbn-ocr');
    const barcodeRoi = getModeNormalizedRoi('barcode');
    const coverRoi = getModeNormalizedRoi('cover');

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
  });

  it('describeCameraError and probeBrowserScanSupport handle media constraints and permission errors', async () => {
    const deniedMsg = describeCameraError({ name: 'NotAllowedError' });
    assert.match(deniedMsg, /Upload Photo/i);

    const missingCamMsg = describeCameraError({ name: 'NotFoundError' });
    assert.match(missingCamMsg, /No camera/i);

    const support = await probeBrowserScanSupport({
      isSecureContext: true,
      navigator: { mediaDevices: { getUserMedia: async () => ({}) } },
      WebAssembly: {},
    });
    assert.equal(support.cameraApi, true);
    assert.equal(support.nativeBarcodeDetector, false);
  });
});
