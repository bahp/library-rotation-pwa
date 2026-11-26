/**
 * @fileoverview Normalizes disparate external book metadata payloads (Google Books,
 * Open Library, or custom adapters) into the internal BookCandidate / Book schema,
 * and merges multi-provider records without data loss.
 */

import {
  createId,
  inferLanguageTagFromIsbn,
  normalizeIsbn,
} from '../../types/models.js';
import {
  inferAgeAndStageFromSignals,
  inferLocalTopicTags,
  inferReadingLevelHint,
  sanitizeTagList,
  stripDiacritics,
} from '../tagging/rule-tagger.js';

const SPINE_COLORS = ['teal', 'indigo', 'amber', 'rose', 'emerald'];

/** @type {Record<string, string>} */
const LANGUAGE_CODE_MAP = {
  es: 'spanish',
  spa: 'spanish',
  it: 'italian',
  ita: 'italian',
  fr: 'french',
  fre: 'french',
  fra: 'french',
  de: 'german',
  ger: 'german',
  deu: 'german',
  pt: 'portuguese',
  por: 'portuguese',
  ca: 'catalan',
  cat: 'catalan',
};

/**
 * @typedef {Omit<import('../../types/models.js').Book, 'id' | 'addedAt'> & {
 *   candidateKey: string,
 *   summary?: string,
 *   subjects?: string[]
 * }} BookCandidate
 */

/**
 * Resolves a normalized non-English language tag (`'spanish'`, `'italian'`, etc.)
 * from provider ISO-639 codes or ISBN-13 registration group prefixes.
 * @param {unknown} rawLanguage
 * @param {string} [isbn13]
 * @returns {string}
 */
