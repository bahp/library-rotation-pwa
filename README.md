# Library Rotation (v1.0.0)

**Library Rotation** is a fast, offline-capable, mobile-first Progressive Web App (PWA) for families to catalog children's books, enrich metadata from open book providers, generate rule-based weekly book rotations per child, and deploy statically on **GitHub Pages** with zero backend infrastructure required.

---

## Core Capabilities

1. **Multi-Method Book Intake (`#/scan`)**
   - **Camera & Photo Scanner**: Three distinct optical guide geometries with animated scan-line sweeps and emerald lock feedback:
     - **Barcode Mode**: Wide horizontal EAN-13 / Bookland (`978`/`979`) target using hardware `BarcodeDetector` where available and lazy pure-JS `@zxing/library` fallback on iOS Safari / Firefox / desktop.
     - **ISBN Text OCR Mode**: Narrow single-line guide with contrast-stretched grayscale preprocessing into lazy WebAssembly `tesseract.js` OCR and check-digit validation (`ISBN-13` + `ISBN-10` → `978` conversion).
     - **Cover Frame Mode**: 3:4 portrait book jacket guide extracting printed cover titles or back-jacket ISBNs via OCR with automatic handoff to Search or ISBN lookup.
   - **Gallery Upload Alternative**: Every scan mode works identically with uploaded photos when camera permissions are unavailable or denied.
   - **Title & Author Search**: Debounced parallel search across **Google Books** + **Open Library** with tap-to-select candidates.
   - **Manual ISBN-10 / ISBN-13 Lookup & Offline Editor**: Check-digit validation, multi-provider metadata merging, one-tap local tag suggestion, and full manual editing.

2. **Metadata Normalization & Provenance (`src/features/catalog/`)**
   - Unifies disparate provider responses into a single strongly-typed `Book` schema (`title`, `authors`, `isbn13`, `isbn10`, `publishedYear`, `pageCount`, `coverUrl`, `format`, `readingStage`, `ageMin`, `ageMax`, `tags`, `readingLevelHint`, `sources`).
   - Automatically upgrades `http://` thumbnail URLs to `https://` and falls back to cloth-bound archival cover typography if offline or missing artwork (Zero Broken Images).
   - Optional **Retain Raw Provider JSON** toggle in Settings for inspecting raw upstream payloads inside the Book Details modal.

3. **Local Rule Tagging, Recommendations & Optional Keyless AI Adapter (`src/features/tagging/`)**
   - **Deterministic Local Rule Tagger**: Curated 27-topic children's literature taxonomy (`christmas`, `winter`, `nature`, `animals`, `dinosaurs`, `bedtime`, `feelings`, `space`, `vehicles`, `stem`, etc.), noise-category stripping (`Juvenile Fiction / General`), age/stage refinement, and human-readable `readingLevelHint` generation.
   - **Personalized Recommendations**: Ranks off-shelf books on the Home screen by age/stage fit, profile favorite topics, and cooldown freshness, plus collection topic-gap hints.
   - **Pluggable Keyless AI Enrichment (Strictly Opt-In)**: Disabled by default (`aiEnrichmentOptIn: false`). Supports on-device Chromium `LanguageModel` (`browser-prompt-api`) or a user-hosted keyless HTTPS proxy (`custom-endpoint`) with `AbortController` timeouts and automatic fallback to Local Rules.

4. **Deterministic Rotation Engine & Post-Generation Shelf Editor (`#/rotations`)**
   - Configurable book count, free-text rotation objective parser (e.g., `"hardcover + winter & bedtime"`), preferred topics, cooldown window (days), binding filter, author/topic variety constraints, and optional **deterministic seed** (`xmur3` + `mulberry32` PRNG) for repeatable shelves.
   - Post-generation operations on any active or saved shelf:
     - **Random Swap** (`Swap`) for any individual book slot.
     - **Manual Replace** (`Replace…`) via a ranked, searchable off-shelf picker modal.
     - **Add Books** (`+1 Random Eligible`, `+2 Random`, or multi-select manual additions).
     - **Mark Read** check-off synced directly to each child's reading history and cooldown tracker.

