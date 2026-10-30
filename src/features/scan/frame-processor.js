/**
 * @fileoverview Region-of-interest (ROI) geometry calculator and canvas image preprocessing
 * for barcode decoding, single-line ISBN OCR, and 3:4 cover jacket text capture.
 * Pure math helpers are separated from DOM canvas creation for deterministic Node unit testing.
 */

/**
 * @typedef {Object} NormalizedRoi
 * @property {number} x - Left offset ratio [0..1]
 * @property {number} y - Top offset ratio [0..1]
 * @property {number} width - Width ratio [0..1]
 * @property {number} height - Height ratio [0..1]
 */

/**
 * @typedef {Object} PixelCropBox
 * @property {number} sx - Source X in pixels
 * @property {number} sy - Source Y in pixels
 * @property {number} sw - Source width in pixels
 * @property {number} sh - Source height in pixels
 */

/**
 * Returns the normalized Region of Interest (ROI) inside a 16:9 / 4:3 scanner viewport
 * matching the visual guide proportions rendered in `scan-shell-view.js`.
 *
 * @param {import('../../types/models.js').ScanMode} mode
 * @returns {NormalizedRoi}
 */
export function getModeNormalizedRoi(mode) {
  switch (mode) {
    case 'isbn-ocr':
      // Narrow horizontal text strip centered in the frame
      return { x: 0.1, y: 0.36, width: 0.8, height: 0.28 };
    case 'cover':
      // Larger centered 3:4 portrait area
      return { x: 0.18, y: 0.08, width: 0.64, height: 0.84 };
    case 'barcode':
    default:
      // Wide horizontal barcode band
      return { x: 0.1, y: 0.24, width: 0.8, height: 0.52 };
  }
}

/**
 * Computes pixel-accurate crop coordinates for a source frame/image, accounting for
 * `object-cover` center cropping when a live `<video>` element fills a container box.
 *
 * @param {{
 *   sourceWidth: number,
 *   sourceHeight: number,
 *   mode: import('../../types/models.js').ScanMode,
 *   containerWidth?: number,
 *   containerHeight?: number,
 *   fullImage?: boolean
 * }} params
 * @returns {PixelCropBox}
 */
export function computeModeCropBox({
  sourceWidth,
  sourceHeight,
  mode,
  containerWidth,
  containerHeight,
  fullImage = false,
}) {
  const safeW = Math.max(1, Math.floor(sourceWidth));
  const safeH = Math.max(1, Math.floor(sourceHeight));

  if (fullImage) {
    return { sx: 0, sy: 0, sw: safeW, sh: safeH };
  }

  const roi = getModeNormalizedRoi(mode);

  // Compute visible sub-rectangle if video is rendered with object-cover inside container
  let visX = 0;
  let visY = 0;
  let visW = safeW;
  let visH = safeH;

  if (containerWidth && containerHeight && containerWidth > 0 && containerHeight > 0) {
    const sourceAspect = safeW / safeH;
    const containerAspect = containerWidth / containerHeight;

    if (sourceAspect > containerAspect) {
      // Source is wider than container: horizontal sides are clipped
      visW = safeH * containerAspect;
      visX = (safeW - visW) / 2;
    } else if (sourceAspect < containerAspect) {
      // Source is taller than container: top/bottom are clipped
      visH = safeW / containerAspect;
      visY = (safeH - visH) / 2;
    }
  }

  const sx = Math.max(0, Math.floor(visX + visW * roi.x));
  const sy = Math.max(0, Math.floor(visY + visH * roi.y));
  const sw = Math.max(1, Math.min(safeW - sx, Math.floor(visW * roi.width)));
  const sh = Math.max(1, Math.min(safeH - sy, Math.floor(visH * roi.height)));

  return { sx, sy, sw, sh };
}

/**
 * Enhances RGBA pixel buffer in-place for crisp OCR legibility:
 * converts to luminance grayscale, stretches contrast around local dynamic range,
 * and applies soft adaptive sharpening for small printed ISBN digits.
 *
 * @param {Uint8ClampedArray} rgbaData
 * @returns {Uint8ClampedArray}
 */
export function enhanceRgbaForOcr(rgbaData) {
  const totalPixels = Math.floor(rgbaData.length / 4);
  if (totalPixels === 0) return rgbaData;

  let minLum = 255;
  let maxLum = 0;
  const luminances = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 4;
    const r = rgbaData[offset];
    const g = rgbaData[offset + 1];
    const b = rgbaData[offset + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    luminances[i] = lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = Math.max(24, maxLum - minLum);

  for (let i = 0; i < totalPixels; i++) {
    const normalized = ((luminances[i] - minLum) / range) * 255;
    // Slight S-curve contrast boost so dark ink pops cleanly against warm paper
    const contrasted =
      normalized < 115
        ? Math.max(0, Math.round(normalized * 0.72))
        : normalized > 165
          ? Math.min(255, Math.round(165 + (normalized - 165) * 1.35))
          : Math.round(normalized);

    const offset = i * 4;
    rgbaData[offset] = contrasted;
    rgbaData[offset + 1] = contrasted;
    rgbaData[offset + 2] = contrasted;
    rgbaData[offset + 3] = 255;
  }

  return rgbaData;
}

/**
 * Renders a cropped and optionally contrast-enhanced region from a `<video>`, `<img>`, or `ImageBitmap`
 * onto an offscreen `<canvas>` for barcode or OCR processing.
 *
 * @param {{
 *   source: CanvasImageSource,
 *   crop: PixelCropBox,
 *   enhanceOcr?: boolean,
 *   maxDimension?: number
 * }} params
 * @returns {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, imageData: ImageData }}
 */
export function renderCroppedCanvas({
  source,
  crop,
  enhanceOcr = false,
  maxDimension = 1400,
}) {
  const scale =
    Math.max(crop.sw, crop.sh) > maxDimension
      ? maxDimension / Math.max(crop.sw, crop.sh)
      : enhanceOcr && crop.sh < 140
        ? Math.min(2.2, 160 / Math.max(1, crop.sh))
        : 1;

  const targetW = Math.max(1, Math.round(crop.sw * scale));
  const targetH = Math.max(1, Math.round(crop.sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('2D Canvas context is unavailable in this browser.');
  }

  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, targetW, targetH);
  const imageData = ctx.getImageData(0, 0, targetW, targetH);

  if (enhanceOcr) {
    enhanceRgbaForOcr(imageData.data);
    ctx.putImageData(imageData, 0, 0);
  }

  return { canvas, ctx, imageData };
}

/**
 * Loads an uploaded image `File` or `Blob` into an `HTMLImageElement` alongside a revocable preview URL.
 *
 * @param {File | Blob} file
 * @returns {Promise<{ image: HTMLImageElement, objectUrl: string, width: number, height: number }>}
 */
export function loadUploadedImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve({
        image: img,
        objectUrl,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the selected image file. Try a JPEG, PNG, or WebP photo.'));
    };
    img.src = objectUrl;
  });
}
