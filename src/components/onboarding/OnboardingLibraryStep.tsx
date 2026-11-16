import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { BookCover } from '../common/BookCover.js';
import { FoundBookSheet } from '../modals/FoundBookSheet.js';
import { NativeBarcodeScannerModal } from '../scan/NativeBarcodeScannerModal.js';
import { SearchResultsSkeleton } from '../common/SkeletonLoaders.js';
import { parseUnifiedCatalogQuery } from '../../features/scan/scan-shell-view.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';
import type {
  BookCondition,
  BookFormat,
  ReadingStage,
} from '../../types/models.js';
import { formatBookBinding, getEffectiveProfileAge } from '../../types/models.js';

type ActiveSheet = 'none' | 'search' | 'manual';

interface OnboardingLibraryStepProps {
  primaryProfileId?: string;
}

interface CuratedStarterBook {
  title: string;
  authors: string[];
  isbn: string;
  publishedYear: number;
  pageCount: number;
  format: BookFormat;
  ageMin: number;
  ageMax: number;
  readingStage: ReadingStage;
  tags: string[];
}

const OLDER_READER_STARTER_BOOKS: CuratedStarterBook[] = [
  {
    title: "Charlotte's Web",
    authors: ['E. B. White'],
    isbn: '9780064400558',
    publishedYear: 1952,
    pageCount: 192,
    format: 'paperback',
    ageMin: 7,
    ageMax: 12,
    readingStage: 'chapter-book',
    tags: ['animals', 'friendship', 'classic'],
  },
  {
    title: 'The Wild Robot',
    authors: ['Peter Brown'],
    isbn: '9780316382007',
    publishedYear: 2016,
    pageCount: 288,
    format: 'hardcover',
    ageMin: 8,
    ageMax: 13,
    readingStage: 'middle-grade',
    tags: ['nature', 'animals', 'science', 'adventure'],
  },
  {
    title: 'The Little Prince',
    authors: ['Antoine de Saint-Exupéry'],
    isbn: '9780156012195',
    publishedYear: 1943,
    pageCount: 96,
    format: 'paperback',
    ageMin: 8,
    ageMax: 99,
    readingStage: 'middle-grade',
    tags: ['space', 'classic', 'wonder', 'art'],
  },
  {
    title: 'A Wrinkle in Time',
    authors: ['Madeleine L’Engle'],
    isbn: '9780312367541',
    publishedYear: 1962,
    pageCount: 256,
    format: 'paperback',
    ageMin: 10,
    ageMax: 17,
    readingStage: 'teen-ya',
    tags: ['space', 'science', 'adventure'],
  },
  {
    title: 'The Hobbit',
    authors: ['J. R. R. Tolkien'],
    isbn: '9780547928227',
    publishedYear: 1937,
    pageCount: 300,
    format: 'paperback',
    ageMin: 11,
    ageMax: 99,
    readingStage: 'teen-ya',
    tags: ['adventure', 'fairy-tales', 'classic'],
  },
  {
    title: 'Braiding Sweetgrass',
    authors: ['Robin Wall Kimmerer'],
    isbn: '9781571313560',
    publishedYear: 2013,
    pageCount: 408,
    format: 'paperback',
    ageMin: 16,
    ageMax: 99,
    readingStage: 'adult',
    tags: ['nature', 'science', 'history'],
  },
];

