/**
 * @fileoverview Pure Rotation Preset & Annual Calendar Start-Date Engine:
 * - Merges declarative defaults (`DEFAULT_ROTATION_PRESETS`) with user-added custom presets
 * - Validates optional year-agnostic `MM-DD` suggested start dates
 * - Computes exact days until suggested start (`0` when today matches `MM-DD`, `null` when anytime)
 * - Detects today's `MM-DD` start-date matches and renders a dismissible editorial alert banner
 */

import { DEFAULT_ROTATION_PRESETS } from '../../data/rotation-presets-config.js';
import { createId, escapeHtml, isBookRotatable } from '../../types/models.js';
import { renderIcon } from '../../ui/icons.js';
import { sanitizeTagList } from '../tagging/rule-tagger.js';
import { parseRotationObjective } from './rotation-engine.js';

const MS_PER_DAY = 86_400_000;

export const PRESET_MONTH_NAMES = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

const SHORT_MONTHS = Object.freeze([
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
]);

const MAX_DAYS_IN_MONTH = Object.freeze([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

/**
 * Checks whether a calendar year is a Gregorian leap year.
 * @param {number} year
 * @returns {boolean}
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Extracts `{ year, month, day }` from a `YYYY-MM-DD` string, ISO timestamp, epoch ms, or `Date`.
 * Plain `YYYY-MM-DD` strings are parsed directly without timezone offset drift; `Date` instances
 * use local calendar fields so wall-clock "today" matches the user's device date.
 *
 * @param {Date | string | number | undefined | null} input
 * @returns {{ year: number, month: number, day: number }}
 */
export function resolveCalendarMonthDayYear(input = new Date()) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      return {
        year: Number(dateOnlyMatch[1]),
        month: Number(dateOnlyMatch[2]),
        day: Number(dateOnlyMatch[3]),
      };
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return {
        year: parsed.getFullYear(),
        month: parsed.getMonth() + 1,
        day: parsed.getDate(),
      };
    }
  } else if (typeof input === 'number' && Number.isFinite(input)) {
    const d = new Date(input);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    };
  } else if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

/**
 * Validates and normalizes an optional annual `MM-DD` start date string (without year).
 * Empty input is valid and indicates an anytime/evergreen preset with no fixed start date.
 *
 * @param {string | undefined | null} rawMonthDay
 * @returns {{ valid: boolean, monthDay: string, month?: number, day?: number, error?: string }}
 */
export function normalizeMonthDay(rawMonthDay) {
  const cleaned = String(rawMonthDay || '').trim();
  if (!cleaned) {
    return { valid: true, monthDay: '' };
  }

  const match = /^(\d{1,2})-(\d{1,2})$/.exec(cleaned);
  if (!match) {
    return {
      valid: false,
      monthDay: '',
      error: 'Suggested start date must use MM-DD format (month and day only).',
    };
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12) {
    return {
      valid: false,
      monthDay: '',
      error: 'Suggested start month must be between 1 and 12.',
    };
  }

  const maxDay = MAX_DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) {
    return {
      valid: false,
      monthDay: '',
      error: `${PRESET_MONTH_NAMES[month - 1]} has at most ${maxDay} days.`,
    };
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    valid: true,
    monthDay: `${mm}-${dd}`,
    month,
    day,
  };
}

/**
 * Builds and validates a normalized `MM-DD` string from separate month (`1..12` or `''`) and day inputs.
 * @param {string | number | undefined | null} rawMonth
 * @param {string | number | undefined | null} rawDay
 * @returns {{ valid: boolean, monthDay: string, error?: string }}
 */
export function buildMonthDayFromParts(rawMonth, rawDay) {
  const mStr = String(rawMonth ?? '').trim();
  const dStr = String(rawDay ?? '').trim();
  if (!mStr && !dStr) {
    return { valid: true, monthDay: '' };
  }
  if (!mStr || !dStr) {
    return {
      valid: false,
      monthDay: '',
      error: 'Select both a month and a day for the suggested start date, or leave Month on Anytime.',
    };
  }
  return normalizeMonthDay(`${mStr}-${dStr}`);
}

