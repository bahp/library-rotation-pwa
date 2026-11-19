import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { BottomNav } from './BottomNav.js';
import { Toast } from '../common/Toast.js';
import { ProfileSwitcherSheet } from './ProfileSwitcherSheet.js';
import { NotificationCenterModal } from './NotificationCenterModal.js';
import { Icon } from '../common/Icon.js';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { pwaStatus, sidebarCollapsed } = useApp();

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-canvas text-ink transition-colors selection:bg-primary selection:text-primary-fg overflow-x-clip">
      {/* Fixed iOS/PWA Top Safe-Area Curtain */}
      <div
        aria-hidden="true"
        data-safe-top-cover="true"
        className={`fixed top-0 inset-x-0 ${
          sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-64'
        } h-safe-top z-40 pointer-events-none bg-surface transition-[left] duration-200 ease-out`}
      />

      {/* Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-fg focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Desktop Left Navigation Sidebar */}
      <Sidebar />

      {/* Main Column Container offset by Sidebar width on lg+ */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
        } transition-[padding] duration-200 ease-out`}
      >
        {/* Top Utility Header */}
        <Header />

        {/* Spacer matching fixed top header + env(safe-area-inset-top) */}
        <div aria-hidden="true" data-header-spacer="true" className="w-full shrink-0 pt-safe">
          <div className="h-14 sm:h-16" />
        </div>

        {/* Offline Status Banner */}
        {!pwaStatus.isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="bg-surface-elevated border-b border-accent/40 text-ink text-xs font-medium px-4 py-1.5 text-center flex items-center justify-center gap-2 z-20"
          >
            <Icon name="info" className="w-4 h-4 shrink-0 text-accent" />
            <span>You are currently offline. Local family library &amp; scanner work 100% offline.</span>
          </div>
        )}

        {/* Main Landmark */}
        <div className="flex-1 w-full min-w-0 px-safe flex flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 w-full min-w-0 max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8 mb-safe-nav focus:outline-none"
          >
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav />

      {/* Global Toast */}
      <Toast />

      {/* Profile Switcher Sheet */}
      <ProfileSwitcherSheet />

      {/* Notification Center & History Modal */}
      <NotificationCenterModal />
    </div>
  );
};
