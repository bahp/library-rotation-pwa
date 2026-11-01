/**
 * @fileoverview Pure activity & game logic for the Play & Storytime section:
 * 1) Storytime & Topic Randomizer — picks 1, 2, 3, 4+ books from the Active Shelf or Reader's
 *    Library, optionally filtered by any typed topic/theme (e.g. "bedtime", "trucks", "winter").
 * 2) "Book Hunt" Treasure Search Game ("Find It!") — selects a random shelf book (avoiding back-to-back
 *    repeats) and crafts a concrete, toddler-friendly "Find the book..." treasure-hunt prompt.
 */

import {
  formatBookBinding,
  isBookRotatable,
  normalizeOwnersList,
} from '../../types/models.js';

/** @type {Record<string, string[]>} */
const TOPIC_SYNONYMS = {
  bedtime: ['sleep', 'night', 'moon', 'dream', 'dreams', 'goodnight', 'pajamas', 'stars', 'lullaby'],
  sleep: ['bedtime', 'night', 'goodnight', 'moon'],
  truck: ['trucks', 'vehicles', 'construction', 'car', 'cars', 'tractor', 'digger', 'train', 'bus'],
  trucks: ['truck', 'vehicles', 'construction', 'car', 'cars', 'tractor', 'digger', 'train'],
  vehicles: ['truck', 'trucks', 'car', 'cars', 'train', 'trains', 'plane', 'boat', 'bus', 'tractor'],
  winter: ['snow', 'snowy', 'ice', 'cold', 'mittens', 'penguin', 'arctic'],
  snow: ['winter', 'snowy', 'ice', 'sled'],
  animals: ['animal', 'bear', 'bears', 'owl', 'owls', 'dog', 'cat', 'bunny', 'rabbit', 'caterpillar', 'bird', 'fox', 'frog', 'mouse', 'whale'],
  dinosaur: ['dinosaurs', 'dino', 'dinos', 'trex', 'fossil'],
  dinosaurs: ['dinosaur', 'dino', 'dinos', 'trex', 'fossil'],
  funny: ['humor', 'silly', 'laugh', 'giggle', 'tacos', 'joke'],
  humor: ['funny', 'silly', 'laugh', 'tacos'],
  space: ['moon', 'stars', 'planet', 'planets', 'rocket', 'astronaut', 'galaxy'],
  nature: ['trees', 'forest', 'garden', 'ocean', 'sea', 'seasons', 'weather', 'outdoors'],
  magic: ['dragon', 'dragons', 'fairy', 'unicorn', 'fantasy', 'wizard'],
};

/**
 * Concrete visual/character nouns recognized by toddlers & kids on physical book covers.
 * Checked in order to build lively "Find the book with..." prompts.
 * @type {Array<{ pattern: RegExp, phrase: string }>}
 */
const CONCRETE_COVER_HOOKS = [
  { pattern: /\bblue\s+truck\b/i, phrase: 'with the blue truck' },
  { pattern: /\btruck(s)?\b/i, phrase: 'with the big truck' },
  { pattern: /\btrain(s)?\b/i, phrase: 'with the train' },
  { pattern: /\bdragon(s)?\b/i, phrase: 'with the dragons' },
  { pattern: /\bdinosaur(s)?\b/i, phrase: 'with the dinosaurs' },
  { pattern: /\bcaterpillar\b/i, phrase: 'with the hungry caterpillar' },
  { pattern: /\bowl(s)?\b/i, phrase: 'with the baby owls' },
  { pattern: /\bmoon\b/i, phrase: 'with the bright moon' },
  { pattern: /\bsnow(y)?\b/i, phrase: 'with the snowy day' },
  { pattern: /\bbear(s)?\b/i, phrase: 'with the bear' },
  { pattern: /\bbunny|rabbit\b/i, phrase: 'with the little bunny' },
  { pattern: /\bpigeon\b/i, phrase: 'with the silly pigeon' },
  { pattern: /\bcat(s)?|kitten\b/i, phrase: 'with the cat' },
  { pattern: /\bdog(s)?|puppy\b/i, phrase: 'with the puppy' },
  { pattern: /\brocket|astronaut\b/i, phrase: 'with the space rocket' },
  { pattern: /\bocean|whale|fish\b/i, phrase: 'under the sea' },
];

