import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { AVATAR_TONES, resolveEffectiveThemeConfig } from '../../config/index.js';
import { formatProfileAgeLabel } from '../../types/models.js';
import type { RouteId } from '../../types/models.js';
import sidebarArtworkImg from '../../assets/images/sidebar_reading_artwork_1794694074246.jpg';

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
    t,
  } = useApp();

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
    state.settings?.sidebarArtworkMode === 'illustration'
      ? state.settings.sidebarArtworkMode
      : effectiveTheme.sidebarArtworkDefault;

  const renderNavLink = (item: {
    id: RouteId;
    label: string;
    icon: string;
    badge?: number;
  }) => {
    const isActive = item.id === currentRoute;
    return (
      <a
        key={item.id}
        href={`#/${item.id}`}
        aria-current={isActive ? 'page' : undefined}
        className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-accent ${
          isActive
            ? 'bg-sidebar-active text-sidebar-text font-semibold border border-sidebar-accent/30'
            : 'text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface/65 font-medium border border-transparent'
        }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon
            name={item.icon}
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${
              isActive
                ? 'text-sidebar-accent'
                : 'text-sidebar-muted group-hover:text-sidebar-text'
            }`}
            strokeWidth={isActive ? 2.1 : 1.75}
          />
          <span className="truncate">{item.label}</span>
        </span>
        {item.badge !== undefined && (
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
      className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 z-30 bg-sidebar text-sidebar-text border-r border-sidebar-border select-none overflow-hidden"
    >
      {/* Top Brand Identity */}
      <div className="h-16 px-5 flex items-center border-b border-sidebar-border shrink-0">
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
      </div>

      {/* Primary Workspace Navigation + Editorial Botanical Footer Art */}
      <div className="flex-1 overflow-y-auto px-3.5 pt-5 pb-2 flex flex-col justify-between gap-4 no-scrollbar">
        <div className="space-y-6">
          <nav aria-label="Workspace" className="space-y-1">
            <p className="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted/80">
              Workspace
            </p>
            {primaryNav.map(renderNavLink)}
          </nav>

          <nav aria-label="Household & System" className="space-y-1">
            <p className="px-3.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted/80">
              Household
            </p>
            {householdNav.map(renderNavLink)}
            <button
              type="button"
              onClick={() => setIsNotificationCenterOpen(true)}
              aria-label={
                unreadNotificationCount > 0
                  ? `Notifications (${unreadNotificationCount} unread)`
                  : 'Notifications'
              }
              className="w-full group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-[13.5px] font-medium text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-surface/65 transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-accent cursor-pointer"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  name="bell"
                  className="w-[18px] h-[18px] shrink-0 text-sidebar-muted group-hover:text-sidebar-text transition-colors"
                  strokeWidth={1.75}
                />
                <span className="truncate">Notifications</span>
              </span>
              {unreadNotificationCount > 0 && (
                <span className="text-[11px] font-bold font-mono-tabular px-1.5 py-0.5 rounded bg-sidebar-accent text-sidebar">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Configurable Sidebar Footer Artwork */}
        <div
          aria-hidden="true"
          className="relative mt-auto pt-2 px-1 pointer-events-none select-none shrink-0"
          style={
            {
              '--text-primary': 'var(--sidebar-text)',
              '--primary': 'var(--sidebar-accent)',
              '--secondary': 'var(--sidebar-muted)',
              '--accent': 'var(--sidebar-accent)',
              '--border': 'var(--sidebar-border)',
              '--surface': 'var(--sidebar-surface)',
              '--surface-elevated': 'var(--sidebar-active-bg)',
              '--surface-subtle': 'var(--sidebar-bg)',
              '--text-muted': 'var(--sidebar-muted)',
            } as React.CSSProperties
          }
        >
          {artworkMode === 'illustration' ? (
            <div className="relative overflow-hidden rounded-xl border border-sidebar-border/80 bg-sidebar-surface/50 shadow-sm">
              <img
                src={sidebarArtworkImg}
                alt=""
                className="w-full h-32 object-cover opacity-90"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sidebar/70 via-transparent to-transparent" />
            </div>
          ) : (
            <BotanicalIllustration variant="hero-library" className="w-full h-32 opacity-85" />
          )}
        </div>
      </div>

      {/* Bottom Active Reader Card */}
      <div className="p-3.5 border-t border-sidebar-border shrink-0 bg-sidebar">
        {activeProfile ? (
          <button
            type="button"
            onClick={() => setIsProfileSwitcherOpen(true)}
            aria-label={`Switch active reader, currently ${activeProfile.name}`}
            className="w-full min-h-[48px] p-2.5 rounded-lg bg-sidebar-surface/75 hover:bg-sidebar-surface active:scale-[0.99] border border-sidebar-border flex items-center justify-between gap-2.5 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-sidebar-accent/40 ${toneClass}`}
              >
                {initial}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sidebar-text truncate leading-tight">
                  {activeProfile.name}
                </p>
                <p className="text-[11px] text-sidebar-muted truncate leading-tight mt-0.5">
                  {ageLabel || 'Active reader'}
                </p>
              </div>
            </div>
            <Icon name="chevronDown" className="w-4 h-4 text-sidebar-muted shrink-0" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingProfileId(null);
              setIsProfileFormOpen(true);
            }}
            className="w-full min-h-[48px] p-2.5 rounded-lg bg-sidebar-surface/75 hover:bg-sidebar-surface active:scale-[0.99] border border-sidebar-border text-xs font-semibold text-sidebar-text flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Icon name="plus" className="w-4 h-4 text-sidebar-accent" />
            <span>Add Reader Profile</span>
          </button>
        )}
      </div>
    </aside>
  );
};
