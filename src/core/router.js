/**
 * @fileoverview Hash-based SPA router compatible with static hosting and GitHub Pages subpaths.
 */

/** @type {Set<import('../types/models.js').RouteId>} */
const VALID_ROUTES = new Set(['home', 'library', 'scan', 'rotations', 'profiles', 'settings']);

/** @type {Record<import('../types/models.js').RouteId, string>} */
const ROUTE_TITLES = {
  home: 'Home Shelf · Library Rotation',
  library: 'Family Library · Library Rotation',
  scan: 'Add & Scan Books · Library Rotation',
  rotations: 'Rotations · Library Rotation',
  profiles: 'Reader Profiles · Library Rotation',
  settings: 'Settings · Library Rotation',
};

/**
 * Parses a location hash string (e.g. "#/scan?mode=isbn-ocr") into route ID and search params.
 * @param {string} rawHash
 * @returns {{ route: import('../types/models.js').RouteId, params: URLSearchParams }}
 */
export function parseHashRoute(rawHash) {
  const cleaned = String(rawHash || '')
    .replace(/^#\/?/, '')
    .trim();
  const [pathSegment, queryString = ''] = cleaned.split('?');
  const candidate = /** @type {import('../types/models.js').RouteId} */ (
    pathSegment.split('/')[0].toLowerCase()
  );
  const route = VALID_ROUTES.has(candidate) ? candidate : 'home';
  return {
    route,
    params: new URLSearchParams(queryString),
  };
}

/**
 * Creates a client-side hash router instance.
 */
export function createRouter() {
  /** @type {Set<(state: { route: import('../types/models.js').RouteId, params: URLSearchParams }) => void>} */
  const listeners = new Set();

  function getCurrent() {
    if (typeof window === 'undefined') {
      return { route: /** @type {import('../types/models.js').RouteId} */ ('home'), params: new URLSearchParams() };
    }
    return parseHashRoute(window.location.hash);
  }

  function syncDocumentTitle() {
    if (typeof document !== 'undefined') {
      const { route } = getCurrent();
      document.title = ROUTE_TITLES[route] || 'Library Rotation';
    }
  }

  function handleHashChange() {
    syncDocumentTitle();
    const current = getCurrent();
    for (const listener of listeners) {
      listener(current);
    }
  }

  /**
   * Navigates to a route with optional query parameters.
   * @param {import('../types/models.js').RouteId} route
   * @param {Record<string, string>} [query]
   */
  function navigate(route, query) {
    const safeRoute = VALID_ROUTES.has(route) ? route : 'home';
    const search = query ? new URLSearchParams(query).toString() : '';
    const nextHash = search ? `#/${safeRoute}?${search}` : `#/${safeRoute}`;

    if (typeof window !== 'undefined') {
      if (window.location.hash === nextHash) {
        handleHashChange();
      } else {
        window.location.hash = nextHash;
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  /**
   * Subscribes to route transitions.
   * @param {(state: { route: import('../types/models.js').RouteId, params: URLSearchParams }) => void} callback
   * @returns {() => void}
   */
  function subscribe(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  function start() {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/home');
    }
    syncDocumentTitle();
    window.addEventListener('hashchange', handleHashChange);
  }

  return {
    getCurrent,
    navigate,
    subscribe,
    start,
  };
}
