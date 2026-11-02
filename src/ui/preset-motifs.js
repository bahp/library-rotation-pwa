/**
 * @fileoverview Subtle editorial line-art SVG motifs for Collection Preset card corners.
 * Designed as low-opacity vector watermarks so seasonal, cultural, and everyday presets
 * are recognizable at a glance without heavy raster images or visual clutter.
 */

import { escapeHtml } from '../types/models.js';

/**
 * Available preset corner motif keys for the preset editor selector.
 * @type {Array<{ id: string, label: string }>}
 */
export const PRESET_MOTIF_OPTIONS = [
  { id: 'sparkles', label: 'Sparkles (Default)' },
  { id: 'snowflake', label: 'Snowflake (Winter)' },
  { id: 'lantern', label: 'Lantern (Lunar / Festival)' },
  { id: 'carnival', label: 'Music & Mask (Carnival)' },
  { id: 'moon-star', label: 'Crescent & Star (Ramadan / Eid)' },
  { id: 'sprout', label: 'Sprout (Nowruz / Growing Up)' },
  { id: 'blossom', label: 'Blossom (Spring)' },
  { id: 'earth', label: 'Globe & Leaf (Earth / World)' },
  { id: 'book-rose', label: 'Book & Rose (World Book Day / Sant Jordi)' },
  { id: 'kite', label: 'Kite & Streamer (Children’s Day)' },
  { id: 'sun', label: 'Sun & Wave (Summer)' },
  { id: 'compass', label: 'Compass & Pencil (School / Milestones)' },
  { id: 'moon-rabbit', label: 'Harvest Moon (Mid-Autumn)' },
  { id: 'leaf', label: 'Autumn Leaf (Harvest)' },
  { id: 'pumpkin', label: 'Pumpkin & Stars (Halloween)' },
  { id: 'marigold', label: 'Marigold Bloom (Día de Muertos)' },
  { id: 'diya', label: 'Diya Lamp (Diwali)' },
  { id: 'pine-star', label: 'Evergreen & Star (Winter Holidays)' },
  { id: 'menorah', label: 'Candelabra (Hanukkah)' },
  { id: 'solstice', label: 'Solstice Sunburst (Solstice / Kwanzaa / New Year)' },
  { id: 'bedtime-moon', label: 'Slumber Moon (Bedtime)' },
  { id: 'heart', label: 'Warm Heart (Feelings / Kindness)' },
  { id: 'rocket', label: 'Rocket & Orbit (STEM / Space)' },
  { id: 'laugh', label: 'Playful Starburst (Read-Alouds / Humor)' },
];

/**
 * Resolves the SVG inner paths (`24x24` viewBox) for a given motif identifier.
 * @param {string | undefined} motif
 * @returns {string}
 */
