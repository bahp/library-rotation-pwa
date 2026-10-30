/**
 * @fileoverview Shared reader avatar renderer, Top-Avatar Profile Switcher bottom sheet,
 * and slide-up Add / Edit Profile bottom-sheet form (`max-h-[85vh]`) with automatic DOB age computation.
 */

import {
  computeAgeFromBirthDate,
  escapeHtml,
  formatProfileAgeLabel,
  formatReadingStage,
  inferReadingStageFromAge,
} from '../../types/models.js';
import { renderIcon } from '../icons.js';

/** @type {Record<string, string>} */
export const AVATAR_TONES = {
  teal: 'bg-[#1F6E75] text-white',
  amber: 'bg-[#9A5B25] text-white',
  indigo: 'bg-[#2C4257] text-white',
  rose: 'bg-[#963E47] text-white',
};

/**
 * Renders a child reader's avatar badge with initial.
 * @param {import('../../types/models.js').ChildProfile} profile
 * @param {'sm' | 'md' | 'lg'} [size]
 * @returns {string}
 */
export function renderAvatarBadge(profile, size = 'md') {
  const toneClass = AVATAR_TONES[profile.avatarTone] || AVATAR_TONES.teal;
  const initial = (profile.name || '?').slice(0, 1).toUpperCase();
  const dims =
    size === 'sm'
      ? 'w-7 h-7 rounded-full text-xs'
      : size === 'lg'
        ? 'w-11 h-11 rounded-2xl text-lg'
        : 'w-9 h-9 rounded-full text-sm';

  return `
    <span class="inline-flex items-center justify-center font-display font-bold shrink-0 select-none ${dims} ${toneClass}" aria-hidden="true">
      ${escapeHtml(initial)}
    </span>
  `;
}

/**
 * Computes a sensible default `YYYY-MM-DD` date string N years ago for new profile creation.
 * @param {number} [yearsAgo]
 * @returns {string}
 */
export function getDefaultBirthDateYearsAgo(yearsAgo = 4) {
  const now = new Date();
  const y = now.getUTCFullYear() - yearsAgo;
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(Math.min(28, now.getUTCDate())).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Renders the Top-Avatar Profile Switcher bottom sheet.
 * Lets families switch active child in 1 tap, open the `+` Add Profile sheet, or view all profile details.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   isOpen: boolean
 * }} params
 * @returns {string}
 */
