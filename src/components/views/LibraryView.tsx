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
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverList,
} from '../common/BookCoverCard.js';
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
  AVATAR_TONES,
  resolveBookCardDisplayConfig,
} from '../../config/index.js';
import { computeBookUsageSummary } from '../../features/rotations/usage-insights.js';
import { isBookDiscardedForProfile } from '../../features/tagging/discovery-engine.js';

export const LibraryView: React.FC = () => {
  const {
    state,
    store,
    catalogService,
    activeProfile,
    routeParams,
    globalSearchQuery,
    setGlobalSearchQuery,
    setInspectedBookId,
    setIsSearchOpen,
    openManualAddModal,
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
  const [showDiscardedSuggestions, setShowDiscardedSuggestions] = useState(false);

  React.useEffect(() => {
    setSearchQuery(globalSearchQuery);
  }, [globalSearchQuery]);

  const handleSearchChange = (next: string) => {
    setSearchQuery(next);
    setGlobalSearchQuery(next);
  };

  const libraryCardConfig = resolveBookCardDisplayConfig(state.settings, 'library');
  const viewMode = state.settings?.bookViewMode || 'grid';
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

  const suggestionsCount = useMemo(
    () =>
      state.books.filter(
        (b) =>
          normalizeCollectionStatus(b.collectionStatus) === 'interested' &&
          !isBookDiscardedForProfile(b, activeProfile?.id)
      ).length,
    [state.books, activeProfile?.id]
  );

  const discardedSuggestionsCount = useMemo(
    () =>
      state.books.filter(
        (b) =>
          normalizeCollectionStatus(b.collectionStatus) === 'interested' &&
          isBookDiscardedForProfile(b, activeProfile?.id)
      ).length,
    [state.books, activeProfile?.id]
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

      const isDiscarded = isBookDiscardedForProfile(book, activeProfile?.id);

      switch (catalogFilter) {
        case 'owned':
          if (status !== 'owned' || isDiscarded) return false;
          break;
        case 'wishlist':
          if (status !== 'wishlist' || isDiscarded) return false;
          break;
        case 'interested':
          if (status !== 'interested') return false;
          if (!showDiscardedSuggestions && isDiscarded) return false;
          break;
        case 'loved':
          if (!book.loved || isDiscarded) return false;
          break;
        case 'hardcover':
        case 'board-book':
        case 'paperback':
          if (book.format !== catalogFilter || status === 'interested' || isDiscarded) return false;
          break;
        case 'needs-care':
          if (condition === 'good' || status === 'interested' || isDiscarded) return false;
          break;
        case 'all':
        default:
          if (status === 'interested' || isDiscarded) return false;
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
    showDiscardedSuggestions,
    activeProfile?.id,
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
      openManualAddModal({ isbn: isbn13 });
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
      if (res.candidates.length > 0) {
        void store.saveQueriedBookSuggestions(res.candidates, {
          query: titleQuery,
          shelfKey: 'quick-scan-search',
        });
      }
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
    status: 'owned' | 'wishlist' | 'interested',
    opts?: {
      condition?: BookCondition;
      owners?: string[];
      loved?: boolean;
      dominantColor?: string;
      dominantColorSwatches?: string[];
      dominantColorMode?: 'prominent' | 'dominant' | 'soft';
    }
  ) => {
    try {
      await store.addBookFromCandidate(candidate, {
        collectionStatus: status,
        condition: opts?.condition || 'good',
        owners: opts?.owners || (activeProfile ? [activeProfile.id, 'shared'] : ['shared']),
        loved: opts?.loved || false,
        dominantColor: opts?.dominantColor,
        dominantColorSwatches: opts?.dominantColorSwatches,
        dominantColorMode: opts?.dominantColorMode,
      });
      setFoundCandidate(null);
      store.notify(
        `Added "${candidate.title}" to ${
          status === 'owned'
            ? 'Library'
            : status === 'wishlist'
              ? 'Wishlist'
              : 'Suggestions'
        }`,
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
    <div className="flex-1 min-h-0 flex flex-col text-left min-w-0">
      {/* Desktop 2-Column Layout: Persistent Collapsible Filter Sidebar + Fixed Search & Scrollable Books */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row lg:gap-6 min-w-0">
        {isDesktopSidebarOpen && (
          <aside
            aria-label="Library filters sidebar"
            className="hidden lg:flex lg:flex-col lg:w-72 shrink-0 rounded-[var(--radius-card)] bg-surface border border-edge lr-card p-4 lg:mt-4 lg:mb-6 overflow-hidden"
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

            <div className="overflow-y-auto overscroll-y-contain pr-1 flex-1 min-h-0">
              <LibraryFilterControls {...sharedFilterProps} />
            </div>
          </aside>
        )}

        {/* Right Main Catalog Workspace */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Fixed Search + Pills + Active Tags Bar */}
          <div
            data-library-floating-controls="true"
            style={{ backgroundColor: 'var(--background)' }}
            className="shrink-0 z-20 -mx-4 sm:-mx-6 lg:mx-0 px-4 sm:px-6 lg:px-0 pt-3 sm:pt-3.5 lg:pt-4 pb-2.5 bg-canvas border-b border-edge-subtle space-y-2.5"
          >
            <ClearableInput
              id="catalog-search-input"
              value={searchQuery}
              onValueChange={handleSearchChange}
              leadingIcon={<Icon name="search" className="w-4 h-4" />}
              placeholder="Search your collection"
              aria-label="Search your collection"
              trailingWidth="double"
              className="h-11 rounded-xl bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted shadow-2xs transition-[border-color,box-shadow] focus:outline-none focus-visible:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 dark:focus:border-[var(--highlight)] dark:focus:ring-[var(--highlight)]/25"
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
                <Icon name="wishlist" className="w-3.5 h-3.5" />
                <span>Wishlist</span>
                <span className="font-mono-tabular text-[11px] opacity-85">{wishlistCount}</span>
              </button>

              <button
                type="button"
                data-action="set-catalog-filter"
                data-filter="interested"
                aria-pressed={catalogFilter === 'interested' ? 'true' : 'false'}
                aria-label={`Suggestions, ${suggestionsCount} ${suggestionsCount === 1 ? 'book' : 'books'}`}
                onClick={() =>
                  setCatalogFilter((prev) => (prev === 'interested' ? 'all' : 'interested'))
                }
                className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  catalogFilter === 'interested'
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface text-ink-secondary border border-edge hover:text-ink hover:bg-surface-elevated'
                }`}
              >
                <Icon name="bookmark" className="w-3.5 h-3.5" />
                <span>Suggestions</span>
                <span className="font-mono-tabular text-[11px] opacity-85">{suggestionsCount}</span>
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

          {/* Independent Scrollable Books Section (overscroll/bounce stays inside here only) */}
          <div
            data-library-books-scroll="true"
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain -mx-4 sm:-mx-6 lg:-mx-3 px-4 sm:px-6 lg:px-3 pt-3.5 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-8"
          >
            {catalogFilter === 'interested' && (
              <div className="mb-3 rounded-xl bg-surface-subtle border border-edge px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-ink-secondary">
                  Queried books from Home discovery &amp; catalog searches live here outside your Owned shelves.
                </span>
                {discardedSuggestionsCount > 0 && (
                  <button
                    type="button"
                    data-action="toggle-show-discarded-suggestions"
                    aria-pressed={showDiscardedSuggestions}
                    onClick={() => setShowDiscardedSuggestions((prev) => !prev)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      showDiscardedSuggestions
                        ? 'bg-primary text-primary-fg border-primary'
                        : 'bg-surface hover:bg-surface-elevated border-edge text-ink'
                    }`}
                  >
                    {showDiscardedSuggestions
                      ? `Hide discarded (${discardedSuggestionsCount})`
                      : `Show discarded (${discardedSuggestionsCount})`}
                  </button>
                )}
              </div>
            )}

            {filteredBooks.length > 0 ? (
              viewMode === 'list' ? (
                <BookCoverList className="relative z-0">
                  {filteredBooks.map((book) => {
                    const isSuggestion =
                      normalizeCollectionStatus(book.collectionStatus) === 'interested';
                    const isDiscarded = isBookDiscardedForProfile(book, activeProfile?.id);
                    return (
                      <BookCoverCard
                        key={book.id}
                        book={book}
                        activeProfile={activeProfile}
                        profiles={state.profiles}
                        layout="list"
                        size={libraryCardConfig.size}
                        customWidth={libraryCardConfig.customWidth}
                        aspectRatio={libraryCardConfig.aspectRatio}
                        infoPlacement={libraryCardConfig.infoPlacement}
                        cardFrame={libraryCardConfig.cardFrame}
                        showCoverOverlays={libraryCardConfig.showCoverOverlays}
                        showUsageAdorno={showCoverUsageAdornos}
                        showRotationHistory={showRotationHistory}
                        fields={libraryCardConfig.fields}
                        usage={usageByBookId.get(book.id)}
                        hideBookCoverInternalBadges
                        onInspect={(b) => setInspectedBookId(b.id)}
                        listTrailingAction={
                          isDiscarded ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void store.restoreDiscardedBook(book.id, activeProfile?.id);
                              }}
                              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-primary hover:text-primary-fg border border-edge text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Restore
                            </button>
                          ) : isSuggestion ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void store.updateBook(book.id, { collectionStatus: 'owned' });
                                }}
                                aria-label={`Move ${book.title} to Library`}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary text-primary-fg text-xs font-semibold cursor-pointer"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void store.discardSuggestedBook(book, activeProfile?.id);
                                }}
                                aria-label={`Hide ${book.title}`}
                                className="min-h-[36px] min-w-[36px] rounded-lg bg-surface-subtle hover:bg-danger-solid hover:text-danger-solid-fg border border-edge text-ink-secondary flex items-center justify-center cursor-pointer"
                              >
                                <Icon name="eyeOff" className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </BookCoverList>
              ) : (
                <BookCoverGrid
                  size={libraryCardConfig.size}
                  customWidth={libraryCardConfig.customWidth}
                  infoPlacement={libraryCardConfig.infoPlacement}
                  className="relative z-0"
                >
                  {filteredBooks.map((book) => {
                    const isSuggestion =
                      normalizeCollectionStatus(book.collectionStatus) === 'interested';
                    const isDiscarded = isBookDiscardedForProfile(book, activeProfile?.id);
                    const topRightAction = isDiscarded ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.restoreDiscardedBook(book.id, activeProfile?.id);
                        }}
                        aria-label={`Restore ${book.title} to Suggestions`}
                        title="Restore suggestion"
                        className="absolute top-1.5 right-1.5 z-30 min-h-[28px] px-2 py-0.5 rounded-md bg-surface/95 hover:bg-primary hover:text-primary-fg border border-edge text-[10px] font-semibold text-ink shadow-xs transition-colors cursor-pointer"
                      >
                        Restore
                      </button>
                    ) : isSuggestion ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void store.discardSuggestedBook(book, activeProfile?.id);
                        }}
                        aria-label={`Hide ${book.title} from suggestions`}
                        title="Not interested"
                        className="absolute top-0.5 right-0.5 z-30 min-h-[36px] min-w-[36px] flex items-start justify-end p-1.5 cursor-pointer"
                      >
                        <span className="w-7 h-7 rounded-full bg-surface/90 hover:bg-danger-solid hover:text-danger-solid-fg border border-edge text-ink-secondary shadow-xs flex items-center justify-center transition-colors">
                          <Icon name="eyeOff" className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ) : undefined;
                    const bottomRightAction =
                      isSuggestion && !isDiscarded ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void store.updateBook(book.id, { collectionStatus: 'owned' });
                          }}
                          aria-label={`Add ${book.title} to Library`}
                          title="Add to Library"
                          className="absolute -bottom-1 -right-1 z-20 min-h-[40px] min-w-[40px] flex items-end justify-end p-2 cursor-pointer"
                        >
                          <span className="w-7 h-7 rounded-full bg-surface/95 hover:bg-primary hover:text-primary-fg border border-edge text-ink shadow-xs flex items-center justify-center transition-colors">
                            <Icon name="plus" className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      ) : undefined;
                    return (
                      <BookCoverCard
                        key={book.id}
                        book={book}
                        activeProfile={activeProfile}
                        profiles={state.profiles}
                        layout="grid"
                        size={libraryCardConfig.size}
                        customWidth={libraryCardConfig.customWidth}
                        aspectRatio={libraryCardConfig.aspectRatio}
                        infoPlacement={libraryCardConfig.infoPlacement}
                        cardFrame={libraryCardConfig.cardFrame}
                        showCoverOverlays={libraryCardConfig.showCoverOverlays}
                        showUsageAdorno={showCoverUsageAdornos}
                        showRotationHistory={showRotationHistory}
                        fields={libraryCardConfig.fields}
                        usage={usageByBookId.get(book.id)}
                        hideBookCoverInternalBadges
                        onInspect={(b) => setInspectedBookId(b.id)}
                        topRightCoverAction={topRightAction}
                        bottomRightCoverAction={bottomRightAction}
                      />
                    );
                  })}
                </BookCoverGrid>
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
                      onClick={() => setIsSearchOpen(true)}
                      className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Add or Scan Books
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
        onAddInterested={(cand, opts) => handleAddQuickCandidate(cand, 'interested', opts)}
        onRescan={() => {
          setFoundCandidate(null);
          handleOpenQuickScanner();
        }}
        onEditManual={(cand) => {
          setFoundCandidate(null);
          openManualAddModal({
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
