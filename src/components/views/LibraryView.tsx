import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { FilterDrawer, LibraryFilterControls } from '../modals/FilterDrawer.js';
import { ReaderFilterSheet } from '../modals/ReaderFilterSheet.js';
import { AiCollectionSearchSheet } from '../modals/AiCollectionSearchSheet.js';
import { FoundBookSheet } from '../modals/FoundBookSheet.js';
import { NativeBarcodeScannerModal } from '../scan/NativeBarcodeScannerModal.js';
import { BookCover } from '../common/BookCover.js';
import { acquireCameraStream } from '../../features/scan/camera-access.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';
import type { BookCondition } from '../../types/models.js';
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
  const [isReaderSheetOpen, setIsReaderSheetOpen] = useState(false);
  const [isAiSearchOpen, setIsAiSearchOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const [isQuickScannerOpen, setIsQuickScannerOpen] = useState(false);
  const [prewarmedStreamPromise, setPrewarmedStreamPromise] =
    useState<Promise<MediaStream> | null>(null);
  const [foundCandidate, setFoundCandidate] = useState<BookCandidate | null>(null);

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

  const toggleOwnerFilter = (ownerKey: string) => {
    const target = ownerKey.trim();
    if (!target) return;

    const baseList =
      ownerFilter === 'custom' && selectedOwners.length > 0
        ? [...selectedOwners]
        : ownerFilter === 'active-reader' && activeProfile
          ? [activeProfile.id, 'shared']
          : ownerFilter !== 'all' && ownerFilter !== 'custom'
            ? [ownerFilter]
            : [];

    const targetLower = target.toLowerCase();
    const exists = baseList.some((o) => o.toLowerCase() === targetLower);
    const nextList = exists
      ? baseList.filter((o) => o.toLowerCase() !== targetLower)
      : [...baseList, target];

    if (nextList.length === 0) {
      setOwnerFilter('all');
      setSelectedOwners([]);
      return;
    }

    if (
      activeProfile &&
      nextList.length === 2 &&
      nextList.some((o) => o.toLowerCase() === activeProfile.id.toLowerCase()) &&
      nextList.some((o) => o.toLowerCase() === 'shared')
    ) {
      setOwnerFilter('active-reader');
      setSelectedOwners([]);
      return;
    }

    setOwnerFilter('custom');
    setSelectedOwners(nextList);
  };

  const selectAllReaders = () => {
    setOwnerFilter('all');
    setSelectedOwners([]);
  };

  const readersPillLabel = useMemo(() => {
    if (effectiveOwners.length === 0) return 'All Readers';
    const firstKey = effectiveOwners[0].toLowerCase();
    const firstLabel = firstKey === 'shared' ? 'Shared' : profileNameMap.get(firstKey) || effectiveOwners[0];
    if (effectiveOwners.length === 1) return firstLabel;
    return `${firstLabel} +${effectiveOwners.length - 1}`;
  }, [effectiveOwners, profileNameMap]);

  const handleOpenQuickScanner = () => {
    setPrewarmedStreamPromise(acquireCameraStream('environment'));
    setIsQuickScannerOpen(true);
  };

  const handleQuickIsbnDetected = async (isbn13: string) => {
    setIsQuickScannerOpen(false);
    setPrewarmedStreamPromise(null);

    const localMatch = state.books.find(
      (b) => b.isbn13 === isbn13 || b.isbn10 === isbn13
    );

    try {
      const res = await catalogService.lookupByIsbn(isbn13, {
        retainRaw: state.settings?.retainRawProviderPayloads,
        enabledProviderIds: state.settings?.enabledMetadataProviders,
      });
      if (res.candidate) {
        setFoundCandidate(res.candidate);
        return;
      }
      if (localMatch) {
        setInspectedBookId(localMatch.id);
        return;
      }
      store.notify(`ISBN ${isbn13} not found online — add manually.`, 'info');
      navigate('scan', { tab: 'manual', isbn: isbn13 });
    } catch (err) {
      if (localMatch) {
        setInspectedBookId(localMatch.id);
      } else {
        store.notify(err instanceof Error ? err.message : String(err), 'error');
      }
    }
  };

  const handleQuickTitleDetected = async (titleQuery: string) => {
    setIsQuickScannerOpen(false);
    setPrewarmedStreamPromise(null);
    try {
      const res = await catalogService.searchBooks(
        { query: titleQuery },
        {
          retainRaw: state.settings?.retainRawProviderPayloads,
          enabledProviderIds: state.settings?.enabledMetadataProviders,
          limit: 5,
        }
      );
      if (res.candidates[0]) {
        setFoundCandidate(res.candidates[0]);
      } else {
        store.notify(`No online match for "${titleQuery}".`, 'info');
      }
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleAddQuickCandidate = async (
    candidate: BookCandidate,
    status: 'owned' | 'wishlist',
    opts?: { condition?: BookCondition; owners?: string[]; loved?: boolean }
  ) => {
    try {
      await store.addBookFromCandidate(candidate, {
        collectionStatus: status,
        condition: opts?.condition || 'good',
        owners: opts?.owners || (activeProfile ? [activeProfile.id, 'shared'] : ['shared']),
        loved: opts?.loved || false,
      });
      setFoundCandidate(null);
      store.notify(
        `Added "${candidate.title}" to ${status === 'owned' ? 'Library' : 'Wishlist'}`,
        'success'
      );
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

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
    <div className="space-y-4 text-left min-w-0 overflow-x-clip">
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
          {/* Integrated Sticky Search + Pills + Active Tags Bar */}
          <div
            data-library-floating-controls="true"
            style={{ backgroundColor: 'color-mix(in srgb, var(--background) 94%, transparent)' }}
            className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-[calc(4rem+env(safe-area-inset-top,0px))] z-[25] -mt-5 sm:-mt-6 lg:-mt-8 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 pt-3 sm:pt-3.5 lg:pt-4 pb-2.5 backdrop-blur-xl border-b border-edge-subtle space-y-2.5"
          >
            <ClearableInput
              id="catalog-search-input"
              value={searchQuery}
              onValueChange={handleSearchChange}
              leadingIcon={<Icon name="search" className="w-4 h-4" />}
              placeholder="Search your collection"
              aria-label="Search your collection"
              trailingWidth="double"
              className="h-11 rounded-xl bg-surface/95 border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted shadow-2xs transition-[border-color,box-shadow] focus:outline-none focus-visible:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 dark:focus:border-[var(--highlight)] dark:focus:ring-[var(--highlight)]/25"
              trailingElement={
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    data-action="open-ai-collection-search"
                    aria-label="AI book search"
                    title="AI book search"
                    onClick={() => setIsAiSearchOpen(true)}
                    className="min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center text-accent hover:bg-surface-elevated transition-colors cursor-pointer"
                  >
                    <Icon name="sparkles" className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    data-action="open-library-filters"
                    aria-label={
                      activeFilterCount > 0
                        ? `Open filters sidebar (${activeFilterCount} active)`
                        : 'Open filters sidebar'
                    }
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setIsFilterDrawerOpen(true);
                      } else {
                        setIsDesktopSidebarOpen((prev) => !prev);
                      }
                    }}
                    className={`relative min-h-[38px] min-w-[38px] rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                      activeFilterCount > 0
                        ? 'text-primary bg-primary/10 hover:bg-primary/15'
                        : 'text-ink-secondary hover:text-ink hover:bg-surface-elevated'
                    }`}
                  >
                    <Icon name="sliders" className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary"
                      />
                    )}
                  </button>
                </div>
              }
            />

            {/* Thin Horizontal Scrolling Pills Row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Multi-Select Readers Dropdown Pill */}
              <button
                type="button"
                data-action="open-reader-filter-sheet"
                aria-expanded={isReaderSheetOpen ? 'true' : 'false'}
                onClick={() => setIsReaderSheetOpen(true)}
                className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  effectiveOwners.length > 0
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface text-ink border border-edge hover:bg-surface-elevated'
                }`}
              >
                {effectiveOwners.length === 1 && effectiveOwners[0].toLowerCase() !== 'shared' && (() => {
                  const matchedChoice = ownerChoices.find(
                    (c) => c.key.toLowerCase() === effectiveOwners[0].toLowerCase()
                  );
                  const pillTone =
                    AVATAR_TONES[matchedChoice?.tone || 'teal'] || AVATAR_TONES.teal;
                  return (
                    <span
                      className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${pillTone}`}
                    >
                      {readersPillLabel.charAt(0).toUpperCase()}
                    </span>
                  );
                })()}
                <span>{readersPillLabel}</span>
                <Icon name="chevronDown" className="w-3.5 h-3.5 opacity-80" />
              </button>

              <button
                type="button"
                data-action="set-catalog-filter"
                data-filter="all"
                aria-pressed={catalogFilter === 'all' ? 'true' : 'false'}
                onClick={() => setCatalogFilter('all')}
                className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'all'
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface text-ink-secondary border border-edge hover:text-ink hover:bg-surface-elevated'
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
                onClick={() =>
                  setCatalogFilter((prev) => (prev === 'wishlist' ? 'all' : 'wishlist'))
                }
                className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'wishlist'
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface text-accent border border-edge hover:bg-surface-elevated'
                }`}
              >
                <Icon name="bookmark" className="w-3.5 h-3.5" />
                <span>Wishlist</span>
                <span className="font-mono-tabular text-[11px] opacity-85">{wishlistCount}</span>
              </button>

              <button
                type="button"
                data-action="set-catalog-filter"
                data-filter="loved"
                aria-pressed={catalogFilter === 'loved' ? 'true' : 'false'}
                aria-label={`Loved, ${lovedCount} ${lovedCount === 1 ? 'book' : 'books'}`}
                onClick={() =>
                  setCatalogFilter((prev) => (prev === 'loved' ? 'all' : 'loved'))
                }
                className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'loved'
                    ? 'bg-loved text-loved-fg shadow-2xs'
                    : 'bg-surface text-danger border border-edge hover:bg-surface-elevated'
                }`}
              >
                <Icon
                  name={catalogFilter === 'loved' ? 'heartFilled' : 'heart'}
                  className="w-3.5 h-3.5"
                />
                <span>Loved</span>
                <span className="font-mono-tabular text-[11px] opacity-85">{lovedCount}</span>
              </button>

              {[
                { id: 'hardcover', label: 'Hardcover' },
                { id: 'board-book', label: 'Board Book' },
                { id: 'paperback', label: 'Paperback' },
              ].map((fmt) => {
                const active = selectedFormats.includes(fmt.id);
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    data-action="toggle-library-format"
                    data-format={fmt.id}
                    aria-pressed={active ? 'true' : 'false'}
                    onClick={() =>
                      setSelectedFormats((prev) =>
                        prev.includes(fmt.id)
                          ? prev.filter((f) => f !== fmt.id)
                          : [...prev, fmt.id]
                      )
                    }
                    className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-primary text-primary-fg shadow-2xs'
                        : 'bg-surface text-ink-secondary border border-edge hover:text-ink hover:bg-surface-elevated'
                    }`}
                  >
                    {fmt.label}
                  </button>
                );
              })}

              <div
                role="group"
                aria-label="Catalog layout"
                className="inline-flex items-center p-0.5 rounded-full bg-surface-subtle border border-edge shrink-0 ml-auto"
              >
                <button
                  type="button"
                  data-action="set-book-view-mode"
                  data-view-mode="grid"
                  aria-pressed={viewMode === 'grid'}
                  aria-label="Grid view"
                  title="Grid view"
                  onClick={() => store.updateSettings({ bookViewMode: 'grid' })}
                  className={`min-h-[30px] min-w-[30px] px-2 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${
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
                  className={`min-h-[30px] min-w-[30px] px-2 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer ${
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
                      className="group isolate min-w-0 rounded-xl bg-surface border border-edge hover:border-primary/45 p-2 sm:p-2.5 lr-card transition-all"
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
                              className="w-6 h-6 rounded-full bg-surface-elevated text-danger inline-flex items-center justify-center border border-edge"
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
                    className={`group isolate flex flex-col min-w-0 rounded-xl bg-surface border border-edge ${
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
                          className={`${COVER_BADGE_SLOTS.affection.positionClass} w-6 h-6 rounded-full bg-surface/95 text-danger flex items-center justify-center shadow-xs border border-edge`}
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

      {/* Mobile Floating Bottom-Right + Scan Button */}
      <button
        type="button"
        data-action="library-floating-scan"
        onClick={handleOpenQuickScanner}
        aria-label="Scan barcode to add book"
        title="Scan book"
        className="md:hidden fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] right-4 z-30 w-13 h-13 rounded-full bg-primary hover:bg-primary-hover text-primary-fg shadow-xl active:scale-95 flex items-center justify-center border border-primary-fg/20 transition-transform cursor-pointer"
      >
        <Icon name="plus" className="w-6 h-6" strokeWidth={2.2} />
      </button>

      {/* AI Collection Search Slide-Up Sheet */}
      <AiCollectionSearchSheet
        isOpen={isAiSearchOpen}
        onClose={() => setIsAiSearchOpen(false)}
        householdName={state.settings?.householdName}
      />

      {/* Multi-Select Readers Slide-Up Sheet */}
      <ReaderFilterSheet
        isOpen={isReaderSheetOpen}
        onClose={() => setIsReaderSheetOpen(false)}
        ownerChoices={ownerChoices}
        effectiveOwners={effectiveOwners}
        onToggleOwner={toggleOwnerFilter}
        onSelectAll={selectAllReaders}
        filteredCount={filteredBooks.length}
      />

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        {...sharedFilterProps}
        filteredCount={filteredBooks.length}
        activeFilterCount={activeFilterCount}
        onResetAll={resetAllFilters}
      />

      {/* Direct Barcode Scanner launched from Library Floating + */}
      <NativeBarcodeScannerModal
        isOpen={isQuickScannerOpen}
        initialMode="barcode"
        prewarmedStreamPromise={prewarmedStreamPromise}
        onDetectedIsbn={(isbn13) => {
          void handleQuickIsbnDetected(isbn13);
        }}
        onDetectedTitle={(titleQuery) => {
          void handleQuickTitleDetected(titleQuery);
        }}
        onClose={() => {
          setIsQuickScannerOpen(false);
          setPrewarmedStreamPromise(null);
        }}
      />

      {/* Found Book Sheet for saving scanned books directly from Library */}
      <FoundBookSheet
        candidate={foundCandidate}
        isOpen={Boolean(foundCandidate)}
        onAddOwned={(cand, opts) => handleAddQuickCandidate(cand, 'owned', opts)}
        onAddWishlist={(cand, opts) => handleAddQuickCandidate(cand, 'wishlist', opts)}
        onRescan={() => {
          setFoundCandidate(null);
          handleOpenQuickScanner();
        }}
        onEditManual={(cand) => {
          setFoundCandidate(null);
          navigate('scan', {
            tab: 'manual',
            title: cand.title,
            authors: cand.authors.join(', '),
            isbn: cand.isbn13 || cand.isbn10 || '',
          });
        }}
        onClose={() => setFoundCandidate(null)}
      />
    </div>
  );
};
