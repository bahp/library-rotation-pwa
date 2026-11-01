/**
 * @fileoverview Profile-aware Recommendations & Collection Topic Coverage Insights.
 * Surfaces personalized next-read candidates from the family library with transparent
 * match explanations, plus topic gap hints for future library visits.
 */

import { isBookRotatable } from '../../types/models.js';
import { isBookInCooldown } from '../rotations/rotation-engine.js';

/**
 * @typedef {Object} RecommendedBookItem
 * @property {import('../../types/models.js').Book} book
 * @property {number} score
 * @property {string[]} matchedTopics
 * @property {string[]} matchReasons
 * @property {boolean} isUnread
 * @property {boolean} inCooldown
 */

/**
 * Computes ranked next-read book recommendations for a specific child profile,
 * excluding books already sitting on that child's active rotation shelf.
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

  const activeRotation = rotations.find(
    (r) => r.profileId === profile.id && r.status === 'active'
  );
  const activeBookSet = new Set(activeRotation ? activeRotation.bookIds : []);
  const readSet = new Set(profile.readHistoryBookIds || []);
  const favoriteSet = new Set((profile.favoriteTopics || []).map((t) => t.toLowerCase().trim()));

  /** @type {RecommendedBookItem[]} */
  const candidates = [];

  for (const book of books) {
    if (activeBookSet.has(book.id) || !isBookRotatable(book)) continue;

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

    // 5. Cooldown freshness
    if (!inCooldown) {
      score += 22;
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
      matchReasons: reasons.slice(0, 3),
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
