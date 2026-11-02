/**
 * @fileoverview Provider provenance helpers & inline brand/catalog marks for displaying
 * whether a book's metadata was retrieved from Google Books, Open Library, both, or entered manually.
 */

import { escapeHtml } from '../../types/models.js';
import { cleanProviderExternalId } from '../../features/catalog/normalizer.js';

/**
 * Formats a single provider identifier into a human-readable label.
 * @param {string | undefined | null} rawProvider
 * @returns {string}
 */
export function formatSingleProviderName(rawProvider) {
  const id = String(rawProvider || '').trim().toLowerCase();
  if (id === 'google-books') return 'Google Books';
  if (id === 'open-library') return 'Open Library';
  if (id === 'manual') return 'Manual Entry';
  if (id === 'seed') return 'Starter Catalog';
  if (!id) return 'Local Catalog';
  return String(rawProvider || '').trim();
}

/**
 * Renders a crisp inline 14x14 provider mark SVG.
 * @param {string} providerId
 * @returns {string}
 */
export function renderProviderLogoSvg(providerId) {
  const id = String(providerId || '').trim().toLowerCase();

  if (id === 'google-books') {
    // Recognizable multicolor Google "G" mark (14x14)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-3.5 h-3.5 shrink-0" aria-hidden="true" data-provider-logo="google-books"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/><path fill="#FBBC05" d="M5.84 14.09a6.97 6.97 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"/></svg>`;
  }

  if (id === 'open-library') {
    // Archival open-book emblem for Open Library (14x14)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" data-provider-logo="open-library"><path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22.5v-17Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5a2.5 2.5 0 0 1 2.5 2.5v-17Z"/></svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 shrink-0 opacity-75" aria-hidden="true" data-provider-logo="local"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>`;
}

/**
 * Inspects a book's or candidate's `sources` array and summarizes whether it was retrieved from
 * Google Books, Open Library, both (`google-books+open-library`), or local/manual entry.
 * @param {Array<{ provider: string, externalId?: string }> | undefined | null} sources
 * @returns {{
 *   key: string,
 *   hasGoogleBooks: boolean,
 *   hasOpenLibrary: boolean,
 *   isBothCatalogs: boolean,
 *   orderedProviders: Array<{ id: string, label: string, externalId?: string }>,
 *   summaryText: string
 * }}
 */
export function describeProviderProvenance(sources) {
  const list = Array.isArray(sources) ? sources : [];
  /** @type {Map<string, { id: string, label: string, externalId?: string }>} */
  const uniqueMap = new Map();

  for (const item of list) {
    const rawId = String(item?.provider || '').trim();
    if (!rawId) continue;
    const lower = rawId.toLowerCase();
    const cleanedExternalId = cleanProviderExternalId(item?.externalId);
    const existing = uniqueMap.get(lower);
    if (!existing) {
      uniqueMap.set(lower, {
        id: lower,
        label: formatSingleProviderName(rawId),
        ...(cleanedExternalId ? { externalId: cleanedExternalId } : {}),
      });
    } else if (!existing.externalId && cleanedExternalId) {
      existing.externalId = cleanedExternalId;
    }
  }

  const hasGoogleBooks = uniqueMap.has('google-books');
  const hasOpenLibrary = uniqueMap.has('open-library');
  const isBothCatalogs = hasGoogleBooks && hasOpenLibrary;

  /** @type {Array<{ id: string, label: string, externalId?: string }>} */
  const orderedProviders = [];
  if (hasGoogleBooks) {
    const gb = uniqueMap.get('google-books');
    if (gb) orderedProviders.push(gb);
  }
  if (hasOpenLibrary) {
    const ol = uniqueMap.get('open-library');
    if (ol) orderedProviders.push(ol);
  }

  for (const [id, entry] of uniqueMap.entries()) {
    if (id === 'google-books' || id === 'open-library') continue;
    orderedProviders.push(entry);
  }

  if (orderedProviders.length === 0) {
    orderedProviders.push({ id: 'manual', label: 'Manual Entry' });
  }

  const catalogEntries = orderedProviders.filter(
    (p) => p.id === 'google-books' || p.id === 'open-library'
  );
  const primaryEntries = catalogEntries.length > 0 ? catalogEntries : orderedProviders;

  const key = isBothCatalogs
    ? 'google-books+open-library'
    : primaryEntries.map((p) => p.id).join('+');

  const summaryText = primaryEntries.map((p) => p.label).join(' + ');

  return {
    key,
    hasGoogleBooks,
    hasOpenLibrary,
    isBothCatalogs,
    orderedProviders,
    summaryText,
  };
}

/**
 * Renders unboxed inline provider attribution (logo + readable name, joined with `+` when merged from both).
 * @param {Array<{ provider: string, externalId?: string }> | undefined | null} sources
 * @param {{
 *   prefix?: string,
 *   includeExternalIds?: boolean
 * }} [options]
 * @returns {string}
 */
export function renderProviderAttribution(sources, options = {}) {
  const info = describeProviderProvenance(sources);
  const catalogEntries = info.orderedProviders.filter(
    (p) => p.id === 'google-books' || p.id === 'open-library'
  );
  const displayEntries = catalogEntries.length > 0 ? catalogEntries : info.orderedProviders.slice(0, 2);

  const itemsHtml = displayEntries
    .map((entry) => {
      const extSuffix =
        options.includeExternalIds && entry.externalId
          ? ` <span class="font-mono-tabular text-[10px] opacity-75">(${escapeHtml(entry.externalId)})</span>`
          : '';
      return `<span class="inline-flex items-center gap-1 whitespace-nowrap font-medium text-forest-900 dark:text-slate-200">${renderProviderLogoSvg(
        entry.id
      )}<span>${escapeHtml(entry.label)}</span>${extSuffix}</span>`;
    })
    .join('<span aria-hidden="true" class="text-stone-ink/75 dark:text-slate-500 px-0.5">+</span>');

  const prefixHtml = options.prefix
    ? `<span class="text-stone-ink dark:text-slate-400 mr-1">${escapeHtml(options.prefix)}</span>`
    : '';

  return `<span data-provider-provenance="${escapeHtml(
    info.key
  )}" class="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] leading-tight">${prefixHtml}${itemsHtml}</span>`;
}
