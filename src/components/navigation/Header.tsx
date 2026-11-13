import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { formatProfileAgeLabel } from '../../types/models.js';

export const Header: React.FC = () => {
  const {
    currentRoute,
    activeProfile,
    setIsProfileSwitcherOpen,
    pwaStatus,
    setIsWelcomeModalOpen,
    t,
  } = useApp();

  const avatarTone = activeProfile?.avatarTone || 'teal';
  const toneClass = AVATAR_TONES[avatarTone] || AVATAR_TONES.teal;
  const initial = activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : 'R';
  const ageLabel = activeProfile ? formatProfileAgeLabel(activeProfile) : '';

  const navItems = [
    { id: 'home', label: t('nav.shelf') },
    { id: 'library', label: t('nav.library') },
    { id: 'scan', label: t('nav.addBookDesktop'), emphasize: true },
    { id: 'rotations', label: t('nav.rotations') },
    { id: 'play', label: t('nav.play') },
  ];

  return (
    <header className="sticky top-0 z-30 bg-ivory/95 dark:bg-night-900/95 backdrop-blur-md border-b border-linen-200/80 dark:border-night-700/80 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <a
            href="#/home"
            className="flex items-center gap-2.5 text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700 rounded-lg"
          >
            <span className="w-8 h-8 rounded-xl bg-forest-900 dark:bg-[#5ED3DA] text-linen-50 dark:text-night-950 flex items-center justify-center font-bold shadow-xs">
              <Icon name="book" className="w-4 h-4" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              Library Rotation
            </span>
          </a>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          aria-label="Desktop primary"
          className="hidden md:flex items-center gap-6"
        >
          {navItems.map((item) => {
            const isActive =
              item.id === currentRoute ||
              (item.id === 'rotations' && currentRoute === 'presets');

            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                className={`py-1 text-sm transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-forest-900 dark:text-[#5ED3DA] font-semibold underline underline-offset-8 decoration-2 decoration-forest-700 dark:decoration-[#5ED3DA]'
                    : 'font-medium text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white hover:underline hover:underline-offset-8'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Actions (Child Switcher, Settings, Install) */}
        <div className="flex items-center gap-2">
          {/* Active Reader Avatar Pill */}
          {activeProfile && (
            <button
              type="button"
              onClick={() => setIsProfileSwitcherOpen(true)}
              aria-label={`Switch child reader, current reader is ${activeProfile.name}`}
              className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 transition-colors"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-2xs ${toneClass}`}
              >
                {initial}
              </span>
              <div className="text-left hidden sm:block">
                <span className="text-xs font-bold text-forest-900 dark:text-white leading-none block">
                  {activeProfile.name}
                </span>
                {ageLabel && (
                  <span className="text-[10px] text-stone-ink dark:text-slate-400 leading-none">
                    {ageLabel}
                  </span>
                )}
              </div>
              <Icon name="chevronDown" className="w-3.5 h-3.5 text-stone-400" />
            </button>
          )}

          {/* Settings Shortcut */}
          <a
            href="#/settings"
            aria-label="Settings"
            className={`min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center transition-colors ${
              currentRoute === 'settings'
                ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                : 'text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-night-800'
            }`}
          >
            <Icon name="settings" className="w-4 h-4" />
          </a>
        </div>
      </div>
    </header>
  );
};
