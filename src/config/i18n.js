/**
 * @fileoverview Isomorphic YAML-backed localization (`i18n`) engine for English (`en`),
 * Spanish (`es`), and Italian (`it`).
 *
 * HOW IT WORKS:
 * - Single source of truth lives in `/src/config/locales/en.yaml`, `es.yaml`, and `it.yaml`.
 * - In Vite dev/production browser builds, `vite.config.ts` injects the raw YAML strings via
 *   `globalThis.__BOOK_ROTATION_LOCALE_YAML__`.
 * - In Node unit/integration tests (`node --test`), `process.getBuiltinModule('node:fs')` reads
 *   the exact same `.yaml` files directly from disk with zero build step required.
 */

import { parseSimpleYaml } from './yaml-lite.js';

/**
 * @typedef {'en' | 'es' | 'it'} AppLanguage
 */

/**
 * Supported interface languages exposed in Settings -> Appearance / Language.
 * @type {ReadonlyArray<{ code: AppLanguage, label: string, nativeLabel: string, flag: string }>}
 */
export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', flag: '🇪🇸' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano', flag: '🇮🇹' },
]);

/**
 * Normalizes any raw language code into a supported `AppLanguage` (`'en' | 'es' | 'it'`).
 *
 * @param {unknown} raw
 * @returns {AppLanguage}
 */
export function normalizeLanguage(raw) {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .slice(0, 2);
  if (cleaned === 'es' || cleaned === 'it') {
    return cleaned;
  }
  return 'en';
}

const SPANISH_REGION_CODES = new Set([
  'ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'DO',
  'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'BO', 'GQ',
]);
const ITALIAN_REGION_CODES = new Set(['IT', 'SM', 'VA']);

const SPANISH_TIMEZONES = new Set([
  'Europe/Madrid',
  'Atlantic/Canary',
  'Africa/Ceuta',
  'America/Mexico_City',
  'America/Cancun',
  'America/Merida',
  'America/Monterrey',
  'America/Tijuana',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Caracas',
  'America/Havana',
  'America/Guatemala',
  'America/Costa_Rica',
  'America/Montevideo',
  'America/Buenos_Aires',
  'America/La_Paz',
  'America/Asuncion',
  'America/Managua',
  'America/Tegucigalpa',
  'America/El_Salvador',
  'America/Panama',
  'America/Santo_Domingo',
  'America/Puerto_Rico',
  'America/Guayaquil',
]);
const ITALIAN_TIMEZONES = new Set([
  'Europe/Rome',
  'Europe/San_Marino',
  'Europe/Vatican',
]);

/**
 * Extracts a 2-letter supported app language only when the locale's primary subtag matches
 * (`en`, `es`, or `it`). Returns null for unsupported primary languages so subsequent
 * preference entries or region fallbacks can be evaluated.
 * @param {unknown} rawLocale
 * @returns {AppLanguage | null}
 */
function matchSupportedPrimarySubtag(rawLocale) {
  const token = String(rawLocale || '').trim().toLowerCase();
  if (!token) return null;
  const primary = token.split(/[-_]/)[0];
  if (primary === 'es' || primary === 'it' || primary === 'en') {
    return primary;
  }
  return null;
}

/**
 * Infers language from a locale's region subtag (e.g. `ca-ES`, `en-ES`, `fr-IT`).
 * @param {unknown} rawLocale
 * @returns {AppLanguage | null}
 */
function matchLocaleRegion(rawLocale) {
  const parts = String(rawLocale || '').trim().split(/[-_]/);
  for (let i = 1; i < parts.length; i++) {
    const sub = parts[i].toUpperCase();
    if (sub.length === 2) {
      if (SPANISH_REGION_CODES.has(sub)) return 'es';
      if (ITALIAN_REGION_CODES.has(sub)) return 'it';
    }
  }
  return null;
}

/**
 * Detects the best initial UI language on first launch:
 * 1. Device/browser language settings (`navigator.languages` / `navigator.language`)
 * 2. Device region subtag or IANA timezone (`Europe/Madrid`, `Europe/Rome`, Latin America)
 * 3. Safe fallback to `'en'`
 *
 * Accepts an optional injected environment object for deterministic unit testing.
 *
 * @param {{ languages?: readonly string[], language?: string, timeZone?: string }} [env]
 * @returns {AppLanguage}
 */
