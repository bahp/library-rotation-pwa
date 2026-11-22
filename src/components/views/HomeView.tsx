import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverList,
  BookCoverSlide,
} from '../common/BookCoverCard.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { Icon } from '../common/Icon.js';
import { BookSectionViewToggle, type SectionBookLayout } from '../common/BookSectionViewToggle.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { getProfileRecommendations } from '../../features/tagging/recommendations.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import { resolveBookCardDisplayConfig } from '../../config/index.js';
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

  const handleTogglePicked = async (bookId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!displayedRotation) return;
    await store.toggleRotationBookPicked(displayedRotation.id, bookId);
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

  const completedCount = displayedRotation
    ? displayedRotation.completedBookIds.filter((id) => displayedRotation.bookIds.includes(id)).length
    : 0;
  const progressPct =
    shelfBooks.length > 0 ? Math.round((completedCount / shelfBooks.length) * 100) : 0;

  const bottomNavStyle = state.settings?.bottomNavStyle === 'full' ? 'full' : 'floating';
  const shelfCardConfig = resolveBookCardDisplayConfig(state.settings, 'homeShelf');
  const suggestedCardConfig = resolveBookCardDisplayConfig(state.settings, 'homeSuggested');
  const coverAspectRatio = shelfCardConfig.aspectRatio;

  const renderShelfBookCard = (book: Book, isCarouselItem: boolean) => {
    const isRead = readBookIds.has(book.id);
    const isPicked = pickedBookIds.has(book.id);
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
        onClick={(e) => handleTogglePicked(book.id, e)}
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
        key={book.id}
        book={book}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout={isCarouselItem ? 'carousel' : 'grid'}
        size={shelfCardConfig.size}
        aspectRatio={shelfCardConfig.aspectRatio}
        infoPlacement={shelfCardConfig.infoPlacement}
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
    isCarouselItem: boolean
  ) => {
    const isOverlay = suggestedCardConfig.infoPlacement === 'overlay';
    const addAction = displayedRotation ? (
      <button
        type="button"
        onClick={async () => {
          await store.addBooksToRotationManual(displayedRotation.id, [book.id]);
          store.notify(`Added "${book.title}" to active shelf!`, 'success');
        }}
        aria-label={`Add ${book.title} to active shelf`}
        title="Add to active shelf"
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
        key={book.id}
        dataBookCard={`rec-${book.id}`}
        book={book}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout={isCarouselItem ? 'carousel' : 'grid'}
        size={suggestedCardConfig.size}
        aspectRatio={suggestedCardConfig.aspectRatio}
        infoPlacement={suggestedCardConfig.infoPlacement}
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
    <div className={`space-y-5 text-left ${bottomBarBook ? 'pb-24' : ''}`}>
      {/* Current Rotation Section */}
      {displayedRotation ? (
        <section aria-labelledby="active-shelf-heading" className="space-y-3.5">
          <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-edge-subtle">
            <div className="min-w-0 flex-1 space-y-1">
              <h1
                id="active-shelf-heading"
                className="font-display text-2xl sm:text-4xl font-semibold text-ink leading-[1.08] tracking-tight flex items-start gap-2.5"
              >
                <span
                  aria-hidden="true"
                  title="Active shelf"
                  className="w-2.5 h-2.5 rounded-full bg-success ring-4 ring-success/15 shrink-0 mt-2 sm:mt-3"
                />
                <span className="min-w-0">{displayedRotation.title}</span>
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

            {/* Top-Right Linear Reading Progress Readout */}
            <div
              data-home-progress-readout="true"
              className="shrink-0 text-right space-y-1 pt-0.5 min-w-[82px]"
              title={`Reading progress: ${completedCount} of ${shelfBooks.length} ${shelfBooks.length === 1 ? 'book' : 'books'} (${progressPct}%)`}
              aria-label={`Reading progress: ${completedCount} of ${shelfBooks.length} books read, ${progressPct}%`}
            >
              <p className="font-display text-2xl sm:text-[28px] font-bold text-ink leading-none font-mono-tabular">
                {progressPct}%
              </p>
              <p className="font-serif-italic italic text-[11px] sm:text-xs text-ink-secondary leading-none whitespace-nowrap">
                {completedCount} of {shelfBooks.length} read
              </p>
              <div className="h-[3px] w-full rounded-full lr-progress-track overflow-hidden">
                <div
                  className="h-full rounded-full lr-progress-fill transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Active Shelf Tabs (when >1) + Unified Action & Display Capsule Toolbar */}
          <div className="space-y-2.5">
            {activeRotations.length > 1 && (
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
                      className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-primary text-primary-fg shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {selected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" aria-hidden="true" />
                      )}
                      <span>{rot.title}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div
              data-home-action-bar="true"
              style={{
                backgroundColor: 'var(--capsule-bg)',
                borderColor: 'var(--capsule-border)',
              }}
              className="w-full rounded-full border px-2 sm:px-3 py-1 flex items-center justify-between gap-1 shadow-2xs"
            >
              <div className="flex items-center min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setIsPlacementOpen(true)}
                  aria-label="Stock shelf checklist"
                  className="min-h-[38px] px-3 sm:px-4 rounded-full text-xs sm:text-[13px] font-medium text-ink hover:bg-surface-subtle inline-flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <Icon name="checklist" className="w-4 h-4 text-ink-secondary shrink-0" />
                  <span>Stock</span>
                </button>
                <span aria-hidden="true" className="w-px h-5 bg-edge-subtle mx-0.5 sm:mx-1.5 shrink-0" />
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: displayedRotation.id })}
                  aria-label="Edit active rotation"
                  className="min-h-[38px] px-3 sm:px-4 rounded-full text-xs sm:text-[13px] font-medium text-ink hover:bg-surface-subtle inline-flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <Icon name="sliders" className="w-4 h-4 text-ink-secondary shrink-0" />
                  <span>Edit</span>
                </button>
              </div>

              <span aria-hidden="true" className="w-px h-5 bg-edge-subtle mr-1 sm:mr-1.5 shrink-0" />

              <BookSectionViewToggle
                value={shelfLayout}
                onChange={handleShelfLayoutChange}
                variant="capsule"
                ariaLabel="Current shelf layout"
              />
            </div>
          </div>

          {/* Shelf Books (Horizontal Scroll with Dots / Grid / List) */}
          {shelfBooks.length > 0 ? (
            <div className="space-y-3.5">
              {shelfLayout === 'scroll' ? (
                <BookCoverSlide
                  itemCount={shelfBooks.length}
                  ariaLabel={`${displayedRotation.title} books`}
                >
                  {shelfBooks.map((book) => renderShelfBookCard(book, true))}
                </BookCoverSlide>
              ) : shelfLayout === 'list' ? (
                <BookCoverList>
                  {shelfBooks.map((book) => {
                    const isRead = readBookIds.has(book.id);
                    const isPicked = pickedBookIds.has(book.id);
                    const isReadPreviously = Boolean(
                      activeProfile?.readHistoryBookIds?.includes(book.id)
                    );

                    const badgeAriaLabel = isPicked
                      ? `Unmark ${book.title} as picked in this rotation`
                      : isReadPreviously
                        ? `Read previously · Mark ${book.title} as picked in this rotation`
                        : `Mark ${book.title} as picked and read`;

                    return (
                      <BookCoverCard
                        key={book.id}
                        book={book}
                        activeProfile={activeProfile}
                        profiles={state.profiles}
                        layout="list"
                        size={shelfCardConfig.size}
                        aspectRatio={shelfCardConfig.aspectRatio}
                        infoPlacement={shelfCardConfig.infoPlacement}
                        showCoverOverlays={shelfCardConfig.showCoverOverlays}
                        showUsageAdorno={false}
                        fields={shelfCardConfig.fields}
                        isRead={isRead}
                        isPicked={isPicked}
                        highlightState={isRead ? 'read' : isPicked ? 'picked' : 'none'}
                        customStatusText={
                          isRead
                            ? 'Read in this rotation'
                            : isPicked
                              ? 'Picked for reading'
                              : isReadPreviously
                                ? 'Read previously'
                                : 'On active shelf'
                        }
                        onInspect={(b) => setInspectedBookId(b.id)}
                        listTrailingAction={
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
                        }
                      />
                    );
                  })}
                </BookCoverList>
              ) : (
                <BookCoverGrid
                  size={shelfCardConfig.size}
                  infoPlacement={shelfCardConfig.infoPlacement}
                >
                  {shelfBooks.map((book) => renderShelfBookCard(book, false))}
                </BookCoverGrid>
              )}
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
          className="space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
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
            <BookCoverSlide
              itemCount={recommendations.length}
              ariaLabel={`Suggested books for ${activeProfile?.name || 'Reader'}`}
            >
              {recommendations.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, true)
              )}
            </BookCoverSlide>
          ) : recsLayout === 'grid' ? (
            <BookCoverGrid
              size={suggestedCardConfig.size}
              infoPlacement={suggestedCardConfig.infoPlacement}
            >
              {recommendations.map(({ book, matchReasons }) =>
                renderRecCoverCard(book, matchReasons, false)
              )}
            </BookCoverGrid>
          ) : (
            <BookCoverList>
              {recommendations.map(({ book, matchReasons }) => (
                <BookCoverCard
                  key={book.id}
                  dataBookCard={`rec-${book.id}`}
                  book={book}
                  activeProfile={activeProfile}
                  profiles={state.profiles}
                  layout="list"
                  size={suggestedCardConfig.size}
                  aspectRatio={suggestedCardConfig.aspectRatio}
                  infoPlacement={suggestedCardConfig.infoPlacement}
                  showCoverOverlays={suggestedCardConfig.showCoverOverlays}
                  showUsageAdorno={false}
                  fields={suggestedCardConfig.fields}
                  customMetaLine={matchReasons[0] || 'Fresh pick'}
                  onInspect={(b) => setInspectedBookId(b.id)}
                  listTrailingAction={
                    displayedRotation ? (
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
                    ) : undefined
                  }
                />
              ))}
            </BookCoverList>
          )}
        </section>
      )}

      {/* Lower Row: Active Rotations List & Household Collection Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {activeRotations.length > 0 && (
          <section
            aria-labelledby="active-rotations-heading"
            className="lg:col-span-7 space-y-3"
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
                    className={`w-full py-2.5 px-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
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

      <ShelfPlacementModal
        rotation={displayedRotation}
        isOpen={isPlacementOpen}
        onClose={() => setIsPlacementOpen(false)}
      />
    </div>
  );
};
