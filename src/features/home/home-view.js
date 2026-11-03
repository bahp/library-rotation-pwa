/**
 * @fileoverview Space-efficient, mobile-first Home Shelf view modeled after warm editorial bookshelf UX:
 * - Compact "Books in Rotation" header with shelf title and concise read/book summary (`X of Y read · Y Books`)
 * - 3-column mobile book cover grid (up to 6 columns on desktop) with overlaid read checkmarks
 *   and minimal Title + Author typography underneath
 * - Compact Saved Rotations strip & 1-line link to the dedicated Family Library (`#/library`)
 * - Shared slide-up Book Inspector sheet on book tap
 */

import {
  escapeHtml,
  isBookRotatable,
  normalizeCollectionStatus,
} from '../../types/models.js';
import { getProfileRecommendations } from '../tagging/recommendations.js';
import {
  getAllRotationPresets,
  renderPresetStartDateAlertBanner,
} from '../rotations/rotation-presets.js';
import {
  computeRotationSchedule,
  renderSwapDayAlertBanner,
} from '../rotations/rotation-schedule.js';
import { renderStaleBooksSpotlightBanner } from '../rotations/usage-insights.js';
import { renderPwaInstallBanner } from '../pwa/pwa-install-banner.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderBookInspectorModal } from '../../ui/components/book-inspector-modal.js';
import { renderOwnerBadgesStrip } from '../../ui/components/profile-sheets.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * Renders the compact Home Shelf view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   uiState: {
 *     catalogFilter: string,
 *     searchQuery: string,
 *     inspectedBookId: string | null,
 *     inspectorUi?: import('../../ui/components/book-inspector-modal.js').BookInspectorUiState,
 *     dismissedSwapReminderKeys?: string[],
 *     dismissedPresetAlertKeys?: string[],
 *     dismissedStaleSpotlightKeys?: string[],
 *     pwaBannerDismissed?: boolean
 *   },
 *   pwaStatus?: {
 *     isInstallable?: boolean,
 *     isInstalled?: boolean,
 *     isIOS?: boolean,
 *     promptReady?: boolean
 *   } | null,
 *   referenceDate?: Date | string | number
 * }} params
 * @returns {string}
 */
