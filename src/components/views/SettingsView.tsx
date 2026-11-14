import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp, pwaManager } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ToggleSwitch } from '../common/ToggleSwitch.js';
import { testLlmConnection } from '../../features/llm/llm-client.js';
import {
  getDeviceBooksProxyUrl,
  setDeviceBooksProxyUrl,
} from '../../features/catalog/providers/google-books-provider.js';
import {
  SUPPORTED_LANGUAGES,
  AVATAR_TONES,
  normalizeLanguage,
} from '../../config/index.js';
import {
  formatProfileAgeLabel,
  formatReadingStage,
  type ThemeMode,
  type CoverAspectRatio,
  type LlmProvider,
} from '../../types/models.js';
import { APP_VERSION, APP_DOCS_LINKS } from '../../version.js';
import { estimateAppStorageUsage, formatStorageBytes } from '../../core/storage.js';
import { FIELD_HELP_COPY } from '../../ui/components/field-help.js';
import { GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL } from '../../ui/components/welcome-setup-modal.js';
import {
  SettingsGroup,
  SettingsMenuRow,
  SettingsSubViewHeader,
  type SettingsSectionId,
} from './settings/SettingsPrimitives.js';
import {
  WhatsNewSubView,
  LegalSubView,
  OtherSubView,
} from './settings/SettingsInfoSections.js';
import { QueryUsageSubView } from './settings/QueryUsageSubView.js';
import { queryLogger } from '../../features/telemetry/query-logger.js';

const VALID_SECTIONS = new Set<SettingsSectionId>([
  'profiles',
  'appearance',
  'language',
  'shelf-rules',
  'catalog',
  'ai',
  'query-usage',
  'offline-storage',
  'backup',
  'whats-new',
  'guides',
  'privacy',
  'terms',
  'impressum',
  'rate',
  'feedback',
  'donate',
]);

const CLOUDFLARE_WORKER_SAMPLE_SCRIPT = [
  'export default {',
  '  async fetch(request, env) {',
  "    const origin = request.headers.get('Origin') || '*';",
  '    const cors = {',
  "      'Access-Control-Allow-Origin': origin,",
  "      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',",
  "      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',",
  '    };',
  "    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });",
  "    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });",
  '',
  '    try {',
  '      const body = await request.json();',
  "      const apiKey = env.GEMINI_API_KEY || request.headers.get('x-api-key');",
  "      const model = body.model || 'gemini-2.5-flash';",
  "      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey || '');",
  '',
  '      const res = await fetch(url, {',
  "        method: 'POST',",
  "        headers: { 'Content-Type': 'application/json' },",
  '        body: JSON.stringify({',
  '          contents: [{ parts: [{ text: body.prompt }] }],',
  '          systemInstruction: body.systemInstruction ? { parts: [{ text: body.systemInstruction }] } : undefined,',
  "          generationConfig: body.jsonMode ? { responseMimeType: 'application/json' } : undefined,",
  '        }),',
  '      });',
  '',
  '      const data = await res.json();',
  "      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';",
  '      return new Response(JSON.stringify({ ok: true, text, modelUsed: model }), {',
  '        status: res.status,',
  "        headers: { ...cors, 'Content-Type': 'application/json' },",
  '      });',
  '    } catch (err) {',
  '      return new Response(JSON.stringify({ ok: false, error: err.message }), {',
  '        status: 500,',
  "        headers: { ...cors, 'Content-Type': 'application/json' },",
  '      });',
  '    }',
  '  },',
  '};',
].join('\n');

const GOOGLE_BOOKS_WORKER_SAMPLE_SCRIPT = [
  'export default {',
  '  async fetch(request, env) {',
  "    const origin = request.headers.get('Origin') || '';",
  '    const cors = {',
  "      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || origin || '*',",
  "      'Access-Control-Allow-Methods': 'GET, OPTIONS',",
  '    };',
  "    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });",
  '',
  '    const incoming = new URL(request.url);',
  "    const upstream = new URL('https://www.googleapis.com/books/v1/volumes');",
  "    for (const key of ['q', 'maxResults', 'printType']) {",
  '      if (incoming.searchParams.get(key)) upstream.searchParams.set(key, incoming.searchParams.get(key));',
  '    }',
  "    if (env.GOOGLE_BOOKS_API_KEY) upstream.searchParams.set('key', env.GOOGLE_BOOKS_API_KEY);",
  '',
  "    const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } });",
  '    return new Response(await res.text(), {',
  '      status: res.status,',
  "      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },",
  '    });',
  '  },',
  '};',
].join('\n');

