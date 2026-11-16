import React, { useEffect, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { OnboardingLibraryStep } from './OnboardingLibraryStep.js';
import { AVATAR_TONES, PROFILE_AVATAR_TONE_OPTIONS } from '../../config/index.js';
import {
  getEffectiveProfileAge,
  type BookFormat,
  type ReadingStage,
} from '../../types/models.js';
import catalogArt from '../../assets/images/onboarding_catalog_art_1794694074032.jpg';
import rotateArt from '../../assets/images/onboarding_rotate_art_1794694074815.jpg';
import readArt from '../../assets/images/onboarding_read_art_1794694074713.jpg';

const ONBOARDING_TOPICS: Array<{ id: string; label: string; emoji: string }> = [
  { id: 'animals', label: 'Animals', emoji: '🐾' },
  { id: 'space', label: 'Space', emoji: '🚀' },
  { id: 'bedtime', label: 'Bedtime', emoji: '🌙' },
  { id: 'nature', label: 'Nature', emoji: '🌿' },
  { id: 'vehicles', label: 'Vehicles', emoji: '🚂' },
  { id: 'fairy-tales', label: 'Fairy Tales', emoji: '🏰' },
  { id: 'history', label: 'History', emoji: '🏛️' },
  { id: 'science', label: 'Science', emoji: '🔬' },
  { id: 'humor', label: 'Humor', emoji: '😂' },
  { id: 'art', label: 'Art', emoji: '🎨' },
  { id: 'dinosaurs', label: 'Dinosaurs', emoji: '🦕' },
  { id: 'ocean', label: 'Ocean', emoji: '🌊' },
  { id: 'adventure', label: 'Adventure', emoji: '🧭' },
];

const AGE_GROUPS: Array<{
  id: string;
  label: string;
  ageYears: number;
  stage: ReadingStage;
}> = [
  { id: '0-2', label: '0–2', ageYears: 2, stage: 'board-toddler' },
  { id: '3-5', label: '3–5', ageYears: 4, stage: 'picture-book' },
  { id: '6-8', label: '6–8', ageYears: 7, stage: 'early-reader' },
  { id: '9-12', label: '9–12', ageYears: 10, stage: 'chapter-book' },
  { id: 'teen', label: 'Teen', ageYears: 14, stage: 'teen-ya' },
  { id: 'adult', label: 'Adult', ageYears: 30, stage: 'adult' },
];

const BOOK_TYPE_OPTIONS: Array<{
  id: string;
  label: string;
  hint: string;
  fullWidth?: boolean;
}> = [
  { id: 'picture-books', label: 'Picture Books', hint: 'Illustrated read-alouds' },
  { id: 'board-books', label: 'Board Books', hint: 'Sturdy toddler pages' },
  { id: 'early-readers', label: 'Early Readers', hint: 'First solo reading' },
  { id: 'illustrated-non-fiction', label: 'Illustrated Non-Fiction', hint: 'Facts & visual discovery' },
  { id: 'chapter-books', label: 'Chapter Books', hint: 'Longer nightly stories' },
  { id: 'graphic-novels', label: 'Graphic Novels', hint: 'Comics & visual panels' },
  {
    id: 'bilingual',
    label: 'Bilingual / Foreign Language',
    hint: 'Dual-language & heritage shelves',
    fullWidth: true,
  },
];

const STEP_META = [
  { step: 1, label: 'Household' },
  { step: 2, label: 'Readers' },
  { step: 3, label: 'Topics' },
  { step: 4, label: 'Book Types' },
  { step: 5, label: 'Initial Shelf' },
];

function computeBirthDateForAgeYears(years: number): string {
  const clamped = Math.max(0, Math.min(120, Math.trunc(years)));
  const d = new Date();
  d.setFullYear(d.getFullYear() - clamped);
  return d.toISOString().slice(0, 10);
}

function inferWizardReadingStage(ageYears: number): ReadingStage {
  if (ageYears <= 2) return 'board-toddler';
  if (ageYears <= 5) return 'picture-book';
  if (ageYears <= 8) return 'early-reader';
  if (ageYears <= 10) return 'chapter-book';
  if (ageYears <= 12) return 'middle-grade';
  if (ageYears <= 17) return 'teen-ya';
  return 'adult';
}

function matchAgeGroupId(ageYears: number): string {
  if (ageYears <= 2) return '0-2';
  if (ageYears <= 5) return '3-5';
  if (ageYears <= 8) return '6-8';
  if (ageYears <= 12) return '9-12';
  if (ageYears <= 17) return 'teen';
  return 'adult';
}

interface WizardState {
  direction: 1 | -1;
  householdNameDraft: string;
  editingReaderId: string | null;
  readerName: string;
  readerAge: number;
  readerGroupId: string;
  readerStage: ReadingStage;
  readerTone: string;
  step2Error: string;
  selectedTopics: string[];
  selectedBookTypes: string[];
  finishing: boolean;
  confirmSkipOpen: boolean;
}

type WizardAction =
  | { type: 'SET_FIELD'; field: keyof WizardState; value: WizardState[keyof WizardState] }
  | { type: 'PATCH'; patch: Partial<WizardState> };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'PATCH':
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

export const OnboardingWizard: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    isOnboardingPreview,
    navigate,
    t,
  } = useApp();

  const currentStep = Math.max(0, Math.min(5, state.settings.onboarding?.currentStep ?? 0));
  const [failedArtIds, setFailedArtIds] = useState<Record<string, boolean>>({});
  const householdInputRef = useRef<HTMLInputElement>(null);
  const readerNameInputRef = useRef<HTMLInputElement>(null);

  const initialTopics =
    state.profiles[0]?.favoriteTopics && state.profiles[0].favoriteTopics.length > 0
      ? state.profiles[0].favoriteTopics
      : ['animals', 'bedtime', 'nature'];

  const initialBookTypes =
    state.settings.preferredBookTypes && state.settings.preferredBookTypes.length > 0
      ? state.settings.preferredBookTypes
      : ['picture-books', 'board-books'];

  const [wizard, dispatch] = useReducer(wizardReducer, undefined, (): WizardState => ({
    direction: 1,
    householdNameDraft: state.settings.householdName || '',
    editingReaderId: null,
    readerName: '',
    readerAge: 4,
    readerGroupId: '3-5',
    readerStage: 'picture-book',
    readerTone: 'teal',
    step2Error: '',
    selectedTopics: initialTopics,
    selectedBookTypes: initialBookTypes,
    finishing: false,
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
    if (currentStep === 1) {
      const timer = window.setTimeout(() => {
        householdInputRef.current?.focus();
      }, 120);
      return () => window.clearTimeout(timer);
    }
  }, [currentStep]);

  const goToStep = async (nextStep: number, markCompletedStep?: number, markSkippedStep?: number) => {
    dispatch({
      type: 'PATCH',
      patch: {
        direction: nextStep >= currentStep ? 1 : -1,
        confirmSkipOpen: false,
      },
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

  // Step 1: Household Identity
  const handleStep1Continue = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = wizard.householdNameDraft.trim();
    if (trimmed !== (state.settings.householdName || '')) {
      await store.setHouseholdName(trimmed, { silent: true });
    }
    await goToStep(2, 1);
  };

  // Step 2: Readers
  const pickNextTone = (count: number) => {
    const keys = PROFILE_AVATAR_TONE_OPTIONS.map((opt) => opt.id);
    return keys[count % keys.length] || 'teal';
  };

  const resetReaderForm = (nextCount = state.profiles.length) => {
    dispatch({
      type: 'PATCH',
      patch: {
        editingReaderId: null,
        readerName: '',
        readerAge: 4,
        readerGroupId: '3-5',
        readerStage: 'picture-book',
        readerTone: pickNextTone(nextCount),
        step2Error: '',
      },
    });
  };

  const handleSaveReader = async (clearAfter = true): Promise<boolean> => {
    dispatch({ type: 'SET_FIELD', field: 'step2Error', value: '' });
    const name = wizard.readerName.trim();
    if (!name) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step2Error',
        value: 'Enter a reader name first.',
      });
      readerNameInputRef.current?.focus();
      return false;
    }

    const birthDate = computeBirthDateForAgeYears(wizard.readerAge);
    const existing = wizard.editingReaderId
      ? state.profiles.find((p) => p.id === wizard.editingReaderId)
      : null;

    if (existing) {
      await store.updateProfile(existing.id, {
        name,
        birthDate,
        age: wizard.readerAge,
        readingStage: wizard.readerStage,
        avatarTone: wizard.readerTone,
      });
    } else {
      await store.addProfile({
        name,
        birthDate,
        age: wizard.readerAge,
        readingStage: wizard.readerStage,
        avatarTone: wizard.readerTone,
        favoriteTopics: wizard.selectedTopics,
        defaultRotationSize: wizard.readerAge <= 3 ? 4 : 5,
        cooldownDays: 14,
      });
    }

    if (clearAfter) {
      resetReaderForm(state.profiles.length + (existing ? 0 : 1));
    }
    return true;
  };

  const handleSelectReaderForEdit = (profileId: string) => {
    const p = state.profiles.find((item) => item.id === profileId);
    if (!p) return;
    const age = getEffectiveProfileAge(p);
    dispatch({
      type: 'PATCH',
      patch: {
        editingReaderId: p.id,
        readerName: p.name,
        readerAge: age,
        readerGroupId: matchAgeGroupId(age),
        readerStage: p.readingStage,
        readerTone: p.avatarTone || 'teal',
        step2Error: '',
      },
    });
  };

  const handleRemoveReader = async (profileId: string) => {
    await store.deleteProfile(profileId);
    if (wizard.editingReaderId === profileId) {
      resetReaderForm(Math.max(0, state.profiles.length - 1));
    }
  };

  const handleStep2Continue = async () => {
    dispatch({ type: 'SET_FIELD', field: 'step2Error', value: '' });
    if (wizard.readerName.trim()) {
      const saved = await handleSaveReader(true);
      if (!saved) return;
    } else if (state.profiles.length === 0) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step2Error',
        value: 'Add at least one reader to personalize shelves.',
      });
      readerNameInputRef.current?.focus();
      return;
    }
    await goToStep(3, 2);
  };

  // Step 3: Favourite Topics
  const handleToggleTopic = (topicId: string) => {
    const exists = wizard.selectedTopics.includes(topicId);
    const next = exists
      ? wizard.selectedTopics.filter((id) => id !== topicId)
      : [...wizard.selectedTopics, topicId];
    dispatch({ type: 'SET_FIELD', field: 'selectedTopics', value: next });
  };

  const handleStep3Continue = async () => {
    for (const profile of state.profiles) {
      await store.updateProfile(profile.id, {
        favoriteTopics: wizard.selectedTopics,
      });
    }
    await goToStep(4, 3);
  };

  // Step 4: Preferred Book Types
  const handleToggleBookType = (typeId: string) => {
    const exists = wizard.selectedBookTypes.includes(typeId);
    const next = exists
      ? wizard.selectedBookTypes.filter((id) => id !== typeId)
      : [...wizard.selectedBookTypes, typeId];
    dispatch({ type: 'SET_FIELD', field: 'selectedBookTypes', value: next });
  };

  const handleStep4Continue = async () => {
    await store.updateSettings({
      preferredBookTypes: wizard.selectedBookTypes,
    });
    await goToStep(5, 4);
  };

  // Step 5: Finish & Open Library
  const handleFinishAndOpenLibrary = async () => {
    if (wizard.finishing) return;
    dispatch({ type: 'SET_FIELD', field: 'finishing', value: true });
    try {
      const primary = state.profiles[0] || activeProfile;
      if (primary && state.books.length > 0 && state.rotations.length === 0) {
        let requiredFormat: BookFormat | 'any' = 'any';
        if (
          wizard.selectedBookTypes.includes('board-books') &&
          !wizard.selectedBookTypes.includes('picture-books') &&
          !wizard.selectedBookTypes.includes('chapter-books')
        ) {
          requiredFormat = 'board-book';
        }
        try {
          await store.generateRotation({
            profileId: primary.id,
            title: `${primary.name}’s Weekly Shelf`,
            count: Math.min(primary.defaultRotationSize || 4, state.books.length),
            preferredTags: wizard.selectedTopics,
            cooldownDays: primary.cooldownDays ?? 14,
            swapDays: 7,
            varietyMix: true,
            requiredFormat,
          });
        } catch {
          // Non-fatal if no matching format books exist yet
        }
      }

      await store.completeOnboarding({
        skipped: state.profiles.length === 0,
      });
      navigate('library');
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'finishing', value: false });
    }
  };

  const handleSkipAllConfirmed = async () => {
    dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false });
    await store.completeOnboarding({ skipped: true });
    navigate('home');
  };

  const slideVariants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? 22 : -22,
    }),
    center: {
      opacity: 1,
      x: 0,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -22 : 22,
    }),
  };

  return (
    <div className="h-[100dvh] lg:h-auto lg:min-h-[100dvh] overflow-hidden lg:overflow-visible bg-linen-50 dark:bg-night-950 text-[#1A2423] dark:text-[#F4EFE6] flex flex-col justify-between">
      {/* Top Preview Mode Banner (only when launched from Dev Tools Preview) */}
      {isOnboardingPreview && (
        <div className="shrink-0 bg-amber-100 dark:bg-amber-950/80 border-b border-amber-300 dark:border-amber-800 px-4 py-1.5 text-xs z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <span className="font-semibold text-amber-950 dark:text-amber-100 truncate">
              {t('onboarding.previewBanner')}
            </span>
            <button
              type="button"
              onClick={() => store.exitPreviewOnboarding()}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-amber-900 text-white dark:bg-amber-200 dark:text-night-950 font-bold text-xs whitespace-nowrap cursor-pointer shrink-0"
            >
              {t('onboarding.exitPreview')}
            </button>
          </div>
        </div>
      )}

      {/* HEADER: Minimal Single-Line Bar */}
      {currentStep === 0 ? (
        <header className="shrink-0 z-30 border-b border-linen-200/80 dark:border-night-800 bg-ivory/90 dark:bg-night-900/90 backdrop-blur-md pt-safe">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-13 sm:h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-forest-900 dark:bg-[#5ED3DA] text-white dark:text-night-950 flex items-center justify-center shrink-0 shadow-xs">
                <Icon name="rotations" className="w-4 h-4" />
              </span>
              <span className="font-display font-bold text-base sm:text-lg text-forest-900 dark:text-white tracking-tight whitespace-nowrap truncate">
                Library Rotation
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                  className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-stone-ink hover:text-forest-900 hover:bg-linen-100/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-night-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  {isOnboardingPreview ? t('onboarding.exitPreview') : 'Skip'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSkipAllConfirmed}
                    className="min-h-[38px] px-3 py-1 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold whitespace-nowrap cursor-pointer"
                  >
                    Skip Setup
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false })
                    }
                    className="min-h-[38px] px-2.5 py-1 rounded-xl text-xs font-semibold text-stone-ink dark:text-slate-300 whitespace-nowrap cursor-pointer"
                  >
                    Stay
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="shrink-0 z-30 border-b border-linen-200/80 dark:border-night-800 bg-ivory/95 dark:bg-night-900/95 backdrop-blur-md pt-safe">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2.5 sm:gap-4">
            {/* Left: Single Back Arrow Button */}
            <button
              type="button"
              onClick={() => goToStep(currentStep - 1)}
              aria-label="Go back"
              className="min-h-[44px] min-w-[44px] rounded-xl text-forest-900 dark:text-white hover:bg-linen-100/80 dark:hover:bg-night-800 active:scale-95 flex items-center justify-center shrink-0 cursor-pointer transition-all"
            >
              <Icon name="chevronLeft" className="w-5 h-5" />
            </button>

            {/* Center: 5-Segment Horizontal Progress Bar */}
            <div
              role="progressbar"
              aria-valuenow={currentStep}
              aria-valuemin={1}
              aria-valuemax={5}
              aria-label={`Setup step ${currentStep} of 5`}
              className="grid grid-cols-5 gap-1.5 flex-1 max-w-[200px] sm:max-w-xs mx-auto"
            >
              {[1, 2, 3, 4, 5].map((seg) => {
                const filled = seg <= currentStep;
                return (
                  <div
                    key={seg}
                    className={`h-1.5 rounded-full transition-colors duration-300 ${
                      filled
                        ? 'bg-forest-800 dark:bg-[#5ED3DA]'
                        : 'bg-linen-200 dark:bg-night-800'
                    }`}
                  />
                );
              })}
            </div>

            {/* Right: Compact 1/5 Badge + Single-Line Skip */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-mono-tabular font-semibold text-stone-ink dark:text-slate-400 whitespace-nowrap">
                {currentStep}/5
              </span>
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
                  className="min-h-[44px] px-2.5 rounded-xl text-xs font-semibold text-stone-ink hover:text-forest-900 dark:text-slate-300 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  {isOnboardingPreview ? 'Exit' : 'Skip'}
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSkipAllConfirmed}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-[11px] font-bold whitespace-nowrap cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false })
                    }
                    className="min-h-[36px] px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-ink dark:text-slate-300 whitespace-nowrap cursor-pointer"
                  >
                    Stay
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* MAIN CONTENT SHELL */}
      <main className="flex-1 min-h-0 flex flex-col w-full max-w-6xl mx-auto">
        <AnimatePresence mode="wait" custom={wizard.direction}>
          {/* ============================================================== */}
          {/* STEP 0: PRE-WIZARD LANDING SCREEN                              */}
          {/* ============================================================== */}
          {currentStep === 0 && (
            <motion.div
              key="step-0"
              custom={wizard.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 flex flex-col"
            >
              {/* MOBILE (< sm): Strict 100dvh Above-the-Fold Landing */}
              <div className="sm:hidden flex-1 min-h-0 flex flex-col justify-between px-5 pt-3 pb-3 pb-safe gap-3">
                <div className="flex-1 min-h-0 flex flex-col justify-center gap-3.5 overflow-y-auto no-scrollbar">
                  {/* Compact Stylized Weekly Rotation Preview Card (<= 28vh) */}
                  <div className="max-h-[28vh] rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 shadow-xs overflow-hidden shrink-0">
                    <div className="bg-forest-900 dark:bg-[#0B1518] px-3.5 py-2 flex items-center justify-between text-white">
                      <span className="text-[11px] font-semibold tracking-tight text-white">
                        Weekly Rotation Shelf
                      </span>
                      <span className="text-[11px] font-mono-tabular text-[#5ED3DA]">
                        Maya · Age 4
                      </span>
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { title: 'Wild Things', bg: 'bg-[#1D4E4F]', tag: 'Read' },
                          { title: 'Snowy Day', bg: 'bg-[#9A4E16]', tag: 'On Shelf' },
                          { title: 'Goodnight Moon', bg: 'bg-[#1E3A5F]', tag: 'Bedtime' },
                        ].map((item) => (
                          <div
                            key={item.title}
                            className={`rounded-xl ${item.bg} p-2 text-white flex flex-col justify-between aspect-[4/3] max-h-[82px] shadow-2xs`}
                          >
                            <span className="text-[9px] uppercase tracking-wider opacity-80">
                              {item.tag}
                            </span>
                            <p className="font-display text-[11px] font-bold leading-tight line-clamp-2">
                              {item.title}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-stone-ink dark:text-slate-400">
                        4 books on display · Next swap in 7 days
                      </p>
                    </div>
                  </div>

                  {/* Punchy Headline + 1-Sentence Subtitle */}
                  <div className="space-y-1.5">
                    <h1 className="font-display text-[26px] leading-[1.12] font-bold tracking-tight text-forest-900 dark:text-white">
                      Your family’s personal library, rotated weekly.
                    </h1>
                    <p className="text-[13px] leading-snug text-stone-ink dark:text-slate-300">
                      Automatic themed book rotations, kid reading passports, and effortless ISBN
                      scanning in one calm space.
                    </p>
                  </div>

                  {/* Compact 3-Row Feature Strip */}
                  <div className="divide-y divide-linen-200/80 dark:divide-night-800 rounded-2xl bg-ivory/80 dark:bg-night-900/80 border border-linen-200 dark:border-night-800 px-3.5">
                    {[
                      {
                        icon: 'rotations',
                        title: 'Smart Rotations',
                        desc: 'Fresh weekly shelves from books you own',
                      },
                      {
                        icon: 'stamp',
                        title: 'Kid Reading Passports',
                        desc: 'Printable keepsakes & reading stamps',
                      },
                      {
                        icon: 'scan',
                        title: 'Instant Barcode Scan',
                        desc: 'Catalog books in seconds with your camera',
                      },
                    ].map((feat) => (
                      <div key={feat.icon} className="py-2 flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-linen-100 dark:bg-night-800 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center shrink-0">
                          <Icon name={feat.icon} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-forest-900 dark:text-white leading-tight">
                            {feat.title}
                          </p>
                          <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                            {feat.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Immediate Pinned CTAs */}
                <div className="shrink-0 space-y-2 pt-1">
                  <button
                    type="button"
                    data-action="onboarding-begin"
                    onClick={() => goToStep(1, 0)}
                    className="w-full min-h-[50px] px-6 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <span>Start Family Setup</span>
                    <Icon name="chevronRight" className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-action="onboarding-explore-sample"
                    onClick={async () => {
                      await store.loadFullSampleHousehold();
                      navigate('home');
                    }}
                    className="w-full min-h-[44px] px-5 py-2.5 rounded-2xl bg-ivory/90 hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Icon name="book" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                    <span>Explore Sample Family</span>
                  </button>
                </div>
              </div>

              {/* DESKTOP & TABLET (sm+): Preserved Editorial Landing Layout */}
              <div className="hidden sm:grid sm:grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto px-6 lg:px-8 py-10">
                <div className="lg:col-span-7 space-y-6 text-left">
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-forest-700 dark:text-[#5ED3DA]">
                      {t('onboarding.welcomeEyebrow')}
                    </p>
                    <h1 className="font-display text-4xl lg:text-5xl font-bold text-forest-900 dark:text-white leading-[1.08] tracking-tight">
                      {t('onboarding.welcomeTitle')}
                    </h1>
                    <p className="text-base text-stone-ink dark:text-slate-300 leading-relaxed max-w-xl">
                      {t('onboarding.welcomeSubtitle')}
                    </p>
                  </div>

                  {/* 3 Centered Editorial Illustration Pillars */}
                  <div className="grid grid-cols-3 gap-3.5 pt-2">
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

                  <div className="flex flex-row items-center gap-3 pt-2">
                    <button
                      type="button"
                      data-action="onboarding-begin-desktop"
                      onClick={() => goToStep(1, 0)}
                      className="min-h-[48px] px-6 py-3 rounded-2xl bg-forest-700 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <span>Start Family Setup</span>
                      <Icon name="chevronRight" className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      data-action="onboarding-explore-sample-desktop"
                      onClick={async () => {
                        await store.loadFullSampleHousehold();
                        navigate('home');
                      }}
                      className="min-h-[48px] px-5 py-3 rounded-2xl bg-ivory hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                    >
                      <Icon name="book" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                      <span>Explore Sample Family</span>
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

                    <div className="p-6 space-y-4">
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
              </div>
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* STEPS 1–5: MOBILE 100dvh FLEX SHELL + DESKTOP 2-COL SPLIT       */}
          {/* ============================================================== */}
          {currentStep > 0 && (
            <motion.div
              key={`step-${currentStep}`}
              custom={wizard.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start lg:px-8 lg:py-10"
            >
              {/* Desktop Left Guidance Rail (Preserved for Large Screens) */}
              <aside className="hidden lg:block lg:col-span-4 space-y-5 sticky top-24">
                <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-5 space-y-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
                    Guided Setup
                  </p>
                  <ol className="space-y-2">
                    {STEP_META.map((m) => {
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
                    Every reader profile, topic, format preference, and book record can be changed
                    anytime in Profiles or Settings.
                  </p>
                </div>
              </aside>

              {/* Interactive Step Body + Sticky Bottom Bar */}
              <section className="flex-1 min-h-0 flex flex-col justify-between lg:col-span-8 lg:block lg:space-y-6">
                {/* ---------------------------------------------------------- */}
                {/* STEP 1: HOUSEHOLD IDENTITY                                 */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 1 && (
                  <form
                    onSubmit={handleStep1Continue}
                    className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-6"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-6 pb-3 lg:p-0 flex flex-col justify-center lg:block space-y-5 text-left">
                      <div className="space-y-2">
                        <h1 className="font-display text-[26px] sm:text-3xl font-bold leading-tight tracking-tight text-forest-900 dark:text-white">
                          What is your household or family name?
                        </h1>
                        <p className="text-sm text-stone-ink dark:text-slate-400">
                          This personalizes your family library and reading passports.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        <input
                          ref={householdInputRef}
                          id="onboarding-household-name"
                          type="text"
                          autoFocus
                          value={wizard.householdNameDraft}
                          onChange={(e) =>
                            dispatch({
                              type: 'SET_FIELD',
                              field: 'householdNameDraft',
                              value: e.target.value,
                            })
                          }
                          placeholder="e.g., The Garcia Family or Casa Leo"
                          className="w-full min-h-[54px] px-4 py-3 rounded-2xl bg-ivory dark:bg-night-900 border-2 border-linen-200 focus:border-forest-700 dark:border-night-700 dark:focus:border-[#5ED3DA] text-base sm:text-lg font-medium text-forest-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-slate-500 shadow-2xs focus:outline-none transition-colors"
                        />
                        <p className="text-xs text-stone-ink dark:text-slate-400 px-1">
                          Optional · Stored privately on this device.
                        </p>
                      </div>
                    </div>

                    {/* Sticky Bottom Action Bar */}
                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-linen-50/95 dark:bg-night-950/95 lg:bg-transparent">
                      <button
                        type="submit"
                        data-action="onboarding-step1-next"
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>Continue</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 2: READERS (STREAMLINED MULTI-READER SETUP)           */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 2 && (
                  <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-3.5 text-left">
                      <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-forest-900 dark:text-white">
                          Who is reading in your home?
                        </h1>
                        <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-1">
                          Add each reader to tailor stages and weekly shelves.
                        </p>
                      </div>

                      {/* Existing Readers List (Dismissible / Editable Pills) */}
                      {state.profiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {state.profiles.map((p) => {
                            const selected = wizard.editingReaderId === p.id;
                            const tone = AVATAR_TONES[p.avatarTone || 'teal'] || AVATAR_TONES.teal;
                            const age = getEffectiveProfileAge(p);
                            return (
                              <div
                                key={p.id}
                                className={`inline-flex items-center rounded-2xl border transition-all ${
                                  selected
                                    ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA]'
                                    : 'bg-ivory dark:bg-night-900 border-linen-200 dark:border-night-800 text-forest-900 dark:text-white'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSelectReaderForEdit(p.id)}
                                  className="min-h-[42px] pl-2.5 pr-1.5 py-1.5 flex items-center gap-2 text-left cursor-pointer"
                                >
                                  <span
                                    className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${tone}`}
                                  >
                                    {p.name.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span className="text-xs font-bold leading-tight">
                                    {p.name}
                                    <span className="font-normal opacity-75">
                                      {' '}
                                      · {age >= 18 ? 'Adult' : `${age}y`}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveReader(p.id)}
                                  aria-label={`Remove ${p.name}`}
                                  className="min-h-[42px] min-w-[36px] pr-2 flex items-center justify-center opacity-70 hover:opacity-100 cursor-pointer"
                                >
                                  <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Quick-Add Reader Card */}
                      <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-3.5 sm:p-5 space-y-3 shadow-2xs">
                        {wizard.step2Error && (
                          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                            {wizard.step2Error}
                          </p>
                        )}

                        <div className="grid grid-cols-12 gap-2.5">
                          <div className="col-span-8">
                            <label
                              htmlFor="onboarding-reader-name"
                              className="block text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1"
                            >
                              Reader Name
                            </label>
                            <input
                              ref={readerNameInputRef}
                              id="onboarding-reader-name"
                              type="text"
                              value={wizard.readerName}
                              onChange={(e) =>
                                dispatch({
                                  type: 'SET_FIELD',
                                  field: 'readerName',
                                  value: e.target.value,
                                })
                              }
                              placeholder="e.g., Maya, Leo, or Sofia"
                              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm text-forest-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-forest-700"
                            />
                          </div>

                          <div className="col-span-4">
                            <label
                              htmlFor="onboarding-reader-age"
                              className="block text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1"
                            >
                              Age (yrs)
                            </label>
                            <input
                              id="onboarding-reader-age"
                              type="number"
                              min={0}
                              max={120}
                              value={wizard.readerAge}
                              onChange={(e) => {
                                const parsed = Math.max(0, Math.min(120, Number(e.target.value) || 0));
                                dispatch({
                                  type: 'PATCH',
                                  patch: {
                                    readerAge: parsed,
                                    readerGroupId: matchAgeGroupId(parsed),
                                    readerStage: inferWizardReadingStage(parsed),
                                  },
                                });
                              }}
                              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                            />
                          </div>
                        </div>

                        {/* Quick Age Group Selector Pills */}
                        <div>
                          <span className="block text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1.5">
                            Age Group
                          </span>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                            {AGE_GROUPS.map((grp) => {
                              const active = wizard.readerGroupId === grp.id;
                              return (
                                <button
                                  key={grp.id}
                                  type="button"
                                  onClick={() =>
                                    dispatch({
                                      type: 'PATCH',
                                      patch: {
                                        readerGroupId: grp.id,
                                        readerAge: grp.ageYears,
                                        readerStage: grp.stage,
                                      },
                                    })
                                  }
                                  className={`min-h-[44px] sm:min-h-[40px] px-2 rounded-xl border text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                                    active
                                      ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA]'
                                      : 'bg-linen-50 dark:bg-night-800 border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 hover:border-forest-700/50'
                                  }`}
                                >
                                  {grp.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Editable Reading Stage + Explicit Add Reader Button */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-0.5">
                          <div className="sm:col-span-7">
                            <label
                              htmlFor="onboarding-reader-stage"
                              className="block text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1"
                            >
                              Reading Stage (Auto-matched)
                            </label>
                            <select
                              id="onboarding-reader-stage"
                              value={wizard.readerStage}
                              onChange={(e) =>
                                dispatch({
                                  type: 'SET_FIELD',
                                  field: 'readerStage',
                                  value: e.target.value as ReadingStage,
                                })
                              }
                              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
                            >
                              <option value="board-toddler">Board Books (0–2 yrs)</option>
                              <option value="picture-book">Picture Books (3–5 yrs)</option>
                              <option value="early-reader">Early Reader (6–8 yrs)</option>
                              <option value="chapter-book">Chapter Books (7–10 yrs)</option>
                              <option value="middle-grade">Middle Grade (9–12 yrs)</option>
                              <option value="teen-ya">Independent / Teen (13–17)</option>
                              <option value="adult">Adult Reader (18+)</option>
                            </select>
                          </div>

                          <div className="sm:col-span-5">
                            <button
                              type="button"
                              data-action="onboarding-add-reader"
                              onClick={() => handleSaveReader(true)}
                              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 active:scale-[0.98] dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                            >
                              <Icon name="plus" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
                              <span>{wizard.editingReaderId ? 'Update Reader' : 'Add Reader'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sticky Bottom Action Bar */}
                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-linen-50/95 dark:bg-night-950/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-step2-next"
                        onClick={handleStep2Continue}
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>Continue</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 3: FAVOURITE TOPICS (ZERO-SCROLL CHIP GRID)           */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 3 && (
                  <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-5 pb-2 lg:p-0 space-y-4 text-left">
                      <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-forest-900 dark:text-white">
                          What topics spark curiosity in your home?
                        </h1>
                        <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-1">
                          Pick favorite themes to guide your rotations ({wizard.selectedTopics.length}{' '}
                          selected).
                        </p>
                      </div>

                      {/* Zero-Scroll Multi-Select Chip Grid */}
                      <div className="flex flex-wrap gap-2">
                        {ONBOARDING_TOPICS.map((topic) => {
                          const selected = wizard.selectedTopics.includes(topic.id);
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleToggleTopic(topic.id)}
                              className={`min-h-[44px] px-3.5 py-2 rounded-full border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                                selected
                                  ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA] shadow-2xs'
                                  : 'bg-ivory dark:bg-night-900 border-linen-200 dark:border-night-800 text-forest-900 dark:text-slate-200 hover:border-forest-700/50'
                              }`}
                            >
                              <span aria-hidden="true" className="text-sm leading-none">
                                {topic.emoji}
                              </span>
                              <span>{topic.label}</span>
                              {selected && <Icon name="check" className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sticky Bottom Action Bar */}
                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-linen-50/95 dark:bg-night-950/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-step3-next"
                        onClick={handleStep3Continue}
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>Continue</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 4: PREFERRED BOOK TYPES (ZERO-SCROLL 2-COL GRID)      */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 4 && (
                  <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-4 text-left">
                      <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-forest-900 dark:text-white">
                          Which book formats do you want in your rotations?
                        </h1>
                        <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-1">
                          Select the formats your family enjoys most.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {BOOK_TYPE_OPTIONS.map((opt) => {
                          const selected = wizard.selectedBookTypes.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleToggleBookType(opt.id)}
                              className={`${opt.fullWidth ? 'col-span-2' : ''} min-h-[56px] p-3 rounded-2xl border text-left flex items-center justify-between gap-2 transition-all active:scale-[0.98] cursor-pointer ${
                                selected
                                  ? 'bg-forest-900 text-white border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA] shadow-2xs'
                                  : 'bg-ivory dark:bg-night-900 border-linen-200 dark:border-night-800 text-forest-900 dark:text-white hover:border-forest-700/50'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-bold leading-tight">
                                  {opt.label}
                                </p>
                                <p
                                  className={`text-[11px] leading-tight mt-0.5 truncate ${
                                    selected
                                      ? 'text-white/80 dark:text-night-950/75'
                                      : 'text-stone-ink dark:text-slate-400'
                                  }`}
                                >
                                  {opt.hint}
                                </p>
                              </div>
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                                  selected
                                    ? 'bg-white text-forest-900 border-white dark:bg-night-950 dark:text-[#5ED3DA] dark:border-night-950'
                                    : 'border-linen-200 dark:border-night-700'
                                }`}
                              >
                                {selected && <Icon name="check" className="w-3 h-3" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sticky Bottom Action Bar */}
                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-linen-50/95 dark:bg-night-950/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-step4-next"
                        onClick={handleStep4Continue}
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>Continue</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 5: BUILD YOUR INITIAL SHELF                           */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 5 && (
                  <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-4 text-left">
                      <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-forest-900 dark:text-white">
                          Add your first few books to kick off your library.
                        </h1>
                        <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-1">
                          Scan a back-cover barcode, search titles, or start with classics.
                        </p>
                      </div>

                      <OnboardingLibraryStep
                        primaryProfileId={state.profiles[0]?.id || activeProfile?.id}
                      />
                    </div>

                    {/* Sticky Bottom Action Bar */}
                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-linen-50/95 dark:bg-night-950/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-finish-library"
                        disabled={wizard.finishing}
                        onClick={handleFinishAndOpenLibrary}
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-forest-900 hover:bg-forest-800 active:scale-[0.98] disabled:opacity-60 dark:bg-[#5ED3DA] dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>
                          {wizard.finishing ? 'Opening Library…' : 'Finish & Open Library'}
                        </span>
                        <Icon name="arrowRight" className="w-4 h-4" />
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
