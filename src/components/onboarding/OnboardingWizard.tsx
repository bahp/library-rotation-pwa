import React, { useEffect, useReducer, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import { OnboardingLibraryStep } from './OnboardingLibraryStep.js';
import { AVATAR_TONES, PROFILE_AVATAR_TONE_OPTIONS } from '../../config/index.js';
import {
  computeAgeFromBirthDate,
  formatBookBinding,
  formatReadingStage,
  inferReadingStageFromAge,
  type BookFormat,
  type ReadingStage,
} from '../../types/models.js';
import catalogArt from '../../assets/images/onboarding_catalog_art_1794694074032.jpg';
import rotateArt from '../../assets/images/onboarding_rotate_art_1794694074815.jpg';
import readArt from '../../assets/images/onboarding_read_art_1794694074713.jpg';

const ONBOARDING_TOPICS: Array<{ id: string; label: string }> = [
  { id: 'animals', label: 'Animals & Woodland' },
  { id: 'bedtime', label: 'Bedtime & Calm' },
  { id: 'nature', label: 'Nature & Outdoors' },
  { id: 'space', label: 'Space & Planets' },
  { id: 'dinosaurs', label: 'Dinosaurs' },
  { id: 'vehicles', label: 'Trains & Vehicles' },
  { id: 'ocean', label: 'Ocean & Sea Life' },
  { id: 'stem', label: 'STEM & Curiosity' },
  { id: 'humor', label: 'Funny Stories' },
  { id: 'seasons', label: 'Seasons & Holidays' },
  { id: 'feelings', label: 'Feelings & Empathy' },
  { id: 'adventure', label: 'Adventure' },
];

const QUICK_AGES = [
  { label: '1 yr', yearsAgo: 1 },
  { label: '2 yrs', yearsAgo: 2 },
  { label: '4 yrs', yearsAgo: 4 },
  { label: '6 yrs', yearsAgo: 6 },
  { label: '8 yrs', yearsAgo: 8 },
];

function computeBirthDateForAgeYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const STEP_META = [
  { step: 0, label: 'Welcome' },
  { step: 1, label: 'Family' },
  { step: 2, label: 'Interests' },
  { step: 3, label: 'Library' },
  { step: 4, label: 'First Shelf' },
  { step: 5, label: 'Ready' },
];

interface WizardState {
  direction: 1 | -1;
  householdNameDraft: string;
  editingChildId: string | null;
  childName: string;
  childBirthDate: string;
  childStage: ReadingStage;
  childTone: string;
  step1Error: string;
  step2ProfileId: string;
  preferredFormat: BookFormat | 'any';
  customTags: string[];
  showCustomTagInput: boolean;
  customTagDraft: string;
  rotProfileId: string;
  rotTitle: string;
  rotCount: number;
  rotSwapDays: number;
  rotTags: string[];
  rotFormat: BookFormat | 'any';
  creatingRotation: boolean;
  step4Error: string;
  confirmSkipOpen: boolean;
}

type WizardAction =
  | { type: 'SET_FIELD'; field: keyof WizardState; value: WizardState[keyof WizardState] }
  | { type: 'PATCH'; patch: Partial<WizardState> }
  | { type: 'ADD_CUSTOM_TAG'; tag: string };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'PATCH':
      return { ...state, ...action.patch };
    case 'ADD_CUSTOM_TAG': {
      const normalized = action.tag.trim().toLowerCase().replace(/^#+/, '');
      if (!normalized) return state;
      const alreadyPredefined = ONBOARDING_TOPICS.some((t) => t.id === normalized);
      const nextCustom =
        alreadyPredefined || state.customTags.includes(normalized)
          ? state.customTags
          : [...state.customTags, normalized];
      return {
        ...state,
        customTags: nextCustom,
        customTagDraft: '',
        showCustomTagInput: false,
      };
    }
    default:
      return state;
  }
}

