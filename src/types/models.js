/**
 * @fileoverview Core JSDoc domain typedefs, ISBN checksum validators, and automatic
 * Date-of-Birth (DOB) age calculation helpers for Library Rotation.
 */

/**
 * @typedef {'home' | 'library' | 'scan' | 'rotations' | 'presets' | 'play' | 'profiles' | 'settings'} RouteId
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
 * @typedef {'owned' | 'wishlist' | 'interested' | 'library'} CollectionStatus
 */

/**
 * @typedef {'good' | 'torn' | 'broken' | 'retired'} BookCondition
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
 * @property {string} [readingLevelHint] - Human-readable reading complexity and read-aloud duration hint
 * @property {string[]} tags - Normalized lowercase topic/theme tags
 * @property {CollectionStatus} [collectionStatus] - Acquisition/shelf status ('owned' default, 'wishlist', 'interested', 'library')
 * @property {BookCondition} [condition] - Physical book condition ('good' default, 'torn', 'broken', 'retired')
 * @property {boolean} [loved] - Whether this book is marked as a family/child favorite
 * @property {string[]} [owners] - Assigned owners (ChildProfile IDs, 'shared', or custom labels like "Cousin Maya" / "Grandma's House")
 * @property {string} [coverUrl] - Optional verified cover image URL or data URL
 * @property {string} [dominantColor] - Optional #RRGGBB hex extracted from cover art for dynamic card tinting
 * @property {string} spineColor - Deterministic archival cloth palette key
 * @property {string} addedAt - ISO-8601 timestamp
 * @property {string} [lastRotatedAt] - ISO-8601 timestamp of most recent rotation inclusion
 * @property {number} [rotationCount] - Total number of times placed on a rotation shelf
 * @property {Array<{ rotatedAt: string, rotationId?: string, profileId?: string }>} [rotationHistory] - Bounded log of most recent shelf activations
 * @property {string} [lastReadAt] - ISO-8601 timestamp when most recently marked read
 * @property {string} [language] - Normalized non-English language tag ('spanish', 'italian', etc.)
 * @property {string | Record<string, unknown>} [dimensions] - Optional physical book dimensions
 * @property {number} [averageRating] - Average rating from provider (e.g. 4.5)
 * @property {number} [ratingsCount] - Total number of ratings/votes
 * @property {string} [publisher] - Publisher name
 * @property {string} [previewLink] - Preview URL
 * @property {number} [userRating] - User's own rating (1 to 5 stars)
 * @property {ProviderSource[]} sources - Metadata provenance list
 */

/**
 * @typedef {Object} ChildProfile
 * @property {string} id - Unique profile ID
 * @property {string} name - Child display name
 * @property {string} [birthDate] - Optional calendar birth date (YYYY-MM-DD) used to compute age automatically
 * @property {number} age - Child age in years (automatically synced from birthDate when present)
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
 * @property {number} [swapDays] - Planned shelf cycle duration in days before Swap Day reminder
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
 * @property {string} [activatedAt] - ISO-8601 timestamp when placed on active shelf
 * @property {Record<string, string>} [slotAddedAt] - Per-book ISO-8601 timestamp when placed on this shelf cycle
 */

/**
 * @typedef {'portrait' | 'square'} CoverAspectRatio
 */

