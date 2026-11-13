/**
 * @fileoverview Rotation History / "Cooldown" Log, Stale Book Spotlight detection & UI banner,
 * and structured per-book usage digests for parents and optional AI enrichment tools.
 *
 * Pure, deterministic helpers with zero DOM or network side effects.
 */

import { escapeHtml, isBookRotatable } from '../../types/models.js';
import {
  COVER_BADGE_SLOTS,
  COVER_ROTATION_ADORNO_STYLES,
  t,
} from '../../config/index.js';
import { renderIcon } from '../../ui/icons.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clamps the Stale Book Spotlight threshold into a sensible parent-configurable window (`3..60` days).
 * @param {unknown} raw
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeStaleBookDays(raw, fallback = 10) {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(3, Math.min(60, Math.trunc(num)));
}

/**
 * Safely parses a date/timestamp input into epoch milliseconds, or `null` if invalid.
 * @param {Date | string | number | null | undefined} value
 * @returns {number | null}
 */
function toEpochMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Formats an ISO timestamp into a short, readable calendar date (`Oct 30` or `Oct 30, 2025` if another year).
 * @param {string | undefined} iso
 * @param {Date | string | number} [referenceDate]
 * @returns {string}
 */
export function formatShortShelfDate(iso, referenceDate = new Date()) {
  const ms = toEpochMs(iso);
  if (ms === null) return '';
  const target = new Date(ms);
  const refMs = toEpochMs(referenceDate) ?? Date.now();
  const ref = new Date(refMs);
  const sameYear = target.getUTCFullYear() === ref.getUTCFullYear();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthLabel = months[target.getUTCMonth()] || 'Jan';
  const day = target.getUTCDate();
  return sameYear ? `${monthLabel} ${day}` : `${monthLabel} ${day}, ${target.getUTCFullYear()}`;
}

/**
 * Records a lightweight Rotation History / Cooldown log entry on every book placed onto a shelf.
 * Preserves any legacy `lastRotatedAt` timestamp as the prior entry so existing books retain history,
 * increments `rotationCount`, and bounds `rotationHistory` to `maxEntries` (newest first).
 *
 * @param {import('../../types/models.js').Book[]} books
 * @param {string[]} rotatedBookIds
 * @param {{
 *   rotatedAt: string,
 *   rotationId?: string,
 *   profileId?: string,
 *   maxEntries?: number
 * }} context
 * @returns {import('../../types/models.js').Book[]}
 */
export function recordBooksRotated(books, rotatedBookIds, context) {
  const idSet = new Set((rotatedBookIds || []).filter(Boolean));
  if (idSet.size === 0) return books;

  const { rotatedAt, rotationId, profileId, maxEntries = 12 } = context;

  return books.map((book) => {
    if (!idSet.has(book.id)) return book;

    const existingLog = Array.isArray(book.rotationHistory)
      ? book.rotationHistory.filter((entry) => entry && typeof entry.rotatedAt === 'string')
      : [];

    // Seed baseline entry if book previously had `lastRotatedAt` before structured history existed
    const seededLog =
      existingLog.length === 0 && book.lastRotatedAt
        ? [{ rotatedAt: book.lastRotatedAt }]
        : existingLog;

    const head = seededLog[0];
    const isDuplicateStamp =
      head &&
      head.rotatedAt === rotatedAt &&
      (head.rotationId || '') === (rotationId || '');

    const nextEntry = {
      rotatedAt,
      ...(rotationId ? { rotationId } : {}),
      ...(profileId ? { profileId } : {}),
    };

    const nextHistory = isDuplicateStamp
      ? seededLog.slice(0, maxEntries)
      : [nextEntry, ...seededLog].slice(0, maxEntries);

    const priorCount =
      typeof book.rotationCount === 'number' && book.rotationCount >= 0
        ? book.rotationCount
        : seededLog.length;

    return {
      ...book,
      lastRotatedAt: rotatedAt,
      rotationCount: isDuplicateStamp ? Math.max(1, priorCount) : priorCount + 1,
      rotationHistory: nextHistory,
    };
  });
}

