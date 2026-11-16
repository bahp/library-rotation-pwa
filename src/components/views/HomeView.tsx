import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
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
  const [shelfFilter, setShelfFilter] = useState<'all' | 'unread'>('all');
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

  const visibleShelfBooks = useMemo(() => {
    if (shelfFilter === 'unread') {
      return shelfBooks.filter((b) => !readBookIds.has(b.id));
    }
    return shelfBooks;
  }, [shelfBooks, shelfFilter, readBookIds]);

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
  const unreadCount = Math.max(0, shelfBooks.length - completedCount);
  const progressPct =
    shelfBooks.length > 0 ? Math.round((completedCount / shelfBooks.length) * 100) : 0;

  // Circular SVG Progress Ring geometry
  const ringRadius = 24;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  const coverAspectRatio = state.settings?.coverAspectRatio || 'portrait';
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
            className="rounded-2xl border border-amber-300/90 dark:border-amber-700/60 bg-white dark:bg-night-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 shrink-0">
                <Icon name="calendar" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-forest-900 dark:text-amber-200 leading-snug">
                  Library Swap Day · {activeRotation.title}
                </h2>
                <p className="text-xs text-stone-ink dark:text-amber-300/90 mt-0.5">
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
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white text-xs font-semibold whitespace-nowrap inline-flex items-center transition-colors"
              >
                Swap Books
              </a>
              <button
                type="button"
                onClick={() => handleDismissSwapAlert(activeSchedule.reminderKey)}
                aria-label="Dismiss swap reminder"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-stone-ink dark:text-amber-300 hover:bg-linen-100 dark:hover:bg-night-800 cursor-pointer"
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
            className="rounded-2xl border border-forest-700/25 dark:border-[#5ED3DA]/30 bg-white dark:bg-night-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-xl bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] shrink-0">
                <Icon name="sparkles" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-forest-900 dark:text-white leading-snug">
                  Seasonal Shelf Idea · {topPresetMatch.preset.title}
                  <span className="font-normal text-stone-ink dark:text-slate-400">
                    {' '}· {topPresetMatch.schedule.countdownLabel}
                  </span>
                </h2>
                <p className="text-xs text-stone-ink dark:text-slate-300 mt-0.5 line-clamp-2">
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
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              >
                Generate Shelf
              </button>
              <button
                type="button"
                onClick={() => navigate('presets')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white whitespace-nowrap transition-colors cursor-pointer"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={() => handleDismissPresetAlert(topPresetMatch.schedule.alertKey)}
                aria-label="Dismiss seasonal reminder"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-400 dark:hover:bg-night-800 cursor-pointer"
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
            className="rounded-2xl border border-linen-200 dark:border-night-800 bg-white dark:bg-night-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-xl bg-amber-500/12 dark:bg-amber-400/15 text-brand dark:text-amber-300 shrink-0">
                <Icon name="clock" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-forest-900 dark:text-white leading-snug">
                  Stale Book Spotlight · Unread {leadStale.daysOnShelf}d
                </p>
                <p className="text-xs text-stone-ink dark:text-slate-300 mt-0.5 leading-snug">
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
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Icon name="check" className="w-3.5 h-3.5 text-forest-700 dark:text-[#5ED3DA]" />
                <span>Mark Read</span>
              </button>
              {offShelfRotatableCount > 0 ? (
                <button
                  type="button"
                  onClick={() => store.replaceRotationBookRandom(activeRotation.id, leadStale.book.id)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Icon name="refresh" className="w-3.5 h-3.5" />
                  <span>Swap Fresh</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: activeRotation.id })}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
                >
                  Review Shelf
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDismissStaleAlert(staleSpotlight.dismissKey)}
                aria-label="Dismiss stale book spotlight"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-400 dark:hover:bg-night-800 cursor-pointer"
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pb-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand dark:text-brand-dark">
                {householdLabel ? `${householdLabel} · ` : ''}
                {t('home.booksInRotation')}
              </p>
              <h1
                id="active-shelf-heading"
                className="font-display text-3xl sm:text-4xl font-bold text-forest-900 dark:text-white leading-[1.1] tracking-tight"
              >
                {activeRotation.title}
              </h1>
              {activeRotation.rules?.objective && (
                <p className="text-sm text-stone-ink dark:text-slate-300 leading-relaxed line-clamp-2 max-w-2xl">
                  {activeRotation.rules.objective}
                </p>
              )}
              {activeSchedule && (
                <p
                  data-rotation-schedule="active"
                  className={`flex items-center gap-1.5 text-xs sm:text-[13px] pt-0.5 ${
                    activeSchedule.isDue
                      ? 'font-semibold text-amber-800 dark:text-amber-300'
                      : activeSchedule.isDueSoon
                        ? 'font-semibold text-forest-700 dark:text-[#5ED3DA]'
                        : 'text-stone-ink dark:text-slate-400 font-medium'
                  }`}
                >
                  <Icon name="calendar" className="w-3.5 h-3.5 shrink-0 opacity-75" />
                  <span>{activeSchedule.activeScheduleLine}</span>
                </p>
              )}
            </div>

            {/* Elevated Circular Progress Ring Widget */}
            <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200/90 dark:border-night-800 px-4 py-3.5 shadow-2xs flex items-center justify-between sm:justify-start gap-4 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                  <svg className="w-14 h-14 -rotate-90" viewBox="0 0 60 60" aria-hidden="true">
                    <circle
                      cx="30"
                      cy="30"
                      r={ringRadius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      className="text-linen-200/80 dark:text-night-800"
                    />
                    <circle
                      cx="30"
                      cy="30"
                      r={ringRadius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringDashOffset}
                      className="text-forest-700 dark:text-[#5ED3DA] transition-all duration-300"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold font-mono-tabular text-forest-900 dark:text-white">
                    {progressPct}%
                  </span>
                </div>

                <div>
                  <p className="text-xs font-bold text-forest-900 dark:text-white leading-tight">
                    Reading progress
                  </p>
                  <p className="text-xs font-mono-tabular text-stone-ink dark:text-slate-400 mt-0.5">
                    {completedCount} of {shelfBooks.length} {shelfBooks.length === 1 ? 'book' : 'books'}
                    {pickedCount > 0 ? ` · ${pickedCount} picked` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pl-3 border-l border-linen-200/80 dark:border-night-800">
                <button
                  type="button"
                  onClick={() => setIsPlacementOpen(true)}
                  aria-label="Stock shelf checklist"
                  className="min-h-[48px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-linen-50 hover:bg-linen-100 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <Icon name="checklist" className="w-3.5 h-3.5 text-forest-700 dark:text-[#5ED3DA]" />
                  <span>Stock</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('rotations', { edit: activeRotation.id })}
                  aria-label="Edit active rotation"
                  className="min-h-[48px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:text-night-950 text-white text-xs font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <span>Edit</span>
                </button>
              </div>
            </div>
          </div>

          {/* Segmented Shelf Scope & Quick Navigation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <div
                role="tablist"
                aria-label="Active shelf filter"
                className="inline-flex items-center p-1 rounded-2xl bg-linen-100/90 dark:bg-night-900 border border-linen-200/90 dark:border-night-800"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={shelfFilter === 'all'}
                  onClick={() => setShelfFilter('all')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    shelfFilter === 'all'
                      ? 'bg-brand text-white dark:bg-brand-dark dark:text-night-950 shadow-2xs'
                      : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                  }`}
                >
                  <Icon name="book" className="w-3.5 h-3.5" />
                  <span>Your Bookshelf ({shelfBooks.length})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={shelfFilter === 'unread'}
                  onClick={() => setShelfFilter('unread')}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    shelfFilter === 'unread'
                      ? 'bg-brand text-white dark:bg-brand-dark dark:text-night-950 shadow-2xs'
                      : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                  }`}
                >
                  <span>Unread ({unreadCount})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('presets')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200/90 dark:border-night-800 text-xs font-semibold text-forest-900 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Icon name="presets" className="w-3.5 h-3.5 text-forest-700 dark:text-[#5ED3DA]" />
                <span>Collections</span>
              </button>
            </div>

            <a
              href="#/library"
              onClick={(e) => {
                e.preventDefault();
                navigate('library');
              }}
              className="text-xs font-semibold text-forest-700 hover:text-forest-900 dark:text-[#5ED3DA] dark:hover:text-white inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>View all books</span>
              <Icon name="chevronRight" className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Primary Shelf Books Grid + "Manage your rotation" Anchor Card */}
          {visibleShelfBooks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4">
              {visibleShelfBooks.map((book) => {
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
                    className={`group flex flex-col justify-between min-w-0 rounded-2xl border p-2.5 sm:p-3 transition-all ${
                      isRead || isPicked
                        ? 'bg-white dark:bg-night-900 border-forest-700/35 dark:border-[#5ED3DA]/40 shadow-2xs'
                        : 'bg-white dark:bg-night-900 border-linen-200/90 dark:border-night-800 shadow-2xs hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setInspectedBookId(book.id)}
                          aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
                          className="block w-full rounded-xl overflow-hidden bg-linen-100 dark:bg-night-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.985] cursor-pointer"
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
                          className="absolute -bottom-1 -left-1 z-20 min-h-[44px] min-w-[44px] flex items-end justify-start p-2.5 focus-visible:outline-2 focus-visible:outline-forest-700 cursor-pointer"
                        >
                          {isRead ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs border bg-brand/95 text-white border-white/80 dark:bg-brand-dark dark:text-night-950 dark:border-night-950">
                              <Icon name="check" className="w-2.5 h-2.5" />
                              <span>Read</span>
                            </span>
                          ) : isPicked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs border bg-brand/95 text-white border-white/80 dark:bg-brand-dark dark:text-night-950 dark:border-night-950">
                              <Icon name="bookmarkFilled" className="w-2.5 h-2.5" />
                              <span>Picked</span>
                            </span>
                          ) : isReadPreviously ? (
                            <span
                              title="Read previously (not picked in this rotation)"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-xs border bg-white/95 text-forest-800 border-linen-200 dark:bg-night-900/95 dark:text-[#5ED3DA] dark:border-night-700"
                            >
                              <Icon name="check" className="w-2.5 h-2.5" />
                              <span>Read</span>
                            </span>
                          ) : (
                            <span className="w-6 h-6 rounded-full flex items-center justify-center shadow-xs border transition-colors bg-white/92 border-linen-200 text-stone-ink/75 hover:text-forest-900 dark:bg-night-900/90 dark:border-night-700 dark:text-slate-300">
                              <Icon name="check" className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setInspectedBookId(book.id)}
                        className="mt-2.5 w-full text-left min-w-0 focus-visible:outline-2 focus-visible:outline-forest-700 rounded cursor-pointer"
                      >
                        <h2
                          className={`font-display text-[13px] sm:text-sm font-bold text-forest-900 dark:text-white leading-snug line-clamp-2 ${
                            isRead ? 'opacity-75' : ''
                          }`}
                        >
                          {book.title}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-stone-ink dark:text-slate-400 truncate mt-0.5">
                          {primaryAuthor}
                        </p>
                      </button>
                    </div>
                  </article>
                );
              })}

              {/* Dedicated Sage Anchor Card: Manage Your Rotation */}
              <div className="rounded-2xl bg-[#E7EEEB] dark:bg-[#13292D] border border-[#D2DFDA] dark:border-night-700 p-4 sm:p-5 flex flex-col items-center justify-between text-center min-h-[210px] shadow-2xs">
                <div className="space-y-2.5 my-auto">
                  <span className="w-10 h-10 rounded-full bg-white/90 dark:bg-night-900 border border-[#D2DFDA] dark:border-night-700 text-forest-800 dark:text-[#5ED3DA] inline-flex items-center justify-center shadow-2xs">
                    <Icon name="rotations" className="w-5 h-5" />
                  </span>
                  <div className="space-y-1">
                    <h2 className="font-display text-base font-bold text-forest-900 dark:text-white leading-tight">
                      Manage your rotation
                    </h2>
                    <p className="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                      Swap, stock, or draw fresh books for this cycle.
                    </p>
                  </div>
                </div>

                <div className="w-full pt-3 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => navigate('rotations', { edit: activeRotation.id })}
                    className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <span>Edit Rotation</span>
                    <Icon name="chevronRight" className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlacementOpen(true)}
                    className="w-full py-1 text-[11px] font-semibold text-forest-800 hover:text-forest-950 dark:text-[#8AE4E9] dark:hover:text-white cursor-pointer"
                  >
                    Open Stock Checklist
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-8 text-center space-y-2.5 shadow-2xs">
              <p className="text-sm font-semibold text-forest-900 dark:text-white">
                {shelfBooks.length === 0
                  ? 'This shelf doesn’t have any books placed yet'
                  : 'All books on this shelf have been read'}
              </p>
              <p className="text-xs text-stone-ink dark:text-slate-400">
                {shelfBooks.length === 0
                  ? 'Add books to your library or edit this rotation to draw fresh titles.'
                  : 'Show all shelf books or draw a fresh rotation cycle.'}
              </p>
              <div className="pt-1 flex flex-wrap justify-center gap-2">
                {shelfBooks.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate('scan')}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Add Books
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('rotations', { edit: activeRotation.id })}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 text-xs font-semibold text-forest-900 dark:text-white cursor-pointer"
                    >
                      Edit Shelf
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShelfFilter('all')}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white dark:bg-brand-dark dark:text-night-950 text-xs font-semibold cursor-pointer"
                  >
                    Show All Shelf Books
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-6 sm:p-10 text-center space-y-3 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-brand dark:text-brand-dark">
            {householdLabel ? `${householdLabel} · ` : ''}
            {t('home.booksInRotation')}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-title dark:text-white">
            No active shelf rotation for {activeProfile?.name || 'Reader'}
          </h1>
          <p className="text-xs sm:text-sm text-subtitle dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Curate a calm, intentional face-out shelf from your home library so favorite stories stay fresh without clutter.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            {state.books.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('scan')}
                className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:text-night-950 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Icon name="scan" className="w-4 h-4" />
                <span>Add Books First</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:text-night-950 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>{t('home.createShelf')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('presets')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Icon name="sparkles" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
              <span>{t('nav.presets')}</span>
            </button>
          </div>
        </section>
      )}

      {/* Discovery Strip: Suggested Next for [Reader] */}
      {recommendations.length > 0 && (
        <section
          aria-labelledby="up-next-heading"
          className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-4 sm:p-5 space-y-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="starFilled" className="w-4 h-4 text-amber-500 shrink-0" />
              <h2
                id="up-next-heading"
                className="font-display text-lg font-bold text-forest-900 dark:text-white"
              >
                Suggested next for {activeProfile?.name || 'Reader'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setAiRecsModal({ isOpen: true })}
              className="text-xs font-semibold text-forest-700 hover:text-forest-900 dark:text-[#5ED3DA] dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              <span>See AI recommendations →</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {recommendations.map(({ book, matchReasons }) => (
              <div
                key={book.id}
                data-book-card={`rec-${book.id}`}
                className="rounded-xl bg-linen-50/70 dark:bg-night-950/70 border border-linen-200/80 dark:border-night-800 p-2.5 flex items-center justify-between gap-2.5"
              >
                <button
                  type="button"
                  onClick={() => setInspectedBookId(book.id)}
                  className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                >
                  <BookCover book={book} size="xs" aspectRatio={coverAspectRatio} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-forest-900 dark:text-white truncate">
                      {book.title}
                    </span>
                    <span className="block text-[11px] text-stone-ink dark:text-slate-400 truncate">
                      {book.authors[0] || ''}
                    </span>
                    <span className="block text-[10px] text-forest-700 dark:text-[#5ED3DA] truncate mt-0.5 font-medium">
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
                    className="min-h-[38px] min-w-[38px] rounded-xl bg-white hover:bg-linen-100 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
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
        {savedRotations.length > 0 && (
          <section
            aria-labelledby="saved-rotations-heading"
            className="lg:col-span-7 rounded-2xl bg-white dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-4 sm:p-5 space-y-3 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="saved-rotations-heading"
                className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400"
              >
                {t('home.savedRotations')}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('presets')}
                  className="text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white hover:underline cursor-pointer"
                >
                  {t('nav.presets')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('rotations')}
                  className="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline cursor-pointer"
                >
                  {t('home.allShelves')}
                </button>
              </div>
            </div>

            <div className="divide-y divide-linen-200/70 dark:divide-night-800">
              {savedRotations.slice(0, 3).map((rot) => (
                <div
                  key={rot.id}
                  className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white truncate">
                      {rot.title}
                    </p>
                    <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                      {rot.bookIds.length} {rot.bookIds.length === 1 ? 'book' : 'books'}
                      {rot.rules?.objective ? ` · ${rot.rules.objective}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleActivateRotation(rot.id)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors shrink-0 cursor-pointer"
                  >
                    Activate
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section
          aria-label="Active collection summary"
          className={`${
            savedRotations.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'
          } rounded-2xl bg-white dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-4 sm:p-5 flex flex-col justify-between gap-4 shadow-2xs`}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
              {t('home.activeCollection')}
            </p>
            <p className="font-display text-lg font-bold text-forest-900 dark:text-white mt-1">
              {state.books.length} {state.books.length === 1 ? 'Book' : 'Books'} Cataloged
            </p>
            <p className="text-xs text-stone-ink dark:text-slate-400 font-mono-tabular mt-1">
              {activeProfile?.readHistoryBookIds?.length || 0} Read with{' '}
              {activeProfile?.name || 'Reader'}
              {wishlistCount > 0 ? ` · ${wishlistCount} Wishlisted` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-linen-200/70 dark:border-night-800">
            {wishlistCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('library')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
              >
                Wishlist ({wishlistCount})
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('library')}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-brand hover:bg-brand-hover dark:bg-brand-dark dark:text-night-950 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
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
