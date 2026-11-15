import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { Icon } from '../common/Icon.js';
import { FilterDrawer, LibraryFilterControls } from '../modals/FilterDrawer.js';
import { BookCover } from '../common/BookCover.js';
import {
  computeOwnerInitials,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  isBookRotatable,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeOwnersList,
} from '../../types/models.js';
import {
  COVER_BADGE_SLOTS,
  COVER_CATALOG_BADGE_STYLES,
  AVATAR_TONES,
} from '../../config/index.js';
import { computeBookUsageSummary } from '../../features/rotations/usage-insights.js';

export const LibraryView: React.FC = () => {
  const {
    state,
    store,
    catalogService,
    activeProfile,
    navigate,
    routeParams,
    globalSearchQuery,
    setGlobalSearchQuery,
    setInspectedBookId,
    setAiRecsModal,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState(
    () => globalSearchQuery || routeParams.get('q') || ''
  );
  const [catalogFilter, setCatalogFilter] = useState('all');
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [conditionFilter, setConditionFilter] = useState('all');
  const [freshnessFilter, setFreshnessFilter] = useState('all');
  const [sortBy, setSortBy] = useState('default');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [syncProgressLabel, setSyncProgressLabel] = useState('');

  React.useEffect(() => {
    setSearchQuery(globalSearchQuery);
  }, [globalSearchQuery]);

  const handleSearchChange = (next: string) => {
    setSearchQuery(next);
    setGlobalSearchQuery(next);
  };

  const coverAspectRatio = state.settings?.coverAspectRatio || 'portrait';
  const showRotationHistory = state.settings?.enableRotationHistoryInsights !== false;
  const showCoverUsageAdornos = state.settings?.showCoverUsageAdornos !== false;
  const staleBookDays = state.settings?.staleBookDays ?? 10;
  const referenceDate = useMemo(() => new Date(), []);

  const activeRotation = useMemo(() => {
    if (!activeProfile) return null;
    return (
      state.rotations.find(
        (r) => r.profileId === activeProfile.id && r.status === 'active'
      ) || null
    );
  }, [state.rotations, activeProfile]);

  const usageByBookId = useMemo(() => {
    const map = new Map();
    for (const book of state.books) {
      map.set(
        book.id,
        computeBookUsageSummary(book, {
          profiles: state.profiles,
          rotations: state.rotations,
          activeProfile,
          activeRotation,
          staleBookDays,
          referenceDate,
        })
      );
    }
    return map;
  }, [
    state.books,
    state.profiles,
    state.rotations,
    activeProfile,
    activeRotation,
    staleBookDays,
    referenceDate,
  ]);

  const wishlistCount = useMemo(
    () =>
      state.books.filter(
        (b) => normalizeCollectionStatus(b.collectionStatus) === 'wishlist'
      ).length,
    [state.books]
  );

  const lovedCount = useMemo(
    () => state.books.filter((b) => Boolean(b.loved)).length,
    [state.books]
  );

  const booksNeedingSyncCount = useMemo(() => {
    return state.books.filter((b) => {
      const hasGoogle = (b.sources || []).some(
        (s) => String(s?.provider || '').toLowerCase() === 'google-books'
      );
      return !hasGoogle || !b.coverUrl || !b.pageCount || !b.publishedYear;
    }).length;
  }, [state.books]);

  const handleSyncCatalogMetadata = async () => {
    if (isSyncingCatalog) return;
    setIsSyncingCatalog(true);
    setSyncProgressLabel('Syncing…');
    try {
      const res = await store.syncExistingCatalogMetadata(catalogService, {
        onProgress: ({ current, total }: { current: number; total: number }) => {
          setSyncProgressLabel(`${current}/${total}`);
        },
      });
      if (res.updatedCount > 0) {
        store.notify(
          `Updated metadata for ${res.updatedCount} ${res.updatedCount === 1 ? 'book' : 'books'}.`,
          'success'
        );
      } else {
        store.notify('All library books already have current metadata.', 'info');
      }
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsSyncingCatalog(false);
      setSyncProgressLabel('');
    }
  };

  // Effective unified owners list
  const effectiveOwners = useMemo(() => {
    if (selectedOwners.length > 0) {
      return normalizeOwnersList(selectedOwners);
    }
    if (ownerFilter === 'active-reader' && activeProfile) {
      return normalizeOwnersList([activeProfile.id, 'shared']);
    }
    if (ownerFilter && ownerFilter !== 'all' && ownerFilter !== 'custom') {
      return normalizeOwnersList([ownerFilter]);
    }
    return [];
  }, [selectedOwners, ownerFilter, activeProfile]);

  // Available themes & custom owners
  const { availableThemes, ownerChoices } = useMemo(() => {
    const themeCounts = new Map<string, number>();
    const customOwnerMap = new Map<string, string>();
    const profileIdsLower = new Set(state.profiles.map((p) => p.id.toLowerCase()));

    for (const book of state.books) {
      for (const rawOwner of normalizeOwnersList(book.owners)) {
        const lower = rawOwner.toLowerCase();
        if (lower !== 'shared' && !profileIdsLower.has(lower) && !customOwnerMap.has(lower)) {
          customOwnerMap.set(lower, rawOwner);
        }
      }
      for (const rawTag of book.tags || []) {
        const tag = String(rawTag || '').trim().toLowerCase();
        if (!tag) continue;
        themeCounts.set(tag, (themeCounts.get(tag) || 0) + 1);
      }
    }

    const themes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 18)
      .map(([tag, count]) => ({ tag, count }));

    const owners = [
      ...state.profiles.map((p) => ({
        key: p.id,
        label: p.name,
        initial: computeOwnerInitials(p.name),
        tone: p.avatarTone || 'teal',
      })),
      { key: 'shared', label: 'Shared', initial: 'S', tone: 'emerald' },
      ...Array.from(customOwnerMap.values()).map((customLabel) => ({
        key: customLabel,
        label: customLabel,
        initial: computeOwnerInitials(customLabel),
        tone: 'indigo',
      })),
    ];

    return { availableThemes: themes, ownerChoices: owners };
  }, [state.books, state.profiles]);

  // Filter books
  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const effectiveOwnersLower = new Set(effectiveOwners.map((o) => o.toLowerCase()));
    const selectedThemesLower = new Set(selectedThemes.map((t) => t.toLowerCase()));

    const result = state.books.filter((book) => {
      const status = normalizeCollectionStatus(book.collectionStatus);
      const condition = normalizeBookCondition(book.condition);

      switch (catalogFilter) {
        case 'owned':
          if (status !== 'owned') return false;
          break;
        case 'wishlist':
          if (status !== 'wishlist') return false;
          break;
        case 'loved':
          if (!book.loved) return false;
          break;
        case 'hardcover':
        case 'board-book':
        case 'paperback':
          if (book.format !== catalogFilter) return false;
          break;
        case 'needs-care':
          if (condition === 'good') return false;
          break;
        case 'all':
        default:
          break;
      }

      if (selectedFormats.length > 0 && !selectedFormats.includes(book.format)) {
        return false;
      }

      if (conditionFilter === 'good' && condition !== 'good') {
        return false;
      }
      if (conditionFilter === 'needs-care' && condition === 'good') {
        return false;
      }

      if (selectedThemesLower.size > 0) {
        const bookTagsLower = (book.tags || []).map((t) => String(t).toLowerCase());
        const matchesAnyTheme = bookTagsLower.some((t) => selectedThemesLower.has(t));
        if (!matchesAnyTheme) return false;
      }

      if (effectiveOwnersLower.size > 0) {
        const rawBookOwners = Array.isArray(book.owners) ? book.owners.filter(Boolean) : [];
        const bookOwnersLower =
          rawBookOwners.length > 0
            ? rawBookOwners.map((o) => String(o).trim().toLowerCase())
            : ['shared'];
        const matchesSelectedOwner = bookOwnersLower.some((o) => effectiveOwnersLower.has(o));
        if (!matchesSelectedOwner) {
          return false;
        }
      }

      if (freshnessFilter !== 'all') {
        const usage = usageByBookId.get(book.id);
        const rotatable = isBookRotatable(book);
        switch (freshnessFilter) {
          case 'never-rotated':
            if (!rotatable || !usage || !usage.neverRotated) return false;
            break;
          case 'long-unseen':
            if (!rotatable || !usage || (!usage.neverRotated && !usage.isLongUnseen)) return false;
            break;
          case 'ready':
            if (!rotatable || !usage || usage.isCurrentlyOnActiveShelf || usage.inCooldown) {
              return false;
            }
            break;
          case 'in-cooldown':
            if (!usage || !usage.inCooldown) return false;
            break;
          case 'unread':
            if (!rotatable || !usage || usage.isReadByActiveProfile) return false;
            break;
          default:
            break;
        }
      }

      if (!q) return true;
      const haystack = [
        book.title,
        book.authors.join(' '),
        book.isbn13 || '',
        book.tags.join(' '),
        book.readingLevelHint || '',
        formatCollectionStatus(status),
        formatBookCondition(condition),
        ...(book.owners || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    if (sortBy === 'longest-off-shelf') {
      result.sort((a, b) => {
        const ua = usageByBookId.get(a.id);
        const ub = usageByBookId.get(b.id);
        const aRank = !isBookRotatable(a) ? 3 : ua?.isCurrentlyOnActiveShelf ? 2 : ua?.neverRotated ? 0 : 1;
        const bRank = !isBookRotatable(b) ? 3 : ub?.isCurrentlyOnActiveShelf ? 2 : ub?.neverRotated ? 0 : 1;
        if (aRank !== bRank) return aRank - bRank;
        const aDays = ua?.daysSinceLastRotated ?? -1;
        const bDays = ub?.daysSinceLastRotated ?? -1;
        if (bDays !== aDays) return bDays - aDays;
        const aCycles = ua?.rotationsSinceLastOut ?? 0;
        const bCycles = ub?.rotationsSinceLastOut ?? 0;
        if (bCycles !== aCycles) return bCycles - aCycles;
        return a.title.localeCompare(b.title);
      });
    } else if (sortBy === 'recently-rotated') {
      result.sort((a, b) => {
        const aMs = a.lastRotatedAt ? Date.parse(a.lastRotatedAt) || 0 : 0;
        const bMs = b.lastRotatedAt ? Date.parse(b.lastRotatedAt) || 0 : 0;
        if (bMs !== aMs) return bMs - aMs;
        return a.title.localeCompare(b.title);
      });
    } else if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }, [
    state.books,
    searchQuery,
    catalogFilter,
    selectedFormats,
    selectedThemes,
    conditionFilter,
    effectiveOwners,
    freshnessFilter,
    sortBy,
    usageByBookId,
  ]);

  const isForActiveReader =
    ownerFilter === 'active-reader' && selectedOwners.length === 0;
  const isAllBooksScope = effectiveOwners.length === 0;
  const isCustomOwnerScope = !isForActiveReader && !isAllBooksScope;
  const activeToneClass = activeProfile
    ? AVATAR_TONES[activeProfile.avatarTone || 'teal'] || AVATAR_TONES.teal
    : AVATAR_TONES.teal;

  const activeFilterCount =
    (selectedFormats.length > 0 ? 1 : 0) +
    (selectedThemes.length > 0 ? 1 : 0) +
    (conditionFilter !== 'all' ? 1 : 0) +
    (freshnessFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'default' ? 1 : 0) +
    (isCustomOwnerScope ? 1 : 0) +
    (catalogFilter !== 'all' && catalogFilter !== 'wishlist' && catalogFilter !== 'loved' ? 1 : 0);

  const resetAllFilters = () => {
    setCatalogFilter('all');
    setSelectedFormats([]);
    setSelectedThemes([]);
    setOwnerFilter('all');
    setSelectedOwners([]);
    setConditionFilter('all');
    setFreshnessFilter('all');
    setSortBy('default');
    setSearchQuery('');
    setGlobalSearchQuery('');
  };

  const profileNameMap = useMemo(
    () => new Map(state.profiles.map((p) => [p.id.toLowerCase(), p.name])),
    [state.profiles]
  );

  const sharedFilterProps = {
    catalogFilter,
    setCatalogFilter,
    selectedFormats,
    setSelectedFormats,
    selectedThemes,
    setSelectedThemes,
    ownerFilter,
    setOwnerFilter,
    selectedOwners,
    setSelectedOwners,
    conditionFilter,
    setConditionFilter,
    freshnessFilter,
    setFreshnessFilter,
    sortBy,
    setSortBy,
    availableThemes,
    ownerChoices,
    effectiveOwners,
  };

  return (
    <div className="space-y-5 text-left">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-700 dark:text-[#5ED3DA]">
            {isForActiveReader && activeProfile
              ? `For ${activeProfile.name} & Shared`
              : isAllBooksScope
                ? state.settings?.householdName
                  ? `${state.settings.householdName} · All Household Books`
                  : 'All Household Books'
                : 'Custom Reader Selection'}
          </p>
          <h1 className="font-display text-2xl sm:text-[30px] font-bold tracking-tight text-forest-900 dark:text-white leading-tight mt-0.5">
            Family Library
            <span className="text-sm font-sans font-semibold text-stone-ink dark:text-slate-400 font-mono-tabular ml-2.5 px-2 py-0.5 rounded-lg bg-linen-100 dark:bg-night-800 border border-linen-200 dark:border-night-700 align-middle">
              {filteredBooks.length}/{state.books.length}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {booksNeedingSyncCount > 0 && (
            <button
              type="button"
              data-action="sync-library-metadata"
              disabled={isSyncingCatalog}
              onClick={handleSyncCatalogMetadata}
              title={`Fetch missing covers, page counts, or publication years for ${booksNeedingSyncCount} books`}
              className="min-h-[48px] sm:min-h-[42px] px-3.5 py-2 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-60 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] whitespace-nowrap"
            >
              <Icon name="refresh" className={`w-3.5 h-3.5 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
              <span>
                {isSyncingCatalog
                  ? syncProgressLabel || 'Syncing…'
                  : `Sync Metadata (${booksNeedingSyncCount})`}
              </span>
            </button>
          )}

          <button
            type="button"
            data-action="open-ai-recommendations"
            onClick={() => setAiRecsModal({ isOpen: true })}
            title="Get AI book recommendations & collection gap analysis"
            className="min-h-[48px] sm:min-h-[42px] px-3.5 py-2 rounded-xl bg-ivory hover:bg-linen-100 text-forest-900 border border-linen-200 dark:bg-night-900 dark:hover:bg-night-800 dark:text-[#5ED3DA] dark:border-night-700 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] whitespace-nowrap"
          >
            <Icon name="sparkles" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
            <span>AI Discover</span>
          </button>

          <a
            href="#/scan"
            onClick={(e) => {
              e.preventDefault();
              navigate('scan');
            }}
            aria-label="Scan or add a new book"
            className="min-h-[48px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] shrink-0 whitespace-nowrap"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Add Book</span>
          </a>
        </div>
      </div>

      {/* Desktop 2-Column Layout: Persistent Collapsible Filter Sidebar + Responsive Catalog Grid */}
      <div className="lg:flex lg:items-start lg:gap-6">
        {isDesktopSidebarOpen && (
          <aside
            aria-label="Library filters sidebar"
            className="hidden lg:flex lg:flex-col lg:w-72 shrink-0 rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 shadow-2xs p-4 sticky top-20 max-h-[calc(100vh-6.5rem)]"
          >
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-linen-200/80 dark:border-night-800 shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="filter" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                <h2 className="font-display text-base font-bold text-forest-900 dark:text-white">
                  Filters
                </h2>
              </div>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline"
                >
                  Reset ({activeFilterCount})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDesktopSidebarOpen(false)}
                  aria-label="Hide filters sidebar"
                  className="text-xs font-medium text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Hide
                </button>
              )}
            </div>

            <div className="overflow-y-auto pr-1 flex-1">
              <LibraryFilterControls {...sharedFilterProps} />
            </div>
          </aside>
        )}

        {/* Right Main Catalog Workspace */}
        <div className="flex-1 min-w-0 space-y-3.5">
          {/* Search + Controls Row */}
          <div className="space-y-2">
            <div className="relative min-w-0">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-ink dark:text-slate-400">
                <Icon name="search" className="w-4 h-4" />
              </span>
              <ClearableInput
                id="catalog-search-input"
                value={searchQuery}
                onValueChange={handleSearchChange}
                placeholder="Search title, author, ISBN, owner, or topic…"
                className="w-full h-12 pl-9 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white placeholder:text-stone-ink/70 dark:placeholder:text-slate-400 shadow-2xs focus:outline-2 focus:outline-forest-700"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {/* Mobile Filter Drawer Trigger */}
              <button
                type="button"
                data-action="open-library-filters"
                aria-label="Open library filters sidebar"
                onClick={() => setIsFilterDrawerOpen(true)}
                className={`lg:hidden min-h-[48px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
                  activeFilterCount > 0
                    ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                    : 'bg-ivory dark:bg-night-900 text-forest-900 dark:text-slate-200 border border-linen-200 dark:border-night-700 hover:bg-linen-100 dark:hover:bg-night-800'
                }`}
              >
                <Icon name="filter" className="w-3.5 h-3.5" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="font-mono-tabular text-[11px]">({activeFilterCount})</span>
                )}
              </button>

              {/* Desktop Sidebar Toggle */}
              <button
                type="button"
                onClick={() => setIsDesktopSidebarOpen((prev) => !prev)}
                aria-pressed={isDesktopSidebarOpen}
                className={`hidden lg:inline-flex min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  isDesktopSidebarOpen
                    ? 'bg-linen-100 dark:bg-night-800 text-forest-900 dark:text-white border border-linen-200 dark:border-night-700'
                    : 'bg-ivory dark:bg-night-900 text-forest-900 dark:text-slate-200 border border-linen-200 dark:border-night-700 hover:bg-linen-100 dark:hover:bg-night-800'
                }`}
              >
                <Icon name="filter" className="w-3.5 h-3.5" />
                <span>{isDesktopSidebarOpen ? 'Hide Filters' : 'Show Filters'}</span>
                {activeFilterCount > 0 && (
                  <span className="font-mono-tabular text-[11px]">({activeFilterCount})</span>
                )}
              </button>

              {activeProfile && (
                <div
                  role="group"
                  aria-label="Reader book scope"
                  className="inline-flex items-center p-0.5 rounded-xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 shrink-0"
                >
                  <button
                    type="button"
                    data-action="set-owner-filter"
                    data-owner="active-reader"
                    aria-pressed={isForActiveReader ? 'true' : 'false'}
                    onClick={() => {
                      setOwnerFilter('active-reader');
                      setSelectedOwners([]);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      isForActiveReader
                        ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                        : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${activeToneClass}`}
                    >
                      {computeOwnerInitials(activeProfile.name)}
                    </span>
                    <span>For {activeProfile.name}</span>
                  </button>
                  <button
                    type="button"
                    data-action="set-owner-filter"
                    data-owner="all"
                    aria-pressed={isAllBooksScope ? 'true' : 'false'}
                    onClick={() => {
                      setOwnerFilter('all');
                      setSelectedOwners([]);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      isAllBooksScope
                        ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                        : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                    }`}
                  >
                    All Books
                  </button>
                </div>
              )}

              <button
                type="button"
                data-action="set-catalog-filter"
                data-filter="all"
                aria-pressed={catalogFilter === 'all' ? 'true' : 'false'}
                onClick={() => setCatalogFilter('all')}
                className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
                  catalogFilter === 'all'
                    ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                    : 'bg-ivory dark:bg-night-900 text-stone-ink dark:text-slate-300 border border-linen-200 dark:border-night-700 hover:text-forest-900 dark:hover:text-white'
                }`}
              >
                All
              </button>

              <button
                type="button"
                data-action="set-catalog-filter"
                data-filter="wishlist"
                aria-pressed={catalogFilter === 'wishlist' ? 'true' : 'false'}
                aria-label={`Wishlist, ${wishlistCount} ${wishlistCount === 1 ? 'book' : 'books'}`}
                title="Wishlist"
                onClick={() => setCatalogFilter('wishlist')}
                className={`min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
                  catalogFilter === 'wishlist'
                    ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                    : 'bg-ivory dark:bg-night-900 text-espresso-800 dark:text-amber-200 border border-linen-200 dark:border-night-700 hover:text-forest-900 dark:hover:text-white'
                }`}
              >
                <Icon name="bookmark" className="w-3.5 h-3.5" />
                <span className="font-mono-tabular">{wishlistCount}</span>
              </button>

              <button
                type="button"
                data-action="set-catalog-filter"
                data-filter="loved"
                aria-pressed={catalogFilter === 'loved' ? 'true' : 'false'}
                aria-label={`Loved, ${lovedCount} ${lovedCount === 1 ? 'book' : 'books'}`}
                title="Loved favorites"
                onClick={() => setCatalogFilter('loved')}
                className={`min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700 ${
                  catalogFilter === 'loved'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-ivory dark:bg-night-900 text-rose-600 dark:text-rose-400 border border-linen-200 dark:border-night-700 hover:bg-linen-50 dark:hover:bg-night-800'
                }`}
              >
                <Icon name={catalogFilter === 'loved' ? 'heartFilled' : 'heart'} className="w-3.5 h-3.5" />
                <span className="font-mono-tabular">{lovedCount}</span>
              </button>
            </div>

            {/* Active Removable Filter Controls */}
            {(selectedFormats.length > 0 ||
              selectedThemes.length > 0 ||
              isCustomOwnerScope ||
              conditionFilter !== 'all' ||
              freshnessFilter !== 'all' ||
              sortBy !== 'default') && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {selectedFormats.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    data-action="toggle-library-format"
                    data-format={fmt}
                    onClick={() => setSelectedFormats((prev) => prev.filter((f) => f !== fmt))}
                    className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                  >
                    <span>{formatBookBinding(fmt as any)}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {selectedThemes.map((th) => (
                  <button
                    key={th}
                    type="button"
                    data-action="toggle-library-theme"
                    data-theme-tag={th}
                    onClick={() =>
                      setSelectedThemes((prev) =>
                        prev.filter((t) => t.toLowerCase() !== th.toLowerCase())
                      )
                    }
                    className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                  >
                    <span>#{th}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}

                {isCustomOwnerScope &&
                  effectiveOwners.map((own) => {
                    const lower = own.toLowerCase();
                    const label = lower === 'shared' ? 'Shared' : profileNameMap.get(lower) || own;
                    return (
                      <button
                        key={own}
                        type="button"
                        data-action="toggle-library-owner"
                        data-owner={own}
                        onClick={() =>
                          setSelectedOwners((prev) =>
                            prev.filter((o) => o.toLowerCase() !== own.toLowerCase())
                          )
                        }
                        className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                      >
                        <span>{label}</span>
                        <span aria-hidden="true">×</span>
                      </button>
                    );
                  })}

                {conditionFilter !== 'all' && (
                  <button
                    type="button"
                    data-action="set-library-condition"
                    data-condition-filter="all"
                    onClick={() => setConditionFilter('all')}
                    className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                  >
                    <span>{conditionFilter === 'good' ? 'Good Condition' : 'Needs Care'}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                {freshnessFilter !== 'all' && (
                  <button
                    type="button"
                    data-action="set-library-freshness"
                    data-freshness="all"
                    onClick={() => setFreshnessFilter('all')}
                    className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                  >
                    <span>{freshnessFilter}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                {sortBy !== 'default' && (
                  <button
                    type="button"
                    data-action="set-library-sort"
                    data-sort="default"
                    onClick={() => setSortBy('default')}
                    className="min-h-[28px] px-2.5 py-0.5 rounded-lg bg-forest-700/12 dark:bg-[#5ED3DA]/15 text-forest-900 dark:text-[#5ED3DA] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-forest-700/20 transition-colors"
                  >
                    <span>Sort: {sortBy}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                <button
                  type="button"
                  data-action="reset-library-filters"
                  onClick={resetAllFilters}
                  className="text-[11px] font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white px-1.5 py-0.5"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Book Grid */}
          {filteredBooks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 pt-1">
              {filteredBooks.map((book) => {
                const primaryAuthor = book.authors[0] || 'Unknown Author';
                const status = normalizeCollectionStatus(book.collectionStatus);
                const condition = normalizeBookCondition(book.condition);
                const usage = usageByBookId.get(book.id);

                let statusBadge = null;
                if (status === 'wishlist') {
                  statusBadge = (
                    <span
                      data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
                      data-cover-catalog-badge="wishlist"
                      className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-md ${COVER_CATALOG_BADGE_STYLES.wishlist} text-[9px] font-bold tracking-wide shadow-2xs`}
                    >
                      Wishlist
                    </span>
                  );
                } else if (status === 'library') {
                  statusBadge = (
                    <span
                      data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
                      data-cover-catalog-badge="loan"
                      className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-md ${COVER_CATALOG_BADGE_STYLES.libraryLoan} text-[9px] font-bold tracking-wide shadow-2xs`}
                    >
                      Loan
                    </span>
                  );
                } else if (status === 'interested') {
                  statusBadge = (
                    <span
                      data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
                      data-cover-catalog-badge="saved"
                      className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-md ${COVER_CATALOG_BADGE_STYLES.saved} text-[9px] font-bold tracking-wide shadow-2xs`}
                    >
                      Saved
                    </span>
                  );
                } else if (condition !== 'good') {
                  const label = condition === 'torn' ? 'Torn' : 'Damaged';
                  const style =
                    condition === 'torn'
                      ? COVER_CATALOG_BADGE_STYLES.torn
                      : COVER_CATALOG_BADGE_STYLES.damaged;
                  statusBadge = (
                    <span
                      data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
                      data-cover-catalog-badge={condition}
                      className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-md ${style} text-[9px] font-bold tracking-wide shadow-2xs`}
                    >
                      {label}
                    </span>
                  );
                }

                return (
                  <article
                    key={book.id}
                    data-book-card={book.id}
                    className="group flex flex-col min-w-0 rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-2.5 shadow-2xs hover:shadow-md hover:border-linen-300 dark:hover:border-night-700 transition-all"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        data-action="inspect-book"
                        data-book-id={book.id}
                        onClick={() => setInspectedBookId(book.id)}
                        aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
                        className="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.98]"
                      >
                        <BookCover
                          book={book}
                          size="grid"
                          aspectRatio={coverAspectRatio}
                          showBadges={false}
                        />
                      </button>

                      {statusBadge}

                      {book.loved && (
                        <span
                          data-cover-slot={COVER_BADGE_SLOTS.affection.slot}
                          className={`${COVER_BADGE_SLOTS.affection.positionClass} w-6 h-6 rounded-full bg-ivory/95 dark:bg-night-900/95 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-xs border border-linen-200/70 dark:border-night-700`}
                          title="Loved favorite"
                        >
                          <Icon name="heartFilled" className="w-3.5 h-3.5 text-rose-600" />
                        </span>
                      )}

                      {showCoverUsageAdornos && usage && usage.compactRecencyLabel && (
                        <div className="pointer-events-none absolute bottom-2 left-2 z-20">
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-md shadow-xs border ${
                              usage.inCooldown
                                ? 'bg-amber-100/95 text-amber-900 border-amber-300 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-700'
                                : usage.isCurrentlyOnActiveShelf
                                  ? 'bg-forest-900/95 text-white border-forest-700 dark:bg-forest-900/95 dark:text-emerald-300 dark:border-forest-600'
                                  : 'bg-ivory/95 text-forest-900 border-linen-300 dark:bg-night-900/95 dark:text-slate-200 dark:border-night-700'
                            }`}
                          >
                            {usage.compactRecencyLabel}
                          </span>
                        </div>
                      )}

                      {book.owners && book.owners.length > 0 && (
                        <div
                          data-cover-slot={COVER_BADGE_SLOTS.owners.slot}
                          className={`${COVER_BADGE_SLOTS.owners.positionClass} flex -space-x-1`}
                        >
                          {book.owners
                            .filter((o) => o !== 'shared')
                            .slice(0, 2)
                            .map((ownerId) => {
                              const prof = state.profiles.find((p) => p.id === ownerId);
                              const tone = AVATAR_TONES[prof?.avatarTone || 'teal'] || AVATAR_TONES.teal;
                              return (
                                <span
                                  key={ownerId}
                                  title={prof?.name || ownerId}
                                  className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ring-1 ring-ivory dark:ring-night-900 shadow-2xs ${tone}`}
                                >
                                  {(prof?.name || ownerId).charAt(0).toUpperCase()}
                                </span>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      data-action="inspect-book"
                      data-book-id={book.id}
                      onClick={() => setInspectedBookId(book.id)}
                      className="mt-2.5 px-0.5 pb-0.5 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-forest-700 rounded flex-1 flex flex-col justify-between"
                    >
                      <div>
                        <h2 className="font-sans text-xs sm:text-[13px] font-bold text-forest-900 dark:text-white leading-snug line-clamp-2 group-hover:text-forest-700 dark:group-hover:text-[#5ED3DA] transition-colors">
                          {book.title}
                        </h2>
                        <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate mt-0.5">
                          {primaryAuthor}
                        </p>
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-linen-200/70 dark:border-night-800/80 space-y-0.5">
                        <p className="text-[10px] text-stone-ink/85 dark:text-slate-400 truncate">
                          Ages {book.ageMin}–{book.ageMax} · {formatBookBinding(book.format)}
                        </p>
                        {showRotationHistory && isBookRotatable(book) && usage && (
                          <p
                            data-library-usage-line="true"
                            title={usage.shortRecencyLabel}
                            className={`text-[10px] truncate ${
                              usage.inCooldown
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : usage.isCurrentlyOnActiveShelf
                                  ? 'text-forest-700 dark:text-[#5ED3DA] font-semibold'
                                  : 'text-stone-ink/90 dark:text-slate-400'
                            }`}
                          >
                            {usage.compactRecencyLabel}
                          </p>
                        )}
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-8 text-center space-y-2.5">
              <p className="text-sm font-semibold text-forest-900 dark:text-white">
                {state.books.length === 0 ? 'Your household library is ready for its first books' : 'No books match these filters'}
              </p>
              <p className="text-xs text-stone-ink dark:text-slate-400">
                {state.books.length === 0
                  ? 'Scan a barcode, search online catalogs, or add your first favorites manually.'
                  : !isAllBooksScope || activeFilterCount > 0
                    ? 'Reset filters or switch to All Books to include titles across all readers.'
                    : 'Clear your search or add a book to your catalog or wishlist.'}
              </p>
              <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                {state.books.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('scan')}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors"
                  >
                    Scan or Add Books
                  </button>
                ) : (
                  (!isAllBooksScope || activeFilterCount > 0) && (
                    <button
                      type="button"
                      data-action="reset-library-filters"
                      onClick={resetAllFilters}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors"
                    >
                      Show All Books
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        {...sharedFilterProps}
        filteredCount={filteredBooks.length}
        activeFilterCount={activeFilterCount}
        onResetAll={resetAllFilters}
      />
    </div>
  );
};