/**
 * Builds or updates the `slotAddedAt` timestamp map for books currently on a rotation shelf.
 * Preserves existing slot timestamps for books that remained on the shelf while assigning `nowIso`
 * to newly added/replaced books.
 *
 * @param {Record<string, string> | undefined} previousSlotAddedAt
 * @param {string[]} nextBookIds
 * @param {string} nowIso
 * @param {{ resetAll?: boolean, fallbackStartIso?: string }} [options]
 * @returns {Record<string, string>}
 */
export function syncRotationSlotAddedAt(
  previousSlotAddedAt,
  nextBookIds,
  nowIso,
  options = {}
) {
  const prev = previousSlotAddedAt && typeof previousSlotAddedAt === 'object' ? previousSlotAddedAt : {};
  /** @type {Record<string, string>} */
  const next = {};
  for (const id of nextBookIds) {
    if (!id) continue;
    if (options.resetAll) {
      next[id] = nowIso;
    } else if (typeof prev[id] === 'string' && prev[id]) {
      next[id] = prev[id];
    } else {
      next[id] = options.fallbackStartIso || nowIso;
    }
  }
  return next;
}

/**
 * Counts how many rotations for a given profile were created/activated AFTER this book was last
 * placed on a shelf for that profile (or across all shelves).
 * Used to boost books that haven't been out for the last 2–3+ rotations.
 *
 * @param {import('../../types/models.js').Book} book
 * @param {import('../../types/models.js').RotationList[]} rotations
 * @param {string | undefined} profileId
 * @returns {number | null} `null` if never rotated on any shelf; `0` if on the latest rotation; `1+` otherwise
 */
export function countRotationsSinceLastSeen(book, rotations = [], profileId) {
  const relevantRotations = (rotations || [])
    .filter((r) => !profileId || r.profileId === profileId)
    .slice()
    .sort((a, b) => {
      const aMs = toEpochMs(a.activatedAt || a.createdAt) ?? 0;
      const bMs = toEpochMs(b.activatedAt || b.createdAt) ?? 0;
      return bMs - aMs;
    });

  if (relevantRotations.length === 0) {
    return book.lastRotatedAt ? 0 : null;
  }

  const indexInProfileRotations = relevantRotations.findIndex((r) =>
    Array.isArray(r.bookIds) && r.bookIds.includes(book.id)
  );
  if (indexInProfileRotations !== -1) {
    return indexInProfileRotations;
  }

  // Fallback to `lastRotatedAt` vs rotation start dates when older rotations were deleted
  const lastRotMs = toEpochMs(book.lastRotatedAt);
  if (lastRotMs === null) {
    return null;
  }

  let newerCount = 0;
  for (const rot of relevantRotations) {
    const rotMs = toEpochMs(rot.activatedAt || rot.createdAt);
    if (rotMs !== null && rotMs > lastRotMs + 1000) {
      newerCount += 1;
    }
  }
  return newerCount;
}

/**
 * Computes a complete, parent-readable and machine-structured usage summary for a single book.
 *
 * @param {import('../../types/models.js').Book} book
 * @param {{
 *   profiles?: import('../../types/models.js').ChildProfile[],
 *   rotations?: import('../../types/models.js').RotationList[],
 *   activeProfile?: import('../../types/models.js').ChildProfile | null,
 *   activeRotation?: import('../../types/models.js').RotationList | null,
 *   cooldownDays?: number,
 *   staleBookDays?: number,
 *   referenceDate?: Date | string | number
 * }} [context]
 */
