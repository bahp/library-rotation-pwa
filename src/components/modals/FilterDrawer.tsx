import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { computeOwnerInitials } from '../../types/models.js';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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
  filteredCount: number;
  activeFilterCount: number;
  onResetAll: () => void;
}

export const FilterDrawer: React.FC<FilterDrawerProps> = ({
  isOpen,
  onClose,
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
  filteredCount,
  activeFilterCount,
  onResetAll,
}) => {
  const { state, activeProfile } = useApp();

  if (!isOpen) return null;

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
    <div
      data-library-filter-drawer="true"
      data-backdrop-action="close-library-filters"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex justify-start"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-filter-drawer-title"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="animate-drawer-left w-[94vw] sm:w-[440px] md:w-[480px] max-w-[95vw] h-full bg-ivory dark:bg-night-900 border-r border-linen-200 dark:border-night-700 shadow-2xl flex flex-col pt-safe"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="filter" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
            <h2 id="library-filter-drawer-title" className="font-display text-lg font-bold text-forest-900 dark:text-white">
              Filter Library
            </h2>
          </div>

          <button
            type="button"
            data-action="close-library-filters"
            onClick={onClose}
            aria-label="Close filters sidebar"
            className="min-h-[40px] min-w-[40px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center transition-colors"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Grouped Filter Sections */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-left">
          {/* Group 1: Shelf */}
          <section aria-labelledby="filter-group-shelf" className="space-y-2">
            <h3 id="filter-group-shelf" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
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
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                        : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:bg-linen-100 dark:hover:bg-night-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Group 2: Format / Type (Multi-select) */}
          <section aria-labelledby="filter-group-format" className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="filter-group-format" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                Book Type
              </h3>
              <span className="text-[11px] text-stone-ink/80 dark:text-slate-400">Multi-select</span>
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
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                        : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:bg-linen-100 dark:hover:bg-night-800'
                    }`}
                  >
                    {fmt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Group 3: Owner / Reader (Unified Multi-select) */}
          <section aria-labelledby="filter-group-owner" className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="filter-group-owner" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
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
                  className="text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline"
                >
                  Include All
                </button>
              ) : (
                <span className="text-[11px] text-stone-ink/80 dark:text-slate-400">All included</span>
              )}
            </div>
            <p className="text-[11px] text-stone-ink dark:text-slate-400 leading-snug">
              Select any combination of readers or Shared books.
            </p>
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
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                        : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:bg-linen-100 dark:hover:bg-night-800'
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

          {/* Group 4: Themes & Topics (Multi-select) */}
          {availableThemes.length > 0 && (
            <section aria-labelledby="filter-group-themes" className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 id="filter-group-themes" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                  Themes & Topics
                </h3>
                <span className="text-[11px] text-stone-ink/80 dark:text-slate-400">Multi-select</span>
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
                      className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                          : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
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

          {/* Group 5: Rotation Freshness & Group 6: Sort Order */}
          {showRotationHistory && (
            <>
              <section aria-labelledby="filter-group-freshness" className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
                <h3 id="filter-group-freshness" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
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
                        className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="filter-group-sort" className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
                <h3 id="filter-group-sort" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
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
                        className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
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
          <section aria-labelledby="filter-group-condition" className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-2">
            <h3 id="filter-group-condition" className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
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
                    className={`min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                        : 'bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                    }`}
                  >
                    {cond.label}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 pb-safe border-t border-linen-200/80 dark:border-night-800 bg-linen-50/80 dark:bg-night-950/60 flex items-center justify-between gap-2.5">
          <button
            type="button"
            data-action="reset-library-filters"
            disabled={activeFilterCount === 0}
            onClick={onResetAll}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-45 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            Reset
          </button>

          <button
            type="button"
            data-action="close-library-filters"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Show <span className="font-mono-tabular">{filteredCount}</span> {filteredCount === 1 ? 'Book' : 'Books'}
          </button>
        </div>
      </aside>
    </div>
  );
};
