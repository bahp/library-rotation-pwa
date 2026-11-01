/**
 * @fileoverview Guided Book Scan & Add Wizard (`#/scan`):
 * - Clean, clutter-free top workspace (zero pre-scan `Save as:` / `For:` bars; newly added books save to
 *   `Shared` by default unless customized)
 * - Step 1: Pick how to find the book (`Scan`, `Search`, `ISBN`, or `Manual`):
 *   - `Scan`: Preserves the 3 distinct guide geometries (`barcode`, `isbn-ocr`, `cover`) + tap-frame-to-start-camera
 *   - `Search`: Title / Author lookup with direct `Wishlist` & `Add to Library` icon actions + `Options` sheet trigger
 *   - `ISBN`: Checksum-verified ISBN-13 / ISBN-10 lookup (suppresses noisy fallback warnings when a book resolves)
 *   - `Manual`: Full offline editor for unnumbered, vintage, or custom editions
 * - Step 2: Slide-up Material Design "Book Found" bottom sheet (`data-found-book-sheet="true"`) right on the page
 *   with `Re-scan`, `Love` heart icon, `Wishlist` bookmark icon, `Add to Library` plus icon, collapsible owner/status
 *   options, and `Edit Details Manually` handoff.
 */

import {
  computeOwnerInitials,
  escapeHtml,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  formatReadingStage,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeOwnersList,
} from '../../types/models.js';
import { resolveBookCardTintHex } from '../catalog/cover-color-extractor.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import {
  describeProviderProvenance,
  renderProviderAttribution,
} from '../../ui/components/provider-attribution.js';
import { AVATAR_TONES } from '../../ui/components/profile-sheets.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * @typedef {'scanner' | 'search' | 'isbn' | 'manual'} IntakeTab
 */

/** @type {Record<import('../../types/models.js').ScanMode, { label: string, caption: string, frameClass: string, hint: string }>} */
const SCAN_MODES = {
  barcode: {
    label: 'Barcode / QR',
    caption: 'EAN-13 / ISBN & Book QR',
    frameClass: 'w-60 sm:w-80 h-24 sm:h-28 rounded-xl',
    hint: 'Center a back-cover ISBN barcode or library/bookstore QR code inside the guide.',
  },
  'isbn-ocr': {
    label: 'ISBN Text',
    caption: 'Printed ISBN-13 / ISBN-10 OCR',
    frameClass: 'w-60 sm:w-80 h-12 sm:h-14 rounded-lg',
    hint: 'Align the printed "ISBN 978-..." digits inside the narrow strip.',
  },
  cover: {
    label: 'Cover',
    caption: '3:4 jacket · OCR title/ISBN handoff',
    frameClass: 'w-36 sm:w-44 h-48 sm:h-56 rounded-2xl',
    hint: 'Frame the book cover and tap Capture Cover to extract title or ISBN.',
  },
};

const SAMPLE_ISBNS = [
  { isbn: '9780140501742', label: 'Corduroy' },
  { isbn: '9780064431781', label: 'Wild Things' },
  { isbn: '9780399240461', label: 'Gruffalo' },
];

/**
 * Resolves human-readable owner summary text (e.g., `"Shared"`, `"Maya"`, `"Maya, Shared"`).
 * @param {string[]} owners
 * @param {import('../../types/models.js').ChildProfile[]} profiles
 * @returns {string}
 */
function formatOwnersSummary(owners, profiles) {
  const normalized = normalizeOwnersList(owners);
  if (normalized.length === 0) return 'Shared';
  const profileMap = new Map(profiles.map((p) => [p.id.toLowerCase(), p.name]));
  return normalized
    .map((key) => {
      const lower = key.toLowerCase();
      if (lower === 'shared') return 'Shared';
      return profileMap.get(lower) || key;
    })
    .join(', ');
}

/**
 * Renders the owner & status customization controls used inside the Found Book sheet and Manual tab.
 * @param {{
 *   profiles: import('../../types/models.js').ChildProfile[],
 *   targetStatus: import('../../types/models.js').CollectionStatus,
 *   intakeOwners: string[],
 *   intakeCondition: import('../../types/models.js').BookCondition,
 *   showStatusButtons: boolean,
 *   showConditionButtons: boolean
 * }} params
 * @returns {string}
 */