5. **Multi-Child Reader Profiles (`#/profiles`)**
   - Independent reader profiles with age, reading stage (`board-book`, `picture-book`, `early-reader`, `chapter-book`), favorite topics, default shelf size, cooldown days, read history, and saved rotations.

6. **Installable Offline-First PWA & Data Portability (`#/settings`)**
   - Web App Manifest (`standalone`), Workbox service worker precaching + runtime font/cover caching, Chromium `beforeinstallprompt` install button, and iOS Safari **Share → Add to Home Screen** sheet.
   - Automatic storage cascade: **IndexedDB** → **`localStorage`** → **in-memory** fallback, plus full **JSON Backup Export & Schema-Validated Import**.

---

## Feature-Based Folder Structure

```text
├── .github/workflows/deploy.yml      # Automated CI test + lint + GitHub Pages deployment
├── index.html                        # App entry HTML, PWA meta tags, zero-FOUC theme & fetch guard
├── metadata.json                     # App metadata & camera frame permission
├── package.json                      # Scripts (dev, test, test:smoke, lint, build, build:gh-pages, verify)
├── tsconfig.json                     # Strict JSDoc static type checking (allowJs + checkJs + noEmit)
├── vite.config.ts                    # Vite + Tailwind v4 + vite-plugin-pwa Workbox config
├── public/                           # Generated SVG & PNG PWA icons (192, 512, maskable, apple-touch)
├── scripts/generate-icons.mjs        # Deterministic pure-Node PNG/SVG icon generator
├── src/
│   ├── main.js                       # App bootstrap, delegated events, keyboard/modal focus manager
│   ├── index.css                     # Tailwind CSS v4, custom dark variant, safe-area & scan animations
│   ├── types/models.js               # JSDoc @typedef domain models, ISBN checksums, HTML escaping
│   ├── core/
│   │   ├── router.js                 # Hash router (#/home, #/scan, #/rotations, #/profiles, #/settings)
│   │   ├── storage.js                # IndexedDB -> localStorage -> memory adapter + migrations
│   │   └── store.js                  # Reactive state container & domain action orchestrator
│   ├── data/seed.js                  # Starter family catalog, 2 child profiles, and active shelf
│   ├── features/
│   │   ├── catalog/
│   │   │   ├── catalog-service.js    # Parallel multi-provider lookup/search & candidate deduplication
│   │   │   ├── normalizer.js         # Provider payload normalization & candidate merging
│   │   │   └── providers/
│   │   │       ├── http-client.js    # Timeout, 429/5xx exponential backoff, and 12h TTL cache
│   │   │       ├── google-books-provider.js
│   │   │       └── open-library-provider.js
│   │   ├── home/home-view.js         # Active shelf, recommendations, catalog filter, book/tag modal
│   │   ├── profiles/profiles-view.js # Multi-child profile management
│   │   ├── pwa/pwa-manager.js        # Install prompt, iOS guide, online/offline & SW status
│   │   ├── rotations/
│   │   │   ├── rotation-engine.js    # Seeded PRNG, objective parser, scoring, swap & add operations
│   │   │   └── rotations-view.js     # Shelf cards, rule generator form, and searchable picker modal
│   │   ├── scan/
│   │   │   ├── barcode-decoder.js    # Native BarcodeDetector + lazy @zxing/library fallback
│   │   │   ├── frame-processor.js    # Guide ROI crop & contrast-stretched grayscale preprocessing
│   │   │   ├── isbn-extractor.js     # OCR text noise cleaning & ISBN-10/13 extraction
│   │   │   ├── ocr-engine.js         # Lazy Tesseract.js WASM worker wrapper
│   │   │   ├── scanner-controller.js # Camera lifecycle, scan loop, and gallery upload analyzer
│   │   │   └── scan-shell-view.js    # 3-mode optical guides, search, ISBN lookup, and manual form
│   │   ├── settings/settings-view.js # PWA install, theme, provider/AI config, JSON backup/restore
│   │   └── tagging/
│   │       ├── rule-tagger.js        # Local taxonomy keyword rules & reading-level hint generator
│   │       ├── ai-tag-adapter.js     # Pluggable keyless AI enrichment registry & URL validator
│   │       ├── tagging-service.js    # Opt-in gate, timeout enforcement, and local fallback
│   │       └── recommendations.js    # Profile next-read recommender & topic-gap analyzer
│   └── ui/
│       ├── icons.js                  # Crisp inline SVG icon set
│       └── components/
│           ├── app-shell.js          # Skip link, 3-zone desktop header, 5-tab mobile bottom bar
│           └── book-cover.js         # 3:4 lazy/async cover image with cloth-bound fallback
└── tests/                            # 6 automated test suites (unit, adapter integration, E2E smoke)
```

