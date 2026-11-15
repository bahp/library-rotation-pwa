import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { formatProfileAgeLabel } from '../../types/models.js';
import type { RouteId } from '../../types/models.js';
import sidebarReadingArt from '../../assets/images/sidebar_reading_artwork_1794694074246.jpg';

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
  const [artFailed, setArtFailed] = useState(false);

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
        className={`group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] transition-all focus-visible:outline-2 focus-visible:outline-[#5ED3DA] ${
          isActive
            ? 'bg-white/14 text-white font-semibold shadow-2xs ring-1 ring-white/12'
            : 'text-[#C8D8D7] hover:text-white hover:bg-white/8 font-medium'
        }`}
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon
            name={item.icon}
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${
              isActive ? 'text-[#8AE4E9]' : 'text-[#9BB5B6] group-hover:text-white'
            }`}
            strokeWidth={isActive ? 2.15 : 1.85}
          />
          <span className="truncate">{item.label}</span>
        </span>
        {item.badge !== undefined && (
          <span
            className={`text-[11px] font-mono-tabular px-1.5 py-0.5 rounded-md ${
              isActive ? 'bg-white/15 text-white' : 'text-[#9BB5B6] group-hover:text-white'
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
      className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 z-30 bg-[#0F2F33] dark:bg-[#0B1518] text-white border-r border-[#19444A] dark:border-night-800 select-none overflow-hidden"
    >
      {/* Top Brand Identity */}
      <div className="h-16 px-5 flex items-center border-b border-white/10 shrink-0">
        <a
          href="#/home"
          className="flex items-center gap-3 min-w-0 focus-visible:outline-2 focus-visible:outline-[#5ED3DA] rounded-lg"
        >
          <span className="w-9 h-9 rounded-xl bg-white/12 border border-white/15 text-[#8AE4E9] flex items-center justify-center shrink-0">
            <Icon name="book" className="w-4 h-4" />
          </span>
          <div className="min-w-0 text-left">
            <span className="block font-display text-[17px] font-bold tracking-tight text-white leading-none truncate">
              Library Rotation
            </span>
            <span className="block text-[11px] text-[#9BB5B6] font-medium truncate mt-1">
              {householdName || 'Home Library Studio'}
            </span>
          </div>
        </a>
      </div>

      {/* Primary Workspace Navigation + Editorial Botanical Footer Art */}
      <div className="flex-1 overflow-y-auto px-3.5 pt-5 pb-2 flex flex-col justify-between gap-4 no-scrollbar">
        <div className="space-y-6">
          <nav aria-label="Workspace" className="space-y-1">
            <p className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#84A3A5]">
              Workspace
            </p>
            {primaryNav.map(renderNavLink)}
          </nav>

          <nav aria-label="Household & System" className="space-y-1">
            <p className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#84A3A5]">
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
              className="w-full group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium text-[#C8D8D7] hover:text-white hover:bg-white/8 transition-all focus-visible:outline-2 focus-visible:outline-[#5ED3DA] cursor-pointer"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  name="bell"
                  className="w-[18px] h-[18px] shrink-0 text-[#9BB5B6] group-hover:text-white transition-colors"
                  strokeWidth={1.85}
                />
                <span className="truncate">Notifications</span>
              </span>
              {unreadNotificationCount > 0 && (
                <span className="text-[11px] font-bold font-mono-tabular px-1.5 py-0.5 rounded-md bg-amber-400 text-night-950">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Quiet Editorial Literary Illustration Anchor */}
        <div
          aria-hidden="true"
          className="relative mt-auto pt-2 px-1 pointer-events-none select-none shrink-0"
        >
          <div className="relative rounded-2xl overflow-hidden bg-[#0D292D] dark:bg-[#0B1518] border border-white/8">
            {!artFailed ? (
              <img
                src={sidebarReadingArt}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setArtFailed(true)}
                className="w-full h-44 object-cover object-center opacity-90 mix-blend-lighten dark:mix-blend-normal"
              />
            ) : (
              <div className="w-full h-36 flex items-center justify-center text-[#5ED3DA]/30">
                <Icon name="book" className="w-10 h-10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F2F33] via-transparent to-[#0F2F33]/55 dark:from-[#0B1518] dark:to-[#0B1518]/55" />
          </div>
        </div>
      </div>

      {/* Bottom Active Reader Card */}
      <div className="p-3.5 border-t border-white/10 shrink-0 bg-[#0F2F33] dark:bg-[#0B1518]">
        {activeProfile ? (
          <button
            type="button"
            onClick={() => setIsProfileSwitcherOpen(true)}
            aria-label={`Switch active reader, currently ${activeProfile.name}`}
            className="w-full min-h-[48px] p-2.5 rounded-xl bg-white/8 hover:bg-white/12 active:scale-[0.99] border border-white/10 flex items-center justify-between gap-2.5 text-left transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-white/15 ${toneClass}`}
              >
                {initial}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {activeProfile.name}
                </p>
                <p className="text-[11px] text-[#9BB5B6] truncate leading-tight mt-0.5">
                  {ageLabel || 'Active reader'}
                </p>
              </div>
            </div>
            <Icon name="chevronDown" className="w-4 h-4 text-[#9BB5B6] shrink-0" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingProfileId(null);
              setIsProfileFormOpen(true);
            }}
            className="w-full min-h-[48px] p-2.5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-[0.99] border border-white/12 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Icon name="plus" className="w-4 h-4" />
            <span>Add Reader Profile</span>
          </button>
        )}
      </div>
    </aside>
  );
};
