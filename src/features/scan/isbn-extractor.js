/**
 * @fileoverview Pure ISBN & title extraction utilities for noisy OCR text and 1D barcode payloads.
 * Handles common optical character confusions (O->0, I/l/|->1, S->5, B->8, Z->2),
 * ISBN-13 / ISBN-10 prefixes, check-digit verification, UPC-A/Bookland filtering,
 * and cover-title keyword extraction when no ISBN is printed on a front jacket.
 */

import { normalizeIsbn } from '../../types/models.js';

/**
 * @typedef {Object} ExtractedIsbnMatch
 * @property {string} isbn13 - Verified 13-digit Bookland ISBN
 * @property {string} [isbn10] - Verified 10-digit ISBN if source was ISBN-10
 * @property {string} rawToken - Original substring matched in OCR or barcode input
 * @property {'exact' | 'ocr-repaired'} confidence - Whether character repair was required
 */

/** @type {Record<string, string>} */
const OCR_DIGIT_MAP = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  '|': '1',
  '!': '1',
  Z: '2',
  S: '5',
  G: '6',
  B: '8',
};

/**
 * Repairs common OCR character confusions inside a numeric ISBN token while preserving trailing 'X' on ISBN-10.
 * @param {string} raw
 * @returns {{ cleaned: string, repaired: boolean }}
 */
export function repairOcrIsbnToken(raw) {
  const upper = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212—–-]/g, '')
    .replace(/[\s.:;/_]/g, '');

  if (!upper) return { cleaned: '', repaired: false };

  let repaired = false;
  let out = '';

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const isLastCharOfTen = upper.length === 10 && i === 9;
    if (ch >= '0' && ch <= '9') {
      out += ch;
    } else if (isLastCharOfTen && ch === 'X') {
      out += 'X';
    } else if (OCR_DIGIT_MAP[ch]) {
      out += OCR_DIGIT_MAP[ch];
      repaired = true;
    } else {
      // Unrecoverable character inside candidate token
      return { cleaned: '', repaired: false };
    }
  }

  return { cleaned: out, repaired };
}

/**
 * Validates a decoded barcode value (EAN-13, EAN-13+5 price add-on, ISBN-10, or UPC-A)
 * and accepts ONLY valid Bookland ISBN-13s (978/979) or valid ISBN-10s so non-book retail
 * barcodes (e.g., 012345678905 cereal box or QR URLs) do not trigger false locks.
 *
 * @param {string} rawBarcode
 * @returns {{ valid: boolean, isbn13: string, isbn10?: string, reason?: string }}
 */
export function validateBarcodeAsIsbn(rawBarcode) {
  const digitsAndX = String(rawBarcode || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '');

  if (!digitsAndX) {
    return { valid: false, isbn13: '', reason: 'Empty barcode payload.' };
  }

  // Some scanners return 18-digit EAN-13 + 5-digit price supplement (e.g., 978014050174250799)
  let candidate = digitsAndX;
  if (/^(978|979)\d{15}$/.test(digitsAndX)) {
    candidate = digitsAndX.slice(0, 13);
  } else if (/^(978|979)\d{12}$/.test(digitsAndX)) {
    // EAN-13 + 2-digit supplement
    candidate = digitsAndX.slice(0, 13);
  }

  const normalized = normalizeIsbn(candidate);
  if (!normalized.valid || !normalized.isbn13) {
    if (/^\d{12,13}$/.test(candidate) && !candidate.startsWith('978') && !candidate.startsWith('979')) {
      return {
        valid: false,
        isbn13: '',
        reason: `Retail barcode (${candidate}) is not a 978/979 Bookland ISBN.`,
      };
    }
    return {
      valid: false,
      isbn13: '',
      reason: normalized.error || 'Barcode is not a valid ISBN.',
    };
  }

  return {
    valid: true,
    isbn13: normalized.isbn13,
    isbn10: normalized.isbn10,
  };
}

/**
 * Parses a raw camera/photo scan payload from either a 1D retail barcode or a 2D QR code
 * (such as public library catalog QR stickers, Open Library / WorldCat / bookstore product URLs,
 * or ISBN-prefixed strings) into a verified Bookland ISBN-13 while ignoring non-book QR codes
 * (restaurant menus, Wi-Fi codes, non-book retail EANs).
 *
 * @param {string} rawPayload
 * @returns {{ matched: boolean, kind?: 'isbn', isbn13: string, isbn10?: string, reason?: string }}
 */
