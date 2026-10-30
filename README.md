# Library Rotation

A fast, offline-capable, mobile-first Progressive Web App (PWA) for families to catalog children's books, manage multiple reader profiles, and curate fresh book rotations.

## Architecture Overview (Phases 1–2)

- **Stack**: Modular ES Modules JavaScript (`.js`) + HTML5 + Tailwind CSS v4 + Vite + `vite-plugin-pwa`.
- **Static Type Safety**: Comprehensive JSDoc `@typedef` contracts in `src/types/models.js` and `src/features/catalog/` checked via `tsc --noEmit` (`checkJs: true`).
- **Metadata Provider Layer (`src/features/catalog/`)**:
  - `providers/http-client.js`: Injectable `fetch` wrapper with `AbortController` timeouts, exponential backoff on HTTP `429` / `5xx` (honoring `Retry-After`), and bounded 60-entry TTL caching (`sessionStorage` + memory).
  - `providers/google-books-provider.js` & `providers/open-library-provider.js`: Public unauthenticated adapters implementing the `MetadataProvider` contract (`lookupByIsbn`, `searchBooks`).
  - `normalizer.js`: Sanitizes cover URLs (`http://` → `https://`), extracts & validates ISBN-10/ISBN-13 check digits, infers binding format, reading stage, and age range, extracts clean topic tags, and merges multi-provider matches (`mergeBookCandidates`) with optional raw JSON payload retention.
  - `catalog-service.js`: Parallel `Promise.allSettled` orchestrator that survives single-provider outages, deduplicates search results, and supports runtime extension via `registerProvider(adapter)`.
- **Routing (`src/core/router.js`)**: Hash-based SPA routing (`#/home`, `#/scan`, `#/rotations`, `#/profiles`, `#/settings`) compatible with GitHub Pages subpath hosting.
- **Storage & Fallbacks (`src/core/storage.js`)**:
  1. **Primary**: Browser `IndexedDB` (`library_rotation_db` v1).
  2. **Fallback 1**: Automatic transparent fallback to `localStorage` for restricted webviews / private browsing.
  3. **Fallback 2**: Automatic in-memory store for headless Node tests.
  4. **Portability**: Full JSON export & schema-validated JSON import in **Settings**.

## Adding a New Metadata Provider

Implement the `MetadataProvider` interface (`id`, `label`, `lookupByIsbn`, `searchBooks`) returning normalized `BookCandidate` objects, then register it on `catalogService`:

```js
catalogService.registerProvider({
  id: 'library-of-congress',
  label: 'Library of Congress',
  async lookupByIsbn(isbn13, options) { /* return BookCandidate | null */ },
  async searchBooks({ query, author }, options) { /* return BookCandidate[] */ },
});
```

## Local Development & Verification

```bash
# Install dependencies
npm install

# Start development server on http://localhost:3000
npm run dev

# Run automated unit & mocked provider integration tests
npm test

# Run JSDoc / TypeScript static type validation
npm run lint

# Build production PWA bundle (or relative GitHub Pages bundle)
npm run build
npm run build:gh-pages
```

## Deploying to GitHub Pages

1. Push the repository to GitHub on branch `main`.
2. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
3. `.github/workflows/deploy.yml` runs `npm test`, `npm run lint`, builds with `BASE_URL=/<repo-name>/`, and deploys `./dist` automatically.
