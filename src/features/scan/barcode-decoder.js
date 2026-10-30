/**
 * @fileoverview Dual-engine 1D ISBN barcode decoder:
 * 1) Primary: Hardware-accelerated native `window.BarcodeDetector` (Chromium, Edge, Android WebView, Safari 17.2+ where enabled)
 * 2) Universal Fallback: Lazy-loaded pure-JS `@zxing/library` (`MultiFormatOneDReader` with EAN_13, EAN_8, UPC_A + TRY_HARDER)
 *    so iOS Safari, Firefox, and desktop browsers without Shape Detection API work out-of-the-box while keeping the main bundle lean.
 */

import { validateBarcodeAsIsbn } from './isbn-extractor.js';

/**
 * @typedef {Object} BarcodeDecodeOutcome
 * @property {boolean} matched - True when a valid Bookland ISBN-13 / ISBN-10 barcode was decoded
 * @property {string} isbn13 - Normalized 13-digit ISBN when matched
 * @property {string} [isbn10] - Optional 10-digit ISBN
 * @property {string} [rawBarcode] - Raw barcode string read by engine
 * @property {'native-barcode-detector' | 'zxing-js'} [engine] - Engine that decoded the symbol
 * @property {string} [ignoredReason] - Reason if a non-ISBN barcode was seen and ignored
 */

/** @type {Promise<any> | null} */
let zxingModulePromise = null;

/**
 * Lazily loads `@zxing/library` only when native `BarcodeDetector` is absent or misses a frame.
 * @returns {Promise<any>}
 */
async function loadZxingModule() {
  if (!zxingModulePromise) {
    zxingModulePromise = import('@zxing/library').then((ns) => {
      const record = /** @type {Record<string, any>} */ (ns);
      return 'MultiFormatOneDReader' in record ? record : record['default'] || record;
    });
  }
  return zxingModulePromise;
}

/**
 * Converts RGBA `Uint8ClampedArray` (4 bytes per pixel) into a 1-byte-per-pixel luminance buffer
 * expected by `@zxing/library`'s `RGBLuminanceSource` when passing `Uint8ClampedArray`.
 *
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray}
 */
export function rgbaToLuminanceBuffer(rgba, width, height) {
  const size = width * height;
  const luminances = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i++) {
    const offset = i * 4;
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    luminances[i] = ((r + g * 2 + b) >> 2) & 0xff;
  }
  return luminances;
}

/**
 * Decodes an RGBA buffer using pure-JS ZXing `MultiFormatOneDReader` (attempts HybridBinarizer
 * first, then GlobalHistogramBinarizer for low-contrast or glare-heavy phone photos).
 *
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageBuffer
 * @returns {Promise<string | null>}
 */
export async function decodeRgbaWithZxing(imageBuffer) {
  const { data, width, height } = imageBuffer;
  if (!width || !height || data.length < width * height * 4) return null;

  const {
    BarcodeFormat,
    BinaryBitmap,
    DecodeHintType,
    GlobalHistogramBinarizer,
    HybridBinarizer,
    MultiFormatOneDReader,
    RGBLuminanceSource,
  } = await loadZxingModule();

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.UPC_A,
    BarcodeFormat.EAN_8,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  const reader = new MultiFormatOneDReader(hints);
  const luminances = rgbaToLuminanceBuffer(data, width, height);
  const source = new RGBLuminanceSource(luminances, width, height);

  try {
    const hybridResult = reader.decode(new BinaryBitmap(new HybridBinarizer(source)));
    const text = hybridResult?.getText?.();
    if (text) return text;
  } catch (_) {
    // Expected NotFoundException when no barcode is aligned yet
  }

  try {
    const histogramResult = reader.decode(new BinaryBitmap(new GlobalHistogramBinarizer(source)));
    const text = histogramResult?.getText?.();
    if (text) return text;
  } catch (_) {
    // No 1D barcode found in frame
  }

  return null;
}

