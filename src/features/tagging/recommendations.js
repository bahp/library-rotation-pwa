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

const BEDTIME_TAG_HINTS = new Set([
  'bedtime',
  'sleep',
  'calm',
  'lullaby',
  'gentle',
  'night',
  'goodnight',
  'moon',
  'stars',
  'cozy',
]);

const BEDTIME_TEXT_RE =
  /\b(bedtime|sleepy|goodnight|lullaby|tuck|dream|moonlight|starry|slumber|gentle|soothing|quiet|calm|yawn|pajama|nap)\b/i;

/**
 * Returns true from 6:30 PM (`18:30`) onwards through late evening/night (`05:00`),
 * so wind-down & bedtime stories naturally float higher up before sleep.
 *
 * @param {Date} [nowDate]
 * @returns {boolean}
 */
export function isWindDownEveningWindow(nowDate = new Date()) {
  const d = nowDate instanceof Date && !Number.isNaN(nowDate.getTime()) ? nowDate : new Date();
  const minutes = d.getHours() * 60 + d.getMinutes();
  return minutes >= 18 * 60 + 30 || minutes < 5 * 60;
}

/**
 * Builds calm, soothing bedtime / wind-down owned book picks using tags, titles, and saved descriptions.
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
export function getBedtimeWindDownShelf(input) {
  const { books, profile, rotations } = input;
  if (!profile) return [];
  const limit = Math.max(1, input.limit || 8);
  const nowIso = input.nowIso || new Date().toISOString();
  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);

  /** @type {RecommendedBookItem[]} */
  const scored = [];
  for (const book of books) {
    if (!isBookOwnedAndRotatable(book)) continue;

    const matchedTags = (book.tags || []).filter((t) =>
      BEDTIME_TAG_HINTS.has(t.toLowerCase().trim())
    );
    const descMatch = BEDTIME_TEXT_RE.test(book.description || '');
    const titleMatch = BEDTIME_TEXT_RE.test(book.title || '');
    if (matchedTags.length === 0 && !descMatch && !titleMatch) continue;

    let score = matchedTags.length * 16 + (titleMatch ? 18 : 0) + (descMatch ? 12 : 0);
    if (profile.age >= book.ageMin && profile.age <= book.ageMax) score += 14;
    if (!activeBookSet.has(book.id)) score += 6;
    if (book.loved) score += 8;

    const inCooldown = isBookInCooldown(book, profile.cooldownDays, nowIso);
    const reasons = [];
    if (matchedTags.length > 0) reasons.push(formatRecommendationTopicLabel(matchedTags[0]));
    else if (titleMatch || descMatch) reasons.push('Calm bedtime read');
    if (book.loved) reasons.push('Loved favorite');

    scored.push({
      book,
      score,
      matchedTopics: matchedTags,
      matchReasons: reasons,
      isUnread: !readSet.has(book.id),
      inCooldown,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.book.title.localeCompare(b.book.title);
  });

  return scored.slice(0, limit);
}

/**
 * Finds "Dusty Gems on Your Shelf": owned rotatable books off the active shelf
 * that haven't been rotated in 3+ months (`minDaysUntouched`, default 90 days)
 * or have never been rotated and were added at least 21 days ago.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   minDaysUntouched?: number,
 *   nowIso?: string,
 *   limit?: number
 * }} input
 * @returns {RecommendedBookItem[]}
 */
