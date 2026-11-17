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
      className="group cursor-pointer rounded-xl bg-surface border border-edge overflow-hidden shadow-2xs hover:shadow-md hover:border-primary/40 transition-all flex flex-col justify-between"
    >
      {/* Visual Banner */}
      <div className="relative aspect-[16/9] w-full bg-surface-elevated overflow-hidden">
        {app.imageUrl && !bannerError ? (
          <img
            src={app.imageUrl}
            alt={app.previewImageAlt || app.title}
            onError={() => setBannerError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-subtle">
            <Icon name={app.logoIcon || 'dice'} className="w-14 h-14 text-primary/35" />
          </div>
        )}

        <div className="absolute top-3 left-3 z-10">
          <span className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider bg-surface/95 text-ink shadow-xs backdrop-blur-xs border border-edge">
            {app.badgeLabel}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {/* App Logo Badge */}
            <span className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-edge bg-surface-subtle text-primary flex items-center justify-center shadow-2xs">
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary truncate">
                {app.subtitle}
              </p>
              <h3 className="font-display text-lg font-semibold text-ink leading-snug truncate">
                {app.title}
              </h3>
            </div>
          </div>

          <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2">
            {app.description}
          </p>
        </div>

        <div className="pt-3 border-t border-edge-subtle flex justify-center">
          <span className="w-full min-h-[42px] px-4 py-2.5 rounded-lg bg-primary text-primary-fg font-semibold text-xs inline-flex items-center justify-center gap-2 group-hover:bg-primary-hover transition-colors shadow-2xs">
            <Icon name={app.logoIcon || 'play'} className="w-4 h-4" />
            <span>{app.ctaLabel || 'Launch'}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
