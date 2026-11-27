import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp, pwaManager } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { ToggleSwitch } from '../common/ToggleSwitch.js';
import { testLlmConnection } from '../../features/llm/llm-client.js';
import {
  getDeviceBooksProxyUrl,
  setDeviceBooksProxyUrl,
} from '../../features/catalog/providers/google-books-provider.js';
import {
  SUPPORTED_LANGUAGES,
  THEME_PRESETS,
  LIGHT_THEME_PRESET_IDS,
  DARK_THEME_PRESET_IDS,
  DEFAULT_LIGHT_THEME_PRESET,
  ALL_BOOK_CARD_FIELDS,
  NUMERIC_BOUNDS,
  normalizeBookCardCustomWidth,
  normalizeDiscoverySettings,
  normalizeLanguage,
  resolveEffectiveThemeConfig,
  resolveBookCardDisplayConfig,
} from '../../config/index.js';
import { clearVectorCache } from '../../features/tagging/vector-store.js';
import { DEFAULT_PRESET_ILLUSTRATION_PROMPT } from '../../config/defaults.js';
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverList,
  BookCoverSlide,
  getBookCardWidthTokens,
} from '../common/BookCoverCard.js';
import type { SectionBookLayout } from '../common/BookSectionViewToggle.js';
import {
  type Book,
  type ThemePresetId,
  type BookDetailStyle,
  type BookViewMode,
  type BookCardSize,
  type BookCardInfoPlacement,
  type BookCardFrame,
  type BookCardMetaField,
  type BookCardSectionKey,
  type BookCardDisplayConfig,
  type BookCardShadowMode,
  type HomeActiveRotationStyle,
  type BottomNavStyle,
  type SidebarArtworkMode,
  type SidebarArtworkStyle,
  type SidebarDividerStyle,
  type DynamicCoverTintMode,
  type CoverAspectRatio,
  type PresetCornerArtSize,
  type LlmProvider,
} from '../../types/models.js';
import { APP_VERSION, APP_DOCS_LINKS } from '../../version.js';
import {
  estimateAppStorageUsage,
  getDetailedStorageBreakdown,
  formatStorageBytes,
} from '../../core/storage.js';
import { FIELD_HELP_COPY } from '../../ui/components/field-help.js';
import { GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL } from '../../ui/components/welcome-setup-modal.js';
import { ReaderProfilesSection } from '../profiles/ReaderProfilesSection.js';
import {
  SettingsGroup,
  SettingsMenuRow,
  SettingsSubViewHeader,
  type SettingsSectionId,
} from './settings/SettingsPrimitives.js';
import {
  WhatsNewSubView,
  IconLegendSubView,
  LegalSubView,
  OtherSubView,
} from './settings/SettingsInfoSections.js';
import { QueryUsageSubView } from './settings/QueryUsageSubView.js';
import { MatchingRulesSubView } from './settings/MatchingRulesSubView.js';
import { queryLogger } from '../../features/telemetry/query-logger.js';
import { ArtworkPickerModal } from '../presets/ArtworkPickerModal.js';
import {
  DAILY_RANDOM_ARTWORK_ID,
  DEFAULT_SIDEBAR_ARTWORK_ID,
  resolveActiveDividerVariant,
  resolveSidebarArtworkInfo,
} from '../../ui/preset-artwork.js';
import sidebarArtworkImg from '../../assets/images/sidebar_reading_artwork_1794694074246.jpg';

