/**
 * @fileoverview Profile-aware Recommendations & Collection Topic Coverage Insights.
 * Surfaces personalized next-read candidates from the family library with transparent
 * match explanations, plus topic gap hints for future library visits.
 */

import {
  getBookUserRating,
  isBookRotatable,
  normalizeCollectionStatus,
} from '../../types/models.js';
import {
  findMatchingNewBooksForRotation,
  isBookInCooldown,
} from '../rotations/rotation-engine.js';
import { countRotationsSinceLastSeen } from '../rotations/usage-insights.js';

/**
 * @typedef {Object} RecommendedBookItem
 * @property {import('../../types/models.js').Book} book
 * @property {number} score
 * @property {string[]} matchedTopics
 * @property {string[]} matchReasons
 * @property {boolean} isUnread
 * @property {boolean} inCooldown
 */

const GENERIC_SIMILARITY_TAGS = new Set([
  'picture-book',
  'picture book',
  'board-book',
  'board book',
  'early-reader',
  'early reader',
  'chapter-book',
  'chapter book',
  'story',
  'stories',
  'children',
  'kids',
  'classic',
  'read-aloud',
  'read aloud',
]);

/**
 * Strictly true only for household-owned books eligible for rotations/suggestions
 * (excludes wishlist, borrowed public library loans, broken/retired, and manually excluded titles).
 *
 * @param {import('../../types/models.js').Book | null | undefined} book
 * @returns {boolean}
 */
export function isBookOwnedAndRotatable(book) {
  if (!book) return false;
  return normalizeCollectionStatus(book.collectionStatus) === 'owned' && isBookRotatable(book);
}

/**
 * Collects all book IDs currently placed on any active rotation for the profile.
 *
 * @param {import('../../types/models.js').ChildProfile} profile
 * @param {import('../../types/models.js').RotationList[]} rotations
 * @returns {Set<string>}
 */
function getActiveProfileBookSet(profile, rotations) {
  const activeBookSet = new Set();
  for (const rot of rotations || []) {
    if (rot.profileId === profile.id && rot.status === 'active') {
      for (const id of rot.bookIds || []) {
        activeBookSet.add(id);
      }
    }
  }
  return activeBookSet;
}

/**
 * Formats a tag/topic slug into clean title case (e.g. "winnie-the-pooh" -> "Winnie the Pooh").
 *
 * @param {string} rawTopic
 * @returns {string}
 */
export function formatRecommendationTopicLabel(rawTopic) {
  const cleaned = String(rawTopic || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const minorWords = new Set(['and', 'or', 'the', 'of', 'in', 'for', 'to', 'a', 'an']);
  return cleaned
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Computes ranked next-read book recommendations for a specific child profile,
 * strictly from household-owned rotatable books not currently on any active shelf.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   nowIso?: string,
 *   limit?: number
 * }} input
 * @returns {RecommendedBookItem[]}
 */
