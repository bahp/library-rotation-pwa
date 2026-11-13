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

6. **Play & Storytime Tools (`#/play`)**
   - **Storytime & Topic Picker**: Randomly picks `1` to `4` books from the child's Active Shelf or Home Library—either for bedtime or filtered by any typed topic/mood (e.g., `"trucks"`, `"winter"`, `"animals"`, `"bedtime"`).
   - **Book Hunt ("Find It!")**: Interactive physical-shelf treasure hunt displaying a shelf cover + prompt (*"Find the book with the blue truck!"*) or a **Mystery Clue First** mode with a **Peek Cover** reveal and session streak counter.

7. **Installable Offline-First PWA & Data Portability (`#/settings`, Top-Right Header)**
   - Web App Manifest (`standalone`), Workbox service worker precaching + runtime font/cover caching, Chromium `beforeinstallprompt` install button, and iOS Safari **Share → Add to Home Screen** sheet.
   - Live zero-storage **Google Books Key Status** check (`/api/books/status`) + domain/API restriction guide—raw keys never enter browser forms or JSON backups.
   - Automatic storage cascade: **IndexedDB** → **`localStorage`** → **in-memory** fallback, plus full **JSON Backup Export & Schema-Validated Import**.

---

## React + Vite + Tailwind CSS Component Architecture

```text
├── .github/workflows/deploy.yml      # Automated CI test + lint + GitHub Pages deployment
├── index.html                        # App entry HTML, PWA meta tags, zero-FOUC theme & fetch guard
├── metadata.json                     # App metadata & camera frame permission
├── package.json                      # Scripts (dev, test, test:smoke, lint, build, build:gh-pages, verify)
├── tsconfig.json                     # TypeScript & JSX configuration (strict types + react-jsx)
├── vite.config.ts                    # Vite + React plugin + Tailwind CSS + vite-plugin-pwa Workbox config
├── public/                           # Generated SVG & PNG PWA icons (192, 512, maskable, apple-touch)
├── scripts/generate-icons.mjs        # Deterministic pure-Node PNG/SVG icon generator
├── src/
│   ├── main.tsx                      # React root mount (createRoot -> #app)
│   ├── App.tsx                       # Main App shell, view router, and modal provider
│   ├── index.css                     # Tailwind CSS v4, custom theme palette & scan animations
│   ├── context/
│   │   └── AppContext.tsx            # Reactive store hook, SPA router, scanner & modal providers
│   ├── components/
│   │   ├── common/                   # Shared UI primitives
│   │   │   ├── BookCover.tsx         # 3:4 or 1:1 book jacket with cloth-bound fallback & 4-corner badges
│   │   │   ├── ClearableInput.tsx    # Accessible text/search input with clear button
│   │   │   ├── FieldHelp.tsx         # Accessible toggleable (i) info pill & panel
│   │   │   ├── Icon.tsx              # Crisp SVG functional icons
│   │   │   ├── ProviderAttribution.tsx # Upstream metadata source chips
│   │   │   ├── StarRating.tsx        # 1–5 star interactive book rating
│   │   │   └── Toast.tsx             # Polite transient notification banner
│   │   ├── cards/                    # Reusable entity cards
│   │   │   ├── BookCard.tsx          # Interactive shelf & library grid book cards
│   │   │   ├── PlayAppCard.tsx       # Storytime Picker & Book Hunt launch cards
│   │   │   ├── PresetCard.tsx        # Thematic curated collection cards
│   │   │   └── RotationShelfCard.tsx # Active & saved rotation shelves with post-gen actions
│   │   ├── navigation/               # Responsive layout & navigation
│   │   │   ├── AppShell.tsx          # Accessible landmarks, skip link, header & bottom nav
│   │   │   ├── BottomNav.tsx         # Mobile 5-tab fixed bar with elevated scan button
│   │   │   ├── Header.tsx            # Desktop navigation & active reader switcher
│   │   │   └── ProfileSwitcherSheet.tsx # Slide-up sheet to switch between child readers
│   │   ├── modals/                   # Dialogs & slide-up sheets
│   │   │   ├── AiCuratorModal.tsx    # Smart shelf rotation assistant
│   │   │   ├── AiRecommendationsModal.tsx # Book gap discovery & 1-tap wishlist
│   │   │   ├── AiTaggingModal.tsx    # LLM categorized tag review & approval
│   │   │   ├── BookInspectorModal.tsx # Full book inspector, star rating & editor
│   │   │   ├── CoverStudioModal.tsx  # Multi-provider artwork search & upload
│   │   │   ├── FilterDrawer.tsx      # Comprehensive library filter & sort drawer
│   │   │   ├── FoundBookSheet.tsx    # Scanner ISBN recognition result sheet
│   │   │   ├── ProfileFormSheet.tsx  # Add / edit child profile with live DOB calculation
│   │   │   ├── RotationEditorModal.tsx # Searchable replacement & addition modals
│   │   │   └── WelcomeSetupModal.tsx # First-run Google Books provider setup guidance
│   │   └── views/                    # Full page SPA views
│   │       ├── HomeView.tsx          # Active shelf, recommendations, reading progress
│   │       ├── LibraryView.tsx       # Full family catalog grid, filter pills & search
│   │       ├── PlayView.tsx          # Storytime picker & Book Hunt shelf treasure hunt
│   │       ├── PresetsView.tsx       # Curated seasonal & thematic collections
│   │       ├── ProfilesView.tsx      # Multi-child profile management & read history
│   │       ├── RotationsView.tsx     # Rotation generator form & shelf manager
│   │       ├── ScanView.tsx          # 3-mode optical camera scanner, photo OCR, search & manual intake
│   │       └── SettingsView.tsx      # Theme, language, catalog providers, AI config, backups
│   ├── core/
│   │   ├── router.js                 # Hash SPA router (#/home, #/scan, #/rotations, etc.)
│   │   ├── storage.js                # IndexedDB -> localStorage -> memory adapter
│   │   └── store.js                  # Observable state store & domain action orchestrator
│   ├── data/seed.js                  # Starter family catalog & child profiles
│   ├── features/                     # Domain services (catalog, scanner, rotation, tagging, llm)
│   └── types/models.js               # Domain models, ISBN checksums & validators
└── tests/                            # Automated test suites (unit, integration, E2E smoke)
```