export function detectDeviceLanguage(env) {
  /** @type {string[]} */
  let candidateLocales = [];
  if (env) {
    if (Array.isArray(env.languages)) {
      candidateLocales.push(...env.languages.map((l) => String(l || '')));
    }
    if (env.language) {
      candidateLocales.push(String(env.language));
    }
  } else if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      candidateLocales.push(...navigator.languages);
    }
    if (navigator.language) {
      candidateLocales.push(navigator.language);
    }
  }

  // 1. Device language preferences first
  for (const locale of candidateLocales) {
    const matched = matchSupportedPrimarySubtag(locale);
    if (matched) return matched;
  }

  // 2a. Region subtag from locale(s)
  for (const locale of candidateLocales) {
    const regionMatched = matchLocaleRegion(locale);
    if (regionMatched) return regionMatched;
  }

  // 2b. Device timezone region (only if browser/env actually provides one cleanly)
  let tz = env?.timeZone;
  if (tz === undefined && !env && typeof navigator !== 'undefined') {
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_) {
      tz = '';
    }
  }
  if (typeof tz === 'string' && tz) {
    if (SPANISH_TIMEZONES.has(tz) || tz.startsWith('America/Argentina/')) {
      return 'es';
    }
    if (ITALIAN_TIMEZONES.has(tz)) {
      return 'it';
    }
  }

  // 3. Default English
  return 'en';
}

/**
 * Loads raw YAML text for a locale code across both Vite browser bundles and Node ESM test runners.
 * @param {AppLanguage} code
 * @returns {string}
 */
function readLocaleYamlSource(code) {
  const injectedBundle = /** @type {Record<string, string> | undefined} */ (
    /** @type {any} */ (globalThis).__BOOK_ROTATION_LOCALE_YAML__
  );
  if (injectedBundle && typeof injectedBundle[code] === 'string') {
    return injectedBundle[code];
  }

  const nodeProc = /** @type {any} */ (globalThis).process;
  if (nodeProc && typeof nodeProc.getBuiltinModule === 'function') {
    const fsMod = nodeProc.getBuiltinModule('node:fs');
    if (fsMod && typeof fsMod.readFileSync === 'function') {
      const fileUrl = new URL(`./locales/${code}.yaml`, import.meta.url);
      return fsMod.readFileSync(fileUrl, 'utf8');
    }
  }

  return '';
}

/** @type {Map<AppLanguage, Record<string, any>>} */
const parsedCache = new Map();

/**
 * Returns the parsed nested locale dictionary for `lang`.
 *
 * @param {unknown} lang
 * @returns {Record<string, any>}
 */
export function getLocaleDictionary(lang) {
  const safeLang = normalizeLanguage(lang);
  const cached = parsedCache.get(safeLang);
  if (cached) return cached;

  const yamlText = readLocaleYamlSource(safeLang);
  const parsed = parseSimpleYaml(yamlText);
  parsedCache.set(safeLang, parsed);
  return parsed;
}

/**
 * Resolves a dot-separated key path (e.g. `'home.readSummary'`) inside a nested dictionary.
 * @param {Record<string, any>} dict
 * @param {string} keyPath
 * @returns {string | undefined}
 */
function lookupNestedKey(dict, keyPath) {
  if (!dict || !keyPath) return undefined;
  const parts = keyPath.split('.');
  /** @type {any} */
  let cur = dict;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) {
      return undefined;
    }
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Translates a dot-separated UI key for `lang`, interpolating `{variable}` placeholders
 * and automatically falling back to English (`en`) if a key is missing.
 *
 * @param {unknown} lang
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(lang, key, vars) {
  const safeLang = normalizeLanguage(lang);
  const primaryDict = getLocaleDictionary(safeLang);
  let template = lookupNestedKey(primaryDict, key);

  if (template === undefined && safeLang !== 'en') {
    template = lookupNestedKey(getLocaleDictionary('en'), key);
  }

  if (template === undefined) {
    return key;
  }

  if (!vars) return template;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, varName) => {
    return Object.prototype.hasOwnProperty.call(vars, varName)
      ? String(vars[varName])
      : match;
  });
}