export function getProfileRecommendations(input) {
  const { books, profile, rotations } = input;
  const nowIso = input.nowIso || new Date().toISOString();
  const limit = Math.max(1, input.limit || 3);

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);
  const favoriteSet = new Set((profile.favoriteTopics || []).map((t) => t.toLowerCase().trim()));

  /** @type {RecommendedBookItem[]} */
  const candidates = [];

  for (const book of books) {
    if (activeBookSet.has(book.id) || !isBookOwnedAndRotatable(book)) continue;

    const inCooldown = isBookInCooldown(book, profile.cooldownDays, nowIso);
    const isUnread = !readSet.has(book.id);
    const matchedTopics = book.tags.filter((t) => favoriteSet.has(t.toLowerCase()));

    let score = 0;
    /** @type {string[]} */
    const reasons = [];

    // 1. Age alignment
    if (profile.age >= book.ageMin && profile.age <= book.ageMax) {
      score += 36;
      reasons.push(`Fits age ${profile.age}`);
    } else if (Math.min(Math.abs(profile.age - book.ageMin), Math.abs(profile.age - book.ageMax)) <= 1) {
      score += 20;
      reasons.push(`Near age ${profile.age}`);
    } else {
      score += 4;
    }

    // 2. Reading stage fit
    if (book.readingStage === profile.readingStage) {
      score += 18;
    }

    // 3. Favorite topic matches
    if (matchedTopics.length > 0) {
      score += Math.min(36, matchedTopics.length * 14);
      reasons.unshift(`Matches ${matchedTopics.slice(0, 2).join(', ')}`);
    }

    // 4. Unread discovery bonus
    if (isUnread) {
      score += 16;
      reasons.push('Unread together');
    }

    // 5. Cooldown freshness & multi-rotation box diversity
    if (!inCooldown) {
      score += 22;
      if (!book.lastRotatedAt) {
        score += 12;
        reasons.push('Never on shelf yet');
      } else {
        const rotationsSince = countRotationsSinceLastSeen(book, rotations, profile.id);
        const lastMs = Date.parse(book.lastRotatedAt);
        const nowMs = Date.parse(nowIso);
        const elapsedDays =
          !Number.isNaN(lastMs) && !Number.isNaN(nowMs)
            ? Math.max(0, Math.floor((nowMs - lastMs) / (24 * 60 * 60 * 1000)))
            : 0;
        if (rotationsSince !== null && rotationsSince >= 2) {
          score += Math.min(14, rotationsSince * 4);
          reasons.push(`Unseen for ${rotationsSince} rotations`);
        } else if (elapsedDays >= 28) {
          score += Math.min(10, Math.floor(elapsedDays / 14) * 3);
          reasons.push(`Off shelf ${elapsedDays}d`);
        }
      }
    } else {
      score -= 25;
      reasons.push('Recently rotated');
    }

    if (book.loved === true) {
      score += 8;
      reasons.push('Loved favorite');
    }

    if (book.readingLevelHint) {
      const shortHint = book.readingLevelHint.split('·')[0].trim();
      if (shortHint) reasons.push(shortHint);
    }

    candidates.push({
      book,
      score,
      matchedTopics,
      matchReasons: reasons.slice(0, 4),
      isUnread,
      inCooldown,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.book.title.localeCompare(b.book.title);
  });

  return candidates.slice(0, limit);
}

/**
 * Finds owned off-shelf books from the household library that match a given rotation's
 * rules (tags, binding format, objective, age), prioritizing newly acquired matching titles.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotation: import('../../types/models.js').RotationList | null | undefined,
 *   rotations?: import('../../types/models.js').RotationList[],
 *   nowIso?: string,
 *   limit?: number
 * }} input
 * @returns {RecommendedBookItem[]}
 */
export function getRotationLibrarySuggestions(input) {
  const { books, profile, rotation, rotations = [] } = input;
  if (!rotation || !profile) return [];

  const nowIso = input.nowIso || new Date().toISOString();
  const limit = Math.max(1, input.limit || 8);
  const ownedBooks = books.filter((b) => isBookOwnedAndRotatable(b));
  if (ownedBooks.length === 0) return [];

  const readSet = new Set(profile.readHistoryBookIds || []);
  const ruleTagSet = new Set(
    (rotation.rules?.preferredTags || []).map((t) => String(t || '').toLowerCase().trim()).filter(Boolean)
  );

  const { matchingBooks, allEligibleBooks, hasExplicitRuleFilters } =
    findMatchingNewBooksForRotation({
      books: ownedBooks,
      profile,
      rotation,
      rotations,
      nowIso,
    });

  const pool =
    matchingBooks.length > 0
      ? matchingBooks
      : !hasExplicitRuleFilters
        ? allEligibleBooks
        : [];

  return pool.slice(0, limit).map((entry) => {
    const matchedTopics = entry.book.tags.filter((t) => ruleTagSet.has(t.toLowerCase()));
    return {
      book: entry.book,
      score: entry.baseScore,
      matchedTopics,
      matchReasons:
        entry.matchedReasons.length > 0 ? entry.matchedReasons.slice(0, 3) : ['Fits this shelf'],
      isUnread: !readSet.has(entry.book.id),
      inCooldown: entry.inCooldown,
    };
  });
}

/**
 * Builds up to `maxAnchors` owned-library similarity shelves anchored by distinct Loved books
 * ("Suggested because you loved XX"). Only returns shelves with genuine tag or author overlap.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   maxAnchors?: number,
 *   itemsPerAnchor?: number,
 *   minItems?: number,
 *   nowIso?: string
 * }} input
 * @returns {Array<{ anchorBook: import('../../types/models.js').Book, items: RecommendedBookItem[] }>}
 */
