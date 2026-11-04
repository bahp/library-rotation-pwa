/**
 * @fileoverview Reader Profiles management page (`#/profiles`):
 * - Displays all reader profiles with DOB (`birthDate`), automatically computed age,
 *   reading stage, favorite topics, rotation defaults, and read history counts
 * - Compact `+` button (`open-add-profile-sheet`) opens the Add / Edit Profile bottom sheet (`max-h-[85vh]`)
 */

import { normalizeLanguage, t } from '../../config/index.js';
import {
  escapeHtml,
  formatProfileAgeLabel,
  formatReadingStage,
} from '../../types/models.js';
import {
  renderAvatarBadge,
  renderProfileFormSheet,
} from '../../ui/components/profile-sheets.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * Renders the Reader Profiles management view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   profilesUiState?: {
 *     isFormOpen: boolean,
 *     editingProfileId: string | null,
 *     previewBirthDate?: string
 *   }
 * }} params
 * @returns {string}
 */
export function renderProfilesView({
  state,
  profilesUiState = { isFormOpen: false, editingProfileId: null },
}) {
  const cardsHtml = state.profiles
    .map((profile) => {
      const isActive = profile.id === state.activeProfileId;
      const savedCount = state.rotations.filter((r) => r.profileId === profile.id).length;
      const ageLabel = formatProfileAgeLabel(profile);

      return `
        <article class="rounded-2xl bg-ivory dark:bg-night-900 border ${
          isActive
            ? 'border-forest-700/45 dark:border-[#5ED3DA]/40'
            : 'border-linen-200 dark:border-night-800'
        } p-4 sm:p-5 flex flex-col justify-between gap-3.5">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              ${renderAvatarBadge(profile, 'lg')}
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <h2 class="font-display text-lg font-bold text-forest-900 dark:text-white truncate">
                    ${escapeHtml(profile.name)}
                  </h2>
                  ${
                    isActive
                      ? '<span class="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]">· Current Reader</span>'
                      : ''
                  }
                </div>

                <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                  <span class="font-semibold text-forest-900 dark:text-slate-200">${escapeHtml(ageLabel)}</span>
                  ${
                    profile.birthDate
                      ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">DOB ${escapeHtml(
                          profile.birthDate
                        )}</span>`
                      : ''
                  }
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(formatReadingStage(profile.readingStage))}</span>
                </div>

                <p class="text-xs text-stone-ink dark:text-slate-300 mt-1.5">
                  Topics: ${
                    profile.favoriteTopics.length
                      ? escapeHtml(profile.favoriteTopics.join(' · '))
                      : 'All topics'
                  }
                </p>
                <p class="text-[11px] text-stone-ink dark:text-slate-400 font-mono-tabular mt-1">
                  ${profile.defaultRotationSize} books/shelf · ${profile.cooldownDays}d cooldown · ${savedCount} ${
                    savedCount === 1 ? 'shelf' : 'shelves'
                  } · ${profile.readHistoryBookIds.length} read
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-action="open-edit-profile-sheet"
                data-profile-id="${escapeHtml(profile.id)}"
                aria-label="Edit profile ${escapeHtml(profile.name)}"
                title="Edit profile"
                class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 transition-colors"
              >
                ${renderIcon('edit', 'w-4 h-4')}
              </button>
              ${
                state.profiles.length > 1
                  ? `
                    <button
                      type="button"
                      data-action="delete-profile"
                      data-profile-id="${escapeHtml(profile.id)}"
                      aria-label="Remove profile ${escapeHtml(profile.name)}"
                      class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-ink hover:text-rose-700 hover:bg-rose-50 dark:text-slate-400 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      ${renderIcon('trash', 'w-4 h-4')}
                    </button>
                  `
                  : ''
              }
            </div>
          </div>

          <div class="pt-2.5 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-end gap-2">
            ${
              isActive
                ? `
                  <a
                    href="#/home"
                    class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center justify-center transition-colors whitespace-nowrap"
                  >
                    View ${escapeHtml(profile.name)}’s Shelf
                  </a>
                `
                : `
                  <button
                    type="button"
                    data-action="switch-profile"
                    data-profile-id="${escapeHtml(profile.id)}"
                    class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    Switch to ${escapeHtml(profile.name)}
                  </button>
                `
            }
          </div>
        </article>
      `;
    })
    .join('');

  const lang = normalizeLanguage(state.settings?.language);
  return `
    <div class="w-full space-y-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            ${escapeHtml(lang === 'en' ? 'Family Readers' : t(lang, 'profiles.eyebrow'))}
          </p>
          <h1 id="profiles-heading" class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5">
            ${escapeHtml(t(lang, 'profiles.heading'))}
          </h1>
        </div>

        <button
          type="button"
          data-action="open-add-profile-sheet"
          aria-label="Add reader profile"
          title="Add reader profile"
          class="min-h-[44px] min-w-[44px] px-3 rounded-2xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          ${renderIcon('plus', 'w-5 h-5')}
          <span class="hidden sm:inline">${escapeHtml(lang === 'en' ? 'Add Profile' : t(lang, 'profiles.newReader'))}</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        ${cardsHtml}
      </div>

      ${renderProfileFormSheet({
        state,
        isOpen: profilesUiState.isFormOpen,
        editingProfileId: profilesUiState.editingProfileId,
        previewBirthDate: profilesUiState.previewBirthDate,
      })}
    </div>
  `;
}
