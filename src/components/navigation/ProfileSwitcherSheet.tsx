import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { formatProfileAgeLabel, formatReadingStage } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

export const ProfileSwitcherSheet: React.FC = () => {
  const {
    state,
    store,
    isProfileSwitcherOpen,
    setIsProfileSwitcherOpen,
    setIsProfileFormOpen,
    setEditingProfileId,
    navigate,
  } = useApp();

  useBodyScrollLock(isProfileSwitcherOpen);

  if (!isProfileSwitcherOpen) return null;

  const handleSelectProfile = (profileId: string) => {
    store.setActiveProfile(profileId);
    setIsProfileSwitcherOpen(false);
  };

  const handleOpenAddForm = () => {
    setEditingProfileId(null);
    setIsProfileSwitcherOpen(false);
    setIsProfileFormOpen(true);
  };

  const handleGoToProfiles = () => {
    setIsProfileSwitcherOpen(false);
    navigate('profiles');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-switcher-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setIsProfileSwitcherOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md bg-ivory dark:bg-night-900 rounded-t-3xl sm:rounded-2xl border border-linen-200 dark:border-night-700 shadow-2xl px-5 pt-3 pb-5 sm:p-6 pb-safe sm:pb-6"
      >
        <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center font-bold">
              <Icon name="profiles" className="w-4 h-4" />
            </span>
            <h2 id="profile-switcher-title" className="font-display text-lg font-bold text-forest-900 dark:text-white">
              Reader Profiles
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setIsProfileSwitcherOpen(false)}
            aria-label="Close reader switcher"
            className="min-h-[48px] min-w-[48px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-linen-100 dark:hover:bg-night-800 transition-all active:scale-95 flex items-center justify-center"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <p className="text-xs text-stone-ink dark:text-slate-400 mt-2 mb-4">
          Select which child’s reading shelf, stage, and recommendations you want to view.
        </p>

        {/* Profiles List */}
        <div className="space-y-2 mb-4">
          {state.profiles.map((profile) => {
            const isActive = profile.id === state.activeProfileId;
            const toneClass = AVATAR_TONES[profile.avatarTone || 'teal'] || AVATAR_TONES.teal;
            const initial = profile.name.charAt(0).toUpperCase();
            const ageLabel = formatProfileAgeLabel(profile);

            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelectProfile(profile.id)}
                className={`min-h-[56px] w-full p-3 rounded-xl border flex items-center justify-between text-left transition-all active:scale-[0.98] ${
                  isActive
                    ? 'border-forest-700 dark:border-[#5ED3DA] bg-forest-700/5 dark:bg-[#5ED3DA]/10 ring-1 ring-forest-700/20'
                    : 'border-linen-200 dark:border-night-800 hover:border-linen-300 dark:hover:border-night-700 bg-white dark:bg-night-800/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-xs ${toneClass}`}
                  >
                    {initial}
                  </span>
                  <div>
                    <h3 className="font-display font-bold text-sm text-forest-900 dark:text-white">
                      {profile.name}
                    </h3>
                    <p className="text-xs text-stone-ink dark:text-slate-400">
                      {ageLabel ? `${ageLabel} · ` : ''}
                      {formatReadingStage(profile.readingStage)}
                    </p>
                  </div>
                </div>

                {isActive && (
                  <span className="w-6 h-6 rounded-full bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 flex items-center justify-center">
                    <Icon name="check" className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleGoToProfiles}
            className="min-h-[48px] sm:min-h-[36px] px-2 text-xs font-semibold text-stone-600 dark:text-slate-400 hover:text-forest-900 dark:hover:text-white transition-colors"
          >
            Manage Profiles…
          </button>

          <button
            type="button"
            onClick={handleOpenAddForm}
            className="min-h-[48px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white dark:bg-brand-dark dark:hover:bg-brand-dark-hover dark:text-night-950 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-xs"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>Add Child Profile</span>
          </button>
        </div>
      </div>
    </div>
  );
};
