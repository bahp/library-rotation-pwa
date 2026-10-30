/**
 * @fileoverview Profiles view: Manage multiple child profiles with independent ages,
 * reading stages, favorite topics, rotation sizes, and cooldown preferences.
 */

import { escapeHtml, formatReadingStage } from '../../types/models.js';
import { renderIcon } from '../../ui/icons.js';

/** @type {Record<string, string>} */
const AVATAR_TONES = {
  teal: 'bg-teal-700 text-white',
  amber: 'bg-amber-700 text-white',
  indigo: 'bg-slate-800 text-white',
  rose: 'bg-rose-700 text-white',
};

/**
 * Renders the Reader Profiles view markup.
 * @param {{ state: import('../../types/models.js').AppState }} params
 * @returns {string}
 */
export function renderProfilesView({ state }) {
  const cardsHtml = state.profiles
    .map((profile) => {
      const isActive = profile.id === state.activeProfileId;
      const savedCount = state.rotations.filter((r) => r.profileId === profile.id).length;
      const avatarStyle = AVATAR_TONES[profile.avatarTone] || AVATAR_TONES.teal;
      const initial = profile.name.slice(0, 1).toUpperCase();

      return `
        <article class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 flex flex-col justify-between gap-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3.5 min-w-0">
              <div class="w-11 h-11 rounded-xl ${avatarStyle} flex items-center justify-center font-display text-lg font-bold shrink-0">
                ${escapeHtml(initial)}
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
                    ${escapeHtml(profile.name)}
                  </h2>
                  ${
                    isActive
                      ? '<span class="text-xs font-semibold text-teal-700 dark:text-teal-400">· Active Reader</span>'
                      : ''
                  }
                </div>
                <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>Age ${profile.age}</span>
                  <span aria-hidden="true">·</span>
                  <span>${escapeHtml(formatReadingStage(profile.readingStage))}</span>
                  <span aria-hidden="true">·</span>
                  <span class="font-mono-tabular">${profile.defaultRotationSize} books/shelf</span>
                  <span aria-hidden="true">·</span>
                  <span class="font-mono-tabular">${profile.cooldownDays}d cooldown</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300 mt-2">
                  Favorite topics: ${
                    profile.favoriteTopics.length
                      ? escapeHtml(profile.favoriteTopics.join(' · '))
                      : 'All topics'
                  }
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400 font-mono-tabular mt-1">
                  ${savedCount} saved ${savedCount === 1 ? 'rotation' : 'rotations'} · ${
                    profile.readHistoryBookIds.length
                  } books in read history
                </p>
              </div>
            </div>

            ${
              state.profiles.length > 1
                ? `
                  <button
                    type="button"
                    data-action="delete-profile"
                    data-profile-id="${escapeHtml(profile.id)}"
                    aria-label="Remove profile ${escapeHtml(profile.name)}"
                    class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                  >
                    ${renderIcon('trash', 'w-4 h-4')}
                  </button>
                `
                : ''
            }
          </div>

          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            ${
              isActive
                ? `
                  <a
                    href="#/home"
                    class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center justify-center transition-colors whitespace-nowrap"
                  >
                    View ${escapeHtml(profile.name)}’s Shelf
                  </a>
                `
                : `
                  <button
                    type="button"
                    data-action="switch-profile"
                    data-profile-id="${escapeHtml(profile.id)}"
                    class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    Select ${escapeHtml(profile.name)}
                  </button>
                `
            }
          </div>
        </article>
      `;
    })
    .join('');

  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <section aria-labelledby="profiles-heading" class="lg:col-span-7 space-y-4">
        <div>
          <h1 id="profiles-heading" class="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Reader Profiles
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Each child has independent age targets, topic preferences, reading history, and saved rotations.
          </p>
        </div>

        <div class="space-y-4 pt-1">
          ${cardsHtml}
        </div>
      </section>

      <aside aria-labelledby="new-profile-heading" class="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <h2 id="new-profile-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
          Add Child Profile
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Set age, reading stage, and rotation defaults for another reader in your family.
        </p>

        <form id="add-profile-form" class="mt-4 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="profile-name" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Child’s Name *
              </label>
              <input
                id="profile-name"
                name="name"
                type="text"
                required
                placeholder="e.g., Clara"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="profile-age" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Age (years)
              </label>
              <input
                id="profile-age"
                name="age"
                type="number"
                min="0"
                max="15"
                value="3"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="profile-stage" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Reading Stage
              </label>
              <select
                id="profile-stage"
                name="readingStage"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              >
                <option value="board-toddler">Board & Toddler</option>
                <option value="picture-book" selected>Picture Book</option>
                <option value="early-reader">Early Reader</option>
                <option value="chapter-book">Chapter Book</option>
              </select>
            </div>

            <div>
              <label for="profile-tone" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Profile Color
              </label>
              <select
                id="profile-tone"
                name="avatarTone"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              >
                <option value="teal">Forest Teal</option>
                <option value="amber">Warm Ochre</option>
                <option value="indigo">Deep Slate</option>
                <option value="rose">Berry Rose</option>
              </select>
            </div>

            <div>
              <label for="profile-size" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Books per Rotation
              </label>
              <input
                id="profile-size"
                name="defaultRotationSize"
                type="number"
                min="2"
                max="15"
                value="5"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="profile-cooldown" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Cooldown (days)
              </label>
              <input
                id="profile-cooldown"
                name="cooldownDays"
                type="number"
                min="0"
                max="90"
                value="14"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="profile-topics" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Favorite Topics (comma-separated)
              </label>
              <input
                id="profile-topics"
                name="favoriteTopics"
                type="text"
                placeholder="dinosaurs, music, bedtime, construction"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>
          </div>

          <button
            type="submit"
            class="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Create Reader Profile
          </button>
        </form>
      </aside>
    </div>
  `;
}
