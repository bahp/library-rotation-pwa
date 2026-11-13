import React from 'react';
import type { ProviderSource } from '../../types/models.js';

interface ProviderAttributionProps {
  sources?: ProviderSource[];
  className?: string;
}

export const ProviderAttribution: React.FC<ProviderAttributionProps> = ({
  sources = [],
  className = '',
}) => {
  if (!sources || sources.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {sources.map((src, idx) => {
        const label =
          src.provider === 'google-books'
            ? 'Google Books'
            : src.provider === 'open-library'
              ? 'Open Library'
              : src.provider.startsWith('ai:')
                ? `AI: ${src.provider.replace('ai:', '')}`
                : src.provider === 'manual'
                  ? 'Manual Entry'
                  : src.provider;

        const colorClass =
          src.provider === 'google-books'
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            : src.provider === 'open-library'
              ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              : src.provider.startsWith('ai:')
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-linen-100 text-stone-600 dark:bg-night-800 dark:text-slate-300 border-linen-200 dark:border-night-700';

        return (
          <span
            key={`${src.provider}-${idx}`}
            className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${colorClass}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
};
