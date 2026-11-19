import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';

export const BottomNav: React.FC = () => {
  const { state, currentRoute, t } = useApp();
  const useNativeChrome = state.settings?.nativeAppStyle !== false;

  const navItems = [
    {
      id: 'home',
      label: t('nav.shelf'),
      icon: 'home',
      emphasize: false,
    },
    {
      id: 'library',
      label: t('nav.library'),
      icon: 'library',
      emphasize: false,
    },
    {
      id: 'scan',
      label: t('nav.addBook'),
      icon: 'scan',
      emphasize: true,
    },
    {
      id: 'rotations',
      label: t('nav.rotations'),
      icon: 'rotations',
      emphasize: false,
    },
    {
      id: 'play',
      label: t('nav.play'),
      icon: 'dice',
      emphasize: false,
    },
  ];

  return (
    <nav
      aria-label="Mobile primary"
      data-native-chrome={useNativeChrome ? 'true' : 'false'}
      style={
        useNativeChrome
          ? { backgroundColor: 'color-mix(in srgb, var(--surface) 78%, transparent)' }
          : undefined
      }
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe px-safe ${
        useNativeChrome
          ? 'backdrop-blur-xl border-t border-edge/50 shadow-[0_-10px_28px_-8px_rgba(0,0,0,0.3)]'
          : 'bg-surface border-t border-edge shadow-lg'
      }`}
    >
      <div className="flex items-center justify-around h-14 px-1 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive =
            item.id === currentRoute ||
            (item.id === 'rotations' && currentRoute === 'presets');

          const iconStroke = isActive ? 2.2 : 1.75;

          if (item.emphasize) {
            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                data-nav-scan="true"
                aria-label="Scan or add books"
                aria-current={isActive ? 'page' : undefined}
                className="group relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] pb-1.5 focus-visible:outline-2 focus-visible:outline-primary"
              >
                {isActive && (
                  <span
                    data-nav-active-indicator="true"
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-primary rounded-full"
                  />
                )}
                <span
                  data-nav-scan-orb="true"
                  style={
                    !isActive && useNativeChrome
                      ? { backgroundColor: 'color-mix(in srgb, var(--surface-elevated) 82%, transparent)' }
                      : undefined
                  }
                  className={`-mt-5 mb-0.5 flex items-center justify-center transition-all active:scale-95 ${
                    useNativeChrome
                      ? 'w-12 h-12 rounded-2xl backdrop-blur-lg'
                      : 'w-11 h-11 rounded-xl'
                  } ${
                    isActive
                      ? 'bg-primary text-primary-fg shadow-[0_10px_24px_-4px_rgba(0,0,0,0.42)] ring-2 ring-accent/45 scale-[1.03]'
                      : useNativeChrome
                        ? 'text-ink border border-edge/85 shadow-[0_10px_24px_-4px_rgba(0,0,0,0.35)] group-hover:text-primary'
                        : 'bg-surface-elevated text-ink border border-edge shadow-xs ring-2 ring-surface group-hover:text-primary'
                  }`}
                >
                  <Icon name={item.icon} className="w-5 h-5" strokeWidth={iconStroke} />
                </span>
                <span
                  data-nav-label="true"
                  className={`text-[10px] leading-none tracking-tight whitespace-nowrap ${
                    isActive ? 'font-semibold text-primary' : 'font-medium text-ink-muted'
                  }`}
                >
                  {item.label}
                </span>
              </a>
            );
          }

          return (
            <a
              key={item.id}
              href={`#/${item.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] px-1 pb-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                isActive ? 'text-primary' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {isActive && (
                <span
                  data-nav-active-indicator="true"
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-primary rounded-full"
                />
              )}
              <span
                data-nav-icon-slot="true"
                className={`flex items-center justify-center h-6 mb-1 transition-transform duration-150 ${
                  isActive
                    ? useNativeChrome
                      ? 'scale-[1.06] drop-shadow-[0_2px_8px_color-mix(in_srgb,var(--primary)_45%,transparent)]'
                      : 'scale-[1.05]'
                    : 'group-hover:scale-105'
                }`}
              >
                <Icon name={item.icon} className="w-5 h-5" strokeWidth={iconStroke} />
              </span>
              <span
                data-nav-label="true"
                className={`text-[10px] leading-none tracking-tight whitespace-nowrap ${
                  isActive ? 'font-semibold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
};
