/**
 * @fileoverview Core JSDoc domain typedefs and pure validation helpers for Library Rotation.
 */

/**
 * @typedef {'home' | 'scan' | 'rotations' | 'profiles' | 'settings'} RouteId
 */

/**
 * @typedef {'system' | 'light' | 'dark'} ThemeMode
 */

/**
 * @typedef {'barcode' | 'isbn-ocr' | 'cover'} ScanMode
 */

/**
 * @typedef {'board-book' | 'hardcover' | 'paperback'} BookFormat
 */

/**
 * @typedef {'board-toddler' | 'picture-book' | 'early-reader' | 'chapter-book'} ReadingStage
 */

/**
 * @typedef {Object} ProviderSource
 * @property {string} provider - Identifier such as 'manual', 'seed', 'google-books', 'open-library'
 * @property {string} [externalId] - Provider-specific record ID
 * @property {string} fetchedAt - ISO-8601 timestamp
 * @property {Record<string, unknown>} [rawPayload] - Optional raw payload when debug capture is enabled
 */

/**
 * @typedef {Object} Book
 * @property {string} id - Stable internal UUID/slug
 * @property {string} isbn13 - Normalized 13-digit ISBN (or empty string if unnumbered vintage book)
 * @property {string} [isbn10] - Optional 10-digit ISBN
 * @property {string} title - Book title
 * @property {string[]} authors - List of author names
 * @property {number} [publishedYear] - Publication year
 * @property {number} [pageCount] - Page count
 * @property {BookFormat} format - Physical binding format
 * @property {number} ageMin - Minimum recommended age in years
 * @property {number} ageMax - Maximum recommended age in years
 * @property {ReadingStage} readingStage - Reading stage hint
 * @property {string[]} tags - Normalized lowercase topic/theme tags
 * @property {string} [coverUrl] - Optional verified cover image URL or data URL
 * @property {string} spineColor - Deterministic archival cloth palette key
 * @property {string} addedAt - ISO-8601 timestamp
 * @property {string} [lastRotatedAt] - ISO-8601 timestamp of most recent rotation inclusion
 * @property {ProviderSource[]} sources - Metadata provenance list
 */

/**
 * @typedef {Object} ChildProfile
 * @property {string} id - Unique profile ID
 * @property {string} name - Child display name
 * @property {number} age - Child age in years
 * @property {ReadingStage} readingStage - Current reading level/stage
 * @property {string[]} favoriteTopics - Preferred themes/topics
 * @property {number} defaultRotationSize - Target number of books per rotation
 * @property {number} cooldownDays - Minimum days before repeating a rotated book
 * @property {string} avatarTone - Palette identifier ('teal' | 'amber' | 'indigo' | 'rose')
 * @property {string[]} readHistoryBookIds - Book IDs marked read by/with this child
 * @property {string} createdAt - ISO-8601 timestamp
 */

/**
 * @typedef {Object} RotationRuleConfig
 * @property {number} count - Target book count
 * @property {string} objective - Free-text rotation objective (e.g., "hardcover + woodland themes")
 * @property {string[]} preferredTags - Explicit topic tags
 * @property {number} cooldownDays - Recency exclusion window
 * @property {boolean} [varietyMix] - Enforce author & binding diversity across shelf slots
 * @property {BookFormat | 'any'} [requiredFormat] - Optional explicit binding format filter
 * @property {string} [seed] - Optional deterministic PRNG seed
 */

/**
 * @typedef {Object} RotationList
 * @property {string} id - Unique rotation ID
 * @property {string} profileId - Owning ChildProfile ID
 * @property {string} title - Human-friendly rotation title
 * @property {RotationRuleConfig} rules - Configuration used to generate/curate this list
 * @property {string[]} bookIds - Ordered list of Book IDs in this rotation
 * @property {string[]} completedBookIds - Subset of bookIds checked off during this rotation cycle
 * @property {'active' | 'saved' | 'archived'} status - Lifecycle state for the child profile
 * @property {string} createdAt - ISO-8601 timestamp
 * @property {string} updatedAt - ISO-8601 timestamp
 */

