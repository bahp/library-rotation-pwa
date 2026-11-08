/**
 * @fileoverview Redesigned slide-up Book Individual Card (`renderBookInspectorModal`) used across
 * Home, Family Library, and Rotations views:
 * - Single clickable book cover trigger (`data-action="toggle-cover-picker"`) with a horizontally
 *   centered camera overlay badge (no duplicate Change Cover button).
 * - Crisp top header bar showing provider provenance (`Google Books`, `Open Library`, or both with
 *   inline marks) alongside one-tap `Love`, `Edit`, and `Close` actions.
 * - Streamlined bibliographic `Edit Book Details` form (`#edit-book-form`) without redundant status,
 *   condition, or tag fields (preserving those values via hidden inputs).
 * - Unified `Customize` table (`Reader`, `Shelf`, `Condition`) matching the Scan/ISBN Found sheet,
 *   with labels aligned on the left and option buttons aligned on the right.
 * - Clean `Topics` curation section + quiet footer for raw payload inspection and `Remove Book`.
 */

import {
  computeOwnerInitials,
  escapeHtml,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  formatReadingStage,
  isBookRotatable,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeOwnersList,
} from '../../types/models.js';
import {
  computeBookUsageSummary,
  formatShortShelfDate,
} from '../../features/rotations/usage-insights.js';
import { resolveBookCardTintHex } from '../../features/catalog/cover-color-extractor.js';
import { renderBookCover } from './book-cover.js';
import { renderInputClearButton } from './clearable-input.js';
import {
  formatSingleProviderName,
  renderProviderAttribution,
} from './provider-attribution.js';
import { AVATAR_TONES } from './profile-sheets.js';
import { renderIcon } from '../icons.js';

/**
 * @typedef {Object} BookInspectorUiState
 * @property {boolean} isCoverPickerOpen
 * @property {boolean} isEditingBook
 * @property {string} coverSearchQuery
 * @property {boolean} coverSearchLoading
 * @property {string} coverSearchError
 * @property {Array<{ title: string, author: string, coverUrl: string, source: string }>} coverSearchResults
 * @property {string} editError
 */

/**
 * Renders the slide-up Book Individual Card, Cover Studio, Bibliographic Editor, Customize rows & Topics.
 * @param {{
 *   book: import('../../types/models.js').Book | null | undefined,
 *   profiles?: import('../../types/models.js').ChildProfile[],
 *   rotations?: import('../../types/models.js').RotationList[],
 *   activeProfile?: import('../../types/models.js').ChildProfile | null,
 *   activeRotation?: import('../../types/models.js').RotationList | null,
 *   inspectedRotation?: import('../../types/models.js').RotationList | null,
 *   canSwapInActiveRotation?: boolean,
 *   coverAspectRatio?: import('../../types/models.js').CoverAspectRatio,
 *   dynamicCoverTint?: boolean,
 *   showRotationHistory?: boolean,
 *   staleBookDays?: number,
 *   referenceDate?: Date | string | number,
 *   inspectorUiState?: BookInspectorUiState
 * }} params
 * @returns {string}
 */
