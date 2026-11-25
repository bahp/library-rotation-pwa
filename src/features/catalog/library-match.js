/**
 * @fileoverview Matches online catalog BookCandidates against books already in the family library
 * by ISBN-13, ISBN-10, or normalized title + primary author stem.
 */

import { stripDiacritics } from '../tagging/rule-tagger.js';

/**
 * Normalizes a book title stem for loose deduplication against online catalog candidates.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeTitleStem(raw) {
  return stripDiacritics(String(raw || ''))
    .toLowerCase()
    .split(':')[0]
    .split('(')[0]
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Extracts a normalized primary author last name (excluding 'Unknown Author').
 * @param {string[] | undefined} authors
 * @returns {string}
 */
function extractAuthorLastName(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return '';
  const first = stripDiacritics(String(authors[0] || ''))
    .toLowerCase()
    .trim();
  if (!first || first === 'unknown author' || first === 'unknown') return '';
  const parts = first.replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/);
  return parts[parts.length - 1] || '';
}

/**
 * Finds the matching saved Book in the user's catalog for an online BookCandidate, if any.
 * Checks ISBN-13, ISBN-10, and finally normalized title + author surname.
 *
 * @param {import('./normalizer.js').BookCandidate | null | undefined} candidate
 * @param {import('../../types/models.js').Book[] | null | undefined} books
 * @returns {import('../../types/models.js').Book | null}
 */
export function findMatchingLibraryBook(candidate, books) {
  if (!candidate || !Array.isArray(books) || books.length === 0) return null;

  const cand13 = String(candidate.isbn13 || '').replace(/[^0-9]/g, '');
  const cand10 = String(candidate.isbn10 || '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();

  if (cand13 || cand10) {
    for (const book of books) {
      const b13 = String(book.isbn13 || '').replace(/[^0-9]/g, '');
      const b10 = String(book.isbn10 || '')
        .replace(/[^0-9Xx]/g, '')
        .toUpperCase();
      if (cand13 && b13 && cand13 === b13) return book;
      if (cand10 && b10 && cand10 === b10) return book;
    }
  }

  const candTitle = normalizeTitleStem(candidate.title);
  if (!candTitle || candTitle.length < 3) return null;
  const candAuthorLast = extractAuthorLastName(candidate.authors);

  for (const book of books) {
    const bookTitle = normalizeTitleStem(book.title);
    if (!bookTitle || bookTitle !== candTitle) continue;

    const bookAuthorLast = extractAuthorLastName(book.authors);
    // Require matching author surname when both records have an author
    if (candAuthorLast && bookAuthorLast) {
      if (candAuthorLast === bookAuthorLast) return book;
      continue;
    }
    // If author metadata is absent on one side, allow exact multi-word title match
    if (candTitle.includes(' ') || candTitle.length >= 10) {
      return book;
    }
  }

  return null;
}
