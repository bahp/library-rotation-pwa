/**
 * @fileoverview Dedicated Collection Presets & Deterministic Seed Generators View (`#/presets`):
 * - Displays all pre-configured seasonal, holiday, cultural milestone, and anytime collection defaults
 * - Shows exact days until each suggested `MM-DD` start date (`Suggested today`, `In X days · MMM D`, or `Anytime`)
 * - Surfaces the Start-Date Match Alert Banner when today's month & day matches a preset
 * - Generates a rotation shelf for the active reader in one tap from the user's library
 * - Includes a slide-up sheet to add, customize, edit, or delete user-defined presets
 */

import {
  escapeHtml,
  formatBookBinding,
  formatProfileAgeLabel,
} from '../../types/models.js';
import { renderIcon } from '../../ui/icons.js';
import {
  PRESET_MONTH_NAMES,
  computePresetStartSchedule,
  countMatchingCatalogBooksForPreset,
  getAllRotationPresets,
  normalizeMonthDay,
  renderPresetStartDateAlertBanner,
} from './rotation-presets.js';

/**
 * @typedef {'all' | 'upcoming' | 'seasonal-holidays' | 'calendar-events' | 'evergreen' | 'custom'} PresetFilterId
 */

/**
 * @typedef {Object} PresetsUiState
 * @property {PresetFilterId} categoryFilter
 * @property {string} searchQuery
 * @property {boolean} isFormOpen
 * @property {string | null} editingPresetId - Populated only when editing an existing custom preset in place
 * @property {Partial<import('../../types/models.js').RotationPreset> | null} formDraft
 * @property {string} formError
 */

/**
 * Creates a clean initial UI state slice for `#/presets`.
 * @returns {PresetsUiState}
 */
export function createDefaultPresetsUiState() {
  return {
    categoryFilter: 'all',
    searchQuery: '',
    isFormOpen: false,
    editingPresetId: null,
    formDraft: null,
    formError: '',
  };
}

/**
 * Formats a `PresetCategory` into concise editorial prose.
 * @param {import('../../types/models.js').PresetCategory} category
 * @returns {string}
 */
function formatPresetCategory(category) {
  switch (category) {
    case 'seasonal-holidays':
      return 'Seasonal & Holidays';
    case 'calendar-events':
      return 'Calendar Milestone';
    case 'evergreen':
    default:
      return 'Everyday & Anytime';
  }
}

/**
 * Formats a preset's binding preference (`any` vs specific format).
 * @param {import('../../types/models.js').BookFormat | 'any' | undefined} fmt
 * @returns {string}
 */
function formatBindingRule(fmt) {
  if (!fmt || fmt === 'any') return 'Any binding';
  return `${formatBookBinding(fmt)} preferred`;
}

/**
 * Renders the slide-up bottom sheet to create or edit a pre-configured collection preset.
 * @param {{
 *   presetsUiState: PresetsUiState
 * }} params
 * @returns {string}
 */
