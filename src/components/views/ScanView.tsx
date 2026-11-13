import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { BookCover } from '../common/BookCover.js';
import { FoundBookSheet } from '../modals/FoundBookSheet.js';
import {
  parseUnifiedCatalogQuery,
  resolveScanEntryState,
} from '../../features/scan/scan-shell-view.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';
import type {
  BookCondition,
  BookFormat,
  ReadingStage,
  ScanMode,
} from '../../types/models.js';
import { formatBookBinding } from '../../types/models.js';

const SCAN_MODES: Record<
  ScanMode,
  { label: string; caption: string; frameClass: string; hint: string }
> = {
  barcode: {
    label: 'Barcode / QR',
    caption: 'EAN-13 / ISBN & Book QR',
    frameClass: 'w-60 sm:w-80 h-24 sm:h-28 rounded-xl',
    hint: 'Center a back-cover ISBN barcode or library/bookstore QR code inside the guide.',
  },
  'isbn-ocr': {
    label: 'ISBN Text',
    caption: 'Printed ISBN-13 / ISBN-10 OCR',
    frameClass: 'w-60 sm:w-80 h-12 sm:h-14 rounded-lg',
    hint: 'Align the printed "ISBN 978-..." digits inside the narrow strip.',
  },
  cover: {
    label: 'Cover',
    caption: '3:4 jacket · OCR title/ISBN handoff',
    frameClass: 'w-36 sm:w-44 h-48 sm:h-56 rounded-2xl',
    hint: 'Frame the book cover and tap Capture Cover to extract title or ISBN.',
  },
};