---

## Local Setup, Testing & Quality Gates

### Prerequisites
- **Node.js 20+** (Node 22 LTS recommended) and **npm**.

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Start local dev server on http://localhost:3000
npm run dev

# 3. Run JSDoc / TypeScript static type check
npm run lint

# 4. Run all unit, mocked provider integration, and E2E smoke tests
npm test

# 5. Run only the Phase 6 End-to-End smoke journeys
npm run test:smoke

# 6. Run the full v1.0 release verification gate (lint + test + GitHub Pages build)
npm run verify

# 7. Preview the production static build locally
npm run preview
```

---

## Deploying to GitHub Pages (v1.0 Deployment Guide)

Because **Library Rotation** uses hash-based SPA routing (`#/home`, `#/scan`, etc.), relative-capable asset paths (`BASE_URL`), and client-side IndexedDB storage, it runs natively on GitHub Pages without server rewrites or 404 hacks.

### Option A: Automated GitHub Actions Deployment (Recommended)
1. Push this repository to GitHub on the `main` branch.
2. Open your repository on GitHub and navigate to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. The included workflow (`.github/workflows/deploy.yml`) automatically:
   - Installs dependencies (`npm ci`),
   - Runs `npm test` and `npm run lint`,
   - Builds the static PWA bundle with `BASE_URL=/<your-repo-name>/` so the Web App Manifest `start_url`, `scope`, icons, and Service Worker register cleanly under your repository subpath,
   - Publishes `./dist` to `https://<username>.github.io/<your-repo-name>/`.

### Option B: Manual Static / Subpath Build
To build a portable static bundle for any subpath or static host (GitHub Pages `gh-pages` branch, Cloudflare Pages, Netlify, Firebase Hosting, or S3):

```bash
# Relative base path (works from root or subfolder)
npm run build:gh-pages

# Or explicit GitHub Pages repository subpath (recommended for PWA manifest scope)
BASE_URL=/library-rotation/ npm run build
```

Upload the contents of `./dist` to your static host. Ensure HTTPS is enabled (GitHub Pages enforces HTTPS by default), which is required by mobile browsers for `navigator.mediaDevices.getUserMedia` camera access and Service Worker registration.

---

## Browser Compatibility & Graceful Degradation Matrix

| Capability | Chrome / Edge (Android & Desktop) | iOS Safari (16.4+) | Firefox (Android & Desktop) | Restricted WebView / Offline |
| :--- | :--- | :--- | :--- | :--- |
| **Live Camera Stream** | Hardware rear camera (`environment`) | Hardware rear camera (HTTPS) | Hardware rear camera (HTTPS) | Graceful fallback to **Upload Photo** |
| **Barcode Decoding** | Native `BarcodeDetector` (fast hardware path) | Auto-fallback to lazy `@zxing/library` | Auto-fallback to lazy `@zxing/library` | Works on uploaded gallery images |
| **ISBN / Cover OCR** | Lazy `tesseract.js` WASM worker | Lazy `tesseract.js` WASM worker | Lazy `tesseract.js` WASM worker | Manual ISBN & Offline Form fallback |
| **Persistence** | `IndexedDB` (`library_rotation_db`) | `IndexedDB` | `IndexedDB` | Auto-fallback to `localStorage` → memory |
| **PWA Installation** | In-app button (`beforeinstallprompt`) | Guided **Share → Add to Home Screen** sheet | Browser menu **Install** | Runs as responsive mobile web app |
| **Tag Enrichment** | Local Rules (+ optional on-device `LanguageModel`) | Local Rules (+ optional keyless HTTPS proxy) | Local Rules (+ optional keyless HTTPS proxy) | 100% offline Local Rules engine |

