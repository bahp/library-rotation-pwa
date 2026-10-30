/**
 * @fileoverview Responsive application shell implementing:
 * - Desktop 3-zone Top Bar Contract (Brand wordmark | 5 single-line nav links | 1 Primary CTA)
 * - Mobile thumb-friendly Fixed Bottom Tab Bar with center-emphasized Scan action (<8% viewport height)
 * - Non-intrusive offline connectivity banner & transient status toast
 * - iOS Safari Add-to-Home-Screen instructional sheet
 */

import { escapeHtml } from '../../types/models.js';
import { renderIcon } from '../icons.js';

/** @type {Array<{ id: import('../../types/models.js').RouteId, label: string, mobileLabel: string, icon: string, emphasize?: boolean }>} */
const NAV_ITEMS = [
  { id: 'home', label: 'Home', mobileLabel: 'Home', icon: 'home' },
  { id: 'rotations', label: 'Rotations', mobileLabel: 'Rotations', icon: 'rotations' },
  { id: 'scan', label: 'Scan & Add', mobileLabel: 'Scan', icon: 'scan', emphasize: true },
  { id: 'profiles', label: 'Profiles', mobileLabel: 'Profiles', icon: 'profiles' },
  { id: 'settings', label: 'Settings', mobileLabel: 'Settings', icon: 'settings' },
];

/**
 * Renders the outer responsive shell around the active view HTML.
 * @param {{
 *   activeRoute: import('../../types/models.js').RouteId,
 *   state: import('../../types/models.js').AppState,
 *   toast: { id: string, message: string, tone: 'success' | 'error' | 'info' } | null,
 *   pwaStatus: { isInstallable: boolean, isInstalled: boolean, isIOS: boolean, isOnline: boolean, swReady: boolean, showIosInstructions: boolean },
 *   contentHtml: string
 * }} props
 * @returns {string}
 */
export function renderAppShell({ activeRoute, state, toast, pwaStatus, contentHtml }) {
  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];

  const desktopNavHtml = NAV_ITEMS.map((item) => {
    const isActive = item.id === activeRoute;
    const activeClasses = isActive
      ? 'text-teal-700 dark:text-teal-400 underline underline-offset-8 decoration-2'
      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:underline hover:underline-offset-8';
    return `
      <a
        href="#/${item.id}"
        class="py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600 ${activeClasses}"
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
          class="group flex flex-col items-center justify-center min-h-[48px] min-w-[48px] focus-visible:outline-2 focus-visible:outline-teal-600"
        >
          <span class="flex items-center justify-center w-11 h-9 rounded-xl transition-transform active:scale-95 ${
            isActive
              ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
              : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          }">
            ${renderIcon(item.icon, 'w-5 h-5')}
          </span>
          <span class="text-[10px] font-semibold tracking-tight mt-0.5 whitespace-nowrap ${
            isActive
              ? 'text-teal-700 dark:text-teal-400'
              : 'text-slate-700 dark:text-slate-300'
          }">${escapeHtml(item.mobileLabel)}</span>
        </a>
      `;
    }

    return `
      <a
        href="#/${item.id}"
        ${isActive ? 'aria-current="page"' : ''}
        class="flex flex-col items-center justify-center min-h-[48px] min-w-[48px] px-1 transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
          isActive
            ? 'text-teal-700 dark:text-teal-400'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        }"
      >
        ${renderIcon(item.icon, 'w-[21px] h-[21px]')}
        <span class="text-[10px] font-medium tracking-tight mt-1 whitespace-nowrap">${escapeHtml(
          item.mobileLabel
        )}</span>
      </a>
    `;
  }).join('');

  const offlineBannerHtml = !pwaStatus.isOnline
    ? `
      <div role="status" class="bg-amber-100 dark:bg-amber-950/80 border-b border-amber-300/70 dark:border-amber-800 px-4 py-2 text-xs font-medium text-amber-950 dark:text-amber-200 text-center">
        Offline mode active — browsing cached library and rotations on this device.
      </div>
    `
    : '';

  const toastHtml = toast
    ? `
      <div
        role="status"
        aria-live="polite"
        class="fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:max-w-sm z-50 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg border transition-opacity duration-150 ${
          toast.tone === 'error'
            ? 'bg-rose-950 text-rose-50 border-rose-800'
            : 'bg-slate-900 text-white border-slate-700 dark:bg-slate-800 dark:border-slate-700'
        }"
      >
        <span>${escapeHtml(toast.message)}</span>
        <button
          type="button"
          data-action="dismiss-toast"
          aria-label="Dismiss notification"
          class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white"
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
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      >
        <div role="dialog" aria-modal="true" aria-labelledby="ios-install-title" class="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
          <h2 id="ios-install-title" class="font-display text-lg font-semibold text-slate-900 dark:text-white">
            Install Library Rotation on iOS
          </h2>
          <ol class="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>Tap the <strong>Share</strong> icon in the Safari toolbar.</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> to launch full-screen offline.</li>
          </ol>
          <button
            type="button"
            data-action="close-ios-guide"
            class="mt-5 w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    `
    : '';

  return `
    <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        data-action="skip-to-main"
        class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-teal-700 focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-teal-500"
      >
        Skip to main content
      </a>
      ${offlineBannerHtml}

      <!-- Desktop 3-Zone Top Bar + Compact Mobile Non-Sticky Header -->
      <header class="lg:sticky lg:top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
        <div class="max-w-6xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-14 lg:h-16">
          <!-- Zone 1: Single text element Brand Wordmark -->
          <a
            href="#/home"
            class="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            Library Rotation
          </a>

          <!-- Zone 2: 5 concise single-line text nav links (Desktop) -->
          <nav aria-label="Primary" class="hidden lg:flex items-center gap-7">
            ${desktopNavHtml}
          </nav>

          <!-- Zone 3: 1 Primary CTA -->
          <div class="flex items-center shrink-0">
            <a
              href="#/scan"
              class="hidden sm:inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Add Book
            </a>
            <a
              href="#/profiles"
              class="sm:hidden inline-flex items-center justify-center min-h-[44px] px-3 text-xs font-semibold text-teal-700 dark:text-teal-400 whitespace-nowrap shrink-0"
            >
              Reader: ${escapeHtml(activeProfile.name)}
            </a>
          </div>
        </div>
      </header>

      <!-- Main Workspace -->
      <main id="main-content" tabindex="-1" class="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8 mb-safe-nav focus:outline-none">
        ${contentHtml}
      </main>

      <!-- Mobile Fixed Bottom Tab Bar (Thumb Zone Anchor, <= 8% mobile viewport height) -->
      <nav
        aria-label="Mobile bottom navigation"
        class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div class="grid grid-cols-5 items-center h-14 max-w-lg mx-auto px-2">
          ${mobileTabsHtml}
        </div>
      </nav>

      ${toastHtml}
      ${iosModalHtml}
    </div>
  `;
}
