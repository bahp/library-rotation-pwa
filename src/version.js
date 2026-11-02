/**
 * @fileoverview Single source of truth for application semantic version and offline/static documentation paths.
 */

export const APP_VERSION = '1.19.0';

/**
 * Relative documentation paths so links resolve cleanly both at root (`/docs/...`)
 * and under subpath static deployments such as GitHub Pages (`/<repo>/docs/...`).
 */
export const APP_DOCS_LINKS = Object.freeze({
  overview: 'docs/index.html',
  configuration: 'docs/configuration.html',
  cloudflareWorkerGuide: 'docs/configuration.html#phone-proxy',
  taggingAndAi: 'docs/tagging-and-ai.html',
  architectureAndProviders: 'docs/architecture-and-providers.html',
});
