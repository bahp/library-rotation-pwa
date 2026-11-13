import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Header } from './Header.js';
import { BottomNav } from './BottomNav.js';
import { Toast } from '../common/Toast.js';
import { ProfileSwitcherSheet } from './ProfileSwitcherSheet.js';
import { Icon } from '../common/Icon.js';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { pwaStatus } = useApp();

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-linen-50 text-[#1A2423] dark:bg-night-950 dark:text-[#F4EFE6] transition-colors selection:bg-[#1F6E75] selection:text-white">
      {/* Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-forest-900 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Offline Status Banner */}
      {!pwaStatus.isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white text-xs font-semibold px-4 py-1.5 text-center flex items-center justify-center gap-2 shadow-xs z-40"
        >
          <Icon name="info" className="w-4 h-4 shrink-0" />
          <span>You are currently offline. Local family library & scanner work 100% offline.</span>
        </div>
      )}

      {/* Top Header */}
      <Header />

      {/* Main Landmark */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 mb-safe-nav focus:outline-none"
      >
        {children}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav />

      {/* Global Toast */}
      <Toast />

      {/* Profile Switcher Sheet */}
      <ProfileSwitcherSheet />
    </div>
  );
};