function renderPresetFormSheet({ presetsUiState }) {
  if (!presetsUiState.isFormOpen) return '';

  const draft = presetsUiState.formDraft || {};
  const isEditingExisting = Boolean(presetsUiState.editingPresetId);

  const parsedMd = normalizeMonthDay(draft.suggestedStartMonthDay);
  const selectedMonth =
    parsedMd.valid && parsedMd.month ? String(parsedMd.month).padStart(2, '0') : '';
  const selectedDay = parsedMd.valid && parsedMd.day ? String(parsedMd.day) : '';

  const currentCategory = draft.category || 'seasonal-holidays';
  const currentFormat = draft.requiredFormat || 'any';
  const tagsValue = Array.isArray(draft.preferredTags) ? draft.preferredTags.join(', ') : '';
  const countValue = draft.count ?? 5;
  const swapValue = draft.swapDays ?? 14;
  const cooldownValue = draft.cooldownDays ?? 21;
  const varietyChecked = draft.varietyMix !== false;

  const monthOptionsHtml = [
    `<option value="" ${selectedMonth === '' ? 'selected' : ''}>Anytime (No suggested date)</option>`,
    ...PRESET_MONTH_NAMES.map((name, idx) => {
      const val = String(idx + 1).padStart(2, '0');
      return `<option value="${val}" ${selectedMonth === val ? 'selected' : ''}>${escapeHtml(name)}</option>`;
    }),
  ].join('');

  return `
    <div
      data-backdrop-action="close-preset-form-sheet"
      class="sheet-backdrop fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preset-form-sheet-title"
    >
      <div class="animate-sheet-up w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden">
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <div class="px-5 pt-3 pb-3.5 border-b border-linen-200 dark:border-night-700 flex items-start justify-between gap-3">
          <div>
            <h2 id="preset-form-sheet-title" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              ${isEditingExisting ? 'Edit Collection Preset' : 'New Collection Preset'}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Save reusable rules, deterministic seed, and optional annual start date (month & day).
            </p>
          </div>
          <button
            type="button"
            data-action="close-preset-form-sheet"
            aria-label="Close preset form"
            class="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center shrink-0"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <form id="rotation-preset-form" class="flex-1 overflow-y-auto p-5 space-y-3.5">
          ${
            presetsUiState.formError
              ? `<p role="alert" class="text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-3.5 py-2.5">${escapeHtml(
                  presetsUiState.formError
                )}</p>`
              : ''
          }

          <div>
            <label for="preset-title" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Collection Name
            </label>
            <input
              id="preset-title"
              name="title"
              type="text"
              required
              value="${escapeHtml(draft.title || '')}"
              placeholder="e.g., Lunar New Year & Lanterns"
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div>
            <label for="preset-description" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Description & Selection Objective
            </label>
            <input
              id="preset-description"
              name="description"
              type="text"
              required
              value="${escapeHtml(draft.description || '')}"
              placeholder="Books celebrating lanterns, family feasts, dragons, and new beginnings."
              class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="preset-category" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Category
              </label>
              <select
                id="preset-category"
                name="category"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="seasonal-holidays" ${currentCategory === 'seasonal-holidays' ? 'selected' : ''}>Seasonal & Holidays</option>
                <option value="calendar-events" ${currentCategory === 'calendar-events' ? 'selected' : ''}>Calendar Milestone</option>
                <option value="evergreen" ${currentCategory === 'evergreen' ? 'selected' : ''}>Everyday (Anytime)</option>
              </select>
            </div>

            <div>
              <label for="preset-tags" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Topic Preferences (comma-separated)
              </label>
              <input
                id="preset-tags"
                name="preferredTags"
                type="text"
                value="${escapeHtml(tagsValue)}"
                placeholder="holidays, family, food"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <div class="col-span-2">
              <label for="preset-start-month" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Suggested Start Month (optional)
              </label>
              <select
                id="preset-start-month"
                name="suggestedMonth"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                ${monthOptionsHtml}
              </select>
            </div>

            <div>
              <label for="preset-start-day" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Day (1–31)
              </label>
              <input
                id="preset-start-day"
                name="suggestedDay"
                type="number"
                min="1"
                max="31"
                value="${escapeHtml(selectedDay)}"
                placeholder="—"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label for="preset-count" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Book Count
              </label>
              <input
                id="preset-count"
                name="count"
                type="number"
                min="1"
                max="15"
                value="${escapeHtml(countValue)}"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="preset-swap-days" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Swap Cycle (d)
              </label>
              <input
                id="preset-swap-days"
                name="swapDays"
                type="number"
                min="1"
                max="90"
                value="${escapeHtml(swapValue)}"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="preset-cooldown" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Cooldown (d)
              </label>
              <input
                id="preset-cooldown"
                name="cooldownDays"
                type="number"
                min="0"
                max="90"
                value="${escapeHtml(cooldownValue)}"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label for="preset-format" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Binding Preference
              </label>
              <select
                id="preset-format"
                name="requiredFormat"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="any" ${currentFormat === 'any' ? 'selected' : ''}>Any Binding</option>
                <option value="hardcover" ${currentFormat === 'hardcover' ? 'selected' : ''}>Hardcover Preferred</option>
                <option value="board-book" ${currentFormat === 'board-book' ? 'selected' : ''}>Board Book Preferred</option>
                <option value="paperback" ${currentFormat === 'paperback' ? 'selected' : ''}>Paperback Preferred</option>
              </select>
            </div>

            <div>
              <label for="preset-seed" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Deterministic Seed
              </label>
              <input
                id="preset-seed"
                name="seed"
                type="text"
                value="${escapeHtml(draft.seed || '')}"
                placeholder="Auto-generated if left blank"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <label class="flex items-start gap-2.5 text-xs text-forest-900 dark:text-slate-300 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              name="varietyMix"
              ${varietyChecked ? 'checked' : ''}
              class="mt-0.5 h-4 w-4 rounded accent-[#1F6E75]"
            />
            <span>
              <strong class="font-semibold">Enforce author & topic variety</strong>
              <span class="block text-stone-ink dark:text-slate-400">Balances authors and bindings across the generated shelf.</span>
            </span>
          </label>

          <div class="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              data-action="close-preset-form-sheet"
              class="min-h-[46px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 sm:flex-initial min-h-[46px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              ${isEditingExisting ? 'Save Preset Changes' : 'Save Preset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renders the dedicated Collection Presets & Seed Generators page (`#/presets`).
 *
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   presetsUiState?: PresetsUiState,
 *   dismissedPresetAlertKeys?: string[],
 *   referenceDate?: Date | string | number
 * }} params
 * @returns {string}
 */
