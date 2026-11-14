import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import type { Book, ChildProfile, RotationList } from '../../types/models.js';

export type PassportLayoutMode = 'passport' | 'bingo' | 'track';
export type PassportTheme = 'classic' | 'explorer' | 'forest' | 'ink-saver';

interface ReadingPassportStudioProps {
  onClose: () => void;
}

const DIGITAL_STAMPS = [
  { id: 'read-it', label: 'Read It!', icon: 'check', color: 'bg-emerald-600 text-white border-emerald-700' },
  { id: 'favorite', label: 'Favorite! ❤️', icon: 'heartFilled', color: 'bg-rose-600 text-white border-rose-700' },
  { id: 'star-reader', label: '5 Stars ⭐️', icon: 'starFilled', color: 'bg-amber-500 text-white border-amber-600' },
  { id: 'explorer', label: 'Explorer 🚀', icon: 'compass', color: 'bg-indigo-600 text-white border-indigo-700' },
  { id: 'champion', label: 'Story Champ 🏆', icon: 'award', color: 'bg-yellow-600 text-white border-yellow-700' },
];

const BINGO_CHALLENGES = [
  { title: 'Read in a blanket fort ⛺', subtitle: 'Build a cozy hideaway with pillows' },
  { title: 'Flashlight storytime 🔦', subtitle: 'Dim the lights and read under covers' },
  { title: 'Read aloud in silly voices 🦁', subtitle: 'Make different voices for characters' },
  { title: 'Read outside in the sun 🌳', subtitle: 'Bring your book to the lawn or porch' },
  { title: 'Read with a favorite toy 🧸', subtitle: 'Introduce your book to a stuffed animal' },
  { title: 'Bedtime double-feature 🌙', subtitle: 'Read two wonderful stories before sleep' },
  { title: 'Read while having a snack 🍎', subtitle: 'Enjoy a tasty treat during storytime' },
];