/**
 * Creates a reusable barcode decoder adapter supporting both native `BarcodeDetector` and ZXing fallback.
 *
 * @param {{
 *   globalScope?: Record<string, any>,
 *   zxingDecodeFn?: (imageBuffer: { data: Uint8ClampedArray, width: number, height: number }) => Promise<string | null> | string | null
 * }} [options]
 */
export function createBarcodeDecoder(options = {}) {
  /** @type {Record<string, any>} */
  const scope =
    options.globalScope ||
    /** @type {Record<string, any>} */ (typeof globalThis !== 'undefined' ? globalThis : {});
  const zxingDecode = options.zxingDecodeFn || decodeRgbaWithZxing;

  /** @type {any | null} */
  let nativeDetector = null;
  let nativeCheckComplete = false;
  let nativeSupported = false;

  async function ensureNativeDetector() {
    if (nativeCheckComplete) return nativeDetector;
    nativeCheckComplete = true;

    const DetectorCtor = scope['BarcodeDetector'];
    if (typeof DetectorCtor !== 'function') {
      nativeSupported = false;
      return null;
    }

    try {
      if (typeof DetectorCtor.getSupportedFormats === 'function') {
        const supported = await DetectorCtor.getSupportedFormats();
        if (Array.isArray(supported) && !supported.includes('ean_13')) {
          nativeSupported = false;
          return null;
        }
      }
      nativeDetector = new DetectorCtor({
        formats: ['ean_13', 'upc_a', 'ean_8'],
      });
      nativeSupported = true;
      return nativeDetector;
    } catch (_) {
      nativeSupported = false;
      nativeDetector = null;
      return null;
    }
  }

  /**
   * Inspects capabilities without requiring camera permissions.
   * @returns {Promise<{ nativeBarcodeDetector: boolean, fallbackEngine: 'zxing-js' }>}
   */
  async function getCapabilities() {
    await ensureNativeDetector();
    return {
      nativeBarcodeDetector: nativeSupported,
      fallbackEngine: 'zxing-js',
    };
  }

  /**
   * Decodes a cropped frame (`canvas` + `imageData`) and validates Bookland ISBN check digits.
   *
   * @param {{ canvas?: HTMLCanvasElement, imageData: { data: Uint8ClampedArray, width: number, height: number } }} frame
   * @returns {Promise<BarcodeDecodeOutcome>}
   */
  async function decodeFrame(frame) {
    let lastIgnoredReason = '';

    const detector = await ensureNativeDetector();
    if (detector && frame.canvas) {
      try {
        const barcodes = await detector.detect(frame.canvas);
        if (Array.isArray(barcodes)) {
          for (const item of barcodes) {
            const rawValue = String(item?.rawValue || '').trim();
            if (!rawValue) continue;
            const checked = validateBarcodeAsIsbn(rawValue);
            if (checked.valid) {
              return {
                matched: true,
                isbn13: checked.isbn13,
                isbn10: checked.isbn10,
                rawBarcode: rawValue,
                engine: 'native-barcode-detector',
              };
            }
            if (checked.reason) {
              lastIgnoredReason = checked.reason;
            }
          }
        }
      } catch (_) {
        // Fall through seamlessly to ZXing pure-JS decoder
      }
    }

    const zxingRaw = await zxingDecode(frame.imageData);
    if (zxingRaw) {
      const checked = validateBarcodeAsIsbn(zxingRaw);
      if (checked.valid) {
        return {
          matched: true,
          isbn13: checked.isbn13,
          isbn10: checked.isbn10,
          rawBarcode: zxingRaw,
          engine: 'zxing-js',
        };
      }
      if (checked.reason) {
        lastIgnoredReason = checked.reason;
      }
    }

    return {
      matched: false,
      isbn13: '',
      ignoredReason: lastIgnoredReason || undefined,
    };
  }

  return {
    getCapabilities,
    decodeFrame,
  };
}
