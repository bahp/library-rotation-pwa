import React, { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { formatProfileAgeLabel } from '../../types/models.js';
import type { ThemeMode } from '../../types/models.js';

export const Header: React.FC = () => {
  const {
    state,
    store,
    currentRoute,
    activeProfile,
    setIsProfileSwitcherOpen,
    setIsProfileFormOpen,
    setEditingProfileId,
    globalSearchQuery,
    setGlobalSearchQuery,
    submitGlobalSearch,
    navigate,
    t,
  } = useApp();

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard "/" shortcut focuses global search on desktop when not typing in another field
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }
      if (searchInputRef.current && window.innerWidth >= 1024) {
        e.preventDefault();
        searchInputRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const avatarTone = activeProfile?.avatarTone || 'teal';
  const toneClass = AVATAR_TONES[avatarTone] || AVATAR_TONES.teal;
  const initial = activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : 'R';
  const ageLabel = activeProfile ? formatProfileAgeLabel(activeProfile) : '';

  const navItems = [
    { id: 'home', label: t('nav.shelf') },
    { id: 'library', label: t('nav.library') },
    { id: 'scan', label: t('nav.addBookDesktop') },
    { id: 'rotations', label: t('nav.rotations') },
    { id: 'play', label: t('nav.play') },
  ];

  const currentTheme: ThemeMode = state.settings?.theme || 'system';
  const nextTheme: ThemeMode =
    currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'system' : 'light';

  const handleCycleTheme = async () => {
    await store.updateSettings({ theme: nextTheme });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitGlobalSearch(globalSearchQuery);
  };

  const handleSearchChange = (val: string) => {
    setGlobalSearchQuery(val);
    if (currentRoute === 'library') {
      // Live-sync query while on Library without jumping scroll
      return;
    }
  };

  return (
    <header
      data-top-header="true"
      className="fixed top-0 left-0 right-0 lg:left-64 z-30 bg-white/95 dark:bg-night-900/95 backdrop-blur-md border-b border-linen-200/90 dark:border-night-800 pt-safe px-safe transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Zone 1 (Mobile/Tablet): Brand Wordmark */}
        <a
          href="#/home"
          className="flex lg:hidden items-center gap-2.5 text-forest-900 dark:text-white focus-visible:outline-2 focus-visible:outline-forest-700 rounded-lg whitespace-nowrap shrink-0"
        >
          <span className="w-8 h-8 rounded-lg bg-forest-900 dark:bg-[#5ED3DA] text-white dark:text-night-950 flex items-center justify-center shadow-2xs shrink-0">
            <Icon name="book" className="w-4 h-4" />
          </span>
          <span className="font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap">
            Library Rotation
          </span>
        </a>

        {/* Zone 1 (Desktop lg+): Global Live Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          role="search"
          aria-label="Global library search"
          className="hidden lg:flex items-center flex-1 max-w-md relative"
        >
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-stone-ink/75 dark:text-slate-400">
            <Icon name="search" className="w-4 h-4" />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={globalSearchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search books, authors, ISBN, or topics…"
            aria-label="Search books, authors, ISBN, or topics"
            className="w-full h-10 pl-10 pr-14 rounded-xl bg-linen-50/90 dark:bg-night-950 border border-linen-200/90 dark:border-night-700 text-[13px] text-forest-900 dark:text-white placeholder:text-stone-ink/65 dark:placeholder:text-slate-400 focus:bg-white dark:focus:bg-night-900 focus:outline-none focus:ring-2 focus:ring-forest-700/25 focus:border-forest-700 transition-all"
          />
          {globalSearchQuery ? (
            <button
              type="button"
              onClick={() => {
                setGlobalSearchQuery('');
                if (currentRoute === 'library') {
                  navigate('library');
                }
              }}
              aria-label="Clear search"
              className="absolute right-2.5 p-1 rounded-md text-stone-ink/70 hover:text-forest-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              <Icon name="close" className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="hidden xl:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-stone-ink/70 dark:text-slate-400 bg-white dark:bg-night-800 border border-linen-200 dark:border-night-700 rounded-md absolute right-2.5"
            >
              /
            </kbd>
          )}
        </form>

        {/* Zone 2 (Tablet md only): Compact Primary Nav Links */}
        <nav
          aria-label="Tablet primary"
          className="hidden md:flex lg:hidden items-center gap-4"
        >
          {navItems.map((item) => {
            const isActive =
              item.id === currentRoute ||
              (item.id === 'rotations' && currentRoute === 'presets');

            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                className={`py-1.5 text-sm transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'text-forest-900 dark:text-[#5ED3DA] font-semibold underline underline-offset-8 decoration-2 decoration-forest-700 dark:decoration-[#5ED3DA]'
                    : 'font-medium text-stone-ink dark:text-slate-300 hover:text-forest-900 dark:hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Quick Actions, Theme Switch, Reader Switcher & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <a
            href="#/scan"
            onClick={(e) => {
              e.preventDefault();
              navigate('scan');
            }}
            className="hidden lg:inline-flex min-h-[38px] px-3.5 py-1.5 rounded-xl bg-forest-900 hover:bg-forest-800 dark:bg-[#5ED3DA] dark:text-night-950 dark:hover:bg-[#4bc2c9] text-white text-xs font-semibold items-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>Add Book</span>
          </a>

          <button
            type="button"
            onClick={handleCycleTheme}
            aria-label={`Theme: ${currentTheme}. Switch to ${nextTheme}`}
            title={`Appearance: ${currentTheme} (click to switch to ${nextTheme})`}
            className="hidden sm:flex min-h-[38px] min-w-[38px] rounded-xl border border-linen-200/90 dark:border-night-700 bg-linen-50/80 hover:bg-linen-100 dark:bg-night-800 dark:hover:bg-night-700 text-stone-ink hover:text-forest-900 dark:text-slate-300 dark:hover:text-white items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Icon name={currentTheme === 'dark' ? 'moon' : 'sun'} className="w-4 h-4" />
          </button>

          {activeProfile ? (
            <button
              type="button"
              onClick={() => setIsProfileSwitcherOpen(true)}
              aria-label={`Switch child reader, current reader is ${activeProfile.name}`}
              className="min-h-[48px] sm:min-h-[38px] flex items-center gap-2 px-2.5 sm:pl-1.5 sm:pr-2.5 rounded-xl bg-linen-50 hover:bg-linen-100 active:scale-[0.97] dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200/90 dark:border-night-700 transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${toneClass}`}
              >
                {initial}
              </span>
              <span className="text-left hidden sm:block">
                <span className="text-xs font-bold text-forest-900 dark:text-white leading-none block max-w-[96px] truncate">
                  {activeProfile.name}
                </span>
                {ageLabel && (
                  <span className="text-[10px] text-stone-ink dark:text-slate-400 leading-none">
                    {ageLabel}
                  </span>
                )}
              </span>
              <Icon name="chevronDown" className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingProfileId(null);
                setIsProfileFormOpen(true);
              }}
              className="min-h-[48px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 active:scale-[0.97] dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              <span>{t('profiles.newReader')}</span>
            </button>
          )}

          {/* Settings button (compact bar utility on mobile & tablet; sidebar holds Settings on lg+) */}
          <a
            href="#/settings"
            aria-label={t('nav.settings')}
            aria-current={currentRoute === 'settings' ? 'page' : undefined}
            className={`lg:hidden min-h-[48px] min-w-[48px] sm:min-h-[42px] sm:min-w-[42px] rounded-xl flex items-center justify-center active:scale-95 transition-all shrink-0 ${
              currentRoute === 'settings'
                ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                : 'text-stone-ink hover:text-forest-900 hover:bg-linen-100 active:bg-linen-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-night-800 dark:active:bg-night-800'
            }`}
          >
            <Icon name="settings" className="w-[18px] h-[18px]" />
          </a>
        </div>
      </div>
    </header>
  );
};