/**
 * @typedef {Object} AppSettings
 * @property {'en' | 'es' | 'it'} [language] - Active interface language ('en' default, 'es' Español, 'it' Italiano)
 * @property {ThemeMode} theme - UI color mode preference
 * @property {CoverAspectRatio} coverAspectRatio - Book cover display aspect ratio ('portrait' 3:4 or 'square' 1:1)
 * @property {boolean} dynamicCoverTint - Lightly tint book card backgrounds with dominant cover art color (default: true)
 * @property {boolean} retainRawProviderPayloads - Keep raw API responses for debugging/extension
 * @property {string[]} enabledMetadataProviders - Enabled catalog lookup provider IDs (default: Google Books + Open Library)
 * @property {boolean} autoLocalTagging - Automatically run offline rule-based taxonomy & reading-level tagging
 * @property {boolean} aiEnrichmentOptIn - Explicit opt-in flag for optional AI tag enrichment (safe default: false)
 * @property {string} aiAdapterId - Selected pluggable AI adapter ID ('browser-prompt-api' | 'custom-endpoint' | custom)
 * @property {string} aiEndpointUrl - Optional keyless HTTPS or localhost proxy endpoint URL for 'custom-endpoint'
 * @property {number} aiTimeoutMs - Bounded request timeout in ms for optional AI adapter calls
 * @property {ScanMode} preferredScanMode - Default camera scan guide mode
 * @property {number} [presetAlertDaysBefore] - Days before an annual MM-DD preset start date to surface reminder (0-30, default: 2)
 * @property {number} [presetAlertDaysAfter] - Days after an annual MM-DD preset start date to keep showing unactioned reminder (0-30, default: 5)
 * @property {boolean} [showPresetDecorations] - Show subtle top-right motif corner decorations on preset cards (default: true)
 * @property {boolean} [enableRotationHistoryInsights] - Show per-book cooldown/rotation history badges & filters (default: true)
 * @property {boolean} [showCoverUsageAdornos] - Show compact icon+code usage/cooldown/read adornos over Library book covers (default: true)
 * @property {boolean} [enableStaleBookSpotlight] - Show gentle Stale Book Spotlight banner for long-unopened active shelf books (default: true)
 * @property {number} [staleBookDays] - Days on active shelf without being marked read before spotlight triggers (3-60, default: 10)
 * @property {boolean} [searchWhileTyping] - Enable live provider search as you type in Scan & Search (default: false)
 */

/**
 * @typedef {'seasonal-holidays' | 'cultural-traditions' | 'calendar-events' | 'evergreen'} PresetCategory
 */

/**
 * @typedef {Object} RotationPreset
 * @property {string} id - Unique preset slug/ID
 * @property {string} title - Human-friendly collection preset title
 * @property {string} description - Description & rotation engine objective
 * @property {PresetCategory} category - Grouping category
 * @property {string[]} preferredTags - Normalized lowercase topic preferences
 * @property {number} count - Target number of books to select
 * @property {number} swapDays - Suggested swap cycle duration in days
 * @property {number} cooldownDays - Recency exclusion window in days
 * @property {BookFormat | 'any'} requiredFormat - Optional binding format preference
 * @property {boolean} varietyMix - Whether to enforce author & topic variety
 * @property {string} seed - Pre-defined deterministic PRNG seed
 * @property {string} [suggestedStartMonthDay] - Optional annual start date in 'MM-DD' format (omitted when anytime)
 * @property {string} [motif] - Optional top-right corner decorative motif key
 * @property {boolean} [isCustom] - True when created locally by the user
 * @property {boolean} [isBuiltInOverride] - True when a built-in default preset has been customized in place
 * @property {string} [createdAt] - Optional ISO-8601 creation timestamp
 */

/**
 * @typedef {Object} AppState
 * @property {number} schemaVersion - Storage schema version
 * @property {string} activeProfileId - Currently selected ChildProfile ID
 * @property {ChildProfile[]} profiles - All child profiles
 * @property {Book[]} books - Family book catalog
 * @property {RotationList[]} rotations - Saved and active rotation lists
 * @property {RotationPreset[]} [customPresets] - User-defined rotation collection presets
 * @property {Record<string, RotationPreset>} [presetOverrides] - In-place edits to built-in default presets keyed by preset ID
 * @property {AppSettings} settings - User preferences
 * @property {string} updatedAt - Last state persistence ISO timestamp
 */

export const CURRENT_SCHEMA_VERSION = 2;

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
 * Parses a calendar date (`YYYY-MM-DD` or ISO timestamp or `Date`) into `{ year, month, day }`
 * without local-timezone midnight drift.
 * @param {string | Date | undefined | null} input
 * @returns {{ year: number, month: number, day: number } | null}
 */