/**
 * Formats an `MM-DD` string into a human-friendly calendar label (`Dec 1`, `Oct 15`), or `'Anytime'`.
 * @param {string | undefined | null} monthDay
 * @returns {string}
 */
export function formatMonthDayLabel(monthDay) {
  const parsed = normalizeMonthDay(monthDay);
  if (!parsed.valid || !parsed.monthDay || !parsed.month || !parsed.day) {
    return 'Anytime';
  }
  return `${SHORT_MONTHS[parsed.month - 1]} ${parsed.day}`;
}

/**
 * Generates a deterministic slug seed from a preset title when no explicit seed is provided.
 * @param {string} title
 * @returns {string}
 */
export function createDeterministicPresetSeed(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
  return `preset-${slug || 'collection'}-v1`;
}

/**
 * Validates and normalizes a user-created or persisted custom `RotationPreset`.
 *
 * @param {{
 *   id?: string,
 *   title?: string,
 *   description?: string,
 *   category?: string,
 *   preferredTags?: string[] | string,
 *   count?: number | string,
 *   swapDays?: number | string,
 *   cooldownDays?: number | string,
 *   requiredFormat?: string,
 *   varietyMix?: boolean,
 *   seed?: string,
 *   suggestedStartMonthDay?: string,
 *   motif?: string,
 *   createdAt?: string
 * }} input
 * @param {{ isCustom?: boolean, isBuiltInOverride?: boolean }} [flags]
 * @returns {import('../../types/models.js').RotationPreset}
 */
