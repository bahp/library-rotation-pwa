/**
 * @fileoverview Service for managing Reading Passport presets, custom templates,
 * self-contained styled HTML document generation, and printable PDF export.
 */

import { DEFAULT_PASSPORT_PRESETS } from '../../config/passport-presets.js';

const CUSTOM_PRESETS_STORAGE_KEY = 'lr_passport_custom_presets_v1';

/**
 * @returns {Storage | null}
 */
function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch (_) {}
  return null;
}

/** @type {import('../../config/passport-presets.js').PassportPreset[]} */
let memoryCustomPresets = [];

/**
 * Loads custom user-created presets from localStorage or memory fallback.
 * @returns {import('../../config/passport-presets.js').PassportPreset[]}
 */
export function getCustomPresets() {
  const store = getStorage();
  if (!store) return [...memoryCustomPresets];
  try {
    const raw = store.getItem(CUSTOM_PRESETS_STORAGE_KEY);
    if (!raw) return [...memoryCustomPresets];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryCustomPresets = [...parsed];
      return parsed;
    }
    return [...memoryCustomPresets];
  } catch (_) {
    return [...memoryCustomPresets];
  }
}

/**
 * Saves or updates a custom user-created preset in localStorage and memory.
 * @param {import('../../config/passport-presets.js').PassportPreset} preset
 * @returns {import('../../config/passport-presets.js').PassportPreset[]}
 */
export function saveCustomPreset(preset) {
  const existing = getCustomPresets();
  const normalized = {
    ...preset,
    id: preset.id || `custom-preset-${Date.now()}`,
    isCustom: true,
  };

  const filtered = existing.filter((p) => p.id !== normalized.id);
  const updated = [normalized, ...filtered];
  memoryCustomPresets = [...updated];

  const store = getStorage();
  if (store) {
    try {
      store.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}
  }
  return updated;
}

/**
 * Deletes a custom preset by ID.
 * @param {string} presetId
 * @returns {import('../../config/passport-presets.js').PassportPreset[]}
 */
export function deleteCustomPreset(presetId) {
  const existing = getCustomPresets();
  const updated = existing.filter((p) => p.id !== presetId);
  memoryCustomPresets = [...updated];

  const store = getStorage();
  if (store) {
    try {
      store.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}
  }
  return updated;
}

/**
 * Returns all presets, combining built-in presets with user-created custom presets.
 * @returns {import('../../config/passport-presets.js').PassportPreset[]}
 */
export function getAllPassportPresets() {
  const custom = getCustomPresets();
  return [...custom, ...DEFAULT_PASSPORT_PRESETS];
}

/**
 * Exports a preset to a formatted JSON string.
 * @param {import('../../config/passport-presets.js').PassportPreset} preset
 * @returns {string}
 */
export function exportPresetAsJson(preset) {
  return JSON.stringify(preset, null, 2);
}

/**
 * Parses and imports a preset from JSON.
 * @param {string} jsonString
 * @returns {import('../../config/passport-presets.js').PassportPreset}
 */
export function importPresetFromJson(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (!parsed || typeof parsed !== 'object' || !parsed.title || !Array.isArray(parsed.books)) {
    throw new Error('Invalid passport preset JSON structure. Must include title and books array.');
  }
  const normalized = {
    ...parsed,
    id: `custom-imported-${Date.now()}`,
    isCustom: true,
  };
  saveCustomPreset(normalized);
  return normalized;
}

/**
 * Generates a complete, self-contained HTML document with all inline styles, typography,
 * borders, stamps, and layout structures embedded so it renders identically across any browser
 * or when printed / converted to PDF.
 *
 * @param {{
 *   title: string,
 *   readerName: string,
 *   layoutMode: string,
 *   innerContentHtml: string,
 *   theme: string,
 *   customBgUrl?: string,
 *   bgBlur?: number,
 *   bgOpacity?: number,
 *   customBgType?: string,
 * }} options
 * @returns {string}
 */