export function renderHomeView({
  state,
  uiState,
  pwaStatus = null,
  referenceDate = new Date(),
}) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const coverAspectRatio = state.settings.coverAspectRatio;
  const dynamicTint = state.settings.dynamicCoverTint !== false;

  const profileRotations = state.rotations.filter((r) => r.profileId === activeProfile.id);
  const activeRotation = profileRotations.find((r) => r.status === 'active') || null;
  const savedRotations = profileRotations.filter((r) => r.status !== 'active');
  const activeSchedule = activeRotation
    ? computeRotationSchedule(activeRotation, activeProfile, referenceDate)
    : null;

  const swapDayAlertHtml = renderSwapDayAlertBanner({
    rotation: activeRotation,
    profile: activeProfile,
    schedule: activeSchedule,
    dismissedReminderKeys: uiState.dismissedSwapReminderKeys || [],
  });

  const presetStartAlertHtml = renderPresetStartDateAlertBanner({
    presets: getAllRotationPresets(state),
    activeProfile,
    activeRotation,
    profileRotations,
    dismissedAlertKeys: uiState.dismissedPresetAlertKeys || [],
    daysBefore: state.settings.presetAlertDaysBefore ?? 2,
    daysAfter: state.settings.presetAlertDaysAfter ?? 5,
    referenceDate,
    showBrowseLink: true,
  });

  const staleSpotlightAlertHtml = renderStaleBooksSpotlightBanner({
    rotation: activeRotation,
    profile: activeProfile,
    books: state.books,
    staleBookDays: state.settings.staleBookDays ?? 10,
    enabled: state.settings.enableStaleBookSpotlight !== false,
    dismissedStaleKeys: uiState.dismissedStaleSpotlightKeys || [],
    referenceDate,
  });

  const pwaInstallAlertHtml = renderPwaInstallBanner({
    pwaStatus,
    dismissed: Boolean(uiState.pwaBannerDismissed),
  });

  const alertBanners = [
    presetStartAlertHtml,
    swapDayAlertHtml,
    staleSpotlightAlertHtml,
    pwaInstallAlertHtml,
  ].filter(Boolean);
  const alertsStackHtml =
    alertBanners.length > 0 ? `<div class="space-y-2">${alertBanners.join('')}</div>` : '';

  const bookMap = new Map(state.books.map((b) => [b.id, b]));
  const rotationBooks = activeRotation
    ? activeRotation.bookIds
        .map((id) => bookMap.get(id))
        .filter(/** @returns {b is import('../../types/models.js').Book} */ (b) => Boolean(b))
    : [];

  const completedCount = activeRotation
    ? activeRotation.completedBookIds.filter((id) => activeRotation.bookIds.includes(id)).length
    : 0;

  const rotatableCatalogCount = state.books.filter((b) => isBookRotatable(b)).length;
  const wishlistCount = state.books.filter(
    (b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist'
  ).length;
  const canSwapInActiveRotation = rotatableCatalogCount > rotationBooks.length;

  const activeShelfHtml = activeRotation
    ? `
      <section aria-labelledby="active-shelf-heading" class="space-y-3.5">
        <!-- Compact Header & Summary -->
        <div class="flex items-end justify-between gap-3 border-b border-linen-200/90 dark:border-night-800 pb-2.5">
          <div class="min-w-0">
            <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
              Books in Rotation
            </p>
            <h1 id="active-shelf-heading" class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight truncate mt-0.5">
              ${escapeHtml(activeRotation.title)}
            </h1>
            ${
              activeSchedule
                ? `<p data-rotation-schedule="active" class="text-[11px] font-mono-tabular mt-0.5 truncate ${
                    activeSchedule.isDue
                      ? 'font-semibold text-amber-800 dark:text-amber-300'
                      : activeSchedule.isDueSoon
                        ? 'font-medium text-espresso-800 dark:text-[#5ED3DA]'
                        : 'text-stone-ink dark:text-slate-400'
                  }">${escapeHtml(activeSchedule.activeScheduleLine)}</p>`
                : ''
            }
          </div>

          <div class="text-right shrink-0">
            <p class="text-xs font-semibold text-forest-900 dark:text-slate-200 font-mono-tabular whitespace-nowrap">
              ${completedCount} of ${rotationBooks.length} read
            </p>
            <p class="text-[11px] text-stone-ink dark:text-slate-400 font-mono-tabular whitespace-nowrap">
              ${rotationBooks.length} ${rotationBooks.length === 1 ? 'Book' : 'Books'} ·
              <a href="#/rotations?edit=${encodeURIComponent(activeRotation.id)}" class="font-sans font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline">Edit</a>
            </p>
          </div>
        </div>

        <!-- High-Density 3-Column Mobile Cover Grid (Minimal Title + Author) -->
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-4 pt-0.5">
          ${rotationBooks
            .map((book) => {
              const isRead = activeRotation.completedBookIds.includes(book.id);
              const primaryAuthor = book.authors[0] || 'Unknown Author';
              const ownerBadgesHtml = renderOwnerBadgesStrip(book, state.profiles);

              return `
                <article data-book-card="${escapeHtml(book.id)}" class="group flex flex-col min-w-0">
                  <div class="relative">
                    <button
                      type="button"
                      data-action="inspect-book"
                      data-book-id="${escapeHtml(book.id)}"
                      aria-label="Inspect ${escapeHtml(book.title)} by ${escapeHtml(primaryAuthor)}"
                      class="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.98]"
                    >
                      ${renderBookCover(book, 'grid', coverAspectRatio)}
                    </button>

                    ${
                      book.loved
                        ? `<span class="pointer-events-none absolute top-1.5 right-1.5 z-20 w-5 h-5 rounded-full bg-ivory/92 dark:bg-night-900/92 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-2xs" title="Loved favorite">${renderIcon('heartFilled', 'w-3 h-3')}</span>`
                        : ''
                    }

                    ${
                      ownerBadgesHtml
                        ? `<div class="pointer-events-none absolute bottom-1.5 right-1.5 z-20">${ownerBadgesHtml}</div>`
                        : ''
                    }

                    <!-- 44x44px Thumb Hitbox around Bottom-Left Read Check Badge -->
                    <button
                      type="button"
                      data-action="toggle-rotation-read"
                      data-rotation-id="${escapeHtml(activeRotation.id)}"
                      data-book-id="${escapeHtml(book.id)}"
                      aria-pressed="${isRead ? 'true' : 'false'}"
                      aria-label="${
                        isRead
                          ? `Mark ${escapeHtml(book.title)} as unread`
                          : `Mark ${escapeHtml(book.title)} as read`
                      }"
                      class="absolute -bottom-1 -left-1 z-20 min-h-[44px] min-w-[44px] flex items-end justify-start p-2 focus-visible:outline-2 focus-visible:outline-forest-700"
                    >
                      <span class="w-6 h-6 rounded-full flex items-center justify-center shadow-sm border transition-colors ${
                        isRead
                          ? 'bg-forest-900 border-ivory text-white dark:bg-[#5ED3DA] dark:border-night-950 dark:text-night-950'
                          : 'bg-ivory/90 border-linen-200 text-stone-ink/70 hover:text-forest-900 dark:bg-night-900/90 dark:border-night-700 dark:text-slate-400'
                      }">
                        ${renderIcon('check', 'w-3.5 h-3.5')}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    data-action="inspect-book"
                    data-book-id="${escapeHtml(book.id)}"
                    class="mt-2 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-forest-700 rounded"
                  >
                    <h2 class="font-sans text-xs sm:text-[13px] font-bold text-forest-900 dark:text-white leading-snug line-clamp-2 ${
                      isRead ? 'opacity-70' : ''
                    }">
                      ${escapeHtml(book.title)}
                    </h2>
                    <p class="text-[11px] text-stone-ink dark:text-slate-400 truncate mt-0.5">
                      ${escapeHtml(primaryAuthor)}
                    </p>
                  </button>
                </article>
              `;
            })
            .join('')}
        </div>
      </section>
    `
    : `
      <section class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 text-center">
        <p class="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]">
          Books in Rotation
        </p>
        <h1 class="font-display text-xl font-bold text-forest-900 dark:text-white mt-1">
          No Active Shelf for ${escapeHtml(activeProfile.name)}
        </h1>
        <p class="mt-1.5 text-xs sm:text-sm text-stone-ink dark:text-slate-400 max-w-sm mx-auto">
          Generate a fresh book rotation matched to ${escapeHtml(activeProfile.name)}’s age and favorite themes.
        </p>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
          <a
            href="#/rotations?new=1"
            class="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors"
          >
            ${renderIcon('plus', 'w-4 h-4')}
            Create Shelf
          </a>
          <a
            href="#/presets"
            class="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors"
          >
            ${renderIcon('sparkles', 'w-4 h-4 text-forest-700 dark:text-[#5ED3DA]')}
            Presets
          </a>
        </div>
      </section>
    `;

  const savedRotationsHtml =
    savedRotations.length > 0
      ? `
        <section aria-labelledby="saved-rotations-heading" class="pt-3 border-t border-linen-200/90 dark:border-night-800 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <h2 id="saved-rotations-heading" class="font-sans text-xs font-bold tracking-wide text-espresso-800 dark:text-slate-300">
              Saved Rotations
            </h2>
            <div class="flex items-center gap-3">
              <a href="#/presets" class="text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white hover:underline">
                Presets
              </a>
              <a href="#/rotations" class="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline">
                All shelves
              </a>
            </div>
          </div>
          <div class="divide-y divide-linen-200/70 dark:divide-night-800 rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-3.5">
            ${savedRotations
              .slice(0, 3)
              .map(
                (rot) => `
                  <div class="py-2.5 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white truncate">
                        ${escapeHtml(rot.title)}
                      </p>
                      <p class="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                        ${escapeHtml(rot.rules.objective)}
                      </p>
                    </div>
                    <div class="flex items-center gap-2.5 shrink-0">
                      <span class="text-xs font-mono-tabular text-stone-ink dark:text-slate-400 whitespace-nowrap">
                        ${rot.bookIds.length} books
                      </span>
                      <button
                        type="button"
                        data-action="activate-rotation"
                        data-rotation-id="${escapeHtml(rot.id)}"
                        class="min-h-[38px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors"
                      >
                        Activate
                      </button>
                    </div>
                  </div>
                `
              )
              .join('')}
          </div>
        </section>
      `
      : '';

  const recommendations = getProfileRecommendations({
    books: state.books,
    profile: activeProfile,
    rotations: state.rotations,
    limit: 3,
  });

  const recommendationsHtml =
    recommendations.length > 0
      ? `
        <section aria-labelledby="up-next-heading" class="pt-3 border-t border-linen-200/90 dark:border-night-800 space-y-2.5">
          <div class="flex items-baseline justify-between gap-2">
            <h2 id="up-next-heading" class="font-display text-base font-bold text-espresso-800 dark:text-white">
              Suggested Next for ${escapeHtml(activeProfile.name)}
            </h2>
            <span class="text-[11px] text-stone-ink dark:text-slate-400">
              Off-shelf picks
            </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            ${recommendations
              .map(({ book, matchReasons }) => {
                return `
                  <div data-book-card="rec-${escapeHtml(book.id)}" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-2.5 flex items-center justify-between gap-2.5">
                    <button
                      type="button"
                      data-action="inspect-book"
                      data-book-id="${escapeHtml(book.id)}"
                      class="flex items-center gap-2.5 min-w-0 text-left flex-1"
                    >
                      ${renderBookCover(book, 'xs', coverAspectRatio)}
                      <span class="min-w-0">
                        <span class="block text-xs font-bold text-forest-900 dark:text-white truncate">
                          ${escapeHtml(book.title)}
                        </span>
                        <span class="block text-[11px] text-stone-ink dark:text-slate-400 truncate">
                          ${escapeHtml(book.authors[0] || '')}
                        </span>
                        <span class="block text-[10px] text-forest-700 dark:text-[#5ED3DA] truncate mt-0.5">
                          ${escapeHtml(matchReasons[0] || 'Fresh pick')}
                        </span>
                      </span>
                    </button>
                    ${
                      activeRotation
                        ? `
                          <button
                            type="button"
                            data-action="add-recommended-to-shelf"
                            data-rotation-id="${escapeHtml(activeRotation.id)}"
                            data-book-id="${escapeHtml(book.id)}"
                            aria-label="Add ${escapeHtml(book.title)} to active shelf"
                            title="Add to active shelf"
                            class="min-h-[44px] min-w-[44px] rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white flex items-center justify-center shrink-0 transition-colors"
                          >
                            ${renderIcon('plus', 'w-4 h-4')}
                          </button>
                        `
                        : ''
                    }
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>
      `
      : '';

  const collectionCardHtml = `
    <section aria-label="Active collection summary" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-display text-sm font-bold text-espresso-800 dark:text-white">
          Active Collection
        </p>
        <p class="text-xs text-stone-ink dark:text-slate-400 font-mono-tabular truncate">
          ${state.books.length} ${state.books.length === 1 ? 'book' : 'books'} · ${
            activeProfile.readHistoryBookIds.length
          } read with ${escapeHtml(activeProfile.name)}${
            wishlistCount > 0 ? ` · ${wishlistCount} wishlisted` : ''
          }
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        ${
          wishlistCount > 0
            ? `
              <a
                href="#/library?filter=wishlist"
                class="min-h-[44px] px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                Wishlist (${wishlistCount})
              </a>
            `
            : ''
        }
        <a
          href="#/library"
          class="min-h-[44px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
        >
          Library
          ${renderIcon('chevronRight', 'w-3.5 h-3.5')}
        </a>
      </div>
    </section>
  `;

  const inspectedBook = uiState.inspectedBookId ? bookMap.get(uiState.inspectedBookId) : null;

  return `
    <div class="space-y-5">
      ${alertsStackHtml}
      ${activeShelfHtml}
      ${savedRotationsHtml}
      ${recommendationsHtml}
      ${collectionCardHtml}
      ${renderBookInspectorModal({
        book: inspectedBook,
        profiles: state.profiles,
        rotations: state.rotations,
        activeProfile,
        activeRotation,
        canSwapInActiveRotation,
        coverAspectRatio,
        dynamicCoverTint: dynamicTint,
        showRotationHistory: state.settings.enableRotationHistoryInsights !== false,
        staleBookDays: state.settings.staleBookDays ?? 10,
        referenceDate,
        inspectorUiState: uiState.inspectorUi,
      })}
    </div>
  `;
}
