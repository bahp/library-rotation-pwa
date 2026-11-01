/**
 * @fileoverview Warm editorial responsive application shell:
 * - Compact Top Bar with single-text Brand Wordmark, Desktop Nav, Top Active Reader Avatar Switcher & Top-Right Settings link
 * - Mobile thumb-friendly Fixed Bottom Tab Bar: Home | Library | Scan | Rotations | Play (<= 8% viewport height)
 * - Global Profile Switcher & Add/Edit Profile slide-up bottom sheets
 * - Offline connectivity banner, polite toast notifications, and iOS install guide
 */

import { escapeHtml, formatProfileAgeLabel } from '../../types/models.js';
import { renderIcon } from '../icons.js';
import {
  renderAvatarBadge,
  renderProfileFormSheet,
  renderProfileSwitcherSheet,
} from './profile-sheets.js';

/** @type {Array<{ id: import('../../types/models.js').RouteId, label: string, mobileLabel: string, icon: string, emphasize?: boolean }>} */
const NAV_ITEMS = [
  { id: 'home', label: 'Home', mobileLabel: 'Home', icon: 'home' },
  { id: 'library', label: 'Library', mobileLabel: 'Library', icon: 'library' },
  { id: 'scan', label: 'Scan & Add', mobileLabel: 'Scan', icon: 'scan', emphasize: true },
  { id: 'rotations', label: 'Rotations', mobileLabel: 'Rotations', icon: 'rotations' },
  { id: 'play', label: 'Play', mobileLabel: 'Play', icon: 'dice' },
];

/**
 * Renders the outer responsive shell around the active view HTML.
 * @param {{
 *   activeRoute: import('../../types/models.js').RouteId,
 *   state: import('../../types/models.js').AppState,
 *   toast: { id: string, message: string, tone: 'success' | 'error' | 'info' } | null,
 *   pwaStatus: { isInstallable: boolean, isInstalled: boolean, isIOS: boolean, isOnline: boolean, swReady: boolean, showIosInstructions: boolean },
 *   shellUiState?: {
 *     isProfileSwitcherOpen: boolean,
 *     isProfileFormSheetOpen: boolean,
 *     editingProfileId: string | null,
 *     previewBirthDate?: string
 *   },
 *   contentHtml: string
 * }} props
 * @returns {string}
 */
