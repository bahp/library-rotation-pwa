import React, { useEffect, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { OnboardingLibraryStep } from './OnboardingLibraryStep.js';
import {
  AVATAR_TONES,
  AVATAR_TONE_PILL_STYLES,
  AVATAR_TONE_BORDER_STYLES,
  PROFILE_AVATAR_TONE_OPTIONS,
} from '../../config/index.js';
import {
  getEffectiveProfileAge,
  type BookFormat,
  type ReadingStage,
} from '../../types/models.js';
import sidebarReadingArt from '../../assets/images/sidebar_reading_artwork_1794694074246.jpg';

const READER_TOPIC_OPTIONS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'bedtime', label: 'Bedtime', icon: 'moon' },
  { id: 'animals', label: 'Animals', icon: 'paw' },
  { id: 'dinosaurs', label: 'Dinosaurs', icon: 'footprints' },
  { id: 'vehicles', label: 'Vehicles', icon: 'truck' },
  { id: 'space', label: 'Space', icon: 'rocket' },
  { id: 'nature', label: 'Nature', icon: 'leaf' },
  { id: 'stem', label: 'STEM', icon: 'flask' },
  { id: 'adventure', label: 'Adventure', icon: 'compass' },
  { id: 'feelings', label: 'Feelings', icon: 'heart' },
  { id: 'humor', label: 'Humor', icon: 'smile' },
  { id: 'friendship', label: 'Friendship', icon: 'profiles' },
  { id: 'fairy-tales', label: 'Fairy Tales', icon: 'castle' },
];

const TOPIC_LABEL_MAP: Record<string, { label: string; icon: string }> = Object.fromEntries(
  READER_TOPIC_OPTIONS.map((item) => [item.id, { label: item.label, icon: item.icon }])
);

