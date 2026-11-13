import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { createAppStore } from '../core/store.js';
import { createStorageAdapter } from '../core/storage.js';
import { createRouter } from '../core/router.js';
import { createPwaManager } from '../features/pwa/pwa-manager.js';
import { createCatalogService } from '../features/catalog/catalog-service.js';
import { createScannerController } from '../features/scan/scanner-controller.js';
import { t } from '../config/i18n.js';
import type { AppState, Book, ChildProfile, RotationShelf, RouteId } from '../types/models.js';

// Singleton instances
export const storageAdapter = createStorageAdapter();
export const store = createAppStore(storageAdapter);
export const router = createRouter();
export const pwaManager = createPwaManager();
export const catalogService = createCatalogService();

export interface AppContextType {
  state: AppState;
  store: ReturnType<typeof createAppStore>;
  currentRoute: RouteId;
  routeParams: URLSearchParams;
  navigate: (route: RouteId, query?: Record<string, string>) => void;
  toast: { id: string; message: string; tone: 'success' | 'error' | 'info' } | null;
  pwaStatus: ReturnType<typeof pwaManager.getStatus>;
  scanner: ReturnType<typeof createScannerController>;
  catalogService: ReturnType<typeof createCatalogService>;
  activeProfile: ChildProfile | null;
  activeRotation: RotationShelf | null;
  t: (key: string, vars?: Record<string, string | number>) => string;

  // Global modals and drawers
  inspectedBookId: string | null;
  setInspectedBookId: (id: string | null) => void;
  isProfileSwitcherOpen: boolean;
  setIsProfileSwitcherOpen: (open: boolean) => void;
  isProfileFormOpen: boolean;
  setIsProfileFormOpen: (open: boolean) => void;
  editingProfileId: string | null;
  setEditingProfileId: (id: string | null) => void;
  isWelcomeModalOpen: boolean;
  setIsWelcomeModalOpen: (open: boolean) => void;
  isFilterDrawerOpen: boolean;
  setIsFilterDrawerOpen: (open: boolean) => void;

  // AI Modals
  aiTagModal: { isOpen: boolean; bookId: string | null };
  setAiTagModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; bookId: string | null }>>;
  aiCuratorModal: { isOpen: boolean };
  setAiCuratorModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean }>>;
  aiRecsModal: { isOpen: boolean };
  setAiRecsModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean }>>;

  // Rotation editor modal
  rotationEditor: {
    modalMode: 'replace' | 'add' | null;
    rotationId: string | null;
    targetBookId: string | null;
  };
  setRotationEditor: React.Dispatch<
    React.SetStateAction<{
      modalMode: 'replace' | 'add' | null;
      rotationId: string | null;
      targetBookId: string | null;
    }>
  >;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>(() => store.getState());
  const [isReady, setIsReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState(() => router.getCurrent());
  const [toast, setToast] = useState(() => store.getToast());
  const [pwaStatus, setPwaStatus] = useState(() => pwaManager.getStatus());

  // Modal states
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // AI modals
  const [aiTagModal, setAiTagModal] = useState<{ isOpen: boolean; bookId: string | null }>({
    isOpen: false,
    bookId: null,
  });
  const [aiCuratorModal, setAiCuratorModal] = useState<{ isOpen: boolean }>({ isOpen: false });
  const [aiRecsModal, setAiRecsModal] = useState<{ isOpen: boolean }>({ isOpen: false });

  // Rotation editor modal
  const [rotationEditor, setRotationEditor] = useState<{
    modalMode: 'replace' | 'add' | null;
    rotationId: string | null;
    targetBookId: string | null;
  }>({
    modalMode: null,
    rotationId: null,
    targetBookId: null,
  });

  // Scanner instance
  const scanner = useMemo(() => {
    return createScannerController({
      onStateChange: () => {},
      onLock: async (lock) => {
        if (lock.kind === 'isbn' && lock.isbn13) {
          // Handled inside ScanView
        }
      },
    });
  }, []);

  useEffect(() => {
    let unmounted = false;

    async function bootstrap() {
      await store.init();
      if (!unmounted) {
        setAppState(store.getState());
        setIsReady(true);
      }
    }

    bootstrap();
    router.start();

    const unsubStore = store.subscribe(() => {
      setAppState(store.getState());
      setToast(store.getToast());
    });

    const unsubRouter = router.subscribe((current) => {
      setRouteInfo(current);
      // Close transient sheets on route change
      setIsFilterDrawerOpen(false);
      setIsProfileSwitcherOpen(false);
    });

    const handlePwaUpdate = () => {
      setPwaStatus(pwaManager.getStatus());
    };
    window.addEventListener('online', handlePwaUpdate);
    window.addEventListener('offline', handlePwaUpdate);

    return () => {
      unmounted = true;
      unsubStore();
      unsubRouter();
      window.removeEventListener('online', handlePwaUpdate);
      window.removeEventListener('offline', handlePwaUpdate);
    };
  }, []);

  const navigate = useCallback((route: RouteId, query?: Record<string, string>) => {
    router.navigate(route, query);
  }, []);

  const activeProfile = useMemo(() => {
    return (
      appState.profiles.find((p) => p.id === appState.activeProfileId) ||
      appState.profiles[0] ||
      null
    );
  }, [appState.profiles, appState.activeProfileId]);

  const activeRotation = useMemo(() => {
    if (!activeProfile) return null;
    return (
      appState.rotations.find(
        (r) => r.profileId === activeProfile.id && r.status === 'active'
      ) || null
    );
  }, [appState.rotations, activeProfile]);

  const translate = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return t(appState.settings.language || 'en', key, vars);
    },
    [appState.settings.language]
  );

  const contextValue: AppContextType = {
    state: appState,
    store,
    currentRoute: routeInfo.route,
    routeParams: routeInfo.params,
    navigate,
    toast,
    pwaStatus,
    scanner,
    catalogService,
    activeProfile,
    activeRotation,
    t: translate,
    inspectedBookId,
    setInspectedBookId,
    isProfileSwitcherOpen,
    setIsProfileSwitcherOpen,
    isProfileFormOpen,
    setIsProfileFormOpen,
    editingProfileId,
    setEditingProfileId,
    isWelcomeModalOpen,
    setIsWelcomeModalOpen,
    isFilterDrawerOpen,
    setIsFilterDrawerOpen,
    aiTagModal,
    setAiTagModal,
    aiCuratorModal,
    setAiCuratorModal,
    aiRecsModal,
    setAiRecsModal,
    rotationEditor,
    setRotationEditor,
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linen-50 dark:bg-night-950 p-6">
        <p className="text-sm font-medium text-stone-ink dark:text-slate-400">Loading family library…</p>
      </div>
    );
  }

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
