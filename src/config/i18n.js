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
 * Supported interface languages exposed in Settings -> Appearance.
 * @type {ReadonlyArray<{ code: AppLanguage, label: string, nativeLabel: string }>}
 */
export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'it', label: 'Italian', nativeLabel: 'Italiano' },
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
