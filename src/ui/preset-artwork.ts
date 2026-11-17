/**
 * @fileoverview Unified Collection Artwork Library & resolver for Starter Presets & Custom Collections.
 *
 * Combines:
 * - All 42 bespoke transparent editorial storybook illustrations (`/public/assets/illustrations/presets/<slug>.png`)
 * - All 6 classic paper-backed watercolor corner illustrations (`/src/assets/images/preset_corner_*.jpg`)
 *   for legacy backwards compatibility and fallback resilience.
 */

import winterArt from '../assets/images/preset_corner_winter_1794779892509.jpg';
import springArt from '../assets/images/preset_corner_spring_1794779892702.jpg';
import summerArt from '../assets/images/preset_corner_summer_1794779893333.jpg';
import autumnArt from '../assets/images/preset_corner_autumn_1794779892853.jpg';
import bedtimeArt from '../assets/images/preset_corner_bedtime_1794779892315.jpg';
import wonderArt from '../assets/images/preset_corner_wonder_1794779892751.jpg';
import {
  COLLECTION_ILLUSTRATIONS,
  PRESET_ILLUSTRATION_MAP,
  getIllustrationById,
  getSuggestedIllustrationForPreset,
  isLegacyOpaqueArtworkUrl,
} from '../config/illustrations.js';
import { DEFAULT_ROTATION_PRESETS } from '../config/presets.js';
import type { PresetCategory } from '../types/models.js';

export type ArtworkLibraryCategory =
  | 'seasonal-holidays'
  | 'cultural-traditions'
  | 'evergreen'
  | 'classic-watercolors';

export interface PresetArtworkOption {
  id: string;
  label: string;
  subject: string;
  src: string;
  path?: string;
  category: ArtworkLibraryCategory;
  keywords: string[];
  isTransparent: boolean;
  associatedPresetTitles: string[];
}

export interface ResolvedPresetArtworkInfo {
  primaryUrl: string;
  fallbackUrl: string;
  artworkId: string;
  label: string;
  subject: string;
  isLegacyOpaque: boolean;
  isCustomUrl: boolean;
  suggestedId: string;
  suggestedLabel: string;
  suggestedUrl: string;
}

/**
 * Resolves a static asset path stored under `public/` using Vite's configured `BASE_URL`
 * so GitHub Pages subpath builds (`/repo-name/`) and `./` relative builds both load reliably.
 */
export function resolvePublicAssetUrl(relativePath: string): string {
  const clean = String(relativePath || '').trim().replace(/^\.\//, '').replace(/^\//, '');
  if (!clean) return '';
  const base =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) ||
    './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${clean}`;
}

export const LEGACY_WATERCOLOR_ARTWORK: ReadonlyArray<PresetArtworkOption> = [
  {
    id: 'winter',
    label: 'Classic Winter Pine',
    subject: 'Soft watercolor pine bough & winter berries',
    src: winterArt,
    category: 'classic-watercolors',
    keywords: ['winter', 'snow', 'snowflake', 'pine-star', 'christmas', 'hanukkah', 'menorah', 'solstice', 'kwanzaa', 'cozy', 'cold', 'classic'],
    isTransparent: false,
    associatedPresetTitles: [],
  },
  {
    id: 'spring',
    label: 'Classic Spring Blossom',
    subject: 'Soft watercolor spring blossoms & tender shoots',
    src: springArt,
    category: 'classic-watercolors',
    keywords: ['spring', 'blossom', 'sprout', 'nowruz', 'earth', 'book-rose', 'sant jordi', 'garden', 'butterflies', 'flower', 'classic'],
    isTransparent: false,
    associatedPresetTitles: [],
  },
  {
    id: 'summer',
    label: 'Classic Summer Coast',
    subject: 'Soft watercolor coastal shells & sunny horizon',
    src: summerArt,
    category: 'classic-watercolors',
    keywords: ['summer', 'sun', 'ocean', 'beach', 'sea', 'kite', 'children', 'kodomo', 'carnival', 'water', 'outdoors', 'classic'],
    isTransparent: false,
    associatedPresetTitles: [],
  },
  {
    id: 'autumn',
    label: 'Classic Autumn Harvest',
    subject: 'Soft watercolor autumn foliage & harvest fruit',
    src: autumnArt,
    category: 'classic-watercolors',
    keywords: ['autumn', 'fall', 'leaf', 'harvest', 'pumpkin', 'halloween', 'marigold', 'muertos', 'thanksgiving', 'acorn', 'diwali', 'diya', 'classic'],
    isTransparent: false,
    associatedPresetTitles: [],
  },
  {
    id: 'bedtime',
    label: 'Classic Quiet Bedtime',
    subject: 'Soft watercolor twilight stars & crescent moon',
    src: bedtimeArt,
    category: 'classic-watercolors',
    keywords: ['bedtime', 'bedtime-moon', 'moon', 'moon-star', 'moon-rabbit', 'night', 'sleep', 'ramadan', 'eid', 'mid-autumn', 'lantern', 'calm', 'heart', 'classic'],
    isTransparent: false,
    associatedPresetTitles: [],
  },
  {
    id: 'wonder',
    label: 'Classic Curious Wonder',
    subject: 'Soft watercolor storybook curiosities & wonder',
    src: wonderArt,
    category: 'classic-watercolors',
    keywords: ['wonder', 'compass', 'rocket', 'space', 'science', 'stem', 'school', 'dinosaur', 'sparkles', 'laugh', 'read', 'discovery', 'adventure', 'classic'],
    isTransparent: false,
    associatedPresetTitles: [],
  },
];

