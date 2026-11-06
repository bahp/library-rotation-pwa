/**
 * @fileoverview Settings & Reader Account view:
 * - Reader Profiles overview card (with automatic DOB ages, `+` add trigger, and link to full details `#/profiles`)
 * - In-App PWA Install Card (Chromium beforeinstallprompt + iOS Safari guide + standalone indicator)
 * - Dual-theme appearance selector (System / Light / Dark)
 * - Catalog Metadata Provider Config (Google Books, Open Library, Raw Payload Retention)
 * - Phase 5 Tagging & Pluggable AI Enrichment Provider Config with Safe Privacy-First Defaults
 * - Local storage backup export (JSON), validated import, and sample seed reset
 */

import {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  t,
} from '../../config/index.js';
import {
  escapeHtml,
  formatProfileAgeLabel,
  formatReadingStage,
} from '../../types/models.js';
import { estimateAppStorageUsage, formatStorageBytes } from '../../core/storage.js';
import { APP_DOCS_LINKS, APP_VERSION } from '../../version.js';
import { renderInputClearButton } from '../../ui/components/clearable-input.js';
import {
  renderFieldInfoButton,
  renderFieldInfoPanel,
} from '../../ui/components/field-help.js';
import { renderAvatarBadge } from '../../ui/components/profile-sheets.js';
import { GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL } from '../../ui/components/welcome-setup-modal.js';
import { renderIcon } from '../../ui/icons.js';

/**
 * Determines whether a Google Books diagnostic check report represents `'success'`, `'error'`, or `'idle'`.
 * @param {'idle' | 'success' | 'error' | undefined} explicitTone
 * @param {string | undefined} reportText
 * @returns {'idle' | 'success' | 'error'}
 */
export function resolveGoogleBooksHealthTone(explicitTone, reportText) {
  if (explicitTone === 'success' || explicitTone === 'error') {
    return explicitTone;
  }
  const text = String(reportText || '').trim();
  if (!text) return 'idle';
  if (/\b(fail|failed|error|unreachable|invalid|cors|429|403|500|502|503|404)\b/i.test(text)) {
    return 'error';
  }
  return 'success';
}

/**
 * Renders the Settings view markup.
 * @param {{
 *   state: import('../../types/models.js').AppState,
 *   storageBackend: string,
 *   pwaStatus: { isInstallable: boolean, isInstalled: boolean, isIOS: boolean, isOnline: boolean, swReady: boolean, showIosInstructions: boolean },
 *   adapterDiagnostics?: Array<{
 *     id: string,
 *     label: string,
 *     transportKind: string,
 *     privacyNote: string,
 *     available: boolean,
 *     reason: string
 *   }>,
 *   settingsUiState?: {
 *     testingAdapter: boolean,
 *     enrichingCatalog: boolean,
 *     lastAdapterTestReport: string,
 *     endpointError: string,
 *     checkingGoogleBooks?: boolean,
 *     googleBooksHealthReport?: string,
 *     googleBooksHealthTone?: 'idle' | 'success' | 'error',
 *     googleBooksKeyStatus?: 'unknown' | 'configured' | 'shared-quota' | 'static-host',
 *     isGoogleKeyGuideOpen?: boolean,
 *     deviceBooksProxyUrl?: string,
 *     deviceBooksProxyError?: string,
 *     syncingCatalogMetadata?: boolean,
 *     catalogSyncProgressText?: string,
 *     catalogSyncReport?: string,
 *     catalogSyncTone?: 'idle' | 'success' | 'error',
 *     browserStorageSummary?: string,
 *     hasCoverCache?: boolean,
 *   }
 * }} params
 * @returns {string}
 */