export function getDustyGemsShelf(input) {
  const { books, profile, rotations } = input;
  if (!profile) return [];
  const limit = Math.max(1, input.limit || 8);
  const minDaysUntouched = Math.max(30, input.minDaysUntouched || 90);
  const nowIso = input.nowIso || new Date().toISOString();
  const nowMs = Date.parse(nowIso) || Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);

  /** @type {RecommendedBookItem[]} */
  const gems = [];
  for (const book of books) {
    if (activeBookSet.has(book.id) || !isBookOwnedAndRotatable(book)) continue;

    const lastRotatedMs = book.lastRotatedAt ? Date.parse(book.lastRotatedAt) : NaN;
    const addedMs = book.addedAt ? Date.parse(book.addedAt) : NaN;

    let idleDays = 0;
    let reason = '';
    if (Number.isFinite(lastRotatedMs)) {
      idleDays = Math.floor((nowMs - lastRotatedMs) / dayMs);
      if (idleDays < minDaysUntouched) continue;
      const months = Math.max(3, Math.round(idleDays / 30));
      reason = `Unrotated ${months}mo`;
    } else if (!book.rotationCount || book.rotationCount === 0) {
      idleDays = Number.isFinite(addedMs) ? Math.floor((nowMs - addedMs) / dayMs) : 60;
      if (idleDays < 21) continue;
      reason = 'Hidden gem · Never rotated';
    } else {
      continue;
    }

    let score = Math.min(80, Math.round(idleDays / 3));
    if (profile.age >= book.ageMin && profile.age <= book.ageMax) score += 20;
    if (!readSet.has(book.id)) score += 12;

    gems.push({
      book,
      score,
      matchedTopics: [],
      matchReasons: [reason],
      isUnread: !readSet.has(book.id),
      inCooldown: false,
    });
  }

  gems.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.book.title.localeCompare(b.book.title);
  });

  return gems.slice(0, limit);
}

/**
 * Surfaces loved / high-rated owned books ready for a cozy re-read (not read in 30+ days
 * and not currently on an active shelf).
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   minDaysSinceRead?: number,
 *   nowIso?: string,
 *   limit?: number
 * }} input
 * @returns {RecommendedBookItem[]}
 */
export function getReadyForRereadShelf(input) {
  const { books, profile, rotations } = input;
  if (!profile) return [];
  const limit = Math.max(1, input.limit || 8);
  const minDaysSinceRead = Math.max(14, input.minDaysSinceRead || 30);
  const nowIso = input.nowIso || new Date().toISOString();
  const nowMs = Date.parse(nowIso) || Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);

  /** @type {RecommendedBookItem[]} */
  const picks = [];
  for (const book of books) {
    if (activeBookSet.has(book.id) || !isBookOwnedAndRotatable(book)) continue;
    const rating = getBookUserRating(book, profile.id) ?? 0;
    const isFavorite = book.loved === true || rating >= 4;
    if (!isFavorite) continue;

    const lastReadMs = book.lastReadAt ? Date.parse(book.lastReadAt) : NaN;
    const lastRotatedMs = book.lastRotatedAt ? Date.parse(book.lastRotatedAt) : NaN;
    const refMs = Number.isFinite(lastReadMs)
      ? lastReadMs
      : readSet.has(book.id) && Number.isFinite(lastRotatedMs)
        ? lastRotatedMs
        : NaN;

    if (!Number.isFinite(refMs)) {
      if (!readSet.has(book.id)) continue;
    }

    const daysSince = Number.isFinite(refMs) ? Math.floor((nowMs - refMs) / dayMs) : minDaysSinceRead + 15;
    if (daysSince < minDaysSinceRead) continue;

    let score = Math.min(60, daysSince) + (book.loved ? 20 : 0) + rating * 6;
    const reason = Number.isFinite(refMs) ? `Re-read · ${daysSince}d ago` : 'Loved classic to revisit';

    picks.push({
      book,
      score,
      matchedTopics: [],
      matchReasons: [reason],
      isUnread: false,
      inCooldown: isBookInCooldown(book, profile.cooldownDays, nowIso),
    });
  }

  picks.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.book.title.localeCompare(b.book.title);
  });

  return picks.slice(0, limit);
}

/**
 * Picks a favorite author (based on loved / read books) with additional off-shelf owned books.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   nowIso?: string,
 *   minItems?: number,
 *   limit?: number
 * }} input
 * @returns {{ author: string, items: RecommendedBookItem[] } | null}
 */
