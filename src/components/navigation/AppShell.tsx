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
      {/* Fixed iOS/PWA Top Safe-Area Curtain: fills notch/clock space with solid header color even on rubber-band overscroll */}
      <div
        aria-hidden="true"
        data-safe-top-cover="true"
        className="fixed top-0 inset-x-0 h-safe-top z-40 pointer-events-none bg-ivory dark:bg-night-900"
      />

      {/* Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-forest-900 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Top Header */}
      <Header />

      {/* Spacer matching fixed top header + env(safe-area-inset-top) so page content starts cleanly below the notch */}
      <div aria-hidden="true" data-header-spacer="true" className="w-full shrink-0 pt-safe">
        <div className="h-14 sm:h-16" />
      </div>

      {/* Offline Status Banner */}
      {!pwaStatus.isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white text-xs font-semibold px-4 py-1.5 text-center flex items-center justify-center gap-2 shadow-xs z-20"
        >
          <Icon name="info" className="w-4 h-4 shrink-0" />
          <span>You are currently offline. Local family library & scanner work 100% offline.</span>
        </div>
      )}

      {/* Main Landmark */}
      <div className="flex-1 w-full px-safe flex flex-col">
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 mb-safe-nav focus:outline-none"
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav />

      {/* Global Toast */}
      <Toast />

      {/* Profile Switcher Sheet */}
      <ProfileSwitcherSheet />
    </div>
  );
};
