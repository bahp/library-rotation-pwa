/**
 * @fileoverview Rotations view: View active & saved shelves per child profile,
 * check off books read together, switch active shelf, or generate a starter shelf.
 */

import { escapeHtml, formatBookBinding } from '../../types/models.js';
import { renderBookCover } from '../../ui/components/book-cover.js';

/**
 * Renders the Rotations view markup.
 * @param {{ state: import('../../types/models.js').AppState }} params
 * @returns {string}
 */
export function renderRotationsView({ state }) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

  const profileRotations = state.rotations.filter((r) => r.profileId === activeProfile.id);
  const bookMap = new Map(state.books.map((b) => [b.id, b]));

  const profileTabsHtml = state.profiles
    .map((p) => {
      const selected = p.id === activeProfile.id;
      return `
        <button
          type="button"
          data-action="switch-profile"
          data-profile-id="${escapeHtml(p.id)}"
          class="min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            selected
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(p.name)}’s Shelves
        </button>
      `;
    })
    .join('');

  const rotationsListHtml =
    profileRotations.length > 0
      ? profileRotations
          .map((rot) => {
            const books = rot.bookIds
              .map((id) => bookMap.get(id))
              .filter(/** @returns {b is import('../../types/models.js').Book} */ (b) => Boolean(b));
            const isActive = rot.status === 'active';

            return `
              <article class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
                <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span class="${
                        isActive ? 'font-semibold text-teal-700 dark:text-teal-400' : ''
                      }">${isActive ? 'Active Shelf' : 'Saved Rotation'}</span>
                      <span aria-hidden="true">·</span>
                      <span class="font-mono-tabular">${books.length} books</span>
                      ${
                        rot.rules.seed
                          ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">Seed: ${escapeHtml(
                              rot.rules.seed
                            )}</span>`
                          : ''
                      }
                    </div>
                    <h2 class="font-display text-xl font-bold text-slate-900 dark:text-white mt-1">
                      ${escapeHtml(rot.title)}
                    </h2>
                    <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                      ${escapeHtml(rot.rules.objective)}
                    </p>
                  </div>

                  ${
                    !isActive
                      ? `
                        <button
                          type="button"
                          data-action="activate-rotation"
                          data-rotation-id="${escapeHtml(rot.id)}"
                          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-900 dark:text-white transition-colors whitespace-nowrap shrink-0"
                        >
                          Make Active Shelf
                        </button>
                      `
                      : ''
                  }
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  ${books
                    .map(
                      (book) => `
                        <div class="flex items-center gap-3 min-w-0">
                          ${renderBookCover(book, 'sm')}
                          <div class="min-w-0">
                            <h3 class="font-display text-sm font-semibold text-slate-900 dark:text-white truncate">
                              ${escapeHtml(book.title)}
                            </h3>
                            <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
                              ${escapeHtml(book.authors.join(', '))}
                            </p>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Ages ${book.ageMin}–${book.ageMax} <span aria-hidden="true">·</span> ${escapeHtml(
                                formatBookBinding(book.format)
                              )}
                            </p>
                          </div>
                        </div>
                      `
                    )
                    .join('')}
                </div>
              </article>
            `;
          })
          .join('')
      : `
        <div class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-8 text-center">
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            No rotations saved for ${escapeHtml(activeProfile.name)} yet.
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Use the form on this page to assemble a starter shelf from your family catalog.
          </p>
        </div>
      `;

  return `
    <div class="space-y-8">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
            Book Rotations
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Curate manageable shelves per child to keep reading fresh without overwhelming bookcases.
          </p>
        </div>
        <div class="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
          ${profileTabsHtml}
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <!-- Rotation Lists -->
        <div class="lg:col-span-8 space-y-5">
          ${rotationsListHtml}
        </div>

        <!-- Quick Starter Shelf Creator -->
        <aside class="lg:col-span-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
          <h2 class="font-display text-lg font-bold text-slate-900 dark:text-white">
            New Shelf for ${escapeHtml(activeProfile.name)}
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Picks age-matched books from your catalog. Advanced cooldown, deterministic seed, and single-book swap controls expand in Phase 4.
          </p>

          <form id="starter-rotation-form" class="mt-4 space-y-4">
            <div>
              <label for="rot-title" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Shelf Title
              </label>
              <input
                id="rot-title"
                name="title"
                type="text"
                required
                placeholder="${escapeHtml(activeProfile.name)}’s Rainy Weekend Shelf"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="rot-objective" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Rotation Objective
              </label>
              <input
                id="rot-objective"
                name="objective"
                type="text"
                placeholder="e.g., Cozy nature + bedtime favorites"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <div>
              <label for="rot-count" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Number of Books
              </label>
              <input
                id="rot-count"
                name="count"
                type="number"
                min="1"
                max="12"
                value="${activeProfile.defaultRotationSize}"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>

            <button
              type="submit"
              class="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Generate Starter Shelf
            </button>
          </form>
        </aside>
      </div>
    </div>
  `;
}
