import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { Icon } from '../common/Icon.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { getProfileRecommendations } from '../../features/tagging/recommendations.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import {
  findMatchingStartDatePresets,
  getAllRotationPresets,
} from '../../features/rotations/rotation-presets.js';
import { findStaleShelfBooks } from '../../features/rotations/usage-insights.js';
import { normalizeCollectionStatus } from '../../types/models.js';
import type { Book } from '../../types/models.js';

function loadDismissedKeys(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDismissedKey(storageKey: string, current: string[], key: string): string[] {
  if (!key || current.includes(key)) return current;
  const next = [...current, key];
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
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

  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() =>
    loadDismissedKeys('lr_dismissed_swap_reminders_v1')
  );
  const [dismissedPresetAlerts, setDismissedPresetAlerts] = useState<string[]>(() =>
    loadDismissedKeys('lr_dismissed_preset_alerts_v1')
  );
  const [dismissedStaleAlerts, setDismissedStaleAlerts] = useState<string[]>(() =>
    loadDismissedKeys('lr_dismissed_stale_alerts_v1')
  );
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

  const profileRotations = useMemo(() => {
    if (!activeProfile) return [];
    return state.rotations
      .filter((r) => r.profileId === activeProfile.id)
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [state.rotations, activeProfile]);

  const recommendations = useMemo(() => {
    if (!activeProfile) return [];
    return getProfileRecommendations({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 5,
    });
  }, [state.books, activeProfile, state.rotations]);

  const activeSchedule = useMemo(() => {
    if (!activeRotation || !activeProfile) return null;
    return computeRotationSchedule(activeRotation, activeProfile);
  }, [activeRotation, activeProfile]);

  const matchingPresetAlerts = useMemo(() => {
    if (!activeProfile) return [];
    const allPresets = getAllRotationPresets(state);
    const profileRotations = state.rotations.filter(
      (r) => r.profileId === activeProfile.id
    );
    return findMatchingStartDatePresets(allPresets, new Date(), {
      activeRotation,
      profileRotations,
      dismissedAlertKeys: dismissedPresetAlerts,
      daysBefore: state.settings?.presetAlertDaysBefore ?? 2,
      daysAfter: state.settings?.presetAlertDaysAfter ?? 5,
    });
  }, [state, activeProfile, activeRotation, dismissedPresetAlerts]);

  const staleSpotlight = useMemo(() => {
    if (state.settings?.enableStaleBookSpotlight === false || !activeRotation) {
      return { staleItems: [], dismissKey: '' };
    }
    return findStaleShelfBooks({
      rotation: activeRotation,
      books: state.books,
      staleBookDays: state.settings?.staleBookDays ?? 10,
    });
  }, [
    state.settings?.enableStaleBookSpotlight,
    state.settings?.staleBookDays,
    activeRotation,
    state.books,
  ]);

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
    setDismissedAlerts((prev) =>
      saveDismissedKey('lr_dismissed_swap_reminders_v1', prev, cycleKey)
    );
  };

  const handleDismissPresetAlert = (alertKey: string) => {
    setDismissedPresetAlerts((prev) =>
      saveDismissedKey('lr_dismissed_preset_alerts_v1', prev, alertKey)
    );
  };

  const handleDismissStaleAlert = (dismissKey: string) => {
    setDismissedStaleAlerts((prev) =>
      saveDismissedKey('lr_dismissed_stale_alerts_v1', prev, dismissKey)
    );
  };

  const handleGeneratePresetMatch = async (presetId: string, title: string) => {
    try {
      await store.generateRotationFromPreset(presetId, {
        profileId: activeProfile?.id,
      });
      store.notify(`Generated "${title}" shelf!`, 'success');
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const completedCount = activeRotation
    ? activeRotation.completedBookIds.filter((id) => activeRotation.bookIds.includes(id)).length
    : 0;
  const pickedCount = activeRotation
    ? (activeRotation.pickedBookIds || []).filter((id) => activeRotation.bookIds.includes(id)).length
    : 0;
  const progressPct =
    shelfBooks.length > 0 ? Math.round((completedCount / shelfBooks.length) * 100) : 0;

  // Circular SVG Progress Ring geometry
  const ringRadius = 24;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  const coverAspectRatio = state.settings?.coverAspectRatio || 'portrait';
  const viewMode = state.settings?.bookViewMode || 'grid';
  const cardSize = state.settings?.bookCardSize || 'regular';
  const shelfGridClass =
    cardSize === 'compact'
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3'
      : cardSize === 'large'
        ? 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5'
        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4';
  const householdLabel = state.settings?.householdName?.trim();
  const topPresetMatch = matchingPresetAlerts[0] || null;
  const showStaleBanner =
    staleSpotlight.staleItems.length > 0 &&
    Boolean(staleSpotlight.dismissKey) &&
    !dismissedStaleAlerts.includes(staleSpotlight.dismissKey);
  const leadStale = staleSpotlight.staleItems[0] || null;
  const offShelfRotatableCount = useMemo(() => {
    if (!activeRotation) return 0;
    return state.books.filter(
      (b) =>
        normalizeCollectionStatus(b.collectionStatus) === 'owned' &&
        !b.excludeFromRotations &&
        !activeRotation.bookIds.includes(b.id)
    ).length;
  }, [state.books, activeRotation]);

  return (
    <div className="space-y-6 text-left">
      {/* Contextual Alerts Stack: Swap Day, Seasonal Preset Match, Stale Book Spotlight */}
      <div className="space-y-2.5 empty:hidden">
        {activeRotation && activeSchedule?.isDue && !dismissedAlerts.includes(activeSchedule.reminderKey) && (
          <div
            role="region"
            aria-label="Library Swap Day reminder"
            className="rounded-xl border border-accent/45 bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-lg bg-surface-elevated border border-accent/30 text-accent shrink-0">
                <Icon name="calendar" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-ink leading-snug">
                  Library Swap Day · {activeRotation.title}
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  {activeSchedule.activeScheduleLine} · Keep reading, or swap fresh books onto the shelf.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 pl-10 sm:pl-0">
              <a
                href="#/rotations"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('rotations');
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold whitespace-nowrap inline-flex items-center transition-colors"
              >
                Swap Books
              </a>
              <button
                type="button"
                onClick={() => handleDismissSwapAlert(activeSchedule.reminderKey)}
                aria-label="Dismiss swap reminder"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated cursor-pointer transition-colors"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {topPresetMatch && (
          <div
            role="region"
            aria-label="Seasonal collection preset reminder"
            data-preset-alert-banner="true"
            className="rounded-xl border border-edge bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-lg bg-surface-elevated border border-edge-subtle text-primary shrink-0">
                <Icon name="sparkles" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-ink leading-snug">
                  Seasonal Shelf Idea · {topPresetMatch.preset.title}
                  <span className="font-sans text-xs font-normal text-ink-secondary">
                    {' '}· {topPresetMatch.schedule.countdownLabel}
                  </span>
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5 line-clamp-2">
                  {topPresetMatch.preset.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pl-10 sm:pl-0">
              <button
                type="button"
                onClick={() =>
                  handleGeneratePresetMatch(topPresetMatch.preset.id, topPresetMatch.preset.title)
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              >
                Generate Shelf
              </button>
              <button
                type="button"
                onClick={() => navigate('presets')}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink whitespace-nowrap transition-colors cursor-pointer"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={() => handleDismissPresetAlert(topPresetMatch.schedule.alertKey)}
                aria-label="Dismiss seasonal reminder"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated cursor-pointer transition-colors"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {showStaleBanner && activeRotation && leadStale && (
          <div
            role="status"
            data-stale-spotlight-banner="true"
            className="rounded-xl border border-edge bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-lg bg-surface-elevated border border-edge-subtle text-accent shrink-0">
                <Icon name="clock" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-ink leading-snug">
                  Stale Book Spotlight · Unread {leadStale.daysOnShelf}d
                </p>
                <p className="text-xs text-ink-secondary mt-0.5 leading-snug">
                  “{leadStale.book.title}”
                  {staleSpotlight.staleItems.length > 1
                    ? ` (+${staleSpotlight.staleItems.length - 1} more)`
                    : ''}{' '}
                  hasn’t been marked read on {activeProfile?.name || 'this'}’s shelf. Read together or swap fresh?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-10 sm:pl-0">
              <button
                type="button"
                onClick={() => store.toggleRotationBookRead(activeRotation.id, leadStale.book.id)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors"
              >
                <Icon name="check" className="w-3.5 h-3.5 text-primary" />
                <span>Mark Read</span>
              </button>
              {offShelfRotatableCount > 0 ? (
                <button
                  type="button"
                  onClick={() => store.replaceRotationBookRandom(activeRotation.id, leadStale.book.id)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Icon name="refresh" className="w-3.5 h-3.5" />
                  <span>Swap Fresh</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: activeRotation.id })}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
                >
                  Review Shelf
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDismissStaleAlert(staleSpotlight.dismissKey)}
                aria-label="Dismiss stale book spotlight"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated cursor-pointer transition-colors"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editorial Hero + Circular Reading Progress Ring Card */}
      {activeRotation ? (
        <section aria-labelledby="active-shelf-heading" className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-2 border-b border-edge-subtle">
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                {householdLabel ? `${householdLabel} · ` : ''}
                {t('home.booksInRotation')}
              </p>
              <h1
                id="active-shelf-heading"
                className="font-display text-3xl sm:text-4xl font-semibold text-ink leading-[1.08] tracking-tight"
              >
                {activeRotation.title}
              </h1>
              {activeRotation.rules?.objective && (
                <p className="text-sm text-ink-secondary leading-relaxed line-clamp-2 max-w-2xl">
                  {activeRotation.rules.objective}
                </p>
              )}
              {activeSchedule && (
                <p
                  data-rotation-schedule="active"
                  className={`flex items-center gap-1.5 text-xs sm:text-[13px] pt-0.5 ${
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

            {/* Elevated Circular Progress Ring Widget */}
            <div className="rounded-xl bg-surface border border-edge px-4 py-3.5 shadow-2xs flex items-center justify-between sm:justify-start gap-4 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
                    <circle
                      cx="30"
                      cy="30"
                      r={ringRadius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4.5"
                      className="text-edge-subtle"
                    />
                    <circle
                      cx="30"
                      cy="30"
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
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold font-mono-tabular text-ink">
                    {progressPct}%
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-ink leading-tight">
                    Reading progress
                  </p>
                  <p className="text-xs font-mono-tabular text-ink-secondary mt-0.5">
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
                  className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <Icon name="checklist" className="w-3.5 h-3.5 text-primary" />
                  <span>Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: activeRotation.id })}
                  aria-label="Edit active rotation"
                  className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <span>Edit</span>
                </button>
              </div>
            </div>
          </div>

          {/* Shelf Layout & Catalog Shortcut Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-ink-secondary font-mono-tabular">
              {shelfBooks.length} {shelfBooks.length === 1 ? 'book' : 'books'} on active shelf
            </p>

            <div className="flex items-center gap-2.5 ml-auto shrink-0">
              <div
                role="group"
                aria-label="Shelf view layout"
                className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge"
              >
                <button
                  type="button"
                  data-action="set-book-view-mode"
                  data-view-mode="grid"
                  aria-pressed={viewMode === 'grid'}
                  aria-label="Grid view"
                  title="Grid view"
                  onClick={() => store.updateSettings({ bookViewMode: 'grid' })}
                  className={`min-h-[34px] min-w-[34px] px-2 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  <Icon name="grid" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-action="set-book-view-mode"
                  data-view-mode="list"
                  aria-pressed={viewMode === 'list'}
                  aria-label="List view"
                  title="List view"
                  onClick={() => store.updateSettings({ bookViewMode: 'list' })}
                  className={`min-h-[34px] min-w-[34px] px-2 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  <Icon name="list" className="w-3.5 h-3.5" />
                </button>
              </div>

              <a
                href="#/library"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('library');
                }}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>View all books</span>
                <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Primary Shelf Books Grid or List + "Manage your rotation" Anchor Card */}
          {shelfBooks.length > 0 ? (
            viewMode === 'list' ? (
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
                      className={`group flex items-center justify-between gap-3 rounded-xl border p-2.5 sm:p-3 transition-all ${
                        isRead || isPicked
                          ? 'bg-surface border-primary/45 shadow-2xs'
                          : 'bg-surface border-edge shadow-2xs hover:border-secondary'
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
                            className={`font-display text-sm sm:text-base font-semibold text-ink leading-snug truncate ${
                              isRead ? 'opacity-75' : ''
                            }`}
                          >
                            {book.title}
                          </h2>
                          <p className="text-xs text-ink-secondary truncate mt-0.5">
                            {primaryAuthor}
                          </p>
                          <p className="text-[11px] text-ink-muted truncate mt-1">
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

                {/* Compact List Anchor Bar: Manage Your Rotation */}
                <div className="rounded-xl bg-surface-elevated border border-edge p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
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
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsPlacementOpen(true)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-subtle border border-edge text-xs font-semibold text-ink cursor-pointer"
                    >
                      Stock Checklist
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('rotations', { edit: activeRotation.id })}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Edit Rotation</span>
                      <Icon name="chevronRight" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
            <div className={shelfGridClass}>
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
                    className={`group flex flex-col justify-between min-w-0 rounded-xl border ${
                      cardSize === 'compact' ? 'p-2' : cardSize === 'large' ? 'p-3 sm:p-3.5' : 'p-2.5 sm:p-3'
                    } transition-all ${
                      isRead || isPicked
                        ? 'bg-surface border-primary/45 shadow-2xs'
                        : 'bg-surface border-edge shadow-2xs hover:border-secondary'
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
                        className="mt-2.5 w-full text-left min-w-0 rounded cursor-pointer"
                      >
                        <h2
                          className={`font-display ${
                            cardSize === 'compact'
                              ? 'text-xs sm:text-sm'
                              : cardSize === 'large'
                                ? 'text-base sm:text-lg'
                                : 'text-[15px] sm:text-base'
                          } font-semibold text-ink leading-snug line-clamp-2 ${
                            isRead ? 'opacity-75' : ''
                          }`}
                        >
                          {book.title}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-ink-secondary truncate mt-0.5">
                          {primaryAuthor}
                        </p>
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Dedicated Editorial Anchor Card: Manage Your Rotation */}
              <div className="rounded-xl bg-surface-elevated border border-edge p-4 sm:p-5 flex flex-col items-center justify-between text-center min-h-[210px] shadow-2xs">
                <div className="space-y-2.5 my-auto">
                  <span className="w-10 h-10 rounded-lg bg-surface border border-edge text-primary inline-flex items-center justify-center shadow-2xs">
                    <Icon name="rotations" className="w-5 h-5" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-display text-lg font-semibold text-ink leading-tight">
                      Manage your rotation
                    </h2>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      Swap, stock, or draw fresh books for this cycle.
                    </p>
                  </div>
                </div>

                <div className="w-full pt-3 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => navigate('rotations', { edit: activeRotation.id })}
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <span>Edit Rotation</span>
                    <Icon name="chevronRight" className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlacementOpen(true)}
                    className="w-full py-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    Open Stock Checklist
                  </button>
                </div>
              </div>
            </div>
            )
          ) : (
            <div className="rounded-xl bg-surface border border-edge p-8 text-center space-y-3 shadow-2xs">
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
                  onClick={() => navigate('rotations', { edit: activeRotation.id })}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer transition-colors"
                >
                  Edit Shelf
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl bg-surface border border-edge p-6 sm:p-10 text-center space-y-3 shadow-2xs">
          <BotanicalIllustration variant="empty-shelf" className="w-44 h-auto mx-auto" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {householdLabel ? `${householdLabel} · ` : ''}
            {t('home.booksInRotation')}
          </p>
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
          className="rounded-xl bg-surface border border-edge p-4 sm:p-5 space-y-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="starFilled" className="w-4 h-4 text-accent shrink-0" />
              <h2
                id="up-next-heading"
                className="font-display text-xl font-semibold text-ink"
              >
                Suggested next for {activeProfile?.name || 'Reader'}
              </h2>
            </div>
            <div className="flex items-center gap-2.5 ml-auto shrink-0">
              <div
                role="group"
                aria-label="Recommendations layout"
                className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge"
              >
                <button
                  type="button"
                  aria-pressed={viewMode === 'grid'}
                  aria-label="Grid view"
                  title="Grid view"
                  onClick={() => store.updateSettings({ bookViewMode: 'grid' })}
                  className={`min-h-[34px] min-w-[34px] px-2 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  <Icon name="grid" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === 'list'}
                  aria-label="List view"
                  title="List view"
                  onClick={() => store.updateSettings({ bookViewMode: 'list' })}
                  className={`min-h-[34px] min-w-[34px] px-2 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  <Icon name="list" className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setAiRecsModal({ isOpen: true })}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>See AI recommendations</span>
                <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            className={
              viewMode === 'list'
                ? 'space-y-2'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'
            }
          >
            {recommendations.map(({ book, matchReasons }) => (
              <div
                key={book.id}
                data-book-card={`rec-${book.id}`}
                className="rounded-lg bg-surface-subtle border border-edge-subtle p-2.5 flex items-center justify-between gap-2.5"
              >
                <button
                  type="button"
                  onClick={() => setInspectedBookId(book.id)}
                  className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                >
                  <BookCover book={book} size="xs" aspectRatio={coverAspectRatio} />
                  <span className="min-w-0">
                    <span className="block font-display text-sm font-semibold text-ink truncate">
                      {book.title}
                    </span>
                    <span className="block text-[11px] text-ink-secondary truncate">
                      {book.authors[0] || ''}
                    </span>
                    <span className="block text-[10px] text-primary truncate mt-0.5 font-medium">
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
                    className="min-h-[38px] min-w-[38px] rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-ink flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lower Two-Column Row: Saved Rotations Switcher & Household Collection Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {profileRotations.length > 0 && (
          <section
            aria-labelledby="saved-rotations-heading"
            className="lg:col-span-7 rounded-xl bg-surface border border-edge p-4 sm:p-5 space-y-3 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h2
                  id="saved-rotations-heading"
                  className="font-display text-lg font-semibold text-ink"
                >
                  {t('home.savedRotations')}
                </h2>
                <span className="text-xs font-mono-tabular text-ink-secondary">
                  ({profileRotations.length})
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
              {profileRotations.slice(0, 3).map((rot) => {
                const isRotActive = rot.status === 'active' || rot.id === activeRotation?.id;
                const createdTimestamp = rot.createdAt || rot.updatedAt;
                const createdLabel = createdTimestamp
                  ? new Date(createdTimestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '';

                return (
                  <div
                    key={rot.id}
                    className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-base font-semibold text-ink truncate">
                        {rot.title}
                      </p>
                      <p className="text-[11px] text-ink-secondary truncate">
                        <span>
                          {rot.bookIds.length} {rot.bookIds.length === 1 ? 'book' : 'books'}
                        </span>
                        {createdLabel && (
                          <span className="font-mono-tabular">{` · ${createdLabel}`}</span>
                        )}
                        {rot.rules?.objective ? ` · ${rot.rules.objective}` : ''}
                      </p>
                    </div>
                    {isRotActive ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-subtle border border-edge text-xs font-semibold text-primary shrink-0">
                        <Icon name="check" className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleActivateRotation(rot.id)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors shrink-0 cursor-pointer"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section
          aria-label="Active collection summary"
          className={`${
            profileRotations.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'
          } rounded-xl bg-surface border border-edge p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-2xs`}
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

      <ShelfPlacementModal
        rotation={activeRotation}
        isOpen={isPlacementOpen}
        onClose={() => setIsPlacementOpen(false)}
      />
    </div>
  );
};
