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

  const handleGoToSettings = () => {
    setIsProfileSwitcherOpen(false);
    navigate('settings');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-switcher-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setIsProfileSwitcherOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md bg-surface rounded-t-2xl sm:rounded-xl border border-edge shadow-2xl px-5 pt-3 pb-5 sm:p-6 pb-safe sm:pb-6"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between pb-3 border-b border-edge-subtle">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-surface-elevated border border-edge text-primary flex items-center justify-center">
              <Icon name="profiles" className="w-4 h-4" />
            </span>
            <h2 id="profile-switcher-title" className="font-display text-xl font-semibold text-ink">
              Reader Profiles
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setIsProfileSwitcherOpen(false)}
            aria-label="Close reader switcher"
            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] p-2 sm:p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <p className="text-xs text-ink-secondary mt-2.5 mb-4">
          Select which child’s reading shelf, stage, and recommendations you want to view.
        </p>

        {/* Profiles List */}
        <div className="space-y-2 mb-4 max-h-[42vh] overflow-y-auto">
          {state.profiles.length > 0 ? (
            state.profiles.map((profile) => {
              const isActive = profile.id === state.activeProfileId;
              const toneClass = AVATAR_TONES[profile.avatarTone || 'teal'] || AVATAR_TONES.teal;
              const initial = profile.name.charAt(0).toUpperCase();
              const ageLabel = formatProfileAgeLabel(profile);

              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => handleSelectProfile(profile.id)}
                  className={`min-h-[56px] w-full p-3 rounded-lg border flex items-center justify-between text-left transition-all active:scale-[0.98] cursor-pointer ${
                    isActive
                      ? 'border-primary bg-surface-elevated ring-1 ring-primary/30'
                      : 'border-edge hover:border-primary/40 bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-xs ${toneClass}`}
                    >
                      {initial}
                    </span>
                    <div>
                      <h3 className="font-display font-semibold text-base text-ink leading-snug">
                        {profile.name}
                      </h3>
                      <p className="text-xs text-ink-secondary">
                        {ageLabel ? `${ageLabel} · ` : ''}
                        {formatReadingStage(profile.readingStage)}
                      </p>
                    </div>
                  </div>

                  {isActive && (
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-fg flex items-center justify-center">
                      <Icon name="check" className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="rounded-xl bg-surface-subtle border border-edge p-4 text-center">
              <p className="text-xs text-ink-secondary">
                No reader profiles yet. Add a reader to personalize shelves.
              </p>
            </div>
          )}
        </div>

        {/* Profile Actions */}
        <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleGoToProfiles}
            className="min-h-[44px] sm:min-h-[36px] px-2 text-xs font-semibold text-ink-secondary hover:text-ink transition-colors cursor-pointer"
          >
            Manage Profiles…
          </button>

          <button
            type="button"
            onClick={handleOpenAddForm}
            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-[0.98] shadow-xs cursor-pointer"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>Add Child Profile</span>
          </button>
        </div>

        {/* Settings Link at Bottom */}
        <div className="mt-3 pt-3 border-t border-edge-subtle">
          <button
            type="button"
            data-action="open-settings-from-sheet"
            onClick={handleGoToSettings}
            className="min-h-[52px] w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle hover:bg-surface-elevated active:scale-[0.99] border border-edge flex items-center justify-between gap-3 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-surface border border-edge text-ink-secondary flex items-center justify-center shrink-0">
                <Icon name="settings" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-ink leading-tight">
                  Settings
                </span>
                <span className="block text-[11px] text-ink-secondary truncate mt-0.5">
                  Themes, book providers &amp; backups
                </span>
              </div>
            </div>
            <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
