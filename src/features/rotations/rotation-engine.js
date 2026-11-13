/**
 * @fileoverview Pure, deterministic Rotation Engine & Post-Generation Shelf Operations:
 * - Seeded deterministic PRNG (`xmur3` string hash + `mulberry32` stream)
 * - Free-text rotation objective parser (e.g., "hardcover + Christmas themes", "board books + bedtime")
 * - Multi-factor eligibility & scoring (child age/readingStage fit, recency/cooldown window, topic preferences)
 * - Variety-aware greedy selection (author diversity, primary-topic balance, binding mix)
 * - Post-generation operations:
 *   1) `pickRandomReplacements`: Replace 1 or add N random eligible books without shelf duplicates
 *   2) `applyManualReplacement`: Replace a specific book slot manually while preserving order
 *   3) `applyBookAdditions`: Append one or multiple manual/random books cleanly
 */

import { isBookRotatable } from '../../types/models.js';
import {
  countRotationsSinceLastSeen,
  syncRotationSlotAddedAt,
} from './usage-insights.js';

const DAY_MS = 1000 * 60 * 60 * 24;

const OBJECTIVE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'with',
  'for',
  'only',
  'books',
  'book',
  'theme',
  'themes',
  'topic',
  'topics',
  'stories',
  'story',
  'reads',
  'read',
  'shelf',
  'rotation',
  'plus',
  'or',
  'of',
  'in',
  'to',
]);

/**
 * @typedef {Object} ParsedObjective
 * @property {import('../../types/models.js').BookFormat[]} formats - Binding formats mentioned in objective
 * @property {import('../../types/models.js').ReadingStage[]} stages - Reading stages mentioned in objective
 * @property {string[]} keywords - Normalized topic/theme keywords extracted from objective
 */

/**
 * @typedef {Object} ScoredBookCandidate
 * @property {import('../../types/models.js').Book} book
 * @property {number} baseScore - Deterministic relevance score prior to diversity adjustments
 * @property {boolean} inCooldown - True if rotated within the active `cooldownDays` window
 * @property {boolean} ageMatched - True if child's age falls within `[ageMin - 1, ageMax + 1]`
 * @property {string[]} matchedReasons - Concise human-readable reasons for selection/ranking
 */

/**
 * Hashes an arbitrary string seed into a 32-bit unsigned integer (`xmur3` avalanche).
 * @param {string} seedStr
 * @returns {() => number}
 */
