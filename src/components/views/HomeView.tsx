import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { getProfileRecommendations } from '../../features/tagging/recommendations.js';
import {
  computeRotationSchedule,
} from '../../features/rotations/rotation-schedule.js';
import { getAllRotationPresets } from '../../features/rotations/rotation-presets.js';
import { isBookRotatable, normalizeCollectionStatus } from '../../types/models.js';
import type { Book } from '../../types/models.js';

export const HomeView: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    activeRotation,
    navigate,
    setInspectedBookId,
    setAiRecsModal,
    t,
  } = useApp();

  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('lr_dismissed_swap_reminders_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [isPlacementOpen, setIsPlacementOpen] = useState(false);

  const shelfBooks = useMemo(() => {
    if (!activeRotation) return [];
    const bookMap = new Map(state.books.map((b: Book) => [b.id, b]));
    return activeRotation.bookIds
      .map((id: string) => bookMap.get(id))
      .filter((b): b is Book => Boolean(b));
  }, [state.books, activeRotation]);

  const readBookIds = useMemo(() => {
    return new Set(activeRotation?.completedBookIds || []);
  }, [activeRotation]);

  const pickedBookIds = useMemo(() => {
    return new Set(activeRotation?.pickedBookIds || []);
  }, [activeRotation]);

  const savedRotations = useMemo(() => {
    if (!activeProfile) return [];
    return state.rotations.filter(
      (r) => r.profileId === activeProfile.id && r.status !== 'active'
    );
  }, [state.rotations, activeProfile]);

  const recommendations = useMemo(() => {
    if (!activeProfile) return [];
    return getProfileRecommendations({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 3,
    });
  }, [state.books, activeProfile, state.rotations]);

  const activeSchedule = useMemo(() => {
    if (!activeRotation || !activeProfile) return null;
    return computeRotationSchedule(activeRotation, activeProfile);
  }, [activeRotation, activeProfile]);

  const wishlistCount = useMemo(() => {
    return state.books.filter(
      (b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist'
    ).length;
  }, [state.books]);

  const handleTogglePicked = async (bookId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!activeRotation) return;
    await store.toggleRotationBookPicked(activeRotation.id, bookId);
  };

  const handleActivateRotation = async (rotId: string) => {
    await store.setActiveRotation(rotId);
  };

  const handleDismissSwapAlert = (cycleKey: string) => {
    const next = [...dismissedAlerts, cycleKey];
    setDismissedAlerts(next);
    try {
      localStorage.setItem('lr_dismissed_swap_reminders_v1', JSON.stringify(next));
    } catch {}
  };

  const completedCount = activeRotation
    ? activeRotation.completedBookIds.filter((id) => activeRotation.bookIds.includes(id)).length
    : 0;
  const pickedCount = activeRotation
    ? (activeRotation.pickedBookIds || []).filter((id) => activeRotation.bookIds.includes(id)).length
    : 0;

  const coverAspectRatio = state.settings?.coverAspectRatio || 'portrait';

  return (
    <div className="space-y-5 text-left">
      {/* Swap Day Reminder Alert Banner */}
      {activeRotation && activeSchedule?.isDue && !dismissedAlerts.includes(activeSchedule.reminderKey) && (
        <div
          role="region"
          aria-label="Library Swap Day reminder"
          className="rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50/95 dark:bg-night-900 p-3.5 flex items-start justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="p-1 rounded-lg bg-amber-200/80 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">
              <Icon name="calendar" className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200 leading-snug">
                Library Swap Day · {activeRotation.title}
              </h2>
              <p className="text-xs text-amber-900/90 dark:text-amber-300/90 mt-0.5">
                {activeSchedule.activeScheduleLine} · Keep reading, or swap fresh books onto the shelf.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="#/rotations"
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold whitespace-nowrap"
            >
              Swap Books
            </a>
            <button
              type="button"
              onClick={() => handleDismissSwapAlert(activeSchedule.reminderKey)}
              aria-label="Dismiss swap reminder"
              className="p-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-amber-200/50 dark:hover:bg-night-800"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Active Shelf Section */}
      {activeRotation ? (
        <section aria-labelledby="active-shelf-heading" className="space-y-3.5">
          {/* Compact Header & Summary matching original */}
          <div className="flex items-end justify-between gap-3 border-b border-linen-200/90 dark:border-night-800 pb-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
                {t('home.booksInRotation')}
              </p>
              <h1
                id="active-shelf-heading"
                className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight truncate mt-0.5"
              >
                {activeRotation.title}
              </h1>
              {activeSchedule && (
                <p
                  data-rotation-schedule="active"
                  className={`font-sans text-xs mt-0.5 truncate ${
                    activeSchedule.isDue
                      ? 'font-semibold text-amber-800 dark:text-amber-300'
                      : activeSchedule.isDueSoon
                      ? 'font-medium text-espresso-800 dark:text-[#5ED3DA]'
                      : 'text-stone-ink dark:text-slate-400'
                  }`}
                >
                  {activeSchedule.activeScheduleLine}
                </p>
              )}
              {activeRotation.rules?.objective && (
                <p className="font-sans text-xs text-stone-ink dark:text-slate-400 mt-0.5 line-clamp-1">
                  {activeRotation.rules.objective}
                </p>
              )}
            </div>

            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-forest-900 dark:text-slate-200 font-mono whitespace-nowrap">
                {completedCount} of {shelfBooks.length} read
                {pickedCount > 0 ? ` · ${pickedCount} picked` : ''}
              </p>
              <p className="text-[11px] text-stone-ink dark:text-slate-400 font-mono whitespace-nowrap">
                {shelfBooks.length} {shelfBooks.length === 1 ? 'Book' : 'Books'} ·{' '}
                <button
                  type="button"
                  onClick={() => setIsPlacementOpen(true)}
                  className="font-sans font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline inline-flex items-center gap-0.5"
                >
                  <Icon name="checklist" className="w-3 h-3" />
                  <span>Stock</span>
                </button>
                {' · '}
                <a
                  href="#/rotations"
                  className="font-sans font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline"
                >
                  Edit
                </a>
              </p>
            </div>
          </div>

          {/* High-Density 3-Column Mobile Cover Grid (Minimal Title + Author) */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-4 pt-0.5">
            {shelfBooks.map((book) => {
              const isRead = readBookIds.has(book.id);
              const isPicked = pickedBookIds.has(book.id);
              const isReadPreviously = Boolean(
                activeProfile?.readHistoryBookIds?.includes(book.id)
              );
              const primaryAuthor = book.authors[0] || 'Unknown Author';

              const coverRingClass = isPicked
                ? 'ring-2 ring-forest-700 dark:ring-[#5ED3DA] ring-offset-2 ring-offset-linen-50 dark:ring-offset-night-950'
                : isRead
                  ? 'ring-[1.5px] ring-forest-700/75 dark:ring-[#5ED3DA]/75 ring-offset-2 ring-offset-linen-50 dark:ring-offset-night-950'
                  : '';

              const badgeAriaLabel = isPicked
                ? `Unmark ${book.title} as picked in this rotation`
                : isReadPreviously
                  ? `Read previously · Mark ${book.title} as picked in this rotation`
                  : `Mark ${book.title} as picked and read`;

              return (
                <article key={book.id} data-book-card={book.id} className="group flex flex-col min-w-0">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setInspectedBookId(book.id)}
                      aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
                      className="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.98]"
                    >
                      <BookCover
                        book={book}
                        size="grid"
                        aspectRatio={coverAspectRatio}
                        showBadges
                        hideRotationAdorno
                        activeProfile={activeProfile}
                        profiles={state.profiles}
                        isReadOnActiveShelf={isRead}
                        isPickedInRotation={isPicked}
                        className={coverRingClass}
                      />
                    </button>

                    {/* Single Non-Overlapping Bottom-Left Picked Toggle (44x44px Thumb Hitbox) */}
                    <button
                      type="button"
                      onClick={(e) => handleTogglePicked(book.id, e)}
                      aria-pressed={isPicked}
                      aria-label={badgeAriaLabel}
                      className="absolute -bottom-1 -left-1 z-20 min-h-[44px] min-w-[44px] flex items-end justify-start p-2.5 focus-visible:outline-2 focus-visible:outline-forest-700"
                    >
                      {isRead ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shadow-xs border bg-forest-800/95 text-white border-ivory/75 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-night-950">
                          <Icon name="check" className="w-2.5 h-2.5" />
                          <span>Read</span>
                        </span>
                      ) : isPicked ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shadow-xs border bg-forest-800/95 text-white border-ivory/75 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-night-950">
                          <Icon name="bookmarkFilled" className="w-2.5 h-2.5" />
                          <span>Picked</span>
                        </span>
                      ) : isReadPreviously ? (
                        <span
                          title="Read previously (not picked in this rotation)"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shadow-xs border bg-ivory/95 text-forest-800 border-linen-200/90 dark:bg-night-900/95 dark:text-[#5ED3DA] dark:border-night-700"
                        >
                          <Icon name="check" className="w-2.5 h-2.5" />
                          <span>Read</span>
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center shadow-xs border transition-colors bg-white/85 border-linen-200 text-stone-ink/70 hover:text-forest-900 dark:bg-night-900/85 dark:border-night-700 dark:text-slate-400">
                          <Icon name="check" className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectedBookId(book.id)}
                    className="mt-2 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-forest-700 rounded"
                  >
                    <h2
                      className={`font-sans text-xs sm:text-[13px] font-bold text-forest-900 dark:text-white leading-snug line-clamp-2 ${
                        isRead ? 'opacity-70' : ''
                      }`}
                    >
                      {book.title}
                    </h2>
                    <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate mt-0.5">
                      {primaryAuthor}
                    </p>
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 text-center">
          <p className="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            {t('home.booksInRotation')}
          </p>
          <h1 className="font-display text-xl font-bold text-forest-900 dark:text-white mt-1">
            No active shelf rotation for {activeProfile?.name || 'Reader'}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm text-stone-ink dark:text-slate-400 max-w-sm mx-auto">
            Build intentional, fresh shelves that prevent clutter and bring back quiet joy to storytime.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>{t('home.createShelf')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('presets')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors"
            >
              <Icon name="sparkles" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
              <span>{t('nav.presets')}</span>
            </button>
          </div>
        </section>
      )}

      {/* Saved Rotations Strip */}
      {savedRotations.length > 0 && (
        <section aria-labelledby="saved-rotations-heading" className="pt-3 border-t border-linen-200/90 dark:border-night-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="saved-rotations-heading" className="font-sans text-xs font-bold tracking-wide text-espresso-800 dark:text-slate-300">
              {t('home.savedRotations')}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('presets')}
                className="text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white hover:underline"
              >
                {t('nav.presets')}
              </button>
              <button
                type="button"
                onClick={() => navigate('rotations')}
                className="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline"
              >
                {t('home.allShelves')}
              </button>
            </div>
          </div>
          <div className="divide-y divide-linen-200/70 dark:divide-night-800 rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-3.5">
            {savedRotations.slice(0, 3).map((rot) => (
              <div key={rot.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white truncate">
                    {rot.title}
                  </p>
                  {rot.rules?.objective && (
                    <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                      {rot.rules.objective}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-xs font-mono text-stone-ink dark:text-slate-400 whitespace-nowrap">
                    {rot.bookIds.length} {rot.bookIds.length === 1 ? 'book' : 'books'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleActivateRotation(rot.id)}
                    className="min-h-[38px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors"
                  >
                    Activate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Suggested Next Reads */}
      {recommendations.length > 0 && (
        <section aria-labelledby="up-next-heading" className="pt-3 border-t border-linen-200/90 dark:border-night-800 space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="up-next-heading" className="font-display text-base font-bold text-espresso-800 dark:text-white">
              Suggested next for {activeProfile?.name || 'Reader'}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAiRecsModal({ isOpen: true })}
                className="text-[11px] font-semibold text-forest-700 hover:underline dark:text-[#5ED3DA] inline-flex items-center gap-1"
              >
                <Icon name="sparkles" className="w-3 h-3" />
                <span>AI Discovery</span>
              </button>
              <span className="text-[11px] text-stone-ink dark:text-slate-400">
                · Off-shelf picks
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {recommendations.map(({ book, matchReasons }) => (
              <div
                key={book.id}
                data-book-card={`rec-${book.id}`}
                className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-2.5 flex items-center justify-between gap-2.5"
              >
                <button
                  type="button"
                  onClick={() => setInspectedBookId(book.id)}
                  className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                >
                  <BookCover book={book} size="xs" aspectRatio={coverAspectRatio} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-forest-900 dark:text-white truncate">
                      {book.title}
                    </span>
                    <span className="block text-[11px] text-stone-ink dark:text-slate-400 truncate">
                      {book.authors[0] || ''}
                    </span>
                    <span className="block text-[10px] text-forest-700 dark:text-[#5ED3DA] truncate mt-0.5">
                      {matchReasons[0] || 'Fresh pick'}
                    </span>
                  </span>
                </button>
                {activeRotation && (
                  <button
                    type="button"
                    onClick={async () => {
                      await store.addBooksToRotationManual(activeRotation.id, [book.id]);
                      store.notify(`Added "${book.title}" to active shelf!`, 'success');
                    }}
                    aria-label={`Add ${book.title} to active shelf`}
                    title="Add to active shelf"
                    className="min-h-[44px] min-w-[44px] rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Collection Summary Card */}
      <section
        aria-label="Active collection summary"
        className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-3 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-espresso-800 dark:text-white">
            {t('home.activeCollection')}
          </p>
          <p className="text-xs text-stone-ink dark:text-slate-400 font-mono truncate">
            {state.books.length} {state.books.length === 1 ? 'Book' : 'Books'} ·{' '}
            {activeProfile?.readHistoryBookIds?.length || 0} Read with {activeProfile?.name || 'Reader'}
            {wishlistCount > 0 ? ` · ${wishlistCount} Wishlisted` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {wishlistCount > 0 && (
            <button
              type="button"
              onClick={() => navigate('library')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              Wishlist ({wishlistCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('library')}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <span>{t('nav.library')}</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
      <ShelfPlacementModal
        rotation={activeRotation}
        isOpen={isPlacementOpen}
        onClose={() => setIsPlacementOpen(false)}
      />
    </div>
  );
};

