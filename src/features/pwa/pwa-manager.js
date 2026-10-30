/**
 * @fileoverview Manages PWA service worker registration, beforeinstallprompt capture,
 * standalone detection, iOS Safari install guidance, and online/offline connectivity state.
 */

import { registerSW } from 'virtual:pwa-register';

/**
 * @typedef {Event & {
 *   prompt: () => Promise<void>,
 *   userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
 * }} BeforeInstallPromptEvent
 */

export function createPwaManager() {
  /** @type {BeforeInstallPromptEvent | null} */
  let deferredPrompt = null;
  let isInstalled = false;
  let isIOS = false;
  let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let swReady = false;
  let showIosInstructions = false;

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
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;

    const ua = window.navigator.userAgent.toLowerCase();
    isIOS = /iphone|ipad|ipod/.test(ua);
    isOnline = window.navigator.onLine;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = /** @type {BeforeInstallPromptEvent} */ (event);
      emit();
    });

    window.addEventListener('appinstalled', () => {
      isInstalled = true;
      deferredPrompt = null;
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

    try {
      registerSW({
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

  async function triggerInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        isInstalled = true;
        deferredPrompt = null;
        emit();
        return 'accepted';
      }
      return 'dismissed';
    }
    if (isIOS && !isInstalled) {
      showIosInstructions = true;
      emit();
      return 'ios-guide';
    }
    return 'unavailable';
  }

  function closeIosGuide() {
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
