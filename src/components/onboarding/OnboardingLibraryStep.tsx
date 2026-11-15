import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { BookCover } from '../common/BookCover.js';
import { FoundBookSheet } from '../modals/FoundBookSheet.js';
import { NativeBarcodeScannerModal } from '../scan/NativeBarcodeScannerModal.js';
import { SearchResultsSkeleton } from '../common/SkeletonLoaders.js';
import { triggerScanSuccessFeedback } from '../../utils/scannerFeedback.js';
import { parseUnifiedCatalogQuery } from '../../features/scan/scan-shell-view.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';
import type {
  BookCondition,
  BookFormat,
  ReadingStage,
  ScanMode,
} from '../../types/models.js';
import { formatBookBinding } from '../../types/models.js';

type LibraryMethodId = 'search' | 'barcode' | 'cover' | 'manual' | 'sample';

interface OnboardingLibraryStepProps {
  primaryProfileId?: string;
}

export const OnboardingLibraryStep: React.FC<OnboardingLibraryStepProps> = ({
  primaryProfileId,
}) => {
  const { state, store, catalogService, scanner, activeProfile, setInspectedBookId } = useApp();

  const [activeMethod, setActiveMethod] = useState<LibraryMethodId>('search');
  const [scannerState, setScannerState] = useState(() => ({ ...scanner.getState() }));

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
  const [manualStage, setManualStage] = useState<ReadingStage>(
    activeProfile?.readingStage || 'picture-book'
  );
  const [manualAgeMin, setManualAgeMin] = useState(
    String(Math.max(1, (activeProfile?.age || 4) - 1))
  );
  const [manualAgeMax, setManualAgeMax] = useState(String((activeProfile?.age || 4) + 2));
  const [manualTags, setManualTags] = useState('');
  const [manualError, setManualError] = useState('');

  // Sample import feedback
  const [importingSample, setImportingSample] = useState(false);

  // Found book sheet & full-screen scanner
  const [foundCandidate, setFoundCandidate] = useState<BookCandidate | null>(null);
  const [isNativeScannerOpen, setIsNativeScannerOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastHandledLockRef = useRef<string>('');

  useEffect(() => {
    scanner.initSupport().catch(() => {});
  }, [scanner]);

  useEffect(() => {
    const unsub = scanner.subscribe(() => {
      const cur = scanner.getState();
      setScannerState({ ...cur });

      if (cur.phase === 'locked' && cur.lock) {
        const lockKey = `${cur.lock.lockedAt}:${cur.lock.kind}:${cur.lock.isbn13 || cur.lock.titleQuery || ''}`;
        if (lastHandledLockRef.current !== lockKey) {
          lastHandledLockRef.current = lockKey;
          triggerScanSuccessFeedback();
          if (cur.lock.kind === 'isbn' && cur.lock.isbn13) {
            executeIsbnLookup(cur.lock.isbn13);
          } else if (cur.lock.kind === 'cover-title' && cur.lock.titleQuery) {
            setSearchQuery(cur.lock.titleQuery);
            setActiveMethod('search');
            executeUnifiedSearch(cur.lock.titleQuery, '');
          }
        }
      }
    });

    return () => {
      scanner.stopCamera();
      unsub();
    };
  }, [scanner]);

  useEffect(() => {
    const isCameraMethod = activeMethod === 'barcode' || activeMethod === 'cover';
    if (
      isCameraMethod &&
      (scannerState.phase === 'starting-camera' || scannerState.phase === 'streaming') &&
      videoRef.current
    ) {
      scanner.attachVideoElement(videoRef.current);
    }
  }, [activeMethod, scannerState.phase, scanner]);

  const handleSelectMethod = (method: LibraryMethodId) => {
    setActiveMethod(method);
    setNotFoundIsbn('');
    setSearchError('');
    if (method === 'barcode') {
      scanner.setMode('barcode');
    } else if (method === 'cover') {
      scanner.setMode('cover');
    } else {
      scanner.stopCamera();
    }
  };

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
        setSearchError(`No metadata found for ISBN ${isbn}. You can finish adding it manually.`);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
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
          limit: 6,
        }
      );
      setSearchCandidates(res.candidates);
      if (res.candidates.length === 0) {
        setSearchError('No matching titles found. Try fewer words, barcode scan, or manual entry.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setNotFoundIsbn('');
    setSearchError('');
    const targetMode: ScanMode = activeMethod === 'cover' ? 'cover' : 'barcode';
    scanner.setMode(targetMode);
    try {
      await scanner.scanUploadedFile(file);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
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
      await store.addManualBook({
        title: manualTitle.trim(),
        authors: manualAuthors
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        isbn: manualIsbn.trim() || undefined,
        format: manualFormat,
        readingStage: manualStage,
        ageMin: Number(manualAgeMin) || 1,
        ageMax: Number(manualAgeMax) || 6,
        tags: manualTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        owners: targetOwner ? [targetOwner, 'shared'] : ['shared'],
      });
      setManualTitle('');
      setManualAuthors('');
      setManualIsbn('');
      setManualTags('');
      store.notify('Book added to your family library!', 'success');
    } catch (err) {
      setManualError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportSampleStarter = async () => {
    setImportingSample(true);
    try {
      await store.importSampleCollectionAdditive({
        assignToProfileId: primaryProfileId || activeProfile?.id || '',
      });
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
    store.notify(
      `Added "${candidate.title}" to ${status === 'owned' ? 'Library' : 'Wishlist'}`,
      'success'
    );
  };

  const isStreaming = scannerState.phase === 'streaming';
  const isStarting = scannerState.phase === 'starting-camera';
  const isAnalyzing = scannerState.phase === 'analyzing-upload';
  const isLocked = scannerState.phase === 'locked' && Boolean(scannerState.lock);

  const methodOptions: Array<{
    id: LibraryMethodId;
    label: string;
    desc: string;
    icon: string;
  }> = [
    {
      id: 'search',
      label: 'Search Title / ISBN',
      desc: 'Look up editions online',
      icon: 'search',
    },
    {
      id: 'barcode',
      label: 'Scan Barcode',
      desc: 'Camera EAN / ISBN',
      icon: 'scan',
    },
    {
      id: 'cover',
      label: 'Scan Book Cover',
      desc: 'Photo & OCR lookup',
      icon: 'photo',
    },
    {
      id: 'manual',
      label: 'Add Manually',
      desc: 'Offline or vintage',
      icon: 'edit',
    },
    {
      id: 'sample',
      label: 'Starter Collection',
      desc: '9 curated classics',
      icon: 'sparkles',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Live Library Counter + Cover Preview Strip */}
      <div className="rounded-2xl bg-linen-100/70 dark:bg-night-800/70 border border-linen-200 dark:border-night-700 p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-forest-700 dark:text-[#5ED3DA]">
              Library Progress
            </p>
            <p className="text-sm font-bold text-forest-900 dark:text-white mt-0.5 tabular-nums">
              {state.books.length === 0
                ? 'No books added yet — pick any method below'
                : `${state.books.length} ${state.books.length === 1 ? 'book' : 'books'} in your catalog`}
            </p>
          </div>
          {state.books.length > 0 && (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
              Ready for rotation
            </span>
          )}
        </div>

        {state.books.length > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {state.books.slice(0, 10).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setInspectedBookId(b.id)}
                title={`Inspect ${b.title}`}
                className="shrink-0 w-12 text-left group cursor-pointer focus-visible:outline-2 focus-visible:outline-forest-700 rounded-lg"
              >
                <BookCover
                  book={b}
                  size="sm"
                  aspectRatio="portrait"
                  showBadges={false}
                  hideRotationAdorno={true}
                />
              </button>
            ))}
            {state.books.length > 10 && (
              <span className="text-xs font-mono-tabular font-semibold text-stone-ink dark:text-slate-400 px-2 shrink-0">
                +{state.books.length - 10}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 5 Intake Method Cards */}
      <div
        role="tablist"
        aria-label="Ways to build your library"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2"
      >
        {methodOptions.map((opt) => {
          const active = activeMethod === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSelectMethod(opt.id)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                active
                  ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA] shadow-xs'
                  : 'bg-white dark:bg-night-900 border-linen-200 dark:border-night-800 text-forest-900 dark:text-white hover:border-forest-700/50'
              }`}
            >
              <Icon
                name={opt.icon}
                className={`w-4 h-4 ${
                  active
                    ? 'text-white dark:text-night-950'
                    : 'text-forest-700 dark:text-[#5ED3DA]'
                }`}
              />
              <div>
                <p className="text-xs font-bold leading-snug">{opt.label}</p>
                <p
                  className={`text-[11px] leading-tight mt-0.5 ${
                    active ? 'text-white/80 dark:text-night-950/75' : 'text-stone-ink dark:text-slate-400'
                  }`}
                >
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Method 1: Search */}
      {activeMethod === 'search' && (
        <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 space-y-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeUnifiedSearch(searchQuery, searchAuthor);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-7">
                <label className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                  Title or ISBN
                </label>
                <ClearableInput
                  id="onboarding-search-query"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="e.g. Where the Wild Things Are or 9780064431781"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                  Author (optional)
                </label>
                <ClearableInput
                  id="onboarding-search-author"
                  value={searchAuthor}
                  onValueChange={setSearchAuthor}
                  placeholder="e.g. Maurice Sendak"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="search" className="w-4 h-4" />
              <span>{isSearching ? 'Searching Catalogs…' : 'Search Books'}</span>
            </button>
          </form>

          {searchError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{searchError}</p>
          )}

          {isSearching && <SearchResultsSkeleton rows={3} />}

          {!isSearching && searchCandidates.length > 0 && (
            <div className="divide-y divide-linen-200/70 dark:divide-night-800 pt-1">
              {searchCandidates.map((cand, idx) => {
                const pseudo = { ...cand, id: `onb_cand_${idx}`, addedAt: '' };
                return (
                  <div
                    key={`${cand.isbn13 || cand.title}-${idx}`}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
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
                          {cand.publishedYear ? ` · ${cand.publishedYear}` : ''}
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
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Method 2 & 3: Barcode Camera / Book Cover Photo Scan */}
      {(activeMethod === 'barcode' || activeMethod === 'cover') && (
        <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-forest-900 dark:text-white">
                {activeMethod === 'barcode'
                  ? 'Scan Back-Cover ISBN Barcode'
                  : 'Photograph or Upload Book Cover'}
              </p>
              <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                {activeMethod === 'barcode'
                  ? 'Point your camera at an ISBN barcode or upload a photo of the barcode.'
                  : 'Capture the front jacket or upload a photo to extract the title or ISBN automatically.'}
              </p>
            </div>
          </div>

          <div className="relative h-52 sm:h-60 rounded-2xl bg-night-950 overflow-hidden flex flex-col items-center justify-center p-4 border border-night-800">
            {(isStreaming || isStarting) && (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}
            {scannerState.uploadedPreviewUrl && (
              <img
                src={scannerState.uploadedPreviewUrl}
                alt="Scanned upload preview"
                className="absolute inset-0 w-full h-full object-contain bg-night-950"
              />
            )}
            <div
              className={`relative z-10 border-2 border-dashed rounded-xl flex items-center justify-center px-4 text-center ${
                activeMethod === 'barcode' ? 'w-56 h-24' : 'w-36 h-44'
              } ${isLocked ? 'border-emerald-400 bg-emerald-950/30' : 'border-[#5ED3DA]/85 bg-night-950/35'}`}
            >
              <span className="text-[11px] font-mono-tabular text-[#FAF6EE]">
                {isSearching && pendingIsbn
                  ? `Looking up ${pendingIsbn}…`
                  : isAnalyzing
                    ? 'Reading photo…'
                    : isStarting
                      ? 'Starting camera…'
                      : isStreaming
                        ? activeMethod === 'barcode'
                          ? 'Align ISBN barcode'
                          : 'Center front cover'
                        : 'Camera idle · Start or upload photo'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
              {scannerState.errorMessage || searchError || scannerState.statusMessage}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {isStreaming ? (
                <>
                  <button
                    type="button"
                    onClick={() => scanner.stopCamera()}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Stop Camera
                  </button>
                  {activeMethod === 'cover' && (
                    <button
                      type="button"
                      onClick={() => scanner.captureCurrentFrame()}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Capture Cover
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={isStarting || isAnalyzing}
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      scanner.stopCamera();
                      setIsNativeScannerOpen(true);
                      return;
                    }
                    scanner.setMode(activeMethod === 'cover' ? 'cover' : 'barcode');
                    scanner.startCamera().catch(() => {});
                  }}
                  className="min-h-[48px] sm:min-h-[40px] px-4 sm:px-3.5 py-2 sm:py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 active:scale-[0.98] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Icon name="camera" className="w-4 h-4" />
                  <span>{isStarting ? 'Starting…' : 'Start Camera'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  scanner.stopCamera();
                  setIsNativeScannerOpen(true);
                }}
                className="hidden lg:inline-flex min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Icon name="scan" className="w-3.5 h-3.5" />
                <span>Full-Screen View</span>
              </button>

              <label
                htmlFor="onboarding-scan-upload"
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Icon name="upload" className="w-4 h-4" />
                <span>Upload Photo</span>
                <input
                  id="onboarding-scan-upload"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>

              {notFoundIsbn && (
                <button
                  type="button"
                  onClick={() => {
                    setManualIsbn(notFoundIsbn);
                    setNotFoundIsbn('');
                    setActiveMethod('manual');
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white cursor-pointer"
                >
                  Enter Manually
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Method 4: Manual Entry */}
      {activeMethod === 'manual' && (
        <form
          onSubmit={handleManualSubmit}
          className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 space-y-3 text-xs"
        >
          {manualError && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{manualError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Book Title *
              </label>
              <input
                type="text"
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="e.g. Goodnight Moon"
                className="w-full px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Author(s)
              </label>
              <input
                type="text"
                value={manualAuthors}
                onChange={(e) => setManualAuthors(e.target.value)}
                placeholder="e.g. Margaret Wise Brown"
                className="w-full px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Format
              </label>
              <select
                value={manualFormat}
                onChange={(e) => setManualFormat(e.target.value as BookFormat)}
                className="w-full px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
              >
                <option value="hardcover">Hardcover</option>
                <option value="board-book">Board Book</option>
                <option value="paperback">Paperback</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Reading Stage
              </label>
              <select
                value={manualStage}
                onChange={(e) => setManualStage(e.target.value as ReadingStage)}
                className="w-full px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
              >
                <option value="board-toddler">Board Book (Ages 0–3)</option>
                <option value="picture-book">Picture Book (Ages 3–6)</option>
                <option value="early-reader">Early Reader (Ages 5–8)</option>
                <option value="chapter-book">Chapter Book (Ages 7–12)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                  Min Age
                </label>
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={manualAgeMin}
                  onChange={(e) => setManualAgeMin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                  Max Age
                </label>
                <input
                  type="number"
                  min={1}
                  max={18}
                  value={manualAgeMax}
                  onChange={(e) => setManualAgeMax(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Topics (comma-separated)
              </label>
              <input
                type="text"
                value={manualTags}
                onChange={(e) => setManualTags(e.target.value)}
                placeholder="bedtime, animals, seasons"
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Save Book to Library</span>
          </button>
        </form>
      )}

      {/* Method 5: Start with Predefined Sample Collection (Additive) */}
      {activeMethod === 'sample' && (
        <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-bold text-forest-900 dark:text-white">
                Add Predefined Starter Collection (9 Books)
              </h3>
              <p className="text-xs text-stone-ink dark:text-slate-400 mt-1 leading-relaxed">
                Import 9 beloved children’s classics (picture books, board books, and early STEM
                favorites) right into your household library so you can try rotations immediately.
                Your household name and child profiles stay untouched.
              </p>
            </div>
            <button
              type="button"
              disabled={importingSample}
              onClick={handleImportSampleStarter}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              {importingSample ? 'Adding Starter Books…' : 'Add 9 Starter Books'}
            </button>
          </div>
        </div>
      )}

      {/* Full-Screen Native Camera Barcode Scanner Overlay */}
      <NativeBarcodeScannerModal
        isOpen={isNativeScannerOpen}
        initialMode={activeMethod === 'cover' ? 'cover' : 'barcode'}
        onDetectedIsbn={(isbn13) => {
          setIsNativeScannerOpen(false);
          executeIsbnLookup(isbn13);
        }}
        onDetectedTitle={(titleQuery) => {
          setIsNativeScannerOpen(false);
          setSearchQuery(titleQuery);
          setActiveMethod('search');
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
          scanner.resetLock();
        }}
        onEditManual={(cand) => {
          setManualTitle(cand.title);
          setManualAuthors(cand.authors.join(', '));
          setManualIsbn(cand.isbn13 || cand.isbn10 || '');
          setManualFormat(cand.format || 'hardcover');
          setManualAgeMin(String(cand.ageMin || 2));
          setManualAgeMax(String(cand.ageMax || 6));
          setFoundCandidate(null);
          setActiveMethod('manual');
        }}
        onClose={() => setFoundCandidate(null)}
      />
    </div>
  );
};