export const OnboardingWizard: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    activeRotation,
    isOnboardingPreview,
    navigate,
    setInspectedBookId,
    t,
  } = useApp();

  const currentStep = Math.max(0, Math.min(5, state.settings.onboarding?.currentStep ?? 0));
  const [failedArtIds, setFailedArtIds] = useState<Record<string, boolean>>({});

  const [wizard, dispatch] = useReducer(wizardReducer, undefined, (): WizardState => ({
    direction: 1,
    householdNameDraft: state.settings.householdName || '',
    editingChildId: state.profiles[0]?.id || null,
    childName: '',
    childBirthDate: computeBirthDateForAgeYears(4),
    childStage: 'picture-book',
    childTone: 'teal',
    step1Error: '',
    step2ProfileId: state.activeProfileId || state.profiles[0]?.id || '',
    preferredFormat: 'any',
    customTags: [],
    showCustomTagInput: false,
    customTagDraft: '',
    rotProfileId: state.activeProfileId || state.profiles[0]?.id || '',
    rotTitle: '',
    rotCount: 4,
    rotSwapDays: 14,
    rotTags: [],
    rotFormat: 'any',
    creatingRotation: false,
    step4Error: '',
    confirmSkipOpen: false,
  }));

  useEffect(() => {
    dispatch({
      type: 'SET_FIELD',
      field: 'householdNameDraft',
      value: state.settings.householdName || '',
    });
  }, [state.settings.householdName]);

  useEffect(() => {
    if (wizard.editingChildId) {
      const match = state.profiles.find((p) => p.id === wizard.editingChildId);
      if (match) {
        dispatch({
          type: 'PATCH',
          patch: {
            childName: match.name,
            childBirthDate: match.birthDate || computeBirthDateForAgeYears(match.age || 4),
            childStage: match.readingStage,
            childTone: match.avatarTone || 'teal',
          },
        });
        return;
      }
    }
    if (state.profiles.length > 0 && wizard.editingChildId === null && wizard.childName === '') {
      return;
    }
  }, [wizard.editingChildId, state.profiles]);

  useEffect(() => {
    const fallbackId = state.activeProfileId || state.profiles[0]?.id || '';
    const patch: Partial<WizardState> = {};
    if (
      fallbackId &&
      (!wizard.step2ProfileId || !state.profiles.some((p) => p.id === wizard.step2ProfileId))
    ) {
      patch.step2ProfileId = fallbackId;
    }
    if (
      fallbackId &&
      (!wizard.rotProfileId || !state.profiles.some((p) => p.id === wizard.rotProfileId))
    ) {
      patch.rotProfileId = fallbackId;
    }
    if (Object.keys(patch).length > 0) {
      dispatch({ type: 'PATCH', patch });
    }
  }, [state.activeProfileId, state.profiles, wizard.step2ProfileId, wizard.rotProfileId]);

  const step2Profile =
    state.profiles.find((p) => p.id === wizard.step2ProfileId) || state.profiles[0] || null;
  const rotProfile =
    state.profiles.find((p) => p.id === wizard.rotProfileId) || state.profiles[0] || null;

  useEffect(() => {
    if (currentStep === 4 && rotProfile) {
      dispatch({
        type: 'PATCH',
        patch: {
          rotTitle: wizard.rotTitle || `${rotProfile.name}’s First Shelf`,
          rotCount: Math.min(
            Math.max(1, rotProfile.defaultRotationSize || 4),
            Math.max(4, state.books.length)
          ),
          rotTags: rotProfile.favoriteTopics || [],
          rotFormat: wizard.preferredFormat,
        },
      });
    }
  }, [currentStep, rotProfile?.id, wizard.preferredFormat]);

  const goToStep = async (nextStep: number, markCompletedStep?: number, markSkippedStep?: number) => {
    dispatch({
      type: 'SET_FIELD',
      field: 'direction',
      value: nextStep >= currentStep ? 1 : -1,
    });
    const prev = state.settings.onboarding;
    const completed = new Set(prev?.completedSteps || []);
    const skipped = new Set(prev?.skippedSteps || []);
    if (typeof markCompletedStep === 'number') completed.add(markCompletedStep);
    if (typeof markSkippedStep === 'number') skipped.add(markSkippedStep);

    await store.updateOnboarding({
      status: 'in_progress',
      currentStep: nextStep,
      completedSteps: Array.from(completed),
      skippedSteps: Array.from(skipped),
      startedAt: prev?.startedAt || new Date().toISOString(),
    });
  };

  const handleSaveChildProfile = async (resetAfter = false) => {
    dispatch({ type: 'SET_FIELD', field: 'step1Error', value: '' });
    if (!wizard.childName.trim()) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step1Error',
        value: 'Please enter your child’s name or display name.',
      });
      return null;
    }

    const existing = wizard.editingChildId
      ? state.profiles.find((p) => p.id === wizard.editingChildId)
      : null;

    let savedId = existing?.id || null;
    if (existing) {
      await store.updateProfile(existing.id, {
        name: wizard.childName.trim(),
        birthDate: wizard.childBirthDate || undefined,
        readingStage: wizard.childStage,
        avatarTone: wizard.childTone,
      });
    } else {
      const created = await store.addProfile({
        name: wizard.childName.trim(),
        birthDate: wizard.childBirthDate || undefined,
        readingStage: wizard.childStage,
        avatarTone: wizard.childTone,
        favoriteTopics: ['animals', 'bedtime'],
        defaultRotationSize: 4,
        cooldownDays: 14,
      });
      savedId = created?.id || null;
      if (savedId) {
        dispatch({
          type: 'PATCH',
          patch: {
            editingChildId: savedId,
            step2ProfileId: savedId,
            rotProfileId: savedId,
          },
        });
      }
    }

    if (resetAfter) {
      dispatch({
        type: 'PATCH',
        patch: {
          editingChildId: null,
          childName: '',
          childBirthDate: computeBirthDateForAgeYears(3),
          childStage: 'picture-book',
          childTone: state.profiles.length % 2 === 0 ? 'amber' : 'indigo',
        },
      });
    }
    return savedId;
  };

  const handleStep1Continue = async () => {
    dispatch({ type: 'SET_FIELD', field: 'step1Error', value: '' });
    if (wizard.householdNameDraft.trim() !== (state.settings.householdName || '')) {
      await store.setHouseholdName(wizard.householdNameDraft.trim(), { silent: true });
    }

    if (wizard.childName.trim() || state.profiles.length === 0) {
      const saved = await handleSaveChildProfile(false);
      if (!saved && state.profiles.length === 0) return;
    }

    await goToStep(2, 1);
  };

  const handleToggleStep2Topic = async (topicId: string) => {
    if (!step2Profile) return;
    const current = step2Profile.favoriteTopics || [];
    const next = current.includes(topicId)
      ? current.filter((item) => item !== topicId)
      : [...current, topicId];
    await store.updateProfile(step2Profile.id, { favoriteTopics: next });
  };

  const handleAddCustomTag = async () => {
    const clean = wizard.customTagDraft.trim().toLowerCase().replace(/^#+/, '');
    if (!clean) return;
    dispatch({ type: 'ADD_CUSTOM_TAG', tag: clean });
    if (step2Profile) {
      const current = step2Profile.favoriteTopics || [];
      if (!current.includes(clean)) {
        await store.updateProfile(step2Profile.id, {
          favoriteTopics: [...current, clean],
        });
      }
    }
  };

  const handleCreateFirstRotation = async () => {
    dispatch({ type: 'SET_FIELD', field: 'step4Error', value: '' });
    if (!rotProfile) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step4Error',
        value: 'Create a child profile first.',
      });
      return;
    }
    if (state.books.length === 0) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step4Error',
        value: 'Add at least one book before creating your first rotation.',
      });
      return;
    }
    dispatch({ type: 'SET_FIELD', field: 'creatingRotation', value: true });
    try {
      await store.generateRotation({
        profileId: rotProfile.id,
        title: wizard.rotTitle.trim() || `${rotProfile.name}’s First Shelf`,
        count: Math.min(wizard.rotCount, state.books.length),
        preferredTags: wizard.rotTags,
        cooldownDays: rotProfile.cooldownDays ?? 14,
        swapDays: wizard.rotSwapDays,
        varietyMix: true,
        requiredFormat: wizard.rotFormat,
      });
    } catch (err) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step4Error',
        value: err instanceof Error ? err.message : String(err),
      });
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'creatingRotation', value: false });
    }
  };

  const handleFinishLaunch = async (targetRoute: 'home' | 'scan' | 'play') => {
    await store.completeOnboarding({ skipped: false });
    navigate(targetRoute);
  };

  const handleSkipAllConfirmed = async () => {
    dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false });
    await store.completeOnboarding({ skipped: true });
    navigate('home');
  };

  const createdRotationForStep4 =
    (rotProfile &&
      state.rotations.find((r) => r.profileId === rotProfile.id && r.status === 'active')) ||
    state.rotations[0] ||
    null;

  const computedChildAge = wizard.childBirthDate
    ? computeAgeFromBirthDate(wizard.childBirthDate)
    : null;

  const allStep2Topics: Array<{ id: string; label: string }> = [
    ...ONBOARDING_TOPICS,
    ...Array.from(
      new Set([
        ...wizard.customTags,
        ...(step2Profile?.favoriteTopics || []).filter(
          (id) => !ONBOARDING_TOPICS.some((t) => t.id === id)
        ),
      ])
    ).map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
    })),
  ];

  const slideVariants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? 18 : -18,
    }),
    center: {
      opacity: 1,
      x: 0,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -18 : 18,
    }),
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-linen-50 dark:bg-night-950 text-[#1A2423] dark:text-[#F4EFE6] flex flex-col">
      {/* Top Preview Mode Banner (only when launched from Dev Tools Preview) */}
      {isOnboardingPreview && (
        <div className="bg-amber-100 dark:bg-amber-950/80 border-b border-amber-300 dark:border-amber-800 px-4 py-2 text-xs">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <span className="font-semibold text-amber-950 dark:text-amber-100">
              {t('onboarding.previewBanner')}
            </span>
            <button
              type="button"
              onClick={() => store.exitPreviewOnboarding()}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-amber-900 text-white dark:bg-amber-200 dark:text-night-950 font-bold text-xs whitespace-nowrap cursor-pointer"
            >
              {t('onboarding.exitPreview')}
            </button>
          </div>
        </div>
      )}

      {/* Top Navigation & Minimalist Progress Bar */}
      <header className="sticky top-0 z-30 border-b border-linen-200/90 dark:border-night-800 bg-ivory/95 dark:bg-night-900/95 backdrop-blur-md pt-safe">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-forest-900 dark:bg-[#5ED3DA] text-white dark:text-night-950 flex items-center justify-center shrink-0 shadow-xs">
              <Icon name="rotations" className="w-4 h-4" />
            </span>
            <span className="font-display font-bold text-base sm:text-lg text-forest-900 dark:text-white tracking-tight">
              Library Rotation
            </span>
          </div>

          <div className="flex items-center gap-3">
            {currentStep > 0 && (
              <span className="text-xs font-mono-tabular font-semibold text-stone-ink dark:text-slate-400">
                {t('onboarding.stepProgress', { current: currentStep, total: 5 })}
              </span>
            )}
            {!wizard.confirmSkipOpen ? (
              <button
                type="button"
                onClick={() => {
                  if (isOnboardingPreview) {
                    store.exitPreviewOnboarding();
                  } else {
                    dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: true });
                  }
                }}
                className="min-h-[40px] px-2.5 rounded-xl text-xs font-semibold text-stone-ink hover:text-forest-900 hover:bg-linen-100/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 cursor-pointer transition-colors"
              >
                {isOnboardingPreview ? t('onboarding.exitPreview') : t('onboarding.skipSetup')}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-stone-ink dark:text-slate-300 hidden sm:inline">
                  Skip setup?
                </span>
                <button
                  type="button"
                  onClick={handleSkipAllConfirmed}
                  className="min-h-[38px] px-3 py-1 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold cursor-pointer"
                >
                  Confirm Skip
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false })
                  }
                  className="min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-semibold text-stone-ink dark:text-slate-400 cursor-pointer"
                >
                  Stay
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Minimalist Anchored Progress Line */}
        {currentStep > 0 && (
          <div className="h-1 w-full bg-linen-200/80 dark:bg-night-800 overflow-hidden">
            <motion.div
              className="h-full bg-forest-700 dark:bg-[#5ED3DA]"
              initial={false}
              animate={{ width: `${Math.round((currentStep / 5) * 100)}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
          </div>
        )}
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 flex flex-col">
        <AnimatePresence mode="wait" custom={wizard.direction}>
          {/* STEP 0: WELCOME */}
          {currentStep === 0 && (
            <motion.div
              key="step-0"
              custom={wizard.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="my-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center"
            >
              <div className="lg:col-span-7 space-y-6 text-left">
                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest-700 dark:text-[#5ED3DA]">
                    {t('onboarding.welcomeEyebrow')}
                  </p>
                  <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-forest-900 dark:text-white leading-[1.08] tracking-tight">
                    {t('onboarding.welcomeTitle')}
                  </h1>
                  <p className="text-sm sm:text-base text-stone-ink dark:text-slate-300 leading-relaxed max-w-xl">
                    {t('onboarding.welcomeSubtitle')}
                  </p>
                </div>

                {/* 3 Centered Editorial Illustration Pillars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  {[
                    {
                      id: 'catalog',
                      art: catalogArt,
                      icon: 'scan',
                      title: t('onboarding.pillarCatalogTitle'),
                      desc: t('onboarding.pillarCatalogDesc'),
                    },
                    {
                      id: 'rotate',
                      art: rotateArt,
                      icon: 'rotations',
                      title: t('onboarding.pillarRotateTitle'),
                      desc: t('onboarding.pillarRotateDesc'),
                    },
                    {
                      id: 'play',
                      art: readArt,
                      icon: 'play',
                      title: t('onboarding.pillarPlayTitle'),
                      desc: t('onboarding.pillarPlayDesc'),
                    },
                  ].map((pillar) => (
                    <div
                      key={pillar.id}
                      className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-4 flex flex-col items-center text-center space-y-3 shadow-2xs"
                    >
                      <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-linen-100/90 dark:bg-night-800 border border-linen-200/60 dark:border-night-700 flex items-center justify-center">
                        {!failedArtIds[pillar.id] ? (
                          <img
                            src={pillar.art}
                            alt={pillar.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedArtIds((prev) => ({ ...prev, [pillar.id]: true }))
                            }
                            className="w-full h-full object-cover dark:brightness-90 dark:contrast-105"
                          />
                        ) : (
                          <span className="w-12 h-12 rounded-2xl bg-ivory dark:bg-night-900 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center shadow-2xs">
                            <Icon name={pillar.icon} className="w-6 h-6" />
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h2 className="font-display text-sm font-bold text-forest-900 dark:text-white">
                          {pillar.title}
                        </h2>
                        <p className="text-xs text-stone-ink dark:text-slate-400 leading-relaxed">
                          {pillar.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                  <button
                    type="button"
                    data-action="onboarding-begin"
                    onClick={() => goToStep(1, 0)}
                    className="min-h-[48px] px-6 py-3 rounded-2xl bg-forest-700 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <span>{t('onboarding.beginSetupCta')}</span>
                    <Icon name="chevronRight" className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-action="onboarding-explore-sample"
                    onClick={async () => {
                      await store.loadFullSampleHousehold();
                      navigate('home');
                    }}
                    className="min-h-[48px] px-5 py-3 rounded-2xl bg-ivory hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                  >
                    <Icon name="book" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                    <span>{t('onboarding.exploreSampleCta')}</span>
                  </button>
                </div>
              </div>

              {/* Editorial Shelf Preview Artwork Card */}
              <div className="lg:col-span-5">
                <div className="rounded-3xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 overflow-hidden shadow-md">
                  <div className="bg-forest-900 dark:bg-[#0B1518] px-6 py-4 flex items-center justify-between text-white">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#5ED3DA]">
                        14-Day Reading Rhythm
                      </p>
                      <p className="font-display text-base font-bold text-white mt-0.5">
                        Front-Facing Home Shelf
                      </p>
                    </div>
                    <span className="text-xs font-mono-tabular px-2.5 py-1 rounded-lg bg-white/10 text-white/90">
                      4–6 books
                    </span>
                  </div>

                  <div className="p-5 sm:p-6 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          title: 'Where the Wild Things Are',
                          color: 'bg-[#1D4E4F]',
                          author: 'M. Sendak',
                        },
                        {
                          title: 'The Snowy Day',
                          color: 'bg-[#9A4E16]',
                          author: 'E. J. Keats',
                        },
                        {
                          title: 'Goodnight Moon',
                          color: 'bg-[#1E3A5F]',
                          author: 'M. W. Brown',
                        },
                      ].map((sample) => (
                        <div
                          key={sample.title}
                          className="rounded-2xl bg-linen-50 dark:bg-night-950 border border-linen-200/80 dark:border-night-800 p-2 space-y-2"
                        >
                          <div
                            className={`aspect-[3/4] rounded-xl ${sample.color} p-2.5 flex flex-col justify-between text-white shadow-sm`}
                          >
                            <span className="text-[9px] uppercase tracking-wider opacity-75">
                              On Shelf
                            </span>
                            <p className="font-display text-xs font-bold leading-snug">
                              {sample.title}
                            </p>
                          </div>
                          <p className="text-[11px] font-medium text-stone-ink dark:text-slate-400 truncate px-0.5">
                            {sample.author}
                          </p>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-stone-ink dark:text-slate-400 leading-relaxed pt-3 border-t border-linen-200/80 dark:border-night-800">
                      Private by design: books, child ages, and shelves are stored locally on your
                      device with zero account lock-in.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEPS 1–5: TWO-COLUMN DESKTOP SPLIT + CONVERSATIONAL MOBILE STEPPER */}
          {currentStep > 0 && (
            <motion.div
              key={`step-${currentStep}`}
              custom={wizard.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start flex-1"
            >
              {/* Desktop Left Guidance Rail */}
              <aside className="hidden lg:block lg:col-span-4 space-y-5 sticky top-24">
                <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 space-y-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                    Guided Setup
                  </p>
                  <ol className="space-y-2">
                    {STEP_META.filter((m) => m.step > 0).map((m) => {
                      const isCurrent = currentStep === m.step;
                      const isDone =
                        currentStep > m.step ||
                        state.settings.onboarding?.completedSteps?.includes(m.step);
                      return (
                        <li key={m.step}>
                          <button
                            type="button"
                            onClick={() => goToStep(m.step)}
                            className={`w-full min-h-[42px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                              isCurrent
                                ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                                : isDone
                                  ? 'bg-linen-100/80 dark:bg-night-800 text-forest-900 dark:text-white'
                                  : 'text-stone-ink dark:text-slate-400 hover:bg-linen-100/50 dark:hover:bg-night-800/50'
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span className="font-mono-tabular w-4 text-center">{m.step}.</span>
                              <span>{m.label}</span>
                            </span>
                            {isDone && !isCurrent && <Icon name="check" className="w-3.5 h-3.5" />}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="rounded-2xl bg-linen-100/70 dark:bg-night-900/60 border border-linen-200 dark:border-night-800 p-4 text-xs text-stone-ink dark:text-slate-400 leading-relaxed space-y-1.5">
                  <p className="font-bold text-forest-900 dark:text-white">
                    Need to adjust anything later?
                  </p>
                  <p>
                    Every profile detail, reading topic, shelf rule, and book record can be changed
                    anytime from Profiles or Settings.
                  </p>
                </div>
              </aside>

              {/* Right Interactive Setup Canvas */}
              <section className="lg:col-span-8 space-y-6 pb-20 lg:pb-8 flex flex-col min-w-0">
                {/* STEP 1: HOUSEHOLD & CHILD PROFILE */}
                {currentStep === 1 && (
                  <div className="space-y-5 text-left">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-forest-900 dark:text-white">
                        {t('onboarding.step1Title')}
                      </h1>
                      <p className="text-sm text-stone-ink dark:text-slate-400 mt-1.5">
                        {t('onboarding.step1Subtitle')}
                      </p>
                    </div>

                    {/* Household / Parent Name */}
                    <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-2">
                      <label
                        htmlFor="onboarding-household-name"
                        className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400"
                      >
                        {t('onboarding.householdNameLabel')}
                      </label>
                      <input
                        id="onboarding-household-name"
                        type="text"
                        value={wizard.householdNameDraft}
                        onChange={(e) =>
                          dispatch({
                            type: 'SET_FIELD',
                            field: 'householdNameDraft',
                            value: e.target.value,
                          })
                        }
                        placeholder={t('onboarding.householdNamePlaceholder')}
                        className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                    </div>

                    {/* Existing Children Switcher when 1+ children saved */}
                    {state.profiles.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {state.profiles.map((p) => {
                          const selected = wizard.editingChildId === p.id;
                          const tone = AVATAR_TONES[p.avatarTone || 'teal'] || AVATAR_TONES.teal;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: 'SET_FIELD',
                                  field: 'editingChildId',
                                  value: p.id,
                                })
                              }
                              className={`min-h-[48px] sm:min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-all active:scale-95 ${
                                selected
                                  ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA]'
                                  : 'bg-white dark:bg-night-900 border-linen-200 dark:border-night-700 text-forest-900 dark:text-white'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${tone}`}
                              >
                                {p.name.slice(0, 1).toUpperCase()}
                              </span>
                              <span>{p.name}</span>
                              <span className="opacity-75 font-normal">· {p.age}y</span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={async () => {
                            if (wizard.childName.trim()) {
                              await handleSaveChildProfile(true);
                            } else {
                              dispatch({
                                type: 'PATCH',
                                patch: { editingChildId: null, childName: '' },
                              });
                            }
                          }}
                          className="min-h-[48px] sm:min-h-[40px] px-3.5 py-1.5 rounded-xl border border-dashed border-forest-700/50 dark:border-[#5ED3DA]/50 text-xs font-bold text-forest-700 dark:text-[#5ED3DA] inline-flex items-center gap-1.5 cursor-pointer hover:bg-linen-100/70 dark:hover:bg-night-800 active:scale-95 transition-all"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                          <span>{t('onboarding.addAnotherChild')}</span>
                        </button>
                      </div>
                    )}

                    {/* Child Reader Card */}
                    <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-4">
                      {wizard.step1Error && (
                        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                          {wizard.step1Error}
                        </p>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="onboarding-child-name"
                            className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1"
                          >
                            Child’s Name *
                          </label>
                          <input
                            id="onboarding-child-name"
                            type="text"
                            value={wizard.childName}
                            onChange={(e) =>
                              dispatch({
                                type: 'SET_FIELD',
                                field: 'childName',
                                value: e.target.value,
                              })
                            }
                            placeholder="e.g. Maya or Leo"
                            className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label
                              htmlFor="onboarding-child-dob"
                              className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400"
                            >
                              Birth Date / Age
                            </label>
                            {computedChildAge !== null && (
                              <span className="text-xs font-bold text-forest-700 dark:text-[#5ED3DA]">
                                {computedChildAge} yrs
                              </span>
                            )}
                          </div>
                          <input
                            id="onboarding-child-dob"
                            type="date"
                            value={wizard.childBirthDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              const age = computeAgeFromBirthDate(val);
                              dispatch({
                                type: 'PATCH',
                                patch: {
                                  childBirthDate: val,
                                  ...(age !== null
                                    ? { childStage: inferReadingStageFromAge(age) }
                                    : {}),
                                },
                              });
                            }}
                            className="w-full min-h-[48px] text-left px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
                          />
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {QUICK_AGES.map((q) => (
                              <button
                                key={q.label}
                                type="button"
                                onClick={() => {
                                  const dob = computeBirthDateForAgeYears(q.yearsAgo);
                                  dispatch({
                                    type: 'PATCH',
                                    patch: {
                                      childBirthDate: dob,
                                      childStage: inferReadingStageFromAge(q.yearsAgo),
                                    },
                                  });
                                }}
                                className="min-h-[38px] px-3 py-1 rounded-full bg-linen-100 hover:bg-linen-200 active:scale-95 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 cursor-pointer transition-all"
                              >
                                {q.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <div>
                          <label
                            htmlFor="onboarding-child-stage"
                            className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1"
                          >
                            Reading Stage
                          </label>
                          <select
                            id="onboarding-child-stage"
                            value={wizard.childStage}
                            onChange={(e) =>
                              dispatch({
                                type: 'SET_FIELD',
                                field: 'childStage',
                                value: e.target.value as ReadingStage,
                              })
                            }
                            className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                          >
                            <option value="board-toddler">Board Book (Ages 0–3)</option>
                            <option value="picture-book">Picture Book (Ages 3–6)</option>
                            <option value="early-reader">Early Reader (Ages 5–8)</option>
                            <option value="chapter-book">Chapter Book (Ages 7–12)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-2">
                            Reader Color
                          </label>
                          <div className="flex items-center gap-3 flex-wrap">
                            {PROFILE_AVATAR_TONE_OPTIONS.map((opt) => {
                              const selected = wizard.childTone === opt.id;
                              const cls = AVATAR_TONES[opt.id] || AVATAR_TONES.teal;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    dispatch({
                                      type: 'SET_FIELD',
                                      field: 'childTone',
                                      value: opt.id,
                                    })
                                  }
                                  aria-label={`Select ${opt.label} color`}
                                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer ${cls} ${
                                    selected
                                      ? 'ring-2 ring-offset-2 ring-forest-700 dark:ring-[#5ED3DA] scale-105'
                                      : 'opacity-80 hover:opacity-100'
                                  }`}
                                >
                                  {selected && <Icon name="check" className="w-4 h-4 text-white" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sticky Mobile Thumb-Zone / Desktop Footer */}
                    <div className="sticky bottom-4 sm:bottom-6 w-full max-w-sm lg:max-w-none mx-auto z-20 pt-2">
                      <div className="flex items-center justify-between gap-2.5 p-2 lg:p-0 rounded-2xl lg:rounded-none bg-ivory/95 lg:bg-transparent dark:bg-night-900/95 lg:dark:bg-transparent backdrop-blur-md lg:backdrop-blur-none border border-linen-200 lg:border-0 dark:border-night-700 shadow-lg lg:shadow-none">
                        <button
                          type="button"
                          onClick={() => goToStep(0)}
                          className="min-h-[48px] px-4 py-2 rounded-xl border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-stone-ink dark:text-slate-300 active:scale-95 transition-all cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          data-action="onboarding-step1-next"
                          onClick={handleStep1Continue}
                          className="flex-1 lg:flex-initial min-h-[48px] px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
                        >
                          <span>Save &amp; Continue</span>
                          <Icon name="chevronRight" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: READING INTERESTS & PREFERENCES */}
                {currentStep === 2 && (
                  <div className="space-y-5 text-left">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-forest-900 dark:text-white">
                        {t('onboarding.step2Title')}
                      </h1>
                      <p className="text-sm text-stone-ink dark:text-slate-400 mt-1.5">
                        {t('onboarding.step2Subtitle')}
                      </p>
                    </div>

                    {state.profiles.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {state.profiles.map((p) => {
                          const selected = step2Profile?.id === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: 'SET_FIELD',
                                  field: 'step2ProfileId',
                                  value: p.id,
                                })
                              }
                              className={`min-h-[44px] px-4 py-2 rounded-full text-xs font-bold border cursor-pointer transition-all active:scale-95 ${
                                selected
                                  ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA]'
                                  : 'bg-white dark:bg-night-900 border-linen-200 dark:border-night-700 text-forest-900 dark:text-white'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step2Profile && (
                      <div className="space-y-4">
                        {/* Interactive Multi-Select Tag Badge Pills + + Custom Tag */}
                        <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3.5">
                          <div className="flex items-center justify-between">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                              Favorite Topics for {step2Profile.name}
                            </h2>
                            <span className="text-xs font-mono-tabular text-forest-700 dark:text-[#5ED3DA] font-semibold">
                              {step2Profile.favoriteTopics.length} selected
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {allStep2Topics.map((topic) => {
                              const selected = step2Profile.favoriteTopics.includes(topic.id);
                              return (
                                <button
                                  key={topic.id}
                                  type="button"
                                  aria-pressed={selected}
                                  onClick={() => handleToggleStep2Topic(topic.id)}
                                  className={`px-4 py-2 rounded-full border text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95 inline-flex items-center gap-1.5 ${
                                    selected
                                      ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA] shadow-2xs'
                                      : 'bg-linen-50/80 dark:bg-night-800/80 border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:border-forest-700/50'
                                  }`}
                                >
                                  <span>{topic.label}</span>
                                  {selected && <Icon name="check" className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                              );
                            })}

                            {!wizard.showCustomTagInput ? (
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'SET_FIELD',
                                    field: 'showCustomTagInput',
                                    value: true,
                                  })
                                }
                                className="px-4 py-2 rounded-full border border-dashed border-forest-700/55 dark:border-[#5ED3DA]/55 text-sm font-medium text-forest-700 dark:text-[#5ED3DA] hover:bg-linen-100/70 dark:hover:bg-night-800 transition-all duration-200 cursor-pointer active:scale-95 inline-flex items-center gap-1.5"
                              >
                                <Icon name="plus" className="w-3.5 h-3.5" />
                                <span>Custom Tag</span>
                              </button>
                            ) : null}
                          </div>

                          {wizard.showCustomTagInput && (
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                type="text"
                                autoFocus
                                value={wizard.customTagDraft}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'SET_FIELD',
                                    field: 'customTagDraft',
                                    value: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddCustomTag();
                                  }
                                }}
                                placeholder="e.g. folklore, music, gardening"
                                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                              />
                              <button
                                type="button"
                                onClick={handleAddCustomTag}
                                className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold cursor-pointer active:scale-95 transition-all"
                              >
                                Add Tag
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({
                                    type: 'PATCH',
                                    patch: { showCustomTagInput: false, customTagDraft: '' },
                                  })
                                }
                                aria-label="Cancel custom tag"
                                className="min-h-[44px] min-w-[44px] rounded-xl text-stone-ink dark:text-slate-400 hover:bg-linen-100 dark:hover:bg-night-800 flex items-center justify-center cursor-pointer"
                              >
                                <Icon name="close" className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Format Preference + Shelf Rhythm */}
                        <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1.5">
                              Preferred Book Type
                            </label>
                            <select
                              value={wizard.preferredFormat}
                              onChange={(e) =>
                                dispatch({
                                  type: 'SET_FIELD',
                                  field: 'preferredFormat',
                                  value: e.target.value as BookFormat | 'any',
                                })
                              }
                              className="w-full min-h-[48px] px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-white"
                            >
                              <option value="any">Any Format Mix</option>
                              <option value="board-book">Board Books</option>
                              <option value="hardcover">Hardcovers</option>
                              <option value="paperback">Paperbacks</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1.5">
                              Books Per Shelf
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  store.updateProfile(step2Profile.id, {
                                    defaultRotationSize: Math.max(
                                      2,
                                      (step2Profile.defaultRotationSize || 4) - 1
                                    ),
                                  })
                                }
                                aria-label="Decrease books per shelf"
                                className="w-12 h-12 rounded-xl bg-linen-100 hover:bg-linen-200 active:scale-95 dark:bg-night-800 font-bold text-forest-900 dark:text-white cursor-pointer transition-all"
                              >
                                −
                              </button>
                              <span className="flex-1 text-center font-mono-tabular font-bold text-base text-forest-900 dark:text-white">
                                {step2Profile.defaultRotationSize || 4}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  store.updateProfile(step2Profile.id, {
                                    defaultRotationSize: Math.min(
                                      12,
                                      (step2Profile.defaultRotationSize || 4) + 1
                                    ),
                                  })
                                }
                                aria-label="Increase books per shelf"
                                className="w-12 h-12 rounded-xl bg-linen-100 hover:bg-linen-200 active:scale-95 dark:bg-night-800 font-bold text-forest-900 dark:text-white cursor-pointer transition-all"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1.5">
                              Rest Window
                            </label>
                            <select
                              value={step2Profile.cooldownDays ?? 14}
                              onChange={(e) =>
                                store.updateProfile(step2Profile.id, {
                                  cooldownDays: Number(e.target.value),
                                })
                              }
                              className="w-full min-h-[48px] px-3 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-white"
                            >
                              <option value={7}>7 days rest</option>
                              <option value={14}>14 days rest</option>
                              <option value={21}>21 days rest</option>
                              <option value={30}>30 days rest</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sticky Mobile Thumb-Zone / Desktop Footer */}
                    <div className="sticky bottom-4 sm:bottom-6 w-full max-w-sm lg:max-w-none mx-auto z-20 pt-2">
                      <div className="flex items-center justify-between gap-2.5 p-2 lg:p-0 rounded-2xl lg:rounded-none bg-ivory/95 lg:bg-transparent dark:bg-night-900/95 lg:dark:bg-transparent backdrop-blur-md lg:backdrop-blur-none border border-linen-200 lg:border-0 dark:border-night-700 shadow-lg lg:shadow-none">
                        <button
                          type="button"
                          onClick={() => goToStep(1)}
                          className="min-h-[48px] px-4 py-2 rounded-xl border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-stone-ink dark:text-slate-300 active:scale-95 transition-all cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          data-action="onboarding-step2-next"
                          onClick={() => goToStep(3, 2)}
                          className="flex-1 lg:flex-initial min-h-[48px] px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
                        >
                          <span>Continue to Library</span>
                          <Icon name="chevronRight" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: BUILD INITIAL LIBRARY */}
                {currentStep === 3 && (
                  <div className="space-y-5 text-left">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-forest-900 dark:text-white">
                        {t('onboarding.step3Title')}
                      </h1>
                      <p className="text-sm text-stone-ink dark:text-slate-400 mt-1.5">
                        {t('onboarding.step3Subtitle')}
                      </p>
                    </div>

                    <OnboardingLibraryStep
                      primaryProfileId={state.profiles[0]?.id || activeProfile?.id}
                    />

                    {/* Sticky Mobile Thumb-Zone / Desktop Footer */}
                    <div className="sticky bottom-4 sm:bottom-6 w-full max-w-sm lg:max-w-none mx-auto z-20 pt-2">
                      <div className="flex items-center justify-between gap-2.5 p-2 lg:p-0 rounded-2xl lg:rounded-none bg-ivory/95 lg:bg-transparent dark:bg-night-900/95 lg:dark:bg-transparent backdrop-blur-md lg:backdrop-blur-none border border-linen-200 lg:border-0 dark:border-night-700 shadow-lg lg:shadow-none">
                        <button
                          type="button"
                          onClick={() => goToStep(2)}
                          className="min-h-[48px] px-4 py-2 rounded-xl border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-stone-ink dark:text-slate-300 active:scale-95 transition-all cursor-pointer"
                        >
                          Back
                        </button>
                        <div className="flex items-center gap-2 flex-1 lg:flex-initial justify-end">
                          {state.books.length === 0 && (
                            <button
                              type="button"
                              onClick={() => goToStep(4, undefined, 3)}
                              className="min-h-[48px] px-3 text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                            >
                              Skip
                            </button>
                          )}
                          <button
                            type="button"
                            data-action="onboarding-step3-next"
                            onClick={() => goToStep(4, 3)}
                            className="flex-1 lg:flex-initial min-h-[48px] px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
                          >
                            <span>Continue to First Shelf</span>
                            <Icon name="chevronRight" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: CREATE FIRST ROTATION (WITH ELEVATED SHELF VISUALIZATION) */}
                {currentStep === 4 && (
                  <div className="space-y-5 text-left">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-forest-900 dark:text-white">
                        {t('onboarding.step4Title')}
                      </h1>
                      <p className="text-sm text-stone-ink dark:text-slate-400 mt-1.5">
                        {t('onboarding.step4Subtitle')}
                      </p>
                    </div>

                    {state.books.length === 0 ? (
                      <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 space-y-4">
                        <h2 className="font-display text-base font-bold text-forest-900 dark:text-white">
                          Add a few books first to build your shelf
                        </h2>
                        <p className="text-xs text-stone-ink dark:text-slate-400 leading-relaxed">
                          A shelf rotation picks books from your catalog. You can go back to scan or
                          add books, load our 9 starter classics, or skip and finish setup now.
                        </p>
                        <div className="flex flex-wrap gap-2.5">
                          <button
                            type="button"
                            onClick={async () => {
                              await store.importSampleCollectionAdditive({
                                assignToProfileId: rotProfile?.id,
                              });
                            }}
                            className="min-h-[48px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold cursor-pointer active:scale-95 transition-all"
                          >
                            Add 9 Starter Books
                          </button>
                          <button
                            type="button"
                            onClick={() => goToStep(3)}
                            className="min-h-[48px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-linen-100 dark:bg-night-800 text-xs font-semibold text-forest-900 dark:text-white cursor-pointer active:scale-95 transition-all"
                          >
                            Go Back &amp; Add Books
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {/* Rules Configuration Panel */}
                        <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                          {wizard.step4Error && (
                            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
                              {wizard.step4Error}
                            </p>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div>
                              <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                                Rotation Name
                              </label>
                              <input
                                type="text"
                                value={wizard.rotTitle}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'SET_FIELD',
                                    field: 'rotTitle',
                                    value: e.target.value,
                                  })
                                }
                                placeholder="e.g. Cozy Bedtime Shelf"
                                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                                Reader
                              </label>
                              <select
                                value={wizard.rotProfileId}
                                onChange={(e) => {
                                  const nextId = e.target.value;
                                  const nextProf = state.profiles.find((p) => p.id === nextId);
                                  dispatch({
                                    type: 'PATCH',
                                    patch: {
                                      rotProfileId: nextId,
                                      ...(nextProf
                                        ? {
                                            rotTitle: `${nextProf.name}’s First Shelf`,
                                            rotTags: nextProf.favoriteTopics || [],
                                          }
                                        : {}),
                                    },
                                  });
                                }}
                                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                              >
                                {state.profiles.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({formatReadingStage(p.readingStage)})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                                Books On Display
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={Math.max(1, Math.min(12, state.books.length))}
                                value={wizard.rotCount}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'SET_FIELD',
                                    field: 'rotCount',
                                    value: Number(e.target.value) || 1,
                                  })
                                }
                                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular font-semibold text-forest-900 dark:text-white"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
                                Swap Cycle Duration
                              </label>
                              <select
                                value={wizard.rotSwapDays}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'SET_FIELD',
                                    field: 'rotSwapDays',
                                    value: Number(e.target.value),
                                  })
                                }
                                className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                              >
                                <option value={7}>Every 7 days (Weekly)</option>
                                <option value={14}>Every 14 days (Biweekly)</option>
                                <option value={21}>Every 21 days (3 Weeks)</option>
                                <option value={30}>Every 30 days (Monthly)</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                            <p className="text-xs text-stone-ink dark:text-slate-400">
                              Format:{' '}
                              {wizard.rotFormat === 'any'
                                ? 'Balanced Mix'
                                : formatBookBinding(wizard.rotFormat)}{' '}
                              ·{' '}
                              {wizard.rotTags.length > 0
                                ? `Topics: ${wizard.rotTags.slice(0, 4).join(', ')}`
                                : 'All favorite topics'}
                            </p>
                            <button
                              type="button"
                              data-action="onboarding-create-rotation"
                              disabled={wizard.creatingRotation}
                              onClick={handleCreateFirstRotation}
                              className="min-h-[48px] sm:min-h-[44px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 active:scale-[0.98] text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
                            >
                              <Icon name="sparkles" className="w-4 h-4" />
                              <span>
                                {createdRotationForStep4
                                  ? 'Regenerate Shelf'
                                  : 'Create First Shelf Rotation'}
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Elevated Editorial Shelf Visualization (matching HomeView/LibraryView framed cards) */}
                        {createdRotationForStep4 && (
                          <div className="rounded-3xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 shadow-sm overflow-hidden">
                            <div className="bg-forest-900 dark:bg-[#0B1518] px-5 py-3.5 flex items-center justify-between gap-3 text-white">
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#5ED3DA]">
                                  Active Shelf Created
                                </p>
                                <h2 className="font-display text-base font-bold text-white truncate">
                                  {createdRotationForStep4.title}
                                </h2>
                              </div>
                              <span className="text-xs font-mono-tabular px-2.5 py-1 rounded-lg bg-white/12 text-white/95 shrink-0">
                                {createdRotationForStep4.bookIds.length} books
                              </span>
                            </div>

                            <div className="p-4 sm:p-5 bg-linen-50/55 dark:bg-night-950/35">
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                                {createdRotationForStep4.bookIds.map((id) => {
                                  const b = state.books.find((item) => item.id === id);
                                  if (!b) return null;
                                  return (
                                    <button
                                      key={b.id}
                                      type="button"
                                      onClick={() => setInspectedBookId(b.id)}
                                      className="group rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-2.5 text-left shadow-2xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all cursor-pointer flex flex-col gap-2"
                                    >
                                      <div className="w-full rounded-xl overflow-hidden shadow-xs">
                                        <BookCover
                                          book={b}
                                          size="grid"
                                          aspectRatio={
                                            state.settings?.coverAspectRatio || 'portrait'
                                          }
                                          showBadges={false}
                                          hideRotationAdorno={true}
                                        />
                                      </div>
                                      <div className="min-w-0 px-0.5 space-y-0.5">
                                        <p className="font-display text-xs font-bold text-forest-900 dark:text-white line-clamp-2 leading-snug">
                                          {b.title}
                                        </p>
                                        <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                                          {b.authors[0] || formatBookBinding(b.format)}
                                        </p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sticky Mobile Thumb-Zone / Desktop Footer */}
                    <div className="sticky bottom-4 sm:bottom-6 w-full max-w-sm lg:max-w-none mx-auto z-20 pt-2">
                      <div className="flex items-center justify-between gap-2.5 p-2 lg:p-0 rounded-2xl lg:rounded-none bg-ivory/95 lg:bg-transparent dark:bg-night-900/95 lg:dark:bg-transparent backdrop-blur-md lg:backdrop-blur-none border border-linen-200 lg:border-0 dark:border-night-700 shadow-lg lg:shadow-none">
                        <button
                          type="button"
                          onClick={() => goToStep(3)}
                          className="min-h-[48px] px-4 py-2 rounded-xl border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-semibold text-stone-ink dark:text-slate-300 active:scale-95 transition-all cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          data-action="onboarding-step4-next"
                          onClick={() =>
                            goToStep(
                              5,
                              createdRotationForStep4 ? 4 : undefined,
                              createdRotationForStep4 ? undefined : 4
                            )
                          }
                          className="flex-1 lg:flex-initial min-h-[48px] px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
                        >
                          <span>
                            {createdRotationForStep4 ? 'Finish Setup' : 'Skip Rotation & Finish'}
                          </span>
                          <Icon name="chevronRight" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 5: ALL SET LAUNCHPAD */}
                {currentStep === 5 && (
                  <div className="space-y-6 text-left">
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-[#5ED3DA]">
                        Setup Complete
                      </p>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-forest-900 dark:text-white">
                        {state.settings.householdName
                          ? `${state.settings.householdName} Is Ready`
                          : t('onboarding.step5Title')}
                      </h1>
                      <p className="text-sm text-stone-ink dark:text-slate-400">
                        {t('onboarding.step5Subtitle')}
                      </p>
                    </div>

                    {/* Editorial Summary Card */}
                    <div className="rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 space-y-5 shadow-xs">
                      <div className="grid grid-cols-3 gap-4 border-b border-linen-200/70 dark:border-night-800 pb-4">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-stone-ink dark:text-slate-400">
                            Readers
                          </p>
                          <p className="font-display text-xl font-bold text-forest-900 dark:text-white mt-0.5 tabular-nums">
                            {state.profiles.length}
                          </p>
                          <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
                            {state.profiles.map((p) => p.name).join(', ') || 'None'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-stone-ink dark:text-slate-400">
                            Library Books
                          </p>
                          <p className="font-display text-xl font-bold text-forest-900 dark:text-white mt-0.5 tabular-nums">
                            {state.books.length}
                          </p>
                          <p className="text-xs text-stone-ink dark:text-slate-400">
                            Stored locally
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-stone-ink dark:text-slate-400">
                            Active Shelf
                          </p>
                          <p className="font-display text-xl font-bold text-forest-900 dark:text-white mt-0.5 tabular-nums">
                            {activeRotation
                              ? activeRotation.bookIds.length
                              : state.rotations.length}
                          </p>
                          <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
                            {activeRotation?.title || 'Ready whenever you are'}
                          </p>
                        </div>
                      </div>

                      {activeRotation && activeRotation.bookIds.length > 0 && (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                          {activeRotation.bookIds.slice(0, 5).map((id) => {
                            const book = state.books.find((b) => b.id === id);
                            if (!book) return null;
                            return (
                              <div
                                key={book.id}
                                className="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200/80 dark:border-night-800 p-1.5 space-y-1.5"
                              >
                                <BookCover
                                  book={book}
                                  size="grid"
                                  aspectRatio="portrait"
                                  showBadges={false}
                                  hideRotationAdorno={true}
                                />
                                <p className="text-[11px] font-semibold text-forest-900 dark:text-white truncate px-0.5">
                                  {book.title}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 3 Launch CTAs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        data-action="onboarding-launch-home"
                        onClick={() => handleFinishLaunch('home')}
                        className="min-h-[48px] px-4 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
                      >
                        <Icon name="home" className="w-4 h-4" />
                        <span>{t('onboarding.openShelfCta')}</span>
                      </button>

                      <button
                        type="button"
                        data-action="onboarding-launch-scan"
                        onClick={() => handleFinishLaunch('scan')}
                        className="min-h-[48px] px-4 py-3 rounded-2xl bg-white hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                      >
                        <Icon name="scan" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                        <span>{t('onboarding.scanMoreCta')}</span>
                      </button>

                      <button
                        type="button"
                        data-action="onboarding-launch-play"
                        onClick={() => handleFinishLaunch('play')}
                        className="min-h-[48px] px-4 py-3 rounded-2xl bg-white hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer transition-all"
                      >
                        <Icon name="play" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                        <span>{t('onboarding.explorePlayCta')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