const VALID_SECTIONS = new Set<SettingsSectionId>([
  'profiles',
  'appearance',
  'language',
  'shelf-rules',
  'matching-rules',
  'catalog',
  'ai',
  'query-usage',
  'offline-storage',
  'backup',
  'dev-tools',
  'whats-new',
  'guides',
  'icon-legend',
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
    hasQaSnapshot,
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

  // Inline confirmation for Reset Sample Data & Clear All Test Data
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  // Dev Mode 5-tap unlock

  const [versionTapCount, setVersionTapCount] = useState(0);
  const isDevToolsVisible = Boolean(
    (import.meta as any).env?.DEV || state.settings.devModeUnlocked
  );

  const handleVersionTap = async () => {
    if (isDevToolsVisible) return;
    const next = versionTapCount + 1;
    if (next >= 5) {
      setVersionTapCount(0);
      await store.updateSettings({ devModeUnlocked: true });
      store.notify(t('devTools.unlockNotice'), 'success');
    } else {
      setVersionTapCount(next);
    }
  };

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

  // Gift & Bookstore Links state
  const [customStoreNameDraft, setCustomStoreNameDraft] = useState(
    state.settings.customGiftStoreName || ''
  );
  const [customStoreUrlDraft, setCustomStoreUrlDraft] = useState(
    state.settings.customGiftStoreUrl || ''
  );
  useEffect(() => {
    setCustomStoreNameDraft(state.settings.customGiftStoreName || '');
    setCustomStoreUrlDraft(state.settings.customGiftStoreUrl || '');
  }, [state.settings.customGiftStoreName, state.settings.customGiftStoreUrl]);

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
  const [isSidebarArtworkPickerOpen, setIsSidebarArtworkPickerOpen] = useState(false);
  const [appearanceTab, setAppearanceTab] = useState<'themes' | 'cards' | 'details' | 'chrome'>(
    'themes'
  );
  const [cardConfigScope, setCardConfigScope] = useState<'global' | BookCardSectionKey>('global');
  const [cardPreviewLayout, setCardPreviewLayout] = useState<SectionBookLayout>('grid');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage and sync metrics
  const storageUsage = useMemo(() => estimateAppStorageUsage(state), [state]);
  const [detailedStorage, setDetailedStorage] = useState<Awaited<
    ReturnType<typeof getDetailedStorageBreakdown>
  > | null>(null);

  useEffect(() => {
    if (activeSection !== 'offline-storage') return;
    let cancelled = false;
    getDetailedStorageBreakdown(state)
      .then((res) => {
        if (!cancelled) setDetailedStorage(res);
      })
      .catch(() => {
        if (!cancelled) setDetailedStorage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection, state]);
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
      return !hasGoogle || !b.coverUrl || !b.pageCount || !b.publishedYear || !b.description;
    }).length;
  }, [state.books]);

  // Appearance handlers
  const handleSelectThemePreset = async (presetId: ThemePresetId) => {
    const preset = THEME_PRESETS[presetId];
    if (!preset) return;
    await store.updateSettings({
      theme: preset.mode,
      themePreset: preset.id,
    });
  };

  const handleToggleSystemAuto = async () => {
    if (state.settings.theme === 'system') {
      const effective = resolveEffectiveThemeConfig(
        'system',
        state.settings.themePreset,
        typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
      );
      await store.updateSettings({
        theme: effective.mode,
        themePreset: effective.id,
      });
    } else {
      await store.updateSettings({ theme: 'system' });
    }
  };

  const handleBookDetailStyleChange = async (bookDetailStyle: BookDetailStyle) => {
    await store.updateSettings({ bookDetailStyle });
  };

  const handleBookViewModeChange = async (bookViewMode: BookViewMode) => {
    await store.updateSettings({ bookViewMode });
  };

  const handleBookCardSizeChange = async (bookCardSize: BookCardSize) => {
    await store.updateSettings({ bookCardSize });
  };

  const updateScopedBookCardConfig = async (patch: Partial<BookCardDisplayConfig>) => {
    if (cardConfigScope === 'global') {
      const updates: Record<string, unknown> = {};
      if (patch.size !== undefined) updates.bookCardSize = patch.size;
      if (patch.customWidth !== undefined) {
        updates.bookCardCustomWidth = normalizeBookCardCustomWidth(patch.customWidth);
      }
      if (patch.infoPlacement !== undefined) updates.bookCardInfoPlacement = patch.infoPlacement;
      if (patch.cardFrame !== undefined) updates.bookCardFrame = patch.cardFrame;
      if (patch.showCoverOverlays !== undefined) {
        updates.showBookCoverOverlays = patch.showCoverOverlays;
      }
      if (patch.fields !== undefined) updates.bookCardFields = patch.fields;
      await store.updateSettings(updates as any);
      return;
    }

    const existingOverrides = state.settings.bookCardSectionOverrides || {};
    const currentSection = existingOverrides[cardConfigScope] || {};
    await store.updateSettings({
      bookCardSectionOverrides: {
        ...existingOverrides,
        [cardConfigScope]: {
          ...currentSection,
          ...patch,
          ...(patch.customWidth !== undefined
            ? { customWidth: normalizeBookCardCustomWidth(patch.customWidth) }
            : {}),
        },
      },
    });
  };

  const resetScopedBookCardConfig = async () => {
    if (cardConfigScope === 'global') {
      await store.updateSettings({
        bookCardSize: 'compact',
        bookCardCustomWidth: NUMERIC_BOUNDS.bookCardCustomWidthDefault,
        bookCardInfoPlacement: 'below',
        bookCardFrame: 'framed',
        showBookCoverOverlays: true,
        bookCardFields: ['title', 'author', 'ageFormat', 'usage'],
      });
      return;
    }
    const nextOverrides = { ...(state.settings.bookCardSectionOverrides || {}) };
    delete nextOverrides[cardConfigScope];
    await store.updateSettings({ bookCardSectionOverrides: nextOverrides });
  };

  const handleSidebarArtworkChange = async (sidebarArtworkMode: SidebarArtworkMode) => {
    await store.updateSettings({ sidebarArtworkMode });
  };

  const handleSidebarArtworkStyleChange = async (sidebarArtworkStyle: SidebarArtworkStyle) => {
    await store.updateSettings({ sidebarArtworkStyle });
  };

  const handleSidebarDividerStyleChange = async (sidebarDividerStyle: SidebarDividerStyle) => {
    await store.updateSettings({ sidebarDividerStyle });
  };

  const handleLanguageChange = async (language: string) => {
    await store.updateSettings({ language: language as any });
  };

  const handleCoverAspectChange = async (coverAspectRatio: CoverAspectRatio) => {
    await store.updateSettings({ coverAspectRatio });
  };

  const handleToggleShowBookDescription = async () => {
    await store.updateSettings({
      showBookDescription: state.settings.showBookDescription === false,
    });
  };

  const handleToggleDynamicTint = async () => {
    await store.updateSettings({ dynamicCoverTint: state.settings.dynamicCoverTint === false });
  };

  const handleToggleDynamicTintAccent = async () => {
    await store.updateSettings({
      dynamicCoverTintAccent: !state.settings.dynamicCoverTintAccent,
    });
  };

  const handleDynamicTintStyleChange = async (dynamicCoverTintStyle: 'circular' | 'linear') => {
    await store.updateSettings({ dynamicCoverTintStyle });
  };

  const handleDynamicTintBehaviorChange = async (dynamicCoverTintBehavior: 'fixed' | 'scroll') => {
    await store.updateSettings({ dynamicCoverTintBehavior });
  };

  const handleDynamicTintModeChange = async (dynamicCoverTintMode: DynamicCoverTintMode) => {
    await store.updateSettings({ dynamicCoverTintMode });
  };

  const handleDynamicTintCircularFadeChange = async (dynamicCoverTintCircularFade: number) => {
    await store.updateSettings({ dynamicCoverTintCircularFade });
  };

  const handleDynamicTintLinearFadeChange = async (dynamicCoverTintLinearFade: number) => {
    await store.updateSettings({ dynamicCoverTintLinearFade });
  };

  const handleToggleTranslucentTopBar = async () => {
    const current =
      state.settings.translucentTopBar ?? (state.settings.nativeAppStyle !== false);
    await store.updateSettings({ translucentTopBar: !current });
  };

  const handleToggleTranslucentBottomBar = async () => {
    const current =
      state.settings.translucentBottomBar ?? (state.settings.nativeAppStyle !== false);
    await store.updateSettings({ translucentBottomBar: !current });
  };

  const handleBottomNavStyleChange = async (bottomNavStyle: BottomNavStyle) => {
    await store.updateSettings({ bottomNavStyle });
  };

  const handleBookCardShadowChange = async (bookCardShadow: BookCardShadowMode) => {
    await store.updateSettings({ bookCardShadow });
  };

  const handleHomeActiveRotationStyleChange = async (
    homeActiveRotationStyle: HomeActiveRotationStyle
  ) => {
    await store.updateSettings({ homeActiveRotationStyle });
  };

  const [presetPromptDraft, setPresetPromptDraft] = useState(
    state.settings.presetIllustrationPromptTemplate || DEFAULT_PRESET_ILLUSTRATION_PROMPT
  );
  useEffect(() => {
    setPresetPromptDraft(
      state.settings.presetIllustrationPromptTemplate || DEFAULT_PRESET_ILLUSTRATION_PROMPT
    );
  }, [state.settings.presetIllustrationPromptTemplate]);

  const handleTogglePresetDecorations = async () => {
    await store.updateSettings({
      showPresetDecorations: state.settings.showPresetDecorations === false,
    });
  };

  const handlePresetCornerArtSizeChange = async (presetCornerArtSize: PresetCornerArtSize) => {
    await store.updateSettings({ presetCornerArtSize });
  };

  const handleSavePresetPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetPromptDraft.trim() || DEFAULT_PRESET_ILLUSTRATION_PROMPT;
    await store.updateSettings({ presetIllustrationPromptTemplate: trimmed });
    store.notify('Saved preset illustration prompt template.', 'success');
  };

  const handleResetPresetPrompt = async () => {
    setPresetPromptDraft(DEFAULT_PRESET_ILLUSTRATION_PROMPT);
    await store.updateSettings({
      presetIllustrationPromptTemplate: DEFAULT_PRESET_ILLUSTRATION_PROMPT,
    });
    store.notify('Restored default preset illustration prompt.', 'info');
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

  // Gift & Bookstore links handlers
  const handleToggleGiftStore = async (storeId: 'bookshop' | 'amazon') => {
    const current = Array.isArray(state.settings.enabledGiftStores)
      ? state.settings.enabledGiftStores
      : ['bookshop', 'amazon'];
    const updated = current.includes(storeId)
      ? current.filter((id) => id !== storeId)
      : [...current, storeId];
    await store.updateSettings({ enabledGiftStores: updated });
  };

  const handleAmazonDomainChange = async (amazonDomain: string) => {
    await store.updateSettings({ amazonDomain: amazonDomain as any });
  };

  const handleSaveCustomGiftStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = customStoreUrlDraft.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      store.notify('Custom bookstore URL must start with https:// or http://', 'error');
      return;
    }
    await store.updateSettings({
      customGiftStoreName: customStoreNameDraft.trim().slice(0, 60),
      customGiftStoreUrl: cleanUrl.slice(0, 300),
    });
    store.notify('Saved bookstore preferences.', 'success');
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

  const handleSyncLibraryMetadata = async (forceAll = false) => {
    setSyncingCatalog(true);
    setCatalogSyncProgress('Updating Library…');
    setCatalogSyncReport('');
    setCatalogSyncTone('idle');

    try {
      const summary = await store.syncExistingCatalogMetadata(catalogService, {
        forceAll,
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
          summary.addedDescriptionsCount > 0
            ? `${summary.addedDescriptionsCount} description(s) added`
            : '',
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

  const handleToggleAutoInferAgeRange = async () => {
    await store.updateSettings({
      autoInferAgeRange: !state.settings.autoInferAgeRange,
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

  // Smart Discovery & Home Feed Settings
  const [clearingVectorCache, setClearingVectorCache] = useState(false);
  const discoverySettings = useMemo(
    () => normalizeDiscoverySettings(state.settings?.discoverySettings),
    [state.settings?.discoverySettings]
  );

  const updateDiscoverySettings = async (
    patch: Partial<ReturnType<typeof normalizeDiscoverySettings>>
  ) => {
    await store.updateSettings({
      discoverySettings: {
        ...discoverySettings,
        ...patch,
      },
    });
  };

  const toggleDiscoveryShelfPin = async (shelfKey: string) => {
    const pinned = new Set(discoverySettings.pinnedShelfKeys);
    const disabled = new Set(discoverySettings.disabledShelfKeys);
    if (pinned.has(shelfKey)) {
      pinned.delete(shelfKey);
    } else {
      pinned.add(shelfKey);
      disabled.delete(shelfKey);
    }
    await updateDiscoverySettings({
      pinnedShelfKeys: Array.from(pinned),
      disabledShelfKeys: Array.from(disabled),
    });
  };

  const toggleDiscoveryShelfDisabled = async (shelfKey: string) => {
    const pinned = new Set(discoverySettings.pinnedShelfKeys);
    const disabled = new Set(discoverySettings.disabledShelfKeys);
    if (disabled.has(shelfKey)) {
      disabled.delete(shelfKey);
    } else {
      disabled.add(shelfKey);
      pinned.delete(shelfKey);
    }
    await updateDiscoverySettings({
      pinnedShelfKeys: Array.from(pinned),
      disabledShelfKeys: Array.from(disabled),
    });
  };

  const handleClearVectorCache = async () => {
    setClearingVectorCache(true);
    try {
      await clearVectorCache();
      store.notify('Cleared local semantic vector cache. Vectors will rebuild automatically.', 'info');
    } catch {
      store.notify('Could not clear local vector cache.', 'error');
    } finally {
      setClearingVectorCache(false);
    }
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
  const effectiveThemeConfig = resolveEffectiveThemeConfig(
    state.settings.theme,
    state.settings.themePreset,
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const themeLabel =
    state.settings.theme === 'system'
      ? `${t('settings.themeSystem')} (${effectiveThemeConfig.label})`
      : effectiveThemeConfig.label;
  const detailStyleLabel =
    state.settings.bookDetailStyle === 'editorial'
      ? t('settings.bookDetailEditorial')
      : t('settings.bookDetailCompact');
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
              />
              <ReaderProfilesSection compactHeader defaultViewMode="list" />
            </>
          );

        case 'appearance': {
          const activeScope = cardConfigScope === 'global' ? undefined : cardConfigScope;
          const scopedConfig = resolveBookCardDisplayConfig(state.settings, activeScope);
          const allFieldLabels: Record<BookCardMetaField, string> = {
            title: 'Title',
            author: 'Author',
            year: 'Year',
            pages: 'Pages',
            ageFormat: 'Ages & Binding',
            usage: 'Rotation Status',
          };
          const placementOptions: Array<{
            id: string;
            placement: BookCardInfoPlacement;
            frame?: BookCardFrame;
            label: string;
            hint: string;
          }> = [
            {
              id: 'below-framed',
              placement: 'below',
              frame: 'framed',
              label: 'Below Cover',
              hint: 'Card frame with details below',
            },
            {
              id: 'below-borderless',
              placement: 'below',
              frame: 'borderless',
              label: 'Below (No Card)',
              hint: 'Details below cover, no card margin',
            },
            {
              id: 'overlay',
              placement: 'overlay',
              label: 'Overlay',
              hint: 'Subtle bottom scrim over cover',
            },
            {
              id: 'cover-only',
              placement: 'cover-only',
              label: 'Cover Only',
              hint: 'Pure covers with zero text',
            },
          ];
          const scopeTabs: Array<{ id: 'global' | BookCardSectionKey; label: string }> = [
            { id: 'global', label: 'All Views (Default)' },
            { id: 'library', label: 'Library' },
            { id: 'homeShelf', label: 'Home Shelf' },
            { id: 'homeSuggested', label: 'Suggested' },
            { id: 'rotations', label: 'Rotations' },
          ];

          const toggleScopedField = (fieldId: BookCardMetaField) => {
            const exists = scopedConfig.fields.includes(fieldId);
            const nextFields = exists
              ? scopedConfig.fields.filter((f) => f !== fieldId)
              : ALL_BOOK_CARD_FIELDS.filter(
                  (f) => f === fieldId || scopedConfig.fields.includes(f)
                );
            void updateScopedBookCardConfig({ fields: nextFields });
          };

          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.appearanceHeading')}
                subtitle={t('settings.appearanceDesc')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Clean Subsection Switcher */}
              <div
                role="tablist"
                aria-label="Appearance subsections"
                className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-edge shadow-2xs overflow-x-auto no-scrollbar"
              >
                {[
                  { id: 'themes' as const, label: 'Themes', icon: 'sun' },
                  { id: 'cards' as const, label: 'Book Cards', icon: 'grid' },
                  { id: 'details' as const, label: 'Book Details', icon: 'bookOpen' },
                  { id: 'chrome' as const, label: 'Chrome & Art', icon: 'sparkles' },
                ].map((tab) => {
                  const selected = appearanceTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setAppearanceTab(tab.id)}
                      className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                        selected
                          ? 'bg-primary text-primary-fg shadow-xs'
                          : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle'
                      }`}
                    >
                      <Icon name={tab.icon} className="w-3.5 h-3.5 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* SUBSECTION 1: THEMES */}
              {appearanceTab === 'themes' && (
                <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {t('settings.themeLabel')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        Choose from {LIGHT_THEME_PRESET_IDS.length} Light and {DARK_THEME_PRESET_IDS.length} matte Dark palettes with matching typography and tokens.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleSystemAuto}
                      aria-pressed={state.settings.theme === 'system'}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        state.settings.theme === 'system'
                          ? 'bg-primary text-primary-fg border-primary shadow-xs'
                          : 'bg-surface-subtle text-ink-secondary hover:text-ink border-edge'
                      }`}
                    >
                      <Icon name="sliders" className="w-3.5 h-3.5" />
                      <span>{t('settings.themeAutoSystem')}</span>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {[
                      { label: t('settings.themeLightGroup'), ids: LIGHT_THEME_PRESET_IDS },
                      { label: t('settings.themeDarkGroup'), ids: DARK_THEME_PRESET_IDS },
                    ].map((group) => (
                      <div key={group.label} className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {group.ids.map((presetId) => {
                            const preset = THEME_PRESETS[presetId];
                            const active = effectiveThemeConfig.id === preset.id;
                            const isDefaultLight = preset.id === DEFAULT_LIGHT_THEME_PRESET;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleSelectThemePreset(preset.id)}
                                aria-pressed={active}
                                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                  active
                                    ? 'bg-surface-elevated border-primary ring-1 ring-primary/35 shadow-xs'
                                    : 'bg-surface-subtle border-edge hover:border-primary/50'
                                }`}
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs sm:text-sm font-semibold text-ink truncate">
                                      {preset.label}
                                    </p>
                                    {isDefaultLight && (
                                      <span className="px-1.5 py-0.5 rounded bg-primary/12 text-primary text-[9px] font-bold uppercase tracking-wider shrink-0">
                                        Default
                                      </span>
                                    )}
                                    {active && (
                                      <Icon name="check" className="w-3.5 h-3.5 text-primary shrink-0" />
                                    )}
                                  </div>
                                  <p className="text-[11px] text-ink-secondary truncate">
                                    {preset.shortDescription}
                                  </p>
                                  <p className="text-[10px] font-mono text-ink-muted truncate">
                                    {preset.fontDescription}
                                  </p>
                                </div>
                                <div className="flex items-center -space-x-1 shrink-0" aria-hidden="true">
                                  {preset.swatches.map((hex, idx) => (
                                    <span
                                      key={idx}
                                      className="w-4 h-4 rounded-full border border-edge shadow-2xs"
                                      style={{ backgroundColor: hex }}
                                    />
                                  ))}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* SUBSECTION 2: BOOK CARDS & COVER DISPLAY */}
              {appearanceTab === 'cards' && (
                <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-5">
                  {/* Global View Mode & Cover Aspect Ratio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {t('settings.bookViewModeLabel')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        Show book cards in a visual cover grid or scannable list rows.
                      </p>
                      <div className="mt-2.5 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
                        {[
                          { id: 'grid' as const, label: t('settings.bookViewGrid'), icon: 'grid' },
                          { id: 'list' as const, label: t('settings.bookViewList'), icon: 'list' },
                        ].map((item) => {
                          const active = (state.settings.bookViewMode || 'grid') === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleBookViewModeChange(item.id)}
                              aria-pressed={active}
                              className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                                active
                                  ? 'bg-primary text-primary-fg shadow-xs'
                                  : 'text-ink-secondary hover:text-ink'
                              }`}
                            >
                              <Icon name={item.icon} className="w-3.5 h-3.5" />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {t('settings.coverAspectLabel')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        {t('settings.coverAspectHint')}
                      </p>
                      <div className="mt-2.5 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
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
                              className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                active
                                  ? 'bg-primary text-primary-fg shadow-xs'
                                  : 'text-ink-secondary hover:text-ink'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Unified BookCoverCard Configuration (Global Default or Per-Section) */}
                  <div className="pt-4 border-t border-edge-subtle space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          Book Card Layout & Info Fields
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          Configure card size, cover-only mode, overlays, and details globally or per view.
                        </p>
                      </div>
                      {cardConfigScope !== 'global' && scopedConfig.hasCustomOverride && (
                        <button
                          type="button"
                          onClick={resetScopedBookCardConfig}
                          className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                        >
                          Reset to Default
                        </button>
                      )}
                    </div>

                    {/* Section Scope Pills */}
                    <div
                      role="tablist"
                      aria-label="Configure book card scope"
                      className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
                    >
                      {scopeTabs.map((tab) => {
                        const selected = cardConfigScope === tab.id;
                        const hasOverride =
                          tab.id !== 'global' &&
                          Boolean(
                            state.settings.bookCardSectionOverrides?.[tab.id] &&
                              Object.keys(state.settings.bookCardSectionOverrides[tab.id] || {}).length > 0
                          );
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setCardConfigScope(tab.id)}
                            className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                              selected
                                ? 'bg-primary text-primary-fg border-primary shadow-2xs'
                                : 'bg-surface-subtle text-ink-secondary hover:text-ink border-edge'
                            }`}
                          >
                            <span>{tab.label}</span>
                            {hasOverride && (
                              <span
                                aria-label="Customized"
                                className={`w-1.5 h-1.5 rounded-full ${
                                  selected ? 'bg-primary-fg' : 'bg-primary'
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-xl bg-surface-subtle/60 border border-edge p-3.5 sm:p-4 space-y-4">
                      {cardConfigScope !== 'global' && !scopedConfig.hasCustomOverride && (
                        <p className="text-[11px] font-medium text-ink-secondary">
                          Currently inheriting <span className="font-semibold text-ink">All Views (Default)</span>. Changing any setting below saves a custom rule for this section.
                        </p>
                      )}

                      {/* Live Interactive Book Card Preview */}
                      {(() => {
                        const fallbackSamples: Book[] = [
                          {
                            id: 'preview-sample-1',
                            isbn13: '9780000000001',
                            title: 'The Snowy Day',
                            authors: ['Ezra Jack Keats'],
                            publishedYear: 1962,
                            pageCount: 40,
                            format: 'hardcover',
                            ageMin: 2,
                            ageMax: 6,
                            readingStage: 'picture-book',
                            tags: ['winter', 'bedtime'],
                            collectionStatus: 'owned',
                            condition: 'good',
                            loved: true,
                            owners: activeProfile ? [activeProfile.id] : ['shared'],
                            spineColor: 'amber',
                            sources: [],
                            addedAt: '',
                          },
                          {
                            id: 'preview-sample-2',
                            isbn13: '9780000000002',
                            title: 'Where the Wild Things Are',
                            authors: ['Maurice Sendak'],
                            publishedYear: 1963,
                            pageCount: 48,
                            format: 'hardcover',
                            ageMin: 3,
                            ageMax: 8,
                            readingStage: 'picture-book',
                            tags: ['imagination', 'animals'],
                            collectionStatus: 'owned',
                            condition: 'good',
                            loved: false,
                            owners: ['shared'],
                            spineColor: 'emerald',
                            sources: [],
                            addedAt: '',
                          },
                          {
                            id: 'preview-sample-3',
                            isbn13: '9780000000003',
                            title: 'Goodnight Moon',
                            authors: ['Margaret Wise Brown'],
                            publishedYear: 1947,
                            pageCount: 32,
                            format: 'board-book',
                            ageMin: 0,
                            ageMax: 4,
                            readingStage: 'board-toddler',
                            tags: ['bedtime'],
                            collectionStatus: 'wishlist',
                            condition: 'good',
                            loved: false,
                            owners: ['shared'],
                            spineColor: 'indigo',
                            sources: [],
                            addedAt: '',
                          },
                        ];
                        const previewBooks =
                          state.books.length > 0 ? state.books.slice(0, 3) : fallbackSamples;
                        const tokens = getBookCardWidthTokens(
                          scopedConfig.size,
                          scopedConfig.customWidth,
                          scopedConfig.infoPlacement
                        );
                        const widthBadge =
                          tokens.sm === tokens.lg
                            ? `${tokens.lg}px`
                            : `${tokens.sm}–${tokens.lg}px`;

                        return (
                          <div
                            data-book-card-preview="true"
                            className="rounded-xl bg-canvas border border-edge p-3 sm:p-3.5 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
                                  Live Preview
                                </span>
                                <span className="text-[11px] font-mono-tabular text-ink-muted">
                                  · {widthBadge}
                                </span>
                              </div>
                              <div
                                role="group"
                                aria-label="Preview layout mode"
                                className="inline-flex items-center p-0.5 rounded-lg bg-surface border border-edge"
                              >
                                {(
                                  [
                                    { id: 'grid' as const, icon: 'grid', label: 'Grid' },
                                    { id: 'scroll' as const, icon: 'bookOpen', label: 'Carousel' },
                                    { id: 'list' as const, icon: 'list', label: 'List' },
                                  ]
                                ).map((mode) => {
                                  const selected = cardPreviewLayout === mode.id;
                                  return (
                                    <button
                                      key={mode.id}
                                      type="button"
                                      onClick={() => setCardPreviewLayout(mode.id)}
                                      aria-pressed={selected}
                                      aria-label={`Preview in ${mode.label} layout`}
                                      className={`min-h-[28px] px-2 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                        selected
                                          ? 'bg-primary text-primary-fg shadow-2xs'
                                          : 'text-ink-secondary hover:text-ink'
                                      }`}
                                    >
                                      <Icon name={mode.icon} className="w-3 h-3" />
                                      <span className="hidden sm:inline">{mode.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {cardPreviewLayout === 'list' ? (
                              <BookCoverList>
                                {previewBooks.slice(0, 2).map((sampleBook, idx) => (
                                  <BookCoverCard
                                    key={sampleBook.id}
                                    dataBookCard={`preview-${sampleBook.id}`}
                                    book={sampleBook}
                                    activeProfile={activeProfile}
                                    profiles={state.profiles}
                                    layout="list"
                                    size={scopedConfig.size}
                                    customWidth={scopedConfig.customWidth}
                                    aspectRatio={scopedConfig.aspectRatio}
                                    infoPlacement={scopedConfig.infoPlacement}
                                    cardFrame={scopedConfig.cardFrame}
                                    showCoverOverlays={scopedConfig.showCoverOverlays}
                                    fields={scopedConfig.fields}
                                    usage={{
                                      compactRecencyLabel: idx === 0 ? 'On active shelf' : 'Rotated 14d ago',
                                      isCurrentlyOnActiveShelf: idx === 0,
                                    }}
                                    onInspect={() => {}}
                                  />
                                ))}
                              </BookCoverList>
                            ) : cardPreviewLayout === 'scroll' ? (
                              <BookCoverSlide
                                itemCount={previewBooks.length}
                                ariaLabel="Book card live preview carousel"
                              >
                                {previewBooks.map((sampleBook, idx) => (
                                  <BookCoverCard
                                    key={sampleBook.id}
                                    dataBookCard={`preview-${sampleBook.id}`}
                                    book={sampleBook}
                                    activeProfile={activeProfile}
                                    profiles={state.profiles}
                                    layout="carousel"
                                    size={scopedConfig.size}
                                    customWidth={scopedConfig.customWidth}
                                    aspectRatio={scopedConfig.aspectRatio}
                                    infoPlacement={scopedConfig.infoPlacement}
                                    cardFrame={scopedConfig.cardFrame}
                                    showCoverOverlays={scopedConfig.showCoverOverlays}
                                    fields={scopedConfig.fields}
                                    usage={{
                                      compactRecencyLabel: idx === 0 ? 'On active shelf' : 'Fresh pick',
                                      isCurrentlyOnActiveShelf: idx === 0,
                                    }}
                                    hideBookCoverInternalBadges
                                    onInspect={() => {}}
                                  />
                                ))}
                              </BookCoverSlide>
                            ) : (
                              <BookCoverGrid
                                size={scopedConfig.size}
                                customWidth={scopedConfig.customWidth}
                                infoPlacement={scopedConfig.infoPlacement}
                              >
                                {previewBooks.map((sampleBook, idx) => (
                                  <BookCoverCard
                                    key={sampleBook.id}
                                    dataBookCard={`preview-${sampleBook.id}`}
                                    book={sampleBook}
                                    activeProfile={activeProfile}
                                    profiles={state.profiles}
                                    layout="grid"
                                    size={scopedConfig.size}
                                    customWidth={scopedConfig.customWidth}
                                    aspectRatio={scopedConfig.aspectRatio}
                                    infoPlacement={scopedConfig.infoPlacement}
                                    cardFrame={scopedConfig.cardFrame}
                                    showCoverOverlays={scopedConfig.showCoverOverlays}
                                    fields={scopedConfig.fields}
                                    usage={{
                                      compactRecencyLabel: idx === 0 ? 'On active shelf' : 'Fresh pick',
                                      isCurrentlyOnActiveShelf: idx === 0,
                                    }}
                                    hideBookCoverInternalBadges
                                    onInspect={() => {}}
                                  />
                                ))}
                              </BookCoverGrid>
                            )}
                          </div>
                        );
                      })()}

                      {/* Card Size */}
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            {t('settings.bookCardSizeLabel')}
                          </p>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-lg bg-surface border border-edge max-w-lg">
                            {[
                              { id: 'compact' as const, label: t('settings.bookCardCompact') },
                              { id: 'regular' as const, label: t('settings.bookCardRegular') },
                              { id: 'large' as const, label: t('settings.bookCardLarge') },
                              { id: 'custom' as const, label: t('settings.bookCardCustom') },
                            ].map((item) => {
                              const active = scopedConfig.size === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  data-card-size-option={item.id}
                                  onClick={() => void updateScopedBookCardConfig({ size: item.id })}
                                  aria-pressed={active}
                                  className={`min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                    active
                                      ? 'bg-primary text-primary-fg shadow-xs'
                                      : 'text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {scopedConfig.size === 'custom' && (
                          <div className="rounded-lg bg-surface border border-edge p-3 max-w-lg space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="book-card-custom-width-slider"
                                className="text-xs font-semibold text-ink"
                              >
                                {t('settings.bookCardCustomWidthLabel')}
                              </label>
                              <span className="text-xs font-mono-tabular font-semibold text-primary">
                                {scopedConfig.customWidth}px
                              </span>
                            </div>
                            <input
                              id="book-card-custom-width-slider"
                              type="range"
                              min={NUMERIC_BOUNDS.bookCardCustomWidthMin}
                              max={NUMERIC_BOUNDS.bookCardCustomWidthMax}
                              step={4}
                              value={scopedConfig.customWidth}
                              onChange={(e) =>
                                void updateScopedBookCardConfig({
                                  customWidth: Number(e.target.value),
                                })
                              }
                              className="w-full accent-primary cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[10px] font-mono-tabular text-ink-muted">
                              <span>{NUMERIC_BOUNDS.bookCardCustomWidthMin}px</span>
                              <span>136px</span>
                              <span>{NUMERIC_BOUNDS.bookCardCustomWidthMax}px</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Info Placement: Below / Below (No Card) / Overlay / Cover Only */}
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          Info Placement
                        </p>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {placementOptions.map((opt) => {
                            const active =
                              opt.placement === 'below'
                                ? scopedConfig.infoPlacement === 'below' &&
                                  scopedConfig.cardFrame === opt.frame
                                : scopedConfig.infoPlacement === opt.placement;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                data-info-placement-option={opt.id}
                                onClick={() =>
                                  void updateScopedBookCardConfig(
                                    opt.frame !== undefined
                                      ? { infoPlacement: opt.placement, cardFrame: opt.frame }
                                      : { infoPlacement: opt.placement }
                                  )
                                }
                                aria-pressed={active}
                                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                  active
                                    ? 'bg-surface border-primary ring-1 ring-primary/35 shadow-2xs'
                                    : 'bg-surface/65 border-edge hover:border-primary/45'
                                }`}
                              >
                                <p className="text-xs font-semibold text-ink leading-tight">{opt.label}</p>
                                <p className="text-[11px] text-ink-secondary mt-0.5 leading-snug">
                                  {opt.hint}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Card Border & Frame */}
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-ink">
                            {t('settings.bookCardFrameLabel')}
                          </p>
                          {scopedConfig.infoPlacement === 'cover-only' && (
                            <span className="text-[11px] text-ink-muted">
                              Cover Only grid always renders borderless
                            </span>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface border border-edge max-w-md">
                          {(
                            [
                              { id: 'framed' as BookCardFrame, label: t('settings.bookCardFrameFramed') },
                              { id: 'borderless' as BookCardFrame, label: t('settings.bookCardFrameBorderless') },
                            ] as const
                          ).map((opt) => {
                            const active = scopedConfig.cardFrame === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                data-card-frame-option={opt.id}
                                aria-pressed={active}
                                onClick={() =>
                                  void updateScopedBookCardConfig({ cardFrame: opt.id })
                                }
                                className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                  active
                                    ? 'bg-primary text-primary-fg shadow-xs'
                                    : 'text-ink-secondary hover:text-ink'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Corner Badges & Icons Over Cover */}
                      <div className="flex items-center justify-between gap-4 pt-1 border-t border-edge-subtle">
                        <div className="min-w-0">
                          <p
                            id="label-book-cover-overlays"
                            className="text-xs font-semibold text-ink"
                          >
                            Show Corner Badges & Icons Over Cover
                          </p>
                          <p className="text-[11px] text-ink-secondary mt-0.5">
                            Loved hearts, wishlist/loan tags, owner initials & status badges.
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={scopedConfig.showCoverOverlays}
                          onChange={() =>
                            void updateScopedBookCardConfig({
                              showCoverOverlays: !scopedConfig.showCoverOverlays,
                            })
                          }
                          ariaLabelledBy="label-book-cover-overlays"
                          onLabel={t('common.on')}
                          offLabel={t('common.off')}
                        />
                      </div>

                      {/* Visible Info Parameters */}
                      <div className="pt-2 border-t border-edge-subtle space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-ink">
                            Visible Info Parameters
                          </p>
                          {scopedConfig.infoPlacement === 'cover-only' && (
                            <span className="text-[11px] text-ink-muted">
                              Hidden in Cover Only grid mode (still applies to List rows)
                            </span>
                          )}
                        </div>
                        <div
                          className={`flex flex-wrap gap-1.5 ${
                            scopedConfig.infoPlacement === 'cover-only' ? 'opacity-65' : ''
                          }`}
                        >
                          {ALL_BOOK_CARD_FIELDS.map((fieldId) => {
                            const selected = scopedConfig.fields.includes(fieldId);
                            return (
                              <button
                                key={fieldId}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleScopedField(fieldId)}
                                className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                                  selected
                                    ? 'bg-primary/15 border-primary text-primary'
                                    : 'bg-surface border-edge text-ink-secondary hover:text-ink'
                                }`}
                              >
                                {selected && <Icon name="check" className="w-3 h-3" />}
                                <span>{allFieldLabels[fieldId]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Book Card Shadows (Separate from Navigation Chrome) */}
                  <div className="pt-4 border-t border-edge-subtle space-y-2.5">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {t('settings.bookCardShadowLabel')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        {t('settings.bookCardShadowHint')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-md">
                      {(
                        [
                          { id: 'none' as const, label: t('settings.bookCardShadowNone') },
                          { id: 'subtle' as const, label: t('settings.bookCardShadowSubtle') },
                          { id: 'elevated' as const, label: t('settings.bookCardShadowElevated') },
                        ]
                      ).map((opt) => {
                        const active = (state.settings.bookCardShadow || 'subtle') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            data-card-shadow-option={opt.id}
                            onClick={() => handleBookCardShadowChange(opt.id)}
                            aria-pressed={active}
                            className={`flex-1 min-h-[40px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                              active
                                ? 'bg-primary text-primary-fg shadow-xs'
                                : 'text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Home Active Rotation Card Framing */}
                  <div className="pt-4 border-t border-edge-subtle space-y-2.5">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {t('settings.homeActiveRotationLabel')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        {t('settings.homeActiveRotationHint')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-md">
                      {(
                        [
                          { id: 'card' as const, label: t('settings.homeActiveRotationCard') },
                          { id: 'seamless' as const, label: t('settings.homeActiveRotationSeamless') },
                        ]
                      ).map((opt) => {
                        const active = (state.settings.homeActiveRotationStyle || 'card') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            data-home-rotation-style-option={opt.id}
                            onClick={() => handleHomeActiveRotationStyleChange(opt.id)}
                            aria-pressed={active}
                            className={`flex-1 min-h-[40px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                              active
                                ? 'bg-primary text-primary-fg shadow-xs'
                                : 'text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {/* SUBSECTION 3: BOOK DETAILS & DYNAMIC COVER TINT */}
              {appearanceTab === 'details' && (
                <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-5">
                  {/* Book Detail Layout: Compact vs. Editorial */}
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {t('settings.bookDetailStyleLabel')}
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      Compare the information-dense Compact inspector with the ambient, bento-grid Editorial book view.
                    </p>
                    <div className="mt-2.5 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-sm">
                      {[
                        { id: 'compact' as const, label: t('settings.bookDetailCompact') },
                        { id: 'editorial' as const, label: t('settings.bookDetailEditorial') },
                      ].map((item) => {
                        const active = (state.settings.bookDetailStyle || 'editorial') === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleBookDetailStyleChange(item.id)}
                            aria-pressed={active}
                            className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                              active
                                ? 'bg-primary text-primary-fg shadow-xs'
                                : 'text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Show Book Description Toggle */}
                  <div className="pt-4 border-t border-edge-subtle flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-show-book-description"
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.showBookDescriptionLabel')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        {t('settings.showBookDescriptionHint')}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={state.settings.showBookDescription !== false}
                      onChange={handleToggleShowBookDescription}
                      ariaLabelledBy="label-show-book-description"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  {/* Dynamic Cover Tint Switch & Options */}
                  <div className="pt-4 border-t border-edge-subtle space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          id="label-dynamic-tint"
                          className="text-sm font-semibold text-ink"
                        >
                          {t('settings.dynamicTintLabel')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
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

                    {state.settings.dynamicCoverTint !== false && (
                      <div className="space-y-4 pt-1">
                        <div className="flex items-center justify-between gap-4 pb-3 border-b border-edge-subtle">
                          <div className="min-w-0">
                            <p
                              id="label-dynamic-tint-accent"
                              className="text-xs sm:text-sm font-semibold text-ink"
                            >
                              {t('settings.dynamicTintAccentLabel')}
                            </p>
                            <p className="text-xs text-ink-secondary mt-0.5">
                              {t('settings.dynamicTintAccentHint')}
                            </p>
                          </div>
                          <ToggleSwitch
                            checked={Boolean(state.settings.dynamicCoverTintAccent)}
                            onChange={handleToggleDynamicTintAccent}
                            ariaLabelledBy="label-dynamic-tint-accent"
                            onLabel={t('common.on')}
                            offLabel={t('common.off')}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-semibold text-ink">
                              {t('settings.dynamicTintStyleLabel')}
                            </p>
                            <div className="mt-2 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
                              {[
                                {
                                  id: 'circular' as const,
                                  label: t('settings.dynamicTintStyleCircular'),
                                },
                                {
                                  id: 'linear' as const,
                                  label: t('settings.dynamicTintStyleLinear'),
                                },
                              ].map((item) => {
                                const active =
                                  (state.settings.dynamicCoverTintStyle || 'circular') === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleDynamicTintStyleChange(item.id)}
                                    aria-pressed={active}
                                    className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                      active
                                        ? 'bg-primary text-primary-fg shadow-xs'
                                        : 'text-ink-secondary hover:text-ink'
                                    }`}
                                  >
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-ink">
                              {t('settings.dynamicTintBehaviorLabel')}
                            </p>
                            <div className="mt-2 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
                              {[
                                {
                                  id: 'fixed' as const,
                                  label: t('settings.dynamicTintBehaviorFixed'),
                                },
                                {
                                  id: 'scroll' as const,
                                  label: t('settings.dynamicTintBehaviorScroll'),
                                },
                              ].map((item) => {
                                const active =
                                  (state.settings.dynamicCoverTintBehavior || 'fixed') === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleDynamicTintBehaviorChange(item.id)}
                                    aria-pressed={active}
                                    className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                      active
                                        ? 'bg-primary text-primary-fg shadow-xs'
                                        : 'text-ink-secondary hover:text-ink'
                                    }`}
                                  >
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Cover Color Extraction Mode */}
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            {t('settings.dynamicTintModeLabel')}
                          </p>
                          <p className="text-[11px] text-ink-secondary mt-0.5">
                            Prominent highlights vivid artwork hues; Dominant uses the largest cover field; Soft Tone keeps the wash muted. You can also pick from any cover’s palette in Book Details.
                          </p>
                          <div className="mt-2 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-md">
                            {[
                              {
                                id: 'prominent' as const,
                                label: t('settings.dynamicTintModeProminent'),
                              },
                              {
                                id: 'dominant' as const,
                                label: t('settings.dynamicTintModeDominant'),
                              },
                              {
                                id: 'soft' as const,
                                label: t('settings.dynamicTintModeSoft'),
                              },
                            ].map((item) => {
                              const active =
                                (state.settings.dynamicCoverTintMode || 'prominent') === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  data-tint-mode-option={item.id}
                                  onClick={() => handleDynamicTintModeChange(item.id)}
                                  aria-pressed={active}
                                  className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                    active
                                      ? 'bg-primary text-primary-fg shadow-xs'
                                      : 'text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Independent Fade Distance Controls for Circular vs Linear */}
                        {(state.settings.dynamicCoverTintStyle || 'circular') === 'circular' ? (
                          <div className="rounded-xl bg-surface-subtle/75 border border-edge p-3 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="tint-circular-fade-slider"
                                className="text-xs font-semibold text-ink"
                              >
                                {t('settings.dynamicTintCircularFadeLabel')}
                              </label>
                              <span className="text-xs font-mono-tabular font-semibold text-primary">
                                {state.settings.dynamicCoverTintCircularFade ?? 310}px
                              </span>
                            </div>
                            <input
                              id="tint-circular-fade-slider"
                              type="range"
                              min={180}
                              max={520}
                              step={10}
                              value={state.settings.dynamicCoverTintCircularFade ?? 310}
                              onChange={(e) =>
                                handleDynamicTintCircularFadeChange(Number(e.target.value))
                              }
                              className="w-full accent-primary cursor-pointer"
                            />
                            <div className="flex items-center justify-between gap-1.5">
                              {[
                                { val: 210, label: t('settings.dynamicTintFadeCompact') },
                                { val: 310, label: t('settings.dynamicTintFadeBalanced') },
                                { val: 440, label: t('settings.dynamicTintFadeExtended') },
                              ].map((preset) => (
                                <button
                                  key={preset.val}
                                  type="button"
                                  onClick={() => handleDynamicTintCircularFadeChange(preset.val)}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                                    (state.settings.dynamicCoverTintCircularFade ?? 310) === preset.val
                                      ? 'bg-primary/15 border-primary text-primary'
                                      : 'bg-surface border-edge text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-surface-subtle/75 border border-edge p-3 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor="tint-linear-fade-slider"
                                className="text-xs font-semibold text-ink"
                              >
                                {t('settings.dynamicTintLinearFadeLabel')}
                              </label>
                              <span className="text-xs font-mono-tabular font-semibold text-primary">
                                {state.settings.dynamicCoverTintLinearFade ?? 92}%
                              </span>
                            </div>
                            <input
                              id="tint-linear-fade-slider"
                              type="range"
                              min={35}
                              max={100}
                              step={1}
                              value={state.settings.dynamicCoverTintLinearFade ?? 92}
                              onChange={(e) =>
                                handleDynamicTintLinearFadeChange(Number(e.target.value))
                              }
                              className="w-full accent-primary cursor-pointer"
                            />
                            <div className="flex items-center justify-between gap-1.5">
                              {[
                                { val: 52, label: t('settings.dynamicTintFadeCompact') },
                                { val: 76, label: t('settings.dynamicTintFadeBalanced') },
                                { val: 96, label: t('settings.dynamicTintFadeExtended') },
                              ].map((preset) => (
                                <button
                                  key={preset.val}
                                  type="button"
                                  onClick={() => handleDynamicTintLinearFadeChange(preset.val)}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                                    (state.settings.dynamicCoverTintLinearFade ?? 92) === preset.val
                                      ? 'bg-primary/15 border-primary text-primary'
                                      : 'bg-surface border-edge text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* SUBSECTION 4: CHROME, SIDEBAR ART & PRESET ILLUSTRATIONS */}
              {appearanceTab === 'chrome' && (
                <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-5">
                  {/* Granular Navigation Chrome Controls */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          id="label-translucent-top-bar"
                          className="text-sm font-semibold text-ink"
                        >
                          {t('settings.translucentTopBarLabel')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          {t('settings.translucentTopBarHint')}
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={
                          state.settings.translucentTopBar ??
                          (state.settings.nativeAppStyle !== false)
                        }
                        onChange={handleToggleTranslucentTopBar}
                        ariaLabelledBy="label-translucent-top-bar"
                        dataAction="toggle-translucent-top-bar"
                        onLabel={t('common.on')}
                        offLabel={t('common.off')}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-edge-subtle">
                      <div className="min-w-0">
                        <p
                          id="label-translucent-bottom-bar"
                          className="text-sm font-semibold text-ink"
                        >
                          {t('settings.translucentBottomBarLabel')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          {t('settings.translucentBottomBarHint')}
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={
                          state.settings.translucentBottomBar ??
                          (state.settings.nativeAppStyle !== false)
                        }
                        onChange={handleToggleTranslucentBottomBar}
                        ariaLabelledBy="label-translucent-bottom-bar"
                        dataAction="toggle-translucent-bottom-bar"
                        onLabel={t('common.on')}
                        offLabel={t('common.off')}
                      />
                    </div>

                    <div className="pt-3 border-t border-edge-subtle space-y-2.5">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {t('settings.bottomNavStyleLabel')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          {t('settings.bottomNavStyleHint')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-sm">
                        {(
                          [
                            { id: 'floating' as const, label: t('settings.bottomNavStyleFloating') },
                            { id: 'full' as const, label: t('settings.bottomNavStyleFull') },
                          ]
                        ).map((opt) => {
                          const active = (state.settings.bottomNavStyle || 'floating') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              data-bottom-nav-option={opt.id}
                              onClick={() => handleBottomNavStyleChange(opt.id)}
                              aria-pressed={active}
                              className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                active
                                  ? 'bg-primary text-primary-fg shadow-xs'
                                  : 'text-ink-secondary hover:text-ink'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Artwork Mode, Visual Integration & Divider Style */}
                  {(() => {
                    const selectedSidebarArtwork = resolveSidebarArtworkInfo(
                      state.settings,
                      sidebarArtworkImg
                    );
                    const isDailyRandomArtwork =
                      String(state.settings.sidebarArtworkId || '').trim().toLowerCase() ===
                      DAILY_RANDOM_ARTWORK_ID;
                    const activeMode = state.settings.sidebarArtworkMode || 'theme';
                    const activeArtworkStyle: SidebarArtworkStyle =
                      state.settings.sidebarArtworkStyle === 'natural' ||
                      state.settings.sidebarArtworkStyle === 'muted'
                        ? state.settings.sidebarArtworkStyle
                        : 'integrated';
                    const activeDividerStyle: SidebarDividerStyle = (() => {
                      const raw = String(state.settings.sidebarDividerStyle || '').trim().toLowerCase();
                      if (
                        raw === 'line' ||
                        raw === 'laurel' ||
                        raw === 'folio' ||
                        raw === 'japanese' ||
                        raw === 'minimal' ||
                        raw === 'random'
                      ) {
                        return raw;
                      }
                      return 'laurel';
                    })();
                    const resolvedDividerMotif = resolveActiveDividerVariant(activeDividerStyle);
                    const themeUsesIllustration =
                      effectiveThemeConfig.sidebarArtworkDefault === 'illustration';
                    const illustrationActiveInSidebar =
                      activeMode === 'illustration' ||
                      (activeMode === 'theme' && themeUsesIllustration);

                    return (
                      <div className="pt-4 border-t border-edge-subtle space-y-4">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {t('settings.sidebarArtworkLabel')}
                          </p>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            Choose the theme default, botanical line engraving, any frameless illustration, or hide sidebar artwork.
                          </p>
                        </div>

                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-lg">
                          {[
                            { id: 'theme' as const, label: t('settings.sidebarArtworkTheme') },
                            { id: 'engraving' as const, label: t('settings.sidebarArtworkEngraving') },
                            { id: 'illustration' as const, label: t('settings.sidebarArtworkIllustration') },
                            { id: 'none' as const, label: t('settings.sidebarArtworkNone') },
                          ].map((item) => {
                            const active = activeMode === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                data-sidebar-artwork-option={item.id}
                                onClick={() => handleSidebarArtworkChange(item.id)}
                                aria-pressed={active}
                                className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                  active
                                    ? 'bg-primary text-primary-fg shadow-xs'
                                    : 'text-ink-secondary hover:text-ink'
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>

                        {activeMode !== 'none' && (
                          <>
                            <div>
                              <p className="text-xs font-semibold text-ink">
                                {t('settings.sidebarArtworkStyleLabel')}
                              </p>
                              <div className="mt-2 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-md">
                                {[
                                  {
                                    id: 'integrated' as const,
                                    label: t('settings.sidebarArtworkStyleIntegrated'),
                                  },
                                  {
                                    id: 'natural' as const,
                                    label: t('settings.sidebarArtworkStyleNatural'),
                                  },
                                  {
                                    id: 'muted' as const,
                                    label: t('settings.sidebarArtworkStyleMuted'),
                                  },
                                ].map((item) => {
                                  const active = activeArtworkStyle === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => handleSidebarArtworkStyleChange(item.id)}
                                      aria-pressed={active}
                                      className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                        active
                                          ? 'bg-primary text-primary-fg shadow-xs'
                                          : 'text-ink-secondary hover:text-ink'
                                      }`}
                                    >
                                      {item.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-xl bg-surface-subtle/75 border border-edge p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative w-20 aspect-[4/3] rounded-lg overflow-hidden flex items-center justify-center p-1.5 shrink-0 bg-sidebar">
                                  {activeArtworkStyle !== 'natural' && (
                                    <div
                                      className="lr-sidebar-artwork-halo pointer-events-none absolute inset-1 rounded-full"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <img
                                    src={selectedSidebarArtwork.src}
                                    alt={selectedSidebarArtwork.label}
                                    className={`relative z-10 w-full h-full ${
                                      selectedSidebarArtwork.isTransparent
                                        ? 'object-contain'
                                        : 'object-cover lr-sidebar-artwork-mask'
                                    } ${
                                      activeArtworkStyle === 'integrated'
                                        ? 'lr-sidebar-artwork-integrated'
                                        : activeArtworkStyle === 'muted'
                                          ? 'lr-sidebar-artwork-muted'
                                          : ''
                                    }`}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-xs font-semibold text-ink truncate">
                                      {selectedSidebarArtwork.label}
                                    </p>
                                    <span
                                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                        illustrationActiveInSidebar
                                          ? 'bg-primary/15 text-primary'
                                          : 'bg-surface border border-edge text-ink-muted'
                                      }`}
                                    >
                                      {isDailyRandomArtwork && illustrationActiveInSidebar
                                        ? t('settings.sidebarArtworkRandom')
                                        : illustrationActiveInSidebar
                                          ? 'Shown in Sidebar'
                                          : 'Engraving Active'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-ink-secondary line-clamp-1 mt-0.5">
                                    {selectedSidebarArtwork.subject}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  data-action="toggle-sidebar-artwork-daily-random"
                                  onClick={() =>
                                    store.updateSettings({
                                      sidebarArtworkMode: 'illustration',
                                      sidebarArtworkId: isDailyRandomArtwork
                                        ? DEFAULT_SIDEBAR_ARTWORK_ID
                                        : DAILY_RANDOM_ARTWORK_ID,
                                    })
                                  }
                                  aria-pressed={isDailyRandomArtwork}
                                  className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                                    isDailyRandomArtwork
                                      ? 'bg-primary text-primary-fg border-primary shadow-xs'
                                      : 'bg-surface hover:bg-surface-elevated border-edge text-ink'
                                  }`}
                                >
                                  <Icon name="shuffle" className="w-3.5 h-3.5" />
                                  <span>{t('settings.sidebarArtworkRandom')}</span>
                                </button>
                                <button
                                  type="button"
                                  data-action="open-sidebar-artwork-picker"
                                  onClick={() => setIsSidebarArtworkPickerOpen(true)}
                                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                                >
                                  <Icon name="image" className="w-3.5 h-3.5 text-primary" />
                                  <span>Browse Illustrations</span>
                                </button>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Reader Card Separator Style */}
                        <div className="pt-2 border-t border-edge-subtle/70">
                          <p className="text-xs font-semibold text-ink">
                            {t('settings.sidebarDividerLabel')}
                          </p>
                          <p className="text-[11px] text-ink-secondary mt-0.5">
                            Choose a botanical branch, Japanese sakura crest, open folio, hairline rule, or daily random ornament (also clickable directly in the sidebar).
                          </p>
                          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              {
                                id: 'laurel' as const,
                                label: t('settings.sidebarDividerLaurel'),
                                motif: 'laurel' as const,
                              },
                              {
                                id: 'japanese' as const,
                                label: t('settings.sidebarDividerJapanese'),
                                motif: 'japanese' as const,
                              },
                              {
                                id: 'folio' as const,
                                label: t('settings.sidebarDividerFolio'),
                                motif: 'folio' as const,
                              },
                              {
                                id: 'minimal' as const,
                                label: t('settings.sidebarDividerMinimal'),
                                motif: 'minimal' as const,
                              },
                              {
                                id: 'line' as const,
                                label: t('settings.sidebarDividerLine'),
                                motif: null,
                              },
                              {
                                id: 'random' as const,
                                label: t('settings.sidebarDividerRandom'),
                                motif: 'random' as const,
                              },
                            ].map((item) => {
                              const active = activeDividerStyle === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  data-sidebar-divider-option={item.id}
                                  onClick={() => handleSidebarDividerStyleChange(item.id)}
                                  aria-pressed={active}
                                  className={`min-h-[58px] px-2.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                                    active
                                      ? 'bg-primary/10 border-primary text-ink ring-1 ring-primary/35'
                                      : 'bg-surface-subtle/75 hover:bg-surface-elevated border-edge text-ink-secondary hover:text-ink'
                                  }`}
                                >
                                  {item.motif === 'random' ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                                      <Icon name="shuffle" className="w-3.5 h-3.5" />
                                      <span>
                                        {resolvedDividerMotif === 'line'
                                          ? 'Daily'
                                          : `Today: ${resolvedDividerMotif}`}
                                      </span>
                                    </span>
                                  ) : item.motif === null ? (
                                    <span className="block w-20 h-px bg-edge my-1.5" aria-hidden="true" />
                                  ) : (
                                    <BotanicalIllustration
                                      variant="sidebar-divider"
                                      dividerStyle={item.motif}
                                      className="w-28 h-4"
                                    />
                                  )}
                                  <span className="text-[11px] font-semibold leading-tight">
                                    {item.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Corner Decorations Switch & Prompt Template */}
                  <div className="pt-4 border-t border-edge-subtle space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p
                          id="label-corner-decorations"
                          className="text-sm font-semibold text-ink"
                        >
                          Preset Corner Illustrations
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          Show soft watercolor corner artwork on rotation preset cards, or fall back to
                          clean vector icons when off.
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

                    {state.settings.showPresetDecorations !== false && (
                      <div>
                        <p className="text-xs font-semibold text-ink">
                          {t('settings.presetArtSizeLabel')}
                        </p>
                        <p className="text-[11px] text-ink-secondary mt-0.5">
                          Adjust the size of top-right corner illustrations on Collections cards.
                        </p>
                        <div className="mt-2 flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge max-w-xs">
                          {[
                            { id: 'sm' as const, label: t('settings.presetArtSmall') },
                            { id: 'md' as const, label: t('settings.presetArtMedium') },
                            { id: 'lg' as const, label: t('settings.presetArtLarge') },
                          ].map((item) => {
                            const active = (state.settings.presetCornerArtSize || 'sm') === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handlePresetCornerArtSizeChange(item.id)}
                                aria-pressed={active}
                                className={`flex-1 min-h-[38px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                                  active
                                    ? 'bg-primary text-primary-fg shadow-xs'
                                    : 'text-ink-secondary hover:text-ink'
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <form
                      onSubmit={handleSavePresetPrompt}
                      className="rounded-lg bg-surface-subtle border border-edge p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="setting-preset-prompt-template"
                          className="text-xs font-semibold uppercase tracking-wider text-ink"
                        >
                          Preset Illustration AI Prompt Template
                        </label>
                        <span className="text-[10px] font-mono-tabular text-ink-muted">
                          Reusable style guide
                        </span>
                      </div>
                      <textarea
                        id="setting-preset-prompt-template"
                        rows={3}
                        value={presetPromptDraft}
                        onChange={(e) => setPresetPromptDraft(e.target.value)}
                        placeholder={DEFAULT_PRESET_ILLUSTRATION_PROMPT}
                        className="w-full px-3 py-2 rounded-lg bg-canvas border border-edge text-xs text-ink placeholder:text-ink-muted leading-relaxed focus:outline-2 focus:outline-primary"
                      />
                      <p className="text-[11px] text-ink-secondary leading-relaxed">
                        Prefilled automatically when creating or customizing preset corner art, or passed to
                        Gemini when generating illustrations.
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={handleResetPresetPrompt}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-edge hover:bg-surface-elevated text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
                        >
                          Reset Default Prompt
                        </button>
                        <button
                          type="submit"
                          className="min-h-[38px] px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Save Prompt Template
                        </button>
                      </div>
                    </form>
                  </div>
                </section>
              )}
            </>
          );
        }

        case 'language':
          return (
            <>
              <SettingsSubViewHeader
                title={t('settings.languageLabel')}
                subtitle={t('settings.languageHint')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Clean stacked vertical list of languages without flag icons */}
              <section
                role="radiogroup"
                aria-label={t('settings.languageLabel')}
                className="rounded-xl bg-surface border border-edge divide-y divide-edge-subtle overflow-hidden shadow-xs"
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
                          ? 'bg-surface-elevated/70'
                          : 'hover:bg-surface-subtle'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <span
                          aria-hidden="true"
                          className="text-xs font-bold font-mono-tabular uppercase tracking-wider text-primary leading-none select-none w-9 h-9 rounded-lg bg-surface-subtle border border-edge-subtle flex items-center justify-center shrink-0"
                        >
                          {opt.code}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-ink">
                            {opt.nativeLabel}
                          </p>
                          <p className="text-xs text-ink-secondary">
                            {opt.label}
                          </p>
                        </div>
                      </div>

                      <span
                        aria-hidden="true"
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-primary text-primary-fg'
                            : 'border-2 border-edge'
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
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="preset-reminders-heading"
                      className="font-display text-lg font-semibold text-ink"
                    >
                      {t('settings.presetRemindersHeading')}
                    </h2>
                    <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                      {t('settings.presetRemindersDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('presets')}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    {t('settings.openPresets')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Days Before */}
                  <div className="rounded-lg bg-surface-subtle border border-edge p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor="setting-preset-days-before"
                            className="text-xs font-semibold text-ink"
                          >
                            {t('settings.presetDaysBeforeLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleHelp('presetDaysBefore')}
                            aria-label="Info on reminder advance days"
                            className="w-5 h-5 rounded-full bg-surface-elevated text-[11px] font-bold text-ink-secondary flex items-center justify-center hover:text-ink cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <span className="block text-[11px] text-ink-secondary mt-0.5">
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
                        className="w-20 h-11 px-2.5 rounded-lg bg-canvas border border-edge text-sm font-mono-tabular text-center font-semibold text-ink focus:outline-2 focus:outline-primary shrink-0"
                      />
                    </div>
                    {openHelpKeys['presetDaysBefore'] && (
                      <div className="p-2.5 rounded-lg bg-surface-elevated text-xs text-ink-secondary border border-edge">
                        <p className="font-semibold text-ink mb-0.5">
                          {FIELD_HELP_COPY.presetDaysBefore.title}
                        </p>
                        <p>{FIELD_HELP_COPY.presetDaysBefore.body}</p>
                      </div>
                    )}
                  </div>

                  {/* Days After */}
                  <div className="rounded-lg bg-surface-subtle border border-edge p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor="setting-preset-days-after"
                            className="text-xs font-semibold text-ink"
                          >
                            {t('settings.presetDaysAfterLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleHelp('presetDaysAfter')}
                            aria-label="Info on unactioned reminder duration"
                            className="w-5 h-5 rounded-full bg-surface-elevated text-[11px] font-bold text-ink-secondary flex items-center justify-center hover:text-ink cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <span className="block text-[11px] text-ink-secondary mt-0.5">
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
                        className="w-20 h-11 px-2.5 rounded-lg bg-canvas border border-edge text-sm font-mono-tabular text-center font-semibold text-ink focus:outline-2 focus:outline-primary shrink-0"
                      />
                    </div>
                    {openHelpKeys['presetDaysAfter'] && (
                      <div className="p-2.5 rounded-lg bg-surface-elevated text-xs text-ink-secondary border border-edge">
                        <p className="font-semibold text-ink mb-0.5">
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
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5"
              >
                <div>
                  <h2
                    id="freshness-spotlight-heading"
                    className="font-display text-lg font-semibold text-ink"
                  >
                    {t('settings.freshnessHeading')}
                  </h2>
                  <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                    {t('settings.freshnessDesc')}
                  </p>
                </div>

                <div className="divide-y divide-edge-subtle">
                  {/* Rotation History Insights */}
                  <div className="py-3 first:pt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-rotation-history"
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.rotationHistoryHeading')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
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
                            className="text-sm font-semibold text-ink"
                          >
                            {t('settings.coverAdornosHeading')}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleHelp('coverUsageAdornos')}
                            aria-label="Info on cover badges"
                            className="w-5 h-5 rounded-full bg-surface-elevated text-[11px] font-bold text-ink-secondary flex items-center justify-center hover:text-ink cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <p className="text-xs text-ink-secondary mt-0.5">
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
                      <div className="p-2.5 rounded-lg bg-surface-elevated text-xs text-ink-secondary border border-edge">
                        <p className="font-semibold text-ink mb-0.5">
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
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.staleSpotlightHeading')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
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
                            className="text-xs sm:text-sm font-semibold text-ink"
                          >
                            {t('settings.staleDaysLabel')}
                          </label>
                          <button
                            type="button"
                            onClick={() => toggleHelp('staleBookDays')}
                            aria-label="Info on stale book days"
                            className="w-5 h-5 rounded-full bg-surface-elevated text-[11px] font-bold text-ink-secondary flex items-center justify-center hover:text-ink cursor-pointer"
                          >
                            i
                          </button>
                        </div>
                        <span className="block text-[11px] text-ink-secondary mt-0.5">
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
                        className="w-20 h-11 px-2.5 rounded-lg bg-canvas border border-edge disabled:opacity-50 text-sm font-mono-tabular text-center font-semibold text-ink focus:outline-2 focus:outline-primary shrink-0"
                      />
                    </div>
                    {openHelpKeys['staleBookDays'] && (
                      <div className="p-2.5 rounded-lg bg-surface-elevated text-xs text-ink-secondary border border-edge">
                        <p className="font-semibold text-ink mb-0.5">
                          {FIELD_HELP_COPY.staleBookDays.title}
                        </p>
                        <p>{FIELD_HELP_COPY.staleBookDays.body}</p>
                      </div>
                    )}
                  </div>

                  {/* Guided Creation Mini-Wizards Toggle */}
                  <div className="pt-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-mini-wizards"
                        className="text-sm font-semibold text-ink"
                      >
                        Guided Creation Mini-Wizards
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        Show optional step-by-step guidance when adding new children or building new shelf rotations.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={state.settings.showMiniWizards !== false}
                      onChange={() =>
                        store.updateSettings({
                          showMiniWizards: state.settings.showMiniWizards === false,
                        })
                      }
                      ariaLabelledBy="label-mini-wizards"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
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

              <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs">
                <div className="divide-y divide-edge-subtle">
                  {/* Provider 1: Google Books */}
                  <div className="py-3 first:pt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        id="label-provider-google"
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.googleBooksProviderTitle')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
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
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.openLibraryProviderTitle')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
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
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.retainRawTitle')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
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
                        className="text-sm font-semibold text-ink"
                      >
                        {t('settings.searchWhileTypingTitle')}
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
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
                        <p className="text-sm font-semibold text-ink">
                          {t('settings.googleQuotaTitle')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          {t('settings.googleQuotaDesc')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleVerifyGoogleBooks(false)}
                        disabled={checkingGoogle}
                        className={`min-h-[44px] px-3.5 py-2 rounded-lg disabled:opacity-60 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          googleTone === 'success'
                            ? 'bg-secondary/15 hover:bg-secondary/25 text-ink border border-secondary/45'
                            : googleTone === 'error'
                              ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/35'
                              : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
                        }`}
                      >
                        {checkingGoogle ? (
                          <Icon name="activity" className="w-3.5 h-3.5 animate-spin" />
                        ) : googleTone === 'success' ? (
                          <span className="inline-flex text-primary dark:text-secondary">
                            <Icon name="check" className="w-3.5 h-3.5" />
                          </span>
                        ) : googleTone === 'error' ? (
                          <span className="inline-flex text-danger">
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
                        className={`rounded-lg px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium leading-relaxed ${
                          googleTone === 'error'
                            ? 'bg-danger/10 border border-danger/35 text-danger'
                            : 'bg-secondary/12 border border-secondary/35 text-ink'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 ${
                            googleTone === 'error'
                              ? 'bg-danger-solid text-danger-solid-fg'
                              : 'bg-primary text-primary-fg'
                          }`}
                        >
                          <Icon name={googleTone === 'error' ? 'close' : 'check'} className="w-3 h-3" />
                        </span>
                        <span className="min-w-0 break-words">{googleReport}</span>
                      </div>
                    )}

                    {proxyUrl ? (
                      <div className="rounded-lg bg-surface-subtle border border-primary/35 px-3.5 py-3 flex items-start gap-2.5">
                        <span className="mt-0.5 text-primary shrink-0">
                          <Icon name="shield" className="w-4 h-4" />
                        </span>
                        <div className="text-xs leading-relaxed min-w-0">
                          <p className="font-semibold text-primary">
                            {t('settings.deviceProxyActiveTitle')}
                          </p>
                          <p className="text-ink-secondary mt-0.5 break-all">
                            {t('settings.deviceProxyActiveDesc', { url: proxyUrl })}
                          </p>
                        </div>
                      </div>
                    ) : googleKeyStatus === 'configured' ? (
                      <div className="rounded-lg bg-surface-subtle border border-primary/35 px-3.5 py-3 flex items-start gap-2.5">
                        <span className="mt-0.5 text-primary shrink-0">
                          <Icon name="shield" className="w-4 h-4" />
                        </span>
                        <div className="text-xs leading-relaxed">
                          <p className="font-semibold text-primary">
                            {t('settings.serverKeyConfiguredTitle')}
                          </p>
                          <p className="text-ink-secondary mt-0.5">
                            {t('settings.serverKeyConfiguredDesc')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg bg-surface-subtle border border-edge px-3.5 py-3 flex items-start gap-2.5">
                        <span className="mt-0.5 text-primary shrink-0">
                          <Icon name="shield" className="w-4 h-4" />
                        </span>
                        <div className="text-xs leading-relaxed">
                          <p className="font-semibold text-ink">
                            {t('settings.safeQuotaGeneralTitle')}
                          </p>
                          <p className="text-ink-secondary mt-0.5">
                            {t('settings.safeQuotaGeneralDesc')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Live Query Usage & Limits Monitor Link */}
                    <div className="rounded-lg bg-surface-subtle border border-edge px-3.5 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <span className="font-semibold text-ink">
                          Today's Google Books calls: <strong className="font-mono-tabular">{queryLogger.getDailyCount('google-books')} / {queryLogger.getServiceQuota('google-books').limit}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openSection('query-usage')}
                        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Query Monitor</span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Collapsible Advanced Device Proxy Disclosure */}
                    <details className="group rounded-lg bg-surface-subtle border border-edge px-3.5 py-2.5">
                      <summary className="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-primary">
                        <span>{t('settings.advancedProxySummary')}</span>
                        <span className="text-ink-secondary transition-transform group-open:rotate-180">
                          <Icon name="chevronDown" className="w-4 h-4" />
                        </span>
                      </summary>

                      <form
                        onSubmit={handleSaveProxyUrl}
                        className="pt-3 mt-2 border-t border-edge-subtle space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                          <div className="flex-1 min-w-0">
                            <label
                              htmlFor="device-books-proxy-url-input"
                              className="block text-xs font-semibold text-ink mb-1"
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
                                className="w-full h-11 pl-3.5 pr-9 rounded-lg bg-canvas border border-edge text-base sm:text-xs font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                              />
                              {proxyUrl && (
                                <button
                                  type="button"
                                  onClick={() => setProxyUrl('')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink"
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
                              className="h-11 px-4 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-fg text-xs font-semibold transition-colors whitespace-nowrap shadow-xs cursor-pointer"
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
                                className="h-11 px-3 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink-secondary hover:text-ink transition-colors whitespace-nowrap cursor-pointer"
                              >
                                {t('common.clear')}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-ink-secondary leading-relaxed">
                          {t('settings.proxyAutoCheckHint')}
                          <a
                            href={APP_DOCS_LINKS.cloudflareWorkerGuide}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-primary underline underline-offset-2 ml-1 whitespace-nowrap"
                          >
                            {t('settings.cloudflareGuideLinkText')}
                          </a>
                        </p>
                        {proxyError && (
                          <div
                            role="alert"
                            className="rounded-lg bg-danger/10 border border-danger/35 px-3 py-2 text-xs font-medium text-danger"
                          >
                            {proxyError}
                          </div>
                        )}
                      </form>
                    </details>

                    {/* Collapsible Google Books Key Guide */}
                    <details className="group rounded-lg bg-surface-subtle border border-edge px-3.5 py-2.5">
                      <summary className="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-primary">
                        <span>{t('settings.googleGuideSummary')}</span>
                        <span className="text-ink-secondary transition-transform group-open:rotate-180">
                          <Icon name="chevronDown" className="w-4 h-4" />
                        </span>
                      </summary>
                      <div className="pt-2.5 mt-2 border-t border-edge-subtle space-y-2 text-xs text-ink-secondary leading-relaxed">
                        <p>
                          <strong className="text-ink">
                            {t('settings.googleGuideStep1')}
                          </strong>{' '}
                          In{' '}
                          <a
                            href={GOOGLE_CLOUD_CONSOLE_CREDENTIALS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-primary underline underline-offset-2"
                          >
                            Google Cloud Console
                          </a>{' '}
                          &rarr; <strong>APIs &amp; Services &rarr; Library</strong>, enable{' '}
                          <strong>Books API</strong>, create credentials, and restrict them to{' '}
                          <strong>Books API</strong>.
                        </p>
                        <p>
                          <strong className="text-ink">
                            {t('settings.googleGuideStep2')}
                          </strong>{' '}
                          Set <code>GOOGLE_BOOKS_API_KEY=your_secret_here</code> in server environment
                          variables or local <code>.env</code>.
                        </p>
                        <p>
                          <strong className="text-ink">
                            {t('settings.googleGuideStep3')}
                          </strong>{' '}
                          Or create a free Cloudflare Worker, paste the CORS proxy script below, set
                          encrypted variable <code>GOOGLE_BOOKS_API_KEY</code>, and paste your Worker
                          URL above:
                        </p>
                        <div className="relative group/code">
                          <pre className="p-2.5 rounded-lg bg-code text-code-ink border border-code-edge font-mono-tabular text-[11px] overflow-x-auto">
                            {GOOGLE_BOOKS_WORKER_SAMPLE_SCRIPT}
                          </pre>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(GOOGLE_BOOKS_WORKER_SAMPLE_SCRIPT, 'books')}
                            className="absolute top-2 right-2 px-2 py-1 rounded bg-code-surface hover:bg-code-surface-hover text-code-ink text-[10px] font-semibold transition-colors cursor-pointer"
                          >
                            {copiedBooksScript ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="pt-1 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsWelcomeModalOpen(true)}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
                          >
                            {t('settings.openWelcomeModalBtn')}
                          </button>
                          <a
                            href={APP_DOCS_LINKS.cloudflareWorkerGuide}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-primary underline underline-offset-2"
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
                        <p className="text-sm font-semibold text-ink">
                          {t('settings.syncLibraryTitle')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                          {t('settings.syncLibraryDesc', {
                            needed: booksNeedingGoogleSyncCount,
                            total: state.books.length,
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSyncLibraryMetadata(false)}
                          disabled={syncingCatalog || state.books.length === 0}
                          className="min-h-[44px] px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
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
                        {state.books.length > 0 &&
                          booksNeedingGoogleSyncCount < state.books.length && (
                            <button
                              type="button"
                              onClick={() => handleSyncLibraryMetadata(true)}
                              disabled={syncingCatalog}
                              className="min-h-[44px] px-3 py-2 rounded-lg bg-surface hover:bg-surface-elevated border border-edge disabled:opacity-60 text-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <span>
                                {t('settings.syncLibraryAllBtn', { total: state.books.length })}
                              </span>
                            </button>
                          )}
                      </div>
                    </div>

                    {catalogSyncReport && (
                      <div
                        role={catalogSyncTone === 'error' ? 'alert' : 'status'}
                        className={`rounded-lg px-3.5 py-2.5 flex items-start gap-2.5 text-xs font-medium leading-relaxed ${
                          catalogSyncTone === 'error'
                            ? 'bg-danger/10 border border-danger/35 text-danger'
                            : 'bg-secondary/12 border border-secondary/35 text-ink'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 ${
                            catalogSyncTone === 'error'
                              ? 'bg-danger-solid text-danger-solid-fg'
                              : 'bg-primary text-primary-fg'
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

              {/* Gift or Buy a Copy — Bookstore Links Configuration */}
              <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink">
                    Gift &amp; Bookstore Links
                  </h3>
                  <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                    Choose which bookstores appear in “Gift or Buy a Copy” on each book detail page.
                  </p>
                </div>

                <div className="divide-y divide-edge-subtle">
                  <div className="py-3 first:pt-1 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p id="label-gift-bookshop" className="text-sm font-semibold text-ink">
                        Bookshop.org
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5">
                        Supports local independent bookstores via title or ISBN search.
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={(state.settings.enabledGiftStores ?? ['bookshop', 'amazon']).includes('bookshop')}
                      onChange={() => handleToggleGiftStore('bookshop')}
                      ariaLabelledBy="label-gift-bookshop"
                      onLabel={t('common.on')}
                      offLabel={t('common.off')}
                    />
                  </div>

                  <div className="py-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p id="label-gift-amazon" className="text-sm font-semibold text-ink">
                          Amazon
                        </p>
                        <p className="text-xs text-ink-secondary mt-0.5">
                          Quick gift link using your preferred regional Amazon storefront.
                        </p>
                      </div>
                      <ToggleSwitch
                        checked={(state.settings.enabledGiftStores ?? ['bookshop', 'amazon']).includes('amazon')}
                        onChange={() => handleToggleGiftStore('amazon')}
                        ariaLabelledBy="label-gift-amazon"
                        onLabel={t('common.on')}
                        offLabel={t('common.off')}
                      />
                    </div>

                    {(state.settings.enabledGiftStores ?? ['bookshop', 'amazon']).includes('amazon') && (
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <label
                          htmlFor="setting-amazon-domain"
                          className="text-xs font-semibold text-ink-secondary"
                        >
                          Amazon storefront
                        </label>
                        <select
                          id="setting-amazon-domain"
                          value={state.settings.amazonDomain || 'amazon.com'}
                          onChange={(e) => handleAmazonDomainChange(e.target.value)}
                          className="h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-medium text-ink focus:outline-2 focus:outline-primary"
                        >
                          <option value="amazon.com">amazon.com (US)</option>
                          <option value="amazon.co.uk">amazon.co.uk (UK)</option>
                          <option value="amazon.es">amazon.es (ES)</option>
                          <option value="amazon.it">amazon.it (IT)</option>
                          <option value="amazon.de">amazon.de (DE)</option>
                          <option value="amazon.fr">amazon.fr (FR)</option>
                          <option value="amazon.ca">amazon.ca (CA)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSaveCustomGiftStore} className="pt-3 space-y-2.5">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        Custom or Local Bookstore (Optional)
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
                        Add any shop search URL. Use <code className="font-mono-tabular">{'{query}'}</code> where the ISBN or title should go, or leave a base search URL.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        aria-label="Custom bookstore name"
                        value={customStoreNameDraft}
                        onChange={(e) => setCustomStoreNameDraft(e.target.value)}
                        placeholder="e.g. Powell's Books"
                        className="h-10 px-3 rounded-lg bg-surface-subtle border border-edge text-xs text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-primary"
                      />
                      <input
                        type="url"
                        aria-label="Custom bookstore search URL"
                        value={customStoreUrlDraft}
                        onChange={(e) => setCustomStoreUrlDraft(e.target.value)}
                        placeholder="https://example.com/search?q={query}"
                        className="h-10 px-3 rounded-lg bg-surface-subtle border border-edge text-xs font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-primary"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="min-h-[38px] px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Save Storefront
                      </button>
                    </div>
                  </form>
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
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-3 border-b border-edge-subtle">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <Icon name="sparkles" className="w-4 h-4" />
                      </span>
                      <h2
                        id="llm-connection-heading"
                        className="font-display text-lg font-semibold text-ink"
                      >
                        AI Assistant &amp; Free LLM
                      </h2>
                    </div>
                    <p className="text-xs text-ink-secondary mt-1">
                      Powers categorized book tagging (interactive formats &amp; themes), Smart Shelf
                      Rotations, and Library Gap Recommendations.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary shrink-0">
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
                    <label className="block text-xs font-semibold text-ink mb-2">
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
                            className={`cursor-pointer rounded-lg p-3 border transition-colors flex flex-col justify-between ${
                              isSelected
                                ? 'bg-surface-elevated border-primary shadow-2xs'
                                : 'bg-surface-subtle border-edge hover:border-primary/50'
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
                                  className="accent-primary h-4 w-4"
                                />
                                <span className="text-xs font-semibold text-ink">
                                  {p.title}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-semibold shrink-0 ${
                                  isSelected
                                    ? 'text-primary'
                                    : 'text-ink-muted'
                                }`}
                              >
                                {p.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-secondary mt-1.5 leading-relaxed">
                              {p.desc}
                            </p>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {selectedLlmProvider === 'cloudflare-worker' && (
                    <div className="rounded-lg bg-surface-subtle border border-edge p-3.5 space-y-3">
                      <div>
                        <label
                          htmlFor="llm-cloudflare-url-input"
                          className="block text-xs font-semibold text-ink mb-1"
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
                            className="w-full h-11 pl-3.5 pr-9 rounded-lg bg-canvas border border-edge text-base sm:text-xs font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                          />
                          {llmCloudflareUrl && (
                            <button
                              type="button"
                              onClick={() => setLlmCloudflareUrl('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink"
                            >
                              <Icon name="close" className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-secondary mt-1">
                          Your worker receives the prompt and calls the Gemini API server-side using
                          your personal quota.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedLlmProvider === 'byok-openai' && (
                    <div className="rounded-lg bg-surface-subtle border border-edge p-3.5 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="llm-base-url-input"
                            className="block text-xs font-semibold text-ink mb-1"
                          >
                            Endpoint Base URL
                          </label>
                          <input
                            id="llm-base-url-input"
                            type="url"
                            value={llmBaseUrl}
                            onChange={(e) => setLlmBaseUrl(e.target.value)}
                            placeholder="https://api.groq.com/openai/v1 or http://localhost:11434/v1"
                            className="w-full h-11 px-3.5 rounded-lg bg-canvas border border-edge text-base sm:text-xs font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="llm-openai-model-input"
                            className="block text-xs font-semibold text-ink mb-1"
                          >
                            Model Name
                          </label>
                          <input
                            id="llm-openai-model-input"
                            type="text"
                            value={llmModel}
                            onChange={(e) => setLlmModel(e.target.value)}
                            placeholder="llama-3.3-70b-versatile or mistral-small-latest"
                            className="w-full h-11 px-3.5 rounded-lg bg-canvas border border-edge text-base sm:text-xs font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedLlmProvider === 'byok-gemini' ||
                    selectedLlmProvider === 'byok-openai' ||
                    selectedLlmProvider === 'cloudflare-worker') && (
                    <div className="rounded-lg bg-surface-subtle border border-edge p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="llm-api-key-input"
                          className="text-xs font-semibold text-ink"
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
                          className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
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
                        className="w-full h-11 px-3.5 rounded-lg bg-canvas border border-edge text-base sm:text-xs font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                      />
                      <p className="text-[11px] text-ink-secondary">
                        Stored locally in browser storage. Never logged or sent to third-party trackers.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedLlmProvider !== 'byok-openai' && (
                      <div>
                        <label
                          htmlFor="llm-model-select"
                          className="block text-xs font-semibold text-ink mb-1"
                        >
                          Gemini Model
                        </label>
                        <select
                          id="llm-model-select"
                          value={llmModel}
                          onChange={(e) => setLlmModel(e.target.value)}
                          className="w-full h-11 px-3 rounded-lg bg-canvas border border-edge text-xs font-semibold text-ink focus:outline-2 focus:outline-primary"
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
                        className="block text-xs font-semibold text-ink mb-1"
                      >
                        Parenting / Library Focus (Optional)
                      </label>
                      <input
                        id="llm-custom-hint-input"
                        type="text"
                        value={llmCustomPromptHint}
                        onChange={(e) => setLlmCustomPromptHint(e.target.value)}
                        placeholder="e.g. Montessori, hands-on sensory, Spanish bilingual, STEM"
                        className="w-full h-11 px-3.5 rounded-lg bg-canvas border border-edge text-base sm:text-xs text-ink focus:outline-2 focus:outline-primary"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle">
                    <button
                      type="button"
                      onClick={handleTestLlm}
                      disabled={testingLlm}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge disabled:opacity-50 text-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Icon
                        name="activity"
                        className={testingLlm ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'}
                      />
                      <span>{testingLlm ? 'Testing…' : 'Test Connection'}</span>
                    </button>

                    <button
                      type="submit"
                      className="min-h-[44px] px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                    >
                      <Icon name="check" className="w-4 h-4" />
                      <span>Save AI Settings</span>
                    </button>
                  </div>

                  {llmReport && (
                    <div
                      role="status"
                      className={`rounded-lg px-3.5 py-2.5 text-xs font-medium flex items-start gap-2 ${
                        llmTone === 'error'
                          ? 'bg-danger/10 text-danger border border-danger/35'
                          : 'bg-secondary/12 text-ink border border-secondary/35'
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
                <details className="group rounded-lg bg-surface-subtle border border-edge px-3.5 py-2.5">
                  <summary className="cursor-pointer list-none min-h-[36px] flex items-center justify-between gap-2 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-primary">
                    <span>How to set up a free Cloudflare Worker for Gemini API (Copy-Paste Script)</span>
                    <span className="text-ink-secondary transition-transform group-open:rotate-180">
                      <Icon name="chevronDown" className="w-4 h-4" />
                    </span>
                  </summary>

                  <div className="pt-2.5 mt-2 border-t border-edge-subtle space-y-2.5 text-xs text-ink-secondary leading-relaxed">
                    <p>
                      A Cloudflare Worker acts as your own private gateway to the Google Gemini API
                      with unlimited free monthly requests on Cloudflare’s free tier.
                    </p>
                    <ol className="list-decimal list-inside space-y-1 font-medium text-ink">
                      <li>
                        Log in to{' '}
                        <a
                          href="https://dash.cloudflare.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline"
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
                      <pre className="p-3 rounded-lg bg-code text-code-ink border border-code-edge font-mono-tabular text-[11px] overflow-x-auto leading-relaxed">
                        {CLOUDFLARE_WORKER_SAMPLE_SCRIPT}
                      </pre>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(CLOUDFLARE_WORKER_SAMPLE_SCRIPT, 'llm')}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded bg-code-surface hover:bg-code-surface-hover text-code-ink text-[10px] font-semibold transition-colors cursor-pointer"
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

                <div className="rounded-lg bg-surface-subtle border border-edge p-3 flex items-start gap-2.5">
                  <span className="text-primary mt-0.5 shrink-0">
                    <Icon name="shield" className="w-4 h-4" />
                  </span>
                  <div className="text-[11px] text-ink-secondary space-y-0.5 leading-relaxed">
                    <p className="font-semibold text-ink">
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
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-edge-subtle">
                  <div>
                    <h2
                      id="tagging-providers-heading"
                      className="font-display text-lg font-semibold text-ink"
                    >
                      {t('settings.taggingHeading')}
                    </h2>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {t('settings.taggingDesc')}
                    </p>
                  </div>
                  <span className="text-xs text-ink-secondary whitespace-nowrap">
                    {t('settings.modeLabel')}:{' '}
                    <strong className="font-semibold text-ink">
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
                      className="text-sm font-semibold text-ink"
                    >
                      {t('settings.autoTaggingTitle')}
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
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

                {/* Heuristic Age Range Inference Switch */}
                <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-auto-infer-age"
                      className="text-sm font-semibold text-ink"
                    >
                      {t('settings.autoInferAgeTitle')}
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {t('settings.autoInferAgeDesc')}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(state.settings.autoInferAgeRange)}
                    onChange={handleToggleAutoInferAgeRange}
                    ariaLabelledBy="label-auto-infer-age"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>

                {/* AI Tag Enrichment Opt-In Switch */}
                <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-ai-opt-in"
                      className="text-sm font-semibold text-ink"
                    >
                      {t('settings.aiOptInTitle')}
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
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
                <div className="pt-3 border-t border-edge-subtle">
                  <p className="text-xs font-semibold text-ink">
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
                          className={`text-left rounded-lg p-3.5 border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-surface-elevated border-primary'
                              : 'bg-surface-subtle border-edge hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs sm:text-sm font-semibold text-ink">
                              {adapter.label}
                            </span>
                            <span
                              className={`text-[11px] font-medium ${
                                isSelected
                                  ? 'text-primary'
                                  : 'text-ink-muted'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </span>
                          </div>
                          <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                            {adapter.privacyNote}
                          </p>
                          <p
                            className={`text-[11px] mt-1.5 ${
                              adapter.available
                                ? 'text-primary'
                                : 'text-warning'
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
                      className="mt-4 pt-4 border-t border-edge-subtle space-y-3"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-8">
                          <label
                            htmlFor="ai-endpoint-url-input"
                            className="block text-xs font-semibold text-ink mb-1"
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
                              className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-canvas border border-edge text-base sm:text-sm font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                            />
                            {customEndpointUrl && (
                              <button
                                type="button"
                                onClick={() => setCustomEndpointUrl('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink"
                              >
                                <Icon name="close" className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="sm:col-span-4">
                          <label
                            htmlFor="ai-timeout-select"
                            className="block text-xs font-semibold text-ink mb-1"
                          >
                            Request Timeout
                          </label>
                          <select
                            id="ai-timeout-select"
                            value={customEndpointTimeout}
                            onChange={(e) => setCustomEndpointTimeout(Number(e.target.value))}
                            className="w-full h-12 px-3 rounded-lg bg-canvas border border-edge text-base sm:text-sm text-ink focus:outline-2 focus:outline-primary"
                          >
                            <option value={3000}>3 seconds (Fast fallback)</option>
                            <option value={6000}>6 seconds (Balanced)</option>
                            <option value={10000}>10 seconds (Local model)</option>
                          </select>
                        </div>
                      </div>

                      {customEndpointError && (
                        <p role="alert" className="text-xs font-medium text-danger">
                          {customEndpointError}
                        </p>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-[11px] text-ink-secondary">
                          Never paste API keys in URLs. Upstream secrets must stay inside your proxy
                          or local daemon.
                        </p>
                        <button
                          type="submit"
                          className="min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
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
                    className="rounded-lg bg-surface-subtle border border-edge px-3.5 py-2.5 text-xs text-ink"
                  >
                    {lastAdapterTestReport}
                  </div>
                )}

                <div className="pt-3 border-t border-edge-subtle flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleEnrichAllBooks}
                    disabled={enrichingCatalog}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
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
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge disabled:opacity-60 text-ink text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>
                      {testingAdapter ? t('settings.testingProgress') : t('settings.testPipelineBtn')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetProviderDefaults}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg border border-edge hover:bg-surface-subtle text-ink-secondary hover:text-ink text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {t('settings.safeDefaultsBtn')}
                  </button>
                </div>
              </section>

              {/* Smart Discovery & Home Feed Recommendations */}
              <section
                aria-labelledby="discovery-settings-heading"
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="pb-2.5 border-b border-edge-subtle">
                  <h2
                    id="discovery-settings-heading"
                    className="font-display text-lg font-semibold text-ink"
                  >
                    Smart Discovery &amp; Home Feed
                  </h2>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Configure two-stage candidate retrieval, semantic reranking, modern edition filtering, and shelf priorities.
                  </p>
                </div>

                {/* Retrieval Pool Size */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="discovery-pool-size-range"
                      className="text-sm font-semibold text-ink"
                    >
                      Candidate Retrieval Pool Size
                    </label>
                    <span className="font-mono-tabular text-xs font-semibold text-primary">
                      {discoverySettings.candidatePoolSize} books / query
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary">
                    How many candidates are fetched from Google Books &amp; Open Library before semantic reranking and filtering. Larger pools (60–150) improve variety.
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                    <input
                      id="discovery-pool-size-range"
                      type="range"
                      min={NUMERIC_BOUNDS.discoveryPoolSizeMin}
                      max={NUMERIC_BOUNDS.discoveryPoolSizeMax}
                      step={10}
                      value={discoverySettings.candidatePoolSize}
                      onChange={(e) => {
                        void updateDiscoverySettings({
                          candidatePoolSize: Number(e.target.value),
                        });
                      }}
                      className="flex-1 accent-[var(--primary)] cursor-pointer"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      {[30, 60, 100, 150].map((presetSize) => {
                        const active = discoverySettings.candidatePoolSize === presetSize;
                        return (
                          <button
                            key={presetSize}
                            type="button"
                            onClick={() => {
                              void updateDiscoverySettings({ candidatePoolSize: presetSize });
                            }}
                            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-mono-tabular font-semibold transition-colors cursor-pointer ${
                              active
                                ? 'bg-primary text-primary-fg'
                                : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary'
                            }`}
                          >
                            {presetSize}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Semantic Reranking Engine */}
                <div className="pt-3 border-t border-edge-subtle space-y-2">
                  <p className="text-sm font-semibold text-ink">
                    Semantic Reranking Engine
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(
                      [
                        {
                          id: 'gemini-with-fallback',
                          label: 'Gemini + Offline Fallback',
                          desc: 'Uses Gemini embeddings when available and automatically falls back to local TF-IDF offline.',
                        },
                        {
                          id: 'local-tfidf',
                          label: 'Local TF-IDF Only',
                          desc: 'Instant zero-network vector matching cached directly on your device.',
                        },
                        {
                          id: 'transformers-browser',
                          label: 'Transformers.js (Browser)',
                          desc: 'On-device neural miniLM model cached in browser with TF-IDF fallback.',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = discoverySettings.embeddingEngine === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            void updateDiscoverySettings({ embeddingEngine: opt.id });
                          }}
                          className={`text-left rounded-lg p-3 border transition-colors cursor-pointer ${
                            active
                              ? 'bg-surface-elevated border-primary'
                              : 'bg-surface-subtle border-edge hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-ink">
                              {opt.label}
                            </span>
                            {active && (
                              <Icon name="check" className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recency & Classics Filter */}
                <div className="pt-3 border-t border-edge-subtle space-y-2">
                  <p className="text-sm font-semibold text-ink">
                    Edition Recency Filter
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'modern',
                          label: 'Modern Focus',
                          desc: 'Prioritizes modern editions (1985+) and skips obscure old catalogs.',
                        },
                        {
                          id: 'balanced',
                          label: 'Balanced',
                          desc: 'Allows mid-century works that have multiple modern editions.',
                        },
                        {
                          id: 'include-classics',
                          label: 'Include Classics',
                          desc: 'Includes vintage & public-domain editions alongside modern releases.',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = discoverySettings.recencyPreference === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            void updateDiscoverySettings({ recencyPreference: opt.id });
                          }}
                          className={`text-left rounded-lg p-3 border transition-colors cursor-pointer ${
                            active
                              ? 'bg-surface-elevated border-primary'
                              : 'bg-surface-subtle border-edge hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-ink">
                              {opt.label}
                            </span>
                            {active && (
                              <Icon name="check" className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Flash Query Expansion & Auto-Save Suggestions Switches */}
                <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-flash-query-expansion"
                      className="text-sm font-semibold text-ink"
                    >
                      Gemini Flash Query Expansion
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      Expands reader favorites &amp; topics into targeted search queries (falls back automatically to deterministic local queries offline).
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={discoverySettings.useFlashQueryExpansion}
                    onChange={() => {
                      void updateDiscoverySettings({
                        useFlashQueryExpansion: !discoverySettings.useFlashQueryExpansion,
                      });
                    }}
                    ariaLabelledBy="label-flash-query-expansion"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>

                <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      id="label-autosave-suggestions"
                      className="text-sm font-semibold text-ink"
                    >
                      Auto-Save Queried Books to Suggestions
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      Stores discovered &amp; searched books under Library → Suggestions while keeping your Owned shelves tidy.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={discoverySettings.autoSaveQueriedAsSuggestions}
                    onChange={() => {
                      void updateDiscoverySettings({
                        autoSaveQueriedAsSuggestions: !discoverySettings.autoSaveQueriedAsSuggestions,
                      });
                    }}
                    ariaLabelledBy="label-autosave-suggestions"
                    onLabel={t('common.on')}
                    offLabel={t('common.off')}
                  />
                </div>

                {/* Pin / Hide Key Home Recommendation Shelves */}
                <div className="pt-3 border-t border-edge-subtle space-y-2.5">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Home Recommendation Shelves
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      Pin shelves to always show them near the top of Home, or hide rows you prefer not to see.
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-subtle border border-edge divide-y divide-edge-subtle">
                    {[
                      {
                        key: 'mood-bedtime',
                        label: 'Wind-Down & Bedtime (Owned)',
                        note: 'Automatically rises in priority after 6:30 PM',
                      },
                      {
                        key: 'ext-discover-bedtime',
                        label: 'Discover Calm Bedtime Books',
                        note: 'External bedtime picks shown at night or when pinned',
                      },
                      {
                        key: 'ext-discover-award-modern',
                        label: 'Acclaimed Modern Storybooks',
                        note: 'Award winners & recent illustrated standouts',
                      },
                      {
                        key: 'reread-favorites',
                        label: 'Ready for a Re-Read',
                        note: 'Loved favorites rested for 30+ days',
                      },
                      {
                        key: 'dusty-gems',
                        label: 'Dusty Gems on Your Shelf',
                        note: 'Owned books waiting for a rotation turn',
                      },
                      {
                        key: 'wishlist-spotlight',
                        label: 'From Your Wishlist',
                        note: 'Books saved to borrow or buy next',
                      },
                    ].map((shelf) => {
                      const isPinned = discoverySettings.pinnedShelfKeys.includes(shelf.key);
                      const isHidden = discoverySettings.disabledShelfKeys.includes(shelf.key);
                      return (
                        <div
                          key={shelf.key}
                          className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink">
                              {shelf.label}
                            </p>
                            <p className="text-[11px] text-ink-secondary">
                              {shelf.note}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                void toggleDiscoveryShelfPin(shelf.key);
                              }}
                              aria-pressed={isPinned}
                              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                isPinned
                                  ? 'bg-primary text-primary-fg border-primary'
                                  : 'bg-surface hover:bg-surface-elevated border-edge text-ink-secondary hover:text-ink'
                              }`}
                            >
                              {isPinned ? 'Pinned' : 'Pin top'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void toggleDiscoveryShelfDisabled(shelf.key);
                              }}
                              aria-pressed={isHidden}
                              className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                                isHidden
                                  ? 'bg-danger/12 text-danger border-danger/35'
                                  : 'bg-surface hover:bg-surface-elevated border-edge text-ink-secondary hover:text-ink'
                              }`}
                            >
                              {isHidden ? 'Hidden' : 'Hide'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Clear Vector Cache Action */}
                <div className="pt-3 border-t border-edge-subtle flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-ink-secondary">
                    Cached semantic vectors speed up Home reranking across reloads.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearVectorCache}
                    disabled={clearingVectorCache}
                    className="min-h-[44px] px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    <Icon name="database" className="w-3.5 h-3.5 text-ink-secondary" />
                    <span>{clearingVectorCache ? 'Clearing…' : 'Clear Local Vector Cache'}</span>
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
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2
                      id="pwa-heading"
                      className="font-display text-lg font-semibold text-ink"
                    >
                      {t('settings.pwaHeading')}
                    </h2>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {t('settings.pwaNetwork')}:{' '}
                      <strong className="text-ink">
                        {pwaStatus.isOnline ? t('settings.pwaOnline') : t('settings.pwaOffline')}
                      </strong>{' '}
                      · {t('settings.pwaShell')}:{' '}
                      <strong className="text-ink">
                        {pwaStatus.swReady ? t('settings.pwaReady') : t('settings.pwaRegistering')}
                      </strong>{' '}
                      · {t('settings.pwaStorage')}:{' '}
                      <strong className="text-ink">indexeddb</strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
                    {pwaStatus.isInstalled ? (
                      <div className="min-h-[44px] px-4 py-2 rounded-lg bg-secondary/15 border border-secondary/35 text-xs font-semibold text-primary inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <Icon name="check" className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('settings.pwaInstalledMode')}</span>
                      </div>
                    ) : pwaStatus.isInstallable ? (
                      <button
                        type="button"
                        onClick={() => pwaManager.triggerInstall()}
                        className="min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shadow-xs cursor-pointer"
                      >
                        <Icon name="download" className="w-3.5 h-3.5 shrink-0" />
                        <span>{t('settings.pwaSaveHomeScreen')}</span>
                      </button>
                    ) : pwaStatus.isIOS ? (
                      <div className="min-h-[44px] px-3.5 py-2 rounded-lg bg-surface-subtle border border-edge text-xs text-ink-secondary inline-flex items-center justify-center text-center">
                        <span>
                          Tap <strong>Share</strong> &rarr; <strong>Add to Home</strong>
                        </span>
                      </div>
                    ) : (
                      <div className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle border border-edge text-xs font-semibold text-ink-secondary inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <Icon name="check" className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>PWA Ready</span>
                      </div>
                    )}

                    <button
                      type="button"
                      data-action="force-refresh-app"
                      onClick={handleForceRefresh}
                      disabled={refreshingApp}
                      className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated disabled:opacity-60 border border-edge text-ink text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Icon
                        name="refresh"
                        className={refreshingApp ? 'w-3.5 h-3.5 animate-spin shrink-0' : 'w-3.5 h-3.5 shrink-0'}
                      />
                      <span>
                        {refreshingApp
                          ? t('settings.forceRefreshProgress')
                          : t('settings.forceRefreshBtn')}
                      </span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  {t('settings.forceRefreshHint')}
                </p>
              </section>

              {/* Storage & Browser Cache Breakdown */}
              <section
                aria-labelledby="storage-heading"
                className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2.5 border-b border-edge-subtle">
                  <div>
                    <h2
                      id="storage-heading"
                      className="font-display text-lg font-semibold text-ink"
                    >
                      {t('settings.storageHeading')}
                    </h2>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {t('settings.storageDesc')}
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="text-xs font-mono-tabular text-ink-secondary whitespace-nowrap">
                      {t('settings.versionLabel')}{' '}
                      <strong className="font-semibold text-ink">
                        {APP_VERSION}
                      </strong>
                      <span aria-hidden="true" className="mx-1">
                        ·
                      </span>
                      {t('settings.memoryLabel')}{' '}
                      <strong className="font-semibold text-ink">
                        {formatStorageBytes(
                          detailedStorage ? detailedStorage.totalAppBytes : storageUsage.totalBytes
                        )}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Detailed Storage Categories Table */}
                {(() => {
                  const ds = detailedStorage;
                  const totalAppBytes = ds ? ds.totalAppBytes : storageUsage.totalBytes;
                  const rows = [
                    {
                      id: 'photos',
                      icon: 'photo',
                      label: t('settings.photosLabel') || 'Cover Photos',
                      detail: ds
                        ? `${ds.coverPhotoCount} saved ${ds.coverPhotoCount === 1 ? 'photo' : 'photos'}`
                        : 'Inline device cover photos',
                      bytes: ds ? ds.coverPhotoBytes : storageUsage.coverDataUrlBytes,
                    },
                    {
                      id: 'audio',
                      icon: 'mic',
                      label: 'Voice Notes & Read-Alouds',
                      detail: ds
                        ? `${ds.audioClipCount} audio ${ds.audioClipCount === 1 ? 'clip' : 'clips'} (IndexedDB)`
                        : 'Private IndexedDB recordings',
                      bytes: ds ? ds.audioBytes : 0,
                    },
                    {
                      id: 'catalog',
                      icon: 'library',
                      label: 'Catalog, Profiles & Shelves',
                      detail: `${state.books.length} books · ${state.profiles.length} readers · ${state.rotations.length} shelves`,
                      bytes: ds
                        ? ds.catalogMetadataBytes
                        : Math.max(0, storageUsage.stateBytes - storageUsage.coverDataUrlBytes),
                    },
                    {
                      id: 'artwork',
                      icon: 'palette',
                      label: 'Custom Preset Artwork',
                      detail: 'User-generated or uploaded collection covers',
                      bytes: ds ? ds.customPresetArtBytes : 0,
                    },
                    {
                      id: 'prefs',
                      icon: 'sliders',
                      label: 'Device Preferences & Keys',
                      detail: 'Proxy URL, UI toggles & navigation memory',
                      bytes: ds ? ds.auxLocalStorageBytes : storageUsage.auxBytes,
                    },
                  ];

                  return (
                    <div className="rounded-lg border border-edge-subtle bg-surface-subtle/60 overflow-hidden">
                      <div className="divide-y divide-edge-subtle">
                        {rows.map((row) => (
                          <div
                            key={row.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon name={row.icon} className="w-4 h-4 text-ink-secondary shrink-0" />
                              <div className="min-w-0">
                                <p className="font-semibold text-ink truncate">{row.label}</p>
                                <p className="text-[11px] text-ink-muted truncate">{row.detail}</p>
                              </div>
                            </div>
                            <span className="font-mono-tabular font-semibold text-ink shrink-0">
                              {formatStorageBytes(row.bytes)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="px-3.5 py-2.5 bg-surface-elevated/70 border-t border-edge-subtle flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-ink">Total Library Footprint</span>
                        <span className="font-mono-tabular font-bold text-primary">
                          {formatStorageBytes(totalAppBytes)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Browser Quota & Service Worker Caches (if exposed by browser) */}
                {detailedStorage &&
                  (detailedStorage.browserUsageBytes !== null ||
                    detailedStorage.cacheNames.length > 0) && (
                    <div className="rounded-lg border border-edge-subtle bg-surface-subtle/40 px-3.5 py-3 space-y-2 text-xs">
                      {detailedStorage.browserUsageBytes !== null &&
                        detailedStorage.browserQuotaBytes !== null &&
                        detailedStorage.browserQuotaBytes > 0 && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-ink-secondary">
                                Browser Origin Storage (includes app cache)
                              </span>
                              <span className="font-mono-tabular text-ink">
                                {formatStorageBytes(detailedStorage.browserUsageBytes)} /{' '}
                                {formatStorageBytes(detailedStorage.browserQuotaBytes)}
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      1,
                                      Math.round(
                                        (detailedStorage.browserUsageBytes /
                                          detailedStorage.browserQuotaBytes) *
                                          100
                                      )
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                      {detailedStorage.cacheNames.length > 0 && (
                        <p className="text-[11px] text-ink-muted">
                          <span className="font-semibold text-ink-secondary">
                            Offline asset caches ({detailedStorage.cacheNames.length}):
                          </span>{' '}
                          <span className="font-mono">{detailedStorage.cacheNames.join(', ')}</span>
                        </p>
                      )}
                    </div>
                  )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-ink-secondary">
                    Clearing cover cache removes uploaded inline cover images without touching books.
                  </span>

                  <button
                    type="button"
                    onClick={handleClearCoverCache}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
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

              <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
                  >
                    <Icon name="download" className="w-3.5 h-3.5" />
                    <span>{t('settings.exportBtn')}</span>
                  </button>

                  <label className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap">
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

                <div className="pt-4 border-t border-edge-subtle space-y-3">
                  {!confirmResetOpen ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetOpen(true)}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-danger/40 hover:bg-danger/10 text-danger text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {t('settings.resetSeedBtn')}
                    </button>
                  ) : (
                    <div
                      role="alertdialog"
                      aria-labelledby="confirm-reset-title"
                      className="rounded-lg bg-danger/10 border border-danger/35 p-4 space-y-3"
                    >
                      <div>
                        <p
                          id="confirm-reset-title"
                          className="text-xs sm:text-sm font-semibold text-ink"
                        >
                          {t('settings.resetSeedConfirmTitle')}
                        </p>
                        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                          {t('settings.resetSeedConfirmBody')}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleConfirmResetSeed}
                          className="min-h-[42px] px-4 py-1.5 rounded-lg bg-danger-solid hover:bg-danger-solid-hover text-danger-solid-fg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          {t('settings.resetSeedConfirmAction')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetOpen(false)}
                          className="min-h-[42px] px-4 py-1.5 rounded-lg bg-surface border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
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

        case 'dev-tools':
          return (
            <>
              <SettingsSubViewHeader
                title={t('devTools.heading')}
                subtitle={t('devTools.subtitle')}
                backLabel={backLabel}
                onBack={goBackToRoot}
              />

              {/* Onboarding Controls */}
              <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Onboarding Flow &amp; Preview
                  </h2>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Current onboarding status:{' '}
                    <strong className="font-mono-tabular text-ink">
                      {state.settings.onboarding?.status || 'pending'}
                    </strong>{' '}
                    · Step {state.settings.onboarding?.currentStep ?? 0} of 5
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-action="dev-preview-onboarding"
                    onClick={() => store.previewOnboarding()}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold text-left inline-flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <span>{t('devTools.previewOnboardingBtn')}</span>
                    <Icon name="chevronRight" className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-action="dev-restart-onboarding"
                    onClick={() => store.restartOnboarding()}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink text-left inline-flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>{t('devTools.restartOnboardingBtn')}</span>
                    <Icon name="refresh" className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-action="dev-reset-onboarding-flag"
                    onClick={() => store.resetOnboardingCompletionFlag()}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-edge hover:bg-surface-subtle text-xs font-semibold text-ink text-left sm:col-span-2 cursor-pointer"
                  >
                    {t('devTools.resetFlagBtn')}
                  </button>
                </div>
              </section>

              {/* Sample Data & QA User State Switching */}
              <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    User State Switching &amp; Sample Data
                  </h2>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Test brand-new clean-slate onboarding or swap back to your backed-up household snapshot.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    data-action="dev-switch-new-user"
                    onClick={() => store.switchToNewUserCleanSlate()}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/40 text-ink text-xs font-semibold cursor-pointer"
                  >
                    {t('devTools.switchNewUserBtn')}
                  </button>

                  <button
                    type="button"
                    data-action="dev-restore-snapshot"
                    disabled={!hasQaSnapshot}
                    onClick={() => store.restoreExistingUserSnapshot()}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge disabled:opacity-45 disabled:cursor-not-allowed text-xs font-semibold text-ink cursor-pointer"
                  >
                    {t('devTools.restoreSnapshotBtn')}
                  </button>

                  <button
                    type="button"
                    data-action="dev-add-sample-books"
                    onClick={() => store.importSampleCollectionAdditive()}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-edge hover:bg-surface-subtle text-xs font-semibold text-ink cursor-pointer"
                  >
                    {t('devTools.loadSampleAdditiveBtn')}
                  </button>

                  <button
                    type="button"
                    data-action="dev-load-sample-household"
                    onClick={() => store.loadFullSampleHousehold()}
                    className="min-h-[44px] px-4 py-2 rounded-lg border border-edge hover:bg-surface-subtle text-xs font-semibold text-ink cursor-pointer"
                  >
                    {t('devTools.loadSampleHouseholdBtn')}
                  </button>
                </div>

                {/* Clear All Test Data with inline confirmation */}
                <div className="pt-3 border-t border-edge-subtle">
                  {!confirmClearAllOpen ? (
                    <button
                      type="button"
                      data-action="dev-clear-all-test-data"
                      onClick={() => setConfirmClearAllOpen(true)}
                      className="min-h-[44px] px-4 py-2 rounded-lg border border-danger/40 hover:bg-danger/10 text-danger text-xs font-semibold cursor-pointer"
                    >
                      {t('devTools.clearAllBtn')}
                    </button>
                  ) : (
                    <div
                      role="alertdialog"
                      className="rounded-lg bg-danger/10 border border-danger/35 p-4 space-y-2.5"
                    >
                      <p className="text-xs font-semibold text-ink">
                        Erase all local books, profiles, rotations, and saved QA snapshots?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setConfirmClearAllOpen(false);
                            await store.clearAllTestData();
                          }}
                          className="min-h-[40px] px-4 py-1.5 rounded-lg bg-danger-solid hover:bg-danger-solid-hover text-danger-solid-fg text-xs font-semibold cursor-pointer"
                        >
                          Confirm Clear All
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearAllOpen(false)}
                          className="min-h-[40px] px-4 py-1.5 rounded-lg bg-surface border border-edge text-xs font-semibold text-ink cursor-pointer"
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

              <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4">
                <button
                  type="button"
                  onClick={() => openSection('icon-legend')}
                  className="w-full rounded-xl p-3.5 bg-surface-subtle hover:bg-surface-elevated border border-primary/35 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
                      <Icon name="info" className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-ink">
                        Icon &amp; Symbol Legend
                      </p>
                      <p className="text-[11px] text-ink-secondary mt-0.5 truncate">
                        Visual guide to hearts, checklists, pencils, grids &amp; cover badges
                      </p>
                    </div>
                  </div>
                  <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
                </button>

                <p className="text-xs text-ink-secondary leading-relaxed">
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
                      className="rounded-lg p-3.5 bg-surface-subtle hover:bg-surface-elevated border border-edge flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-ink">
                          {doc.title}
                        </p>
                        <p className="text-[11px] text-ink-secondary mt-0.5 truncate">
                          {doc.desc}
                        </p>
                      </div>
                      <span className="text-primary shrink-0">
                        <Icon name="externalLink" className="w-4 h-4" />
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            </>
          );

        case 'icon-legend':
          return (
            <>
              <SettingsSubViewHeader
                title="Icon & Symbol Legend"
                subtitle="What every button, badge, heart, checklist & pencil icon reflects"
                backLabel={backLabel}
                onBack={goBackToRoot}
              />
              <IconLegendSubView />
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

        case 'matching-rules':
          return (
            <MatchingRulesSubView
              onBack={goBackToRoot}
              backLabel={backLabel}
            />
          );

        default:
          return null;
      }
    };

    const currentSidebarArtworkId =
      state.settings.sidebarArtworkId || DEFAULT_SIDEBAR_ARTWORK_ID;

    return (
      <>
        <div
          key={`subview-${activeSection}`}
          className={`w-full space-y-5 text-left ${
            activeSection === 'profiles' ? 'max-w-5xl' : 'max-w-3xl'
          } mx-auto pb-12 animate-slide-in-right`}
        >
          {renderSubViewBody()}
        </div>

        <ArtworkPickerModal
          isOpen={isSidebarArtworkPickerOpen}
          selectedArtworkId={currentSidebarArtworkId}
          suggestedArtworkId={DEFAULT_SIDEBAR_ARTWORK_ID}
          modalTitle="Browse Sidebar Illustrations"
          modalSubtitle="15 library & reading-corner illustrations + 42 collection pieces"
          defaultCategory="all"
          onSelect={async (artwork) => {
            await store.updateSettings({
              sidebarArtworkMode: 'illustration',
              sidebarArtworkId: artwork.id,
            });
            store.notify(`Sidebar artwork updated to "${artwork.label}".`, 'success');
          }}
          onClose={() => setIsSidebarArtworkPickerOpen(false)}
        />
      </>
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
          <p className="text-[11px] font-semibold text-primary uppercase tracking-[0.12em]">
            {t('settings.eyebrow')}
          </p>
          <h1 className="font-display text-2xl sm:text-[32px] font-semibold tracking-tight text-ink leading-tight mt-0.5">
            {t('settings.heading')}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleVersionTap}
          title={
            isDevToolsVisible
              ? 'Developer & Testing Tools unlocked'
              : 'Tap 5 times to unlock Development & Testing Tools'
          }
          className="min-h-[44px] inline-flex items-center px-2.5 py-1.5 -mx-2.5 sm:mx-0 rounded-lg text-xs font-mono-tabular text-ink-secondary hover:text-ink hover:bg-surface-subtle text-left sm:text-right cursor-pointer transition-colors"
        >
          <span>
            v{APP_VERSION} · {storageUsage.formatted}
            {!isDevToolsVisible && versionTapCount > 0
              ? ` · Tap ${5 - versionTapCount} more`
              : ''}
          </span>
        </button>
      </div>

      {/* Proactive Quota Warning Banner in Settings Root */}
      {(() => {
        const alert = queryLogger.getGlobalQuotaAlert();
        if (!alert.hasAlert) return null;
        return (
          <div
            role="alert"
            onClick={() => openSection('query-usage')}
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs leading-relaxed cursor-pointer transition-colors ${
              alert.level === 'error'
                ? 'bg-danger/10 border-danger/35 text-danger'
                : 'bg-accent/12 border-accent/35 text-ink'
            } shadow-xs`}
          >
            <div className="flex items-center gap-2.5">
              <Icon name="info" className="w-4 h-4 shrink-0" />
              <p className="font-semibold">{alert.message}</p>
            </div>
            <span className="font-semibold underline shrink-0 whitespace-nowrap">View Usage &rarr;</span>
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
              value={`${themeLabel} · ${detailStyleLabel} · ${ratioLabel}`}
              onClick={() => openSection('appearance')}
            />
            <SettingsMenuRow
              testId="language"
              icon="globe"
              iconTone="indigo"
              title={t('settings.rowLanguageTitle')}
              subtitle={t('settings.rowLanguageSubtitle')}
              value={currentLanguageOption.nativeLabel}
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
              testId="matching-rules"
              icon="scale"
              iconTone="indigo"
              title={t('settings.rowMatchingRulesTitle')}
              subtitle={t('settings.rowMatchingRulesSubtitle')}
              onClick={() => openSection('matching-rules')}
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
            {isDevToolsVisible && (
              <SettingsMenuRow
                testId="dev-tools"
                icon="sliders"
                iconTone="amber"
                title={t('devTools.heading')}
                subtitle={t('devTools.rowSubtitle')}
                onClick={() => openSection('dev-tools')}
              />
            )}
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
            <SettingsMenuRow
              testId="icon-legend"
              icon="info"
              iconTone="indigo"
              title="Icon & Symbol Legend"
              subtitle="Hearts, checklists, pencils, grids & cover badges"
              onClick={() => openSection('icon-legend')}
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
