import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import type { Book } from '../../types/models.js';
import {
  DEFAULT_PASSPORT_PRESETS,
  PASSPORT_STAMPS,
  PASSPORT_ACHIEVEMENTS,
  PRINTABLE_STICKER_TOKENS,
  type PassportLayoutMode,
  type PassportThemeKey,
  type PassportPreset,
  type PassportBookItem,
} from '../../config/passport-presets.js';
import {
  getAllPassportPresets,
  saveCustomPreset,
  deleteCustomPreset,
  generateStandalonePassportHtml,
  sharePassportDocument,
} from '../../features/play/passport-service.js';

interface ReadingPassportStudioProps {
  onClose: () => void;
}

interface CustomCertificateStyle {
  bgType: 'parchment' | 'stars' | 'gradient' | 'meadow' | 'custom';
  customImageUrl: string;
  bgBlur: number;
  bgOpacity: number;
  borderStyle: 'filigree' | 'double' | 'vintage' | 'minimal';
  emblem: 'ribbon' | 'crown' | 'wand' | 'owl' | 'star' | 'compass';
  parentSigner: string;
  librarianSigner: string;
  dedicationText: string;
}

export const ReadingPassportStudio: React.FC<ReadingPassportStudioProps> = ({ onClose }) => {
  const { state, activeProfile, activeRotation } = useApp();

  // Presets & Templates state
  const [allPresets, setAllPresets] = useState<PassportPreset[]>(() => getAllPassportPresets());
  const [activePresetId, setActivePresetId] = useState<string>('preset-harry-potter');
  const [showPresetBrowser, setShowPresetBrowser] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [newPresetTitle, setNewPresetTitle] = useState('');
  const [newPresetSeries, setNewPresetSeries] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');

  // Layout & Theme state
  const [layoutMode, setLayoutMode] = useState<PassportLayoutMode>('traditional-passport');
  const [theme, setTheme] = useState<PassportThemeKey>('magic');
  const [customTitle, setCustomTitle] = useState('');
  const [scope, setScope] = useState<'preset-series' | 'active-shelf' | 'saved-rotation' | 'all-library'>('preset-series');
  const [selectedRotationId, setSelectedRotationId] = useState<string>(activeRotation?.id || '');

  // Book Selection & Reordering
  const [showBookPicker, setShowBookPicker] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [customBookEntries, setCustomBookEntries] = useState<PassportBookItem[]>([]);
  const [newCustomTitle, setNewCustomTitle] = useState('');
  const [newCustomAuthor, setNewCustomAuthor] = useState('');
  const [bookSearchQuery, setBookSearchQuery] = useState('');

  // Achievements
  const [selectedAchievementIds, setSelectedAchievementIds] = useState<string[]>([
    'series-master',
    'bedtime-champion',
    'silly-voices',
  ]);

  // Certificate Styling Details
  const [showCertStylingModal, setShowCertStylingModal] = useState(false);
  const [certStyle, setCertStyle] = useState<CustomCertificateStyle>({
    bgType: 'stars',
    customImageUrl: '',
    bgBlur: 0,
    bgOpacity: 85,
    borderStyle: 'filigree',
    emblem: 'wand',
    parentSigner: 'Parent / Guardian',
    librarianSigner: 'Family Library Curator',
    dedicationText: 'Awarded for exceptional courage, curiosity, and reading stamina across every chapter.',
  });

  // Digital Stamping
  const [selectedStampId, setSelectedStampId] = useState<string>('read-it');
  const [stampedMap, setStampedMap] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show transient toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync preset changes
  const applyPreset = (preset: PassportPreset) => {
    setActivePresetId(preset.id);
    setLayoutMode(preset.defaultLayout);
    setTheme(preset.theme);
    setCustomTitle(preset.title);
    setScope('preset-series');

    // Populate custom books from preset
    setCustomBookEntries(preset.books);
    setSelectedBookIds(preset.books.map((b) => b.id));

    if (preset.achievementIds) {
      setSelectedAchievementIds(preset.achievementIds);
    }

    setCertStyle((prev) => ({
      ...prev,
      bgType: (preset.customBgType as any) || prev.bgType,
      customImageUrl: preset.customBgUrl || prev.customImageUrl,
      bgBlur: preset.bgBlur !== undefined ? preset.bgBlur : prev.bgBlur,
      bgOpacity: preset.bgOpacity !== undefined ? preset.bgOpacity : prev.bgOpacity,
      borderStyle: (preset.borderStyle as any) || prev.borderStyle,
      emblem: (preset.emblem as any) || prev.emblem,
      dedicationText: preset.certificateDedication || prev.dedicationText,
    }));

    showToast(`Loaded "${preset.title}" template!`);
    setShowPresetBrowser(false);
  };

  // Initialize with default preset books
  useEffect(() => {
    const initialPreset = allPresets.find((p) => p.id === 'preset-harry-potter') || allPresets[0];
    if (initialPreset) {
      setCustomBookEntries(initialPreset.books);
      setSelectedBookIds(initialPreset.books.map((b) => b.id));
      setCustomTitle(initialPreset.title);
    }
  }, []);

  // Resolve pool of available catalog books
  const catalogPool = useMemo(() => {
    if (scope === 'active-shelf') {
      if (activeRotation && activeRotation.bookIds.length > 0) {
        const idSet = new Set(activeRotation.bookIds);
        return state.books.filter((b) => idSet.has(b.id));
      }
      return state.books.slice(0, 10);
    }
    if (scope === 'saved-rotation') {
      const rot = state.rotations.find((r) => r.id === selectedRotationId);
      if (rot && rot.bookIds.length > 0) {
        const idSet = new Set(rot.bookIds);
        return state.books.filter((b) => idSet.has(b.id));
      }
    }
    if (scope === 'all-library') {
      return state.books.filter((b) => !b.excludeFromRotations && b.collectionStatus !== 'wishlist');
    }
    // preset-series
    return [];
  }, [scope, state.books, state.rotations, activeRotation, selectedRotationId]);

  // Combine custom book entries with catalog books
  const allAvailableBooks = useMemo<PassportBookItem[]>(() => {
    if (scope === 'preset-series') {
      return customBookEntries;
    }
    return catalogPool.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.authors?.[0] || 'Unknown Author',
      coverUrl: b.coverUrl || '',
      description: b.publisher || '',
      accentColor: '#123c42',
    }));
  }, [scope, customBookEntries, catalogPool]);

  // When scope switches from preset to catalog, auto-select current catalog books
  useEffect(() => {
    if (scope !== 'preset-series') {
      setSelectedBookIds(allAvailableBooks.slice(0, 8).map((b) => b.id));
    }
  }, [scope, allAvailableBooks.length]);

  // Final ordered list of selected books to display on document
  const activeBooks = useMemo<PassportBookItem[]>(() => {
    const bookMap = new Map(allAvailableBooks.map((b) => [b.id, b]));
    // Also include custom book entries in case user added them
    customBookEntries.forEach((b) => bookMap.set(b.id, b));

    const result: PassportBookItem[] = [];
    selectedBookIds.forEach((id) => {
      const found = bookMap.get(id);
      if (found) result.push(found);
    });

    if (result.length > 0) return result;
    return allAvailableBooks.slice(0, 6);
  }, [selectedBookIds, allAvailableBooks, customBookEntries]);

  const readerName = activeProfile?.name || 'Young Reader';
  const displayTitle = customTitle.trim() || `${readerName}’s Reading Passport`;
  const issuedDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
    showToast('Cleared all stamps.');
  };

  // Add custom book entry
  const handleAddCustomBook = () => {
    if (!newCustomTitle.trim()) return;
    const newBook: PassportBookItem = {
      id: `custom-book-${Date.now()}`,
      title: newCustomTitle.trim(),
      author: newCustomAuthor.trim() || 'Author',
      description: 'Custom Reading Entry',
      accentColor: '#2563eb',
    };
    setCustomBookEntries((prev) => [...prev, newBook]);
    setSelectedBookIds((prev) => [...prev, newBook.id]);
    setNewCustomTitle('');
    setNewCustomAuthor('');
    showToast(`Added "${newBook.title}" to book pool!`);
  };

  // Move book up/down in ordering
  const handleMoveBook = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedBookIds.length) return;
    const copy = [...selectedBookIds];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setSelectedBookIds(copy);
  };

  // Toggle book selection
  const handleToggleBookSelected = (id: string) => {
    setSelectedBookIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      return [...prev, id];
    });
  };

  // Handle saving current setup as a new preset
  const handleSaveCurrentAsPreset = () => {
    if (!newPresetTitle.trim()) return;
    const newPreset: PassportPreset = {
      id: `custom-set-${Date.now()}`,
      title: newPresetTitle.trim(),
      subtitle: 'Custom Reading Set',
      seriesName: newPresetSeries.trim() || 'My Reading Series',
      description: newPresetDesc.trim() || 'Custom set created in Reading Passport Studio',
      category: 'custom',
      defaultLayout: layoutMode,
      theme,
      customBgType: certStyle.bgType,
      customBgUrl: certStyle.customImageUrl,
      bgBlur: certStyle.bgBlur,
      bgOpacity: certStyle.bgOpacity,
      borderStyle: certStyle.borderStyle,
      emblem: certStyle.emblem,
      certificateDedication: certStyle.dedicationText,
      books: activeBooks,
      achievementIds: selectedAchievementIds,
      isCustom: true,
    };
    const updated = saveCustomPreset(newPreset);
    setAllPresets(updated);
    setActivePresetId(newPreset.id);
    setShowSavePresetModal(false);
    setNewPresetTitle('');
    setNewPresetSeries('');
    setNewPresetDesc('');
    showToast(`Saved custom set "${newPreset.title}"!`);
  };

  // Delete custom preset
  const handleDeletePreset = (id: string) => {
    const updated = deleteCustomPreset(id);
    setAllPresets(updated);
    if (activePresetId === id) {
      applyPreset(DEFAULT_PASSPORT_PRESETS[0]);
    }
    showToast('Deleted custom preset.');
  };

  // Handle image upload for background
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCertStyle((prev) => ({
          ...prev,
          bgType: 'custom',
          customImageUrl: dataUrl,
        }));
        showToast('Background image loaded!');
      }
    };
    reader.readAsDataURL(file);
  };

  // Browser Print trigger (with PDF hint)
  const handlePrint = () => {
    showToast('Tip: Select "Save as PDF" in the destination dropdown to save or share!');
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Standalone Styled HTML Download
  const handleDownloadHtml = () => {
    const printableElement = document.getElementById('reading-passport-printable-doc');
    if (!printableElement) return;

    const fullHtml = generateStandalonePassportHtml({
      title: displayTitle,
      readerName,
      layoutMode,
      innerContentHtml: printableElement.innerHTML,
      theme,
      customBgUrl: certStyle.bgType === 'custom' ? certStyle.customImageUrl : undefined,
      bgBlur: certStyle.bgBlur,
      bgOpacity: certStyle.bgOpacity,
      customBgType: certStyle.bgType,
    });

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reading-passport-${readerName.toLowerCase().replace(/\s+/g, '-')}-${layoutMode}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Downloaded self-contained styled HTML file!');
  };

  // Share handler
  const handleShare = async () => {
    const printableElement = document.getElementById('reading-passport-printable-doc');
    const innerHtml = printableElement ? printableElement.innerHTML : '';
    const fullHtml = generateStandalonePassportHtml({
      title: displayTitle,
      readerName,
      layoutMode,
      innerContentHtml: innerHtml,
      theme,
      customBgUrl: certStyle.bgType === 'custom' ? certStyle.customImageUrl : undefined,
      bgBlur: certStyle.bgBlur,
      bgOpacity: certStyle.bgOpacity,
    });

    const result = await sharePassportDocument({
      title: displayTitle,
      text: `Check out ${readerName}'s Reading Passport & Certificate!`,
      htmlContent: fullHtml,
    });
    showToast(result.message);
  };

  // Dynamic Theme Palette Classes
  const themeClasses = useMemo(() => {
    switch (theme) {
      case 'magic':
        return {
          wrapper: 'bg-indigo-950/20 border-purple-400/50 text-indigo-950 dark:text-purple-100',
          headerBg: 'bg-gradient-to-r from-purple-950 via-indigo-900 to-purple-900 text-amber-200 border-b border-purple-500/40',
          accent: 'text-purple-900 dark:text-purple-300',
          card: 'bg-white/95 dark:bg-night-900/95 border-purple-200 dark:border-purple-800 shadow-sm',
          stampBorder: 'border-purple-500 text-purple-700 dark:text-purple-300',
          emblemColor: '#a855f7',
        };
      case 'night':
        return {
          wrapper: 'bg-slate-900/10 border-sky-400/50 text-slate-900 dark:text-sky-100',
          headerBg: 'bg-gradient-to-r from-slate-950 via-sky-950 to-night-950 text-sky-200 border-b border-sky-600/40',
          accent: 'text-sky-900 dark:text-sky-300',
          card: 'bg-white/95 dark:bg-night-900/95 border-sky-200 dark:border-sky-800 shadow-sm',
          stampBorder: 'border-sky-500 text-sky-700 dark:text-sky-300',
          emblemColor: '#0ea5e9',
        };
      case 'explorer':
        return {
          wrapper: 'bg-amber-50/70 border-amber-300 text-amber-950 dark:text-amber-100',
          headerBg: 'bg-gradient-to-r from-amber-800 via-amber-900 to-amber-950 text-amber-50 border-b border-amber-500/40',
          accent: 'text-amber-800 dark:text-amber-300',
          card: 'bg-white/95 dark:bg-night-900/95 border-amber-200 dark:border-amber-800 shadow-sm',
          stampBorder: 'border-amber-400 text-amber-700 dark:text-amber-300',
          emblemColor: '#d97706',
        };
      case 'forest':
        return {
          wrapper: 'bg-emerald-50/50 border-emerald-300 text-emerald-950 dark:text-emerald-100',
          headerBg: 'bg-gradient-to-r from-emerald-900 via-forest-900 to-forest-950 text-emerald-100 border-b border-emerald-500/40',
          accent: 'text-emerald-800 dark:text-emerald-300',
          card: 'bg-white/95 dark:bg-night-900/95 border-emerald-200 dark:border-emerald-800 shadow-sm',
          stampBorder: 'border-emerald-400 text-emerald-700 dark:text-emerald-300',
          emblemColor: '#059669',
        };
      case 'ink-saver':
        return {
          wrapper: 'bg-white border-stone-800 text-black',
          headerBg: 'bg-white border-b-2 border-black text-black',
          accent: 'text-black',
          card: 'bg-white border-2 border-stone-800',
          stampBorder: 'border-black border-dashed text-black',
          emblemColor: '#000000',
        };
      case 'classic':
      default:
        return {
          wrapper: 'bg-stone-50 border-linen-300 text-stone-900 dark:text-linen-100',
          headerBg: 'bg-gradient-to-r from-forest-900 via-night-900 to-forest-950 text-ivory border-b border-amber-400/40',
          accent: 'text-forest-800 dark:text-[#5ED3DA]',
          card: 'bg-white/95 dark:bg-night-900/95 border-linen-200 dark:border-night-800 shadow-sm',
          stampBorder: 'border-stone-400 text-stone-700 dark:text-stone-300',
          emblemColor: '#d4af37',
        };
    }
  }, [theme]);

  // Certificate background style helper
  const certificateBgStyle = useMemo(() => {
    if (certStyle.bgType === 'custom' && certStyle.customImageUrl) {
      return {
        backgroundImage: `url(${certStyle.customImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    if (certStyle.bgType === 'stars') {
      return {
        background: 'radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%)',
        color: '#f8fafc',
      };
    }
    if (certStyle.bgType === 'parchment') {
      return {
        background: 'radial-gradient(circle at center, #fffdf8 0%, #fef3c7 100%)',
      };
    }
    if (certStyle.bgType === 'meadow') {
      return {
        background: 'radial-gradient(circle at center, #f0fdf4 0%, #dcfce7 100%)',
      };
    }
    // gradient default
    return {
      background: 'radial-gradient(circle at center, #ffffff 0%, #f8fafc 100%)',
    };
  }, [certStyle.bgType, certStyle.customImageUrl]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 passport-studio-sheet-root">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-night-950 text-white border border-[#5ED3DA]/40 shadow-xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Icon name="check" className="w-4 h-4 text-[#5ED3DA]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CONTROL BAR (Hidden during print)                                   */}
      {/* ==================================================================== */}
      <div className="no-print space-y-4 rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 p-4 sm:p-6 shadow-sm">
        {/* Top Header & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-linen-200/80 dark:border-night-800">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-forest-900/10 dark:bg-[#5ED3DA]/20 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center">
              <Icon name="stamp" className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-forest-900 dark:text-white">
                  Reading Passport &amp; Certificate Studio
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                  Print Ready
                </span>
              </div>
              <p className="text-xs text-stone-ink dark:text-slate-400">
                Design custom passports, diplomas, and sticker sheets for {readerName}.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Icon name="printer" className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-800 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="download" className="w-4 h-4" />
              <span>HTML</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-800 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="share" className="w-4 h-4" />
              <span>Share</span>
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

        {/* Toolbar Row 1: Layout Mode & Presets Browser Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Layout Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1 shrink-0">
              Format:
            </span>
            <button
              type="button"
              onClick={() => setLayoutMode('traditional-passport')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'traditional-passport'
                  ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                  : 'bg-linen-100 text-stone-700 hover:bg-linen-200 dark:bg-night-800 dark:text-slate-300'
              }`}
            >
              <Icon name="book" className="w-3.5 h-3.5" />
              <span>Two-Page Passport</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('official-certificate')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'official-certificate'
                  ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                  : 'bg-linen-100 text-stone-700 hover:bg-linen-200 dark:bg-night-800 dark:text-slate-300'
              }`}
            >
              <Icon name="award" className="w-3.5 h-3.5" />
              <span>Honorary Certificate</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('storytime-bingo')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'storytime-bingo'
                  ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                  : 'bg-linen-100 text-stone-700 hover:bg-linen-200 dark:bg-night-800 dark:text-slate-300'
              }`}
            >
              <Icon name="grid" className="w-3.5 h-3.5" />
              <span>Story Bingo</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('adventure-map')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'adventure-map'
                  ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                  : 'bg-linen-100 text-stone-700 hover:bg-linen-200 dark:bg-night-800 dark:text-slate-300'
              }`}
            >
              <Icon name="compass" className="w-3.5 h-3.5" />
              <span>Adventure Trail</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('stamp-sheet')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'stamp-sheet'
                  ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                  : 'bg-linen-100 text-stone-700 hover:bg-linen-200 dark:bg-night-800 dark:text-slate-300'
              }`}
            >
              <Icon name="stamp" className="w-3.5 h-3.5" />
              <span>Sticker Sheet</span>
            </button>
          </div>

          {/* Presets & Series Launcher Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPresetBrowser(true)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-900 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              <span>Series Presets &amp; Sets</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSavePresetModal(true)}
              className="px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              <span>Save Set</span>
            </button>
          </div>
        </div>

        {/* Toolbar Row 2: Books Chooser, Certificate Styling, and Theme Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Column A: Book Scope & Picker */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-600 dark:text-slate-400 flex items-center justify-between">
              <span>Books to Include:</span>
              <span className="text-[10px] text-forest-800 dark:text-[#5ED3DA]">
                {activeBooks.length} selected
              </span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                className="flex-1 text-xs rounded-xl border border-linen-300 dark:border-night-700 bg-linen-50 dark:bg-night-800 p-2 font-medium"
              >
                <option value="preset-series">Series Preset Books</option>
                <option value="active-shelf">Active Shelf Books</option>
                <option value="saved-rotation">Saved Rotation</option>
                <option value="all-library">All Family Library</option>
              </select>
              <button
                type="button"
                onClick={() => setShowBookPicker(true)}
                className="px-3 py-2 rounded-xl bg-linen-200 hover:bg-linen-300 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Icon name="checklist" className="w-3.5 h-3.5" />
                <span>Choose</span>
              </button>
            </div>
          </div>

          {/* Column B: Theme Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-600 dark:text-slate-400">
              Aesthetic Theme:
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full text-xs rounded-xl border border-linen-300 dark:border-night-700 bg-linen-50 dark:bg-night-800 p-2 font-medium"
            >
              <option value="classic">Classic Royal (Navy &amp; Gold)</option>
              <option value="magic">Magic Wizard (Purple &amp; Starlight)</option>
              <option value="night">Bedtime Stars (Midnight Blue)</option>
              <option value="explorer">Adventure Explorer (Parchment)</option>
              <option value="forest">Forest Meadow (Sage &amp; Green)</option>
              <option value="ink-saver">Printer Ink-Saver (B&amp;W Outlines)</option>
            </select>
          </div>

          {/* Column C: Certificate Style / Title Customization */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-stone-600 dark:text-slate-400 flex items-center justify-between">
              <span>Title &amp; Background:</span>
              {layoutMode === 'official-certificate' && (
                <button
                  type="button"
                  onClick={() => setShowCertStylingModal(true)}
                  className="text-[11px] text-forest-800 dark:text-[#5ED3DA] font-bold underline cursor-pointer"
                >
                  Custom Style 🎨
                </button>
              )}
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={`${readerName}’s Reading Passport`}
              className="w-full text-xs rounded-xl border border-linen-300 dark:border-night-700 bg-linen-50 dark:bg-night-800 p-2 font-medium"
            />
          </div>
        </div>

        {/* Digital Stamp Selection Bar */}
        <div className="pt-2 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">
              Active Stamp:
            </span>
            {PASSPORT_STAMPS.map((stamp) => (
              <button
                key={stamp.id}
                type="button"
                onClick={() => setSelectedStampId(stamp.id)}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedStampId === stamp.id
                    ? `${stamp.color} ring-2 ring-forest-700 shadow-xs scale-105`
                    : 'bg-linen-100 dark:bg-night-800 text-stone-700 dark:text-slate-300 hover:bg-linen-200'
                }`}
              >
                <span>{stamp.symbol}</span>
                <span className="hidden sm:inline">{stamp.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClearAllStamps}
              className="text-[11px] text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 font-medium underline cursor-pointer"
            >
              Clear Stamps
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* PRINTABLE DOCUMENT CANVAS (#reading-passport-printable-doc)          */}
      {/* ==================================================================== */}
      <div
        id="reading-passport-printable-doc"
        className={`p-6 sm:p-10 rounded-3xl border shadow-md transition-all relative overflow-hidden ${themeClasses.wrapper}`}
      >
        {/* Background layer for custom image/blur */}
        {layoutMode === 'official-certificate' && (
          <div
            className="absolute inset-0 pointer-events-none z-0"
            style={{
              ...certificateBgStyle,
              filter: certStyle.bgBlur > 0 ? `blur(${certStyle.bgBlur}px)` : undefined,
              opacity: (certStyle.bgOpacity || 100) / 100,
            }}
          />
        )}

        <div className="relative z-10 space-y-6">
          {/* ================================================================ */}
          {/* LAYOUT A: TRADITIONAL TWO-PAGE PASSPORT SPREAD                   */}
          {/* ================================================================ */}
          {layoutMode === 'traditional-passport' && (
            <div className="space-y-8">
              {/* Top Passport Header Band */}
              <div className={`p-4 rounded-2xl border text-center shadow-xs ${themeClasses.headerBg}`}>
                <div className="flex items-center justify-center gap-2 text-xs tracking-widest uppercase font-bold opacity-90">
                  <span>★</span>
                  <span>OFFICIAL FAMILY READING PASSPORT</span>
                  <span>★</span>
                </div>
                <h1 className="font-display text-2xl font-bold tracking-tight mt-0.5">
                  {displayTitle}
                </h1>
              </div>

              {/* Two-Page Spread Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch passport-print-page">
                {/* PAGE 1: Biometric & Identity Page */}
                <div className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${themeClasses.card}`}>
                  <div>
                    {/* Top Passport Strip */}
                    <div className="flex items-center justify-between border-b pb-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      <span>PASSPORT / PASSEPORT</span>
                      <span className="font-mono text-xs text-forest-800 dark:text-[#5ED3DA]">
                        {passportNumber}
                      </span>
                    </div>

                    {/* Photo + Details Box */}
                    <div className="flex gap-4 pt-4">
                      {/* Reader Photo Box */}
                      <div className="w-24 sm:w-28 shrink-0 flex flex-col items-center">
                        <div className="w-24 h-32 rounded-xl border-2 border-stone-300 dark:border-stone-700 bg-linen-100 dark:bg-night-800 overflow-hidden flex flex-col items-center justify-center relative shadow-xs">
                          {activeProfile?.avatarTone ? (
                            <div className="text-3xl font-display font-bold text-forest-800">
                              {activeProfile.name.slice(0, 1)}
                            </div>
                          ) : (
                            <Icon name="profiles" className="w-10 h-10 text-stone-400" />
                          )}
                          <div className="absolute bottom-1 inset-x-1 py-0.5 bg-black/60 text-[9px] text-white text-center rounded font-mono uppercase">
                            OFFICIAL
                          </div>
                        </div>
                        <span className="text-[9px] text-stone-500 mt-1 font-mono">
                          SEAL: AUTHORIZED
                        </span>
                      </div>

                      {/* Official Field Lines */}
                      <div className="flex-1 space-y-2 text-xs min-w-0">
                        <div>
                          <p className="text-[9px] uppercase font-bold text-stone-400">
                            Reader Name / Nom
                          </p>
                          <p className="font-display text-base font-bold text-forest-900 dark:text-white truncate">
                            {readerName}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">Type</p>
                            <p className="font-mono font-bold">P (Passport)</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">Nationality</p>
                            <p className="font-bold text-forest-800 dark:text-[#5ED3DA]">Book Lover</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">Issue Date</p>
                            <p className="font-mono">{issuedDate}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">Authority</p>
                            <p className="truncate">Home Library</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] uppercase font-bold text-stone-400">Reading Stage</p>
                          <p className="font-medium text-stone-700 dark:text-slate-300 capitalize">
                            {activeProfile?.readingStage?.replace('-', ' ') || 'Story Explorer'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Machine Readable Zone (MRZ Bar) */}
                  <div className="pt-2">
                    <div className="bg-stone-900 text-sky-400 font-mono text-[10px] p-2.5 rounded-xl tracking-widest leading-relaxed overflow-x-auto shadow-inner select-none">
                      <div>{`P<RDR${readerName.toUpperCase().replace(/\s+/g, '<')}<<<<<<<<<<<<<<<<<<<`}</div>
                      <div>{`${passportNumber}01015F2611144LIB<<<<<<<<<<<`}</div>
                    </div>
                  </div>
                </div>

                {/* PAGE 2: Visas & Entry Stamps Grid */}
                <div className={`p-5 rounded-2xl border flex flex-col justify-between space-y-3 ${themeClasses.card}`}>
                  <div>
                    <div className="flex items-center justify-between border-b pb-2 text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                      <span>VISAS &amp; READING ENTRY STAMPS</span>
                      <span>PAGE 2</span>
                    </div>

                    {/* Book Visa Stamp Slots */}
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      {activeBooks.map((book, idx) => {
                        const stampKey = `passport-visa-${idx}`;
                        const stampedId = stampedMap[stampKey];
                        const activeStamp = PASSPORT_STAMPS.find((s) => s.id === stampedId);

                        return (
                          <div
                            key={book.id}
                            onClick={() => handleToggleStamp(stampKey)}
                            className="p-2.5 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 hover:border-forest-600 transition-all cursor-pointer relative bg-linen-50/50 dark:bg-night-950/40 min-h-[96px] flex flex-col justify-between"
                          >
                            <div className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-linen-200 dark:bg-night-800 text-stone-700 dark:text-slate-300 text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-[11px] font-bold text-forest-900 dark:text-white leading-tight truncate">
                                  {book.title}
                                </h4>
                                <p className="text-[10px] text-stone-500 truncate">
                                  {book.author}
                                </p>
                              </div>
                            </div>

                            {/* Circular Stamp Zone */}
                            <div className="flex justify-end pt-1">
                              {activeStamp ? (
                                <div
                                  className={`w-11 h-11 rounded-full border-2 flex flex-col items-center justify-center shadow-xs ${activeStamp.color} border-solid`}
                                  style={{ transform: `rotate(${activeStamp.rotation})` }}
                                >
                                  <span className="text-xs">{activeStamp.symbol}</span>
                                  <span className="text-[7px] font-mono font-bold tracking-tight uppercase">
                                    {activeStamp.caption}
                                  </span>
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-full border border-dashed border-stone-400 flex items-center justify-center text-[7px] font-bold text-stone-400 text-center">
                                  STAMP
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[9px] text-stone-400 text-center italic">
                    Tap any slot to stamp digital approval, or print to apply real rubber ink stamps &amp; stickers!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* LAYOUT B: OFFICIAL HONORARY CERTIFICATE / DIPLOMA                 */}
          {/* ================================================================ */}
          {layoutMode === 'official-certificate' && (
            <div
              className={`p-6 sm:p-10 rounded-3xl relative overflow-hidden transition-all certificate-filigree-frame ${
                certStyle.borderStyle === 'double'
                  ? 'border-8 border-double border-amber-600'
                  : 'border-8 double border-[#d4af37]'
              }`}
            >
              <div className="relative z-10 text-center space-y-6">
                {/* Header Crest Emblem */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 text-amber-950 flex items-center justify-center shadow-md border-2 border-amber-200">
                    <Icon name={certStyle.emblem || 'ribbon'} className="w-8 h-8 text-amber-950" />
                  </div>
                </div>

                {/* Certificate Titles */}
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-widest font-bold text-amber-800 dark:text-amber-300">
                    HONORARY DIPLOMA OF READING EXCELLENCE
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-forest-900 dark:text-white">
                    Certificate of Achievement
                  </h1>
                </div>

                {/* Recipient Section */}
                <div className="space-y-2 max-w-xl mx-auto">
                  <p className="text-xs text-stone-600 dark:text-slate-300 uppercase tracking-wider font-semibold">
                    THIS CERTIFICATE IS PROUDLY CONFERRED UPON
                  </p>
                  <div className="py-2 border-b-2 border-amber-600/70 inline-block px-8">
                    <span className="font-display text-2xl sm:text-3xl font-extrabold text-forest-900 dark:text-amber-300">
                      {readerName}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-stone-700 dark:text-slate-200 leading-relaxed italic max-w-lg mx-auto pt-1">
                    "{certStyle.dedicationText}"
                  </p>
                </div>

                {/* Books Mastered Showcase */}
                <div className="pt-2">
                  <p className="text-[11px] font-bold text-amber-900 dark:text-amber-400 uppercase tracking-widest mb-3">
                    Books Read &amp; Mastered
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 max-w-3xl mx-auto">
                    {activeBooks.map((book, idx) => {
                      const stampKey = `cert-stamp-${idx}`;
                      const stampedId = stampedMap[stampKey];
                      const activeStamp = PASSPORT_STAMPS.find((s) => s.id === stampedId);

                      return (
                        <div
                          key={book.id}
                          onClick={() => handleToggleStamp(stampKey)}
                          className="p-2 rounded-xl bg-white/90 dark:bg-night-900/90 border border-amber-200 dark:border-amber-900/60 shadow-xs flex flex-col justify-between items-center text-center cursor-pointer hover:border-amber-500 transition-all"
                        >
                          <div className="w-12 aspect-[3/4] rounded overflow-hidden shadow-2xs border border-linen-200 mb-1.5">
                            <BookCover book={book as any} size="sm" aspectRatio="portrait" />
                          </div>
                          <p className="text-[10px] font-bold text-forest-900 dark:text-white truncate w-full">
                            {book.title}
                          </p>

                          {/* Mini Stamp Badge */}
                          <div className="mt-1">
                            {activeStamp ? (
                              <span className="text-[10px] font-bold text-emerald-600">
                                {activeStamp.symbol} COMPLETED
                              </span>
                            ) : (
                              <span className="text-[9px] text-stone-400 font-bold border border-dashed border-stone-300 rounded px-1">
                                STAMP
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Achievements Strip */}
                <div className="flex items-center justify-center flex-wrap gap-2 pt-2">
                  {selectedAchievementIds.map((achId) => {
                    const ach = PASSPORT_ACHIEVEMENTS.find((a) => a.id === achId);
                    if (!ach) return null;
                    return (
                      <span
                        key={ach.id}
                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 shadow-2xs ${ach.colorClass}`}
                      >
                        <Icon name={ach.icon} className="w-3.5 h-3.5" />
                        <span>{ach.badgeText}</span>
                      </span>
                    );
                  })}
                </div>

                {/* Signatures & Seal Footer */}
                <div className="pt-6 border-t border-amber-600/30 grid grid-cols-3 items-end gap-4 max-w-2xl mx-auto text-xs">
                  {/* Left Signature */}
                  <div className="text-center">
                    <div className="font-serif italic text-base text-forest-900 dark:text-amber-200 border-b border-stone-400 pb-1">
                      {certStyle.parentSigner}
                    </div>
                    <p className="text-[9px] uppercase font-bold text-stone-500 mt-1">
                      Parent / Guardian
                    </p>
                  </div>

                  {/* Golden Center Seal */}
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-amber-100 shadow-md flex items-center justify-center text-amber-950 font-bold text-xs uppercase text-center leading-none p-1">
                      OFFICIAL SEAL
                    </div>
                    <p className="text-[9px] font-mono text-stone-500 mt-1">{issuedDate}</p>
                  </div>

                  {/* Right Signature */}
                  <div className="text-center">
                    <div className="font-serif italic text-base text-forest-900 dark:text-amber-200 border-b border-stone-400 pb-1">
                      {certStyle.librarianSigner}
                    </div>
                    <p className="text-[9px] uppercase font-bold text-stone-500 mt-1">
                      Reading Guide
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* LAYOUT C: STORYTIME BINGO CHALLENGE (3x3 Grid)                    */}
          {/* ================================================================ */}
          {layoutMode === 'storytime-bingo' && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border text-center shadow-xs ${themeClasses.headerBg}`}>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {readerName}’s Storytime Bingo
                </h1>
                <p className="text-xs opacity-90 mt-1">
                  Complete 3 reading challenges in a row (across, down, or diagonal) to win a bedtime prize!
                </p>
              </div>

              {/* 3x3 Bingo Grid */}
              <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
                {Array.from({ length: 9 }).map((_, idx) => {
                  const tileKey = `bingo-tile-${idx}`;
                  const stampedId = stampedMap[tileKey];
                  const activeStamp = PASSPORT_STAMPS.find((s) => s.id === stampedId);
                  const isCenter = idx === 4;

                  if (isCenter) {
                    return (
                      <div
                        key={tileKey}
                        onClick={() => handleToggleStamp(tileKey)}
                        className="aspect-square p-3 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-amber-950 border-2 border-amber-300 flex flex-col items-center justify-center text-center shadow-sm cursor-pointer select-none transition-transform hover:scale-[1.02]"
                      >
                        <span className="text-2xl">⭐️</span>
                        <h4 className="font-display font-black text-xs sm:text-sm tracking-wide mt-1">
                          FREE STAR
                        </h4>
                        <p className="text-[9px] font-bold opacity-80 uppercase">
                          Reader's Choice
                        </p>
                      </div>
                    );
                  }

                  const book = activeBooks[idx > 4 ? idx - 1 : idx];
                  const challengeTitles = [
                    'Read in a blanket fort ⛺',
                    'Flashlight storytime 🔦',
                    'Read in silly voices 🦁',
                    'Read outside in sun 🌳',
                    'Read with favorite toy 🧸',
                    'Double bedtime story 🌙',
                    'Read while having snack 🍎',
                    'Act out the ending 🎭',
                  ];
                  const challenge = challengeTitles[idx > 4 ? idx - 1 : idx] || 'Favorite Book';

                  return (
                    <div
                      key={tileKey}
                      onClick={() => handleToggleStamp(tileKey)}
                      className={`aspect-square p-2.5 rounded-2xl border flex flex-col justify-between transition-all cursor-pointer select-none ${themeClasses.card} ${
                        activeStamp ? 'ring-2 ring-forest-600' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-stone-500 font-bold">
                          <span>TILE {idx + 1}</span>
                          {activeStamp && <span>{activeStamp.symbol}</span>}
                        </div>
                        <h4 className="text-[11px] font-bold text-forest-900 dark:text-white leading-tight line-clamp-2">
                          {book?.title || challenge}
                        </h4>
                        {book?.author && (
                          <p className="text-[9px] text-stone-500 truncate">{book.author}</p>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        {activeStamp ? (
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${activeStamp.color}`}>
                            {activeStamp.label}
                          </span>
                        ) : (
                          <span className="w-8 h-8 rounded-full border border-dashed border-stone-400 flex items-center justify-center text-[7px] font-bold text-stone-400">
                            STAMP
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* LAYOUT D: ADVENTURE TRAIL & MILESTONE MAP                          */}
          {/* ================================================================ */}
          {layoutMode === 'adventure-map' && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border text-center shadow-xs ${themeClasses.headerBg}`}>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  {readerName}’s Storybook Adventure Trail
                </h1>
                <p className="text-xs opacity-90 mt-1">
                  Step along the trail book by book! Collect stamps at each stop to reach the Golden Castle!
                </p>
              </div>

              <div className="space-y-3 max-w-2xl mx-auto">
                {activeBooks.map((book, idx) => {
                  const stepKey = `trail-step-${idx}`;
                  const stampedId = stampedMap[stepKey];
                  const activeStamp = PASSPORT_STAMPS.find((s) => s.id === stampedId);
                  const isMilestone = (idx + 1) % 3 === 0;

                  return (
                    <div
                      key={book.id}
                      onClick={() => handleToggleStamp(stepKey)}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-4 transition-all cursor-pointer select-none ${
                        isMilestone ? 'bg-amber-500/10 border-amber-300 shadow-xs' : themeClasses.card
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                            isMilestone ? 'bg-amber-600 text-white' : 'bg-linen-200 text-stone-800'
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="w-11 aspect-[3/4] rounded overflow-hidden shadow-2xs border border-linen-200 shrink-0">
                          <BookCover book={book as any} size="sm" aspectRatio="portrait" />
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-xs sm:text-sm text-forest-900 dark:text-white truncate">
                            {book.title}
                          </h4>
                          <p className="text-[11px] text-stone-600 dark:text-slate-400 truncate">
                            {book.author}
                          </p>
                          {isMilestone && (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 block mt-0.5">
                              ⭐️ Milestone Reward: Golden Reading Badge!
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        <div
                          className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-center ${
                            activeStamp
                              ? `${activeStamp.color} border-solid shadow-xs`
                              : 'border-dashed border-stone-400 bg-linen-50/50 text-stone-400 text-[8px] font-bold'
                          }`}
                        >
                          {activeStamp ? (
                            <span>{activeStamp.symbol}</span>
                          ) : (
                            <span>STICKER</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* LAYOUT E: PRINTABLE STAMP & STICKER TOKEN SHEET                  */}
          {/* ================================================================ */}
          {layoutMode === 'stamp-sheet' && (
            <div className="space-y-6">
              <div className={`p-5 rounded-2xl border text-center shadow-xs ${themeClasses.headerBg}`}>
                <h1 className="font-display text-2xl font-bold tracking-tight">
                  Printable Sticker &amp; Stamp Tokens
                </h1>
                <p className="text-xs opacity-90 mt-1">
                  Print this sheet on adhesive sticker paper or regular paper, then cut along the dashed circles with safety scissors!
                </p>
              </div>

              {/* Grid of Circular Stickers */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4 max-w-3xl mx-auto pt-2">
                {PRINTABLE_STICKER_TOKENS.map((token) => (
                  <div
                    key={token.id}
                    className="aspect-square p-2 rounded-full border-2 border-dashed border-stone-400 bg-white flex flex-col items-center justify-center text-center shadow-xs transition-transform hover:scale-105"
                  >
                    <div
                      className="w-14 h-14 rounded-full flex flex-col items-center justify-center text-white shadow-2xs"
                      style={{ backgroundColor: token.color }}
                    >
                      <span className="text-base leading-none">{token.symbol}</span>
                      <span className="text-[8px] font-extrabold uppercase tracking-tight mt-0.5">
                        {token.title}
                      </span>
                    </div>
                    <span className="text-[8px] font-bold text-stone-500 mt-1 uppercase">
                      {token.subtitle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Line */}
          <div className="pt-4 border-t border-linen-300/80 flex items-center justify-between text-[10px] text-stone-500">
            <span>Created with Library Rotation · Family Book Passport</span>
            <span>
              Printed for {readerName} · {issuedDate}
            </span>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: SERIES PRESETS & SETS BROWSER                                */}
      {/* ==================================================================== */}
      {showPresetBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-linen-200 dark:border-night-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-forest-900 dark:text-white">
                  Reading Series &amp; Certificate Presets
                </h3>
                <p className="text-xs text-stone-ink dark:text-slate-400">
                  Select a pre-configured book collection or your own custom template.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetBrowser(false)}
                className="w-8 h-8 rounded-full bg-linen-100 dark:bg-night-800 flex items-center justify-center text-stone-600 dark:text-slate-300"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {allPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    activePresetId === preset.id
                      ? 'border-forest-700 bg-forest-50/50 dark:bg-night-800 ring-2 ring-forest-700/30'
                      : 'border-linen-200 dark:border-night-800 hover:border-linen-300 bg-white dark:bg-night-900'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-bold text-sm text-forest-900 dark:text-white">
                        {preset.title}
                      </h4>
                      {preset.isCustom && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-600 dark:text-slate-400 line-clamp-2">
                      {preset.description}
                    </p>
                    <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">
                      {preset.books.length} books · {preset.defaultLayout} format · {preset.theme} theme
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="px-4 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold shadow-xs hover:opacity-95 cursor-pointer"
                    >
                      Apply Set
                    </button>
                    {preset.isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.id)}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs cursor-pointer"
                        title="Delete custom preset"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CHOOSE & REORDER BOOKS                                       */}
      {/* ==================================================================== */}
      {showBookPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-linen-200 dark:border-night-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-forest-900 dark:text-white">
                  Choose &amp; Order Passport Books
                </h3>
                <p className="text-xs text-stone-ink dark:text-slate-400">
                  Select which books appear and arrange their order on the printable sheets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBookPicker(false)}
                className="w-8 h-8 rounded-full bg-linen-100 dark:bg-night-800 flex items-center justify-center text-stone-600 dark:text-slate-300"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Filter & Add Manual Book */}
            <div className="p-4 border-b border-linen-200 dark:border-night-800 bg-linen-50/50 dark:bg-night-800/50 space-y-3">
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Search by book title or author..."
                className="w-full text-xs rounded-xl border border-linen-300 dark:border-night-700 bg-white dark:bg-night-900 p-2.5"
              />

              {/* Add Custom Book Entry */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newCustomTitle}
                  onChange={(e) => setNewCustomTitle(e.target.value)}
                  placeholder="Add custom title (e.g. Harry Potter 4)..."
                  className="flex-1 text-xs rounded-xl border border-linen-300 dark:border-night-700 bg-white dark:bg-night-900 p-2"
                />
                <input
                  type="text"
                  value={newCustomAuthor}
                  onChange={(e) => setNewCustomAuthor(e.target.value)}
                  placeholder="Author..."
                  className="w-28 text-xs rounded-xl border border-linen-300 dark:border-night-700 bg-white dark:bg-night-900 p-2"
                />
                <button
                  type="button"
                  onClick={handleAddCustomBook}
                  className="px-3 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold shrink-0 cursor-pointer"
                >
                  + Add Book
                </button>
              </div>
            </div>

            {/* Books List with check and reorder */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {allAvailableBooks
                .filter((b) =>
                  bookSearchQuery
                    ? b.title.toLowerCase().includes(bookSearchQuery.toLowerCase()) ||
                      (b.author || '').toLowerCase().includes(bookSearchQuery.toLowerCase())
                    : true
                )
                .map((book, idx) => {
                  const isSelected = selectedBookIds.includes(book.id);

                  return (
                    <div
                      key={book.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'border-forest-600 bg-forest-50/30 dark:bg-night-800'
                          : 'border-linen-200 dark:border-night-800'
                      }`}
                    >
                      <div
                        onClick={() => handleToggleBookSelected(book.id)}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-forest-700"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-forest-900 dark:text-white truncate">
                            {book.title}
                          </h4>
                          <p className="text-[11px] text-stone-500 truncate">
                            {book.author}
                          </p>
                        </div>
                      </div>

                      {/* Reorder Buttons (only for selected) */}
                      {isSelected && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveBook(selectedBookIds.indexOf(book.id), 'up')}
                            className="p-1.5 rounded bg-linen-100 dark:bg-night-700 hover:bg-linen-200 text-xs cursor-pointer"
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveBook(selectedBookIds.indexOf(book.id), 'down')}
                            className="p-1.5 rounded bg-linen-100 dark:bg-night-700 hover:bg-linen-200 text-xs cursor-pointer"
                            title="Move Down"
                          >
                            ▼
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="p-4 border-t border-linen-200 dark:border-night-800 flex items-center justify-between">
              <span className="text-xs text-stone-500">
                {selectedBookIds.length} books chosen for printable
              </span>
              <button
                type="button"
                onClick={() => setShowBookPicker(false)}
                className="px-5 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CERTIFICATE CUSTOM STYLING & BACKGROUND                      */}
      {/* ==================================================================== */}
      {showCertStylingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-display text-lg font-bold text-forest-900 dark:text-white">
                Certificate Background &amp; Embellishment
              </h3>
              <button
                type="button"
                onClick={() => setShowCertStylingModal(false)}
                className="w-8 h-8 rounded-full bg-linen-100 dark:bg-night-800 flex items-center justify-center"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Background Preset */}
              <div>
                <label className="font-bold text-stone-600 dark:text-slate-400 block mb-1">
                  Background Style:
                </label>
                <select
                  value={certStyle.bgType}
                  onChange={(e) => setCertStyle((prev) => ({ ...prev, bgType: e.target.value as any }))}
                  className="w-full rounded-xl border border-linen-300 dark:border-night-700 p-2 bg-linen-50 dark:bg-night-800"
                >
                  <option value="stars">Starry Galaxy / Night Sky</option>
                  <option value="parchment">Vintage Parchment Scroll</option>
                  <option value="meadow">Floral Garden Meadow</option>
                  <option value="gradient">Clean Royal Gradient</option>
                  <option value="custom">Custom Image URL or Upload</option>
                </select>
              </div>

              {/* Custom Image Upload or URL */}
              {certStyle.bgType === 'custom' && (
                <div className="space-y-2 p-3 rounded-2xl bg-linen-100/60 dark:bg-night-800 border">
                  <div>
                    <label className="font-bold block text-[11px] mb-1">Image URL:</label>
                    <input
                      type="text"
                      value={certStyle.customImageUrl}
                      onChange={(e) =>
                        setCertStyle((prev) => ({ ...prev, customImageUrl: e.target.value }))
                      }
                      placeholder="https://example.com/certificate-art.jpg"
                      className="w-full text-xs rounded-xl border p-2 bg-white dark:bg-night-900"
                    />
                  </div>
                  <div>
                    <label className="font-bold block text-[11px] mb-1">Or Upload Local Image:</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Blur Slider */}
              <div>
                <div className="flex justify-between font-bold text-stone-600 dark:text-slate-400 mb-1">
                  <span>Background Blur:</span>
                  <span>{certStyle.bgBlur}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="2"
                  value={certStyle.bgBlur}
                  onChange={(e) =>
                    setCertStyle((prev) => ({ ...prev, bgBlur: Number(e.target.value) }))
                  }
                  className="w-full accent-forest-700"
                />
              </div>

              {/* Opacity Slider */}
              <div>
                <div className="flex justify-between font-bold text-stone-600 dark:text-slate-400 mb-1">
                  <span>Background Visibility:</span>
                  <span>{certStyle.bgOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={certStyle.bgOpacity}
                  onChange={(e) =>
                    setCertStyle((prev) => ({ ...prev, bgOpacity: Number(e.target.value) }))
                  }
                  className="w-full accent-forest-700"
                />
              </div>

              {/* Signers */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-bold block text-[11px] mb-1">Parent Signer Name:</label>
                  <input
                    type="text"
                    value={certStyle.parentSigner}
                    onChange={(e) =>
                      setCertStyle((prev) => ({ ...prev, parentSigner: e.target.value }))
                    }
                    className="w-full text-xs rounded-xl border p-2"
                  />
                </div>
                <div>
                  <label className="font-bold block text-[11px] mb-1">Librarian / Guide:</label>
                  <input
                    type="text"
                    value={certStyle.librarianSigner}
                    onChange={(e) =>
                      setCertStyle((prev) => ({ ...prev, librarianSigner: e.target.value }))
                    }
                    className="w-full text-xs rounded-xl border p-2"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setShowCertStylingModal(false)}
                className="px-5 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs"
              >
                Apply Style
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: SAVE CURRENT SETUP AS PRESET                                 */}
      {/* ==================================================================== */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-forest-900 dark:text-white">
              Save Current Passport as Template
            </h3>
            <p className="text-xs text-stone-ink dark:text-slate-400">
              Save this combination of books, theme, layout, and dedication as a reusable preset.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Template Title:</label>
                <input
                  type="text"
                  value={newPresetTitle}
                  onChange={(e) => setNewPresetTitle(e.target.value)}
                  placeholder="e.g. Bedtime Chapter Book Challenge"
                  className="w-full rounded-xl border p-2 bg-linen-50 dark:bg-night-800"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Series Name:</label>
                <input
                  type="text"
                  value={newPresetSeries}
                  onChange={(e) => setNewPresetSeries(e.target.value)}
                  placeholder="e.g. Magic Treehouse Series"
                  className="w-full rounded-xl border p-2 bg-linen-50 dark:bg-night-800"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Description:</label>
                <textarea
                  value={newPresetDesc}
                  onChange={(e) => setNewPresetDesc(e.target.value)}
                  placeholder="Notes about this reading challenge..."
                  rows={2}
                  className="w-full rounded-xl border p-2 bg-linen-50 dark:bg-night-800"
                />
              </div>
            </div>

            <div className="pt-3 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentAsPreset}
                disabled={!newPresetTitle.trim()}
                className="px-5 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs disabled:opacity-50"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