export function computeBookUsageSummary(book, context = {}) {
  const profiles = context.profiles || [];
  const rotations = context.rotations || [];
  const activeProfile = context.activeProfile || profiles[0] || null;
  const activeRotation =
    context.activeRotation !== undefined
      ? context.activeRotation
      : activeProfile
        ? rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') || null
        : null;

  const nowMs = toEpochMs(context.referenceDate ?? new Date()) ?? Date.now();
  const effectiveCooldownDays = Math.max(
    0,
    context.cooldownDays ??
      activeRotation?.rules?.cooldownDays ??
      activeProfile?.cooldownDays ??
      14
  );
  const effectiveStaleDays = normalizeStaleBookDays(context.staleBookDays, 10);

  const isCurrentlyOnActiveShelf = Boolean(
    activeRotation && activeRotation.bookIds.includes(book.id)
  );
  const isReadInActiveShelf = Boolean(
    isCurrentlyOnActiveShelf &&
      activeRotation &&
      activeRotation.completedBookIds.includes(book.id)
  );
  const isPickedInActiveShelf = Boolean(
    isCurrentlyOnActiveShelf &&
      activeRotation &&
      Array.isArray(activeRotation.pickedBookIds) &&
      activeRotation.pickedBookIds.includes(book.id)
  );

  let daysOnActiveShelf = null;
  if (isCurrentlyOnActiveShelf && activeRotation) {
    const slotStartIso =
      activeRotation.slotAddedAt?.[book.id] ||
      activeRotation.activatedAt ||
      activeRotation.createdAt;
    const slotStartMs = toEpochMs(slotStartIso);
    daysOnActiveShelf =
      slotStartMs !== null ? Math.max(0, Math.floor((nowMs - slotStartMs) / DAY_MS)) : 0;
  }

  const isStaleUnreadOnShelf = Boolean(
    isCurrentlyOnActiveShelf &&
      !isReadInActiveShelf &&
      daysOnActiveShelf !== null &&
      daysOnActiveShelf >= effectiveStaleDays &&
      isBookRotatable(book)
  );

  const lastRotMs = toEpochMs(book.lastRotatedAt);
  const neverRotated = lastRotMs === null && !isCurrentlyOnActiveShelf;
  const daysSinceLastRotated =
    lastRotMs !== null ? Math.max(0, Math.floor((nowMs - lastRotMs) / DAY_MS)) : null;

  const inCooldown = Boolean(
    !isCurrentlyOnActiveShelf &&
      effectiveCooldownDays > 0 &&
      daysSinceLastRotated !== null &&
      nowMs - (lastRotMs ?? 0) < effectiveCooldownDays * DAY_MS
  );
  const cooldownDaysRemaining =
    inCooldown && lastRotMs !== null
      ? Math.max(1, Math.ceil((effectiveCooldownDays * DAY_MS - (nowMs - lastRotMs)) / DAY_MS))
      : 0;

  const rotationsSinceLastOut = countRotationsSinceLastSeen(
    book,
    rotations,
    activeProfile?.id
  );

  const historyEntries = Array.isArray(book.rotationHistory) ? book.rotationHistory : [];
  const rotationCount =
    typeof book.rotationCount === 'number' && book.rotationCount > 0
      ? book.rotationCount
      : historyEntries.length > 0
        ? historyEntries.length
        : book.lastRotatedAt || isCurrentlyOnActiveShelf
          ? 1
          : 0;

  const readByProfiles = profiles.filter(
    (p) => Array.isArray(p.readHistoryBookIds) && p.readHistoryBookIds.includes(book.id)
  );
  const readByProfileIds = readByProfiles.map((p) => p.id);
  const readByProfileNames = readByProfiles.map((p) => p.name);
  const isReadByActiveProfile = Boolean(
    activeProfile && readByProfileIds.includes(activeProfile.id)
  );

  const isLongUnseen = Boolean(
    !isCurrentlyOnActiveShelf &&
      !inCooldown &&
      (neverRotated ||
        (daysSinceLastRotated !== null && daysSinceLastRotated >= Math.max(21, effectiveCooldownDays * 2)) ||
        (rotationsSinceLastOut !== null && rotationsSinceLastOut >= 2))
  );

  /** @type {'on-shelf' | 'never-rotated' | 'long-unseen' | 'fresh' | 'in-cooldown'} */
  let freshnessTier = 'fresh';
  if (isCurrentlyOnActiveShelf) {
    freshnessTier = 'on-shelf';
  } else if (neverRotated) {
    freshnessTier = 'never-rotated';
  } else if (inCooldown) {
    freshnessTier = 'in-cooldown';
  } else if (isLongUnseen) {
    freshnessTier = 'long-unseen';
  }

  let shortRecencyLabel = 'Ready from box';
  let compactRecencyLabel = 'Ready from box';
  if (isCurrentlyOnActiveShelf) {
    if (isPickedInActiveShelf && isReadInActiveShelf) {
      shortRecencyLabel =
        daysOnActiveShelf && daysOnActiveShelf > 0
          ? `On shelf ${daysOnActiveShelf}d · Picked & Read`
          : 'On shelf · Picked & Read';
      compactRecencyLabel =
        daysOnActiveShelf && daysOnActiveShelf > 0
          ? `On shelf ${daysOnActiveShelf}d · Read`
          : 'On shelf · Read';
    } else if (isPickedInActiveShelf) {
      shortRecencyLabel =
        daysOnActiveShelf && daysOnActiveShelf > 0
          ? `On shelf ${daysOnActiveShelf}d · Picked`
          : 'On shelf · Picked';
      compactRecencyLabel = shortRecencyLabel;
    } else if (isReadInActiveShelf) {
      shortRecencyLabel =
        daysOnActiveShelf && daysOnActiveShelf > 0
          ? `On shelf ${daysOnActiveShelf}d · Read`
          : 'On shelf · Read';
      compactRecencyLabel = shortRecencyLabel;
    } else if (isStaleUnreadOnShelf) {
      shortRecencyLabel = `On shelf ${daysOnActiveShelf}d · Unread`;
      compactRecencyLabel = `Shelf ${daysOnActiveShelf}d · Unread`;
    } else {
      shortRecencyLabel =
        daysOnActiveShelf && daysOnActiveShelf > 0
          ? `On shelf ${daysOnActiveShelf}d`
          : 'On shelf today';
      compactRecencyLabel = shortRecencyLabel;
    }
  } else if (neverRotated) {
    shortRecencyLabel = 'Never rotated';
    compactRecencyLabel = 'Never rotated';
  } else if (inCooldown) {
    shortRecencyLabel =
      daysSinceLastRotated === 0
        ? `Cooldown · ${cooldownDaysRemaining}d left`
        : `Last out ${daysSinceLastRotated}d ago · ${cooldownDaysRemaining}d cooldown`;
    compactRecencyLabel = `Cooldown · ${cooldownDaysRemaining}d left`;
  } else if (daysSinceLastRotated !== null) {
    const shortDate = formatShortShelfDate(book.lastRotatedAt, nowMs);
    shortRecencyLabel =
      daysSinceLastRotated === 0
        ? 'Rotated today'
        : daysSinceLastRotated >= 30 && shortDate
          ? `Last out ${shortDate} (${daysSinceLastRotated}d ago)`
          : `Last out ${daysSinceLastRotated}d ago`;
    compactRecencyLabel =
      daysSinceLastRotated === 0 ? 'Rotated today' : `Off shelf ${daysSinceLastRotated}d`;
  }

  return {
    lastRotatedAt: book.lastRotatedAt || null,
    daysSinceLastRotated,
    neverRotated,
    rotationCount,
    rotationsSinceLastOut,
    inCooldown,
    cooldownDaysRemaining,
    isCurrentlyOnActiveShelf,
    daysOnActiveShelf,
    isReadInActiveShelf,
    isPickedInActiveShelf,
    isStaleUnreadOnShelf,
    isLongUnseen,
    freshnessTier,
    shortRecencyLabel,
    compactRecencyLabel,
    loved: Boolean(book.loved),
    isReadByActiveProfile,
    readByProfileIds,
    readByProfileNames,
    lastReadAt: book.lastReadAt || null,
  };
}

