import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { BookCover } from '../common/BookCover.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { SearchResultsSkeleton } from '../common/SkeletonLoaders.js';
import { FoundBookSheet } from './FoundBookSheet.js';
import { NativeBarcodeScannerModal } from '../scan/NativeBarcodeScannerModal.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { parseUnifiedCatalogQuery } from '../../features/scan/scan-shell-view.js';
import { acquireCameraStream } from '../../features/scan/camera-access.js';
import { createBarcodeDecoder } from '../../features/scan/barcode-decoder.js';
import {
  computeModeCropBox,
  loadUploadedImage,
  renderCroppedCanvas,
} from '../../features/scan/frame-processor.js';
import { createOcrEngine } from '../../features/scan/ocr-engine.js';
import { formatBookBinding, formatCollectionStatus, normalizeIsbn } from '../../types/models.js';
import type { Book, BookCondition, ScanMode } from '../../types/models.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';

const RECENT_SEARCHES_KEY = 'bunko_recent_searches_v1';
const MAX_RECENT_SEARCHES = 6;

const POPULAR_CATEGORIES = [
  { id: 'bedtime', label: 'Bedtime', query: 'bedtime', icon: 'moon' },
  { id: 'animals', label: 'Animals', query: 'animals', icon: 'paw' },
  { id: 'space-dinos', label: 'Space & Dinosaurs', query: 'dinosaurs', icon: 'rocket' },
  { id: 'vehicles', label: 'Vehicles', query: 'trucks', icon: 'truck' },
  { id: 'nature', label: 'Nature & Seasons', query: 'nature', icon: 'leaf' },
  { id: 'picture-books', label: 'Picture Books', query: 'picture book', icon: 'bookOpen' },
  { id: 'humor', label: 'Humor & Silly', query: 'funny', icon: 'smile' },
  { id: 'board-books', label: 'Board Books', query: 'board book', icon: 'layers' },
] as const;