export const ReadingPassportStudio: React.FC<ReadingPassportStudioProps> = ({ onClose }) => {
  const { state, activeProfile, activeRotation } = useApp();

  // Layout & Styling state
  const [layoutMode, setLayoutMode] = useState<PassportLayoutMode>('passport');
  const [theme, setTheme] = useState<PassportTheme>('classic');
  const [customTitle, setCustomTitle] = useState('');
  const [scope, setScope] = useState<'active-shelf' | 'saved-rotation' | 'all-library'>('active-shelf');
  const [selectedRotationId, setSelectedRotationId] = useState<string>(activeRotation?.id || '');
  const [bookLimit, setBookLimit] = useState(8);
  const [showCoverThumbnails, setShowCoverThumbnails] = useState(true);
  const [showColorRatingStars, setShowColorRatingStars] = useState(true);
  const [selectedStampId, setSelectedStampId] = useState<string>('read-it');

  // Digital stamping map: { [bookOrTileId]: stampId }
  const [stampedMap, setStampedMap] = useState<Record<string, string>>({});

  // Resolve pool of books according to selected scope
  const availableBooks = useMemo(() => {
    if (scope === 'active-shelf') {
      if (activeRotation && activeRotation.bookIds.length > 0) {
        const idSet = new Set(activeRotation.bookIds);
        return state.books.filter((b) => idSet.has(b.id));
      }
      return state.books.slice(0, bookLimit);
    }

    if (scope === 'saved-rotation') {
      const rot = state.rotations.find((r) => r.id === selectedRotationId);
      if (rot && rot.bookIds.length > 0) {
        const idSet = new Set(rot.bookIds);
        return state.books.filter((b) => idSet.has(b.id));
      }
    }

    // 'all-library' or fallback
    return state.books.filter((b) => !b.excludeFromRotations && b.collectionStatus !== 'wishlist');
  }, [state.books, state.rotations, scope, activeRotation, selectedRotationId, bookLimit]);

  const activeBooks = useMemo(() => {
    return availableBooks.slice(0, bookLimit);
  }, [availableBooks, bookLimit]);

  const readerName = activeProfile?.name || 'Young Reader';
  const displayTitle = customTitle.trim() || `${readerName}’s Reading Passport`;
  const issuedDate = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const passportNumber = `LR-${activeProfile?.id ? activeProfile.id.slice(0, 6).toUpperCase() : '2026'}`;

  // Stamping toggle
  const handleToggleStamp = (tileId: string) => {
    setStampedMap((prev) => {
      const copy = { ...prev };
      if (copy[tileId]) {
        delete copy[tileId];
      } else {
        copy[tileId] = selectedStampId;
      }
      return copy;
    });
  };

  const handleClearAllStamps = () => {
    setStampedMap({});
  };

  // Browser Print trigger
  const handlePrint = () => {
    window.print();
  };

  // Standalone HTML Download
  const handleDownloadHtml = () => {
    const printableElement = document.getElementById('reading-passport-printable-doc');
    if (!printableElement) return;

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${displayTitle}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #1a2423; margin: 0; padding: 16px; }
    .print-sheet { max-width: 800px; margin: 0 auto; }
    .page-break { page-break-after: always; break-after: page; }
    .stamp-circle { border: 2px dashed #94a3b8; border-radius: 9999px; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center; text-align: center; }
    img { max-width: 100%; height: auto; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style>
</head>
<body>
  <div class="print-sheet">
    ${printableElement.innerHTML}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reading-passport-${readerName.toLowerCase().replace(/\s+/g, '-')}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Theme styling presets
  const themeClasses = useMemo(() => {
    switch (theme) {
      case 'explorer':
        return {
          wrapper: 'bg-amber-50/70 border-amber-300 text-amber-950',
          headerBg: 'bg-linear-to-r from-amber-700 via-amber-800 to-amber-900 text-amber-50',
          accent: 'text-amber-800',
          card: 'bg-white border-amber-200 shadow-xs',
          stampBorder: 'border-amber-400 text-amber-700',
        };
      case 'forest':
        return {
          wrapper: 'bg-emerald-50/50 border-emerald-300 text-emerald-950',
          headerBg: 'bg-linear-to-r from-emerald-800 via-forest-900 to-forest-950 text-white',
          accent: 'text-emerald-800',
          card: 'bg-white border-emerald-200 shadow-xs',
          stampBorder: 'border-emerald-400 text-emerald-700',
        };
      case 'ink-saver':
        return {
          wrapper: 'bg-white border-stone-400 text-black',
          headerBg: 'bg-white border-b-2 border-black text-black',
          accent: 'text-black',
          card: 'bg-white border-stone-300',
          stampBorder: 'border-black border-dashed text-black',
        };
      case 'classic':
      default:
        return {
          wrapper: 'bg-stone-50 border-linen-300 text-stone-900',
          headerBg: 'bg-linear-to-r from-forest-900 via-night-900 to-forest-950 text-ivory',
          accent: 'text-forest-800',
          card: 'bg-white border-linen-200 shadow-xs',
          stampBorder: 'border-stone-400 text-stone-700',
        };
    }
  }, [theme]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Print Hide CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #reading-passport-printable-doc,
          #reading-passport-printable-doc * {
            visibility: visible;
          }
          #reading-passport-printable-doc {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      {/* Control Bar (Hidden on print) */}
      <div className="no-print space-y-4 rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 p-4 sm:p-6 shadow-sm">
        {/* Top Title & Close */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-linen-200/80 dark:border-night-800">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-forest-900/10 dark:bg-[#5ED3DA]/20 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center">
              <Icon name="stamp" className="w-5 h-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-forest-900 dark:text-white">
                Reading Passport &amp; Stamp Studio
              </h2>
              <p className="text-xs text-stone-ink dark:text-slate-400">
                Design, customize, and print physical passports &amp; bingo cards for {readerName}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Icon name="printer" className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Studio"
              className="w-9 h-9 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Layout Mode Selector */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
            Activity Format
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'passport' as const, label: 'Official Passport', icon: 'book', desc: 'Travel booklet with visas' },
              { id: 'bingo' as const, label: 'Story Bingo Card', icon: 'grid', desc: '3×3 card with challenges' },
              { id: 'track' as const, label: 'Sticker Road Track', icon: 'award', desc: 'Numbered milestone trail' },
            ].map((mode) => {
              const active = layoutMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setLayoutMode(mode.id)}
                  className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                    active
                      ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 border-transparent shadow-xs'
                      : 'bg-linen-50 dark:bg-night-800/60 border-linen-200 dark:border-night-700 hover:bg-linen-100 text-stone-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name={mode.icon} className="w-4 h-4" />
                    <span className="font-bold text-xs">{mode.label}</span>
                  </div>
                  <p className={`text-[10px] leading-tight ${active ? 'opacity-85' : 'text-stone-ink dark:text-slate-400'}`}>
                    {mode.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customization Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Source Book Pool */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
              Books Source
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
              className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white"
            >
              <option value="active-shelf">Active Shelf ({activeRotation ? activeRotation.bookIds.length : '0'} books)</option>
              <option value="saved-rotation">Saved Rotation Shelf</option>
              <option value="all-library">Entire Family Library</option>
            </select>
          </div>

          {/* Theme Palette */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
              Design Theme
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white"
            >
              <option value="classic">Classic Royal Passport</option>
              <option value="explorer">Adventure Explorer (Gold)</option>
              <option value="forest">Forest Meadow (Emerald)</option>
              <option value="ink-saver">Printer Ink-Saver (B&amp;W)</option>
            </select>
          </div>

          {/* Book Count Slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
                Book Slots
              </label>
              <span className="text-xs font-mono font-bold text-forest-900 dark:text-white">
                {bookLimit} books
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={16}
              step={2}
              value={bookLimit}
              onChange={(e) => setBookLimit(Number(e.target.value))}
              className="w-full accent-forest-700 dark:accent-[#5ED3DA] cursor-pointer"
            />
          </div>
        </div>

        {/* Options Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-linen-200/70 dark:border-night-800">
          <div className="flex items-center gap-4 text-xs font-medium text-stone-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showCoverThumbnails}
                onChange={(e) => setShowCoverThumbnails(e.target.checked)}
                className="w-4 h-4 rounded text-forest-700 accent-forest-700"
              />
              <span>Include Cover Artwork</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showColorRatingStars}
                onChange={(e) => setShowColorRatingStars(e.target.checked)}
                className="w-4 h-4 rounded text-forest-700 accent-forest-700"
              />
              <span>Include 5-Star Coloring Bubbles</span>
            </label>
          </div>

          {/* Digital Stamp Palette */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">
              Interactive Stamp:
            </span>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
              {DIGITAL_STAMPS.map((stamp) => (
                <button
                  key={stamp.id}
                  type="button"
                  onClick={() => setSelectedStampId(stamp.id)}
                  title={stamp.label}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    selectedStampId === stamp.id ? 'ring-2 ring-forest-700 scale-110 shadow-xs' : 'opacity-70 hover:opacity-100'
                  } ${stamp.color}`}
                >
                  <Icon name={stamp.icon} className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            {Object.keys(stampedMap).length > 0 && (
              <button
                type="button"
                onClick={handleClearAllStamps}
                className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold underline ml-1 cursor-pointer"
              >
                Clear Stamps
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icon name="download" className="w-3.5 h-3.5" />
            <span>Download Standalone HTML</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
          >
            <Icon name="printer" className="w-4 h-4" />
            <span>Print Activity Sheet Now</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* PRINTABLE DOCUMENT AREA                                            */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="reading-passport-printable-doc"
        className={`p-6 sm:p-10 rounded-3xl border-2 transition-all space-y-8 ${themeClasses.wrapper}`}
      >
        {/* ================================================================ */}
        {/* FORMAT A: OFFICIAL PASSPORT BOOKLET                               */}
        {/* ================================================================ */}
        {layoutMode === 'passport' && (
          <div className="space-y-8">
            {/* Passport Identity Page */}
            <div className={`p-6 sm:p-8 rounded-2xl border ${themeClasses.card} relative overflow-hidden`}>
              {/* Official Guilloche Watermark Motif */}
              <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full border-8 border-forest-900/5 dark:border-white/5 pointer-events-none" />

              {/* Passport Header Banner */}
              <div className={`-mx-6 sm:-mx-8 -mt-6 sm:-mt-8 px-6 sm:px-8 py-5 mb-6 rounded-t-2xl ${themeClasses.headerBg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] tracking-[0.25em] uppercase font-bold opacity-80">
                      Republic of Stories · Official Family Library
                    </p>
                    <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
                      {displayTitle}
                    </h1>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs tracking-wider opacity-90 block">
                      NO. {passportNumber}
                    </span>
                    <span className="text-[10px] opacity-75">
                      Issued: {issuedDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reader Photo & Identification Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 items-center">
                {/* Photo / Avatar Box */}
                <div className="sm:col-span-1 flex flex-col items-center">
                  <div className="w-28 h-36 rounded-xl border-2 border-dashed border-stone-400 bg-linen-50 flex flex-col items-center justify-center p-3 text-center relative overflow-hidden">
                    <span className="text-4xl select-none mb-1">
                      {activeProfile?.avatarTone === 'amber' ? '🦁' : activeProfile?.avatarTone === 'rose' ? '🦊' : '🦉'}
                    </span>
                    <span className="text-[10px] font-bold text-stone-600 uppercase">
                      Reader Photo
                    </span>
                    <span className="text-[9px] text-stone-400">
                      or draw self
                    </span>
                  </div>
                  <span className="text-[10px] font-mono mt-1 text-stone-500">
                    BEARER: {readerName.toUpperCase()}
                  </span>
                </div>

                {/* Identity Particulars */}
                <div className="sm:col-span-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-500">
                        Explorer Name
                      </p>
                      <p className="font-display font-bold text-base text-forest-900">
                        {readerName}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-500">
                        Reading Level
                      </p>
                      <p className="font-bold text-sm text-forest-900 capitalize">
                        {activeProfile?.readingStage?.replace('-', ' ') || 'Story Explorer'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-stone-500">
                        Passport Status
                      </p>
                      <p className="font-bold text-sm text-emerald-700">
                        ✓ Certified Active
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-linen-200">
                    <p className="text-xs italic text-stone-600 leading-relaxed">
                      “This passport certifies that the bearer is authorized to journey through books, discover great stories, and collect official stamps upon finishing each book.”
                    </p>
                  </div>

                  {/* Signature line */}
                  <div className="pt-2 flex items-center justify-between text-xs text-stone-600">
                    <span>Target: {activeBooks.length} Books to Explore</span>
                    <span className="font-serif italic border-b border-stone-400 pb-0.5 min-w-[140px] text-center">
                      X: {readerName}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Book Visa Entry Stamp Pages */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-base text-forest-900">
                  Book Visas &amp; Journey Stamps ({activeBooks.length} Entries)
                </h3>
                <span className="text-xs text-stone-500">
                  Stamp or place a sticker in each ring upon reading!
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeBooks.map((book, idx) => {
                  const stampKey = `book-${book.id}`;
                  const stampedId = stampedMap[stampKey];
                  const activeStamp = DIGITAL_STAMPS.find((s) => s.id === stampedId);

                  return (
                    <div
                      key={book.id}
                      onClick={() => handleToggleStamp(stampKey)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-4 relative overflow-hidden ${themeClasses.card} hover:border-forest-700`}
                    >
                      {/* Book Thumbnail */}
                      {showCoverThumbnails && (
                        <div className="w-16 sm:w-20 shrink-0 aspect-[3/4] rounded-lg overflow-hidden shadow-2xs border border-linen-200 bg-linen-100">
                          <BookCover book={book} size="sm" aspectRatio="portrait" />
                        </div>
                      )}

                      {/* Details & Coloring Stars */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <span className="text-[10px] font-mono text-stone-500 uppercase">
                          Visa 0{idx + 1} · {book.format || 'Story'}
                        </span>
                        <h4 className="font-display font-bold text-sm text-forest-900 truncate">
                          {book.title}
                        </h4>
                        <p className="text-xs text-stone-600 truncate">
                          {book.authors?.[0] || 'Unknown author'}
                        </p>

                        <div className="text-[11px] text-stone-500 pt-1">
                          Date Read: <span className="border-b border-stone-400 inline-block w-20"></span>
                        </div>

                        {showColorRatingStars && (
                          <div className="pt-1 flex items-center gap-1 text-stone-400">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <span key={star} className="text-sm">☆</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Official Stamp Drop Zone */}
                      <div className="shrink-0 flex flex-col items-center justify-center">
                        <div
                          className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 flex flex-col items-center justify-center text-center p-1 transition-transform ${
                            activeStamp
                              ? `${activeStamp.color} rotate-[-6deg] shadow-md border-solid`
                              : `border-dashed ${themeClasses.stampBorder} bg-linen-50/50`
                          }`}
                        >
                          {activeStamp ? (
                            <>
                              <Icon name={activeStamp.icon} className="w-5 h-5 mb-0.5" />
                              <span className="text-[9px] font-bold leading-tight uppercase">
                                {activeStamp.label}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[8px] font-bold uppercase tracking-wider opacity-60">
                                OFFICIAL
                              </span>
                              <span className="text-[9px] font-bold uppercase leading-tight">
                                STAMP
                              </span>
                              <span className="text-[7px] opacity-75">
                                HERE
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* FORMAT B: STORYTIME READING BINGO CARD                            */}
        {/* ================================================================ */}
        {layoutMode === 'bingo' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-2xl border text-center ${themeClasses.headerBg}`}>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {readerName}’s Storytime Reading Bingo!
              </h1>
              <p className="text-xs opacity-90 mt-1 max-w-lg mx-auto">
                Complete any 3-in-a-row (horizontal, vertical, or diagonal) to earn a special storytime prize!
              </p>
            </div>

            {/* 3x3 Bingo Grid */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
                const isCenter = index === 4;
                const book = !isCenter
                  ? activeBooks[index > 4 ? index - 1 : index] || activeBooks[0]
                  : null;
                const challenge = !book && !isCenter ? BINGO_CHALLENGES[index % BINGO_CHALLENGES.length] : null;

                const tileId = `bingo-tile-${index}`;
                const stampedId = stampedMap[tileId];
                const activeStamp = DIGITAL_STAMPS.find((s) => s.id === stampedId);

                return (
                  <div
                    key={index}
                    onClick={() => handleToggleStamp(tileId)}
                    className={`aspect-square p-2.5 sm:p-3.5 rounded-2xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer relative overflow-hidden select-none ${
                      isCenter
                        ? 'bg-amber-100/90 border-amber-300 text-amber-950 font-bold shadow-inner'
                        : `${themeClasses.card} hover:border-forest-700`
                    }`}
                  >
                    {isCenter ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2">
                        <span className="text-3xl mb-1">⭐️</span>
                        <span className="font-display font-bold text-xs sm:text-sm uppercase text-amber-900 leading-tight">
                          FREE SPACE
                        </span>
                        <span className="text-[10px] text-amber-800 mt-1">
                          Any Favorite Book!
                        </span>
                      </div>
                    ) : book ? (
                      <>
                        <div className="w-10 sm:w-14 aspect-[3/4] rounded shadow-2xs overflow-hidden shrink-0 border border-linen-200 bg-linen-50">
                          <BookCover book={book} size="sm" aspectRatio="portrait" />
                        </div>
                        <p className="font-display font-bold text-[11px] sm:text-xs text-forest-900 truncate w-full mt-1">
                          {book.title}
                        </p>
                        <span className="text-[9px] text-stone-500 truncate w-full">
                          {book.authors?.[0] || 'Book'}
                        </span>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center">
                        <span className="text-2xl mb-1">📖</span>
                        <p className="font-bold text-[11px] text-forest-900">
                          {challenge?.title || 'Story Challenge'}
                        </p>
                        <p className="text-[9px] text-stone-500 mt-0.5">
                          {challenge?.subtitle || 'Read together'}
                        </p>
                      </div>
                    )}

                    {/* Stamp Overlay or Circle */}
                    <div className="mt-1">
                      {activeStamp ? (
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${activeStamp.color} shadow-xs rotate-[-5deg]`}>
                          {activeStamp.label}
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-dashed border-stone-400 flex items-center justify-center text-[8px] text-stone-400">
                          ◯
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* FORMAT C: STICKER ROAD & MILESTONE TRAIL                          */}
        {/* ================================================================ */}
        {layoutMode === 'track' && (
          <div className="space-y-6">
            <div className={`p-6 rounded-2xl border text-center ${themeClasses.headerBg}`}>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {readerName}’s Storybook Reading Trail
              </h1>
              <p className="text-xs opacity-90 mt-1">
                Follow the trail from book to book! Collect stickers at each stop to reach the Golden Castle!
              </p>
            </div>

            {/* Trail Steps */}
            <div className="space-y-3">
              {activeBooks.map((book, idx) => {
                const stepKey = `track-step-${idx}`;
                const stampedId = stampedMap[stepKey];
                const activeStamp = DIGITAL_STAMPS.find((s) => s.id === stampedId);
                const isMilestone = (idx + 1) % 3 === 0;

                return (
                  <div
                    key={book.id}
                    onClick={() => handleToggleStamp(stepKey)}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-4 transition-all cursor-pointer select-none ${
                      isMilestone ? 'bg-amber-50/90 border-amber-300 shadow-xs' : themeClasses.card
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Step Number Badge */}
                      <span className={`w-8 h-8 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                        isMilestone ? 'bg-amber-600 text-white shadow-xs' : 'bg-linen-200 text-stone-800'
                      }`}>
                        {idx + 1}
                      </span>

                      {/* Cover Thumbnail */}
                      <div className="w-12 aspect-[3/4] rounded overflow-hidden shadow-2xs border border-linen-200 shrink-0">
                        <BookCover book={book} size="sm" aspectRatio="portrait" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0">
                        <h4 className="font-display font-bold text-xs sm:text-sm text-forest-900 truncate">
                          {book.title}
                        </h4>
                        <p className="text-[11px] text-stone-600 truncate">
                          {book.authors?.[0] || 'Unknown author'}
                        </p>
                        {isMilestone && (
                          <span className="text-[10px] font-bold text-amber-800 inline-block mt-0.5">
                            ⭐️ Milestone Reward: Special Bedtime Treat or Library Badge!
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Circular Stamp Drop Zone */}
                    <div className="shrink-0">
                      <div className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-center p-1 ${
                        activeStamp
                          ? `${activeStamp.color} rotate-[-5deg] shadow-sm border-solid`
                          : 'border-dashed border-stone-400 bg-linen-50/50 text-stone-400 text-[8px] font-bold'
                      }`}>
                        {activeStamp ? (
                          <Icon name={activeStamp.icon} className="w-5 h-5" />
                        ) : (
                          <span>STICKER HERE</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer for Physical Handouts */}
        <div className="pt-4 border-t border-linen-300/80 flex items-center justify-between text-[10px] text-stone-500">
          <span>Created with Library Rotation · Family Book Passport</span>
          <span>Printed for {readerName} · {issuedDate}</span>
        </div>
      </div>
    </div>
  );
};