export function resolveLanguageTag(rawLanguage, isbn13 = '') {
  /** @type {string[]} */
  const codes = [];
  if (typeof rawLanguage === 'string') {
    codes.push(rawLanguage);
  } else if (Array.isArray(rawLanguage)) {
    for (const entry of rawLanguage) {
      if (typeof entry === 'string') {
        codes.push(entry);
      } else if (entry && typeof entry === 'object' && typeof entry.key === 'string') {
        codes.push(entry.key);
      }
    }
  }

  for (const raw of codes) {
    const token = raw
      .trim()
      .toLowerCase()
      .replace(/^\/languages\//, '')
      .split(/[-_]/)[0];
    if (token === 'en' || token === 'eng') return '';
    if (LANGUAGE_CODE_MAP[token]) return LANGUAGE_CODE_MAP[token];
  }

  return inferLanguageTagFromIsbn(isbn13);
}

/**
 * Upgrades insecure http:// image URLs to https:// and cleans Google Books curl artifacts.
 * @param {string | undefined | null} rawUrl
 * @returns {string | undefined}
 */
export function sanitizeCoverUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  let secure = trimmed.replace(/^http:\/\//i, 'https://');
  if (secure.includes('books.google.com')) {
    secure = secure.replace(/&edge=curl/gi, '');
  }
  return secure.startsWith('https://') || secure.startsWith('data:image/') ? secure : undefined;
}

/**
 * Strips leading URL path segments (such as Open Library's `/books/OL7353617M` or `/works/OL45804W`)
 * so provider record identifiers are stored and displayed as clean compact codes (`OL7353617M`).
 * @param {string | undefined | null} rawId
 * @returns {string | undefined}
 */
export function cleanProviderExternalId(rawId) {
  if (!rawId || typeof rawId !== 'string') return undefined;
  const trimmed = rawId.trim();
  if (!trimmed) return undefined;
  const stripped = trimmed
    .replace(/^\/?(?:books|works|authors|editions)\//i, '')
    .replace(/^\/+/, '');
  return stripped || undefined;
}

/**
 * Extracts a 4-digit publication year from free-form provider date strings.
 * @param {string | number | undefined | null} rawDate
 * @returns {number | undefined}
 */
export function parsePublishedYear(rawDate) {
  if (typeof rawDate === 'number' && rawDate >= 1800 && rawDate <= 2100) {
    return Math.trunc(rawDate);
  }
  if (typeof rawDate !== 'string') return undefined;
  const match = rawDate.match(/\b(18\d{2}|19\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Deterministically picks a cloth spine color from title/ISBN.
 * @param {string} seedText
 * @returns {string}
 */
export function pickDeterministicSpineColor(seedText) {
  let hash = 0;
  const str = seedText || 'book';
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}

/**
 * Infers binding format from raw provider format strings (EN/ES/IT), subjects, and page count.
 * @param {string[]} hints
 * @param {number | undefined} pageCount
 * @returns {import('../../types/models.js').BookFormat}
 */
export function inferBookFormat(hints, pageCount) {
  const joined = stripDiacritics(hints.join(' ')).toLowerCase();
  if (
    /\b(board\s*book|libro de carton|todo carton|cartonato)\b/.test(joined) ||
    (pageCount &&
      pageCount <= 26 &&
      /\b(toddler|baby|bebe|bebes|primera infancia|primi passi|cartone)\b/.test(joined))
  ) {
    return 'board-book';
  }
  if (
    /\b(paperback|softcover|mass market|tapa blanda|rustica|bolsillo|brossura|copertina flessibile)\b/.test(
      joined
    )
  ) {
    return 'paperback';
  }
  if (/\b(hardcover|hardback|tapa dura|cartone|copertina rigida|rilegato)\b/.test(joined)) {
    return 'hardcover';
  }
  return 'hardcover';
}

/**
 * Cleans and flattens hierarchical provider categories/subjects (e.g. "Juvenile Fiction / Animals / Bears")
 * while filtering generic binding/catalog noise (`Paperback`, `General`, `Juvenile Fiction`).
 * @param {string[]} rawCategories
 * @returns {string[]}
 */
export function cleanProviderCategories(rawCategories) {
  if (!Array.isArray(rawCategories) || rawCategories.length === 0) return [];
  const noiseSet = new Set([
    'general',
    'fiction',
    'nonfiction',
    'non-fiction',
    'juvenile fiction',
    'juvenile nonfiction',
    'young adult fiction',
    'young adult nonfiction',
    'children s books',
    "children's books",
    'childrens books',
    'paperback',
    'hardcover',
    'board book',
    'books',
    'literature',
  ]);
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const raw of rawCategories) {
    const segments = String(raw || '').split(/[\/|;]/);
    for (const seg of segments) {
      const cleaned = seg.trim().replace(/\s+/g, ' ');
      if (!cleaned || cleaned.length < 2) continue;
      const lower = stripDiacritics(cleaned).toLowerCase();
      if (noiseSet.has(lower) || /^\d+$/.test(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(cleaned.slice(0, 64));
      if (out.length >= 12) return out;
    }
  }
  return out;
}

/**
 * Infers age range and reading stage from subjects/categories, description, format, and page count.
 * Heuristic age bounds default off unless `autoInferAgeRange: true` or explicit provider age text is found.
 * @param {{ hints: string[], pageCount?: number, format: import('../../types/models.js').BookFormat, autoInferAgeRange?: boolean }} input
 * @returns {{ ageMin?: number, ageMax?: number, readingStage: import('../../types/models.js').ReadingStage }}
 */
export function inferAgeAndStage({ hints, pageCount, format, autoInferAgeRange = false }) {
  return inferAgeAndStageFromSignals({ hints, pageCount, format, autoInferAgeRange });
}

/**
 * Extracts clean topic tags from provider subjects/categories, title, and summary text,
 * keeping raw provider categories separated from curated tags.
 * @param {string[]} rawSubjects
 * @param {string} [summary]
 * @param {string} [title]
 * @param {string[]} [existingTags]
 * @returns {string[]}
 */
export function extractNormalizedTags(rawSubjects, summary = '', title = '', existingTags = []) {
  return inferLocalTopicTags({
    title,
    subjects: rawSubjects,
    summary,
    existingTags,
    maxTags: 8,
    separateCategories: true,
  });
}

/**
 * Separates provider-supplied tags (from categories/subjects/language) from rule-inferred tags
 * (matched only from title/description prose).
 *
 * @param {string[]} tags
 * @param {string[]} rawSubjects
 * @param {string[]} [existingProviderTags]
 * @returns {Record<string, import('../../types/models.js').TagOrigin>}
 */
function buildCandidateTagOrigins(tags, rawSubjects, existingProviderTags = []) {
  const providerTags = new Set(
    extractNormalizedTags(rawSubjects, '', '', existingProviderTags)
  );
  /** @type {Record<string, import('../../types/models.js').TagOrigin>} */
  const origins = {};
  for (const tag of tags) {
    origins[tag] = providerTags.has(tag) ? 'provider' : 'rules';
  }
  return origins;
}

/**
 * Builds a canonical deduplication key for a candidate book (diacritic-insensitive).
 * @param {string} isbn13
 * @param {string} title
 * @param {string[]} authors
 * @returns {string}
 */
export function buildCandidateKey(isbn13, title, authors) {
  if (isbn13) return `isbn:${isbn13}`;
  const normTitle = stripDiacritics(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
  const normAuthor = stripDiacritics(authors[0] || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return `ta:${normTitle}:${normAuthor}`;
}

/**
 * Strips basic HTML markup & entities from provider book descriptions into plain prose.
 * @param {unknown} raw
 * @param {number} [maxLen]
 * @returns {string}
 */
export function cleanBookDescription(raw, maxLen = 1200) {
  if (!raw) return '';
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .map((entry) => (typeof entry === 'string' ? entry : entry?.value || ''))
      .filter(Boolean)
      .join(' ');
  } else if (typeof raw === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (raw);
    if (typeof obj.value === 'string') text = obj.value;
    else if (typeof obj.text === 'string') text = obj.text;
  }
  if (!text) return '';
  const cleaned = text
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Normalizes a Google Books API Volume item into a BookCandidate.
 * @param {Record<string, any>} item
 * @param {{ retainRaw?: boolean, fallbackIsbn?: string, autoInferAgeRange?: boolean }} [options]
 * @returns {BookCandidate | null}
 */
export function normalizeGoogleBooksItem(item, options = {}) {
  const info = item && typeof item.volumeInfo === 'object' ? item.volumeInfo : null;
  if (!info || !info.title) return null;

  const title = info.subtitle
    ? `${String(info.title).trim()}: ${String(info.subtitle).trim()}`
    : String(info.title).trim();

  const authors = Array.isArray(info.authors)
    ? info.authors.map((/** @type {unknown} */ a) => String(a).trim()).filter(Boolean)
    : ['Unknown Author'];

  let isbn13 = '';
  /** @type {string | undefined} */
  let isbn10;

  if (Array.isArray(info.industryIdentifiers)) {
    for (const ident of info.industryIdentifiers) {
      if (!ident || !ident.identifier) continue;
      const checked = normalizeIsbn(String(ident.identifier));
      if (checked.valid && checked.isbn13) {
        isbn13 = isbn13 || checked.isbn13;
        if (checked.isbn10 && !isbn10) isbn10 = checked.isbn10;
      }
    }
  }

  if (!isbn13 && options.fallbackIsbn) {
    const checked = normalizeIsbn(options.fallbackIsbn);
    if (checked.valid) {
      isbn13 = checked.isbn13;
      isbn10 = isbn10 || checked.isbn10;
    }
  }

  const pageCount =
    typeof info.pageCount === 'number' && info.pageCount > 0
      ? Math.trunc(info.pageCount)
      : undefined;
  const publishedYear = parsePublishedYear(info.publishedDate);
  const categories = Array.isArray(info.categories)
    ? info.categories.map((/** @type {unknown} */ c) => String(c))
    : [];
  const description = cleanBookDescription(
    info.description || item?.searchInfo?.textSnippet || ''
  );

  const formatHints = [...categories, String(info.printType || ''), title];
  const format = inferBookFormat(formatHints, pageCount);
  const { ageMin, ageMax, readingStage } = inferAgeAndStage({
    hints: [title, ...categories, description],
    pageCount,
    format,
    autoInferAgeRange: Boolean(options.autoInferAgeRange),
  });
  const cleanedCategories = cleanProviderCategories(categories);

  const links = info.imageLinks || {};
  const coverUrl = sanitizeCoverUrl(
    links.large ||
      links.medium ||
      links.thumbnail ||
      links.small ||
      links.smallThumbnail
  );

  const langTag = resolveLanguageTag(info.language, isbn13);
  const tags = extractNormalizedTags(
    categories,
    description,
    title,
    langTag ? [langTag] : []
  );
  const tagOrigins = buildCandidateTagOrigins(
    tags,
    categories,
    langTag ? [langTag] : []
  );
  const readingLevelHint = inferReadingLevelHint({
    readingStage,
    format,
    pageCount,
    tags,
    textCorpus: `${title} ${categories.join(' ')} ${description}`,
  });

  const cleanGoogleId = cleanProviderExternalId(typeof item.id === 'string' ? item.id : undefined);
  const language = resolveLanguageTag(info.language, isbn13) || (typeof info.language === 'string' ? info.language.trim() : undefined);
  const dimensions = info.dimensions;
  const averageRating = typeof info.averageRating === 'number' ? info.averageRating : undefined;
  const ratingsCount = typeof info.ratingsCount === 'number' ? Math.trunc(info.ratingsCount) : undefined;
  const publisher = typeof info.publisher === 'string' ? info.publisher.trim() : undefined;
  const previewLink = typeof info.previewLink === 'string' ? info.previewLink.trim() : undefined;
  const salePriceObj =
    item?.saleInfo?.retailPrice && typeof item.saleInfo.retailPrice.amount === 'number'
      ? item.saleInfo.retailPrice
      : item?.saleInfo?.listPrice && typeof item.saleInfo.listPrice.amount === 'number'
        ? item.saleInfo.listPrice
        : null;
  const listPriceAmount =
    salePriceObj && Number.isFinite(salePriceObj.amount) && salePriceObj.amount > 0
      ? Number(salePriceObj.amount)
      : undefined;
  const listPriceCurrency =
    salePriceObj && typeof salePriceObj.currencyCode === 'string' && salePriceObj.currencyCode.trim()
      ? salePriceObj.currencyCode.trim().toUpperCase()
      : undefined;

  /** @type {import('../../types/models.js').ProviderSource} */
  const source = {
    provider: 'google-books',
    ...(cleanGoogleId ? { externalId: cleanGoogleId } : {}),
    fetchedAt: new Date().toISOString(),
    ...(options.retainRaw ? { rawPayload: item } : {}),
  };

  return {
    candidateKey: buildCandidateKey(isbn13, title, authors),
    isbn13,
    ...(isbn10 ? { isbn10 } : {}),
    title,
    authors,
    ...(publishedYear ? { publishedYear } : {}),
    ...(pageCount ? { pageCount } : {}),
    format,
    ...(typeof ageMin === 'number' ? { ageMin } : {}),
    ...(typeof ageMax === 'number' ? { ageMax } : {}),
    readingStage,
    readingLevelHint,
    ...(cleanedCategories.length ? { categories: cleanedCategories } : {}),
    tags,
    tagOrigins,
    ...(coverUrl ? { coverUrl } : {}),
    ...(description ? { summary: description } : {}),
    ...(categories.length ? { subjects: categories.slice(0, 12) } : {}),
    ...(language ? { language } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(listPriceAmount !== undefined ? { listPriceAmount } : {}),
    ...(listPriceCurrency ? { listPriceCurrency } : {}),
    ...(averageRating !== undefined ? { averageRating } : {}),
    ...(ratingsCount !== undefined ? { ratingsCount } : {}),
    ...(publisher ? { publisher } : {}),
    ...(previewLink ? { previewLink } : {}),
    spineColor: pickDeterministicSpineColor(isbn13 || title),
    sources: [source],
  };
}

/**
 * Normalizes an Open Library `api/books?jscmd=data` record into a BookCandidate.
 * Only sets `coverUrl` when Open Library explicitly confirms a `cover` object on the record
 * (avoiding blind `covers.openlibrary.org/...?default=false` URLs that 404 in browsers).
 * @param {Record<string, any>} record
 * @param {{ retainRaw?: boolean, queriedIsbn?: string, autoInferAgeRange?: boolean }} [options]
 * @returns {BookCandidate | null}
 */
export function normalizeOpenLibraryDataRecord(record, options = {}) {
  if (!record || typeof record !== 'object' || !record.title) return null;

  const title = record.subtitle
    ? `${String(record.title).trim()}: ${String(record.subtitle).trim()}`
    : String(record.title).trim();

  const authors =
    Array.isArray(record.authors) && record.authors.length > 0
      ? record.authors
          .map((/** @type {any} */ a) => String(a?.name || a || '').trim())
          .filter(Boolean)
      : ['Unknown Author'];

  const identifiers = record.identifiers || {};
  const rawIsbns = [
    ...(Array.isArray(identifiers.isbn_13) ? identifiers.isbn_13 : []),
    ...(Array.isArray(identifiers.isbn_10) ? identifiers.isbn_10 : []),
    ...(options.queriedIsbn ? [options.queriedIsbn] : []),
  ];

  let isbn13 = '';
  /** @type {string | undefined} */
  let isbn10;
  for (const candidateIsbn of rawIsbns) {
    const checked = normalizeIsbn(String(candidateIsbn));
    if (checked.valid && checked.isbn13) {
      isbn13 = isbn13 || checked.isbn13;
      if (checked.isbn10 && !isbn10) isbn10 = checked.isbn10;
    }
  }

  const pageCount =
    typeof record.number_of_pages === 'number' && record.number_of_pages > 0
      ? Math.trunc(record.number_of_pages)
      : undefined;
  const publishedYear = parsePublishedYear(record.publish_date);

  const subjects = Array.isArray(record.subjects)
    ? record.subjects
        .map((/** @type {any} */ s) => String(s?.name || s || '').trim())
        .filter(Boolean)
    : [];

  const physicalFormat = typeof record.physical_format === 'string' ? record.physical_format : '';
  const format = inferBookFormat([physicalFormat, ...subjects, title], pageCount);
  const { ageMin, ageMax, readingStage } = inferAgeAndStage({
    hints: [title, ...subjects],
    pageCount,
    format,
    autoInferAgeRange: Boolean(options.autoInferAgeRange),
  });
  const cleanedCategories = cleanProviderCategories(subjects);

  const coverObj = record.cover || {};
  const coverUrl = sanitizeCoverUrl(coverObj.large || coverObj.medium || coverObj.small);

  const langTag = resolveLanguageTag(record.languages, isbn13);
  const tags = extractNormalizedTags(subjects, '', title, langTag ? [langTag] : []);
  const tagOrigins = buildCandidateTagOrigins(
    tags,
    subjects,
    langTag ? [langTag] : []
  );
  const readingLevelHint = inferReadingLevelHint({
    readingStage,
    format,
    pageCount,
    tags,
    textCorpus: `${title} ${subjects.join(' ')}`,
  });

  const olDescription = cleanBookDescription(
    record.description ||
      (Array.isArray(record.excerpts) && record.excerpts[0]?.text) ||
      record.notes ||
      ''
  );
  const cleanOlDataId = cleanProviderExternalId(
    typeof record.key === 'string' ? record.key : undefined
  );
  /** @type {import('../../types/models.js').ProviderSource} */
  const source = {
    provider: 'open-library',
    ...(cleanOlDataId ? { externalId: cleanOlDataId } : {}),
    fetchedAt: new Date().toISOString(),
    ...(options.retainRaw ? { rawPayload: record } : {}),
  };

  return {
    candidateKey: buildCandidateKey(isbn13, title, authors),
    isbn13,
    ...(isbn10 ? { isbn10 } : {}),
    title,
    authors,
    ...(publishedYear ? { publishedYear } : {}),
    ...(pageCount ? { pageCount } : {}),
    format,
    ...(typeof ageMin === 'number' ? { ageMin } : {}),
    ...(typeof ageMax === 'number' ? { ageMax } : {}),
    readingStage,
    readingLevelHint,
    ...(cleanedCategories.length ? { categories: cleanedCategories } : {}),
    tags,
    tagOrigins,
    ...(coverUrl ? { coverUrl } : {}),
    ...(olDescription ? { summary: olDescription } : {}),
    ...(subjects.length ? { subjects: subjects.slice(0, 12) } : {}),
    spineColor: pickDeterministicSpineColor(isbn13 || title),
    sources: [source],
  };
}

/**
 * Normalizes an Open Library `search.json` doc into a BookCandidate.
 * @param {Record<string, any>} doc
 * @param {{ retainRaw?: boolean, queriedIsbn?: string, autoInferAgeRange?: boolean }} [options]
 * @returns {BookCandidate | null}
 */
export function normalizeOpenLibrarySearchDoc(doc, options = {}) {
  if (!doc || typeof doc !== 'object' || !doc.title) return null;

  const title = String(doc.title).trim();
  const authors =
    Array.isArray(doc.author_name) && doc.author_name.length > 0
      ? doc.author_name.map((/** @type {unknown} */ a) => String(a).trim()).filter(Boolean)
      : ['Unknown Author'];

  let isbn13 = '';
  /** @type {string | undefined} */
  let isbn10;

  if (options.queriedIsbn) {
    const queriedChecked = normalizeIsbn(options.queriedIsbn);
    if (queriedChecked.valid && queriedChecked.isbn13) {
      isbn13 = queriedChecked.isbn13;
      isbn10 = queriedChecked.isbn10;
    }
  }

  if (Array.isArray(doc.isbn)) {
    for (const raw of doc.isbn.slice(0, 16)) {
      const checked = normalizeIsbn(String(raw));
      if (checked.valid && checked.isbn13) {
        isbn13 = isbn13 || checked.isbn13;
        if (checked.isbn10 && !isbn10) isbn10 = checked.isbn10;
        if (isbn13 && isbn10) break;
      }
    }
  }

  const pageCount =
    typeof doc.number_of_pages_median === 'number' && doc.number_of_pages_median > 0
      ? Math.trunc(doc.number_of_pages_median)
      : undefined;
  const publishedYear = parsePublishedYear(doc.first_publish_year);

  const subjects = Array.isArray(doc.subject)
    ? doc.subject.slice(0, 20).map((/** @type {unknown} */ s) => String(s))
    : [];
  const formats = Array.isArray(doc.format)
    ? doc.format.map((/** @type {unknown} */ f) => String(f))
    : [];

  const format = inferBookFormat([...formats, ...subjects, title], pageCount);
  const { ageMin, ageMax, readingStage } = inferAgeAndStage({
    hints: [title, ...subjects],
    pageCount,
    format,
    autoInferAgeRange: Boolean(options.autoInferAgeRange),
  });
  const cleanedCategories = cleanProviderCategories(subjects);

  const coverUrl =
    typeof doc.cover_i === 'number' && doc.cover_i > 0
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : undefined;

  const langTag = resolveLanguageTag(doc.language, isbn13);
  const tags = extractNormalizedTags(subjects, '', title, langTag ? [langTag] : []);
  const tagOrigins = buildCandidateTagOrigins(
    tags,
    subjects,
    langTag ? [langTag] : []
  );
  const readingLevelHint = inferReadingLevelHint({
    readingStage,
    format,
    pageCount,
    tags,
    textCorpus: `${title} ${subjects.join(' ')}`,
  });

  const searchSummary = cleanBookDescription(doc.description || doc.first_sentence);
  const cleanOlSearchId = cleanProviderExternalId(
    typeof doc.key === 'string' ? doc.key : undefined
  );
  /** @type {import('../../types/models.js').ProviderSource} */
  const source = {
    provider: 'open-library',
    ...(cleanOlSearchId ? { externalId: cleanOlSearchId } : {}),
    fetchedAt: new Date().toISOString(),
    ...(options.retainRaw ? { rawPayload: doc } : {}),
  };

  return {
    candidateKey: buildCandidateKey(isbn13, title, authors),
    isbn13,
    ...(isbn10 ? { isbn10 } : {}),
    title,
    authors,
    ...(publishedYear ? { publishedYear } : {}),
    ...(pageCount ? { pageCount } : {}),
    format,
    ...(typeof ageMin === 'number' ? { ageMin } : {}),
    ...(typeof ageMax === 'number' ? { ageMax } : {}),
    readingStage,
    readingLevelHint,
    ...(cleanedCategories.length ? { categories: cleanedCategories } : {}),
    tags,
    tagOrigins,
    ...(coverUrl ? { coverUrl } : {}),
    ...(searchSummary ? { summary: searchSummary } : {}),
    ...(subjects.length ? { subjects: subjects.slice(0, 12) } : {}),
    spineColor: pickDeterministicSpineColor(isbn13 || title),
    sources: [source],
  };
}

/**
 * Merges two BookCandidates representing the same edition/work, combining metadata and provenance.
 * @param {BookCandidate} primary
 * @param {BookCandidate} secondary
 * @returns {BookCandidate}
 */
export function mergeBookCandidates(primary, secondary) {
  const mergedTags = sanitizeTagList([...primary.tags, ...secondary.tags], 8);
  const mergedAuthors =
    primary.authors[0] === 'Unknown Author' && secondary.authors[0] !== 'Unknown Author'
      ? secondary.authors
      : Array.from(new Set([...primary.authors, ...secondary.authors])).filter(
          (a) => a !== 'Unknown Author'
        );

  const isbn13 = primary.isbn13 || secondary.isbn13;
  const isbn10 = primary.isbn10 || secondary.isbn10;
  const coverUrl = primary.coverUrl || secondary.coverUrl;
  const publishedYear = primary.publishedYear || secondary.publishedYear;
  const pageCount = primary.pageCount || secondary.pageCount;
  const summary = primary.summary || secondary.summary;
  const readingLevelHint = primary.readingLevelHint || secondary.readingLevelHint;
  const language = primary.language || secondary.language;
  const dimensions = primary.dimensions || secondary.dimensions;
  const averageRating = primary.averageRating !== undefined ? primary.averageRating : secondary.averageRating;
  const ratingsCount = primary.ratingsCount !== undefined ? primary.ratingsCount : secondary.ratingsCount;
  const publisher = primary.publisher || secondary.publisher;
  const previewLink = primary.previewLink || secondary.previewLink;
  const edition = primary.edition || secondary.edition;
  const listPriceAmount =
    primary.listPriceAmount !== undefined ? primary.listPriceAmount : secondary.listPriceAmount;
  const listPriceCurrency = primary.listPriceCurrency || secondary.listPriceCurrency;
  const mergedSubjects = Array.from(
    new Set([...(primary.subjects || []), ...(secondary.subjects || [])])
  ).slice(0, 14);
  const mergedCategories = cleanProviderCategories([
    ...(primary.categories || []),
    ...(secondary.categories || []),
  ]);
  const mergedAgeMin = primary.ageMin !== undefined ? primary.ageMin : secondary.ageMin;
  const mergedAgeMax = primary.ageMax !== undefined ? primary.ageMax : secondary.ageMax;
  /** @type {Record<string, import('../../types/models.js').TagOrigin>} */
  const mergedTagOrigins = {};
  for (const tag of mergedTags) {
    const pOrigin = primary.tagOrigins?.[tag];
    const sOrigin = secondary.tagOrigins?.[tag];
    if (pOrigin === 'provider' || sOrigin === 'provider') {
      mergedTagOrigins[tag] = 'provider';
    } else if (pOrigin) {
      mergedTagOrigins[tag] = pOrigin;
    } else if (sOrigin) {
      mergedTagOrigins[tag] = sOrigin;
    }
  }

  return {
    ...primary,
    candidateKey: buildCandidateKey(isbn13, primary.title, mergedAuthors),
    isbn13,
    ...(isbn10 ? { isbn10 } : {}),
    authors: mergedAuthors.length ? mergedAuthors : ['Unknown Author'],
    ...(publishedYear ? { publishedYear } : {}),
    ...(pageCount ? { pageCount } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(summary ? { summary } : {}),
    ...(readingLevelHint ? { readingLevelHint } : {}),
    ...(typeof mergedAgeMin === 'number' ? { ageMin: mergedAgeMin } : {}),
    ...(typeof mergedAgeMax === 'number' ? { ageMax: mergedAgeMax } : {}),
    ...(mergedCategories.length ? { categories: mergedCategories } : {}),
    ...(mergedSubjects.length ? { subjects: mergedSubjects } : {}),
    ...(language ? { language } : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(edition ? { edition } : {}),
    ...(listPriceAmount !== undefined ? { listPriceAmount } : {}),
    ...(listPriceCurrency ? { listPriceCurrency } : {}),
    ...(averageRating !== undefined ? { averageRating } : {}),
    ...(ratingsCount !== undefined ? { ratingsCount } : {}),
    ...(publisher ? { publisher } : {}),
    ...(previewLink ? { previewLink } : {}),
    format: primary.format !== 'hardcover' ? primary.format : secondary.format,
    tags: mergedTags,
    ...(Object.keys(mergedTagOrigins).length > 0 ? { tagOrigins: mergedTagOrigins } : {}),
    sources: [...primary.sources, ...secondary.sources],
  };
}

/**
 * Materializes a BookCandidate into a persisted Book entity.
 * @param {BookCandidate} candidate
 * @param {{ retainRaw?: boolean }} [options]
 * @returns {import('../../types/models.js').Book}
 */
export function candidateToBook(candidate, options = {}) {
  const now = new Date().toISOString();
  const sources = candidate.sources.map((src) => {
    if (options.retainRaw) return src;
    const { rawPayload: _omitted, ...cleanSource } = src;
    return cleanSource;
  });
  const tags = sanitizeTagList(candidate.tags, 8);
  const categories = cleanProviderCategories(candidate.categories || candidate.subjects || []);
  /** @type {Record<string, import('../../types/models.js').TagOrigin>} */
  const tagOrigins = {};
  if (candidate.tagOrigins) {
    for (const tag of tags) {
      if (candidate.tagOrigins[tag]) {
        tagOrigins[tag] = candidate.tagOrigins[tag];
      }
    }
  }

  const description = cleanBookDescription(candidate.summary || '');

  return {
    id: createId('book'),
    isbn13: candidate.isbn13,
    ...(candidate.isbn10 ? { isbn10: candidate.isbn10 } : {}),
    title: candidate.title,
    authors: candidate.authors.length ? candidate.authors : ['Unknown Author'],
    ...(candidate.publishedYear ? { publishedYear: candidate.publishedYear } : {}),
    ...(candidate.pageCount ? { pageCount: candidate.pageCount } : {}),
    format: candidate.format,
    ...(typeof candidate.ageMin === 'number' ? { ageMin: candidate.ageMin } : {}),
    ...(typeof candidate.ageMax === 'number' ? { ageMax: candidate.ageMax } : {}),
    readingStage: candidate.readingStage,
    ...(candidate.readingLevelHint ? { readingLevelHint: candidate.readingLevelHint } : {}),
    ...(categories.length ? { categories } : {}),
    tags,
    ...(Object.keys(tagOrigins).length > 0 ? { tagOrigins } : {}),
    ...(candidate.coverUrl ? { coverUrl: candidate.coverUrl } : {}),
    ...(description ? { description } : {}),
    ...(candidate.language ? { language: candidate.language } : {}),
    ...(candidate.dimensions ? { dimensions: candidate.dimensions } : {}),
    ...(candidate.edition ? { edition: candidate.edition } : {}),
    ...(candidate.listPriceAmount !== undefined
      ? { listPriceAmount: candidate.listPriceAmount }
      : {}),
    ...(candidate.listPriceCurrency ? { listPriceCurrency: candidate.listPriceCurrency } : {}),
    ...(candidate.averageRating !== undefined ? { averageRating: candidate.averageRating } : {}),
    ...(candidate.ratingsCount !== undefined ? { ratingsCount: candidate.ratingsCount } : {}),
    ...(candidate.publisher ? { publisher: candidate.publisher } : {}),
    ...(candidate.previewLink ? { previewLink: candidate.previewLink } : {}),
    spineColor:
      candidate.spineColor || pickDeterministicSpineColor(candidate.isbn13 || candidate.title),
    addedAt: now,
    sources,
  };
}