// Keep backwards-compatible export symbol intact
export const PRESET_ARTWORK_LIBRARY: ReadonlyArray<PresetArtworkOption> = LEGACY_WATERCOLOR_ARTWORK;

const PRESET_TITLES_BY_ILLUSTRATION_ID = (() => {
  const map = new Map<string, string[]>();
  for (const preset of DEFAULT_ROTATION_PRESETS) {
    const illId = PRESET_ILLUSTRATION_MAP[preset.id];
    if (!illId) continue;
    const list = map.get(illId) || [];
    list.push(preset.title);
    map.set(illId, list);
  }
  return map;
})();

export const ALL_ARTWORK_LIBRARY: ReadonlyArray<PresetArtworkOption> = [
  ...COLLECTION_ILLUSTRATIONS.map((item) => ({
    id: item.id,
    label: item.label,
    subject: item.subject,
    src: resolvePublicAssetUrl(item.path),
    path: item.path,
    category: item.category as ArtworkLibraryCategory,
    keywords: [...item.keywords],
    isTransparent: true,
    associatedPresetTitles: PRESET_TITLES_BY_ILLUSTRATION_ID.get(item.id) || [],
  })),
  ...LEGACY_WATERCOLOR_ARTWORK,
];

const ARTWORK_BY_ID = new Map(ALL_ARTWORK_LIBRARY.map((item) => [item.id, item]));
const LEGACY_BY_ID = new Map(LEGACY_WATERCOLOR_ARTWORK.map((item) => [item.id, item]));

const MOTIF_TO_LEGACY_ART_ID: Record<string, string> = {
  snowflake: 'winter',
  'pine-star': 'winter',
  menorah: 'winter',
  solstice: 'winter',
  blossom: 'spring',
  sprout: 'spring',
  earth: 'spring',
  'book-rose': 'spring',
  sun: 'summer',
  kite: 'summer',
  carnival: 'summer',
  leaf: 'autumn',
  pumpkin: 'autumn',
  marigold: 'autumn',
  diya: 'autumn',
  'bedtime-moon': 'bedtime',
  'moon-star': 'bedtime',
  'moon-rabbit': 'bedtime',
  lantern: 'bedtime',
  heart: 'bedtime',
  compass: 'wonder',
  rocket: 'wonder',
  sparkles: 'wonder',
  laugh: 'wonder',
};

/**
 * Finds the classic opaque watercolor option matching a preset's motif, tags, or category.
 */
export function resolveLegacyWatercolorOption(preset: {
  id?: string;
  motif?: string;
  category?: PresetCategory | string;
  title?: string;
  preferredTags?: string[];
}): PresetArtworkOption {
  const motifKey = typeof preset.motif === 'string' ? preset.motif.trim().toLowerCase() : '';
  if (motifKey && MOTIF_TO_LEGACY_ART_ID[motifKey]) {
    const found = LEGACY_BY_ID.get(MOTIF_TO_LEGACY_ART_ID[motifKey]);
    if (found) return found;
  }

  const haystack = `${preset.title || ''} ${(preset.preferredTags || []).join(' ')}`.toLowerCase();
  for (const art of LEGACY_WATERCOLOR_ARTWORK) {
    if (art.keywords.some((kw) => haystack.includes(kw))) {
      return art;
    }
  }

  if (preset.id && PRESET_ILLUSTRATION_MAP[preset.id]) {
    const meta = getIllustrationById(PRESET_ILLUSTRATION_MAP[preset.id]);
    if (meta && LEGACY_BY_ID.has(meta.legacyFallbackId)) {
      return LEGACY_BY_ID.get(meta.legacyFallbackId)!;
    }
  }

  if (preset.category === 'cultural-traditions') return LEGACY_BY_ID.get('bedtime')!;
  if (preset.category === 'seasonal-holidays') return LEGACY_BY_ID.get('autumn')!;
  if (preset.category === 'calendar-events') return LEGACY_BY_ID.get('spring')!;
  return LEGACY_BY_ID.get('wonder')!;
}

/**
 * Resolves full illustration display & fallback metadata for any preset or editor preview.
 *
 * Resolution precedence (preserving full backwards compatibility):
 * 1. Explicit `preset.illustrationUrl` (uploaded image, AI generation, or custom external/asset URL)
 * 2. Explicit `preset.illustrationId` (any illustration from the 42-piece transparent library or 6 classic watercolors)
 * 3. Built-in preset mapped via `PRESET_ILLUSTRATION_MAP` -> its dedicated transparent illustration
 * 4. Pre-existing custom preset (`isCustom: true` without explicit `illustrationId` or `illustrationUrl`)
 *    -> preserves previous classic watercolor artwork automatically without forcing changes.
 */
