/**
 * @fileoverview Client-side Cover Art Dominant Color Extractor (Dynamic Theme).
 * Samples uploaded or fetched book cover images via a tiny 32x32 offscreen `<canvas>`,
 * extracts a vibrant, WCAG-safe dominant `#RRGGBB` accent color, and falls back
 * deterministically to the book's archival cloth spine palette when offline or CORS-restricted.
 */

/** @type {Record<string, string>} */
export const SPINE_FALLBACK_HEX = {
  teal: '#1F6E75',
  indigo: '#2C4257',
  amber: '#9A5B25',
  rose: '#963E47',
  emerald: '#2D6247',
};

/** @type {Map<string, string | null>} */
const runtimeUrlColorCache = new Map();

/**
 * Validates and normalizes a `#RRGGBB` color string.
 * @param {string | undefined | null} rawHex
 * @returns {string | undefined}
 */
export function normalizeHexColor(rawHex) {
  if (!rawHex || typeof rawHex !== 'string') return undefined;
  const cleaned = rawHex.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(cleaned) ? cleaned : undefined;
}

/**
 * Converts RGB `[0..255]` channels into an uppercase `#RRGGBB` hex string.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
function rgbToHex(r, g, b) {
  const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Extracts a vibrant dominant `#RRGGBB` color from raw RGBA pixel data (`Uint8ClampedArray`).
 * Ignores transparent pixels, pure white page borders, and deep black ink shadows,
 * weighting colorful book-jacket illustration buckets higher than muted grays.
 *
 * @param {Uint8ClampedArray | number[]} rgba
 * @param {number} width
 * @param {number} height
 * @returns {string | null}
 */
export function extractDominantColorFromRgba(rgba, width, height) {
  const pixelCount = Math.min(Math.trunc((rgba?.length || 0) / 4), Math.max(0, width * height));
  if (pixelCount <= 0) return null;

  /**
   * Quantized 4-bit-per-channel histogram (`0..15` per R/G/B)
   * @type {Map<number, { weight: number, rSum: number, gSum: number, bSum: number, count: number }>}
   */
  const buckets = new Map();

  let fallbackRSum = 0;
  let fallbackGSum = 0;
  let fallbackBSum = 0;
  let fallbackCount = 0;

  const stride = Math.max(1, Math.floor(pixelCount / 1024));

  for (let i = 0; i < pixelCount; i += stride) {
    const off = i * 4;
    const a = rgba[off + 3];
    if (a < 140) continue;

    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];

    // Skip near-white background margins and near-black barcode/shadow ink
    if (r > 242 && g > 242 && b > 242) continue;
    if (r < 18 && g < 18 && b < 18) continue;

    fallbackRSum += r;
    fallbackGSum += g;
    fallbackBSum += b;
    fallbackCount += 1;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = (maxC - minC) / 255;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Favor saturated mid-tone illustration colors over washed-out grays
    const lumaBalance = 1 - Math.abs(luma - 0.52) * 0.7;
    const weight = (0.35 + chroma * 2.1) * Math.max(0.25, lumaBalance);

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += weight;
      existing.rSum += r * weight;
      existing.gSum += g * weight;
      existing.bSum += b * weight;
      existing.count += 1;
    } else {
      buckets.set(key, {
        weight,
        rSum: r * weight,
        gSum: g * weight,
        bSum: b * weight,
        count: 1,
      });
    }
  }

  let outR = 0;
  let outG = 0;
  let outB = 0;

  if (buckets.size > 0) {
    let bestBucket = null;
    for (const bucket of buckets.values()) {
      if (!bestBucket || bucket.weight > bestBucket.weight) {
        bestBucket = bucket;
      }
    }
    if (bestBucket && bestBucket.weight > 0) {
      outR = bestBucket.rSum / bestBucket.weight;
      outG = bestBucket.gSum / bestBucket.weight;
      outB = bestBucket.bSum / bestBucket.weight;
    }
  } else if (fallbackCount > 0) {
    outR = fallbackRSum / fallbackCount;
    outG = fallbackGSum / fallbackCount;
    outB = fallbackBSum / fallbackCount;
  } else {
    return null;
  }

  // Gently normalize extreme luminance so CSS color-mix card tinting looks rich in both Light & Dark themes
  const luma = 0.299 * outR + 0.587 * outG + 0.114 * outB;
  if (luma > 215) {
    const scale = 205 / luma;
    outR *= scale;
    outG *= scale;
    outB *= scale;
  } else if (luma < 45 && luma > 0) {
    const boost = 55 / luma;
    outR = Math.min(255, outR * boost);
    outG = Math.min(255, outG * boost);
    outB = Math.min(255, outB * boost);
  }

  return rgbToHex(outR, outG, outB);
}

/**
 * Resolves the effective `#RRGGBB` card tint color for a book:
 * uses extracted `book.dominantColor` when available, falling back to its cloth `spineColor` palette.
 * @param {Pick<import('../../types/models.js').Book, 'dominantColor' | 'spineColor'> | null | undefined} book
 * @returns {string}
 */
export function resolveBookCardTintHex(book) {
  if (!book) return SPINE_FALLBACK_HEX.teal;
  const validDominant = normalizeHexColor(book.dominantColor);
  if (validDominant) return validDominant;
  return SPINE_FALLBACK_HEX[book.spineColor] || SPINE_FALLBACK_HEX.teal;
}

/**
 * Loads a cover URL (`data:image/...` or CORS-enabled `https://...`) into a 32x32 offscreen canvas
 * in the browser and extracts its dominant `#RRGGBB` color. Resolves `null` silently if offline or CORS-opaque.
 *
 * @param {string | undefined | null} coverUrl
 * @returns {Promise<string | null>}
 */
export async function extractCoverColorFromUrl(coverUrl) {
  if (
    !coverUrl ||
    typeof document === 'undefined' ||
    typeof Image === 'undefined'
  ) {
    return null;
  }

  const key = coverUrl.trim();
  if (!key) return null;
  if (runtimeUrlColorCache.has(key)) {
    return runtimeUrlColorCache.get(key) ?? null;
  }

  const result = await new Promise((resolve) => {
    const img = new Image();
    if (!key.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
    }

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      try {
        const sampleSize = 32;
        const canvas = document.createElement('canvas');
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
        const hex = extractDominantColorFromRgba(imageData.data, sampleSize, sampleSize);
        resolve(hex);
      } catch (_) {
        // SecurityError when remote CDN omits Access-Control-Allow-Origin
        resolve(null);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(null);
    };

    img.src = key;
  });

  runtimeUrlColorCache.set(key, result);
  return result;
}
