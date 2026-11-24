import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { createAppStore } from '../core/store.js';
import { createStorageAdapter, hasQaUserSnapshot } from '../core/storage.js';
import { createRouter } from '../core/router.js';
import { createPwaManager } from '../features/pwa/pwa-manager.js';
import { createCatalogService } from '../features/catalog/catalog-service.js';
import { createScannerController } from '../features/scan/scanner-controller.js';
import { t } from '../config/i18n.js';
import type { AppState, ChildProfile, RotationShelf, RouteId } from '../types/models.js';

export interface ManualAddPrefill {
  title?: string;
  authors?: string;
  isbn?: string;
}

// Singleton instances — browser boots into clean onboarding on brand-new visits
export const storageAdapter = createStorageAdapter({ seedOnEmpty: false });
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
  needsOnboarding: boolean;
  isOnboardingPreview: boolean;
  hasQaSnapshot: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  globalSearchQuery: string;
  setGlobalSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  submitGlobalSearch: (query: string) => void;

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
  isNotificationCenterOpen: boolean;
  setIsNotificationCenterOpen: (open: boolean) => void;
  unreadNotificationCount: number;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  manualAddModal: { isOpen: boolean; prefill?: ManualAddPrefill };
  openManualAddModal: (prefill?: ManualAddPrefill) => void;
  closeManualAddModal: () => void;

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

  // Desktop sidebar collapse state
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebarCollapsed: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>(() => store.getState());
  const [isReady, setIsReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState(() => router.getCurrent());
  const [toast, setToast] = useState(() => store.getToast());
  const [pwaStatus, setPwaStatus] = useState(() => pwaManager.getStatus());
  const [globalSearchQuery, setGlobalSearchQuery] = useState(() => {
    return router.getCurrent().params.get('q') || '';
  });

  // Modal states
  const [inspectedBookId, setInspectedBookId] = useState<string | null>(null);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [manualAddModal, setManualAddModal] = useState<{
    isOpen: boolean;
    prefill?: ManualAddPrefill;
  }>({ isOpen: false });
  const openManualAddModal = useCallback((prefill?: ManualAddPrefill) => {
    setManualAddModal({ isOpen: true, prefill });
  }, []);
  const closeManualAddModal = useCallback(() => {
    setManualAddModal({ isOpen: false });
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('lr_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('lr_sidebar_collapsed', next ? '1' : '0');
        }
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

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
          // Handled inside ScanView or Onboarding Step 3
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
      const qParam = current.params.get('q');
      if (qParam !== null) {
        setGlobalSearchQuery(qParam);
      }
      // Close transient sheets on route change
      setIsFilterDrawerOpen(false);
      setIsProfileSwitcherOpen(false);
      setIsSearchOpen(false);
      setManualAddModal({ isOpen: false });
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

  useEffect(() => {
    if (!isReady) return;
    void store.syncNotifications();
  }, [
    isReady,
    appState.activeProfileId,
    appState.rotations.length,
    appState.customPresets?.length,
    appState.presetOverrides?.length,
    appState.settings?.presetAlertDaysBefore,
    appState.settings?.presetAlertDaysAfter,
  ]);

  const navigate = useCallback((route: RouteId, query?: Record<string, string>) => {
    router.navigate(route, query);
  }, []);

  const submitGlobalSearch = useCallback((rawQuery: string) => {
    const trimmed = rawQuery.trim();
    setGlobalSearchQuery(rawQuery);
    if (trimmed) {
      router.navigate('library', { q: trimmed });
    } else {
      router.navigate('library');
    }
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

  const onboardingState = appState.settings?.onboarding;
  const isOnboardingPreview = Boolean(onboardingState?.previewMode);
  const needsOnboarding = Boolean(
    isOnboardingPreview ||
      onboardingState?.status === 'pending' ||
      onboardingState?.status === 'in_progress'
  );
  const hasQaSnapshot = useMemo(() => {
    void appState.updatedAt;
    return hasQaUserSnapshot();
  }, [appState.updatedAt]);

  const translate = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return t(appState.settings.language || 'en', key, vars);
    },
    [appState.settings.language]
  );

  const unreadNotificationCount = useMemo(() => {
    const list = Array.isArray(appState.notifications) ? appState.notifications : [];
    return list.filter((n) => !n.readAt && !n.dismissed).length;
  }, [appState.notifications]);

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
    needsOnboarding,
    isOnboardingPreview,
    hasQaSnapshot,
    t: translate,
    globalSearchQuery,
    setGlobalSearchQuery,
    submitGlobalSearch,
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
    isNotificationCenterOpen,
    setIsNotificationCenterOpen,
    unreadNotificationCount,
    isSearchOpen,
    setIsSearchOpen,
    manualAddModal,
    openManualAddModal,
    closeManualAddModal,
    aiTagModal,
    setAiTagModal,
    aiCuratorModal,
    setAiCuratorModal,
    aiRecsModal,
    setAiRecsModal,
    rotationEditor,
    setRotationEditor,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
        <p className="text-sm font-medium text-ink-secondary">Loading family library…</p>
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