function formatTopicLabel(topicId: string): string {
  if (TOPIC_LABEL_MAP[topicId]) return TOPIC_LABEL_MAP[topicId].label;
  return topicId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
  icon: string;
  fullWidth?: boolean;
}> = [
  { id: 'picture-books', label: 'Picture Books', hint: 'Illustrated read-alouds', icon: 'image' },
  { id: 'board-books', label: 'Board Books', hint: 'Sturdy toddler pages', icon: 'book' },
  { id: 'early-readers', label: 'Early Readers', hint: 'First solo reading', icon: 'bookOpen' },
  {
    id: 'illustrated-non-fiction',
    label: 'Illustrated Non-Fiction',
    hint: 'Facts & visual discovery',
    icon: 'compass',
  },
  { id: 'chapter-books', label: 'Chapter Books', hint: 'Longer nightly stories', icon: 'layers' },
  { id: 'graphic-novels', label: 'Graphic Novels', hint: 'Comics & visual panels', icon: 'grid' },
  {
    id: 'bilingual',
    label: 'Bilingual / Foreign Language',
    hint: 'Dual-language & heritage shelves',
    icon: 'globe',
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
  activeTopicsReaderId: string;
  customTopicDraft: string;
  customTopicsByReaderId: Record<string, string[]>;
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
    readerTone:
      PROFILE_AVATAR_TONE_OPTIONS[state.profiles.length % PROFILE_AVATAR_TONE_OPTIONS.length]?.id ||
      'teal',
    step2Error: '',
    activeTopicsReaderId: state.profiles[0]?.id || '',
    customTopicDraft: '',
    customTopicsByReaderId: {},
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
    if (state.profiles.length > 0 && !state.profiles.some((p) => p.id === wizard.activeTopicsReaderId)) {
      dispatch({
        type: 'SET_FIELD',
        field: 'activeTopicsReaderId',
        value: state.profiles[0].id,
      });
    } else if (state.profiles.length === 0 && wizard.activeTopicsReaderId !== '') {
      dispatch({
        type: 'SET_FIELD',
        field: 'activeTopicsReaderId',
        value: '',
      });
    }
  }, [state.profiles, wizard.activeTopicsReaderId]);

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
      const created = await store.addProfile({
        name,
        birthDate,
        age: wizard.readerAge,
        readingStage: wizard.readerStage,
        avatarTone: wizard.readerTone,
        favoriteTopics: ['bedtime', 'animals'],
        defaultRotationSize: wizard.readerAge <= 3 ? 4 : 5,
        cooldownDays: 14,
      });
      if (!wizard.activeTopicsReaderId && created?.id) {
        dispatch({ type: 'SET_FIELD', field: 'activeTopicsReaderId', value: created.id });
      }
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

  // Step 3: Favourite Topics (Per Reader)
  const topicsTargetProfile =
    state.profiles.find((p) => p.id === wizard.activeTopicsReaderId) || state.profiles[0] || null;

  const handleToggleReaderTopic = async (topicId: string) => {
    if (!topicsTargetProfile) return;
    const current = topicsTargetProfile.favoriteTopics || [];
    const next = current.includes(topicId)
      ? current.filter((id) => id !== topicId)
      : [...current, topicId];
    await store.updateProfile(topicsTargetProfile.id, { favoriteTopics: next });
  };

  const handleAddCustomReaderTopic = async () => {
    if (!topicsTargetProfile) return;
    const rawClean = wizard.customTopicDraft.trim().toLowerCase().replace(/^#+/, '');
    if (!rawClean) return;

    const matchedDefault = READER_TOPIC_OPTIONS.find(
      (opt) => opt.id === rawClean || opt.label.toLowerCase() === rawClean
    );
    const topicId = matchedDefault ? matchedDefault.id : rawClean.replace(/\s+/g, '-');

    if (!matchedDefault) {
      const existingPool = wizard.customTopicsByReaderId[topicsTargetProfile.id] || [];
      if (!existingPool.includes(topicId)) {
        dispatch({
          type: 'SET_FIELD',
          field: 'customTopicsByReaderId',
          value: {
            ...wizard.customTopicsByReaderId,
            [topicsTargetProfile.id]: [...existingPool, topicId],
          },
        });
      }
    }

    const current = topicsTargetProfile.favoriteTopics || [];
    if (!current.includes(topicId)) {
      await store.updateProfile(topicsTargetProfile.id, {
        favoriteTopics: [...current, topicId],
      });
    }
    dispatch({ type: 'SET_FIELD', field: 'customTopicDraft', value: '' });
  };

  const handleStep3Continue = async () => {
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
            preferredTags: primary.favoriteTopics || [],
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
    <div className="h-[100dvh] lg:h-auto lg:min-h-[100dvh] overflow-hidden lg:overflow-visible bg-landing-canvas dark:bg-night-950 text-ink dark:text-[#F4EFE6] flex flex-col justify-between">
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
        <header className="shrink-0 z-30 border-b border-landing-border dark:border-night-800 bg-landing-canvas/95 dark:bg-night-900/90 backdrop-blur-md pt-safe">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-13 sm:h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-full bg-brand dark:bg-brand-dark text-white dark:text-night-950 flex items-center justify-center shrink-0 shadow-xs">
                <Icon name="rotations" className="w-4 h-4" />
              </span>
              <span className="font-display font-bold text-base sm:text-lg text-title dark:text-white tracking-tight whitespace-nowrap truncate">
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
                    className="min-h-[38px] px-3 py-1 rounded-xl bg-brand hover:bg-brand-hover text-white dark:bg-brand-dark dark:text-night-950 text-xs font-bold whitespace-nowrap cursor-pointer"
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
                        ? 'bg-brand dark:bg-brand-dark'
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
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-hover text-white dark:bg-brand-dark dark:text-night-950 text-[11px] font-bold whitespace-nowrap cursor-pointer"
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
              {/* MOBILE (< sm): Strict 100dvh Editorial Top-Illustration Landing */}
              <div className="sm:hidden flex-1 min-h-0 flex flex-col justify-between px-4 pt-2.5 pb-3 pb-safe gap-2.5">
                <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-2.5 overflow-y-auto no-scrollbar">
                  {/* Top Editorial Reading Illustration Banner */}
                  <div className="relative h-[20vh] min-h-[124px] max-h-[168px] w-full rounded-3xl bg-hero-art-bg border border-sidebar-border/35 overflow-hidden shadow-xs shrink-0 flex items-center justify-center">
                    {!failedArtIds.hero ? (
                      <img
                        src={sidebarReadingArt}
                        alt="Open book, reading lamp, stacked books, and botanical leaves"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedArtIds((prev) => ({ ...prev, hero: true }))}
                        className="h-full w-auto max-w-full object-contain scale-[1.06]"
                      />
                    ) : (
                      <Icon name="book" className="w-12 h-12 text-brand-dark/50" />
                    )}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-hero-art-bg/45 via-transparent to-hero-art-bg/15"
                    />
                  </div>

                  {/* Centered Editorial Headline + Subtitle + Subtle Divider */}
                  <div className="text-center space-y-1.5 px-1">
                    <h1 className="font-display text-[24px] leading-[1.12] font-bold tracking-tight text-title dark:text-white text-balance">
                      Your family’s personal library, rotated weekly.
                    </h1>
                    <p className="text-[12.5px] leading-snug text-subtitle dark:text-slate-300 max-w-sm mx-auto">
                      Automatic themed book rotations, kid reading passports, and effortless ISBN
                      scanning in one calm space.
                    </p>
                    <div
                      aria-hidden="true"
                      className="w-12 h-[1.5px] bg-landing-accent-rule dark:bg-brand-dark/35 mx-auto rounded-full pt-0.5"
                    />
                  </div>

                  {/* Compact 3-Row Editorial Feature Highlights */}
                  <div className="space-y-1.5">
                    {[
                      {
                        icon: 'rotations',
                        title: 'Smart Rotations',
                        desc: 'Fresh weekly shelves from books you own',
                      },
                      {
                        icon: 'profiles',
                        title: 'Kid Reading Passports',
                        desc: 'Printable keepsakes & reading stamps',
                      },
                      {
                        icon: 'scan',
                        title: 'Instant Barcode Scan',
                        desc: 'Catalog books in seconds with your camera',
                      },
                    ].map((feat) => (
                      <div
                        key={feat.icon}
                        className="rounded-2xl bg-landing-surface dark:bg-night-900 border border-landing-border dark:border-night-800 px-3 py-2 flex items-center gap-3 shadow-2xs"
                      >
                        <span className="w-9 h-9 rounded-full bg-landing-icon-bg dark:bg-brand-dark/15 text-brand dark:text-brand-dark flex items-center justify-center shrink-0">
                          <Icon name={feat.icon} strokeWidth={1.8} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 text-left">
                          <p className="font-display text-[13px] font-bold text-title dark:text-white leading-tight">
                            {feat.title}
                          </p>
                          <p className="text-[11px] text-subtitle dark:text-slate-400 truncate mt-0.5">
                            {feat.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Immediate Pinned Pill CTAs */}
                <div className="shrink-0 space-y-2 pt-0.5">
                  <button
                    type="button"
                    data-action="onboarding-begin"
                    onClick={() => goToStep(1, 0)}
                    className="w-full min-h-[48px] px-6 py-2.5 rounded-full bg-brand hover:bg-brand-hover active:scale-[0.98] dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
                    className="w-full min-h-[44px] px-5 py-2 rounded-full bg-landing-surface hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-landing-border dark:border-night-700 text-title dark:text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Icon name="book" className="w-4 h-4 text-brand dark:text-brand-dark" />
                    <span>Explore Sample Family</span>
                  </button>
                </div>
              </div>

              {/* DESKTOP & TABLET (sm+): Editorial Top-Illustration Centered Layout */}
              <div className="hidden sm:flex flex-col justify-center max-w-5xl w-full mx-auto my-auto px-6 lg:px-8 py-6 lg:py-8 gap-6">
                {/* Top Full-Width Framed Botanical Reading Illustration */}
                <div className="relative w-full h-48 md:h-56 lg:h-64 rounded-3xl bg-hero-art-bg border border-sidebar-border/35 shadow-sm overflow-hidden flex items-center justify-center">
                  {!failedArtIds.hero ? (
                    <img
                      src={sidebarReadingArt}
                      alt="Open book, brass reading lamp, stacked books, and botanical leaves"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedArtIds((prev) => ({ ...prev, hero: true }))}
                      className="h-full w-auto max-w-full object-contain scale-[1.04]"
                    />
                  ) : (
                    <Icon name="book" className="w-16 h-16 text-brand-dark/50" />
                  )}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-r from-hero-art-bg via-transparent to-hero-art-bg opacity-70"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-hero-art-bg/45 via-transparent to-hero-art-bg/20"
                  />
                </div>

                {/* Centered Display Title + Subtitle */}
                <div className="text-center space-y-2.5 max-w-2xl mx-auto">
                  <h1 className="font-display text-3xl md:text-4xl lg:text-[42px] font-bold text-title dark:text-white leading-[1.1] tracking-tight text-balance">
                    Your family’s personal library, rotated weekly.
                  </h1>
                  <p className="text-sm sm:text-base text-subtitle dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
                    Automatic themed book rotations, kid reading passports, and effortless ISBN
                    scanning in one calm space.
                  </p>
                  <div
                    aria-hidden="true"
                    className="w-14 h-[1.5px] bg-landing-accent-rule dark:bg-brand-dark/35 mx-auto rounded-full pt-0.5"
                  />
                </div>

                {/* 3 Feature Highlight Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {[
                    {
                      icon: 'rotations',
                      title: 'Smart Rotations',
                      desc: 'Fresh weekly shelves from books you own',
                    },
                    {
                      icon: 'profiles',
                      title: 'Kid Reading Passports',
                      desc: 'Printable keepsakes & reading stamps',
                    },
                    {
                      icon: 'scan',
                      title: 'Instant Barcode Scan',
                      desc: 'Catalog books in seconds with your camera',
                    },
                  ].map((feat) => (
                    <div
                      key={feat.icon}
                      className="rounded-2xl bg-landing-surface dark:bg-night-900 border border-landing-border dark:border-night-800 px-4 py-3.5 flex items-center gap-3.5 shadow-2xs"
                    >
                      <span className="w-10 h-10 rounded-full bg-landing-icon-bg dark:bg-brand-dark/15 text-brand dark:text-brand-dark flex items-center justify-center shrink-0">
                        <Icon name={feat.icon} strokeWidth={1.8} className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 text-left">
                        <h2 className="font-display text-sm font-bold text-title dark:text-white leading-tight">
                          {feat.title}
                        </h2>
                        <p className="text-xs text-subtitle dark:text-slate-400 leading-snug mt-0.5">
                          {feat.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Centered Primary + Secondary Pill CTAs */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    data-action="onboarding-begin-desktop"
                    onClick={() => goToStep(1, 0)}
                    className="min-h-[48px] px-7 py-3 rounded-full bg-brand hover:bg-brand-hover active:scale-[0.98] dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
                    className="min-h-[48px] px-6 py-3 rounded-full bg-landing-surface hover:bg-linen-100 active:scale-[0.98] dark:bg-night-900 dark:hover:bg-night-800 border border-landing-border dark:border-night-700 text-title dark:text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                  >
                    <Icon name="book" className="w-4 h-4 text-brand dark:text-brand-dark" />
                    <span>Explore Sample Family</span>
                  </button>
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
                                ? 'bg-brand text-white dark:bg-brand-dark dark:text-night-950'
                                : isDone
                                  ? 'bg-linen-100/80 dark:bg-night-800 text-title dark:text-white'
                                  : 'text-subtitle dark:text-slate-400 hover:bg-linen-100/50 dark:hover:bg-night-800/50'
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
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-brand hover:bg-brand-hover active:scale-[0.98] dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
                                className={`inline-flex items-center rounded-2xl transition-all ${
                                  selected
                                    ? `${AVATAR_TONE_BORDER_STYLES[p.avatarTone || 'teal'] || AVATAR_TONE_BORDER_STYLES.teal}`
                                    : 'bg-landing-surface dark:bg-night-900 border border-landing-border dark:border-night-800 text-title dark:text-white'
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
                                      ? 'bg-brand text-white border-brand dark:bg-brand-dark dark:text-night-950 dark:border-brand-dark'
                                      : 'bg-linen-50 dark:bg-night-800 border-linen-200 dark:border-night-700 text-title dark:text-slate-200 hover:border-brand/50'
                                  }`}
                                >
                                  {grp.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Avatar Color Swatch Picker */}
                        <div className="flex items-center justify-between gap-3 pt-0.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 shrink-0">
                            Avatar Color
                          </span>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {PROFILE_AVATAR_TONE_OPTIONS.map((opt) => {
                              const isSelected = wizard.readerTone === opt.id;
                              const toneStyle = AVATAR_TONES[opt.id] || AVATAR_TONES.teal;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    dispatch({
                                      type: 'SET_FIELD',
                                      field: 'readerTone',
                                      value: opt.id,
                                    })
                                  }
                                  aria-label={`Select ${opt.label} avatar color`}
                                  aria-pressed={isSelected}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${toneStyle} ${
                                    isSelected
                                      ? 'ring-2 ring-offset-2 ring-forest-900 dark:ring-[#5ED3DA] dark:ring-offset-night-900 scale-110'
                                      : 'opacity-75 hover:opacity-100'
                                  }`}
                                >
                                  {isSelected ? (
                                    <Icon name="check" className="w-3.5 h-3.5 text-white" />
                                  ) : (
                                    <span className="text-[10px] font-bold text-white/90">
                                      {(wizard.readerName.trim() || 'R').slice(0, 1).toUpperCase()}
                                    </span>
                                  )}
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
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-brand hover:bg-brand-hover active:scale-[0.98] dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>Continue</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 3: PER-READER FAVOURITE TOPICS (UNICOLOR ICONS)       */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 3 && (() => {
                  const selectedTopics = topicsTargetProfile?.favoriteTopics || [];
                  const knownIds = new Set(READER_TOPIC_OPTIONS.map((o) => o.id));
                  const rememberedCustom =
                    (topicsTargetProfile?.id
                      ? wizard.customTopicsByReaderId[topicsTargetProfile.id]
                      : undefined) || [];
                  const extraTopics = Array.from(
                    new Set([
                      ...rememberedCustom,
                      ...selectedTopics.filter((id) => !knownIds.has(id)),
                    ])
                  );
                  const activeToneKey = topicsTargetProfile?.avatarTone || 'teal';
                  const activeTopicPillClass =
                    AVATAR_TONE_PILL_STYLES[activeToneKey] || AVATAR_TONE_PILL_STYLES.teal;

                  return (
                    <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-3.5 text-left">
                        <div>
                          <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-title dark:text-white">
                            {topicsTargetProfile
                              ? `What topics does ${topicsTargetProfile.name} love?`
                              : 'What topics spark curiosity?'}
                          </h1>
                          <p className="text-xs sm:text-sm text-subtitle dark:text-slate-400 mt-1">
                            Topics are saved individually per reader ({selectedTopics.length} selected).
                          </p>
                        </div>

                        {state.profiles.length > 0 ? (
                          <>
                            {/* Per-Reader Selector Strip */}
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                              {state.profiles.map((p) => {
                                const isCurrent = topicsTargetProfile?.id === p.id;
                                const toneKey = p.avatarTone || 'teal';
                                const tone = AVATAR_TONES[toneKey] || AVATAR_TONES.teal;
                                const readerSelectedStyle =
                                  AVATAR_TONE_BORDER_STYLES[toneKey] || AVATAR_TONE_BORDER_STYLES.teal;
                                const count = (p.favoriteTopics || []).length;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() =>
                                      dispatch({
                                        type: 'SET_FIELD',
                                        field: 'activeTopicsReaderId',
                                        value: p.id,
                                      })
                                    }
                                    className={`min-h-[40px] pl-2 pr-3 py-1.5 rounded-full inline-flex items-center gap-2 shrink-0 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                                      isCurrent
                                        ? readerSelectedStyle
                                        : 'bg-landing-surface/85 dark:bg-night-900 border border-landing-border dark:border-night-800 text-title dark:text-slate-200 hover:border-brand/50'
                                    }`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${tone}`}
                                    >
                                      {p.name.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span>{p.name}</span>
                                    <span className="font-mono-tabular text-[11px] opacity-80">
                                      {count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Zero-Scroll Per-Reader Topic Chip Grid (Same Default Set + Manual Topics, Colored by Profile) */}
                            <div className="flex flex-wrap gap-2">
                              {READER_TOPIC_OPTIONS.map((topic) => {
                                const selected = selectedTopics.includes(topic.id);
                                return (
                                  <button
                                    key={topic.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => handleToggleReaderTopic(topic.id)}
                                    className={`min-h-[42px] px-3.5 py-2 rounded-full border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                                      selected
                                        ? activeTopicPillClass
                                        : 'bg-ivory dark:bg-night-900 border-linen-200 dark:border-night-800 text-ink dark:text-slate-200 hover:border-brand/50'
                                    }`}
                                  >
                                    <Icon
                                      name={topic.icon}
                                      strokeWidth={1.75}
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        selected ? 'text-current' : 'text-brand dark:text-brand-dark'
                                      }`}
                                    />
                                    <span>{topic.label}</span>
                                    {selected && <Icon name="check" className="w-3.5 h-3.5 shrink-0" />}
                                  </button>
                                );
                              })}

                              {extraTopics.map((topicId) => {
                                const selected = selectedTopics.includes(topicId);
                                return (
                                  <button
                                    key={topicId}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => handleToggleReaderTopic(topicId)}
                                    className={`min-h-[42px] px-3.5 py-2 rounded-full border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                                      selected
                                        ? activeTopicPillClass
                                        : 'bg-ivory dark:bg-night-900 border-linen-200 dark:border-night-800 text-ink dark:text-slate-200 hover:border-brand/50'
                                    }`}
                                  >
                                    <Icon
                                      name="tag"
                                      strokeWidth={1.75}
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        selected ? 'text-current' : 'text-brand dark:text-brand-dark'
                                      }`}
                                    />
                                    <span>{formatTopicLabel(topicId)}</span>
                                    {selected && <Icon name="check" className="w-3.5 h-3.5 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Compact Custom Topic Input */}
                            <div className="flex items-center gap-2 pt-0.5">
                              <input
                                type="text"
                                value={wizard.customTopicDraft}
                                onChange={(e) =>
                                  dispatch({
                                    type: 'SET_FIELD',
                                    field: 'customTopicDraft',
                                    value: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddCustomReaderTopic();
                                  }
                                }}
                                placeholder={`Add custom topic for ${topicsTargetProfile?.name || 'reader'}…`}
                                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 text-xs sm:text-sm text-ink dark:text-white placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-brand"
                              />
                              <button
                                type="button"
                                onClick={handleAddCustomReaderTopic}
                                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-xs font-bold text-title dark:text-white cursor-pointer transition-colors"
                              >
                                Add
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 space-y-2.5">
                            <p className="text-xs text-subtitle dark:text-slate-300">
                              Add a reader first so favorite topics can be saved to their profile.
                            </p>
                            <button
                              type="button"
                              onClick={() => goToStep(2)}
                              className="min-h-[42px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 text-xs font-bold text-title dark:text-white cursor-pointer"
                            >
                              Go to Readers
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Sticky Bottom Action Bar */}
                      <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-linen-50/95 dark:bg-night-950/95 lg:bg-transparent">
                        <button
                          type="button"
                          data-action="onboarding-step3-next"
                          onClick={handleStep3Continue}
                          className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-brand hover:bg-brand-hover active:scale-[0.98] dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                        >
                          <span>Continue</span>
                          <Icon name="chevronRight" className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })()}

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
                                  ? 'bg-brand text-white border-brand dark:bg-brand-dark dark:text-night-950 dark:border-brand-dark shadow-2xs'
                                  : 'bg-ivory dark:bg-night-900 border-linen-200 dark:border-night-800 text-title dark:text-white hover:border-brand/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                    selected
                                      ? 'bg-white/15 text-white dark:bg-night-950/15 dark:text-night-950'
                                      : 'bg-linen-100 dark:bg-night-800 text-brand dark:text-brand-dark'
                                  }`}
                                >
                                  <Icon name={opt.icon} strokeWidth={1.75} className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs sm:text-sm font-bold leading-tight">
                                    {opt.label}
                                  </p>
                                  <p
                                    className={`text-[11px] leading-tight mt-0.5 truncate ${
                                      selected
                                        ? 'text-white/85 dark:text-night-950/75'
                                        : 'text-subtitle dark:text-slate-400'
                                    }`}
                                  >
                                    {opt.hint}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                                  selected
                                    ? 'bg-white text-brand border-white dark:bg-night-950 dark:text-brand-dark dark:border-night-950'
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
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-brand hover:bg-brand-hover active:scale-[0.98] dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
                        className="w-full lg:w-auto min-h-[50px] px-7 py-3 rounded-2xl bg-brand hover:bg-brand-hover active:scale-[0.98] disabled:opacity-60 dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-white font-bold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
