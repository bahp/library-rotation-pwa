import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { Icon } from '../common/Icon.js';
import { BookSectionViewToggle, type SectionBookLayout } from '../common/BookSectionViewToggle.js';
import { HorizontalBookCarousel } from '../common/HorizontalBookCarousel.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { getProfileRecommendations } from '../../features/tagging/recommendations.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import { normalizeCollectionStatus } from '../../types/models.js';
import type { Book, RotationShelf } from '../../types/models.js';

function loadSectionLayout(key: string, fallback: SectionBookLayout): SectionBookLayout {
  try {
    const val = localStorage.getItem(key);
    if (val === 'scroll' || val === 'grid' || val === 'list') return val;
  } catch {
    // ignore storage errors
  }
  return fallback;
}

function saveSectionLayout(key: string, mode: SectionBookLayout): void {
  try {
    localStorage.setItem(key, mode);
  } catch {
    // ignore storage errors
  }
}

function formatRelativeActiveLabel(iso?: string): string {
  if (!iso) return 'Active';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Active';
  const diffDays = Math.max(0, Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return 'Active today';
  if (diffDays === 1) return 'Active yesterday';
  if (diffDays < 30) return `Active ${diffDays}d ago`;
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

  const [isPlacementOpen, setIsPlacementOpen] = useState(false);
  const [selectedRotationId, setSelectedRotationId] = useState<string | null>(null);
  const [shelfLayout, setShelfLayout] = useState<SectionBookLayout>(() =>
    loadSectionLayout('bunko_home_shelf_layout_v1', 'scroll')
  );
  const [recsLayout, setRecsLayout] = useState<SectionBookLayout>(() =>
    loadSectionLayout('bunko_home_recs_layout_v1', 'scroll')
  );

  const handleShelfLayoutChange = (mode: SectionBookLayout) => {
    setShelfLayout(mode);
    saveSectionLayout('bunko_home_shelf_layout_v1', mode);
  };

  const handleRecsLayoutChange = (mode: SectionBookLayout) => {
    setRecsLayout(mode);
    saveSectionLayout('bunko_home_recs_layout_v1', mode);
  };

  const bookMap = useMemo(() => {
    return new Map(state.books.map((b: Book) => [b.id, b]));
  }, [state.books]);

  const activeRotations = useMemo(() => {
    if (!activeProfile) return [];
    return state.rotations
      .filter((r) => r.profileId === activeProfile.id && r.status === 'active')
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.activatedAt || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.activatedAt || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [state.rotations, activeProfile]);

  useEffect(() => {
    if (
      selectedRotationId &&
      !activeRotations.some((r) => r.id === selectedRotationId)
    ) {
      setSelectedRotationId(null);
    }
  }, [activeRotations, selectedRotationId]);

  const displayedRotation: RotationShelf | null = useMemo(() => {
    if (selectedRotationId) {
      const matched = activeRotations.find((r) => r.id === selectedRotationId);
      if (matched) return matched;
    }
    return activeRotations[0] || activeRotation || null;
  }, [activeRotations, selectedRotationId, activeRotation]);

  const shelfBooks = useMemo(() => {
    if (!displayedRotation) return [];
    return displayedRotation.bookIds
      .map((id: string) => bookMap.get(id))
      .filter((b): b is Book => Boolean(b));
  }, [bookMap, displayedRotation]);

  const readBookIds = useMemo(() => {
    return new Set(displayedRotation?.completedBookIds || []);
  }, [displayedRotation]);

  const pickedBookIds = useMemo(() => {
    return new Set(displayedRotation?.pickedBookIds || []);
  }, [displayedRotation]);

  const recommendations = useMemo(() => {
    if (!activeProfile) return [];
    return getProfileRecommendations({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 8,
    });
  }, [state.books, activeProfile, state.rotations]);

  const activeSchedule = useMemo(() => {
    if (!displayedRotation || !activeProfile) return null;
    return computeRotationSchedule(displayedRotation, activeProfile);
  }, [displayedRotation, activeProfile]);

  const wishlistCount = useMemo(() => {
    return state.books.filter(
      (b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist'
    ).length;
  }, [state.books]);

  // Most recently clicked "Reading" book for active profile
  const currentReadingBook: Book | null = useMemo(() => {
    const readingIds = activeProfile?.currentlyReadingBookIds;
    if (!Array.isArray(readingIds) || readingIds.length === 0) return null;
    for (let i = readingIds.length - 1; i >= 0; i -= 1) {
      const candidate = bookMap.get(readingIds[i]);
      if (candidate) return candidate;
    }
    return null;
  }, [activeProfile?.currentlyReadingBookIds, bookMap]);

  const handleTogglePicked = async (bookId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!displayedRotation) return;
    await store.toggleRotationBookPicked(displayedRotation.id, bookId);
  };

  const handleMarkCurrentBookRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentReadingBook) return;
    await store.setProfileBookReadingStatus(activeProfile?.id, currentReadingBook.id, 'read');
    store.notify(`Marked "${currentReadingBook.title}" as read!`, 'success');
  };

  const handleToggleCurrentBookLoved = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentReadingBook) return;
    await store.toggleBookLoved(currentReadingBook.id);
  };

  const completedCount = displayedRotation
    ? displayedRotation.completedBookIds.filter((id) => displayedRotation.bookIds.includes(id)).length
    : 0;
  const pickedCount = displayedRotation
    ? (displayedRotation.pickedBookIds || []).filter((id) => displayedRotation.bookIds.includes(id)).length
    : 0;
  const progressPct =
    shelfBooks.length > 0 ? Math.round((completedCount / shelfBooks.length) * 100) : 0;

  // Circular SVG Progress Ring geometry
  const ringRadius = 22;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  const coverAspectRatio = state.settings?.coverAspectRatio || 'square';
  const cardSize = state.settings?.bookCardSize || 'compact';
  const shelfGridClass =
    cardSize === 'compact'
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
      : cardSize === 'large'
        ? 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5'
        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4';

  const renderShelfBookCard = (book: Book, isCarouselItem: boolean) => {
    const isRead = readBookIds.has(book.id);
    const isPicked = pickedBookIds.has(book.id);
    const isReadPreviously = Boolean(
      activeProfile?.readHistoryBookIds?.includes(book.id)
    );
    const primaryAuthor = book.authors[0] || 'Unknown Author';

    const badgeAriaLabel = isPicked
      ? `Unmark ${book.title} as picked in this rotation`
      : isReadPreviously
        ? `Read previously · Mark ${book.title} as picked in this rotation`
        : `Mark ${book.title} as picked and read`;

    return (
      <article
        key={book.id}
        data-book-card={book.id}
        className={`group flex flex-col justify-between min-w-0 rounded-xl border lr-card transition-all ${
          isCarouselItem
            ? 'w-[31%] min-w-[106px] max-w-[144px] sm:w-[138px] shrink-0 snap-start p-1.5 sm:p-2'
            : cardSize === 'compact'
              ? 'p-1.5 sm:p-2'
              : cardSize === 'large'
                ? 'p-3 sm:p-3.5'
                : 'p-2.5 sm:p-3'
        } ${
          isRead || isPicked
            ? 'bg-surface border-primary/45'
            : 'bg-surface border-edge hover:border-secondary'
        }`}
      >
        <div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setInspectedBookId(book.id)}
              aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
              className="block w-full rounded-lg overflow-hidden bg-surface-subtle transition-transform active:scale-[0.985] cursor-pointer"
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
              />
            </button>

            {/* 44x44px Thumb Hitbox for 1-Tap Read/Picked Toggle */}
            <button
              type="button"
              onClick={(e) => handleTogglePicked(book.id, e)}
              aria-pressed={isPicked}
              aria-label={badgeAriaLabel}
              className="absolute -bottom-1 -left-1 z-20 min-h-[44px] min-w-[44px] flex items-end justify-start p-2.5 cursor-pointer"
            >
              {isRead ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs border bg-primary text-primary-fg border-surface">
                  <Icon name="check" className="w-2.5 h-2.5" />
                  <span>Read</span>
                </span>
              ) : isPicked ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs border bg-primary text-primary-fg border-surface">
                  <Icon name="bookmarkFilled" className="w-2.5 h-2.5" />
                  <span>Picked</span>
                </span>
              ) : isReadPreviously ? (
                <span
                  title="Read previously (not picked in this rotation)"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs border bg-surface/95 text-primary border-edge"
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
          </div>

          <button
            type="button"
            onClick={() => setInspectedBookId(book.id)}
            className="mt-1.5 w-full text-left min-w-0 rounded cursor-pointer"
          >
            <h2
              className={`font-sans ${
                isCarouselItem || cardSize === 'compact'
                  ? 'text-xs sm:text-[13px]'
                  : cardSize === 'large'
                    ? 'text-sm sm:text-base'
                    : 'text-[13px] sm:text-sm'
              } font-semibold text-ink leading-tight line-clamp-2 ${
                isRead ? 'opacity-75' : ''
              }`}
            >
              {book.title}
            </h2>
            <p className="text-[11px] text-ink-secondary truncate leading-tight mt-0.5">
              {primaryAuthor}
            </p>
          </button>
        </div>
      </article>
    );
  };

  const renderRecCoverCard = (
    book: Book,
    matchReasons: string[],
    isCarouselItem: boolean
  ) => {
    const primaryAuthor = book.authors[0] || 'Unknown Author';
    return (
      <article
        key={book.id}
        data-book-card={`rec-${book.id}`}
        className={`group flex flex-col justify-between min-w-0 rounded-xl border border-edge bg-surface-subtle/60 hover:border-secondary p-1.5 sm:p-2 transition-all ${
          isCarouselItem
            ? 'w-[31%] min-w-[106px] max-w-[144px] sm:w-[138px] shrink-0 snap-start'
            : ''
        }`}
      >
        <div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setInspectedBookId(book.id)}
              aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
              className="block w-full rounded-lg overflow-hidden bg-surface-subtle transition-transform active:scale-[0.985] cursor-pointer"
            >
              <BookCover
                book={book}
                size="grid"
                aspectRatio={coverAspectRatio}
                showBadges
                hideRotationAdorno
                activeProfile={activeProfile}
                profiles={state.profiles}
              />
            </button>

            {displayedRotation && (
              <button
                type="button"
                onClick={async () => {
                  await store.addBooksToRotationManual(displayedRotation.id, [book.id]);
                  store.notify(`Added "${book.title}" to active shelf!`, 'success');
                }}
                aria-label={`Add ${book.title} to active shelf`}
                title="Add to active shelf"
                className="absolute -bottom-1 -right-1 z-20 min-h-[40px] min-w-[40px] flex items-end justify-end p-2 cursor-pointer"
              >
                <span className="w-7 h-7 rounded-full bg-surface/95 hover:bg-primary hover:text-primary-fg border border-edge text-ink shadow-xs flex items-center justify-center transition-colors">
                  <Icon name="plus" className="w-3.5 h-3.5" />
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setInspectedBookId(book.id)}
            className="mt-1.5 w-full text-left min-w-0 rounded cursor-pointer"
          >
            <h3 className="font-sans text-xs sm:text-[13px] font-semibold text-ink leading-tight line-clamp-2">
              {book.title}
            </h3>
            <p className="text-[11px] text-ink-secondary truncate leading-tight mt-0.5">
              {primaryAuthor}
            </p>
            <p className="text-[10px] font-semibold text-primary truncate leading-tight mt-0.5">
              {matchReasons[0] || 'Fresh pick'}
            </p>
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className={`space-y-5 text-left ${currentReadingBook ? 'pb-24' : ''}`}>
      {/* Current Rotation Section */}
      {displayedRotation ? (
        <section aria-labelledby="active-shelf-heading" className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 pb-2 border-b border-edge-subtle">
            <div className="min-w-0 flex-1 space-y-1">
              <h1
                id="active-shelf-heading"
                className="font-display text-2xl sm:text-4xl font-semibold text-ink leading-[1.08] tracking-tight"
              >
                {displayedRotation.title}
              </h1>
              {displayedRotation.rules?.objective && (
                <p className="text-xs sm:text-sm text-ink-secondary leading-snug line-clamp-2 max-w-2xl">
                  {displayedRotation.rules.objective}
                </p>
              )}
              {activeSchedule && (
                <p
                  data-rotation-schedule="active"
                  className={`flex items-center gap-1.5 text-xs leading-tight ${
                    activeSchedule.isDue
                      ? 'font-semibold text-accent'
                      : activeSchedule.isDueSoon
                        ? 'font-semibold text-primary'
                        : 'text-ink-secondary font-medium'
                  }`}
                >
                  <Icon name="calendar" className="w-3.5 h-3.5 shrink-0 opacity-80" />
                  <span>{activeSchedule.activeScheduleLine}</span>
                </p>
              )}
            </div>

            {/* Compact Reading Progress Ring & Quick Shelf Actions */}
            <div className="rounded-xl bg-surface border border-edge px-3.5 py-2.5 lr-card flex items-center justify-between sm:justify-start gap-3.5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                  <svg className="w-12 h-12 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
                    <circle
                      cx="28"
                      cy="28"
                      r={ringRadius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4.5"
                      className="text-edge-subtle"
                    />
                    <circle
                      cx="28"
                      cy="28"
                      r={ringRadius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4.5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringDashOffset}
                      className="text-primary dark:text-accent transition-all duration-300"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold font-mono-tabular text-ink">
                    {progressPct}%
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">
                    Reading progress
                  </p>
                  <p className="text-[11px] font-mono-tabular text-ink-secondary mt-0.5">
                    {completedCount} of {shelfBooks.length} {shelfBooks.length === 1 ? 'book' : 'books'}
                    {pickedCount > 0 ? ` · ${pickedCount} picked` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pl-3 border-l border-edge-subtle">
                <button
                  type="button"
                  onClick={() => setIsPlacementOpen(true)}
                  aria-label="Stock shelf checklist"
                  className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <Icon name="checklist" className="w-3.5 h-3.5 text-primary" />
                  <span>Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: displayedRotation.id })}
                  aria-label="Edit active rotation"
                  className="min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <span>Edit</span>
                </button>
              </div>
            </div>
          </div>

          {/* Shelf View Switcher (Scroll / Grid / List) & View All Books */}
          <div className="flex items-center justify-between gap-2.5">
            {activeRotations.length > 1 ? (
              <div
                role="tablist"
                aria-label="Active shelves"
                className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge overflow-x-auto no-scrollbar max-w-full"
              >
                {activeRotations.map((rot) => {
                  const selected = rot.id === displayedRotation.id;
                  return (
                    <button
                      key={rot.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setSelectedRotationId(rot.id)}
                      className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-primary text-primary-fg shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {rot.title}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-xs font-medium text-ink-secondary">
                Current shelf
              </span>
            )}

            <div className="flex items-center gap-2.5 ml-auto shrink-0">
              <BookSectionViewToggle
                value={shelfLayout}
                onChange={handleShelfLayoutChange}
                ariaLabel="Current shelf layout"
              />

              <a
                href="#/library"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('library');
                }}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 whitespace-nowrap"
              >
                <span>All books</span>
                <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Shelf Books (Horizontal Scroll with Dots / Grid / List) */}
          {shelfBooks.length > 0 ? (
            <div className="space-y-3.5">
              {shelfLayout === 'scroll' ? (
                <HorizontalBookCarousel
                  itemCount={shelfBooks.length}
                  ariaLabel={`${displayedRotation.title} books`}
                >
                  {shelfBooks.map((book) => renderShelfBookCard(book, true))}
                </HorizontalBookCarousel>
              ) : shelfLayout === 'list' ? (
                <div className="space-y-2">
                  {shelfBooks.map((book) => {
                    const isRead = readBookIds.has(book.id);
                    const isPicked = pickedBookIds.has(book.id);
                    const isReadPreviously = Boolean(
                      activeProfile?.readHistoryBookIds?.includes(book.id)
                    );
                    const primaryAuthor = book.authors[0] || 'Unknown Author';

                    const badgeAriaLabel = isPicked
                      ? `Unmark ${book.title} as picked in this rotation`
                      : isReadPreviously
                        ? `Read previously · Mark ${book.title} as picked in this rotation`
                        : `Mark ${book.title} as picked and read`;

                    return (
                      <article
                        key={book.id}
                        data-book-card={book.id}
                        className={`group flex items-center justify-between gap-3 rounded-xl border p-2 sm:p-2.5 lr-card transition-all ${
                          isRead || isPicked
                            ? 'bg-surface border-primary/45'
                            : 'bg-surface border-edge hover:border-secondary'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setInspectedBookId(book.id)}
                          aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle">
                            <BookCover
                              book={book}
                              size="sm"
                              aspectRatio={coverAspectRatio}
                              showBadges
                              hideRotationAdorno
                              activeProfile={activeProfile}
                              profiles={state.profiles}
                              isReadOnActiveShelf={isRead}
                              isPickedInRotation={isPicked}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h2
                              className={`font-sans text-sm sm:text-[15px] font-semibold text-ink leading-tight truncate ${
                                isRead ? 'opacity-75' : ''
                              }`}
                            >
                              {book.title}
                            </h2>
                            <p className="text-xs text-ink-secondary truncate leading-tight mt-0.5">
                              {primaryAuthor}
                            </p>
                            <p className="text-[11px] text-ink-muted truncate leading-tight mt-0.5">
                              {isRead
                                ? 'Read in this rotation'
                                : isPicked
                                  ? 'Picked for reading'
                                  : isReadPreviously
                                    ? 'Read previously'
                                    : 'On active shelf'}
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleTogglePicked(book.id, e)}
                          aria-pressed={isPicked}
                          aria-label={badgeAriaLabel}
                          className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                            isRead || isPicked
                              ? 'bg-primary text-primary-fg shadow-2xs'
                              : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
                          }`}
                        >
                          <Icon
                            name={isPicked && !isRead ? 'bookmarkFilled' : 'check'}
                            className="w-3.5 h-3.5"
                          />
                          <span>
                            {isRead ? 'Read' : isPicked ? 'Picked' : 'Mark Read'}
                          </span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={shelfGridClass}>
                  {shelfBooks.map((book) => renderShelfBookCard(book, false))}
                </div>
              )}

              {/* Compact Anchor Bar: Manage Your Rotation */}
              <div className="rounded-xl bg-surface-elevated border border-edge p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 lr-card">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-lg bg-surface border border-edge text-primary inline-flex items-center justify-center shrink-0">
                    <Icon name="rotations" className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-ink leading-tight">
                      Manage your rotation
                    </h2>
                    <p className="text-xs text-ink-secondary truncate">
                      Swap, stock, or draw fresh books for this cycle.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsPlacementOpen(true)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-subtle border border-edge text-xs font-semibold text-ink cursor-pointer"
                  >
                    Stock Checklist
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('rotations', { edit: displayedRotation.id })}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Edit Rotation</span>
                    <Icon name="chevronRight" className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-surface border border-edge p-8 text-center space-y-3 lr-card">
              <BotanicalIllustration variant="empty-shelf" className="w-40 h-auto mx-auto" />
              <h2 className="font-display text-xl font-semibold text-ink">
                This shelf doesn’t have any books placed yet
              </h2>
              <p className="text-xs text-ink-secondary max-w-sm mx-auto">
                Add books to your library or edit this rotation to draw fresh titles.
              </p>
              <div className="pt-1 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('scan')}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Add Books
                </button>
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: displayedRotation.id })}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer transition-colors"
                >
                  Edit Shelf
                </button>
              </div>
            </div>
          )}
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

      {/* Discovery Strip: Suggested Next for [Reader] */}
      {recommendations.length > 0 && (
        <section
          aria-labelledby="up-next-heading"
          className="rounded-xl bg-surface border border-edge p-3.5 sm:p-4 space-y-3 lr-card"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="starFilled" className="w-4 h-4 text-accent shrink-0" />
              <h2
                id="up-next-heading"
                className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight truncate"
              >
                Suggested for {activeProfile?.name || 'Reader'}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-action="open-ai-recommendations"
                onClick={() => setAiRecsModal({ isOpen: true })}
                aria-label="See AI recommendations"
                title="See AI recommendations"
                className="min-h-[34px] min-w-[34px] rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-accent inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <Icon name="sparkles" className="w-4 h-4" />
              </button>

              <BookSectionViewToggle
                value={recsLayout}
                onChange={handleRecsLayoutChange}
                ariaLabel="Recommendations layout"
              />
            </div>
          </div>

          {recsLayout === 'scroll' ? (
            <HorizontalBookCarousel
              itemCount={recommendations.length}
              ariaLabel={`Suggested books for ${activeProfile?.name || 'Reader'}`}
            >
              {recommendations.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, true)
              )}
            </HorizontalBookCarousel>
          ) : recsLayout === 'grid' ? (
            <div className={shelfGridClass}>
              {recommendations.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, false)
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {recommendations.map(({ book, matchReasons }) => (
                <div
                  key={book.id}
                  data-book-card={`rec-${book.id}`}
                  className="rounded-lg bg-surface-subtle border border-edge-subtle p-2 flex items-center justify-between gap-2 lr-card"
                >
                  <button
                    type="button"
                    onClick={() => setInspectedBookId(book.id)}
                    className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                  >
                    <BookCover book={book} size="xs" aspectRatio={coverAspectRatio} />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block font-sans text-[13px] font-semibold text-ink truncate leading-tight">
                        {book.title}
                      </span>
                      <span className="block text-[11px] text-ink-secondary truncate leading-tight">
                        {book.authors[0] || 'Unknown Author'}
                      </span>
                      <span className="inline-block text-[10px] text-primary truncate leading-tight font-semibold">
                        {matchReasons[0] || 'Fresh pick'}
                      </span>
                    </span>
                  </button>
                  {displayedRotation && (
                    <button
                      type="button"
                      onClick={async () => {
                        await store.addBooksToRotationManual(displayedRotation.id, [book.id]);
                        store.notify(`Added "${book.title}" to active shelf!`, 'success');
                      }}
                      aria-label={`Add ${book.title} to active shelf`}
                      title="Add to active shelf"
                      className="min-h-[36px] min-w-[36px] rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-ink flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                    >
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Lower Row: Active Rotations List & Household Collection Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {activeRotations.length > 0 && (
          <section
            aria-labelledby="active-rotations-heading"
            className="lg:col-span-7 rounded-xl bg-surface border border-edge p-3.5 sm:p-4 space-y-3 lr-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2
                  id="active-rotations-heading"
                  className="font-display text-lg sm:text-xl font-semibold text-ink"
                >
                  Active Rotations
                </h2>
                <span className="text-xs font-mono-tabular text-ink-secondary">
                  ({activeRotations.length})
                </span>
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={() => navigate('presets')}
                  className="text-xs font-semibold text-ink-secondary hover:text-ink hover:underline cursor-pointer"
                >
                  {t('nav.presets')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('rotations')}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <span>{t('home.allShelves')}</span>
                  <Icon name="chevronRight" className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-edge-subtle">
              {activeRotations.map((rot) => {
                const isSelected = displayedRotation?.id === rot.id;
                const leadBook = rot.bookIds
                  .map((id) => bookMap.get(id))
                  .find((b): b is Book => Boolean(b));
                const rotCompletedCount = rot.completedBookIds.filter((id) =>
                  rot.bookIds.includes(id)
                ).length;
                const activeStamp = rot.activatedAt || rot.updatedAt || rot.createdAt;
                const primaryTag = rot.rules?.preferredTags?.[0];

                return (
                  <button
                    key={rot.id}
                    type="button"
                    onClick={() => {
                      setSelectedRotationId(rot.id);
                      if (typeof window !== 'undefined') {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className={`w-full py-2.5 first:pt-1 last:pb-1 px-2 -mx-2 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-surface-subtle/80'
                        : 'hover:bg-surface-subtle/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-11 h-11 rounded-lg overflow-hidden bg-surface-subtle border border-edge-subtle shrink-0 flex items-center justify-center">
                        {leadBook ? (
                          <BookCover book={leadBook} size="xs" aspectRatio="square" />
                        ) : (
                          <Icon name="rotations" className="w-4 h-4 text-ink-muted" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm sm:text-[15px] font-semibold text-ink leading-tight truncate">
                          {rot.title}
                        </p>
                        <p className="text-[11px] text-ink-secondary truncate leading-tight mt-0.5">
                          <span className="font-mono-tabular">
                            {rot.bookIds.length} {rot.bookIds.length === 1 ? 'book' : 'books'}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono-tabular">
                            {rotCompletedCount}/{rot.bookIds.length} read
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>{formatRelativeActiveLabel(activeStamp)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {primaryTag && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary capitalize max-w-[100px] truncate">
                          <Icon name="tag" className="w-3 h-3 text-accent shrink-0" />
                          <span className="truncate">{primaryTag}</span>
                        </span>
                      )}
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <Icon name="check" className="w-3 h-3" />
                          <span>Viewing</span>
                        </span>
                      ) : (
                        <Icon name="chevronRight" className="w-4 h-4 text-ink-muted" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section
          aria-label="Active collection summary"
          className={`${
            activeRotations.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'
          } rounded-xl bg-surface border border-edge p-3.5 sm:p-4 flex flex-col justify-between gap-3.5 lr-card`}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
              {t('home.activeCollection')}
            </p>
            <p className="font-display text-xl font-semibold text-ink mt-1">
              {state.books.length} {state.books.length === 1 ? 'Book' : 'Books'} Cataloged
            </p>
            <p className="text-xs text-ink-secondary font-mono-tabular mt-1">
              {activeProfile?.readHistoryBookIds?.length || 0} Read with{' '}
              {activeProfile?.name || 'Reader'}
              {wishlistCount > 0 ? ` · ${wishlistCount} Wishlisted` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-edge-subtle">
            {wishlistCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('library')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
              >
                Wishlist ({wishlistCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('library')}
              className="min-h-[40px] px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <span>{t('nav.library')}</span>
              <Icon name="chevronRight" className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </div>

      {/* Floating Bottom "Current Read" Preview Bar (shows last-clicked Reading book) */}
      {currentReadingBook && (
        <div
          role="region"
          aria-label="Currently reading preview"
          data-current-read-bar="true"
          style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}
          className="fixed bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))] inset-x-3 sm:inset-x-6 md:bottom-6 md:right-6 md:left-auto md:w-[390px] z-30 backdrop-blur-xl rounded-2xl border border-edge shadow-xl px-3 py-2 flex items-center justify-between gap-2.5"
        >
          <button
            type="button"
            onClick={() => setInspectedBookId(currentReadingBook.id)}
            aria-label={`Open currently reading book ${currentReadingBook.title}`}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle shadow-2xs">
              <BookCover
                book={currentReadingBook}
                size="xs"
                aspectRatio={coverAspectRatio}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="min-w-0">
                <p className="font-sans text-[13px] font-semibold text-ink leading-tight truncate">
                  {currentReadingBook.title}
                </p>
                <p className="text-[11px] text-ink-secondary leading-tight truncate">
                  by {currentReadingBook.authors[0] || 'Unknown Author'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 max-w-[110px] rounded-full bg-surface-elevated overflow-hidden">
                  <div className="h-full w-1/2 rounded-full bg-primary dark:bg-accent" />
                </div>
                <span className="text-[10px] font-medium text-ink-muted whitespace-nowrap">
                  Reading
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleMarkCurrentBookRead}
              aria-label={`Mark ${currentReadingBook.title} as read`}
              title="Mark as read"
              className="min-h-[40px] min-w-[40px] rounded-xl text-ink-secondary hover:text-primary hover:bg-surface-elevated flex items-center justify-center transition-colors cursor-pointer"
            >
              <Icon name="check" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleCurrentBookLoved}
              aria-pressed={Boolean(currentReadingBook.loved)}
              aria-label={currentReadingBook.loved ? 'Remove Loved mark' : 'Mark as Loved'}
              title={currentReadingBook.loved ? 'Loved' : 'Mark as Loved'}
              className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                currentReadingBook.loved
                  ? 'text-loved hover:bg-surface-elevated'
                  : 'text-ink-secondary hover:text-loved hover:bg-surface-elevated'
              }`}
            >
              <Icon
                name={currentReadingBook.loved ? 'heartFilled' : 'heart'}
                className="w-4 h-4"
              />
            </button>
          </div>
        </div>
      )}

      <ShelfPlacementModal
        rotation={displayedRotation}
        isOpen={isPlacementOpen}
        onClose={() => setIsPlacementOpen(false)}
      />
    </div>
  );
};
