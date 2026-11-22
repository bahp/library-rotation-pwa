import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';

export const BottomNav: React.FC = () => {
  const { state, currentRoute, t } = useApp();
  const translucentBottomBar =
    state.settings?.translucentBottomBar ?? (state.settings?.nativeAppStyle !== false);
  const bottomNavStyle = state.settings?.bottomNavStyle === 'full' ? 'full' : 'floating';
  const isFloating = bottomNavStyle === 'floating';

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
      data-bottom-nav-style={bottomNavStyle}
      data-translucent-bottom={translucentBottomBar ? 'true' : 'false'}
      style={
        translucentBottomBar
          ? { backgroundColor: 'color-mix(in srgb, var(--surface) 82%, transparent)' }
          : undefined
      }
      className={
        isFloating
          ? `md:hidden fixed bottom-[max(0.6rem,env(safe-area-inset-bottom,0px))] inset-x-3 sm:inset-x-6 max-w-md mx-auto z-40 rounded-[22px] border shadow-nav-bottom transition-all ${
              translucentBottomBar
                ? 'backdrop-blur-xl border-edge/80'
                : 'bg-surface border-edge'
            }`
          : `md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe px-safe border-t transition-all ${
              translucentBottomBar
                ? 'backdrop-blur-xl border-edge/60 shadow-nav-bottom'
                : 'bg-surface border-edge shadow-lg'
            }`
      }
    >
      <div
        className={`flex items-center justify-around px-1.5 max-w-md mx-auto ${
          isFloating ? 'h-[58px]' : 'h-14'
        }`}
      >
        {navItems.map((item) => {
          const isActive =
            item.id === currentRoute ||
            (item.id === 'rotations' && currentRoute === 'presets');

          const iconStroke = isActive ? 2.2 : 1.75;

          if (item.emphasize && !isFloating) {
            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                data-nav-scan="true"
                aria-label="Scan or add books"
                aria-current={isActive ? 'page' : undefined}
                style={isActive ? { color: 'var(--nav-active)' } : undefined}
                className={`group relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] pb-1.5 focus-visible:outline-2 focus-visible:outline-primary ${
                  isActive ? '' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {isActive && (
                  <span
                    data-nav-active-indicator="true"
                    aria-hidden="true"
                    style={{ backgroundColor: 'var(--nav-active)' }}
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full"
                  />
                )}
                <span
                  data-nav-scan-orb="true"
                  style={
                    !isActive && translucentBottomBar
                      ? { backgroundColor: 'color-mix(in srgb, var(--surface-elevated) 84%, transparent)' }
                      : undefined
                  }
                  className={`relative z-10 -mt-5 mb-0.5 flex items-center justify-center transition-all active:scale-95 ${
                    translucentBottomBar
                      ? 'w-12 h-12 rounded-2xl backdrop-blur-lg'
                      : 'w-11 h-11 rounded-xl'
                  } ${
                    isActive
                      ? 'bg-primary text-primary-fg shadow-nav-fab ring-2 ring-accent/45 scale-[1.03]'
                      : translucentBottomBar
                        ? 'text-ink border border-edge/85 shadow-nav-fab-idle group-hover:text-primary'
                        : 'bg-surface-elevated text-ink border border-edge shadow-xs ring-2 ring-surface group-hover:text-primary'
                  }`}
                >
                  <Icon name={item.icon} className="w-5 h-5" strokeWidth={iconStroke} />
                </span>
                <span
                  data-nav-label="true"
                  style={isActive ? { color: 'var(--nav-active)' } : undefined}
                  className={`relative z-10 text-[10px] leading-none tracking-tight whitespace-nowrap ${
                    isActive ? 'font-semibold' : 'font-medium text-ink-muted'
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
              data-nav-scan={item.emphasize ? 'true' : undefined}
              aria-label={item.emphasize ? 'Scan or add books' : undefined}
              aria-current={isActive ? 'page' : undefined}
              style={isActive ? { color: 'var(--nav-active)' } : undefined}
              className={`group relative flex flex-col items-center justify-center h-full min-h-[48px] min-w-[48px] px-1 ${
                isFloating ? 'pb-1' : 'justify-end pb-1.5'
              } transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                isActive ? '' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {isActive && !isFloating && (
                <span
                  data-nav-active-indicator="true"
                  aria-hidden="true"
                  style={{ backgroundColor: 'var(--nav-active)' }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full"
                />
              )}
              <span
                data-nav-icon-slot="true"
                className={`relative flex items-center justify-center h-6 mb-0.5 transition-transform duration-150 ${
                  isActive ? 'scale-[1.06]' : 'group-hover:scale-105'
                }`}
              >
                <Icon name={item.icon} className="relative z-10 w-5 h-5" strokeWidth={iconStroke} />
              </span>
              <span
                data-nav-label="true"
                className={`relative z-10 text-[10px] leading-none tracking-tight whitespace-nowrap ${
                  isActive ? 'font-semibold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
              {isActive && isFloating && (
                <span
                  data-nav-active-indicator="true"
                  aria-hidden="true"
                  style={{ backgroundColor: 'var(--nav-active)' }}
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-7 h-[2.5px] rounded-full"
                />
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
};
