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
    innerContentHtml,
    theme = 'classic',
    customBgUrl = '',
    bgBlur = 0,
    bgOpacity = 100,
  } = options;

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
      background: #ffffff;
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
    }

    /* Structural & Utility Classes to mirror Tailwind */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .grid { display: grid; }
    .gap-2 { gap: 8px; }
    .gap-3 { gap: 12px; }
    .gap-4 { gap: 16px; }
    .gap-6 { gap: 24px; }
    .p-4 { padding: 16px; }
    .p-6 { padding: 24px; }
    .p-8 { padding: 32px; }
    .rounded-xl { border-radius: 12px; }
    .rounded-2xl { border-radius: 16px; }
    .rounded-full { border-radius: 9999px; }
    .border { border: 1px solid #e2e8f0; }
    .border-2 { border: 2px solid #e2e8f0; }
    .border-dashed { border-style: dashed; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-serif { font-family: 'Cinzel', 'Fraunces', Georgia, serif; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    /* Ornate Certificate Filigree Frame */
    .certificate-filigree-frame {
      border: 8px double #d4af37;
      outline: 2px solid #b8860b;
      outline-offset: -12px;
      padding: 32px;
      background: radial-gradient(circle at center, #ffffff 0%, #fffdf8 100%);
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

  <div class="passport-document-sheet">
    <div class="custom-bg-layer"></div>
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
