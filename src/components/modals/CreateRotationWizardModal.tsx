import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { AiListSkeleton } from '../common/SkeletonLoaders.js';
import {
  countMatchingCatalogBooksForPreset,
  formatMonthDayLabel,
  getAllRotationPresets,
} from '../../features/rotations/rotation-presets.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { isBookRotatable } from '../../types/models.js';
import type { BookFormat, RotationPreset } from '../../types/models.js';

export type QuickRuleId =
  | 'random-unread'
  | 'seasonal-match'
  | 'least-recently-read'
  | 'never-rotated'
  | 'reader-favorites'
  | 'variety-mix';

export const QUICK_RULE_OPTIONS: ReadonlyArray<{
  id: QuickRuleId;
  label: string;
  subtitle: string;
  objective: string;
  icon: string;
}> = [
  {
    id: 'random-unread',
    label: 'Random Unread',
    subtitle: 'Fresh titles not read yet',
    objective: 'Random mix of unread books from your library',
    icon: 'shuffle',
  },
  {
    id: 'seasonal-match',
    label: 'Seasonal Match',
    subtitle: 'Tied to this time of year',
    objective: 'Seasonal themes matched to the current calendar window',
    icon: 'calendar',
  },
  {
    id: 'least-recently-read',
    label: 'Least Recently Read',
    subtitle: 'Longest off the shelf',
    objective: 'Books that have waited longest off your active shelves',
    icon: 'clock',
  },
  {
    id: 'never-rotated',
    label: 'Never Rotated',
    subtitle: 'Unseen library gems',
    objective: 'Fresh library books never placed in a rotation yet',
    icon: 'sparkles',
  },
  {
    id: 'reader-favorites',
    label: 'Reader Favorites',
    subtitle: 'Loved books & top topics',
    objective: 'Loved books and favorite reader topics',
    icon: 'heart',
  },
  {
    id: 'variety-mix',
    label: 'Quick Variety Mix',
    subtitle: 'Balanced authors & themes',
    objective: 'Balanced mix across authors, topics, and formats',
    icon: 'dice',
  },
];

type CreationMethod = 'preset' | 'custom' | 'ai';

type WizardStep =
  | 'method'
  | 'preset-pick'
  | 'preset-config'
  | 'quick-rule-config'
  | 'custom-details'
  | 'custom-rules'
  | 'ai-prompt'
  | 'ai-review';

interface CreateRotationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuickRule?: QuickRuleId | null;
  initialPresetId?: string | null;
}

const AI_STARTER_PROMPTS = [
  'Bedtime routines, lullabies & calming stories',
  'Curious science, nature & how things work',
  'Silly read-aloud favorites & big laughs',
  'Kindness, friendship & big feelings',
];

