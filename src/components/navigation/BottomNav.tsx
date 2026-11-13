import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';

export const BottomNav: React.FC = () => {
  const { currentRoute, t } = useApp();

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
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-ivory/95 dark:bg-night-900/95 backdrop-blur-md border-t border-linen-200/80 dark:border-night-700/80 pb-safe px-safe shadow-lg"
    >
      <div className="flex items-center justify-around h-14 px-1 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive =
            item.id === currentRoute ||
            (item.id === 'rotations' && currentRoute === 'presets');

          const iconStroke = isActive ? 2.35 : 1.8;

          if (item.emphasize) {
            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                data-nav-scan="true"
                aria-label="Scan or add books"
                aria-current={isActive ? 'page' : undefined}
                className="group relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] pb-1.5 focus-visible:outline-2 focus-visible:outline-forest-700"
              >
                {isActive && (
                  <span
                    data-nav-active-indicator="true"
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2.5px] rounded-b-full bg-forest-700 dark:bg-[#5ED3DA]"
                  />
                )}
                <span
                  data-nav-scan-orb="true"
                  className={`-mt-6 mb-1 flex items-center justify-center w-12 h-12 rounded-full transition-all active:scale-95 ${
                    isActive
                      ? 'bg-forest-700 text-white shadow-md ring-4 ring-forest-700/20 dark:bg-[#5ED3DA] dark:text-night-950 dark:ring-[#5ED3DA]/25 scale-[1.04]'
                      : 'bg-linen-100 text-stone-ink border border-linen-200 shadow-sm ring-4 ring-ivory group-hover:text-forest-900 dark:bg-night-800 dark:text-slate-300 dark:border-night-700 dark:ring-night-900 dark:group-hover:text-white'
                  }`}
                >
                  <Icon name={item.icon} className="w-[22px] h-[22px]" strokeWidth={iconStroke} />
                </span>
                <span
                  data-nav-label="true"
                  className={`text-[10px] leading-none tracking-tight whitespace-nowrap ${
                    isActive
                      ? 'font-bold text-forest-700 dark:text-[#5ED3DA]'
                      : 'font-medium text-stone-ink/70 dark:text-slate-400'
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
              className={`group relative flex flex-col items-center justify-end h-full min-h-[48px] min-w-[48px] px-1 pb-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-forest-700 ${
                isActive
                  ? 'text-forest-700 dark:text-[#5ED3DA]'
                  : 'text-stone-ink/65 dark:text-slate-400 hover:text-forest-900 dark:hover:text-slate-100'
              }`}
            >
              {isActive && (
                <span
                  data-nav-active-indicator="true"
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2.5px] rounded-b-full bg-forest-700 dark:bg-[#5ED3DA]"
                />
              )}
              <span
                data-nav-icon-slot="true"
                className={`flex items-center justify-center h-6 mb-1 transition-transform duration-150 ${
                  isActive ? 'scale-[1.06]' : 'group-hover:scale-105'
                }`}
              >
                <Icon name={item.icon} className="w-5 h-5" strokeWidth={iconStroke} />
              </span>
              <span
                data-nav-label="true"
                className={`text-[10px] leading-none tracking-tight whitespace-nowrap ${
                  isActive ? 'font-bold' : 'font-medium'
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