export function getLovedBookSimilarityShelves(input) {
  const { books, profile, rotations } = input;
  if (!profile) return [];

  const maxAnchors = Math.max(1, input.maxAnchors || 2);
  const itemsPerAnchor = Math.max(1, input.itemsPerAnchor || 8);
  const minItems = Math.max(1, input.minItems || 1);
  const nowIso = input.nowIso || new Date().toISOString();

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);

  // Loved anchors can be currently on or off shelf, as long as household-owned
  const lovedAnchors = books
    .filter((b) => b.loved === true && normalizeCollectionStatus(b.collectionStatus) === 'owned')
    .slice()
    .sort((a, b) => {
      const aRating = getBookUserRating(a, profile.id) ?? 0;
      const bRating = getBookUserRating(b, profile.id) ?? 0;
      if (bRating !== aRating) return bRating - aRating;
      const aTime = Date.parse(a.lastReadAt || a.addedAt || '') || 0;
      const bTime = Date.parse(b.lastReadAt || b.addedAt || '') || 0;
      if (bTime !== aTime) return bTime - aTime;
      return a.title.localeCompare(b.title);
    });

  if (lovedAnchors.length === 0) return [];

  const candidatePool = books.filter(
    (b) => !activeBookSet.has(b.id) && isBookOwnedAndRotatable(b)
  );
  if (candidatePool.length === 0) return [];

  /** @type {Array<{ anchorBook: import('../../types/models.js').Book, items: RecommendedBookItem[] }>} */
  const shelves = [];
  const usedRecommendedIds = new Set();

  for (const anchor of lovedAnchors) {
    if (shelves.length >= maxAnchors) break;

    const anchorAuthors = new Set(
      (anchor.authors || []).map((a) => a.toLowerCase().trim()).filter(Boolean)
    );
    const anchorSpecificTags = new Set(
      (anchor.tags || [])
        .map((t) => t.toLowerCase().trim())
        .filter((t) => t && !GENERIC_SIMILARITY_TAGS.has(t))
    );

    if (anchorSpecificTags.size === 0 && anchorAuthors.size === 0) continue;

    /** @type {RecommendedBookItem[]} */
    const scoredMatches = [];

    for (const candidate of candidatePool) {
      if (candidate.id === anchor.id) continue;

      const sharedAuthors = (candidate.authors || []).filter((a) =>
        anchorAuthors.has(a.toLowerCase().trim())
      );
      const sharedTags = (candidate.tags || []).filter((t) =>
        anchorSpecificTags.has(t.toLowerCase().trim())
      );

      // Require a real thematic or author connection
      if (sharedAuthors.length === 0 && sharedTags.length === 0) continue;

      let score = 0;
      /** @type {string[]} */
      const reasons = [];

      if (sharedAuthors.length > 0) {
        score += 26 * sharedAuthors.length;
        reasons.push(`By ${sharedAuthors[0]}`);
      }
      if (sharedTags.length > 0) {
        score += 22 * Math.min(3, sharedTags.length);
        reasons.push(`Shares ${formatRecommendationTopicLabel(sharedTags[0])}`);
      }
      if (candidate.readingStage === anchor.readingStage) {
        score += 10;
      }
      if (candidate.ageMin <= anchor.ageMax && candidate.ageMax >= anchor.ageMin) {
        score += 6;
      }

      const isUnread = !readSet.has(candidate.id);
      if (isUnread) score += 8;

      const inCooldown = isBookInCooldown(candidate, profile.cooldownDays, nowIso);
      if (!inCooldown) score += 6;
      else score -= 14;

      // Slight diversity nudge so two loved shelves don't display the exact same book order
      if (usedRecommendedIds.has(candidate.id)) {
        score -= 8;
      }

      scoredMatches.push({
        book: candidate,
        score,
        matchedTopics: sharedTags,
        matchReasons: reasons.slice(0, 3),
        isUnread,
        inCooldown,
      });
    }

    scoredMatches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1;
      return a.book.title.localeCompare(b.book.title);
    });

    const selected = scoredMatches.slice(0, itemsPerAnchor);
    if (selected.length < minItems) continue;

    // Avoid adding a redundant second shelf if it brings almost no distinct books
    if (shelves.length > 0) {
      const freshCount = selected.filter((item) => !usedRecommendedIds.has(item.book.id)).length;
      if (freshCount === 0) continue;
    }

    for (const item of selected) {
      usedRecommendedIds.add(item.book.id);
    }

    shelves.push({
      anchorBook: anchor,
      items: selected,
    });
  }

  return shelves;
}