function parseCalendarParts(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return {
      year: input.getUTCFullYear(),
      month: input.getUTCMonth() + 1,
      day: input.getUTCDate(),
    };
  }
  const str = String(input).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Validates and normalizes a `YYYY-MM-DD` birth date string.
 * @param {string | undefined | null} rawBirthDate
 * @param {string | Date} [referenceDate]
 * @returns {{ valid: boolean, birthDate: string, error?: string }}
 */
export function normalizeBirthDate(rawBirthDate, referenceDate = new Date()) {
  const cleaned = String(rawBirthDate || '').trim();
  if (!cleaned) {
    return { valid: true, birthDate: '' };
  }
  const parts = parseCalendarParts(cleaned);
  if (!parts) {
    return {
      valid: false,
      birthDate: '',
      error: 'Enter a valid birth date in YYYY-MM-DD format.',
    };
  }
  const ref = parseCalendarParts(referenceDate) || parseCalendarParts(new Date());
  if (ref) {
    const birthNum = parts.year * 10000 + parts.month * 100 + parts.day;
    const refNum = ref.year * 10000 + ref.month * 100 + ref.day;
    if (birthNum > refNum) {
      return {
        valid: false,
        birthDate: '',
        error: 'Birth date cannot be in the future.',
      };
    }
  }
  const yyyy = String(parts.year).padStart(4, '0');
  const mm = String(parts.month).padStart(2, '0');
  const dd = String(parts.day).padStart(2, '0');
  return { valid: true, birthDate: `${yyyy}-${mm}-${dd}` };
}

/**
 * Computes completed years of age from a `YYYY-MM-DD` birth date relative to `referenceDate`.
 * Returns `null` if `birthDate` is invalid or in the future.
 * @param {string | undefined | null} birthDate
 * @param {string | Date} [referenceDate]
 * @returns {number | null}
 */
export function computeAgeFromBirthDate(birthDate, referenceDate = new Date()) {
  const dob = parseCalendarParts(birthDate);
  const ref = parseCalendarParts(referenceDate);
  if (!dob || !ref) return null;

  let years = ref.year - dob.year;
  if (ref.month < dob.month || (ref.month === dob.month && ref.day < dob.day)) {
    years -= 1;
  }
  if (years < 0) return null;
  return Math.min(18, years);
}

/**
 * Computes completed months of age from a `YYYY-MM-DD` birth date relative to `referenceDate`.
 * Useful for displaying baby/toddler ages under 24 months.
 * @param {string | undefined | null} birthDate
 * @param {string | Date} [referenceDate]
 * @returns {number | null}
 */
export function computeAgeMonthsFromBirthDate(birthDate, referenceDate = new Date()) {
  const dob = parseCalendarParts(birthDate);
  const ref = parseCalendarParts(referenceDate);
  if (!dob || !ref) return null;

  let months = (ref.year - dob.year) * 12 + (ref.month - dob.month);
  if (ref.day < dob.day) {
    months -= 1;
  }
  return months < 0 ? null : months;
}

/**
 * Returns the effective integer age in years for a profile, preferring dynamic `birthDate` computation.
 * @param {Pick<ChildProfile, 'age' | 'birthDate'>} profile
 * @param {string | Date} [referenceDate]
 * @returns {number}
 */
export function getEffectiveProfileAge(profile, referenceDate = new Date()) {
  if (profile.birthDate) {
    const computed = computeAgeFromBirthDate(profile.birthDate, referenceDate);
    if (computed !== null) return computed;
  }
  return Math.max(0, Math.min(18, Math.trunc(Number(profile.age) || 0)));
}

/**
 * Formats a concise human age label for a reader profile (e.g. `Age 4` or `14 mos` for babies/toddlers).
 * @param {Pick<ChildProfile, 'age' | 'birthDate'>} profile
 * @param {string | Date} [referenceDate]
 * @returns {string}
 */
export function formatProfileAgeLabel(profile, referenceDate = new Date()) {
  if (profile.birthDate) {
    const months = computeAgeMonthsFromBirthDate(profile.birthDate, referenceDate);
    if (months !== null && months < 24) {
      return months <= 1 ? '1 mo' : `${months} mos`;
    }
  }
  const years = getEffectiveProfileAge(profile, referenceDate);
  return `Age ${years}`;
}