export function renderPresetsView({
  state,
  presetsUiState = createDefaultPresetsUiState(),
  dismissedPresetAlertKeys = [],
  referenceDate = new Date(),
}) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const ageLabel = formatProfileAgeLabel(activeProfile, /** @type {any} */ (referenceDate));
  const activeRotation =
    state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') || null;

  const allPresets = getAllRotationPresets(state);
  const startDateAlertHtml = renderPresetStartDateAlertBanner({
    presets: allPresets,
    activeProfile,
    activeRotation,
    dismissedAlertKeys: dismissedPresetAlertKeys,
    referenceDate,
    showBrowseLink: false,
  });

  const enrichedPresets = allPresets.map((preset) => ({
    preset,
    schedule: computePresetStartSchedule(preset, referenceDate),
    matchInfo: countMatchingCatalogBooksForPreset(state.books, preset),
  }));

  const q = (presetsUiState.searchQuery || '').trim().toLowerCase();
  const filterId = presetsUiState.categoryFilter || 'all';

  let visible = enrichedPresets.filter(({ preset, schedule }) => {
    if (filterId === 'upcoming' && !schedule.hasSuggestedStart) return false;
    if (filterId === 'seasonal-holidays' && preset.category !== 'seasonal-holidays') return false;
    if (filterId === 'calendar-events' && preset.category !== 'calendar-events') return false;
    if (filterId === 'evergreen' && preset.category !== 'evergreen') return false;
    if (filterId === 'custom' && !preset.isCustom) return false;

    if (q) {
      const hay = `${preset.title} ${preset.description} ${preset.preferredTags.join(' ')} ${preset.seed}`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  // Sort dated presets by soonest upcoming start date first, followed by anytime presets alphabetically
  visible = [...visible].sort((a, b) => {
    if (a.schedule.daysUntilStart !== null && b.schedule.daysUntilStart !== null) {
      if (a.schedule.daysUntilStart !== b.schedule.daysUntilStart) {
        return a.schedule.daysUntilStart - b.schedule.daysUntilStart;
      }
      return a.preset.title.localeCompare(b.preset.title);
    }
    if (a.schedule.daysUntilStart !== null) return -1;
    if (b.schedule.daysUntilStart !== null) return 1;
    return a.preset.title.localeCompare(b.preset.title);
  });

  /** @type {Array<{ id: PresetFilterId, label: string }>} */
  const filterTabs = [
    { id: 'all', label: `All (${allPresets.length})` },
    { id: 'upcoming', label: 'Dated Calendar' },
    { id: 'seasonal-holidays', label: 'Seasonal & Holidays' },
    { id: 'calendar-events', label: 'Milestones' },
    { id: 'evergreen', label: 'Anytime' },
    { id: 'custom', label: 'Custom' },
  ];

  const filterBarHtml = filterTabs
    .map((tab) => {
      const active = filterId === tab.id;
      return `
        <button
          type="button"
          data-action="set-preset-category-filter"
          data-preset-filter="${tab.id}"
          aria-pressed="${active ? 'true' : 'false'}"
          class="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            active
              ? 'bg-forest-900 text-ivory dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs'
              : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(tab.label)}
        </button>
      `;
    })
    .join('');

  const cardsHtml =
    visible.length > 0
      ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          ${visible
            .map(({ preset, schedule, matchInfo }) => {
              const countdownText = schedule.isStartToday
                ? `Suggested today · ${schedule.formattedDateLabel}`
                : schedule.hasSuggestedStart
                  ? `${schedule.daysUntilStart} ${schedule.daysUntilStart === 1 ? 'day' : 'days'} until ${schedule.formattedDateLabel}`
                  : 'Anytime · No fixed start date';

              const topicsSummary =
                preset.preferredTags.length > 0 ? preset.preferredTags.join(' · ') : 'all themes';

              return `
                <article
                  data-preset-card="${escapeHtml(preset.id)}"
                  class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 flex flex-col justify-between gap-3.5"
                >
                  <div class="space-y-1.5">
                    <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-mono-tabular">
                      <span
                        data-preset-countdown="${escapeHtml(preset.id)}"
                        class="${
                          schedule.isStartToday
                            ? 'font-bold text-espresso-800 dark:text-[#5ED3DA]'
                            : schedule.hasSuggestedStart &&
                                schedule.daysUntilStart !== null &&
                                schedule.daysUntilStart <= 14
                              ? 'font-semibold text-forest-700 dark:text-[#5ED3DA]'
                              : 'text-stone-ink dark:text-slate-400'
                        }"
                      >${escapeHtml(countdownText)}</span>
                      <span aria-hidden="true" class="text-stone-ink/60 dark:text-slate-500">·</span>
                      <span class="font-sans text-stone-ink dark:text-slate-400">${escapeHtml(
                        formatPresetCategory(preset.category)
                      )}</span>
                      ${
                        preset.isCustom
                          ? `<span aria-hidden="true" class="text-stone-ink/60 dark:text-slate-500">·</span><span class="font-sans font-semibold text-forest-700 dark:text-[#5ED3DA]">Custom</span>`
                          : ''
                      }
                    </div>

                    <h2 class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white leading-snug">
                      ${escapeHtml(preset.title)}
                    </h2>

                    <p class="text-xs sm:text-[13px] text-stone-ink dark:text-slate-300 leading-relaxed">
                      ${escapeHtml(preset.description)}
                    </p>
                  </div>

                  <div class="pt-2.5 border-t border-linen-200/80 dark:border-night-800 space-y-2.5">
                    <div class="space-y-1 text-[11px] text-stone-ink dark:text-slate-400">
                      <p class="font-mono-tabular">
                        ${preset.count} ${preset.count === 1 ? 'book' : 'books'} · ${preset.swapDays}d swap · ${preset.cooldownDays}d cooldown · ${escapeHtml(
                          formatBindingRule(preset.requiredFormat)
                        )}
                      </p>
                      <p class="truncate">
                        <span class="font-semibold text-forest-900 dark:text-slate-200">Topics:</span>
                        ${escapeHtml(topicsSummary)}
                      </p>
                      <p class="font-mono-tabular truncate">
                        <span>Seed: ${escapeHtml(preset.seed)}</span>
                        <span aria-hidden="true"> · </span>
                        <span>${matchInfo.thematicMatchCount} theme ${
                          matchInfo.thematicMatchCount === 1 ? 'match' : 'matches'
                        } in ${matchInfo.rotatableTotalCount} shelf books</span>
                      </p>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        data-action="apply-rotation-preset"
                        data-preset-id="${escapeHtml(preset.id)}"
                        ${matchInfo.rotatableTotalCount === 0 ? 'disabled title="Add books to your library first"' : ''}
                        class="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        ${renderIcon('rotations', 'w-3.5 h-3.5')}
                        Generate for ${escapeHtml(activeProfile.name)}
                      </button>

                      <div class="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-action="customize-rotation-preset"
                          data-preset-id="${escapeHtml(preset.id)}"
                          class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                          Clone &amp; Tweak
                        </button>
                        ${
                          preset.isCustom
                            ? `
                              <button
                                type="button"
                                data-action="edit-rotation-preset"
                                data-preset-id="${escapeHtml(preset.id)}"
                                aria-label="Edit ${escapeHtml(preset.title)}"
                                class="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                              >
                                ${renderIcon('edit', 'w-3.5 h-3.5')}
                                Edit
                              </button>
                              <button
                                type="button"
                                data-action="delete-rotation-preset"
                                data-preset-id="${escapeHtml(preset.id)}"
                                aria-label="Delete ${escapeHtml(preset.title)}"
                                class="min-h-[40px] min-w-[40px] rounded-xl text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors"
                              >
                                ${renderIcon('trash', 'w-3.5 h-3.5')}
                              </button>
                            `
                            : ''
                        }
                      </div>
                    </div>
                  </div>
                </article>
              `;
            })
            .join('')}
        </div>
      `
      : `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-6 text-center">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            No collection presets match this filter
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-1">
            Create your own custom seasonal or family tradition preset with + New Preset.
          </p>
        </div>
      `;

  return `
    <div class="space-y-4">
      <div class="flex items-start justify-between gap-3 pb-2.5 border-b border-linen-200/90 dark:border-night-800">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5 text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            <a href="#/rotations" class="hover:underline">← Book Rotations</a>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(activeProfile.name)} (${escapeHtml(ageLabel)})</span>
          </div>
          <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5">
            Collection Presets
          </h1>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5 max-w-2xl">
            Pre-configured seasonal traditions, calendar events, and anytime seed generators built automatically from your library.
          </p>
        </div>

        <button
          type="button"
          data-action="open-preset-form-sheet"
          aria-label="Add new collection preset"
          class="min-h-[44px] px-3.5 py-2 rounded-2xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 whitespace-nowrap"
        >
          ${renderIcon('plus', 'w-4 h-4')}
          <span>New Preset</span>
        </button>
      </div>

      ${startDateAlertHtml}

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-1 p-1 rounded-2xl bg-linen-100/90 dark:bg-night-900 border border-linen-200/80 dark:border-night-800 overflow-x-auto">
          ${filterBarHtml}
        </div>

        <div class="relative sm:w-64 shrink-0">
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-ink dark:text-slate-400 pointer-events-none">
            ${renderIcon('search', 'w-4 h-4')}
          </span>
          <input
            id="presets-search-input"
            type="search"
            aria-label="Search collection presets"
            value="${escapeHtml(presetsUiState.searchQuery)}"
            placeholder="Search traditions, tags, seeds…"
            class="w-full h-12 pl-10 pr-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
          />
        </div>
      </div>

      ${cardsHtml}

      ${renderPresetFormSheet({ presetsUiState })}
    </div>
  `;
}