/**
 * Normalizes text for accent-insensitive, case-insensitive matching.
 * @param {string | undefined | null} text
 * @returns {string}
 */
export function normalizePlayText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Checks whether a book belongs to the active reader profile or Shared family shelf.
 * @param {import('../../types/models.js').Book} book
 * @param {import('../../types/models.js').ChildProfile | undefined | null} activeProfile
 * @returns {boolean}
 */
export function isBookForActiveReader(book, activeProfile) {
  const owners = normalizeOwnersList(book.owners);
  if (owners.length === 0) return true;
  if (!activeProfile) return true;
  return owners.some(
    (owner) =>
      owner === activeProfile.id ||
      owner.toLowerCase() === 'shared' ||
      owner.toLowerCase() === activeProfile.name.toLowerCase()
  );
}

/**
 * Performs an unbiased Fisher-Yates shuffle on a shallow copy using the provided RNG.
 * @template T
 * @param {T[]} items
 * @param {() => number} [rng]
 * @returns {T[]}
 */
export function shuffleItems(items, rng = Math.random) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const raw = Number(rng());
    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(0.9999999, raw)) : 0;
    const j = Math.floor(clamped * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Resolves the eligible book pool for Play activities (`'active-shelf'` or `'owned-library'`).
 * Automatically falls back to the reader's owned rotatable library when no active shelf exists yet.
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   activeRotation: import('../../types/models.js').RotationList | null | undefined,
 *   activeProfile: import('../../types/models.js').ChildProfile | null | undefined,
 *   scope?: 'active-shelf' | 'owned-library'
 * }} params
 * @returns {{
 *   pool: import('../../types/models.js').Book[],
 *   activeShelfBooks: import('../../types/models.js').Book[],
 *   readerLibraryBooks: import('../../types/models.js').Book[],
 *   effectiveScope: 'active-shelf' | 'owned-library',
 *   usedFallbackToLibrary: boolean,
 *   poolLabel: string
 * }}
 */
export function resolvePlayBookPool({
  books,
  activeRotation,
  activeProfile,
  scope = 'active-shelf',
}) {
  const allBooks = Array.isArray(books) ? books : [];
  const bookById = new Map(allBooks.map((b) => [b.id, b]));

  const activeShelfBooks = activeRotation
    ? activeRotation.bookIds
        .map((id) => bookById.get(id))
        .filter(/** @returns {b is import('../../types/models.js').Book} */ (b) => Boolean(b))
    : [];

  const readerOwned = allBooks.filter(
    (b) => isBookRotatable(b) && isBookForActiveReader(b, activeProfile)
  );
  const allRotatable = allBooks.filter((b) => isBookRotatable(b));
  const readerLibraryBooks = readerOwned.length > 0 ? readerOwned : allRotatable;

  const readerName = activeProfile?.name || 'Reader';

  if (scope === 'active-shelf') {
    if (activeShelfBooks.length > 0) {
      return {
        pool: activeShelfBooks,
        activeShelfBooks,
        readerLibraryBooks,
        effectiveScope: 'active-shelf',
        usedFallbackToLibrary: false,
        poolLabel: activeRotation?.title || `${readerName}’s Active Shelf`,
      };
    }
    return {
      pool: readerLibraryBooks,
      activeShelfBooks,
      readerLibraryBooks,
      effectiveScope: 'owned-library',
      usedFallbackToLibrary: true,
      poolLabel: `${readerName}’s Home Library`,
    };
  }

  return {
    pool: readerLibraryBooks,
    activeShelfBooks,
    readerLibraryBooks,
    effectiveScope: 'owned-library',
    usedFallbackToLibrary: false,
    poolLabel: `${readerName}’s Home Library`,
  };
}

/**
 * Collects clean quick-tap topic suggestions from the reader's shelf & owned books,
 * keeping `'bedtime'` readily accessible alongside actual catalog themes.
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   activeRotation: import('../../types/models.js').RotationList | null | undefined,
 *   activeProfile: import('../../types/models.js').ChildProfile | null | undefined,
 *   limit?: number
 * }} params
 * @returns {string[]}
 */
