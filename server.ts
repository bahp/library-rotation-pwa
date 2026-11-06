/**
 * @fileoverview Full-stack Express server on port 3000:
 * - Exposes leak-free `/api/books/volumes` & `/api/books/status` routes that attach
 *   `process.env.GOOGLE_BOOKS_API_KEY` strictly on the server so secrets never enter client bundles,
 *   network URLs visible to the browser, localStorage caches, or error messages.
 * - Mounts Vite dev middleware in development and serves `dist/` static assets in production.
 */

import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

// Clean up tsx leaking a non-absolute __dirname (e.g. '.') onto globalThis, which breaks
// ESM packages like vite-plugin-pwa that check `typeof __dirname !== 'undefined'` and call createRequire(__dirname).
const globalScope = globalThis as unknown as { __dirname?: string };
if (typeof globalScope.__dirname === 'string' && !path.isAbsolute(globalScope.__dirname)) {
  delete globalScope.__dirname;
}

import { createServer as createViteServer } from 'vite';
import { proxyGoogleBooksVolumes } from './src/server/books-proxy.js';

// Port 3000 is required by the dev environment; port 8080 is reserved by the container's Nginx reverse-proxy.
const PORT = Number(
  process.env.APP_PORT ||
    (process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : 3000)
);
const HOST = '0.0.0.0';

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  const httpServer = http.createServer(app);

  // Health & configuration boolean check (NEVER returns the key value itself)
  app.get('/api/books/status', (_req, res) => {
    const keyConfigured = Boolean((process.env.GOOGLE_BOOKS_API_KEY || '').trim());
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      keyConfigured,
      mode: keyConfigured ? 'dedicated-server-key' : 'shared-anonymous-quota',
    });
  });

  // Server-side Google Books Volumes API proxy
  app.get('/api/books/volumes', async (req, res) => {
    const result = await proxyGoogleBooksVolumes({
      query: {
        q: typeof req.query.q === 'string' ? req.query.q : '',
        maxResults: typeof req.query.maxResults === 'string' ? req.query.maxResults : undefined,
        printType: typeof req.query.printType === 'string' ? req.query.printType : undefined,
      },
      apiKey: process.env.GOOGLE_BOOKS_API_KEY || '',
    });

    res.setHeader('Cache-Control', result.status === 200 ? 'private, max-age=300' : 'no-store');
    res.status(result.status).json(result.body);
  });

  const isProd = process.env.NODE_ENV === 'production';
  const enableHmr = process.env.ENABLE_HMR === 'true';
  const rootDir = process.cwd();
  const distDir = path.resolve(rootDir, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: enableHmr,
        ws: enableHmr ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, HOST, () => {
    const hasKey = Boolean((process.env.GOOGLE_BOOKS_API_KEY || '').trim());
    console.log(
      `[library-rotation] listening on http://${HOST}:${PORT} (Google Books server key: ${
        hasKey ? 'configured' : 'not set — using shared quota + Open Library fallback'
      })`
    );
  });
}

startServer();