/**
 * Renders a compact, accessible frosted cover adorno (`data-cover-adorno="..."`) in the dedicated
 * `bottom-left` rotation-state slot (`data-cover-slot="rotation-state"`) of a rotatable book cover.
 *
 * Enforces strict mutual exclusivity (max 1 badge) and explicit prefixes on day counts (`Shelf 16d`
 * vs `Rest 19d`) so active-shelf days and box cooldown days are never confused on mobile screens.
 * Off-shelf box age (`Off shelf 26d`) is kept in the caption underneath the cover rather than
 * cluttering cover artwork.
 *
 * @param {import('../../types/models.js').Book} book
 * @param {ReturnType<typeof computeBookUsageSummary> | null | undefined} usage
 * @param {{
 *   enabled?: boolean,
 *   showRotationHistory?: boolean,
 *   showStaleSpotlight?: boolean,
 *   readerName?: string,
 *   lang?: string
 * }} [options]
 * @returns {string}
 */
export function renderBookCoverUsageAdorno(book, usage, options = {}) {
  if (!book || !usage || !isBookRotatable(book)) return '';
  if (options.enabled === false) return '';

  const lang = options.lang || 'en';
  const showHistory = options.showRotationHistory !== false;
  const showStale = options.showStaleSpotlight !== false;
  const readerLabel = options.readerName ? ` with ${options.readerName}` : '';

  /** @type {{ kind: keyof typeof COVER_ROTATION_ADORNO_STYLES, prefix?: string, text: string, title: string } | null} */
  let spec = null;

  if (usage.isCurrentlyOnActiveShelf && usage.isReadInActiveShelf) {
    spec = {
      kind: 'shelf-read',
      text: t(lang, 'badges.read'),
      title: `${usage.shortRecencyLabel}${readerLabel}`,
    };
  } else if (usage.isCurrentlyOnActiveShelf && usage.isStaleUnreadOnShelf && showStale) {
    spec = {
      kind: 'stale-unread',
      prefix: t(lang, 'badges.shelfPrefix'),
      text: `${usage.daysOnActiveShelf}d`,
      title: `Sitting unread ${usage.daysOnActiveShelf}d on active shelf`,
    };
  } else if (usage.isCurrentlyOnActiveShelf) {
    spec = {
      kind: 'on-shelf',
      text: t(lang, 'badges.shelf'),
      title: usage.shortRecencyLabel,
    };
  } else if (showHistory && usage.inCooldown) {
    spec = {
      kind: 'cooldown',
      prefix: t(lang, 'badges.restPrefix'),
      text: `${usage.cooldownDaysRemaining}d`,
      title: usage.shortRecencyLabel,
    };
  } else if (showHistory && usage.neverRotated) {
    spec = {
      kind: 'never-rotated',
      text: t(lang, 'badges.newBadge'),
      title: 'Never rotated onto a shelf yet',
    };
  } else if (usage.isReadByActiveProfile) {
    spec = {
      kind: 'read-history',
      text: t(lang, 'badges.read'),
      title: `Read${readerLabel}`,
    };
  }

  if (!spec) return '';

  const styleMeta = COVER_ROTATION_ADORNO_STYLES[spec.kind];
  const labelHtml = spec.prefix
    ? `<span class="opacity-85 font-sans font-semibold">${escapeHtml(spec.prefix)}</span><span>${escapeHtml(spec.text)}</span>`
    : `<span>${escapeHtml(spec.text)}</span>`;

  return `<span
    data-cover-slot="${COVER_BADGE_SLOTS.rotationState.slot}"
    data-cover-adorno="${escapeHtml(spec.kind)}"
    title="${escapeHtml(spec.title)}"
    class="${COVER_BADGE_SLOTS.rotationState.positionClass} inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-bold font-mono-tabular leading-none tracking-tight shadow-2xs ${styleMeta.pillClass}"
  >${renderIcon(styleMeta.icon, 'w-2.5 h-2.5 shrink-0', 2.3)}${labelHtml}</span>`;
}

