import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { AVATAR_TONES, resolveEffectiveThemeConfig } from '../../config/index.js';
import { formatProfileAgeLabel } from '../../types/models.js';
import type { RouteId } from '../../types/models.js';
import sidebarArtworkImg from '../../assets/images/sidebar_reading_artwork_1794694074246.jpg';
import { resolveSidebarArtworkInfo } from '../../ui/preset-artwork.js';

export const Sidebar: React.FC = () => {
  const {
    state,
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
    { id: 'scan', label: t('nav.addBookDesktop'), icon: 'scan' },
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
  const dividerStyle = state.settings?.sidebarDividerStyle === 'line' ? 'line' : 'illustration';
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
            className="w-10 h-10 rounded-lg bg-sidebar-surface hover:bg-sidebar-active border border-sidebar-accent/40 text-sidebar-accent flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sidebar-accent"
          >
            <Icon name="book" className="w-[18px] h-[18px]" strokeWidth={1.85} />
          </button>
        </div>
      ) : (
        <div className="h-16 pl-4 pr-3 flex items-center justify-between gap-2 border-b border-sidebar-border shrink-0">
          <a
            href="#/home"
            className="flex items-center gap-3 min-w-0 focus-visible:outline-2 focus-visible:outline-sidebar-accent rounded-lg"
          >
            <span className="w-9 h-9 rounded-lg bg-sidebar-surface border border-sidebar-accent/40 text-sidebar-accent flex items-center justify-center shrink-0">
              <Icon name="book" className="w-4 h-4" strokeWidth={1.85} />
            </span>
            <div className="min-w-0 text-left">
              <span className="block font-display text-[19px] font-semibold tracking-tight text-sidebar-text leading-none truncate">
                Library Rotation
              </span>
              <span className="block text-[11px] text-sidebar-muted font-medium truncate mt-1">
                {householdName || 'Home Library Studio'}
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

        {/* Configurable Frameless Sidebar Artwork */}
        {!sidebarCollapsed && artworkMode !== 'none' && (
          <div
            aria-hidden="true"
            data-sidebar-artwork-mode={artworkMode}
            data-sidebar-artwork-style={artworkStyle}
            className="relative mt-auto pt-4 pb-3 px-2 pointer-events-none select-none shrink-0 flex items-center justify-center"
            style={sidebarIllustrationVars}
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
                  className={`relative z-10 w-full h-32 ${
                    sidebarArtwork.isTransparent
                      ? 'object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.32)]'
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
                className={`w-full h-32 transition-opacity ${
                  artworkStyle === 'muted'
                    ? 'opacity-65'
                    : artworkStyle === 'natural'
                      ? 'opacity-95'
                      : 'opacity-85'
                }`}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom Active Reader Card (with Line or Ornamental Divider) */}
      <div
        className={`${sidebarCollapsed ? 'p-2.5 border-t border-sidebar-border' : 'px-3.5 pb-3.5 pt-2'} ${
          !sidebarCollapsed && dividerStyle === 'line' ? 'border-t border-sidebar-border pt-3.5' : ''
        } shrink-0 bg-sidebar`}
      >
        {!sidebarCollapsed && dividerStyle === 'illustration' && (
          <div
            aria-hidden="true"
            data-sidebar-divider="illustration"
            style={sidebarIllustrationVars}
            className="pb-2.5 flex items-center justify-center pointer-events-none select-none"
          >
            <BotanicalIllustration variant="sidebar-divider" className="w-full h-5 opacity-90" />
          </div>
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
    </aside>
  );
};