/**
 * Picks a top favorite genre/topic based on the child's favoriteTopics + loved/read books
 * and returns matching owned off-shelf books ("Suggested because you like XX").
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   limit?: number,
 *   minItems?: number,
 *   nowIso?: string
 * }} input
 * @returns {{ topic: string, label: string, items: RecommendedBookItem[] } | null}
 */
export function getFavoriteGenreRecommendationShelf(input) {
  const { books, profile, rotations } = input;
  if (!profile) return null;

  const limit = Math.max(1, input.limit || 8);
  const minItems = Math.max(1, input.minItems || 2);
  const nowIso = input.nowIso || new Date().toISOString();

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);
  const offShelfOwned = books.filter(
    (b) => !activeBookSet.has(b.id) && isBookOwnedAndRotatable(b)
  );
  if (offShelfOwned.length < minItems) return null;

  /** @type {Map<string, number>} */
  const topicWeights = new Map();
  /**
   * @param {string} rawTag
   * @param {number} weight
   */
  const addWeight = (rawTag, weight) => {
    const key = String(rawTag || '').toLowerCase().trim();
    if (!key || GENERIC_SIMILARITY_TAGS.has(key)) return;
    topicWeights.set(key, (topicWeights.get(key) || 0) + weight);
  };

  // 1. Reader's explicit favorite topics
  (profile.favoriteTopics || []).forEach((topic, idx) => {
    addWeight(topic, Math.max(18, 34 - idx * 3));
  });

  // 2. Signals from loved books and reading history
  for (const book of books) {
    if (normalizeCollectionStatus(book.collectionStatus) !== 'owned') continue;
    const isLoved = book.loved === true;
    const isRead = readSet.has(book.id);
    if (!isLoved && !isRead) continue;
    for (const tag of book.tags || []) {
      addWeight(tag, (isLoved ? 18 : 0) + (isRead ? 8 : 0));
    }
  }

  // 3. Fallback frequency from owned catalog tags
  for (const book of offShelfOwned) {
    for (const tag of book.tags || []) {
      addWeight(tag, 3);
    }
  }

  const rankedTopics = [...topicWeights.entries()]
    .map(([topic, weight]) => {
      const matching = offShelfOwned.filter((b) =>
        (b.tags || []).some((t) => t.toLowerCase().trim() === topic)
      );
      return { topic, weight, matching };
    })
    .filter((entry) => entry.matching.length >= minItems)
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (b.matching.length !== a.matching.length) return b.matching.length - a.matching.length;
      return a.topic.localeCompare(b.topic);
    });

  if (rankedTopics.length === 0) return null;

  const chosen = rankedTopics[0];
  const label = formatRecommendationTopicLabel(chosen.topic);

  /** @type {RecommendedBookItem[]} */
  const items = chosen.matching
    .map((book) => {
      let score = 20;
      const inCooldown = isBookInCooldown(book, profile.cooldownDays, nowIso);
      const isUnread = !readSet.has(book.id);

      if (profile.age >= book.ageMin && profile.age <= book.ageMax) score += 20;
      else if (Math.min(Math.abs(profile.age - book.ageMin), Math.abs(profile.age - book.ageMax)) <= 1) score += 10;

      if (book.readingStage === profile.readingStage) score += 12;
      if (isUnread) score += 10;
      if (!inCooldown) score += 12;
      else score -= 18;
      if (book.loved === true) score += 6;

      return {
        book,
        score,
        matchedTopics: [chosen.topic],
        matchReasons: [label],
        isUnread,
        inCooldown,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.book.title.localeCompare(b.book.title);
    })
    .slice(0, limit);

  return {
    topic: chosen.topic,
    label,
    items,
  };
}

/**
 * Evaluates how well the family catalog covers each of the child's favorite topics.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile
 * }} input
 * @returns {{
 *   topicCounts: Array<{ topic: string, count: number }>,
 *   lowCoverageTopics: string[]
 * }}
 */
export function getTopicCoverageInsights({ books, profile }) {
  const topics = (profile.favoriteTopics || [])
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);

  const topicCounts = topics.map((topic) => {
    const count = books.filter((b) =>
      b.tags.some((tag) => tag.toLowerCase() === topic)
    ).length;
    return { topic, count };
  });

  const lowCoverageTopics = topicCounts
    .filter((item) => item.count <= 1)
    .map((item) => item.topic);

  return {
    topicCounts,
    lowCoverageTopics,
  };
}
