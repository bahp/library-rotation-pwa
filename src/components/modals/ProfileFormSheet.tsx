import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { PROFILE_AVATAR_TONE_OPTIONS, AVATAR_TONES } from '../../config/index.js';
import {
  computeAgeFromBirthDate,
  formatReadingStage,
  inferReadingStageFromAge,
} from '../../types/models.js';
import type { ReadingStage } from '../../types/models.js';

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

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [readingStage, setReadingStage] = useState<ReadingStage>('picture-book');
  const [avatarTone, setAvatarTone] = useState('teal');
  const [favoriteTopics, setFavoriteTopics] = useState<string[]>([]);
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
    } else {
      setName('');
      setBirthDate('');
      setReadingStage('picture-book');
      setAvatarTone('teal');
      setFavoriteTopics(['bedtime', 'animals']);
      setDefaultRotationSize(5);
      setCooldownDays(14);
    }
    setError('');
  }, [existingProfile, isOpen]);

  if (!isOpen) return null;

  const computedAge = birthDate ? computeAgeFromBirthDate(birthDate) : null;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a reader name.');
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-form-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg bg-ivory dark:bg-night-900 rounded-t-3xl sm:rounded-2xl border border-linen-200 dark:border-night-700 shadow-2xl p-5 sm:p-6 my-auto max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center font-bold">
              <Icon name="profiles" className="w-4 h-4" />
            </span>
            <h2 id="profile-form-title" className="font-display text-lg font-bold text-forest-900 dark:text-white">
              {existingProfile ? `Edit ${existingProfile.name}’s Profile` : 'Add Child Reader'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile form"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-linen-100 dark:hover:bg-night-800 transition-colors"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1">
              Child Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maya, Lucas, Leo"
              className="w-full px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700 text-forest-900 dark:text-white"
            />
          </div>

          {/* Birth Date Input with exact text-left and px-3.5 padding */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="profile-birth-date"
                className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400"
              >
                Birth Date (Auto-Computes Age)
              </label>
              {computedAge !== null && (
                <span className="text-xs font-bold text-forest-800 dark:text-[#5ED3DA]">
                  {computedAge} years old
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
            </select>
          </div>

          {/* Avatar Color Swatch Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-2">
              Avatar Color
            </label>
            <div className="flex items-center gap-3">
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
                      isSelected ? 'ring-3 ring-offset-2 ring-forest-700 dark:ring-[#5ED3DA] scale-110' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {isSelected && <Icon name="check" className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Favorite Topics */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-2">
              Favorite Topics & Themes
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_TOPICS.map((topic) => {
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
          </div>

          {/* Shelf Rules Defaults */}
          <div className="grid grid-cols-2 gap-3 pt-2">
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
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold"
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
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm font-semibold"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-4 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-slate-400 hover:bg-linen-100 dark:hover:bg-night-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shadow-xs transition-colors"
            >
              {existingProfile ? 'Save Changes' : 'Create Reader Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
