import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite 8 unconditionally injects `/@vite/client` (needed by dev CSS `updateStyle`) even when
 * `server.hmr === false` and `server.ws === false`.
 * - Leaving `createWebSocketModuleRunnerTransport` active causes eager WebSocket dials that fail
 *   with `Error: WebSocket closed without opened.` in iframe/proxy environments where HMR is off.
 * - Skipping `transport.connect(...)` leaves `normalizeModuleRunnerTransport` in `isConnected = false`,
 *   which causes any `import.meta.hot.send(...)` call (e.g. `vite-plugin-pwa`) to throw
 *   `SendBeforeConnectError: send was called before connect`.
 * Returning a synchronous no-op `{ connect() {}, disconnect() {}, send() {} }` transport marks
 * `transport` as connected immediately with zero WebSocket connections and zero send errors.
 */
export function createSuppressDisabledHmrWebSocketPlugin(enableHmr: boolean): Plugin {
  return {
    name: 'suppress-disabled-hmr-websocket',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (enableHmr) return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/vite/dist/client/client.mjs')) return null;
      const target = 'const createWebSocketModuleRunnerTransport = (options) => {';
      if (!code.includes(target)) return null;
      return {
        code: code.replace(
          target,
          'const createWebSocketModuleRunnerTransport = (options) => { if (options || true) return { connect() {}, disconnect() {}, send() {} };'
        ),
        map: null,
      };
    },
  };
}

export default defineConfig(() => {
  const base = process.env.BASE_URL || '/';
  const enableHmr = process.env.ENABLE_HMR === 'true';

  return {
    base,
    plugins: [
      createSuppressDisabledHmrWebSocketPlugin(enableHmr),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: base,
          name: 'Library Rotation',
          short_name: 'LibRotate',
          description:
            "A fast, offline-capable mobile-first PWA for families to catalog children's books, manage multiple reader profiles, and organize curated book rotations.",
          theme_color: '#FFFDF9',
          background_color: '#FAF6EE',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/(books\.google\.com|covers\.openlibrary\.org)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'book-cover-thumbnails',
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: enableHmr,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      modulePreload: {
        polyfill: true,
      },
    },
    server: {
      hmr: enableHmr,
      ws: enableHmr ? undefined : (false as const),
      watch: process.env.DISABLE_HMR === 'true' ? null : undefined,
    },
  };
});
