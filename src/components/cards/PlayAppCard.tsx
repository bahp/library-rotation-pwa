import React, { useState } from 'react';
import { Icon } from '../common/Icon.js';
import type { PlayAppConfig } from '../../config/play-apps.js';

interface PlayAppCardProps {
  app: PlayAppConfig;
  onOpen: (appId: string) => void;
}

export const PlayAppCard: React.FC<PlayAppCardProps> = ({ app, onOpen }) => {
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  return (
    <div
      data-action="open-play-app"
      data-play-app-id={app.id}
      onClick={() => onOpen(app.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(app.id);
        }
      }}
      className="group cursor-pointer rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
    >
      {/* Visual Banner */}
      <div className="relative aspect-[16/9] w-full bg-linen-100 dark:bg-night-800 overflow-hidden">
        {app.imageUrl && !bannerError ? (
          <img
            src={app.imageUrl}
            alt={app.previewImageAlt || app.title}
            onError={() => setBannerError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-forest-900/10 to-forest-700/20 dark:from-night-800 dark:to-night-700">
            <Icon name={app.logoIcon || 'dice'} className="w-14 h-14 text-forest-800/40 dark:text-[#5ED3DA]/40" />
          </div>
        )}

        <div className="absolute top-3 left-3 z-10">
          <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/95 dark:bg-night-900/95 text-forest-900 dark:text-white shadow-xs backdrop-blur-xs">
            {app.badgeLabel}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {/* App Logo Badge */}
            <span className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-linen-200 dark:border-night-700 bg-linen-100 dark:bg-night-800 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center shadow-2xs">
              <Icon name={app.logoIcon || 'play'} className="w-5 h-5" />
              {app.logoUrl && !logoError && (
                <img
                  src={app.logoUrl}
                  alt={`${app.title} logo`}
                  onError={() => setLogoError(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA] truncate">
                {app.subtitle}
              </p>
              <h3 className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white leading-snug truncate">
                {app.title}
              </h3>
            </div>
          </div>

          <p className="text-xs text-stone-600 dark:text-slate-300 leading-relaxed line-clamp-2">
            {app.description}
          </p>
        </div>

        <div className="pt-3 border-t border-linen-200/70 dark:border-night-800 flex justify-center">
          <span className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs inline-flex items-center justify-center gap-2 group-hover:bg-forest-800 dark:group-hover:bg-[#4bc2c9] transition-colors shadow-2xs">
            <Icon name={app.logoIcon || 'play'} className="w-4 h-4" />
            <span>{app.ctaLabel || 'Launch'}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