export function getMoreByAuthorShelf(input) {
  const { books, profile, rotations } = input;
  if (!profile) return null;
  const limit = Math.max(1, input.limit || 8);
  const minItems = Math.max(1, input.minItems || 2);
  const nowIso = input.nowIso || new Date().toISOString();

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);

  /** @type {Map<string, { displayName: string, affinity: number }>} */
  const authorWeights = new Map();
  for (const book of books) {
    if (normalizeCollectionStatus(book.collectionStatus) !== 'owned') continue;
    const isLoved = book.loved === true;
    const isRead = readSet.has(book.id);
    for (const rawAuthor of book.authors || []) {
      const display = String(rawAuthor || '').trim();
      const key = display.toLowerCase();
      if (!key || key === 'unknown author' || key === 'unknown') continue;
      const prev = authorWeights.get(key) || { displayName: display, affinity: 0 };
      prev.affinity += 4 + (isLoved ? 24 : 0) + (isRead ? 10 : 0);
      authorWeights.set(key, prev);
    }
  }

  const offShelfOwned = books.filter(
    (b) => !activeBookSet.has(b.id) && isBookOwnedAndRotatable(b)
  );

  const rankedAuthors = [...authorWeights.entries()]
    .map(([key, meta]) => {
      const matching = offShelfOwned.filter((b) =>
        (b.authors || []).some((a) => String(a || '').trim().toLowerCase() === key)
      );
      return { key, displayName: meta.displayName, affinity: meta.affinity, matching };
    })
    .filter((entry) => entry.matching.length >= minItems)
    .sort((a, b) => {
      if (b.affinity !== a.affinity) return b.affinity - a.affinity;
      return b.matching.length - a.matching.length;
    });

  if (rankedAuthors.length === 0) return null;
  const chosen = rankedAuthors[0];

  const items = chosen.matching
    .map((book) => {
      const isUnread = !readSet.has(book.id);
      const inCooldown = isBookInCooldown(book, profile.cooldownDays, nowIso);
      let score = (isUnread ? 16 : 4) + (book.loved ? 10 : 0) + (!inCooldown ? 10 : -15);
      return {
        book,
        score,
        matchedTopics: [],
        matchReasons: [`By ${chosen.displayName}`],
        isUnread,
        inCooldown,
      };
    })
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title))
    .slice(0, limit);

  return {
    author: chosen.displayName,
    items,
  };
}

/**
 * Surfaces owned books in a specific non-English language present in the household catalog
 * (e.g. "In Spanish Today", "In Italian Today"), rotating daily if multiple languages exist.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   nowDate?: Date,
 *   nowIso?: string,
 *   minItems?: number,
 *   limit?: number
 * }} input
 * @returns {{ language: string, label: string, items: RecommendedBookItem[] } | null}
 */
export function getLanguageShelf(input) {
  const { books, profile, rotations } = input;
  if (!profile) return null;
  const limit = Math.max(1, input.limit || 8);
  const minItems = Math.max(1, input.minItems || 2);
  const nowDate = input.nowDate || new Date();
  const nowIso = input.nowIso || nowDate.toISOString();
  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);

  /** @type {Map<string, import('../../types/models.js').Book[]>} */
  const byLanguage = new Map();
  for (const book of books) {
    if (!isBookOwnedAndRotatable(book)) continue;
    const rawLang = String(book.language || '').trim().toLowerCase();
    if (!rawLang || rawLang === 'english' || rawLang === 'en') continue;
    const bucket = byLanguage.get(rawLang) || [];
    bucket.push(book);
    byLanguage.set(rawLang, bucket);
  }

  const eligibleLangs = [...byLanguage.entries()]
    .filter(([, list]) => list.length >= minItems)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  if (eligibleLangs.length === 0) return null;

  const dayOfYear = Math.floor(nowDate.getTime() / (24 * 60 * 60 * 1000));
  const [langKey, langBooks] = eligibleLangs[dayOfYear % eligibleLangs.length];
  const label = formatRecommendationTopicLabel(langKey);

  const items = langBooks
    .slice()
    .sort((a, b) => {
      const aOff = activeBookSet.has(a.id) ? 0 : 1;
      const bOff = activeBookSet.has(b.id) ? 0 : 1;
      if (bOff !== aOff) return bOff - aOff;
      return (b.loved ? 1 : 0) - (a.loved ? 1 : 0) || a.title.localeCompare(b.title);
    })
    .slice(0, limit)
    .map((book) => ({
      book,
      score: 20,
      matchedTopics: [langKey],
      matchReasons: [label],
      isUnread: !readSet.has(book.id),
      inCooldown: isBookInCooldown(book, profile.cooldownDays, nowIso),
    }));

  return {
    language: langKey,
    label,
    items,
  };
}

