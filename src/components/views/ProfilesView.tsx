import React, { useState, useEffect } from 'react';
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

  const [householdDraft, setHouseholdDraft] = useState(state.settings.householdName || '');
  const [isEditingHousehold, setIsEditingHousehold] = useState(false);
  const [confirmDeleteProfileId, setConfirmDeleteProfileId] = useState<string | null>(null);

  useEffect(() => {
    setHouseholdDraft(state.settings.householdName || '');
  }, [state.settings.householdName]);

  const handleEditProfile = (id: string) => {
    setEditingProfileId(id);
    setIsProfileFormOpen(true);
  };

  const handleAddProfile = () => {
    setEditingProfileId(null);
    setIsProfileFormOpen(true);
  };

  const handleSaveHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.updateSettings({ householdName: householdDraft.trim() });
    setIsEditingHousehold(false);
    store.notify('Updated household name.', 'success');
  };

  const handleRequestDeleteProfile = (id: string) => {
    if (state.profiles.length <= 1) {
      store.notify('At least one reader profile is required.', 'error');
      return;
    }
    setConfirmDeleteProfileId(id);
  };

  const handleConfirmDeleteProfile = async (id: string) => {
    await store.deleteProfile(id);
    setConfirmDeleteProfileId(null);
  };

  const handleSwitchProfile = (id: string) => {
    store.setActiveProfile(id);
  };

  const totalOwnedBooks = state.books.filter((b) => b.collectionStatus !== 'wishlist').length;

  return (
    <div className="w-full space-y-6 text-left max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] uppercase tracking-[0.08em]">
            {state.settings.householdName
              ? `${state.settings.householdName} · Family Readers`
              : 'Family Readers'}
          </p>
          <h1
            id="profiles-heading"
            className="font-display text-2xl sm:text-[30px] font-bold tracking-tight text-forest-900 dark:text-white leading-tight mt-0.5"
          >
            Reader Profiles
          </h1>
          <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-1">
            {state.profiles.length} {state.profiles.length === 1 ? 'reader' : 'readers'} ·{' '}
            {totalOwnedBooks} owned books · {state.rotations.length} saved shelves
          </p>
        </div>

        <button
          type="button"
          data-action="open-add-profile-sheet"
          onClick={handleAddProfile}
          aria-label="Add new reader profile"
          className="min-h-[48px] sm:min-h-[44px] min-w-[48px] px-4 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 dark:bg-[#5ED3DA] dark:text-night-950 dark:hover:bg-[#4bc2c9] text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.98] shrink-0"
        >
          <Icon name="plus" className="w-4 h-4" />
          <span>Add Reader Profile</span>
        </button>
      </div>

      {/* Household Banner & Editor */}
      <section className="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-linen-100 dark:bg-night-800 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center shrink-0">
            <Icon name="home" className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400">
              Household or Family Name
            </p>
            <p className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white truncate mt-0.5">
              {state.settings.householdName?.trim() || 'Not set yet (shown on Home shelf)'}
            </p>
          </div>
        </div>

        {isEditingHousehold ? (
          <form onSubmit={handleSaveHousehold} className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              value={householdDraft}
              onChange={(e) => setHouseholdDraft(e.target.value)}
              placeholder="e.g. Rivera Family"
              aria-label="Household or family name"
              className="flex-1 md:w-56 px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs sm:text-sm font-medium text-forest-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-forest-700"
            />
            <button
              type="submit"
              className="min-h-[48px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 dark:bg-[#5ED3DA] dark:text-night-950 text-white text-xs font-bold transition-all active:scale-[0.98]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setHouseholdDraft(state.settings.householdName || '');
                setIsEditingHousehold(false);
              }}
              className="min-h-[48px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-600 dark:text-slate-400 hover:bg-linen-100 dark:hover:bg-night-800 transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingHousehold(true)}
            className="min-h-[48px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 self-start md:self-center transition-all active:scale-[0.98] shrink-0"
          >
            <Icon name="edit" className="w-3.5 h-3.5" />
            <span>{state.settings.householdName ? 'Edit Household Name' : 'Set Household Name'}</span>
          </button>
        )}
      </section>

      {/* Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.profiles.map((profile) => {
          const isActive = profile.id === state.activeProfileId;
          const isConfirmingDelete = confirmDeleteProfileId === profile.id;
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
                  ? 'border-forest-700/45 dark:border-[#5ED3DA]/45 ring-1 ring-forest-700/12 dark:ring-[#5ED3DA]/15'
                  : 'border-linen-200/90 dark:border-night-800'
              } p-5 flex flex-col justify-between gap-4 shadow-2xs hover:shadow-md transition-shadow`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Large Avatar Badge */}
                    <span
                      className={`inline-flex items-center justify-center font-display font-bold shrink-0 select-none w-12 h-12 rounded-2xl text-lg shadow-sm ${toneClass}`}
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
                          <span className="text-[11px] font-bold text-espresso-800 dark:text-[#5ED3DA]">
                            · Active
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
                      </div>
                      <p className="text-xs font-medium text-forest-800 dark:text-slate-300 mt-0.5">
                        {formatReadingStage(profile.readingStage)}
                      </p>
                    </div>
                  </div>

                  {/* Edit & Delete Action Buttons */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      data-action="open-edit-profile-sheet"
                      data-profile-id={profile.id}
                      onClick={() => handleEditProfile(profile.id)}
                      aria-label={`Edit profile ${profile.name}`}
                      title="Edit profile"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 transition-colors"
                    >
                      <Icon name="edit" className="w-4 h-4" />
                    </button>

                    {state.profiles.length > 1 && (
                      <button
                        type="button"
                        data-action="delete-profile"
                        data-profile-id={profile.id}
                        onClick={() => handleRequestDeleteProfile(profile.id)}
                        aria-label={`Remove profile ${profile.name}`}
                        title="Remove profile"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-stone-ink hover:text-rose-700 hover:bg-rose-50 dark:text-slate-400 dark:hover:bg-rose-950/40 transition-colors"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Metadata summary */}
                <div className="space-y-1.5 text-xs">
                  <p className="text-stone-ink dark:text-slate-300 leading-relaxed">
                    <span className="font-semibold text-forest-900 dark:text-white">Topics:</span>{' '}
                    {profile.favoriteTopics && profile.favoriteTopics.length > 0
                      ? profile.favoriteTopics.join(' · ')
                      : 'All topics'}
                  </p>

                  <p className="text-[11px] text-stone-ink dark:text-slate-400 font-mono-tabular">
                    {profile.defaultRotationSize || 5} books/shelf · {profile.cooldownDays ?? 14}d cooldown ·{' '}
                    {savedCount} {savedCount === 1 ? 'shelf' : 'shelves'} · {readCount} read
                  </p>
                </div>

                {/* Inline Delete Confirmation (Zero window.confirm) */}
                {isConfirmingDelete && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 space-y-2">
                    <p className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                      Remove {profile.name} and their saved rotations?
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProfileId(null)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-night-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteProfile(profile.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold"
                      >
                        Confirm Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Row */}
              <div className="pt-3 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleEditProfile(profile.id)}
                  className="text-xs font-semibold text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white transition-colors"
                >
                  Preferences
                </button>

                {isActive ? (
                  <button
                    type="button"
                    onClick={() => navigate('home')}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center justify-center transition-colors whitespace-nowrap"
                  >
                    View {profile.name}’s Shelf
                  </button>
                ) : (
                  <button
                    type="button"
                    data-action="switch-profile"
                    data-profile-id={profile.id}
                    onClick={() => handleSwitchProfile(profile.id)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-forest-900 hover:bg-forest-800 dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-semibold text-white transition-colors whitespace-nowrap"
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