function renderIntakeCustomizationControls({
  profiles,
  targetStatus,
  intakeOwners,
  intakeCondition,
  showStatusButtons,
  showConditionButtons,
}) {
  const effectiveOwners = intakeOwners.length > 0 ? intakeOwners : ['shared'];
  const ownerChoices = [
    { key: 'shared', label: 'Shared', initial: 'S', tone: 'emerald' },
    ...profiles.map((p) => ({
      key: p.id,
      label: p.name,
      initial: computeOwnerInitials(p.name),
      tone: p.avatarTone || 'teal',
    })),
  ];

  const statusChoices = /** @type {Array<{ id: import('../../types/models.js').CollectionStatus, label: string }>} */ ([
    { id: 'owned', label: 'Owned' },
    { id: 'wishlist', label: 'Wishlist' },
  ]);

  const conditionChoices = /** @type {Array<{ id: import('../../types/models.js').BookCondition, label: string }>} */ ([
    { id: 'good', label: 'Good' },
    { id: 'torn', label: 'Torn' },
    { id: 'broken', label: 'Broken' },
    { id: 'retired', label: 'Retired' },
  ]);

  return `
    <div class="divide-y divide-linen-200/70 dark:divide-night-800/80">
      <div data-customize-row="owner" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
        <span class="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">Reader</span>
        <div class="flex flex-wrap items-center justify-end gap-1.5">
          ${ownerChoices
            .map((owner) => {
              const active = effectiveOwners.some((o) => o.toLowerCase() === owner.key.toLowerCase());
              return `
                <button
                  type="button"
                  data-action="toggle-intake-owner"
                  data-owner="${escapeHtml(owner.key)}"
                  aria-pressed="${active ? 'true' : 'false'}"
                  class="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                      : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                  }"
                >
                  <span class="w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ${
                    AVATAR_TONES[owner.tone] || AVATAR_TONES.teal
                  }">${escapeHtml(owner.initial)}</span>
                  <span>${escapeHtml(owner.label)}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>

      ${
        showStatusButtons
          ? `
            <div data-customize-row="status" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
              <span class="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">Shelf</span>
              <div class="flex flex-wrap items-center justify-end gap-1.5">
                ${statusChoices
                  .map((choice) => {
                    const active = targetStatus === choice.id;
                    return `
                      <button
                        type="button"
                        data-action="set-intake-status"
                        data-status="${choice.id}"
                        aria-pressed="${active ? 'true' : 'false'}"
                        class="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                        }"
                      >
                        ${escapeHtml(choice.label)}
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }

      ${
        showConditionButtons
          ? `
            <div data-customize-row="condition" class="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
              <span class="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">Condition</span>
              <div class="flex flex-wrap items-center justify-end gap-1.5">
                ${conditionChoices
                  .map((cond) => {
                    const active = intakeCondition === cond.id;
                    return `
                      <button
                        type="button"
                        data-action="set-intake-condition"
                        data-condition="${cond.id}"
                        aria-pressed="${active ? 'true' : 'false'}"
                        class="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                        }"
                      >
                        ${escapeHtml(cond.label)}
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
          : ''
      }
    </div>
  `;
}

/**
 * Renders the slide-up Material Design "Book Found" bottom sheet when a book is scanned, looked up, or selected.
 * @param {{
 *   candidate: import('../catalog/normalizer.js').BookCandidate | null,
 *   existingBook: import('../../types/models.js').Book | undefined,
 *   profiles: import('../../types/models.js').ChildProfile[],
 *   targetStatus: import('../../types/models.js').CollectionStatus,
 *   intakeLoved: boolean,
 *   intakeOwners: string[],
 *   intakeCondition: import('../../types/models.js').BookCondition,
 *   coverAspectRatio: import('../../types/models.js').CoverAspectRatio,
 *   dynamicCoverTint: boolean,
 *   showRawToggle: boolean
 * }} params
 * @returns {string}
 */
function renderFoundBookSheet({
  candidate,
  existingBook,
  profiles,
  targetStatus,
  intakeLoved,
  intakeOwners,
  intakeCondition,
  coverAspectRatio,
  dynamicCoverTint,
  showRawToggle,
}) {
  if (!candidate) return '';

  const pseudoBook = /** @type {import('../../types/models.js').Book} */ ({
    ...candidate,
    id: existingBook?.id || 'cand_found_preview',
    addedAt: '',
  });

  const tintHex = resolveBookCardTintHex(existingBook || pseudoBook);
  const sheetSurfaceClass = dynamicCoverTint
    ? 'lr-tinted-card bg-ivory dark:bg-night-900'
    : 'bg-ivory dark:bg-night-900';
  const sheetTintAttrs = dynamicCoverTint
    ? `data-cover-tint="${escapeHtml(tintHex)}" ${
        candidate.coverUrl ? `data-cover-tint-url="${escapeHtml(candidate.coverUrl)}"` : ''
      }`
    : '';

  const effectiveOwners = intakeOwners.length > 0 ? intakeOwners : ['shared'];
  const ownersSummary = formatOwnersSummary(effectiveOwners, profiles);
  const primarySaveStatus = targetStatus === 'wishlist' ? 'owned' : targetStatus;
  const primarySaveLabel =
    primarySaveStatus === 'owned'
      ? 'Add to Library'
      : `Save (${formatCollectionStatus(primarySaveStatus)})`;

  const existingStatus = existingBook
    ? normalizeCollectionStatus(existingBook.collectionStatus)
    : null;
  const provenanceInfo = describeProviderProvenance(candidate.sources);
  const sourceNames = provenanceInfo.summaryText;
  const hasRaw = showRawToggle && candidate.sources.some((s) => Boolean(s.rawPayload));
  const isCustomized =
    primarySaveStatus !== 'owned' ||
    intakeCondition !== 'good' ||
    !(effectiveOwners.length === 1 && effectiveOwners[0].toLowerCase() === 'shared');

  const actionsHtml = existingBook
    ? `
      <div class="rounded-2xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <p class="text-xs font-bold text-forest-900 dark:text-white">
            ${
              existingStatus === 'owned'
                ? 'Already in your Family Library'
                : `Currently saved in ${escapeHtml(formatCollectionStatus(existingStatus || 'wishlist'))}`
            }
          </p>
          <p class="text-[11px] text-stone-ink dark:text-slate-400">
            Tap Inspect to edit details or Re-scan for another book.
          </p>
        </div>
        <div class="flex items-center gap-2">
          ${
            existingStatus !== 'owned'
              ? `
                <button
                  type="button"
                  data-action="upgrade-existing-owned"
                  data-book-id="${escapeHtml(existingBook.id)}"
                  class="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                >
                  Mark Owned
                </button>
              `
              : ''
          }
          <button
            type="button"
            data-action="inspect-book"
            data-book-id="${escapeHtml(existingBook.id)}"
            class="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors whitespace-nowrap"
          >
            Open Book
          </button>
        </div>
      </div>
    `
    : `
      <!-- Clear Icon Actions: Love, Wishlist, Add to Library -->
      <div class="grid grid-cols-12 gap-2">
        <button
          type="button"
          data-action="toggle-intake-loved"
          aria-pressed="${intakeLoved ? 'true' : 'false'}"
          aria-label="${intakeLoved ? 'Remove Loved mark' : 'Mark as Loved favorite'}"
          title="Mark as Loved"
          class="col-span-3 min-h-[48px] px-2.5 py-2 rounded-2xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-colors ${
            intakeLoved
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white border border-linen-200 dark:border-night-700'
          }"
        >
          ${renderIcon(intakeLoved ? 'heartFilled' : 'heart', 'w-4 h-4')}
          <span>${intakeLoved ? 'Loved' : 'Love'}</span>
        </button>

        <button
          type="button"
          data-action="save-found-wishlist"
          aria-label="Save ${escapeHtml(candidate.title)} to Wishlist"
          title="Save to Wishlist"
          class="col-span-4 min-h-[48px] px-3 py-2 rounded-2xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-espresso-800 dark:text-amber-200 flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-colors"
        >
          ${renderIcon('bookmark', 'w-4 h-4')}
          <span>Wishlist</span>
        </button>

        <button
          type="button"
          data-action="save-found-library"
          aria-label="${escapeHtml(primarySaveLabel)} for ${escapeHtml(candidate.title)}"
          class="col-span-5 min-h-[48px] px-3.5 py-2 rounded-2xl bg-forest-700 hover:bg-forest-800 text-xs sm:text-sm font-semibold text-white flex flex-col sm:flex-row items-center justify-center gap-1.5 shadow-xs transition-colors"
        >
          ${renderIcon('plus', 'w-4 h-4')}
          <span>${escapeHtml(primarySaveLabel)}</span>
        </button>
      </div>

      <!-- Progressive Disclosure for Reader Owner, Loan Status, Condition & Manual Edit -->
      <details ${isCustomized ? 'open' : ''} class="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5">
        <summary class="cursor-pointer list-none flex items-center justify-between gap-2 text-xs select-none">
          <span class="text-stone-ink dark:text-slate-300">
            Saving for <strong class="font-semibold text-forest-900 dark:text-white">${escapeHtml(
              ownersSummary
            )}</strong> · <strong class="font-semibold text-forest-900 dark:text-white">${escapeHtml(
              formatCollectionStatus(primarySaveStatus)
            )}</strong>${
              intakeCondition !== 'good'
                ? ` · ${escapeHtml(formatBookCondition(intakeCondition))}`
                : ''
            }
          </span>
          <span class="font-semibold text-forest-700 dark:text-[#5ED3DA] shrink-0">Customize</span>
        </summary>

        <div class="mt-3 pt-2.5 border-t border-linen-200/80 dark:border-night-800 space-y-3">
          ${renderIntakeCustomizationControls({
            profiles,
            targetStatus,
            intakeOwners: effectiveOwners,
            intakeCondition,
            showStatusButtons: true,
            showConditionButtons: true,
          })}

          <div class="pt-1 flex items-center justify-end">
            <button
              type="button"
              data-action="edit-found-book-manual"
              class="min-h-[38px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors"
            >
              ${renderIcon('edit', 'w-3.5 h-3.5')}
              <span>Edit Details Manually</span>
            </button>
          </div>
        </div>
      </details>
    `;

  return `
    <div
      data-found-book-sheet="true"
      data-backdrop-action="close-found-book-sheet"
      class="sheet-backdrop fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="found-book-sheet-title"
    >
      <div
        class="animate-sheet-up w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl ${sheetSurfaceClass} border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
        ${sheetTintAttrs}
      >
        <div class="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true"></div>

        <!-- Top Bar: Book Found + Re-scan + Close -->
        <div class="px-5 pt-3 pb-3 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <span class="inline-flex items-center gap-1.5 text-xs font-bold text-forest-700 dark:text-[#5ED3DA]">
            ${renderIcon('check', 'w-4 h-4')}
            <span>Book Found</span>
          </span>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-action="rescan-book"
              class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              ${renderIcon('barcode', 'w-4 h-4')}
              <span>Re-scan</span>
            </button>
            <button
              type="button"
              data-action="close-found-book-sheet"
              aria-label="Close found book sheet"
              class="min-h-[40px] min-w-[40px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center"
            >
              ${renderIcon('close', 'w-4 h-4')}
            </button>
          </div>
        </div>

        <!-- Retrieved Book Details & Actions -->
        <div class="p-5 overflow-y-auto space-y-4">
          <div class="flex items-start gap-4 min-w-0">
            <div class="shrink-0">
              ${renderBookCover(pseudoBook, 'md', coverAspectRatio)}
            </div>

            <div class="min-w-0 flex-1">
              <h2 id="found-book-sheet-title" class="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white leading-snug">
                ${escapeHtml(candidate.title)}
              </h2>
              <p class="text-xs sm:text-sm font-medium text-stone-ink dark:text-slate-300 mt-0.5">
                ${escapeHtml(candidate.authors.join(', ') || 'Unknown Author')}
              </p>

              <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400 mt-2">
                <span>Ages ${candidate.ageMin}–${candidate.ageMax}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(formatReadingStage(candidate.readingStage))}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(formatBookBinding(candidate.format))}</span>
                ${
                  candidate.publishedYear
                    ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${candidate.publishedYear}</span>`
                    : ''
                }
              </div>

              ${
                candidate.isbn13
                  ? `<p class="text-[11px] font-mono-tabular text-stone-ink dark:text-slate-400 mt-1">ISBN ${escapeHtml(
                      candidate.isbn13
                    )}</p>`
                  : ''
              }

              <div class="mt-1.5">
                ${renderProviderAttribution(candidate.sources, { prefix: 'Source:' })}
              </div>

              ${
                candidate.tags.length > 0
                  ? `<p class="text-[11px] font-medium text-forest-700 dark:text-[#5ED3DA] mt-1.5">Topics: ${escapeHtml(
                      candidate.tags.join(' · ')
                    )}</p>`
                  : ''
              }
            </div>
          </div>

          ${actionsHtml}

          ${
            hasRaw
              ? `
                <details class="text-xs text-stone-ink dark:text-slate-400 pt-1">
                  <summary class="cursor-pointer font-semibold hover:text-forest-900 dark:hover:text-white">
                    Raw Provider Payload (${escapeHtml(sourceNames)})
                  </summary>
                  <pre class="mt-2 p-3 rounded-xl bg-night-950 text-ivory font-mono-tabular text-[11px] overflow-x-auto max-h-44">${escapeHtml(
                    JSON.stringify(
                      candidate.sources.map((s) => ({
                        provider: s.provider,
                        rawPayload: s.rawPayload,
                      })),
                      null,
                      2
                    )
                  )}</pre>
                </details>
              `
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders a compact Search result candidate row with crisp Wishlist, Add to Library, and Options icon buttons.
 * @param {{
 *   candidate: import('../catalog/normalizer.js').BookCandidate,
 *   index: number,
 *   existingBook: import('../../types/models.js').Book | undefined,
 *   showRawToggle: boolean,
 *   coverAspectRatio: import('../../types/models.js').CoverAspectRatio
 * }} params
 * @returns {string}
 */
function renderCandidateRow({
  candidate,
  index,
  existingBook,
  showRawToggle,
  coverAspectRatio,
}) {
  const pseudoBook = /** @type {import('../../types/models.js').Book} */ ({
    ...candidate,
    id: `cand_${index}`,
    addedAt: '',
  });

  const sourceNames = describeProviderProvenance(candidate.sources).summaryText;
  const hasRaw = showRawToggle && candidate.sources.some((s) => Boolean(s.rawPayload));
  const existingStatus = existingBook
    ? normalizeCollectionStatus(existingBook.collectionStatus)
    : null;

  return `
    <article class="py-3.5 first:pt-1 border-b border-linen-200/80 dark:border-night-800 last:border-b-0 flex flex-col gap-2.5">
      <div class="flex items-start gap-3 min-w-0">
        <button
          type="button"
          data-action="open-candidate-sheet"
          data-candidate-index="${index}"
          aria-label="Preview ${escapeHtml(candidate.title)}"
          class="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-forest-700"
        >
          ${renderBookCover(pseudoBook, 'sm', coverAspectRatio)}
        </button>

        <div class="min-w-0 flex-1">
          <button
            type="button"
            data-action="open-candidate-sheet"
            data-candidate-index="${index}"
            class="text-left block w-full focus-visible:outline-2 focus-visible:outline-forest-700 rounded"
          >
            <h3 class="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white leading-snug">
              ${escapeHtml(candidate.title)}
            </h3>
            <p class="text-xs text-stone-ink dark:text-slate-300 mt-0.5 truncate">
              ${escapeHtml(candidate.authors.join(', '))}
            </p>
          </button>

          <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400 mt-1">
            <span>Ages ${candidate.ageMin}–${candidate.ageMax}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(formatBookBinding(candidate.format))}</span>
            ${
              candidate.publishedYear
                ? `<span aria-hidden="true">·</span><span class="font-mono-tabular">${candidate.publishedYear}</span>`
                : ''
            }
            <span aria-hidden="true">·</span>
            ${renderProviderAttribution(candidate.sources)}
          </div>

          ${
            candidate.tags.length
              ? `<p class="text-[11px] text-forest-700 dark:text-[#5ED3DA] mt-0.5 truncate">Topics: ${escapeHtml(
                  candidate.tags.join(' · ')
                )}</p>`
              : ''
          }
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        ${
          existingBook
            ? existingStatus !== 'owned'
              ? `
                <span class="text-xs font-semibold text-amber-800 dark:text-amber-300 px-2 py-1">
                  In ${escapeHtml(formatCollectionStatus(existingStatus || 'wishlist'))}
                </span>
                <button
                  type="button"
                  data-action="upgrade-existing-owned"
                  data-book-id="${escapeHtml(existingBook.id)}"
                  class="min-h-[40px] px-3 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                >
                  Mark Owned
                </button>
              `
              : `<span class="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] px-2 py-1">Already in Library</span>`
            : `
              <button
                type="button"
                data-action="open-candidate-sheet"
                data-candidate-index="${index}"
                aria-label="More save options for ${escapeHtml(candidate.title)}"
                title="Choose reader, Love, or edit manually"
                class="min-h-[42px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors whitespace-nowrap"
              >
                Options
              </button>
              <button
                type="button"
                data-action="add-candidate-wishlist"
                data-candidate-index="${index}"
                aria-label="Save ${escapeHtml(candidate.title)} to Wishlist"
                title="Save to Wishlist"
                class="min-h-[42px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-espresso-800 dark:text-amber-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('bookmark', 'w-3.5 h-3.5')}
                <span>Wishlist</span>
              </button>
              <button
                type="button"
                data-action="add-candidate"
                data-candidate-index="${index}"
                aria-label="Add ${escapeHtml(candidate.title)} to Library"
                class="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('plus', 'w-4 h-4')}
                <span>Add to Library</span>
              </button>
            `
        }
      </div>

      ${
        hasRaw
          ? `
            <details class="text-xs text-stone-ink dark:text-slate-400 pt-0.5">
              <summary class="cursor-pointer font-semibold hover:text-forest-900 dark:hover:text-white">
                Raw Provider Payload (${escapeHtml(sourceNames)})
              </summary>
              <pre class="mt-2 p-3 rounded-xl bg-night-950 text-ivory font-mono-tabular text-[11px] overflow-x-auto max-h-52">${escapeHtml(
                JSON.stringify(
                  candidate.sources.map((s) => ({
                    provider: s.provider,
                    rawPayload: s.rawPayload,
                  })),
                  null,
                  2
                )
              )}</pre>
            </details>
          `
          : ''
      }
    </article>
  `;
}

/**
 * Renders the warm editorial Camera & Gallery Upload Scanner panel.
 * Tapping directly on the idle barcode/scanner viewport area starts the live camera.
 *
 * @param {{
 *   uiState: {
 *     scanMode: import('../../types/models.js').ScanMode,
 *     isbnLoading?: boolean,
 *     isbnInput?: string,
 *     isbnNotFound?: string,
 *     isbnError?: string
 *   },
 *   scannerState: ReturnType<ReturnType<typeof import('./scanner-controller.js').createScannerController>['getState']>
 * }} params
 * @returns {string}
 */
function renderScannerPanel({ uiState, scannerState }) {
  const activeMode = SCAN_MODES[uiState.scanMode] || SCAN_MODES.barcode;
  const isLocked = scannerState.phase === 'locked' && Boolean(scannerState.lock);
  const isStreaming = scannerState.phase === 'streaming';
  const isStarting = scannerState.phase === 'starting-camera';
  const isAnalyzingUpload = scannerState.phase === 'analyzing-upload';
  const isActiveSweep = isStreaming || isAnalyzingUpload;
  const canTapViewportToStart = !isStreaming && !isStarting && !isAnalyzingUpload;

  const modeTabsHtml = /** @type {Array<import('../../types/models.js').ScanMode>} */ ([
    'barcode',
    'isbn-ocr',
    'cover',
  ])
    .map((modeKey) => {
      const selected = uiState.scanMode === modeKey;
      return `
        <button
          type="button"
          data-action="select-scan-mode"
          data-scan-mode="${modeKey}"
          aria-pressed="${selected ? 'true' : 'false'}"
          class="flex-1 min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
            selected
              ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-xs'
              : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(SCAN_MODES[modeKey].label)}
        </button>
      `;
    })
    .join('');

  const frameBorderClasses = isLocked
    ? 'border-emerald-400 bg-emerald-950/30 shadow-[0_0_0_4px_rgba(16,185,129,0.28)]'
    : isActiveSweep
      ? 'border-[#5ED3DA] shadow-[0_0_0_9999px_rgba(14,22,24,0.52)]'
      : 'border-[#FAF6EE]/80 group-hover:border-[#5ED3DA] shadow-[0_0_0_9999px_rgba(14,22,24,0.40)]';

  const sweepLineClasses = isLocked
    ? 'bg-emerald-400 top-1/2 -translate-y-1/2 h-0.5 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
    : isActiveSweep
      ? 'bg-[#5ED3DA] top-0 h-0.5 shadow-[0_0_12px_rgba(94,211,218,0.95)] animate-scan-sweep'
      : 'bg-[#FAF6EE]/35 top-1/2 -translate-y-1/2 h-px';

  let lockReadoutText = canTapViewportToStart
    ? `Tap to Scan · ${activeMode.label}`
    : activeMode.label;
  if (uiState.isbnLoading) {
    lockReadoutText = `FETCHING ISBN ${uiState.isbnInput || ''}…`;
  } else if (isLocked && scannerState.lock) {
    lockReadoutText =
      scannerState.lock.kind === 'isbn'
        ? `FOUND · ISBN ${scannerState.lock.isbn13}`
        : `FOUND · "${scannerState.lock.titleQuery}"`;
  } else if (isAnalyzingUpload) {
    lockReadoutText = 'SCANNING PHOTO…';
  } else if (isStarting) {
    lockReadoutText = 'STARTING CAMERA…';
  }

  const viewportInnerHtml = `
    ${
      isStreaming || isStarting
        ? `<video
            id="scanner-live-video"
            autoplay
            muted
            playsinline
            class="absolute inset-0 w-full h-full object-cover"
          ></video>`
        : ''
    }

    ${
      scannerState.uploadedPreviewUrl
        ? `<img
            src="${escapeHtml(scannerState.uploadedPreviewUrl)}"
            alt="Uploaded book scan preview"
            class="absolute inset-0 w-full h-full object-contain bg-night-950"
          />`
        : ''
    }

    <div
      data-scan-guide="${escapeHtml(uiState.scanMode)}"
      data-scan-locked="${isLocked ? 'true' : 'false'}"
      class="relative z-10 flex items-center justify-center border-2 ${frameBorderClasses} ${activeMode.frameClass} transition-all duration-150 overflow-hidden"
    >
      <div class="absolute inset-x-2 ${sweepLineClasses}"></div>

      <span class="px-2.5 py-1 rounded-lg bg-night-950/80 text-[11px] font-mono-tabular tracking-wide inline-flex items-center gap-1.5 text-center ${
        isLocked ? 'text-emerald-300 font-semibold' : 'text-[#FAF6EE]'
      }">
        ${canTapViewportToStart && !isLocked ? renderIcon('camera', 'w-3.5 h-3.5') : ''}
        <span>${escapeHtml(lockReadoutText)}</span>
      </span>
    </div>

    <span class="relative z-10 mt-3 px-3 py-1 rounded-lg bg-night-950/75 text-[11px] text-[#FAF6EE]/90 text-center max-w-sm">
      ${escapeHtml(activeMode.hint)}
    </span>
  `;

  const viewportHtml = canTapViewportToStart
    ? `
      <button
        type="button"
        data-action="start-camera-scan"
        aria-label="Start camera in ${escapeHtml(activeMode.label)} mode"
        class="group w-full relative h-60 sm:h-72 rounded-2xl bg-night-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-linen-200 dark:border-night-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.995]"
      >
        ${viewportInnerHtml}
      </button>
    `
    : `
      <div class="w-full relative h-60 sm:h-72 rounded-2xl bg-night-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-linen-200 dark:border-night-700">
        ${viewportInnerHtml}
      </div>
    `;

  const scanNotFoundHtml =
    !uiState.isbnLoading && uiState.isbnNotFound
      ? `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              Scanned ISBN <span class="font-mono-tabular">${escapeHtml(
                uiState.isbnNotFound
              )}</span> wasn’t in online catalogs
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Finish adding it manually with the ISBN pre-filled, or tap Re-scan.
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-action="rescan-book"
              class="min-h-[42px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white whitespace-nowrap"
            >
              Re-scan
            </button>
            <button
              type="button"
              data-action="prefill-manual-isbn"
              data-isbn="${escapeHtml(uiState.isbnNotFound)}"
              class="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold whitespace-nowrap"
            >
              Complete Manually
            </button>
          </div>
        </div>
      `
      : '';

  const support = scannerState.support;
  const compatibilityDetailsHtml = support
    ? `
      <details class="text-xs text-stone-ink dark:text-slate-400 pt-1">
        <summary class="cursor-pointer font-medium hover:text-forest-900 dark:hover:text-white select-none">
          Scanner compatibility · ${escapeHtml(support.barcodeEngineLabel)}
        </summary>
        <div class="mt-2 space-y-1 text-[11px] leading-relaxed">
          <p>
            Camera API: <strong class="text-forest-900 dark:text-white">${
              support.cameraApi ? 'Available' : 'Fallback to Upload'
            }</strong> ·
            Barcode: <strong class="text-forest-900 dark:text-white">${escapeHtml(
              support.barcodeEngineLabel
            )}</strong> ·
            OCR: <strong class="text-forest-900 dark:text-white">${
              support.webAssembly ? 'Tesseract WASM Ready' : 'Unavailable'
            }</strong>
          </p>
          <p>
            Chrome/Android use hardware <code>BarcodeDetector</code>; iOS Safari, Firefox, and desktop browsers fall back to pure-JS ZXing + Tesseract WebAssembly OCR.
          </p>
        </div>
      </details>
    `
    : '';

  return `
    <section aria-label="Camera and photo scanner" class="space-y-3">
      <!-- Compact 3-Mode Frame Switcher (Barcode, ISBN Text, Cover) -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex flex-1 items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 max-w-md">
          ${modeTabsHtml}
        </div>
        <span class="hidden sm:inline text-xs text-stone-ink dark:text-slate-400">
          ${escapeHtml(activeMode.caption)}
        </span>
      </div>

      <!-- Tap-to-Start Barcode / OCR / Cover Viewport -->
      ${viewportHtml}

      <!-- Concise Live Status -->
      <div class="flex items-center justify-between gap-2 text-xs">
        <p role="status" aria-live="polite" class="font-medium truncate ${
          isLocked
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-forest-900 dark:text-slate-300'
        }">
          ${escapeHtml(
            uiState.isbnLoading
              ? `Looking up ISBN ${uiState.isbnInput || ''}…`
              : scannerState.statusMessage
          )}
        </p>
        <span class="sm:hidden text-[11px] text-stone-ink dark:text-slate-400 shrink-0">
          ${escapeHtml(activeMode.caption)}
        </span>
      </div>

      ${
        scannerState.ignoredHint
          ? `<p class="text-xs text-amber-800 dark:text-amber-300">${escapeHtml(
              scannerState.ignoredHint
            )}</p>`
          : ''
      }

      ${scanNotFoundHtml}

      ${
        scannerState.errorMessage || uiState.isbnError
          ? `
            <div role="alert" class="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <p class="text-xs font-medium text-rose-800 dark:text-rose-200">
                ${escapeHtml(scannerState.errorMessage || uiState.isbnError || '')}
              </p>
              <button
                type="button"
                data-action="select-intake-tab"
                data-intake-tab="isbn"
                class="min-h-[40px] px-3 py-1.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white whitespace-nowrap shrink-0"
              >
                Type ISBN
              </button>
            </div>
          `
          : ''
      }

      <!-- Compact Camera & Photo Controls -->
      <div class="flex flex-wrap items-center gap-2.5">
        ${
          isStreaming
            ? `
              <button
                type="button"
                data-action="stop-camera-scan"
                class="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('close', 'w-4 h-4')}
                Stop
              </button>
              ${
                uiState.scanMode === 'cover' || uiState.scanMode === 'isbn-ocr'
                  ? `
                    <button
                      type="button"
                      data-action="capture-live-frame"
                      class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      ${renderIcon('camera', 'w-4 h-4')}
                      ${uiState.scanMode === 'cover' ? 'Capture Cover' : 'Read ISBN'}
                    </button>
                  `
                  : ''
              }
              <button
                type="button"
                data-action="flip-camera"
                class="min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('flip', 'w-4 h-4')}
                Flip
              </button>
            `
            : `
              <button
                type="button"
                data-action="start-camera-scan"
                ${isStarting || isAnalyzingUpload ? 'disabled' : ''}
                class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                ${renderIcon('camera', 'w-4 h-4')}
                ${isStarting ? 'Starting…' : 'Start Camera'}
              </button>
            `
        }

        <label
          for="scan-photo-upload-input"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          ${renderIcon('photo', 'w-4 h-4')}
          Upload Photo
          <input
            id="scan-photo-upload-input"
            type="file"
            accept="image/*"
            class="sr-only"
          />
        </label>

        ${
          isLocked || scannerState.uploadedPreviewUrl
            ? `
              <button
                type="button"
                data-action="reset-scanner"
                class="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white transition-colors whitespace-nowrap"
              >
                Clear
              </button>
            `
            : ''
        }
      </div>

      ${compatibilityDetailsHtml}
    </section>
  `;
}

/**
 * Renders the guided Scan & Add Books view and slide-up Found Book bottom sheet.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   uiState: {
 *     intakeTab: IntakeTab,
 *     intakeTargetStatus?: import('../../types/models.js').CollectionStatus,
 *     intakeLoved?: boolean,
 *     intakeOwners?: string[],
 *     intakeCondition?: import('../../types/models.js').BookCondition,
 *     activeCandidate?: import('../catalog/normalizer.js').BookCandidate | null,
 *     isFoundSheetOpen?: boolean,
 *     isbnInput: string,
 *     isbnLoading: boolean,
 *     isbnError: string,
 *     isbnNotFound: string,
 *     isbnCandidate: import('../catalog/normalizer.js').BookCandidate | null,
 *     isbnProviderWarnings: string[],
 *     lastScanLockBanner: string,
 *     titleQuery: string,
 *     authorQuery: string,
 *     searchLoading: boolean,
 *     searchError: string,
 *     searchHasRun: boolean,
 *     searchCandidates: import('../catalog/normalizer.js').BookCandidate[],
 *     searchProviderWarnings: string[],
 *     manualDraft: {
 *       title: string,
 *       authors: string,
 *       isbn: string,
 *       publishedYear: string,
 *       pageCount: string,
 *       coverUrl: string,
 *       format: import('../../types/models.js').BookFormat,
 *       readingStage: import('../../types/models.js').ReadingStage,
 *       ageMin: number,
 *       ageMax: number,
 *       tags: string,
 *       condition?: import('../../types/models.js').BookCondition,
 *       customOwners?: string,
 *       sources?: import('../../types/models.js').ProviderSource[]
 *     },
 *     scanMode: import('../../types/models.js').ScanMode,
 *     formError: string
 *   },
 *   scannerState: ReturnType<ReturnType<typeof import('./scanner-controller.js').createScannerController>['getState']>
 * }} params
 * @returns {string}
 */
export function renderScanShellView({ state, uiState, scannerState }) {
  const existingByIsbn = new Map(
    state.books.filter((b) => Boolean(b.isbn13)).map((b) => [b.isbn13, b])
  );
  const targetStatus = normalizeCollectionStatus(uiState.intakeTargetStatus);
  const intakeLoved = Boolean(uiState.intakeLoved);
  const intakeOwners = normalizeOwnersList(uiState.intakeOwners);
  const intakeCondition = normalizeBookCondition(uiState.intakeCondition);

  const tabs = /** @type {Array<{ id: IntakeTab, label: string }>} */ ([
    { id: 'scanner', label: 'Scan' },
    { id: 'search', label: 'Search' },
    { id: 'isbn', label: 'ISBN' },
    { id: 'manual', label: 'Manual' },
  ]);

  const intakeTabsHtml = tabs
    .map((tab) => {
      const selected = uiState.intakeTab === tab.id;
      return `
        <button
          type="button"
          data-action="select-intake-tab"
          data-intake-tab="${tab.id}"
          aria-pressed="${selected ? 'true' : 'false'}"
          class="flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
            selected
              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(tab.label)}
        </button>
      `;
    })
    .join('');

  const scanHandoffBannerHtml = uiState.lastScanLockBanner
    ? `
      <div class="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 px-4 py-3 flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-emerald-900 dark:text-emerald-200">
          ${escapeHtml(uiState.lastScanLockBanner)}
        </p>
        <button
          type="button"
          data-action="scan-another-book"
          class="min-h-[38px] px-3 py-1.5 rounded-xl bg-ivory dark:bg-night-900 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0"
        >
          Scan Another
        </button>
      </div>
    `
    : '';

  let activePanelHtml = '';

  if (uiState.intakeTab === 'scanner') {
    activePanelHtml = renderScannerPanel({ uiState, scannerState });
  } else if (uiState.intakeTab === 'search') {
    let resultsAreaHtml = '';
    if (uiState.searchLoading) {
      resultsAreaHtml = `
        <div role="status" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-6 text-center">
          <p class="text-sm font-medium text-forest-900 dark:text-white">
            Searching Google Books & Open Library…
          </p>
        </div>
      `;
    } else if (uiState.searchError) {
      resultsAreaHtml = `
        <div role="alert" class="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p class="text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
            ${escapeHtml(uiState.searchError)}
          </p>
          <button
            type="button"
            data-action="select-intake-tab"
            data-intake-tab="manual"
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-ivory dark:bg-night-900 text-xs font-semibold text-forest-900 dark:text-white border border-linen-200 dark:border-night-700 whitespace-nowrap shrink-0"
          >
            Manual Form
          </button>
        </div>
      `;
    } else if (uiState.searchCandidates.length > 0) {
      resultsAreaHtml = `
        <div class="flex items-center justify-between text-xs text-stone-ink dark:text-slate-400">
          <span>Tap Wishlist or Add to Library (saves to Shared by default)</span>
          <span class="font-mono-tabular shrink-0">${uiState.searchCandidates.length} found</span>
        </div>
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-1">
          ${uiState.searchCandidates
            .map((candidate, index) =>
              renderCandidateRow({
                candidate,
                index,
                existingBook: candidate.isbn13 ? existingByIsbn.get(candidate.isbn13) : undefined,
                showRawToggle: state.settings.retainRawProviderPayloads,
                coverAspectRatio: state.settings.coverAspectRatio,
              })
            )
            .join('')}
        </div>
      `;
    } else if (uiState.searchHasRun) {
      resultsAreaHtml = `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-6 text-center">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            No matching books found
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-1">
            Try fewer title keywords or add the book in the Manual tab.
          </p>
        </div>
      `;
    } else {
      resultsAreaHtml = `
        <p class="text-xs text-stone-ink dark:text-slate-400">
          Searches Google Books and Open Library together with automatic ISBN deduplication.
        </p>
      `;
    }

    activePanelHtml = `
      <section aria-label="Search by title or author" class="space-y-3.5">
        <form id="provider-search-form" class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div class="sm:col-span-6">
            <label for="provider-title-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
              Title or Keywords
            </label>
            <input
              id="provider-title-input"
              name="query"
              type="search"
              value="${escapeHtml(uiState.titleQuery)}"
              placeholder="e.g., Stellaluna, Corduroy"
              class="w-full h-12 px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
          <div class="sm:col-span-4">
            <label for="provider-author-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
              Author (optional)
            </label>
            <input
              id="provider-author-input"
              name="author"
              type="search"
              value="${escapeHtml(uiState.authorQuery)}"
              placeholder="e.g., Arnold Lobel"
              class="w-full h-12 px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
          <div class="sm:col-span-2 flex items-end">
            <button
              type="submit"
              class="w-full h-12 px-4 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </form>

        ${resultsAreaHtml}
      </section>
    `;
  } else if (uiState.intakeTab === 'isbn') {
    const sampleButtonsHtml = SAMPLE_ISBNS.map(
      (item) => `
        <button
          type="button"
          data-action="fill-sample-isbn"
          data-isbn="${item.isbn}"
          class="min-h-[36px] px-2.5 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-medium text-forest-900 dark:text-white transition-colors whitespace-nowrap"
        >
          ${escapeHtml(item.label)} (${item.isbn})
        </button>
      `
    ).join('');

    let isbnResultHtml = '';
    if (uiState.isbnLoading) {
      isbnResultHtml = `
        <div role="status" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 text-center">
          <p class="text-sm font-medium text-forest-900 dark:text-white">
            Verifying ISBN checksum & fetching metadata…
          </p>
        </div>
      `;
    } else if (uiState.isbnError) {
      isbnResultHtml = `
        <div role="alert" class="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs sm:text-sm font-medium text-rose-800 dark:text-rose-200">
          ${escapeHtml(uiState.isbnError)}
        </div>
      `;
    } else if (uiState.isbnCandidate) {
      isbnResultHtml = `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-1">
          ${renderCandidateRow({
            candidate: uiState.isbnCandidate,
            index: -1,
            existingBook: uiState.isbnCandidate.isbn13
              ? existingByIsbn.get(uiState.isbnCandidate.isbn13)
              : undefined,
            showRawToggle: state.settings.retainRawProviderPayloads,
            coverAspectRatio: state.settings.coverAspectRatio,
          })}
        </div>
      `;
    } else if (uiState.isbnNotFound) {
      isbnResultHtml = `
        <div class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              No external record for ISBN <span class="font-mono-tabular">${escapeHtml(
                uiState.isbnNotFound
              )}</span>
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Valid check digit — finish adding this edition manually with the ISBN pre-filled.
            </p>
          </div>
          <button
            type="button"
            data-action="prefill-manual-isbn"
            data-isbn="${escapeHtml(uiState.isbnNotFound)}"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Complete Manually
          </button>
        </div>
      `;
    }

    activePanelHtml = `
      <section aria-label="Lookup by ISBN" class="space-y-3.5">
        <form id="isbn-lookup-form" class="flex flex-col sm:flex-row gap-2.5">
          <div class="flex-1">
            <label for="isbn-lookup-input" class="sr-only">ISBN-13 or ISBN-10</label>
            <input
              id="isbn-lookup-input"
              name="isbn"
              type="text"
              inputmode="text"
              value="${escapeHtml(uiState.isbnInput)}"
              placeholder="Enter ISBN (e.g., 978-0-14-050174-2)"
              class="w-full h-12 px-4 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>
          <button
            type="submit"
            class="h-12 px-5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            Look Up ISBN
          </button>
        </form>

        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-xs text-stone-ink dark:text-slate-400">Sample ISBNs:</span>
          ${sampleButtonsHtml}
        </div>

        ${isbnResultHtml}
      </section>
    `;
  } else {
    const draft = uiState.manualDraft;
    const effectiveOwners = intakeOwners.length > 0 ? intakeOwners : ['shared'];
    const provenanceNote =
      draft.sources && draft.sources.length > 0
        ? `<div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-forest-700 dark:text-[#5ED3DA]"><span>Pre-filled from</span>${renderProviderAttribution(
            draft.sources
          )}<span>— review any field before saving.</span></div>`
        : `<p class="text-xs text-stone-ink dark:text-slate-400">Add vintage, unnumbered, or custom books offline (saves to Shared by default).</p>`;

    activePanelHtml = `
      <section aria-labelledby="manual-intake-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-4">
        <div class="pb-3 border-b border-linen-200 dark:border-night-800 flex items-start justify-between gap-3">
          <div>
            <h2 id="manual-intake-heading" class="font-display text-lg font-bold text-forest-900 dark:text-white">
              Manual Book Entry
            </h2>
            ${provenanceNote}
          </div>
          <button
            type="button"
            data-action="clear-manual-draft"
            class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Clear
          </button>
        </div>

        ${
          uiState.formError
            ? `
              <div role="alert" class="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-4 py-3 text-xs font-medium text-rose-800 dark:text-rose-200">
                ${escapeHtml(uiState.formError)}
              </div>
            `
            : ''
        }

        <form id="manual-book-form" class="space-y-3.5" novalidate>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div class="sm:col-span-2">
              <label for="book-title" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Book Title *
              </label>
              <input
                id="book-title"
                name="title"
                type="text"
                required
                value="${escapeHtml(draft.title)}"
                placeholder="e.g., Make Way for Ducklings"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-authors" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Author(s) (comma-separated)
              </label>
              <input
                id="book-authors"
                name="authors"
                type="text"
                value="${escapeHtml(draft.authors)}"
                placeholder="e.g., Robert McCloskey"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-isbn" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                ISBN-13 or ISBN-10 (optional)
              </label>
              <input
                id="book-isbn"
                name="isbn"
                type="text"
                inputmode="text"
                value="${escapeHtml(draft.isbn)}"
                placeholder="978-0-670-45149-4"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-year" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Published Year
              </label>
              <input
                id="book-year"
                name="publishedYear"
                type="number"
                min="1800"
                max="2100"
                value="${escapeHtml(draft.publishedYear)}"
                placeholder="1941"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-pages" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Page Count
              </label>
              <input
                id="book-pages"
                name="pageCount"
                type="number"
                min="1"
                max="2000"
                value="${escapeHtml(draft.pageCount)}"
                placeholder="64"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-format" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Binding Format
              </label>
              <select
                id="book-format"
                name="format"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="hardcover" ${draft.format === 'hardcover' ? 'selected' : ''}>Hardcover</option>
                <option value="board-book" ${draft.format === 'board-book' ? 'selected' : ''}>Board Book</option>
                <option value="paperback" ${draft.format === 'paperback' ? 'selected' : ''}>Paperback</option>
              </select>
            </div>

            <div>
              <label for="book-stage" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Reading Stage
              </label>
              <select
                id="book-stage"
                name="readingStage"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="picture-book" ${draft.readingStage === 'picture-book' ? 'selected' : ''}>Picture Book</option>
                <option value="board-toddler" ${draft.readingStage === 'board-toddler' ? 'selected' : ''}>Board & Toddler</option>
                <option value="early-reader" ${draft.readingStage === 'early-reader' ? 'selected' : ''}>Early Reader</option>
                <option value="chapter-book" ${draft.readingStage === 'chapter-book' ? 'selected' : ''}>Chapter Book</option>
              </select>
            </div>

            <div>
              <label for="book-age-min" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Min Age (years)
              </label>
              <input
                id="book-age-min"
                name="ageMin"
                type="number"
                min="0"
                max="14"
                value="${draft.ageMin}"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-age-max" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Max Age (years)
              </label>
              <input
                id="book-age-max"
                name="ageMax"
                type="number"
                min="1"
                max="16"
                value="${draft.ageMax}"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div class="sm:col-span-2">
              <label for="book-cover-url" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                HTTPS Cover Image URL (optional)
              </label>
              <input
                id="book-cover-url"
                name="coverUrl"
                type="url"
                value="${escapeHtml(draft.coverUrl)}"
                placeholder="https://covers.openlibrary.org/..."
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div>
              <label for="book-condition" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Book Condition / State
              </label>
              <select
                id="book-condition"
                name="condition"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="good" ${normalizeBookCondition(draft.condition) === 'good' ? 'selected' : ''}>Good</option>
                <option value="torn" ${normalizeBookCondition(draft.condition) === 'torn' ? 'selected' : ''}>Torn (needs tape)</option>
                <option value="broken" ${normalizeBookCondition(draft.condition) === 'broken' ? 'selected' : ''}>Broken (hold from shelf)</option>
                <option value="retired" ${normalizeBookCondition(draft.condition) === 'retired' ? 'selected' : ''}>Retired / Outgrown</option>
              </select>
            </div>

            <div>
              <label for="book-custom-owners" class="block text-xs font-semibold text-forest-900 dark:text-slate-300 mb-1">
                Extra Owners (optional, comma-separated)
              </label>
              <input
                id="book-custom-owners"
                name="customOwners"
                type="text"
                value="${escapeHtml(draft.customOwners || '')}"
                placeholder="e.g., Grandma's House, Cousin Maya"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div class="sm:col-span-2">
              <div class="flex items-center justify-between gap-2 mb-1">
                <label for="book-tags" class="block text-xs font-semibold text-forest-900 dark:text-slate-300">
                  Topics & Themes (comma-separated)
                </label>
                <button
                  type="button"
                  data-action="suggest-draft-tags"
                  class="min-h-[34px] px-2.5 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  ${renderIcon('sparkles', 'w-3.5 h-3.5')}
                  Suggest Tags
                </button>
              </div>
              <input
                id="book-tags"
                name="tags"
                type="text"
                value="${escapeHtml(draft.tags)}"
                placeholder="animals, christmas, winter, family, bedtime"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
            </div>
          </div>

          <!-- Inline Reader/Status Options inside Manual Entry -->
          <div class="rounded-2xl bg-linen-50/80 dark:bg-night-950/60 border border-linen-200 dark:border-night-800 p-3.5 space-y-2.5">
            ${renderIntakeCustomizationControls({
              profiles: state.profiles,
              targetStatus,
              intakeOwners: effectiveOwners,
              intakeCondition,
              showStatusButtons: true,
              showConditionButtons: false,
            })}
          </div>

          <div class="pt-1 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              data-action="toggle-intake-loved"
              aria-pressed="${intakeLoved ? 'true' : 'false'}"
              class="min-h-[46px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${
                intakeLoved
                  ? 'bg-rose-600 text-white'
                  : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white'
              }"
            >
              ${renderIcon(intakeLoved ? 'heartFilled' : 'heart', 'w-4 h-4')}
              <span>${intakeLoved ? 'Loved' : 'Mark Loved'}</span>
            </button>

            <button
              type="submit"
              class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              ${renderIcon(targetStatus === 'wishlist' ? 'bookmark' : 'plus', 'w-4 h-4')}
              ${
                targetStatus === 'owned'
                  ? 'Save Book to Library'
                  : `Save Book to ${escapeHtml(formatCollectionStatus(targetStatus))}`
              }
            </button>
          </div>
        </form>
      </section>
    `;
  }

  const foundCandidate =
    uiState.activeCandidate ||
    (uiState.isFoundSheetOpen !== false && uiState.intakeTab !== 'manual'
      ? uiState.isbnCandidate
      : null);

  const foundExistingBook =
    foundCandidate && foundCandidate.isbn13
      ? existingByIsbn.get(foundCandidate.isbn13)
      : undefined;

  return `
    <div class="space-y-3.5">
      <div>
        <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
          1. Scan or find · 2. Save to Library or Wishlist
        </p>
        <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
          Scan & Add Books
        </h1>
      </div>

      <!-- Segmented Intake Method Switcher -->
      <div class="flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 max-w-xl">
        ${intakeTabsHtml}
      </div>

      ${scanHandoffBannerHtml}

      ${activePanelHtml}

      ${renderFoundBookSheet({
        candidate: foundCandidate,
        existingBook: foundExistingBook,
        profiles: state.profiles,
        targetStatus,
        intakeLoved,
        intakeOwners,
        intakeCondition,
        coverAspectRatio: state.settings.coverAspectRatio,
        dynamicCoverTint: state.settings.dynamicCoverTint !== false,
        showRawToggle: state.settings.retainRawProviderPayloads,
      })}
    </div>
  `;
}
