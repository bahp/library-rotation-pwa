/**
 * @fileoverview First-run / unconfigured Google Books API welcome & setup modal.
 * Explains clearly how book catalog searches work out of the box (Open Library for mostly English books)
 * vs configuring a free personal Google Books API key via Google Cloud Console without ever exposing
 * raw credentials in public browser inputs or JSON backups.
 */

import { escapeHtml } from '../../types/models.js';
import { APP_DOCS_LINKS } from '../../version.js';
import { renderIcon } from '../icons.js';

export const WELCOME_BOOKS_MODAL_DISMISSED_KEY = 'lr_welcome_books_setup_dismissed_v1';

export const GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL =
  'https://console.cloud.google.com/apis/credentials';

/**
 * Resolves browser localStorage safely when available.
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [customStorage]
 * @returns {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null}
 */
function resolveStorage(customStorage) {
  if (customStorage !== undefined) return customStorage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (_) {}
  return null;
}

/**
 * Returns true if the user has already dismissed the startup Google Books setup welcome dialog.
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [customStorage]
 * @returns {boolean}
 */
export function isWelcomeBooksModalDismissed(customStorage) {
  const store = resolveStorage(customStorage);
  if (!store) return false;
  try {
    return store.getItem(WELCOME_BOOKS_MODAL_DISMISSED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

/**
 * Persists or clears the startup Google Books welcome modal dismissal flag.
 * @param {boolean} dismissed
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null} [customStorage]
 */
export function setWelcomeBooksModalDismissed(dismissed, customStorage) {
  const store = resolveStorage(customStorage);
  if (!store) return;
  try {
    if (dismissed) {
      store.setItem(WELCOME_BOOKS_MODAL_DISMISSED_KEY, '1');
    } else {
      store.removeItem(WELCOME_BOOKS_MODAL_DISMISSED_KEY);
    }
  } catch (_) {}
}

/**
 * Determines whether the app should automatically pop up the Google Books setup welcome modal on startup:
 * - Only after server status has resolved (`shared-quota` or `static-host`)
 * - Only when no personal device Books proxy URL is configured (`deviceBooksProxyUrl === ''`)
 * - Only when Google Books provider is enabled and the user has not previously dismissed the welcome prompt
 *
 * @param {{
 *   googleBooksKeyStatus: 'unknown' | 'configured' | 'shared-quota' | 'static-host',
 *   deviceBooksProxyUrl?: string,
 *   googleBooksEnabled?: boolean,
 *   storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
 * }} params
 * @returns {boolean}
 */
export function shouldAutoShowWelcomeBooksModal({
  googleBooksKeyStatus,
  deviceBooksProxyUrl = '',
  googleBooksEnabled = true,
  storage,
}) {
  if (!googleBooksEnabled) return false;
  if (String(deviceBooksProxyUrl || '').trim() !== '') return false;
  if (googleBooksKeyStatus !== 'shared-quota' && googleBooksKeyStatus !== 'static-host') {
    return false;
  }
  return !isWelcomeBooksModalDismissed(storage);
}

/**
 * Renders the startup Welcome / Google Books Setup dialog.
 * @param {{
 *   isOpen: boolean,
 *   googleBooksKeyStatus?: 'unknown' | 'configured' | 'shared-quota' | 'static-host'
 * }} params
 * @returns {string}
 */
export function renderWelcomeBooksSetupModal({ isOpen, googleBooksKeyStatus = 'unknown' }) {
  if (!isOpen) return '';

  const modeNote =
    googleBooksKeyStatus === 'static-host'
      ? 'Running in static hosting mode (e.g. GitHub Pages) with no shared server key.'
      : 'No dedicated Google Books credential is configured yet on this deployment.';

  return `
    <div
      data-backdrop-action="close-welcome-books-modal"
      data-google-welcome-modal="true"
      class="sheet-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-books-modal-title"
        class="animate-sheet-up w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 p-5 sm:p-6 shadow-xl pb-safe"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-xl bg-forest-900 text-[#5ED3DA] flex items-center justify-center shrink-0">
              ${renderIcon('book', 'w-4.5 h-4.5')}
            </span>
            <div>
              <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
                First-Run Catalog Setup
              </p>
              <h2 id="welcome-books-modal-title" class="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white leading-tight">
                Welcome to Book Rotation
              </h2>
            </div>
          </div>
          <button
            type="button"
            data-action="dismiss-welcome-books-modal"
            aria-label="Close welcome message"
            class="min-h-[38px] min-w-[38px] rounded-full text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-night-800 flex items-center justify-center transition-colors"
          >
            ${renderIcon('close', 'w-4 h-4')}
          </button>
        </div>

        <div class="mt-3.5 space-y-3 text-xs sm:text-sm text-stone-ink dark:text-slate-300 leading-relaxed">
          <p class="text-forest-900 dark:text-slate-100 font-medium">
            To use dedicated Google Books API searches (especially helpful for Spanish, Italian, and international editions), configure your own free Google Books credential — you can get one in a few seconds from the
            <a
              href="${escapeHtml(GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL)}"
              target="_blank"
              rel="noopener noreferrer"
              class="font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2 hover:text-forest-900 dark:hover:text-white"
            >Google Cloud Console</a>.
          </p>

          <div class="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-800 p-3.5 space-y-2 text-xs">
            <p class="text-forest-900 dark:text-slate-200 font-semibold">
              ${escapeHtml(modeNote)}
            </p>
            <p>
              <strong>Works right now with zero setup:</strong> <strong>Open Library</strong> is active automatically (great for English ISBNs &amp; covers).
            </p>
            <p>
              <strong>Keep your credential private:</strong> To prevent quota theft on public sites like GitHub Pages, credentials are never pasted directly into browser storage — instead, add <code>GOOGLE_BOOKS_API_KEY</code> to your local/server <code>.env</code> or save a free personal proxy URL in <strong>Settings</strong> (<a href="${escapeHtml(APP_DOCS_LINKS.configuration)}" target="_blank" rel="noopener noreferrer" class="font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2">read 2-minute setup guide</a>).
            </p>
          </div>
        </div>

        <div class="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            data-action="dismiss-welcome-books-modal"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs sm:text-sm font-semibold text-forest-900 dark:text-slate-200 transition-colors"
          >
            Continue with Open Library
          </button>
          <a
            href="${escapeHtml(GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL)}"
            target="_blank"
            rel="noopener noreferrer"
            class="min-h-[44px] px-4 py-2 rounded-xl border border-forest-700/35 dark:border-[#5ED3DA]/40 hover:bg-linen-100 dark:hover:bg-night-800 text-xs sm:text-sm font-semibold text-forest-800 dark:text-[#5ED3DA] inline-flex items-center justify-center transition-colors whitespace-nowrap"
          >
            Google Cloud Console &nearr;
          </a>
          <button
            type="button"
            data-action="open-settings-from-welcome"
            class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Configure in Settings
          </button>
        </div>
      </div>
    </div>
  `;
}