export function renderProfileSwitcherSheet({ state, isOpen }) {
  if (!isOpen) return '';

  const rowsHtml = state.profiles
    .map((profile) => {
      const selected = profile.id === state.activeProfileId;
      const ageLabel = formatProfileAgeLabel(profile);
      return `
        <button
          type="button"
          data-action="switch-profile"
          data-profile-id="${escapeHtml(profile.id)}"
          aria-pressed="${selected ? 'true' : 'false'}"
          class="w-full min-h-[56px] px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 text-left transition-colors ${
            selected
              ? 'bg-linen-100 dark:bg-night-800 border border-forest-700/40 dark:border-[#5ED3DA]/40'
              : 'hover:bg-linen-100/70 dark:hover:bg-night-800/70 border border-transparent'
          }"
        >
          <span class="flex items-center gap-3 min-w-0">
            ${renderAvatarBadge(profile, 'md')}
            <span class="min-w-0">
              <span class="block font-display text-base font-bold text-forest-900 dark:text-white truncate">
                ${escapeHtml(profile.name)}
              </span>
              <span class="block text-xs text-stone-ink dark:text-slate-400 truncate">
                ${escapeHtml(ageLabel)} · ${escapeHtml(formatReadingStage(profile.readingStage))}
              </span>
            </span>
          </span>
          <span class="shrink-0 text-forest-700 dark:text-[#5ED3DA]">
            ${selected ? renderIcon('check', 'w-5 h-5') : ''}
          </span>
        </button>
      `;
    })
    .join('');

  return `
    <div
      data-backdrop-action="close-profile-switcher"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-switcher-sheet-title"
        class="animate-sheet-up w-full max-w-md max-h-[82vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <div class="px-5 pt-3 pb-3 border-b border-linen-200 dark:border-night-700 flex items-center justify-between gap-3">
          <div>
            <h2 id="profile-switcher-sheet-title" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              Switch Reader
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400">
              Select whose shelf and rotations are shown
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-action="open-add-profile-sheet"
              aria-label="Add new reader profile"
              title="Add new reader profile"
              class="min-h-[44px] min-w-[44px] rounded-xl bg-forest-700 hover:bg-forest-800 text-white flex items-center justify-center transition-colors"
            >
              ${renderIcon('plus', 'w-5 h-5')}
            </button>
            <button
              type="button"
              data-action="close-profile-switcher"
              aria-label="Close reader switcher"
              class="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center transition-colors"
            >
              ${renderIcon('close', 'w-4 h-4')}
            </button>
          </div>
        </div>

        <div class="p-4 overflow-y-auto space-y-1.5 flex-1">
          ${rowsHtml}
        </div>

        <div class="px-5 py-3.5 border-t border-linen-200 dark:border-night-700 bg-linen-50/80 dark:bg-night-950/60 flex items-center justify-between gap-3">
          <button
            type="button"
            data-action="open-add-profile-sheet"
            class="min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors"
          >
            ${renderIcon('plus', 'w-4 h-4')}
            New Profile
          </button>
          <a
            href="#/profiles"
            data-action="close-profile-switcher"
            class="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] inline-flex items-center gap-1 hover:underline"
          >
            Profile Details
            ${renderIcon('chevronRight', 'w-4 h-4')}
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders the slide-up Add / Edit Reader Profile bottom sheet (`max-h-[85vh]`).
 * Uses most of the screen height while leaving backdrop visible for easy dismissal.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   isOpen: boolean,
 *   editingProfileId?: string | null,
 *   previewBirthDate?: string
 * }} params
 * @returns {string}
 */
export function renderProfileFormSheet({
  state,
  isOpen,
  editingProfileId = null,
  previewBirthDate,
}) {
  if (!isOpen) return '';

  const editingProfile = editingProfileId
    ? state.profiles.find((p) => p.id === editingProfileId) || null
    : null;

  const defaultDob =
    previewBirthDate !== undefined
      ? previewBirthDate
      : editingProfile?.birthDate ||
        getDefaultBirthDateYearsAgo(editingProfile ? editingProfile.age : 3);

  const todayIso = new Date().toISOString().slice(0, 10);
  const computedAge = computeAgeFromBirthDate(defaultDob);
  const agePreviewLabel =
    computedAge !== null
      ? formatProfileAgeLabel({ age: computedAge, birthDate: defaultDob })
      : editingProfile
        ? `Age ${editingProfile.age}`
        : 'Set birth date';

  const defaultStage =
    editingProfile?.readingStage ||
    (computedAge !== null ? inferReadingStageFromAge(computedAge) : 'picture-book');
  const defaultTone = editingProfile?.avatarTone || 'teal';
  const defaultSize = editingProfile?.defaultRotationSize ?? 5;
  const defaultCooldown = editingProfile?.cooldownDays ?? 14;
  const defaultTopics = editingProfile ? editingProfile.favoriteTopics.join(', ') : '';

  return `
    <div
      data-backdrop-action="close-profile-form-sheet"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-form-sheet-title"
        class="animate-sheet-up w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <div class="px-5 pt-3 pb-3.5 border-b border-linen-200 dark:border-night-700 flex items-start justify-between gap-3">
          <div>
            <h2 id="profile-form-sheet-title" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              ${editingProfile ? `Edit ${escapeHtml(editingProfile.name)}’s Profile` : 'Add Reader Profile'}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Enter date of birth to keep age and book recommendations updated automatically.
            </p>
          </div>
          <button
            type="button"
            data-action="close-profile-form-sheet"
            aria-label="Close profile form"
            class="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center shrink-0"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <form
          id="add-profile-form"
          ${editingProfile ? `data-editing-profile-id="${escapeHtml(editingProfile.id)}"` : ''}
          class="flex-1 overflow-y-auto p-5 space-y-4"
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label for="profile-name" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Child’s Name *
              </label>
              <input
                id="profile-name"
                name="name"
                type="text"
                required
                value="${escapeHtml(editingProfile?.name || '')}"
                placeholder="e.g., Clara"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <div class="flex items-baseline justify-between gap-2 mb-1">
                <label for="profile-birth-date" class="text-xs font-semibold text-forest-900 dark:text-slate-200">
                  Date of Birth *
                </label>
                <span id="profile-computed-age-badge" class="text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] font-mono-tabular">
                  ${escapeHtml(agePreviewLabel)}
                </span>
              </div>
              <input
                id="profile-birth-date"
                name="birthDate"
                type="date"
                required
                max="${todayIso}"
                value="${escapeHtml(defaultDob)}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="profile-stage" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Reading Stage
              </label>
              <select
                id="profile-stage"
                name="readingStage"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="board-toddler" ${defaultStage === 'board-toddler' ? 'selected' : ''}>Board & Toddler</option>
                <option value="picture-book" ${defaultStage === 'picture-book' ? 'selected' : ''}>Picture Book</option>
                <option value="early-reader" ${defaultStage === 'early-reader' ? 'selected' : ''}>Early Reader</option>
                <option value="chapter-book" ${defaultStage === 'chapter-book' ? 'selected' : ''}>Chapter Book</option>
              </select>
            </div>

            <div>
              <label for="profile-tone" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Avatar Color
              </label>
              <select
                id="profile-tone"
                name="avatarTone"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="teal" ${defaultTone === 'teal' ? 'selected' : ''}>Forest Teal</option>
                <option value="amber" ${defaultTone === 'amber' ? 'selected' : ''}>Warm Bronze</option>
                <option value="indigo" ${defaultTone === 'indigo' ? 'selected' : ''}>Deep Slate</option>
                <option value="rose" ${defaultTone === 'rose' ? 'selected' : ''}>Berry Rose</option>
              </select>
            </div>

            <div>
              <label for="profile-size" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Books per Rotation
              </label>
              <input
                id="profile-size"
                name="defaultRotationSize"
                type="number"
                min="2"
                max="15"
                value="${defaultSize}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="profile-cooldown" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Cooldown (days)
              </label>
              <input
                id="profile-cooldown"
                name="cooldownDays"
                type="number"
                min="0"
                max="90"
                value="${defaultCooldown}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="profile-topics" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Favorite Topics (comma-separated)
              </label>
              <input
                id="profile-topics"
                name="favoriteTopics"
                type="text"
                value="${escapeHtml(defaultTopics)}"
                placeholder="dinosaurs, music, bedtime, winter"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              data-action="close-profile-form-sheet"
              class="min-h-[46px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 sm:flex-initial min-h-[46px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              ${editingProfile ? 'Save Changes' : 'Create Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}
