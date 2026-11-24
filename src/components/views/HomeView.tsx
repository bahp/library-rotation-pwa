import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverSlide,
} from '../common/BookCoverCard.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { Icon } from '../common/Icon.js';
import { RotationShelfCard } from '../cards/RotationShelfCard.js';
import { RotationEditorModal } from '../modals/RotationEditorModal.js';
import {
  getFavoriteGenreRecommendationShelf,
  getLovedBookSimilarityShelves,
  getProfileRecommendations,
  getRotationLibrarySuggestions,
} from '../../features/tagging/recommendations.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import { resolveBookCardDisplayConfig } from '../../config/index.js';
import { normalizeCollectionStatus } from '../../types/models.js';
import type { Book, RotationShelf } from '../../types/models.js';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

function formatFinishedDateLabel(iso?: string): string {
  if (!iso) return 'Last read';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Last read';
  const d = new Date(time);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Last read · Today';
  if (diffDays === 1) return 'Last read · Yesterday';
  return `Last read · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export const HomeView: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    activeRotation,
    rotationEditor,
    setRotationEditor,
    navigate,
    setInspectedBookId,
    setAiRecsModal,
    t,
  } = useApp();

  const isDesktop = useIsDesktop();
  const [sheetRotationId, setSheetRotationId] = useState<string | null>(null);
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);

  const bookMap = useMemo(() => {
    return new Map(state.books.map((b: Book) => [b.id, b]));
  }, [state.books]);

  const activeRotations = useMemo(() => {
    if (!activeProfile) return [];
    const list = state.rotations
      .filter((r) => r.profileId === activeProfile.id && r.status === 'active')
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.activatedAt || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.activatedAt || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    if (list.length === 0 && activeRotation) return [activeRotation];
    return list;
  }, [state.rotations, activeProfile, activeRotation]);

  const primaryActiveRotation: RotationShelf | null = activeRotations[0] || null;

  const sheetRotation: RotationShelf | null = useMemo(() => {
    if (!sheetRotationId) return null;
    return state.rotations.find((r) => r.id === sheetRotationId) || null;
  }, [state.rotations, sheetRotationId]);

  useEffect(() => {
    if (sheetRotationId && !sheetRotation) {
      setSheetRotationId(null);
      setEditingShelfId(null);
    }
  }, [sheetRotationId, sheetRotation]);

  useEffect(() => {
    if (!sheetRotationId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingShelfId && !rotationEditor.modalMode) {
        setSheetRotationId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetRotationId, editingShelfId, rotationEditor.modalMode]);

  // 1. Suggested to add to the current active rotation from owned library
  const rotationSuggestions = useMemo(() => {
    if (!activeProfile || !primaryActiveRotation) return [];
    return getRotationLibrarySuggestions({
      books: state.books,
      profile: activeProfile,
      rotation: primaryActiveRotation,
      rotations: state.rotations,
      limit: 6,
    });
  }, [state.books, activeProfile, primaryActiveRotation, state.rotations]);

  // 2. Suggested for [Profile] (overall owned library), avoiding repetition with shelf 1 where possible
  const recommendations = useMemo(() => {
    if (!activeProfile) return [];
    const pool = getProfileRecommendations({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 12,
    });
    const rotIds = new Set(rotationSuggestions.map((item) => item.book.id));
    const distinct = pool.filter((item) => !rotIds.has(item.book.id));
    return (distinct.length >= 2 ? distinct : pool).slice(0, 6);
  }, [state.books, activeProfile, state.rotations, rotationSuggestions]);

  // 3 & 4. Suggested because you loved [XX / YY book] (owned library)
  const lovedShelves = useMemo(() => {
    if (!activeProfile) return [];
    return getLovedBookSimilarityShelves({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      maxAnchors: 2,
      itemsPerAnchor: 6,
      minItems: 1,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 5. Suggested because you like [Genre/Topic] (owned library)
  const genreShelf = useMemo(() => {
    if (!activeProfile) return null;
    return getFavoriteGenreRecommendationShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 6,
      minItems: 2,
    });
  }, [state.books, activeProfile, state.rotations]);

  const wishlistCount = useMemo(() => {
    return state.books.filter(
      (b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist'
    ).length;
  }, [state.books]);

  // Most recently clicked "Reading" book, or fallback to most recently finished book
  const currentReadingBook: Book | null = useMemo(() => {
    const readingIds = activeProfile?.currentlyReadingBookIds;
    if (!Array.isArray(readingIds) || readingIds.length === 0) return null;
    for (let i = readingIds.length - 1; i >= 0; i -= 1) {
      const candidate = bookMap.get(readingIds[i]);
      if (candidate) return candidate;
    }
    return null;
  }, [activeProfile?.currentlyReadingBookIds, bookMap]);

  const lastReadBook: Book | null = useMemo(() => {
    if (currentReadingBook) return null;
    const historyIds = activeProfile?.readHistoryBookIds;
    if (!Array.isArray(historyIds) || historyIds.length === 0) return null;
    let bestBook: Book | null = null;
    let bestTime = -1;
    for (let i = historyIds.length - 1; i >= 0; i -= 1) {
      const candidate = bookMap.get(historyIds[i]);
      if (!candidate) continue;
      const ms = candidate.lastReadAt ? Date.parse(candidate.lastReadAt) : NaN;
      const validMs = Number.isFinite(ms) ? ms : 0;
      if (!bestBook || validMs > bestTime) {
        bestBook = candidate;
        bestTime = validMs;
      }
    }
    return bestBook;
  }, [currentReadingBook, activeProfile?.readHistoryBookIds, bookMap]);

  const bottomBarBook = currentReadingBook || lastReadBook;
  const isBottomBarFinished = !currentReadingBook && Boolean(lastReadBook);

  const handleTogglePicked = async (
    rotationId: string,
    bookId: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    await store.toggleRotationBookPicked(rotationId, bookId);
  };

  const handleToggleBottomBarRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomBarBook) return;
    if (isBottomBarFinished) {
      await store.setProfileBookReadingStatus(activeProfile?.id, bottomBarBook.id, 'reading');
      store.notify(`Marked "${bottomBarBook.title}" as currently reading`, 'info');
    } else {
      await store.setProfileBookReadingStatus(activeProfile?.id, bottomBarBook.id, 'read');
      store.notify(`Marked "${bottomBarBook.title}" as read!`, 'success');
    }
  };

  const handleToggleCurrentBookLoved = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomBarBook) return;
    await store.toggleBookLoved(bottomBarBook.id);
  };

  const bottomNavStyle = state.settings?.bottomNavStyle === 'full' ? 'full' : 'floating';
  const shelfCardConfig = resolveBookCardDisplayConfig(state.settings, 'homeShelf');
  const suggestedCardConfig = resolveBookCardDisplayConfig(state.settings, 'homeSuggested');
  const coverAspectRatio = shelfCardConfig.aspectRatio;

  const renderShelfBookCard = (
    book: Book,
    rotation: RotationShelf,
    isCarouselItem: boolean
  ) => {
    const isRead = (rotation.completedBookIds || []).includes(book.id);
    const isPicked = (rotation.pickedBookIds || []).includes(book.id);
    const isReadPreviously = Boolean(
      activeProfile?.readHistoryBookIds?.includes(book.id)
    );
    const isOverlay = shelfCardConfig.infoPlacement === 'overlay';

    const badgeAriaLabel = isPicked
      ? `Unmark ${book.title} as picked in this rotation`
      : isReadPreviously
        ? `Read previously · Mark ${book.title} as picked in this rotation`
        : `Mark ${book.title} as picked and read`;

    const pickedButton = (
      <button
        type="button"
        onClick={(e) => handleTogglePicked(rotation.id, book.id, e)}
        aria-pressed={isPicked}
        aria-label={badgeAriaLabel}
        className={
          isOverlay
            ? 'min-h-[36px] min-w-[36px] flex items-end justify-start cursor-pointer'
            : 'absolute -bottom-1 -left-1 z-20 min-h-[44px] min-w-[44px] flex items-end justify-start p-2.5 cursor-pointer'
        }
      >
        {isRead ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border bg-primary text-primary-fg border-surface">
            <Icon name="check" className="w-2.5 h-2.5" />
            <span>Read</span>
          </span>
        ) : isPicked ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border bg-primary text-primary-fg border-surface">
            <Icon name="bookmarkFilled" className="w-2.5 h-2.5" />
            <span>Picked</span>
          </span>
        ) : isReadPreviously ? (
          <span
            title="Read previously (not picked in this rotation)"
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border bg-surface/95 text-primary border-edge"
          >
            <Icon name="check" className="w-2.5 h-2.5" />
            <span>Read</span>
          </span>
        ) : (
          <span className="w-6 h-6 rounded-full flex items-center justify-center shadow-xs border transition-colors bg-surface/95 border-edge text-ink-muted hover:text-ink">
            <Icon name="check" className="w-3 h-3" />
          </span>
        )}
      </button>
    );

    return (
      <BookCoverCard
        key={`${rotation.id}-${book.id}`}
        book={book}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout={isCarouselItem ? 'carousel' : 'grid'}
        size={shelfCardConfig.size}
        customWidth={shelfCardConfig.customWidth}
        aspectRatio={shelfCardConfig.aspectRatio}
        infoPlacement={shelfCardConfig.infoPlacement}
        cardFrame={shelfCardConfig.cardFrame}
        showCoverOverlays={shelfCardConfig.showCoverOverlays}
        showUsageAdorno={false}
        fields={shelfCardConfig.fields}
        isRead={isRead}
        isPicked={isPicked}
        highlightState={isRead ? 'read' : isPicked ? 'picked' : 'none'}
        onInspect={(b) => setInspectedBookId(b.id)}
        bottomLeftCoverAction={pickedButton}
      />
    );
  };

  const renderRecCoverCard = (
    book: Book,
    matchReasons: string[],
    isCarouselItem: boolean,
    keyPrefix: string,
    targetRotation: RotationShelf | null = primaryActiveRotation
  ) => {
    const isOverlay = suggestedCardConfig.infoPlacement === 'overlay';
    const addAction = targetRotation ? (
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          await store.addBooksToRotationManual(targetRotation.id, [book.id]);
          store.notify(`Added "${book.title}" to "${targetRotation.title}"!`, 'success');
        }}
        aria-label={`Add ${book.title} to ${targetRotation.title}`}
        title={`Add to ${targetRotation.title}`}
        className={
          isOverlay
            ? 'min-h-[36px] min-w-[36px] flex items-end justify-end cursor-pointer'
            : 'absolute -bottom-1 -right-1 z-20 min-h-[40px] min-w-[40px] flex items-end justify-end p-2 cursor-pointer'
        }
      >
        <span className="w-7 h-7 rounded-full bg-surface/95 hover:bg-primary hover:text-primary-fg border border-edge text-ink shadow-xs flex items-center justify-center transition-colors">
          <Icon name="plus" className="w-3.5 h-3.5" />
        </span>
      </button>
    ) : undefined;

    return (
      <BookCoverCard
        key={`${keyPrefix}-${book.id}`}
        dataBookCard={`${keyPrefix}-${book.id}`}
        book={book}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout={isCarouselItem ? 'carousel' : 'grid'}
        size={suggestedCardConfig.size}
        customWidth={suggestedCardConfig.customWidth}
        aspectRatio={suggestedCardConfig.aspectRatio}
        infoPlacement={suggestedCardConfig.infoPlacement}
        cardFrame={suggestedCardConfig.cardFrame}
        showCoverOverlays={suggestedCardConfig.showCoverOverlays}
        showUsageAdorno={false}
        fields={suggestedCardConfig.fields}
        customMetaLine={matchReasons[0] || 'Fresh pick'}
        onInspect={(b) => setInspectedBookId(b.id)}
        bottomRightCoverAction={addAction}
      />
    );
  };

  return (
    <div className={`space-y-7 sm:space-y-9 text-left ${bottomBarBook ? 'pb-28' : 'pb-6'}`}>
      {/* Section 0: Active Rotations (Desktop: clean grid, Phone: smooth slider; clickable to open sheet) */}
      {activeRotations.length > 0 ? (
        <section aria-labelledby="active-rotations-section-heading" className="space-y-6">
          {activeRotations.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span
                id="active-rotations-section-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
              >
                Active Rotations ({activeRotations.length})
              </span>
              <button
                type="button"
                onClick={() => navigate('rotations')}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t('home.allShelves')}</span>
                <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-8">
            {activeRotations.map((rot, idx) => {
              const rotBooks = rot.bookIds
                .map((id: string) => bookMap.get(id))
                .filter((b): b is Book => Boolean(b));
              const completedCount = rot.completedBookIds.filter((id) =>
                rot.bookIds.includes(id)
              ).length;
              const progressPct =
                rotBooks.length > 0 ? Math.round((completedCount / rotBooks.length) * 100) : 0;
              const sched = activeProfile ? computeRotationSchedule(rot, activeProfile) : null;

              return (
                <div
                  key={rot.id}
                  data-home-active-rotation={rot.id}
                  className="space-y-3.5"
                >
                  <button
                    type="button"
                    onClick={() => setSheetRotationId(rot.id)}
                    aria-label={`Open ${rot.title} rotation details (${completedCount} of ${rotBooks.length} read, ${progressPct}%)`}
                    className="group w-full text-left flex items-start justify-between gap-3 pb-3 border-b border-edge-subtle cursor-pointer rounded-xl px-2 -mx-2 py-1.5 hover:bg-surface-subtle/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          aria-hidden="true"
                          title="Active shelf"
                          className="w-2.5 h-2.5 rounded-full bg-success ring-4 ring-success/15 lr-active-dot-pulse shrink-0 mt-2 sm:mt-2.5"
                        />
                        {idx === 0 && activeRotations.length === 1 ? (
                          <h1
                            id="active-rotations-section-heading"
                            className="font-display text-2xl sm:text-3xl font-semibold text-ink leading-[1.1] tracking-tight min-w-0 group-hover:text-primary transition-colors"
                          >
                            {rot.title}
                          </h1>
                        ) : (
                          <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink leading-[1.12] tracking-tight min-w-0 group-hover:text-primary transition-colors">
                            {rot.title}
                          </h2>
                        )}
                      </div>

                      {sched && (
                        <p
                          data-rotation-schedule="active"
                          className={`pl-5 flex items-center gap-1.5 text-xs leading-tight ${
                            sched.isDue
                              ? 'font-semibold text-accent'
                              : sched.isDueSoon
                                ? 'font-semibold text-primary'
                                : 'text-ink-secondary font-medium'
                          }`}
                        >
                          <Icon name="calendar" className="w-3.5 h-3.5 shrink-0 opacity-80" />
                          <span className="truncate">{sched.activeScheduleLine}</span>
                        </p>
                      )}
                    </div>

                    {/* Top-Right Progress Readout + Unmistakable Open Affordance */}
                    <div className="flex items-center gap-3 shrink-0 pt-0.5">
                      <div
                        data-home-progress-readout="true"
                        className="text-right space-y-1 min-w-[74px]"
                        title={`Reading progress: ${completedCount} of ${rotBooks.length} ${rotBooks.length === 1 ? 'book' : 'books'} (${progressPct}%)`}
                      >
                        <p className="font-display text-xl sm:text-2xl font-bold text-ink leading-none font-mono-tabular">
                          {progressPct}%
                        </p>
                        <p className="font-serif-italic italic text-[11px] sm:text-xs text-ink-secondary leading-none whitespace-nowrap">
                          {completedCount} of {rotBooks.length} read
                        </p>
                        <div className="h-[3px] w-full rounded-full lr-progress-track overflow-hidden">
                          <div
                            className="h-full rounded-full lr-progress-fill transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-subtle group-hover:bg-primary group-hover:text-primary-fg border border-edge group-hover:border-primary text-xs font-semibold text-ink transition-colors shrink-0">
                        <span>Open</span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5" />
                      </span>
                      <span className="sm:hidden w-7 h-7 rounded-full flex items-center justify-center text-ink-secondary bg-surface-subtle/80 border border-edge-subtle shrink-0">
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </span>
                    </div>
                  </button>

                  {rotBooks.length > 0 ? (
                    isDesktop ? (
                      <BookCoverGrid
                        size={shelfCardConfig.size}
                        customWidth={shelfCardConfig.customWidth}
                        infoPlacement={shelfCardConfig.infoPlacement}
                      >
                        {rotBooks.map((book) => renderShelfBookCard(book, rot, false))}
                      </BookCoverGrid>
                    ) : (
                      <BookCoverSlide
                        itemCount={rotBooks.length}
                        ariaLabel={`${rot.title} books`}
                      >
                        {rotBooks.map((book) => renderShelfBookCard(book, rot, true))}
                      </BookCoverSlide>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSheetRotationId(rot.id)}
                      className="w-full rounded-xl bg-surface-subtle/70 hover:bg-surface-subtle border border-dashed border-edge p-4 text-center text-xs text-ink-secondary transition-colors cursor-pointer"
                    >
                      No books placed on “{rot.title}” yet · Tap to add from your library
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-xl bg-surface border border-edge p-6 sm:p-10 text-center space-y-3 lr-card">
          <BotanicalIllustration variant="empty-shelf" className="w-44 h-auto mx-auto" />
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink">
            No active shelf rotation for {activeProfile?.name || 'Reader'}
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary max-w-md mx-auto leading-relaxed">
            Curate a calm, intentional face-out shelf from your home library so favorite stories stay fresh without clutter.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            {state.books.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('scan')}
                className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Icon name="scan" className="w-4 h-4" />
                <span>Add Books First</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>{t('home.createShelf')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('presets')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Icon name="sparkles" className="w-4 h-4 text-primary" />
              <span>{t('nav.presets')}</span>
            </button>
          </div>
        </section>
      )}

      {/* Suggestion Section 1: Matching owned books to add to active rotation */}
      {primaryActiveRotation && rotationSuggestions.length > 0 && (
        <section
          aria-labelledby="add-to-rotation-heading"
          className="pt-6 border-t border-edge-subtle/70 space-y-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="add-to-rotation-heading"
              className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight min-w-0 truncate"
            >
              Add to {primaryActiveRotation.title}
            </h2>
            <button
              type="button"
              onClick={() => setSheetRotationId(primaryActiveRotation.id)}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              <span>Manage</span>
              <Icon name="chevronRight" className="w-3.5 h-3.5" />
            </button>
          </div>

          {isDesktop ? (
            <BookCoverGrid
              size={suggestedCardConfig.size}
              customWidth={suggestedCardConfig.customWidth}
              infoPlacement={suggestedCardConfig.infoPlacement}
            >
              {rotationSuggestions.map(({ book, matchReasons }) =>
                renderRecCoverCard(
                  book,
                  matchReasons,
                  false,
                  'rot-add',
                  primaryActiveRotation
                )
              )}
            </BookCoverGrid>
          ) : (
            <BookCoverSlide
              itemCount={rotationSuggestions.length}
              ariaLabel={`Owned books matching ${primaryActiveRotation.title}`}
              showPagination={false}
            >
              {rotationSuggestions.map(({ book, matchReasons }) =>
                renderRecCoverCard(
                  book,
                  matchReasons,
                  true,
                  'rot-add',
                  primaryActiveRotation
                )
              )}
            </BookCoverSlide>
          )}
        </section>
      )}

      {/* Suggestion Section 2: Overall Suggested for [Reader] */}
      {recommendations.length > 0 && (
        <section
          aria-labelledby="up-next-heading"
          className="pt-6 border-t border-edge-subtle/70 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="up-next-heading"
              className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight truncate min-w-0"
            >
              Suggested for {activeProfile?.name || 'Reader'}
            </h2>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                data-action="open-ai-recommendations"
                onClick={() => setAiRecsModal({ isOpen: true })}
                aria-label="See AI recommendations"
                className="min-h-[34px] text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5 shrink-0" />
                <span>AI Picks</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('library')}
                aria-label="Browse all books in library"
                className="min-h-[34px] text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
              >
                <span>Library</span>
                <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {isDesktop ? (
            <BookCoverGrid
              size={suggestedCardConfig.size}
              customWidth={suggestedCardConfig.customWidth}
              infoPlacement={suggestedCardConfig.infoPlacement}
            >
              {recommendations.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, false, 'rec')
              )}
            </BookCoverGrid>
          ) : (
            <BookCoverSlide
              itemCount={recommendations.length}
              ariaLabel={`Suggested books for ${activeProfile?.name || 'Reader'}`}
              showPagination={false}
            >
              {recommendations.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, true, 'rec')
              )}
            </BookCoverSlide>
          )}
        </section>
      )}

      {/* Suggestion Sections 3 & 4: Because you loved [Book XX / YY] */}
      {lovedShelves.map(({ anchorBook, items }, shelfIdx) => (
        <section
          key={anchorBook.id}
          aria-labelledby={`loved-shelf-${shelfIdx}-heading`}
          className="pt-6 border-t border-edge-subtle/70 space-y-3"
        >
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => setInspectedBookId(anchorBook.id)}
              className="group flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
            >
              <div className="w-6 h-6 rounded overflow-hidden bg-surface-subtle border border-edge-subtle shrink-0">
                <BookCover book={anchorBook} size="xs" aspectRatio="square" />
              </div>
              <h2
                id={`loved-shelf-${shelfIdx}-heading`}
                className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight truncate group-hover:text-primary transition-colors"
              >
                Because you loved {anchorBook.title}
              </h2>
            </button>
          </div>

          {isDesktop ? (
            <BookCoverGrid
              size={suggestedCardConfig.size}
              customWidth={suggestedCardConfig.customWidth}
              infoPlacement={suggestedCardConfig.infoPlacement}
            >
              {items.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, false, `loved-${anchorBook.id}`)
              )}
            </BookCoverGrid>
          ) : (
            <BookCoverSlide
              itemCount={items.length}
              ariaLabel={`Owned books similar to ${anchorBook.title}`}
              showPagination={false}
            >
              {items.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, true, `loved-${anchorBook.id}`)
              )}
            </BookCoverSlide>
          )}
        </section>
      ))}

      {/* Suggestion Section 5: Because you like [Genre/Topic] */}
      {genreShelf && genreShelf.items.length > 0 && (
        <section
          aria-labelledby="genre-shelf-heading"
          className="pt-6 border-t border-edge-subtle/70 space-y-3"
        >
          <h2
            id="genre-shelf-heading"
            className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight truncate"
          >
            Because you like {genreShelf.label}
          </h2>

          {isDesktop ? (
            <BookCoverGrid
              size={suggestedCardConfig.size}
              customWidth={suggestedCardConfig.customWidth}
              infoPlacement={suggestedCardConfig.infoPlacement}
            >
              {genreShelf.items.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, false, `genre-${genreShelf.topic}`)
              )}
            </BookCoverGrid>
          ) : (
            <BookCoverSlide
              itemCount={genreShelf.items.length}
              ariaLabel={`Owned ${genreShelf.label} books`}
              showPagination={false}
            >
              {genreShelf.items.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, true, `genre-${genreShelf.topic}`)
              )}
            </BookCoverSlide>
          )}
        </section>
      )}

      {/* Lower Summary: Quiet Inline Household Collection Summary */}
      <section
        aria-label="Active collection summary"
        className="pt-6 border-t border-edge-subtle/70 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-ink font-mono-tabular">
            {state.books.length} {state.books.length === 1 ? 'Book' : 'Books'} Cataloged
            <span className="text-ink-muted font-normal">
              {' · '}
              {activeProfile?.readHistoryBookIds?.length || 0} Read with{' '}
              {activeProfile?.name || 'Reader'}
              {wishlistCount > 0 ? ` · ${wishlistCount} Wishlisted` : ''}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate('rotations')}
            className="min-h-[38px] text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
          >
            {t('home.allShelves')}
          </button>
          <button
            type="button"
            onClick={() => navigate('library')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{t('nav.library')}</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Floating Bottom "Current Read / Last Read" Preview Bar */}
      {bottomBarBook && (
        <div
          role="region"
          aria-label={isBottomBarFinished ? 'Last read preview' : 'Currently reading preview'}
          data-current-read-bar="true"
          style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}
          className={`fixed ${
            bottomNavStyle === 'floating'
              ? 'bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]'
              : 'bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))]'
          } inset-x-3 sm:inset-x-6 md:bottom-6 md:right-6 md:left-auto md:w-[390px] z-30 backdrop-blur-xl rounded-2xl border border-edge shadow-xl px-3 py-2 flex items-center justify-between gap-2.5`}
        >
          <button
            type="button"
            onClick={() => setInspectedBookId(bottomBarBook.id)}
            aria-label={`Open ${isBottomBarFinished ? 'last read' : 'currently reading'} book ${bottomBarBook.title}`}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle shadow-2xs">
              <BookCover
                book={bottomBarBook}
                size="xs"
                aspectRatio={coverAspectRatio}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="min-w-0">
                <p className="font-sans text-[13px] font-semibold text-ink leading-tight truncate">
                  {bottomBarBook.title}
                </p>
                <p className="text-[11px] text-ink-secondary leading-tight truncate">
                  by {bottomBarBook.authors[0] || 'Unknown Author'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 max-w-[110px] rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isBottomBarFinished
                        ? 'w-full bg-success'
                        : 'w-1/2 bg-primary dark:bg-accent'
                    }`}
                  />
                </div>
                <span className="text-[10px] font-medium text-ink-muted whitespace-nowrap">
                  {isBottomBarFinished
                    ? formatFinishedDateLabel(bottomBarBook.lastReadAt)
                    : 'Reading'}
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleBottomBarRead}
              aria-pressed={isBottomBarFinished}
              aria-label={
                isBottomBarFinished
                  ? `${bottomBarBook.title} finished. Tap to mark as reading again`
                  : `Mark ${bottomBarBook.title} as read`
              }
              title={
                isBottomBarFinished
                  ? 'Finished · Tap to mark as reading'
                  : 'Mark as read'
              }
              className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                isBottomBarFinished
                  ? 'text-success bg-success/12 hover:bg-success/20'
                  : 'text-ink-secondary hover:text-primary hover:bg-surface-elevated'
              }`}
            >
              <Icon name="check" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleCurrentBookLoved}
              aria-pressed={Boolean(bottomBarBook.loved)}
              aria-label={bottomBarBook.loved ? 'Remove Loved mark' : 'Mark as Loved'}
              title={bottomBarBook.loved ? 'Loved' : 'Mark as Loved'}
              className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                bottomBarBook.loved
                  ? 'text-loved hover:bg-surface-elevated'
                  : 'text-ink-secondary hover:text-loved hover:bg-surface-elevated'
              }`}
            >
              <Icon
                name={bottomBarBook.loved ? 'heartFilled' : 'heart'}
                className="w-4 h-4"
              />
            </button>
          </div>
        </div>
      )}

      {/* Slide-Up Detail Sheet for Clicking Any Active Rotation */}
      {sheetRotation && (() => {
        const isSheetActive = sheetRotation.status === 'active';
        const validIds = new Set(state.books.map((b) => b.id));
        const totalCount = sheetRotation.bookIds.filter((id) => validIds.has(id)).length;
        const readCount = sheetRotation.bookIds.filter(
          (id) => validIds.has(id) && sheetRotation.completedBookIds?.includes(id)
        ).length;
        const sheetProgressPct =
          totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;
        const sheetSchedule = computeRotationSchedule(
          sheetRotation,
          activeProfile || state.profiles[0]
        );

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-rotation-sheet-title"
            data-rotation-sheet="true"
            onClick={() => setSheetRotationId(null)}
            className="sheet-backdrop fixed inset-0 z-[45] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="animate-sheet-up w-full sm:max-w-2xl max-h-[90dvh] sm:max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
            >
              <div
                className="w-10 h-1.5 bg-edge rounded-full mx-auto mt-3 shrink-0"
                aria-hidden="true"
              />

              <div className="px-4 sm:px-5 pt-2.5 pb-3 border-b border-edge-subtle flex items-center justify-between gap-2.5 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {isSheetActive && (
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full bg-success ring-[3px] ring-success/20 lr-active-dot-pulse shrink-0"
                      />
                    )}
                    <h2
                      id="home-rotation-sheet-title"
                      className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight truncate"
                    >
                      {sheetRotation.title}
                    </h2>
                  </div>
                  <p className="text-[11px] font-mono-tabular text-ink-secondary mt-0.5 truncate">
                    {isSheetActive
                      ? 'Active Shelf'
                      : sheetSchedule.lastActiveDateLabel
                        ? `Saved · Last active ${sheetSchedule.lastActiveDateLabel}`
                        : 'Saved Shelf'}{' '}
                    · {readCount}/{totalCount} read ({sheetProgressPct}%)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSheetRotationId(null)}
                  aria-label="Close rotation details"
                  className="min-h-[44px] min-w-[44px] -mr-1.5 rounded-full text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  <Icon name="close" className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 sm:py-4">
                <RotationShelfCard
                  rotation={sheetRotation}
                  books={state.books}
                  isActive={isSheetActive}
                  variant="sheet"
                  hideHeaderTitle
                  isEditorOpen={editingShelfId === sheetRotation.id}
                  onOpenEditor={() => setEditingShelfId(sheetRotation.id)}
                  onCloseEditor={() => setEditingShelfId(null)}
                  onActivate={() => store.toggleRotationActive(sheetRotation.id)}
                  onDelete={async () => {
                    setSheetRotationId(null);
                    await store.deleteRotation(sheetRotation.id);
                  }}
                  onSwapBook={(bookId) =>
                    store.replaceRotationBookRandom(sheetRotation.id, bookId)
                  }
                  onReplaceBook={(bookId) =>
                    setRotationEditor({
                      modalMode: 'replace',
                      rotationId: sheetRotation.id,
                      targetBookId: bookId,
                    })
                  }
                  onAddRandom={(count) =>
                    store.addBooksToRotationRandom(sheetRotation.id, count)
                  }
                  onOpenAddModal={() =>
                    setRotationEditor({
                      modalMode: 'add',
                      rotationId: sheetRotation.id,
                      targetBookId: null,
                    })
                  }
                  onToggleRead={(bookId) =>
                    store.toggleRotationBookRead(sheetRotation.id, bookId)
                  }
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Manual Replace / Add Picker Modal for Home Rotation Slide-Up Sheet */}
      <RotationEditorModal
        modalMode={rotationEditor.modalMode}
        rotationId={rotationEditor.rotationId}
        targetBookId={rotationEditor.targetBookId}
        onClose={() =>
          setRotationEditor({ modalMode: null, rotationId: null, targetBookId: null })
        }
      />
    </div>
  );
};
