import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { ReaderProfilesSection } from '../profiles/ReaderProfilesSection.js';
import { ProfileFormSheet } from '../modals/ProfileFormSheet.js';

export const ProfilesView: React.FC = () => {
  const {
    isProfileFormOpen,
    setIsProfileFormOpen,
    editingProfileId,
  } = useApp();

  return (
    <div className="w-full max-w-6xl mx-auto">
      <ReaderProfilesSection defaultViewMode="grid" />
      <ProfileFormSheet
        isOpen={isProfileFormOpen}
        editingProfileId={editingProfileId}
        onClose={() => setIsProfileFormOpen(false)}
      />
    </div>
  );
};
