import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
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

  const coverAspectRatio = state.settings?.coverAspectRatio || 'square';
  const viewMode = state.settings?.bookViewMode || 'grid';
  const cardSize = state.settings?.bookCardSize || 'compact';
  const libraryGridClass =
    cardSize === 'compact'
      ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3 pt-1'
      : cardSize === 'large'
        ? 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pt-1'
        : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 pt-1';
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
    <div className="space-y-5 text-left min-w-0 overflow-x-clip">
      {/* Header Row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            {isForActiveReader && activeProfile
              ? `For ${activeProfile.name} & Shared`
              : isAllBooksScope
                ? state.settings?.householdName
                  ? `${state.settings.householdName} · All Household Books`
                  : 'All Household Books'
                : 'Custom Reader Selection'}
          </p>
          <h1 className="font-display text-3xl sm:text-[34px] font-semibold tracking-tight text-ink leading-tight mt-0.5">
            Family Library
            <span className="text-xs font-sans font-semibold text-ink-secondary font-mono-tabular ml-2.5 px-2 py-0.5 rounded-md bg-surface-elevated border border-edge align-middle">
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
              className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-lg bg-surface hover:bg-surface-elevated disabled:opacity-60 border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
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
            className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-lg bg-surface hover:bg-surface-elevated text-ink border border-edge text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            <Icon name="sparkles" className="w-4 h-4 text-accent" />
            <span>AI Discover</span>
          </button>

          <a
            href="#/scan"
            onClick={(e) => {
              e.preventDefault();
              navigate('scan');
            }}
            aria-label="Scan or add a new book"
            className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.98] shrink-0 whitespace-nowrap"
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
            className="hidden lg:flex lg:flex-col lg:w-72 shrink-0 rounded-xl bg-surface border border-edge shadow-2xs p-4 sticky top-20 max-h-[calc(100vh-6.5rem)]"
          >
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-edge-subtle shrink-0">
              <div className="flex items-center gap-2">
                <Icon name="filter" className="w-4 h-4 text-primary" />
                <h2 className="font-display text-lg font-semibold text-ink">
                  Filters
                </h2>
              </div>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                >
                  Reset ({activeFilterCount})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDesktopSidebarOpen(false)}
                  aria-label="Hide filters sidebar"
                  className="text-xs font-medium text-ink-secondary hover:text-ink cursor-pointer"
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
              <span className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-ink-muted">
                <Icon name="search" className="w-4 h-4" />
              </span>
              <ClearableInput
                id="catalog-search-input"
                value={searchQuery}
                onValueChange={handleSearchChange}
                placeholder="Search title, author, ISBN, owner, or topic…"
                className="w-full h-11 pl-9 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted shadow-2xs transition-[border-color,box-shadow] focus:outline-none focus-visible:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 dark:focus:border-[var(--highlight)] dark:focus:ring-[var(--highlight)]/25"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {/* Mobile Filter Drawer Trigger */}
              <button
                type="button"
                data-action="open-library-filters"
                aria-label="Open library filters sidebar"
                onClick={() => setIsFilterDrawerOpen(true)}
                className={`lg:hidden min-h-[44px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer ${
                  activeFilterCount > 0
                    ? 'bg-primary text-primary-fg'
                    : 'bg-surface text-ink border border-edge hover:bg-surface-elevated'
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
                className={`hidden lg:inline-flex min-h-[38px] px-3 py-1 rounded-lg text-xs font-semibold items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isDesktopSidebarOpen
                    ? 'bg-surface-elevated text-ink border border-edge'
                    : 'bg-surface text-ink border border-edge hover:bg-surface-elevated'
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
                  className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge shrink-0"
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
                    className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                      isForActiveReader
                        ? 'bg-surface text-ink shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
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
                    className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isAllBooksScope
                        ? 'bg-surface text-ink shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
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
                className={`min-h-[38px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'all'
                    ? 'bg-primary text-primary-fg'
                    : 'bg-surface text-ink-secondary border border-edge hover:text-ink'
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
                className={`min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'wishlist'
                    ? 'bg-primary text-primary-fg'
                    : 'bg-surface text-accent border border-edge hover:bg-surface-elevated'
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
                className={`min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'loved'
                    ? 'bg-[#8C4A4F] text-[#FFFCF5] shadow-2xs'
                    : 'bg-surface text-[#8C4A4F] dark:text-[#C48A8E] border border-edge hover:bg-surface-elevated'
                }`}
              >
                <Icon name={catalogFilter === 'loved' ? 'heartFilled' : 'heart'} className="w-3.5 h-3.5" />
                <span className="font-mono-tabular">{lovedCount}</span>
              </button>

              <div
                role="group"
                aria-label="Catalog layout"
                className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge shrink-0 ml-auto"
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
                    className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface-elevated border border-primary/35 text-primary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-surface-subtle transition-colors cursor-pointer"
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
                    className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface-elevated border border-primary/35 text-primary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-surface-subtle transition-colors cursor-pointer"
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
                        className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface-elevated border border-primary/35 text-primary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-surface-subtle transition-colors cursor-pointer"
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
                    className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface-elevated border border-primary/35 text-primary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-surface-subtle transition-colors cursor-pointer"
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
                    className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface-elevated border border-primary/35 text-primary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-surface-subtle transition-colors cursor-pointer"
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
                    className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface-elevated border border-primary/35 text-primary text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-surface-subtle transition-colors cursor-pointer"
                  >
                    <span>Sort: {sortBy}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )}

                <button
                  type="button"
                  data-action="reset-library-filters"
                  onClick={resetAllFilters}
                  className="text-[11px] font-semibold text-ink-secondary hover:text-ink px-1.5 py-0.5 cursor-pointer"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Book Grid / List */}
          {filteredBooks.length > 0 ? (
            viewMode === 'list' ? (
              <div className="space-y-2 pt-1">
                {filteredBooks.map((book) => {
                  const primaryAuthor = book.authors[0] || 'Unknown Author';
                  const status = normalizeCollectionStatus(book.collectionStatus);
                  const condition = normalizeBookCondition(book.condition);
                  const usage = usageByBookId.get(book.id);

                  const statusLabel =
                    status === 'wishlist'
                      ? 'Wishlist'
                      : status === 'library'
                        ? 'Loan'
                        : status === 'interested'
                          ? 'Saved'
                          : condition !== 'good'
                            ? condition === 'torn'
                              ? 'Torn'
                              : 'Damaged'
                            : null;

                  return (
                    <article
                      key={book.id}
                      data-book-card={book.id}
                      className="group min-w-0 rounded-xl bg-surface border border-edge hover:border-primary/45 p-2 sm:p-2.5 lr-card transition-all"
                    >
                      <button
                        type="button"
                        data-action="inspect-book"
                        data-book-id={book.id}
                        onClick={() => setInspectedBookId(book.id)}
                        aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
                        className="w-full min-w-0 flex items-center gap-3 text-left cursor-pointer"
                      >
                        <div className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle">
                          <BookCover
                            book={book}
                            size="sm"
                            aspectRatio={coverAspectRatio}
                            showBadges={false}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <h2 className="font-sans text-sm sm:text-[15px] font-semibold text-ink leading-tight truncate group-hover:text-primary transition-colors">
                              {book.title}
                            </h2>
                            {statusLabel && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded bg-surface-elevated border border-edge text-[10px] font-semibold text-ink-secondary">
                                {statusLabel}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ink-secondary truncate leading-tight mt-0.5">
                            {primaryAuthor}
                          </p>
                          <p className="text-[11px] text-ink-muted truncate leading-tight mt-0.5">
                            <span>Ages {book.ageMin}–{book.ageMax}</span>
                            <span aria-hidden="true" className="mx-1">·</span>
                            <span>{formatBookBinding(book.format)}</span>
                            {showRotationHistory && isBookRotatable(book) && usage && (
                              <>
                                <span aria-hidden="true" className="mx-1">·</span>
                                <span
                                  data-library-usage-line="true"
                                  className={
                                    usage.inCooldown
                                      ? 'text-accent font-medium'
                                      : usage.isCurrentlyOnActiveShelf
                                        ? 'text-primary font-semibold'
                                        : ''
                                  }
                                >
                                  {usage.compactRecencyLabel}
                                </span>
                              </>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {book.owners && book.owners.length > 0 && (
                            <div className="hidden sm:flex -space-x-1">
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
                                      className={`w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ring-1 ring-surface ${tone}`}
                                    >
                                      {(prof?.name || ownerId).charAt(0).toUpperCase()}
                                    </span>
                                  );
                                })}
                            </div>
                          )}
                          {book.loved && (
                            <span
                              className="w-6 h-6 rounded-full bg-surface-elevated text-[#8C4A4F] dark:text-[#C48A8E] inline-flex items-center justify-center border border-edge"
                              title="Loved favorite"
                            >
                              <Icon name="heartFilled" className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <Icon name="chevronRight" className="w-4 h-4 text-ink-muted group-hover:text-ink" />
                        </div>
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
            <div className={libraryGridClass}>
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
                    className={`group flex flex-col min-w-0 rounded-xl bg-surface border border-edge ${
                      cardSize === 'compact' ? 'p-1.5 sm:p-2' : cardSize === 'large' ? 'p-3' : 'p-2.5'
                    } lr-card hover:border-secondary transition-all`}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        data-action="inspect-book"
                        data-book-id={book.id}
                        onClick={() => setInspectedBookId(book.id)}
                        aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
                        className="block w-full rounded-lg transition-transform active:scale-[0.98] cursor-pointer"
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
                          className={`${COVER_BADGE_SLOTS.affection.positionClass} w-6 h-6 rounded-full bg-surface/95 text-[#8C4A4F] dark:text-[#C48A8E] flex items-center justify-center shadow-xs border border-edge`}
                          title="Loved favorite"
                        >
                          <Icon name="heartFilled" className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {showCoverUsageAdornos && usage && usage.compactRecencyLabel && (
                        <div className="pointer-events-none absolute bottom-2 left-2 z-20">
                          <span
                            className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-md shadow-xs border ${
                              usage.inCooldown
                                ? 'bg-surface-elevated/95 text-accent border-accent/45'
                                : usage.isCurrentlyOnActiveShelf
                                  ? 'bg-primary text-primary-fg border-surface'
                                  : 'bg-surface/95 text-ink border-edge'
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
                                  className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ring-1 ring-surface shadow-2xs ${tone}`}
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
                      className="mt-1.5 px-0.5 pb-0.5 text-left min-w-0 rounded flex-1 flex flex-col justify-between cursor-pointer"
                    >
                      <div>
                        <h2
                          className={`font-sans ${
                            cardSize === 'compact'
                              ? 'text-xs sm:text-[13px]'
                              : cardSize === 'large'
                                ? 'text-sm sm:text-base'
                                : 'text-[13px] sm:text-sm'
                          } font-semibold text-ink leading-tight line-clamp-2 group-hover:text-primary transition-colors`}
                        >
                          {book.title}
                        </h2>
                        <p className="text-[11px] text-ink-secondary truncate leading-tight mt-0.5">
                          {primaryAuthor}
                        </p>
                      </div>
                      <div className="mt-1 pt-1 border-t border-edge-subtle space-y-0.5">
                        <p className="text-[10px] text-ink-secondary truncate leading-tight">
                          Ages {book.ageMin}–{book.ageMax} · {formatBookBinding(book.format)}
                        </p>
                        {showRotationHistory && isBookRotatable(book) && usage && (
                          <p
                            data-library-usage-line="true"
                            title={usage.shortRecencyLabel}
                            className={`text-[10px] truncate leading-tight ${
                              usage.inCooldown
                                ? 'text-accent font-medium'
                                : usage.isCurrentlyOnActiveShelf
                                  ? 'text-primary font-semibold'
                                  : 'text-ink-muted'
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
            )
          ) : (
            <div className="rounded-xl bg-surface border border-edge p-8 text-center space-y-3 lr-card">
              <BotanicalIllustration variant="empty-library" className="w-40 h-auto mx-auto" />
              <h2 className="font-display text-xl font-semibold text-ink">
                {state.books.length === 0 ? 'Your household library is ready for its first books' : 'No books match these filters'}
              </h2>
              <p className="text-xs text-ink-secondary max-w-sm mx-auto">
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
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Scan or Add Books
                  </button>
                ) : (
                  (!isAllBooksScope || activeFilterCount > 0) && (
                    <button
                      type="button"
                      data-action="reset-library-filters"
                      onClick={resetAllFilters}
                      className="min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
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