function getMotifPaths(motif) {
  switch (motif) {
    case 'snowflake':
      return `<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1"/><path d="m9.5 4 2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5M4 9.5 6.5 12 4 14.5M20 9.5 17.5 12 20 14.5"/>`;
    case 'lantern':
      return `<path d="M9 3h6M12 3v2M8 5h8c2 2.2 2 7.8 0 10H8C6 12.8 6 7.2 8 5Z"/><path d="M9 15h6v2H9zM10 17v4M12 17v5M14 17v4M7.2 10h9.6"/>`;
    case 'carnival':
      return `<path d="M3 10c2.2-2.5 6-2.5 9 0 3-2.5 6.8-2.5 9 0-.4 4.5-3.8 7-9 5.2C6.8 17 3.4 14.5 3 10Z"/><circle cx="7.5" cy="11.5" r="1.2"/><circle cx="16.5" cy="11.5" r="1.2"/><path d="M18 3v5M18 3l3 1.2M6 19c1.5-1 3.5-1 5 0s3.5 1 5 0"/>`;
    case 'moon-star':
      return `<path d="M15.5 3.5a7.5 7.5 0 1 0 5 12.8A6.5 6.5 0 0 1 15.5 3.5Z"/><path d="m17.5 5.5.8 1.8 1.9.2-1.4 1.3.4 1.9-1.7-.9-1.7.9.4-1.9-1.4-1.3 1.9-.2Z"/>`;
    case 'sprout':
      return `<path d="M12 21V10"/><path d="M12 13C7.5 13 5 10 5 6c4 0 7 2.5 7 7Z"/><path d="M12 11c0-4 2.8-6.5 7-6.5 0 4-3 6.5-7 6.5Z"/><path d="M8 21h8"/>`;
    case 'blossom':
      return `<circle cx="12" cy="12" r="2.3"/><path d="M12 3.5c1.8 1.5 2.2 3.8 0 5.5-2.2-1.7-1.8-4 0-5.5ZM20.1 9.4c-.9 2.2-3 3.3-5.2 1.7 1-2.6 3.1-3 5.2-1.7ZM17 18.8c-2.3-.2-4-1.9-3.2-4.4 2.7.2 3.8 2 3.2 4.4ZM7 18.8c-.6-2.4.5-4.2 3.2-4.4.8 2.5-.9 4.2-3.2 4.4ZM3.9 9.4c2.1-1.3 4.2-.9 5.2 1.7-2.2 1.6-4.3.5-5.2-1.7Z"/>`;
    case 'earth':
      return `<circle cx="12" cy="12" r="8.5"/><path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17"/>`;
    case 'book-rose':
      return `<path d="M4 6.5C4 5.4 4.9 4.5 6 4.5h5v14H6a2 2 0 0 0-2 2V6.5Zm16 0c0-1.1-.9-2-2-2h-5v14h5a2 2 0 0 1 2 2V6.5Z"/><circle cx="12" cy="9" r="2.2"/><path d="M12 11.2v4.8"/>`;
    case 'kite':
      return `<path d="M12 3 19 10l-7 9-7-9 7-7Z"/><path d="M12 3v16M5 10h14"/><path d="M12 19c.5 1.8 2.5 2 3.5 3"/>`;
    case 'sun':
      return `<circle cx="12" cy="11" r="4"/><path d="M12 3v2M12 17v2M4 11h2M18 11h2M6.3 5.3l1.4 1.4M16.3 15.3l1.4 1.4M17.7 5.3l-1.4 1.4M7.7 15.3l-1.4 1.4"/><path d="M3 20.5c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0"/>`;
    case 'compass':
      return `<circle cx="12" cy="12" r="8.5"/><polygon points="15.8,8.2 13.5,13.5 8.2,15.8 10.5,10.5"/>`;
    case 'moon-rabbit':
      return `<circle cx="12" cy="12" r="8.5"/><path d="M9.5 14.5c0-2 1.6-3.3 3.6-3.3 1.5 0 2.7.9 2.9 2.2.2 1.4-1 2.6-2.8 2.6H9.8Z"/><path d="M13.5 11.2c-.4-1.8.2-3.4 1.2-3.6.7-.1.9 1.2.4 2.8M11.8 11.2c-.8-1.5-.7-3 .2-3.3.7-.2 1.1 1 .9 2.6"/><path d="M6.5 8.5h.01M8.5 6.5h.01"/>`;
    case 'leaf':
      return `<path d="M19.5 4.5C13 4.5 6.5 8.5 5.5 16c-.2 1.5.8 2.5 2.5 2.5 7.5-1 11.5-7.5 11.5-14Z"/><path d="M5 19 15 9M11 13l3.5.5M9 15l.5-3.5"/>`;
    case 'pumpkin':
      return `<path d="M12 7c-4.8 0-8 2.6-8 6.8S7.2 20 12 20s8-2 8-6.2S16.8 7 12 7Z"/><path d="M12 7c-2.2 0-3.8 2.6-3.8 6.8S9.8 20 12 20s3.8-2 3.8-6.2S14.2 7 12 7Z"/><path d="M12 7V4c0-.8.7-1.4 1.6-1.4"/>`;
    case 'marigold':
      return `<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="6.2" r="2.4"/><circle cx="12" cy="17.8" r="2.4"/><circle cx="6.2" cy="12" r="2.4"/><circle cx="17.8" cy="12" r="2.4"/><circle cx="7.9" cy="7.9" r="2.2"/><circle cx="16.1" cy="7.9" r="2.2"/><circle cx="7.9" cy="16.1" r="2.2"/><circle cx="16.1" cy="16.1" r="2.2"/>`;
    case 'diya':
      return `<path d="M12 3.5c1.8 2.2 2.4 4 .9 5.6a2 2 0 0 1-2.8-.2c-1.1-1.6-.2-3.4 1.9-5.4Z"/><path d="M4 13h16c-.8 4.4-4 7-8 7s-7.2-2.6-8-7Z"/><path d="M7.5 16c1.5 1 3 1.4 4.5 1.4s3-.4 4.5-1.4"/>`;
    case 'pine-star':
      return `<path d="m12 2.5 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 4.8 11 4.5Z"/><path d="M12 8.5 7 14h3l-3.5 4.5h11L14 14h3l-5-5.5Z"/><path d="M12 18.5V21"/>`;
    case 'menorah':
      return `<path d="M12 4v16M8 20h8"/><path d="M5 7v2a7 7 0 0 0 14 0V7"/><path d="M8.5 7v1.5a3.5 3.5 0 0 0 7 0V7"/><path d="M5 4.8v.4M8.5 4.8v.4M12 2.5v.5M15.5 4.8v.4M19 4.8v.4"/>`;
    case 'solstice':
      return `<circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M19.1 4.9l-2.9 2.9M7.8 16.2l-2.9 2.9"/>`;
    case 'bedtime-moon':
      return `<path d="M14.5 4a7.5 7.5 0 1 0 5.5 12.2A6.5 6.5 0 0 1 14.5 4Z"/><path d="M16 5h3l-3 3h3M19 10h2l-2 2h2"/>`;
    case 'heart':
      return `<path d="M12 19.5s-7-4.4-7-9.8A4.2 4.2 0 0 1 9.2 5.5c1.3 0 2.2.6 2.8 1.5.6-.9 1.5-1.5 2.8-1.5A4.2 4.2 0 0 1 19 9.7c0 5.4-7 9.8-7 9.8Z"/>`;
    case 'rocket':
      return `<path d="M14.5 4.5c2.5-.5 4.5-.5 5 .1.6.5.6 2.5.1 5-1 3.8-4.2 6.8-7.6 8.4l-4-4c1.6-3.4 4.6-6.6 8.5-7.5Z"/><circle cx="14.5" cy="9.5" r="1.4"/><path d="M8 14 5 15l1 3 3-1M5.5 18.5 4 20"/>`;
    case 'laugh':
      return `<circle cx="12" cy="12" r="8.5"/><path d="M8.5 10c.4-.6 1.2-.6 1.6 0M13.9 10c.4-.6 1.2-.6 1.6 0"/><path d="M8.2 13.5c.8 2.2 2.2 3.2 3.8 3.2s3-1 3.8-3.2Z"/>`;
    case 'sparkles':
    default:
      return `<path d="m12 3 1.8 4.6L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.4L12 3Z"/><path d="m18.5 15 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>`;
  }
}