/**
 * Finds books on an active shelf that have been sitting out for at least `staleBookDays`
 * without being marked as read during the current shelf cycle.
 *
 * @param {{
 *   rotation: import('../../types/models.js').RotationList | null | undefined,
 *   books: import('../../types/models.js').Book[],
 *   staleBookDays?: number,
 *   referenceDate?: Date | string | number
 * }} params
 * @returns {{
 *   staleItems: Array<{ book: import('../../types/models.js').Book, daysOnShelf: number, slotStartedAt: string }>,
 *   dismissKey: string
 * }}
 */
export function findStaleShelfBooks({
  rotation,
  books,
  staleBookDays = 10,
  referenceDate = new Date(),
}) {
  if (!rotation || rotation.status !== 'active' || !Array.isArray(rotation.bookIds)) {
    return { staleItems: [], dismissKey: '' };
  }

  const thresholdDays = normalizeStaleBookDays(staleBookDays, 10);
  const nowMs = toEpochMs(referenceDate) ?? Date.now();
  const bookMap = new Map((books || []).map((b) => [b.id, b]));
  const completedSet = new Set(rotation.completedBookIds || []);
  const fallbackStart = rotation.activatedAt || rotation.createdAt || '';

  /** @type {Array<{ book: import('../../types/models.js').Book, daysOnShelf: number, slotStartedAt: string }>} */
  const staleItems = [];

  for (const bookId of rotation.bookIds) {
    if (completedSet.has(bookId)) continue;
    const book = bookMap.get(bookId);
    if (!book || !isBookRotatable(book)) continue;

    const slotStartedAt = rotation.slotAddedAt?.[bookId] || fallbackStart;
    const startMs = toEpochMs(slotStartedAt);
    if (startMs === null) continue;

    const daysOnShelf = Math.floor((nowMs - startMs) / DAY_MS);
    if (daysOnShelf >= thresholdDays) {
      staleItems.push({ book, daysOnShelf, slotStartedAt });
    }
  }

  staleItems.sort((a, b) => {
    if (b.daysOnShelf !== a.daysOnShelf) return b.daysOnShelf - a.daysOnShelf;
    return a.book.id.localeCompare(b.book.id);
  });

  const cycleAnchor = rotation.activatedAt || rotation.createdAt || 'cycle';
  const idsSignature = staleItems.map((item) => item.book.id).join(',');
  const dismissKey =
    staleItems.length > 0 ? `stale::${rotation.id}::${cycleAnchor}::${idsSignature}` : '';

  return { staleItems, dismissKey };
}