export const SettingsView: React.FC = () => {
  const {
    state,
    store,
    catalogService,
    pwaStatus,
    routeParams,
    navigate,
    activeProfile,
    setIsProfileFormOpen,
    setEditingProfileId,
    setIsWelcomeModalOpen,
    t,
  } = useApp();

  const lang = normalizeLanguage(state.settings.language);
  const currentLanguageOption = useMemo(
    () => SUPPORTED_LANGUAGES.find((item) => item.code === lang) || SUPPORTED_LANGUAGES[0],
    [lang]
  );

  // Hierarchical sub-menu navigation synced with URL query (?section=...)
  const rawSection = routeParams.get('section') as SettingsSectionId | null;
  const activeSection: SettingsSectionId | null =
    rawSection && VALID_SECTIONS.has(rawSection) ? rawSection : null;

  const prevSectionRef = useRef<SettingsSectionId | null>(activeSection);
  const [navDirection, setNavDirection] = useState<'initial' | 'forward' | 'back'>('initial');

  useEffect(() => {
    const prev = prevSectionRef.current;
    if (prev !== activeSection) {
      if (activeSection !== null) {
        setNavDirection('forward');
      } else if (prev !== null) {
        setNavDirection('back');
      }
      prevSectionRef.current = activeSection;
    }
  }, [activeSection]);

  const openSection = (section: SettingsSectionId) => {
    setNavDirection('forward');
    navigate('settings', { section });
  };

  const goBackToRoot = () => {
    setNavDirection('back');
    navigate('settings');
  };

  // Field Help Popover state
  const [openHelpKeys, setOpenHelpKeys] = useState<Record<string, boolean>>({});
  const toggleHelp = (key: string) => {
    setOpenHelpKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Query usage live updates
  const [, setQueryUsageTick] = useState(0);
  useEffect(() => {
    return queryLogger.subscribe(() => setQueryUsageTick((t) => t + 1));
  }, []);

  // Inline confirmation for Reset Sample Data
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Google Books state
  const [proxyUrl, setProxyUrl] = useState(() => getDeviceBooksProxyUrl());
  const [proxyError, setProxyError] = useState('');
  const [checkingGoogle, setCheckingGoogle] = useState(false);
  const [googleReport, setGoogleReport] = useState('');
  const [googleTone, setGoogleTone] = useState<'idle' | 'success' | 'error'>('idle');
  const [googleKeyStatus, setGoogleKeyStatus] = useState<
    'unknown' | 'configured' | 'shared-quota' | 'static-host' | 'device-proxy'
  >(() => (getDeviceBooksProxyUrl() ? 'device-proxy' : 'unknown'));

  // Catalog Metadata Sync state
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [catalogSyncProgress, setCatalogSyncProgress] = useState('');
  const [catalogSyncReport, setCatalogSyncReport] = useState('');
  const [catalogSyncTone, setCatalogSyncTone] = useState<'idle' | 'success' | 'error'>('idle');

  // LLM State
  const [selectedLlmProvider, setSelectedLlmProvider] = useState<LlmProvider>(
    state.settings.llmProvider || 'server-gemini'
  );
  const [llmCloudflareUrl, setLlmCloudflareUrl] = useState(state.settings.llmCloudflareUrl || '');
  const [llmBaseUrl, setLlmBaseUrl] = useState(state.settings.llmBaseUrl || '');
  const [llmModel, setLlmModel] = useState(state.settings.llmModel || 'gemini-2.5-flash');
  const [llmApiKey, setLlmApiKey] = useState(state.settings.llmApiKey || '');
  const [showLlmApiKey, setShowLlmApiKey] = useState(false);
  const [llmCustomPromptHint, setLlmCustomPromptHint] = useState(
    state.settings.llmCustomPromptHint || ''
  );
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmReport, setLlmReport] = useState('');
  const [llmTone, setLlmTone] = useState<'idle' | 'success' | 'error'>('idle');

  // Tagging & AI enrichment state
  const [customEndpointUrl, setCustomEndpointUrl] = useState(state.settings.aiEndpointUrl || '');
  const [customEndpointTimeout, setCustomEndpointTimeout] = useState(
    state.settings.aiTimeoutMs || 6000
  );
  const [customEndpointError, setCustomEndpointError] = useState('');
  const [testingAdapter, setTestingAdapter] = useState(false);
  const [enrichingCatalog, setEnrichingCatalog] = useState(false);
  const [lastAdapterTestReport, setLastAdapterTestReport] = useState('');

  // Copy feedback & refresh state
  const [copiedLlmScript, setCopiedLlmScript] = useState(false);
  const [copiedBooksScript, setCopiedBooksScript] = useState(false);
  const [refreshingApp, setRefreshingApp] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage and sync metrics
  const storageUsage = useMemo(() => estimateAppStorageUsage(state), [state]);
  const adapterDiagnostics = useMemo(
    () => store.getTaggingService().getAdapterDiagnostics(state.settings),
    [store, state.settings]
  );
  const selectedAdapter = useMemo(
    () =>
      adapterDiagnostics.find((a) => a.id === state.settings.aiAdapterId) ||
      adapterDiagnostics[0] ||
      null,
    [adapterDiagnostics, state.settings.aiAdapterId]
  );

  const booksNeedingGoogleSyncCount = useMemo(() => {
    return state.books.filter((b) => {
      const hasGoogle = b.sources.some(
        (s) => String(s?.provider || '').toLowerCase() === 'google-books'
      );
      return !hasGoogle || !b.coverUrl || !b.pageCount || !b.publishedYear;
    }).length;
  }, [state.books]);

  // Appearance handlers
  const handleThemeChange = async (theme: ThemeMode) => {
    await store.updateSettings({ theme });
  };

  const handleLanguageChange = async (language: string) => {
    await store.updateSettings({ language: language as any });
  };

  const handleCoverAspectChange = async (coverAspectRatio: CoverAspectRatio) => {
    await store.updateSettings({ coverAspectRatio });
  };

  const handleToggleDynamicTint = async () => {
    await store.updateSettings({ dynamicCoverTint: state.settings.dynamicCoverTint === false });
  };

  const handleTogglePresetDecorations = async () => {
    await store.updateSettings({
      showPresetDecorations: state.settings.showPresetDecorations === false,
    });
  };

  // Presets & freshness handlers
  const handlePresetDaysBeforeChange = async (val: number) => {
    const clamped = Math.max(0, Math.min(30, val));
    await store.updateSettings({ presetAlertDaysBefore: clamped });
  };

  const handlePresetDaysAfterChange = async (val: number) => {
    const clamped = Math.max(0, Math.min(30, val));
    await store.updateSettings({ presetAlertDaysAfter: clamped });
  };

  const handleToggleRotationHistoryInsights = async () => {
    await store.updateSettings({
      enableRotationHistoryInsights: state.settings.enableRotationHistoryInsights === false,
    });
  };

  const handleToggleCoverUsageAdornos = async () => {
    await store.updateSettings({
      showCoverUsageAdornos: state.settings.showCoverUsageAdornos === false,
    });
  };

  const handleToggleStaleBookSpotlight = async () => {
    await store.updateSettings({
      enableStaleBookSpotlight: state.settings.enableStaleBookSpotlight === false,
    });
  };

  const handleStaleBookDaysChange = async (val: number) => {
    const clamped = Math.max(3, Math.min(60, val));
    await store.updateSettings({ staleBookDays: clamped });
  };

  // Metadata provider handlers
  const handleToggleMetadataProvider = async (providerId: string) => {
    const current = state.settings.enabledMetadataProviders || [];
    const updated = current.includes(providerId)
      ? current.filter((id) => id !== providerId)
      : [...current, providerId];
    await store.updateSettings({ enabledMetadataProviders: updated });
  };

  const handleToggleRetainRaw = async () => {
    await store.updateSettings({
      retainRawProviderPayloads: !state.settings.retainRawProviderPayloads,
    });
  };

  const handleToggleSearchWhileTyping = async () => {
    await store.updateSettings({
      searchWhileTyping: !state.settings.searchWhileTyping,
    });
  };

  // Google Books verification
  const handleVerifyGoogleBooks = async (isProxySave = false) => {
    setCheckingGoogle(true);
    setGoogleReport('');
    setGoogleTone('idle');

    try {
      const diag = await catalogService.checkProviderHealth('google-books');
      if (proxyUrl) {
        setGoogleKeyStatus('device-proxy');
      } else if (diag.keyConfigured === true) {
        setGoogleKeyStatus('configured');
      } else if (diag.keyConfigured === false) {
        setGoogleKeyStatus('shared-quota');
      }

      const keyModeSuffix = proxyUrl
        ? ' · Auth: Personal device Books proxy'
        : diag.keyConfigured === true
          ? ' · Auth: Dedicated server key (GOOGLE_BOOKS_API_KEY)'
          : diag.keyConfigured === false
            ? ' · Auth: Shared anonymous quota (set GOOGLE_BOOKS_API_KEY on server or connect a personal proxy URL)'
            : '';

      if (diag.ok) {
        setGoogleTone('success');
        const prefixLabel = isProxySave
          ? `Personal proxy saved & verified (${diag.latencyMs} ms)`
          : `Google Books API working (${diag.latencyMs} ms)`;
        setGoogleReport(
          `${prefixLabel} · Retrieved "${diag.matchedTitle}"${
            diag.externalId ? ` [id: ${diag.externalId}]` : ''
          } · Cover image: ${diag.hasCover ? 'Yes' : 'None on this edition'}${keyModeSuffix}.`
        );
        store.notify(
          isProxySave
            ? `Personal Books proxy verified (${diag.latencyMs} ms).`
            : `Google Books API connected (${diag.latencyMs} ms).`,
          'success'
        );
      } else {
        setGoogleTone('error');
        setGoogleReport(`Google Books check issue: ${diag.error || 'Unreachable'}${keyModeSuffix}`);
        store.notify('Google Books API check failed.', 'error');
      }
    } catch (err) {
      setGoogleTone('error');
      setGoogleReport(err instanceof Error ? err.message : 'Google Books API check failed.');
      store.notify('Google Books API check failed.', 'error');
    } finally {
      setCheckingGoogle(false);
    }
  };

  const handleSaveProxyUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = proxyUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setProxyError('Please enter a valid URL starting with https://');
      return;
    }
    setProxyError('');
    setDeviceBooksProxyUrl(trimmed);
    store.notify('Saved personal Books proxy URL.', 'success');
    handleVerifyGoogleBooks(true);
  };

  const handleClearProxyUrl = () => {
    setProxyUrl('');
    setProxyError('');
    setDeviceBooksProxyUrl('');
    setGoogleKeyStatus('unknown');
    store.notify('Cleared personal device Books proxy.', 'info');
  };

  const handleSyncLibraryMetadata = async () => {
    setSyncingCatalog(true);
    setCatalogSyncProgress('Updating Library…');
    setCatalogSyncReport('');
    setCatalogSyncTone('idle');

    try {
      const summary = await store.syncExistingCatalogMetadata(catalogService, {
        onProgress: ({ current, total }: { current: number; total: number }) => {
          setCatalogSyncProgress(`Updating ${current}/${total}…`);
        },
      });

      if (summary.updatedCount === 0 && summary.errorsCount > 0) {
        setCatalogSyncTone('error');
        setCatalogSyncReport(
          `Could not reach catalog providers for ${summary.errorsCount} book(s). Verify your Google Books connection above and try again.`
        );
      } else {
        setCatalogSyncTone('success');
        const parts = [
          `Checked ${summary.checkedCount} book(s)`,
          `${summary.updatedCount} updated`,
          summary.addedGoogleSourceCount > 0
            ? `${summary.addedGoogleSourceCount} linked to Google Books`
            : '',
          summary.addedCoversCount > 0 ? `${summary.addedCoversCount} new cover(s) added` : '',
          summary.skippedCount > 0 ? `${summary.skippedCount} already complete` : '',
        ].filter(Boolean);
        setCatalogSyncReport(`${parts.join(' · ')}.`);
      }
    } catch (err) {
      setCatalogSyncTone('error');
      setCatalogSyncReport(err instanceof Error ? err.message : 'Library metadata update failed.');
    } finally {
      setSyncingCatalog(false);
      setCatalogSyncProgress('');
    }
  };

  // LLM handlers
  const handleSaveLlmSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await store.updateSettings({
      llmProvider: selectedLlmProvider,
      llmCloudflareUrl: llmCloudflareUrl.trim(),
      llmBaseUrl: llmBaseUrl.trim(),
      llmModel: llmModel.trim(),
      llmApiKey: llmApiKey.trim(),
      llmCustomPromptHint: llmCustomPromptHint.trim(),
    });
    store.notify('Saved AI Assistant connection preferences.', 'success');
  };

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmReport('');
    setLlmTone('idle');

    try {
      const draftSettings = {
        ...state.settings,
        llmProvider: selectedLlmProvider,
        llmCloudflareUrl: llmCloudflareUrl.trim(),
        llmBaseUrl: llmBaseUrl.trim(),
        llmModel: llmModel.trim(),
        llmApiKey: llmApiKey.trim(),
      };
      const report = (await testLlmConnection(draftSettings)) as any;
      setLlmTone(report.ok ? 'success' : 'error');
      setLlmReport(
        `${report.message} (Provider: ${report.provider || 'gemini'}${
          report.model ? `, Model: ${report.model}` : ''
        }${report.latencyMs ? `, ${report.latencyMs}ms` : ''})`
      );
      store.notify(
        report.ok ? 'LLM connection verified!' : 'LLM connection check failed.',
        report.ok ? 'success' : 'error'
      );
    } catch (err) {
      setLlmTone('error');
      setLlmReport(err instanceof Error ? err.message : String(err));
      store.notify('LLM connection test failed.', 'error');
    } finally {
      setTestingLlm(false);
    }
  };

  // Tagging & AI Enrichment handlers
  const handleToggleAutoLocalTagging = async () => {
    await store.updateSettings({
      autoLocalTagging: state.settings.autoLocalTagging === false,
    });
  };

  const handleToggleAiOptIn = async () => {
    await store.updateSettings({
      aiEnrichmentOptIn: !state.settings.aiEnrichmentOptIn,
    });
  };

  const handleSelectAiAdapter = async (adapterId: string) => {
    setLastAdapterTestReport('');
    await store.updateSettings({ aiAdapterId: adapterId });
  };

  const handleSaveCustomEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customEndpointUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      setCustomEndpointError('Please enter a valid URL starting with https:// or http://localhost');
      return;
    }
    setCustomEndpointError('');
    await store.updateSettings({
      aiEndpointUrl: trimmed,
      aiTimeoutMs: Number(customEndpointTimeout),
    });
    store.notify('Saved custom AI endpoint configuration.', 'success');
  };

  const handleEnrichAllBooks = async () => {
    setEnrichingCatalog(true);
    try {
      await store.enrichAllCatalogBooks();
    } catch (err) {
      store.notify(err instanceof Error ? err.message : 'Catalog enrichment failed.', 'error');
    } finally {
      setEnrichingCatalog(false);
    }
  };

  const handleTestAiAdapter = async () => {
    setTestingAdapter(true);
    setLastAdapterTestReport('');
    try {
      const probe = await store.getTaggingService().testAdapterConnection(state.settings);
      const engineDesc = probe.usedAi
        ? `AI Adapter (${probe.adapterId})`
        : `Local Rules (${probe.fallbackReason || 'offline'})`;
      setLastAdapterTestReport(
        `Sample probe ("The Snowy Day") -> Topics: ${probe.tags.join(', ')} · ${
          probe.readingLevelHint
        } · Engine: ${engineDesc}`
      );
    } catch (err) {
      setLastAdapterTestReport(err instanceof Error ? err.message : 'Pipeline test failed.');
    } finally {
      setTestingAdapter(false);
    }
  };

  const handleResetProviderDefaults = async () => {
    setLastAdapterTestReport('');
    await store.resetProviderSettingsToSafeDefaults();
    setCustomEndpointUrl('');
    setCustomEndpointTimeout(6000);
  };

  // Backups & Seed handlers
  const handleExportBackup = () => {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `library-rotation-backup-${dateStamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    store.notify('Downloaded family library JSON backup.', 'success');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await store.importBackupJson(text);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : 'Failed to import backup.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmResetSeed = async () => {
    setConfirmResetOpen(false);
    await store.resetToSeedData();
  };

  const handleClearCoverCache = async () => {
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        await window.caches.delete('book-cover-thumbnails');
      }
      store.notify(
        'Cleared cached offline cover thumbnails. Your library & profiles are untouched.',
        'info'
      );
    } catch (_) {
      store.notify('Could not clear browser cover cache.', 'error');
    }
  };

  const handleForceRefresh = async () => {
    setRefreshingApp(true);
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (reg) => {
            try {
              await reg.update();
            } catch {
              // ignore update check errors offline
            }
            try {
              await reg.unregister();
            } catch {
              // ignore unregister errors
            }
          })
        );
      }
      await store.init();
      store.notify('Cleared cached app assets. Reloading fresh view…', 'success');
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
    } catch (err) {
      setRefreshingApp(false);
      store.notify(err instanceof Error ? err.message : 'Could not force refresh app.', 'error');
    }
  };

  const copyToClipboard = (text: string, type: 'llm' | 'books') => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (type === 'llm') {
          setCopiedLlmScript(true);
          setTimeout(() => setCopiedLlmScript(false), 2000);
        } else {
          setCopiedBooksScript(true);
          setTimeout(() => setCopiedBooksScript(false), 2000);
        }
        store.notify('Script copied to clipboard!', 'success');
      });
    }
  };

  // Summary helpers for Root Menu rows
  const themeLabel =
    state.settings.theme === 'dark'
      ? t('settings.themeDark')
      : state.settings.theme === 'light'
        ? t('settings.themeLight')
        : t('settings.themeSystem');
  const ratioLabel = (state.settings.coverAspectRatio || 'square') === 'portrait' ? '3:4' : '1:1';
  const enabledProviderCount = state.settings.enabledMetadataProviders?.length ?? 2;
  const llmSummary =
    selectedLlmProvider === 'cloudflare-worker'
      ? 'Cloudflare'
      : selectedLlmProvider === 'byok-openai'
        ? 'OpenAI-Compat'
        : selectedLlmProvider === 'byok-gemini'
          ? 'BYOK Gemini'
          : 'Gemini';

  // ---------------------------------------------------------------------------
  // SUB-VIEW RENDERER
  // ---------------------------------------------------------------------------
  if (activeSection !== null) {
    const backLabel = t('nav.settings');

    const renderSubViewBody = () => {
      switch (activeSection) {
        case 'profiles':
          return (
            <>
              <SettingsSubViewHeader
                title={t('profiles.heading')}
                subtitle={t('settings.profilesDesc')}
                backLabel={backLabel}
                onBack={goBackToRoot}
                rightSlot={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('profiles')}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{t('settings.allProfilesDetails')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfileId(null);
                        setIsProfileFormOpen(true);
                      }}
                      aria-label="Add reader profile"
                      title="Add reader profile"
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-forest-700 hover:bg-forest-800 text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer"
                    >
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                  </div>
                }
              />

              <section className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs">
                <div className="divide-y divide-linen-200/70 dark:divide-night-800">
                  {state.profiles.map((profile) => {
                    const isActive = profile.id === state.activeProfileId;
                    const ageLabel = formatProfileAgeLabel(profile);
                    const toneClass = AVATAR_TONES[profile.avatarTone] || AVATAR_TONES.teal;
                    const initial = (profile.name || '?').slice(0, 1).toUpperCase();

                    return (
                      <div key={profile.id} className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`inline-flex items-center justify-center font-display font-bold shrink-0 select-none w-10 h-10 rounded-full text-sm ${toneClass}`}
                          >
                            {initial}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-forest-900 dark:text-white truncate">
                              {profile.name}
                              {isActive && (
                                <span className="text-xs font-semibold text-espresso-800 dark:text-[#5ED3DA] ml-1.5">
                                  · {t('settings.activeReader')}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
                              {ageLabel}
                              {profile.birthDate ? ` (DOB ${profile.birthDate})` : ''} ·{' '}
                              {formatReadingStage(profile.readingStage)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => store.setActiveProfile(profile.id)}
                              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors cursor-pointer"
                            >
                              {t('settings.selectProfile')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProfileId(profile.id);
                              setIsProfileFormOpen(true);
                            }}
                            aria-label={`Edit ${profile.name}`}
                            className="min-h-[40px] min-w-[40px] rounded-xl text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-400 dark:hover:bg-night-800 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Icon name="edit" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          );

        case 'appearance':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.appearanceHeading')}
                subtitle={t('settings.appearanceDesc')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Theme & Cover Ratio */}
              <section className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-5">
                <div>
                  <p className="text-sm font-semibold text-forest-900 dark:text-white">
                    {t('settings.themeLabel')}
                  </p>
                  <div className="mt-2.5 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm">
                    {[
                      { id: 'system' as const, label: t('settings.themeSystem') },
                      { id: 'light' as const, label: t('settings.themeLight') },
                      { id: 'dark' as const, label: t('settings.themeDark') },
                    ].map((item) => {
                      const active = state.settings.theme === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleThemeChange(item.id)}
                          className={`flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-linen-200/70 dark:border-night-800">
                  <p className="text-sm font-semibold text-forest-900 dark:text-white">
                    {t('settings.coverAspectLabel')}
                  </p>
                  <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                    {t('settings.coverAspectHint')}
                  </p>
                  <div className="mt-2.5 flex items-center gap-1 p-1 rounded-2xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 max-w-sm">
                    {[
                      { id: 'square' as const, label: t('settings.coverAspectSquare') },
                      { id: 'portrait' as const, label: t('settings.coverAspectPortrait') },
                    ].map((item) => {
                      const active = (state.settings.coverAspectRatio || 'square') === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleCoverAspectChange(item.id)}
                          aria-pressed={active}
                          className={`flex-1 min-h-[42px] px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                              : 'text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dynamic Cover Tint Switch */}
                <div className="pt-4 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-dynamic-tint"
                      className="text-sm font-semibold text-forest-900 dark:text-white"
                    >
                      {t('settings.dynamicTintLabel')}
                    </p>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.dynamicTintHint')}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={state.settings.dynamicCoverTint !== false}
                    onChange={handleToggleDynamicTint}
                    ariaLabelledBy="label-dynamic-tint"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>

                {/* Corner Decorations Switch */}
                <div className="pt-4 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-corner-decorations"
                      className="text-sm font-semibold text-forest-900 dark:text-white"
                    >
                      {t('settings.cornerDecorationsLabel')}
                    </p>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.cornerDecorationsHint')}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={state.settings.showPresetDecorations !== false}
                    onChange={handleTogglePresetDecorations}
                    ariaLabelledBy="label-corner-decorations"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>
              </section>

              {/* Quick Jump to Language */}
              <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 overflow-hidden shadow-xs">
                <SettingsMenuRow
                  icon="globe"
                  iconTone="indigo"
                  title={t('settings.languageLabel')}
                  subtitle={t('settings.rowLanguageSubtitle')}
                  value={`${currentLanguageOption.flag} ${currentLanguageOption.nativeLabel}`}
                  onClick={() => openSection('language')}
                />
              </div>
            </>
          );

        case 'language':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.languageLabel')}
                subtitle={t('settings.languageHint')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Clean stacked vertical list of languages with country flags */}
              <section
                role="radiogroup"
                aria-label={t('settings.languageLabel')}
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 divide-y divide-linen-200/70 dark:divide-night-800 overflow-hidden shadow-xs"
              >
                {SUPPORTED_LANGUAGES.map((opt) => {
                  const isSelected = opt.code === lang;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleLanguageChange(opt.code)}
                      className={`w-full min-h-[64px] px-4 py-3.5 flex items-center justify-between gap-4 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-linen-50/90 dark:bg-night-800/80'
                          : 'hover:bg-linen-50/60 dark:hover:bg-night-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span
                          aria-hidden="true"
                          className="text-2xl leading-none select-none w-9 h-9 rounded-xl bg-linen-100/80 dark:bg-night-800 flex items-center justify-center shrink-0"
                        >
                          {opt.flag}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                            {opt.nativeLabel}
                          </p>
                          <p className="text-xs text-stone-ink dark:text-slate-400">
                            {opt.label}
                          </p>
                        </div>
                      </div>

                      <span
                        aria-hidden="true"
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'border-2 border-linen-200 dark:border-night-700'
                        }`}
                      >
                        {isSelected && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
                      </span>
                    </button>
                  );
                })}
              </section>
            </>
          );

        case 'shelf-rules':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowShelfRulesTitle')}
                subtitle={t('settings.rowShelfRulesSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Preset Tradition Reminders */}
              <section
                aria-labelledby="preset-reminders-heading"
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="preset-reminders-heading"
                      className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white"
                    >
                      {t('settings.presetRemindersHeading')}
                    </h2>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
                      {t('settings.presetRemindersDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('presets')}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    {t('settings.openPresets')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Days Before */}
                  <div className="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor="setting-preset-days-before"
                            className="text-xs font-semibold text-forest-900 dark:text-white"
                          >
                            {t('settings.presetDaysBeforeLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleHelp('presetDaysBefore')}
                            aria-label="Info on reminder advance days"
                            className="w-5 h-5 rounded-full bg-linen-200 dark:bg-night-800 text-[11px] font-bold text-stone-600 dark:text-slate-300 flex items-center justify-center hover:bg-linen-300 cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <span className="block text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                          {t('settings.presetDaysBeforeSub')}
                        </span>
                      </div>
                      <input
                        id="setting-preset-days-before"
                        type="number"
                        min={0}
                        max={30}
                        value={state.settings.presetAlertDaysBefore ?? 2}
                        onChange={(e) => handlePresetDaysBeforeChange(Number(e.target.value))}
                        className="w-20 h-11 px-2.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-center font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700 shrink-0"
                      />
                    </div>
                    {openHelpKeys['presetDaysBefore'] && (
                      <div className="p-2.5 rounded-lg bg-linen-100 dark:bg-night-900 text-xs text-stone-700 dark:text-slate-300 border border-linen-200 dark:border-night-800">
                        <p className="font-bold text-forest-900 dark:text-white mb-0.5">
                          {FIELD_HELP_COPY.presetDaysBefore.title}
                        </p>
                        <p>{FIELD_HELP_COPY.presetDaysBefore.body}</p>
                      </div>
                    )}
                  </div>

                  {/* Days After */}
                  <div className="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor="setting-preset-days-after"
                            className="text-xs font-semibold text-forest-900 dark:text-white"
                          >
                            {t('settings.presetDaysAfterLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleHelp('presetDaysAfter')}
                            aria-label="Info on unactioned reminder duration"
                            className="w-5 h-5 rounded-full bg-linen-200 dark:bg-night-800 text-[11px] font-bold text-stone-600 dark:text-slate-300 flex items-center justify-center hover:bg-linen-300 cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <span className="block text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                          {t('settings.presetDaysAfterSub')}
                        </span>
                      </div>
                      <input
                        id="setting-preset-days-after"
                        type="number"
                        min={0}
                        max={30}
                        value={state.settings.presetAlertDaysAfter ?? 5}
                        onChange={(e) => handlePresetDaysAfterChange(Number(e.target.value))}
                        className="w-20 h-11 px-2.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-sm font-mono-tabular text-center font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700 shrink-0"
                      />
                    </div>
                    {openHelpKeys['presetDaysAfter'] && (
                      <div className="p-2.5 rounded-lg bg-linen-100 dark:bg-night-900 text-xs text-stone-700 dark:text-slate-300 border border-linen-200 dark:border-night-800">
                        <p className="font-bold text-forest-900 dark:text-white mb-0.5">
                          {FIELD_HELP_COPY.presetDaysAfter.title}
                        </p>
                        <p>{FIELD_HELP_COPY.presetDaysAfter.body}</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Shelf Freshness, Cooldown Log & Stale Book Spotlight */}
              <section
                aria-labelledby="freshness-spotlight-heading"
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-3.5"
              >
                <div>
                  <h2
                    id="freshness-spotlight-heading"
                    className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white"
                  >
                    {t('settings.freshnessHeading')}
                  </h2>
                  <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
                    {t('settings.freshnessDesc')}
                  </p>
                </div>

                <div className="divide-y divide-linen-200/70 dark:divide-night-800">
                  {/* Rotation History Insights */}
                  <div className="py-3 first:pt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-rotation-history"
                        className="text-sm font-semibold text-forest-900 dark:text-white"
                      >
                        {t('settings.rotationHistoryHeading')}
                      </p>
                      <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                        {t('settings.rotationHistoryDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={state.settings.enableRotationHistoryInsights !== false}
                      onChange={handleToggleRotationHistoryInsights}
                      ariaLabelledBy="label-rotation-history"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Cover Usage Adornos */}
                  <div className="py-3 space-y-2">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p
                            id="label-cover-adornos"
                            className="text-sm font-semibold text-forest-900 dark:text-white"
                          >
                            {t('settings.coverAdornosHeading')}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleHelp('coverUsageAdornos')}
                            aria-label="Info on cover badges"
                            className="w-5 h-5 rounded-full bg-linen-200 dark:bg-night-800 text-[11px] font-bold text-stone-600 dark:text-slate-300 flex items-center justify-center hover:bg-linen-300 cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                          {t('settings.coverAdornosDesc')}
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={state.settings.showCoverUsageAdornos !== false}
                        onChange={handleToggleCoverUsageAdornos}
                        ariaLabelledBy="label-cover-adornos"
                        onLabel={t('common.on')}
                        offLabel={t('common.off')}
                      />
                    </div>
                    {openHelpKeys['coverUsageAdornos'] && (
                      <div className="p-2.5 rounded-lg bg-linen-100 dark:bg-night-950 text-xs text-stone-700 dark:text-slate-300 border border-linen-200 dark:border-night-800">
                        <p className="font-bold text-forest-900 dark:text-white mb-0.5">
                          {FIELD_HELP_COPY.coverUsageAdornos.title}
                        </p>
                        <p>{FIELD_HELP_COPY.coverUsageAdornos.body}</p>
                      </div>
                    )}
                  </div>

                  {/* Stale Spotlight Toggle */}
                  <div className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-stale-spotlight"
                        className="text-sm font-semibold text-forest-900 dark:text-white"
                      >
                        {t('settings.staleSpotlightHeading')}
                      </p>
                      <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                        {t('settings.staleSpotlightDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={state.settings.enableStaleBookSpotlight !== false}
                      onChange={handleToggleStaleBookSpotlight}
                      ariaLabelledBy="label-stale-spotlight"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Stale Book Days Input */}
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor="setting-stale-book-days"
                            className="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white"
                          >
                            {t('settings.staleDaysLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleHelp('staleBookDays')}
                            aria-label="Info on stale book days"
                            className="w-5 h-5 rounded-full bg-linen-200 dark:bg-night-800 text-[11px] font-bold text-stone-600 dark:text-slate-300 flex items-center justify-center hover:bg-linen-300 cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <span className="block text-[11px] text-stone-ink dark:text-slate-400 mt-0.5">
                          {t('settings.staleDaysSub')}
                        </span>
                      </div>
                      <input
                        id="setting-stale-book-days"
                        type="number"
                        min={3}
                        max={60}
                        disabled={state.settings.enableStaleBookSpotlight === false}
                        value={state.settings.staleBookDays ?? 10}
                        onChange={(e) => handleStaleBookDaysChange(Number(e.target.value))}
                        className="w-20 h-11 px-2.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 disabled:opacity-50 text-sm font-mono-tabular text-center font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700 shrink-0"
                      />
                    </div>
                    {openHelpKeys['staleBookDays'] && (
                      <div className="p-2.5 rounded-lg bg-linen-100 dark:bg-night-950 text-xs text-stone-700 dark:text-slate-300 border border-linen-200 dark:border-night-800">
                        <p className="font-bold text-forest-900 dark:text-white mb-0.5">
                          {FIELD_HELP_COPY.staleBookDays.title}
                        </p>
                        <p>{FIELD_HELP_COPY.staleBookDays.body}</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          );

        case 'catalog':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.metadataProvidersHeading')}
                subtitle={t('settings.rowCatalogSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              <section className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs">
                <div className="divide-y divide-linen-200/70 dark:divide-night-800">
                  {/* Provider 1: Google Books */}
                  <div className="py-3 first:pt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-provider-google"
                        className="text-sm font-semibold text-forest-900 dark:text-white"
                      >
                        {t('settings.googleBooksProviderTitle')}
                      </p>
                      <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                        {t('settings.googleBooksProviderDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={state.settings.enabledMetadataProviders?.includes('google-books') ?? true}
                      onChange={() => handleToggleMetadataProvider('google-books')}
                      ariaLabelledBy="label-provider-google"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Provider 2: Open Library */}
                  <div className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-provider-openlibrary"
                        className="text-sm font-semibold text-forest-900 dark:text-white"
                      >
                        {t('settings.openLibraryProviderTitle')}
                      </p>
                      <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                        {t('settings.openLibraryProviderDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={state.settings.enabledMetadataProviders?.includes('open-library') ?? true}
                      onChange={() => handleToggleMetadataProvider('open-library')}
                      ariaLabelledBy="label-provider-openlibrary"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Retain Raw Payload */}
                  <div className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-retain-raw"
                        className="text-sm font-semibold text-forest-900 dark:text-white"
                      >
                        {t('settings.retainRawTitle')}
                      </p>
                      <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                        {t('settings.retainRawDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(state.settings.retainRawProviderPayloads)}
                      onChange={handleToggleRetainRaw}
                      ariaLabelledBy="label-retain-raw"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Search While Typing */}
                  <div className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-search-while-typing"
                        className="text-sm font-semibold text-forest-900 dark:text-white"
                      >
                        {t('settings.searchWhileTypingTitle')}
                      </p>
                      <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                        {t('settings.searchWhileTypingDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(state.settings.searchWhileTyping)}
                      onChange={handleToggleSearchWhileTyping}
                      ariaLabelledBy="label-search-while-typing"
                      dataAction="toggle-search-while-typing"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Google Books API Quota & Health Check */}
                  <div className="pt-3.5 pb-3.5 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <p className="text-sm font-semibold text-forest-900 dark:text-white">
                          {t('settings.googleQuotaTitle')}
                        </p>
                        <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                          {t('settings.googleQuotaDesc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleVerifyGoogleBooks(false)}
                        disabled={checkingGoogle}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl disabled:opacity-60 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          googleTone === 'success'
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-500/45 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-500/40'
                            : googleTone === 'error'
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/45 dark:hover:bg-rose-950/65 dark:text-rose-200 dark:border-rose-800'
                              : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white'
                        }`}
                      >
                        {checkingGoogle ? (
                          <Icon name="activity" className="w-3.5 h-3.5 animate-pulse" />
                        ) : googleTone === 'success' ? (
                          <span className="inline-flex text-emerald-700 dark:text-emerald-300">
                            <Icon name="check" className="w-3.5 h-3.5" />
                          </span>
                        ) : googleTone === 'error' ? (
                          <span className="inline-flex text-rose-700 dark:text-rose-300">
                            <Icon name="close" className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <Icon name="activity" className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {checkingGoogle
                            ? t('settings.checkingGoogleApi')
                            : t('settings.checkGoogleApiBtn')}
                        </span>
                      </button>
                    </div>

                    {googleReport && (
                      <div
                        role={googleTone === 'error' ? 'alert' : 'status'}
                        className={`rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium leading-relaxed ${
                          googleTone === 'error'
                            ? 'bg-rose-50/95 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                            : 'bg-emerald-50/95 dark:bg-emerald-950/35 border border-emerald-500/40 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-100'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full text-white inline-flex items-center justify-center shrink-0 ${
                            googleTone === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
                          }`}
                        >
                          <Icon name={googleTone === 'error' ? 'close' : 'check'} className="w-3 h-3" />
                        </span>
                        <span className="min-w-0 break-words">{googleReport}</span>
                      </div>
                    )}

                    {proxyUrl ? (
                      <div className="rounded-xl bg-forest-50/90 dark:bg-forest-900/25 border border-forest-700/30 dark:border-[#5ED3DA]/35 px-3.5 py-3 flex items-start gap-2.5">
                        <span className="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                          <Icon name="shield" className="w-4 h-4" />
                        </span>
                        <div className="text-xs leading-relaxed min-w-0">
                          <p className="font-semibold text-forest-900 dark:text-[#5ED3DA]">
                            {t('settings.deviceProxyActiveTitle')}
                          </p>
                          <p className="text-stone-ink dark:text-slate-300 mt-0.5 break-all">
                            {t('settings.deviceProxyActiveDesc', { url: proxyUrl })}
                          </p>
                        </div>
                      </div>
                    ) : googleKeyStatus === 'configured' ? (
                      <div className="rounded-xl bg-forest-50/90 dark:bg-forest-900/25 border border-forest-700/30 dark:border-[#5ED3DA]/35 px-3.5 py-3 flex items-start gap-2.5">
                        <span className="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                          <Icon name="shield" className="w-4 h-4" />
                        </span>
                        <div className="text-xs leading-relaxed">
                          <p className="font-semibold text-forest-900 dark:text-[#5ED3DA]">
                            {t('settings.serverKeyConfiguredTitle')}
                          </p>
                          <p className="text-stone-ink dark:text-slate-300 mt-0.5">
                            {t('settings.serverKeyConfiguredDesc')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 px-3.5 py-3 flex items-start gap-2.5">
                        <span className="mt-0.5 text-forest-700 dark:text-[#5ED3DA] shrink-0">
                          <Icon name="shield" className="w-4 h-4" />
                        </span>
                        <div className="text-xs leading-relaxed">
                          <p className="font-semibold text-forest-900 dark:text-white">
                            {t('settings.safeQuotaGeneralTitle')}
                          </p>
                          <p className="text-stone-ink dark:text-slate-300 mt-0.5">
                            {t('settings.safeQuotaGeneralDesc')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Live Query Usage & Limits Monitor Link */}
                    <div className="rounded-xl bg-linen-100/70 dark:bg-night-800/60 border border-linen-200 dark:border-night-700 px-3.5 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-forest-700 dark:bg-[#5ED3DA]" />
                        <span className="font-semibold text-forest-900 dark:text-white">
                          Today's Google Books calls: <strong className="font-mono">{queryLogger.getDailyCount('google-books')} / {queryLogger.getServiceQuota('google-books').limit}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openSection('query-usage')}
                        className="text-xs font-bold text-forest-700 dark:text-[#5ED3DA] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Query Monitor</span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Collapsible Advanced Device Proxy Disclosure */}
                    <details className="group rounded-xl bg-linen-50/75 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 px-3.5 py-2.5">
                      <summary className="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700">
                        <span>{t('settings.advancedProxySummary')}</span>
                        <span className="text-stone-ink dark:text-slate-400 transition-transform group-open:rotate-180">
                          <Icon name="chevronDown" className="w-4 h-4" />
                        </span>
                      </summary>

                      <form
                        onSubmit={handleSaveProxyUrl}
                        className="pt-3 mt-2 border-t border-linen-200/80 dark:border-night-800 space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor="device-books-proxy-url-input"
                              className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                            >
                              {t('settings.deviceProxyLabel')}
                            </label>
                            <div className="relative min-w-0">
                              <input
                                id="device-books-proxy-url-input"
                                type="url"
                                value={proxyUrl}
                                onChange={(e) => setProxyUrl(e.target.value)}
                                placeholder="https://books-proxy.yourname.workers.dev"
                                className="w-full h-11 pl-3.5 pr-9 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                              />
                              {proxyUrl && (
                                <button
                                  type="button"
                                  onClick={() => setProxyUrl('')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 dark:hover:text-white"
                                >
                                  <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="submit"
                              disabled={checkingGoogle}
                              className="h-11 px-4 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                            >
                              {checkingGoogle
                                ? t('settings.verifyingBtn')
                                : lang === 'en'
                                  ? 'Save & Verify'
                                  : t('settings.saveAndVerifyBtn')}
                            </button>
                            {proxyUrl && (
                              <button
                                type="button"
                                onClick={handleClearProxyUrl}
                                className="h-11 px-3 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-stone-ink dark:text-slate-300 transition-colors whitespace-nowrap cursor-pointer"
                              >
                                {t('common.clear')}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-stone-ink dark:text-slate-400 leading-relaxed">
                          {t('settings.proxyAutoCheckHint')}
                          <a
                            href={APP_DOCS_LINKS.cloudflareWorkerGuide}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2 hover:text-forest-900 dark:hover:text-white ml-1 whitespace-nowrap"
                          >
                            {t('settings.cloudflareGuideLinkText')}
                          </a>
                        </p>
                        {proxyError && (
                          <div
                            role="alert"
                            className="rounded-xl bg-rose-50/95 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 px-3 py-2 text-xs font-medium text-rose-800 dark:text-rose-200"
                          >
                            {proxyError}
                          </div>
                        )}
                      </form>
                    </details>

                    {/* Collapsible Google Books Key Guide */}
                    <details className="group rounded-xl bg-linen-50/75 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 px-3.5 py-2.5">
                      <summary className="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700">
                        <span>{t('settings.googleGuideSummary')}</span>
                        <span className="text-stone-ink dark:text-slate-400 transition-transform group-open:rotate-180">
                          <Icon name="chevronDown" className="w-4 h-4" />
                        </span>
                      </summary>
                      <div className="pt-2.5 mt-2 border-t border-linen-200/80 dark:border-night-800 space-y-2 text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                        <p>
                          <strong className="text-forest-900 dark:text-white">
                            {t('settings.googleGuideStep1')}
                          </strong>{' '}
                          In{' '}
                          <a
                            href={GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2"
                          >
                            Google Cloud Console
                          </a>{' '}
                          &rarr; <strong>APIs &amp; Services &rarr; Library</strong>, enable{' '}
                          <strong>Books API</strong>, create credentials, and restrict them to{' '}
                          <strong>Books API</strong>.
                        </p>
                        <p>
                          <strong className="text-forest-900 dark:text-white">
                            {t('settings.googleGuideStep2')}
                          </strong>{' '}
                          Set <code>GOOGLE_BOOKS_API_KEY=your_secret_here</code> in server environment
                          variables or local <code>.env</code>.
                        </p>
                        <p>
                          <strong className="text-forest-900 dark:text-white">
                            {t('settings.googleGuideStep3')}
                          </strong>{' '}
                          Or create a free Cloudflare Worker, paste the CORS proxy script below, set
                          encrypted variable <code>GOOGLE_BOOKS_API_KEY</code>, and paste your Worker
                          URL above:
                        </p>
                        <div className="relative group/code">
                          <pre className="p-2.5 rounded-lg bg-night-950 text-ivory font-mono-tabular text-[11px] overflow-x-auto">
                            {GOOGLE_BOOKS_WORKER_SAMPLE_SCRIPT}
                          </pre>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(GOOGLE_BOOKS_WORKER_SAMPLE_SCRIPT, 'books')}
                            className="absolute top-2 right-2 px-2 py-1 rounded bg-night-800 hover:bg-night-700 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                          >
                            {copiedBooksScript ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="pt-1 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsWelcomeModalOpen(true)}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors cursor-pointer"
                          >
                            {t('settings.openWelcomeModalBtn')}
                          </button>
                          <a
                            href={APP_DOCS_LINKS.cloudflareWorkerGuide}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] underline underline-offset-2 hover:text-forest-900 dark:hover:text-white"
                          >
                            {t('settings.openCloudflareGuideBtn')}
                          </a>
                        </div>
                      </div>
                    </details>
                  </div>

                  {/* Sync Library Metadata Row */}
                  <div className="pt-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-forest-900 dark:text-white">
                          {t('settings.syncLibraryTitle')}
                        </p>
                        <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5 leading-relaxed">
                          {t('settings.syncLibraryDesc', {
                            needed: booksNeedingGoogleSyncCount,
                            total: state.books.length,
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncLibraryMetadata}
                        disabled={syncingCatalog || state.books.length === 0}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
                      >
                        <Icon
                          name="rotations"
                          className={syncingCatalog ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'}
                        />
                        <span>
                          {syncingCatalog
                            ? catalogSyncProgress || t('settings.syncingLibraryProgress')
                            : t('settings.syncLibraryBtn', { count: booksNeedingGoogleSyncCount })}
                        </span>
                      </button>
                    </div>

                    {catalogSyncReport && (
                      <div
                        role={catalogSyncTone === 'error' ? 'alert' : 'status'}
                        className={`rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium leading-relaxed ${
                          catalogSyncTone === 'error'
                            ? 'bg-rose-50/95 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                            : 'bg-emerald-50/95 dark:bg-emerald-950/35 border border-emerald-500/40 text-emerald-950 dark:text-emerald-100'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full text-white inline-flex items-center justify-center shrink-0 ${
                            catalogSyncTone === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
                          }`}
                        >
                          <Icon
                            name={catalogSyncTone === 'error' ? 'close' : 'check'}
                            className="w-3 h-3"
                          />
                        </span>
                        <span>{catalogSyncReport}</span>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          );

        case 'ai':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowAiTitle')}
                subtitle={t('settings.rowAiSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* AI Assistant & Free LLM Connection */}
              <section
                aria-labelledby="llm-connection-heading"
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-linen-200/80 dark:border-night-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
                        <Icon name="sparkles" className="w-4 h-4" />
                      </span>
                      <h2
                        id="llm-connection-heading"
                        className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white"
                      >
                        AI Assistant &amp; Free LLM Connection
                      </h2>
                    </div>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-1">
                      Powers categorized book tagging (interactive formats &amp; themes), Smart Shelf
                      Rotations, and Library Gap Recommendations.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-forest-700 dark:text-[#5ED3DA] shrink-0">
                    {selectedLlmProvider === 'cloudflare-worker'
                      ? 'Cloudflare Proxy'
                      : selectedLlmProvider === 'byok-openai'
                        ? 'OpenAI-Compatible'
                        : selectedLlmProvider === 'byok-gemini'
                          ? 'BYOK Gemini'
                          : 'Google Gemini (Server)'}
                  </span>
                </div>

                <form onSubmit={handleSaveLlmSettings} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-2">
                      Select LLM Provider:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        {
                          id: 'server-gemini' as const,
                          title: 'Google Gemini (Free Server)',
                          desc: 'Uses built-in Gemini 3.8 Flash via backend. Zero client setup needed when server key is present.',
                          badge: 'Server Key Ready',
                        },
                        {
                          id: 'cloudflare-worker' as const,
                          title: 'Cloudflare Worker for Gemini',
                          desc: 'Run through your own free Cloudflare Worker reverse proxy to bypass quota or add your personal Gemini key.',
                          badge: 'Recommended for Quotas',
                        },
                        {
                          id: 'byok-gemini' as const,
                          title: 'Personal Gemini API Key',
                          desc: 'Bring your own Google AI Studio API key directly for dedicated personal quota.',
                          badge: 'BYOK',
                        },
                        {
                          id: 'byok-openai' as const,
                          title: 'OpenAI-Compatible / Other LLMs',
                          desc: 'Connect to Groq, OpenRouter, Mistral, Local Ollama, or Cloudflare Workers AI.',
                          badge: 'Universal',
                        },
                      ].map((p) => {
                        const isSelected = selectedLlmProvider === p.id;
                        return (
                          <label
                            key={p.id}
                            className={`cursor-pointer rounded-xl p-3 border transition-colors flex flex-col justify-between ${
                              isSelected
                                ? 'bg-linen-100/90 dark:bg-night-800 border-forest-700 dark:border-[#5ED3DA] shadow-2xs'
                                : 'bg-linen-50/70 dark:bg-night-950/60 border-linen-200 dark:border-night-700 hover:border-forest-700/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="llmProvider"
                                  value={p.id}
                                  checked={isSelected}
                                  onChange={() => setSelectedLlmProvider(p.id)}
                                  className="accent-[#1F6E75] h-4 w-4"
                                />
                                <span className="text-xs font-bold text-forest-900 dark:text-white">
                                  {p.title}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-semibold shrink-0 ${
                                  isSelected
                                    ? 'text-forest-700 dark:text-[#5ED3DA]'
                                    : 'text-stone-ink dark:text-slate-400'
                                }`}
                              >
                                {p.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-1.5 leading-relaxed">
                              {p.desc}
                            </p>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {selectedLlmProvider === 'cloudflare-worker' && (
                    <div className="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 p-3.5 space-y-3">
                      <div>
                        <label
                          htmlFor="llm-cloudflare-url-input"
                          className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                        >
                          Cloudflare Worker Proxy URL
                        </label>
                        <div className="relative min-w-0">
                          <input
                            id="llm-cloudflare-url-input"
                            type="url"
                            value={llmCloudflareUrl}
                            onChange={(e) => setLlmCloudflareUrl(e.target.value)}
                            placeholder="https://gemini-proxy.yourname.workers.dev"
                            className="w-full h-11 pl-3.5 pr-9 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                          />
                          {llmCloudflareUrl && (
                            <button
                              type="button"
                              onClick={() => setLlmCloudflareUrl('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 dark:hover:text-white"
                            >
                              <Icon name="close" className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-1">
                          Your worker receives the prompt and calls the Gemini API server-side using
                          your personal quota.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedLlmProvider === 'byok-openai' && (
                    <div className="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 p-3.5 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="llm-base-url-input"
                            className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                          >
                            Endpoint Base URL
                          </label>
                          <input
                            id="llm-base-url-input"
                            type="url"
                            value={llmBaseUrl}
                            onChange={(e) => setLlmBaseUrl(e.target.value)}
                            placeholder="https://api.groq.com/openai/v1 or http://localhost:11434/v1"
                            className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="llm-openai-model-input"
                            className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                          >
                            Model Name
                          </label>
                          <input
                            id="llm-openai-model-input"
                            type="text"
                            value={llmModel}
                            onChange={(e) => setLlmModel(e.target.value)}
                            placeholder="llama-3.3-70b-versatile or mistral-small-latest"
                            className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedLlmProvider === 'byok-gemini' ||
                    selectedLlmProvider === 'byok-openai' ||
                    selectedLlmProvider === 'cloudflare-worker') && (
                    <div className="rounded-xl bg-linen-50/80 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="llm-api-key-input"
                          className="text-xs font-semibold text-forest-900 dark:text-slate-200"
                        >
                          {selectedLlmProvider === 'byok-gemini'
                            ? 'Google Gemini API Key'
                            : selectedLlmProvider === 'cloudflare-worker'
                              ? 'Optional Proxy Auth Bearer Token'
                              : 'Provider API Key'}
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowLlmApiKey((prev) => !prev)}
                          className="text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] hover:underline cursor-pointer"
                        >
                          {showLlmApiKey ? 'Hide Key' : 'Show Key'}
                        </button>
                      </div>
                      <input
                        id="llm-api-key-input"
                        type={showLlmApiKey ? 'text' : 'password'}
                        value={llmApiKey}
                        onChange={(e) => setLlmApiKey(e.target.value)}
                        placeholder={
                          selectedLlmProvider === 'byok-gemini' ? 'AIzaSy...' : 'sk-... or gsk_...'
                        }
                        className="w-full h-11 px-3.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                      <p className="text-[11px] text-stone-ink dark:text-slate-400">
                        Stored locally in browser storage. Never logged or sent to third-party trackers.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedLlmProvider !== 'byok-openai' && (
                      <div>
                        <label
                          htmlFor="llm-model-select"
                          className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                        >
                          Gemini Model
                        </label>
                        <select
                          id="llm-model-select"
                          value={llmModel}
                          onChange={(e) => setLlmModel(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                        >
                          <option value="gemini-2.5-flash">
                            gemini-2.5-flash (Recommended · Fast &amp; Reliable)
                          </option>
                          <option value="gemini-3.1-flash-lite">
                            gemini-3.1-flash-lite (Ultra low latency)
                          </option>
                          <option value="gemini-3.8-flash">gemini-3.8-flash (Gemini 3)</option>
                        </select>
                      </div>
                    )}

                    <div className={selectedLlmProvider === 'byok-openai' ? 'sm:col-span-2' : ''}>
                      <label
                        htmlFor="llm-custom-hint-input"
                        className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                      >
                        Parenting / Library Focus (Optional)
                      </label>
                      <input
                        id="llm-custom-hint-input"
                        type="text"
                        value={llmCustomPromptHint}
                        onChange={(e) => setLlmCustomPromptHint(e.target.value)}
                        placeholder="e.g. Montessori, hands-on sensory, Spanish bilingual, STEM"
                        className="w-full h-11 px-3.5 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-linen-200/80 dark:border-night-800">
                    <button
                      type="button"
                      onClick={handleTestLlm}
                      disabled={testingLlm}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 disabled:opacity-50 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Icon
                        name="activity"
                        className={testingLlm ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'}
                      />
                      <span>{testingLlm ? 'Testing…' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="submit"
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                    >
                      <Icon name="check" className="w-4 h-4" />
                      <span>Save AI Settings</span>
                    </button>
                  </div>

                  {llmReport && (
                    <div
                      role="status"
                      className={`rounded-xl px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 ${
                        llmTone === 'error'
                          ? 'bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800'
                          : 'bg-emerald-50 text-emerald-950 border border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700'
                      }`}
                    >
                      <span className="mt-0.5">
                        <Icon name={llmTone === 'error' ? 'close' : 'check'} className="w-3.5 h-3.5" />
                      </span>
                      <span className="min-w-0 break-words leading-relaxed">{llmReport}</span>
                    </div>
                  )}
                </form>

                {/* Collapsible Cloudflare Worker Guide for Gemini */}
                <details className="group rounded-xl bg-linen-50/75 dark:bg-night-950/70 border border-linen-200 dark:border-night-700 px-3.5 py-2.5">
                  <summary className="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700">
                    <span>How to set up a free Cloudflare Worker for Gemini API (Copy-Paste Script)</span>
                    <span className="text-stone-ink dark:text-slate-400 transition-transform group-open:rotate-180">
                      <Icon name="chevronDown" className="w-4 h-4" />
                    </span>
                  </summary>

                  <div className="pt-2.5 mt-2 border-t border-linen-200/80 dark:border-night-800 space-y-2.5 text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                    <p>
                      A Cloudflare Worker acts as your own private gateway to the Google Gemini API
                      with unlimited free monthly requests on Cloudflare’s free tier.
                    </p>
                    <ol className="list-decimal list-inside space-y-1 font-medium text-forest-900 dark:text-white">
                      <li>
                        Log in to{' '}
                        <a
                          href="https://dash.cloudflare.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-forest-700 dark:text-[#5ED3DA] underline"
                        >
                          Cloudflare Dashboard
                        </a>{' '}
                        &rarr; <strong>Workers &amp; Pages</strong> &rarr; <strong>Create Worker</strong>.
                      </li>
                      <li>
                        Under <strong>Settings &rarr; Variables</strong>, add an Encrypted Secret named{' '}
                        <code>GEMINI_API_KEY</code> with your Gemini key from Google AI Studio.
                      </li>
                      <li>Paste this script into your Worker and click <strong>Deploy</strong>:</li>
                    </ol>
                    <div className="relative group/llmcode">
                      <pre className="p-3 rounded-lg bg-night-950 text-ivory font-mono-tabular text-[11px] overflow-x-auto leading-relaxed">
                        {CLOUDFLARE_WORKER_SAMPLE_SCRIPT}
                      </pre>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(CLOUDFLARE_WORKER_SAMPLE_SCRIPT, 'llm')}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded bg-night-800 hover:bg-night-700 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        {copiedLlmScript ? 'Copied!' : 'Copy Script'}
                      </button>
                    </div>
                    <p>
                      4. Copy your Worker URL (e.g.{' '}
                      <code>https://gemini-proxy.yourname.workers.dev</code>) and paste it into the
                      Cloudflare Worker URL field above!
                    </p>
                  </div>
                </details>

                <div className="rounded-xl bg-linen-50/70 dark:bg-night-950/60 border border-linen-200 dark:border-night-800 p-3 flex items-start gap-2.5">
                  <span className="text-forest-700 dark:text-[#5ED3DA] mt-0.5 shrink-0">
                    <Icon name="shield" className="w-4 h-4" />
                  </span>
                  <div className="text-[11px] text-stone-ink dark:text-slate-400 space-y-0.5 leading-relaxed">
                    <p className="font-bold text-forest-900 dark:text-white">
                      Quota-Conscious Design:
                    </p>
                    <p>
                      All queries use compact, token-minimized prompts and cache recommendations locally.
                      If you encounter a <code>RESOURCE_EXHAUSTED (429)</code> quota error, simply wait
                      60 seconds for the free tier per-minute window to reset, or deploy the Cloudflare
                      Worker above for dedicated quota.
                    </p>
                  </div>
                </div>
              </section>

              {/* Tagging & Pluggable AI Enrichment */}
              <section
                aria-labelledby="tagging-providers-heading"
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-3.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
                  <div>
                    <h2
                      id="tagging-providers-heading"
                      className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white"
                    >
                      {t('settings.taggingHeading')}
                    </h2>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.taggingDesc')}
                    </p>
                  </div>
                  <span className="text-xs text-stone-ink dark:text-slate-400 whitespace-nowrap">
                    {t('settings.modeLabel')}:{' '}
                    <strong className="font-semibold text-forest-900 dark:text-slate-200">
                      {state.settings.aiEnrichmentOptIn
                        ? t('settings.localPlusAdapter', {
                            adapter: selectedAdapter ? selectedAdapter.label : state.settings.aiAdapterId,
                          })
                        : t('settings.localRulesOnly')}
                    </strong>
                  </span>
                </div>

                {/* Local Rule-based Tagging Switch */}
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-auto-tagging"
                      className="text-sm font-semibold text-forest-900 dark:text-white"
                    >
                      {t('settings.autoTaggingTitle')}
                    </p>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.autoTaggingDesc')}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={state.settings.autoLocalTagging !== false}
                    onChange={handleToggleAutoLocalTagging}
                    ariaLabelledBy="label-auto-tagging"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>

                {/* AI Tag Enrichment Opt-In Switch */}
                <div className="pt-3 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-ai-opt-in"
                      className="text-sm font-semibold text-forest-900 dark:text-white"
                    >
                      {t('settings.aiOptInTitle')}
                    </p>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.aiOptInDesc')}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(state.settings.aiEnrichmentOptIn)}
                    onChange={handleToggleAiOptIn}
                    ariaLabelledBy="label-ai-opt-in"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>

                {/* Pluggable Adapter Selector Cards */}
                <div className="pt-3 border-t border-linen-200/70 dark:border-night-800">
                  <p className="text-xs font-semibold text-forest-900 dark:text-slate-200">
                    {t('settings.aiAdapterHeading')}
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {adapterDiagnostics.map((adapter) => {
                      const isSelected = adapter.id === state.settings.aiAdapterId;
                      return (
                        <button
                          key={adapter.id}
                          type="button"
                          onClick={() => handleSelectAiAdapter(adapter.id)}
                          className={`text-left rounded-xl p-3.5 border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-linen-100/80 dark:bg-night-800 border-forest-700 dark:border-[#5ED3DA]'
                              : 'bg-linen-50/70 dark:bg-night-950/60 border-linen-200 dark:border-night-700 hover:border-forest-700/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                              {adapter.label}
                            </span>
                            <span
                              className={`text-[11px] font-medium ${
                                isSelected
                                  ? 'text-forest-700 dark:text-[#5ED3DA]'
                                  : 'text-stone-ink dark:text-slate-400'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </span>
                          </div>
                          <p className="text-xs text-stone-ink dark:text-slate-400 mt-1 leading-relaxed">
                            {adapter.privacyNote}
                          </p>
                          <p
                            className={`text-[11px] mt-1.5 ${
                              adapter.available
                                ? 'text-forest-700 dark:text-[#5ED3DA]'
                                : 'text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {adapter.reason}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {state.settings.aiAdapterId === 'custom-endpoint' && (
                    <form
                      onSubmit={handleSaveCustomEndpoint}
                      className="mt-4 pt-4 border-t border-linen-200 dark:border-night-700 space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-8">
                          <label
                            htmlFor="ai-endpoint-url-input"
                            className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                          >
                            Keyless HTTPS Proxy or Localhost Bridge URL
                          </label>
                          <div className="relative min-w-0">
                            <input
                              id="ai-endpoint-url-input"
                              type="url"
                              value={customEndpointUrl}
                              onChange={(e) => setCustomEndpointUrl(e.target.value)}
                              placeholder="https://your-proxy.example.com/api/enrich or http://localhost:11434/enrich"
                              className="w-full h-12 pl-3.5 pr-9 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                            />
                            {customEndpointUrl && (
                              <button
                                type="button"
                                onClick={() => setCustomEndpointUrl('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 dark:hover:text-white"
                              >
                                <Icon name="close" className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-4">
                          <label
                            htmlFor="ai-timeout-select"
                            className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                          >
                            Request Timeout
                          </label>
                          <select
                            id="ai-timeout-select"
                            value={customEndpointTimeout}
                            onChange={(e) => setCustomEndpointTimeout(Number(e.target.value))}
                            className="w-full h-12 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                          >
                            <option value={3000}>3 seconds (Fast fallback)</option>
                            <option value={6000}>6 seconds (Balanced)</option>
                            <option value={10000}>10 seconds (Local model)</option>
                          </select>
                        </div>
                      </div>

                      {customEndpointError && (
                        <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-300">
                          {customEndpointError}
                        </p>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-[11px] text-stone-ink dark:text-slate-400">
                          Never paste API keys in URLs. Upstream secrets must stay inside your proxy
                          or local daemon.
                        </p>
                        <button
                          type="submit"
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
                        >
                          Save Proxy Config
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {lastAdapterTestReport && (
                  <div
                    role="status"
                    className="rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 px-3.5 py-2.5 text-xs text-forest-900 dark:text-slate-300"
                  >
                    {lastAdapterTestReport}
                  </div>
                )}

                <div className="pt-3 border-t border-linen-200/70 dark:border-night-800 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleEnrichAllBooks}
                    disabled={enrichingCatalog}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                  >
                    <Icon name="sparkles" className="w-3.5 h-3.5" />
                    <span>
                      {enrichingCatalog
                        ? t('settings.enrichingProgress')
                        : t('settings.reEnrichBtn', { count: state.books.length })}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestAiAdapter}
                    disabled={testingAdapter}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 disabled:opacity-60 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>
                      {testingAdapter ? t('settings.testingProgress') : t('settings.testPipelineBtn')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetProviderDefaults}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-linen-200 dark:border-night-700 hover:bg-linen-100 dark:hover:bg-night-800 text-stone-ink dark:text-slate-300 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {t('settings.safeDefaultsBtn')}
                  </button>
                </div>
              </section>
            </>
          );

        case 'offline-storage':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowOfflineStorageTitle')}
                subtitle={t('settings.rowOfflineStorageSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Installable Phone App (PWA) */}
              <section
                aria-labelledby="pwa-heading"
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2
                      id="pwa-heading"
                      className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white"
                    >
                      {t('settings.pwaHeading')}
                    </h2>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.pwaNetwork')}:{' '}
                      <strong className="text-forest-900 dark:text-white">
                        {pwaStatus.isOnline ? t('settings.pwaOnline') : t('settings.pwaOffline')}
                      </strong>{' '}
                      · {t('settings.pwaShell')}:{' '}
                      <strong className="text-forest-900 dark:text-white">
                        {pwaStatus.swReady ? t('settings.pwaReady') : t('settings.pwaRegistering')}
                      </strong>{' '}
                      · {t('settings.pwaStorage')}:{' '}
                      <strong className="text-forest-900 dark:text-white">indexeddb</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {pwaStatus.isInstalled ? (
                      <p className="text-xs font-semibold text-emerald-700 dark:text-[#5ED3DA] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                        <Icon name="check" className="w-3.5 h-3.5" />
                        <span>{t('settings.pwaInstalledMode')}</span>
                      </p>
                    ) : pwaStatus.isInstallable ? (
                      <button
                        type="button"
                        onClick={() => pwaManager.triggerInstall()}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shadow-xs cursor-pointer"
                      >
                        <Icon name="download" className="w-4 h-4" />
                        <span>{t('settings.pwaSaveHomeScreen')}</span>
                      </button>
                    ) : pwaStatus.isIOS ? (
                      <div className="text-xs text-stone-ink dark:text-slate-400 bg-linen-100 dark:bg-night-800 px-3 py-2 rounded-xl border border-linen-200 dark:border-night-700">
                        <span>
                          Tap <strong>Share</strong> in Safari &rarr;{' '}
                          <strong>Add to Home Screen</strong>
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-stone-ink dark:text-slate-400 px-3 py-2 rounded-xl bg-linen-100 dark:bg-night-800">
                        PWA Ready
                      </span>
                    )}

                    <button
                      type="button"
                      data-action="force-refresh-app"
                      onClick={handleForceRefresh}
                      disabled={refreshingApp}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 disabled:opacity-60 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Icon
                        name="refresh"
                        className={refreshingApp ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'}
                      />
                      <span>
                        {refreshingApp
                          ? t('settings.forceRefreshProgress')
                          : t('settings.forceRefreshBtn')}
                      </span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-stone-ink dark:text-slate-400 leading-relaxed">
                  {t('settings.forceRefreshHint')}
                </p>
              </section>

              {/* Storage & Browser Cache */}
              <section
                aria-labelledby="storage-heading"
                className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-3.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-linen-200/80 dark:border-night-800">
                  <div>
                    <h2
                      id="storage-heading"
                      className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white"
                    >
                      {t('settings.storageHeading')}
                    </h2>
                    <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                      {t('settings.storageDesc')}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="text-xs font-mono-tabular text-stone-ink dark:text-slate-400 whitespace-nowrap">
                      {t('settings.versionLabel')}{' '}
                      <strong className="font-semibold text-forest-900 dark:text-white">
                        {APP_VERSION}
                      </strong>
                      <span aria-hidden="true" className="mx-1">
                        ·
                      </span>
                      {t('settings.memoryLabel')}{' '}
                      <strong className="font-semibold text-forest-900 dark:text-white">
                        {storageUsage.formatted}
                      </strong>
                    </span>
                  </div>
                </div>

                <p className="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                  {t('settings.aboutStorageText', {
                    profiles: state.profiles.length,
                    rotations: state.rotations.length,
                    books: state.books.length,
                    backend: 'indexeddb',
                  })}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {storageUsage.coverDataUrlBytes > 0 ? (
                    <span className="text-xs font-mono-tabular text-stone-ink dark:text-slate-400">
                      {t('settings.photosLabel')}:{' '}
                      <strong className="text-forest-900 dark:text-white">
                        {formatStorageBytes(storageUsage.coverDataUrlBytes)}
                      </strong>
                    </span>
                  ) : (
                    <span className="text-xs text-stone-ink dark:text-slate-400">
                      Local device cover cache
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={handleClearCoverCache}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors cursor-pointer"
                  >
                    {t('settings.clearCoverCache')}
                  </button>
                </div>
              </section>
            </>
          );

        case 'backup':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.backupHeading')}
                subtitle={t('settings.backupDesc')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              <section className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 dark:bg-linen-100 dark:hover:bg-white text-white dark:text-night-950 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                  >
                    <Icon name="download" className="w-3.5 h-3.5" />
                    <span>{t('settings.exportBtn')}</span>
                  </button>

                  <label className="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
                    <Icon name="upload" className="w-3.5 h-3.5" />
                    <span>{t('settings.importBtn')}</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/json,.json"
                      onChange={handleImportBackup}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div className="pt-4 border-t border-linen-200/70 dark:border-night-800 space-y-3">
                  {!confirmResetOpen ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetOpen(true)}
                      className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {t('settings.resetSeedBtn')}
                    </button>
                  ) : (
                    <div
                      role="alertdialog"
                      aria-labelledby="confirm-reset-title"
                      className="rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 p-4 space-y-3"
                    >
                      <div>
                        <p
                          id="confirm-reset-title"
                          className="text-xs sm:text-sm font-bold text-rose-950 dark:text-rose-100"
                        >
                          {t('settings.resetSeedConfirmTitle')}
                        </p>
                        <p className="text-xs text-rose-900/90 dark:text-rose-200/90 mt-1 leading-relaxed">
                          {t('settings.resetSeedConfirmBody')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleConfirmResetSeed}
                          className="min-h-[42px] px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          {t('settings.resetSeedConfirmAction')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetOpen(false)}
                          className="min-h-[42px] px-4 py-1.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors cursor-pointer"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </>
          );

        case 'whats-new':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowWhatsNewTitle')}
                subtitle={`${t('settings.versionLabel')} ${APP_VERSION} · ${t('settings.rowWhatsNewSubtitle')}`}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <WhatsNewSubView />
            </>
          );

        case 'guides':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowGuidesTitle')}
                subtitle={t('settings.aboutDesc')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              <section className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-4">
                <p className="text-xs text-stone-ink dark:text-slate-300 leading-relaxed">
                  {t('settings.aboutStorageText', {
                    profiles: state.profiles.length,
                    rotations: state.rotations.length,
                    books: state.books.length,
                    backend: 'indexeddb',
                  })}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      href: APP_DOCS_LINKS.overview,
                      title: t('settings.userGuideTitle'),
                      desc: t('settings.userGuideDesc'),
                    },
                    {
                      href: APP_DOCS_LINKS.coverBadges,
                      title: t('settings.coverBadgesTitle'),
                      desc: t('settings.coverBadgesDesc'),
                    },
                    {
                      href: APP_DOCS_LINKS.configuration,
                      title: t('settings.configGuideTitle'),
                      desc: t('settings.configGuideDesc'),
                    },
                    {
                      href: APP_DOCS_LINKS.architectureAndProviders,
                      title: t('settings.devGuideTitle'),
                      desc: t('settings.devGuideDesc'),
                    },
                    {
                      href: APP_DOCS_LINKS.taggingAndAi,
                      title: t('settings.taggingGuideTitle'),
                      desc: t('settings.taggingGuideDesc'),
                    },
                  ].map((doc) => (
                    <a
                      key={doc.href}
                      href={doc.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl p-3.5 bg-linen-50 hover:bg-linen-100 dark:bg-night-950 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-forest-900 dark:text-white">
                          {doc.title}
                        </p>
                        <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                          {doc.desc}
                        </p>
                      </div>
                      <span className="text-forest-700 dark:text-[#5ED3DA] shrink-0">
                        <Icon name="externalLink" className="w-4 h-4" />
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            </>
          );

        case 'privacy':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowPrivacyTitle')}
                subtitle={t('settings.rowPrivacySubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <LegalSubView docType="privacy" />
            </>
          );

        case 'terms':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowTermsTitle')}
                subtitle={t('settings.rowTermsSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <LegalSubView docType="terms" />
            </>
          );

        case 'impressum':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowImpressumTitle')}
                subtitle={t('settings.rowImpressumSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <LegalSubView docType="impressum" />
            </>
          );

        case 'rate':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowRateAppTitle')}
                subtitle={t('settings.rowRateAppSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <OtherSubView kind="rate" onNotify={(msg, tone) => store.notify(msg, tone)} />
            </>
          );

        case 'feedback':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowSendFeedbackTitle')}
                subtitle={t('settings.rowSendFeedbackSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <OtherSubView kind="feedback" onNotify={(msg, tone) => store.notify(msg, tone)} />
            </>
          );

        case 'donate':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.rowDonateTitle')}
                subtitle={t('settings.rowDonateSubtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <OtherSubView kind="donate" onNotify={(msg, tone) => store.notify(msg, tone)} />
            </>
          );

        case 'query-usage':
          return (
            <QueryUsageSubView
              onBack={goBackToRoot}
              backLabel={backLabel}
            />
          );

        default:
          return null;
      }
    };

    return (
      <div
        key={`subview-${activeSection}`}
        className="w-full space-y-5 text-left max-w-3xl mx-auto pb-12 animate-slide-in-right"
      >
        {renderSubViewBody()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // SETTINGS ROOT MENU (Uppercase Group Titles + Clickable List Sections)
  // ---------------------------------------------------------------------------
  const rootAnimClass = navDirection === 'back' ? 'animate-slide-in-left' : '';

  return (
    <div
      key="settings-root"
      className={`w-full space-y-6 text-left max-w-4xl mx-auto pb-12 ${rootAnimClass}`}
    >
      {/* Header & Eyebrow */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA] uppercase tracking-wider">
            {t('settings.eyebrow')}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5">
            {t('settings.heading')}
          </h1>
        </div>
        <p className="text-xs font-mono-tabular text-stone-ink dark:text-slate-400">
          v{APP_VERSION} · {storageUsage.formatted}
        </p>
      </div>

      {/* Proactive Quota Warning Banner in Settings Root */}
      {(() => {
        const alert = queryLogger.getGlobalQuotaAlert();
        if (!alert.hasAlert) return null;
        return (
          <div
            role="alert"
            onClick={() => openSection('query-usage')}
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs leading-relaxed cursor-pointer transition-transform hover:scale-[1.01] ${
              alert.level === 'error'
                ? 'bg-rose-50 border-rose-300 dark:bg-rose-950/50 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                : 'bg-amber-50 border-amber-300 dark:bg-amber-950/50 dark:border-amber-800 text-amber-900 dark:text-amber-100'
            } shadow-xs`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg shrink-0">{alert.level === 'error' ? '🛑' : '⚠️'}</span>
              <p className="font-semibold">{alert.message}</p>
            </div>
            <span className="font-bold underline shrink-0 whitespace-nowrap">View Usage →</span>
          </div>
        );
      })()}

      {/* Grouped Settings Lists — 1 column on mobile, balanced 2 columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          {/* GROUP 1: HOUSEHOLD & DISPLAY */}
          <SettingsGroup id="group-household" title={t('settings.groupHousehold')}>
            <SettingsMenuRow
              testId="profiles"
              icon="profiles"
              iconTone="teal"
              title={t('profiles.heading')}
              subtitle={t('settings.rowProfilesSubtitle', {
                count: state.profiles.length,
                name: activeProfile?.name || '—',
              })}
              value={`${state.profiles.length}`}
              onClick={() => openSection('profiles')}
            />
            <SettingsMenuRow
              testId="appearance"
              icon="sun"
              iconTone="amber"
              title={t('settings.appearanceHeading')}
              subtitle={t('settings.rowAppearanceSubtitle')}
              value={`${themeLabel} · ${ratioLabel}`}
              onClick={() => openSection('appearance')}
            />
            <SettingsMenuRow
              testId="language"
              icon="globe"
              iconTone="indigo"
              title={t('settings.rowLanguageTitle')}
              subtitle={t('settings.rowLanguageSubtitle')}
              value={`${currentLanguageOption.flag} ${currentLanguageOption.nativeLabel}`}
              onClick={() => openSection('language')}
            />
          </SettingsGroup>

          {/* GROUP 2: LIBRARY & AI */}
          <SettingsGroup id="group-library-ai" title={t('settings.groupLibraryAi')}>
            <SettingsMenuRow
              testId="shelf-rules"
              icon="sliders"
              iconTone="teal"
              title={t('settings.rowShelfRulesTitle')}
              subtitle={t('settings.rowShelfRulesSubtitle')}
              onClick={() => openSection('shelf-rules')}
            />
            <SettingsMenuRow
              testId="catalog"
              icon="database"
              iconTone="indigo"
              title={t('settings.rowCatalogTitle')}
              subtitle={t('settings.rowCatalogSubtitle')}
              value={`${enabledProviderCount}/2`}
              onClick={() => openSection('catalog')}
            />
            <SettingsMenuRow
              testId="ai"
              icon="sparkles"
              iconTone="teal"
              title={t('settings.rowAiTitle')}
              subtitle={t('settings.rowAiSubtitle')}
              value={llmSummary}
              onClick={() => openSection('ai')}
            />
            <SettingsMenuRow
              testId="query-usage"
              icon="activity"
              iconTone="amber"
              title="API & Query Usage Monitor"
              subtitle="Daily request counts, limits & call logs"
              value={`Google: ${queryLogger.getDailyCount('google-books')}/${queryLogger.getServiceQuota('google-books').limit}`}
              onClick={() => openSection('query-usage')}
            />
          </SettingsGroup>

          {/* GROUP 3: APP & DATA */}
          <SettingsGroup id="group-data-device" title={t('settings.groupDataDevice')}>
            <SettingsMenuRow
              testId="offline-storage"
              icon="smartphone"
              iconTone="slate"
              title={t('settings.rowOfflineStorageTitle')}
              subtitle={t('settings.rowOfflineStorageSubtitle')}
              value={storageUsage.formatted}
              onClick={() => openSection('offline-storage')}
            />
            <SettingsMenuRow
              testId="backup"
              icon="download"
              iconTone="slate"
              title={t('settings.rowBackupTitle')}
              subtitle={t('settings.rowBackupSubtitle')}
              onClick={() => openSection('backup')}
            />
          </SettingsGroup>
        </div>

        <div className="space-y-6">
          {/* GROUP 4: UPDATES & GUIDES */}
          <SettingsGroup id="group-updates-guides" title={t('settings.groupUpdatesGuides')}>
            <SettingsMenuRow
              testId="whats-new"
              icon="sparkles"
              iconTone="amber"
              title={t('settings.rowWhatsNewTitle')}
              subtitle={t('settings.rowWhatsNewSubtitle')}
              value={`v${APP_VERSION}`}
              onClick={() => openSection('whats-new')}
            />
            <SettingsMenuRow
              testId="guides"
              icon="book"
              iconTone="teal"
              title={t('settings.rowGuidesTitle')}
              subtitle={t('settings.rowGuidesSubtitle')}
              onClick={() => openSection('guides')}
            />
          </SettingsGroup>

          {/* GROUP 5: LEGAL */}
          <SettingsGroup id="group-legal" title={t('settings.groupLegal')}>
            <SettingsMenuRow
              testId="privacy"
              icon="shield"
              iconTone="slate"
              title={t('settings.rowPrivacyTitle')}
              subtitle={t('settings.rowPrivacySubtitle')}
              onClick={() => openSection('privacy')}
            />
            <SettingsMenuRow
              testId="terms"
              icon="fileText"
              iconTone="slate"
              title={t('settings.rowTermsTitle')}
              subtitle={t('settings.rowTermsSubtitle')}
              onClick={() => openSection('terms')}
            />
            <SettingsMenuRow
              testId="impressum"
              icon="scale"
              iconTone="slate"
              title={t('settings.rowImpressumTitle')}
              subtitle={t('settings.rowImpressumSubtitle')}
              onClick={() => openSection('impressum')}
            />
          </SettingsGroup>

          {/* GROUP 6: OTHER */}
          <SettingsGroup id="group-other" title={t('settings.groupOther')}>
            <SettingsMenuRow
              testId="rate"
              icon="star"
              iconTone="amber"
              title={t('settings.rowRateAppTitle')}
              subtitle={t('settings.rowRateAppSubtitle')}
              onClick={() => openSection('rate')}
            />
            <SettingsMenuRow
              testId="feedback"
              icon="mail"
              iconTone="indigo"
              title={t('settings.rowSendFeedbackTitle')}
              subtitle={t('settings.rowSendFeedbackSubtitle')}
              onClick={() => openSection('feedback')}
            />
            <SettingsMenuRow
              testId="donate"
              icon="coffee"
              iconTone="rose"
              title={t('settings.rowDonateTitle')}
              subtitle={t('settings.rowDonateSubtitle')}
              onClick={() => openSection('donate')}
            />
          </SettingsGroup>
        </div>
      </div>
    </div>
  );
};
