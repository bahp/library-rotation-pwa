import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.js';
import { AppShell } from './components/navigation/AppShell.js';
import { HomeView } from './components/views/HomeView.js';
import { LibraryView } from './components/views/LibraryView.js';
import { ScanView } from './components/views/ScanView.js';
import { RotationsView } from './components/views/RotationsView.js';
import { PresetsView } from './components/views/PresetsView.js';
import { PlayView } from './components/views/PlayView.js';
import { ProfilesView } from './components/views/ProfilesView.js';
import { SettingsView } from './components/views/SettingsView.js';
import { BookInspectorModal } from './components/modals/BookInspectorModal.js';
import { CoverStudioModal } from './components/modals/CoverStudioModal.js';
import { ProfileFormSheet } from './components/modals/ProfileFormSheet.js';
import { WelcomeSetupModal } from './components/modals/WelcomeSetupModal.js';
import { AiTaggingModal } from './components/modals/AiTaggingModal.js';
import { AiCuratorModal } from './components/modals/AiCuratorModal.js';
import { AiRecommendationsModal } from './components/modals/AiRecommendationsModal.js';

const AppContent: React.FC = () => {
  const {
    currentRoute,
    inspectedBookId,
    setInspectedBookId,
    isProfileFormOpen,
    setIsProfileFormOpen,
    editingProfileId,
    isWelcomeModalOpen,
    setIsWelcomeModalOpen,
    aiTagModal,
    setAiTagModal,
    aiCuratorModal,
    setAiCuratorModal,
    aiRecsModal,
    setAiRecsModal,
  } = useApp();

  const [isCoverStudioOpen, setIsCoverStudioOpen] = useState(false);

  const renderActiveView = () => {
    switch (currentRoute) {
      case 'library':
        return <LibraryView />;
      case 'scan':
        return <ScanView />;
      case 'rotations':
        return <RotationsView />;
      case 'presets':
        return <PresetsView />;
      case 'play':
        return <PlayView />;
      case 'profiles':
        return <ProfilesView />;
      case 'settings':
        return <SettingsView />;
      case 'home':
      default:
        return <HomeView />;
    }
  };

  return (
    <AppShell>
      {renderActiveView()}

      {/* Global Book Inspector Modal */}
      <BookInspectorModal
        bookId={inspectedBookId}
        onClose={() => setInspectedBookId(null)}
        onOpenCoverStudio={() => setIsCoverStudioOpen(true)}
      />

      {/* Cover Studio Modal */}
      <CoverStudioModal
        bookId={inspectedBookId}
        isOpen={isCoverStudioOpen}
        onClose={() => setIsCoverStudioOpen(false)}
      />

      {/* Profile Form Sheet */}
      <ProfileFormSheet
        isOpen={isProfileFormOpen}
        editingProfileId={editingProfileId}
        onClose={() => setIsProfileFormOpen(false)}
      />

      {/* Welcome Setup Modal */}
      <WelcomeSetupModal
        isOpen={isWelcomeModalOpen}
        onClose={() => setIsWelcomeModalOpen(false)}
      />

      {/* AI Modals */}
      <AiTaggingModal
        bookId={aiTagModal.bookId}
        isOpen={aiTagModal.isOpen}
        onClose={() => setAiTagModal({ isOpen: false, bookId: null })}
      />

      <AiCuratorModal
        isOpen={aiCuratorModal.isOpen}
        onClose={() => setAiCuratorModal({ isOpen: false })}
      />

      <AiRecommendationsModal
        isOpen={aiRecsModal.isOpen}
        onClose={() => setAiRecsModal({ isOpen: false })}
      />
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