function loadRecentSearches(): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function saveRecentSearches(items: string[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        RECENT_SEARCHES_KEY,
        JSON.stringify(items.slice(0, MAX_RECENT_SEARCHES))
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

function bookToCandidatePreview(book: Book): BookCandidate {
  const { id: _id, addedAt: _addedAt, ...rest } = book;
  return {
    ...rest,
    candidateKey: `local:${book.id}`,
    tags: book.tags || [],
    sources: book.sources || [],
  };
}

export const SearchModal: React.FC = () => {
  const {
    state,
    store,
    catalogService,
    activeProfile,
    isSearchOpen,
    setIsSearchOpen,
    setInspectedBookId,
    submitGlobalSearch,
    navigate,
  } = useApp();

  useBodyScrollLock(isSearchOpen);

  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [onlineCandidates, setOnlineCandidates] = useState<BookCandidate[]>([]);
  const [hasSearchedOnline, setHasSearchedOnline] = useState(false);

  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoStatusText, setPhotoStatusText] = useState('');
  const [photoError, setPhotoError] = useState('');

  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [scannerInitialMode, setScannerInitialMode] = useState<ScanMode>('barcode');
  const [prewarmedStreamPromise, setPrewarmedStreamPromise] =
    useState<Promise<MediaStream> | null>(null);
  const [foundCandidate, setFoundCandidate] = useState<BookCandidate | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const decoderRef = useRef<ReturnType<typeof createBarcodeDecoder> | null>(null);
  const ocrRef = useRef<ReturnType<typeof createOcrEngine> | null>(null);
  const searchNonceRef = useRef(0);

  const getDecoder = () => {
    if (!decoderRef.current) decoderRef.current = createBarcodeDecoder();
    return decoderRef.current;
  };

  const getOcr = () => {
    if (!ocrRef.current) ocrRef.current = createOcrEngine();
    return ocrRef.current;
  };

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, [setIsSearchOpen]);

  // Focus input on open & reset transient photo errors
  useEffect(() => {
    if (isSearchOpen) {
      setPhotoError('');
      setPhotoStatusText('');
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    } else {
      setScannerModalOpen(false);
      setPrewarmedStreamPromise(null);
    }
  }, [isSearchOpen]);

  // Escape key closes modal (unless sub-modals are open)
  useEffect(() => {
    if (!isSearchOpen || scannerModalOpen || Boolean(foundCandidate)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSearchOpen, scannerModalOpen, foundCandidate, closeSearch]);

  const recordRecentSearch = useCallback((term: string) => {
    const cleaned = term.trim();
    if (!cleaned) return;
    setRecentSearches((prev) => {
      const next = [
        cleaned,
        ...prev.filter((item) => item.toLowerCase() !== cleaned.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      saveRecentSearches(next);
      return next;
    });
  }, []);

  const removeRecentSearch = (term: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((item) => item !== term);
      saveRecentSearches(next);
      return next;
    });
  };

  const clearAllRecentSearches = () => {
    setRecentSearches([]);
    saveRecentSearches([]);
  };

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
    async (rawQuery: string, options?: { openFirstIsbnMatch?: boolean }) => {
      const parsed = parseUnifiedCatalogQuery(rawQuery, '');
      const nonce = ++searchNonceRef.current;

      if (parsed.mode === 'empty') {
        setOnlineCandidates([]);
        setOnlineError('');
        setHasSearchedOnline(false);
        setIsSearchingOnline(false);
        return;
      }

      if (parsed.mode === 'invalid-isbn') {
        setOnlineCandidates([]);
        setHasSearchedOnline(true);
        setOnlineError(parsed.error);
        setIsSearchingOnline(false);
        return;
      }

      setIsSearchingOnline(true);
      setOnlineError('');
      setHasSearchedOnline(true);

      try {
        if (parsed.mode === 'isbn') {
          const localMatch = findLocalBookByIsbn(parsed.isbn13);
          const res = await catalogService.lookupByIsbn(parsed.isbn13, {
            retainRaw: state.settings?.retainRawProviderPayloads,
            enabledProviderIds: state.settings?.enabledMetadataProviders,
          });
          if (searchNonceRef.current !== nonce) return;

          if (res.candidate) {
            if (options?.openFirstIsbnMatch) {
              setFoundCandidate(res.candidate);
            } else {
              setOnlineCandidates([res.candidate]);
            }
          } else if (localMatch && options?.openFirstIsbnMatch) {
            setFoundCandidate(bookToCandidatePreview(localMatch));
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
            enabledProviderIds: state.settings?.enabledMetadataProviders,
            limit: 8,
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
      findLocalBookByIsbn,
      state.settings?.enabledMetadataProviders,
      state.settings?.retainRawProviderPayloads,
    ]
  );

  // Debounced live online search while typing (>= 3 chars or exact ISBN)
  useEffect(() => {
    if (!isSearchOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      searchNonceRef.current += 1;
      setOnlineCandidates([]);
      setOnlineError('');
      setHasSearchedOnline(false);
      setIsSearchingOnline(false);
      return;
    }

    const parsed = parseUnifiedCatalogQuery(trimmed, '');
    if (parsed.mode === 'search' && trimmed.length < 3) {
      setHasSearchedOnline(false);
      setOnlineCandidates([]);
      setOnlineError('');
      return;
    }

    const timer = window.setTimeout(() => {
      void runOnlineSearch(trimmed);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [query, isSearchOpen, runOnlineSearch]);

  // Live filter matching books in the user's library
  const libraryMatches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
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
      .slice(0, 6);
  }, [query, state.books]);

  // Count books per popular category for helpful subtle context
  const categoryMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of POPULAR_CATEGORIES) {
      const q = cat.query.toLowerCase();
      counts[cat.id] = state.books.filter((book) => {
        if (book.title.toLowerCase().includes(q)) return true;
        if (book.tags && book.tags.some((t) => t.toLowerCase().includes(q))) return true;
        if (cat.id === 'board-books' && book.format === 'board-book') return true;
        if (cat.id === 'picture-books' && book.readingStage === 'picture-book') return true;
        return false;
      }).length;
    }
    return counts;
  }, [state.books]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    recordRecentSearch(trimmed);
    void runOnlineSearch(trimmed);
  };

  const handleSelectQuickQuery = (term: string) => {
    setQuery(term);
    recordRecentSearch(term);
    void runOnlineSearch(term);
  };

  const handleOpenScanner = (mode: ScanMode) => {
    setPhotoError('');
    setScannerInitialMode(mode);
    setPrewarmedStreamPromise(acquireCameraStream('environment'));
    setScannerModalOpen(true);
  };

  const handleIsbnDetected = async (isbn13: string) => {
    setScannerModalOpen(false);
    setPrewarmedStreamPromise(null);
    setQuery(isbn13);
    recordRecentSearch(isbn13);

    const localMatch = findLocalBookByIsbn(isbn13);
    try {
      setIsSearchingOnline(true);
      const res = await catalogService.lookupByIsbn(isbn13, {
        retainRaw: state.settings?.retainRawProviderPayloads,
        enabledProviderIds: state.settings?.enabledMetadataProviders,
      });
      if (res.candidate) {
        setFoundCandidate(res.candidate);
        setOnlineCandidates([res.candidate]);
        setHasSearchedOnline(true);
        return;
      }
      if (localMatch) {
        setFoundCandidate(bookToCandidatePreview(localMatch));
        return;
      }
      setOnlineError(`No online catalog edition found for ISBN ${isbn13}.`);
      setHasSearchedOnline(true);
    } catch (err) {
      if (localMatch) {
        setFoundCandidate(bookToCandidatePreview(localMatch));
      } else {
        setOnlineError(err instanceof Error ? err.message : String(err));
        setHasSearchedOnline(true);
      }
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const handleTitleDetected = (titleQuery: string) => {
    setScannerModalOpen(false);
    setPrewarmedStreamPromise(null);
    setQuery(titleQuery);
    recordRecentSearch(titleQuery);
    void runOnlineSearch(titleQuery);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsAnalyzingPhoto(true);
    setPhotoError('');
    setPhotoStatusText('Reading barcode or cover text from photo…');

    try {
      const loaded = await loadUploadedImage(file);
      try {
        const fullCrop = computeModeCropBox({
          sourceWidth: loaded.width,
          sourceHeight: loaded.height,
          mode: 'barcode',
          fullImage: true,
        });
        const frame = renderCroppedCanvas({
          source: loaded.image,
          crop: fullCrop,
          enhanceOcr: false,
        });
        const decoded = await getDecoder().decodeFrame(frame);
        if (decoded.matched) {
          await handleIsbnDetected(decoded.isbn13);
          return;
        }

        const ocrFrame = renderCroppedCanvas({
          source: loaded.image,
          crop: fullCrop,
          enhanceOcr: true,
        });
        const isbnOcr = await getOcr().recognizeFrame(ocrFrame.canvas, { mode: 'isbn-ocr' });
        if (isbnOcr.matchedIsbn) {
          await handleIsbnDetected(isbnOcr.isbn13);
          return;
        }

        const coverOcr = await getOcr().recognizeFrame(ocrFrame.canvas, { mode: 'cover' });
        if (coverOcr.matchedIsbn) {
          await handleIsbnDetected(coverOcr.isbn13);
          return;
        }
        if (coverOcr.suggestedTitleQuery) {
          handleTitleDetected(coverOcr.suggestedTitleQuery);
          return;
        }

        setPhotoError(
          'Could not detect a barcode, ISBN, or cover title in that photo. Try searching by title or scanning with the camera.'
        );
      } finally {
        try {
          URL.revokeObjectURL(loaded.objectUrl);
        } catch {
          // Ignore URL revocation errors
        }
      }
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to read selected photo.');
    } finally {
      setIsAnalyzingPhoto(false);
      setPhotoStatusText('');
    }
  };

  const handleAddCandidate = async (
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

  const handleGoToManualEntry = (prefill?: BookCandidate) => {
    setFoundCandidate(null);
    closeSearch();
    if (prefill) {
      navigate('scan', {
        tab: 'manual',
        title: prefill.title,
        authors: prefill.authors.join(', '),
        isbn: prefill.isbn13 || prefill.isbn10 || '',
      });
    } else {
      navigate('scan', { tab: 'manual' });
    }
  };

  if (!isSearchOpen) return null;

  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length > 0;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and add books"
        data-search-window="true"
        className="fixed inset-0 z-50 bg-canvas sm:bg-scrim sm:backdrop-blur-sm sm:flex sm:items-start sm:justify-center sm:pt-12 sm:p-4"
        onClick={closeSearch}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-xl bg-canvas sm:bg-surface sm:rounded-2xl sm:border sm:border-edge sm:shadow-2xl flex flex-col overflow-hidden pt-safe pb-safe sm:pt-0 sm:pb-0"
        >
          {/* Sticky Top Search Bar */}
          <form
            onSubmit={handleSubmit}
            className="shrink-0 px-3 sm:px-4 py-3 border-b border-edge-subtle bg-surface flex items-center gap-2"
          >
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Close search"
              className="min-h-[44px] min-w-[44px] rounded-xl text-ink-secondary hover:text-ink hover:bg-surface-subtle active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
            >
              <Icon name="arrowLeft" className="w-5 h-5" />
            </button>

            <ClearableInput
              ref={inputRef}
              id="search-window-input"
              value={query}
              onValueChange={setQuery}
              leadingIcon={<Icon name="search" className="w-4 h-4" />}
              placeholder="Search books, authors, genres, ..."
              aria-label="Search books, authors, genres, or ISBN"
              enterKeyHint="search"
              containerClassName="flex-1 min-w-0"
              className="h-11 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:outline-none focus:border-primary transition-colors"
            />
          </form>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 text-left">
            {!showResults ? (
              <div className="space-y-6 pb-2">
                {/* Full-Width Scan & Entry Actions */}
                <section aria-label="Scan and add book options" className="space-y-2">
                  {/* Primary: Scan barcode / QR */}
                  <button
                    type="button"
                    data-action="search-scan-barcode"
                    onClick={() => handleOpenScanner('barcode')}
                    className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.99] text-primary-fg flex items-center gap-3 shadow-sm transition-all cursor-pointer"
                  >
                    <Icon name="scan" className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-semibold leading-tight text-left">
                      Scan barcode / QR
                    </span>
                  </button>

                  {/* Full-width secondary scan & entry buttons */}
                  <button
                    type="button"
                    data-action="search-scan-isbn-text"
                    onClick={() => handleOpenScanner('isbn-ocr')}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-surface border border-edge hover:bg-surface-elevated active:scale-[0.99] flex items-center gap-3 text-left transition-all cursor-pointer"
                  >
                    <Icon name="hash" className="w-4.5 h-4.5 text-ink-secondary shrink-0" />
                    <span className="text-sm font-medium text-ink leading-tight">
                      Scan ISBN text
                    </span>
                  </button>

                  <button
                    type="button"
                    data-action="search-scan-cover"
                    onClick={() => handleOpenScanner('cover')}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-surface border border-edge hover:bg-surface-elevated active:scale-[0.99] flex items-center gap-3 text-left transition-all cursor-pointer"
                  >
                    <Icon name="bookOpen" className="w-4.5 h-4.5 text-ink-secondary shrink-0" />
                    <span className="text-sm font-medium text-ink leading-tight">
                      Scan cover
                    </span>
                  </button>

                  <button
                    type="button"
                    data-action="search-upload-photo"
                    disabled={isAnalyzingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-surface border border-edge hover:bg-surface-elevated active:scale-[0.99] disabled:opacity-60 flex items-center gap-3 text-left transition-all cursor-pointer"
                  >
                    <Icon name="photo" className="w-4.5 h-4.5 text-ink-secondary shrink-0" />
                    <span className="text-sm font-medium text-ink leading-tight">
                      {isAnalyzingPhoto ? 'Reading photo…' : 'Upload photo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-action="search-type-manual"
                    onClick={() => handleGoToManualEntry()}
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-surface border border-edge hover:bg-surface-elevated active:scale-[0.99] flex items-center gap-3 text-left transition-all cursor-pointer"
                  >
                    <Icon name="edit" className="w-4.5 h-4.5 text-ink-secondary shrink-0" />
                    <span className="text-sm font-medium text-ink leading-tight">
                      Type details manually
                    </span>
                  </button>

                  {photoStatusText && (
                    <p
                      role="status"
                      className="rounded-xl bg-surface border border-edge px-3.5 py-2.5 text-xs font-medium text-ink-secondary"
                    >
                      {photoStatusText}
                    </p>
                  )}

                  {photoError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-danger/10 border border-danger/35 px-3.5 py-2.5 text-xs font-medium text-danger"
                    >
                      {photoError}
                    </p>
                  )}
                </section>

                {/* Popular Search Categories — Compact Topic Pills */}
                <section aria-label="Popular search categories" className="space-y-2.5">
                  <h2 className="text-xs font-medium text-ink-secondary">
                    Popular Search Categories
                  </h2>

                  <div className="flex flex-wrap gap-2">
                    {POPULAR_CATEGORIES.map((category) => {
                      const matchCount = categoryMatchCounts[category.id] || 0;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => handleSelectQuickQuery(category.query)}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-surface border border-edge hover:bg-surface-elevated active:scale-95 inline-flex items-center gap-1.5 text-xs font-medium text-ink transition-all cursor-pointer whitespace-nowrap"
                        >
                          <span>{category.label}</span>
                          {matchCount > 0 && (
                            <span className="text-[11px] font-mono-tabular text-ink-muted">
                              {matchCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Recent Searches — Low-Emphasis List at Bottom */}
                {recentSearches.length > 0 && (
                  <section
                    aria-label="Recent searches"
                    className="pt-2 border-t border-edge-subtle space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-medium text-ink-muted">
                        Recent Searches
                      </h2>
                      <button
                        type="button"
                        onClick={clearAllRecentSearches}
                        className="text-xs font-medium text-ink-muted hover:text-ink py-1 px-1.5 rounded transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="space-y-0.5">
                      {recentSearches.map((item) => (
                        <div
                          key={item}
                          className="flex items-center justify-between min-h-[38px] rounded-lg hover:bg-surface-subtle transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectQuickQuery(item)}
                            className="flex-1 min-w-0 min-h-[38px] px-1.5 flex items-center gap-2.5 text-left cursor-pointer"
                          >
                            <Icon name="clock" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                            <span className="text-xs text-ink-secondary truncate">{item}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRecentSearch(item)}
                            aria-label={`Remove recent search ${item}`}
                            className="min-h-[38px] min-w-[38px] flex items-center justify-center text-ink-muted hover:text-ink rounded-lg cursor-pointer shrink-0"
                          >
                            <Icon name="x" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              /* Active Search Results View */
              <div className="space-y-5 pb-4">
                {/* In Your Library Matches */}
                <section aria-label="Matches in your library" className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                      In Your Library ({libraryMatches.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        recordRecentSearch(trimmedQuery);
                        closeSearch();
                        submitGlobalSearch(trimmedQuery);
                      }}
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap cursor-pointer"
                    >
                      Filter in Library
                    </button>
                  </div>

                  {libraryMatches.length > 0 ? (
                    <div className="rounded-xl bg-surface border border-edge divide-y divide-edge-subtle overflow-hidden">
                      {libraryMatches.map((book) => (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => {
                            recordRecentSearch(trimmedQuery);
                            closeSearch();
                            setInspectedBookId(book.id);
                          }}
                          className="w-full p-3 hover:bg-surface-subtle active:scale-[0.995] flex items-center justify-between gap-3 text-left transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <BookCover
                              book={book}
                              size="xs"
                              aspectRatio={state.settings?.coverAspectRatio || 'square'}
                            />
                            <div className="min-w-0">
                              <h3 className="font-display text-sm font-semibold text-ink truncate">
                                {book.title}
                              </h3>
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
                      No books matching “{trimmedQuery}” in your saved library.
                    </p>
                  )}
                </section>

                {/* Online Catalog Results */}
                <section aria-label="Online book catalog results" className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
                      Online Catalog
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        recordRecentSearch(trimmedQuery);
                        void runOnlineSearch(trimmedQuery);
                      }}
                      disabled={isSearchingOnline}
                      className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 whitespace-nowrap cursor-pointer"
                    >
                      {isSearchingOnline ? 'Searching…' : 'Search online'}
                    </button>
                  </div>

                  {isSearchingOnline ? (
                    <div className="rounded-xl bg-surface border border-edge p-4">
                      <SearchResultsSkeleton rows={3} />
                    </div>
                  ) : onlineCandidates.length > 0 ? (
                    <div className="rounded-xl bg-surface border border-edge divide-y divide-edge-subtle px-3.5">
                      {onlineCandidates.map((cand, idx) => {
                        const pseudoBook = {
                          ...cand,
                          id: `search_cand_${idx}`,
                          addedAt: '',
                        };
                        return (
                          <article
                            key={`${cand.isbn13 || cand.title}-${idx}`}
                            className="py-3 flex items-center justify-between gap-3"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                recordRecentSearch(trimmedQuery);
                                setFoundCandidate(cand);
                              }}
                              className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <BookCover
                                book={pseudoBook as any}
                                size="sm"
                                aspectRatio={state.settings?.coverAspectRatio || 'square'}
                              />
                              <div className="min-w-0 flex-1">
                                <h3 className="font-display font-semibold text-sm text-ink leading-snug line-clamp-2">
                                  {cand.title}
                                </h3>
                                <p className="text-xs text-ink-secondary truncate mt-0.5">
                                  {cand.authors.join(', ')}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-muted mt-1">
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
                                recordRecentSearch(trimmedQuery);
                                setFoundCandidate(cand);
                              }}
                              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shrink-0 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Add
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : hasSearchedOnline && onlineError ? (
                    <div className="rounded-xl bg-surface border border-edge p-4 space-y-2.5">
                      <p className="text-xs text-ink-secondary">{onlineError}</p>
                      <button
                        type="button"
                        onClick={() => handleGoToManualEntry()}
                        className="min-h-[40px] px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                        <span>Type details manually</span>
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-surface border border-edge p-4 flex items-center justify-between gap-3">
                      <p className="text-xs text-ink-secondary">
                        Type at least 3 characters or press Search to query Google Books &amp; Open Library.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          recordRecentSearch(trimmedQuery);
                          void runOnlineSearch(trimmedQuery);
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-primary text-primary-fg text-xs font-semibold shrink-0 cursor-pointer whitespace-nowrap"
                      >
                        Search
                      </button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="sr-only"
          />
        </div>
      </div>

      {/* Live Camera Scanner launched directly from Search Window */}
      <NativeBarcodeScannerModal
        isOpen={scannerModalOpen}
        initialMode={scannerInitialMode}
        prewarmedStreamPromise={prewarmedStreamPromise}
        onDetectedIsbn={(isbn13) => {
          void handleIsbnDetected(isbn13);
        }}
        onDetectedTitle={handleTitleDetected}
        onClose={() => {
          setScannerModalOpen(false);
          setPrewarmedStreamPromise(null);
        }}
      />

      {/* Found Book Sheet for adding scanned/found books */}
      <FoundBookSheet
        candidate={foundCandidate}
        isOpen={Boolean(foundCandidate)}
        onAddOwned={(cand, opts) => handleAddCandidate(cand, 'owned', opts)}
        onAddWishlist={(cand, opts) => handleAddCandidate(cand, 'wishlist', opts)}
        onRescan={() => {
          setFoundCandidate(null);
          handleOpenScanner(scannerInitialMode);
        }}
        onEditManual={handleGoToManualEntry}
        onClose={() => setFoundCandidate(null)}
      />
    </>
  );
};