/**
 * Infers a tasteful default motif key when a preset omits an explicit `motif`.
 * @param {Pick<import('../types/models.js').RotationPreset, 'motif' | 'category' | 'title' | 'preferredTags'>} preset
 * @returns {string}
 */
export function resolvePresetMotifKey(preset) {
  if (preset.motif && typeof preset.motif === 'string' && preset.motif.trim()) {
    return preset.motif.trim();
  }
  const text = `${preset.title || ''} ${(preset.preferredTags || []).join(' ')}`.toLowerCase();
  if (text.includes('snow') || text.includes('winter cozy')) return 'snowflake';
  if (text.includes('lunar') || text.includes('lantern')) return 'lantern';
  if (text.includes('carnival') || text.includes('carnaval')) return 'carnival';
  if (text.includes('ramadan') || text.includes('eid')) return 'moon-star';
  if (text.includes('nowruz') || text.includes('potty') || text.includes('routine')) return 'sprout';
  if (text.includes('spring') || text.includes('blossom')) return 'blossom';
  if (text.includes('book day') || text.includes('sant jordi')) return 'book-rose';
  if (text.includes('earth') || text.includes('world')) return 'earth';
  if (text.includes('children') || text.includes('kodomo')) return 'kite';
  if (text.includes('summer') || text.includes('ocean')) return 'sun';
  if (text.includes('school')) return 'compass';
  if (text.includes('mid-autumn') || text.includes('moon festival')) return 'moon-rabbit';
  if (text.includes('autumn') || text.includes('harvest')) return 'leaf';
  if (text.includes('halloween') || text.includes('spooky')) return 'pumpkin';
  if (text.includes('muertos')) return 'marigold';
  if (text.includes('diwali')) return 'diya';
  if (text.includes('hanukkah')) return 'menorah';
  if (text.includes('christmas')) return 'pine-star';
  if (text.includes('solstice') || text.includes('kwanzaa')) return 'solstice';
  if (text.includes('bedtime')) return 'bedtime-moon';
  if (text.includes('space') || text.includes('science') || text.includes('dinosaur')) return 'rocket';
  if (text.includes('silly') || text.includes('humor') || text.includes('giggle')) return 'laugh';
  if (text.includes('feeling') || text.includes('friend') || text.includes('kind')) return 'heart';
  return 'sparkles';
}

/**
 * Renders the top-right decorative corner watermark SVG for a preset card.
 * @param {Pick<import('../types/models.js').RotationPreset, 'motif' | 'category' | 'title' | 'preferredTags'>} preset
 * @returns {string}
 */
export function renderPresetCornerDecoration(preset) {
  const motifKey = resolvePresetMotifKey(preset);
  return `
    <span
      aria-hidden="true"
      data-preset-decoration="${escapeHtml(motifKey)}"
      class="pointer-events-none select-none absolute top-2.5 right-2.5 w-12 h-12 sm:w-14 sm:h-14 text-forest-700/16 dark:text-[#5ED3DA]/18 flex items-center justify-center"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.35"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="w-full h-full"
      >
        ${getMotifPaths(motifKey)}
      </svg>
    </span>
  `;
}