export const ScanView: React.FC = () => {
  const { state, store, catalogService, scanner, activeProfile, routeParams } = useApp();

  const initialEntry = resolveScanEntryState(routeParams);
  const [activeTab, setActiveTab] = useState<'scanner' | 'search' | 'manual'>(
    initialEntry.intakeTab === 'isbn' ? 'search' : (initialEntry.intakeTab as any)
  );
  const [scanMode, setScanMode] = useState<ScanMode>(initialEntry.scanMode);
  const [scannerState, setScannerState] = useState(() => ({ ...scanner.getState() }));

  // Unified Search & ISBN state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAuthor, setSearchAuthor] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [pendingIsbn, setPendingIsbn] = useState('');
  const [notFoundIsbn, setNotFoundIsbn] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<BookCandidate[]>([]);
  const [searchError, setSearchError] = useState('');

  // Manual entry draft
  const [manualTitle, setManualTitle] = useState('');
  const [manualAuthors, setManualAuthors] = useState('');
  const [manualIsbn, setManualIsbn] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualPages, setManualPages] = useState('');
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

  // Found book bottom sheet
  const [foundCandidate, setFoundCandidate] = useState<BookCandidate | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastHandledLockRef = useRef<string>('');

  // Initialize browser support probe without forcing camera auto-start on mount
  useEffect(() => {
    scanner.initSupport().catch(() => {});
  }, [scanner]);

  // Subscribe to scanner controller state updates
  useEffect(() => {
    const unsub = scanner.subscribe(() => {
      const cur = scanner.getState();
      setScannerState({ ...cur });

      if (cur.phase === 'locked' && cur.lock) {
        const lockKey = `${cur.lock.lockedAt}:${cur.lock.kind}:${cur.lock.isbn13 || cur.lock.titleQuery || ''}`;
        if (lastHandledLockRef.current !== lockKey) {
          lastHandledLockRef.current = lockKey;
          if (cur.lock.kind === 'isbn' && cur.lock.isbn13) {
            executeIsbnLookup(cur.lock.isbn13);
          } else if (cur.lock.kind === 'cover-title' && cur.lock.titleQuery) {
            setSearchQuery(cur.lock.titleQuery);
            setActiveTab('search');
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

  // Attach MediaStream whenever live video element mounts
  useEffect(() => {
    if (
      activeTab === 'scanner' &&
      (scannerState.phase === 'starting-camera' || scannerState.phase === 'streaming') &&
      videoRef.current
    ) {
      scanner.attachVideoElement(videoRef.current);
    }
  }, [activeTab, scannerState.phase, scanner]);

  const handleSelectTab = (tabId: 'scanner' | 'search' | 'manual') => {
    if (tabId !== 'scanner') {
      scanner.stopCamera();
    }
    setActiveTab(tabId);
  };

  const handleSwitchGuide = (mode: ScanMode) => {
    setScanMode(mode);
    setNotFoundIsbn('');
    setSearchError('');
    scanner.setMode(mode);
  };

  const handleStartCamera = () => {
    setNotFoundIsbn('');
    setSearchError('');
    scanner.startCamera().catch(() => {});
  };

  const handleToggleTorch = async () => {
    try {
      const res = await scanner.toggleTorch();
      if (!res.ok && res.message) {
        store.notify(res.message, 'info');
      }
    } catch {
      // Ignored if hardware does not support torch
    }
  };

  const handleResetScanner = () => {
    setNotFoundIsbn('');
    setPendingIsbn('');
    setSearchError('');
    lastHandledLockRef.current = '';
    scanner.resetLock();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setNotFoundIsbn('');
    setSearchError('');
    try {
      await scanner.scanUploadedFile(file);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
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
        setSearchError(`No metadata found for ISBN ${isbn}.`);
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
      setSearchError('Please enter a book title, author, or ISBN.');
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
        setSearchError('No matching books found. Try shorter keywords or use camera scan.');
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
      const authors = manualAuthors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const tags = manualTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await store.addManualBook({
        title: manualTitle.trim(),
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        isbn: manualIsbn.trim() || undefined,
        publishedYear: manualYear ? Number(manualYear) : undefined,
        pageCount: manualPages ? Number(manualPages) : undefined,
        format: manualFormat,
        readingStage: manualStage,
        ageMin: Number(manualAgeMin),
        ageMax: Number(manualAgeMax),
        tags,
      });

      setManualTitle('');
      setManualAuthors('');
      setManualIsbn('');
      setManualYear('');
      setManualPages('');
      setManualTags('');
      store.notify('Book saved to your library!', 'success');
    } catch (err) {
      setManualError(err instanceof Error ? err.message : String(err));
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

  const activeMode = SCAN_MODES[scanMode] || SCAN_MODES.barcode;
  const isLocked = scannerState.phase === 'locked' && Boolean(scannerState.lock);
  const isStreaming = scannerState.phase === 'streaming';
  const isStarting = scannerState.phase === 'starting-camera';
  const isAnalyzingUpload = scannerState.phase === 'analyzing-upload';
  const isActiveSweep = isStreaming || isAnalyzingUpload;
  const canTapViewportToStart = !isStreaming && !isStarting && !isAnalyzingUpload;
  const isTorchOn = Boolean(scannerState.torchOn);

  const frameBorderClasses = isLocked
    ? 'border-2 border-emerald-400 bg-emerald-950/30 shadow-[0_0_0_4px_rgba(16,185,129,0.28)]'
    : isActiveSweep
      ? 'border-2 border-[#5ED3DA]/95 bg-transparent'
      : 'border-2 border-[#FAF6EE]/65 group-hover:border-[#5ED3DA] bg-night-950/25';

  const cornerAccentColor = isLocked ? 'border-emerald-300' : 'border-[#5ED3DA]';

  const sweepLineClasses = isLocked
    ? 'bg-emerald-400 top-1/2 -translate-y-1/2 h-0.5 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
    : isActiveSweep
      ? 'bg-[#5ED3DA] top-0 h-0.5 shadow-[0_0_12px_rgba(94,211,218,0.95)] animate-scan-sweep'
      : 'bg-[#FAF6EE]/30 top-1/2 -translate-y-1/2 h-px';

  let lockReadoutText = canTapViewportToStart
    ? `Tap Frame to Start · ${activeMode.label}`
    : activeMode.label;
  if (isSearching && pendingIsbn) {
    lockReadoutText = `Looking up ISBN ${pendingIsbn}…`;
  } else if (isLocked && scannerState.lock) {
    lockReadoutText =
      scannerState.lock.kind === 'isbn'
        ? `Locked · ISBN ${scannerState.lock.isbn13}`
        : `Locked · "${scannerState.lock.titleQuery}"`;
  } else if (isAnalyzingUpload) {
    lockReadoutText = 'Scanning photo…';
  } else if (isStarting) {
    lockReadoutText = 'Starting camera…';
  }

  // Keep the center of the guide unobstructed while live camera video is streaming
  const showCenterBadge = !isStreaming || isLocked || (isSearching && Boolean(pendingIsbn));

  const viewportInner = (
    <>
      {(isStreaming || isStarting) && (
        <video
          id="scanner-live-video"
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="block absolute inset-0 z-0 w-full h-full object-cover pointer-events-none"
        />
      )}

      {scannerState.uploadedPreviewUrl && (
        <img
          src={scannerState.uploadedPreviewUrl}
          alt="Uploaded book scan preview"
          className="absolute inset-0 z-0 w-full h-full object-contain bg-night-950"
        />
      )}

      <div
        data-scan-guide={scanMode}
        data-scan-locked={isLocked ? 'true' : 'false'}
        className={`relative z-10 flex items-center justify-center ${frameBorderClasses} ${activeMode.frameClass} transition-all duration-150`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1.5 left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 rounded-tl-xs ${cornerAccentColor}`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1.5 right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 rounded-tr-xs ${cornerAccentColor}`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-1.5 left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 rounded-bl-xs ${cornerAccentColor}`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-1.5 right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 rounded-br-xs ${cornerAccentColor}`}
        />

        <div className={`pointer-events-none absolute inset-x-2 ${sweepLineClasses}`} />

        {showCenterBadge && (
          <span
            className={`px-3 py-1 rounded-full bg-night-950/85 border border-[#FAF6EE]/15 text-[11px] font-mono-tabular tracking-wide inline-flex items-center gap-1.5 text-center ${
              isLocked ? 'text-emerald-300 font-semibold' : 'text-[#FAF6EE]'
            }`}
          >
            {canTapViewportToStart && !isLocked && !(isSearching && pendingIsbn) && (
              <Icon name="camera" className="w-3.5 h-3.5 text-[#5ED3DA]" />
            )}
            <span>{lockReadoutText}</span>
          </span>
        )}
      </div>

      <span className="relative z-10 mt-3 px-3 py-1 rounded-full bg-night-950/75 text-[11px] text-[#FAF6EE]/90 text-center max-w-sm">
        {activeMode.hint}
      </span>
    </>
  );

  return (
    <div className="space-y-4 text-left max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white">
          Scan &amp; Add Books
        </h1>
        <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
          Scan barcode or cover, search online metadata, or add offline books manually.
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-800 text-xs font-semibold">
        {[
          { id: 'scanner', label: 'Camera', icon: 'scan' },
          { id: 'search', label: 'Search & ISBN', icon: 'search' },
          { id: 'manual', label: 'Manual', icon: 'edit' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-action="select-intake-tab"
              aria-pressed={isActive}
              onClick={() => handleSelectTab(tab.id as any)}
              className={`flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                isActive
                  ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                  : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Live Optical Scanner & Photo Upload */}
      {activeTab === 'scanner' && (
        <section
          aria-label="Camera and photo scanner"
          className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-3.5 sm:p-4 space-y-3"
        >
          {/* Top Optical Guide Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-1 items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-800 max-w-md">
              {(['barcode', 'isbn-ocr', 'cover'] as ScanMode[]).map((modeKey) => {
                const selected = scanMode === modeKey;
                return (
                  <button
                    key={modeKey}
                    type="button"
                    data-action="select-scan-mode"
                    data-scan-mode={modeKey}
                    aria-pressed={selected}
                    onClick={() => handleSwitchGuide(modeKey)}
                    className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      selected
                        ? 'bg-forest-900 text-ivory dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs'
                        : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
                    }`}
                  >
                    {SCAN_MODES[modeKey].label}
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] font-medium text-stone-ink dark:text-slate-400">
              {activeMode.caption}
            </span>
          </div>

          {/* Optical Camera / Photo Viewfinder */}
          {canTapViewportToStart ? (
            <button
              type="button"
              data-action="start-camera-scan"
              aria-label={`Start camera in ${activeMode.label} mode`}
              onClick={handleStartCamera}
              className="group w-full relative h-60 sm:h-72 rounded-2xl bg-night-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-night-800 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.996]"
            >
              {viewportInner}
            </button>
          ) : (
            <div className="w-full relative h-60 sm:h-72 rounded-2xl bg-night-950 flex flex-col items-center justify-center overflow-hidden p-4 select-none border border-night-800">
              {viewportInner}
            </div>
          )}

          {/* Live Readout & Camera Action Dock */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
            <div className="min-w-0">
              <p
                role="status"
                aria-live="polite"
                className={`text-xs font-medium truncate ${
                  isLocked
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-forest-900 dark:text-slate-300'
                }`}
              >
                {isSearching && pendingIsbn
                  ? `Looking up ISBN ${pendingIsbn}…`
                  : scannerState.statusMessage}
              </p>
              {scannerState.ignoredHint && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                  {scannerState.ignoredHint}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isStreaming ? (
                <>
                  <button
                    type="button"
                    data-action="stop-camera-scan"
                    onClick={() => scanner.stopCamera()}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="close" className="w-4 h-4" />
                    <span>Stop</span>
                  </button>

                  {(scanMode === 'cover' || scanMode === 'isbn-ocr') && (
                    <button
                      type="button"
                      data-action="capture-live-frame"
                      onClick={() => scanner.captureCurrentFrame()}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Icon name="camera" className="w-4 h-4" />
                      <span>{scanMode === 'cover' ? 'Capture Cover' : 'Read ISBN'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    data-action="toggle-camera-torch"
                    onClick={handleToggleTorch}
                    aria-pressed={isTorchOn}
                    aria-label={isTorchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                    title="Toggle rear camera flashlight"
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                      isTorchOn
                        ? 'bg-amber-400 text-night-950 shadow-xs'
                        : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white'
                    }`}
                  >
                    <Icon
                      name={isTorchOn ? 'flashlightFilled' : 'flashlight'}
                      className="w-4 h-4"
                    />
                    <span>{isTorchOn ? 'Light On' : 'Flashlight'}</span>
                  </button>

                  <button
                    type="button"
                    data-action="flip-camera"
                    onClick={() => scanner.flipCamera()}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="flip" className="w-4 h-4" />
                    <span>Flip</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  data-action="start-camera-scan"
                  disabled={isStarting || isAnalyzingUpload}
                  onClick={handleStartCamera}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Icon name="camera" className="w-4 h-4" />
                  <span>{isStarting ? 'Starting…' : 'Start Camera'}</span>
                </button>
              )}

              <label
                htmlFor="scan-photo-upload-input"
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Icon name="photo" className="w-4 h-4" />
                <span>Upload Photo</span>
                <input
                  id="scan-photo-upload-input"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>

              {(isLocked || scannerState.uploadedPreviewUrl) && (
                <button
                  type="button"
                  data-action="reset-scanner"
                  onClick={handleResetScanner}
                  className="min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Scanned ISBN Not Found Manual Recovery */}
          {!isSearching && notFoundIsbn && (
            <div className="rounded-2xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-forest-900 dark:text-white">
                  Scanned ISBN <span className="font-mono-tabular">{notFoundIsbn}</span> wasn’t in
                  online catalogs
                </p>
                <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                  Finish adding it manually with the ISBN pre-filled, or tap Re-scan.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleResetScanner}
                  className="min-h-[42px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white whitespace-nowrap"
                >
                  Re-scan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualIsbn(notFoundIsbn);
                    setNotFoundIsbn('');
                    setActiveTab('manual');
                  }}
                  className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Complete Manually
                </button>
              </div>
            </div>
          )}

          {/* Error Recovery Banner */}
          {(scannerState.errorMessage || (searchError && !notFoundIsbn)) && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <p className="text-xs font-medium text-rose-800 dark:text-rose-200">
                {scannerState.errorMessage || searchError}
              </p>
              <button
                type="button"
                onClick={() => handleSelectTab('search')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white whitespace-nowrap shrink-0"
              >
                Search or Type ISBN
              </button>
            </div>
          )}

          {/* Scanner Engine Capabilities Summary */}
          {scannerState.support && (
            <details className="text-xs text-stone-ink dark:text-slate-400 pt-0.5">
              <summary className="cursor-pointer font-medium hover:text-forest-900 dark:hover:text-white select-none">
                Scanner engine · {scannerState.support.barcodeEngineLabel}
              </summary>
              <div className="mt-2 space-y-1 text-[11px] leading-relaxed">
                <p>
                  Camera API:{' '}
                  <strong className="text-forest-900 dark:text-white">
                    {scannerState.support.cameraApi ? 'Available' : 'Fallback to Upload'}
                  </strong>{' '}
                  · Barcode:{' '}
                  <strong className="text-forest-900 dark:text-white">
                    {scannerState.support.barcodeEngineLabel}
                  </strong>{' '}
                  · OCR:{' '}
                  <strong className="text-forest-900 dark:text-white">
                    {scannerState.support.webAssembly ? 'Tesseract WASM Ready' : 'Unavailable'}
                  </strong>
                </p>
                <p>
                  Chrome/Android use hardware <code>BarcodeDetector</code>; iOS Safari, Firefox,
                  and desktop browsers fall back to pure-JS ZXing + Tesseract WebAssembly OCR.
                </p>
              </div>
            </details>
          )}
        </section>
      )}

      {/* Tab 2: Unified Search & ISBN */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeUnifiedSearch(searchQuery, searchAuthor);
            }}
            className="space-y-3 bg-white dark:bg-night-900 p-4 rounded-2xl border border-linen-200 dark:border-night-700 shadow-xs"
          >
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                Book Title or ISBN
              </label>
              <ClearableInput
                id="provider-title-input"
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="e.g. Goodnight Moon, 9780064431781, or Oliver Jeffers"
                className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                Author (Optional)
              </label>
              <ClearableInput
                id="provider-author-input"
                value={searchAuthor}
                onValueChange={setSearchAuthor}
                placeholder="e.g. Maurice Sendak, Dr. Seuss"
                className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700"
              />
            </div>

            <button
              type="submit"
              disabled={isSearching}
              className="w-full py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
            >
              <Icon name="search" className="w-4 h-4" />
              <span>{isSearching ? 'Searching Providers…' : 'Find Book Online'}</span>
            </button>
          </form>

          {searchError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{searchError}</p>
          )}

          {/* Search Result Candidates */}
          {searchCandidates.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="font-display font-bold text-sm text-forest-900 dark:text-white">
                Matching Books ({searchCandidates.length})
              </h3>

              <div className="divide-y divide-linen-200/80 dark:divide-night-800">
                {searchCandidates.map((cand, i) => {
                  const pseudoBook = {
                    ...cand,
                    id: `cand_${i}`,
                    addedAt: '',
                  };
                  return (
                    <article
                      key={`${cand.isbn13 || cand.title}-${i}`}
                      className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <BookCover
                          book={pseudoBook as any}
                          size="sm"
                          aspectRatio={state.settings?.coverAspectRatio || 'portrait'}
                        />
                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-sm text-forest-900 dark:text-white leading-snug">
                            {cand.title}
                          </h4>
                          <p className="text-xs text-stone-ink dark:text-slate-400 truncate mt-0.5">
                            {cand.authors.join(', ')}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400 mt-1">
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
                      </div>

                      <button
                        type="button"
                        onClick={() => setFoundCandidate(cand)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white font-semibold text-xs shrink-0 transition-colors"
                      >
                        Add Book
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Offline Manual Entry */}
      {activeTab === 'manual' && (
        <form
          onSubmit={handleManualSubmit}
          className="space-y-3 bg-white dark:bg-night-900 p-4 sm:p-5 rounded-2xl border border-linen-200 dark:border-night-700 shadow-xs text-xs"
        >
          {manualError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{manualError}</p>
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
                placeholder="Title"
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Authors (comma-separated)
              </label>
              <input
                type="text"
                value={manualAuthors}
                onChange={(e) => setManualAuthors(e.target.value)}
                placeholder="Author name"
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                ISBN (Optional)
              </label>
              <input
                type="text"
                value={manualIsbn}
                onChange={(e) => setManualIsbn(e.target.value)}
                placeholder="978…"
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Format
              </label>
              <select
                value={manualFormat}
                onChange={(e) => setManualFormat(e.target.value as BookFormat)}
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-semibold"
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
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-semibold"
              >
                <option value="board-toddler">Board Book (0–3)</option>
                <option value="picture-book">Picture Book (3–6)</option>
                <option value="early-reader">Early Reader (5–8)</option>
                <option value="chapter-book">Chapter Book (7–12)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                  Min Age
                </label>
                <input
                  type="number"
                  value={manualAgeMin}
                  onChange={(e) => setManualAgeMin(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                  Max Age
                </label>
                <input
                  type="number"
                  value={manualAgeMax}
                  onChange={(e) => setManualAgeMax(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Published Year
              </label>
              <input
                type="number"
                value={manualYear}
                onChange={(e) => setManualYear(e.target.value)}
                placeholder="e.g. 2021"
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Page Count
              </label>
              <input
                type="number"
                value={manualPages}
                onChange={(e) => setManualPages(e.target.value)}
                placeholder="e.g. 32"
                className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={manualTags}
              onChange={(e) => setManualTags(e.target.value)}
              placeholder="e.g. bedtime, animals, rhyming"
              className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Save Book to Library</span>
          </button>
        </form>
      )}

      {/* Found Book Bottom Sheet */}
      <FoundBookSheet
        candidate={foundCandidate}
        isOpen={Boolean(foundCandidate)}
        onAddOwned={(cand, opts) => handleAddCandidate(cand, 'owned', opts)}
        onAddWishlist={(cand, opts) => handleAddCandidate(cand, 'wishlist', opts)}
        onRescan={() => {
          setFoundCandidate(null);
          handleResetScanner();
          setActiveTab('scanner');
        }}
        onEditManual={(cand) => {
          setManualTitle(cand.title);
          setManualAuthors(cand.authors.join(', '));
          setManualIsbn(cand.isbn13 || cand.isbn10 || '');
          setManualYear(cand.publishedYear ? String(cand.publishedYear) : '');
          setManualPages(cand.pageCount ? String(cand.pageCount) : '');
          setManualFormat(cand.format || 'hardcover');
          setManualAgeMin(String(cand.ageMin || 2));
          setManualAgeMax(String(cand.ageMax || 6));
          setFoundCandidate(null);
          setActiveTab('manual');
        }}
        onClose={() => setFoundCandidate(null)}
      />
    </div>
  );
};