export function collectQuickTopics({ books, activeRotation, activeProfile, limit = 6 }) {
  const { activeShelfBooks, readerLibraryBooks } = resolvePlayBookPool({
    books,
    activeRotation,
    activeProfile,
    scope: 'active-shelf',
  });

  /** @type {Map<string, number>} */
  const counts = new Map();
  // Weight active shelf tags higher so tonight's shelf topics surface first
  for (const b of activeShelfBooks) {
    for (const rawTag of b.tags || []) {
      const t = String(rawTag || '').trim().toLowerCase();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 3);
    }
  }
  for (const b of readerLibraryBooks) {
    for (const rawTag of b.tags || []) {
      const t = String(rawTag || '').trim().toLowerCase();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }

  const ordered = ['bedtime'];
  const sortedTags = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);

  for (const tag of sortedTags) {
    if (!ordered.includes(tag)) {
      ordered.push(tag);
    }
    if (ordered.length >= limit) break;
  }

  return ordered.slice(0, limit);
}

/**
 * Scores how well a book matches a free-text topic/theme query (e.g. "bedtime", "trucks", "winter").
 * @param {import('../../types/models.js').Book} book
 * @param {string} rawTopicQuery
 * @returns {{ score: number, matchedLabels: string[] }}
 */
export function scoreBookForTopic(book, rawTopicQuery) {
  const normalizedQuery = normalizePlayText(rawTopicQuery);
  if (!normalizedQuery) {
    return { score: 1, matchedLabels: [] };
  }

  const queryTokens = normalizedQuery
    .split(/[\s,;/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));

  const searchTerms = queryTokens.length > 0 ? queryTokens : [normalizedQuery];

  const normalizedTitle = normalizePlayText(book.title);
  const normalizedAuthors = normalizePlayText((book.authors || []).join(' '));
  const normalizedTags = (book.tags || []).map((t) => normalizePlayText(t));
  const normalizedMeta = normalizePlayText(
    `${book.readingStage || ''} ${book.format || ''} ${book.readingLevelHint || ''}`
  );

  let score = 0;
  /** @type {Set<string>} */
  const matchedSet = new Set();

  if (normalizedTitle.includes(normalizedQuery)) {
    score += 10;
    matchedSet.add(rawTopicQuery.trim());
  }

  for (const term of searchTerms) {
    const expanded = [term, ...(TOPIC_SYNONYMS[term] || [])];
    let termBest = 0;
    let termLabel = '';

    for (let idx = 0; idx < expanded.length; idx++) {
      const candidate = expanded[idx];
      const isDirect = idx === 0;

      const matchingRawTagIndex = normalizedTags.findIndex(
        (tag) => tag === candidate || tag.includes(candidate) || candidate.includes(tag)
      );
      if (matchingRawTagIndex !== -1) {
        const pts = isDirect ? 8 : 5;
        if (pts > termBest) {
          termBest = pts;
          termLabel = book.tags[matchingRawTagIndex] || candidate;
        }
      }

      const wordRegex = new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (wordRegex.test(normalizedTitle)) {
        const pts = isDirect ? 7 : 4;
        if (pts > termBest) {
          termBest = pts;
          termLabel = candidate;
        }
      } else if (wordRegex.test(normalizedAuthors) || wordRegex.test(normalizedMeta)) {
        const pts = isDirect ? 4 : 2;
        if (pts > termBest) {
          termBest = pts;
          termLabel = candidate;
        }
      }
    }

    if (termBest > 0) {
      score += termBest;
      if (termLabel) matchedSet.add(termLabel);
    }
  }

  return {
    score,
    matchedLabels: Array.from(matchedSet).slice(0, 3),
  };
}

/**
 * Randomly selects `count` books (`1..6`) for storytime or topic reading.
 * Supports Active Shelf vs Owned Library scope, optional free-text topic filtering, and unread-first priority.
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   activeRotation: import('../../types/models.js').RotationList | null | undefined,
 *   activeProfile: import('../../types/models.js').ChildProfile | null | undefined,
 *   count?: number,
 *   scope?: 'active-shelf' | 'owned-library',
 *   topicQuery?: string,
 *   unreadFirst?: boolean,
 *   rng?: () => number
 * }} params
 * @returns {{
 *   selectedBooks: import('../../types/models.js').Book[],
 *   matchedReasonsByBookId: Record<string, string[]>,
 *   requestedCount: number,
 *   topicQuery: string,
 *   matchedTopicCount: number,
 *   totalPoolCount: number,
 *   poolLabel: string,
 *   usedFallbackToLibrary: boolean,
 *   expandedToLibraryForTopic: boolean,
 *   noTopicMatches: boolean
 * }}
 */
