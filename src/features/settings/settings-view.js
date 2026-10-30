/**
 * @fileoverview Settings view:
 * - In-App PWA Install Card (Chromium beforeinstallprompt + iOS Safari guide + standalone indicator)
 * - Dual-theme appearance selector (System / Light / Dark)
 * - Provider debug payload retention toggle
 * - Local storage backup export (JSON), validated import, and sample seed reset
 */

import { escapeHtml } from '../../types/models.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * Renders the Settings view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   storageBackend: string,
 *   pwaStatus: { isInstallable: boolean, isInstalled: boolean, isIOS: boolean, isOnline: boolean, swReady: boolean, showIosInstructions: boolean }
 * }} params
 * @returns {string}
 */
export function renderSettingsView({ state, storageBackend, pwaStatus }) {
  const themes = /** @type {Array<{ id: import('../../types/models.js').ThemeMode, label: string }>} */ ([
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ]);

  const themeButtonsHtml = themes
    .map((item) => {
      const active = state.settings.theme === item.id;
      return `
        <button
          type="button"
          data-action="set-theme"
          data-theme="${item.id}"
          class="flex-1 min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
            active
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(item.label)}
        </button>
      `;
    })
    .join('');

  let pwaActionHtml = '';
  if (pwaStatus.isInstalled) {
    pwaActionHtml = `
      <p class="text-xs font-semibold text-teal-700 dark:text-teal-400">
        Installed in standalone home-screen mode
      </p>
    `;
  } else if (pwaStatus.isInstallable) {
    pwaActionHtml = `
      <button
        type="button"
        data-action="install-pwa"
        class="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
      >
        ${renderIcon('download', 'w-4 h-4')}
        Install App
      </button>
    `;
  } else if (pwaStatus.isIOS) {
    pwaActionHtml = `
      <button
        type="button"
        data-action="install-pwa"
        class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
      >
        Install on iPhone / iPad
      </button>
    `;
  } else {
    pwaActionHtml = `
      <p class="text-xs text-slate-500 dark:text-slate-400">
        Open in Chrome, Edge, or Safari on your phone to add Library Rotation to your home screen.
      </p>
    `;
  }

  return `
    <div class="max-w-3xl space-y-6">
      <div>
        <h1 class="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          Settings & Offline Data
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure appearance, install the app on your phone, and back up your family catalog.
        </p>
      </div>

      <!-- In-App PWA Install & Offline Readiness Card -->
      <section aria-labelledby="pwa-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 id="pwa-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
              Installable Phone App (PWA)
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Runs full-screen from your home screen and caches assets for offline shelf checks.
            </p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
              <span>Network: ${pwaStatus.isOnline ? 'Online' : 'Offline'}</span>
              <span aria-hidden="true">·</span>
              <span>Offline Shell: ${pwaStatus.swReady ? 'Cached & Ready' : 'Registering'}</span>
              <span aria-hidden="true">·</span>
              <span>Storage Engine: ${escapeHtml(storageBackend)}</span>
            </div>
          </div>
          <div class="shrink-0">
            ${pwaActionHtml}
          </div>
        </div>
      </section>

      <!-- Appearance & Provider Options -->
      <section aria-labelledby="appearance-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-5">
        <div>
          <h2 id="appearance-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
            Appearance & Metadata Options
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Choose light or dark reading surfaces and provider diagnostic preferences.
          </p>

          <div class="mt-3 flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 max-w-md">
            ${themeButtonsHtml}
          </div>
        </div>

        <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
              Retain Raw Provider Payloads
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Keep raw Google Books and Open Library JSON responses alongside normalized books for debugging.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${state.settings.retainRawProviderPayloads ? 'true' : 'false'}"
            data-action="toggle-raw-payloads"
            class="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              state.settings.retainRawProviderPayloads
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }"
          >
            ${state.settings.retainRawProviderPayloads ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </section>

      <!-- Backup, Restore & Reset -->
      <section aria-labelledby="backup-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <h2 id="backup-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
          Family Library Backup & Portability
        </h2>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Export your entire catalog, profiles, and rotations as a portable JSON file, or restore on another phone.
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-action="export-backup"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            ${renderIcon('download', 'w-4 h-4')}
            Export JSON Backup
          </button>

          <label class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap">
            ${renderIcon('upload', 'w-4 h-4')}
            Import JSON Backup
            <input id="import-backup-input" type="file" accept="application/json,.json" class="sr-only" />
          </label>

          <button
            type="button"
            data-action="reset-seed-data"
            class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Reset to Sample Data
          </button>
        </div>
      </section>
    </div>
  `;
}
