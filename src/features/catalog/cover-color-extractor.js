/**
 * @fileoverview Client-side Cover Art Dominant Color & Palette Extractor (Dynamic Theme).
 * Samples uploaded, local, or fetched book cover images via a 48x48 offscreen `<canvas>`,
 * extracts either a vibrant prominent accent, the largest dominant area color, or a soft muted tone,
 * returns curated multi-swatch cover palettes for manual picking, and automatically proxies
 * CORS-blocked HTTPS covers through `/api/books/cover-image` when needed.
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

/** @type {Map<string, { primary: string | null, swatches: string[] }>} */
const runtimeUrlPaletteCache = new Map();

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
 * Computes perceptual color distance squared in sRGB space to keep palette swatches distinct.
 * @param {number} r1
 * @param {number} g1
 * @param {number} b1
 * @param {number} r2
 * @param {number} g2
 * @param {number} b2
 * @returns {number}
 */
function colorDistanceSq(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

/**
 * Normalizes a tint color's luminance & saturation for the requested mode.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {'prominent' | 'dominant' | 'soft'} mode
 * @returns {string}
 */
function finalizeChannelTone(r, g, b, mode) {
  let outR = r;
  let outG = g;
  let outB = b;

  if (mode === 'soft') {
    // Gently pull channels toward mid-neutral gray so background tint feels calm & archival
    const lumaMix = 0.299 * outR + 0.587 * outG + 0.114 * outB;
    outR = outR * 0.72 + lumaMix * 0.28;
    outG = outG * 0.72 + lumaMix * 0.28;
    outB = outB * 0.72 + lumaMix * 0.28;
  }

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
 * Extracts a primary `#RRGGBB` color plus up to 5 distinct representative swatches
 * from raw RGBA pixel data (`Uint8ClampedArray`).
 *
 * @param {Uint8ClampedArray | number[]} rgba
 * @param {number} width
 * @param {number} height
 * @param {{ mode?: 'prominent' | 'dominant' | 'soft', maxSwatches?: number }} [options]
 * @returns {{ primary: string | null, swatches: string[] }}
 */
export function extractCoverPaletteFromRgba(rgba, width, height, options = {}) {
  const mode =
    options.mode === 'dominant' || options.mode === 'soft' ? options.mode : 'prominent';
  const maxSwatches = Math.max(1, Math.min(8, Math.trunc(options.maxSwatches || 5)));

  const pixelCount = Math.min(Math.trunc((rgba?.length || 0) / 4), Math.max(0, width * height));
  if (pixelCount <= 0) return { primary: null, swatches: [] };

  /**
   * Quantized 4-bit-per-channel histogram (`0..15` per R/G/B)
   * @type {Map<number, { weight: number, areaWeight: number, rSum: number, gSum: number, bSum: number, count: number }>}
   */
  const buckets = new Map();

  let fallbackRSum = 0;
  let fallbackGSum = 0;
  let fallbackBSum = 0;
  let fallbackCount = 0;

  const stride = Math.max(1, Math.floor(pixelCount / 1600));
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);

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

    // Gentle center weighting reduces bleed from white scanner borders / sticker edges
    const x = (i % safeW) / safeW;
    const y = Math.floor(i / safeW) / safeH;
    const centerBias =
      x >= 0.1 && x <= 0.9 && y >= 0.08 && y <= 0.92 ? 1.15 : 0.72;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = (maxC - minC) / 255;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const lumaBalance = 1 - Math.abs(luma - 0.52) * 0.7;

    let weight = 1;
    if (mode === 'dominant') {
      // Favor largest overall color coverage while still giving a gentle edge to non-gray hues
      weight = (0.95 + chroma * 0.35) * Math.max(0.35, lumaBalance) * centerBias;
    } else if (mode === 'soft') {
      // Favor harmonious mid-tone fields for a calmer archival wash
      const softLuma = 1 - Math.abs(luma - 0.58) * 0.85;
      weight = (0.55 + chroma * 1.1) * Math.max(0.25, softLuma) * centerBias;
    } else {
      // 'prominent' (default): strongly favor vivid, saturated cover illustration hues over muted backgrounds
      weight = (0.08 + Math.pow(chroma, 1.75) * 6.5) * Math.max(0.25, lumaBalance) * centerBias;
    }

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const existing = buckets.get(key);
    if (existing) {
      existing.weight += weight;
      existing.areaWeight += centerBias;
      existing.rSum += r * weight;
      existing.gSum += g * weight;
      existing.bSum += b * weight;
      existing.count += 1;
    } else {
      buckets.set(key, {
        weight,
        areaWeight: centerBias,
        rSum: r * weight,
        gSum: g * weight,
        bSum: b * weight,
        count: 1,
      });
    }
  }

  if (buckets.size === 0) {
    if (fallbackCount > 0) {
      const hex = finalizeChannelTone(
        fallbackRSum / fallbackCount,
        fallbackGSum / fallbackCount,
        fallbackBSum / fallbackCount,
        mode
      );
      return { primary: hex, swatches: [hex] };
    }
    return { primary: null, swatches: [] };
  }

  const ranked = Array.from(buckets.values())
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const primaryBucket = ranked[0];
  const primaryHex = primaryBucket
    ? finalizeChannelTone(
        primaryBucket.rSum / primaryBucket.weight,
        primaryBucket.gSum / primaryBucket.weight,
        primaryBucket.bSum / primaryBucket.weight,
        mode
      )
    : null;

  /** @type {Array<{ r: number, g: number, b: number, hex: string }>} */
  const chosen = [];
  const MIN_DIST_SQ = 42 * 42;

  for (const bucket of ranked) {
    const r = bucket.rSum / bucket.weight;
    const g = bucket.gSum / bucket.weight;
    const b = bucket.bSum / bucket.weight;
    if (chosen.some((c) => colorDistanceSq(c.r, c.g, c.b, r, g, b) < MIN_DIST_SQ)) {
      continue;
    }
    const hex = finalizeChannelTone(r, g, b, mode);
    if (!chosen.some((c) => c.hex === hex)) {
      chosen.push({ r, g, b, hex });
    }
    if (chosen.length >= maxSwatches) break;
  }

  return {
    primary: primaryHex,
    swatches: chosen.map((c) => c.hex),
  };
}