export const CreateRotationWizardModal: React.FC<CreateRotationWizardModalProps> = ({
  isOpen,
  onClose,
  initialQuickRule = null,
  initialPresetId = null,
}) => {
  const { state, store, activeProfile } = useApp();
  useBodyScrollLock(isOpen);

  // Core wizard state
  const [method, setMethod] = useState<CreationMethod>('preset');
  const [step, setStep] = useState<WizardStep>('method');
  const [targetStatus, setTargetStatus] = useState<'active' | 'saved'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Quick rule direct branch state
  const [quickRuleId, setQuickRuleId] = useState<QuickRuleId>('random-unread');
  const [quickRuleTitle, setQuickRuleTitle] = useState('');
  const [quickRuleUseLimit, setQuickRuleUseLimit] = useState(true);
  const [quickRuleBookCount, setQuickRuleBookCount] = useState(5);
  const [quickRuleSwapDays, setQuickRuleSwapDays] = useState(14);

  // Preset branch state
  const [presetCategory, setPresetCategory] = useState<string>('all');
  const [presetSearch, setPresetSearch] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetTitle, setPresetTitle] = useState('');
  const [presetUseLimit, setPresetUseLimit] = useState(true);
  const [presetBookCount, setPresetBookCount] = useState(5);
  const [presetSwapDays, setPresetSwapDays] = useState(14);

  // Custom rule branch state
  const [customTitle, setCustomTitle] = useState('');
  const [customObjective, setCustomObjective] = useState('');
  const [customTags, setCustomTags] = useState('');
  const [customUseLimit, setCustomUseLimit] = useState(true);
  const [customBookCount, setCustomBookCount] = useState(activeProfile?.defaultRotationSize || 5);
  const [customSwapDays, setCustomSwapDays] = useState(14);
  const [customCooldownDays, setCustomCooldownDays] = useState(activeProfile?.cooldownDays ?? 14);
  const [customFormat, setCustomFormat] = useState<BookFormat | 'any'>('any');
  const [customVarietyMix, setCustomVarietyMix] = useState(true);

  // AI assistant branch state
  const [aiObjective, setAiObjective] = useState(AI_STARTER_PROMPTS[0]);
  const [aiUseLimit, setAiUseLimit] = useState(true);
  const [aiBookCount, setAiBookCount] = useState(activeProfile?.defaultRotationSize || 5);
  const [aiTitle, setAiTitle] = useState('');
  const [isCurating, setIsCurating] = useState(false);
  const [curatorPlan, setCuratorPlan] = useState<{
    themeTitle?: string;
    curatorNote?: string;
    selectedBooks?: Array<{ bookId: string; reason: string }>;
  } | null>(null);
  const [selectedAiBookIds, setSelectedAiBookIds] = useState<Set<string>>(new Set());

  const allPresets = useMemo(
    () => getAllRotationPresets(state).filter((p) => p.isActive !== false),
    [state]
  );

  const rotatableLibraryCount = useMemo(
    () => state.books.filter((b) => isBookRotatable(b)).length,
    [state.books]
  );

  const topLibraryTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of state.books) {
      for (const raw of book.tags || []) {
        const tag = String(raw || '').trim().toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [state.books]);

  const selectedTagList = useMemo(
    () =>
      customTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [customTags]
  );

  const filteredPresets = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    return allPresets.filter((preset) => {
      if (presetCategory !== 'all' && preset.category !== presetCategory) {
        return false;
      }
      if (!q) return true;
      const hay = `${preset.title} ${preset.description} ${(preset.preferredTags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allPresets, presetCategory, presetSearch]);

  const selectedPreset: RotationPreset | null = useMemo(
    () => allPresets.find((p) => p.id === selectedPresetId) || null,
    [allPresets, selectedPresetId]
  );

  // Reset wizard cleanly whenever opened
  useEffect(() => {
    if (!isOpen) return;
    const hasActiveForProfile = Boolean(
      activeProfile &&
        state.rotations.some((r) => r.profileId === activeProfile.id && r.status === 'active')
    );
    const defaultSize = activeProfile?.defaultRotationSize || 5;

    setMethod('preset');
    setTargetStatus(
      (initialQuickRule || initialPresetId) && hasActiveForProfile ? 'saved' : 'active'
    );
    setIsSubmitting(false);
    setError('');

    setPresetCategory('all');
    setPresetSearch('');
    const matchedInitialPreset = initialPresetId
      ? allPresets.find((p) => p.id === initialPresetId) || null
      : null;
    const defaultPreset = matchedInitialPreset || allPresets[0] || null;
    setSelectedPresetId(defaultPreset?.id || '');
    setPresetTitle(defaultPreset?.title || '');
    setPresetUseLimit(true);
    setPresetBookCount(defaultPreset?.count || defaultSize);
    setPresetSwapDays(defaultPreset?.swapDays || 14);

    if (initialPresetId && matchedInitialPreset) {
      setStep('preset-config');
    } else if (initialQuickRule && initialQuickRule !== 'seasonal-match') {
      const ruleMeta =
        QUICK_RULE_OPTIONS.find((r) => r.id === initialQuickRule) || QUICK_RULE_OPTIONS[0];
      setQuickRuleId(ruleMeta.id);
      setQuickRuleTitle(
        ruleMeta.id === 'reader-favorites'
          ? `${activeProfile?.name || 'Reader'}’s Favorites`
          : ruleMeta.label
      );
      setQuickRuleUseLimit(true);
      setQuickRuleBookCount(defaultSize);
      setQuickRuleSwapDays(14);
      setStep('quick-rule-config');
    } else {
      setStep('method');
    }

    setCustomTitle('');
    setCustomObjective('');
    setCustomTags('');
    setCustomUseLimit(true);
    setCustomBookCount(defaultSize);
    setCustomSwapDays(14);
    setCustomCooldownDays(activeProfile?.cooldownDays ?? 14);
    setCustomFormat('any');
    setCustomVarietyMix(true);

    setAiObjective(AI_STARTER_PROMPTS[0]);
    setAiUseLimit(true);
    setAiBookCount(defaultSize);
    setAiTitle('');
    setIsCurating(false);
    setCuratorPlan(null);
    setSelectedAiBookIds(new Set());
  }, [isOpen, activeProfile?.id, initialQuickRule, initialPresetId]);

  if (!isOpen) return null;

  const selectPreset = (preset: RotationPreset) => {
    setSelectedPresetId(preset.id);
    setPresetTitle(preset.title);
    setPresetBookCount(preset.count || 5);
    setPresetSwapDays(preset.swapDays || 14);
    setError('');
  };

  const toggleSuggestedTag = (tag: string) => {
    const lower = tag.toLowerCase();
    const next = selectedTagList.includes(lower)
      ? selectedTagList.filter((t) => t !== lower)
      : [...selectedTagList, lower];
    setCustomTags(next.join(', '));
  };

  const toggleAiBook = (id: string) => {
    setSelectedAiBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAiCuration = async () => {
    if (!aiObjective.trim()) {
      setError('Describe a theme or goal for the AI assistant.');
      return;
    }
    setError('');
    setStep('ai-review');
    setIsCurating(true);
    setCuratorPlan(null);

    try {
      const effectiveCount = aiUseLimit
        ? Math.max(2, Math.min(20, Number(aiBookCount) || 5))
        : Math.max(4, Math.min(12, rotatableLibraryCount || 6));
      const plan = await store.curateRotationWithLlm({
        objective: aiObjective.trim(),
        count: effectiveCount,
      });
      setCuratorPlan(plan);
      setAiTitle(plan.themeTitle || 'AI Curated Shelf');
      const ids = Array.isArray(plan.selectedBooks)
        ? plan.selectedBooks.map((s) => s.bookId).filter(Boolean)
        : [];
      setSelectedAiBookIds(new Set(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCurating(false);
    }
  };

  const handleBack = () => {
    setError('');
    switch (step) {
      case 'preset-pick':
      case 'quick-rule-config':
      case 'custom-details':
      case 'ai-prompt':
        setStep('method');
        return;
      case 'preset-config':
        setStep('preset-pick');
        return;
      case 'custom-rules':
        setStep('custom-details');
        return;
      case 'ai-review':
        setStep('ai-prompt');
        return;
      default:
        onClose();
    }
  };

  const handleContinue = async () => {
    setError('');
    if (step === 'method') {
      if (method === 'preset') setStep('preset-pick');
      else if (method === 'custom') setStep('custom-details');
      else setStep('ai-prompt');
      return;
    }

    if (step === 'preset-pick') {
      if (!selectedPreset) {
        setError('Pick a preset to continue.');
        return;
      }
      setPresetTitle(selectedPreset.title);
      setPresetBookCount(selectedPreset.count || 5);
      setPresetSwapDays(selectedPreset.swapDays || 14);
      setStep('preset-config');
      return;
    }

    if (step === 'custom-details') {
      setStep('custom-rules');
      return;
    }

    if (step === 'ai-prompt') {
      await runAiCuration();
      return;
    }

    if (step === 'preset-config') {
      if (!selectedPreset) return;
      setIsSubmitting(true);
      try {
        const effectiveCount = presetUseLimit
          ? Math.max(1, Math.min(20, Number(presetBookCount) || 5))
          : Math.max(1, Math.min(20, rotatableLibraryCount || selectedPreset.count || 6));

        await store.generateRotationFromPreset(selectedPreset.id, {
          status: targetStatus,
          keepOtherActive: true,
          title: presetTitle.trim() || selectedPreset.title,
          count: effectiveCount,
          swapDays: Math.max(1, Math.min(90, Number(presetSwapDays) || 14)),
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (step === 'quick-rule-config') {
      if (!activeProfile) {
        setError('Select or create a reader profile first.');
        return;
      }
      const rotatable = state.books.filter((b) => isBookRotatable(b));
      if (rotatable.length === 0) {
        setError('Add owned books to your library before creating a rotation.');
        return;
      }

      setIsSubmitting(true);
      try {
        const ruleMeta =
          QUICK_RULE_OPTIONS.find((r) => r.id === quickRuleId) || QUICK_RULE_OPTIONS[0];
        const effectiveCount = quickRuleUseLimit
          ? Math.max(1, Math.min(rotatable.length, Math.min(20, Number(quickRuleBookCount) || 5)))
          : Math.min(rotatable.length, 20);
        const swapDays = Math.max(1, Math.min(90, Number(quickRuleSwapDays) || 14));
        const finalTitle = quickRuleTitle.trim() || ruleMeta.label;
        const setActive = targetStatus === 'active';

        const activeBookIdSet = new Set(
          state.rotations
            .filter((r) => r.profileId === activeProfile.id && r.status === 'active')
            .flatMap((r) => r.bookIds)
        );
        const readHistorySet = new Set(activeProfile.readHistoryBookIds || []);
        const favoriteTagSet = new Set(
          (activeProfile.favoriteTopics || []).map((t) => t.toLowerCase().trim())
        );

        const shuffle = <T,>(items: T[]): T[] => {
          const copy = [...items];
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          return copy;
        };

        const pickWithPoolPriority = (primary: typeof rotatable, fallback: typeof rotatable): string[] => {
          const seen = new Set<string>();
          const out: string[] = [];
          for (const b of [...primary, ...fallback]) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            out.push(b.id);
            if (out.length >= effectiveCount) break;
          }
          return out;
        };

        if (quickRuleId === 'random-unread') {
          const offShelfUnread = shuffle(
            rotatable.filter((b) => !readHistorySet.has(b.id) && !activeBookIdSet.has(b.id))
          );
          const anyUnread = shuffle(rotatable.filter((b) => !readHistorySet.has(b.id)));
          const offShelfAny = shuffle(rotatable.filter((b) => !activeBookIdSet.has(b.id)));
          const bookIds = pickWithPoolPriority(
            [...offShelfUnread, ...anyUnread],
            [...offShelfAny, ...shuffle(rotatable)]
          );
          await store.saveCuratedRotation({
            title: finalTitle,
            objective: ruleMeta.objective,
            bookIds,
            swapDays,
            setActive,
            keepOtherActive: true,
          });
        } else if (quickRuleId === 'least-recently-read') {
          const sortedByAge = [...rotatable].sort((a, b) => {
            const aOff = activeBookIdSet.has(a.id) ? 1 : 0;
            const bOff = activeBookIdSet.has(b.id) ? 1 : 0;
            if (aOff !== bOff) return aOff - bOff;
            const aMs = a.lastRotatedAt ? Date.parse(a.lastRotatedAt) : 0;
            const bMs = b.lastRotatedAt ? Date.parse(b.lastRotatedAt) : 0;
            return (Number.isFinite(aMs) ? aMs : 0) - (Number.isFinite(bMs) ? bMs : 0);
          });
          await store.saveCuratedRotation({
            title: finalTitle,
            objective: ruleMeta.objective,
            bookIds: sortedByAge.slice(0, effectiveCount).map((b) => b.id),
            swapDays,
            setActive,
            keepOtherActive: true,
          });
        } else if (quickRuleId === 'never-rotated') {
          const sortedNever = [...rotatable].sort((a, b) => {
            const aNever = !a.lastRotatedAt && (a.rotationCount || 0) === 0 ? 0 : 1;
            const bNever = !b.lastRotatedAt && (b.rotationCount || 0) === 0 ? 0 : 1;
            if (aNever !== bNever) return aNever - bNever;
            const aCount = a.rotationCount || 0;
            const bCount = b.rotationCount || 0;
            if (aCount !== bCount) return aCount - bCount;
            const aAgeFit =
              activeProfile.age >= a.ageMin && activeProfile.age <= a.ageMax ? 0 : 1;
            const bAgeFit =
              activeProfile.age >= b.ageMin && activeProfile.age <= b.ageMax ? 0 : 1;
            return aAgeFit - bAgeFit;
          });
          await store.saveCuratedRotation({
            title: finalTitle,
            objective: ruleMeta.objective,
            bookIds: sortedNever.slice(0, effectiveCount).map((b) => b.id),
            swapDays,
            setActive,
            keepOtherActive: true,
          });
        } else if (quickRuleId === 'reader-favorites') {
          const lovedPool = shuffle(
            rotatable.filter((b) => b.loved === true && !activeBookIdSet.has(b.id))
          );
          const anyLoved = shuffle(rotatable.filter((b) => b.loved === true));
          const topicMatch = shuffle(
            rotatable.filter((b) =>
              (b.tags || []).some((t) => favoriteTagSet.has(t.toLowerCase()))
            )
          );
          const bookIds = pickWithPoolPriority(
            [...lovedPool, ...anyLoved, ...topicMatch],
            shuffle(rotatable)
          );
          await store.saveCuratedRotation({
            title: finalTitle,
            objective: ruleMeta.objective,
            bookIds,
            swapDays,
            setActive,
            keepOtherActive: true,
          });
        } else {
          await store.generateRotation({
            title: finalTitle,
            objective: ruleMeta.objective,
            status: targetStatus,
            count: effectiveCount,
            swapDays,
            varietyMix: true,
            seed: `quick-mix-${Date.now()}`,
            keepOtherActive: true,
          });
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (step === 'custom-rules') {
      if (!activeProfile) return;
      setIsSubmitting(true);
      try {
        const effectiveCount = customUseLimit
          ? Math.max(1, Math.min(20, Number(customBookCount) || 5))
          : Math.max(1, Math.min(20, rotatableLibraryCount || activeProfile.defaultRotationSize || 6));

        const tagsList = customTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        await store.generateRotation({
          title: customTitle.trim() || `${activeProfile.name}’s Custom Rotation`,
          objective: customObjective.trim() || undefined,
          status: targetStatus,
          count: effectiveCount,
          swapDays: Math.max(1, Math.min(90, Number(customSwapDays) || 14)),
          cooldownDays: Math.max(0, Math.min(90, Number(customCooldownDays) || 0)),
          requiredFormat: customFormat,
          preferredTags: tagsList,
          varietyMix: customVarietyMix,
          keepOtherActive: true,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (step === 'ai-review') {
      if (selectedAiBookIds.size === 0) {
        setError('Keep at least one book selected for this rotation.');
        return;
      }
      setIsSubmitting(true);
      try {
        await store.saveCuratedRotation({
          title: aiTitle.trim() || curatorPlan?.themeTitle || 'AI Curated Shelf',
          objective: aiObjective.trim(),
          bookIds: Array.from(selectedAiBookIds),
          setActive: targetStatus === 'active',
          keepOtherActive: true,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const stepMeta = (() => {
    switch (step) {
      case 'method':
        return { title: 'Create New Rotation', subtitle: 'Step 1 of 3 · Choose method' };
      case 'preset-pick':
        return { title: 'Use a Preset', subtitle: 'Step 2 of 3 · Pick a collection template' };
      case 'preset-config':
        return { title: 'Use a Preset', subtitle: 'Step 3 of 3 · Name & book limit' };
      case 'quick-rule-config': {
        const ruleMeta =
          QUICK_RULE_OPTIONS.find((r) => r.id === quickRuleId) || QUICK_RULE_OPTIONS[0];
        return { title: ruleMeta.label, subtitle: 'Quick Rule · Customize & save shelf' };
      }
      case 'custom-details':
        return { title: 'Customize Rule', subtitle: 'Step 2 of 3 · Name & topics' };
      case 'custom-rules':
        return { title: 'Customize Rule', subtitle: 'Step 3 of 3 · Book limit & pacing' };
      case 'ai-prompt':
        return { title: 'Ask AI Assistant', subtitle: 'Step 2 of 3 · Describe shelf mood' };
      case 'ai-review':
        return { title: 'Ask AI Assistant', subtitle: 'Step 3 of 3 · Review & save shelf' };
    }
  })();

  const isFinalStep =
    step === 'preset-config' ||
    step === 'quick-rule-config' ||
    step === 'custom-rules' ||
    step === 'ai-review';

  const continueDisabled =
    isSubmitting ||
    isCurating ||
    (step === 'preset-pick' && !selectedPreset) ||
    (step === 'ai-review' && (!curatorPlan || selectedAiBookIds.size === 0));

  const continueLabel = (() => {
    if (isSubmitting) return 'Creating…';
    if (isCurating) return 'Curating…';
    if (isFinalStep) {
      return targetStatus === 'active' ? 'Create & Activate' : 'Create & Save';
    }
    if (step === 'ai-prompt') return 'Find Books';
    return 'Continue';
  })();

  const bookMap = new Map(state.books.map((b) => [b.id, b]));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-rotation-wizard-title"
      onClick={onClose}
      className="sheet-backdrop fixed inset-0 z-[70] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-create-rotation-wizard="true"
        className="animate-sheet-up w-full sm:max-w-xl h-[92dvh] sm:h-[680px] sm:max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden" aria-hidden="true" />

        {/* Pinned Header */}
        <div className="px-4 sm:px-5 pt-3 pb-3 border-b border-edge-subtle flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h2
              id="create-rotation-wizard-title"
              className="font-display text-xl sm:text-2xl font-semibold text-ink truncate leading-tight"
            >
              {stepMeta.title}
            </h2>
            <p className="text-xs text-ink-secondary truncate mt-0.5">{stepMeta.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close wizard"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Fixed-Height Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-danger/10 border border-danger/35 px-3.5 py-2.5 text-xs font-medium text-danger">
              {error}
            </div>
          )}

          {/* STEP 1: Choose Creation Method */}
          {step === 'method' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink leading-snug">
                  How would you like to create a new rotation?
                </h3>
                <p className="text-xs text-ink-secondary mt-1">
                  Pick a starting path for {activeProfile?.name || 'your reader'}.
                </p>
              </div>

              <div role="radiogroup" aria-label="Rotation creation method" className="space-y-2.5">
                {[
                  {
                    id: 'preset' as const,
                    title: 'Use a Preset',
                    desc: 'Seasonal themes, cultural celebrations, and evergreen rules.',
                    icon: 'calendar',
                  },
                  {
                    id: 'custom' as const,
                    title: 'Customize Rule',
                    desc: 'Define your own name, topics, book limit, cycle, and binding rules.',
                    icon: 'sliders',
                  },
                  {
                    id: 'ai' as const,
                    title: 'Ask AI Assistant',
                    desc: 'Describe a mood or reading goal and let AI pick books from your catalog.',
                    icon: 'sparkles',
                  },
                ].map((opt) => {
                  const selected = method === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-wizard-method={opt.id}
                      onClick={() => setMethod(opt.id)}
                      className={`w-full text-left rounded-xl p-3.5 sm:p-4 border transition-all flex items-start gap-3.5 cursor-pointer ${
                        selected
                          ? 'bg-primary text-primary-fg border-primary shadow-sm'
                          : 'bg-surface-subtle hover:bg-surface-elevated border-edge text-ink'
                      }`}
                    >
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          selected
                            ? 'bg-primary-fg/15 text-primary-fg'
                            : 'bg-surface border border-edge text-primary'
                        }`}
                      >
                        <Icon name={opt.icon} className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm sm:text-base font-semibold leading-tight">
                          {opt.title}
                        </p>
                        <p
                          className={`text-xs mt-1 leading-relaxed ${
                            selected ? 'text-primary-fg/85' : 'text-ink-secondary'
                          }`}
                        >
                          {opt.desc}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                          selected
                            ? 'border-primary-fg bg-primary-fg text-primary'
                            : 'border-edge bg-surface'
                        }`}
                      >
                        {selected && <Icon name="check" className="w-3 h-3" strokeWidth={2.5} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Manual editing always available notice */}
              <div className="rounded-xl bg-surface-subtle/80 border border-edge px-3.5 py-3 flex items-start gap-2.5 text-xs text-ink-secondary">
                <Icon name="info" className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-ink">
                    Manual editing is always available after creation
                  </p>
                  <p className="leading-relaxed">
                    You can include, swap, reorder, or remove any book on the shelf anytime after saving.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* BRANCH A · STEP 2: Pick Preset */}
          {step === 'preset-pick' && (
            <div className="space-y-3">
              <ClearableInput
                id="wizard-preset-search"
                value={presetSearch}
                onValueChange={setPresetSearch}
                leadingIcon={<Icon name="search" className="w-4 h-4" />}
                placeholder="Search presets or topics..."
                className="h-10 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted"
              />

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'seasonal-holidays', label: 'Seasonal' },
                  { id: 'evergreen', label: 'Evergreen' },
                  { id: 'cultural-traditions', label: 'Cultural' },
                  { id: 'calendar-events', label: 'Calendar' },
                ].map((cat) => {
                  const active = presetCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPresetCategory(cat.id)}
                      className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        active
                          ? 'bg-primary text-primary-fg'
                          : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {filteredPresets.length > 0 ? (
                  filteredPresets.map((preset) => {
                    const selected = preset.id === selectedPresetId;
                    const matchCounts = countMatchingCatalogBooksForPreset(state.books, preset);
                    const dateLabel = preset.suggestedStartMonthDay
                      ? formatMonthDayLabel(preset.suggestedStartMonthDay)
                      : 'Anytime';

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectPreset(preset)}
                        className={`w-full text-left rounded-xl p-3 border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                          selected
                            ? 'border-primary bg-primary/8 ring-1 ring-primary/30'
                            : 'border-edge bg-surface-subtle/60 hover:bg-surface-subtle'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-sans text-sm font-semibold text-ink truncate">
                              {preset.title}
                            </p>
                            <span className="text-[10px] font-mono-tabular text-ink-muted shrink-0">
                              {dateLabel}
                            </span>
                          </div>
                          <p className="text-xs text-ink-secondary line-clamp-2 leading-snug">
                            {preset.description}
                          </p>
                          <p className="text-[11px] font-mono-tabular text-ink-muted">
                            {preset.count} books · {preset.swapDays}d cycle ·{' '}
                            {matchCounts.thematicMatchCount} library{' '}
                            {matchCounts.thematicMatchCount === 1 ? 'match' : 'matches'}
                          </p>
                        </div>

                        <span
                          aria-hidden="true"
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                            selected
                              ? 'border-primary bg-primary text-primary-fg'
                              : 'border-edge bg-surface'
                          }`}
                        >
                          {selected && <Icon name="check" className="w-3 h-3" strokeWidth={2.5} />}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-ink-secondary text-center py-8">
                    No presets match “{presetSearch}”.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* BRANCH A2 · DIRECT QUICK RULE CONFIG */}
          {step === 'quick-rule-config' && (() => {
            const ruleMeta =
              QUICK_RULE_OPTIONS.find((r) => r.id === quickRuleId) || QUICK_RULE_OPTIONS[0];
            return (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-surface-subtle border border-edge p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                    Quick Rule
                  </p>
                  <p className="font-display text-base font-semibold text-ink">
                    {ruleMeta.label}
                  </p>
                  <p className="text-ink-secondary leading-snug">{ruleMeta.objective}</p>
                </div>

                <div>
                  <label htmlFor="wizard-quick-rule-name" className="block font-semibold text-ink mb-1">
                    Rotation Name
                  </label>
                  <input
                    id="wizard-quick-rule-name"
                    type="text"
                    value={quickRuleTitle}
                    onChange={(e) => setQuickRuleTitle(e.target.value)}
                    placeholder={ruleMeta.label}
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted"
                  />
                </div>

                <div className="rounded-xl bg-surface-subtle/70 border border-edge p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">Book limit</p>
                      <p className="text-[11px] text-ink-secondary">
                        Cap how many books are placed on this shelf
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={quickRuleUseLimit}
                        onChange={(e) => setQuickRuleUseLimit(e.target.checked)}
                        className="w-4 h-4 rounded accent-[var(--primary)]"
                      />
                      <span className="font-medium text-ink">Add book limit</span>
                    </label>
                  </div>

                  {quickRuleUseLimit && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block font-semibold text-ink-secondary mb-1">
                          Books on Shelf
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={quickRuleBookCount}
                          onChange={(e) => setQuickRuleBookCount(Number(e.target.value))}
                          className="w-full h-11 px-3 rounded-xl bg-surface border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-ink-secondary mb-1">
                          Swap Cycle (Days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={quickRuleSwapDays}
                          onChange={(e) => setQuickRuleSwapDays(Number(e.target.value))}
                          className="w-full h-11 px-3 rounded-xl bg-surface border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-semibold text-ink mb-1.5">Shelf Status</p>
                  <div
                    role="radiogroup"
                    aria-label="New shelf initial state"
                    className="grid grid-cols-2 p-1 rounded-xl bg-surface-subtle border border-edge"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={targetStatus === 'active'}
                      onClick={() => setTargetStatus('active')}
                      className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                        targetStatus === 'active'
                          ? 'bg-primary text-primary-fg shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      Active Shelf
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={targetStatus === 'saved'}
                      onClick={() => setTargetStatus('saved')}
                      className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                        targetStatus === 'saved'
                          ? 'bg-surface text-ink shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      Save for Later
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* BRANCH A · STEP 3: Configure Preset */}
          {step === 'preset-config' && selectedPreset && (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl bg-surface-subtle border border-edge p-3.5 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
                  Selected Preset
                </p>
                <p className="font-display text-base font-semibold text-ink">
                  {selectedPreset.title}
                </p>
                <p className="text-ink-secondary leading-snug">{selectedPreset.description}</p>
              </div>

              <div>
                <label htmlFor="wizard-preset-name" className="block font-semibold text-ink mb-1">
                  Rotation Name
                </label>
                <input
                  id="wizard-preset-name"
                  type="text"
                  value={presetTitle}
                  onChange={(e) => setPresetTitle(e.target.value)}
                  placeholder={selectedPreset.title}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted"
                />
              </div>

              <div className="rounded-xl bg-surface-subtle/70 border border-edge p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Book limit</p>
                    <p className="text-[11px] text-ink-secondary">
                      Cap how many books are placed on this shelf
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={presetUseLimit}
                      onChange={(e) => setPresetUseLimit(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--primary)]"
                    />
                    <span className="font-medium text-ink">Add book limit</span>
                  </label>
                </div>

                {presetUseLimit && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-ink-secondary mb-1">
                        Books on Shelf
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={presetBookCount}
                        onChange={(e) => setPresetBookCount(Number(e.target.value))}
                        className="w-full h-11 px-3 rounded-xl bg-surface border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-ink-secondary mb-1">
                        Swap Cycle (Days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={presetSwapDays}
                        onChange={(e) => setPresetSwapDays(Number(e.target.value))}
                        className="w-full h-11 px-3 rounded-xl bg-surface border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p className="font-semibold text-ink mb-1.5">Shelf Status</p>
                <div
                  role="radiogroup"
                  aria-label="New shelf initial state"
                  className="grid grid-cols-2 p-1 rounded-xl bg-surface-subtle border border-edge"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={targetStatus === 'active'}
                    onClick={() => setTargetStatus('active')}
                    className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      targetStatus === 'active'
                        ? 'bg-primary text-primary-fg shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Active Shelf
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={targetStatus === 'saved'}
                    onClick={() => setTargetStatus('saved')}
                    className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      targetStatus === 'saved'
                        ? 'bg-surface text-ink shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Save for Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BRANCH B · STEP 2: Custom Details & Topics */}
          {step === 'custom-details' && (
            <div className="space-y-4 text-xs">
              <div>
                <label htmlFor="wizard-custom-name" className="block font-semibold text-ink mb-1">
                  Name
                </label>
                <input
                  id="wizard-custom-name"
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder={`e.g. ${activeProfile?.name || 'Reader'}’s Cozy Shelf`}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted"
                />
              </div>

              <div>
                <label
                  htmlFor="wizard-custom-rule"
                  className="block font-semibold text-ink mb-1"
                >
                  Rule / Objective (Optional)
                </label>
                <textarea
                  id="wizard-custom-rule"
                  rows={2}
                  value={customObjective}
                  onChange={(e) => setCustomObjective(e.target.value)}
                  placeholder="e.g. hardcover + bedtime & winter animal stories"
                  className="w-full p-3 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted resize-none"
                />
              </div>

              {topLibraryTags.length > 0 && (
                <div>
                  <p className="font-semibold text-ink mb-1.5">Pick Topics from Your Library</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topLibraryTags.map((tag) => {
                      const active = selectedTagList.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleSuggestedTag(tag)}
                          aria-pressed={active}
                          className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-primary text-primary-fg'
                              : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
                          }`}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="wizard-custom-tags" className="block font-semibold text-ink-secondary mb-1">
                  Additional Topics (comma-separated)
                </label>
                <input
                  id="wizard-custom-tags"
                  type="text"
                  value={customTags}
                  onChange={(e) => setCustomTags(e.target.value)}
                  placeholder="animals, space, seasons"
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted"
                />
              </div>
            </div>
          )}

          {/* BRANCH B · STEP 3: Custom Rules & Book Limit */}
          {step === 'custom-rules' && (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl bg-surface-subtle/70 border border-edge p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Book limit</p>
                    <p className="text-[11px] text-ink-secondary">
                      {customUseLimit
                        ? `Select ${customBookCount} books`
                        : `Use full available match (${Math.min(20, rotatableLibraryCount || 6)} max)`}
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customUseLimit}
                      onChange={(e) => setCustomUseLimit(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--primary)]"
                    />
                    <span className="font-medium text-ink">Add book limit</span>
                  </label>
                </div>

                {customUseLimit && (
                  <div>
                    <label className="block font-semibold text-ink-secondary mb-1">
                      Number of Books
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customBookCount}
                      onChange={(e) => setCustomBookCount(Number(e.target.value))}
                      className="w-full h-11 px-3.5 rounded-xl bg-surface border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Swap Cycle (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={customSwapDays}
                    onChange={(e) => setCustomSwapDays(Number(e.target.value))}
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-ink-secondary mb-1">
                    Cooldown (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={customCooldownDays}
                    onChange={(e) => setCustomCooldownDays(Number(e.target.value))}
                    className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge font-mono-tabular text-base sm:text-sm font-semibold text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink-secondary mb-1">
                  Binding Format
                </label>
                <select
                  value={customFormat}
                  onChange={(e) => setCustomFormat(e.target.value as BookFormat | 'any')}
                  className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm font-semibold text-ink"
                >
                  <option value="any">Any Format</option>
                  <option value="hardcover">Hardcover Only</option>
                  <option value="board-book">Board Book Only</option>
                  <option value="paperback">Paperback Only</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={customVarietyMix}
                  onChange={(e) => setCustomVarietyMix(e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--primary)]"
                />
                <span className="font-semibold text-ink">
                  Enforce author &amp; topic variety mix
                </span>
              </label>

              <div>
                <p className="font-semibold text-ink mb-1.5">Shelf Status</p>
                <div
                  role="radiogroup"
                  aria-label="New shelf initial state"
                  className="grid grid-cols-2 p-1 rounded-xl bg-surface-subtle border border-edge"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={targetStatus === 'active'}
                    onClick={() => setTargetStatus('active')}
                    className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      targetStatus === 'active'
                        ? 'bg-primary text-primary-fg shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Active Shelf
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={targetStatus === 'saved'}
                    onClick={() => setTargetStatus('saved')}
                    className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      targetStatus === 'saved'
                        ? 'bg-surface text-ink shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Save for Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BRANCH C · STEP 2: AI Prompt */}
          {step === 'ai-prompt' && (
            <div className="space-y-4 text-xs">
              <div>
                <label htmlFor="wizard-ai-objective" className="block font-semibold text-ink mb-1">
                  What kind of rotation are you looking for?
                </label>
                <textarea
                  id="wizard-ai-objective"
                  rows={3}
                  value={aiObjective}
                  onChange={(e) => setAiObjective(e.target.value)}
                  placeholder="Describe themes, reading mood, or favorite topics..."
                  className="w-full p-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted resize-none"
                />
              </div>

              <div>
                <p className="font-semibold text-ink-secondary mb-1.5">Quick Ideas</p>
                <div className="flex flex-wrap gap-1.5">
                  {AI_STARTER_PROMPTS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      onClick={() => setAiObjective(idea)}
                      className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        aiObjective === idea
                          ? 'bg-primary text-primary-fg'
                          : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary hover:text-ink'
                      }`}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-surface-subtle/70 border border-edge p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Book limit</p>
                    <p className="text-[11px] text-ink-secondary">
                      Choose how many titles the assistant picks
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiUseLimit}
                      onChange={(e) => setAiUseLimit(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--primary)]"
                    />
                    <span className="font-medium text-ink">Add book limit</span>
                  </label>
                </div>

                {aiUseLimit && (
                  <select
                    value={aiBookCount}
                    onChange={(e) => setAiBookCount(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-surface border border-edge text-base sm:text-sm font-semibold text-ink"
                  >
                    {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} books
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <p className="font-semibold text-ink mb-1.5">Shelf Status</p>
                <div
                  role="radiogroup"
                  aria-label="New shelf initial state"
                  className="grid grid-cols-2 p-1 rounded-xl bg-surface-subtle border border-edge"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={targetStatus === 'active'}
                    onClick={() => setTargetStatus('active')}
                    className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      targetStatus === 'active'
                        ? 'bg-primary text-primary-fg shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Active Shelf
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={targetStatus === 'saved'}
                    onClick={() => setTargetStatus('saved')}
                    className={`min-h-[38px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      targetStatus === 'saved'
                        ? 'bg-surface text-ink shadow-2xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    Save for Later
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BRANCH C · STEP 3: Review AI Picks */}
          {step === 'ai-review' && (
            <div className="space-y-4 text-xs">
              {isCurating ? (
                <div className="space-y-3 py-2">
                  <p className="text-xs font-semibold text-ink">
                    Reading your library and building a tailored shelf for{' '}
                    {activeProfile?.name || 'your reader'}…
                  </p>
                  <AiListSkeleton rows={Math.min(Math.max(aiBookCount, 3), 5)} />
                </div>
              ) : curatorPlan ? (
                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="wizard-ai-title" className="block font-semibold text-ink mb-1">
                      Rotation Name
                    </label>
                    <input
                      id="wizard-ai-title"
                      type="text"
                      value={aiTitle}
                      onChange={(e) => setAiTitle(e.target.value)}
                      placeholder={curatorPlan.themeTitle || 'AI Curated Shelf'}
                      className="w-full h-11 px-3.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink"
                    />
                  </div>

                  {curatorPlan.curatorNote && (
                    <div className="p-3 rounded-xl bg-surface-subtle border border-edge">
                      <p className="text-ink-secondary leading-relaxed">{curatorPlan.curatorNote}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="font-semibold text-ink">
                      Selected Books ({selectedAiBookIds.size}) · Tap to include or remove
                    </p>
                    {curatorPlan.selectedBooks?.map((slot) => {
                      const book = bookMap.get(slot.bookId);
                      if (!book) return null;
                      const isChecked = selectedAiBookIds.has(book.id);

                      return (
                        <button
                          key={book.id}
                          type="button"
                          onClick={() => toggleAiBook(book.id)}
                          aria-pressed={isChecked}
                          className={`w-full text-left p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-primary bg-surface-elevated/60'
                              : 'border-edge opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <BookCover book={book} size="sm" aspectRatio="portrait" />
                            <div className="min-w-0">
                              <h4 className="font-display text-sm font-semibold text-ink truncate">
                                {book.title}
                              </h4>
                              <p className="text-[11px] text-ink-secondary truncate">
                                {book.authors[0] || 'Unknown Author'}
                              </p>
                              <p className="text-[10px] text-primary mt-0.5 line-clamp-1">
                                {slot.reason}
                              </p>
                            </div>
                          </div>

                          <span
                            aria-hidden="true"
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              isChecked
                                ? 'bg-primary border-primary text-primary-fg'
                                : 'bg-surface border-edge'
                            }`}
                          >
                            {isChecked && <Icon name="check" className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <p className="text-xs text-ink-secondary">
                    Go back to adjust your prompt or retry generating picks.
                  </p>
                  <button
                    type="button"
                    onClick={runAiCuration}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-primary text-primary-fg text-xs font-semibold cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pinned Footer: Always Cancel / Back + Continue / Create */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-edge-subtle bg-surface shrink-0 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={step === 'method' ? onClose : handleBack}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink font-semibold text-sm transition-colors cursor-pointer"
          >
            {step === 'method' ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button"
            disabled={continueDisabled}
            onClick={handleContinue}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-fg font-semibold text-sm shadow-xs transition-colors cursor-pointer"
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