function createSeedHasher(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function nextSeedInt() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * Creates a repeatable `[0, 1)` PRNG (`mulberry32`) from a string seed, or falls back to `Math.random`
 * when no deterministic seed is supplied.
 *
 * @param {string} [seed]
 * @returns {() => number}
 */
export function createSeededRng(seed) {
  const trimmed = String(seed || '').trim();
  if (!trimmed) {
    return () => Math.random();
  }
  const seedGen = createSeedHasher(trimmed);
  let a = seedGen();
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parses a free-text rotation objective (e.g., `"hardcover + Christmas & woodland themes"`)
 * into structured binding constraints, reading stages, and searchable topic keywords.
 *
 * @param {string} objectiveText
 * @returns {ParsedObjective}
 */
export function parseRotationObjective(objectiveText) {
  const lower = String(objectiveText || '').toLowerCase();
  /** @type {Set<import('../../types/models.js').BookFormat>} */
  const formats = new Set();
  /** @type {Set<import('../../types/models.js').ReadingStage>} */
  const stages = new Set();

  if (/\bhard\s*-?\s*covers?\b/.test(lower)) {
    formats.add('hardcover');
  }
  if (/\bboard\s*-?\s*books?\b/.test(lower)) {
    formats.add('board-book');
  }
  if (/\bpaper\s*-?\s*backs?\b|\bsoft\s*-?\s*covers?\b/.test(lower)) {
    formats.add('paperback');
  }

  if (/\btoddlers?\b|\bbaby\b/.test(lower)) {
    stages.add('board-toddler');
  }
  if (/\bpicture\s*-?\s*books?\b/.test(lower)) {
    stages.add('picture-book');
  }
  if (/\bearly\s*-?\s*readers?\b|\bbeginning\s*-?\s*readers?\b/.test(lower)) {
    stages.add('early-reader');
  }
  if (/\bchapter\s*-?\s*books?\b/.test(lower)) {
    stages.add('chapter-book');
  }

  // Strip matched multi-word format phrases before tokenizing topic keywords
  const stripped = lower
    .replace(/\b(hard\s*-?\s*covers?|board\s*-?\s*books?|paper\s*-?\s*backs?|soft\s*-?\s*covers?)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ');

  const rawTokens = stripped
    .split(/[\s-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !OBJECTIVE_STOP_WORDS.has(t));

  /** @type {Set<string>} */
  const keywords = new Set();
  for (const token of rawTokens) {
    keywords.add(token);
    // Normalize simple plural to singular root as well (e.g., "animals" -> "animal", "dinosaurs" -> "dinosaur")
    if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) {
      keywords.add(token.slice(0, -1));
    }
  }

  return {
    formats: Array.from(formats),
    stages: Array.from(stages),
    keywords: Array.from(keywords),
  };
}

/**
 * Checks whether a book was rotated within `cooldownDays` relative to `nowIso`.
 *
 * @param {import('../../types/models.js').Book} book
 * @param {number} cooldownDays
 * @param {string} nowIso
 * @returns {boolean}
 */
export function isBookInCooldown(book, cooldownDays, nowIso) {
  if (!cooldownDays || cooldownDays <= 0 || !book.lastRotatedAt) return false;
  const lastMs = Date.parse(book.lastRotatedAt);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(lastMs) || Number.isNaN(nowMs)) return false;
  const elapsedDays = (nowMs - lastMs) / DAY_MS;
  return elapsedDays >= 0 && elapsedDays < cooldownDays;
}

/**
 * Scores and ranks catalog books for a child profile and rule set.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rules: import('../../types/models.js').RotationRuleConfig,
 *   rotations?: import('../../types/models.js').RotationList[],
 *   excludeBookIds?: Iterable<string>,
 *   nowIso?: string
 * }} params
 * @returns {ScoredBookCandidate[]}
 */
export function scoreEligibleBooks({
  books,
  profile,
  rules,
  rotations = [],
  excludeBookIds = [],
  nowIso = new Date().toISOString(),
}) {
  const excluded = new Set(excludeBookIds);
  const parsedObjective = parseRotationObjective(rules.objective || '');
  const explicitFormat =
    rules.requiredFormat && rules.requiredFormat !== 'any' ? rules.requiredFormat : null;

  const preferredTagSet = new Set(
    [...(profile.favoriteTopics || []), ...(rules.preferredTags || [])]
      .map((t) => t.toLowerCase().trim())
      .filter(Boolean)
  );
  const readHistorySet = new Set(profile.readHistoryBookIds || []);

  // Sort input books by stable ID first so seeded tie-breakers are 100% order-independent,
  // excluding non-home (wishlist/interested) and broken/retired books.
  const sortedCatalog = [...books]
    .filter((b) => !excluded.has(b.id) && isBookRotatable(b))
    .sort((a, b) => a.id.localeCompare(b.id));

  // If explicit format filter is set and at least one book matches it, enforce hard filter;
  // otherwise treat as strong score boost so small libraries never dead-end on empty shelves.
  const hasExplicitFormatMatches = explicitFormat
    ? sortedCatalog.some((b) => b.format === explicitFormat)
    : false;

  /** @type {ScoredBookCandidate[]} */
  const scored = [];

  for (const book of sortedCatalog) {
    if (explicitFormat && hasExplicitFormatMatches && book.format !== explicitFormat) {
      continue;
    }

    let score = 20;
    /** @type {string[]} */
    const reasons = [];

    // 1. Child age & reading stage alignment
    const exactAge = profile.age >= book.ageMin && profile.age <= book.ageMax;
    const nearAge = profile.age >= book.ageMin - 1 && profile.age <= book.ageMax + 1;
    if (exactAge) {
      score += 32;
      reasons.push(`Age ${profile.age} match`);
    } else if (nearAge) {
      score += 16;
    } else {
      score -= 18;
    }

    if (book.readingStage === profile.readingStage) {
      score += 16;
      reasons.push('Reading stage match');
    }

    // 2. Topic / favorite tag overlap
    const bookTagsLower = book.tags.map((t) => t.toLowerCase());
    const matchedPreferred = bookTagsLower.filter((t) => preferredTagSet.has(t));
    if (matchedPreferred.length > 0) {
      score += Math.min(30, matchedPreferred.length * 12);
      reasons.push(`Topics: ${matchedPreferred.slice(0, 2).join(', ')}`);
    }

    // 3. Free-text objective alignment (formats, stages, title/tag keywords)
    if (parsedObjective.formats.length > 0) {
      if (parsedObjective.formats.includes(book.format)) {
        score += 26;
        reasons.push(`Objective binding (${book.format})`);
      } else {
        score -= 10;
      }
    }
    if (parsedObjective.stages.length > 0 && parsedObjective.stages.includes(book.readingStage)) {
      score += 14;
    }
    if (parsedObjective.keywords.length > 0) {
      const searchableHaystack = `${book.title} ${bookTagsLower.join(' ')} ${book.authors.join(' ')}`.toLowerCase();
      const keywordHits = parsedObjective.keywords.filter((kw) => searchableHaystack.includes(kw));
      if (keywordHits.length > 0) {
        score += Math.min(36, keywordHits.length * 16);
        reasons.push(`Objective match (${keywordHits[0]})`);
      }
    }

    // 4. Freshness, Cooldown & Multi-Rotation Box Diversity
    const inCooldown = isBookInCooldown(book, rules.cooldownDays, nowIso);
    if (inCooldown) {
      score -= 45;
    } else {
      score += 14;
      if (!book.lastRotatedAt) {
        score += 10;
        reasons.push('Never rotated yet');
      } else {
        const rotationsSince = countRotationsSinceLastSeen(book, rotations, profile.id);
        const lastMs = Date.parse(book.lastRotatedAt);
        const nowMs = Date.parse(nowIso);
        const elapsedDays =
          !Number.isNaN(lastMs) && !Number.isNaN(nowMs)
            ? Math.max(0, Math.floor((nowMs - lastMs) / DAY_MS))
            : 0;
        if (rotationsSince !== null && rotationsSince >= 2) {
          score += Math.min(14, rotationsSince * 4);
          reasons.push(`Unseen for ${rotationsSince} rotations`);
        } else if (elapsedDays >= 30) {
          score += Math.min(12, Math.floor(elapsedDays / 10) * 3);
          reasons.push(`Off shelf ${elapsedDays}d`);
        } else {
          reasons.push('Fresh off cooldown');
        }
      }
    }

    // Slight novelty bonus for unread books
    if (!readHistorySet.has(book.id)) {
      score += 6;
    }

    // Gentle favorite bonus when explicitly marked Loved
    if (book.loved === true) {
      score += 10;
      reasons.push('Loved favorite');
    }

    scored.push({
      book,
      baseScore: score,
      inCooldown,
      ageMatched: nearAge,
      matchedReasons: reasons,
    });
  }

  return scored;
}

/**
 * Generates a curated rotation shelf using multi-factor scoring, cooldown filtering,
 * variety constraints (author & topic diversity), and deterministic seeded tie-breaking.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rules: import('../../types/models.js').RotationRuleConfig,
 *   rotations?: import('../../types/models.js').RotationList[],
 *   excludeBookIds?: Iterable<string>,
 *   nowIso?: string
 * }} params
 * @returns {{
 *   selectedBooks: import('../../types/models.js').Book[],
 *   selectedBookIds: string[],
 *   relaxedCooldownCount: number,
 *   parsedObjective: ParsedObjective
 * }}
 */
export function generateRotationSelection({
  books,
  profile,
  rules,
  rotations = [],
  excludeBookIds = [],
  nowIso = new Date().toISOString(),
}) {
  const targetCount = Math.max(
    1,
    Math.trunc(Number(rules.count) || profile.defaultRotationSize || 4)
  );
  const enforceVariety = rules.varietyMix !== false;
  const rng = createSeededRng(rules.seed);
  const parsedObjective = parseRotationObjective(rules.objective || '');

  const scoredPool = scoreEligibleBooks({
    books,
    profile,
    rules,
    rotations,
    excludeBookIds,
    nowIso,
  });

  // Assign a deterministic per-candidate jitter in [0, 9.5) so books within a similar
  // relevance tier shuffle naturally yet repeat identically for the same seed!
  const poolWithJitter = scoredPool.map((entry) => ({
    ...entry,
    jitter: rng() * 9.5,
  }));

  // Prefer books outside the cooldown window first; only dip into cooldown books if needed to reach targetCount
  const freshPool = poolWithJitter.filter((item) => !item.inCooldown);
  const cooldownPool = poolWithJitter.filter((item) => item.inCooldown);

  /** @type {import('../../types/models.js').Book[]} */
  const selectedBooks = [];
  /** @type {Set<string>} */
  const usedAuthors = new Set();
  /** @type {Map<string, number>} */
  const tagCounts = new Map();
  let relaxedCooldownCount = 0;

  /**
   * Greedily selects up to `needed` books from `candidates`, re-evaluating diversity penalties after each pick.
   * @param {typeof poolWithJitter} candidates
   * @param {number} needed
   * @param {boolean} isCooldownFallback
   */
  const pickFromPool = (candidates, needed, isCooldownFallback) => {
    const remaining = [...candidates];
    while (selectedBooks.length < needed && remaining.length > 0) {
      let bestIdx = 0;
      let bestEffectiveScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        let effective = candidate.baseScore + candidate.jitter;

        if (enforceVariety) {
          const primaryAuthor = (candidate.book.authors[0] || '').toLowerCase().trim();
          if (primaryAuthor && usedAuthors.has(primaryAuthor)) {
            effective -= 22; // Strongly prefer different authors when alternatives exist
          }
          const primaryTag = (candidate.book.tags[0] || '').toLowerCase();
          if (primaryTag && (tagCounts.get(primaryTag) || 0) >= 2) {
            effective -= 10; // Prevent a single tag from monopolizing the entire shelf
          }
        }

        if (effective > bestEffectiveScore) {
          bestEffectiveScore = effective;
          bestIdx = i;
        }
      }

      const [picked] = remaining.splice(bestIdx, 1);
      selectedBooks.push(picked.book);
      if (isCooldownFallback) {
        relaxedCooldownCount += 1;
      }

      const primaryAuthor = (picked.book.authors[0] || '').toLowerCase().trim();
      if (primaryAuthor) usedAuthors.add(primaryAuthor);
      for (const tag of picked.book.tags) {
        const key = tag.toLowerCase();
        tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
      }
    }
  };

  pickFromPool(freshPool, targetCount, false);
  if (selectedBooks.length < targetCount && cooldownPool.length > 0) {
    pickFromPool(cooldownPool, targetCount, true);
  }

  return {
    selectedBooks,
    selectedBookIds: selectedBooks.map((b) => b.id),
    relaxedCooldownCount,
    parsedObjective,
  };
}

/**
 * Picks `count` random eligible books NOT currently on the rotation shelf,
 * respecting the rotation's rules and optional deterministic seed.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rotation: import('../../types/models.js').RotationList,
 *   rotations?: import('../../types/models.js').RotationList[],
 *   count?: number,
 *   seedOverride?: string,
 *   nowIso?: string
 * }} params
 * @returns {import('../../types/models.js').Book[]}
 */
export function pickRandomEligibleBooks({
  books,
  profile,
  rotation,
  rotations = [],
  count = 1,
  seedOverride,
  nowIso = new Date().toISOString(),
}) {
  const effectiveRules = {
    ...rotation.rules,
    count,
    seed:
      seedOverride !== undefined
        ? seedOverride
        : rotation.rules.seed
          ? `${rotation.rules.seed}::op:${rotation.bookIds.join(',')}:${rotation.updatedAt}`
          : undefined,
  };

  const result = generateRotationSelection({
    books,
    profile,
    rules: effectiveRules,
    rotations,
    excludeBookIds: rotation.bookIds,
    nowIso,
  });

  return result.selectedBooks;
}

/**
 * Pure helper that replaces `targetBookId` with `replacementBookId` in-place inside a RotationList,
 * preventing duplicate entries and pruning stale `completedBookIds`.
 *
 * @param {import('../../types/models.js').RotationList} rotation
 * @param {string} targetBookId
 * @param {string} replacementBookId
 * @param {string} [nowIso]
 * @returns {import('../../types/models.js').RotationList}
 */
export function applyBookReplacement(
  rotation,
  targetBookId,
  replacementBookId,
  nowIso = new Date().toISOString()
) {
  const idx = rotation.bookIds.indexOf(targetBookId);
  if (idx === -1) {
    throw new Error('Selected book is no longer in this rotation.');
  }
  if (targetBookId !== replacementBookId && rotation.bookIds.includes(replacementBookId)) {
    throw new Error('Replacement book is already in this rotation shelf.');
  }

  const nextBookIds = [...rotation.bookIds];
  nextBookIds[idx] = replacementBookId;

  const nextCompleted = rotation.completedBookIds.filter((id) => id !== targetBookId);
  const nextPicked = Array.isArray(rotation.pickedBookIds)
    ? rotation.pickedBookIds.filter((id) => id !== targetBookId)
    : [];
  const nextPickedAutoRead = Array.isArray(rotation.pickedAutoReadBookIds)
    ? rotation.pickedAutoReadBookIds.filter((id) => id !== targetBookId)
    : [];
  const nextPickedCycleOnlyRead = Array.isArray(rotation.pickedCycleOnlyReadBookIds)
    ? rotation.pickedCycleOnlyReadBookIds.filter((id) => id !== targetBookId)
    : [];
  const nextPlaced = Array.isArray(rotation.placedBookIds)
    ? rotation.placedBookIds.filter((id) => id !== targetBookId)
    : [];
  const fallbackAnchor = rotation.activatedAt || rotation.createdAt || nowIso;
  const baseSlots = syncRotationSlotAddedAt(rotation.slotAddedAt, rotation.bookIds, nowIso, {
    fallbackStartIso: fallbackAnchor,
  });
  delete baseSlots[targetBookId];
  baseSlots[replacementBookId] = nowIso;

  return {
    ...rotation,
    bookIds: nextBookIds,
    completedBookIds: nextCompleted,
    pickedBookIds: nextPicked,
    pickedAutoReadBookIds: nextPickedAutoRead,
    pickedCycleOnlyReadBookIds: nextPickedCycleOnlyRead,
    placedBookIds: nextPlaced,
    slotAddedAt: baseSlots,
    updatedAt: nowIso,
  };
}

/**
 * Pure helper that appends one or multiple unique book IDs to an existing RotationList.
 *
 * @param {import('../../types/models.js').RotationList} rotation
 * @param {string[]} bookIdsToAdd
 * @param {string} [nowIso]
 * @returns {{ rotation: import('../../types/models.js').RotationList, addedIds: string[] }}
 */
export function applyBookAdditions(rotation, bookIdsToAdd, nowIso = new Date().toISOString()) {
  const existing = new Set(rotation.bookIds);
  /** @type {string[]} */
  const addedIds = [];

  for (const id of bookIdsToAdd) {
    if (id && !existing.has(id)) {
      existing.add(id);
      addedIds.push(id);
    }
  }

  if (addedIds.length === 0) {
    return { rotation, addedIds: [] };
  }

  const nextBookIds = [...rotation.bookIds, ...addedIds];
  const fallbackAnchor = rotation.activatedAt || rotation.createdAt || nowIso;
  const nextSlots = syncRotationSlotAddedAt(rotation.slotAddedAt, rotation.bookIds, nowIso, {
    fallbackStartIso: fallbackAnchor,
  });
  for (const addedId of addedIds) {
    nextSlots[addedId] = nowIso;
  }

  return {
    rotation: {
      ...rotation,
      bookIds: nextBookIds,
      slotAddedAt: nextSlots,
      updatedAt: nowIso,
    },
    addedIds,
  };
}
