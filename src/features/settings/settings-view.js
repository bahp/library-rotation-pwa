/**
 * @fileoverview Settings view:
 * - In-App PWA Install Card (Chromium beforeinstallprompt + iOS Safari guide + standalone indicator)
 * - Dual-theme appearance selector (System / Light / Dark)
 * - Catalog Metadata Provider Config (Google Books, Open Library, Raw Payload Retention)
 * - Phase 5 Tagging & Pluggable AI Enrichment Provider Config with Safe Privacy-First Defaults
 * - Local storage backup export (JSON), validated import, and sample seed reset
 */

import { escapeHtml } from '../../types/models.js';
import { renderIcon } from '../../ui/icons.js';

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
 *     endpointError: string
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
  },
}) {
  const { settings } = state;

  const themes = /** @type {Array<{ id: import('../../types/models.js').ThemeMode, label: string }>} */ ([
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ]);

  const themeButtonsHtml = themes
    .map((item) => {
      const active = settings.theme === item.id;
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

  const catalogProviders = [
    {
      id: 'google-books',
      label: 'Google Books Public Volumes API',
      detail: 'Primary ISBN-13/10 lookup, cover thumbnails, and publisher descriptions.',
    },
    {
      id: 'open-library',
      label: 'Open Library Books & Search API',
      detail: 'Complementary edition metadata, subject headings, and archive cover fallback.',
    },
  ];

  const catalogProvidersHtml = catalogProviders
    .map((prov) => {
      const enabled = settings.enabledMetadataProviders.includes(prov.id);
      return `
        <div class="py-3.5 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
              ${escapeHtml(prov.label)}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              ${escapeHtml(prov.detail)}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${enabled ? 'true' : 'false'}"
            data-action="toggle-metadata-provider"
            data-provider-id="${prov.id}"
            class="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              enabled
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
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
                      ? 'bg-teal-50/70 dark:bg-teal-950/35 border-teal-600 dark:border-teal-500'
                      : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                      ${escapeHtml(adapter.label)}
                    </span>
                    <span class="text-[11px] font-medium ${
                      isSelected
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }">
                      ${isSelected ? 'Selected' : 'Select'}
                    </span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    ${escapeHtml(adapter.privacyNote)}
                  </p>
                  <p class="text-[11px] mt-2 ${
                    adapter.available
                      ? 'text-teal-700 dark:text-teal-400'
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
        <form id="ai-provider-config-form" class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3" novalidate>
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div class="sm:col-span-8">
              <label for="ai-endpoint-url-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Keyless HTTPS Proxy or Localhost Bridge URL
              </label>
              <input
                id="ai-endpoint-url-input"
                name="aiEndpointUrl"
                type="url"
                value="${escapeHtml(settings.aiEndpointUrl)}"
                placeholder="https://your-proxy.example.com/api/enrich or http://localhost:11434/enrich"
                class="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-mono-tabular text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
              />
            </div>
            <div class="sm:col-span-4">
              <label for="ai-timeout-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Request Timeout
              </label>
              <select
                id="ai-timeout-select"
                name="aiTimeoutMs"
                class="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
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
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Security rule: Never paste API keys in URLs. Upstream secrets must live inside your server-side proxy or local daemon.
            </p>
            <button
              type="submit"
              class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              Save Proxy Config
            </button>
          </div>
        </form>
      `
      : '';

  return `
    <div class="max-w-3xl space-y-6">
      <div>
        <h1 class="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          Settings, Providers & Offline Data
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configure appearance, metadata & tagging providers, phone installation, and catalog backups.
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

      <!-- Appearance -->
      <section aria-labelledby="appearance-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <h2 id="appearance-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
          Appearance
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Choose light, dark, or automatic system reading surfaces.
        </p>
        <div class="mt-3 flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 max-w-md">
          ${themeButtonsHtml}
        </div>
      </section>

      <!-- Catalog Metadata Providers -->
      <section aria-labelledby="metadata-providers-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6">
        <div>
          <h2 id="metadata-providers-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
            Catalog Metadata Providers
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Keyless public book databases queried in parallel during ISBN lookups and title searches.
          </p>
        </div>

        <div class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          ${catalogProvidersHtml}

          <div class="py-3.5 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">
                Retain Raw Provider Payloads
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Store raw Google Books and Open Library JSON responses on newly added books for inspection.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="${settings.retainRawProviderPayloads ? 'true' : 'false'}"
              data-action="toggle-raw-payloads"
              class="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                settings.retainRawProviderPayloads
                  ? 'bg-teal-700 text-white dark:bg-teal-600'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }"
            >
              ${settings.retainRawProviderPayloads ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </section>

      <!-- Phase 5: Tagging & Pluggable AI Enrichment Provider Config -->
      <section aria-labelledby="tagging-providers-heading" class="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 id="tagging-providers-heading" class="font-display text-lg font-bold text-slate-900 dark:text-white">
              Tagging & Optional AI Enrichment
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Safe defaults: offline rule-based tagging is active; external/AI enrichment is strictly opt-in with zero client API keys.
            </p>
          </div>
          <span class="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Active mode: <strong class="font-semibold text-slate-800 dark:text-slate-200">${
              settings.aiEnrichmentOptIn
                ? `Local + ${escapeHtml(selectedAdapter ? selectedAdapter.label : settings.aiAdapterId)}`
                : 'Local Rules Only'
            }</strong>
          </span>
        </div>

        <!-- Local Rule-Based Tagging Switch -->
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
              Automatic Local Rule-Based Tagging
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Offline children’s taxonomy (holidays, seasons, animals, STEM, bedtime, SEL) + reading-level pacing hints.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${settings.autoLocalTagging ? 'true' : 'false'}"
            data-action="toggle-auto-local-tagging"
            class="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              settings.autoLocalTagging
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }"
          >
            ${settings.autoLocalTagging ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <!-- Explicit Opt-In AI Adapter Switch -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-slate-900 dark:text-white">
              Optional AI-Assisted Tag Enrichment (Explicit Opt-In)
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Off by default. When enabled, supplements local tags via your chosen keyless adapter and falls back cleanly offline.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked="${settings.aiEnrichmentOptIn ? 'true' : 'false'}"
            data-action="toggle-ai-opt-in"
            class="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              settings.aiEnrichmentOptIn
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }"
          >
            ${settings.aiEnrichmentOptIn ? 'Opted In' : 'Opted Out'}
          </button>
        </div>

        <!-- Pluggable Adapter Cards -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800">
          <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Pluggable AI Enrichment Adapter
          </p>
          ${adapterSelectorHtml}
          ${customEndpointFormHtml}
        </div>

        ${
          settingsUiState.lastAdapterTestReport
            ? `
              <div role="status" class="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                ${escapeHtml(settingsUiState.lastAdapterTestReport)}
              </div>
            `
            : ''
        }

        <!-- Enrichment & Safe Defaults Actions -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-action="enrich-all-books"
            ${settingsUiState.enrichingCatalog ? 'disabled' : ''}
            class="min-h-[44px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            ${renderIcon('sparkles', 'w-4 h-4')}
            ${
              settingsUiState.enrichingCatalog
                ? 'Enriching Catalog…'
                : `Re-Enrich Catalog (${state.books.length} books)`
            }
          </button>

          <button
            type="button"
            data-action="test-ai-adapter"
            ${settingsUiState.testingAdapter ? 'disabled' : ''}
            class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            ${settingsUiState.testingAdapter ? 'Testing Pipeline…' : 'Test Tagging Pipeline'}
          </button>

          <button
            type="button"
            data-action="reset-provider-defaults"
            class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Restore Safe Defaults
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
