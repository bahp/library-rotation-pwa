import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { PresetCard } from '../cards/PresetCard.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import {
  PRESET_MONTH_NAMES,
  buildMonthDayFromParts,
  computePresetStartSchedule,
  findMatchingStartDatePresets,
  getAllRotationPresets,
  normalizeMonthDay,
} from '../../features/rotations/rotation-presets.js';
import { PRESET_MOTIF_OPTIONS, resolvePresetMotifKey } from '../../ui/preset-motifs.js';
import type { BookFormat, PresetCategory, RotationPreset } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface PresetsViewProps {
  embedded?: boolean;
}

export const PresetsView: React.FC<PresetsViewProps> = ({ embedded = false }) => {
  const { state, store, activeProfile, activeRotation, navigate, t } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Custom / Built-in override Preset Form Sheet
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<PresetCategory>('seasonal-holidays');
  const [formTags, setFormTags] = useState('');
  const [formCount, setFormCount] = useState(5);
  const [formSwapDays, setFormSwapDays] = useState(14);
  const [formCooldownDays, setFormCooldownDays] = useState(21);
  const [formFormat, setFormFormat] = useState<BookFormat | 'any'>('any');
  const [formVarietyMix, setFormVarietyMix] = useState(true);
  const [formMonth, setFormMonth] = useState('');
  const [formDay, setFormDay] = useState('');
  const [formMotif, setFormMotif] = useState('sparkles');
  const [formSeed, setFormSeed] = useState('');
  const [formError, setFormError] = useState('');

  useBodyScrollLock(isFormOpen);

  const allPresets = useMemo(() => getAllRotationPresets(state), [state]);
  const showDecorations = state.settings?.showPresetDecorations !== false;

  const currentMonthNum = new Date().getMonth() + 1;

  const datedPresetMonths = useMemo(() => {
    const map = new Map<number, number>();
    for (const preset of allPresets) {
      const parsed = normalizeMonthDay(preset.suggestedStartMonthDay);
      if (parsed.valid && parsed.month) {
        map.set(parsed.month, (map.get(parsed.month) || 0) + 1);
      }
    }
    return map;
  }, [allPresets]);

  const upcomingMatchIds = useMemo(() => {
    const profileRotations = activeProfile
      ? state.rotations.filter((r) => r.profileId === activeProfile.id)
      : [];
    const matches = findMatchingStartDatePresets(allPresets, new Date(), {
      activeRotation,
      profileRotations,
      daysBefore: state.settings?.presetAlertDaysBefore ?? 2,
      daysAfter: state.settings?.presetAlertDaysAfter ?? 5,
    });
    return new Set(matches.map((m) => m.preset.id));
  }, [allPresets, activeProfile, state.rotations, activeRotation, state.settings?.presetAlertDaysBefore, state.settings?.presetAlertDaysAfter]);

  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allPresets.filter((preset) => {
      if (selectedCategory === 'upcoming' && !upcomingMatchIds.has(preset.id)) {
        return false;
      } else if (selectedCategory === 'custom' && !preset.isCustom && !preset.isBuiltInOverride) {
        return false;
      } else if (
        selectedCategory !== 'all' &&
        selectedCategory !== 'upcoming' &&
        selectedCategory !== 'custom' &&
        preset.category !== selectedCategory
      ) {
        return false;
      }

      if (selectedMonth !== null) {
        const sched = computePresetStartSchedule(preset);
        if (sched.month !== selectedMonth) return false;
      }

      if (!q) return true;
      const haystack = `${preset.title} ${preset.description} ${preset.category} ${(
        preset.preferredTags || []
      ).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allPresets, selectedCategory, selectedMonth, searchQuery, upcomingMatchIds]);

  const handleApplyPreset = async (preset: RotationPreset) => {
    if (!activeProfile) return;
    try {
      await store.generateRotationFromPreset(preset.id, {
        profileId: activeProfile.id,
      });
      store.notify(`Generated "${preset.title}" shelf!`, 'success');
      navigate('rotations');
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const openNewPresetForm = () => {
    setEditingPresetId(null);
    setFormTitle('');
    setFormDescription('');
    setFormCategory('seasonal-holidays');
    setFormTags('');
    setFormCount(activeProfile?.defaultRotationSize || 5);
    setFormSwapDays(14);
    setFormCooldownDays(21);
    setFormFormat('any');
    setFormVarietyMix(true);
    setFormMonth('');
    setFormDay('');
    setFormMotif('sparkles');
    setFormSeed('');
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditPresetForm = (preset: RotationPreset, asClone = false) => {
    const parsedMd = normalizeMonthDay(preset.suggestedStartMonthDay);
    setEditingPresetId(asClone ? null : preset.id);
    setFormTitle(asClone ? `${preset.title} (Custom)` : preset.title);
    setFormDescription(preset.description);
    setFormCategory(preset.category || 'evergreen');
    setFormTags((preset.preferredTags || []).join(', '));
    setFormCount(preset.count || 5);
    setFormSwapDays(preset.swapDays || 14);
    setFormCooldownDays(preset.cooldownDays ?? 21);
    setFormFormat(preset.requiredFormat || 'any');
    setFormVarietyMix(preset.varietyMix !== false);
    setFormMonth(parsedMd.valid && parsedMd.month ? String(parsedMd.month).padStart(2, '0') : '');
    setFormDay(parsedMd.valid && parsedMd.day ? String(parsedMd.day) : '');
    setFormMotif(
      resolvePresetMotifKey({
        motif: preset.motif,
        category: preset.category,
        title: preset.title,
        preferredTags: preset.preferredTags,
      })
    );
    setFormSeed(asClone ? '' : preset.seed || '');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSavePresetForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const mdRes = buildMonthDayFromParts(formMonth, formDay);
      if (!mdRes.valid) {
        setFormError(mdRes.error || 'Invalid suggested start date.');
        return;
      }

      const payload = {
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        preferredTags: formTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        count: Number(formCount),
        swapDays: Number(formSwapDays),
        cooldownDays: Number(formCooldownDays),
        requiredFormat: formFormat,
        varietyMix: formVarietyMix,
        suggestedStartMonthDay: mdRes.monthDay,
        motif: formMotif,
        seed: formSeed.trim() || undefined,
      };

      if (editingPresetId) {
        await store.updateRotationPreset(editingPresetId, payload);
      } else {
        await store.addRotationPreset(payload);
      }
      setIsFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const categoryChoices = [
    { id: 'all', label: 'All Collections' },
    ...(upcomingMatchIds.size > 0
      ? [{ id: 'upcoming', label: `Seasonal Alerts (${upcomingMatchIds.size})` }]
      : []),
    { id: 'seasonal-holidays', label: t('presetCategories.seasonalHolidays') },
    { id: 'cultural-traditions', label: t('presetCategories.culturalTraditions') },
    { id: 'calendar-events', label: t('presetCategories.calendarEvents') },
    { id: 'evergreen', label: t('presetCategories.evergreen') },
    { id: 'custom', label: 'Custom & Edited' },
  ];

  return (
    <div className={embedded ? 'space-y-4 text-left' : 'space-y-5 text-left max-w-6xl mx-auto'}>
      {!embedded && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white inline-flex items-center gap-1 mb-1.5"
            >
              <span>← Back to Shelves</span>
            </button>
            <h1 className="font-display text-2xl sm:text-[30px] font-bold tracking-tight text-forest-900 dark:text-white">
              Curated Collection Presets
            </h1>
            <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-0.5">
              Turnkey seasonal, cultural, and evergreen shelf generators ready in one tap.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewPresetForm}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>New Preset</span>
          </button>
        </div>
      )}

      {/* Search + Category + New Preset Toolbar */}
      <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-ink dark:text-slate-400">
              <Icon name="search" className="w-4 h-4" />
            </span>
            <ClearableInput
              id="presets-search-input"
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search presets by theme, tag, or objective…"
              className="w-full h-11 pl-9 pr-9 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
            />
          </div>

          <select
            aria-label="Filter presets by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-11 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white sm:w-56"
          >
            {categoryChoices.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>

          {embedded && (
            <button
              type="button"
              onClick={openNewPresetForm}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>New Preset</span>
            </button>
          )}
        </div>

        {/* Compact Year Calendar Month Filter Strip */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedMonth(null)}
            aria-pressed={selectedMonth === null}
            className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              selectedMonth === null
                ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                : 'bg-linen-100/80 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-ink dark:text-slate-300'
            }`}
          >
            All Months
          </button>
          {SHORT_MONTHS.map((label, idx) => {
            const monthNum = idx + 1;
            const count = datedPresetMonths.get(monthNum) || 0;
            const active = selectedMonth === monthNum;
            const isNow = currentMonthNum === monthNum;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedMonth(active ? null : monthNum)}
                aria-pressed={active}
                title={count > 0 ? `${PRESET_MONTH_NAMES[idx]} (${count} seasonal presets)` : PRESET_MONTH_NAMES[idx]}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1 ${
                  active
                    ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                    : isNow
                      ? 'bg-forest-50 border border-forest-700/35 text-forest-900 dark:bg-forest-950/60 dark:border-[#5ED3DA]/40 dark:text-[#5ED3DA]'
                      : count > 0
                        ? 'bg-linen-100/80 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
                        : 'bg-transparent hover:bg-linen-100/70 dark:hover:bg-night-800 text-stone-ink/60 dark:text-slate-500'
                }`}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span className="text-[10px] font-mono-tabular opacity-75">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preset Cards Grid */}
      {filteredPresets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              books={state.books}
              t={t}
              showCornerDecoration={showDecorations}
              isUpcomingAlert={upcomingMatchIds.has(preset.id)}
              onApply={handleApplyPreset}
              onEdit={(p) => openEditPresetForm(p, false)}
              onClone={(p) => openEditPresetForm(p, true)}
              onResetDefault={(p) => store.resetBuiltInPreset(p.id)}
              onDelete={(p) => store.deleteRotationPreset(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-8 text-center space-y-2.5">
          <p className="text-sm font-semibold text-forest-900 dark:text-white">
            No collection presets match those filters
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedMonth(null);
              setSearchQuery('');
            }}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 text-xs font-semibold text-forest-900 dark:text-white"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Custom / Built-in Override Preset Sheet */}
      {isFormOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preset-form-sheet-title"
          className="sheet-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
          onClick={() => setIsFormOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden pb-safe sm:pb-0"
          >
            <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 shrink-0 sm:hidden" aria-hidden="true" />
            <div className="px-5 py-4 border-b border-linen-200 dark:border-night-800 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2
                  id="preset-form-sheet-title"
                  className="font-display text-lg font-bold text-forest-900 dark:text-white"
                >
                  {editingPresetId ? 'Edit Collection Preset' : 'New Collection Preset'}
                </h2>
                <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                  Save reusable rules, deterministic seed, corner motif, and optional annual start date.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Close preset form"
                className="min-h-[48px] min-w-[48px] sm:min-h-[40px] sm:min-w-[40px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center active:scale-95 transition-all"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePresetForm} className="flex-1 overflow-y-auto p-5 space-y-3.5 text-xs">
              {formError && (
                <p
                  role="alert"
                  className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3.5 py-2 font-semibold text-rose-700 dark:text-rose-300"
                >
                  {formError}
                </p>
              )}

              <div>
                <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                  Collection Name *
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Lunar New Year & Lanterns"
                  className="w-full h-11 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                  Description &amp; Objective *
                </label>
                <textarea
                  rows={2}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Books celebrating lanterns, family feasts, and new beginnings."
                  className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as PresetCategory)}
                    className="w-full h-11 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 font-semibold"
                  >
                    <option value="seasonal-holidays">{t('presetCategories.seasonalHolidays')}</option>
                    <option value="cultural-traditions">{t('presetCategories.culturalTraditions')}</option>
                    <option value="calendar-events">{t('presetCategories.calendarEvents')}</option>
                    <option value="evergreen">{t('presetCategories.evergreen')}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                    Corner Motif
                  </label>
                  <select
                    value={formMotif}
                    onChange={(e) => setFormMotif(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 font-semibold"
                  >
                    {PRESET_MOTIF_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                  Preferred Topics (comma-separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="winter, bedtime, snow, lanterns"
                  className="w-full h-11 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block font-semibold text-stone-ink dark:text-slate-400 mb-1">
                    Books
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={formCount}
                    onChange={(e) => setFormCount(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-ink dark:text-slate-400 mb-1">
                    Swap (d)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={formSwapDays}
                    onChange={(e) => setFormSwapDays(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-ink dark:text-slate-400 mb-1">
                    Cooldown (d)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={formCooldownDays}
                    onChange={(e) => setFormCooldownDays(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-ink dark:text-slate-400 mb-1">
                    Binding
                  </label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value as any)}
                    className="w-full h-10 px-2.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700"
                  >
                    <option value="any">Any</option>
                    <option value="hardcover">Hardcover</option>
                    <option value="board-book">Board Book</option>
                    <option value="paperback">Paperback</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-stone-ink dark:text-slate-400 mb-1">
                    Suggested Annual Start Month
                  </label>
                  <select
                    value={formMonth}
                    onChange={(e) => {
                      setFormMonth(e.target.value);
                      if (!e.target.value) setFormDay('');
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700"
                  >
                    <option value="">Anytime (No fixed date)</option>
                    {PRESET_MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={String(idx + 1).padStart(2, '0')}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-stone-ink dark:text-slate-400 mb-1">
                    Day of Month
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    disabled={!formMonth}
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    placeholder={formMonth ? '1–31' : '—'}
                    className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 disabled:opacity-50 font-mono-tabular"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formVarietyMix}
                    onChange={(e) => setFormVarietyMix(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#1F6E75]"
                  />
                  <span className="font-semibold text-forest-900 dark:text-slate-200">
                    Enforce variety mix
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="min-h-[48px] sm:min-h-[40px] px-4 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 text-xs font-semibold text-forest-900 dark:text-slate-200 active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-[48px] sm:min-h-[40px] px-5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-bold active:scale-[0.98] transition-all"
                  >
                    {editingPresetId ? 'Save Changes' : 'Create Preset'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
