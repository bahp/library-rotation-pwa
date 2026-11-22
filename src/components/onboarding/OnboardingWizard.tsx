import React, { useEffect, useReducer, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { ToggleSwitch } from '../common/ToggleSwitch.js';
import { OnboardingLibraryStep } from './OnboardingLibraryStep.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { resolvePublicAssetUrl } from '../../ui/preset-artwork.js';
import {
  AVATAR_TONES,
  AVATAR_TONE_BORDER_STYLES,
  ONBOARDING_INTRO_SLIDES,
  ONBOARDING_LANDING_DEFAULT_MODE,
  PROFILE_AVATAR_TONE_OPTIONS,
  SUPPORTED_LANGUAGES,
  THEME_PRESETS,
  LIGHT_THEME_PRESET_IDS,
  DARK_THEME_PRESET_IDS,
  normalizeLanguage,
  resolveEffectiveThemeConfig,
} from '../../config/index.js';
import type { AppLanguage } from '../../config/i18n.js';
import {
  computeAgeFromBirthDate,
  formatReadingStage,
  getEffectiveProfileAge,
  inferReadingStageFromAge,
  type BookCardSize,
  type BookDetailStyle,
  type BookFormat,
  type BookViewMode,
  type OnboardingLandingMode,
  type ReadingStage,
  type ThemePresetId,
} from '../../types/models.js';

const READER_TOPIC_OPTIONS: Array<{
  id: string;
  label: string;
  labelKey: string;
  icon: string;
}> = [
  { id: 'bedtime', label: 'Bedtime', labelKey: 'onboarding.topicBedtime', icon: 'moon' },
  { id: 'animals', label: 'Animals', labelKey: 'onboarding.topicAnimals', icon: 'paw' },
  { id: 'dinosaurs', label: 'Dinosaurs', labelKey: 'onboarding.topicDinosaurs', icon: 'footprints' },
  { id: 'vehicles', label: 'Vehicles', labelKey: 'onboarding.topicVehicles', icon: 'truck' },
  { id: 'space', label: 'Space', labelKey: 'onboarding.topicSpace', icon: 'rocket' },
  { id: 'nature', label: 'Nature', labelKey: 'onboarding.topicNature', icon: 'leaf' },
  { id: 'stem', label: 'STEM', labelKey: 'onboarding.topicStem', icon: 'flask' },
  { id: 'adventure', label: 'Adventure', labelKey: 'onboarding.topicAdventure', icon: 'compass' },
  { id: 'feelings', label: 'Feelings', labelKey: 'onboarding.topicFeelings', icon: 'heart' },
  { id: 'humor', label: 'Humor', labelKey: 'onboarding.topicHumor', icon: 'smile' },
  { id: 'friendship', label: 'Friendship', labelKey: 'onboarding.topicFriendship', icon: 'profiles' },
  { id: 'fairy-tales', label: 'Fairy Tales', labelKey: 'onboarding.topicFairyTales', icon: 'castle' },
];

const TOPIC_LABEL_MAP: Record<string, { label: string; labelKey: string; icon: string }> =
  Object.fromEntries(
    READER_TOPIC_OPTIONS.map((item) => [
      item.id,
      { label: item.label, labelKey: item.labelKey, icon: item.icon },
    ])
  );

function formatTopicLabel(topicId: string, t?: (key: string) => string): string {
  const mapped = TOPIC_LABEL_MAP[topicId];
  if (mapped) {
    return t ? t(mapped.labelKey) : mapped.label;
  }
  return topicId
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const BOOK_TYPE_OPTIONS: Array<{
  id: string;
  labelKey: string;
  hintKey: string;
  icon: string;
  fullWidth?: boolean;
}> = [
  {
    id: 'picture-books',
    labelKey: 'onboarding.bookTypePictureBooks',
    hintKey: 'onboarding.bookTypePictureBooksHint',
    icon: 'image',
  },
  {
    id: 'board-books',
    labelKey: 'onboarding.bookTypeBoardBooks',
    hintKey: 'onboarding.bookTypeBoardBooksHint',
    icon: 'book',
  },
  {
    id: 'early-readers',
    labelKey: 'onboarding.bookTypeEarlyReaders',
    hintKey: 'onboarding.bookTypeEarlyReadersHint',
    icon: 'bookOpen',
  },
  {
    id: 'illustrated-non-fiction',
    labelKey: 'onboarding.bookTypeNonFiction',
    hintKey: 'onboarding.bookTypeNonFictionHint',
    icon: 'compass',
  },
  {
    id: 'chapter-books',
    labelKey: 'onboarding.bookTypeChapterBooks',
    hintKey: 'onboarding.bookTypeChapterBooksHint',
    icon: 'layers',
  },
  {
    id: 'graphic-novels',
    labelKey: 'onboarding.bookTypeGraphicNovels',
    hintKey: 'onboarding.bookTypeGraphicNovelsHint',
    icon: 'grid',
  },
  {
    id: 'bilingual',
    labelKey: 'onboarding.bookTypeBilingual',
    hintKey: 'onboarding.bookTypeBilingualHint',
    icon: 'globe',
    fullWidth: true,
  },
];

const STEP_META = [
  { step: 1, labelKey: 'onboarding.stepNames.household' },
  { step: 2, labelKey: 'onboarding.stepNames.readers' },
  { step: 3, labelKey: 'onboarding.stepNames.interests' },
  { step: 4, labelKey: 'onboarding.stepNames.bookTypes' },
  { step: 5, labelKey: 'onboarding.stepNames.library' },
  { step: 6, labelKey: 'onboarding.stepNames.ready' },
];

const TOTAL_SETUP_STEPS = STEP_META.length;

function computeBirthDateForAgeYears(years: number): string {
  const clamped = Math.max(0, Math.min(120, Math.trunc(years)));
  const d = new Date();
  d.setFullYear(d.getFullYear() - clamped);
  return d.toISOString().slice(0, 10);
}

interface WizardState {
  direction: 1 | -1;
  slideIndex: number;
  householdNameDraft: string;
  isReaderSheetOpen: boolean;
  editingReaderId: string | null;
  readerName: string;
  readerBirthDate: string;
  readerStage: ReadingStage;
  readerTone: string;
  step2Error: string;
  sheetError: string;
  savingReader: boolean;
  activeTopicsReaderId: string;
  customTopicDraft: string;
  customTopicsByReaderId: Record<string, string[]>;
  step3Error: string;
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

  const currentStep = Math.max(
    0,
    Math.min(TOTAL_SETUP_STEPS, state.settings.onboarding?.currentStep ?? 0)
  );
  const landingMode: OnboardingLandingMode =
    state.settings.onboardingLandingMode || ONBOARDING_LANDING_DEFAULT_MODE;
  const currentLanguage = normalizeLanguage(state.settings.language);
  const currentLanguageMeta =
    SUPPORTED_LANGUAGES.find((item) => item.code === currentLanguage) || SUPPORTED_LANGUAGES[0];

  const handleLanguageChange = async (lang: AppLanguage) => {
    await store.updateSettings({ language: normalizeLanguage(lang) });
  };

  const householdInputRef = useRef<HTMLInputElement>(null);
  const readerNameInputRef = useRef<HTMLInputElement>(null);
  const slideTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  const initialBookTypes =
    state.settings.preferredBookTypes && state.settings.preferredBookTypes.length > 0
      ? state.settings.preferredBookTypes
      : ['picture-books', 'board-books'];

  const [wizard, dispatch] = useReducer(wizardReducer, undefined, (): WizardState => ({
    direction: 1,
    slideIndex: 0,
    householdNameDraft: state.settings.householdName || '',
    isReaderSheetOpen: false,
    editingReaderId: null,
    readerName: '',
    readerBirthDate: computeBirthDateForAgeYears(4),
    readerStage: 'picture-book',
    readerTone:
      PROFILE_AVATAR_TONE_OPTIONS[state.profiles.length % PROFILE_AVATAR_TONE_OPTIONS.length]?.id ||
      'teal',
    step2Error: '',
    sheetError: '',
    savingReader: false,
    activeTopicsReaderId: state.profiles[0]?.id || '',
    customTopicDraft: '',
    customTopicsByReaderId: {},
    step3Error: '',
    selectedBookTypes: initialBookTypes,
    finishing: false,
    confirmSkipOpen: false,
  }));

  useBodyScrollLock(wizard.isReaderSheetOpen);

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

  useEffect(() => {
    if (wizard.isReaderSheetOpen) {
      const timer = window.setTimeout(() => {
        readerNameInputRef.current?.focus();
      }, 90);
      return () => window.clearTimeout(timer);
    }
  }, [wizard.isReaderSheetOpen]);

  const goToStep = async (nextStep: number, markCompletedStep?: number, markSkippedStep?: number) => {
    const clampedNext = Math.max(0, Math.min(TOTAL_SETUP_STEPS, nextStep));
    dispatch({
      type: 'PATCH',
      patch: {
        direction: clampedNext >= currentStep ? 1 : -1,
        confirmSkipOpen: false,
        step2Error: '',
        step3Error: '',
      },
    });
    const prev = state.settings.onboarding;
    const completed = new Set(prev?.completedSteps || []);
    const skipped = new Set(prev?.skippedSteps || []);
    if (typeof markCompletedStep === 'number') completed.add(markCompletedStep);
    if (typeof markSkippedStep === 'number') skipped.add(markSkippedStep);

    await store.updateOnboarding({
      status: 'in_progress',
      currentStep: clampedNext,
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

  // Step 2: Readers (Bottom Sheet)
  const pickNextTone = (count: number) => {
    const keys = PROFILE_AVATAR_TONE_OPTIONS.map((opt) => opt.id);
    return keys[count % keys.length] || 'teal';
  };

  const openAddReaderSheet = () => {
    dispatch({
      type: 'PATCH',
      patch: {
        isReaderSheetOpen: true,
        editingReaderId: null,
        readerName: '',
        readerBirthDate: computeBirthDateForAgeYears(4),
        readerStage: 'picture-book',
        readerTone: pickNextTone(state.profiles.length),
        sheetError: '',
        savingReader: false,
        step2Error: '',
      },
    });
  };

  const openEditReaderSheet = (profileId: string) => {
    const p = state.profiles.find((item) => item.id === profileId);
    if (!p) return;
    const age = getEffectiveProfileAge(p);
    dispatch({
      type: 'PATCH',
      patch: {
        isReaderSheetOpen: true,
        editingReaderId: p.id,
        readerName: p.name,
        readerBirthDate: p.birthDate || computeBirthDateForAgeYears(age),
        readerStage: p.readingStage,
        readerTone: p.avatarTone || 'teal',
        sheetError: '',
        savingReader: false,
        step2Error: '',
      },
    });
  };

  const closeReaderSheet = () => {
    dispatch({
      type: 'PATCH',
      patch: {
        isReaderSheetOpen: false,
        editingReaderId: null,
        sheetError: '',
        savingReader: false,
      },
    });
  };

  const handleSaveReaderFromSheet = async (e?: React.FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    if (wizard.savingReader) return false;
    dispatch({ type: 'SET_FIELD', field: 'sheetError', value: '' });
    const name = wizard.readerName.trim();
    if (!name) {
      dispatch({
        type: 'SET_FIELD',
        field: 'sheetError',
        value: t('onboarding.enterReaderNameError'),
      });
      readerNameInputRef.current?.focus();
      return false;
    }

    const birthDate = wizard.readerBirthDate || computeBirthDateForAgeYears(4);
    const computedAge = computeAgeFromBirthDate(birthDate);
    const resolvedAge = computedAge !== null ? computedAge : 4;

    const existing = wizard.editingReaderId
      ? state.profiles.find((p) => p.id === wizard.editingReaderId)
      : null;

    dispatch({ type: 'SET_FIELD', field: 'savingReader', value: true });
    try {
      if (existing) {
        await store.updateProfile(existing.id, {
          name,
          birthDate,
          age: resolvedAge,
          readingStage: wizard.readerStage,
          avatarTone: wizard.readerTone,
        });
      } else {
        const created = await store.addProfile({
          name,
          birthDate,
          age: resolvedAge,
          readingStage: wizard.readerStage,
          avatarTone: wizard.readerTone,
          favoriteTopics: ['bedtime', 'animals'],
          defaultRotationSize: resolvedAge <= 3 ? 4 : 5,
          cooldownDays: 14,
        });
        if (!wizard.activeTopicsReaderId && created?.id) {
          dispatch({ type: 'SET_FIELD', field: 'activeTopicsReaderId', value: created.id });
        }
      }

      closeReaderSheet();
      return true;
    } catch (err) {
      dispatch({
        type: 'SET_FIELD',
        field: 'sheetError',
        value: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      dispatch({ type: 'SET_FIELD', field: 'savingReader', value: false });
    }
  };

  const handleRemoveReader = async (profileId: string) => {
    await store.deleteProfile(profileId);
    if (wizard.editingReaderId === profileId) {
      closeReaderSheet();
    }
  };

  const handleStep2Continue = async () => {
    dispatch({ type: 'SET_FIELD', field: 'step2Error', value: '' });
    if (state.profiles.length === 0) {
      dispatch({
        type: 'SET_FIELD',
        field: 'step2Error',
        value: t('onboarding.step2MinReaderError'),
      });
      openAddReaderSheet();
      return;
    }
    await goToStep(3, 2);
  };

  // Step 3: Favourite Topics (Per Reader)
  const topicsTargetProfile =
    state.profiles.find((p) => p.id === wizard.activeTopicsReaderId) || state.profiles[0] || null;

  const handleToggleReaderTopic = async (topicId: string) => {
    if (!topicsTargetProfile) return;
    dispatch({ type: 'SET_FIELD', field: 'step3Error', value: '' });
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
    dispatch({
      type: 'PATCH',
      patch: { customTopicDraft: '', step3Error: '' },
    });
  };

  const missingTopicsProfile = state.profiles.find(
    (p) => !p.favoriteTopics || p.favoriteTopics.length === 0
  );

  const handleStep3Continue = async () => {
    if (missingTopicsProfile) {
      dispatch({
        type: 'PATCH',
        patch: {
          activeTopicsReaderId: missingTopicsProfile.id,
          step3Error: t('onboarding.step3MinTopicInline', { name: missingTopicsProfile.name }),
        },
      });
      return;
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

  // Step 6: Finish & Open Library
  const handleToggleNotifications = async () => {
    const nextVal = !state.settings.notificationsEnabled;
    if (nextVal && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch {
        // Ignore restricted iframe permission rejections
      }
    }
    await store.updateSettings({ notificationsEnabled: nextVal });
  };

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

  const shouldReduceMotion = useReducedMotion();

  const slideVariants = {
    enter: (dir: number) =>
      shouldReduceMotion
        ? { opacity: 0 }
        : {
            opacity: 0.92,
            x: dir > 0 ? '100%' : '-100%',
          },
    center: {
      opacity: 1,
      x: 0,
    },
    exit: (dir: number) =>
      shouldReduceMotion
        ? { opacity: 0 }
        : {
            opacity: 0.92,
            x: dir > 0 ? '-100%' : '100%',
          },
  };

  const activeSlideIndex = Math.max(
    0,
    Math.min(ONBOARDING_INTRO_SLIDES.length - 1, wizard.slideIndex)
  );
  const currentSlide = ONBOARDING_INTRO_SLIDES[activeSlideIndex];
  const isLastSlide = activeSlideIndex === ONBOARDING_INTRO_SLIDES.length - 1;

  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const activeThemeConfig = resolveEffectiveThemeConfig(
    state.settings.theme,
    state.settings.themePreset,
    prefersDark
  );
  const activeViewMode: BookViewMode = state.settings.bookViewMode || 'grid';
  const activeCardSize: BookCardSize = state.settings.bookCardSize || 'compact';
  const activeDetailStyle: BookDetailStyle = state.settings.bookDetailStyle || 'editorial';
  const activeCoverRatio = state.settings.coverAspectRatio || 'square';

  const navigateSlide = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(ONBOARDING_INTRO_SLIDES.length - 1, nextIdx));
    if (clamped === activeSlideIndex) return;
    dispatch({
      type: 'PATCH',
      patch: {
        direction: clamped > activeSlideIndex ? 1 : -1,
        slideIndex: clamped,
      },
    });
  };

  const handleSlideTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    slideTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleSlideTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = slideTouchStartRef.current;
    slideTouchStartRef.current = null;
    if (!start || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 42 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
    if (dx < 0 && !isLastSlide) {
      navigateSlide(activeSlideIndex + 1);
    } else if (dx > 0 && activeSlideIndex > 0) {
      navigateSlide(activeSlideIndex - 1);
    }
  };

  const renderSlideVisual = (slide: (typeof ONBOARDING_INTRO_SLIDES)[number]) => {
    const illustrationSrc = slide.illustrationPath
      ? resolvePublicAssetUrl(slide.illustrationPath)
      : '';
    const altTitle = slide.titleKey ? t(slide.titleKey) : slide.title;
    return (
      <div className="w-full max-w-[230px] sm:max-w-[285px] aspect-[4/3] mx-auto rounded-3xl overflow-hidden bg-illustration-paper ring-1 ring-hairline shadow-sm flex items-center justify-center p-2.5 select-none">
        {illustrationSrc ? (
          <img
            src={illustrationSrc}
            alt={altTitle}
            draggable={false}
            className="w-full h-full object-contain mix-blend-multiply pointer-events-none"
          />
        ) : (
          <BotanicalIllustration variant="hero-library" className="w-full h-full" />
        )}
      </div>
    );
  };

  return (
    <div className="h-[100dvh] lg:h-auto lg:min-h-[100dvh] overflow-hidden lg:overflow-visible bg-canvas text-ink flex flex-col justify-between">
      {/* Top Preview Mode Banner (only when launched from Dev Tools Preview) */}
      {isOnboardingPreview && (
        <div className="shrink-0 bg-surface-elevated border-b border-accent/40 px-4 py-1.5 text-xs z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <span className="font-semibold text-ink truncate">
              {t('onboarding.previewBanner')}
            </span>
            <button
              type="button"
              onClick={() => store.exitPreviewOnboarding()}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-primary text-primary-fg font-semibold text-xs whitespace-nowrap cursor-pointer shrink-0"
            >
              {t('onboarding.exitPreview')}
            </button>
          </div>
        </div>
      )}

      {/* HEADER: Minimal Single-Line Bar */}
      {currentStep === 0 ? (
        <header className="shrink-0 z-30 border-b border-edge-subtle bg-surface/90 backdrop-blur-md pt-safe">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-primary text-primary-fg border border-accent/35 flex items-center justify-center shrink-0 shadow-2xs">
                <Icon name="rotations" className="w-4 h-4" />
              </span>
              <span className="font-display font-semibold text-lg sm:text-xl text-ink tracking-tight whitespace-nowrap truncate">
                Library Rotation
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Detected Language Switcher Pill */}
              <label className="relative inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-surface-subtle border border-edge text-[11px] font-semibold text-ink hover:border-primary/50 cursor-pointer">
                <Icon name="globe" className="w-3.5 h-3.5 text-primary" />
                <span className="uppercase">{currentLanguageMeta.code}</span>
                <Icon name="chevronDown" className="w-3 h-3 text-ink-muted" />
                <select
                  aria-label={t('settings.languageLabel')}
                  data-action="onboarding-header-language"
                  value={currentLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value as AppLanguage)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeLabel}
                    </option>
                  ))}
                </select>
              </label>

              {/* Landing Mode Switcher (Interactive Tour | Overview) */}
              <div
                role="group"
                aria-label="Intro view style"
                className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge"
              >
                <button
                  type="button"
                  data-action="landing-mode-slideshow"
                  aria-pressed={landingMode === 'slideshow'}
                  onClick={() => store.updateSettings({ onboardingLandingMode: 'slideshow' })}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    landingMode === 'slideshow'
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {t('onboarding.landingSlideLabel')}
                </button>
                <button
                  type="button"
                  data-action="landing-mode-compact"
                  aria-pressed={landingMode === 'compact'}
                  onClick={() => store.updateSettings({ onboardingLandingMode: 'compact' })}
                  className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    landingMode === 'compact'
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {t('onboarding.landingSummaryLabel')}
                </button>
              </div>

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
                  className="min-h-[44px] px-2 rounded-lg text-xs font-semibold text-ink-secondary hover:text-ink hover:bg-surface-elevated whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  {isOnboardingPreview ? t('onboarding.exitPreview') : t('onboarding.skipTour')}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSkipAllConfirmed}
                    className="min-h-[38px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold whitespace-nowrap cursor-pointer"
                  >
                    {t('onboarding.skipConfirmBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false })
                    }
                    className="min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-semibold text-ink-secondary whitespace-nowrap cursor-pointer"
                  >
                    {t('onboarding.stayBtn')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="shrink-0 z-30 border-b border-edge-subtle bg-surface/95 backdrop-blur-md pt-safe">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2.5 sm:gap-4">
            {/* Left: Single Back Arrow Button */}
            <button
              type="button"
              onClick={() => goToStep(currentStep - 1)}
              aria-label={t('onboarding.backBtn')}
              className="min-h-[44px] min-w-[44px] rounded-lg text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center shrink-0 cursor-pointer transition-all"
            >
              <Icon name="chevronLeft" className="w-5 h-5" />
            </button>

            {/* Center: Centered Dot Progress Indicator (active dot slightly larger) */}
            <div
              role="progressbar"
              aria-valuenow={currentStep}
              aria-valuemin={1}
              aria-valuemax={TOTAL_SETUP_STEPS}
              aria-label={t('onboarding.stepProgress', {
                current: currentStep,
                total: TOTAL_SETUP_STEPS,
              })}
              className="flex items-center justify-center gap-2 flex-1"
            >
              {STEP_META.map((m) => {
                const isCurrent = m.step === currentStep;
                const isDone = m.step < currentStep;
                return (
                  <span
                    key={m.step}
                    title={t(m.labelKey)}
                    className={`rounded-full transition-all duration-300 ${
                      isCurrent
                        ? 'w-6 h-2.5 bg-primary'
                        : isDone
                          ? 'w-2.5 h-2.5 bg-primary/55'
                          : 'w-2 h-2 bg-edge'
                    }`}
                  />
                );
              })}
            </div>

            {/* Right: Step Counter + Skip */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-mono-tabular font-semibold text-ink-secondary whitespace-nowrap">
                {currentStep}/{TOTAL_SETUP_STEPS}
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
                  className="min-h-[44px] px-2.5 rounded-lg text-xs font-semibold text-ink-secondary hover:text-ink whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  {isOnboardingPreview ? t('onboarding.exitPreview') : t('onboarding.skipTour')}
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSkipAllConfirmed}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-[11px] font-semibold whitespace-nowrap cursor-pointer"
                  >
                    {t('onboarding.skipConfirmBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_FIELD', field: 'confirmSkipOpen', value: false })
                    }
                    className="min-h-[36px] px-2 py-1 rounded-lg text-[11px] font-semibold text-ink-secondary whitespace-nowrap cursor-pointer"
                  >
                    {t('onboarding.stayBtn')}
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
          {/* STEP 0: PRE-WIZARD LANDING (SLIDESHOW OR COMPACT OVERVIEW)     */}
          {/* ============================================================== */}
          {currentStep === 0 && (
            <motion.div
              key={`step-0-${landingMode}`}
              custom={wizard.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 flex flex-col"
            >
              {landingMode === 'slideshow' ? (
                /* SLIDESHOW MODE */
                <div
                  data-onboarding-landing="slideshow"
                  onTouchStart={handleSlideTouchStart}
                  onTouchEnd={handleSlideTouchEnd}
                  className="flex-1 min-h-0 flex flex-col justify-between max-w-3xl w-full mx-auto px-4 sm:px-6 pt-3 sm:pt-6 pb-4 pb-safe gap-3 touch-pan-y"
                >
                  {/* Slide Showcase Center: horizontal track so slides glide side-to-side cleanly without overlapping or jumping vertically */}
                  <div className="flex-1 min-h-0 flex flex-col justify-center overflow-x-hidden overflow-y-auto no-scrollbar py-2">
                    <div className="relative w-full overflow-hidden">
                      <motion.div
                        animate={{ x: `-${activeSlideIndex * 100}%` }}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0.01 }
                            : { type: 'spring', stiffness: 320, damping: 34, mass: 0.85 }
                        }
                        className="flex items-start w-full will-change-transform"
                      >
                        {ONBOARDING_INTRO_SLIDES.map((slide, idx) => {
                          const isCurrent = idx === activeSlideIndex;
                          return (
                            <div
                              key={slide.id}
                              aria-hidden={!isCurrent}
                              className="w-full shrink-0 min-w-0 flex flex-col items-center text-center px-1"
                            >
                              {renderSlideVisual(slide)}

                              <div className="mt-4 sm:mt-6 w-full max-w-xl mx-auto px-1 flex flex-col items-center">
                                <div className="h-5 flex items-center justify-center">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent leading-none">
                                    {slide.eyebrowKey ? t(slide.eyebrowKey) : slide.eyebrow}
                                  </p>
                                </div>
                                <div className="mt-2 min-h-[3.3rem] sm:min-h-[5.25rem] flex items-start justify-center">
                                  <h1 className="font-display text-2xl sm:text-4xl font-semibold leading-[1.1] tracking-tight text-ink text-balance">
                                    {slide.titleKey ? t(slide.titleKey) : slide.title}
                                  </h1>
                                </div>
                                <p className="mt-2 min-h-[4.25rem] sm:min-h-[4.75rem] text-xs sm:text-base text-ink-secondary leading-relaxed">
                                  {slide.descriptionKey
                                    ? t(slide.descriptionKey)
                                    : slide.description}
                                </p>
                                <p className="mt-2 min-h-[1.5rem] text-[11px] sm:text-xs font-medium text-ink-muted">
                                  <span className="font-semibold text-primary">
                                    {slide.highlightMetricKey
                                      ? t(slide.highlightMetricKey)
                                      : slide.highlightMetric}
                                  </span>
                                  <span aria-hidden="true" className="mx-1.5">·</span>
                                  <span>
                                    {slide.highlightCaptionKey
                                      ? t(slide.highlightCaptionKey)
                                      : slide.highlightCaption}
                                  </span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    </div>
                  </div>

                  {/* Fixed Footer: Explore Sample Family + Segmented Progress Bar + Skip / Next */}
                  <div className="shrink-0 space-y-2.5 pt-1">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        data-action="onboarding-explore-sample"
                        onClick={async () => {
                          await store.loadFullSampleHousehold();
                          navigate('home');
                        }}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-surface-subtle hover:underline inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Icon name="book" className="w-3.5 h-3.5 text-accent" />
                        <span>{t('onboarding.exploreSampleCta')}</span>
                      </button>
                    </div>

                    <div
                      role="tablist"
                      aria-label="Onboarding highlights"
                      className="grid gap-1.5"
                      style={{
                        gridTemplateColumns: `repeat(${ONBOARDING_INTRO_SLIDES.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {ONBOARDING_INTRO_SLIDES.map((s, idx) => {
                        const isFilled = idx <= activeSlideIndex;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={idx === activeSlideIndex}
                            aria-label={`${idx + 1}: ${s.eyebrowKey ? t(s.eyebrowKey) : s.eyebrow}`}
                            onClick={() => navigateSlide(idx)}
                            className="py-2 flex items-center cursor-pointer"
                          >
                            <span
                              className={`block w-full h-1.5 rounded-full transition-colors duration-200 ${
                                isFilled ? 'bg-primary' : 'bg-edge'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        data-action="onboarding-tour-skip"
                        onClick={() => goToStep(1, 0)}
                        className="min-h-[48px] px-5 py-2.5 rounded-lg bg-surface hover:bg-surface-elevated active:scale-[0.98] border border-edge text-ink font-semibold text-sm inline-flex items-center justify-center transition-all cursor-pointer"
                      >
                        {t('onboarding.skipTour')}
                      </button>

                      <button
                        type="button"
                        data-action="onboarding-tour-next"
                        onClick={() => {
                          if (isLastSlide) {
                            goToStep(1, 0);
                          } else {
                            navigateSlide(activeSlideIndex + 1);
                          }
                        }}
                        className="min-h-[48px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        <span>
                          {isLastSlide ? t('onboarding.getStartedCta') : t('onboarding.nextSlide')}
                        </span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* PRESERVED COMPACT OVERVIEW MODE */
                <div data-onboarding-landing="compact" className="flex-1 min-h-0 flex flex-col">
                  {/* MOBILE (< sm): Strict 100dvh Transparent Botanical Landing */}
                  <div className="sm:hidden flex-1 min-h-0 flex flex-col justify-between px-4 pt-2 pb-3 pb-safe gap-2">
                    <div className="flex-1 min-h-0 flex flex-col justify-evenly gap-2 overflow-y-auto no-scrollbar">
                      <div className="h-[20vh] min-h-[118px] max-h-[164px] w-full shrink-0 flex items-center justify-center">
                        <BotanicalIllustration
                          variant="hero-library"
                          className="w-full h-full max-w-[300px]"
                        />
                      </div>

                      <div className="text-center space-y-1.5 px-1">
                        <h1 className="font-display text-[26px] leading-[1.08] font-semibold tracking-tight text-ink text-balance">
                          {t('onboarding.welcomeTitle')}
                        </h1>
                        <p className="text-[12.5px] leading-snug text-ink-secondary max-w-sm mx-auto">
                          {t('onboarding.welcomeSubtitle')}
                        </p>
                        <div aria-hidden="true" className="w-12 h-px bg-accent/60 mx-auto pt-0.5" />
                      </div>

                      <div className="space-y-1.5">
                        {[
                          {
                            icon: 'rotations',
                            title: t('onboarding.feature1Title'),
                            desc: t('onboarding.feature1Desc'),
                          },
                          {
                            icon: 'profiles',
                            title: t('onboarding.feature2Title'),
                            desc: t('onboarding.feature2Desc'),
                          },
                          {
                            icon: 'scan',
                            title: t('onboarding.feature3Title'),
                            desc: t('onboarding.feature3Desc'),
                          },
                        ].map((feat) => (
                          <div
                            key={feat.icon}
                            className="rounded-lg bg-surface border border-edge px-3 py-2 flex items-center gap-3 shadow-2xs"
                          >
                            <span className="w-8 h-8 rounded-lg bg-surface-elevated border border-edge text-primary flex items-center justify-center shrink-0">
                              <Icon name={feat.icon} strokeWidth={1.75} className="w-4 h-4" />
                            </span>
                            <div className="min-w-0 text-left">
                              <p className="font-display text-[15px] font-semibold text-ink leading-tight">
                                {feat.title}
                              </p>
                              <p className="text-[11px] text-ink-secondary truncate mt-0.5">
                                {feat.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="shrink-0 space-y-2 pt-0.5">
                      <button
                        type="button"
                        data-action="onboarding-begin"
                        onClick={() => goToStep(1, 0)}
                        className="w-full min-h-[48px] px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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
                        className="w-full min-h-[44px] px-5 py-2 rounded-lg bg-surface hover:bg-surface-elevated active:scale-[0.98] border border-edge text-ink font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <Icon name="book" className="w-4 h-4 text-accent" />
                        <span>{t('onboarding.exploreSampleCta')}</span>
                      </button>
                    </div>
                  </div>

                  {/* DESKTOP & TABLET (sm+): Transparent Botanical Hero + Centered Editorial Layout */}
                  <div className="hidden sm:flex flex-col justify-center max-w-5xl w-full mx-auto my-auto px-6 lg:px-8 py-6 lg:py-8 gap-6">
                    <div className="w-full h-44 md:h-52 lg:h-56 flex items-center justify-center">
                      <BotanicalIllustration
                        variant="hero-library"
                        className="w-full h-full max-w-[440px]"
                      />
                    </div>

                    <div className="text-center space-y-2.5 max-w-2xl mx-auto">
                      <h1 className="font-display text-3xl md:text-4xl lg:text-[44px] font-semibold text-ink leading-[1.08] tracking-tight text-balance">
                        {t('onboarding.welcomeTitle')}
                      </h1>
                      <p className="text-sm sm:text-base text-ink-secondary leading-relaxed max-w-xl mx-auto">
                        {t('onboarding.welcomeSubtitle')}
                      </p>
                      <div aria-hidden="true" className="w-16 h-px bg-accent/65 mx-auto pt-0.5" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {[
                        {
                          icon: 'rotations',
                          title: t('onboarding.feature1Title'),
                          desc: t('onboarding.feature1Desc'),
                        },
                        {
                          icon: 'profiles',
                          title: t('onboarding.feature2Title'),
                          desc: t('onboarding.feature2Desc'),
                        },
                        {
                          icon: 'scan',
                          title: t('onboarding.feature3Title'),
                          desc: t('onboarding.feature3Desc'),
                        },
                      ].map((feat) => (
                        <div
                          key={feat.icon}
                          className="rounded-xl bg-surface border border-edge px-4 py-3.5 flex items-center gap-3.5 shadow-2xs"
                        >
                          <span className="w-10 h-10 rounded-lg bg-surface-elevated border border-edge text-primary flex items-center justify-center shrink-0">
                            <Icon name={feat.icon} strokeWidth={1.75} className="w-5 h-5" />
                          </span>
                          <div className="min-w-0 text-left">
                            <h2 className="font-display text-base font-semibold text-ink leading-tight">
                              {feat.title}
                            </h2>
                            <p className="text-xs text-ink-secondary leading-snug mt-0.5">
                              {feat.desc}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        data-action="onboarding-begin-desktop"
                        onClick={() => goToStep(1, 0)}
                        className="min-h-[48px] px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>{t('onboarding.beginSetupCta')}</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        data-action="onboarding-explore-sample-desktop"
                        onClick={async () => {
                          await store.loadFullSampleHousehold();
                          navigate('home');
                        }}
                        className="min-h-[48px] px-6 py-3 rounded-lg bg-surface hover:bg-surface-elevated active:scale-[0.98] border border-edge text-ink font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                      >
                        <Icon name="book" className="w-4 h-4 text-accent" />
                        <span>{t('onboarding.exploreSampleCta')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ============================================================== */}
          {/* STEPS 1–6: MOBILE 100dvh FLEX SHELL + DESKTOP 2-COL SPLIT       */}
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
              {/* Desktop Left Guidance Rail */}
              <aside className="hidden lg:block lg:col-span-4 space-y-5 sticky top-24">
                <div className="rounded-xl bg-surface border border-edge p-5 space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    {t('onboarding.guidedSetup')}
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
                            className={`w-full min-h-[42px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                              isCurrent
                                ? 'bg-primary text-primary-fg'
                                : isDone
                                  ? 'bg-surface-elevated text-ink'
                                  : 'text-ink-secondary hover:bg-surface-subtle'
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span className="font-mono-tabular w-4 text-center">{m.step}.</span>
                              <span>{t(m.labelKey)}</span>
                            </span>
                            {isDone && !isCurrent && <Icon name="check" className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="rounded-xl bg-surface-subtle border border-edge p-4 text-xs text-ink-secondary leading-relaxed space-y-1.5">
                  <p className="font-semibold text-ink">
                    {t('onboarding.adjustLaterTitle')}
                  </p>
                  <p>
                    {t('onboarding.adjustLaterDesc')}
                  </p>
                </div>
              </aside>

              {/* Interactive Step Body + Sticky Bottom Bar */}
              <section className="flex-1 min-h-0 flex flex-col justify-between lg:col-span-8 lg:block lg:space-y-6">
                {/* ---------------------------------------------------------- */}
                {/* STEP 1: HOUSEHOLD IDENTITY & EXPLICIT LANGUAGE SELECTOR    */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 1 && (
                  <form
                    onSubmit={handleStep1Continue}
                    className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-6"
                  >
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-6 pb-3 lg:p-0 flex flex-col justify-center lg:block space-y-5 text-left">
                      <div className="space-y-2">
                        <h1 className="font-display text-[28px] sm:text-3xl font-semibold leading-tight tracking-tight text-ink">
                          {t('onboarding.step1HouseholdQuestion')}
                        </h1>
                        <p className="text-sm text-ink-secondary">
                          {t('onboarding.step1HouseholdSubtitle')}
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
                          placeholder={t('onboarding.householdNamePlaceholder')}
                          className="w-full min-h-[52px] px-4 py-3 rounded-lg bg-surface border border-edge focus:border-primary text-base sm:text-lg font-medium text-ink placeholder:text-ink-muted shadow-2xs focus:outline-none transition-colors"
                        />
                        <p className="text-xs text-ink-muted px-1">
                          {t('onboarding.step1OptionalNote')}
                        </p>
                      </div>

                      {/* Explicit Language Selector inside Step 1 so every user confirms language */}
                      <div className="rounded-xl bg-surface border border-edge p-3.5 space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary inline-flex items-center gap-1.5">
                            <Icon name="globe" className="w-3.5 h-3.5 text-primary" />
                            <span>{t('onboarding.languageCardTitle')}</span>
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {currentLanguageMeta.nativeLabel}
                          </span>
                        </div>
                        <div
                          role="group"
                          aria-label={t('onboarding.languageCardTitle')}
                          className="grid grid-cols-3 gap-2"
                        >
                          {SUPPORTED_LANGUAGES.map((lang) => {
                            const selected = currentLanguage === lang.code;
                            return (
                              <button
                                key={lang.code}
                                type="button"
                                data-action={`onboarding-lang-${lang.code}`}
                                aria-pressed={selected}
                                onClick={() => handleLanguageChange(lang.code as AppLanguage)}
                                className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  selected
                                    ? 'bg-primary text-primary-fg shadow-2xs'
                                    : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
                                }`}
                              >
                                <span className="truncate">{lang.nativeLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-ink-muted">
                          {t('onboarding.languageCardHint')}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-canvas/95 lg:bg-transparent">
                      <button
                        type="submit"
                        data-action="onboarding-step1-next"
                        className="w-full lg:w-auto min-h-[48px] px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>{t('onboarding.continueBtn')}</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 2: READERS (LIST + BOTTOM-SHEET MODAL)                */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 2 && (
                  <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-4 text-left">
                      <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-ink">
                          {t('onboarding.step2ReadersQuestion')}
                        </h1>
                        <p className="text-xs sm:text-sm text-ink-secondary mt-1">
                          {t('onboarding.step2ReadersSubtitle')}
                        </p>
                      </div>

                      {wizard.step2Error && (
                        <p
                          role="alert"
                          className="text-xs font-medium text-danger"
                        >
                          {wizard.step2Error}
                        </p>
                      )}

                      {state.profiles.length > 0 ? (
                        <div className="space-y-2.5">
                          {state.profiles.map((p) => {
                            const tone = AVATAR_TONES[p.avatarTone || 'teal'] || AVATAR_TONES.teal;
                            const age = getEffectiveProfileAge(p);
                            return (
                              <div
                                key={p.id}
                                className="rounded-xl bg-surface border border-edge p-3 flex items-center justify-between gap-3 shadow-2xs"
                              >
                                <button
                                  type="button"
                                  onClick={() => openEditReaderSheet(p.id)}
                                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                                >
                                  <span
                                    className={`w-10 h-10 rounded-full text-sm font-bold flex items-center justify-center shrink-0 ${tone}`}
                                  >
                                    {p.name.slice(0, 1).toUpperCase()}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="font-display text-base font-semibold text-ink truncate">
                                      {p.name}
                                    </p>
                                    <p className="text-xs text-ink-secondary truncate">
                                      {age >= 18 ? '18+' : `${age} ${t('onboarding.yearsSuffix')}`} ·{' '}
                                      {formatReadingStage(p.readingStage)}
                                    </p>
                                  </div>
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openEditReaderSheet(p.id)}
                                    aria-label={`${t('common.edit')} ${p.name}`}
                                    className="min-h-[44px] min-w-[44px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated flex items-center justify-center cursor-pointer"
                                  >
                                    <Icon name="edit" className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveReader(p.id)}
                                    aria-label={`${t('common.remove')} ${p.name}`}
                                    className="min-h-[44px] min-w-[44px] rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center cursor-pointer"
                                  >
                                    <Icon name="close" className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-surface border border-dashed border-edge p-6 text-center space-y-2">
                          <span className="w-10 h-10 rounded-full bg-surface-elevated border border-edge text-primary inline-flex items-center justify-center mx-auto">
                            <Icon name="profiles" className="w-5 h-5" />
                          </span>
                          <p className="font-display text-lg font-semibold text-ink">
                            {t('onboarding.step2NoReadersTitle')}
                          </p>
                          <p className="text-xs text-ink-secondary max-w-xs mx-auto">
                            {t('onboarding.step2NoReadersHint')}
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        data-action="onboarding-open-add-reader"
                        onClick={openAddReaderSheet}
                        className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-elevated active:scale-[0.99] border border-primary/40 text-ink font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
                      >
                        <Icon name="plus" className="w-4 h-4 text-primary" />
                        <span>
                          {state.profiles.length > 0
                            ? t('onboarding.addReaderCta')
                            : t('onboarding.addReaderModalTitle')}
                        </span>
                      </button>
                    </div>

                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-canvas/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-step2-next"
                        onClick={handleStep2Continue}
                        className="w-full lg:w-auto min-h-[48px] px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>{t('onboarding.continueBtn')}</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 3: PER-READER FAVOURITE TOPICS (THIN BORDER PILLS)    */}
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
                  const activeTopicBorderClass =
                    AVATAR_TONE_BORDER_STYLES[activeToneKey] || AVATAR_TONE_BORDER_STYLES.teal;
                  const canAdvance =
                    state.profiles.length > 0 && !missingTopicsProfile && selectedTopics.length > 0;

                  return (
                    <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-3.5 text-left">
                        <div>
                          <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-ink">
                            {topicsTargetProfile
                              ? t('onboarding.step3TopicQuestion', {
                                  name: topicsTargetProfile.name,
                                })
                              : t('onboarding.step3TopicGenericQuestion')}
                          </h1>
                          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
                            {t('onboarding.step3TopicCountHint', { count: selectedTopics.length })}
                          </p>
                        </div>

                        {wizard.step3Error && (
                          <p
                            role="alert"
                            className="text-xs font-medium text-danger"
                          >
                            {wizard.step3Error}
                          </p>
                        )}

                        {state.profiles.length > 0 ? (
                          <>
                            {/* Per-Reader Selector Pills (Standard Sized) */}
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
                                        type: 'PATCH',
                                        patch: {
                                          activeTopicsReaderId: p.id,
                                          step3Error: '',
                                        },
                                      })
                                    }
                                    className={`min-h-[40px] pl-2 pr-3 py-1.5 rounded-lg inline-flex items-center gap-2 shrink-0 text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                                      isCurrent
                                        ? readerSelectedStyle
                                        : 'bg-surface border border-edge text-ink hover:border-primary/50'
                                    }`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${tone}`}
                                    >
                                      {p.name.slice(0, 1).toUpperCase()}
                                    </span>
                                    <span>{p.name}</span>
                                    <span
                                      className={`font-mono-tabular text-[11px] ${
                                        count === 0 ? 'text-danger' : 'text-ink-muted'
                                      }`}
                                    >
                                      {count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Smaller, Thinner Topic Pills Colored Along Border by Profile Tone */}
                            <div className="flex flex-wrap gap-1.5">
                              {READER_TOPIC_OPTIONS.map((topic) => {
                                const selected = selectedTopics.includes(topic.id);
                                return (
                                  <button
                                    key={topic.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => handleToggleReaderTopic(topic.id)}
                                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                                      selected
                                        ? activeTopicBorderClass
                                        : 'bg-surface border border-edge text-ink-secondary hover:text-ink hover:border-primary/50'
                                    }`}
                                  >
                                    <Icon
                                      name={topic.icon}
                                      strokeWidth={1.75}
                                      className={`w-3 h-3 shrink-0 ${
                                        selected ? 'text-primary' : 'text-ink-muted'
                                      }`}
                                    />
                                    <span>{t(topic.labelKey)}</span>
                                    {selected && (
                                      <Icon name="check" className="w-3 h-3 text-primary shrink-0" />
                                    )}
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
                                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                                      selected
                                        ? activeTopicBorderClass
                                        : 'bg-surface border border-edge text-ink-secondary hover:text-ink hover:border-primary/50'
                                    }`}
                                  >
                                    <Icon
                                      name="tag"
                                      strokeWidth={1.75}
                                      className={`w-3 h-3 shrink-0 ${
                                        selected ? 'text-primary' : 'text-ink-muted'
                                      }`}
                                    />
                                    <span>{formatTopicLabel(topicId, t)}</span>
                                    {selected && (
                                      <Icon name="check" className="w-3 h-3 text-primary shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedTopics.length === 0 && topicsTargetProfile && (
                              <p className="text-xs font-medium text-danger">
                                {t('onboarding.step3MinTopicInline', {
                                  name: topicsTargetProfile.name,
                                })}
                              </p>
                            )}

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
                                placeholder={t('onboarding.addCustomTopicPlaceholder')}
                                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-lg bg-surface border border-edge text-xs sm:text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={handleAddCustomReaderTopic}
                                className="min-h-[42px] px-3.5 py-2 rounded-lg bg-surface-elevated hover:bg-edge/60 border border-edge text-xs font-semibold text-ink cursor-pointer transition-colors"
                              >
                                {t('onboarding.addBtn')}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-xl bg-surface border border-edge p-4 space-y-2.5">
                            <p className="text-xs text-ink-secondary">
                              {t('onboarding.step3AddReaderFirst')}
                            </p>
                            <button
                              type="button"
                              onClick={() => goToStep(2)}
                              className="min-h-[42px] px-4 py-2 rounded-lg bg-surface-elevated hover:bg-edge/60 border border-edge text-xs font-semibold text-ink cursor-pointer"
                            >
                              {t('onboarding.step3GoToReaders')}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-canvas/95 lg:bg-transparent">
                        <button
                          type="button"
                          data-action="onboarding-step3-next"
                          disabled={!canAdvance}
                          onClick={handleStep3Continue}
                          className={`w-full lg:w-auto min-h-[48px] px-7 py-3 rounded-lg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all ${
                            canAdvance
                              ? 'bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg cursor-pointer'
                              : 'bg-edge text-ink-muted cursor-not-allowed opacity-70'
                          }`}
                        >
                          <span>{t('onboarding.continueBtn')}</span>
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
                        <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-ink">
                          {t('onboarding.step4BookTypesQuestion')}
                        </h1>
                        <p className="text-xs sm:text-sm text-ink-secondary mt-1">
                          {t('onboarding.step4BookTypesSubtitle')}
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
                              className={`${opt.fullWidth ? 'col-span-2' : ''} min-h-[56px] p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all active:scale-[0.98] cursor-pointer ${
                                selected
                                  ? 'bg-primary text-primary-fg border-primary shadow-2xs'
                                  : 'bg-surface border-edge text-ink hover:border-primary/50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    selected
                                      ? 'bg-overlay-tint text-primary-fg'
                                      : 'bg-surface-elevated text-primary'
                                  }`}
                                >
                                  <Icon name={opt.icon} strokeWidth={1.75} className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs sm:text-sm font-semibold leading-tight">
                                    {t(opt.labelKey)}
                                  </p>
                                  <p
                                    className={`text-[11px] leading-tight mt-0.5 truncate ${
                                      selected ? 'opacity-85' : 'text-ink-secondary'
                                    }`}
                                  >
                                    {t(opt.hintKey)}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                                  selected
                                    ? 'bg-primary-fg text-[var(--primary)] dark:text-canvas border-primary-fg'
                                    : 'border-edge'
                                }`}
                              >
                                {selected && <Icon name="check" className="w-3 h-3" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-canvas/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-step4-next"
                        onClick={handleStep4Continue}
                        className="w-full lg:w-auto min-h-[48px] px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>{t('onboarding.continueBtn')}</span>
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
                        <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-ink">
                          {t('onboarding.step5ShelfTitle')}
                        </h1>
                        <p className="text-xs sm:text-sm text-ink-secondary mt-1">
                          {t('onboarding.step5ShelfSubtitle')}
                        </p>
                      </div>

                      <OnboardingLibraryStep
                        primaryProfileId={state.profiles[0]?.id || activeProfile?.id}
                      />
                    </div>

                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-canvas/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-step5-next"
                        onClick={() => goToStep(6, 5)}
                        className="w-full lg:w-auto min-h-[48px] px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>{t('onboarding.continueBtn')}</span>
                        <Icon name="chevronRight" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------- */}
                {/* STEP 6: ORGANIZER & PARENT VIEW PREFERENCES                */}
                {/* ---------------------------------------------------------- */}
                {currentStep === 6 && (
                  <div className="flex-1 min-h-0 flex flex-col justify-between lg:block lg:space-y-5">
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pt-4 pb-2 lg:p-0 space-y-4 text-left">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                          {t('onboarding.parentOrganizerLabel')}
                        </p>
                        <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-ink mt-0.5">
                          {t('onboarding.step6Title')}
                        </h1>
                        <p className="text-xs sm:text-sm text-ink-secondary mt-1">
                          {t('onboarding.step6Subtitle')}
                        </p>
                      </div>

                      {/* 1. Theme Palette */}
                      <div className="rounded-xl bg-surface border border-edge p-3.5 space-y-3 shadow-2xs">
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                          {t('settings.themeLabel')}
                        </span>
                        {[
                          { label: t('settings.themeLightGroup'), ids: LIGHT_THEME_PRESET_IDS },
                          { label: t('settings.themeDarkGroup'), ids: DARK_THEME_PRESET_IDS },
                        ].map((group) => (
                          <div key={group.label} className="space-y-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                              {group.label}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {group.ids.map((presetId: ThemePresetId) => {
                                const preset = THEME_PRESETS[presetId];
                                const selected = activeThemeConfig.id === preset.id;
                                return (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() =>
                                      store.updateSettings({
                                        theme: preset.mode,
                                        themePreset: preset.id,
                                      })
                                    }
                                    className={`min-h-[52px] p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                      selected
                                        ? 'bg-surface-elevated border-2 border-primary shadow-2xs'
                                        : 'bg-surface-subtle border-edge hover:border-primary/40'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1 mb-1.5">
                                      {preset.swatches.map((hex, i) => (
                                        <span
                                          key={`${preset.id}-${i}`}
                                          className="w-3.5 h-3.5 rounded-full border border-hairline"
                                          style={{ backgroundColor: hex }}
                                        />
                                      ))}
                                    </div>
                                    <p className="text-xs font-semibold text-ink leading-tight truncate">
                                      {preset.label}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* 2. Shelf Layout, Card Size & Book Detail View */}
                      <div className="rounded-xl bg-surface border border-edge p-3.5 space-y-3 shadow-2xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5">
                              {t('settings.bookViewModeLabel')}
                            </span>
                            <div className="grid grid-cols-2 p-1 rounded-lg bg-surface-subtle border border-edge">
                              {(['grid', 'list'] as BookViewMode[]).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  aria-pressed={activeViewMode === mode}
                                  onClick={() => store.updateSettings({ bookViewMode: mode })}
                                  className={`min-h-[38px] rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                                    activeViewMode === mode
                                      ? 'bg-primary text-primary-fg shadow-2xs'
                                      : 'text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  <Icon name={mode} className="w-3.5 h-3.5" />
                                  <span>
                                    {mode === 'grid'
                                      ? t('settings.bookViewGrid')
                                      : t('settings.bookViewList')}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5">
                              {t('settings.bookDetailStyleLabel')}
                            </span>
                            <div className="grid grid-cols-2 p-1 rounded-lg bg-surface-subtle border border-edge">
                              {(['compact', 'editorial'] as BookDetailStyle[]).map((style) => (
                                <button
                                  key={style}
                                  type="button"
                                  aria-pressed={activeDetailStyle === style}
                                  onClick={() => store.updateSettings({ bookDetailStyle: style })}
                                  className={`min-h-[38px] rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                                    activeDetailStyle === style
                                      ? 'bg-primary text-primary-fg shadow-2xs'
                                      : 'text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {style === 'compact'
                                    ? t('settings.bookDetailCompact')
                                    : t('settings.bookDetailEditorial')}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5">
                              {t('settings.bookCardSizeLabel')}
                            </span>
                            <div className="grid grid-cols-3 p-1 rounded-lg bg-surface-subtle border border-edge">
                              {(['compact', 'regular', 'large'] as BookCardSize[]).map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  aria-pressed={activeCardSize === sz}
                                  onClick={() => store.updateSettings({ bookCardSize: sz })}
                                  className={`min-h-[36px] rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                                    activeCardSize === sz
                                      ? 'bg-primary text-primary-fg shadow-2xs'
                                      : 'text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {sz === 'compact'
                                    ? t('settings.bookCardCompact')
                                    : sz === 'large'
                                      ? t('settings.bookCardLarge')
                                      : t('settings.bookCardRegular')}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5">
                              {t('settings.coverAspectLabel')}
                            </span>
                            <div className="grid grid-cols-2 p-1 rounded-lg bg-surface-subtle border border-edge">
                              {(['portrait', 'square'] as const).map((ratio) => (
                                <button
                                  key={ratio}
                                  type="button"
                                  aria-pressed={activeCoverRatio === ratio}
                                  onClick={() => store.updateSettings({ coverAspectRatio: ratio })}
                                  className={`min-h-[36px] rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                                    activeCoverRatio === ratio
                                      ? 'bg-primary text-primary-fg shadow-2xs'
                                      : 'text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {ratio === 'portrait'
                                    ? t('settings.coverAspectPortrait')
                                    : t('settings.coverAspectSquare')}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 3. Reminders Toggle */}
                      <div className="rounded-xl bg-surface border border-edge p-3.5 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-ink">
                            {t('onboarding.notificationsToggleTitle')}
                          </p>
                          <p className="text-[11px] text-ink-secondary mt-0.5 leading-snug">
                            {t('onboarding.notificationsToggleDesc')}
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={Boolean(state.settings.notificationsEnabled)}
                          onChange={handleToggleNotifications}
                          ariaLabel={t('onboarding.notificationsToggleTitle')}
                        />
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pt-2 pb-3 pb-safe lg:p-0 lg:pt-2 bg-canvas/95 lg:bg-transparent">
                      <button
                        type="button"
                        data-action="onboarding-finish-library"
                        disabled={wizard.finishing}
                        onClick={handleFinishAndOpenLibrary}
                        className="w-full lg:w-auto min-h-[48px] px-7 py-3 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60 text-primary-fg font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                      >
                        <span>
                          {wizard.finishing
                            ? t('onboarding.openingLibraryProgress')
                            : t('onboarding.finishSetupCta')}
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

      {/* ================================================================== */}
      {/* STEP 2 BOTTOM SHEET: ADD OR EDIT READER (NAME, DOB, STAGE, COLOR)  */}
      {/* ================================================================== */}
      {wizard.isReaderSheetOpen && (
        <div
          className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
          role="dialog"
          aria-modal="true"
          aria-label={
            wizard.editingReaderId
              ? t('onboarding.editReaderModalTitle')
              : t('onboarding.addReaderModalTitle')
          }
          onClick={closeReaderSheet}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full max-w-md max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
          >
            <div
              className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
              aria-hidden="true"
            />

            <div className="px-5 py-3.5 border-b border-edge-subtle flex items-center justify-between gap-3 shrink-0">
              <h2 className="font-display text-lg font-semibold text-ink">
                {wizard.editingReaderId
                  ? t('onboarding.editReaderModalTitle')
                  : t('onboarding.addReaderModalTitle')}
              </h2>
              <button
                type="button"
                onClick={closeReaderSheet}
                aria-label={t('common.close')}
                className="min-h-[44px] min-w-[44px] rounded-lg text-ink-secondary hover:bg-surface-elevated flex items-center justify-center cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveReaderFromSheet}
              className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            >
              {wizard.sheetError && (
                <p role="alert" className="text-xs font-medium text-danger">
                  {wizard.sheetError}
                </p>
              )}

              {/* 1. Reader Name */}
              <div>
                <label
                  htmlFor="onboarding-reader-name"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5"
                >
                  {t('onboarding.readerNameLabel')}
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
                  placeholder={t('onboarding.readerNamePlaceholder')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none"
                />
              </div>

              {/* 2. Birth Date */}
              <div>
                <label
                  htmlFor="onboarding-reader-birthdate"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5"
                >
                  {t('onboarding.dobLabel')}
                </label>
                <input
                  id="onboarding-reader-birthdate"
                  type="date"
                  value={wizard.readerBirthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const nextDob = e.target.value;
                    const ageFromDob = computeAgeFromBirthDate(nextDob);
                    dispatch({
                      type: 'PATCH',
                      patch: {
                        readerBirthDate: nextDob,
                        readerStage:
                          ageFromDob !== null
                            ? inferReadingStageFromAge(ageFromDob)
                            : wizard.readerStage,
                      },
                    });
                  }}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-lg bg-surface-subtle border border-edge text-sm font-medium text-ink focus:border-primary focus:outline-none"
                />
              </div>

              {/* 3. Reading Stage */}
              <div>
                <label
                  htmlFor="onboarding-reader-stage"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1.5"
                >
                  {t('onboarding.ageOrStageLabel')}
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
                  className="w-full min-h-[46px] px-3 py-2.5 rounded-lg bg-surface-subtle border border-edge text-sm font-medium text-ink"
                >
                  <option value="board-toddler">{formatReadingStage('board-toddler')} (0–2)</option>
                  <option value="picture-book">{formatReadingStage('picture-book')} (3–5)</option>
                  <option value="early-reader">{formatReadingStage('early-reader')} (6–8)</option>
                  <option value="chapter-book">{formatReadingStage('chapter-book')} (7–10)</option>
                  <option value="middle-grade">{formatReadingStage('middle-grade')} (9–12)</option>
                  <option value="teen-ya">{formatReadingStage('teen-ya')} (13–17)</option>
                  <option value="adult">{formatReadingStage('adult')} (18+)</option>
                </select>
              </div>

              {/* 4. Avatar Color (Swatches placed below the label) */}
              <div className="space-y-2">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                  {t('onboarding.badgeColorLabel')}
                </span>
                <div className="flex items-center gap-2.5 flex-wrap">
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
                        aria-label={`${opt.label}`}
                        aria-pressed={isSelected}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${toneStyle} ${
                          isSelected
                            ? 'ring-2 ring-offset-2 ring-primary ring-offset-surface scale-105'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                      >
                        {isSelected ? (
                          <Icon name="check" className="w-4 h-4" />
                        ) : (
                          <span className="text-xs font-bold opacity-90">
                            {(wizard.readerName.trim() || 'R').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={closeReaderSheet}
                  className="min-h-[48px] px-4 py-2.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-sm font-semibold text-ink cursor-pointer"
                >
                  {t('onboarding.cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={wizard.savingReader}
                  data-action="onboarding-add-reader"
                  className="flex-1 min-h-[48px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:opacity-60 text-primary-fg text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Icon name={wizard.editingReaderId ? 'check' : 'plus'} className="w-4 h-4" />
                  <span>
                    {wizard.editingReaderId
                      ? t('onboarding.saveReaderBtn')
                      : t('onboarding.addReaderModalTitle')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