export function parseScannedCodePayload(rawPayload) {
  const raw = String(rawPayload || '').trim();
  if (!raw) {
    return { matched: false, isbn13: '', reason: 'Empty scan payload.' };
  }

  // 1. Direct 1D Bookland EAN-13 / EAN-13+supplement / ISBN-10 check
  const direct = validateBarcodeAsIsbn(raw);
  if (direct.valid && direct.isbn13) {
    return {
      matched: true,
      kind: 'isbn',
      isbn13: direct.isbn13,
      isbn10: direct.isbn10,
    };
  }

  // Reject pure 12/13-digit non-978/979 retail barcodes immediately
  const compactDigits = raw.replace(/[-\s]/g, '');
  if (/^\d{12,13}$/.test(compactDigits) && !compactDigits.startsWith('978') && !compactDigits.startsWith('979')) {
    return {
      matched: false,
      isbn13: '',
      reason: direct.reason || `Retail barcode (${compactDigits}) is not a 978/979 Bookland ISBN.`,
    };
  }

  // 2. Decode URL-encoded QR payloads (e.g. https://openlibrary.org/isbn/9780140501742 or Amazon /dp/0064430170)
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    decoded = raw;
  }

  // 2a. Look for any verified 978/979 Bookland ISBN-13 inside the QR text or URL path/query
  const isbn13TokenRegex = /(?:978|979)[\d\-\s]{10,16}/g;
  let m13;
  while ((m13 = isbn13TokenRegex.exec(decoded)) !== null) {
    const cleaned13 = m13[0].replace(/[-\s]/g, '').slice(0, 13);
    const norm13 = normalizeIsbn(cleaned13);
    if (norm13.valid && norm13.isbn13) {
      return {
        matched: true,
        kind: 'isbn',
        isbn13: norm13.isbn13,
        isbn10: norm13.isbn10,
      };
    }
  }

  // 2b. Check for ISBN-10 inside book-related QR URLs or ISBN-labeled text
  const hasBookQrCue =
    /(?:\bisbn\b|\/isbn\/|\/dp\/|\/gp\/product\/|\/books\/|\/work\/|worldcat\.org|openlibrary\.org|goodreads\.com|books\.google)/i.test(
      decoded
    );
  if (hasBookQrCue) {
    const isbn10Tokens = decoded.match(/\b\d{9}[0-9Xx]\b/g) || [];
    for (const tok of isbn10Tokens) {
      const norm10 = normalizeIsbn(tok);
      if (norm10.valid && norm10.isbn13) {
        return {
          matched: true,
          kind: 'isbn',
          isbn13: norm10.isbn13,
          isbn10: norm10.isbn10,
        };
      }
    }
  }

  return {
    matched: false,
    isbn13: '',
    reason: /^https?:\/\//i.test(raw)
      ? 'QR link does not contain a recognizable book ISBN.'
      : direct.reason || 'Code is not a valid Bookland ISBN.',
  };
}

/**
 * Extracts all valid ISBN-13 / ISBN-10 numbers from multi-line noisy OCR text,
 * prioritizing explicit "ISBN" labeled lines and exact matches before OCR-repaired matches.
 *
 * @param {string} ocrText
 * @returns {ExtractedIsbnMatch[]}
 */
