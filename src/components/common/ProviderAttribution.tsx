import React from 'react';
import { cleanProviderExternalId } from '../../features/catalog/normalizer.js';
import type { ProviderSource } from '../../types/models.js';

interface ProviderAttributionProps {
  sources?: ProviderSource[];
  prefix?: string;
  includeExternalIds?: boolean;
  includeAi?: boolean;
  className?: string;
}

function formatProviderName(rawProvider: string): string {
  const id = rawProvider.trim().toLowerCase();
  if (id === 'google-books') return 'Google Books';
  if (id === 'open-library') return 'Open Library';
  if (id === 'manual') return 'Manual Entry';
  if (id === 'seed') return 'Starter Catalog';
  if (id.startsWith('ai:')) return `AI (${id.slice(3)})`;
  return rawProvider.trim() || 'Local Catalog';
}

const ProviderLogo: React.FC<{ providerId: string }> = ({ providerId }) => {
  const id = providerId.toLowerCase();

  if (id === 'google-books') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 shrink-0"
        aria-hidden="true"
        data-provider-logo="google-books"
      >
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09a6.97 6.97 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
        />
      </svg>
    );
  }

  if (id === 'open-library') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-3.5 h-3.5 shrink-0 text-amber-700 dark:text-amber-300"
        aria-hidden="true"
        data-provider-logo="open-library"
      >
        <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22.5v-17Z" />
        <path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5a2.5 2.5 0 0 1 2.5 2.5v-17Z" />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5 shrink-0 opacity-75"
      aria-hidden="true"
      data-provider-logo="local"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
};

export const ProviderAttribution: React.FC<ProviderAttributionProps> = ({
  sources = [],
  prefix,
  includeExternalIds = false,
  includeAi = false,
  className = '',
}) => {
  const list = Array.isArray(sources) ? sources : [];
  const uniqueMap = new Map<string, { id: string; label: string; externalId?: string }>();

  for (const item of list) {
    const rawId = String(item?.provider || '').trim();
    if (!rawId) continue;
    const lower = rawId.toLowerCase();
    if (!includeAi && lower.startsWith('ai:')) continue;
    const cleanedExt = cleanProviderExternalId(item?.externalId);
    const existing = uniqueMap.get(lower);
    if (!existing) {
      uniqueMap.set(lower, {
        id: lower,
        label: formatProviderName(rawId),
        ...(cleanedExt ? { externalId: cleanedExt } : {}),
      });
    } else if (!existing.externalId && cleanedExt) {
      existing.externalId = cleanedExt;
    }
  }

  const ordered: Array<{ id: string; label: string; externalId?: string }> = [];
  const gb = uniqueMap.get('google-books');
  const ol = uniqueMap.get('open-library');
  if (gb) ordered.push(gb);
  if (ol) ordered.push(ol);
  for (const [id, entry] of uniqueMap.entries()) {
    if (id === 'google-books' || id === 'open-library') continue;
    ordered.push(entry);
  }

  if (ordered.length === 0) {
    if (list.length === 0) return null;
    ordered.push({ id: 'manual', label: 'Manual Entry' });
  }

  const catalogEntries = ordered.filter(
    (entry) => entry.id === 'google-books' || entry.id === 'open-library'
  );
  const displayEntries = catalogEntries.length > 0 ? catalogEntries : ordered.slice(0, 2);

  return (
    <span
      data-provider-provenance={displayEntries.map((e) => e.id).join('+')}
      className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] leading-tight ${className}`}
    >
      {prefix && (
        <span className="text-stone-ink dark:text-slate-400 mr-0.5">{prefix}</span>
      )}
      {displayEntries.map((entry, idx) => (
        <React.Fragment key={`${entry.id}-${idx}`}>
          {idx > 0 && (
            <span aria-hidden="true" className="text-stone-ink/70 dark:text-slate-500 px-0.5">
              +
            </span>
          )}
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-forest-900 dark:text-slate-200">
            <ProviderLogo providerId={entry.id} />
            <span>{entry.label}</span>
            {includeExternalIds && entry.externalId && (
              <span
                className="font-mono-tabular text-[10px] text-stone-ink/75 dark:text-slate-400 select-all"
                title={`${entry.label} ID: ${entry.externalId}`}
              >
                ({entry.externalId})
              </span>
            )}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
};