export const OnboardingLibraryStep: React.FC<OnboardingLibraryStepProps> = ({
  primaryProfileId,
}) => {
  const { state, store, catalogService, activeProfile, setInspectedBookId } = useApp();

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('none');
  const [isNativeScannerOpen, setIsNativeScannerOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAuthor, setSearchAuthor] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pendingIsbn, setPendingIsbn] = useState('');
  const [notFoundIsbn, setNotFoundIsbn] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<BookCandidate[]>([]);
  const [searchError, setSearchError] = useState('');

  // Manual book state
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthors, setManualAuthors] = useState('');
  const [manualIsbn, setManualIsbn] = useState('');
  const [manualFormat, setManualFormat] = useState<BookFormat>('hardcover');
  const [manualCategory, setManualCategory] = useState('picture-book');
  const [manualStage, setManualStage] = useState<ReadingStage>(
    activeProfile?.readingStage || 'picture-book'
  );
  const [manualError, setManualError] = useState('');

  // Starter collection state
  const [importingSample, setImportingSample] = useState(false);
  const [starterImported, setStarterImported] = useState(false);

  // Found book sheet
  const [foundCandidate, setFoundCandidate] = useState<BookCandidate | null>(null);
  const [lastScanViaModal, setLastScanViaModal] = useState(false);

  useBodyScrollLock(activeSheet !== 'none');

  const readerAges = useMemo(
    () => state.profiles.map((p) => getEffectiveProfileAge(p)),
    [state.profiles]
  );

  const starterSublabel = useMemo(() => {
    if (starterImported) return 'Added to shelf';
    if (readerAges.length === 0) return 'Curated classics';
    const minAge = Math.min(...readerAges);
    const maxAge = Math.max(...readerAges);
    if (maxAge <= 3) return 'Board & toddler picks';
    if (minAge >= 13) return 'Teen & adult picks';
    if (minAge >= 9) return 'Chapter & middle grade';
    return minAge === maxAge
      ? `Tailored for age ${minAge}`
      : `Tailored for ages ${minAge}–${maxAge}`;
  }, [readerAges, starterImported]);

  useEffect(() => {
    if (activeSheet === 'search') {
      const timer = window.setTimeout(() => {
        document.getElementById('onboarding-sheet-search-query')?.focus();
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [activeSheet]);

  useEffect(() => {
    if (activeSheet === 'none') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !foundCandidate) {
        setActiveSheet('none');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSheet, foundCandidate]);

  const executeIsbnLookup = async (isbn: string) => {
    setIsSearching(true);
    setPendingIsbn(isbn);
    setNotFoundIsbn('');
    setSearchError('');

    try {
      const res = await catalogService.lookupByIsbn(isbn, {
        retainRaw: state.settings?.retainRawProviderPayloads,
        enabledProviderIds: state.settings?.enabledMetadataProviders,
      });

      if (res.candidate) {
        setFoundCandidate(res.candidate);
      } else {
        setNotFoundIsbn(isbn);
        setSearchError(`No catalog match found for ISBN ${isbn}. You can add it manually.`);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
      setPendingIsbn('');
    }
  };

  const executeUnifiedSearch = async (rawQuery: string, rawAuthor: string) => {
    const parsed = parseUnifiedCatalogQuery(rawQuery, rawAuthor);
    if (parsed.mode === 'empty') {
      setSearchError('Enter a book title, author, or ISBN to search.');
      return;
    }
    if (parsed.mode === 'invalid-isbn') {
      setSearchError(parsed.error);
      return;
    }
    if (parsed.mode === 'isbn') {
      await executeIsbnLookup(parsed.isbn13);
      return;
    }

    setIsSearching(true);
    setSearchError('');
    setNotFoundIsbn('');
    try {
      const res = await catalogService.searchBooks(
        { query: parsed.query, author: parsed.author || undefined },
        {
          retainRaw: state.settings?.retainRawProviderPayloads,
          enabledProviderIds: state.settings?.enabledMetadataProviders,
          limit: 8,
        }
      );
      setSearchCandidates(res.candidates);
      if (res.candidates.length === 0) {
        setSearchError('No matching titles found. Try fewer words or add manually.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    if (!manualTitle.trim()) {
      setManualError('Book title is required.');
      return;
    }
    try {
      const targetOwner = primaryProfileId || activeProfile?.id || '';
      const baseAge = activeProfile?.age ?? 4;
      const stageAgeMap: Record<ReadingStage, [number, number]> = {
        'board-toddler': [0, 3],
        'picture-book': [2, 6],
        'early-reader': [5, 8],
        'chapter-book': [7, 11],
        'middle-grade': [9, 13],
        'teen-ya': [13, 18],
        adult: [18, 99],
      };
      const [ageMin, ageMax] = stageAgeMap[manualStage] || [Math.max(1, baseAge - 1), baseAge + 2];

      await store.addManualBook({
        title: manualTitle.trim(),
        authors: manualAuthors
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        isbn: manualIsbn.trim() || undefined,
        format: manualFormat,
        readingStage: manualStage,
        ageMin,
        ageMax,
        tags: manualCategory ? [manualCategory] : [],
        owners: targetOwner ? [targetOwner, 'shared'] : ['shared'],
      });
      setManualTitle('');
      setManualAuthors('');
      setManualIsbn('');
      setActiveSheet('none');
      store.notify('Book added to your shelf!', 'success');
    } catch (err) {
      setManualError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportStarterCollection = async () => {
    if (importingSample) return;
    setImportingSample(true);
    try {
      const targetProfileId = primaryProfileId || activeProfile?.id || '';
      const hasYoungReaders = readerAges.length === 0 || readerAges.some((age) => age <= 8);
      const hasOlderReaders = readerAges.some((age) => age >= 9);
      let addedCount = 0;

      if (hasYoungReaders) {
        const res = await store.importSampleCollectionAdditive({
          assignToProfileId: targetProfileId,
          silent: true,
        });
        addedCount += res.addedBooks.length;
      }

      if (hasOlderReaders) {
        const existingIsbns = new Set(
          state.books.map((b) => b.isbn13).filter((isbn) => typeof isbn === 'string' && isbn.length > 0)
        );
        const existingTitles = new Set(state.books.map((b) => b.title.trim().toLowerCase()));
        const maxAge = Math.max(...readerAges);
        const minOlderAge = Math.min(...readerAges.filter((a) => a >= 9));

        const matchedOlder = OLDER_READER_STARTER_BOOKS.filter(
          (book) => book.ageMax >= minOlderAge && book.ageMin <= maxAge + 2
        );
        const booksToImport = matchedOlder.length > 0 ? matchedOlder : OLDER_READER_STARTER_BOOKS.slice(0, 4);

        for (const item of booksToImport) {
          if (existingIsbns.has(item.isbn) || existingTitles.has(item.title.toLowerCase())) {
            continue;
          }
          await store.addManualBook({
            title: item.title,
            authors: item.authors,
            isbn: item.isbn,
            publishedYear: item.publishedYear,
            pageCount: item.pageCount,
            format: item.format,
            ageMin: item.ageMin,
            ageMax: item.ageMax,
            readingStage: item.readingStage,
            tags: item.tags,
            owners: targetProfileId ? [targetProfileId, 'shared'] : ['shared'],
            sources: [{ provider: 'seed', fetchedAt: new Date().toISOString() }],
          });
          addedCount += 1;
        }
      }

      setStarterImported(true);
      store.notify(
        addedCount > 0
          ? `Added ${addedCount} age-tailored starter books to your shelf.`
          : 'Starter collection books are already on your shelf.',
        addedCount > 0 ? 'success' : 'info'
      );
    } finally {
      setImportingSample(false);
    }
  };

  const handleAddCandidate = async (
    candidate: BookCandidate,
    status: 'owned' | 'wishlist',
    opts?: { condition?: BookCondition; owners?: string[]; loved?: boolean }
  ) => {
    const defaultOwners =
      primaryProfileId || activeProfile?.id
        ? [primaryProfileId || activeProfile!.id, 'shared']
        : ['shared'];
    await store.addBookFromCandidate(candidate, {
      collectionStatus: status,
      condition: opts?.condition || 'good',
      owners: opts?.owners || defaultOwners,
      loved: opts?.loved || false,
    });
    setFoundCandidate(null);
    setActiveSheet('none');
    store.notify(
      `Added "${candidate.title}" to ${status === 'owned' ? 'Library' : 'Wishlist'}`,
      'success'
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 4-Option Equal-Weight Action Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* 1. Scan Barcode (Primary Highlight) */}
        <button
          type="button"
          data-action="onboarding-open-scanner"
          onClick={() => {
            setNotFoundIsbn('');
            setSearchError('');
            setLastScanViaModal(true);
            setIsNativeScannerOpen(true);
          }}
          className="min-h-[88px] sm:min-h-[104px] p-3.5 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:hover:bg-[#77DFE5] text-white dark:text-night-950 text-left flex flex-col justify-between gap-2 shadow-sm transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between w-full">
            <span className="w-8 h-8 rounded-xl bg-white/15 dark:bg-night-950/15 flex items-center justify-center">
              <Icon name="scan" className="w-4 h-4" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Fastest
            </span>
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Scan Barcode</p>
            <p className="text-[11px] opacity-80 mt-0.5 leading-tight">Camera ISBN scan</p>
          </div>
        </button>

        {/* 2. Search Title */}
        <button
          type="button"
          data-action="onboarding-open-search"
          onClick={() => {
            setLastScanViaModal(false);
            setSearchError('');
            setActiveSheet('search');
          }}
          className="min-h-[88px] sm:min-h-[104px] p-3.5 rounded-2xl bg-ivory hover:bg-linen-100/70 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-800 text-forest-900 dark:text-white text-left flex flex-col justify-between gap-2 shadow-2xs transition-all cursor-pointer"
        >
          <span className="w-8 h-8 rounded-xl bg-linen-100 dark:bg-night-800 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
            <Icon name="search" className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">Search Title</p>
            <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 leading-tight">
              Title or author
            </p>
          </div>
        </button>

        {/* 3. Add Manually */}
        <button
          type="button"
          data-action="onboarding-open-manual"
          onClick={() => {
            setManualError('');
            setActiveSheet('manual');
          }}
          className="min-h-[88px] sm:min-h-[104px] p-3.5 rounded-2xl bg-ivory hover:bg-linen-100/70 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-800 text-forest-900 dark:text-white text-left flex flex-col justify-between gap-2 shadow-2xs transition-all cursor-pointer"
        >
          <span className="w-8 h-8 rounded-xl bg-linen-100 dark:bg-night-800 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
            <Icon name="edit" className="w-4 h-4" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">Add Manually</p>
            <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 leading-tight">
              Title &amp; category
            </p>
          </div>
        </button>

        {/* 4. Starter Collection */}
        <button
          type="button"
          data-action="onboarding-starter-collection"
          disabled={importingSample}
          onClick={handleImportStarterCollection}
          className={`min-h-[88px] sm:min-h-[104px] p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-2 shadow-2xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 ${
            starterImported
              ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-forest-900 dark:text-white'
              : 'bg-ivory hover:bg-linen-100/70 dark:bg-night-900 dark:hover:bg-night-800 border-linen-200 dark:border-night-800 text-forest-900 dark:text-white'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="w-8 h-8 rounded-xl bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 flex items-center justify-center">
              <Icon name={starterImported ? 'check' : 'sparkles'} className="w-4 h-4" />
            </span>
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">
              {importingSample ? 'Adding…' : 'Starter Collection'}
            </p>
            <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 leading-tight line-clamp-1">
              {starterSublabel}
            </p>
          </div>
        </button>
      </div>

      {/* Live ISBN Lookup Status / Not Found Recovery */}
      {isSearching && pendingIsbn && (
        <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-4 py-3 flex items-center gap-3 text-xs font-medium text-forest-900 dark:text-white">
          <span className="w-4 h-4 rounded-full border-2 border-forest-700 border-t-transparent animate-spin shrink-0" />
          <span>Looking up ISBN {pendingIsbn}…</span>
        </div>
      )}

      {notFoundIsbn && !isSearching && (
        <div className="rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
          <span className="text-amber-950 dark:text-amber-200 truncate">
            ISBN {notFoundIsbn} not found in online catalog.
          </span>
          <button
            type="button"
            onClick={() => {
              setManualIsbn(notFoundIsbn);
              setNotFoundIsbn('');
              setActiveSheet('manual');
            }}
            className="min-h-[36px] px-3 py-1 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Add Manually
          </button>
        </div>
      )}

      {/* Live Added-Books Counter & Preview Tray */}
      <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
            Added to Shelf
          </span>
          <span className="text-xs font-mono-tabular font-bold text-forest-700 dark:text-[#5ED3DA]">
            {state.books.length} {state.books.length === 1 ? 'book' : 'books'}
          </span>
        </div>

        {state.books.length === 0 ? (
          <div className="py-3 text-center">
            <p className="text-xs text-stone-ink dark:text-slate-400">
              No books added yet · Scan a barcode or tap Starter Collection above.
            </p>
          </div>
        ) : (
          <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
            {state.books.slice(0, 12).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setInspectedBookId(b.id)}
                title={`Inspect ${b.title}`}
                className="shrink-0 w-14 text-left group cursor-pointer focus-visible:outline-2 focus-visible:outline-forest-700 rounded-lg space-y-1 active:scale-95 transition-transform"
              >
                <BookCover
                  book={b}
                  size="sm"
                  aspectRatio="portrait"
                  showBadges={false}
                  hideRotationAdorno={true}
                />
                <p className="text-[10px] font-medium text-forest-900 dark:text-slate-200 truncate">
                  {b.title}
                </p>
              </button>
            ))}
            {state.books.length > 12 && (
              <div className="shrink-0 flex items-center px-2 text-xs font-mono-tabular font-semibold text-stone-ink dark:text-slate-400">
                +{state.books.length - 12}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Sheet: Search Title / Author (Google Books + Open Library) */}
      {activeSheet === 'search' && (
        <div
          className="sheet-backdrop fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
          role="dialog"
          aria-modal="true"
          aria-label="Search book title or author"
          onClick={() => setActiveSheet('none')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-lg h-[82dvh] sm:h-auto sm:max-h-[82vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden pb-safe sm:pb-0"
          >
            <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 shrink-0 sm:hidden" />

            <div className="px-5 py-3 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-3 shrink-0">
              <h2 className="font-display text-base font-bold text-forest-900 dark:text-white">
                Search Books
              </h2>
              <button
                type="button"
                onClick={() => setActiveSheet('none')}
                aria-label="Close search"
                className="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeUnifiedSearch(searchQuery, searchAuthor);
                }}
                className="space-y-2.5"
              >
                <div>
                  <label
                    htmlFor="onboarding-sheet-search-query"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    Title or ISBN
                  </label>
                  <ClearableInput
                    id="onboarding-sheet-search-query"
                    autoFocus
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    placeholder="e.g. Where the Wild Things Are"
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label
                      htmlFor="onboarding-sheet-search-author"
                      className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                    >
                      Author (optional)
                    </label>
                    <ClearableInput
                      id="onboarding-sheet-search-author"
                      value={searchAuthor}
                      onValueChange={setSearchAuthor}
                      placeholder="e.g. Maurice Sendak"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSearching}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 active:scale-95 disabled:opacity-60 dark:bg-[#5ED3DA] dark:text-night-950 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all"
                  >
                    <Icon name="search" className="w-4 h-4" />
                    <span>{isSearching ? 'Searching…' : 'Find'}</span>
                  </button>
                </div>
              </form>

              {searchError && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{searchError}</p>
              )}

              {isSearching && <SearchResultsSkeleton rows={3} />}

              {!isSearching && searchCandidates.length > 0 && (
                <div className="divide-y divide-linen-200/70 dark:divide-night-800">
                  {searchCandidates.map((cand, idx) => {
                    const pseudo = { ...cand, id: `onb_cand_${idx}`, addedAt: '' };
                    return (
                      <div
                        key={`${cand.isbn13 || cand.title}-${idx}`}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <BookCover
                            book={pseudo as any}
                            size="sm"
                            aspectRatio="portrait"
                            showBadges={false}
                          />
                          <div className="min-w-0">
                            <p className="font-display font-bold text-sm text-forest-900 dark:text-white line-clamp-1">
                              {cand.title}
                            </p>
                            <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
                              {cand.authors.join(', ')}
                            </p>
                            <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                              Ages {cand.ageMin}–{cand.ageMax} · {formatBookBinding(cand.format)}
                            </p>
                            {cand.sources && cand.sources.length > 0 && (
                              <div className="mt-1">
                                <ProviderAttribution sources={cand.sources} />
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFoundCandidate(cand)}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 active:scale-95 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold shrink-0 cursor-pointer transition-all"
                        >
                          Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Sheet: Manual Book Entry */}
      {activeSheet === 'manual' && (
        <div
          className="sheet-backdrop fixed inset-0 z-40 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
          role="dialog"
          aria-modal="true"
          aria-label="Add book manually"
          onClick={() => setActiveSheet('none')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden pb-safe sm:pb-0"
          >
            <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 shrink-0 sm:hidden" />

            <div className="px-5 py-3 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-3 shrink-0">
              <h2 className="font-display text-base font-bold text-forest-900 dark:text-white">
                Add Book Manually
              </h2>
              <button
                type="button"
                onClick={() => setActiveSheet('none')}
                aria-label="Close manual entry"
                className="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
              {manualError && (
                <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {manualError}
                </p>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Goodnight Moon"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                  Author
                </label>
                <input
                  type="text"
                  value={manualAuthors}
                  onChange={(e) => setManualAuthors(e.target.value)}
                  placeholder="e.g. Margaret Wise Brown"
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                    Category
                  </label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                    className="w-full min-h-[46px] px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                  >
                    <option value="animals">Animals</option>
                    <option value="bedtime">Bedtime</option>
                    <option value="nature">Nature</option>
                    <option value="space">Space</option>
                    <option value="science">Science</option>
                    <option value="fairy-tales">Fairy Tales</option>
                    <option value="history">History</option>
                    <option value="humor">Humor</option>
                    <option value="adventure">Adventure</option>
                    <option value="art">Art</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                    Format
                  </label>
                  <select
                    value={manualFormat}
                    onChange={(e) => setManualFormat(e.target.value as BookFormat)}
                    className="w-full min-h-[46px] px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                  >
                    <option value="hardcover">Hardcover</option>
                    <option value="board-book">Board Book</option>
                    <option value="paperback">Paperback</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                    Reading Stage
                  </label>
                  <select
                    value={manualStage}
                    onChange={(e) => setManualStage(e.target.value as ReadingStage)}
                    className="w-full min-h-[46px] px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                  >
                    <option value="board-toddler">Board Books (0–3)</option>
                    <option value="picture-book">Picture Books (3–6)</option>
                    <option value="early-reader">Early Reader (5–8)</option>
                    <option value="chapter-book">Chapter Books (7–10)</option>
                    <option value="middle-grade">Middle Grade (9–12)</option>
                    <option value="teen-ya">Teen / YA (13–17)</option>
                    <option value="adult">Adult Reader (18+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                    ISBN (optional)
                  </label>
                  <input
                    type="text"
                    value={manualIsbn}
                    onChange={(e) => setManualIsbn(e.target.value)}
                    placeholder="978..."
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  <span>Add Book to Shelf</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Camera ISBN / Barcode Scanner Overlay */}
      <NativeBarcodeScannerModal
        isOpen={isNativeScannerOpen}
        initialMode="barcode"
        onDetectedIsbn={(isbn13) => {
          setIsNativeScannerOpen(false);
          executeIsbnLookup(isbn13);
        }}
        onDetectedTitle={(titleQuery) => {
          setIsNativeScannerOpen(false);
          setSearchQuery(titleQuery);
          setActiveSheet('search');
          executeUnifiedSearch(titleQuery, '');
        }}
        onClose={() => setIsNativeScannerOpen(false)}
      />

      {/* Found Book Bottom Sheet */}
      <FoundBookSheet
        candidate={foundCandidate}
        isOpen={Boolean(foundCandidate)}
        onAddOwned={(cand, opts) => handleAddCandidate(cand, 'owned', opts)}
        onAddWishlist={(cand, opts) => handleAddCandidate(cand, 'wishlist', opts)}
        onRescan={() => {
          setFoundCandidate(null);
          if (lastScanViaModal) {
            setIsNativeScannerOpen(true);
          }
        }}
        onEditManual={(cand) => {
          setManualTitle(cand.title);
          setManualAuthors(cand.authors.join(', '));
          setManualIsbn(cand.isbn13 || cand.isbn10 || '');
          setManualFormat(cand.format || 'hardcover');
          setManualStage(cand.readingStage || 'picture-book');
          setFoundCandidate(null);
          setActiveSheet('manual');
        }}
        onClose={() => setFoundCandidate(null)}
      />
    </div>
  );
};
