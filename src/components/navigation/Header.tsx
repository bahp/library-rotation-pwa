import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BrandEmblem, resolveBrandWordmark } from '../common/BrandEmblem.js';
import { BookCover } from '../common/BookCover.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { SearchResultsSkeleton } from '../common/SkeletonLoaders.js';
import { FoundBookSheet } from '../modals/FoundBookSheet.js';
import { NativeBarcodeScannerModal } from '../scan/NativeBarcodeScannerModal.js';
import { parseUnifiedCatalogQuery } from '../../features/scan/scan-shell-view.js';
import { acquireCameraStream } from '../../features/scan/camera-access.js';
import { AVATAR_TONES, resolveEffectiveThemeConfig } from '../../config/index.js';
import {
  formatBookBinding,
  formatCollectionStatus,
  formatProfileAgeLabel,
  normalizeIsbn,
} from '../../types/models.js';
import type { Book, BookCondition, ThemeMode } from '../../types/models.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';

function bookToCandidatePreview(book: Book): BookCandidate {
  const { id: _id, addedAt: _addedAt, ...rest } = book;
  return {
    ...rest,
    candidateKey: `local:${book.id}`,
    tags: book.tags || [],
    sources: book.sources || [],
  };
}

export const Header: React.FC = () => {
  const {
    state,
    store,
    catalogService,
    currentRoute,
    activeProfile,
    setIsProfileSwitcherOpen,
    setIsProfileFormOpen,
    setEditingProfileId,
    setIsNotificationCenterOpen,
    unreadNotificationCount,
    setIsSearchOpen,
    setInspectedBookId,
    openManualAddModal,
    globalSearchQuery,
    setGlobalSearchQuery,
    submitGlobalSearch,
    navigate,
    sidebarCollapsed,
    t,
  } = useApp();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const desktopSearchWrapperRef = useRef<HTMLDivElement>(null);
  const searchNonceRef = useRef(0);

  // Desktop live search & scanner states
  const [isDesktopDropdownOpen, setIsDesktopDropdownOpen] = useState(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [onlineCandidates, setOnlineCandidates] = useState<BookCandidate[]>([]);
  const [hasSearchedOnline, setHasSearchedOnline] = useState(false);
  const [lastOnlineProviderIds, setLastOnlineProviderIds] = useState<string[]>([]);

  const [desktopScannerOpen, setDesktopScannerOpen] = useState(false);
  const [desktopPrewarmedStream, setDesktopPrewarmedStream] =
    useState<Promise<MediaStream> | null>(null);
  const [desktopFoundCandidate, setDesktopFoundCandidate] = useState<BookCandidate | null>(null);

  // Keyboard "/" shortcut focuses global search on desktop when not typing in another field
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (searchInputRef.current && window.innerWidth >= 1024) {
        e.preventDefault();
        searchInputRef.current.focus();
        setIsDesktopDropdownOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close desktop search dropdown on outside click or Escape
  useEffect(() => {
    if (!isDesktopDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (desktopSearchWrapperRef.current?.contains(target)) return;
      setIsDesktopDropdownOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !desktopScannerOpen && !desktopFoundCandidate) {
        setIsDesktopDropdownOpen(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isDesktopDropdownOpen, desktopScannerOpen, desktopFoundCandidate]);

  const configuredProviders = useMemo(() => {
    const raw = state.settings?.enabledMetadataProviders;
    return Array.isArray(raw) && raw.length > 0 ? raw : ['google-books', 'open-library'];
  }, [state.settings?.enabledMetadataProviders]);

  const isOpenLibraryEnabled = configuredProviders.includes('open-library');
  const isGoogleBooksEnabled = configuredProviders.includes('google-books');

  const findLocalBookByIsbn = useCallback(
    (rawIsbn: string): Book | null => {
      const parsed = normalizeIsbn(rawIsbn);
      const cleanRaw = String(rawIsbn || '')
        .replace(/[^0-9Xx]/g, '')
        .toUpperCase();
      const target13 = parsed.valid ? parsed.isbn13 : '';
      const target10 = parsed.valid ? parsed.isbn10 : '';

      for (const b of state.books) {
        const b13 = b.isbn13 ? String(b.isbn13).replace(/[^0-9]/g, '') : '';
        const b10 = b.isbn10 ? String(b.isbn10).replace(/[^0-9Xx]/g, '').toUpperCase() : '';
        if (target13 && b13 && b13 === target13) return b;
        if (target10 && b10 && b10 === target10) return b;
        if (cleanRaw && (b13 === cleanRaw || b10 === cleanRaw)) return b;
      }
      return null;
    },
    [state.books]
  );

  const runOnlineSearch = useCallback(
    async (
      rawQuery: string,
      options?: { openFirstIsbnMatch?: boolean; providerIds?: string[] }
    ) => {
      const parsed = parseUnifiedCatalogQuery(rawQuery, '');
      const nonce = ++searchNonceRef.current;

      if (parsed.mode === 'empty') {
        setOnlineCandidates([]);
        setOnlineError('');
        setHasSearchedOnline(false);
        setIsSearchingOnline(false);
        setLastOnlineProviderIds([]);
        return;
      }

      if (parsed.mode === 'invalid-isbn') {
        setOnlineCandidates([]);
        setHasSearchedOnline(true);
        setOnlineError(parsed.error);
        setIsSearchingOnline(false);
        setLastOnlineProviderIds([]);
        return;
      }

      const targetProviderIds =
        Array.isArray(options?.providerIds) && options.providerIds.length > 0
          ? options.providerIds
          : configuredProviders;

      setIsSearchingOnline(true);
      setOnlineError('');
      setHasSearchedOnline(true);
      setLastOnlineProviderIds(targetProviderIds);

      try {
        if (parsed.mode === 'isbn') {
          const localMatch = findLocalBookByIsbn(parsed.isbn13);
          const res = await catalogService.lookupByIsbn(parsed.isbn13, {
            retainRaw: state.settings?.retainRawProviderPayloads,
            enabledProviderIds: targetProviderIds,
          });
          if (searchNonceRef.current !== nonce) return;

          if (res.candidate) {
            if (options?.openFirstIsbnMatch) {
              setDesktopFoundCandidate(res.candidate);
            } else {
              setOnlineCandidates([res.candidate]);
            }
          } else if (localMatch && options?.openFirstIsbnMatch) {
            setDesktopFoundCandidate(bookToCandidatePreview(localMatch));
          } else {
            setOnlineCandidates([]);
            setOnlineError(`No online catalog edition found for ISBN ${parsed.isbn13}.`);
          }
          return;
        }

        const res = await catalogService.searchBooks(
          { query: parsed.query },
          {
            retainRaw: state.settings?.retainRawProviderPayloads,
            enabledProviderIds: targetProviderIds,
            limit: 6,
          }
        );
        if (searchNonceRef.current !== nonce) return;

        setOnlineCandidates(res.candidates);
        if (res.candidates.length === 0) {
          setOnlineError('No matching books found online.');
        }
      } catch (err) {
        if (searchNonceRef.current !== nonce) return;
        setOnlineCandidates([]);
        setOnlineError(err instanceof Error ? err.message : String(err));
      } finally {
        if (searchNonceRef.current === nonce) {
          setIsSearchingOnline(false);
        }
      }
    },
    [
      catalogService,
      configuredProviders,
      findLocalBookByIsbn,
      state.settings?.retainRawProviderPayloads,
    ]
  );

  // Debounced live online search while typing on desktop:
  // Text queries (>= 3 chars) query ONLY Open Library automatically to save Google Books quota.
  useEffect(() => {
    if (!isDesktopDropdownOpen) return;
    const trimmed = globalSearchQuery.trim();
    if (!trimmed) {
      searchNonceRef.current += 1;
      setOnlineCandidates([]);
      setOnlineError('');
      setHasSearchedOnline(false);
      setIsSearchingOnline(false);
      setLastOnlineProviderIds([]);
      return;
    }

    const parsed = parseUnifiedCatalogQuery(trimmed, '');
    if (parsed.mode === 'search' && (trimmed.length < 3 || !isOpenLibraryEnabled)) {
      setHasSearchedOnline(false);
      setOnlineCandidates([]);
      setOnlineError('');
      setLastOnlineProviderIds([]);
      return;
    }

    const liveProviderIds =
      parsed.mode === 'isbn' ? configuredProviders : ['open-library'];

    const timer = window.setTimeout(() => {
      void runOnlineSearch(trimmed, { providerIds: liveProviderIds });
    }, 550);

    return () => window.clearTimeout(timer);
  }, [
    globalSearchQuery,
    isDesktopDropdownOpen,
    isOpenLibraryEnabled,
    configuredProviders,
    runOnlineSearch,
  ]);

  // Live matches inside the user's saved library
  const libraryMatches = useMemo(() => {
    const trimmed = globalSearchQuery.trim().toLowerCase();
    if (!trimmed) return [];
    const digitsOnly = trimmed.replace(/[^0-9x]/g, '');

    return state.books
      .filter((book) => {
        if (book.title.toLowerCase().includes(trimmed)) return true;
        if (book.authors.some((a) => a.toLowerCase().includes(trimmed))) return true;
        if (book.tags && book.tags.some((tag) => tag.toLowerCase().includes(trimmed))) return true;
        if (book.publisher && book.publisher.toLowerCase().includes(trimmed)) return true;
        if (digitsOnly.length >= 4) {
          if (book.isbn13 && book.isbn13.toLowerCase().includes(digitsOnly)) return true;
          if (book.isbn10 && book.isbn10.toLowerCase().includes(digitsOnly)) return true;
        }
        return false;
      })
      .slice(0, 5);
  }, [globalSearchQuery, state.books]);

  const handleOpenDesktopScanner = () => {
    setIsDesktopDropdownOpen(false);
    setDesktopPrewarmedStream(acquireCameraStream('environment'));
    setDesktopScannerOpen(true);
  };

  const handleDesktopIsbnDetected = async (isbn13: string) => {
    setDesktopScannerOpen(false);
    setDesktopPrewarmedStream(null);
    setGlobalSearchQuery(isbn13);
    setIsDesktopDropdownOpen(true);

    const localMatch = findLocalBookByIsbn(isbn13);
    try {
      setIsSearchingOnline(true);
      const res = await catalogService.lookupByIsbn(isbn13, {
        retainRaw: state.settings?.retainRawProviderPayloads,
        enabledProviderIds: configuredProviders,
      });
      if (res.candidate) {
        setDesktopFoundCandidate(res.candidate);
        setOnlineCandidates([res.candidate]);
        setHasSearchedOnline(true);
        return;
      }
      if (localMatch) {
        setDesktopFoundCandidate(bookToCandidatePreview(localMatch));
        return;
      }
      setOnlineError(`No online catalog edition found for ISBN ${isbn13}.`);
      setHasSearchedOnline(true);
    } catch (err) {
      if (localMatch) {
        setDesktopFoundCandidate(bookToCandidatePreview(localMatch));
      } else {
        setOnlineError(err instanceof Error ? err.message : String(err));
        setHasSearchedOnline(true);
      }
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleDesktopTitleDetected = (titleQuery: string) => {
    setDesktopScannerOpen(false);
    setDesktopPrewarmedStream(null);
    setGlobalSearchQuery(titleQuery);
    setIsDesktopDropdownOpen(true);
    void runOnlineSearch(titleQuery, { providerIds: configuredProviders });
  };

  const handleDesktopAddCandidate = async (
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
      setDesktopFoundCandidate(null);
      store.notify(
        `Added "${candidate.title}" to ${status === 'owned' ? 'Library' : 'Wishlist'}`,
        'success'
      );
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const avatarTone = activeProfile?.avatarTone || 'teal';
  const toneClass = AVATAR_TONES[avatarTone] || AVATAR_TONES.teal;
  const initial = activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : 'R';
  const ageLabel = activeProfile ? formatProfileAgeLabel(activeProfile) : '';

  const navItems = [
    { id: 'home', label: t('nav.shelf') },
    { id: 'library', label: t('nav.library') },
    { id: 'librarian', label: t('nav.librarian') },
    { id: 'rotations', label: t('nav.rotations') },
    { id: 'play', label: t('nav.play') },
  ];

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = resolveEffectiveThemeConfig(
    state.settings?.theme,
    state.settings?.themePreset,
    prefersDark
  );
  const isCurrentlyDark = effectiveTheme.mode === 'dark';
  const nextTheme: ThemeMode = isCurrentlyDark ? 'light' : 'dark';

  const handleToggleTheme = async () => {
    await store.updateSettings({ theme: nextTheme });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = globalSearchQuery.trim();
    if (!trimmed) {
      if (currentRoute === 'library') {
        submitGlobalSearch('');
      }
      return;
    }
    setIsDesktopDropdownOpen(true);
    void runOnlineSearch(trimmed, { providerIds: configuredProviders });
  };

  const handleSearchChange = (val: string) => {
    setGlobalSearchQuery(val);
    if (val.trim()) {
      setIsDesktopDropdownOpen(true);
    }
  };

  const translucentTopBar =
    state.settings?.translucentTopBar ?? (state.settings?.nativeAppStyle !== false);
  const wordmark = resolveBrandWordmark(effectiveTheme.id);
  const subtitle = state.settings?.householdName?.trim() || 'READ · EXPLORE · GROW';
  const trimmedDesktopQuery = globalSearchQuery.trim();
  const showDesktopPopover = isDesktopDropdownOpen && trimmedDesktopQuery.length > 0;

  return (
    <>
      <header
        data-top-header="true"
        data-translucent-top={translucentTopBar ? 'true' : 'false'}
        style={
          translucentTopBar
            ? { backgroundColor: 'color-mix(in srgb, var(--surface) 78%, transparent)' }
            : undefined
        }
        className={`fixed top-0 left-0 right-0 ${
          sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-64'
        } z-30 ${
          translucentTopBar
            ? 'backdrop-blur-xl border-b border-edge/60 shadow-nav-top'
            : 'bg-surface border-b border-edge-subtle'
        } pt-safe px-safe transition-[left,background-color,border-color] duration-200 ease-out`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
          {/* Zone 1 (Mobile/Tablet): Bunko / Theme Emblem + Wordmark + Tagline or Household */}
          <a
            href="#/home"
            className="flex lg:hidden items-center gap-2.5 text-ink focus-visible:outline-2 focus-visible:outline-primary rounded-xl whitespace-nowrap shrink-0 min-w-0"
          >
            <BrandEmblem presetId={effectiveTheme.id} size="md" />
            <span className="flex flex-col min-w-0">
              <span
                style={{
                  textTransform: 'var(--brand-wordmark-transform)' as React.CSSProperties['textTransform'],
                  letterSpacing: 'var(--brand-wordmark-tracking)',
                  color: 'var(--brand-wordmark-color)',
                  fontWeight: 'var(--brand-wordmark-weight)',
                }}
                className="font-display text-[22px] sm:text-[24px] leading-none whitespace-nowrap"
              >
                {wordmark}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-secondary leading-tight truncate max-w-[170px] mt-0.5">
                {subtitle}
              </span>
            </span>
          </a>

          {/* Zone 1 (Desktop lg+): Global Live Search Bar + QR Scanner + Manual Add */}
          <div
            ref={desktopSearchWrapperRef}
            className="hidden lg:flex items-center gap-1.5 flex-1 max-w-xl relative"
          >
            <form
              onSubmit={handleSearchSubmit}
              role="search"
              aria-label="Global library and catalog search"
              className="flex items-center flex-1 relative"
            >
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted">
                <Icon name="search" className="w-4 h-4" />
              </span>
              <input
                ref={searchInputRef}
                type="search"
                value={globalSearchQuery}
                onFocus={() => setIsDesktopDropdownOpen(true)}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search library or Open Library by title, author, ISBN…"
                aria-label="Search library or Open Library by title, author, or ISBN"
                className="w-full h-10 pl-10 pr-10 rounded-lg bg-surface-subtle border border-edge text-[13px] text-ink placeholder:text-ink-muted focus:bg-surface focus:outline-none focus:border-primary transition-all"
              />
              {globalSearchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setGlobalSearchQuery('');
                    setOnlineCandidates([]);
                    setOnlineError('');
                    setHasSearchedOnline(false);
                    if (currentRoute === 'library') {
                      navigate('library');
                    }
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2.5 p-1 rounded text-ink-muted hover:text-ink cursor-pointer"
                >
                  <Icon name="close" className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="hidden xl:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-ink-muted bg-surface border border-edge rounded absolute right-2.5"
                >
                  /
                </kbd>
              )}
            </form>

            {/* Scan Barcode / QR Code Icon Button */}
            <button
              type="button"
              data-action="desktop-scan-qrcode"
              onClick={handleOpenDesktopScanner}
              aria-label="Scan barcode or QR code"
              title="Scan barcode or QR code"
              className="h-10 w-10 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary hover:text-primary flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Icon name="qrcode" className="w-4 h-4" />
            </button>

            {/* Manual Book Entry (Pencil) Icon Button */}
            <button
              type="button"
              data-action="desktop-manual-add-book"
              onClick={() => {
                setIsDesktopDropdownOpen(false);
                openManualAddModal(trimmedDesktopQuery ? { title: trimmedDesktopQuery } : undefined);
              }}
              aria-label="Add book details manually"
              title="Add book details manually"
              className="h-10 w-10 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary hover:text-primary flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Icon name="edit" className="w-4 h-4" />
            </button>

            {/* Live Desktop Dropdown (Library + Open Library) */}
            {showDesktopPopover && (
              <div
                data-desktop-search-dropdown="true"
                className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-2xl bg-surface/95 backdrop-blur-xl border border-edge shadow-2xl overflow-hidden flex flex-col max-h-[75vh]"
              >
                <div className="overflow-y-auto p-4 space-y-5 text-left">
                  {/* Matches in Saved Library */}
                  <section aria-label="Matches in your library" className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                        In Your Library ({libraryMatches.length})
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDesktopDropdownOpen(false);
                          submitGlobalSearch(trimmedDesktopQuery);
                        }}
                        className="text-xs font-semibold text-primary hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Filter in Library
                      </button>
                    </div>

                    {libraryMatches.length > 0 ? (
                      <div className="rounded-xl border border-edge bg-surface-subtle/60 divide-y divide-edge-subtle overflow-hidden">
                        {libraryMatches.map((book) => (
                          <button
                            key={book.id}
                            type="button"
                            onClick={() => {
                              setIsDesktopDropdownOpen(false);
                              setInspectedBookId(book.id);
                            }}
                            className="w-full p-2.5 hover:bg-surface-elevated flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <BookCover
                                book={book}
                                size="xs"
                                aspectRatio={state.settings?.coverAspectRatio || 'square'}
                              />
                              <div className="min-w-0">
                                <p className="font-display text-sm font-semibold text-ink truncate">
                                  {book.title}
                                </p>
                                <p className="text-xs text-ink-secondary truncate mt-0.5">
                                  {book.authors.join(', ')}
                                </p>
                                <p className="text-[11px] text-ink-muted mt-0.5">
                                  {formatCollectionStatus(book.collectionStatus)}
                                  {book.publishedYear ? ` · ${book.publishedYear}` : ''}
                                </p>
                              </div>
                            </div>
                            <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-secondary px-1">
                        No books matching “{trimmedDesktopQuery}” in your saved library.
                      </p>
                    )}
                  </section>

                  {/* Live Online Catalog Results */}
                  <section aria-label="Online catalog results" className="space-y-2.5 pt-2 border-t border-edge-subtle">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                          Online Catalog
                        </h2>
                        {hasSearchedOnline &&
                          !isSearchingOnline &&
                          isGoogleBooksEnabled &&
                          !lastOnlineProviderIds.includes('google-books') && (
                            <span className="text-[10px] font-medium text-ink-muted truncate">
                              · Open Library live
                            </span>
                          )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void runOnlineSearch(trimmedDesktopQuery, {
                            providerIds: configuredProviders,
                          })
                        }
                        disabled={isSearchingOnline}
                        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        {isSearchingOnline
                          ? 'Searching…'
                          : isGoogleBooksEnabled &&
                              hasSearchedOnline &&
                              !lastOnlineProviderIds.includes('google-books')
                            ? 'Include Google Books'
                            : 'Search online'}
                      </button>
                    </div>

                    {isSearchingOnline ? (
                      <div className="rounded-xl border border-edge bg-surface-subtle/40 p-3">
                        <SearchResultsSkeleton rows={3} />
                      </div>
                    ) : onlineCandidates.length > 0 ? (
                      <div className="rounded-xl border border-edge bg-surface-subtle/60 divide-y divide-edge-subtle px-3">
                        {onlineCandidates.map((cand, idx) => {
                          const pseudoBook = {
                            ...cand,
                            id: `desktop_search_cand_${idx}`,
                            addedAt: '',
                          };
                          return (
                            <article
                              key={`${cand.isbn13 || cand.title}-${idx}`}
                              className="py-2.5 flex items-center justify-between gap-3"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDesktopDropdownOpen(false);
                                  setDesktopFoundCandidate(cand);
                                }}
                                className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer"
                              >
                                <BookCover
                                  book={pseudoBook as unknown as Book}
                                  size="xs"
                                  aspectRatio={state.settings?.coverAspectRatio || 'square'}
                                />
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-display font-semibold text-sm text-ink leading-snug line-clamp-1">
                                    {cand.title}
                                  </h3>
                                  <p className="text-xs text-ink-secondary truncate mt-0.5">
                                    {cand.authors.join(', ')}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-muted mt-0.5">
                                    <span>Ages {cand.ageMin}–{cand.ageMax}</span>
                                    <span>·</span>
                                    <span>{formatBookBinding(cand.format)}</span>
                                    {cand.publishedYear && (
                                      <>
                                        <span>·</span>
                                        <span className="font-mono-tabular">{cand.publishedYear}</span>
                                      </>
                                    )}
                                  </div>
                                  {cand.sources && cand.sources.length > 0 && (
                                    <div className="mt-1">
                                      <ProviderAttribution sources={cand.sources} />
                                    </div>
                                  )}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDesktopDropdownOpen(false);
                                  setDesktopFoundCandidate(cand);
                                }}
                                className="min-h-[34px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shrink-0 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Add
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    ) : hasSearchedOnline && onlineError ? (
                      <div className="rounded-xl border border-edge bg-surface-subtle/50 p-3 space-y-2">
                        <p className="text-xs text-ink-secondary">{onlineError}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDesktopDropdownOpen(false);
                            openManualAddModal({ title: trimmedDesktopQuery });
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Icon name="edit" className="w-3.5 h-3.5" />
                          <span>Type details manually</span>
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-edge bg-surface-subtle/40 p-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-ink-secondary">
                          {isOpenLibraryEnabled
                            ? 'Live typing queries Open Library to save Google Books quota. Press Enter for both.'
                            : 'Press Enter to search your enabled online book providers.'}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            void runOnlineSearch(trimmedDesktopQuery, {
                              providerIds: configuredProviders,
                            })
                          }
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-primary text-primary-fg text-xs font-semibold shrink-0 cursor-pointer whitespace-nowrap"
                        >
                          Search
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>

          {/* Zone 2 (Tablet md only): Compact Primary Nav Links */}
          <nav
            aria-label="Tablet primary"
            className="hidden md:flex lg:hidden items-center gap-4"
          >
            {navItems.map((item) => {
              const isActive =
                item.id === currentRoute ||
                (item.id === 'rotations' && currentRoute === 'presets');

              return (
                <a
                  key={item.id}
                  href={`#/${item.id}`}
                  className={`py-1.5 text-sm transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-primary font-semibold underline underline-offset-8 decoration-2 decoration-primary'
                      : 'font-medium text-ink-secondary hover:text-ink'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: Mobile (Search, Notifications, Clean Avatar) & Desktop Utilities */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={`Theme: ${effectiveTheme.label}. Switch to ${nextTheme} mode`}
              title={`Switch to ${nextTheme} mode (currently ${effectiveTheme.label})`}
              className="hidden lg:flex min-h-[38px] min-w-[38px] rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-ink-secondary hover:text-ink items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Icon name={isCurrentlyDark ? 'moon' : 'sun'} className="w-4 h-4" />
            </button>

            {/* Mobile & Tablet Search Trigger -> Opens Search & Add Window */}
            <button
              type="button"
              data-action="open-search-window"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search and add books"
              title="Search and add books"
              className="lg:hidden min-h-[44px] min-w-[44px] rounded-full text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <Icon name="search" className="w-5 h-5" strokeWidth={1.9} />
            </button>

            {/* Mobile & Tablet Notifications Trigger */}
            <button
              type="button"
              data-action="open-notifications"
              onClick={() => setIsNotificationCenterOpen(true)}
              aria-label={
                unreadNotificationCount > 0
                  ? `Notifications (${unreadNotificationCount} unread)`
                  : 'Notifications'
              }
              className="lg:hidden relative min-h-[44px] min-w-[44px] rounded-full text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <Icon name="bell" className="w-5 h-5" strokeWidth={1.9} />
              {unreadNotificationCount > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-fg text-[9px] font-bold font-mono-tabular flex items-center justify-center ring-2 ring-surface"
                >
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </span>
              )}
            </button>

            {/* Mobile & Tablet Clean User Avatar */}
            {activeProfile ? (
              <button
                type="button"
                data-action="open-profile-switcher"
                onClick={() => setIsProfileSwitcherOpen(true)}
                aria-label={`Reader profile and settings, current reader is ${activeProfile.name}`}
                className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full active:scale-95 transition-transform cursor-pointer shrink-0"
              >
                <span
                  className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-semibold ring-1 ring-inset ring-ink/10 ${toneClass}`}
                >
                  {initial}
                </span>
              </button>
            ) : (
              <button
                type="button"
                data-action="open-profile-switcher"
                onClick={() => setIsProfileSwitcherOpen(true)}
                aria-label="Reader profiles and settings"
                className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full active:scale-95 transition-transform cursor-pointer shrink-0"
              >
                <span className="w-[26px] h-[26px] rounded-full bg-surface-elevated text-ink-secondary ring-1 ring-inset ring-ink/10 flex items-center justify-center">
                  <Icon name="profiles" className="w-3.5 h-3.5" />
                </span>
              </button>
            )}

            {/* Desktop Profile Switcher */}
            {activeProfile ? (
              <button
                type="button"
                onClick={() => setIsProfileSwitcherOpen(true)}
                aria-label={`Switch reader profile, current reader is ${activeProfile.name}`}
                className="hidden lg:flex min-h-[38px] max-w-[230px] items-center gap-2 pl-1.5 pr-2.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated active:scale-[0.98] border border-edge transition-all cursor-pointer shrink-0 overflow-hidden"
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${toneClass}`}
                >
                  {initial}
                </span>
                <span className="flex items-baseline gap-1 min-w-0 text-left">
                  <span className="text-xs font-semibold text-ink leading-tight truncate max-w-[100px]">
                    {activeProfile.name}
                  </span>
                  {ageLabel && (
                    <span className="hidden xl:inline text-[10px] font-medium text-ink-muted leading-tight shrink-0 whitespace-nowrap">
                      {ageLabel}
                    </span>
                  )}
                </span>
                <Icon name="chevronDown" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingProfileId(null);
                  setIsProfileFormOpen(true);
                }}
                className="hidden lg:flex min-h-[38px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated active:scale-[0.98] border border-edge text-xs font-semibold text-ink items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                <span>{t('profiles.newReader')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Barcode / QR Scanner launched from Header QR icon */}
      <NativeBarcodeScannerModal
        isOpen={desktopScannerOpen}
        initialMode="barcode"
        prewarmedStreamPromise={desktopPrewarmedStream}
        onDetectedIsbn={(isbn13) => {
          void handleDesktopIsbnDetected(isbn13);
        }}
        onDetectedTitle={handleDesktopTitleDetected}
        onClose={() => {
          setDesktopScannerOpen(false);
          setDesktopPrewarmedStream(null);
        }}
      />

      {/* Found Book Sheet for Desktop Live Search & Barcode Scanner */}
      <FoundBookSheet
        candidate={desktopFoundCandidate}
        isOpen={Boolean(desktopFoundCandidate)}
        onAddOwned={(cand, opts) => handleDesktopAddCandidate(cand, 'owned', opts)}
        onAddWishlist={(cand, opts) => handleDesktopAddCandidate(cand, 'wishlist', opts)}
        onRescan={() => {
          setDesktopFoundCandidate(null);
          handleOpenDesktopScanner();
        }}
        onEditManual={(cand) => {
          setDesktopFoundCandidate(null);
          openManualAddModal({
            title: cand.title,
            authors: cand.authors.join(', '),
            isbn: cand.isbn13 || cand.isbn10 || '',
          });
        }}
        onClose={() => setDesktopFoundCandidate(null)}
      />
    </>
  );
};
