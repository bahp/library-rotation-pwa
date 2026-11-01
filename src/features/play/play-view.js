/**
 * @fileoverview Play & Storytime view (`#/play`):
 * 1) Storytime & Topic Picker ("Bedtime & Topic Randomizer") — picks 1, 2, 3, or 4 books from the
 *    Active Shelf or Reader's Home Library, optionally filtered by any typed topic (e.g. bedtime,
 *    trucks, winter, animals, funny).
 * 2) "Book Hunt" / Treasure Search Game Mode ("Find It!") — displays a random shelf cover or
 *    mystery verbal prompt ("Find the book with the blue truck!") so toddlers & kids can run to
 *    the physical bookshelf, grab the book, and celebrate finding it.
 */

import {
  escapeHtml,
  formatBookBinding,
  formatProfileAgeLabel,
} from '../../types/models.js';
import { renderBookCover } from '../../ui/components/book-cover.js';
import { renderBookInspectorModal } from '../../ui/components/book-inspector-modal.js';
import { renderIcon } from '../../ui/icons.js';
import {
  buildBookHuntClue,
  collectQuickTopics,
  resolvePlayBookPool,
} from './play-activities.js';

/**
 * @typedef {Object} PlayUiState
 * @property {number} randomizerCount - Number of books to pick (1..4, default 3)
 * @property {'active-shelf' | 'owned-library'} randomizerScope - Source pool for Storytime Picker
 * @property {string} randomizerTopic - Optional topic/mood query (e.g. 'bedtime', 'trucks', 'winter')
 * @property {boolean} randomizerUnreadFirst - Prefer unread books first when picking
 * @property {string[]} pickedBookIds - Currently picked book IDs
 * @property {Record<string, string[]>} pickedReasonsByBookId - Matched topic terms per book ID
 * @property {boolean} randomizerHasRun - Whether user has spun at least once in this session
 * @property {boolean} randomizerNoTopicMatches - True when last spin found 0 books for typed topic
 * @property {boolean} randomizerExpandedToLibrary - True when Active Shelf had 0 topic hits so Home Library was used
 * @property {'active-shelf' | 'owned-library'} huntScope - Source pool for Book Hunt
 * @property {'cover-and-clue' | 'clue-first'} huntClueMode - Whether cover is shown immediately or behind Peek
 * @property {string | null} huntBookId - Active target book ID for Book Hunt
 * @property {string} huntPrompt - Generated "Find the book..." prompt
 * @property {string} huntClueLine - Secondary hint text
 * @property {boolean} huntPeekRevealed - True when cover is peeked in 'clue-first' mode
 * @property {boolean} huntCelebrated - True right after child taps "Found It!"
 * @property {number} huntFoundCount - Session streak of found books
 */

/**
 * Creates default ephemeral UI state for the Play & Storytime view.
 * @returns {PlayUiState}
 */
export function createDefaultPlayUiState() {
  return {
    randomizerCount: 3,
    randomizerScope: 'active-shelf',
    randomizerTopic: '',
    randomizerUnreadFirst: true,
    pickedBookIds: [],
    pickedReasonsByBookId: {},
    randomizerHasRun: false,
    randomizerNoTopicMatches: false,
    randomizerExpandedToLibrary: false,
    huntScope: 'active-shelf',
    huntClueMode: 'cover-and-clue',
    huntBookId: null,
    huntPrompt: '',
    huntClueLine: '',
    huntPeekRevealed: false,
    huntCelebrated: false,
    huntFoundCount: 0,
  };
}

/**
 * Formats a lowercase tag/topic key into natural title case (e.g. `'bedtime'` -> `'Bedtime'`).
 * @param {string} raw
 * @returns {string}
 */
function formatTopicLabel(raw) {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Renders the Play & Storytime screen (`#/play`).
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   playUiState?: PlayUiState,
 *   inspectedBookId?: string | null,
 *   inspectorUiState?: import('../../ui/components/book-inspector-modal.js').BookInspectorUiState
 * }} params
 * @returns {string}
 */
