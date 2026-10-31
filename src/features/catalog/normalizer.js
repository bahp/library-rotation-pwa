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
 * Infers age range and reading stage from subjects/categories, description, format, and page count.
 * @param {{ hints: string[], pageCount?: number, format: import('../../types/models.js').BookFormat }} input
 * @returns {{ ageMin: number, ageMax: number, readingStage: import('../../types/models.js').ReadingStage }}
 */
export function inferAgeAndStage({ hints, pageCount, format }) {
  return inferAgeAndStageFromSignals({ hints, pageCount, format });
}

/**
 * Extracts clean topic tags from provider subjects/categories, title, and summary text.
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
  });
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
 * Normalizes a Google Books API Volume item into a BookCandidate.
 * @param {Record<string, any>} item
 * @param {{ retainRaw?: boolean, fallbackIsbn?: string }} [options]
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
  const description = typeof info.description === 'string' ? info.description.trim() : '';

  const formatHints = [...categories, String(info.printType || ''), title];
  const format = inferBookFormat(formatHints, pageCount);
  const { ageMin, ageMax, readingStage } = inferAgeAndStage({
    hints: [title, ...categories, description],
    pageCount,
    format,
  });

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
  const readingLevelHint = inferReadingLevelHint({
    readingStage,
    format,
    pageCount,
    tags,
    textCorpus: `${title} ${categories.join(' ')} ${description}`,
  });

  /** @type {import('../../types/models.js').ProviderSource} */
  const source = {
    provider: 'google-books',
    externalId: typeof item.id === 'string' ? item.id : undefined,
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
    ageMin,
    ageMax,
    readingStage,
    readingLevelHint,
    tags,
    ...(coverUrl ? { coverUrl } : {}),
    ...(description ? { summary: description.slice(0, 320) } : {}),
    ...(categories.length ? { subjects: categories.slice(0, 12) } : {}),
    spineColor: pickDeterministicSpineColor(isbn13 || title),
    sources: [source],
  };
}

/**
 * Normalizes an Open Library `api/books?jscmd=data` record into a BookCandidate.
 * Only sets `coverUrl` when Open Library explicitly confirms a `cover` object on the record
 * (avoiding blind `covers.openlibrary.org/...?default=false` URLs that 404 in browsers).
 * @param {Record<string, any>} record
 * @param {{ retainRaw?: boolean, queriedIsbn?: string }} [options]
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
  });

  const coverObj = record.cover || {};
  const coverUrl = sanitizeCoverUrl(coverObj.large || coverObj.medium || coverObj.small);

  const langTag = resolveLanguageTag(record.languages, isbn13);
  const tags = extractNormalizedTags(subjects, '', title, langTag ? [langTag] : []);
  const readingLevelHint = inferReadingLevelHint({
    readingStage,
    format,
    pageCount,
    tags,
    textCorpus: `${title} ${subjects.join(' ')}`,
  });

  /** @type {import('../../types/models.js').ProviderSource} */
  const source = {
    provider: 'open-library',
    externalId: typeof record.key === 'string' ? record.key : undefined,
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
    ageMin,
    ageMax,
    readingStage,
    readingLevelHint,
    tags,
    ...(coverUrl ? { coverUrl } : {}),
    ...(subjects.length ? { subjects: subjects.slice(0, 12) } : {}),
    spineColor: pickDeterministicSpineColor(isbn13 || title),
    sources: [source],
  };
}

/**
 * Normalizes an Open Library `search.json` doc into a BookCandidate.
 * @param {Record<string, any>} doc
 * @param {{ retainRaw?: boolean, queriedIsbn?: string }} [options]
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
  });

  const coverUrl =
    typeof doc.cover_i === 'number' && doc.cover_i > 0
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : undefined;

  const langTag = resolveLanguageTag(doc.language, isbn13);
  const tags = extractNormalizedTags(subjects, '', title, langTag ? [langTag] : []);
  const readingLevelHint = inferReadingLevelHint({
    readingStage,
    format,
    pageCount,
    tags,
    textCorpus: `${title} ${subjects.join(' ')}`,
  });

  /** @type {import('../../types/models.js').ProviderSource} */
  const source = {
    provider: 'open-library',
    externalId: typeof doc.key === 'string' ? doc.key : undefined,
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
    ageMin,
    ageMax,
    readingStage,
    readingLevelHint,
    tags,
    ...(coverUrl ? { coverUrl } : {}),
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
  const mergedSubjects = Array.from(
    new Set([...(primary.subjects || []), ...(secondary.subjects || [])])
  ).slice(0, 14);

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
    ...(mergedSubjects.length ? { subjects: mergedSubjects } : {}),
    format: primary.format !== 'hardcover' ? primary.format : secondary.format,
    tags: mergedTags,
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

  return {
    id: createId('book'),
    isbn13: candidate.isbn13,
    ...(candidate.isbn10 ? { isbn10: candidate.isbn10 } : {}),
    title: candidate.title,
    authors: candidate.authors.length ? candidate.authors : ['Unknown Author'],
    ...(candidate.publishedYear ? { publishedYear: candidate.publishedYear } : {}),
    ...(candidate.pageCount ? { pageCount: candidate.pageCount } : {}),
    format: candidate.format,
    ageMin: candidate.ageMin,
    ageMax: candidate.ageMax,
    readingStage: candidate.readingStage,
    ...(candidate.readingLevelHint ? { readingLevelHint: candidate.readingLevelHint } : {}),
    tags: sanitizeTagList(candidate.tags, 8),
    ...(candidate.coverUrl ? { coverUrl: candidate.coverUrl } : {}),
    spineColor:
      candidate.spineColor || pickDeterministicSpineColor(candidate.isbn13 || candidate.title),
    addedAt: now,
    sources,
  };
}