export function normalizeRotationPresetInput(input, flags = {}) {
  const title = String(input?.title || '').trim();
  if (!title) {
    throw new Error('Collection preset title is required.');
  }

  const description = String(input?.description || '').trim();
  if (!description) {
    throw new Error('Collection preset description is required.');
  }

  const monthDayCheck = normalizeMonthDay(input?.suggestedStartMonthDay);
  if (!monthDayCheck.valid) {
    throw new Error(monthDayCheck.error || 'Invalid suggested start date.');
  }

  /** @type {import('../../types/models.js').PresetCategory} */
  const category =
    input?.category === 'seasonal-holidays' ||
    input?.category === 'cultural-traditions' ||
    input?.category === 'calendar-events' ||
    input?.category === 'evergreen'
      ? input.category
      : monthDayCheck.monthDay
        ? 'seasonal-holidays'
        : 'evergreen';

  const rawTags = Array.isArray(input?.preferredTags)
    ? input.preferredTags
    : String(input?.preferredTags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
  const preferredTags = sanitizeTagList(rawTags, 10);

  const count = Math.max(1, Math.trunc(Number(input?.count) || 5));
  const swapDays = Math.max(1, Math.min(90, Math.trunc(Number(input?.swapDays) || 14)));
  const cooldownNum = Number(input?.cooldownDays);
  const cooldownDays = Number.isFinite(cooldownNum)
    ? Math.max(0, Math.min(90, Math.trunc(cooldownNum)))
    : 21;

  /** @type {import('../../types/models.js').BookFormat | 'any'} */
  const requiredFormat =
    input?.requiredFormat === 'hardcover' ||
    input?.requiredFormat === 'board-book' ||
    input?.requiredFormat === 'paperback'
      ? input.requiredFormat
      : 'any';

  const rawSeed = String(input?.seed || '').trim();
  const seed = rawSeed || createDeterministicPresetSeed(title);
  const rawMotif = typeof input?.motif === 'string' ? input.motif.trim() : '';

  const isCustom = flags.isCustom !== undefined ? Boolean(flags.isCustom) : true;
  const isBuiltInOverride = Boolean(flags.isBuiltInOverride);

  return {
    id: String(input?.id || '').trim() || createId('preset'),
    title,
    description,
    category,
    preferredTags,
    count,
    swapDays,
    cooldownDays,
    requiredFormat,
    varietyMix: input?.varietyMix !== false,
    seed,
    ...(monthDayCheck.monthDay ? { suggestedStartMonthDay: monthDayCheck.monthDay } : {}),
    ...(rawMotif ? { motif: rawMotif } : {}),
    isCustom,
    ...(isBuiltInOverride ? { isBuiltInOverride: true } : {}),
    createdAt: input?.createdAt || new Date().toISOString(),
  };
}

/**
 * Returns all available rotation collection presets (built-in configuration merged with any
 * in-place user overrides + user-defined custom presets).
 * @param {Pick<import('../../types/models.js').AppState, 'customPresets' | 'presetOverrides'> | null | undefined} [state]
 * @returns {import('../../types/models.js').RotationPreset[]}
 */
export function getAllRotationPresets(state) {
  const overrides =
    state?.presetOverrides && typeof state.presetOverrides === 'object'
      ? state.presetOverrides
      : {};

  const builtIns = DEFAULT_ROTATION_PRESETS.map((basePreset) => {
    const override = overrides[basePreset.id];
    if (!override) {
      return {
        ...basePreset,
        isCustom: false,
        isBuiltInOverride: false,
      };
    }
    return {
      ...basePreset,
      ...override,
      id: basePreset.id,
      isCustom: false,
      isBuiltInOverride: true,
      suggestedStartMonthDay: override.suggestedStartMonthDay,
    };
  });

  const custom = Array.isArray(state?.customPresets) ? state.customPresets : [];
  return [...builtIns, ...custom];
}

/**
 * @typedef {Object} PresetStartSchedule
 * @property {boolean} hasSuggestedStart - True when `suggestedStartMonthDay` (`MM-DD`) is configured
 * @property {string} monthDay - Normalized `MM-DD` string or `''`
 * @property {number | null} month - 1-indexed calendar month (`1..12`) when dated, else `null`
 * @property {number | null} day - Day of month (`1..31`) when dated, else `null`
 * @property {string} formattedDateLabel - e.g. `'Dec 1'` or `'Anytime'`
 * @property {number | null} daysUntilStart - `0` when today matches `MM-DD`, `1..366` for upcoming date, `null` when anytime
 * @property {boolean} isStartToday - True when `referenceDate`'s month & day match `suggestedStartMonthDay`
 * @property {string} countdownLabel - Concise human-readable status (`Suggested today · Dec 1`, `In 30 days · Dec 1`, `Anytime`)
 * @property {string} alertKey - Year-scoped dismissal key (`preset-start::<id>::<YYYY>-<MM-DD>`)
 * @property {'today' | 'upcoming' | 'past-due'} [windowStatus] - Notification window state when matched
 * @property {number} [signedDaysFromStart] - `0` on start day, negative when upcoming, positive when start passed X days ago
 */

/**
 * Computes how many days remain until a preset's suggested `MM-DD` start date (ignoring year on match,
 * wrapping cleanly into the next calendar year once passed, and returning `null` for anytime presets).
 *
 * @param {import('../../types/models.js').RotationPreset} preset
 * @param {Date | string | number} [referenceDate]
 * @returns {PresetStartSchedule}
 */
export function computePresetStartSchedule(preset, referenceDate = new Date()) {
  const parsed = normalizeMonthDay(preset?.suggestedStartMonthDay);
  if (!parsed.valid || !parsed.monthDay || !parsed.month || !parsed.day) {
    return {
      hasSuggestedStart: false,
      monthDay: '',
      month: null,
      day: null,
      formattedDateLabel: 'Anytime',
      daysUntilStart: null,
      isStartToday: false,
      countdownLabel: 'Anytime',
      alertKey: '',
    };
  }

  const ref = resolveCalendarMonthDayYear(referenceDate);
  const formattedDateLabel = `${SHORT_MONTHS[parsed.month - 1]} ${parsed.day}`;

  const clampTargetDay = (/** @type {number} */ targetYear) =>
    parsed.month === 2 && parsed.day === 29 && !isLeapYear(targetYear) ? 28 : parsed.day || 1;

  const targetDayThisYear = clampTargetDay(ref.year);
  const isStartToday = ref.month === parsed.month && ref.day === targetDayThisYear;

  if (isStartToday) {
    return {
      hasSuggestedStart: true,
      monthDay: parsed.monthDay,
      month: parsed.month,
      day: parsed.day,
      formattedDateLabel,
      daysUntilStart: 0,
      isStartToday: true,
      countdownLabel: `Suggested today · ${formattedDateLabel}`,
      alertKey: `preset-start::${preset.id}::${ref.year}-${parsed.monthDay}`,
      windowStatus: 'today',
      signedDaysFromStart: 0,
    };
  }

  const todayUtc = Date.UTC(ref.year, ref.month - 1, ref.day);
  const thisYearUtc = Date.UTC(ref.year, parsed.month - 1, targetDayThisYear);

  let nextOccurrenceYear = ref.year;
  let nextOccurrenceUtc = thisYearUtc;
  if (thisYearUtc < todayUtc) {
    nextOccurrenceYear = ref.year + 1;
    const targetDayNextYear = clampTargetDay(ref.year + 1);
    nextOccurrenceUtc = Date.UTC(ref.year + 1, parsed.month - 1, targetDayNextYear);
  }

  const daysUntilStart = Math.max(1, Math.round((nextOccurrenceUtc - todayUtc) / MS_PER_DAY));
  const dayWord = daysUntilStart === 1 ? '1 day' : `${daysUntilStart} days`;

  return {
    hasSuggestedStart: true,
    monthDay: parsed.monthDay,
    month: parsed.month,
    day: parsed.day,
    formattedDateLabel,
    daysUntilStart,
    isStartToday: false,
    countdownLabel: `In ${dayWord} · ${formattedDateLabel}`,
    alertKey: `preset-start::${preset.id}::${nextOccurrenceYear}-${parsed.monthDay}`,
  };
}

/**
 * Counts how many owned rotatable books in the user's library match at least one of the preset's
 * preferred topic tags or objective keywords, alongside both eligible and total library book counts.
 *
 * @param {import('../../types/models.js').Book[]} books
 * @param {import('../../types/models.js').RotationPreset} preset
 * @returns {{ thematicMatchCount: number, rotatableTotalCount: number, totalCatalogCount: number }}
 */
export function countMatchingCatalogBooksForPreset(books, preset) {
  const safeBooks = Array.isArray(books) ? books : [];
  const rotatable = safeBooks.filter((b) => isBookRotatable(b));
  const tagSet = new Set((preset.preferredTags || []).map((t) => t.toLowerCase().trim()));
  const parsedObj = parseRotationObjective(preset.description || '');
  const keywordSet = new Set(parsedObj.keywords);

  let thematicMatchCount = 0;
  for (const book of rotatable) {
    const bookTags = (book.tags || []).map((t) => t.toLowerCase());
    const hasTagHit = bookTags.some((t) => tagSet.has(t));
    const hay = `${book.title} ${bookTags.join(' ')}`.toLowerCase();
    const hasKeywordHit = Array.from(keywordSet).some((kw) => hay.includes(kw));
    if (hasTagHit || hasKeywordHit) {
      thematicMatchCount += 1;
    }
  }

  return {
    thematicMatchCount,
    rotatableTotalCount: rotatable.length,
    totalCatalogCount: safeBooks.length,
  };
}

/**
 * Finds all presets whose annual `suggestedStartMonthDay` (`MM-DD`) falls within the configured
 * advance & grace notification window (`[-daysBefore, +daysAfter]` relative to `referenceDate`),
 * handling Dec/Jan year boundaries cleanly and excluding any occurrence already dismissed or
 * already generated/active for this reader.
 *
 * @param {import('../../types/models.js').RotationPreset[]} presets
 * @param {Date | string | number} [referenceDate]
 * @param {{
 *   activeRotation?: import('../../types/models.js').RotationList | null,
 *   profileRotations?: import('../../types/models.js').RotationList[],
 *   dismissedAlertKeys?: Iterable<string>,
 *   daysBefore?: number,
 *   daysAfter?: number
 * }} [options]
 * @returns {Array<{ preset: import('../../types/models.js').RotationPreset, schedule: PresetStartSchedule }>}
 */
export function findMatchingStartDatePresets(presets, referenceDate = new Date(), options = {}) {
  const dismissedSet = new Set(options.dismissedAlertKeys || []);
  const activeRot = options.activeRotation || null;
  const profileRotations = Array.isArray(options.profileRotations) ? options.profileRotations : [];

  const daysBefore = Math.max(0, Math.min(30, Math.trunc(Number(options.daysBefore ?? 0) || 0)));
  const daysAfter = Math.max(0, Math.min(30, Math.trunc(Number(options.daysAfter ?? 0) || 0)));

  const ref = resolveCalendarMonthDayYear(referenceDate);
  const todayUtc = Date.UTC(ref.year, ref.month - 1, ref.day);

  /** @type {Array<{ preset: import('../../types/models.js').RotationPreset, schedule: PresetStartSchedule }>} */
  const matches = [];

  for (const preset of presets) {
    const parsed = normalizeMonthDay(preset?.suggestedStartMonthDay);
    if (!parsed.valid || !parsed.monthDay || !parsed.month || !parsed.day) continue;

    // Check previous, current, and next calendar year occurrences so Dec 30 -> Jan 1 and Jan 2 -> Dec 29 work seamlessly
    /** @type {{ occYear: number, signedDays: number, occUtc: number } | null} */
    let matchedOccurrence = null;
    for (const occYear of [ref.year - 1, ref.year, ref.year + 1]) {
      const occDay =
        parsed.month === 2 && parsed.day === 29 && !isLeapYear(occYear) ? 28 : parsed.day;
      const occUtc = Date.UTC(occYear, parsed.month - 1, occDay);
      const signedDays = Math.round((todayUtc - occUtc) / MS_PER_DAY);
      if (signedDays >= -daysBefore && signedDays <= daysAfter) {
        matchedOccurrence = { occYear, signedDays, occUtc };
        break;
      }
    }

    if (!matchedOccurrence) continue;

    const occurrenceAlertKey = `preset-start::${preset.id}::${matchedOccurrence.occYear}-${parsed.monthDay}`;
    if (dismissedSet.has(occurrenceAlertKey)) continue;

    const matchesRotation = (/** @type {import('../../types/models.js').RotationList} */ rot) =>
      rot.rules?.seed === preset.seed ||
      rot.title.trim().toLowerCase() === preset.title.trim().toLowerCase();

    if (activeRot && matchesRotation(activeRot)) continue;

    // Also suppress if the user already generated this preset recently for this reader during this window
    const recentlyGenerated = profileRotations.some((rot) => {
      if (!matchesRotation(rot)) return false;
      const createdMs = Date.parse(rot.createdAt || '');
      if (Number.isNaN(createdMs)) return false;
      const diffDays = Math.abs(createdMs - matchedOccurrence.occUtc) / MS_PER_DAY;
      return diffDays <= Math.max(21, daysBefore + daysAfter + 7);
    });
    if (recentlyGenerated) continue;

    const baseSchedule = computePresetStartSchedule(preset, referenceDate);
    /** @type {'today' | 'upcoming' | 'past-due'} */
    const windowStatus =
      matchedOccurrence.signedDays === 0
        ? 'today'
        : matchedOccurrence.signedDays < 0
          ? 'upcoming'
          : 'past-due';

    matches.push({
      preset,
      schedule: {
        ...baseSchedule,
        alertKey: occurrenceAlertKey,
        windowStatus,
        signedDaysFromStart: matchedOccurrence.signedDays,
      },
    });
  }

  // Prioritize exact-day matches first, then upcoming soonest, then most recent past-due
  matches.sort((a, b) => {
    const rank = (/** @type {'today' | 'upcoming' | 'past-due' | undefined} */ s) =>
      s === 'today' ? 0 : s === 'upcoming' ? 1 : 2;
    const rankDiff = rank(a.schedule.windowStatus) - rank(b.schedule.windowStatus);
    if (rankDiff !== 0) return rankDiff;
    return Math.abs(a.schedule.signedDaysFromStart || 0) - Math.abs(b.schedule.signedDaysFromStart || 0);
  });

  return matches;
}

/**
 * Renders an actionable seasonal/event Start-Date Match Alert Banner when a collection preset's
 * annual `MM-DD` start date is today, upcoming within `daysBefore`, or passed within `daysAfter`
 * without the user having accepted or dismissed it.
 *
 * @param {{
 *   presets: import('../../types/models.js').RotationPreset[],
 *   activeProfile: import('../../types/models.js').ChildProfile,
 *   activeRotation?: import('../../types/models.js').RotationList | null,
 *   profileRotations?: import('../../types/models.js').RotationList[],
 *   dismissedAlertKeys?: Iterable<string>,
 *   daysBefore?: number,
 *   daysAfter?: number,
 *   referenceDate?: Date | string | number,
 *   showBrowseLink?: boolean
 * }} params
 * @returns {string}
 */
export function renderPresetStartDateAlertBanner({
  presets,
  activeProfile,
  activeRotation = null,
  profileRotations = [],
  dismissedAlertKeys = [],
  daysBefore = 0,
  daysAfter = 0,
  referenceDate = new Date(),
  showBrowseLink = true,
}) {
  const matches = findMatchingStartDatePresets(presets, referenceDate, {
    activeRotation,
    profileRotations,
    dismissedAlertKeys,
    daysBefore,
    daysAfter,
  });

  if (matches.length === 0) return '';

  return matches
    .map(({ preset, schedule }) => {
      const signed = schedule.signedDaysFromStart || 0;
      let timingHeadline = `Suggested today (${schedule.formattedDateLabel})`;
      if (schedule.windowStatus === 'upcoming' && signed < 0) {
        const ahead = Math.abs(signed);
        timingHeadline = `Starts in ${ahead} ${ahead === 1 ? 'day' : 'days'} (${schedule.formattedDateLabel})`;
      } else if (schedule.windowStatus === 'past-due' && signed > 0) {
        timingHeadline = `Suggested ${signed} ${signed === 1 ? 'day' : 'days'} ago (${schedule.formattedDateLabel})`;
      }

      return `
        <section
          role="region"
          aria-label="Suggested seasonal rotation start"
          data-preset-start-alert="${escapeHtml(preset.id)}"
          data-preset-alert-status="${escapeHtml(schedule.windowStatus || 'today')}"
          class="rounded-xl bg-linen-100/95 dark:bg-night-800/85 border border-linen-200 dark:border-night-700 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-2"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <span
                aria-hidden="true"
                class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center shrink-0 mt-0.5"
              >
                ${renderIcon('sparkles', 'w-3.5 h-3.5 sm:w-4 sm:h-4')}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA] font-mono-tabular leading-tight truncate">
                  ${escapeHtml(timingHeadline)} · ${escapeHtml(activeProfile.name)}
                </p>
                <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white mt-0.5 leading-snug truncate">
                  ${escapeHtml(preset.title)} · ${preset.count} ${preset.count === 1 ? 'book' : 'books'} (${preset.swapDays}d)
                </p>
                <p class="text-[11px] sm:text-xs text-stone-ink dark:text-slate-300 mt-0.5 leading-snug line-clamp-1 sm:line-clamp-2">
                  ${escapeHtml(preset.description)}
                </p>
              </div>
            </div>

            <button
              type="button"
              data-action="dismiss-preset-start-alert"
              data-alert-key="${escapeHtml(schedule.alertKey)}"
              aria-label="Dismiss ${escapeHtml(preset.title)} start reminder for this year"
              title="Dismiss reminder"
              class="min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] -mr-1.5 -mt-1 rounded-lg text-stone-ink/75 hover:text-forest-900 hover:bg-linen-200/60 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-700 flex items-center justify-center shrink-0 transition-colors"
            >
              ${renderIcon('close', 'w-3.5 h-3.5')}
            </button>
          </div>

          <div class="flex items-center justify-between sm:justify-start gap-2.5 pl-9.5 sm:pl-10.5">
            <button
              type="button"
              data-action="apply-rotation-preset"
              data-preset-id="${escapeHtml(preset.id)}"
              data-alert-key="${escapeHtml(schedule.alertKey)}"
              class="h-7 sm:h-8 px-2.5 sm:px-3.5 rounded-lg bg-forest-700 hover:bg-forest-800 text-white text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              ${renderIcon('rotations', 'w-3 h-3 sm:w-3.5 sm:h-3.5')}
              <span>Generate Shelf</span>
            </button>
            ${
              showBrowseLink
                ? `
                  <a
                    href="#/presets"
                    class="text-[11px] sm:text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline inline-flex items-center gap-0.5 py-1 whitespace-nowrap"
                  >
                    <span>All Presets</span>
                    ${renderIcon('chevronRight', 'w-3 h-3')}
                  </a>
                `
                : ''
            }
          </div>
        </section>
      `;
    })
    .join('');
}