export function pickStorytimeBooks({
  books,
  activeRotation,
  activeProfile,
  count = 3,
  scope = 'active-shelf',
  topicQuery = '',
  unreadFirst = true,
  rng = Math.random,
}) {
  const safeCount = Math.max(1, Math.min(6, Math.round(Number(count) || 3)));
  const trimmedTopic = String(topicQuery || '').trim();

  const poolInfo = resolvePlayBookPool({
    books,
    activeRotation,
    activeProfile,
    scope,
  });

  const completedInActive = new Set(activeRotation?.completedBookIds || []);
  const readHistory = new Set(activeProfile?.readHistoryBookIds || []);

  /**
   * @param {import('../../types/models.js').Book} b
   */
  const isUnread = (b) => {
    if (poolInfo.effectiveScope === 'active-shelf' && activeRotation) {
      return !completedInActive.has(b.id);
    }
    return !completedInActive.has(b.id) && !readHistory.has(b.id);
  };

  if (!trimmedTopic) {
    const shuffled = shuffleItems(poolInfo.pool, rng);
    const ordered = unreadFirst
      ? [
          ...shuffled.filter((b) => isUnread(b)),
          ...shuffled.filter((b) => !isUnread(b)),
        ]
      : shuffled;
    const selectedBooks = ordered.slice(0, safeCount);
    return {
      selectedBooks,
      matchedReasonsByBookId: {},
      requestedCount: safeCount,
      topicQuery: '',
      matchedTopicCount: selectedBooks.length,
      totalPoolCount: poolInfo.pool.length,
      poolLabel: poolInfo.poolLabel,
      usedFallbackToLibrary: poolInfo.usedFallbackToLibrary,
      expandedToLibraryForTopic: false,
      noTopicMatches: false,
    };
  }

  /**
   * Scores & shuffles a candidate list for the requested topic.
   * @param {import('../../types/models.js').Book[]} candidatePool
   */
  const evaluateTopicPool = (candidatePool) => {
    const shuffled = shuffleItems(candidatePool, rng);
    return shuffled
      .map((book) => {
        const { score, matchedLabels } = scoreBookForTopic(book, trimmedTopic);
        return {
          book,
          score,
          matchedLabels,
          unreadBonus: unreadFirst && isUnread(book) ? 1 : 0,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        // Keep strong direct matches ahead of weak synonym matches while preserving random shuffle ties
        const tierA = a.score >= 6 ? 2 : 1;
        const tierB = b.score >= 6 ? 2 : 1;
        if (tierB !== tierA) return tierB - tierA;
        if (b.unreadBonus !== a.unreadBonus) return b.unreadBonus - a.unreadBonus;
        return 0;
      });
  };

  let scoredMatches = evaluateTopicPool(poolInfo.pool);
  let expandedToLibraryForTopic = false;
  let effectivePoolLabel = poolInfo.poolLabel;

  if (
    scoredMatches.length === 0 &&
    scope === 'active-shelf' &&
    !poolInfo.usedFallbackToLibrary &&
    poolInfo.readerLibraryBooks.length > 0
  ) {
    const libraryMatches = evaluateTopicPool(poolInfo.readerLibraryBooks);
    if (libraryMatches.length > 0) {
      scoredMatches = libraryMatches;
      expandedToLibraryForTopic = true;
      effectivePoolLabel = `${activeProfile?.name || 'Reader'}’s Home Library`;
    }
  }

  if (scoredMatches.length === 0) {
    return {
      selectedBooks: [],
      matchedReasonsByBookId: {},
      requestedCount: safeCount,
      topicQuery: trimmedTopic,
      matchedTopicCount: 0,
      totalPoolCount: poolInfo.pool.length,
      poolLabel: effectivePoolLabel,
      usedFallbackToLibrary: poolInfo.usedFallbackToLibrary,
      expandedToLibraryForTopic,
      noTopicMatches: true,
    };
  }

  const chosenEntries = scoredMatches.slice(0, safeCount);
  /** @type {Record<string, string[]>} */
  const matchedReasonsByBookId = {};
  for (const item of chosenEntries) {
    matchedReasonsByBookId[item.book.id] = item.matchedLabels;
  }

  return {
    selectedBooks: chosenEntries.map((x) => x.book),
    matchedReasonsByBookId,
    requestedCount: safeCount,
    topicQuery: trimmedTopic,
    matchedTopicCount: scoredMatches.length,
    totalPoolCount: poolInfo.pool.length,
    poolLabel: effectivePoolLabel,
    usedFallbackToLibrary: poolInfo.usedFallbackToLibrary,
    expandedToLibraryForTopic,
    noTopicMatches: false,
  };
}

/**
 * Builds an energetic, kid-friendly "Find the book..." treasure-hunt prompt for a specific book.
 * @param {import('../../types/models.js').Book} book
 * @returns {{ prompt: string, clueLine: string }}
 */
export function buildBookHuntClue(book) {
  const titleText = String(book.title || '').trim();
  const tags = (book.tags || []).map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
  const bindingLabel = formatBookBinding(book.format);
  const primaryAuthor = book.authors && book.authors[0] ? book.authors[0] : '';

  let hookPhrase = '';
  for (const hook of CONCRETE_COVER_HOOKS) {
    if (hook.pattern.test(titleText) || tags.some((t) => hook.pattern.test(t))) {
      hookPhrase = hook.phrase;
      break;
    }
  }

  if (!hookPhrase && tags.length >= 2) {
    hookPhrase = `about ${tags[0]} and ${tags[1]}`;
  } else if (!hookPhrase && tags.length === 1) {
    hookPhrase = `about ${tags[0]}`;
  } else if (!hookPhrase && primaryAuthor) {
    hookPhrase = `by ${primaryAuthor}`;
  } else if (!hookPhrase) {
    hookPhrase = `that is a ${bindingLabel.toLowerCase()}`;
  }

  const prompt = `Find the book ${hookPhrase}!`;
  const clueParts = [bindingLabel];
  if (tags.length > 0) {
    clueParts.push(`Themes: ${tags.slice(0, 3).join(', ')}`);
  }
  if (primaryAuthor) {
    clueParts.push(`By ${primaryAuthor}`);
  }

  return {
    prompt,
    clueLine: clueParts.join(' · '),
  };
}

/**
 * Picks a random target book for the "Book Hunt" ("Find It!") physical shelf treasure game,
 * avoiding `previousBookId` whenever 2+ books exist in the pool.
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   activeRotation: import('../../types/models.js').RotationList | null | undefined,
 *   activeProfile: import('../../types/models.js').ChildProfile | null | undefined,
 *   scope?: 'active-shelf' | 'owned-library',
 *   previousBookId?: string | null,
 *   rng?: () => number
 * }} params
 * @returns {{
 *   book: import('../../types/models.js').Book,
 *   prompt: string,
 *   clueLine: string,
 *   poolLabel: string,
 *   poolCount: number,
 *   usedFallbackToLibrary: boolean
 * } | null}
 */
export function createBookHuntChallenge({
  books,
  activeRotation,
  activeProfile,
  scope = 'active-shelf',
  previousBookId = null,
  rng = Math.random,
}) {
  const poolInfo = resolvePlayBookPool({
    books,
    activeRotation,
    activeProfile,
    scope,
  });

  if (poolInfo.pool.length === 0) {
    return null;
  }

  const candidates =
    previousBookId && poolInfo.pool.length > 1
      ? poolInfo.pool.filter((b) => b.id !== previousBookId)
      : poolInfo.pool;

  const shuffled = shuffleItems(candidates, rng);
  const chosenBook = shuffled[0];
  const { prompt, clueLine } = buildBookHuntClue(chosenBook);

  return {
    book: chosenBook,
    prompt,
    clueLine,
    poolLabel: poolInfo.poolLabel,
    poolCount: poolInfo.pool.length,
    usedFallbackToLibrary: poolInfo.usedFallbackToLibrary,
  };
}
