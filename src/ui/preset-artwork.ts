/**
 * @fileoverview Built-in watercolor corner artwork library & smart matcher for Collection Preset cards.
 * Kept strictly in TypeScript (`.ts`) so Vite bundles raster `.jpg` assets while Node native `.test.js`
 * suites stay cleanly decoupled.
 */

import winterArt from '../assets/images/preset_corner_winter_1794779892509.jpg';
import springArt from '../assets/images/preset_corner_spring_1794779892702.jpg';
import summerArt from '../assets/images/preset_corner_summer_1794779893333.jpg';
import autumnArt from '../assets/images/preset_corner_autumn_1794779892853.jpg';
import bedtimeArt from '../assets/images/preset_corner_bedtime_1794779892315.jpg';
import wonderArt from '../assets/images/preset_corner_wonder_1794779892751.jpg';
import type { PresetCategory } from '../types/models.js';

export interface PresetArtworkOption {
  id: string;
  label: string;
  src: string;
  keywords: string[];
}

export const PRESET_ARTWORK_LIBRARY: ReadonlyArray<PresetArtworkOption> = [
  {
    id: 'winter',
    label: 'Winter Pine',
    src: winterArt,
    keywords: ['winter', 'snow', 'snowflake', 'pine-star', 'christmas', 'hanukkah', 'menorah', 'solstice', 'kwanzaa', 'cozy', 'cold'],
  },
  {
    id: 'spring',
    label: 'Spring Blossom',
    src: springArt,
    keywords: ['spring', 'blossom', 'sprout', 'nowruz', 'earth', 'book-rose', 'sant jordi', 'garden', 'butterflies', 'flower'],
  },
  {
    id: 'summer',
    label: 'Summer Coast',
    src: summerArt,
    keywords: ['summer', 'sun', 'ocean', 'beach', 'sea', 'kite', 'children', 'kodomo', 'carnival', 'water', 'outdoors'],
  },
  {
    id: 'autumn',
    label: 'Autumn Harvest',
    src: autumnArt,
    keywords: ['autumn', 'fall', 'leaf', 'harvest', 'pumpkin', 'halloween', 'marigold', 'muertos', 'thanksgiving', 'acorn', 'diwali', 'diya'],
  },
  {
    id: 'bedtime',
    label: 'Quiet Bedtime',
    src: bedtimeArt,
    keywords: ['bedtime', 'bedtime-moon', 'moon', 'moon-star', 'moon-rabbit', 'night', 'sleep', 'ramadan', 'eid', 'mid-autumn', 'lantern', 'calm', 'heart'],
  },
  {
    id: 'wonder',
    label: 'Curious Wonder',
    src: wonderArt,
    keywords: ['wonder', 'compass', 'rocket', 'space', 'science', 'stem', 'school', 'dinosaur', 'sparkles', 'laugh', 'read', 'discovery', 'adventure'],
  },
];

const MOTIF_TO_ART_ID: Record<string, string> = {
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
 * Resolves a preset's corner illustration URL: prefers explicit `illustrationUrl` (user upload,
 * custom URL, or AI-generated data URL), otherwise selects the closest matching watercolor artwork.
 */
export function resolvePresetArtworkUrl(preset: {
  illustrationUrl?: string;
  motif?: string;
  category?: PresetCategory | string;
  title?: string;
  preferredTags?: string[];
}): string {
  const explicit = typeof preset.illustrationUrl === 'string' ? preset.illustrationUrl.trim() : '';
  if (explicit) {
    return explicit;
  }

  const motifKey = typeof preset.motif === 'string' ? preset.motif.trim().toLowerCase() : '';
  if (motifKey && MOTIF_TO_ART_ID[motifKey]) {
    const found = PRESET_ARTWORK_LIBRARY.find((a) => a.id === MOTIF_TO_ART_ID[motifKey]);
    if (found) return found.src;
  }

  const haystack = `${preset.title || ''} ${(preset.preferredTags || []).join(' ')}`.toLowerCase();
  for (const art of PRESET_ARTWORK_LIBRARY) {
    if (art.keywords.some((kw) => haystack.includes(kw))) {
      return art.src;
    }
  }

  if (preset.category === 'cultural-traditions') return bedtimeArt;
  if (preset.category === 'seasonal-holidays') return autumnArt;
  if (preset.category === 'calendar-events') return springArt;
  return wonderArt;
}