/**
 * Suggests an initial reading stage based on a child's age in years.
 * @param {number} ageYears
 * @returns {ReadingStage}
 */
export function inferReadingStageFromAge(ageYears) {
  if (ageYears < 2) return 'board-toddler';
  if (ageYears <= 4) return 'picture-book';
  if (ageYears <= 7) return 'early-reader';
  return 'chapter-book';
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
    const derivedIsbn10 = computeIsbn10FromIsbn13(cleaned);
    return {
      valid: true,
      isbn13: cleaned,
      ...(derivedIsbn10 ? { isbn10: derivedIsbn10 } : {}),
    };
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
 * Derives the mathematical 10-digit ISBN from a valid `978`-prefixed ISBN-13.
 * Returns `undefined` for `979` ISBNs (which have no ISBN-10 equivalent) or invalid inputs.
 * @param {string} isbn13
 * @returns {string | undefined}
 */
export function computeIsbn10FromIsbn13(isbn13) {
  const cleaned = String(isbn13 || '').replace(/[-\s]/g, '');
  if (!/^978\d{10}$/.test(cleaned)) return undefined;
  const core9 = cleaned.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(core9[i]);
  }
  const rem = (11 - (sum % 11)) % 11;
  const check = rem === 10 ? 'X' : String(rem);
  return `${core9}${check}`;
}

/**
 * Infers a normalized non-English language tag from an ISBN-13 registration group prefix
 * (e.g. `978-84` Spain, `978-607`/`978-950` LatAm -> `'spanish'`; `978-88`/`979-12` Italy -> `'italian'`).
 * @param {string | undefined | null} isbn13
 * @returns {string}
 */
export function inferLanguageTagFromIsbn(isbn13) {
  const cleaned = String(isbn13 || '').replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(cleaned)) return '';
  if (
    cleaned.startsWith('97884') ||
    cleaned.startsWith('978607') ||
    cleaned.startsWith('978950') ||
    cleaned.startsWith('978956') ||
    cleaned.startsWith('978958') ||
    cleaned.startsWith('978987')
  ) {
    return 'spanish';
  }
  if (cleaned.startsWith('97888') || cleaned.startsWith('97912')) {
    return 'italian';
  }
  if (cleaned.startsWith('9782') || cleaned.startsWith('97910')) {
    return 'french';
  }
  if (cleaned.startsWith('9783')) {
    return 'german';
  }
  if (
    cleaned.startsWith('97885') ||
    cleaned.startsWith('978972') ||
    cleaned.startsWith('978989')
  ) {
    return 'portuguese';
  }
  return '';
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

const VALID_COLLECTION_STATUSES = new Set(['owned', 'wishlist', 'interested', 'library']);
const VALID_BOOK_CONDITIONS = new Set(['good', 'torn', 'broken', 'retired']);
const OWNER_TONE_PALETTE = ['teal', 'indigo', 'amber', 'rose', 'emerald'];

/**
 * Normalizes a raw collection/acquisition status, defaulting to `'owned'` for backwards compatibility.
 * @param {unknown} raw
 * @returns {CollectionStatus}
 */
export function normalizeCollectionStatus(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (VALID_COLLECTION_STATUSES.has(val)) {
    return /** @type {CollectionStatus} */ (val);
  }
  return 'owned';
}

/**
 * Formats a `CollectionStatus` into concise human-readable UI prose.
 * @param {CollectionStatus | undefined} status
 * @returns {string}
 */
export function formatCollectionStatus(status) {
  switch (normalizeCollectionStatus(status)) {
    case 'wishlist':
      return 'Wishlist';
    case 'interested':
      return 'Interested';
    case 'library':
      return 'Library Loan';
    case 'owned':
    default:
      return 'Owned';
  }
}

/**
 * Normalizes a book's physical/lifecycle state, defaulting to `'good'` for backwards compatibility.
 * @param {unknown} raw
 * @returns {BookCondition}
 */