export function renderAppShell({
  activeRoute,
  state,
  toast,
  pwaStatus,
  shellUiState = {
    isProfileSwitcherOpen: false,
    isProfileFormSheetOpen: false,
    editingProfileId: null,
  },
  contentHtml,
}) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
  const ageLabel = formatProfileAgeLabel(activeProfile);
  const isSettingsActive = activeRoute === 'settings' || activeRoute === 'profiles';

  const desktopNavHtml = NAV_ITEMS.map((item) => {
    const isActive = item.id === activeRoute;
    const activeClasses = isActive
      ? 'text-forest-900 dark:text-[#5ED3DA] font-semibold underline underline-offset-8 decoration-2 decoration-forest-700 dark:decoration-[#5ED3DA]'
      : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white hover:underline hover:underline-offset-8';
    return `
      <a
        href="#/${item.id}"
        class="py-1 text-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest-700 ${activeClasses}"
        ${isActive ? 'aria-current="page"' : ''}
      >
        ${escapeHtml(item.label)}
      </a>
    `;
  }).join('');

  const mobileTabsHtml = NAV_ITEMS.map((item) => {
    const isActive = item.id === activeRoute;
    if (item.emphasize) {
      return `
        <a
          href="#/${item.id}"
          aria-label="Scan or add books"
          ${isActive ? 'aria-current="page"' : ''}
          class="group relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] pb-1.5 focus-visible:outline-2 focus-visible:outline-forest-700"
        >
          <span
            data-nav-scan-orb="true"
            class="-mt-6 mb-1 flex items-center justify-center w-12 h-12 rounded-full shadow-md ring-4 ring-ivory dark:ring-night-900 transition-transform active:scale-95 ${
              isActive
                ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                : 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
            }"
          >
            ${renderIcon(item.icon, 'w-[22px] h-[22px]')}
          </span>
          <span
            data-nav-label="true"
            class="text-[10px] leading-none font-semibold tracking-tight whitespace-nowrap ${
              isActive
                ? 'text-forest-800 dark:text-[#5ED3DA]'
                : 'text-stone-ink dark:text-slate-300'
            }"
          >${escapeHtml(item.mobileLabel)}</span>
        </a>
      `;
    }

    return `
      <a
        href="#/${item.id}"
        ${item.id === activeRoute ? 'aria-current="page"' : ''}
        class="relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] px-1 pb-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-forest-700 ${
          isActive
            ? 'text-espresso-800 dark:text-[#5ED3DA] font-semibold'
            : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-slate-100'
        }"
      >
        <span data-nav-icon-slot="true" class="flex items-center justify-center h-6 mb-1">
          ${renderIcon(item.icon, 'w-[22px] h-[22px]')}
        </span>
        <span
          data-nav-label="true"
          class="text-[10px] leading-none tracking-tight whitespace-nowrap"
        >${escapeHtml(item.mobileLabel)}</span>
      </a>
    `;
  }).join('');

  const offlineBannerHtml = !pwaStatus.isOnline
    ? `
      <div role="status" class="bg-amber-100 dark:bg-amber-950/80 border-b border-amber-300/70 dark:border-amber-800 px-4 py-1.5 text-xs font-medium text-amber-950 dark:text-amber-200 text-center">
        Offline mode — browsing cached library and rotations on this device.
      </div>
    `
    : '';

  const toastHtml = toast
    ? `
      <div
        role="status"
        aria-live="polite"
        class="fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs sm:text-sm font-medium shadow-lg border transition-opacity duration-150 ${
          toast.tone === 'error'
            ? 'bg-rose-950 text-rose-50 border-rose-800'
            : 'bg-forest-900 text-ivory border-forest-800 dark:bg-night-800 dark:border-night-700'
        }"
      >
        <span>${escapeHtml(toast.message)}</span>
        <button
          type="button"
          data-action="dismiss-toast"
          aria-label="Dismiss notification"
          class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-linen-100/80 hover:text-white"
        >
          ${renderIcon('close', 'w-4 h-4')}
        </button>
      </div>
    `
    : '';

  const iosModalHtml = pwaStatus.showIosInstructions
    ? `
      <div
        data-backdrop-action="close-ios-guide"
        class="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      >
        <div role="dialog" aria-modal="true" aria-labelledby="ios-install-title" class="animate-sheet-up w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 p-6 shadow-xl">
          <h2 id="ios-install-title" class="font-display text-lg font-semibold text-forest-900 dark:text-white">
            Install Library Rotation on iOS
          </h2>
          <ol class="mt-3 space-y-2 text-sm text-stone-ink dark:text-slate-300 list-decimal list-inside">
            <li>Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> to launch full-screen offline.</li>
          </ol>
          <button
            type="button"
            data-action="close-ios-guide"
            class="mt-5 w-full min-h-[44px] rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-sm font-semibold transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    `
    : '';

  const profileSwitcherHtml = renderProfileSwitcherSheet({
    state,
    isOpen: shellUiState.isProfileSwitcherOpen,
  });

  const profileFormHtml =
    activeRoute !== 'profiles'
      ? renderProfileFormSheet({
          state,
          isOpen: shellUiState.isProfileFormSheetOpen,
          editingProfileId: shellUiState.editingProfileId,
          previewBirthDate: shellUiState.previewBirthDate,
        })
      : '';

  return `
    <div data-app-shell="true" class="min-h-screen flex flex-col bg-linen-50 dark:bg-night-950 text-[#1A2423] dark:text-[#F4EFE6]">
      <!-- Fixed iOS/PWA Top Safe-Area Curtain: keeps clock/battery notch seamlessly covered even during overscroll -->
      <div
        aria-hidden="true"
        data-safe-top-cover="true"
        class="fixed top-0 inset-x-0 h-safe-top z-40 pointer-events-none bg-ivory dark:bg-night-900"
      ></div>
      <a
        href="#main-content"
        data-action="skip-to-main"
        class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-forest-700 focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-forest-600"
      >
        Skip to main content
      </a>
      ${offlineBannerHtml}

      <!-- Flush Sticky Top Bar: App Icon + Wordmark | Desktop Nav | Active Reader Avatar Trigger -->
      <header class="sticky top-0 z-30 w-full bg-ivory/95 dark:bg-night-900/95 backdrop-blur-md border-b border-linen-200 dark:border-night-800 shadow-xs pt-safe">
        <div class="max-w-6xl mx-auto flex items-center justify-between gap-4 px-3.5 sm:px-6 h-13 sm:h-14">
          <!-- Zone 1: App Icon + Brand Wordmark -->
          <a
            href="#/home"
            class="inline-flex items-center gap-2.5 font-display text-base sm:text-lg font-bold tracking-tight text-forest-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-forest-700"
          >
            <span
              data-brand-icon="true"
              aria-hidden="true"
              class="w-8 h-8 rounded-xl bg-forest-900 dark:bg-night-800 border border-forest-800/80 dark:border-night-700 flex items-center justify-center shadow-2xs shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" class="w-5 h-5">
                <path d="M8.5 7.5C11.5 4.3 17.2 3.7 21.5 6L23.5 7.2" stroke="#5ED3DA" stroke-width="2.1" stroke-linecap="round"/>
                <path d="M22.4 4.2L24 7.5L20.5 8" stroke="#5ED3DA" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 11.4C13.6 10.1 10.2 10.1 7.5 11V20.8C10.2 20 13.6 20 16 21.3C18.4 20 21.8 20 24.5 20.8V11C21.8 10.1 18.4 10.1 16 11.4Z" fill="#FAF6EE"/>
                <path d="M16 11.5V21.2" stroke="#123C42" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M9.8 13.8H13.6M9.8 16.3H13.6" stroke="#9A5B25" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M18.4 13.8H22.2M18.4 16.3H22.2" stroke="#9A5B25" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M23.5 24.5C20.5 27.7 14.8 28.3 10.5 26L8.5 24.8" stroke="#E8A849" stroke-width="2.1" stroke-linecap="round"/>
                <path d="M9.6 27.8L8 24.5L11.5 24" stroke="#E8A849" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span>Book Rotation</span>
          </a>

          <!-- Zone 2: Desktop Navigation -->
          <nav aria-label="Primary" class="hidden lg:flex items-center gap-7">
            ${desktopNavHtml}
          </nav>

          <!-- Zone 3: Active Reader Avatar Switcher + Top-Right Settings -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-action="open-profile-switcher"
              aria-haspopup="dialog"
              aria-expanded="${shellUiState.isProfileSwitcherOpen ? 'true' : 'false'}"
              aria-label="Current reader ${escapeHtml(activeProfile.name)} (${escapeHtml(
                ageLabel
              )}). Tap to switch or add profile"
              class="min-h-[40px] pl-1.5 pr-2.5 py-1 rounded-full bg-linen-50/90 hover:bg-linen-100 dark:bg-night-950/90 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-forest-700"
            >
              ${renderAvatarBadge(activeProfile, 'sm')}
              <span class="text-xs font-semibold text-forest-900 dark:text-white max-w-[96px] truncate">
                ${escapeHtml(activeProfile.name)}
              </span>
              <span class="hidden sm:inline text-[11px] text-stone-ink dark:text-slate-400">
                · ${escapeHtml(ageLabel)}
              </span>
              ${renderIcon('chevronDown', 'w-3.5 h-3.5 text-stone-ink dark:text-slate-400')}
            </button>
            <a
              href="#/settings"
              data-top-settings-link="true"
              aria-label="Settings and preferences"
              title="Settings"
              ${isSettingsActive ? 'aria-current="page"' : ''}
              class="min-h-[40px] min-w-[40px] rounded-full border inline-flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-forest-700 ${
                isSettingsActive
                  ? 'bg-forest-900 text-ivory border-forest-900 dark:bg-[#5ED3DA] dark:text-night-950 dark:border-[#5ED3DA]'
                  : 'bg-linen-50/90 hover:bg-linen-100 text-forest-900 border-linen-200 dark:bg-night-950/90 dark:hover:bg-night-800 dark:text-slate-200 dark:border-night-700'
              }"
            >
              ${renderIcon('settings', 'w-[19px] h-[19px]')}
            </a>
          </div>
        </div>
      </header>

      <!-- Main Workspace -->
      <main id="main-content" tabindex="-1" class="flex-1 w-full max-w-6xl mx-auto px-3.5 sm:px-6 py-4 sm:py-6 mb-safe-nav focus:outline-none">
        ${contentHtml}
      </main>

      <!-- Mobile Fixed Bottom Tab Bar (<= 8% viewport height, unified label baseline + elevated Scan orb) -->
      <nav
        aria-label="Mobile bottom navigation"
        class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-ivory/95 dark:bg-night-900/95 backdrop-blur-md border-t border-linen-200 dark:border-night-800 pb-safe"
      >
        <div class="grid grid-cols-5 items-end h-[58px] max-w-lg mx-auto px-1.5">
          ${mobileTabsHtml}
        </div>
      </nav>

      ${profileSwitcherHtml}
      ${profileFormHtml}
      ${toastHtml}
      ${iosModalHtml}
    </div>
  `;
}
