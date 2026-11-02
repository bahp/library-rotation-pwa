/**
 * @fileoverview Pure, framework-agnostic PWA Home Screen install banner & state controller.
 * Kept free of Vite-only virtual imports (`virtual:pwa-register`) so views and Node ESM unit
 * tests can render and exercise Home Screen bookmark flows directly.
 */

import { renderIcon } from '../../ui/icons.js';

export const PWA_BANNER_DISMISSED_STORAGE_KEY = 'lr_dismissed_pwa_banner_v1';

/**
 * @typedef {Event & {
 *   prompt: () => Promise<void>,
 *   userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
 * }} BeforeInstallPromptEvent
 */

/**
 * Loads whether the user previously dismissed the Home Screen PWA install banner.
 * @returns {boolean}
 */
export function loadPwaBannerDismissed() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(PWA_BANNER_DISMISSED_STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * Persists user dismissal of the Home Screen PWA install banner.
 * @param {boolean} [dismissed=true]
 */
export function savePwaBannerDismissed(dismissed = true) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (dismissed) {
        window.localStorage.setItem(PWA_BANNER_DISMISSED_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(PWA_BANNER_DISMISSED_STORAGE_KEY);
      }
    }
  } catch (_) {}
}

/**
 * Renders a compact, phone-friendly notification banner inviting the user to save Book Rotation
 * to their phone's Home Screen as a standalone PWA when not yet installed.
 *
 * @param {{
 *   pwaStatus?: {
 *     isInstallable?: boolean,
 *     isInstalled?: boolean,
 *     isIOS?: boolean,
 *     promptReady?: boolean
 *   } | null,
 *   dismissed?: boolean
 * }} [params]
 * @returns {string}
 */
export function renderPwaInstallBanner({ pwaStatus = null, dismissed = false } = {}) {
  if (!pwaStatus || pwaStatus.isInstalled || dismissed) return '';
  const shouldPrompt =
    pwaStatus.promptReady !== undefined
      ? Boolean(pwaStatus.isInstallable || pwaStatus.promptReady)
      : Boolean(pwaStatus.isInstallable || pwaStatus.isIOS);
  if (!shouldPrompt) return '';

  const actionLabel = pwaStatus.isInstallable ? 'Install App' : 'Add to Home';
  const subtitle = pwaStatus.isInstallable
    ? 'One-tap Home Screen bookmark for instant full-screen & offline shelf access.'
    : pwaStatus.isIOS
      ? 'Save as an iPhone/iPad Home Screen app for full-screen offline access.'
      : 'Save Book Rotation to your Home Screen as a fast offline app.';

  return `
    <section
      role="region"
      aria-label="Save app to Home Screen"
      data-pwa-install-banner="true"
      class="rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2.5"
    >
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <span
          aria-hidden="true"
          class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-forest-50 dark:bg-night-800 border border-forest-700/20 dark:border-night-700 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center shrink-0"
        >
          ${renderIcon('download', 'w-3.5 h-3.5 sm:w-4 sm:h-4')}
        </span>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-forest-900 dark:text-white leading-tight truncate">
            Save Bookmark to Home Screen
          </p>
          <p class="text-[11px] text-stone-ink dark:text-slate-400 leading-snug line-clamp-1 mt-0.5">
            ${subtitle}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          data-action="install-pwa"
          class="h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg bg-forest-700 hover:bg-forest-800 text-white text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
        >
          ${renderIcon('download', 'w-3 h-3 sm:w-3.5 sm:h-3.5')}
          <span>${actionLabel}</span>
        </button>
        <button
          type="button"
          data-action="dismiss-pwa-install-banner"
          aria-label="Dismiss Home Screen install reminder"
          class="min-h-[34px] min-w-[34px] sm:min-h-[36px] sm:min-w-[36px] -mr-1 rounded-lg text-stone-ink/75 hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 flex items-center justify-center transition-colors"
        >
          ${renderIcon('close', 'w-3.5 h-3.5')}
        </button>
      </div>
    </section>
  `;
}

/**
 * Creates a testable PWA install & connectivity controller.
 * @param {{
 *   registerSWFn?: ((opts: { immediate?: boolean, onOfflineReady?: () => void, onRegistered?: () => void }) => unknown) | null,
 *   engagementDelayMs?: number
 * }} [options]
 */
export function createPwaInstallController(options = {}) {
  const { registerSWFn = null, engagementDelayMs = 10_500 } = options;

  /** @type {BeforeInstallPromptEvent | null} */
  let deferredPrompt = null;
  let isInstalled = false;
  let isIOS = false;
  let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let swReady = false;
  let showIosInstructions = false;
  let promptReady = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let engagementTimer = null;

  /** @type {Set<() => void>} */
  const listeners = new Set();

  function emit() {
    for (const cb of listeners) {
      cb();
    }
  }

  function init() {
    if (typeof window === 'undefined') return;

    const nav = /** @type {Navigator & { standalone?: boolean }} */ (window.navigator);
    isInstalled =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      nav?.standalone === true;

    const ua = String(nav?.userAgent || '').toLowerCase();
    const isIpadDesktopMode = /macintosh/.test(ua) && Number(nav?.maxTouchPoints) > 1;
    isIOS = /iphone|ipad|ipod/.test(ua) || isIpadDesktopMode;
    isOnline = nav?.onLine !== false;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = /** @type {BeforeInstallPromptEvent} */ (event);
      promptReady = true;
      emit();
    });

    window.addEventListener('appinstalled', () => {
      isInstalled = true;
      deferredPrompt = null;
      promptReady = false;
      showIosInstructions = false;
      emit();
    });

    window.addEventListener('online', () => {
      isOnline = true;
      emit();
    });

    window.addEventListener('offline', () => {
      isOnline = false;
      emit();
    });

    // Respectful non-arrival notification timing on mobile/desktop browsers after first interaction + brief dwell
    if (!isInstalled) {
      const markEngaged = () => {
        window.removeEventListener('pointerdown', markEngaged);
        window.removeEventListener('keydown', markEngaged);
        if (isInstalled || promptReady) return;
        engagementTimer = setTimeout(() => {
          if (!isInstalled) {
            promptReady = true;
            emit();
          }
        }, engagementDelayMs);
      };
      window.addEventListener('pointerdown', markEngaged, { passive: true, once: true });
      window.addEventListener('keydown', markEngaged, { passive: true, once: true });
    }

    if (typeof registerSWFn === 'function') {
      try {
        registerSWFn({
          immediate: true,
          onOfflineReady() {
            swReady = true;
            emit();
          },
          onRegistered() {
            swReady = true;
            emit();
          },
        });
      } catch (_) {
        // Service worker registration skipped in unsupported environments
      }
    }
  }

  async function triggerInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        isInstalled = true;
        deferredPrompt = null;
        promptReady = false;
        emit();
        return 'accepted';
      }
      return 'dismissed';
    }
    if (!isInstalled) {
      showIosInstructions = true;
      emit();
      return isIOS ? 'ios-guide' : 'install-guide';
    }
    return 'unavailable';
  }

  function closeIosGuide() {
    if (engagementTimer) {
      clearTimeout(engagementTimer);
      engagementTimer = null;
    }
    showIosInstructions = false;
    emit();
  }

  function getStatus() {
    return {
      isInstallable: Boolean(deferredPrompt),
      isInstalled,
      isIOS,
      isOnline,
      swReady,
      showIosInstructions,
      promptReady: !isInstalled && (Boolean(deferredPrompt) || promptReady),
    };
  }

  return {
    init,
    triggerInstall,
    closeIosGuide,
    getStatus,
    subscribe: (/** @type {() => void} */ cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