---

## Local Development Setup

Follow these steps to set up and run the application locally on your machine:

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/library-rotation.git
cd library-rotation
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` (`.env` is gitignored):
```bash
cp .env.example .env
```

Open `.env` in your editor and optionally configure your API keys:
```dotenv
# Dedicated Google Books API Key for server-side volume lookups (optional)
GOOGLE_BOOKS_API_KEY="your-google-books-api-key"

# Gemini API Key for server-side AI enrichment & smart rotation curation (optional)
GEMINI_API_KEY="your-gemini-api-key"
```

> **Security Note**: These secrets are read exclusively server-side in `server.ts` and `/api/*` proxy routes. Never prefix them with `VITE_` to ensure they never leak into client bundles.

### 4. Start the Local Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. The server runs Express with Vite middleware mounted, providing instant hot module reloading and full backend API proxy endpoints.

### 5. Testing & Verification
```bash
# Run TypeScript / static typecheck
npm run lint

# Run all automated test suites
npm test

# Run End-to-End smoke tests
npm run test:smoke

# Build production static bundle for GitHub Pages (relative base './')
npm run build

# Preview production build locally
npm run preview
```

---

## Configuring `GOOGLE_BOOKS_API_KEY` (Dedicated Quota & Leak-Free Server Proxy)

Without an API key, unauthenticated requests to Google Books API v1 share a global anonymous IP quota bucket on shared cloud infrastructure (which can trigger `HTTP 429: Quota exceeded ... project_number:624717413613` even if you personally made very few queries). Configuring a server-only `GOOGLE_BOOKS_API_KEY` gives your instance its own dedicated free daily quota while keeping the secret strictly off the client.

### Step 1: Create & Restrict Your Google Books API Key
1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Navigate to **APIs & Services → Library**, search for **Books API** (`books.googleapis.com`), and click **Enable**.
3. Navigate to **APIs & Services → Credentials → + Create Credentials → API key** and copy the generated key.
4. Click **Edit API key** to harden it:
   - Under **API restrictions**, select **Restrict key** and check **Books API** only.
   - *(Optional)* Under **Application restrictions**, restrict to your server's outbound IP addresses if hosting on a fixed IP. Do **not** use HTTP referrer restrictions because the key is called server-to-server by `server.ts`, never from the browser.

### Step 2: Set `GOOGLE_BOOKS_API_KEY` on the Server Only
- **In Google AI Studio / Cloud Run**:
  1. Open the **Secrets / Environment Variables** panel in the UI.
  2. Add a secret named `GOOGLE_BOOKS_API_KEY` pasted with your Google Books API key, then restart/redeploy the server.
- **In Local Development (`npm run dev` / `npm start`)**:
  1. Copy `.env.example` to `.env` (`.env` is gitignored):
     ```bash
     cp .env.example .env
     ```
  2. Set your key inside `.env`:
     ```dotenv
     GOOGLE_BOOKS_API_KEY="AIzaSyYourRestrictedBooksApiKey"
     ```
  3. Run `npm run dev` (starts the Express + Vite server in `server.ts` on `http://localhost:3000`).

> **Security Rule (Zero Leakage)**: **Never** prefix this variable with `VITE_` (do **not** use `VITE_GOOGLE_BOOKS_API_KEY`) and never commit `.env` to Git. `server.ts` attaches `process.env.GOOGLE_BOOKS_API_KEY` exclusively on server-to-Google requests inside `/api/books/volumes`, strips any echoed `?key=` parameters from upstream `selfLink` URLs, and redacts secrets from all error messages via `redactApiKeyFromText`.

### Step 3: Verify That Your Key Is Active
- In the app, open **Settings → Catalog Providers** and tap **Verify Google Books API Connection** (reports whether `dedicated-server-key` mode is active and confirms live volume retrieval), **or**
- Check `GET /api/books/status` (`http://localhost:3000/api/books/status`), which returns `{ "ok": true, "keyConfigured": true, "mode": "dedicated-server-key" }` without ever exposing the key value.
- *Static Hosting Note*: When deployed as a pure static bundle (e.g., GitHub Pages where `/api/books/volumes` returns `404`), `createGoogleBooksProvider` automatically falls back to direct client-side Google Books + Open Library queries.

---

## Deploying to GitHub Pages (v1.0 Deployment Guide)

Because **Library Rotation** uses hash-based SPA routing (`#/home`, `#/scan`, etc.), relative-capable asset paths (`BASE_URL`), and client-side IndexedDB storage, it runs natively on GitHub Pages without server rewrites or 404 hacks.

### Option A: Automated GitHub Actions Deployment (Recommended)
1. Push this repository to GitHub on your `main` (or `master`) branch.
2. In your GitHub repository, open **Settings → Pages** (left sidebar under *Code and automation*).
3. Under **Build and deployment → Source**, change the dropdown from *Deploy from a branch* to **GitHub Actions**. *(No branch selection or Jekyll config is needed once "GitHub Actions" is selected.)*
4. Push a commit or open the **Actions** tab → select **Deploy Library Rotation PWA to GitHub Pages** → click **Run workflow**.
5. `.github/workflows/deploy.yml` automatically:
   - Installs dependencies whether or not `package-lock.json` is committed (`npm ci` if present, `npm install --no-audit --no-fund` otherwise, with `~/.npm` cached via `actions/cache@v4`),
   - Runs `npm test` and `npm run lint`,
   - Configures GitHub Pages (`actions/configure-pages@v5`) and builds `./dist` with `BASE_URL=/<your-repo-name>/` so the PWA manifest `start_url`, `scope`, icons, and Service Worker register cleanly under your repository subpath,
   - Deploys `./dist` to `https://<username>.github.io/<your-repo-name>/`.

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