/**
 * Matches an active seasonal/holiday preset near the current calendar date against owned books.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotations: import('../../types/models.js').RotationList[],
 *   presets: import('../../types/models.js').RotationPreset[],
 *   nowDate?: Date,
 *   minItems?: number,
 *   limit?: number
 * }} input
 * @returns {{ preset: import('../../types/models.js').RotationPreset, items: RecommendedBookItem[] } | null}
 */
export function getSeasonalPresetShelf(input) {
  const { books, profile, rotations, presets } = input;
  if (!profile || !Array.isArray(presets) || presets.length === 0) return null;
  const limit = Math.max(1, input.limit || 8);
  const minItems = Math.max(1, input.minItems || 2);
  const nowDate = input.nowDate || new Date();
  const nowIso = nowDate.toISOString();
  const year = nowDate.getFullYear();

  const activeBookSet = getActiveProfileBookSet(profile, rotations);
  const readSet = new Set(profile.readHistoryBookIds || []);
  const owned = books.filter((b) => isBookOwnedAndRotatable(b));

  const datedPresets = presets
    .filter((p) => typeof p.suggestedStartMonthDay === 'string' && /^\d{2}-\d{2}$/.test(p.suggestedStartMonthDay))
    .map((p) => {
      const [mm, dd] = String(p.suggestedStartMonthDay).split('-').map(Number);
      let candidateMs = new Date(year, mm - 1, dd).getTime();
      let deltaDays = Math.round((nowDate.getTime() - candidateMs) / (24 * 60 * 60 * 1000));
      if (deltaDays > 180) {
        candidateMs = new Date(year + 1, mm - 1, dd).getTime();
        deltaDays = Math.round((nowDate.getTime() - candidateMs) / (24 * 60 * 60 * 1000));
      } else if (deltaDays < -180) {
        candidateMs = new Date(year - 1, mm - 1, dd).getTime();
        deltaDays = Math.round((nowDate.getTime() - candidateMs) / (24 * 60 * 60 * 1000));
      }
      return { preset: p, absDelta: Math.abs(deltaDays) };
    })
    .filter((entry) => entry.absDelta <= 45)
    .sort((a, b) => a.absDelta - b.absDelta);

  for (const { preset } of datedPresets) {
    const tagSet = new Set((preset.preferredTags || []).map((t) => t.toLowerCase().trim()));
    if (tagSet.size === 0) continue;

    const matching = owned
      .map((book) => {
        const shared = (book.tags || []).filter((t) => tagSet.has(t.toLowerCase().trim()));
        if (shared.length === 0) return null;
        return {
          book,
          score: shared.length * 16 + (!activeBookSet.has(book.id) ? 8 : 0),
          matchedTopics: shared,
          matchReasons: [formatRecommendationTopicLabel(shared[0])],
          isUnread: !readSet.has(book.id),
          inCooldown: isBookInCooldown(book, profile.cooldownDays, nowIso),
        };
      })
      .filter((x) => Boolean(x));

    if (matching.length >= minItems) {
      matching.sort((a, b) => (b?.score || 0) - (a?.score || 0));
      return {
        preset,
        items: /** @type {RecommendedBookItem[]} */ (matching.slice(0, limit)),
      };
    }
  }

  return null;
}

/**
 * Returns books saved on the family's wishlist sorted by most recently added / loved.
 *
 * @param {{ books: import('../../types/models.js').Book[], limit?: number }} input
 * @returns {import('../../types/models.js').Book[]}
 */
export function getWishlistSpotlightShelf({ books, limit = 10 }) {
  return (books || [])
    .filter((b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist')
    .slice()
    .sort((a, b) => {
      if (Boolean(b.loved) !== Boolean(a.loved)) return b.loved ? 1 : -1;
      const aTime = Date.parse(a.addedAt || '') || 0;
      const bTime = Date.parse(b.addedAt || '') || 0;
      return bTime - aTime;
    })
    .slice(0, limit);
}