---

## Extension Guide

### 1. Adding a New Metadata Provider
Implement the `MetadataProvider` interface (`id`, `label`, `lookupByIsbn`, `searchBooks`) returning normalized `BookCandidate` objects, then register it on `CatalogService`:

```js
catalogService.registerProvider({
  id: 'library-of-congress',
  label: 'Library of Congress',
  async lookupByIsbn(isbn13, { signal, retainRaw }) {
    // Fetch upstream API and normalize via normalizeBookRecord(...)
    return null;
  },
  async searchBooks({ query, author, limit }, { signal, retainRaw }) {
    return [];
  },
});
```

### 2. Registering a Custom Keyless AI Enrichment Adapter
Implement `AiTagEnrichmentAdapter` (`id`, `label`, `transportKind`, `privacyNote`, `isAvailable`, `enrichBook`) and register it on the `AiAdapterRegistry`:

```js
store.getTaggingService().registerAdapter({
  id: 'local-ollama-bridge',
  label: 'LocalHome Bridge',
  transportKind: 'remote-proxy',
  privacyNote: 'Sends book title & authors to your local home server.',
  isAvailable(settings) {
    return { available: Boolean(settings.aiEndpointUrl), reason: 'Ready' };
  },
  async enrichBook(bookInput, settings, signal) {
    // Return { tags: ['nature', 'winter'], ageMin: 3, ageMax: 6, readingLevelHint: '...' }
    return { tags: [] };
  },
});
```

---

## Security, Privacy & Performance Architecture

- **Zero Client Secrets**: No API keys exist anywhere in source code, build artifacts, or UI forms. Custom proxy URLs reject embedded credentials (`user:pass@`) and query-string secret tokens (`?key=`, `?token=`, `?api_key=`).
- **Privacy by Default**: All family profiles, reading histories, and catalogs stay in on-device storage. Optional AI enrichment is strictly `OFF` until explicitly opted in.
- **Lazy Heavy Engines**: Both `@zxing/library` (~120 kB gzipped) and `tesseract.js` (~21 kB + WASM worker) are loaded via dynamic `import()` only when a user initiates a barcode or OCR scan, keeping the initial application JS payload ~57 kB gzipped.
- **Rate-Limit Resilience**: Provider HTTP requests use a 12-hour bounded cache, `380ms` input debouncing, `AbortController` cancellation on stale queries, and exponential backoff honoring `Retry-After` headers.

---

## Architectural Tradeoffs & Post-v1.0 Roadmap

- **Hash Routing vs. History API**: Chose `#/` hash routing so deep links (`#/scan`, `#/rotations`) never trigger HTTP 404 responses on static GitHub Pages refreshes without requiring custom `404.html` redirect scripts.
- **Delegated String Rendering vs. Virtual DOM Framework**: Kept the runtime pure ES Modules JavaScript with zero framework overhead for instant mobile cold-start, paired with input cursor preservation and JSDoc `tsc --noEmit` static verification.
- **Post-v1.0 Roadmap**:
  1. Visual cover-artwork embedding search (on-device quantized MobileNet/CLIP embeddings matched against local cover thumbnails) to complement OCR cover title extraction.
  2. Printable shelf cards / QR check-off sheet generator for physical Montessori front-facing bookshelves.
  3. Optional end-to-end encrypted WebRTC / QR device-to-device family sync between two parents' phones without a central account server.