export function generateStandalonePassportHtml(options) {
  const {
    title,
    readerName,
    layoutMode = '',
    innerContentHtml,
    theme = 'classic',
    customBgUrl = '',
    bgBlur = 0,
    bgOpacity = 100,
    customBgType = '',
  } = options;

  const safeTheme = ['classic', 'magic', 'night', 'explorer', 'forest', 'ink-saver'].includes(theme)
    ? theme
    : 'classic';
  const safeBgType = ['stars', 'parchment', 'meadow', 'gradient'].includes(customBgType)
    ? customBgType
    : '';
  const certBgClass =
    layoutMode === 'official-certificate' && !customBgUrl && safeBgType
      ? `lr-cert-bg-${safeBgType}`
      : '';
  const certInkClass =
    layoutMode === 'official-certificate'
      ? safeBgType === 'stars'
        ? 'lr-cert-ink-stars'
        : safeBgType === 'parchment' || safeBgType === 'meadow'
          ? 'lr-cert-ink-paper'
          : ''
      : '';

  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* Reset & Base Typography */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --background: #F7F5EE;
      --surface: #FFFFFF;
      --surface-elevated: #EAE7DD;
      --surface-subtle: #F1EEE6;
      --border: #DDD8CB;
      --text-primary: #15241F;
      --text-secondary: #51615B;
      --text-muted: #76857F;
      --primary: #1E322C;
      --sidebar-bg: #1E322C;
      --sidebar-surface: #253D36;
      --sidebar-text: #F7F5EE;
      --sidebar-accent: #DFBE7B;
      --passport-paper: var(--surface-subtle);
      --passport-card: rgba(255, 255, 255, 0.95);
      --passport-edge: var(--border);
      --passport-dashed: var(--text-muted);
      --passport-slot: rgba(247, 245, 238, 0.72);
      --passport-ink: var(--text-primary);
      --passport-muted: var(--text-secondary);
      --passport-accent: var(--primary);
      --passport-header-bg: linear-gradient(90deg, #1E322C 0%, #253D36 50%, #1E322C 100%);
      --passport-header-fg: #F7F5EE;
      --passport-header-border: rgba(223, 190, 123, 0.45);
      --passport-mrz-bg: #161A1D;
      --passport-mrz-fg: #67C5E8;
      --passport-gold: #D4AF37;
      --passport-gold-deep: #B45309;
      --passport-gold-light: #FEF3C7;
      --passport-gold-ink: #451A03;
      --passport-milestone-bg: rgba(245, 158, 11, 0.10);
      --passport-milestone-border: rgba(217, 119, 6, 0.45);
      --passport-milestone-ink: #B45309;
    }
    html, body {
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }

    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    .passport-document-sheet {
      max-width: 900px;
      margin: 24px auto;
      background: var(--passport-paper);
      color: var(--passport-ink);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border-radius: 16px;
      overflow: hidden;
      position: relative;
    }

    @media print {
      body { background: transparent !important; }
      .passport-document-sheet {
        margin: 0 !important;
        max-width: 100% !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        page-break-after: avoid;
        break-inside: avoid;
      }
      .no-print { display: none !important; }
    }

    /* Print utility bar (visible only in browser view) */
    .screen-header-bar {
      max-width: 900px;
      margin: 20px auto 0;
      padding: 12px 18px;
      background: #1e293b;
      color: #ffffff;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .screen-header-bar button {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      font-weight: 600;
      font-size: 13px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .screen-header-bar button:hover { background: #0369a1; }

    /* Custom Background Layers & Blur */
    .custom-bg-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      background-size: cover;
      background-position: center;
      ${customBgUrl ? `background-image: url('${customBgUrl}');` : ''}
      ${bgBlur > 0 ? `filter: blur(${bgBlur}px);` : ''}
      opacity: ${(Number(bgOpacity) || 100) / 100};
    }

    .document-inner-content {
      position: relative;
      z-index: 1;
      padding: 24px;
    }

    /* Structural & Utility Classes to mirror Tailwind */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .flex-wrap { flex-wrap: wrap; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .items-start { align-items: flex-start; }
    .items-stretch { align-items: stretch; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .justify-end { justify-content: flex-end; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .grid { display: grid; }
    .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    @media (min-width: 640px) {
      .sm\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .sm\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    @media (min-width: 768px) {
      .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .md\\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    }
    .gap-1\\.5 { gap: 6px; }
    .gap-2 { gap: 8px; }
    .gap-2\\.5 { gap: 10px; }
    .gap-3 { gap: 12px; }
    .gap-4 { gap: 16px; }
    .gap-6 { gap: 24px; }
    .space-y-1 > * + * { margin-top: 4px; }
    .space-y-2 > * + * { margin-top: 8px; }
    .space-y-3 > * + * { margin-top: 12px; }
    .space-y-4 > * + * { margin-top: 16px; }
    .space-y-6 > * + * { margin-top: 24px; }
    .space-y-8 > * + * { margin-top: 32px; }
    .p-2 { padding: 8px; }
    .p-2\\.5 { padding: 10px; }
    .p-3 { padding: 12px; }
    .p-3\\.5 { padding: 14px; }
    .p-4 { padding: 16px; }
    .p-5 { padding: 20px; }
    .p-6 { padding: 24px; }
    .p-8 { padding: 32px; }
    .px-2 { padding-left: 8px; padding-right: 8px; }
    .px-3 { padding-left: 12px; padding-right: 12px; }
    .px-8 { padding-left: 32px; padding-right: 32px; }
    .py-0\\.5 { padding-top: 2px; padding-bottom: 2px; }
    .py-1 { padding-top: 4px; padding-bottom: 4px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .pt-1 { padding-top: 4px; }
    .pt-2 { padding-top: 8px; }
    .pt-3 { padding-top: 12px; }
    .pt-4 { padding-top: 16px; }
    .pt-6 { padding-top: 24px; }
    .pb-1 { padding-bottom: 4px; }
    .pb-2 { padding-bottom: 8px; }
    .mb-1\\.5 { margin-bottom: 6px; }
    .mb-3 { margin-bottom: 12px; }
    .mt-1 { margin-top: 4px; }
    .mx-auto { margin-left: auto; margin-right: auto; }
    .relative { position: relative; }
    .absolute { position: absolute; }
    .z-10 { z-index: 10; }
    .min-w-0 { min-width: 0; }
    .shrink-0 { flex-shrink: 0; }
    .flex-1 { flex: 1 1 0%; }
    .w-full { width: 100%; }
    .w-4 { width: 16px; }
    .h-4 { height: 16px; }
    .w-8 { width: 32px; }
    .h-8 { height: 32px; }
    .w-10 { width: 40px; }
    .h-10 { height: 40px; }
    .w-11 { width: 44px; }
    .h-11 { height: 44px; }
    .w-12 { width: 48px; }
    .h-12 { height: 48px; }
    .w-14 { width: 56px; }
    .h-14 { height: 56px; }
    .w-16 { width: 64px; }
    .h-16 { height: 64px; }
    .w-24 { width: 96px; }
    .h-32 { height: 128px; }
    .aspect-square { aspect-ratio: 1 / 1; }
    .aspect-\\[3\\/4\\] { aspect-ratio: 3 / 4; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rounded { border-radius: 4px; }
    .rounded-xl { border-radius: 12px; }
    .rounded-2xl { border-radius: 16px; }
    .rounded-3xl { border-radius: 24px; }
    .rounded-full { border-radius: 9999px; }
    .border { border: 1px solid var(--passport-edge); }
    .border-2 { border: 2px solid var(--passport-edge); }
    .border-b { border-bottom: 1px solid var(--passport-edge); }
    .border-b-2 { border-bottom: 2px solid var(--passport-edge); }
    .border-t { border-top: 1px solid var(--passport-edge); }
    .border-dashed { border-style: dashed; }
    .border-solid { border-style: solid; }
    .font-bold { font-weight: 700; }
    .font-extrabold { font-weight: 800; }
    .font-black { font-weight: 900; }
    .font-semibold { font-weight: 600; }
    .font-display { font-family: 'Fraunces', Georgia, serif; }
    .font-serif { font-family: 'Cinzel', 'Fraunces', Georgia, serif; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .uppercase { text-transform: uppercase; }
    .italic { font-style: italic; }
    .text-xs { font-size: 12px; }
    .text-sm { font-size: 14px; }
    .text-base { font-size: 16px; }
    .text-2xl { font-size: 24px; }
    .text-3xl { font-size: 30px; }

    /* Reading Passport & Certificate Studio Classes */
    .lr-passport-doc { background-color: var(--passport-paper); border-color: var(--passport-edge); color: var(--passport-ink); }
    .lr-passport-header { background: var(--passport-header-bg); color: var(--passport-header-fg); border-color: var(--passport-header-border); }
    .lr-passport-card { background-color: var(--passport-card); border-color: var(--passport-edge); color: var(--passport-ink); }
    .lr-passport-ink { color: var(--passport-ink); }
    .lr-passport-muted { color: var(--passport-muted); }
    .lr-passport-accent { color: var(--passport-accent); }
    .lr-passport-divider { border-color: var(--passport-edge); }
    .lr-passport-slot { border-color: var(--passport-dashed); background-color: var(--passport-slot); }
    .lr-passport-stamp-placeholder { border-color: var(--passport-dashed); color: var(--passport-muted); }
    .lr-passport-mrz { background-color: var(--passport-mrz-bg); color: var(--passport-mrz-fg); }
    .lr-passport-gold-frame { border-color: var(--passport-gold); }
    .lr-passport-gold-frame-double { border-color: var(--passport-gold-deep); }
    .lr-passport-gold-badge { background: linear-gradient(135deg, var(--passport-gold) 0%, var(--passport-gold-deep) 100%); border-color: var(--passport-gold-light); color: #451A03; }
    .lr-passport-gold-kicker { color: var(--passport-gold-ink); }
    .lr-passport-milestone { background-color: var(--passport-milestone-bg); border-color: var(--passport-milestone-border); }
    .lr-passport-milestone-badge { background-color: var(--passport-gold-deep); color: #FFFCF5; }
    .lr-passport-milestone-ink { color: var(--passport-milestone-ink); }
    .lr-passport-theme-magic { --passport-paper: #EEF2FF; --passport-edge: #C084FC; --passport-dashed: #9333EA; --passport-accent: #7E22CE; --passport-header-bg: linear-gradient(90deg, #3B0764 0%, #312E81 50%, #581C87 100%); --passport-header-fg: #FDE68A; --passport-header-border: rgba(168, 85, 247, 0.45); }
    .lr-passport-theme-night { --passport-paper: #F0F9FF; --passport-edge: #38BDF8; --passport-dashed: #0284C7; --passport-accent: #0369A1; --passport-header-bg: linear-gradient(90deg, #020617 0%, #0C4A6E 50%, #0F172A 100%); --passport-header-fg: #BAE6FD; --passport-header-border: rgba(2, 132, 199, 0.45); }
    .lr-passport-theme-explorer { --passport-paper: #FFFBEB; --passport-edge: #F59E0B; --passport-dashed: #D97706; --passport-accent: #92400E; --passport-header-bg: linear-gradient(90deg, #92400E 0%, #78350F 50%, #451A03 100%); --passport-header-fg: #FFFBEB; --passport-header-border: rgba(245, 158, 11, 0.45); }
    .lr-passport-theme-forest { --passport-paper: #ECFDF5; --passport-edge: #10B981; --passport-dashed: #059669; --passport-accent: #065F46; --passport-header-bg: linear-gradient(90deg, #064E3B 0%, #143D32 50%, #0B261F 100%); --passport-header-fg: #D1FAE5; --passport-header-border: rgba(16, 185, 129, 0.45); }
    .lr-passport-theme-ink-saver { --passport-paper: #FFFFFF; --passport-card: #FFFFFF; --passport-edge: #1C1917; --passport-dashed: #1C1917; --passport-slot: #FFFFFF; --passport-ink: #000000; --passport-muted: #292524; --passport-accent: #000000; --passport-header-bg: #FFFFFF; --passport-header-fg: #000000; --passport-header-border: #000000; }

    .lr-cert-bg-stars { background: radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%); color: #F8FAFC; }
    .lr-cert-bg-parchment { background: radial-gradient(circle at center, #FFFDF8 0%, #FEF3C7 100%); }
    .lr-cert-bg-meadow { background: radial-gradient(circle at center, #F0FDF4 0%, #DCFCE7 100%); }
    .lr-cert-bg-gradient { background: radial-gradient(circle at center, #FFFFFF 0%, #F1EEE6 100%); }
    .lr-cert-ink-stars { --passport-ink: #F8FAFC; --passport-muted: #CBD5E1; --passport-gold-ink: #FCD34D; --passport-card: rgba(15, 23, 42, 0.88); --passport-edge: rgba(251, 191, 36, 0.35); }
    .lr-cert-ink-paper { --passport-ink: #1C1917; --passport-muted: #57534E; --passport-gold-ink: #92400E; --passport-card: rgba(255, 255, 255, 0.92); --passport-edge: rgba(180, 83, 9, 0.25); }

    .lr-stamp-emerald { background-color: #059669; color: #FFFFFF; border-color: #047857; }
    .lr-stamp-rose    { background-color: #E11D48; color: #FFFFFF; border-color: #BE123C; }
    .lr-stamp-amber   { background-color: #F59E0B; color: #FFFFFF; border-color: #D97706; }
    .lr-stamp-purple  { background-color: #9333EA; color: #FFFFFF; border-color: #7E22CE; }
    .lr-stamp-indigo  { background-color: #4F46E5; color: #FFFFFF; border-color: #4338CA; }
    .lr-stamp-yellow  { background-color: #CA8A04; color: #FFFFFF; border-color: #A16207; }
    .lr-stamp-sky     { background-color: #0369A1; color: #FFFFFF; border-color: #075985; }
    .lr-stamp-teal    { background-color: #0F766E; color: #FFFFFF; border-color: #115E59; }

    .lr-ach-amber   { color: #B45309; background-color: #FFFBEB; border-color: #FCD34D; }
    .lr-ach-indigo  { color: #4338CA; background-color: #EEF2FF; border-color: #A5B4FC; }
    .lr-ach-rose    { color: #BE123C; background-color: #FFF1F2; border-color: #FDA4AF; }
    .lr-ach-emerald { color: #047857; background-color: #ECFDF5; border-color: #6EE7B7; }
    .lr-ach-sky     { color: #0369A1; background-color: #F0F9FF; border-color: #7DD3FC; }
    .lr-ach-purple  { color: #7E22CE; background-color: #FAF5FF; border-color: #D8B4FE; }

    /* Ornate Certificate Filigree Frame */
    .certificate-filigree-frame {
      border: 8px double #d4af37;
      outline: 2px solid #b8860b;
      outline-offset: -12px;
      padding: 32px;
      position: relative;
    }
    .certificate-filigree-frame::before {
      content: "✦";
      position: absolute;
      top: 14px;
      left: 14px;
      font-size: 20px;
      color: #b8860b;
    }
    .certificate-filigree-frame::after {
      content: "✦";
      position: absolute;
      top: 14px;
      right: 14px;
      font-size: 20px;
      color: #b8860b;
    }

    /* Stamp Circle Elements */
    .stamp-badge-applied {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 76px;
      height: 76px;
      border-radius: 9999px;
      border: 3px double currentColor;
      box-shadow: 0 2px 4px rgba(0,0,0,0.12);
      text-transform: uppercase;
      font-weight: 800;
      font-size: 10px;
      letter-spacing: 0.05em;
      line-height: 1.1;
      padding: 4px;
      text-align: center;
    }

    /* MRZ Code bar */
    .mrz-bar {
      background: #0f172a;
      color: #38bdf8;
      font-family: ui-monospace, monospace;
      font-size: 11px;
      letter-spacing: 0.16em;
      padding: 8px 12px;
      border-radius: 6px;
      line-height: 1.4;
      white-space: pre;
    }
  </style>
</head>
<body>
  <div class="screen-header-bar no-print">
    <div>
      <div style="font-weight: 700; font-size: 15px;">${escapeXml(title)}</div>
      <div style="font-size: 11px; color: #94a3b8;">Printed for ${escapeXml(readerName)} · ${escapeXml(dateStr)}</div>
    </div>
    <div style="display: flex; gap: 8px;">
      <button onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
  </div>

  <div class="passport-document-sheet lr-passport-doc lr-passport-theme-${escapeXml(safeTheme)} ${certInkClass}">
    <div class="custom-bg-layer ${certBgClass}"></div>
    <div class="document-inner-content">
      ${innerContentHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Escapes plain text for safe XML / HTML attributes and content.
 * @param {string} str
 * @returns {string}
 */
function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Native Web Share trigger with clipboard fallback.
 * @param {{ title: string, text: string, htmlContent: string }} payload
 * @returns {Promise<{ shared: boolean, fallbackCopied: boolean, message: string }>}
 */
export async function sharePassportDocument(payload) {
  const fileName = `reading-passport-${Date.now()}.html`;
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      const blob = new Blob([payload.htmlContent], { type: 'text/html;charset=utf-8' });
      const file = new File([blob], fileName, { type: 'text/html' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: payload.title,
          text: payload.text,
        });
        return { shared: true, fallbackCopied: false, message: 'Shared successfully!' };
      }

      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: window.location.href,
      });
      return { shared: true, fallbackCopied: false, message: 'Shared link!' };
    }
  } catch (err) {
    // User cancelled share or platform error
    if (err instanceof Error && err.name === 'AbortError') {
      return { shared: false, fallbackCopied: false, message: 'Share dismissed.' };
    }
  }

  // Fallback: Copy link or note to clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      return { shared: false, fallbackCopied: true, message: 'App link copied to clipboard!' };
    }
  } catch (_) {}

  return { shared: false, fallbackCopied: false, message: 'Share not supported on this browser.' };
}