export function extractIsbnsFromText(ocrText) {
  const source = String(ocrText || '');
  if (!source.trim()) return [];

  /** @type {Map<string, ExtractedIsbnMatch>} */
  const foundByIsbn13 = new Map();

  /**
   * Attempts to validate and record a candidate raw substring.
   * @param {string} rawToken
   * @param {boolean} hasIsbnLabelBoost
   */
  const tryRecord = (rawToken, hasIsbnLabelBoost) => {
    const trimmed = rawToken.trim();
    if (!trimmed) return;

    // 1. Try strict digits/hyphens first
    const strictClean = trimmed
      .toUpperCase()
      .replace(/[\u2010-\u2015\u2212—–-]/g, '')
      .replace(/\s+/g, '');

    const strictCheck = normalizeIsbn(strictClean);
    if (strictCheck.valid && strictCheck.isbn13) {
      if (!foundByIsbn13.has(strictCheck.isbn13) || hasIsbnLabelBoost) {
        foundByIsbn13.set(strictCheck.isbn13, {
          isbn13: strictCheck.isbn13,
          isbn10: strictCheck.isbn10,
          rawToken: trimmed,
          confidence: 'exact',
        });
      }
      return;
    }

    // 2. Try OCR character confusion repair (O->0, I/l->1, S->5, B->8, Z->2)
    const { cleaned, repaired } = repairOcrIsbnToken(trimmed);
    if (!cleaned || !repaired) return;

    const repairedCheck = normalizeIsbn(cleaned);
    if (repairedCheck.valid && repairedCheck.isbn13) {
      if (!foundByIsbn13.has(repairedCheck.isbn13)) {
        foundByIsbn13.set(repairedCheck.isbn13, {
          isbn13: repairedCheck.isbn13,
          isbn10: repairedCheck.isbn10,
          rawToken: trimmed,
          confidence: 'ocr-repaired',
        });
      }
    }
  };

  // Pass 1: Explicitly prefixed "ISBN", "ISBN-13", "ISBN-10", or "1SBN" segments
  const labeledRegex =
    /(?:I|1|l|\|)SBN(?:\s*[-:]?\s*(?:13|10))?\s*[:.]?\s*([0-9OQDIL|!ZSBGX][\s\u2010-\u2015\u2212—–\-.:0-9OQDIL|!ZSBGX]{8,22})/gi;
  let match;
  while ((match = labeledRegex.exec(source)) !== null) {
    // Trim trailing tokens if extra price digits follow a space
    const segment = match[1].trim();
    tryRecord(segment, true);
    // Also test first 13 or 10 stripped characters in case a 5-digit price code followed on same line
    const compact = segment.replace(/[\s\u2010-\u2015\u2212—–\-.:]/g, '');
    if (compact.length > 13) {
      tryRecord(compact.slice(0, 13), true);
    }
    if (compact.length > 10 && !compact.startsWith('978') && !compact.startsWith('979')) {
      tryRecord(compact.slice(0, 10), true);
    }
  }

  // Pass 2: Sliding window over whitespace/punctuation-delimited runs anywhere in text
  const broadCandidateRegex = /[0-9OQDIL|!ZSBGX][0-9OQDIL|!ZSBGX\s\u2010-\u2015\u2212—–-]{8,20}[0-9OQDIL|!ZSBGX]/gi;
  while ((match = broadCandidateRegex.exec(source)) !== null) {
    const token = match[0];
    tryRecord(token, false);

    // Sub-slice check for 978/979 sequences embedded inside longer numeric strings (e.g. barcode + add-on)
    const repaired = repairOcrIsbnToken(token);
    if (repaired.cleaned.length >= 13) {
      const idx978 = repaired.cleaned.indexOf('978');
      const idx979 = repaired.cleaned.indexOf('979');
      const startIdx = idx978 !== -1 ? idx978 : idx979;
      if (startIdx !== -1 && repaired.cleaned.length - startIdx >= 13) {
        tryRecord(repaired.cleaned.slice(startIdx, startIdx + 13), false);
      }
    }
  }

  // Sort exact confidence first
  return Array.from(foundByIsbn13.values()).sort((a, b) => {
    if (a.confidence === b.confidence) return 0;
    return a.confidence === 'exact' ? -1 : 1;
  });
}

const STOP_LINES = new Set([
  'NEW YORK TIMES BESTSELLER',
  'BESTSELLER',
  'CALDECOTT MEDAL',
  'CALDECOTT HONOR',
  'NEWBERY MEDAL',
  'PRINTED IN USA',
  'SCHOLASTIC',
  'HARPERCOLLINS',
  'PUFFIN BOOKS',
  'RANDOM HOUSE',
]);

/**
 * Extracts a clean candidate book title query from front-cover OCR text
 * when Cover Frame mode is used and no ISBN is present on the front jacket.
 *
 * @param {string} ocrText
 * @returns {string}
 */
export function extractCoverTitleQuery(ocrText) {
  const lines = String(ocrText || '')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[^a-zA-Z0-9'’&\-\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => {
      if (line.length < 3 || line.length > 60) return false;
      const alphaCount = (line.match(/[a-zA-Z]/g) || []).length;
      if (alphaCount < 3) return false;
      if (STOP_LINES.has(line.toUpperCase())) return false;
      if (/^(BY|ILLUSTRATED BY|PICTURES BY|WRITTEN BY)\b/i.test(line)) return false;
      return true;
    });

  if (lines.length === 0) return '';
  // Combine top 1-2 prominent lines up to ~48 chars for a crisp Title Search query
  const primary = lines[0];
  if (lines.length > 1 && primary.length < 22 && `${primary} ${lines[1]}`.length <= 48) {
    return `${primary} ${lines[1]}`;
  }
  return primary;
}