export function renderSettingsView({
  state,
  storageBackend,
  pwaStatus,
  adapterDiagnostics = [],
  settingsUiState = {
    testingAdapter: false,
    enrichingCatalog: false,
    lastAdapterTestReport: '',
    endpointError: '',
    checkingGoogleBooks: false,
    googleBooksHealthReport: '',
    googleBooksHealthTone: 'idle',
    googleBooksKeyStatus: 'unknown',
    isGoogleKeyGuideOpen: false,
    deviceBooksProxyUrl: '',
    deviceBooksProxyError: '',
    syncingCatalogMetadata: false,
    catalogSyncProgressText: '',
    catalogSyncReport: '',
    catalogSyncTone: 'idle',
    browserStorageSummary: '',
    hasCoverCache: false,
  },
}) {
  const { settings } = state;
  const lang = normalizeLanguage(settings.language);
  const storageUsage = estimateAppStorageUsage(state);
  const presetDaysBefore = settings.presetAlertDaysBefore ?? 2;
  const presetDaysAfter = settings.presetAlertDaysAfter ?? 5;
  const showPresetDecorations = settings.showPresetDecorations !== false;
  const enableRotationHistoryInsights = settings.enableRotationHistoryInsights !== false;
  const showCoverUsageAdornos = settings.showCoverUsageAdornos !== false;
  const enableStaleBookSpotlight = settings.enableStaleBookSpotlight !== false;
  const staleBookDays = settings.staleBookDays ?? 10;
  const googleHealthTone = resolveGoogleBooksHealthTone(
    settingsUiState.googleBooksHealthTone,
    settingsUiState.googleBooksHealthReport
  );
  const booksNeedingGoogleSyncCount = state.books.filter((b) => {
    const hasGoogle = b.sources.some(
      (s) => String(s?.provider || '').toLowerCase() === 'google-books'
    );
    return !hasGoogle || !b.coverUrl || !b.pageCount || !b.publishedYear;
  }).length;

  const profilesSummaryHtml = state.profiles
    .map((profile) => {
      const isActive = profile.id === state.activeProfileId;
      const ageLabel = formatProfileAgeLabel(profile);
      return `
        <div class="py-2.5 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            ${renderAvatarBadge(profile, 'md')}
            <div class="min-w-0">
              <p class="text-sm font-bold text-forest-900 dark:text-white truncate">
                ${escapeHtml(profile.name)}
                ${
                  isActive
                    ? `<span class="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]"> · ${escapeHtml(
                        t(lang, 'settings.activeReader')
                      )}</span>`
                    : ''
                }
              </p>
              <p class="text-xs text-stone-ink dark:text-slate-400 truncate">
                ${escapeHtml(ageLabel)}${
                  profile.birthDate ? ` (DOB ${escapeHtml(profile.birthDate)})` : ''
                } · ${escapeHtml(formatReadingStage(profile.readingStage))}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            ${
              !isActive
                ? `
                  <button
                    type="button"
                    data-action="switch-profile"
                    data-profile-id="${escapeHtml(profile.id)}"
                    class="min-h-[38px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors"
                  >
                    ${escapeHtml(t(lang, 'settings.selectProfile'))}
                  </button>
                `
                : ''
            }
            <button
              type="button"
              data-action="open-edit-profile-sheet"
              data-profile-id="${escapeHtml(profile.id)}"
              aria-label="Edit ${escapeHtml(profile.name)}"
              class="min-h-[38px] min-w-[38px] rounded-xl text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:bg-night-800 flex items-center justify-center transition-colors"
            >
              ${renderIcon('edit', 'w-4 h-4')}
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  const themes = /** @type {Array<{ id: import('../../types/models.js').ThemeMode, label: string }>} */ ([
    { id: 'system', label: t(lang, 'settings.themeSystem') },
    { id: 'light', label: t(lang, 'settings.themeLight') },
    { id: 'dark', label: t(lang, 'settings.themeDark') },
  ]);

  const themeButtonsHtml = themes
    .map((item) => {
      const active = settings.theme === item.id;
      return `
        <button
          type="button"
          data-action="set-theme"
          data-theme="${item.id}"
          class="flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
            active
              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
          }"
        >
          ${escapeHtml(item.label)}
        </button>
      `;
    })
    .join('');

  const coverRatios = /** @type {Array<{ id: import('../../types/models.js').CoverAspectRatio, label: string }>} */ ([
    { id: 'square', label: t(lang, 'settings.coverAspectSquare') },
    { id: 'portrait', label: t(lang, 'settings.coverAspectPortrait') },
  ]);

  const coverAspectButtonsHtml = coverRatios
    .map((item) => {
      const active = (settings.coverAspectRatio || 'square') === item.id;
      return `
        <button
          type="button"
          data-action="set-cover-aspect"
          data-cover-aspect="${item.id}"
          aria-pressed="${active ? 'true' : 'false'}"
          class="flex-1 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
            active
              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
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
      <p class="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] inline-flex items-center gap-1.5">
        ${renderIcon('check', 'w-3.5 h-3.5', 2.4)}
        <span>${escapeHtml(t(lang, 'settings.pwaInstalledMode'))}</span>
      </p>
    `;
  } else if (pwaStatus.isInstallable) {
    pwaActionHtml = `
      <button
        type="button"
        data-action="install-pwa"
        class="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
      >
        ${renderIcon('download', 'w-4 h-4')}
        <span>${escapeHtml(t(lang, 'settings.pwaSaveHomeScreen'))}</span>
      </button>
    `;
  } else {
    pwaActionHtml = `
      <button
        type="button"
        data-action="install-pwa"
        class="min-h-[42px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
      >
        ${renderIcon('download', 'w-4 h-4')}
        <span>${escapeHtml(
          pwaStatus.isIOS ? t(lang, 'settings.pwaAddToHomeScreen') : t(lang, 'settings.pwaSaveHomeScreen')
        )}</span>
      </button>
    `;
  }

  const catalogProviders = [
    {
      id: 'google-books',
      label: t(lang, 'settings.googleBooksProviderTitle'),
      detail: t(lang, 'settings.googleBooksProviderDesc'),
    },
    {
      id: 'open-library',
      label: t(lang, 'settings.openLibraryProviderTitle'),
      detail: t(lang, 'settings.openLibraryProviderDesc'),
    },
  ];

  const catalogProvidersHtml = catalogProviders
    .map((prov) => {
      const enabled = settings.enabledMetadataProviders.includes(prov.id);
      return `
        <div class="py-3 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              ${escapeHtml(prov.label)}
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(prov.detail)}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${enabled ? 'true' : 'false'}"
            data-action="toggle-metadata-provider"
            data-provider-id="${prov.id}"
            class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              enabled
                ? 'bg-forest-700 text-white'
                : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
            }"
          >
            ${enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      `;
    })
    .join('');

  const selectedAdapter =
    adapterDiagnostics.find((a) => a.id === settings.aiAdapterId) || adapterDiagnostics[0] || null;

  const adapterSelectorHtml =
    adapterDiagnostics.length > 0
      ? `
        <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${adapterDiagnostics
            .map((adapter) => {
              const isSelected = adapter.id === settings.aiAdapterId;
              return `
                <button
                  type="button"
                  data-action="select-ai-adapter"
                  data-adapter-id="${escapeHtml(adapter.id)}"
                  class="text-left rounded-xl p-3.5 border transition-colors ${
                    isSelected
                      ? 'bg-linen-100/80 dark:bg-night-800 border-forest-700 dark:border-[#5ED3DA]'
                      : 'bg-linen-50/70 dark:bg-night-950/60 border-linen-200 dark:border-night-700 hover:border-forest-700/50'
                  }"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                      ${escapeHtml(adapter.label)}
                    </span>
                    <span class="text-[11px] font-medium ${
                      isSelected
                        ? 'text-forest-700 dark:text-[#5ED3DA]'
                        : 'text-stone-ink dark:text-slate-400'
                    }">
                      ${isSelected ? 'Selected' : 'Select'}
                    </span>
                  </div>
                  <p class="text-xs text-stone-ink dark:text-slate-400 mt-1 leading-relaxed">
                    ${escapeHtml(adapter.privacyNote)}
                  </p>
                  <p class="text-[11px] mt-1.5 ${
                    adapter.available
                      ? 'text-forest-700 dark:text-[#5ED3DA]'
                      : 'text-amber-700 dark:text-amber-300'
                  }">
                    ${escapeHtml(adapter.reason)}
                  </p>
                </button>
              `;
            })
            .join('')}
        </div>
      `
      : '';

  const customEndpointFormHtml =
    settings.aiAdapterId === 'custom-endpoint'
      ? `
         <form id="ai-provider-config-form" class="mt-4 pt-4 border-t border-linen-200 dark:border-night-700 space-y-3" novalidate>
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div class="sm:col-span-8">
              <label for="ai-endpoint-url-input" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Keyless HTTPS Proxy or Localhost Bridge URL
              </label>
              <div class="relative min-w-0">
                <input
                  id="ai-endpoint-url-input"
                  name="aiEndpointUrl"
                  type="url"
                  value="${escapeHtml(settings.aiEndpointUrl)}"
                  placeholder="https://your-proxy.example.com/api/enrich or http://localhost:11434/enrich"
                  class="w-full h-12 pl-3.5 pr-9 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
                ${renderInputClearButton({
                  targetId: 'ai-endpoint-url-input',
                  value: settings.aiEndpointUrl,
                  label: 'Clear AI proxy URL',
                })}
              </div>
            </div>
            <div class="sm:col-span-4">
              <label for="ai-timeout-select" class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1">
                Request Timeout
              </label>
              <select
                id="ai-timeout-select"
                name="aiTimeoutMs"
                class="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              >
                <option value="3000" ${settings.aiTimeoutMs === 3000 ? 'selected' : ''}>3 seconds (Fast fallback)</option>
                <option value="6000" ${settings.aiTimeoutMs === 6000 ? 'selected' : ''}>6 seconds (Balanced)</option>
                <option value="10000" ${settings.aiTimeoutMs === 10000 ? 'selected' : ''}>10 seconds (Local model)</option>
              </select>
            </div>
          </div>

          ${
            settingsUiState.endpointError
              ? `
                <p role="alert" class="text-xs font-medium text-rose-700 dark:text-rose-300">
                  ${escapeHtml(settingsUiState.endpointError)}
                </p>
              `
              : ''
          }

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p class="text-[11px] text-stone-ink dark:text-slate-400">
              Never paste API keys in URLs. Upstream secrets must stay inside your proxy or local daemon.
            </p>
            <button
              type="submit"
              class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Save Proxy Config
            </button>
          </div>
        </form>
      `
      : '';

  const languageButtonsHtml = SUPPORTED_LANGUAGES.map((opt) => {
    const isSelected = opt.code === lang;
    return `
      <button
        type="button"
        data-action="set-language"
        data-language="${escapeHtml(opt.code)}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
        class="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
          isSelected
            ? 'bg-ivory dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
            : 'text-stone-ink dark:text-slate-400 hover:text-forest-900 dark:hover:text-white'
        }"
      >
        ${escapeHtml(opt.nativeLabel)}
      </button>
    `;
  }).join('');

  return `
    <div class="w-full space-y-5">
      <div>
        <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
          ${escapeHtml(t(lang, 'settings.eyebrow'))}
        </p>
        <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5">
          ${escapeHtml(t(lang, 'settings.heading'))}
        </h1>
      </div>

      <!-- Reader Profiles Summary & Management -->
      <section aria-labelledby="settings-profiles-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
          <div>
            <h2 id="settings-profiles-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'profiles.heading'))}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400">
              ${escapeHtml(t(lang, 'settings.profilesDesc'))}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a
              href="#/profiles"
              class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1 transition-colors"
            >
              ${escapeHtml(t(lang, 'settings.allProfilesDetails'))}
            </a>
            <button
              type="button"
              data-action="open-add-profile-sheet"
              aria-label="Add reader profile"
              title="Add reader profile"
              class="min-h-[40px] min-w-[40px] rounded-xl bg-forest-700 hover:bg-forest-800 text-white flex items-center justify-center transition-colors"
            >
              ${renderIcon('plus', 'w-4 h-4')}
            </button>
          </div>
        </div>

        <div class="divide-y divide-linen-200/70 dark:divide-night-800 mt-1">
          ${profilesSummaryHtml}
        </div>
      </section>

      <!-- Appearance -->
      <section aria-labelledby="appearance-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <h2 id="appearance-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
          ${escapeHtml(t(lang, 'settings.appearanceHeading'))}
        </h2>
        <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
          ${escapeHtml(t(lang, 'settings.appearanceDesc'))}
        </p>
        <div class="mt-3 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm">
          ${themeButtonsHtml}
        </div>

        <div class="mt-4 pt-3.5 border-t border-linen-200/70 dark:border-night-800">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            ${escapeHtml(t(lang, 'settings.languageLabel'))}
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
            ${escapeHtml(t(lang, 'settings.languageHint'))}
          </p>
          <div
            role="group"
            aria-label="${escapeHtml(t(lang, 'settings.languageLabel'))}"
            data-settings-language-picker="true"
            class="mt-2.5 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm"
          >
            ${languageButtonsHtml}
          </div>
        </div>

        <div class="mt-4 pt-3.5 border-t border-linen-200/70 dark:border-night-800">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            ${escapeHtml(t(lang, 'settings.coverAspectLabel'))}
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
            ${escapeHtml(t(lang, 'settings.coverAspectHint'))}
          </p>
          <div class="mt-2.5 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm">
            ${coverAspectButtonsHtml}
          </div>
        </div>

        <div class="mt-4 pt-3.5 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.dynamicTintLabel'))}
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.dynamicTintHint'))}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${settings.dynamicCoverTint !== false ? 'true' : 'false'}"
            data-action="toggle-dynamic-cover-tint"
            class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              settings.dynamicCoverTint !== false
                ? 'bg-forest-700 text-white'
                : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
            }"
          >
            ${settings.dynamicCoverTint !== false ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
          </button>
        </div>

        <div class="mt-4 pt-3.5 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.cornerDecorationsLabel'))}
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.cornerDecorationsHint'))}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${showPresetDecorations ? 'true' : 'false'}"
            data-action="toggle-preset-decorations"
            class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              showPresetDecorations
                ? 'bg-forest-700 text-white'
                : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
            }"
          >
            ${showPresetDecorations ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
          </button>
        </div>
      </section>

      <!-- Collection Presets & Reminder Window -->
      <section
        aria-labelledby="preset-reminders-heading"
        data-preset-notifications-section="true"
        class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3.5"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="preset-reminders-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.presetRemindersHeading'))}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
              ${escapeHtml(t(lang, 'settings.presetRemindersDesc'))}
            </p>
          </div>
          <a
            href="#/presets"
            class="min-h-[38px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center transition-colors shrink-0 whitespace-nowrap"
          >
            ${escapeHtml(t(lang, 'settings.openPresets'))}
          </a>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div class="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3 space-y-1.5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="flex items-center gap-1.5">
                  <label for="setting-preset-days-before" class="text-xs font-semibold text-forest-900 dark:text-white">
                    ${escapeHtml(t(lang, 'settings.presetDaysBeforeLabel'))}
                  </label>
                  ${renderFieldInfoButton({ helpKey: 'presetDaysBefore', scope: 'settings' })}
                </div>
                <span class="block text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                  ${escapeHtml(t(lang, 'settings.presetDaysBeforeSub'))}
                </span>
              </div>
              <input
                id="setting-preset-days-before"
                name="presetAlertDaysBefore"
                type="number"
                min="0"
                max="30"
                value="${escapeHtml(presetDaysBefore)}"
                class="w-20 h-10 px-2.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-center font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700 shrink-0"
              />
            </div>
            ${renderFieldInfoPanel({ helpKey: 'presetDaysBefore', scope: 'settings' })}
          </div>

          <div class="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3 space-y-1.5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="flex items-center gap-1.5">
                  <label for="setting-preset-days-after" class="text-xs font-semibold text-forest-900 dark:text-white">
                    ${escapeHtml(t(lang, 'settings.presetDaysAfterLabel'))}
                  </label>
                  ${renderFieldInfoButton({ helpKey: 'presetDaysAfter', scope: 'settings' })}
                </div>
                <span class="block text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                  ${escapeHtml(t(lang, 'settings.presetDaysAfterSub'))}
                </span>
              </div>
              <input
                id="setting-preset-days-after"
                name="presetAlertDaysAfter"
                type="number"
                min="0"
                max="30"
                value="${escapeHtml(presetDaysAfter)}"
                class="w-20 h-10 px-2.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-center font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700 shrink-0"
              />
            </div>
            ${renderFieldInfoPanel({ helpKey: 'presetDaysAfter', scope: 'settings' })}
          </div>
        </div>
      </section>

      <!-- Shelf Freshness, Cooldown Log & Stale Book Spotlight -->
      <section
        aria-labelledby="freshness-spotlight-heading"
        data-freshness-spotlight-section="true"
        class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3.5"
      >
        <div>
          <h2 id="freshness-spotlight-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
            ${escapeHtml(t(lang, 'settings.freshnessHeading'))}
          </h2>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
            ${escapeHtml(t(lang, 'settings.freshnessDesc'))}
          </p>
        </div>

        <div class="divide-y divide-linen-200/70 dark:divide-night-800">
          <div class="py-3 first:pt-1 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.rotationHistoryHeading'))}
              </p>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                ${escapeHtml(t(lang, 'settings.rotationHistoryDesc'))}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="${enableRotationHistoryInsights ? 'true' : 'false'}"
              data-action="toggle-rotation-history-insights"
              class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                enableRotationHistoryInsights
                  ? 'bg-forest-700 text-white'
                  : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
              }"
            >
              ${enableRotationHistoryInsights ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
            </button>
          </div>

          <div class="py-3 space-y-1.5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="flex items-center gap-1.5">
                  <p class="text-sm font-semibold text-forest-900 dark:text-white">
                    ${escapeHtml(t(lang, 'settings.coverAdornosHeading'))}
                  </p>
                  ${renderFieldInfoButton({ helpKey: 'coverUsageAdornos', scope: 'settings' })}
                </div>
                <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                  ${escapeHtml(t(lang, 'settings.coverAdornosDesc'))}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="${showCoverUsageAdornos ? 'true' : 'false'}"
                data-action="toggle-cover-usage-adornos"
                class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  showCoverUsageAdornos
                    ? 'bg-forest-700 text-white'
                    : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
                }"
              >
                ${showCoverUsageAdornos ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
              </button>
            </div>
            ${renderFieldInfoPanel({ helpKey: 'coverUsageAdornos', scope: 'settings' })}
          </div>

          <div class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.staleSpotlightHeading'))}
              </p>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                ${escapeHtml(t(lang, 'settings.staleSpotlightDesc'))}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="${enableStaleBookSpotlight ? 'true' : 'false'}"
              data-action="toggle-stale-book-spotlight"
              class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                enableStaleBookSpotlight
                  ? 'bg-forest-700 text-white'
                  : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
              }"
            >
              ${enableStaleBookSpotlight ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
            </button>
          </div>

          <div class="pt-3 space-y-1.5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="flex items-center gap-1.5">
                  <label for="setting-stale-book-days" class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                    ${escapeHtml(t(lang, 'settings.staleDaysLabel'))}
                  </label>
                  ${renderFieldInfoButton({ helpKey: 'staleBookDays', scope: 'settings' })}
                </div>
                <span class="block text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                  ${escapeHtml(t(lang, 'settings.staleDaysSub'))}
                </span>
              </div>
              <input
                id="setting-stale-book-days"
                name="staleBookDays"
                type="number"
                min="3"
                max="60"
                ${!enableStaleBookSpotlight ? 'disabled' : ''}
                value="${escapeHtml(staleBookDays)}"
                class="w-20 h-10 px-2.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 disabled:opacity-50 text-sm font-mono-tabular text-center font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700 shrink-0"
              />
            </div>
            ${renderFieldInfoPanel({ helpKey: 'staleBookDays', scope: 'settings' })}
          </div>
        </div>
      </section>

      <!-- In-App PWA Install & Offline Readiness Card -->
      <section aria-labelledby="pwa-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="pwa-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.pwaHeading'))}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.pwaNetwork'))}: ${
                pwaStatus.isOnline
                  ? escapeHtml(t(lang, 'settings.pwaOnline'))
                  : escapeHtml(t(lang, 'settings.pwaOffline'))
              } · ${escapeHtml(t(lang, 'settings.pwaShell'))}: ${
                pwaStatus.swReady
                  ? escapeHtml(t(lang, 'settings.pwaReady'))
                  : escapeHtml(t(lang, 'settings.pwaRegistering'))
              } · ${escapeHtml(t(lang, 'settings.pwaStorage'))}: ${escapeHtml(storageBackend)}
            </p>
          </div>
          <div class="shrink-0">
            ${pwaActionHtml}
          </div>
        </div>
      </section>

      <!-- Catalog Metadata Providers -->
      <section aria-labelledby="metadata-providers-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <h2 id="metadata-providers-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
          ${escapeHtml(t(lang, 'settings.metadataProvidersHeading'))}
        </h2>
        <div class="mt-2 divide-y divide-linen-200/70 dark:divide-night-800">
          ${catalogProvidersHtml}

          <div class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.retainRawTitle'))}
              </p>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                ${escapeHtml(t(lang, 'settings.retainRawDesc'))}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="${settings.retainRawProviderPayloads ? 'true' : 'false'}"
              data-action="toggle-raw-payloads"
              class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                settings.retainRawProviderPayloads
                  ? 'bg-forest-700 text-white'
                  : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
              }"
            >
              ${settings.retainRawProviderPayloads ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
            </button>
          </div>

          <div class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.searchWhileTypingTitle'))}
              </p>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                ${escapeHtml(t(lang, 'settings.searchWhileTypingDesc'))}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="${settings.searchWhileTyping ? 'true' : 'false'}"
              data-action="toggle-search-while-typing"
              class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                settings.searchWhileTyping
                  ? 'bg-forest-700 text-white'
                  : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
              }"
            >
              ${settings.searchWhileTyping ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
            </button>
          </div>

          <div class="pt-3.5 pb-3.5 flex flex-col gap-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <p class="text-sm font-semibold text-forest-900 dark:text-white">
                  ${escapeHtml(t(lang, 'settings.googleQuotaTitle'))}
                </p>
                <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                  ${escapeHtml(t(lang, 'settings.googleQuotaDesc'))}
                </p>
              </div>
              <button
                type="button"
                data-action="check-google-books-api"
                data-google-check-state="${escapeHtml(googleHealthTone)}"
                ${settingsUiState.checkingGoogleBooks ? 'disabled' : ''}
                class="min-h-[42px] px-3.5 py-2 rounded-xl disabled:opacity-60 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  googleHealthTone === 'success'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-500/45 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500/40'
                    : googleHealthTone === 'error'
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/45 dark:hover:bg-rose-950/65 dark:text-rose-200 dark:border-rose-800'
                      : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white'
                }"
              >
                ${
                  settingsUiState.checkingGoogleBooks
                    ? renderIcon('activity', 'w-3.5 h-3.5 animate-pulse')
                    : googleHealthTone === 'success'
                      ? `<span data-google-check-icon="ok" class="inline-flex text-emerald-700 dark:text-emerald-300">${renderIcon('check', 'w-3.5 h-3.5', 2.4)}</span>`
                      : googleHealthTone === 'error'
                        ? `<span data-google-check-icon="error" class="inline-flex text-rose-700 dark:text-rose-300">${renderIcon('close', 'w-3.5 h-3.5', 2.4)}</span>`
                        : renderIcon('activity', 'w-3.5 h-3.5')
                }
                <span>${settingsUiState.checkingGoogleBooks ? escapeHtml(t(lang, 'settings.checkingGoogleApi')) : escapeHtml(t(lang, 'settings.checkGoogleApiBtn'))}</span>
              </button>
            </div>

            ${
              settingsUiState.googleBooksHealthReport
                ? googleHealthTone === 'error'
                  ? `
                    <div
                      role="alert"
                      data-google-health-box="error"
                      class="rounded-xl bg-rose-50/95 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium text-rose-900 dark:text-rose-100 leading-relaxed"
                    >
                      <span class="mt-0.5 w-4 h-4 rounded-full bg-rose-600 text-white inline-flex items-center justify-center shrink-0" aria-hidden="true">
                        ${renderIcon('close', 'w-3 h-3', 2.5)}
                      </span>
                      <span class="min-w-0 break-words">${escapeHtml(settingsUiState.googleBooksHealthReport)}</span>
                    </div>
                  `
                  : `
                    <div
                      role="status"
                      data-google-health-box="success"
                      class="rounded-xl bg-emerald-50/95 dark:bg-emerald-950/35 border border-emerald-500/40 dark:border-emerald-500/40 px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium text-emerald-950 dark:text-emerald-100 leading-relaxed"
                    >
                      <span class="mt-0.5 w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0" aria-hidden="true">
                        ${renderIcon('check', 'w-3 h-3', 2.6)}
                      </span>
                      <span class="min-w-0 break-words">${escapeHtml(settingsUiState.googleBooksHealthReport)}</span>
                    </div>
                  `
                : ''
            }

            ${(() => {
              const deviceProxyUrl = String(settingsUiState.deviceBooksProxyUrl || '').trim();
              if (deviceProxyUrl) {
                return `
                  <div
                    role="status"
                    data-google-key-status="device-proxy"
                    class="rounded-xl bg-forest-50/90 dark:bg-forest-900/25 border border-forest-700/30 dark:border-[#5ED3DA]/35 px-3.5 py-3 flex items-start gap-2.5"
                  >
                    <span class="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                      ${renderIcon('shield', 'w-4 h-4')}
                    </span>
                    <div class="text-xs leading-relaxed min-w-0">
                      <p class="font-semibold text-forest-900 dark:text-[#5ED3DA]">
                        ${escapeHtml(t(lang, 'settings.deviceProxyActiveTitle'))}
                      </p>
                      <p class="text-stone-ink dark:text-slate-300 mt-0.5 break-all">
                        ${escapeHtml(t(lang, 'settings.deviceProxyActiveDesc', { url: deviceProxyUrl }))}
                      </p>
                    </div>
                  </div>
                `;
              }
              const keyStatus = settingsUiState.googleBooksKeyStatus || 'unknown';
              if (keyStatus === 'configured') {
                return `
                  <div
                    role="status"
                    data-google-key-status="configured"
                    class="rounded-xl bg-forest-50/90 dark:bg-forest-900/25 border border-forest-700/30 dark:border-[#5ED3DA]/35 px-3.5 py-3 flex items-start gap-2.5"
                  >
                    <span class="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                      ${renderIcon('shield', 'w-4 h-4')}
                    </span>
                    <div class="text-xs leading-relaxed">
                      <p class="font-semibold text-forest-900 dark:text-[#5ED3DA]">
                        ${escapeHtml(t(lang, 'settings.serverKeyConfiguredTitle'))}
                      </p>
                      <p class="text-stone-ink dark:text-slate-300 mt-0.5">
                        ${escapeHtml(t(lang, 'settings.serverKeyConfiguredDesc'))}
                      </p>
                    </div>
                  </div>
                `;
              }
              if (keyStatus === 'shared-quota') {
                return `
                  <div
                    role="status"
                    data-google-key-status="shared-quota"
                    class="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 px-3.5 py-3 flex items-start gap-2.5"
                  >
                    <span class="mt-0.5 text-espresso-800 dark:text-amber-300 shrink-0">
                      ${renderIcon('shield', 'w-4 h-4')}
                    </span>
                    <div class="text-xs leading-relaxed">
                      <p class="font-semibold text-forest-900 dark:text-white">
                        ${escapeHtml(t(lang, 'settings.sharedQuotaTitle'))}
                      </p>
                      <p class="text-stone-ink dark:text-slate-300 mt-0.5">
                        ${escapeHtml(t(lang, 'settings.sharedQuotaDesc'))}
                      </p>
                    </div>
                  </div>
                `;
              }
              if (keyStatus === 'static-host') {
                return `
                  <div
                    role="status"
                    data-google-key-status="static-host"
                    class="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 px-3.5 py-3 flex items-start gap-2.5"
                  >
                    <span class="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                      ${renderIcon('shield', 'w-4 h-4')}
                    </span>
                    <div class="text-xs leading-relaxed">
                      <p class="font-semibold text-forest-900 dark:text-white">
                        ${escapeHtml(t(lang, 'settings.staticHostTitle'))}
                      </p>
                      <p class="text-stone-ink dark:text-slate-300 mt-0.5">
                        ${escapeHtml(t(lang, 'settings.staticHostDesc'))}
                      </p>
                    </div>
                  </div>
                `;
              }
              return `
                <div
                  role="status"
                  data-google-key-status="unknown"
                  class="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 px-3.5 py-3 flex items-start gap-2.5"
                >
                  <span class="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                    ${renderIcon('shield', 'w-4 h-4')}
                  </span>
                  <div class="text-xs leading-relaxed">
                    <p class="font-semibold text-forest-900 dark:text-white">
                      ${escapeHtml(t(lang, 'settings.safeQuotaGeneralTitle'))}
                    </p>
                    <p class="text-stone-ink dark:text-slate-300 mt-0.5">
                      ${escapeHtml(t(lang, 'settings.safeQuotaGeneralDesc'))}
                    </p>
                  </div>
                </div>
              `;
            })()}

            <details
              data-advanced-proxy-disclosure="true"
              ${
                settingsUiState.deviceBooksProxyUrl || settingsUiState.deviceBooksProxyError
                  ? 'open'
                  : ''
              }
              class="group rounded-xl bg-linen-50/75 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 px-3.5 py-2.5"
            >
              <summary class="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700">
                <span>${escapeHtml(t(lang, 'settings.advancedProxySummary'))}</span>
                <span class="text-stone-ink dark:text-slate-400 transition-transform group-open:rotate-180">
                  ${renderIcon('chevronDown', 'w-4 h-4')}
                </span>
              </summary>

              <form
                id="device-books-proxy-form"
                class="pt-3 mt-2 border-t border-linen-200/80 dark:border-night-800 space-y-2.5"
                novalidate
              >
                <div class="flex flex-col sm:flex-row sm:items-end gap-2.5">
                  <div class="flex-1 min-w-0">
                    <label
                      for="device-books-proxy-url-input"
                      class="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                    >
                      ${escapeHtml(t(lang, 'settings.deviceProxyLabel'))}
                    </label>
                    <div class="relative min-w-0">
                      <input
                        id="device-books-proxy-url-input"
                        name="deviceBooksProxyUrl"
                        type="url"
                        value="${escapeHtml(settingsUiState.deviceBooksProxyUrl || '')}"
                        placeholder="https://books-proxy.yourname.workers.dev"
                        class="w-full h-11 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                      ${renderInputClearButton({
                        targetId: 'device-books-proxy-url-input',
                        value: settingsUiState.deviceBooksProxyUrl || '',
                        label: t(lang, 'common.clearText'),
                        lang,
                      })}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <button
                      type="submit"
                      ${settingsUiState.checkingGoogleBooks ? 'disabled' : ''}
                      class="h-11 px-4 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      ${settingsUiState.checkingGoogleBooks ? escapeHtml(t(lang, 'settings.verifyingBtn')) : (lang === 'en' ? 'Save & Verify' : escapeHtml(t(lang, 'settings.saveAndVerifyBtn')))}
                    </button>
                    ${
                      settingsUiState.deviceBooksProxyUrl
                        ? `
                          <button
                            type="button"
                            data-action="clear-device-books-proxy"
                            class="h-11 px-3 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-stone-ink dark:text-slate-300 transition-colors whitespace-nowrap"
                          >
                            ${escapeHtml(t(lang, 'common.clear'))}
                          </button>
                        `
                        : ''
                    }
                  </div>
                </div>
                <p class="text-[11px] text-stone-ink dark:text-slate-400 leading-relaxed">
                  ${escapeHtml(t(lang, 'settings.proxyAutoCheckHint'))}
                  <a
                    href="${escapeHtml(APP_DOCS_LINKS.cloudflareWorkerGuide)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cloudflare-guide-link="true"
                    class="font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2 hover:text-forest-900 dark:hover:text-white ml-1 whitespace-nowrap"
                  >
                    ${escapeHtml(t(lang, 'settings.cloudflareGuideLinkText'))}
                  </a>
                </p>
                ${
                  settingsUiState.deviceBooksProxyError
                    ? `<div role="alert" data-proxy-url-error="true" class="rounded-xl bg-rose-50/95 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 px-3 py-2 text-xs font-medium text-rose-800 dark:text-rose-200">${escapeHtml(
                        settingsUiState.deviceBooksProxyError
                      )}</div>`
                    : ''
                }
              </form>
            </details>

            <details
              data-google-key-guide="true"
              ${settingsUiState.isGoogleKeyGuideOpen ? 'open' : ''}
              class="group rounded-xl bg-linen-50/75 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 px-3.5 py-2.5"
            >
              <summary class="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700">
                <span>${escapeHtml(t(lang, 'settings.googleGuideSummary'))}</span>
                <span class="text-stone-ink dark:text-slate-400 transition-transform group-open:rotate-180">
                  ${renderIcon('chevronDown', 'w-4 h-4')}
                </span>
              </summary>
              <div class="pt-2.5 mt-2 border-t border-linen-200/80 dark:border-night-800 space-y-2 text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                <p>
                  <strong class="text-forest-900 dark:text-white">${escapeHtml(t(lang, 'settings.googleGuideStep1'))}</strong>
                  In <a href="${escapeHtml(GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL)}" target="_blank" rel="noopener noreferrer" class="font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2">Google Cloud Console</a> &rarr; <strong>APIs &amp; Services &rarr; Library</strong>, enable <strong>Books API</strong>, create a credential under <strong>Credentials</strong>, and restrict it strictly to <strong>Books API</strong>.
                </p>
                <p>
                  <strong class="text-forest-900 dark:text-white">${escapeHtml(t(lang, 'settings.googleGuideStep2'))}</strong>
                  Set <code>GOOGLE_BOOKS_API_KEY=your_secret_here</code> in server environment variables or local untracked <code>.env</code>. The built-in <code>/api/books/volumes</code> proxy injects it automatically.
                </p>
                <p>
                  <strong class="text-forest-900 dark:text-white">${escapeHtml(t(lang, 'settings.googleGuideStep3'))}</strong>
                  Create a free Worker, paste the CORS-ready proxy script below, add variable <code>ALLOWED_ORIGIN</code> (e.g. <code>https://yourname.github.io</code>) + encrypted secret <code>GOOGLE_BOOKS_API_KEY</code>, and paste your Worker URL above:
                </p>
                <pre class="p-2.5 rounded-lg bg-night-950 text-ivory font-mono-tabular text-[11px] overflow-x-auto">export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || origin || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const incoming = new URL(request.url);
    const upstream = new URL('https://www.googleapis.com/books/v1/volumes');
    for (const key of ['q', 'maxResults', 'printType']) {
      if (incoming.searchParams.get(key)) upstream.searchParams.set(key, incoming.searchParams.get(key));
    }
    if (env.GOOGLE_BOOKS_API_KEY) upstream.searchParams.set('key', env.GOOGLE_BOOKS_API_KEY);

    const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });
    return new Response(await res.text(), {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
  },
};</pre>
                <div class="pt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    data-action="open-welcome-books-modal"
                    class="min-h-[36px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors"
                  >
                    ${escapeHtml(t(lang, 'settings.openWelcomeModalBtn'))}
                  </button>
                  <a
                    href="${escapeHtml(APP_DOCS_LINKS.cloudflareWorkerGuide)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2 hover:text-forest-900 dark:hover:text-white"
                  >
                    ${escapeHtml(t(lang, 'settings.openCloudflareGuideBtn'))}
                  </a>
                </div>
              </div>
            </details>
          </div>

          <div
            data-library-metadata-sync-row="true"
            class="pt-3.5 flex flex-col gap-2.5"
          >
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-forest-900 dark:text-white">
                  ${escapeHtml(t(lang, 'settings.syncLibraryTitle'))}
                </p>
                <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
                  ${escapeHtml(
                    t(lang, 'settings.syncLibraryDesc', {
                      needed: booksNeedingGoogleSyncCount,
                      total: state.books.length,
                    })
                  )}
                </p>
              </div>
              <button
                type="button"
                data-action="sync-library-metadata"
                ${settingsUiState.syncingCatalogMetadata || state.books.length === 0 ? 'disabled' : ''}
                class="min-h-[42px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                ${renderIcon('rotations', settingsUiState.syncingCatalogMetadata ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5')}
                <span>${
                  settingsUiState.syncingCatalogMetadata
                    ? escapeHtml(settingsUiState.catalogSyncProgressText || t(lang, 'settings.syncingLibraryProgress'))
                    : escapeHtml(t(lang, 'settings.syncLibraryBtn', { count: booksNeedingGoogleSyncCount }))
                }</span>
              </button>
            </div>

            ${
              settingsUiState.catalogSyncReport
                ? settingsUiState.catalogSyncTone === 'error'
                  ? `
                    <div
                      role="alert"
                      data-catalog-sync-box="error"
                      class="rounded-xl bg-rose-50/95 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium text-rose-900 dark:text-rose-100 leading-relaxed"
                    >
                      <span class="mt-0.5 w-4 h-4 rounded-full bg-rose-600 text-white inline-flex items-center justify-center shrink-0" aria-hidden="true">
                        ${renderIcon('close', 'w-3 h-3', 2.5)}
                      </span>
                      <span>${escapeHtml(settingsUiState.catalogSyncReport)}</span>
                    </div>
                  `
                  : `
                    <div
                      role="status"
                      data-catalog-sync-box="success"
                      class="rounded-xl bg-emerald-50/95 dark:bg-emerald-950/35 border border-emerald-500/40 px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium text-emerald-950 dark:text-emerald-100 leading-relaxed"
                    >
                      <span class="mt-0.5 w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shrink-0" aria-hidden="true">
                        ${renderIcon('check', 'w-3 h-3', 2.6)}
                      </span>
                      <span>${escapeHtml(settingsUiState.catalogSyncReport)}</span>
                    </div>
                  `
                : ''
            }
          </div>
        </div>
      </section>

      <!-- Tagging & Pluggable AI Enrichment Provider Config -->
      <section aria-labelledby="tagging-providers-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3.5">
        <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
          <div>
            <h2 id="tagging-providers-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.taggingHeading'))}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.taggingDesc'))}
            </p>
          </div>
          <span class="text-xs text-stone-ink dark:text-slate-400 whitespace-nowrap">
            ${escapeHtml(t(lang, 'settings.modeLabel'))}: <strong class="font-semibold text-forest-900 dark:text-slate-200">${
              settings.aiEnrichmentOptIn
                ? escapeHtml(
                    t(lang, 'settings.localPlusAdapter', {
                      adapter: selectedAdapter ? selectedAdapter.label : settings.aiAdapterId,
                    })
                  )
                : escapeHtml(t(lang, 'settings.localRulesOnly'))
            }</strong>
          </span>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.autoTaggingTitle'))}
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.autoTaggingDesc'))}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${settings.autoLocalTagging ? 'true' : 'false'}"
            data-action="toggle-auto-local-tagging"
            class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              settings.autoLocalTagging
                ? 'bg-forest-700 text-white'
                : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
            }"
          >
            ${settings.autoLocalTagging ? escapeHtml(t(lang, 'common.enabled')) : escapeHtml(t(lang, 'common.disabled'))}
          </button>
        </div>

        <div class="pt-3 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.aiOptInTitle'))}
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.aiOptInDesc'))}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${settings.aiEnrichmentOptIn ? 'true' : 'false'}"
            data-action="toggle-ai-opt-in"
            class="min-h-[42px] px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              settings.aiEnrichmentOptIn
                ? 'bg-forest-700 text-white'
                : 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300'
            }"
          >
            ${settings.aiEnrichmentOptIn ? escapeHtml(t(lang, 'settings.optedIn')) : escapeHtml(t(lang, 'settings.optedOut'))}
          </button>
        </div>

        <div class="pt-3 border-t border-linen-200/70 dark:border-night-800">
          <p class="text-xs font-semibold text-forest-900 dark:text-slate-200">
            ${escapeHtml(t(lang, 'settings.aiAdapterHeading'))}
          </p>
          ${adapterSelectorHtml}
          ${customEndpointFormHtml}
        </div>

        ${
          settingsUiState.lastAdapterTestReport
            ? `
              <div role="status" class="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 px-3.5 py-2.5 text-xs text-forest-900 dark:text-slate-300">
                ${escapeHtml(settingsUiState.lastAdapterTestReport)}
              </div>
            `
            : ''
        }

        <div class="pt-3 border-t border-linen-200/70 dark:border-night-800 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-action="enrich-all-books"
            ${settingsUiState.enrichingCatalog ? 'disabled' : ''}
            class="min-h-[42px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            ${renderIcon('sparkles', 'w-3.5 h-3.5')}
            ${
              settingsUiState.enrichingCatalog
                ? escapeHtml(t(lang, 'settings.enrichingProgress'))
                : escapeHtml(t(lang, 'settings.reEnrichBtn', { count: state.books.length }))
            }
          </button>

          <button
            type="button"
            data-action="test-ai-adapter"
            ${settingsUiState.testingAdapter ? 'disabled' : ''}
            class="min-h-[42px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 disabled:opacity-60 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            ${settingsUiState.testingAdapter ? escapeHtml(t(lang, 'settings.testingProgress')) : escapeHtml(t(lang, 'settings.testPipelineBtn'))}
          </button>

          <button
            type="button"
            data-action="reset-provider-defaults"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border border-linen-200 dark:border-night-700 hover:bg-linen-100 dark:hover:bg-night-800 text-stone-ink dark:text-slate-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            ${escapeHtml(t(lang, 'settings.safeDefaultsBtn'))}
          </button>
        </div>
      </section>

      <!-- Backup, Restore & Reset -->
      <section aria-labelledby="backup-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <h2 id="backup-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
          ${escapeHtml(t(lang, 'settings.backupHeading'))}
        </h2>
        <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
          ${escapeHtml(t(lang, 'settings.backupDesc'))}
        </p>

        <div class="mt-3.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-action="export-backup"
            class="min-h-[42px] px-3.5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 dark:bg-linen-100 dark:hover:bg-white text-white dark:text-night-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            ${renderIcon('download', 'w-3.5 h-3.5')}
            ${escapeHtml(t(lang, 'settings.exportBtn'))}
          </button>

          <label class="min-h-[42px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
            ${renderIcon('upload', 'w-3.5 h-3.5')}
            ${escapeHtml(t(lang, 'settings.importBtn'))}
            <input id="import-backup-input" type="file" accept="application/json,.json" class="sr-only" />
          </label>

          <button
            type="button"
            data-action="reset-seed-data"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            ${escapeHtml(t(lang, 'settings.resetSeedBtn'))}
          </button>
        </div>
      </section>

      <!-- About the App & User / Developer Documentation -->
      <section
        aria-labelledby="about-app-heading"
        data-about-app-section="true"
        class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3.5"
      >
        <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
          <div>
            <h2 id="about-app-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              ${escapeHtml(t(lang, 'settings.aboutHeading'))}
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              ${escapeHtml(t(lang, 'settings.aboutDesc'))}
            </p>
          </div>
          <div class="sm:text-right shrink-0">
            <span
              data-settings-version-memory="true"
              class="text-xs font-mono-tabular text-stone-ink dark:text-slate-400 whitespace-nowrap"
            >
              ${escapeHtml(t(lang, 'settings.versionLabel'))} <strong class="font-semibold text-forest-900 dark:text-white">${escapeHtml(APP_VERSION)}</strong>
              <span aria-hidden="true" class="mx-1">·</span>
              ${escapeHtml(t(lang, 'settings.memoryLabel'))} <strong data-settings-memory-value="true" class="font-semibold text-forest-900 dark:text-white">${escapeHtml(storageUsage.formatted)}</strong>
            </span>
            ${
              storageUsage.coverDataUrlBytes > 0 || settingsUiState.hasCoverCache || settingsUiState.browserStorageSummary
                ? `<div class="mt-0.5 flex flex-wrap sm:justify-end items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tabular text-stone-ink/80 dark:text-slate-400">
                    <span>${escapeHtml(
                      [
                        storageUsage.coverDataUrlBytes > 0
                          ? `${t(lang, 'settings.photosLabel')}: ${formatStorageBytes(storageUsage.coverDataUrlBytes)}`
                          : '',
                        settingsUiState.browserStorageSummary && !settingsUiState.browserStorageSummary.includes('padded by browser')
                          ? settingsUiState.browserStorageSummary
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    )}</span>
                    <button type="button" data-action="clear-cover-cache" class="font-sans text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2 hover:text-forest-900 dark:hover:text-white">${escapeHtml(
                      t(lang, 'settings.clearCoverCache')
                    )}</button>
                  </div>`
                : ''
            }
          </div>
        </div>

        <p class="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
          ${escapeHtml(
            t(lang, 'settings.aboutStorageText', {
              profiles: state.profiles.length,
              rotations: state.rotations.length,
              books: state.books.length,
              backend: storageBackend,
            })
          )}
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <a
            href="${escapeHtml(APP_DOCS_LINKS.overview)}"
            target="_blank"
            rel="noopener noreferrer"
            data-docs-link="overview"
            class="rounded-xl p-3 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 transition-colors"
          >
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.userGuideTitle'))}
              </p>
              <p class="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                ${escapeHtml(t(lang, 'settings.userGuideDesc'))}
              </p>
            </div>
            <span class="text-forest-700 dark:text-[#5ED3DA] shrink-0">${renderIcon('chevronRight', 'w-4 h-4')}</span>
          </a>

          <a
            href="${escapeHtml(APP_DOCS_LINKS.coverBadges)}"
            target="_blank"
            rel="noopener noreferrer"
            data-docs-link="cover-badges"
            class="rounded-xl p-3 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 transition-colors"
          >
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.coverBadgesTitle'))}
              </p>
              <p class="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                ${escapeHtml(t(lang, 'settings.coverBadgesDesc'))}
              </p>
            </div>
            <span class="text-forest-700 dark:text-[#5ED3DA] shrink-0">${renderIcon('chevronRight', 'w-4 h-4')}</span>
          </a>

          <a
            href="${escapeHtml(APP_DOCS_LINKS.configuration)}"
            target="_blank"
            rel="noopener noreferrer"
            data-docs-link="configuration"
            class="rounded-xl p-3 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 transition-colors"
          >
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.configGuideTitle'))}
              </p>
              <p class="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                ${escapeHtml(t(lang, 'settings.configGuideDesc'))}
              </p>
            </div>
            <span class="text-forest-700 dark:text-[#5ED3DA] shrink-0">${renderIcon('chevronRight', 'w-4 h-4')}</span>
          </a>

          <a
            href="${escapeHtml(APP_DOCS_LINKS.architectureAndProviders)}"
            target="_blank"
            rel="noopener noreferrer"
            data-docs-link="architecture-and-providers"
            class="rounded-xl p-3 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 transition-colors"
          >
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.devGuideTitle'))}
              </p>
              <p class="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                ${escapeHtml(t(lang, 'settings.devGuideDesc'))}
              </p>
            </div>
            <span class="text-forest-700 dark:text-[#5ED3DA] shrink-0">${renderIcon('chevronRight', 'w-4 h-4')}</span>
          </a>

          <a
            href="${escapeHtml(APP_DOCS_LINKS.taggingAndAi)}"
            target="_blank"
            rel="noopener noreferrer"
            data-docs-link="tagging-and-ai"
            class="rounded-xl p-3 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 transition-colors"
          >
            <div class="min-w-0">
              <p class="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                ${escapeHtml(t(lang, 'settings.taggingGuideTitle'))}
              </p>
              <p class="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                ${escapeHtml(t(lang, 'settings.taggingGuideDesc'))}
              </p>
            </div>
            <span class="text-forest-700 dark:text-[#5ED3DA] shrink-0">${renderIcon('chevronRight', 'w-4 h-4')}</span>
          </a>
        </div>
      </section>
    </div>
  `;
}
