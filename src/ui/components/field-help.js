/**
 * @fileoverview Accessible clickable `(i)` field help icons and collapsible plain-language
 * explanation panels for rotation, preset, profile, and settings forms.
 *
 * Designed so clicking `(i)` toggles `hidden` + `aria-expanded` directly in the DOM without
 * forcing a full form re-render or clearing unsaved user typing.
 */

import { escapeHtml } from '../../types/models.js';
import { renderIcon } from '../icons.js';

/**
 * Plain-language field definitions written for parents curating family book shelves.
 * @type {Record<string, { title: string, body: string }>}
 */
export const FIELD_HELP_COPY = {
  swapDays: {
    title: 'Swap Cycle',
    body: 'How many days this shelf stays out before Swap Day reminds you to refresh the books. Most families rotate every 7 to 14 days.',
  },
  cooldownDays: {
    title: 'Cooldown',
    body: 'How many days a book rests in the storage box after being on a shelf before it is auto-picked again. Tip: set Cooldown longer than Swap Cycle (for example, 14d swap and 28d cooldown) so consecutive shelves feel genuinely fresh.',
  },
  seed: {
    title: 'Deterministic Seed',
    body: 'Optional repeatable shuffle word (such as "winter-2026"). Using the same seed with the same books always produces the exact same shelf; leave blank or change it for a fresh mix.',
  },
  objective: {
    title: 'Shelf Theme / Objective',
    body: 'Optional plain-English note describing what this shelf is for (such as "Hardcover + cozy winter" or "Bedtime calm"). Keywords here also guide book matching.',
  },
  bookCount: {
    title: 'Books on Shelf',
    body: 'Target number of books placed face-out on this shelf at once. Keeping 4 to 8 books out makes covers inviting without overwhelming young readers.',
  },
  varietyMix: {
    title: 'Enforce Variety',
    body: 'Spreads shelf picks across different authors, formats, and topics instead of grouping several books by the same author together.',
  },
  suggestedStart: {
    title: 'Suggested Start Date',
    body: 'Optional annual month and day when this seasonal or cultural collection begins. Leave as Evergreen if the collection can be used any time of year.',
  },
  defaultRotationSize: {
    title: 'Books per Rotation',
    body: 'Default number of books placed on each new shelf generated for this reader profile.',
  },
  presetDaysBefore: {
    title: 'Show Reminder in Advance',
    body: 'How many days before a preset’s annual start date its gentle reminder appears on Home and Rotations so you have time to set up the shelf.',
  },
  presetDaysAfter: {
    title: 'Keep Unactioned Reminder',
    body: 'How many days after the start date an unactioned preset reminder remains visible (shown as "Suggested Xd ago") until you apply or dismiss it.',
  },
  staleBookDays: {
    title: 'Stale Book Spotlight Days',
    body: 'Highlights books sitting on the active shelf for at least this many days without being marked as read, nudging you to read them together or swap in something fresh from the box.',
  },
};

/**
 * Resolves the unique DOM id for a field help panel instance.
 * @param {string} helpKey
 * @param {string} [scope]
 * @returns {string}
 */
export function buildFieldHelpPanelId(helpKey, scope = 'default') {
  const safeScope = String(scope || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');
  const safeKey = String(helpKey || 'field').replace(/[^a-zA-Z0-9_-]/g, '-');
  return `field-help-${safeScope}-${safeKey}`;
}

/**
 * Renders the inline `(i)` button next to a form field label.
 * @param {{
 *   helpKey: keyof typeof FIELD_HELP_COPY | string,
 *   scope?: string,
 *   openHelpIds?: Set<string> | string[]
 * }} params
 * @returns {string}
 */
export function renderFieldInfoButton({ helpKey, scope = 'default', openHelpIds }) {
  const entry = FIELD_HELP_COPY[helpKey];
  if (!entry) return '';
  const panelId = buildFieldHelpPanelId(helpKey, scope);
  const isOpen =
    openHelpIds instanceof Set
      ? openHelpIds.has(panelId)
      : Array.isArray(openHelpIds)
        ? openHelpIds.includes(panelId)
        : false;

  return `<button
    type="button"
    data-action="toggle-field-help"
    data-help-key="${escapeHtml(String(helpKey))}"
    data-help-target="${escapeHtml(panelId)}"
    aria-expanded="${isOpen ? 'true' : 'false'}"
    aria-controls="${escapeHtml(panelId)}"
    aria-label="What is ${escapeHtml(entry.title)}?"
    title="What is ${escapeHtml(entry.title)}?"
    class="inline-flex items-center justify-center w-5 h-5 rounded-md text-stone-ink hover:text-forest-800 hover:bg-linen-200/80 dark:text-slate-400 dark:hover:text-[#5ED3DA] dark:hover:bg-night-800 transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700"
  >${renderIcon('info', 'w-3.5 h-3.5')}</button>`;
}

/**
 * Renders the collapsible plain-language explanation panel associated with `renderFieldInfoButton`.
 * @param {{
 *   helpKey: keyof typeof FIELD_HELP_COPY | string,
 *   scope?: string,
 *   openHelpIds?: Set<string> | string[],
 *   extraClass?: string
 * }} params
 * @returns {string}
 */
export function renderFieldInfoPanel({
  helpKey,
  scope = 'default',
  openHelpIds,
  extraClass = 'mt-1',
}) {
  const entry = FIELD_HELP_COPY[helpKey];
  if (!entry) return '';
  const panelId = buildFieldHelpPanelId(helpKey, scope);
  const isOpen =
    openHelpIds instanceof Set
      ? openHelpIds.has(panelId)
      : Array.isArray(openHelpIds)
        ? openHelpIds.includes(panelId)
        : false;

  return `<p
    id="${escapeHtml(panelId)}"
    data-field-help-panel="${escapeHtml(String(helpKey))}"
    ${isOpen ? '' : 'hidden'}
    class="${escapeHtml(extraClass)} rounded-xl bg-linen-100/95 dark:bg-night-950/95 border border-linen-200 dark:border-night-700 px-2.5 py-2 text-[11px] leading-relaxed font-normal text-stone-ink dark:text-slate-300"
  ><strong class="font-semibold text-forest-900 dark:text-white">${escapeHtml(entry.title)}:</strong> ${escapeHtml(entry.body)}</p>`;
}