export function resolvePresetArtworkInfo(preset: {
  id?: string;
  isCustom?: boolean;
  illustrationId?: string;
  illustrationUrl?: string;
  motif?: string;
  category?: PresetCategory | string;
  title?: string;
  description?: string;
  preferredTags?: string[];
}): ResolvedPresetArtworkInfo {
  const suggestedMeta = getSuggestedIllustrationForPreset(preset);
  const suggestedUrl = resolvePublicAssetUrl(suggestedMeta.path);
  const legacyOption = resolveLegacyWatercolorOption(preset);

  const rawExplicitUrl = typeof preset.illustrationUrl === 'string' ? preset.illustrationUrl.trim() : '';
  if (rawExplicitUrl) {
    const isPortableAsset =
      rawExplicitUrl.startsWith('assets/') || rawExplicitUrl.startsWith('./assets/');
    const resolvedUrl = isPortableAsset ? resolvePublicAssetUrl(rawExplicitUrl) : rawExplicitUrl;
    const matchedLibraryItem = ALL_ARTWORK_LIBRARY.find(
      (item) =>
        item.src === resolvedUrl ||
        item.src === rawExplicitUrl ||
        (item.path && (item.path === rawExplicitUrl || `./${item.path}` === rawExplicitUrl))
    );
    return {
      primaryUrl: resolvedUrl,
      fallbackUrl: legacyOption.src,
      artworkId: matchedLibraryItem?.id || '',
      label: matchedLibraryItem?.label || 'Custom artwork',
      subject: matchedLibraryItem?.subject || 'Custom uploaded, linked, or AI-generated illustration',
      isLegacyOpaque: matchedLibraryItem
        ? !matchedLibraryItem.isTransparent
        : isLegacyOpaqueArtworkUrl(rawExplicitUrl),
      isCustomUrl: !matchedLibraryItem,
      suggestedId: suggestedMeta.id,
      suggestedLabel: suggestedMeta.label,
      suggestedUrl,
    };
  }

  const explicitId = typeof preset.illustrationId === 'string' ? preset.illustrationId.trim().toLowerCase() : '';
  if (explicitId && ARTWORK_BY_ID.has(explicitId)) {
    const found = ARTWORK_BY_ID.get(explicitId)!;
    const matchedMeta = getIllustrationById(found.id);
    const specificLegacyFallback =
      matchedMeta && LEGACY_BY_ID.has(matchedMeta.legacyFallbackId)
        ? LEGACY_BY_ID.get(matchedMeta.legacyFallbackId)!.src
        : legacyOption.src;

    return {
      primaryUrl: found.src,
      fallbackUrl: specificLegacyFallback,
      artworkId: found.id,
      label: found.label,
      subject: found.subject,
      isLegacyOpaque: !found.isTransparent,
      isCustomUrl: false,
      suggestedId: suggestedMeta.id,
      suggestedLabel: suggestedMeta.label,
      suggestedUrl,
    };
  }

  // Built-in presets map 1-to-1 to their dedicated transparent PNG
  const isBuiltInMapped = Boolean(preset.id && PRESET_ILLUSTRATION_MAP[preset.id] && !preset.isCustom);
  if (isBuiltInMapped) {
    const specificLegacyFallback =
      LEGACY_BY_ID.get(suggestedMeta.legacyFallbackId)?.src || legacyOption.src;
    return {
      primaryUrl: suggestedUrl,
      fallbackUrl: specificLegacyFallback,
      artworkId: suggestedMeta.id,
      label: suggestedMeta.label,
      subject: suggestedMeta.subject,
      isLegacyOpaque: false,
      isCustomUrl: false,
      suggestedId: suggestedMeta.id,
      suggestedLabel: suggestedMeta.label,
      suggestedUrl,
    };
  }

  // Existing custom presets without explicit illustrationId/illustrationUrl keep their classic watercolor
  return {
    primaryUrl: legacyOption.src,
    fallbackUrl: legacyOption.src,
    artworkId: legacyOption.id,
    label: legacyOption.label,
    subject: legacyOption.subject,
    isLegacyOpaque: true,
    isCustomUrl: false,
    suggestedId: suggestedMeta.id,
    suggestedLabel: suggestedMeta.label,
    suggestedUrl,
  };
}

/**
 * Backwards-compatible URL helper returning the resolved primary artwork URL for a preset.
 */
export function resolvePresetArtworkUrl(preset: {
  id?: string;
  isCustom?: boolean;
  illustrationId?: string;
  illustrationUrl?: string;
  motif?: string;
  category?: PresetCategory | string;
  title?: string;
  description?: string;
  preferredTags?: string[];
}): string {
  return resolvePresetArtworkInfo(preset).primaryUrl;
}