/**
 * Extracts a vibrant dominant `#RRGGBB` color from raw RGBA pixel data (`Uint8ClampedArray`).
 * Ignores transparent pixels, pure white page borders, and deep black ink shadows,
 * weighting colorful book-jacket illustration buckets higher than muted grays.
 *
 * @param {Uint8ClampedArray | number[]} rgba
 * @param {number} width
 * @param {number} height
 * @param {'prominent' | 'dominant' | 'soft'} [mode]
 * @returns {string | null}
 */
export function extractDominantColorFromRgba(rgba, width, height, mode = 'prominent') {
  return extractCoverPaletteFromRgba(rgba, width, height, { mode, maxSwatches: 1 }).primary;
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
 * Parses a valid `#RRGGBB` hex string into `[r, g, b]` 0..255 channels.
 * @param {string} hex
 * @returns {[number, number, number] | null}
 */
function parseHexRgb(hex) {
  const clean = normalizeHexColor(hex);
  if (!clean) return null;
  const num = parseInt(clean.slice(1), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Formats 0..255 RGB values as uppercase `#RRGGBB`.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
function formatHexRgb(r, g, b) {
  const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Computes WCAG 2.1 relative luminance (0..1) for an sRGB `[r, g, b]` triplet.
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
function relativeLuminance(rgb) {
  const toLinear = (/** @type {number} */ c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

/**
 * Computes WCAG contrast ratio (>= 1) between two RGB triplets.
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 * @returns {number}
 */
function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Linearly blends RGB color `a` toward RGB color `b` by factor `t` in `[0, 1]`.
 * @param {[number, number, number]} a
 * @param {[number, number, number]} b
 * @param {number} t
 * @returns {[number, number, number]}
 */
function mixRgb(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Computes WCAG-AA contrast-safe CSS accent palette tokens (`accent`, `accentHover`, `accentFg`, `accentInk`)
 * from an extracted cover `#RRGGBB` color for Book Details buttons, pills, and icons.
 *
 * @param {string | undefined | null} rawHex
 * @param {boolean} [isDark]
 * @returns {{ accent: string, accentHover: string, accentFg: string, accentInk: string } | null}
 */
export function resolveAccessibleAccentTokens(rawHex, isDark = false) {
  const baseRgb = parseHexRgb(String(rawHex || ''));
  if (!baseRgb) return null;

  const whiteRgb = /** @type {[number, number, number]} */ ([255, 255, 255]);
  const darkInkRgb = /** @type {[number, number, number]} */ ([19, 24, 23]);
  const lightBgRgb = /** @type {[number, number, number]} */ ([250, 248, 245]);
  const darkBgRgb = /** @type {[number, number, number]} */ ([21, 27, 25]);
  const deepCharcoalRgb = /** @type {[number, number, number]} */ ([14, 18, 17]);
  const lightTextTargetRgb = /** @type {[number, number, number]} */ ([16, 22, 20]);

  // 1. Button / solid-fill accent + crisp foreground text (>= 4.5:1)
  /** @type {[number, number, number]} */
  let fillRgb = [baseRgb[0], baseRgb[1], baseRgb[2]];
  const whiteContrast = contrastRatio(fillRgb, whiteRgb);
  const darkContrast = contrastRatio(fillRgb, darkInkRgb);

  let accentFg = '#FFFFFF';
  if (whiteContrast >= 4.5) {
    accentFg = '#FFFFFF';
  } else if (darkContrast >= 5.2 && relativeLuminance(fillRgb) > 0.38) {
    accentFg = '#131817';
  } else {
    // Deepen slightly toward charcoal until white text passes WCAG AA 4.5:1
    for (let step = 1; step <= 18; step += 1) {
      const candidate = mixRgb(baseRgb, deepCharcoalRgb, step * 0.045);
      if (contrastRatio(candidate, whiteRgb) >= 4.55) {
        fillRgb = candidate;
        accentFg = '#FFFFFF';
        break;
      }
    }
  }

  const hoverRgb =
    accentFg === '#FFFFFF'
      ? mixRgb(fillRgb, deepCharcoalRgb, 0.14)
      : mixRgb(fillRgb, darkInkRgb, 0.12);

  // 2. Text / icon accent ink readable against surface background (>= 4.5:1)
  /** @type {[number, number, number]} */
  let inkRgb = [baseRgb[0], baseRgb[1], baseRgb[2]];
  const surfaceRef = isDark ? darkBgRgb : lightBgRgb;
  if (contrastRatio(inkRgb, surfaceRef) < 4.5) {
    const target = isDark ? whiteRgb : lightTextTargetRgb;
    for (let step = 1; step <= 22; step += 1) {
      const candidate = mixRgb(baseRgb, target, step * 0.045);
      if (contrastRatio(candidate, surfaceRef) >= 4.6) {
        inkRgb = candidate;
        break;
      }
    }
  }

  return {
    accent: formatHexRgb(fillRgb[0], fillRgb[1], fillRgb[2]),
    accentHover: formatHexRgb(hoverRgb[0], hoverRgb[1], hoverRgb[2]),
    accentFg,
    accentInk: formatHexRgb(inkRgb[0], inkRgb[1], inkRgb[2]),
  };
}

/**
 * Loads an image element and samples its RGBA pixels onto a 48x48 offscreen canvas.
 * Returns `null` if loading fails or canvas pixels are tainted by CORS.
 *
 * @param {string} src
 * @param {boolean} useCorsAnonymous
 * @returns {Promise<Uint8ClampedArray | null>}
 */
function sampleImageRgba(src, useCorsAnonymous) {
  return new Promise((resolve) => {
    const img = new Image();
    if (useCorsAnonymous) {
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
        const sampleSize = 48;
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
        resolve(imageData.data);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Loads a cover URL (`data:image/...`, local asset, or `https://...`) into a 48x48 offscreen canvas
 * and extracts both a primary tint and up to 5 curated cover palette swatches.
 * Falls back cleanly to the same-origin `/api/books/cover-image` proxy if the remote CDN omits CORS headers.
 *
 * @param {string | undefined | null} coverUrl
 * @param {{ mode?: 'prominent' | 'dominant' | 'soft' }} [options]
 * @returns {Promise<{ primary: string | null, swatches: string[] }>}
 */
export async function extractCoverPaletteFromUrl(coverUrl, options = {}) {
  if (
    !coverUrl ||
    typeof document === 'undefined' ||
    typeof Image === 'undefined'
  ) {
    return { primary: null, swatches: [] };
  }

  const key = coverUrl.trim();
  if (!key) return { primary: null, swatches: [] };
  const mode =
    options.mode === 'dominant' || options.mode === 'soft' ? options.mode : 'prominent';
  const cacheKey = `${mode}::${key}`;

  if (runtimeUrlPaletteCache.has(cacheKey)) {
    return runtimeUrlPaletteCache.get(cacheKey) || { primary: null, swatches: [] };
  }

  const isDataOrLocal =
    key.startsWith('data:') || key.startsWith('/') || key.startsWith('./');
  let rgba = await sampleImageRgba(key, !isDataOrLocal);

  // If direct CORS pixel read failed on a remote HTTPS cover URL, retry once via our same-origin cover proxy
  if (!rgba && /^https:\/\//i.test(key)) {
    const proxyUrl = `/api/books/cover-image?url=${encodeURIComponent(key)}`;
    rgba = await sampleImageRgba(proxyUrl, false);
  }

  const palette = rgba
    ? extractCoverPaletteFromRgba(rgba, 48, 48, { mode, maxSwatches: 5 })
    : { primary: null, swatches: [] };

  runtimeUrlPaletteCache.set(cacheKey, palette);
  runtimeUrlColorCache.set(cacheKey, palette.primary);
  return palette;
}

/**
 * Loads a cover URL and extracts its dominant `#RRGGBB` color according to the active tint mode.
 *
 * @param {string | undefined | null} coverUrl
 * @param {{ mode?: 'prominent' | 'dominant' | 'soft' }} [options]
 * @returns {Promise<string | null>}
 */
export async function extractCoverColorFromUrl(coverUrl, options = {}) {
  const mode =
    options.mode === 'dominant' || options.mode === 'soft' ? options.mode : 'prominent';
  const key = coverUrl ? coverUrl.trim() : '';
  if (!key) return null;
  const cacheKey = `${mode}::${key}`;
  if (runtimeUrlColorCache.has(cacheKey)) {
    return runtimeUrlColorCache.get(cacheKey) ?? null;
  }
  const palette = await extractCoverPaletteFromUrl(key, { mode });
  return palette.primary;
}
