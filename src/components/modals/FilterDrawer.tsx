import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

export interface LibraryFilterControlsProps {
  catalogFilter: string;
  setCatalogFilter: (filter: string) => void;
  selectedFormats: string[];
  setSelectedFormats: React.Dispatch<React.SetStateAction<string[]>>;
  selectedThemes: string[];
  setSelectedThemes: React.Dispatch<React.SetStateAction<string[]>>;
  ownerFilter: string;
  setOwnerFilter: (filter: string) => void;
  selectedOwners: string[];
  setSelectedOwners: React.Dispatch<React.SetStateAction<string[]>>;
  conditionFilter: string;
  setConditionFilter: (filter: string) => void;
  freshnessFilter: string;
  setFreshnessFilter: (filter: string) => void;
  sortBy: string;
  setSortBy: (sort: string) => void;
  availableThemes: Array<{ tag: string; count: number }>;
  ownerChoices: Array<{ key: string; label: string; initial: string; tone: string }>;
  effectiveOwners: string[];
}

export const LibraryFilterControls: React.FC<LibraryFilterControlsProps> = ({
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
}) => {
  const { state, activeProfile } = useApp();

  const showRotationHistory = state.settings?.enableRotationHistoryInsights !== false;

  const shelfOptions = [
    { id: 'all', label: 'All Books' },
    { id: 'owned', label: 'Owned' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'loved', label: 'Loved' },
  ];

  const formatOptions = [
    { id: 'board-book', label: 'Board Book' },
    { id: 'paperback', label: 'Paperback' },
    { id: 'hardcover', label: 'Hardcover' },
  ];

  const freshnessOptions = [
    { id: 'all', label: 'Any Shelf History' },
    { id: 'long-unseen', label: 'Long Unseen (2+ cycles / Never)' },
    { id: 'never-rotated', label: 'Never Rotated' },
    { id: 'ready', label: 'Ready (Out of Cooldown)' },
    { id: 'in-cooldown', label: 'In Cooldown' },
    { id: 'unread', label: 'Unread' },
  ];

  const sortOptions = [
    { id: 'default', label: 'Library Default' },
    { id: 'longest-off-shelf', label: 'Longest Off-Shelf First' },
    { id: 'recently-rotated', label: 'Recently Rotated First' },
    { id: 'title', label: 'Title (A–Z)' },
  ];

  const conditionOptions = [
    { id: 'all', label: 'Any Condition' },
    { id: 'good', label: 'Good Only' },
    { id: 'needs-care', label: 'Needs Care (Torn / Broken / Retired)' },
  ];

  const toggleFormat = (fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const toggleTheme = (thm: string) => {
    setSelectedThemes((prev) => {
      const lower = thm.toLowerCase();
      return prev.some((t) => t.toLowerCase() === lower)
        ? prev.filter((t) => t.toLowerCase() !== lower)
        : [...prev, thm];
    });
  };

  const toggleOwner = (ownerKey: string) => {
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

  return (
    <div className="space-y-5 text-left">
      {/* Group 1: Shelf */}
      <section aria-labelledby="filter-group-shelf" className="space-y-2">
        <h3
          id="filter-group-shelf"
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          Shelf
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {shelfOptions.map((opt) => {
            const active = catalogFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-action="set-catalog-filter"
                data-filter={opt.id}
                aria-pressed={active ? 'true' : 'false'}
                onClick={() => setCatalogFilter(opt.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface-subtle border border-edge text-ink hover:bg-surface-elevated'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Group 2: Format / Type (Multi-select) */}
      <section
        aria-labelledby="filter-group-format"
        className="pt-4 border-t border-edge-subtle space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            id="filter-group-format"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
          >
            Book Type
          </h3>
          <span className="text-[11px] text-ink-muted">Multi-select</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {formatOptions.map((fmt) => {
            const active = selectedFormats.includes(fmt.id);
            return (
              <button
                key={fmt.id}
                type="button"
                data-action="toggle-library-format"
                data-format={fmt.id}
                aria-pressed={active ? 'true' : 'false'}
                onClick={() => toggleFormat(fmt.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface-subtle border border-edge text-ink hover:bg-surface-elevated'
                }`}
              >
                {fmt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Group 3: Owner / Reader */}
      <section
        aria-labelledby="filter-group-owner"
        className="pt-4 border-t border-edge-subtle space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            id="filter-group-owner"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
          >
            Owner / Reader
          </h3>
          {effectiveOwners.length > 0 ? (
            <button
              type="button"
              data-action="set-owner-filter"
              data-owner="all"
              onClick={() => {
                setOwnerFilter('all');
                setSelectedOwners([]);
              }}
              className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              Include All
            </button>
          ) : (
            <span className="text-[11px] text-ink-muted">All included</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ownerChoices.map((chip) => {
            const active = effectiveOwners.some(
              (o) => o.toLowerCase() === chip.key.toLowerCase()
            );
            return (
              <button
                key={chip.key}
                type="button"
                data-action="toggle-library-owner"
                data-owner={chip.key}
                aria-pressed={active ? 'true' : 'false'}
                onClick={() => toggleOwner(chip.key)}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface-subtle border border-edge text-ink hover:bg-surface-elevated'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${
                    AVATAR_TONES[chip.tone] || AVATAR_TONES.teal
                  }`}
                >
                  {chip.initial}
                </span>
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Group 4: Themes & Topics */}
      {availableThemes.length > 0 && (
        <section
          aria-labelledby="filter-group-themes"
          className="pt-4 border-t border-edge-subtle space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="filter-group-themes"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              Themes &amp; Topics
            </h3>
            <span className="text-[11px] text-ink-muted">Multi-select</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableThemes.map((item) => {
              const active = selectedThemes.some(
                (t) => t.toLowerCase() === item.tag.toLowerCase()
              );
              return (
                <button
                  key={item.tag}
                  type="button"
                  data-action="toggle-library-theme"
                  data-theme-tag={item.tag}
                  aria-pressed={active ? 'true' : 'false'}
                  onClick={() => toggleTheme(item.tag)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink hover:bg-surface-elevated'
                  }`}
                >
                  <span>{item.tag}</span>
                  <span className="text-[10px] font-mono-tabular opacity-75">{item.count}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Group 5: Freshness & Group 6: Sort Order */}
      {showRotationHistory && (
        <>
          <section
            aria-labelledby="filter-group-freshness"
            className="pt-4 border-t border-edge-subtle space-y-2"
          >
            <h3
              id="filter-group-freshness"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              Shelf Freshness
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {freshnessOptions.map((opt) => {
                const active = freshnessFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-action="set-library-freshness"
                    data-freshness={opt.id}
                    aria-pressed={active ? 'true' : 'false'}
                    onClick={() => setFreshnessFilter(opt.id)}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-primary text-primary-fg shadow-2xs'
                        : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink hover:bg-surface-elevated'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-labelledby="filter-group-sort"
            className="pt-4 border-t border-edge-subtle space-y-2"
          >
            <h3
              id="filter-group-sort"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
            >
              Sort Order
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {sortOptions.map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-action="set-library-sort"
                    data-sort={opt.id}
                    aria-pressed={active ? 'true' : 'false'}
                    onClick={() => setSortBy(opt.id)}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-primary text-primary-fg shadow-2xs'
                        : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink hover:bg-surface-elevated'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Group 7: Book Care / Condition */}
      <section
        aria-labelledby="filter-group-condition"
        className="pt-4 border-t border-edge-subtle space-y-2"
      >
        <h3
          id="filter-group-condition"
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          Book Care
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {conditionOptions.map((cond) => {
            const active = conditionFilter === cond.id;
            return (
              <button
                key={cond.id}
                type="button"
                data-action="set-library-condition"
                data-condition-filter={cond.id}
                aria-pressed={active ? 'true' : 'false'}
                onClick={() => setConditionFilter(cond.id)}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink hover:bg-surface-elevated'
                }`}
              >
                {cond.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

interface FilterDrawerProps extends LibraryFilterControlsProps {
  isOpen: boolean;
  onClose: () => void;
  filteredCount: number;
  activeFilterCount: number;
  onResetAll: () => void;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
  filteredCount,
  activeFilterCount,
  onResetAll,
  ...controlProps
}) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div
      data-library-filter-drawer="true"
      data-backdrop-action="close-library-filters"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex justify-start lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-filter-drawer-title"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="animate-drawer-left w-[94vw] sm:w-[440px] max-w-[95vw] h-full bg-surface border-r border-edge shadow-2xl flex flex-col pt-safe"
      >
        <div className="px-5 py-4 border-b border-edge-subtle flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="filter" className="w-4 h-4 text-primary" />
            <h2
              id="library-filter-drawer-title"
              className="font-display text-xl font-semibold text-ink"
            >
              Filter Library
            </h2>
          </div>

          <button
            type="button"
            data-action="close-library-filters"
            onClick={onClose}
            aria-label="Close filters sidebar"
            className="min-h-[48px] min-w-[48px] sm:min-h-[40px] sm:min-w-[40px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle flex items-center justify-center transition-all active:scale-95 cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <LibraryFilterControls {...controlProps} />
        </div>

        <div className="p-4 pb-safe border-t border-edge-subtle bg-surface-subtle flex items-center justify-between gap-2.5">
          <button
            type="button"
            data-action="reset-library-filters"
            disabled={activeFilterCount === 0}
            onClick={onResetAll}
            className="min-h-[48px] sm:min-h-[44px] px-4 py-2 rounded-lg bg-surface hover:bg-surface-elevated disabled:opacity-45 border border-edge text-xs font-semibold text-ink transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            Reset
          </button>

          <button
            type="button"
            data-action="close-library-filters"
            onClick={onClose}
            className="flex-1 min-h-[48px] sm:min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] whitespace-nowrap cursor-pointer"
          >
            Show <span className="font-mono-tabular">{filteredCount}</span>{' '}
            {filteredCount === 1 ? 'Book' : 'Books'}
          </button>
        </div>
      </aside>
    </div>
  );
};
