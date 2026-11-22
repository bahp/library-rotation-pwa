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
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

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

  useBodyScrollLock(
    showPresetBrowser || showBookPicker || showCertStylingModal || showSavePresetModal
  );

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
      customBgType: certStyle.bgType,
    });

    const result = await sharePassportDocument({
      title: displayTitle,
      text: `Check out ${readerName}'s Reading Passport & Certificate!`,
      htmlContent: fullHtml,
    });
    showToast(result.message);
  };

  // Centralized CSS Theme & Certificate Styling Classes
  const themeDocClass = `lr-passport-theme-${theme || 'classic'}`;

  const { certificateBgClass, certificateBgStyle, certificateInkClass } = useMemo(() => {
    if (certStyle.bgType === 'custom' && certStyle.customImageUrl) {
      return {
        certificateBgClass: '',
        certificateBgStyle: {
          backgroundImage: `url(${certStyle.customImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } as React.CSSProperties,
        certificateInkClass: '',
      };
    }
    if (certStyle.bgType === 'stars') {
      return {
        certificateBgClass: 'lr-cert-bg-stars',
        certificateBgStyle: {} as React.CSSProperties,
        certificateInkClass: 'lr-cert-ink-stars',
      };
    }
    if (certStyle.bgType === 'parchment') {
      return {
        certificateBgClass: 'lr-cert-bg-parchment',
        certificateBgStyle: {} as React.CSSProperties,
        certificateInkClass: 'lr-cert-ink-paper',
      };
    }
    if (certStyle.bgType === 'meadow') {
      return {
        certificateBgClass: 'lr-cert-bg-meadow',
        certificateBgStyle: {} as React.CSSProperties,
        certificateInkClass: 'lr-cert-ink-paper',
      };
    }
    return {
      certificateBgClass: 'lr-cert-bg-gradient',
      certificateBgStyle: {} as React.CSSProperties,
      certificateInkClass: '',
    };
  }, [certStyle.bgType, certStyle.customImageUrl]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 passport-studio-sheet-root">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-primary text-primary-fg border border-accent/40 shadow-xl text-xs font-semibold flex items-center gap-2">
          <Icon name="check" className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* CONTROL BAR (Hidden during print)                                   */}
      {/* ==================================================================== */}
      <div className="no-print space-y-4 rounded-xl bg-surface border border-edge p-4 sm:p-6 shadow-xs">
        {/* Top Header & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-edge-subtle">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-surface-elevated border border-edge text-primary flex items-center justify-center shrink-0">
              <Icon name="stamp" className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-semibold text-ink">
                  Reading Passport &amp; Certificate Studio
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-surface-elevated border border-accent/40 text-accent text-[10px] font-semibold">
                  Print Ready
                </span>
              </div>
              <p className="text-xs text-ink-secondary">
                Design custom passports, diplomas, and sticker sheets for {readerName}.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Icon name="printer" className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="download" className="w-4 h-4" />
              <span>HTML</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="px-3 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="share" className="w-4 h-4" />
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Studio"
              className="w-9 h-9 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary flex items-center justify-center transition-colors cursor-pointer"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar Row 1: Layout Mode & Presets Browser Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Layout Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mr-1 shrink-0">
              Format:
            </span>
            <button
              type="button"
              onClick={() => setLayoutMode('traditional-passport')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'traditional-passport'
                  ? 'bg-primary text-primary-fg shadow-xs'
                  : 'bg-surface-subtle border border-edge-subtle text-ink-secondary hover:bg-surface-elevated hover:text-ink'
              }`}
            >
              <Icon name="book" className="w-3.5 h-3.5" />
              <span>Two-Page Passport</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('official-certificate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'official-certificate'
                  ? 'bg-primary text-primary-fg shadow-xs'
                  : 'bg-surface-subtle border border-edge-subtle text-ink-secondary hover:bg-surface-elevated hover:text-ink'
              }`}
            >
              <Icon name="award" className="w-3.5 h-3.5" />
              <span>Honorary Certificate</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('storytime-bingo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'storytime-bingo'
                  ? 'bg-primary text-primary-fg shadow-xs'
                  : 'bg-surface-subtle border border-edge-subtle text-ink-secondary hover:bg-surface-elevated hover:text-ink'
              }`}
            >
              <Icon name="grid" className="w-3.5 h-3.5" />
              <span>Story Bingo</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('adventure-map')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'adventure-map'
                  ? 'bg-primary text-primary-fg shadow-xs'
                  : 'bg-surface-subtle border border-edge-subtle text-ink-secondary hover:bg-surface-elevated hover:text-ink'
              }`}
            >
              <Icon name="compass" className="w-3.5 h-3.5" />
              <span>Adventure Trail</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('stamp-sheet')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                layoutMode === 'stamp-sheet'
                  ? 'bg-primary text-primary-fg shadow-xs'
                  : 'bg-surface-subtle border border-edge-subtle text-ink-secondary hover:bg-surface-elevated hover:text-ink'
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
              className="px-3.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-subtle border border-accent/40 text-accent font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              <span>Series Presets &amp; Sets</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSavePresetModal(true)}
              className="px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold transition-colors cursor-pointer"
            >
              <span>Save Set</span>
            </button>
          </div>
        </div>

        {/* Toolbar Row 2: Books Chooser, Certificate Styling, and Theme Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {/* Column A: Book Scope & Picker */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-ink-secondary flex items-center justify-between">
              <span>Books to Include:</span>
              <span className="text-[10px] text-primary">
                {activeBooks.length} selected
              </span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                className="flex-1 text-xs rounded-lg border border-edge bg-surface-subtle text-ink p-2 font-medium"
              >
                <option value="preset-series">Series Preset Books</option>
                <option value="active-shelf">Active Shelf Books</option>
                <option value="saved-rotation">Saved Rotation</option>
                <option value="all-library">All Family Library</option>
              </select>
              <button
                type="button"
                onClick={() => setShowBookPicker(true)}
                className="px-3 py-2 rounded-lg bg-surface-elevated hover:bg-surface-subtle border border-edge text-ink text-xs font-semibold shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Icon name="checklist" className="w-3.5 h-3.5" />
                <span>Choose</span>
              </button>
            </div>
          </div>

          {/* Column B: Theme Selector */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-ink-secondary">
              Aesthetic Theme:
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="w-full text-xs rounded-lg border border-edge bg-surface-subtle text-ink p-2 font-medium"
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
            <label className="text-[11px] font-semibold text-ink-secondary flex items-center justify-between">
              <span>Title &amp; Background:</span>
              {layoutMode === 'official-certificate' && (
                <button
                  type="button"
                  onClick={() => setShowCertStylingModal(true)}
                  className="text-[11px] text-primary font-semibold underline cursor-pointer"
                >
                  Custom Style
                </button>
              )}
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={`${readerName}’s Reading Passport`}
              className="w-full text-xs rounded-lg border border-edge bg-surface-subtle text-ink p-2 font-medium"
            />
          </div>
        </div>

        {/* Digital Stamp Selection Bar */}
        <div className="pt-2 border-t border-edge-subtle flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mr-1">
              Active Stamp:
            </span>
            {PASSPORT_STAMPS.map((stamp) => (
              <button
                key={stamp.id}
                type="button"
                onClick={() => setSelectedStampId(stamp.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedStampId === stamp.id
                    ? `${stamp.color} ring-2 ring-primary shadow-xs`
                    : 'bg-surface-subtle border border-edge-subtle text-ink-secondary hover:bg-surface-elevated hover:text-ink'
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
              className="text-[11px] text-ink-secondary hover:text-danger font-medium underline cursor-pointer"
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
        className={`p-6 sm:p-10 rounded-3xl border shadow-md transition-all relative overflow-hidden lr-passport-doc ${themeDocClass} ${
          layoutMode === 'official-certificate' ? certificateInkClass : ''
        }`}
      >
        {/* Background layer for custom image/blur */}
        {layoutMode === 'official-certificate' && (
          <div
            className={`absolute inset-0 pointer-events-none z-0 ${certificateBgClass}`}
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
              <div className="p-4 rounded-2xl border text-center shadow-xs lr-passport-header">
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
                <div className="p-5 rounded-2xl border shadow-sm flex flex-col justify-between space-y-4 lr-passport-card">
                  <div>
                    {/* Top Passport Strip */}
                    <div className="flex items-center justify-between border-b lr-passport-divider pb-2 text-[10px] font-bold lr-passport-muted uppercase tracking-wider">
                      <span>PASSPORT / PASSEPORT</span>
                      <span className="font-mono text-xs lr-passport-accent">
                        {passportNumber}
                      </span>
                    </div>

                    {/* Photo + Details Box */}
                    <div className="flex gap-4 pt-4">
                      {/* Reader Photo Box */}
                      <div className="w-24 sm:w-28 shrink-0 flex flex-col items-center">
                        <div className="w-24 h-32 rounded-xl border-2 lr-passport-divider bg-surface-subtle overflow-hidden flex flex-col items-center justify-center relative shadow-xs">
                          {activeProfile?.avatarTone ? (
                            <div className="text-3xl font-display font-bold lr-passport-accent">
                              {activeProfile.name.slice(0, 1)}
                            </div>
                          ) : (
                            <Icon name="profiles" className="w-10 h-10 lr-passport-muted" />
                          )}
                          <div className="absolute bottom-1 inset-x-1 py-0.5 bg-scanner/85 text-[9px] text-scanner-ink text-center rounded font-mono uppercase">
                            OFFICIAL
                          </div>
                        </div>
                        <span className="text-[9px] lr-passport-muted mt-1 font-mono">
                          SEAL: AUTHORIZED
                        </span>
                      </div>

                      {/* Official Field Lines */}
                      <div className="flex-1 space-y-2 text-xs min-w-0">
                        <div>
                          <p className="text-[9px] uppercase font-bold lr-passport-muted">
                            Reader Name / Nom
                          </p>
                          <p className="font-display text-base font-bold lr-passport-ink truncate">
                            {readerName}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <p className="text-[9px] uppercase font-bold lr-passport-muted">Type</p>
                            <p className="font-mono font-bold">P (Passport)</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold lr-passport-muted">Nationality</p>
                            <p className="font-bold lr-passport-accent">Book Lover</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <p className="text-[9px] uppercase font-bold lr-passport-muted">Issue Date</p>
                            <p className="font-mono">{issuedDate}</p>
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold lr-passport-muted">Authority</p>
                            <p className="truncate">Home Library</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] uppercase font-bold lr-passport-muted">Reading Stage</p>
                          <p className="font-medium lr-passport-ink capitalize">
                            {activeProfile?.readingStage?.replace('-', ' ') || 'Story Explorer'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Machine Readable Zone (MRZ Bar) */}
                  <div className="pt-2">
                    <div className="lr-passport-mrz font-mono text-[10px] p-2.5 rounded-xl tracking-widest leading-relaxed overflow-x-auto shadow-inner select-none">
                      <div>{`P<RDR${readerName.toUpperCase().replace(/\s+/g, '<')}<<<<<<<<<<<<<<<<<<<`}</div>
                      <div>{`${passportNumber}01015F2611144LIB<<<<<<<<<<<`}</div>
                    </div>
                  </div>
                </div>

                {/* PAGE 2: Visas & Entry Stamps Grid */}
                <div className="p-5 rounded-2xl border shadow-sm flex flex-col justify-between space-y-3 lr-passport-card">
                  <div>
                    <div className="flex items-center justify-between border-b lr-passport-divider pb-2 text-[10px] font-bold lr-passport-muted uppercase tracking-wider">
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
                            className="p-2.5 rounded-xl border border-dashed lr-passport-slot transition-all cursor-pointer relative min-h-[96px] flex flex-col justify-between"
                          >
                            <div className="flex items-start gap-2">
                              <span className="w-4 h-4 rounded-full bg-surface-elevated lr-passport-muted text-[9px] font-mono font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-[11px] font-bold lr-passport-ink leading-tight truncate">
                                  {book.title}
                                </h4>
                                <p className="text-[10px] lr-passport-muted truncate">
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
                                <div className="w-10 h-10 rounded-full border border-dashed lr-passport-stamp-placeholder flex items-center justify-center text-[7px] font-bold text-center">
                                  STAMP
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-[9px] lr-passport-muted text-center italic">
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
              className={`p-6 sm:p-10 rounded-3xl relative overflow-hidden transition-all certificate-filigree-frame border-8 border-double ${
                certStyle.borderStyle === 'double'
                  ? 'lr-passport-gold-frame-double'
                  : 'lr-passport-gold-frame'
              }`}
            >
              <div className="relative z-10 text-center space-y-6">
                {/* Header Crest Emblem */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full lr-passport-gold-badge flex items-center justify-center shadow-md border-2">
                    <Icon name={certStyle.emblem || 'ribbon'} className="w-8 h-8" />
                  </div>
                </div>

                {/* Certificate Titles */}
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-widest font-bold lr-passport-gold-kicker">
                    HONORARY DIPLOMA OF READING EXCELLENCE
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight lr-passport-ink">
                    Certificate of Achievement
                  </h1>
                </div>

                {/* Recipient Section */}
                <div className="space-y-2 max-w-xl mx-auto">
                  <p className="text-xs lr-passport-muted uppercase tracking-wider font-semibold">
                    THIS CERTIFICATE IS PROUDLY CONFERRED UPON
                  </p>
                  <div className="py-2 border-b-2 lr-passport-gold-frame-double inline-block px-8">
                    <span className="font-display text-2xl sm:text-3xl font-extrabold lr-passport-ink">
                      {readerName}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm lr-passport-muted leading-relaxed italic max-w-lg mx-auto pt-1">
                    "{certStyle.dedicationText}"
                  </p>
                </div>

                {/* Books Mastered Showcase */}
                <div className="pt-2">
                  <p className="text-[11px] font-bold lr-passport-gold-kicker uppercase tracking-widest mb-3">
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
                          className="p-2 rounded-xl lr-passport-card border shadow-xs flex flex-col justify-between items-center text-center cursor-pointer hover:border-accent transition-all"
                        >
                          <div className="w-12 aspect-[3/4] rounded overflow-hidden shadow-2xs border lr-passport-divider mb-1.5">
                            <BookCover book={book as any} size="sm" aspectRatio="portrait" />
                          </div>
                          <p className="text-[10px] font-bold lr-passport-ink truncate w-full">
                            {book.title}
                          </p>

                          {/* Mini Stamp Badge */}
                          <div className="mt-1">
                            {activeStamp ? (
                              <span className="text-[10px] font-bold text-success">
                                {activeStamp.symbol} COMPLETED
                              </span>
                            ) : (
                              <span className="text-[9px] lr-passport-muted font-bold border border-dashed lr-passport-divider rounded px-1">
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
                <div className="pt-6 border-t lr-passport-divider grid grid-cols-3 items-end gap-4 max-w-2xl mx-auto text-xs">
                  {/* Left Signature */}
                  <div className="text-center">
                    <div className="font-serif italic text-base lr-passport-ink border-b lr-passport-divider pb-1">
                      {certStyle.parentSigner}
                    </div>
                    <p className="text-[9px] uppercase font-bold lr-passport-muted mt-1">
                      Parent / Guardian
                    </p>
                  </div>

                  {/* Golden Center Seal */}
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full lr-passport-gold-badge border-2 shadow-md flex items-center justify-center font-bold text-xs uppercase text-center leading-none p-1">
                      OFFICIAL SEAL
                    </div>
                    <p className="text-[9px] font-mono lr-passport-muted mt-1">{issuedDate}</p>
                  </div>

                  {/* Right Signature */}
                  <div className="text-center">
                    <div className="font-serif italic text-base lr-passport-ink border-b lr-passport-divider pb-1">
                      {certStyle.librarianSigner}
                    </div>
                    <p className="text-[9px] uppercase font-bold lr-passport-muted mt-1">
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
              <div className="p-5 rounded-2xl border text-center shadow-xs lr-passport-header">
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
                        className="aspect-square p-3 rounded-2xl lr-passport-gold-badge border-2 flex flex-col items-center justify-center text-center shadow-sm cursor-pointer select-none transition-transform hover:scale-[1.02]"
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
                      className={`aspect-square p-2.5 rounded-2xl border shadow-sm flex flex-col justify-between transition-all cursor-pointer select-none lr-passport-card ${
                        activeStamp ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] lr-passport-muted font-bold">
                          <span>TILE {idx + 1}</span>
                          {activeStamp && <span>{activeStamp.symbol}</span>}
                        </div>
                        <h4 className="text-[11px] font-bold lr-passport-ink leading-tight line-clamp-2">
                          {book?.title || challenge}
                        </h4>
                        {book?.author && (
                          <p className="text-[9px] lr-passport-muted truncate">{book.author}</p>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        {activeStamp ? (
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${activeStamp.color}`}>
                            {activeStamp.label}
                          </span>
                        ) : (
                          <span className="w-8 h-8 rounded-full border border-dashed lr-passport-stamp-placeholder flex items-center justify-center text-[7px] font-bold">
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
              <div className="p-5 rounded-2xl border text-center shadow-xs lr-passport-header">
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
                        isMilestone ? 'lr-passport-milestone shadow-xs' : 'lr-passport-card shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-8 h-8 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 ${
                            isMilestone ? 'lr-passport-milestone-badge' : 'bg-surface-elevated lr-passport-ink'
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="w-11 aspect-[3/4] rounded overflow-hidden shadow-2xs border lr-passport-divider shrink-0">
                          <BookCover book={book as any} size="sm" aspectRatio="portrait" />
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-display font-bold text-xs sm:text-sm lr-passport-ink truncate">
                            {book.title}
                          </h4>
                          <p className="text-[11px] lr-passport-muted truncate">
                            {book.author}
                          </p>
                          {isMilestone && (
                            <span className="text-[10px] font-bold lr-passport-milestone-ink block mt-0.5">
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
                              : 'border-dashed lr-passport-slot lr-passport-muted text-[8px] font-bold'
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
              <div className="p-5 rounded-2xl border text-center shadow-xs lr-passport-header">
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
                    className="aspect-square p-2 rounded-full border-2 border-dashed lr-passport-slot bg-surface flex flex-col items-center justify-center text-center shadow-xs transition-transform hover:scale-105"
                  >
                    <div
                      className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-2xs ${token.badgeClass}`}
                    >
                      <span className="text-base leading-none">{token.symbol}</span>
                      <span className="text-[8px] font-extrabold uppercase tracking-tight mt-0.5">
                        {token.title}
                      </span>
                    </div>
                    <span className="text-[8px] font-bold lr-passport-muted mt-1 uppercase">
                      {token.subtitle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Line */}
          <div className="pt-4 border-t lr-passport-divider flex items-center justify-between text-[10px] lr-passport-muted">
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
        <div
          className="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-scrim backdrop-blur-sm"
          onClick={() => setShowPresetBrowser(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-2xl rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden flex flex-col max-h-[88vh] pb-safe sm:pb-0"
          >
            <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden" aria-hidden="true" />
            <div className="p-5 border-b border-edge-subtle flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">
                  Reading Series &amp; Certificate Presets
                </h3>
                <p className="text-xs text-ink-secondary">
                  Select a pre-configured book collection or your own custom template.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPresetBrowser(false)}
                aria-label="Close preset browser"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge flex items-center justify-center text-ink-secondary active:scale-95 transition-transform cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {allPresets.map((preset) => (
                <div
                  key={preset.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    activePresetId === preset.id
                      ? 'border-primary bg-surface-elevated ring-1 ring-primary/30'
                      : 'border-edge hover:border-secondary bg-surface'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-semibold text-base text-ink">
                        {preset.title}
                      </h4>
                      {preset.isCustom && (
                        <span className="px-2 py-0.5 rounded-md bg-surface-subtle border border-edge text-ink-secondary text-[10px] font-semibold">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-secondary line-clamp-2">
                      {preset.description}
                    </p>
                    <p className="text-[11px] font-semibold text-accent">
                      {preset.books.length} books · {preset.defaultLayout} format · {preset.theme} theme
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Apply Set
                    </button>
                    {preset.isCustom && (
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(preset.id)}
                        className="p-2 rounded-lg text-danger hover:bg-surface-elevated text-xs cursor-pointer"
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
        <div
          className="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-scrim backdrop-blur-sm"
          onClick={() => setShowBookPicker(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-2xl rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden flex flex-col max-h-[88vh] pb-safe sm:pb-0"
          >
            <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden" aria-hidden="true" />
            <div className="p-5 border-b border-edge-subtle flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">
                  Choose &amp; Order Passport Books
                </h3>
                <p className="text-xs text-ink-secondary">
                  Select which books appear and arrange their order on the printable sheets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBookPicker(false)}
                aria-label="Close book picker"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge flex items-center justify-center text-ink-secondary active:scale-95 transition-transform cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>

            {/* Quick Filter & Add Manual Book */}
            <div className="p-4 border-b border-edge-subtle bg-surface-subtle space-y-3">
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Search by book title or author..."
                className="w-full text-xs rounded-lg border border-edge bg-surface text-ink p-2.5"
              />

              {/* Add Custom Book Entry */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newCustomTitle}
                  onChange={(e) => setNewCustomTitle(e.target.value)}
                  placeholder="Add custom title (e.g. Harry Potter 4)..."
                  className="flex-1 text-xs rounded-lg border border-edge bg-surface text-ink p-2"
                />
                <input
                  type="text"
                  value={newCustomAuthor}
                  onChange={(e) => setNewCustomAuthor(e.target.value)}
                  placeholder="Author..."
                  className="w-28 text-xs rounded-lg border border-edge bg-surface text-ink p-2"
                />
                <button
                  type="button"
                  onClick={handleAddCustomBook}
                  className="px-3 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold shrink-0 cursor-pointer"
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
                .map((book) => {
                  const isSelected = selectedBookIds.includes(book.id);

                  return (
                    <div
                      key={book.id}
                      className={`p-3 rounded-lg border flex items-center justify-between gap-3 transition-colors ${
                        isSelected
                          ? 'border-primary bg-surface-elevated'
                          : 'border-edge bg-surface'
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
                          className="w-4 h-4 rounded accent-[var(--primary)]"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-ink truncate">
                            {book.title}
                          </h4>
                          <p className="text-[11px] text-ink-secondary truncate">
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
                            className="p-1.5 rounded bg-surface-subtle hover:bg-surface border border-edge text-ink text-xs cursor-pointer"
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveBook(selectedBookIds.indexOf(book.id), 'down')}
                            className="p-1.5 rounded bg-surface-subtle hover:bg-surface border border-edge text-ink text-xs cursor-pointer"
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

            <div className="p-4 border-t border-edge-subtle flex items-center justify-between">
              <span className="text-xs text-ink-secondary">
                {selectedBookIds.length} books chosen for printable
              </span>
              <button
                type="button"
                onClick={() => setShowBookPicker(false)}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs cursor-pointer"
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
        <div
          className="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-scrim backdrop-blur-sm"
          onClick={() => setShowCertStylingModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-lg rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl px-6 pt-3 pb-6 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto pb-safe sm:pb-6"
          >
            <div className="w-10 h-1 bg-edge rounded-full mx-auto sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-edge-subtle pb-3">
              <h3 className="font-display text-xl font-semibold text-ink">
                Certificate Background &amp; Embellishment
              </h3>
              <button
                type="button"
                onClick={() => setShowCertStylingModal(false)}
                aria-label="Close certificate styling"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:w-8 sm:h-8 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge flex items-center justify-center text-ink-secondary active:scale-95 transition-transform cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Background Preset */}
              <div>
                <label className="font-semibold text-ink-secondary block mb-1">
                  Background Style:
                </label>
                <select
                  value={certStyle.bgType}
                  onChange={(e) => setCertStyle((prev) => ({ ...prev, bgType: e.target.value as any }))}
                  className="w-full rounded-lg border border-edge p-2 bg-surface-subtle text-ink"
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
                <div className="space-y-2 p-3 rounded-xl bg-surface-subtle border border-edge">
                  <div>
                    <label className="font-semibold text-ink block text-[11px] mb-1">Image URL:</label>
                    <input
                      type="text"
                      value={certStyle.customImageUrl}
                      onChange={(e) =>
                        setCertStyle((prev) => ({ ...prev, customImageUrl: e.target.value }))
                      }
                      placeholder="https://example.com/certificate-art.jpg"
                      className="w-full text-xs rounded-lg border border-edge p-2 bg-surface text-ink"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-ink block text-[11px] mb-1">Or Upload Local Image:</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="w-full text-xs text-ink-secondary"
                    />
                  </div>
                </div>
              )}

              {/* Blur Slider */}
              <div>
                <div className="flex justify-between font-semibold text-ink-secondary mb-1">
                  <span>Background Blur:</span>
                  <span className="font-mono-tabular">{certStyle.bgBlur}px</span>
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
                  className="w-full accent-[var(--primary)]"
                />
              </div>

              {/* Opacity Slider */}
              <div>
                <div className="flex justify-between font-semibold text-ink-secondary mb-1">
                  <span>Background Visibility:</span>
                  <span className="font-mono-tabular">{certStyle.bgOpacity}%</span>
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
                  className="w-full accent-[var(--primary)]"
                />
              </div>

              {/* Signers */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="font-semibold text-ink block text-[11px] mb-1">Parent Signer Name:</label>
                  <input
                    type="text"
                    value={certStyle.parentSigner}
                    onChange={(e) =>
                      setCertStyle((prev) => ({ ...prev, parentSigner: e.target.value }))
                    }
                    className="w-full text-xs rounded-lg border border-edge bg-surface-subtle text-ink p-2"
                  />
                </div>
                <div>
                  <label className="font-semibold text-ink block text-[11px] mb-1">Librarian / Guide:</label>
                  <input
                    type="text"
                    value={certStyle.librarianSigner}
                    onChange={(e) =>
                      setCertStyle((prev) => ({ ...prev, librarianSigner: e.target.value }))
                    }
                    className="w-full text-xs rounded-lg border border-edge bg-surface-subtle text-ink p-2"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-edge-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setShowCertStylingModal(false)}
                className="px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs cursor-pointer"
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
        <div
          className="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-scrim backdrop-blur-sm"
          onClick={() => setShowSavePresetModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-md rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl px-6 pt-3 pb-6 sm:p-6 space-y-4 pb-safe sm:pb-6"
          >
            <div className="w-10 h-1 bg-edge rounded-full mx-auto sm:hidden" aria-hidden="true" />
            <h3 className="font-display text-xl font-semibold text-ink">
              Save Current Passport as Template
            </h3>
            <p className="text-xs text-ink-secondary">
              Save this combination of books, theme, layout, and dedication as a reusable preset.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Template Title:</label>
                <input
                  type="text"
                  value={newPresetTitle}
                  onChange={(e) => setNewPresetTitle(e.target.value)}
                  placeholder="e.g. Bedtime Chapter Book Challenge"
                  className="w-full rounded-lg border border-edge p-2.5 bg-surface-subtle text-ink"
                />
              </div>
              <div>
                <label className="font-semibold text-ink block mb-1">Series Name:</label>
                <input
                  type="text"
                  value={newPresetSeries}
                  onChange={(e) => setNewPresetSeries(e.target.value)}
                  placeholder="e.g. Magic Treehouse Series"
                  className="w-full rounded-lg border border-edge p-2.5 bg-surface-subtle text-ink"
                />
              </div>
              <div>
                <label className="font-semibold text-ink block mb-1">Description:</label>
                <textarea
                  value={newPresetDesc}
                  onChange={(e) => setNewPresetDesc(e.target.value)}
                  placeholder="Notes about this reading challenge..."
                  rows={2}
                  className="w-full rounded-lg border border-edge p-2.5 bg-surface-subtle text-ink"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-edge-subtle flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-2 rounded-lg text-xs font-semibold text-ink-secondary hover:bg-surface-elevated active:scale-[0.98] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentAsPreset}
                disabled={!newPresetTitle.trim()}
                className="min-h-[44px] sm:min-h-[36px] px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs disabled:opacity-50 active:scale-[0.98] transition-all cursor-pointer"
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