export function renderPlayView({
  state,
  playUiState = createDefaultPlayUiState(),
  inspectedBookId = null,
  inspectorUiState,
}) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const ageLabel = formatProfileAgeLabel(activeProfile);
  const coverAspect = state.settings.coverAspectRatio || 'square';
  const dynamicCoverTint = state.settings.dynamicCoverTint !== false;

  const activeRotation =
    state.rotations.find(
      (r) => r.profileId === activeProfile.id && r.status === 'active'
    ) || null;

  const bookMap = new Map(state.books.map((b) => [b.id, b]));

  const randomizerPool = resolvePlayBookPool({
    books: state.books,
    activeRotation,
    activeProfile,
    scope: playUiState.randomizerScope,
  });

  const huntPool = resolvePlayBookPool({
    books: state.books,
    activeRotation,
    activeProfile,
    scope: playUiState.huntScope,
  });

  const quickTopics = collectQuickTopics({
    books: state.books,
    activeRotation,
    activeProfile,
    limit: 6,
  });

  const countOptions = [1, 2, 3, 4];
  const selectedCount = Math.max(1, Math.min(6, playUiState.randomizerCount || 3));
  const pickedBooks = playUiState.pickedBookIds
    .map((id) => bookMap.get(id))
    .filter(/** @returns {b is import('../../types/models.js').Book} */ (b) => Boolean(b));

  const activeTopicTrimmed = String(playUiState.randomizerTopic || '').trim();

  // Resolve current Book Hunt target book (if active and still in catalog)
  const huntBook = playUiState.huntBookId ? bookMap.get(playUiState.huntBookId) || null : null;
  const derivedClue = huntBook ? buildBookHuntClue(huntBook) : null;
  const effectiveHuntPrompt =
    playUiState.huntPrompt || (derivedClue ? derivedClue.prompt : '');
  const effectiveHuntClueLine =
    playUiState.huntClueLine || (derivedClue ? derivedClue.clueLine : '');

  const inspectedBook = inspectedBookId ? bookMap.get(inspectedBookId) || null : null;

  // --- Storytime Picker Markup ---
  const countSelectorHtml = countOptions
    .map((n) => {
      const isSelected = selectedCount === n;
      return `
        <button
          type="button"
          data-action="set-randomizer-count"
          data-count="${n}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
          class="min-h-[44px] flex-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold font-mono-tabular transition-colors ${
            isSelected
              ? 'bg-forest-900 text-ivory dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs'
              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${n} ${n === 1 ? 'book' : 'books'}
        </button>
      `;
    })
    .join('');

  const quickTopicButtonsHtml = [
    `
      <button
        type="button"
        data-action="set-randomizer-topic"
        data-topic=""
        aria-pressed="${!activeTopicTrimmed ? 'true' : 'false'}"
        class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          !activeTopicTrimmed
            ? 'bg-forest-900 text-ivory dark:bg-[#5ED3DA] dark:text-night-950 font-semibold'
            : 'bg-linen-100 hover:bg-linen-200 text-stone-ink dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-300'
        }"
      >
        Any topic
      </button>
    `,
    ...quickTopics.map((topic) => {
      const isSelected = activeTopicTrimmed.toLowerCase() === topic.toLowerCase();
      return `
        <button
          type="button"
          data-action="set-randomizer-topic"
          data-topic="${escapeHtml(topic)}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
          class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isSelected
              ? 'bg-forest-900 text-ivory dark:bg-[#5ED3DA] dark:text-night-950 font-semibold'
              : 'bg-linen-100 hover:bg-linen-200 text-stone-ink dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-300'
          }"
        >
          ${escapeHtml(formatTopicLabel(topic))}
        </button>
      `;
    }),
  ].join('');

  let randomizerResultsHtml = '';
  if (playUiState.randomizerNoTopicMatches && activeTopicTrimmed) {
    randomizerResultsHtml = `
      <div role="status" class="pt-4 border-t border-linen-200/80 dark:border-night-800 text-sm text-stone-ink dark:text-slate-300">
        No books matched <strong class="font-semibold text-forest-900 dark:text-white">“${escapeHtml(activeTopicTrimmed)}”</strong> yet. Try a broader theme (like <em>animals</em>, <em>bedtime</em>, or <em>winter</em>) or tap <strong>Any topic</strong>.
      </div>
    `;
  } else if (pickedBooks.length > 0) {
    const completedIds = new Set(activeRotation?.completedBookIds || []);
    const lineupCardsHtml = pickedBooks
      .map((book, idx) => {
        const isRead = completedIds.has(book.id);
        const reasons = playUiState.pickedReasonsByBookId[book.id] || [];
        const metaParts = [
          book.authors[0] || 'Unknown author',
          formatBookBinding(book.format),
        ];
        if (reasons.length > 0) {
          metaParts.push(`Matched: ${reasons.join(', ')}`);
        } else if (isRead) {
          metaParts.push('Read on shelf');
        }

        return `
          <div class="group flex items-center gap-3.5 py-2.5 first:pt-0 last:pb-0">
            <button
              type="button"
              data-action="inspect-book"
              data-book-id="${escapeHtml(book.id)}"
              aria-label="Inspect ${escapeHtml(book.title)}"
              class="w-16 sm:w-18 shrink-0 rounded-xl overflow-hidden focus-visible:outline-2 focus-visible:outline-forest-700 transition-transform active:scale-98"
            >
              ${renderBookCover(book, 'grid', coverAspect)}
            </button>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-mono-tabular text-stone-ink dark:text-slate-400">
                0${idx + 1} · Storytime Pick
              </p>
              <button
                type="button"
                data-action="inspect-book"
                data-book-id="${escapeHtml(book.id)}"
                class="text-left block w-full font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white hover:underline truncate"
              >
                ${escapeHtml(book.title)}
              </button>
              <p class="text-xs text-stone-ink dark:text-slate-400 truncate mt-0.5">
                ${escapeHtml(metaParts.join(' · '))}
              </p>
            </div>
          </div>
        `;
      })
      .join('');

    const fallbackNotice = playUiState.randomizerExpandedToLibrary
      ? `<p class="text-xs text-espresso-800 dark:text-amber-300 mb-2.5">None on the current active shelf matched “${escapeHtml(activeTopicTrimmed)}”, so we picked from ${escapeHtml(activeProfile.name)}’s full home library.</p>`
      : '';

    randomizerResultsHtml = `
      <div data-storytime-results="true" class="pt-4 border-t border-linen-200/80 dark:border-night-800">
        <div class="flex items-center justify-between gap-2 mb-2.5">
          <p class="text-xs font-semibold text-forest-900 dark:text-slate-200">
            ${
              activeTopicTrimmed
                ? `Picked for “${escapeHtml(activeTopicTrimmed)}” (${pickedBooks.length})`
                : `Tonight’s Storytime Lineup (${pickedBooks.length})`
            }
          </p>
          <button
            type="button"
            data-action="spin-storytime-randomizer"
            class="min-h-[38px] px-3 py-1.5 rounded-lg bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors"
          >
            ${renderIcon('shuffle', 'w-3.5 h-3.5')}
            <span>Pick Again</span>
          </button>
        </div>
        ${fallbackNotice}
        <div class="divide-y divide-linen-200/70 dark:divide-night-800">
          ${lineupCardsHtml}
        </div>
      </div>
    `;
  }

  // --- Book Hunt ("Find It!") Markup ---
  const showHuntCover =
    playUiState.huntClueMode === 'cover-and-clue' ||
    playUiState.huntPeekRevealed ||
    playUiState.huntCelebrated;

  let bookHuntStageHtml = '';
  if (huntPool.pool.length === 0) {
    bookHuntStageHtml = `
      <div class="pt-3 border-t border-linen-200/80 dark:border-night-800 text-sm text-stone-ink dark:text-slate-400">
        Add owned books to ${escapeHtml(activeProfile.name)}’s library or active shelf to start a Book Hunt!
      </div>
    `;
  } else if (!huntBook) {
    bookHuntStageHtml = `
      <div class="pt-3 border-t border-linen-200/80 dark:border-night-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p class="text-xs sm:text-sm text-stone-ink dark:text-slate-300 leading-relaxed">
          Tap <strong>Find It!</strong> to pick a surprise book from ${escapeHtml(huntPool.poolLabel)} (${huntPool.pool.length} available) and send your reader on a bookshelf treasure hunt.
        </p>
        <button
          type="button"
          data-action="start-book-hunt"
          class="min-h-[48px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
        >
          ${renderIcon('compass', 'w-4 h-4')}
          <span>Find It! Start Hunt</span>
        </button>
      </div>
    `;
  } else {
    const coverColumnHtml = showHuntCover
      ? `
        <button
          type="button"
          data-action="inspect-book"
          data-book-id="${escapeHtml(huntBook.id)}"
          aria-label="Inspect ${escapeHtml(huntBook.title)}"
          class="w-28 sm:w-32 shrink-0 rounded-xl overflow-hidden shadow-sm focus-visible:outline-2 focus-visible:outline-forest-700 transition-transform active:scale-98"
        >
          ${renderBookCover(huntBook, 'grid', coverAspect)}
        </button>
      `
      : `
        <button
          type="button"
          data-action="toggle-book-hunt-peek"
          class="w-28 sm:w-32 aspect-square shrink-0 rounded-xl border border-dashed border-forest-700/45 dark:border-[#5ED3DA]/45 bg-linen-100/80 dark:bg-night-800/80 flex flex-col items-center justify-center gap-1.5 p-3 text-center hover:bg-linen-200/70 dark:hover:bg-night-800 transition-colors"
        >
          ${renderIcon('eye', 'w-5 h-5 text-forest-800 dark:text-[#5ED3DA]')}
          <span class="text-xs font-semibold text-forest-900 dark:text-white">Peek Cover</span>
        </button>
      `;

    bookHuntStageHtml = `
      <div data-book-hunt-active="true" class="pt-4 border-t border-linen-200/80 dark:border-night-800 space-y-4">
        <div class="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
          ${coverColumnHtml}
          <div class="min-w-0 flex-1 space-y-1.5">
            <p class="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]">
              ${
                playUiState.huntCelebrated
                  ? 'Treasure Found! Great shelf hunting!'
                  : 'Shelf Treasure Prompt'
              }
            </p>
            <p
              data-book-hunt-prompt="true"
              class="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white leading-snug"
            >
              “${escapeHtml(effectiveHuntPrompt)}”
            </p>
            ${
              showHuntCover
                ? `
                  <p class="text-sm font-semibold text-forest-900 dark:text-slate-100">
                    ${escapeHtml(huntBook.title)}
                  </p>
                `
                : `
                  <p class="text-xs text-stone-ink dark:text-slate-400">
                    Title hidden until you peek or tap Found It!
                  </p>
                `
            }
            <p class="text-xs text-stone-ink dark:text-slate-400">
              ${escapeHtml(effectiveHuntClueLine)}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          ${
            playUiState.huntCelebrated
              ? `
                <button
                  type="button"
                  data-action="start-book-hunt"
                  class="min-h-[46px] flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  ${renderIcon('compass', 'w-4 h-4')}
                  <span>Next Book Hunt</span>
                </button>
                <button
                  type="button"
                  data-action="inspect-book"
                  data-book-id="${escapeHtml(huntBook.id)}"
                  class="min-h-[46px] px-4 py-2.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs sm:text-sm font-semibold transition-colors"
                >
                  Open Book Card
                </button>
              `
              : `
                <button
                  type="button"
                  data-action="complete-book-hunt"
                  class="min-h-[46px] flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  ${renderIcon('check', 'w-4 h-4')}
                  <span>Found It!</span>
                </button>
                <button
                  type="button"
                  data-action="start-book-hunt"
                  class="min-h-[46px] px-4 py-2.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  ${renderIcon('shuffle', 'w-3.5 h-3.5')}
                  <span>Skip / Another</span>
                </button>
              `
          }
        </div>
      </div>
    `;
  }

  const inspectorModalHtml = renderBookInspectorModal({
    book: inspectedBook,
    profiles: state.profiles,
    activeRotation,
    canSwapInActiveRotation: Boolean(
      inspectedBook && activeRotation && activeRotation.bookIds.includes(inspectedBook.id)
    ),
    coverAspectRatio: coverAspect,
    dynamicCoverTint,
    inspectorUiState,
  });

  return `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            ${escapeHtml(activeProfile.name)} · ${escapeHtml(ageLabel)} · ${
              activeRotation
                ? `${activeRotation.bookIds.length} on active shelf`
                : `${randomizerPool.readerLibraryBooks.length} in home library`
            }
          </p>
          <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
            Play &amp; Storytime Tools
          </h1>
        </div>
        ${
          playUiState.huntFoundCount > 0
            ? `
              <p data-book-hunt-score="true" class="text-xs font-mono-tabular text-stone-ink dark:text-slate-300">
                Books hunted today: <strong class="font-semibold text-forest-900 dark:text-[#5ED3DA]">${playUiState.huntFoundCount}</strong>
              </p>
            `
            : ''
        }
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <!-- 01. Storytime & Topic Picker -->
        <section
          aria-labelledby="storytime-picker-heading"
          data-storytime-picker-card="true"
          class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 id="storytime-picker-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
                01. Storytime &amp; Topic Picker
              </h2>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
                Pick 1 to 4 books at random for bedtime or any topic your child asks for right now.
              </p>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1.5">
                How many books?
              </label>
              <div class="flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
                ${countSelectorHtml}
              </div>
            </div>

            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div class="flex items-center gap-1 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
                <button
                  type="button"
                  data-action="set-randomizer-scope"
                  data-scope="active-shelf"
                  aria-pressed="${playUiState.randomizerScope === 'active-shelf' ? 'true' : 'false'}"
                  class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    playUiState.randomizerScope === 'active-shelf'
                      ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                      : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                  }"
                >
                  Active Shelf
                </button>
                <button
                  type="button"
                  data-action="set-randomizer-scope"
                  data-scope="owned-library"
                  aria-pressed="${playUiState.randomizerScope === 'owned-library' ? 'true' : 'false'}"
                  class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    playUiState.randomizerScope === 'owned-library'
                      ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                      : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                  }"
                >
                  Home Library
                </button>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked="${playUiState.randomizerUnreadFirst ? 'true' : 'false'}"
                data-action="toggle-randomizer-unread"
                class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left sm:text-right ${
                  playUiState.randomizerUnreadFirst
                    ? 'text-forest-800 dark:text-[#5ED3DA]'
                    : 'text-stone-ink dark:text-slate-400'
                }"
              >
                Unread first: ${playUiState.randomizerUnreadFirst ? 'On' : 'Off'}
              </button>
            </div>

            <div>
              <label for="play-topic-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1.5">
                Topic or mood (optional)
              </label>
              <div class="relative">
                <input
                  id="play-topic-input"
                  type="search"
                  value="${escapeHtml(playUiState.randomizerTopic)}"
                  placeholder="Any topic — or type bedtime, trucks, winter, animals…"
                  class="w-full h-11 pl-3.5 pr-9 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white placeholder:text-stone-ink/70 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-forest-700"
                />
                ${
                  activeTopicTrimmed
                    ? `
                      <button
                        type="button"
                        data-action="set-randomizer-topic"
                        data-topic=""
                        aria-label="Clear topic filter"
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        ${renderIcon('close', 'w-4 h-4')}
                      </button>
                    `
                    : ''
                }
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                ${quickTopicButtonsHtml}
              </div>
            </div>

            <button
              type="button"
              data-action="spin-storytime-randomizer"
              ${randomizerPool.pool.length === 0 ? 'disabled' : ''}
              class="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 disabled:opacity-50 dark:bg-[#5ED3DA] dark:hover:bg-[#4bc2c9] text-ivory dark:text-night-950 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              ${renderIcon('dice', 'w-4 h-4')}
              <span>Pick ${selectedCount} ${selectedCount === 1 ? 'Book' : 'Books'}${
                activeTopicTrimmed ? ` about “${escapeHtml(activeTopicTrimmed)}”` : ''
              }</span>
            </button>
          </div>

          ${randomizerResultsHtml}
        </section>

        <!-- 02. Book Hunt ("Find It!") Treasure Search -->
        <section
          aria-labelledby="book-hunt-heading"
          data-book-hunt-card="true"
          class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 id="book-hunt-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
                02. Book Hunt (“Find It!”)
              </h2>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
                Turn choosing a book into an active shelf treasure hunt before reading or clean-up time.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
              <button
                type="button"
                data-action="set-book-hunt-mode"
                data-clue-mode="cover-and-clue"
                aria-pressed="${playUiState.huntClueMode === 'cover-and-clue' ? 'true' : 'false'}"
                class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  playUiState.huntClueMode === 'cover-and-clue'
                    ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                    : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                }"
              >
                Cover + Prompt
              </button>
              <button
                type="button"
                data-action="set-book-hunt-mode"
                data-clue-mode="clue-first"
                aria-pressed="${playUiState.huntClueMode === 'clue-first' ? 'true' : 'false'}"
                class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  playUiState.huntClueMode === 'clue-first'
                    ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                    : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                }"
              >
                Mystery Clue First
              </button>
            </div>

            <div class="flex items-center gap-1 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
              <button
                type="button"
                data-action="set-book-hunt-scope"
                data-scope="active-shelf"
                aria-pressed="${playUiState.huntScope === 'active-shelf' ? 'true' : 'false'}"
                class="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  playUiState.huntScope === 'active-shelf'
                    ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                    : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                }"
              >
                Active Shelf
              </button>
              <button
                type="button"
                data-action="set-book-hunt-scope"
                data-scope="owned-library"
                aria-pressed="${playUiState.huntScope === 'owned-library' ? 'true' : 'false'}"
                class="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  playUiState.huntScope === 'owned-library'
                    ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                    : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                }"
              >
                Home Library
              </button>
            </div>
          </div>

          ${bookHuntStageHtml}
        </section>
      </div>

      ${inspectorModalHtml}
    </div>
  `;
}