export function renderBookInspectorModal({
  book,
  profiles = [],
  rotations = [],
  activeProfile = null,
  activeRotation = null,
  inspectedRotation = null,
  canSwapInActiveRotation = false,
  coverAspectRatio = 'square',
  dynamicCoverTint = true,
  showRotationHistory = true,
  staleBookDays = 10,
  referenceDate = new Date(),
  inspectorUiState = {
    isCoverPickerOpen: false,
    isEditingBook: false,
    coverSearchQuery: '',
    coverSearchLoading: false,
    coverSearchError: '',
    coverSearchResults: [],
    editError: '',
  },
}) {
  if (!book) return '';

  const targetRotation = inspectedRotation || activeRotation;
  const isSavedInspectedShelf = Boolean(targetRotation && targetRotation.status !== 'active');
  const inTargetShelf = Boolean(targetRotation && targetRotation.bookIds.includes(book.id));
  const isReadInTarget = Boolean(
    targetRotation && targetRotation.completedBookIds.includes(book.id)
  );
  const inActiveShelf = Boolean(activeRotation && activeRotation.bookIds.includes(book.id));
  const currentStatus = normalizeCollectionStatus(book.collectionStatus);
  const currentCondition = normalizeBookCondition(book.condition);
  const isLoved = Boolean(book.loved);
  const rawOwners = normalizeOwnersList(book.owners);
  const currentOwners = rawOwners.length > 0 ? rawOwners : ['shared'];
  const rotatable = isBookRotatable(book);
  const tintHex = resolveBookCardTintHex(book);
  const dialogSurfaceClasses =
    dynamicCoverTint !== false
      ? 'lr-tinted-card bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700'
      : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700';
  const dialogTintAttrs =
    dynamicCoverTint !== false
      ? `data-cover-tint="${escapeHtml(tintHex)}" data-tint-book-id="${escapeHtml(book.id)}"`
      : '';

  const searchSeed =
    inspectorUiState.coverSearchQuery ||
    `${book.title} ${book.authors[0] || ''}`.trim();

  // Contextual Drawer 1: Cover Studio (opens only when tapping the book cover)
  const coverStudioHtml = inspectorUiState.isCoverPickerOpen
    ? `
      <section aria-label="Change book cover" class="rounded-2xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-xs font-bold text-forest-900 dark:text-white">
              Cover Studio
            </p>
            <p class="text-[11px] text-stone-ink dark:text-slate-400">
              Choose a photo, snap a picture, or search Google Books & Open Library.
            </p>
          </div>
          ${
            book.coverUrl
              ? `
                <button
                  type="button"
                  data-action="clear-book-cover"
                  data-book-id="${escapeHtml(book.id)}"
                  class="min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-semibold text-stone-ink hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 transition-colors shrink-0"
                >
                  Cloth Cover
                </button>
              `
              : ''
          }
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <label
            for="inspector-cover-gallery-input"
            class="min-h-[44px] px-3 py-2 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            ${renderIcon('photo', 'w-4 h-4')}
            <span>From Phone</span>
            <input
              id="inspector-cover-gallery-input"
              type="file"
              accept="image/*"
              class="sr-only"
            />
          </label>

          <label
            for="inspector-cover-camera-input"
            class="min-h-[44px] px-3 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            ${renderIcon('camera', 'w-4 h-4')}
            <span>Take Picture</span>
            <input
              id="inspector-cover-camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
            />
          </label>
        </div>

        <form id="inspector-cover-search-form" class="flex items-center gap-2">
          <label for="inspector-cover-search-input" class="sr-only">Search book covers online</label>
          <div class="relative flex-1 min-w-0">
            <input
              id="inspector-cover-search-input"
              name="coverQuery"
              type="search"
              value="${escapeHtml(searchSeed)}"
              placeholder="Search Google Books / Open Library covers…"
              class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
            ${renderInputClearButton({
              targetId: 'inspector-cover-search-input',
              value: searchSeed,
              label: 'Clear cover search',
            })}
          </div>
          <button
            type="submit"
            data-action="search-book-covers"
            ${inspectorUiState.coverSearchLoading ? 'disabled' : ''}
            class="h-12 px-3.5 rounded-xl bg-forest-900 hover:bg-forest-800 disabled:opacity-55 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            ${renderIcon('search', 'w-3.5 h-3.5')}
            <span>${inspectorUiState.coverSearchLoading ? 'Searching…' : 'Search'}</span>
          </button>
        </form>

        ${
          inspectorUiState.coverSearchError
            ? `<p role="alert" class="text-xs text-rose-700 dark:text-rose-300">${escapeHtml(
                inspectorUiState.coverSearchError
              )}</p>`
            : ''
        }

        ${
          inspectorUiState.coverSearchResults.length > 0
            ? `
              <div class="grid grid-cols-4 gap-2 pt-0.5">
                ${inspectorUiState.coverSearchResults
                  .map((res) => {
                    const readableSource = formatSingleProviderName(res.source);
                    return `
                      <button
                        type="button"
                        data-action="select-searched-cover"
                        data-book-id="${escapeHtml(book.id)}"
                        data-cover-url="${escapeHtml(res.coverUrl)}"
                        title="Use cover from ${escapeHtml(readableSource)}"
                        aria-label="Apply cover for ${escapeHtml(res.title)}"
                        class="group flex flex-col items-center text-left rounded-xl p-1 bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-forest-700"
                      >
                        <div class="w-full ${
                          coverAspectRatio === 'square' ? 'aspect-square' : 'aspect-[3/4]'
                        } rounded-lg overflow-hidden bg-linen-100 dark:bg-night-800">
                          <img
                            src="${escapeHtml(res.coverUrl)}"
                            alt="${escapeHtml(res.title)}"
                            referrerpolicy="no-referrer"
                            loading="lazy"
                            class="w-full h-full object-cover"
                          />
                        </div>
                        <span class="mt-1 text-[10px] text-stone-ink dark:text-slate-400 truncate w-full text-center">
                          ${escapeHtml(readableSource)}
                        </span>
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            `
            : ''
        }
      </section>
    `
    : '';

  const httpsCoverUrlValue =
    book.coverUrl && book.coverUrl.startsWith('https://') ? book.coverUrl : '';

  // Contextual Drawer 2: Bibliographic Details Editor (opens only when tapping Edit; avoids duplicating Customize/Topics)
  const editBookFormHtml = inspectorUiState.isEditingBook
    ? `
      <form
        id="edit-book-form"
        data-book-id="${escapeHtml(book.id)}"
        class="rounded-2xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-3"
        novalidate
      >
        <input type="hidden" name="collectionStatus" value="${escapeHtml(currentStatus)}" />
        <input type="hidden" name="condition" value="${escapeHtml(currentCondition)}" />
        <input type="hidden" name="tags" value="${escapeHtml(book.tags.join(', '))}" />

        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-bold text-forest-900 dark:text-white">
            Edit Bibliographic Info
          </p>
          <span class="text-[11px] text-stone-ink dark:text-slate-400">
            Saved on device
          </span>
        </div>

        ${
          inspectorUiState.editError
            ? `<div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3.5 py-2 text-xs font-medium text-rose-800 dark:text-rose-200">${escapeHtml(
                inspectorUiState.editError
              )}</div>`
            : ''
        }

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label for="edit-book-title" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Title *
            </label>
            <div class="relative min-w-0">
              <input
                id="edit-book-title"
                name="title"
                type="text"
                required
                value="${escapeHtml(book.title)}"
                class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
              ${renderInputClearButton({
                targetId: 'edit-book-title',
                value: book.title,
                label: 'Clear book title',
              })}
            </div>
          </div>

          <div>
            <label for="edit-book-authors" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Author(s)
            </label>
            <div class="relative min-w-0">
              <input
                id="edit-book-authors"
                name="authors"
                type="text"
                value="${escapeHtml(book.authors.join(', '))}"
                class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
              ${renderInputClearButton({
                targetId: 'edit-book-authors',
                value: book.authors.join(', '),
                label: 'Clear authors',
              })}
            </div>
          </div>

          <div>
            <label for="edit-book-isbn" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              ISBN (optional)
            </label>
            <div class="relative min-w-0">
              <input
                id="edit-book-isbn"
                name="isbn"
                type="text"
                value="${escapeHtml(book.isbn13 || book.isbn10 || '')}"
                class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
              ${renderInputClearButton({
                targetId: 'edit-book-isbn',
                value: book.isbn13 || book.isbn10 || '',
                label: 'Clear ISBN',
              })}
            </div>
          </div>

          <div>
            <label for="edit-book-format" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Binding Format
            </label>
            <select
              id="edit-book-format"
              name="format"
              class="w-full h-12 px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            >
              <option value="hardcover" ${book.format === 'hardcover' ? 'selected' : ''}>Hardcover</option>
              <option value="board-book" ${book.format === 'board-book' ? 'selected' : ''}>Board Book</option>
              <option value="paperback" ${book.format === 'paperback' ? 'selected' : ''}>Paperback</option>
            </select>
          </div>

          <div>
            <label for="edit-book-stage" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              Reading Stage
            </label>
            <select
              id="edit-book-stage"
              name="readingStage"
              class="w-full h-12 px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            >
              <option value="board-toddler" ${book.readingStage === 'board-toddler' ? 'selected' : ''}>Board & Toddler</option>
              <option value="picture-book" ${book.readingStage === 'picture-book' ? 'selected' : ''}>Picture Book</option>
              <option value="early-reader" ${book.readingStage === 'early-reader' ? 'selected' : ''}>Early Reader</option>
              <option value="chapter-book" ${book.readingStage === 'chapter-book' ? 'selected' : ''}>Chapter Book</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label for="edit-book-age-min" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Min Age
              </label>
              <input
                id="edit-book-age-min"
                name="ageMin"
                type="number"
                min="0"
                max="16"
                value="${book.ageMin}"
                class="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="edit-book-age-max" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Max Age
              </label>
              <input
                id="edit-book-age-max"
                name="ageMax"
                type="number"
                min="0"
                max="18"
                value="${book.ageMax}"
                class="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label for="edit-book-pages" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Pages
              </label>
              <input
                id="edit-book-pages"
                name="pageCount"
                type="number"
                min="1"
                max="2000"
                value="${book.pageCount ? book.pageCount : ''}"
                placeholder="—"
                class="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="edit-book-year" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Year
              </label>
              <input
                id="edit-book-year"
                name="publishedYear"
                type="number"
                min="1800"
                max="2100"
                value="${book.publishedYear ? book.publishedYear : ''}"
                placeholder="—"
                class="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <div class="sm:col-span-2">
            <label for="edit-book-cover-url" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
              HTTPS Cover URL (optional${
                book.coverUrl && book.coverUrl.startsWith('data:image/')
                  ? ' · custom photo saved'
                  : ''
              })
            </label>
            <div class="relative min-w-0">
              <input
                id="edit-book-cover-url"
                name="coverUrl"
                type="url"
                value="${escapeHtml(httpsCoverUrlValue)}"
                placeholder="https://covers.openlibrary.org/..."
                class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
              ${renderInputClearButton({
                targetId: 'edit-book-cover-url',
                value: httpsCoverUrlValue,
                label: 'Clear cover URL',
              })}
            </div>
          </div>
        </div>

        <div class="pt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            data-action="toggle-edit-book-info"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="min-h-[44px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Save Changes
          </button>
        </div>
      </form>
    `
    : '';

  const profileIdsLower = new Set(profiles.map((p) => p.id.toLowerCase()));
  const customAssignedOwners = currentOwners.filter(
    (o) => o.toLowerCase() !== 'shared' && !profileIdsLower.has(o.toLowerCase())
  );

  const ownerToggleChips = [
    { key: 'shared', label: 'Shared', initial: 'S', tone: 'emerald' },
    ...profiles.map((p) => ({
      key: p.id,
      label: p.name,
      initial: computeOwnerInitials(p.name),
      tone: p.avatarTone || 'teal',
    })),
    ...customAssignedOwners.map((custom) => ({
      key: custom,
      label: custom,
      initial: computeOwnerInitials(custom),
      tone: 'indigo',
    })),
  ];

  const effectiveReader =
    activeProfile ||
    (activeRotation
      ? profiles.find((p) => p.id === activeRotation.profileId) || profiles[0] || null
      : profiles[0] || null);
  const effectiveRotations =
    rotations.length > 0 ? rotations : activeRotation ? [activeRotation] : [];
  const usageSummary = computeBookUsageSummary(book, {
    profiles,
    rotations: effectiveRotations,
    activeProfile: effectiveReader,
    activeRotation,
    staleBookDays,
    referenceDate,
  });

  const usageSegments = [];
  if (usageSummary.isCurrentlyOnActiveShelf) {
    usageSegments.push(
      usageSummary.daysOnActiveShelf && usageSummary.daysOnActiveShelf > 0
        ? `On active shelf ${usageSummary.daysOnActiveShelf}d`
        : 'On active shelf today'
    );
    if (usageSummary.isStaleUnreadOnShelf) {
      usageSegments.push('Unread this cycle');
    } else if (usageSummary.isReadInActiveShelf) {
      usageSegments.push('Read this cycle');
    }
  } else if (usageSummary.neverRotated) {
    usageSegments.push('Never rotated yet');
  } else if (usageSummary.lastRotatedAt) {
    const shortDate = formatShortShelfDate(usageSummary.lastRotatedAt, referenceDate);
    const agoPart =
      usageSummary.daysSinceLastRotated === 0
        ? 'today'
        : `${usageSummary.daysSinceLastRotated}d ago`;
    usageSegments.push(`Last on shelf ${shortDate} (${agoPart})`);
    if (usageSummary.inCooldown) {
      usageSegments.push(`Cooldown: ${usageSummary.cooldownDaysRemaining}d left`);
    } else if (
      usageSummary.rotationsSinceLastOut !== null &&
      usageSummary.rotationsSinceLastOut >= 2
    ) {
      usageSegments.push(`Unseen ${usageSummary.rotationsSinceLastOut} rotations`);
    }
  }
  if (usageSummary.rotationCount > 0) {
    usageSegments.push(`Rotated ${usageSummary.rotationCount}×`);
  }
  if (usageSummary.readByProfileNames.length > 0) {
    const readDateSuffix = usageSummary.lastReadAt
      ? ` (${formatShortShelfDate(usageSummary.lastReadAt, referenceDate)})`
      : '';
    const readPrefix =
      usageSummary.isCurrentlyOnActiveShelf && !usageSummary.isReadInActiveShelf
        ? 'Read earlier with'
        : 'Read with';
    usageSegments.push(`${readPrefix} ${usageSummary.readByProfileNames.join(', ')}${readDateSuffix}`);
  } else {
    usageSegments.push('Unread together');
  }

  const rotationHistoryStripHtml =
    showRotationHistory !== false && rotatable
      ? `<p data-book-usage-summary="true" class="text-[11px] font-mono-tabular ${
          usageSummary.isStaleUnreadOnShelf
            ? 'font-semibold text-amber-800 dark:text-amber-300'
            : 'text-stone-ink dark:text-slate-400'
        }">${escapeHtml(usageSegments.join(' · '))}</p>`
      : '';

  const canSwapInTargetRotation = isSavedInspectedShelf
    ? canSwapInActiveRotation
    : canSwapInActiveRotation;

  const offShelfReadButtonHtml =
    rotatable && effectiveReader
      ? `
          <button
            type="button"
            data-action="toggle-profile-book-read"
            data-profile-id="${escapeHtml(effectiveReader.id)}"
            data-book-id="${escapeHtml(book.id)}"
            aria-pressed="${usageSummary.isReadByActiveProfile ? 'true' : 'false'}"
            title="${
              usageSummary.isReadByActiveProfile
                ? 'Marked read — tap to mark unread'
                : `Mark read with ${escapeHtml(effectiveReader.name)}`
            }"
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              usageSummary.isReadByActiveProfile
                ? 'bg-forest-700 text-white dark:bg-forest-600'
                : 'bg-ivory hover:bg-linen-100 text-forest-900 dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-100 border border-linen-200 dark:border-night-700'
            }"
          >
            ${renderIcon('check', 'w-3.5 h-3.5')}
            ${usageSummary.isReadByActiveProfile ? 'Read · Undo' : 'Mark Read'}
          </button>
        `
      : '';

  // Quick Shelf & Read Bar (works for active shelf, saved shelf, and off-shelf catalog books)
  const quickShelfBarHtml =
    targetRotation || ((rotatable || book.excludeFromRotations) && effectiveReader)
      ? `
        <div class="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5 space-y-1.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-medium text-stone-ink dark:text-slate-300">
              ${
                inTargetShelf
                  ? isSavedInspectedShelf && targetRotation
                    ? `In saved shelf “${escapeHtml(targetRotation.title)}”`
                    : 'On current rotation shelf'
                  : rotatable
                    ? activeRotation
                      ? 'Available for active shelf'
                      : 'Ready in family library'
                    : book.excludeFromRotations
                      ? 'Excluded from auto-rotations'
                      : `${escapeHtml(formatCollectionStatus(currentStatus))} (${escapeHtml(formatBookCondition(currentCondition))}) — off auto-rotations`
              }
            </span>
            <div class="flex flex-wrap items-center gap-2">
              ${
                inTargetShelf && targetRotation
                  ? `
                    <button
                      type="button"
                      data-action="toggle-rotation-read"
                      data-rotation-id="${escapeHtml(targetRotation.id)}"
                      data-book-id="${escapeHtml(book.id)}"
                      aria-pressed="${isReadInTarget ? 'true' : 'false'}"
                      title="${
                        isReadInTarget
                          ? 'Marked read — tap to mark unread'
                          : 'Mark as read for this shelf'
                      }"
                      class="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isReadInTarget
                          ? 'bg-forest-700 text-white dark:bg-forest-600'
                          : 'bg-ivory hover:bg-linen-100 text-forest-900 dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-100 border border-linen-200 dark:border-night-700'
                      }"
                    >
                      ${renderIcon('check', 'w-3.5 h-3.5')}
                      ${isReadInTarget ? 'Read · Undo' : 'Mark Read'}
                    </button>
                    ${
                      canSwapInTargetRotation
                        ? `
                          <button
                            type="button"
                            data-action="replace-book-random"
                            data-rotation-id="${escapeHtml(targetRotation.id)}"
                            data-book-id="${escapeHtml(book.id)}"
                            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                            Swap Book
                          </button>
                        `
                        : ''
                    }
                  `
                  : rotatable
                    ? `
                      ${offShelfReadButtonHtml}
                      ${
                        activeRotation && !inActiveShelf
                          ? `
                            <button
                              type="button"
                              data-action="add-recommended-to-shelf"
                              data-rotation-id="${escapeHtml(activeRotation.id)}"
                              data-book-id="${escapeHtml(book.id)}"
                              class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              ${renderIcon('plus', 'w-3.5 h-3.5')}
                              Add to Active Shelf
                            </button>
                          `
                          : ''
                      }
                    `
                    : ''
              }
            </div>
          </div>
          ${rotationHistoryStripHtml}
        </div>
      `
      : rotationHistoryStripHtml
        ? `
          <div class="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5">
            ${rotationHistoryStripHtml}
          </div>
        `
        : '';

  // Unified Customize Table (matching Scan/ISBN Found card: left labels, right option buttons)
  const customizeSectionHtml = `
    <section aria-label="Customize reader, shelf status, and condition" class="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5 text-xs">
      <div class="divide-y divide-linen-200/70 dark:divide-night-800/80">
        <!-- Row 1: Reader / Household Owners -->
        <div data-customize-row="owner" class="py-2 first:pt-0 last:pb-0 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">Reader</span>
            <div class="flex flex-wrap items-center justify-end gap-1.5">
              ${ownerToggleChips
                .map((chip) => {
                  const active = currentOwners.some((o) => o.toLowerCase() === chip.key.toLowerCase());
                  return `
                    <button
                      type="button"
                      data-action="toggle-book-owner"
                      data-book-id="${escapeHtml(book.id)}"
                      data-owner="${escapeHtml(chip.key)}"
                      aria-pressed="${active ? 'true' : 'false'}"
                      class="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                          : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                      }"
                    >
                      <span class="w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ${
                        AVATAR_TONES[chip.tone] || AVATAR_TONES.teal
                      }">${escapeHtml(chip.initial)}</span>
                      <span>${escapeHtml(chip.label)}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          <details class="group">
            <summary class="cursor-pointer list-none flex justify-end text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] select-none">
              <span>+ Custom owner / house</span>
            </summary>
            <form id="inspector-add-owner-form" data-book-id="${escapeHtml(book.id)}" class="mt-2 flex items-center gap-2">
              <label for="inspector-new-owner-input" class="sr-only">Add custom household or relative owner</label>
              <div class="relative flex-1 min-w-0">
                <input
                  id="inspector-new-owner-input"
                  name="owner"
                  type="text"
                  placeholder="e.g., Grandma's House, Cousin Maya"
                  class="w-full h-11 pl-3 pr-8 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
                ${renderInputClearButton({
                  targetId: 'inspector-new-owner-input',
                  value: '',
                  label: 'Clear owner name',
                  compact: true,
                })}
              </div>
              <button
                type="submit"
                class="h-11 px-3 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Add
              </button>
            </form>
          </details>
        </div>

        <!-- Row 2: Shelf Status (Owned vs Wishlist) -->
        <div data-customize-row="status" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
          <span class="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">Shelf</span>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            ${/** @type {Array<import('../../types/models.js').CollectionStatus>} */ ([
              'owned',
              'wishlist',
            ])
              .map((st) => {
                const active = currentStatus === st;
                return `
                  <button
                    type="button"
                    data-action="set-book-status"
                    data-book-id="${escapeHtml(book.id)}"
                    data-status="${st}"
                    aria-pressed="${active ? 'true' : 'false'}"
                    class="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                        : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                    }"
                  >
                    ${escapeHtml(formatCollectionStatus(st))}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>

        <!-- Row 3: Physical Condition -->
        <div data-customize-row="condition" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
          <span class="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">Condition</span>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            ${/** @type {Array<import('../../types/models.js').BookCondition>} */ ([
              'good',
              'torn',
              'broken',
              'retired',
            ])
              .map((cond) => {
                const active = currentCondition === cond;
                const activeClass =
                  cond === 'broken' || cond === 'retired'
                    ? 'bg-rose-700 text-white'
                    : cond === 'torn'
                      ? 'bg-amber-700 text-white'
                      : 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950';
                return `
                  <button
                    type="button"
                    data-action="set-book-condition"
                    data-book-id="${escapeHtml(book.id)}"
                    data-condition="${cond}"
                    aria-pressed="${active ? 'true' : 'false'}"
                    class="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? activeClass
                        : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                    }"
                  >
                    ${escapeHtml(formatBookCondition(cond))}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>

        <!-- Row 4: Rotations Eligibility -->
        <div data-customize-row="rotations" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
          <div>
            <span class="text-xs font-semibold text-stone-ink dark:text-slate-300">Rotations</span>
            <p class="text-[11px] text-stone-ink/80 dark:text-slate-400">
              ${book.excludeFromRotations ? 'Excluded from shelf rotations' : 'Eligible for shelf rotations'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            data-action="toggle-book-rotation-eligibility"
            data-book-id="${escapeHtml(book.id)}"
            aria-checked="${book.excludeFromRotations ? 'false' : 'true'}"
            title="${book.excludeFromRotations ? 'Tap to include in rotations' : 'Tap to exclude from rotations'}"
            class="min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              book.excludeFromRotations
                ? 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300 border border-linen-200 dark:border-night-700'
                : 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
            }"
          >
            ${book.excludeFromRotations ? 'Excluded' : 'Included'}
          </button>
        </div>
      </div>
    </section>
  `;

  return `
    <div
      data-backdrop-action="close-inspect-book"
      class="sheet-backdrop fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-book-title"
        ${dialogTintAttrs}
        class="animate-sheet-up w-full max-w-lg sm:max-w-xl lg:max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl ${dialogSurfaceClasses} shadow-2xl overflow-hidden"
      >
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <!-- Top Utility Header: Provenance (left) + Love / Edit / Close (right) -->
        <div class="px-5 pt-3 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div class="min-w-0 truncate">
            ${renderProviderAttribution(book.sources)}
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-action="toggle-book-loved"
              data-book-id="${escapeHtml(book.id)}"
              aria-pressed="${isLoved ? 'true' : 'false'}"
              aria-label="${isLoved ? 'Remove Loved mark' : 'Mark as Loved'}"
              class="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isLoved
                  ? 'bg-rose-600 text-white'
                  : 'bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
              }"
            >
              ${renderIcon(isLoved ? 'heartFilled' : 'heart', 'w-3.5 h-3.5')}
              <span>${isLoved ? 'Loved' : 'Love'}</span>
            </button>

            <button
              type="button"
              data-action="toggle-edit-book-info"
              aria-pressed="${inspectorUiState.isEditingBook ? 'true' : 'false'}"
              class="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                inspectorUiState.isEditingBook
                  ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                  : 'bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
              }"
            >
              ${renderIcon('edit', 'w-3.5 h-3.5')}
              <span>Edit</span>
            </button>

            <button
              type="button"
              data-action="close-inspect-book"
              aria-label="Close book details"
              class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800"
            >
              ${renderIcon('close', 'w-4 h-4')}
            </button>
          </div>
        </div>

        <!-- Scrollable Card Body -->
        <div class="p-4 sm:p-5 overflow-y-auto space-y-4">
          <!-- Hero Identity: Cover + Stars Underneath (left) + Title, Author, Metadata Block & ISBN (right) -->
          <div class="flex items-start gap-3.5 sm:gap-4 min-w-0">
            <div class="flex flex-col items-center shrink-0">
              <button
                type="button"
                data-action="toggle-cover-picker"
                aria-expanded="${inspectorUiState.isCoverPickerOpen ? 'true' : 'false'}"
                aria-label="Change cover for ${escapeHtml(book.title)}"
                title="Tap to change book cover"
                class="group relative rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-95"
              >
                ${renderBookCover(book, 'md', coverAspectRatio)}
                <span
                  data-cover-badge="centered"
                  class="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-20 flex justify-center"
                >
                  <span class="px-2 py-0.5 rounded-lg bg-night-950/80 backdrop-blur-xs text-ivory text-[10px] font-semibold inline-flex items-center justify-center gap-1 shadow-xs whitespace-nowrap">
                    ${renderIcon('camera', 'w-3 h-3')}
                    <span>${inspectorUiState.isCoverPickerOpen ? 'Close' : 'Cover'}</span>
                  </span>
                </span>
              </button>

              <!-- 5 Stars Underneath the Cover Image with Option A (re-tap active star to clear, zero clutter text) -->
              ${(() => {
                const userRating = typeof book.userRating === 'number' ? book.userRating : 0;
                return `
                  <div class="mt-2 flex flex-col items-center justify-center" data-inspector-cover-stars="true">
                    <div class="inline-flex items-center -space-x-0.5" role="group" aria-label="Rate this book 1 to 5 stars">
                      ${[1, 2, 3, 4, 5]
                        .map((star) => {
                          const isCurrentActive = star === userRating;
                          const filled = star <= userRating;
                          const targetRating = isCurrentActive ? 0 : star;
                          const starTone = filled
                            ? 'text-amber-500 dark:text-amber-400'
                            : 'text-stone-ink/30 dark:text-slate-600 hover:text-amber-400';
                          return `
                            <button
                              type="button"
                              data-action="set-book-user-rating"
                              data-book-id="${escapeHtml(book.id)}"
                              data-rating="${targetRating}"
                              aria-label="${isCurrentActive ? 'Remove rating' : `Rate ${star} out of 5 stars`}"
                              title="${isCurrentActive ? 'Tap to remove rating' : `Rate ${star} star${star === 1 ? '' : 's'}`}"
                              class="w-4 sm:w-5 h-6 flex items-center justify-center ${starTone} hover:scale-125 active:scale-95 transition-transform focus-visible:outline-none"
                            >
                              ${renderIcon(filled ? 'starFilled' : 'star', 'w-3.5 sm:w-4 h-3.5 sm:h-4')}
                            </button>
                          `;
                        })
                        .join('')}
                    </div>
                    ${
                      book.averageRating
                        ? `
                          <span class="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-mono-tabular text-stone-ink/80 dark:text-slate-400" title="Google Books rating">
                            <span class="text-amber-500">★</span>
                            <span>${book.averageRating}${book.ratingsCount ? ` (${book.ratingsCount})` : ''}</span>
                          </span>
                        `
                        : ''
                    }
                  </div>
                `;
              })()}
            </div>

            <div class="min-w-0 flex-1">
              <h2 id="inspect-book-title" class="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white leading-snug text-balance">
                ${escapeHtml(book.title)}
              </h2>
              <p class="text-xs sm:text-sm font-medium text-stone-ink dark:text-slate-300 mt-0.5">
                ${escapeHtml(book.authors.join(', '))}
              </p>

              <!-- Unified Metadata Block: Bibliographic info line, Storytime & pacing line, and ISBN line -->
              ${(() => {
                const biblioItems = [
                  `<span class="inline-flex items-center"><span class="font-bold text-forest-900 dark:text-white">Ages ${book.ageMin}–${book.ageMax}</span><span class="text-[10px] text-amber-600 dark:text-amber-400 select-none ml-0.5 cursor-help" title="Computed by local rule / AI (tap Edit Book to override)" aria-label="Auto-computed age parameter">✦</span></span>`,
                  formatReadingStage(book.readingStage),
                  formatBookBinding(book.format),
                  book.pageCount ? `${book.pageCount} pp` : null,
                  book.publishedYear ? `${book.publishedYear}` : null,
                  book.language && book.language !== 'english' ? book.language : null,
                  book.publisher ? escapeHtml(book.publisher) : null,
                ].filter(Boolean);

                const biblioLineMarkup = biblioItems
                  .map((item, idx) => {
                    const isLast = idx === biblioItems.length - 1 && !book.previewLink;
                    const sep = !isLast
                      ? '<span aria-hidden="true" class="mx-1 text-stone-ink/40 select-none">·</span>'
                      : '';
                    return `<span class="inline-flex items-center whitespace-nowrap"><span>${item}</span>${sep}</span>`;
                  })
                  .join('');

                const previewMarkup = book.previewLink
                  ? `<span class="inline-flex items-center whitespace-nowrap"><a href="${escapeHtml(
                      book.previewLink
                    )}" target="_blank" rel="noopener noreferrer" class="text-forest-700 hover:underline dark:text-[#5ED3DA] font-medium inline-flex items-center gap-0.5">Preview &nearr;</a></span>`
                  : '';

                const hintParts = book.readingLevelHint
                  ? String(book.readingLevelHint)
                      .split('·')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : [];

                const storytimeLineMarkup =
                  hintParts.length > 0
                    ? `
                      <div class="flex flex-wrap items-center">
                        <span class="inline-flex items-center text-[10px] text-emerald-600 dark:text-emerald-400 select-none mr-1 cursor-help" title="Read-aloud pacing & duration computed by rule / AI" aria-label="Auto-computed pacing and duration">✦</span>
                        ${hintParts
                          .map((part, idx) => {
                            const isLast = idx === hintParts.length - 1;
                            const sep = !isLast
                              ? '<span aria-hidden="true" class="mx-1 text-stone-ink/40 select-none">·</span>'
                              : '';
                            return `<span class="inline-flex items-center whitespace-nowrap"><span class="text-emerald-700 dark:text-emerald-400 font-medium">${escapeHtml(
                              part
                            )}</span>${sep}</span>`;
                          })
                          .join('')}
                      </div>
                    `
                    : '';

                const isbnVal = book.isbn13 || book.isbn10;
                const isbnLineMarkup = isbnVal
                  ? `<div class="font-mono-tabular text-stone-ink dark:text-slate-400 flex items-center">
                      <span>ISBN ${escapeHtml(isbnVal)}</span>
                    </div>`
                  : '';

                return `
                  <div class="mt-2 text-xs leading-snug text-stone-ink dark:text-slate-300 space-y-0.5">
                    <div class="flex flex-wrap items-center">
                      ${biblioLineMarkup}${previewMarkup}
                    </div>
                    ${storytimeLineMarkup}
                    ${isbnLineMarkup}
                  </div>
                `;
              })()}
            </div>
          </div>

          ${coverStudioHtml}
          ${editBookFormHtml}
          ${quickShelfBarHtml}
          ${customizeSectionHtml}

          <!-- Topics & Themes Curation -->
          <section aria-label="Topics and themes" class="space-y-2.5 text-xs text-stone-ink dark:text-slate-300">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-xs font-bold text-forest-900 dark:text-white">Topics & Themes</strong>
              <button
                type="button"
                data-action="enrich-book-tags"
                data-book-id="${escapeHtml(book.id)}"
                class="min-h-[36px] px-2.5 py-1 rounded-xl bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                ${renderIcon('sparkles', 'w-3.5 h-3.5')}
                <span>Auto-Enrich</span>
              </button>
            </div>

            ${
              book.tags.length > 0
                ? `
                  <div class="flex flex-wrap items-center gap-1.5">
                    ${book.tags
                      .map(
                        (tag) => `
                          <button
                            type="button"
                            data-action="remove-book-tag"
                            data-book-id="${escapeHtml(book.id)}"
                            data-tag="${escapeHtml(tag)}"
                            title="Remove topic ${escapeHtml(tag)}"
                            aria-label="Remove topic ${escapeHtml(tag)}"
                            class="min-h-[34px] px-2.5 py-1 rounded-lg bg-linen-100/90 hover:bg-rose-50 dark:bg-night-800 dark:hover:bg-rose-950/50 text-xs font-medium text-forest-900 hover:text-rose-700 dark:text-slate-200 dark:hover:text-rose-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                          >
                            <span>${escapeHtml(tag)}</span>
                            <span aria-hidden="true" class="opacity-60">×</span>
                          </button>
                        `
                      )
                      .join('')}
                  </div>
                `
                : `<p class="text-stone-ink dark:text-slate-400">No topics tagged yet.</p>`
            }

            <form id="inspector-add-tag-form" data-book-id="${escapeHtml(book.id)}" class="flex items-center gap-2">
              <label for="inspector-new-tag-input" class="sr-only">Add topic tag</label>
              <div class="relative flex-1 min-w-0">
                <input
                  id="inspector-new-tag-input"
                  name="tag"
                  type="text"
                  placeholder="Add topic (e.g., bedtime, dinosaurs)"
                  class="w-full h-11 pl-3 pr-8 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
                ${renderInputClearButton({
                  targetId: 'inspector-new-tag-input',
                  value: '',
                  label: 'Clear topic tag',
                  compact: true,
                })}
              </div>
              <button
                type="submit"
                class="h-11 px-3.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Add Tag
              </button>
            </form>
          </section>

          <!-- Quiet Footer: Detailed Provenance + Optional Raw Payloads + Remove Book -->
          <div class="pt-3 border-t border-linen-200/80 dark:border-night-800 space-y-2 text-xs">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                ${renderProviderAttribution(book.sources, {
                  prefix: 'Retrieved from',
                  includeExternalIds: true,
                })}
              </div>
              <button
                type="button"
                data-action="delete-book"
                data-book-id="${escapeHtml(book.id)}"
                aria-label="Remove ${escapeHtml(book.title)} from catalog"
                class="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                ${renderIcon('trash', 'w-3.5 h-3.5')}
                <span>Remove Book</span>
              </button>
            </div>

            ${
              book.sources.some((s) => Boolean(s.rawPayload))
                ? `
                  <details class="pt-0.5">
                    <summary class="cursor-pointer font-semibold text-forest-700 dark:text-[#5ED3DA]">
                      View Captured Raw Provider Payloads
                    </summary>
                    <pre class="mt-2 p-3 rounded-xl bg-night-950 text-slate-100 font-mono-tabular text-[11px] overflow-x-auto max-h-52">${escapeHtml(
                      JSON.stringify(book.sources, null, 2)
                    )}</pre>
                  </details>
                `
                : ''
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