/**
 * Renders the compact, non-intrusive "Stale Book Spotlight" notification banner on Home & Rotations.
 * Matches Phase 25's compact phone alert layout (`h-7 sm:h-8`, `text-[11px] sm:text-xs`).
 *
 * @param {{
 *   rotation: import('../../types/models.js').RotationList | null | undefined,
 *   profile?: import('../../types/models.js').ChildProfile | null,
 *   books: import('../../types/models.js').Book[],
 *   staleBookDays?: number,
 *   enabled?: boolean,
 *   dismissedStaleKeys?: string[],
 *   referenceDate?: Date | string | number
 * }} params
 * @returns {string}
 */
export function renderStaleBooksSpotlightBanner({
  rotation,
  profile,
  books,
  staleBookDays = 10,
  enabled = true,
  dismissedStaleKeys = [],
  referenceDate = new Date(),
}) {
  if (!enabled || !rotation) return '';

  const { staleItems, dismissKey } = findStaleShelfBooks({
    rotation,
    books,
    staleBookDays,
    referenceDate,
  });

  if (staleItems.length === 0 || (dismissKey && dismissedStaleKeys.includes(dismissKey))) {
    return '';
  }

  const lead = staleItems[0];
  const extraCount = staleItems.length - 1;
  const rotatableOffShelfCount = (books || []).filter(
    (b) => isBookRotatable(b) && !rotation.bookIds.includes(b.id)
  ).length;
  const canSwapLead = rotatableOffShelfCount > 0;
  const readerLabel = profile?.name ? `${profile.name}’s shelf` : 'active shelf';

  const summaryText =
    extraCount > 0
      ? `“${lead.book.title}” (+${extraCount} more) haven’t been marked read after ${lead.daysOnShelf}d on ${readerLabel}. Read together or swap in a fresh pick from the box?`
      : `“${lead.book.title}” hasn’t been marked read after ${lead.daysOnShelf}d on ${readerLabel}. Have you read it together, or ready to swap in something fresh?`;

  return `
    <div
      role="status"
      data-stale-spotlight-banner="true"
      data-stale-lead-book-id="${escapeHtml(lead.book.id)}"
      class="rounded-2xl bg-linen-100/90 dark:bg-night-900 border border-linen-200 dark:border-night-700 px-3 py-2.5 sm:px-3.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3"
    >
      <div class="flex items-start gap-2.5 min-w-0">
        <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-500/15 dark:bg-amber-400/15 text-espresso-800 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
          ${renderIcon('clock', 'w-3.5 h-3.5 sm:w-4 sm:h-4')}
        </div>
        <div class="min-w-0">
          <p class="text-xs sm:text-sm font-bold text-forest-900 dark:text-white leading-snug">
            Stale Book Spotlight · Unread for ${lead.daysOnShelf}d
          </p>
          <p class="text-[11px] sm:text-xs text-stone-ink dark:text-slate-300 mt-0.5 leading-snug">
            ${escapeHtml(summaryText)}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 shrink-0 pl-9 sm:pl-0">
        <button
          type="button"
          data-action="toggle-rotation-read"
          data-rotation-id="${escapeHtml(rotation.id)}"
          data-book-id="${escapeHtml(lead.book.id)}"
          class="h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg sm:rounded-xl bg-ivory hover:bg-linen-200/70 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
        >
          ${renderIcon('check', 'w-3 h-3 sm:w-3.5 sm:h-3.5 text-forest-700 dark:text-[#5ED3DA]')}
          <span>Mark Read</span>
        </button>

        ${
          canSwapLead
            ? `
              <button
                type="button"
                data-action="replace-book-random"
                data-rotation-id="${escapeHtml(rotation.id)}"
                data-book-id="${escapeHtml(lead.book.id)}"
                class="h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg sm:rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                ${renderIcon('refresh', 'w-3 h-3 sm:w-3.5 sm:h-3.5')}
                <span>Swap Fresh</span>
              </button>
            `
            : `
              <a
                href="#/rotations?edit=${encodeURIComponent(rotation.id)}"
                class="h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg sm:rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <span>Review Shelf</span>
              </a>
            `
        }

        <button
          type="button"
          data-action="dismiss-stale-spotlight"
          data-stale-dismiss-key="${escapeHtml(dismissKey)}"
          aria-label="Dismiss stale book spotlight for this shelf"
          title="Dismiss for now"
          class="h-7 w-7 sm:h-8 sm:w-8 rounded-lg sm:rounded-xl text-stone-ink hover:text-forest-900 hover:bg-linen-200/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 inline-flex items-center justify-center transition-colors shrink-0"
        >
          ${renderIcon('x', 'w-3.5 h-3.5')}
        </button>
      </div>
    </div>
  `;
}

