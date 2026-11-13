import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ProfileFormSheet } from '../modals/ProfileFormSheet.js';
import { AVATAR_TONES } from '../../config/index.js';
import { formatProfileAgeLabel, formatReadingStage } from '../../types/models.js';

export const ProfilesView: React.FC = () => {
  const {
    state,
    store,
    isProfileFormOpen,
    setIsProfileFormOpen,
    editingProfileId,
    setEditingProfileId,
    navigate,
  } = useApp();

  const handleEditProfile = (id: string) => {
    setEditingProfileId(id);
    setIsProfileFormOpen(true);
  };

  const handleAddProfile = () => {
    setEditingProfileId(null);
    setIsProfileFormOpen(true);
  };

  const handleDeleteProfile = async (id: string) => {
    if (state.profiles.length <= 1) {
      store.notify('At least one reader profile is required.', 'error');
      return;
    }
    const prof = state.profiles.find((p) => p.id === id);
    if (
      window.confirm(
        `Are you sure you want to delete ${prof?.name || 'this reader'} and their saved rotations?`
      )
    ) {
      await store.deleteProfile(id);
    }
  };

  const handleSwitchProfile = (id: string) => {
    store.setActiveProfile(id);
  };

  return (
    <div className="w-full space-y-5 text-left max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            Family Readers
          </p>
          <h1
            id="profiles-heading"
            className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5"
          >
            Reader Profiles
          </h1>
        </div>

        <button
          type="button"
          data-action="open-add-profile-sheet"
          onClick={handleAddProfile}
          aria-label="Add new reader profile"
          className="min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-2xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Icon name="plus" className="w-4 h-4" />
          <span className="hidden sm:inline">Add Reader Profile</span>
        </button>
      </div>

      {/* Profiles Cards */}
      <div className="space-y-3.5">
        {state.profiles.map((profile) => {
          const isActive = profile.id === state.activeProfileId;
          const toneClass = AVATAR_TONES[profile.avatarTone || 'teal'] || AVATAR_TONES.teal;
          const initial = (profile.name || '?').slice(0, 1).toUpperCase();
          const ageLabel = formatProfileAgeLabel(profile);
          const savedCount = state.rotations.filter((r) => r.profileId === profile.id).length;
          const readCount = profile.readHistoryBookIds?.length || 0;

          return (
            <article
              key={profile.id}
              className={`rounded-2xl bg-ivory dark:bg-night-900 border ${
                isActive
                  ? 'border-forest-700/45 dark:border-[#5ED3DA]/40'
                  : 'border-linen-200 dark:border-night-800'
              } p-4 sm:p-5 flex flex-col justify-between gap-3.5`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {/* Large Avatar Badge */}
                  <span
                    className={`inline-flex items-center justify-center font-display font-bold shrink-0 select-none w-11 h-11 rounded-2xl text-lg shadow-sm ${toneClass}`}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <h2 className="font-display text-lg font-bold text-forest-900 dark:text-white truncate">
                        {profile.name}
                      </h2>
                      {isActive && (
                        <span className="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]">
                          · Current Reader
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      <span className="font-semibold text-forest-900 dark:text-slate-200">
                        {ageLabel}
                      </span>
                      {profile.birthDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">DOB {profile.birthDate}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{formatReadingStage(profile.readingStage)}</span>
                    </div>

                    <p className="text-xs text-stone-ink dark:text-slate-300 mt-1.5">
                      Topics:{' '}
                      {profile.favoriteTopics && profile.favoriteTopics.length > 0
                        ? profile.favoriteTopics.join(' · ')
                        : 'All topics'}
                    </p>

                    <p className="text-[11px] text-stone-ink dark:text-slate-400 font-mono-tabular mt-1">
                      {profile.defaultRotationSize || 5} books/shelf · {profile.cooldownDays ?? 14}d cooldown ·{' '}
                      {savedCount} {savedCount === 1 ? 'shelf' : 'shelves'} · {readCount} read
                    </p>
                  </div>
                </div>

                {/* Edit & Delete Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    data-action="open-edit-profile-sheet"
                    data-profile-id={profile.id}
                    onClick={() => handleEditProfile(profile.id)}
                    aria-label={`Edit profile ${profile.name}`}
                    title="Edit profile"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 transition-colors"
                  >
                    <Icon name="edit" className="w-4 h-4" />
                  </button>

                  {state.profiles.length > 1 && (
                    <button
                      type="button"
                      data-action="delete-profile"
                      data-profile-id={profile.id}
                      onClick={() => handleDeleteProfile(profile.id)}
                      aria-label={`Remove profile ${profile.name}`}
                      title="Remove profile"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-stone-ink hover:text-rose-700 hover:bg-rose-50 dark:text-slate-400 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Action Row */}
              <div className="pt-2.5 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-end gap-2">
                {isActive ? (
                  <button
                    type="button"
                    onClick={() => navigate('home')}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center justify-center transition-colors whitespace-nowrap"
                  >
                    View {profile.name}’s Shelf
                  </button>
                ) : (
                  <button
                    type="button"
                    data-action="switch-profile"
                    data-profile-id={profile.id}
                    onClick={() => handleSwitchProfile(profile.id)}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    Switch to {profile.name}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Profile Form Sheet */}
      <ProfileFormSheet
        isOpen={isProfileFormOpen}
        editingProfileId={editingProfileId}
        onClose={() => setIsProfileFormOpen(false)}
      />
    </div>
  );
};
