/**
 * @fileoverview Pure Library Swap Day schedule & reminder calculator for active and saved rotations.
 * Since installed PWAs are suspended when closed and cannot run background local timers without a
 * push server, Swap Day status is computed deterministically from persisted ISO timestamps whenever
 * the app opens, renders, or returns to the foreground.
 */

import { escapeHtml } from '../../types/models.js';
import { renderIcon } from '../../ui/icons.js';

const MS_PER_DAY = 86_400_000;

const SHORT_MONTHS = [
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

/**
 * Formats an epoch timestamp into a concise editorial date (`Oct 18`, or `Oct 18, 2025` if another year).
 * @param {number} targetMs
 * @param {number} referenceMs
 * @returns {string}
 */
export function formatShortRotationDate(targetMs, referenceMs) {
  const d = new Date(targetMs);
  const ref = new Date(referenceMs);
  const month = SHORT_MONTHS[d.getUTCMonth()] || 'Jan';
  const day = d.getUTCDate();
  if (d.getUTCFullYear() !== ref.getUTCFullYear()) {
    return `${month} ${day}, ${d.getUTCFullYear()}`;
  }
  return `${month} ${day}`;
}

/**
 * Resolves the configured Swap Cycle length in days (`1..90`) for a rotation shelf.
 * Prefers explicit `rules.swapDays`, then positive `rules.cooldownDays`, then `profile.cooldownDays`, defaulting to 14.
 *
 * @param {import('../../types/models.js').RotationList} rotation
 * @param {import('../../types/models.js').ChildProfile | null | undefined} [profile]
 * @returns {number}
 */
export function getRotationCycleDays(rotation, profile) {
  const explicitSwap = Number(rotation?.rules?.swapDays);
  if (Number.isFinite(explicitSwap) && explicitSwap >= 1) {
    return Math.min(90, Math.trunc(explicitSwap));
  }
  const ruleCooldown = Number(rotation?.rules?.cooldownDays);
  if (Number.isFinite(ruleCooldown) && ruleCooldown >= 1) {
    return Math.min(90, Math.trunc(ruleCooldown));
  }
  const profileCooldown = Number(profile?.cooldownDays);
  if (Number.isFinite(profileCooldown) && profileCooldown >= 1) {
    return Math.min(90, Math.trunc(profileCooldown));
  }
  return 14;
}

/**
 * @typedef {Object} RotationSchedule
 * @property {string} startedAt - ISO-8601 timestamp when the rotation was set/created
 * @property {string} dueAt - ISO-8601 timestamp when the rotation is due to swap
 * @property {number} cycleDays - Planned shelf duration in days
 * @property {number} daysElapsed - Whole days elapsed since `startedAt`
 * @property {number} daysRemaining - Positive days left until Swap Day (`0` when due today, negative when overdue)
 * @property {number} daysOverdue - Whole days past Swap Day (`0` if due today or not yet due)
 * @property {boolean} isDue - True when `now >= dueAt`
 * @property {boolean} isDueSoon - True when not yet due and `daysRemaining <= 2`
 * @property {string} startedDateLabel - Short date when shelf was set (e.g. `Oct 17`)
 * @property {string} dueDateLabel - Short date when swap is due (e.g. `Oct 31`)
 * @property {string} countdownLabel - Human-readable status (`in 4 days`, `Swap today`, `3d overdue`)
 * @property {string} activeScheduleLine - Full unboxed editorial summary for active shelf headers
 * @property {string} savedScheduleLine - Unboxed editorial summary for saved shelf headers
 * @property {string} reminderKey - Unique key for dismissing the alert for this specific activation cycle
 */

/**
 * Computes deterministic creation/activation and Swap Day schedule state for a rotation.
 *
 * @param {import('../../types/models.js').RotationList} rotation
 * @param {import('../../types/models.js').ChildProfile | null | undefined} [profile]
 * @param {Date | string | number} [nowInput]
 * @returns {RotationSchedule}
 */
export function computeRotationSchedule(rotation, profile, nowInput = new Date()) {
  const nowParsed =
    nowInput instanceof Date
      ? nowInput.getTime()
      : typeof nowInput === 'number'
        ? nowInput
        : Date.parse(String(nowInput));
  const nowMs = Number.isFinite(nowParsed) ? nowParsed : Date.now();

  const rawStartedIso = rotation.activatedAt || rotation.createdAt || new Date(nowMs).toISOString();
  const parsedStarted = Date.parse(rawStartedIso);
  const startedMs = Number.isFinite(parsedStarted) ? parsedStarted : nowMs;
  const startedAt = new Date(startedMs).toISOString();

  const cycleDays = getRotationCycleDays(rotation, profile);
  const dueMs = startedMs + cycleDays * MS_PER_DAY;
  const dueAt = new Date(dueMs).toISOString();

  const elapsedMs = Math.max(0, nowMs - startedMs);
  const daysElapsed = Math.floor(elapsedMs / MS_PER_DAY);
  const diffMs = dueMs - nowMs;

  let isDue = false;
  let isDueSoon = false;
  let daysRemaining = 0;
  let daysOverdue = 0;
  let countdownLabel = '';

  if (diffMs <= 0) {
    isDue = true;
    daysOverdue = Math.floor(Math.abs(diffMs) / MS_PER_DAY);
    daysRemaining = -daysOverdue;
    countdownLabel = daysOverdue === 0 ? 'Swap today' : `${daysOverdue}d overdue`;
  } else {
    isDue = false;
    daysRemaining = Math.max(1, Math.ceil(diffMs / MS_PER_DAY));
    isDueSoon = daysRemaining <= 2;
    countdownLabel = daysRemaining === 1 ? 'in 1 day' : `in ${daysRemaining} days`;
  }

  const startedDateLabel = formatShortRotationDate(startedMs, nowMs);
  const dueDateLabel = formatShortRotationDate(dueMs, nowMs);

  const activeScheduleLine = `Set ${startedDateLabel} · Swap ${dueDateLabel} · ${countdownLabel}`;
  const savedScheduleLine = `Created ${formatShortRotationDate(
    Number.isFinite(Date.parse(rotation.createdAt)) ? Date.parse(rotation.createdAt) : startedMs,
    nowMs
  )} · ${cycleDays}d cycle`;

  return {
    startedAt,
    dueAt,
    cycleDays,
    daysElapsed,
    daysRemaining,
    daysOverdue,
    isDue,
    isDueSoon,
    startedDateLabel,
    dueDateLabel,
    countdownLabel,
    activeScheduleLine,
    savedScheduleLine,
    reminderKey: `${rotation.id}::${startedAt}`,
  };
}

/**
 * Renders an actionable on-open "Library Swap Day" reminder banner when the active shelf has
 * reached or passed its scheduled Swap Day and hasn't been dismissed for this cycle.
 *
 * @param {{
 *   rotation: import('../../types/models.js').RotationList | null,
 *   profile: import('../../types/models.js').ChildProfile,
 *   schedule: RotationSchedule | null,
 *   dismissedReminderKeys?: Iterable<string>
 * }} params
 * @returns {string}
 */
export function renderSwapDayAlertBanner({
  rotation,
  profile,
  schedule,
  dismissedReminderKeys = [],
}) {
  if (!rotation || !schedule || !schedule.isDue) return '';
  const dismissedSet = new Set(dismissedReminderKeys);
  if (dismissedSet.has(schedule.reminderKey)) return '';

  const timingKicker =
    schedule.daysOverdue > 0
      ? `Swap due ${schedule.daysOverdue} ${schedule.daysOverdue === 1 ? 'day' : 'days'} ago (${schedule.dueDateLabel})`
      : `Swap due today (${schedule.dueDateLabel})`;

  return `
    <section
      role="region"
      aria-label="Library Swap Day reminder"
      data-swap-day-alert="true"
      class="rounded-xl bg-amber-50/95 dark:bg-amber-950/45 border border-amber-300/80 dark:border-amber-800/80 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-2"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-start gap-2.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-200/80 dark:bg-amber-900/70 text-amber-950 dark:text-amber-200 flex items-center justify-center shrink-0 mt-0.5"
          >
            ${renderIcon('rotations', 'w-3.5 h-3.5 sm:w-4 sm:h-4')}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold text-amber-900 dark:text-amber-300 font-mono-tabular leading-tight truncate">
              ${escapeHtml(timingKicker)} · ${escapeHtml(profile.name)}
            </p>
            <p class="text-xs sm:text-sm font-medium text-forest-900 dark:text-slate-100 mt-0.5 leading-snug line-clamp-1 sm:line-clamp-2">
              “${escapeHtml(rotation.title)}” completed its ${schedule.cycleDays}d shelf cycle (set ${escapeHtml(schedule.startedDateLabel)}).
            </p>
          </div>
        </div>

        <button
          type="button"
          data-action="dismiss-swap-reminder"
          data-reminder-key="${escapeHtml(schedule.reminderKey)}"
          aria-label="Dismiss Library Swap Day reminder for this cycle"
          title="Dismiss reminder"
          class="min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] -mr-1.5 -mt-1 rounded-lg text-amber-900/75 hover:text-amber-950 hover:bg-amber-200/50 dark:text-amber-300/80 dark:hover:text-amber-100 dark:hover:bg-amber-900/40 flex items-center justify-center shrink-0 transition-colors"
        >
          ${renderIcon('close', 'w-3.5 h-3.5')}
        </button>
      </div>

      <div class="flex items-center gap-2 pl-9.5 sm:pl-10.5">
        <button
          type="button"
          data-action="start-swap-day-rotation"
          class="h-7 sm:h-8 px-2.5 sm:px-3.5 rounded-lg bg-forest-800 hover:bg-forest-900 dark:bg-[#5ED3DA] dark:hover:bg-[#7CE0E6] text-white dark:text-night-950 text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
        >
          ${renderIcon('shuffle', 'w-3 h-3 sm:w-3.5 sm:h-3.5')}
          <span>Rotate Shelf</span>
        </button>
      </div>
    </section>
  `;
}