/**
 * Builds a structured, privacy-safe usage context digest of the family library so AI enrichment
 * adapters, custom proxy webhooks, or future recommendation assistants know which books are
 * loved favorites, read/unread, currently on a shelf, in cooldown, or long unseen in the box.
 *
 * @param {{
 *   books: import('../../types/models.js').Book[],
 *   profiles: import('../../types/models.js').ChildProfile[],
 *   rotations: import('../../types/models.js').RotationList[],
 *   activeProfileId?: string,
 *   staleBookDays?: number,
 *   referenceDate?: Date | string | number
 * }} params
 */
export function buildAiLibraryUsageContext({
  books = [],
  profiles = [],
  rotations = [],
  activeProfileId,
  staleBookDays = 10,
  referenceDate = new Date(),
}) {
  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) || profiles[0] || null;
  const activeRotation = activeProfile
    ? rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') || null
    : null;

  const items = books.map((book) => {
    const usage = computeBookUsageSummary(book, {
      profiles,
      rotations,
      activeProfile,
      activeRotation,
      staleBookDays,
      referenceDate,
    });
    return {
      bookId: book.id,
      title: book.title,
      collectionStatus: book.collectionStatus || 'owned',
      loved: usage.loved,
      tags: book.tags || [],
      freshnessTier: usage.freshnessTier,
      rotationCount: usage.rotationCount,
      lastRotatedAt: usage.lastRotatedAt,
      daysSinceLastRotated: usage.daysSinceLastRotated,
      rotationsSinceLastOut: usage.rotationsSinceLastOut,
      inCooldown: usage.inCooldown,
      isCurrentlyOnActiveShelf: usage.isCurrentlyOnActiveShelf,
      daysOnActiveShelf: usage.daysOnActiveShelf,
      isStaleUnreadOnShelf: usage.isStaleUnreadOnShelf,
      isReadByActiveProfile: usage.isReadByActiveProfile,
      lastReadAt: usage.lastReadAt,
    };
  });

  return {
    generatedAt:
      referenceDate instanceof Date
        ? referenceDate.toISOString()
        : typeof referenceDate === 'string'
          ? referenceDate
          : new Date(referenceDate).toISOString(),
    activeReaderStage: activeProfile?.readingStage || null,
    favoriteTopics: activeProfile?.favoriteTopics || [],
    summaryCounts: {
      totalBooks: items.length,
      lovedCount: items.filter((i) => i.loved).length,
      neverRotatedCount: items.filter((i) => i.freshnessTier === 'never-rotated').length,
      longUnseenCount: items.filter((i) => i.freshnessTier === 'long-unseen').length,
      inCooldownCount: items.filter((i) => i.inCooldown).length,
      staleOnShelfCount: items.filter((i) => i.isStaleUnreadOnShelf).length,
      unreadByActiveReaderCount: items.filter((i) => !i.isReadByActiveProfile).length,
    },
    books: items,
  };
}