export function normalizeBookCondition(raw) {
  const val = String(raw || '').trim().toLowerCase();
  if (VALID_BOOK_CONDITIONS.has(val)) {
    return /** @type {BookCondition} */ (val);
  }
  return 'good';
}

/**
 * Formats a `BookCondition` into concise human-readable UI prose.
 * @param {BookCondition | undefined} condition
 * @returns {string}
 */
export function formatBookCondition(condition) {
  switch (normalizeBookCondition(condition)) {
    case 'torn':
      return 'Torn';
    case 'broken':
      return 'Broken';
    case 'retired':
      return 'Retired';
    case 'good':
    default:
      return 'Good';
  }
}

/**
 * Determines whether a book is physically available at home and playable for active shelf rotations.
 * Books in `'wishlist'` or `'interested'` (not at home yet) or in `'broken'` / `'retired'` state
 * are excluded from automatic rotation shelves and off-shelf recommendations.
 * @param {Pick<Book, 'collectionStatus' | 'condition'> | null | undefined} book
 * @returns {boolean}
 */
export function isBookRotatable(book) {
  if (!book) return false;
  const status = normalizeCollectionStatus(book.collectionStatus);
  const condition = normalizeBookCondition(book.condition);
  const availableAtHome = status === 'owned' || status === 'library';
  const usableCondition = condition === 'good' || condition === 'torn';
  return availableAtHome && usableCondition;
}

/**
 * Deduplicates and trims a list of book owner keys/labels (profile IDs, `'shared'`, or custom names).
 * @param {unknown} rawOwners
 * @returns {string[]}
 */
export function normalizeOwnersList(rawOwners) {
  if (!Array.isArray(rawOwners)) return [];
  /** @type {string[]} */
  const out = [];
  /** @type {Set<string>} */
  const seenLower = new Set();

  for (const item of rawOwners) {
    const raw = String(item || '').trim().slice(0, 48);
    if (!raw) continue;
    const canonical = raw.toLowerCase() === 'shared' ? 'shared' : raw;
    const dedupeKey = canonical.toLowerCase();
    if (seenLower.has(dedupeKey)) continue;
    seenLower.add(dedupeKey);
    out.push(canonical);
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Computes a 1–2 character uppercase initial monogram from an owner name (e.g. `"Leo"` -> `"L"`, `"Grandma's House"` -> `"GH"`).
 * @param {string} label
 * @returns {string}
 */
export function computeOwnerInitials(label) {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+/, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0][0].toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * Resolves a book's `owners` array against `ChildProfile[]` into structured badge descriptors.
 * @param {Pick<Book, 'owners'> | null | undefined} book
 * @param {ChildProfile[]} [profiles]
 * @returns {Array<{ key: string, label: string, shortInitial: string, tone: string, isProfile: boolean }>}
 */
export function resolveBookOwnerBadges(book, profiles = []) {
  const owners = normalizeOwnersList(book?.owners);
  if (owners.length === 0) return [];

  const profileById = new Map((profiles || []).map((p) => [p.id, p]));

  return owners.map((ownerKey) => {
    const matchedProfile = profileById.get(ownerKey);
    if (matchedProfile) {
      return {
        key: matchedProfile.id,
        label: matchedProfile.name,
        shortInitial: computeOwnerInitials(matchedProfile.name),
        tone: matchedProfile.avatarTone || 'teal',
        isProfile: true,
      };
    }

    if (ownerKey.toLowerCase() === 'shared') {
      return {
        key: 'shared',
        label: 'Shared',
        shortInitial: 'S',
        tone: 'emerald',
        isProfile: false,
      };
    }

    let hash = 0;
    for (let i = 0; i < ownerKey.length; i++) {
      hash = (hash * 31 + ownerKey.charCodeAt(i)) >>> 0;
    }
    const tone = OWNER_TONE_PALETTE[hash % OWNER_TONE_PALETTE.length];
    return {
      key: ownerKey,
      label: ownerKey,
      shortInitial: computeOwnerInitials(ownerKey),
      tone,
      isProfile: false,
    };
  });
}

