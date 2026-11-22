import React, { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES, resolveEffectiveThemeConfig } from '../../config/index.js';
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
    setIsNotificationCenterOpen,
    unreadNotificationCount,
    setIsSearchOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    submitGlobalSearch,
    navigate,
    sidebarCollapsed,
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

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme = resolveEffectiveThemeConfig(
    state.settings?.theme,
    state.settings?.themePreset,
    prefersDark
  );
  const isCurrentlyDark = effectiveTheme.mode === 'dark';
  const nextTheme: ThemeMode = isCurrentlyDark ? 'light' : 'dark';

  const handleToggleTheme = async () => {
    await store.updateSettings({ theme: nextTheme });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitGlobalSearch(globalSearchQuery);
  };

  const handleSearchChange = (val: string) => {
    setGlobalSearchQuery(val);
    if (currentRoute === 'library') {
      return;
    }
  };

  const useNativeChrome = state.settings?.nativeAppStyle !== false;

  return (
    <header
      data-top-header="true"
      data-native-chrome={useNativeChrome ? 'true' : 'false'}
      style={
        useNativeChrome
          ? { backgroundColor: 'color-mix(in srgb, var(--surface) 76%, transparent)' }
          : undefined
      }
      className={`fixed top-0 left-0 right-0 ${
        sidebarCollapsed ? 'lg:left-[76px]' : 'lg:left-64'
      } z-30 ${
        useNativeChrome
          ? 'backdrop-blur-xl border-b border-edge/60 shadow-nav-top'
          : 'bg-surface border-b border-edge-subtle'
      } pt-safe px-safe transition-[left,background-color,border-color] duration-200 ease-out`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Zone 1 (Mobile/Tablet): Bunko App Logo + Wordmark + Optional Household Name */}
        <a
          href="#/home"
          className="flex lg:hidden items-center gap-2.5 text-ink focus-visible:outline-2 focus-visible:outline-primary rounded-lg whitespace-nowrap shrink-0 min-w-0"
        >
          <span className="w-8 h-8 rounded-lg bg-primary text-primary-fg flex items-center justify-center shadow-2xs shrink-0 border border-accent/30">
            <Icon name="bookOpen" className="w-4 h-4" />
          </span>
          <span className="flex flex-col min-w-0">
            <span className="font-display text-[21px] font-semibold tracking-tight leading-none whitespace-nowrap">
              bunko
            </span>
            {state.settings?.householdName?.trim() && (
              <span className="text-[10px] font-medium text-ink-muted leading-tight truncate max-w-[150px] mt-0.5">
                {state.settings.householdName.trim()}
              </span>
            )}
          </span>
        </a>

        {/* Zone 1 (Desktop lg+): Global Live Search Bar */}
        <form
          onSubmit={handleSearchSubmit}
          role="search"
          aria-label="Global library search"
          className="hidden lg:flex items-center flex-1 max-w-md relative"
        >
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted">
            <Icon name="search" className="w-4 h-4" />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={globalSearchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search books, authors, ISBN, or topics…"
            aria-label="Search books, authors, ISBN, or topics"
            className="w-full h-10 pl-10 pr-14 rounded-lg bg-surface-subtle border border-edge text-[13px] text-ink placeholder:text-ink-muted focus:bg-surface focus:outline-none focus:border-primary transition-all"
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
              className="absolute right-2.5 p-1 rounded text-ink-muted hover:text-ink cursor-pointer"
            >
              <Icon name="close" className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="hidden xl:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-ink-muted bg-surface border border-edge rounded absolute right-2.5"
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
                    ? 'text-primary font-semibold underline underline-offset-8 decoration-2 decoration-primary'
                    : 'font-medium text-ink-secondary hover:text-ink'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Mobile (Search, Notifications, Clean Avatar) & Desktop Utilities */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Desktop Add Book & Theme Switch */}
          <a
            href="#/scan"
            onClick={(e) => {
              e.preventDefault();
              navigate('scan');
            }}
            className="hidden lg:inline-flex min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold items-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap"
          >
            <Icon name="plus" className="w-3.5 h-3.5" />
            <span>Add Book</span>
          </a>

          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={`Theme: ${effectiveTheme.label}. Switch to ${nextTheme} mode`}
            title={`Switch to ${nextTheme} mode (currently ${effectiveTheme.label})`}
            className="hidden lg:flex min-h-[38px] min-w-[38px] rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-ink-secondary hover:text-ink items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Icon name={isCurrentlyDark ? 'moon' : 'sun'} className="w-4 h-4" />
          </button>

          {/* Mobile & Tablet Search Trigger -> Opens Search & Add Window */}
          <button
            type="button"
            data-action="open-search-window"
            onClick={() => setIsSearchOpen(true)}
            aria-label="Search and add books"
            title="Search and add books"
            className="lg:hidden min-h-[44px] min-w-[44px] rounded-full text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <Icon name="search" className="w-5 h-5" strokeWidth={1.9} />
          </button>

          {/* Mobile & Tablet Notifications Trigger */}
          <button
            type="button"
            data-action="open-notifications"
            onClick={() => setIsNotificationCenterOpen(true)}
            aria-label={
              unreadNotificationCount > 0
                ? `Notifications (${unreadNotificationCount} unread)`
                : 'Notifications'
            }
            className="lg:hidden relative min-h-[44px] min-w-[44px] rounded-full text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <Icon name="bell" className="w-5 h-5" strokeWidth={1.9} />
            {unreadNotificationCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-fg text-[9px] font-bold font-mono-tabular flex items-center justify-center ring-2 ring-surface"
              >
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>

          {/* Mobile & Tablet Clean User Avatar (no decoration, no bounding box, no dropdown arrow) */}
          {activeProfile ? (
            <button
              type="button"
              data-action="open-profile-switcher"
              onClick={() => setIsProfileSwitcherOpen(true)}
              aria-label={`Reader profile and settings, current reader is ${activeProfile.name}`}
              className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full active:scale-95 transition-transform cursor-pointer shrink-0"
            >
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${toneClass}`}
              >
                {initial}
              </span>
            </button>
          ) : (
            <button
              type="button"
              data-action="open-profile-switcher"
              onClick={() => setIsProfileSwitcherOpen(true)}
              aria-label="Reader profiles and settings"
              className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full active:scale-95 transition-transform cursor-pointer shrink-0"
            >
              <span className="w-8 h-8 rounded-full bg-surface-elevated text-ink-secondary flex items-center justify-center">
                <Icon name="profiles" className="w-4 h-4" />
              </span>
            </button>
          )}

          {/* Desktop Profile Switcher */}
          {activeProfile ? (
            <button
              type="button"
              onClick={() => setIsProfileSwitcherOpen(true)}
              aria-label={`Switch reader profile, current reader is ${activeProfile.name}`}
              className="hidden lg:flex min-h-[38px] max-w-[230px] items-center gap-2 pl-1.5 pr-2.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated active:scale-[0.98] border border-edge transition-all cursor-pointer shrink-0 overflow-hidden"
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${toneClass}`}
              >
                {initial}
              </span>
              <span className="flex items-baseline gap-1 min-w-0 text-left">
                <span className="text-xs font-semibold text-ink leading-tight truncate max-w-[100px]">
                  {activeProfile.name}
                </span>
                {ageLabel && (
                  <span className="hidden xl:inline text-[10px] font-medium text-ink-muted leading-tight shrink-0 whitespace-nowrap">
                    {ageLabel}
                  </span>
                )}
              </span>
              <Icon name="chevronDown" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingProfileId(null);
                setIsProfileFormOpen(true);
              }}
              className="hidden lg:flex min-h-[38px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated active:scale-[0.98] border border-edge text-xs font-semibold text-ink items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              <span>{t('profiles.newReader')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

