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
  escapeHtml,
  formatProfileAgeLabel,
  formatReadingStage,
} from '../../types/models.js';
import { renderAvatarBadge } from '../../ui/components/profile-sheets.js';
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
                    ? '<span class="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA]"> · Active</span>'
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
                    Select
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
    { id: 'portrait', label: 'Original (3:4)' },
    { id: 'square', label: 'Square (1:1)' },
  ]);

  const coverAspectButtonsHtml = coverRatios
    .map((item) => {
      const active = (settings.coverAspectRatio || 'portrait') === item.id;
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
      <p class="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA]">
        Installed in standalone home-screen mode
      </p>
    `;
  } else if (pwaStatus.isInstallable) {
    pwaActionHtml = `
      <button
        type="button"
        data-action="install-pwa"
        class="min-h-[44px] px-5 py-2.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
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
        class="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
      >
        Install on iPhone / iPad
      </button>
    `;
  } else {
    pwaActionHtml = `
      <p class="text-xs text-stone-ink dark:text-slate-400">
        Open in Chrome, Edge, or Safari on your phone to add Book Rotation to your home screen.
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
              <input
                id="ai-endpoint-url-input"
                name="aiEndpointUrl"
                type="url"
                value="${escapeHtml(settings.aiEndpointUrl)}"
                placeholder="https://your-proxy.example.com/api/enrich or http://localhost:11434/enrich"
                class="w-full h-12 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
              />
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

  return `
    <div class="max-w-3xl space-y-5">
      <div>
        <p class="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
          Account & Preferences
        </p>
        <h1 class="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
          Settings & Profiles
        </h1>
      </div>

      <!-- Reader Profiles Summary & Management -->
      <section aria-labelledby="settings-profiles-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
          <div>
            <h2 id="settings-profiles-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              Reader Profiles
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400">
              Ages update automatically from each child’s birth date
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <a
              href="#/profiles"
              class="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1 transition-colors"
            >
              All Details
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
          Appearance
        </h2>
        <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
          Warm linen light mode, deep night mode, or automatic system preference.
        </p>
        <div class="mt-3 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm">
          ${themeButtonsHtml}
        </div>

        <div class="mt-4 pt-3.5 border-t border-linen-200/70 dark:border-night-800">
          <p class="text-sm font-semibold text-forest-900 dark:text-white">
            Book Cover Ratio
          </p>
          <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
            Show book covers in classic 3:4 portrait proportions or compact 1:1 squares.
          </p>
          <div class="mt-2.5 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm">
            ${coverAspectButtonsHtml}
          </div>
        </div>
      </section>

      <!-- In-App PWA Install & Offline Readiness Card -->
      <section aria-labelledby="pwa-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="pwa-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              Installable Phone App (PWA)
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Network: ${pwaStatus.isOnline ? 'Online' : 'Offline'} · Shell: ${
                pwaStatus.swReady ? 'Ready' : 'Registering'
              } · Storage: ${escapeHtml(storageBackend)}
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
          Catalog Metadata Providers
        </h2>
        <div class="mt-2 divide-y divide-linen-200/70 dark:divide-night-800">
          ${catalogProvidersHtml}

          <div class="py-3 flex items-center justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-forest-900 dark:text-white">
                Retain Raw Provider Payloads
              </p>
              <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                Store raw Google Books and Open Library JSON on newly added books.
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
              ${settings.retainRawProviderPayloads ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      </section>

      <!-- Phase 5: Tagging & Pluggable AI Enrichment Provider Config -->
      <section aria-labelledby="tagging-providers-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 space-y-3.5">
        <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
          <div>
            <h2 id="tagging-providers-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
              Tagging & Optional AI Enrichment
            </h2>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Offline rule tagging is active by default; AI adapters are strictly opt-in.
            </p>
          </div>
          <span class="text-xs text-stone-ink dark:text-slate-400 whitespace-nowrap">
            Mode: <strong class="font-semibold text-forest-900 dark:text-slate-200">${
              settings.aiEnrichmentOptIn
                ? `Local + ${escapeHtml(selectedAdapter ? selectedAdapter.label : settings.aiAdapterId)}`
                : 'Local Rules Only'
            }</strong>
          </span>
        </div>

        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              Automatic Local Rule-Based Tagging
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Offline children’s taxonomy + reading-level pacing hints.
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
            ${settings.autoLocalTagging ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div class="pt-3 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-forest-900 dark:text-white">
              Optional AI-Assisted Tag Enrichment
            </p>
            <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Supplements local tags via your chosen keyless adapter.
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
            ${settings.aiEnrichmentOptIn ? 'Opted In' : 'Opted Out'}
          </button>
        </div>

        <div class="pt-3 border-t border-linen-200/70 dark:border-night-800">
          <p class="text-xs font-semibold text-forest-900 dark:text-slate-200">
            Pluggable AI Enrichment Adapter
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
                ? 'Enriching…'
                : `Re-Enrich (${state.books.length} books)`
            }
          </button>

          <button
            type="button"
            data-action="test-ai-adapter"
            ${settingsUiState.testingAdapter ? 'disabled' : ''}
            class="min-h-[42px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 disabled:opacity-60 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            ${settingsUiState.testingAdapter ? 'Testing…' : 'Test Pipeline'}
          </button>

          <button
            type="button"
            data-action="reset-provider-defaults"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border border-linen-200 dark:border-night-700 hover:bg-linen-100 dark:hover:bg-night-800 text-stone-ink dark:text-slate-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Safe Defaults
          </button>
        </div>
      </section>

      <!-- Backup, Restore & Reset -->
      <section aria-labelledby="backup-heading" class="rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5">
        <h2 id="backup-heading" class="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white">
          Backup & Portability
        </h2>
        <p class="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
          Export or import your full catalog, reader profiles, and rotations as JSON.
        </p>

        <div class="mt-3.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-action="export-backup"
            class="min-h-[42px] px-3.5 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 dark:bg-linen-100 dark:hover:bg-white text-white dark:text-night-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            ${renderIcon('download', 'w-3.5 h-3.5')}
            Export Backup
          </button>

          <label class="min-h-[42px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
            ${renderIcon('upload', 'w-3.5 h-3.5')}
            Import Backup
            <input id="import-backup-input" type="file" accept="application/json,.json" class="sr-only" />
          </label>

          <button
            type="button"
            data-action="reset-seed-data"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Reset Sample Data
          </button>
        </div>
      </section>
    </div>
  `;
}
