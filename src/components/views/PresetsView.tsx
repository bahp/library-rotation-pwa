import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { PresetCard } from '../cards/PresetCard.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
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
import {
  resolvePresetArtworkInfo,
  type PresetArtworkOption,
} from '../../ui/preset-artwork.js';
import { getSuggestedIllustrationForPreset } from '../../config/illustrations.js';
import { ArtworkPickerModal } from '../presets/ArtworkPickerModal.js';
import {
  checkServerLlmStatus,
  generatePresetIllustrationImage,
} from '../../features/llm/llm-client.js';
import { DEFAULT_PRESET_ILLUSTRATION_PROMPT } from '../../config/defaults.js';
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
  const [serverKeyConfigured, setServerKeyConfigured] = useState(false);

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
  const [formIsActive, setFormIsActive] = useState(true);
  const [formMonth, setFormMonth] = useState('');
  const [formDay, setFormDay] = useState('');
  const [formMotif, setFormMotif] = useState('sparkles');
  const [formIllustrationId, setFormIllustrationId] = useState('');
  const [formIllustrationUrl, setFormIllustrationUrl] = useState('');
  const [formIllustrationPrompt, setFormIllustrationPrompt] = useState('');
  const [autoSuggestArtwork, setAutoSuggestArtwork] = useState(false);
  const [isArtworkPickerOpen, setIsArtworkPickerOpen] = useState(false);
  const [showCustomArtTools, setShowCustomArtTools] = useState(false);
  const [previewSurface, setPreviewSurface] = useState<'light' | 'dark'>('light');
  const [formSeed, setFormSeed] = useState('');
  const [formError, setFormError] = useState('');
  const [isGeneratingArt, setIsGeneratingArt] = useState(false);
  const [artError, setArtError] = useState('');
  const artFileInputRef = useRef<HTMLInputElement | null>(null);

  useBodyScrollLock(isFormOpen || isArtworkPickerOpen);

  useEffect(() => {
    let mounted = true;
    checkServerLlmStatus()
      .then((res) => {
        if (mounted) {
          setServerKeyConfigured(Boolean(res?.serverKeyConfigured));
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const hasLlmKey = useMemo(() => {
    const provider = state.settings?.llmProvider || 'server-gemini';
    if (provider === 'cloudflare-worker') {
      return Boolean(state.settings?.llmCloudflareUrl?.trim());
    }
    if (provider === 'byok-openai') {
      return Boolean(state.settings?.llmApiKey?.trim());
    }
    return Boolean(state.settings?.llmApiKey?.trim()) || serverKeyConfigured;
  }, [
    serverKeyConfigured,
    state.settings?.llmApiKey,
    state.settings?.llmCloudflareUrl,
    state.settings?.llmProvider,
  ]);

  const defaultPromptTemplate =
    state.settings?.presetIllustrationPromptTemplate?.trim() || DEFAULT_PRESET_ILLUSTRATION_PROMPT;

  const allPresets = useMemo(() => getAllRotationPresets(state), [state]);
  const showDecorations = state.settings?.showPresetDecorations !== false;
  const cornerArtSize = state.settings?.presetCornerArtSize || 'sm';

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
  }, [
    allPresets,
    activeProfile,
    state.rotations,
    activeRotation,
    state.settings?.presetAlertDaysBefore,
    state.settings?.presetAlertDaysAfter,
  ]);

  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allPresets.filter((preset) => {
      if (selectedCategory === 'upcoming' && !upcomingMatchIds.has(preset.id)) {
        return false;
      } else if (selectedCategory === 'paused' && preset.isActive !== false) {
        return false;
      } else if (selectedCategory === 'custom' && !preset.isCustom && !preset.isBuiltInOverride) {
        return false;
      } else if (
        selectedCategory !== 'all' &&
        selectedCategory !== 'upcoming' &&
        selectedCategory !== 'paused' &&
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
    const defaultSuggested = getSuggestedIllustrationForPreset({
      category: 'seasonal-holidays',
    });
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
    setFormIsActive(true);
    setFormMonth('');
    setFormDay('');
    setFormMotif('sparkles');
    setFormIllustrationId(defaultSuggested.id);
    setFormIllustrationUrl('');
    setFormIllustrationPrompt(defaultPromptTemplate);
    setAutoSuggestArtwork(true);
    setShowCustomArtTools(false);
    setFormSeed('');
    setFormError('');
    setArtError('');
    setIsFormOpen(true);
  };

  const openEditPresetForm = (preset: RotationPreset, asClone = false) => {
    const parsedMd = normalizeMonthDay(preset.suggestedStartMonthDay);
    const resolvedArt = resolvePresetArtworkInfo(preset);

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
    setFormIsActive(preset.isActive !== false);
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

    if (asClone) {
      // Preserve the cloned source preset's effective artwork cleanly
      if (resolvedArt.isCustomUrl && preset.illustrationUrl) {
        setFormIllustrationId('');
        setFormIllustrationUrl(preset.illustrationUrl);
      } else {
        setFormIllustrationId(resolvedArt.artworkId || resolvedArt.suggestedId);
        setFormIllustrationUrl('');
      }
    } else {
      setFormIllustrationId(preset.illustrationId || '');
      setFormIllustrationUrl(preset.illustrationUrl || '');
    }

    setFormIllustrationPrompt(preset.illustrationPrompt || defaultPromptTemplate);
    setAutoSuggestArtwork(false);
    setShowCustomArtTools(Boolean(preset.illustrationUrl));
    setFormSeed(asClone ? '' : preset.seed || '');
    setFormError('');
    setArtError('');
    setIsFormOpen(true);
  };

  // Auto-update suggested illustration for brand-new collections while user hasn't manually picked one
  useEffect(() => {
    if (!isFormOpen || editingPresetId || !autoSuggestArtwork || formIllustrationUrl.trim()) {
      return;
    }
    const nextSuggested = getSuggestedIllustrationForPreset({
      title: formTitle,
      description: formDescription,
      category: formCategory,
      motif: formMotif,
      preferredTags: formTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    if (nextSuggested.id !== formIllustrationId) {
      setFormIllustrationId(nextSuggested.id);
    }
  }, [
    isFormOpen,
    editingPresetId,
    autoSuggestArtwork,
    formIllustrationUrl,
    formTitle,
    formDescription,
    formCategory,
    formMotif,
    formTags,
    formIllustrationId,
  ]);

  const handleIllustrationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArtError('');
    const preserveAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setAutoSuggestArtwork(false);
          setFormIllustrationId('');
          setFormIllustrationUrl(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        setAutoSuggestArtwork(false);
        setFormIllustrationId('');
        setFormIllustrationUrl(
          preserveAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
        );
      };
      img.onerror = () => setArtError('Could not read selected image file.');
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerateAiIllustration = async () => {
    setArtError('');
    if (!formTitle.trim()) {
      setArtError('Enter a collection title first so AI can tailor the corner illustration.');
      return;
    }
    setIsGeneratingArt(true);
    try {
      const result = await generatePresetIllustrationImage({
        title: formTitle.trim(),
        description: formDescription.trim(),
        promptTemplate: formIllustrationPrompt.trim() || defaultPromptTemplate,
        settings: state.settings,
      });
      setAutoSuggestArtwork(false);
      setFormIllustrationId('');
      setFormIllustrationUrl(result.dataUrl);
      store.notify('Generated corner illustration!', 'success');
    } catch (err) {
      setArtError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGeneratingArt(false);
    }
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
          .map((tag) => tag.trim())
          .filter(Boolean),
        count: Number(formCount),
        swapDays: Number(formSwapDays),
        cooldownDays: Number(formCooldownDays),
        requiredFormat: formFormat,
        varietyMix: formVarietyMix,
        isActive: formIsActive,
        suggestedStartMonthDay: mdRes.monthDay,
        motif: formMotif,
        illustrationId: formIllustrationId.trim() || undefined,
        illustrationUrl: formIllustrationUrl.trim() || undefined,
        illustrationPrompt: formIllustrationPrompt.trim() || undefined,
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

  const editingTargetPreset = useMemo(
    () => (editingPresetId ? allPresets.find((p) => p.id === editingPresetId) || null : null),
    [editingPresetId, allPresets]
  );

  const previewArtworkInfo = useMemo(() => {
    const parsedTags = formTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    return resolvePresetArtworkInfo({
      id: editingPresetId || undefined,
      isCustom: editingPresetId ? Boolean(editingTargetPreset?.isCustom) : true,
      illustrationId: formIllustrationId.trim() || undefined,
      illustrationUrl: formIllustrationUrl.trim() || undefined,
      motif: formMotif,
      category: formCategory,
      title: formTitle,
      description: formDescription,
      preferredTags: parsedTags,
    });
  }, [
    editingPresetId,
    editingTargetPreset,
    formIllustrationId,
    formIllustrationUrl,
    formMotif,
    formCategory,
    formTitle,
    formDescription,
    formTags,
  ]);

  const handleSelectPickerArtwork = (artwork: PresetArtworkOption) => {
    setAutoSuggestArtwork(false);
    setFormIllustrationUrl('');
    setFormIllustrationId(artwork.id);
  };

  const handleUseSuggestedArtwork = () => {
    setAutoSuggestArtwork(!editingPresetId);
    setFormIllustrationUrl('');
    setFormIllustrationId(previewArtworkInfo.suggestedId);
  };

  const pausedCount = useMemo(
    () => allPresets.filter((p) => p.isActive === false).length,
    [allPresets]
  );

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
    ...(pausedCount > 0 ? [{ id: 'paused', label: `Paused (${pausedCount})` }] : []),
  ];

  return (
    <div className={embedded ? 'space-y-4 text-left' : 'space-y-5 text-left max-w-6xl mx-auto'}>
      {!embedded && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="text-xs font-semibold text-ink-secondary hover:text-ink inline-flex items-center gap-1 mb-1.5 cursor-pointer"
            >
              <span>← Back to Shelves</span>
            </button>
            <h1 className="font-display text-3xl sm:text-[34px] font-semibold tracking-tight text-ink">
              Curated Collection Presets
            </h1>
            <p className="text-xs sm:text-sm text-ink-secondary mt-0.5">
              Turnkey seasonal, cultural, and evergreen shelf generators ready in one tap.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewPresetForm}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>New Preset</span>
          </button>
        </div>
      )}

      {/* Search + Category + New Preset Toolbar */}
      <div className="rounded-xl bg-surface border border-edge shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
              <Icon name="search" className="w-4 h-4" />
            </span>
            <ClearableInput
              id="presets-search-input"
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search presets by theme, tag, or objective…"
              className="w-full h-11 pl-9 pr-9 rounded-lg bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:border-primary"
            />
          </div>

          <select
            aria-label="Filter presets by category"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-xs font-semibold text-ink sm:w-56"
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
              className="min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
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
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedMonth === null
                ? 'bg-primary text-primary-fg'
                : 'bg-surface-subtle hover:bg-surface-elevated border border-edge-subtle text-ink-secondary'
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
                title={
                  count > 0
                    ? `${PRESET_MONTH_NAMES[idx]} (${count} seasonal presets)`
                    : PRESET_MONTH_NAMES[idx]
                }
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1 cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-fg'
                    : isNow
                      ? 'bg-surface-elevated border border-primary/45 text-primary'
                      : count > 0
                        ? 'bg-surface-subtle hover:bg-surface-elevated text-ink'
                        : 'bg-transparent hover:bg-surface-subtle text-ink-muted'
                }`}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span className="text-[9px] font-mono-tabular leading-none self-end mb-0.5 opacity-60">
                    {count}
                  </span>
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
              cornerArtSize={cornerArtSize}
              isUpcomingAlert={upcomingMatchIds.has(preset.id)}
              onApply={handleApplyPreset}
              onToggleActive={(p) => store.togglePresetActive(p.id)}
              onEdit={(p) => openEditPresetForm(p, false)}
              onClone={(p) => openEditPresetForm(p, true)}
              onResetDefault={(p) => store.resetBuiltInPreset(p.id)}
              onDelete={(p) => store.deleteRotationPreset(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-surface border border-edge p-8 text-center space-y-3">
          <BotanicalIllustration variant="empty-shelf" className="w-40 h-auto mx-auto" />
          <h2 className="font-display text-xl font-semibold text-ink">
            No collection presets match those filters
          </h2>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('all');
              setSelectedMonth(null);
              setSearchQuery('');
            }}
            className="min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer"
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
          className="sheet-backdrop fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
          onClick={() => setIsFormOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-xl max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
          >
            <div
              className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
              aria-hidden="true"
            />
            <div className="px-5 py-4 border-b border-edge-subtle flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2
                  id="preset-form-sheet-title"
                  className="font-display text-xl font-semibold text-ink"
                >
                  {editingPresetId ? 'Edit Collection Preset' : 'New Collection Preset'}
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Save reusable rules, active reminder status, corner art, and seasonal schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label="Close preset form"
                className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-lg text-ink-secondary hover:bg-surface-elevated flex items-center justify-center active:scale-95 transition-all cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSavePresetForm}
              className="flex-1 overflow-y-auto p-5 space-y-4 text-xs"
            >
              {formError && (
                <p
                  role="alert"
                  className="rounded-lg bg-surface-elevated border border-[#8C4A4F]/40 px-3.5 py-2 font-semibold text-[#8C4A4F] dark:text-[#C48A8E]"
                >
                  {formError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-ink mb-1">
                    Collection Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Lunar New Year & Lanterns"
                    className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Preset Status
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Preset alert active status"
                    className="grid grid-cols-2 p-0.5 rounded-lg bg-surface-subtle border border-edge h-11"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formIsActive}
                      onClick={() => setFormIsActive(true)}
                      className={`rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        formIsActive
                          ? 'bg-primary text-primary-fg shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!formIsActive}
                      onClick={() => setFormIsActive(false)}
                      className={`rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        !formIsActive
                          ? 'bg-surface text-ink shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      Paused
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">
                  Description &amp; Objective *
                </label>
                <textarea
                  rows={2}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Books celebrating lanterns, family feasts, and new beginnings."
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-subtle border border-edge text-xs text-ink placeholder:text-ink-muted"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as PresetCategory)}
                    className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold text-ink"
                  >
                    <option value="seasonal-holidays">{t('presetCategories.seasonalHolidays')}</option>
                    <option value="cultural-traditions">{t('presetCategories.culturalTraditions')}</option>
                    <option value="calendar-events">{t('presetCategories.calendarEvents')}</option>
                    <option value="evergreen">{t('presetCategories.evergreen')}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Fallback Motif
                  </label>
                  <select
                    value={formMotif}
                    onChange={(e) => setFormMotif(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold text-ink"
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
                <label className="block font-semibold text-ink mb-1">
                  Preferred Topics (comma-separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="winter, bedtime, snow, lanterns"
                  className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-ink placeholder:text-ink-muted"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Books
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={formCount}
                    onChange={(e) => setFormCount(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge font-mono-tabular text-ink"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Swap (d)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={formSwapDays}
                    onChange={(e) => setFormSwapDays(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge font-mono-tabular text-ink"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Cooldown (d)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={formCooldownDays}
                    onChange={(e) => setFormCooldownDays(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge font-mono-tabular text-ink"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Binding
                  </label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value as any)}
                    className="w-full h-10 px-2.5 rounded-lg bg-surface-subtle border border-edge text-ink"
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
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Suggested Annual Start Month
                  </label>
                  <select
                    value={formMonth}
                    onChange={(e) => {
                      setFormMonth(e.target.value);
                      if (!e.target.value) setFormDay('');
                    }}
                    className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge text-ink"
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
                  <label className="block font-semibold text-ink-secondary mb-1">
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
                    className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge text-ink disabled:opacity-50 font-mono-tabular"
                  />
                </div>
              </div>

              {/* Collection Illustration Selector, Visual Picker, Upload & AI Generator */}
              <div className="rounded-xl bg-surface-subtle border border-edge p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Prominent Illustration Preview Stage */}
                  <div className="w-full sm:w-44 shrink-0 space-y-1.5">
                    <div
                      className={`relative aspect-[4/3] w-full rounded-xl border overflow-hidden flex items-center justify-center p-2 transition-colors ${
                        previewSurface === 'dark'
                          ? 'bg-[#101713] border-[#26352C]'
                          : 'bg-[#FAF7F2] border-[#E3DDD1]'
                      }`}
                    >
                      <img
                        src={previewArtworkInfo.primaryUrl}
                        alt={previewArtworkInfo.label}
                        referrerPolicy="no-referrer"
                        className={`w-full h-full ${
                          previewArtworkInfo.isLegacyOpaque
                            ? 'object-cover rounded-lg'
                            : 'object-contain'
                        }`}
                      />
                    </div>
                    <div
                      role="group"
                      aria-label="Illustration preview background"
                      className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-surface border border-edge"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewSurface('light')}
                        aria-pressed={previewSurface === 'light'}
                        className={`min-h-[26px] rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          previewSurface === 'light'
                            ? 'bg-primary text-primary-fg'
                            : 'text-ink-secondary hover:text-ink'
                        }`}
                      >
                        Light
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewSurface('dark')}
                        aria-pressed={previewSurface === 'dark'}
                        className={`min-h-[26px] rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          previewSurface === 'dark'
                            ? 'bg-primary text-primary-fg'
                            : 'text-ink-secondary hover:text-ink'
                        }`}
                      >
                        Dark
                      </button>
                    </div>
                  </div>

                  {/* Artwork Info & Clear Action Buttons */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                        Collection Illustration
                        {previewArtworkInfo.isCustomUrl
                          ? ' · Custom Image'
                          : previewArtworkInfo.isLegacyOpaque
                            ? ' · Classic Watercolor'
                            : previewArtworkInfo.artworkId === previewArtworkInfo.suggestedId
                              ? ' · Suggested Match'
                              : ' · Storybook Library'}
                      </p>
                      <p className="font-display text-base font-semibold text-ink mt-0.5 truncate">
                        {previewArtworkInfo.label}
                      </p>
                      <p className="text-[11px] text-ink-secondary mt-0.5 leading-snug">
                        {previewArtworkInfo.subject}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsArtworkPickerOpen(true)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                      >
                        <Icon name="image" className="w-3.5 h-3.5" />
                        <span>Browse Artwork</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUseSuggestedArtwork}
                        disabled={
                          !formIllustrationUrl.trim() &&
                          previewArtworkInfo.artworkId === previewArtworkInfo.suggestedId
                        }
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated disabled:opacity-55 border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-default"
                      >
                        <Icon name="sparkles" className="w-3.5 h-3.5 text-primary" />
                        <span>Use Suggested</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Custom Upload, External URL & AI Generation Tools */}
                <div className="pt-2 border-t border-edge-subtle">
                  <button
                    type="button"
                    aria-expanded={showCustomArtTools}
                    onClick={() => setShowCustomArtTools((prev) => !prev)}
                    className="min-h-[34px] text-[11px] font-semibold text-ink-secondary hover:text-ink inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icon
                      name={showCustomArtTools ? 'chevronDown' : 'chevronRight'}
                      className="w-3.5 h-3.5"
                    />
                    <span>
                      Custom upload, image URL{hasLlmKey ? ' or AI artwork' : ''}
                    </span>
                  </button>

                  {showCustomArtTools && (
                    <div className="mt-2.5 space-y-2.5">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={formIllustrationUrl}
                          onChange={(e) => {
                            setAutoSuggestArtwork(false);
                            setFormIllustrationUrl(e.target.value);
                          }}
                          placeholder="Paste custom image URL or upload an image file…"
                          className="flex-1 h-10 px-3 rounded-lg bg-surface border border-edge text-xs text-ink placeholder:text-ink-muted"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            ref={artFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleIllustrationUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => artFileInputRef.current?.click()}
                            className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-ink inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Icon name="upload" className="w-3.5 h-3.5" />
                            <span>Upload</span>
                          </button>
                          {(formIllustrationUrl || formIllustrationId) && (
                            <button
                              type="button"
                              onClick={() => {
                                setAutoSuggestArtwork(false);
                                setFormIllustrationUrl('');
                                setFormIllustrationId('');
                              }}
                              className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-ink-secondary cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {hasLlmKey && (
                        <div className="space-y-2 pt-2 border-t border-edge-subtle">
                          <div className="flex items-center justify-between gap-2">
                            <label className="font-semibold text-ink">
                              AI Generation Prompt
                            </label>
                            <button
                              type="button"
                              disabled={isGeneratingArt}
                              onClick={handleGenerateAiIllustration}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-fg text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Icon name="sparkles" className="w-3.5 h-3.5" />
                              <span>
                                {isGeneratingArt ? 'Generating Artwork…' : 'Generate Illustration with AI'}
                              </span>
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={formIllustrationPrompt}
                            onChange={(e) => setFormIllustrationPrompt(e.target.value)}
                            placeholder="Subtle delicate storybook watercolor vignette for {title} ({description})..."
                            className="w-full px-3 py-2 rounded-lg bg-surface border border-edge text-[11px] text-ink placeholder:text-ink-muted"
                          />
                          {artError && (
                            <p className="text-[11px] font-semibold text-[#8C4A4F] dark:text-[#C48A8E]">
                              {artError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formVarietyMix}
                    onChange={(e) => setFormVarietyMix(e.target.checked)}
                    className="w-4 h-4 rounded accent-[var(--primary)]"
                  />
                  <span className="font-semibold text-ink">
                    Enforce variety mix
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="min-h-[44px] sm:min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-[44px] sm:min-h-[40px] px-5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer"
                  >
                    {editingPresetId ? 'Save Changes' : 'Create Preset'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Visual Collection Artwork Browser Modal */}
      <ArtworkPickerModal
        isOpen={isArtworkPickerOpen}
        selectedArtworkId={previewArtworkInfo.artworkId || previewArtworkInfo.suggestedId}
        suggestedArtworkId={previewArtworkInfo.suggestedId}
        collectionTitle={formTitle.trim()}
        onSelect={handleSelectPickerArtwork}
        onClose={() => setIsArtworkPickerOpen(false)}
      />
    </div>
  );
};
