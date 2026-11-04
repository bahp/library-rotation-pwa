/**
 * @fileoverview Reusable inline clear (`×`) button for text, search, and URL inputs.
 *
 * Works seamlessly across both reactive inputs (which re-render on `input`) and uncontrolled
 * form inputs (`PRESERVED_INPUT_IDS` / bottom-sheet forms) via `data-action="clear-input"`
 * and `data-target-input="<id>"`.
 */

import { escapeHtml } from '../../types/models.js';
import { t } from '../../config/i18n.js';
import { renderIcon } from '../icons.js';

/**
 * Renders an inline `×` clear button positioned at the trailing edge of a `relative` input wrapper.
 * Automatically starts hidden when `value` is empty and becomes visible as soon as text is present.
 *
 * @param {{
 *   targetId: string,
 *   value?: string | number | null,
 *   label?: string,
 *   lang?: string,
 *   compact?: boolean
 * }} params
 * @returns {string}
 */
export function renderInputClearButton({
  targetId,
  value = '',
  label,
  lang = 'en',
  compact = false,
}) {
  const hasValue = String(value ?? '').length > 0;
  const accessibleLabel = label || t(lang, 'common.clearText');
  const sizeClasses = compact ? 'right-1 w-6 h-6 rounded-md' : 'right-1.5 w-7 h-7 rounded-lg';

  return `<button
    type="button"
    data-action="clear-input"
    data-target-input="${escapeHtml(targetId)}"
    aria-label="${escapeHtml(accessibleLabel)}"
    title="${escapeHtml(accessibleLabel)}"
    class="${hasValue ? 'flex' : 'hidden'} absolute ${sizeClasses} top-1/2 -translate-y-1/2 items-center justify-center text-stone-ink/75 hover:text-forest-900 hover:bg-linen-200/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 transition-colors z-10 focus-visible:outline-2 focus-visible:outline-forest-700"
  >${renderIcon('close', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')}</button>`;
}
