import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import {
  ALL_ARTWORK_LIBRARY,
  type ArtworkLibraryCategory,
  type PresetArtworkOption,
} from '../../ui/preset-artwork.js';

type PickerCategoryFilter = 'all' | ArtworkLibraryCategory;

const PICKER_CATEGORIES: ReadonlyArray<{ id: PickerCategoryFilter; label: string }> = [
  { id: 'all', label: 'All Artwork' },
  { id: 'seasonal-holidays', label: 'Seasonal & Holidays' },
  { id: 'cultural-traditions', label: 'Cultural Traditions' },
  { id: 'evergreen', label: 'Everyday & Learning' },
  { id: 'classic-watercolors', label: 'Classic Watercolors' },
];

interface ArtworkPickerModalProps {
  isOpen: boolean;
  selectedArtworkId: string;
  suggestedArtworkId: string;
  collectionTitle?: string;
  onSelect: (artwork: PresetArtworkOption) => void;
  onClose: () => void;
}

export const ArtworkPickerModal: React.FC<ArtworkPickerModalProps> = ({
  isOpen,
  selectedArtworkId,
  suggestedArtworkId,
  collectionTitle = '',
  onSelect,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PickerCategoryFilter>('all');
  const [pendingId, setPendingId] = useState<string>(selectedArtworkId || suggestedArtworkId || 'winter-cozy');
  const [previewSurface, setPreviewSurface] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (!isOpen) return;
    setPendingId(selectedArtworkId || suggestedArtworkId || ALL_ARTWORK_LIBRARY[0].id);
    setSearchQuery('');
    setSelectedCategory('all');
  }, [isOpen, selectedArtworkId, suggestedArtworkId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: ALL_ARTWORK_LIBRARY.length };
    for (const item of ALL_ARTWORK_LIBRARY) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filteredArtwork = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_ARTWORK_LIBRARY.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const hay = `${item.label} ${item.subject} ${item.id} ${item.keywords.join(' ')} ${item.associatedPresetTitles.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [searchQuery, selectedCategory]);

  const inspectedArtwork = useMemo(() => {
    return (
      ALL_ARTWORK_LIBRARY.find((item) => item.id === pendingId) ||
      ALL_ARTWORK_LIBRARY.find((item) => item.id === suggestedArtworkId) ||
      ALL_ARTWORK_LIBRARY[0]
    );
  }, [pendingId, suggestedArtworkId]);

  const suggestedArtwork = useMemo(() => {
    return (
      ALL_ARTWORK_LIBRARY.find((item) => item.id === suggestedArtworkId) ||
      ALL_ARTWORK_LIBRARY[0]
    );
  }, [suggestedArtworkId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="artwork-picker-title"
      className="sheet-backdrop fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-5xl h-[92dvh] sm:h-[86dvh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-edge-subtle flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="artwork-picker-title"
              className="font-display text-xl font-semibold text-ink truncate"
            >
              Browse Collection Artwork
            </h2>
            <p className="text-xs text-ink-secondary mt-0.5 truncate">
              {collectionTitle
                ? `Pick any illustration for "${collectionTitle}" · ${filteredArtwork.length} shown`
                : `42 storybook transparent illustrations & 6 classic watercolors · ${filteredArtwork.length} shown`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close artwork browser"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-lg text-ink-secondary hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Search + Category Filter Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-edge-subtle bg-surface-subtle/60 space-y-2.5 shrink-0">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
              <Icon name="search" className="w-4 h-4" />
            </span>
            <ClearableInput
              id="artwork-picker-search"
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search by subject, animal, holiday, or collection (e.g. fox, train, diwali, frog)…"
              className="w-full h-11 pl-9 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:border-primary"
            />
          </div>

          <div
            role="tablist"
            aria-label="Filter artwork by category"
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            {PICKER_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              const count = categoryCounts[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'bg-surface hover:bg-surface-elevated border border-edge text-ink-secondary'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Split Area: Artwork Visual Grid + Large Inspect Preview */}
        <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_300px] overflow-hidden">
          {/* Large Inspect Preview Pane (Compact top preview on mobile, side panel on desktop) */}
          <aside className="order-1 lg:order-2 border-b lg:border-b-0 lg:border-l border-edge-subtle bg-surface-subtle/40 p-3.5 sm:p-4 flex flex-row lg:flex-col items-center lg:items-stretch gap-3.5 shrink-0">
            <div className="w-32 sm:w-40 lg:w-full shrink-0 space-y-1.5">
              <div
                className={`relative aspect-[4/3] w-full rounded-xl border overflow-hidden flex items-center justify-center p-2 transition-colors ${
                  previewSurface === 'dark'
                    ? 'bg-[#101713] border-[#26352C]'
                    : 'bg-[#FAF7F2] border-[#E3DDD1]'
                }`}
              >
                <img
                  src={inspectedArtwork.src}
                  alt={inspectedArtwork.label}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full ${
                    inspectedArtwork.isTransparent
                      ? 'object-contain'
                      : 'object-cover rounded-lg'
                  }`}
                />
              </div>

              <div
                role="group"
                aria-label="Preview background surface"
                className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-surface border border-edge"
              >
                <button
                  type="button"
                  onClick={() => setPreviewSurface('light')}
                  aria-pressed={previewSurface === 'light'}
                  className={`min-h-[28px] rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    previewSurface === 'light'
                      ? 'bg-primary text-primary-fg'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  Light Paper
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSurface('dark')}
                  aria-pressed={previewSurface === 'dark'}
                  className={`min-h-[28px] rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    previewSurface === 'dark'
                      ? 'bg-primary text-primary-fg'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  Dark Surface
                </button>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                  {inspectedArtwork.isTransparent ? 'Transparent PNG' : 'Classic Watercolor'}
                </span>
                {inspectedArtwork.id === suggestedArtwork.id && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                    · Suggested Match
                  </span>
                )}
              </div>

              <h3 className="font-display text-base sm:text-lg font-semibold text-ink leading-snug">
                {inspectedArtwork.label}
              </h3>

              <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2 lg:line-clamp-none">
                {inspectedArtwork.subject}
              </p>

              {inspectedArtwork.associatedPresetTitles.length > 0 && (
                <p className="hidden sm:block text-[11px] text-ink-muted leading-snug">
                  Featured in: {inspectedArtwork.associatedPresetTitles.join(', ')}
                </p>
              )}

              {inspectedArtwork.id !== suggestedArtwork.id && (
                <button
                  type="button"
                  onClick={() => setPendingId(suggestedArtwork.id)}
                  className="mt-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-primary inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Icon name="sparkles" className="w-3.5 h-3.5" />
                  <span>Jump to Suggested ({suggestedArtwork.label})</span>
                </button>
              )}
            </div>
          </aside>

          {/* Scrollable Visual Artwork Grid */}
          <div className="order-2 lg:order-1 flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
            {filteredArtwork.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredArtwork.map((item) => {
                  const isSelected = item.id === inspectedArtwork.id;
                  const isSuggested = item.id === suggestedArtwork.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-artwork-tile={item.id}
                      aria-pressed={isSelected}
                      onClick={() => setPendingId(item.id)}
                      onDoubleClick={() => {
                        onSelect(item);
                        onClose();
                      }}
                      className={`group relative rounded-xl border p-2 text-left flex flex-col gap-2 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/35 bg-primary/5 shadow-xs'
                          : 'border-edge bg-surface hover:border-primary/45 hover:bg-surface-subtle/70'
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full rounded-lg bg-surface-subtle/80 border border-edge-subtle overflow-hidden flex items-center justify-center p-1.5">
                        <img
                          src={item.src}
                          alt={item.label}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className={`w-full h-full transition-transform duration-200 group-hover:scale-[1.03] ${
                            item.isTransparent ? 'object-contain' : 'object-cover rounded-md'
                          }`}
                        />

                        {isSelected && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary text-primary-fg flex items-center justify-center shadow-xs"
                          >
                            <Icon name="check" className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 px-0.5">
                        <p className="text-xs font-semibold text-ink leading-snug line-clamp-1">
                          {item.label}
                        </p>
                        <p className="text-[10px] text-ink-muted truncate mt-0.5">
                          {isSuggested
                            ? 'Suggested match'
                            : item.isTransparent
                              ? 'Storybook transparent'
                              : 'Classic watercolor'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Icon name="image" className="w-8 h-8 text-ink-muted" />
                <p className="text-sm font-semibold text-ink">
                  No illustrations match “{searchQuery}”
                </p>
                <p className="text-xs text-ink-secondary">
                  Try another keyword or clear the category filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer"
                >
                  Show All Artwork
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="px-4 sm:px-6 py-3 border-t border-edge-subtle bg-surface flex items-center justify-between gap-3 shrink-0">
          <p className="hidden sm:block text-xs text-ink-secondary truncate">
            Selected: <strong className="text-ink">{inspectedArtwork.label}</strong>
          </p>
          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] sm:min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(inspectedArtwork);
                onClose();
              }}
              className="min-h-[44px] sm:min-h-[40px] px-5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Icon name="check" className="w-4 h-4" />
              <span>Use Illustration</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