/**
 * @typedef {Object} AppSettings
 * @property {ThemeMode} theme - UI color mode preference
 * @property {boolean} retainRawProviderPayloads - Keep raw API responses for debugging/extension
 * @property {boolean} aiEnrichmentOptIn - Explicit opt-in flag for Phase 5 AI tag adapter
 * @property {ScanMode} preferredScanMode - Default camera scan guide mode
 */

/**
 * @typedef {Object} AppState
 * @property {number} schemaVersion - Storage schema version
 * @property {string} activeProfileId - Currently selected ChildProfile ID
 * @property {ChildProfile[]} profiles - All child profiles
 * @property {Book[]} books - Family book catalog
 * @property {RotationList[]} rotations - Saved and active rotation lists
 * @property {AppSettings} settings - User preferences
 * @property {string} updatedAt - Last state persistence ISO timestamp
 */

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Escapes unsafe characters before interpolating into HTML templates.
 * @param {string | number | undefined | null} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates a collision-resistant local identifier with a domain prefix.
 * @param {string} prefix
 * @returns {string}
 */
export function createId(prefix) {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${randomPart}`;
}

/**
 * Strips hyphens/spaces and validates ISBN-10 or ISBN-13 checksums, normalizing valid ISBN-10 to ISBN-13.
 * @param {string} rawInput
 * @returns {{ valid: boolean, isbn13: string, isbn10?: string, error?: string }}
 */
export function normalizeIsbn(rawInput) {
  const cleaned = String(rawInput || '')
    .trim()
    .replace(/[-\s]/g, '')
    .toUpperCase();

  if (!cleaned) {
    return { valid: true, isbn13: '' };
  }

  if (/^\d{9}[\dX]$/.test(cleaned)) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += (10 - i) * Number(cleaned[i]);
    }
    sum += cleaned[9] === 'X' ? 10 : Number(cleaned[9]);
    if (sum % 11 !== 0) {
      return { valid: false, isbn13: '', error: 'Invalid ISBN-10 check digit.' };
    }
    const core = `978${cleaned.slice(0, 9)}`;
    const check13 = computeIsbn13CheckDigit(core);
    return { valid: true, isbn13: `${core}${check13}`, isbn10: cleaned };
  }

  if (/^\d{13}$/.test(cleaned)) {
    if (!cleaned.startsWith('978') && !cleaned.startsWith('979')) {
      return { valid: false, isbn13: '', error: 'ISBN-13 must start with 978 or 979.' };
    }
    const expected = computeIsbn13CheckDigit(cleaned.slice(0, 12));
    if (expected !== cleaned[12]) {
      return { valid: false, isbn13: '', error: 'Invalid ISBN-13 check digit.' };
    }
    return { valid: true, isbn13: cleaned };
  }

  return {
    valid: false,
    isbn13: '',
    error: 'Enter a valid 10-digit or 13-digit ISBN (hyphens optional), or leave blank.',
  };
}

/**
 * Computes the 13th check digit for a 12-digit ISBN prefix.
 * @param {string} prefix12
 * @returns {string}
 */
export function computeIsbn13CheckDigit(prefix12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(prefix12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const remainder = (10 - (sum % 10)) % 10;
  return String(remainder);
}

/**
 * Formats ReadingStage into concise human prose.
 * @param {ReadingStage} stage
 * @returns {string}
 */
export function formatReadingStage(stage) {
  switch (stage) {
    case 'board-toddler':
      return 'Board & Toddler';
    case 'picture-book':
      return 'Picture Book';
    case 'early-reader':
      return 'Early Reader';
    case 'chapter-book':
      return 'Chapter Book';
    default:
      return 'Picture Book';
  }
}

/**
 * Formats BookFormat into concise human prose.
 * @param {BookFormat} format
 * @returns {string}
 */
export function formatBookBinding(format) {
  switch (format) {
    case 'board-book':
      return 'Board Book';
    case 'hardcover':
      return 'Hardcover';
    case 'paperback':
      return 'Paperback';
    default:
      return 'Hardcover';
  }
}
