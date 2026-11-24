import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BrandEmblem, resolveBrandWordmark } from '../common/BrandEmblem.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { AVATAR_TONES, resolveEffectiveThemeConfig } from '../../config/index.js';
import { SIDEBAR_ILLUSTRATIONS } from '../../config/illustrations.js';
import { formatProfileAgeLabel } from '../../types/models.js';
import type {
  RouteId,
  SidebarArtworkMode,
  SidebarArtworkStyle,
  SidebarDividerStyle,
} from '../../types/models.js';
import sidebarArtworkImg from '../../assets/images/sidebar_reading_artwork_1794694074246.jpg';
import {
  DAILY_RANDOM_ARTWORK_ID,
  resolveActiveDividerVariant,
  resolvePublicAssetUrl,
  resolveSidebarArtworkInfo,
} from '../../ui/preset-artwork.js';

type ActiveSidebarPicker = 'none' | 'artwork' | 'divider';

export const Sidebar: React.FC = () => {
  const {
    state,
    store,
    currentRoute,
    activeProfile,
    setIsProfileSwitcherOpen,
    setIsProfileFormOpen,
    setEditingProfileId,
    setIsNotificationCenterOpen,
    unreadNotificationCount,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    t,
  } = useApp();

  const [hoveredTip, setHoveredTip] = useState<{ label: string; top: number } | null>(null);
  const [activePicker, setActivePicker] = useState<ActiveSidebarPicker>('none');
  const artworkPickerRef = useRef<HTMLDivElement | null>(null);
  const dividerPickerRef = useRef<HTMLDivElement | null>(null);
  const artworkBtnRef = useRef<HTMLButtonElement | null>(null);
  const dividerBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (sidebarCollapsed) {
      setActivePicker('none');
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (activePicker === 'none') return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (artworkPickerRef.current?.contains(target) || artworkBtnRef.current?.contains(target)) {
        return;
      }
      if (dividerPickerRef.current?.contains(target) || dividerBtnRef.current?.contains(target)) {
        return;
      }
      setActivePicker('none');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePicker('none');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activePicker]);

  const showTooltip = (el: HTMLElement, label: string) => {
    if (!sidebarCollapsed) return;
    const rect = el.getBoundingClientRect();
    setHoveredTip({ label, top: rect.top + rect.height / 2 });
  };

  const hideTooltip = () => setHoveredTip(null);

  const primaryNav: Array<{
    id: RouteId;
    label: string;
    icon: string;
    badge?: number;
  }> = [
    { id: 'home', label: t('nav.shelf'), icon: 'home' },
    {
      id: 'library',
      label: t('nav.library'),
      icon: 'library',
      badge: state.books.length > 0 ? state.books.length : undefined,
    },
    { id: 'librarian', label: t('nav.librarian'), icon: 'sparkles' },
    { id: 'rotations', label: t('nav.rotations'), icon: 'rotations' },
    { id: 'presets', label: 'Collections', icon: 'presets' },
    { id: 'play', label: t('nav.play'), icon: 'dice' },
  ];

  const householdNav: Array<{
    id: RouteId;
    label: string;
    icon: string;
    badge?: number;
  }> = [
    {
      id: 'profiles',
      label: 'Reader Profiles',
      icon: 'profiles',
      badge: state.profiles.length > 0 ? state.profiles.length : undefined,
    },
    { id: 'settings', label: t('nav.settings'), icon: 'settings' },
  ];

  const avatarTone = activeProfile?.avatarTone || 'teal';
  const toneClass = AVATAR_TONES[avatarTone] || AVATAR_TONES.teal;
  const initial = activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : 'R';
  const ageLabel = activeProfile ? formatProfileAgeLabel(activeProfile) : '';
  const householdName = state.settings?.householdName?.trim();

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = resolveEffectiveThemeConfig(
    state.settings?.theme,
    state.settings?.themePreset,
    prefersDark
  );
  const artworkMode =
    state.settings?.sidebarArtworkMode === 'engraving' ||
    state.settings?.sidebarArtworkMode === 'illustration' ||
    state.settings?.sidebarArtworkMode === 'none'
      ? state.settings.sidebarArtworkMode
      : effectiveTheme.sidebarArtworkDefault;
  const artworkStyle =
    state.settings?.sidebarArtworkStyle === 'natural' ||
    state.settings?.sidebarArtworkStyle === 'muted'
      ? state.settings.sidebarArtworkStyle
      : 'integrated';
  const configuredArtworkMode = state.settings?.sidebarArtworkMode || 'theme';
  const isDailyRandomArtwork =
    String(state.settings?.sidebarArtworkId || '').trim().toLowerCase() === DAILY_RANDOM_ARTWORK_ID;
  const configuredDividerStyle: SidebarDividerStyle = (() => {
    const raw = String(state.settings?.sidebarDividerStyle || '').trim().toLowerCase();
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
  const resolvedDividerVariant = resolveActiveDividerVariant(state.settings?.sidebarDividerStyle);
  const sidebarArtwork = resolveSidebarArtworkInfo(state.settings, sidebarArtworkImg);

  const sidebarIllustrationVars = {
    '--text-primary': 'var(--sidebar-text)',
    '--primary': 'var(--sidebar-accent)',
    '--secondary': 'var(--sidebar-muted)',
    '--accent': 'var(--sidebar-accent)',
    '--border': 'var(--sidebar-border)',
    '--surface': 'var(--sidebar-surface)',
    '--surface-elevated': 'var(--sidebar-active-bg)',
    '--surface-subtle': 'var(--sidebar-bg)',
    '--text-muted': 'var(--sidebar-muted)',
  } as React.CSSProperties;

  const renderNavLink = (item: {
    id: RouteId;
    label: string;
    icon: string;
    badge?: number;
  }) => {
    const isActive = item.id === currentRoute;
    const tipText = item.badge !== undefined ? `${item.label} (${item.badge})` : item.label;
    return (
      <a
        key={item.id}
        href={`#/${item.id}`}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        title={sidebarCollapsed ? tipText : undefined}
        onMouseEnter={(e) => showTooltip(e.currentTarget, tipText)}
        onMouseLeave={hideTooltip}
        onFocus={(e) => showTooltip(e.currentTarget, tipText)}
        onBlur={hideTooltip}
        className={`group relative flex items-center ${
          sidebarCollapsed ? 'justify-center px-0 py-2.5 mx-auto w-11 h-11' : 'justify-between gap-3 px-3.5 py-2.5'
        } rounded-lg text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-accent ${
          isActive
            ? 'bg-sidebar-active text-sidebar-text font-semibold border border-sidebar-accent/30'
            : 'text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface/65 font-medium border border-transparent'
        }`}
      >
        <span className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 min-w-0'}`}>
          <Icon
            name={item.icon}
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${
              isActive
                ? 'text-sidebar-accent'
                : 'text-sidebar-muted group-hover:text-sidebar-text'
            }`}
            strokeWidth={isActive ? 2.1 : 1.75}
          />
          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
        </span>
        {!sidebarCollapsed && item.badge !== undefined && (
          <span
            className={`text-[11px] font-mono-tabular px-1.5 py-0.5 rounded ${
              isActive
                ? 'bg-sidebar-accent/20 text-sidebar-accent'
                : 'text-sidebar-muted group-hover:text-sidebar-text'
            }`}
          >
            {item.badge}
          </span>
        )}
      </a>
    );
  };

  return (
    <aside
      aria-label="Desktop workspace navigation"
      data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
      className={`hidden lg:flex lg:flex-col ${
        sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-64'
      } lg:fixed lg:inset-y-0 lg:left-0 z-30 bg-sidebar text-sidebar-text border-r border-sidebar-border select-none overflow-hidden transition-[width] duration-200 ease-out`}
    >
      {/* Top Brand Identity + Collapse/Expand Toggle */}
      {sidebarCollapsed ? (
        <div className="h-16 px-2 flex items-center justify-center border-b border-sidebar-border shrink-0">
          <button
            type="button"
            data-action="toggle-sidebar-collapse"
            onClick={() => {
              hideTooltip();
              toggleSidebarCollapsed();
            }}
            onMouseEnter={(e) => showTooltip(e.currentTarget, 'Open sidebar')}
            onMouseLeave={hideTooltip}
            onFocus={(e) => showTooltip(e.currentTarget, 'Open sidebar')}
            onBlur={hideTooltip}
            aria-label="Open sidebar"
            aria-expanded="false"
            title="Open sidebar"
            className="w-10 h-10 rounded-xl hover:bg-sidebar-active flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-sidebar-accent"
          >
            <BrandEmblem presetId={effectiveTheme.id} size="md" />
          </button>
        </div>
      ) : (
        <div className="h-16 pl-4 pr-3 flex items-center justify-between gap-2 border-b border-sidebar-border shrink-0">
          <a
            href="#/home"
            className="flex items-center gap-2.5 min-w-0 focus-visible:outline-2 focus-visible:outline-sidebar-accent rounded-xl"
          >
            <BrandEmblem presetId={effectiveTheme.id} size="md" />
            <div className="min-w-0 text-left">
              <span
                style={{
                  textTransform: 'var(--brand-wordmark-transform)' as React.CSSProperties['textTransform'],
                  letterSpacing: 'var(--brand-wordmark-tracking)',
                  fontWeight: 'var(--brand-wordmark-weight)',
                }}
                className="block font-display text-[22px] text-sidebar-text leading-none truncate"
              >
                {resolveBrandWordmark(effectiveTheme.id)}
              </span>
              <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted truncate mt-1">
                {householdName || 'READ · EXPLORE · GROW'}
              </span>
            </div>
          </a>

          <button
            type="button"
            data-action="toggle-sidebar-collapse"
            onClick={() => {
              hideTooltip();
              toggleSidebarCollapsed();
            }}
            aria-label="Close sidebar"
            aria-expanded="true"
            title="Close sidebar"
            className="w-8 h-8 rounded-lg text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface/75 flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sidebar-accent"
          >
            <Icon name="panelLeft" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Workspace Navigation + Editorial Botanical Footer Art */}
      <div
        className={`flex-1 overflow-y-auto ${
          sidebarCollapsed ? 'px-2 pt-4' : 'px-3.5 pt-5'
        } pb-2 flex flex-col justify-between gap-4 no-scrollbar`}
      >
        <div className={sidebarCollapsed ? 'space-y-4' : 'space-y-6'}>
          <nav aria-label="Workspace" className="space-y-1">
            {!sidebarCollapsed && (
              <p className="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted/80">
                Workspace
              </p>
            )}
            {primaryNav.map(renderNavLink)}
          </nav>

          <nav
            aria-label="Household & System"
            className={`space-y-1 ${sidebarCollapsed ? 'pt-3 border-t border-sidebar-border/60' : ''}`}
          >
            {!sidebarCollapsed && (
              <p className="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted/80">
                Household
              </p>
            )}
            {householdNav.map(renderNavLink)}
            <button
              type="button"
              onClick={() => setIsNotificationCenterOpen(true)}
              aria-label={
                unreadNotificationCount > 0
                  ? `Notifications (${unreadNotificationCount} unread)`
                  : 'Notifications'
              }
              title={
                sidebarCollapsed
                  ? unreadNotificationCount > 0
                    ? `Notifications (${unreadNotificationCount} unread)`
                    : 'Notifications'
                  : undefined
              }
              onMouseEnter={(e) =>
                showTooltip(
                  e.currentTarget,
                  unreadNotificationCount > 0
                    ? `Notifications (${unreadNotificationCount})`
                    : 'Notifications'
                )
              }
              onMouseLeave={hideTooltip}
              onFocus={(e) =>
                showTooltip(
                  e.currentTarget,
                  unreadNotificationCount > 0
                    ? `Notifications (${unreadNotificationCount})`
                    : 'Notifications'
                )
              }
              onBlur={hideTooltip}
              className={`relative group flex items-center ${
                sidebarCollapsed
                  ? 'justify-center px-0 py-2.5 mx-auto w-11 h-11'
                  : 'w-full justify-between gap-3 px-3.5 py-2.5'
              } rounded-lg text-[13.5px] font-medium text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface/65 transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-accent cursor-pointer`}
            >
              <span className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3 min-w-0'}`}>
                <Icon
                  name="bell"
                  className="w-[18px] h-[18px] shrink-0 text-sidebar-muted group-hover:text-sidebar-text transition-colors"
                  strokeWidth={1.75}
                />
                {!sidebarCollapsed && <span className="truncate">Notifications</span>}
              </span>
              {unreadNotificationCount > 0 &&
                (sidebarCollapsed ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-sidebar-accent text-sidebar text-[9px] font-bold font-mono-tabular flex items-center justify-center"
                  >
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold font-mono-tabular px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                ))}
            </button>
          </nav>
        </div>

        {/* Interactive Frameless Sidebar Artwork (Click to customize or enable Daily Random) */}
        {!sidebarCollapsed && artworkMode !== 'none' && (
          <div
            data-sidebar-artwork-mode={artworkMode}
            data-sidebar-artwork-style={artworkStyle}
            className="relative mt-auto pt-3 pb-2 px-1.5 shrink-0 flex items-center justify-center"
            style={sidebarIllustrationVars}
          >
            <button
              ref={artworkBtnRef}
              type="button"
              data-action="sidebar-artwork-trigger"
              aria-label="Customize sidebar artwork"
              aria-expanded={activePicker === 'artwork'}
              title="Click to switch artwork or enable Daily Random"
              onClick={() =>
                setActivePicker((prev) => (prev === 'artwork' ? 'none' : 'artwork'))
              }
              className={`group relative w-full rounded-xl p-1.5 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sidebar-accent ${
                activePicker === 'artwork'
                  ? 'bg-sidebar-surface/65 ring-1 ring-sidebar-accent/45'
                  : 'hover:bg-sidebar-surface/40'
              }`}
            >
              {artworkMode === 'illustration' ? (
                <div className="relative w-full flex items-center justify-center">
                  {artworkStyle !== 'natural' && (
                    <div
                      className="lr-sidebar-artwork-halo pointer-events-none absolute inset-x-2 inset-y-0 rounded-full"
                      aria-hidden="true"
                    />
                  )}
                  <img
                    src={sidebarArtwork.src}
                    alt=""
                    className={`relative z-10 w-full h-32 pointer-events-none ${
                      sidebarArtwork.isTransparent
                        ? 'object-contain [filter:drop-shadow(var(--elevation-tooltip))]'
                        : 'object-cover lr-sidebar-artwork-mask'
                    } ${
                      artworkStyle === 'integrated'
                        ? 'lr-sidebar-artwork-integrated'
                        : artworkStyle === 'muted'
                          ? 'lr-sidebar-artwork-muted'
                          : 'opacity-95'
                    }`}
                  />
                </div>
              ) : (
                <BotanicalIllustration
                  variant="hero-library"
                  className={`w-full h-32 pointer-events-none transition-opacity ${
                    artworkStyle === 'muted'
                      ? 'opacity-65'
                      : artworkStyle === 'natural'
                        ? 'opacity-95'
                        : 'opacity-85'
                  }`}
                />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Active Reader Card (with Interactive Line or Ornamental Divider) */}
      <div
        className={`${sidebarCollapsed ? 'p-2.5 border-t border-sidebar-border' : 'px-3.5 pb-3.5 pt-1'} shrink-0 bg-sidebar`}
      >
        {!sidebarCollapsed && (
          <button
            ref={dividerBtnRef}
            type="button"
            data-sidebar-divider={configuredDividerStyle}
            data-action="sidebar-divider-trigger"
            aria-label="Customize reader separator style"
            aria-expanded={activePicker === 'divider'}
            title="Click to switch separator ornament or enable Daily Random"
            style={sidebarIllustrationVars}
            onClick={() =>
              setActivePicker((prev) => (prev === 'divider' ? 'none' : 'divider'))
            }
            className={`w-full py-2 mb-1 rounded-lg flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sidebar-accent ${
              activePicker === 'divider'
                ? 'bg-sidebar-surface/70 ring-1 ring-sidebar-accent/40'
                : 'hover:bg-sidebar-surface/40'
            }`}
          >
            {resolvedDividerVariant === 'line' ? (
              <span className="block w-full h-px bg-sidebar-border" aria-hidden="true" />
            ) : (
              <BotanicalIllustration
                variant="sidebar-divider"
                dividerStyle={resolvedDividerVariant}
                className="w-full h-6 opacity-90 pointer-events-none"
              />
            )}
          </button>
        )}
        {activeProfile ? (
          <button
            type="button"
            onClick={() => setIsProfileSwitcherOpen(true)}
            aria-label={`Switch active reader, currently ${activeProfile.name}`}
            title={sidebarCollapsed ? `Reader: ${activeProfile.name}` : undefined}
            onMouseEnter={(e) =>
              showTooltip(e.currentTarget, `Switch reader (${activeProfile.name})`)
            }
            onMouseLeave={hideTooltip}
            onFocus={(e) =>
              showTooltip(e.currentTarget, `Switch reader (${activeProfile.name})`)
            }
            onBlur={hideTooltip}
            className={`w-full min-h-[48px] ${
              sidebarCollapsed ? 'p-1.5 justify-center' : 'p-2.5 justify-between gap-2.5 text-left'
            } rounded-lg bg-sidebar-surface/75 hover:bg-sidebar-surface active:scale-[0.99] border border-sidebar-border flex items-center transition-all cursor-pointer`}
          >
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-sidebar-accent/40 ${toneClass}`}
              >
                {initial}
              </span>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-sidebar-text truncate leading-tight">
                    {activeProfile.name}
                  </p>
                  <p className="text-[11px] text-sidebar-muted truncate leading-tight mt-0.5">
                    {ageLabel || 'Active reader'}
                  </p>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <Icon name="chevronDown" className="w-4 h-4 text-sidebar-muted shrink-0" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingProfileId(null);
              setIsProfileFormOpen(true);
            }}
            aria-label="Add Reader Profile"
            title={sidebarCollapsed ? 'Add Reader Profile' : undefined}
            onMouseEnter={(e) => showTooltip(e.currentTarget, 'Add Reader Profile')}
            onMouseLeave={hideTooltip}
            className={`w-full min-h-[48px] ${
              sidebarCollapsed ? 'p-1.5' : 'p-2.5 gap-2'
            } rounded-lg bg-sidebar-surface/75 hover:bg-sidebar-surface active:scale-[0.99] border border-sidebar-border text-xs font-semibold text-sidebar-text flex items-center justify-center transition-all cursor-pointer`}
          >
            <Icon name="plus" className="w-4 h-4 text-sidebar-accent shrink-0" />
            {!sidebarCollapsed && <span>Add Reader Profile</span>}
          </button>
        )}
      </div>

      {/* Fixed Hover Tooltip when Desktop Sidebar is Collapsed */}
      {sidebarCollapsed && hoveredTip && (
        <div
          role="tooltip"
          style={{ top: hoveredTip.top, left: 84 }}
          className="pointer-events-none fixed -translate-y-1/2 z-[70] px-2.5 py-1.5 rounded-lg bg-surface text-ink border border-edge shadow-lg text-xs font-semibold whitespace-nowrap"
        >
          {hoveredTip.label}
        </div>
      )}

      {/* Quick-Picker Popover: Sidebar Artwork & Daily Random */}
      {!sidebarCollapsed && activePicker === 'artwork' && (
        <div
          ref={artworkPickerRef}
          role="dialog"
          aria-label="Choose sidebar artwork"
          className="fixed left-[266px] bottom-24 z-[70] w-[308px] rounded-xl bg-surface text-ink border border-edge shadow-2xl p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink">{t('settings.sidebarArtworkLabel')}</p>
              <p className="text-[11px] text-ink-secondary truncate max-w-[225px]">
                {isDailyRandomArtwork
                  ? `${t('settings.sidebarArtworkRandom')} · ${sidebarArtwork.label}`
                  : artworkMode === 'engraving'
                    ? t('settings.sidebarArtworkEngraving')
                    : sidebarArtwork.label}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePicker('none')}
              aria-label="Close artwork picker"
              className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle flex items-center justify-center cursor-pointer"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>

          {/* Mode Strip */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
            {(
              [
                { id: 'theme', label: 'Theme' },
                { id: 'engraving', label: 'Engraving' },
                { id: 'illustration', label: 'Art' },
                { id: 'none', label: 'Hide' },
              ] as Array<{ id: SidebarArtworkMode; label: string }>
            ).map((m) => {
              const active = configuredArtworkMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    store.updateSettings({ sidebarArtworkMode: m.id });
                    if (m.id === 'none') setActivePicker('none');
                  }}
                  className={`py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-primary text-primary-fg shadow-2xs' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Visual Blend Row */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
            {(
              [
                { id: 'integrated', label: t('settings.sidebarArtworkStyleIntegrated') },
                { id: 'natural', label: t('settings.sidebarArtworkStyleNatural') },
                { id: 'muted', label: t('settings.sidebarArtworkStyleMuted') },
              ] as Array<{ id: SidebarArtworkStyle; label: string }>
            ).map((st) => {
              const active = artworkStyle === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => store.updateSettings({ sidebarArtworkStyle: st.id })}
                  className={`py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    active ? 'bg-surface text-ink border border-edge shadow-2xs' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          {/* Daily Random Button */}
          <button
            type="button"
            data-action="sidebar-artwork-daily-random"
            onClick={() =>
              store.updateSettings({
                sidebarArtworkMode: 'illustration',
                sidebarArtworkId: DAILY_RANDOM_ARTWORK_ID,
              })
            }
            className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
              isDailyRandomArtwork && artworkMode === 'illustration'
                ? 'bg-primary/12 border-primary text-ink'
                : 'bg-surface-subtle/75 hover:bg-surface-elevated border-edge text-ink'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Icon name="shuffle" className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold truncate">{t('settings.sidebarArtworkRandom')}</span>
            </span>
            <span className="text-[10px] font-medium text-ink-secondary shrink-0">
              Changes daily
            </span>
          </button>

          {/* Compact Illustration Thumbnail Grid */}
          <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
            {SIDEBAR_ILLUSTRATIONS.map((item) => {
              const isSelected =
                !isDailyRandomArtwork &&
                artworkMode === 'illustration' &&
                sidebarArtwork.artworkId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() =>
                    store.updateSettings({
                      sidebarArtworkMode: 'illustration',
                      sidebarArtworkId: item.id,
                    })
                  }
                  className={`group relative aspect-[4/3] rounded-lg p-1 flex items-center justify-center border bg-sidebar transition-all cursor-pointer overflow-hidden ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/35'
                      : 'border-edge hover:border-primary/60'
                  }`}
                >
                  <img
                    src={resolvePublicAssetUrl(item.path)}
                    alt={item.label}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick-Picker Popover: Reader Card Divider Style */}
      {!sidebarCollapsed && activePicker === 'divider' && (
        <div
          ref={dividerPickerRef}
          role="dialog"
          aria-label="Choose reader card separator"
          className="fixed left-[266px] bottom-14 z-[70] w-[286px] rounded-xl bg-surface text-ink border border-edge shadow-2xl p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink">{t('settings.sidebarDividerLabel')}</p>
              <p className="text-[11px] text-ink-secondary">
                {configuredDividerStyle === 'random'
                  ? `${t('settings.sidebarDividerRandom')} · ${resolvedDividerVariant}`
                  : 'Click a motif to preview above reader'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePicker('none')}
              aria-label="Close separator picker"
              className="w-7 h-7 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-subtle flex items-center justify-center cursor-pointer"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {(
              [
                { id: 'laurel', label: t('settings.sidebarDividerLaurel'), motif: 'laurel' as const },
                { id: 'japanese', label: t('settings.sidebarDividerJapanese'), motif: 'japanese' as const },
                { id: 'folio', label: t('settings.sidebarDividerFolio'), motif: 'folio' as const },
                { id: 'minimal', label: t('settings.sidebarDividerMinimal'), motif: 'minimal' as const },
                { id: 'line', label: t('settings.sidebarDividerLine'), motif: null },
                { id: 'random', label: t('settings.sidebarDividerRandom'), motif: 'random' as const },
              ] as const
            ).map((opt) => {
              const active = configuredDividerStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-sidebar-divider-picker-option={opt.id}
                  onClick={() => store.updateSettings({ sidebarDividerStyle: opt.id })}
                  className={`w-full px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary/12 border-primary text-ink'
                      : 'bg-surface-subtle/60 hover:bg-surface-elevated border-edge text-ink'
                  }`}
                >
                  <span className="text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5">
                    {opt.id === 'random' && <Icon name="shuffle" className="w-3.5 h-3.5 text-primary" />}
                    <span>{opt.label}</span>
                  </span>
                  <span className="flex-1 min-w-0 flex items-center justify-end">
                    {opt.motif === 'random' ? (
                      <span className="text-[10px] font-medium text-ink-secondary">Changes daily</span>
                    ) : opt.motif === null ? (
                      <span className="block w-24 h-px bg-edge" aria-hidden="true" />
                    ) : (
                      <BotanicalIllustration
                        variant="sidebar-divider"
                        dividerStyle={opt.motif}
                        className="w-28 h-4 text-ink"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
};
