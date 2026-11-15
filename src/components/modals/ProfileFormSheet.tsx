import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { PROFILE_AVATAR_TONE_OPTIONS, AVATAR_TONES } from '../../config/index.js';
import {
  computeAgeFromBirthDate,
  inferReadingStageFromAge,
} from '../../types/models.js';
import type { ReadingStage } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

interface ProfileFormSheetProps {
  isOpen: boolean;
  editingProfileId: string | null;
  onClose: () => void;
}

const COMMON_TOPICS = [
  'bedtime',
  'animals',
  'dinosaurs',
  'vehicles',
  'space',
  'nature',
  'stem',
  'adventure',
  'feelings',
  'humor',
  'friendship',
  'fairy-tales',
];

export const ProfileFormSheet: React.FC<ProfileFormSheetProps> = ({
  isOpen,
  editingProfileId,
  onClose,
}) => {
  const { state, store } = useApp();

  const existingProfile = editingProfileId
    ? state.profiles.find((p) => p.id === editingProfileId)
    : null;

  const canUseWizard = !existingProfile && state.settings?.showMiniWizards !== false;
  const [wizardMode, setWizardMode] = useState(true);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [readingStage, setReadingStage] = useState<ReadingStage>('picture-book');
  const [avatarTone, setAvatarTone] = useState('teal');
  const [favoriteTopics, setFavoriteTopics] = useState<string[]>([]);
  const [customTopicDraft, setCustomTopicDraft] = useState('');
  const [defaultRotationSize, setDefaultRotationSize] = useState(5);
  const [cooldownDays, setCooldownDays] = useState(14);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existingProfile) {
      setName(existingProfile.name);
      setBirthDate(existingProfile.birthDate || '');
      setReadingStage(existingProfile.readingStage);
      setAvatarTone(existingProfile.avatarTone || 'teal');
      setFavoriteTopics(existingProfile.favoriteTopics || []);
      setDefaultRotationSize(existingProfile.defaultRotationSize || 5);
      setCooldownDays(existingProfile.cooldownDays ?? 14);
      setWizardMode(false);
    } else {
      setName('');
      setBirthDate('');
      setReadingStage('picture-book');
      setAvatarTone('teal');
      setFavoriteTopics(['bedtime', 'animals']);
      setDefaultRotationSize(5);
      setCooldownDays(14);
      setWizardMode(state.settings?.showMiniWizards !== false);
      setWizardStep(1);
    }
    setCustomTopicDraft('');
    setError('');
  }, [existingProfile, isOpen, state.settings?.showMiniWizards]);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const computedAge = birthDate ? computeAgeFromBirthDate(birthDate) : null;
  const isGuidedSteps = canUseWizard && wizardMode;

  const handleBirthDateChange = (val: string) => {
    setBirthDate(val);
    if (val) {
      const age = computeAgeFromBirthDate(val);
      if (age !== null) {
        setReadingStage(inferReadingStageFromAge(age));
      }
    }
  };

  const handleToggleTopic = (topic: string) => {
    setFavoriteTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleAddCustomTopic = () => {
    const clean = customTopicDraft.trim().toLowerCase().replace(/^#+/, '');
    if (!clean) return;
    if (!favoriteTopics.includes(clean)) {
      setFavoriteTopics((prev) => [...prev, clean]);
    }
    setCustomTopicDraft('');
  };

  const handleWizardNext = () => {
    if (!name.trim()) {
      setError('Please enter a reader name.');
      return;
    }
    setError('');
    setWizardStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a reader name.');
      if (isGuidedSteps) setWizardStep(1);
      return;
    }

    try {
      if (existingProfile) {
        await store.updateProfile(existingProfile.id, {
          name: name.trim(),
          birthDate: birthDate || undefined,
          readingStage,
          avatarTone,
          favoriteTopics,
          defaultRotationSize: Number(defaultRotationSize),
          cooldownDays: Number(cooldownDays),
        });
      } else {
        await store.addProfile({
          name: name.trim(),
          birthDate: birthDate || undefined,
          readingStage,
          avatarTone,
          favoriteTopics,
          defaultRotationSize: Number(defaultRotationSize),
          cooldownDays: Number(cooldownDays),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const allTopicOptions = Array.from(new Set([...COMMON_TOPICS, ...favoriteTopics]));

  const renderIdentityFields = () => (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
          Reader Name
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Maya, Lucas, Leo"
          className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700 text-forest-900 dark:text-white placeholder:text-stone-ink/60 dark:placeholder:text-slate-400"
        />
      </div>

      {/* Birth Date Input with exact text-left and px-3.5 padding */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="profile-birth-date"
              className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400"
            >
              Birth Date
            </label>
            {computedAge !== null && (
              <span className="text-xs font-bold text-forest-800 dark:text-[#5ED3DA]">
                {computedAge} yrs
              </span>
            )}
          </div>

          <input
            type="date"
            id="profile-birth-date"
            value={birthDate}
            onChange={(e) => handleBirthDateChange(e.target.value)}
            className="w-full text-left px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700 text-forest-900 dark:text-white"
          />
        </div>

        {/* Reading Stage */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
            Reading Stage
          </label>
          <select
            value={readingStage}
            onChange={(e) => setReadingStage(e.target.value as ReadingStage)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700 text-forest-900 dark:text-white"
          >
            <option value="board-toddler">Board Book (Ages 0–3)</option>
            <option value="picture-book">Picture Book (Ages 3–6)</option>
            <option value="early-reader">Early Reader (Ages 5–8)</option>
            <option value="chapter-book">Chapter Book (Ages 7–12)</option>
            <option value="middle-grade">Middle Grade (Ages 9–12)</option>
            <option value="teen-ya">Teen / YA (Ages 13–17)</option>
            <option value="adult">Adult Reader (Ages 18+)</option>
          </select>
        </div>
      </div>

      {/* Avatar Color Swatch Picker */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-2">
          Avatar Color
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          {PROFILE_AVATAR_TONE_OPTIONS.map((opt) => {
            const isSelected = avatarTone === opt.id;
            const toneStyle = AVATAR_TONES[opt.id] || AVATAR_TONES.teal;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAvatarTone(opt.id)}
                aria-label={`Select ${opt.label} color`}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${toneStyle} ${
                  isSelected
                    ? 'ring-3 ring-offset-2 ring-forest-700 dark:ring-[#5ED3DA] scale-110'
                    : 'opacity-80 hover:opacity-100'
                }`}
              >
                {isSelected && <Icon name="check" className="w-4 h-4 text-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderInterestsAndRulesFields = () => (
    <div className="space-y-4">
      {/* Favorite Topics */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-2">
          Favorite Topics &amp; Themes
        </label>
        <div className="flex flex-wrap gap-1.5">
          {allTopicOptions.map((topic) => {
            const isSelected = favoriteTopics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                onClick={() => handleToggleTopic(topic)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs'
                    : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-700 dark:text-slate-300'
                }`}
              >
                #{topic}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 mt-2.5">
          <input
            type="text"
            value={customTopicDraft}
            onChange={(e) => setCustomTopicDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomTopic();
              }
            }}
            placeholder="Add custom interest (e.g. ocean, cooking)…"
            className="flex-1 px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-white placeholder:text-stone-ink/60 dark:placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-forest-700"
          />
          <button
            type="button"
            onClick={handleAddCustomTopic}
            className="px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white"
          >
            Add
          </button>
        </div>
      </div>

      {/* Shelf Rules Defaults */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
            Default Shelf Books
          </label>
          <input
            type="number"
            min={3}
            max={15}
            value={defaultRotationSize}
            onChange={(e) => setDefaultRotationSize(Number(e.target.value))}
            className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
            Cooldown (Days)
          </label>
          <input
            type="number"
            min={0}
            max={90}
            value={cooldownDays}
            onChange={(e) => setCooldownDays(Number(e.target.value))}
            className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold text-forest-900 dark:text-white"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-form-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg sm:max-w-xl bg-ivory dark:bg-night-900 rounded-t-3xl sm:rounded-2xl border border-linen-200 dark:border-night-700 shadow-2xl px-5 pt-3 pb-5 sm:p-6 my-auto max-h-[92vh] flex flex-col pb-safe sm:pb-6"
      >
        <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mb-3 shrink-0 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center font-bold shrink-0">
              <Icon name="profiles" className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="profile-form-title"
                className="font-display text-lg font-bold text-forest-900 dark:text-white truncate"
              >
                {existingProfile ? `Edit ${existingProfile.name}’s Profile` : 'Add Reader Profile'}
              </h2>
              {isGuidedSteps && (
                <p className="text-[11px] font-medium text-stone-ink dark:text-slate-400">
                  Step {wizardStep} of 2 · {wizardStep === 1 ? 'Reader details & stage' : 'Interests & shelf rules'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canUseWizard && (
              <button
                type="button"
                onClick={() => setWizardMode((m) => !m)}
                className="text-[11px] font-semibold text-forest-800 dark:text-[#5ED3DA] hover:underline px-2 py-1"
              >
                {wizardMode ? 'Full Form' : 'Guided Steps'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close profile form"
              className="min-h-[48px] min-w-[48px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-linen-100 dark:hover:bg-night-800 transition-all active:scale-95 flex items-center justify-center"
            >
              <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 py-4 space-y-5">
          {isGuidedSteps ? (
            wizardStep === 1 ? (
              renderIdentityFields()
            ) : (
              renderInterestsAndRulesFields()
            )
          ) : (
            <>
              {renderIdentityFields()}
              <div className="pt-2 border-t border-linen-200/70 dark:border-night-800">
                {renderInterestsAndRulesFields()}
              </div>
            </>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
            <div>
              {isGuidedSteps && wizardStep === 2 && (
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="min-h-[48px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-700 dark:text-slate-300 hover:bg-linen-100 dark:hover:bg-night-800 active:scale-[0.98] transition-all"
                >
                  ← Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] sm:min-h-[38px] px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-slate-400 hover:bg-linen-100 dark:hover:bg-night-800 active:scale-[0.98] transition-all"
              >
                Cancel
              </button>

              {isGuidedSteps && wizardStep === 1 ? (
                <button
                  type="button"
                  onClick={handleWizardNext}
                  className="min-h-[48px] sm:min-h-[38px] px-5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shadow-xs transition-all active:scale-[0.98]"
                >
                  Next: Interests →
                </button>
              ) : (
                <button
                  type="submit"
                  className="min-h-[48px] sm:min-h-[38px] px-5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shadow-xs transition-all active:scale-[0.98]"
                >
                  {existingProfile ? 'Save Changes' : 'Create Reader Profile'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
