# Project State & Roadmap: Library Rotation (v1.0.0)

> **Context-Saving State File**: This file serves as the single source of truth across fresh chat sessions. Instead of carrying long multi-turn chat history (which exhausts credits), new chats can be started by pasting this file or its "Current State & Next Steps" section.

---

## 1. Quick Technical Blueprint
- **Stack**: Pure ES Modules + Tailwind CSS v4 + Express (`server.ts`) + Vite dev proxy + JSDoc / `tsc --noEmit`.
- **Persistence**: Storage cascade (`IndexedDB` -> `localStorage` -> in-memory) + JSON Backup export/restore.
- **Providers**: Google Books API (leak-free server proxy + status diagnostics) + Open Library.
- **Intake**: Camera & Gallery Barcode (`BarcodeDetector` + `@zxing/library`), single-line OCR ISBN (`tesseract.js`), 3:4 Cover Frame, QR code URL reader.
- **Verification Gate**: `npm run verify` (`npm run lint && npm test && npm run build:gh-pages`).
- **Test Suite**: 7 consolidated domain-driven suites in `/tests/` (`foundation.test.js`, `catalog-and-providers.test.js`, `scanner-and-intake.test.js`, `rotations-and-engine.test.js`, `tagging-and-recommendations.test.js`, `ui-and-components.test.js`, `e2e-smoke.test.js`). 25 obsolete phase files pruned to reduce repo tree context size and speed up test runs.

---

## 2. Inventory of Implemented Features (Phases 1–32)

### A. Book Intake & Scanning (`#/scan`)
- [x] Multi-mode camera scanner: Barcode (EAN-13/Bookland), OCR ISBN text guide, and 3:4 Cover Frame.
- [x] Hardware `BarcodeDetector` with lazy pure-JS `@zxing/library` fallback.
- [x] Lazy Tesseract WASM engine with contrast-stretched grayscale preprocessing.
- [x] QR code intake for library/bookstore URLs and ISBN identifiers.
- [x] Gallery photo upload alternative for all 3 scan modes.
- [x] Title & Author parallel search across Google Books and Open Library.
- [x] Manual ISBN-10/13 lookup and complete offline book creator.
- [x] Slide-up "Found Book" confirmation sheet with Re-scan & customize actions.

### B. Catalog Normalization & Book Inspector (`#/library`)
- [x] Unified normalized schema (`title`, `authors`, `isbn13`, `coverUrl`, `dimensions`, `publisher`, `language`, etc.).
- [x] Cloth-bound archival fallback for missing cover images (zero broken images).
- [x] Dynamic cover art dominant color extraction for inspector spotlighting.
- [x] 1-to-5 star user rating system under cover with one-tap toggle/remove.
- [x] Separate clean ISBN monospace line, bold age tags, and emerald green storytime pacing hints.
- [x] Auto-computed indicator (`✦`) for estimated age and storytime duration.
- [x] Rotation eligibility toggle (`excludeFromRotations`) to omit reference/delicate books from auto-rotations.
- [x] Owner assignment (Multi-child, Shared, Custom) with avatar badges and quick filters.
- [x] Searchable, multi-facet Left Filter Drawer (format, theme, owner, reading stage, condition).

### C. Rotation Engine & Shelf Management (`#/rotations`)
- [x] Deterministic rotation engine with seeded PRNG (`xmur3` + `mulberry32`).
- [x] Objective parser (e.g. `"winter + bedtime - early-reader"`).
- [x] Cooldown enforcement, author/topic variety weighting, and age/stage compatibility.
- [x] Post-generation operations: Random Swap, Manual Searchable Replace modal, +1/+2 Random Add.
- [x] Read check-off synced with child reading history and cooldown dates.
- [x] Collection presets and inline shelf renaming.
- [x] Scheduled Swap Day calculation and dismissible alerts.

### D. Multi-Child Reader Profiles (`#/profiles`)
- [x] Individual child profiles with birth date picker (age auto-calculated), reading stage, and favorite topics.
- [x] Profile switcher in top-right and navigation drawer.
- [x] Per-profile active shelf and reading history tracking.

### E. Play & Storytime Activities (`#/play`)
- [x] Storytime & Topic Picker (1 to 4 random books from active shelf or home library filtered by mood/topic).
- [x] Book Hunt ("Find It!") physical-shelf scavenger hunt with prompt hints, mystery clue mode, cover reveal, and streaks.

### F. Settings, Security, i18n & PWA (`#/settings`)
- [x] Standalone PWA install support (`beforeinstallprompt` + iOS Safari Add-to-Home guide).
- [x] Full multilingual i18n support (English `en.yaml`, Spanish `es.yaml`, Italian `it.yaml`).
- [x] Leak-free server proxy for Google Books (`/api/books/volumes` and `/api/books/status`).
- [x] JSON backup export and schema-validated import.
- [x] Configurable "Search Quickly While Typing" toggle (defaulting to off).

---

## 3. Current Stable Baseline
- **Build**: Compiles cleanly with zero errors (`npm run build`).
- **Static Typing**: JSDoc TypeScript checks pass (`npm run lint` -> `tsc --noEmit` exits 0).
- **Automated Tests**: 7 consolidated domain suites (42 comprehensive tests, all passing with 0 failures).
- **Working Tree**: Clean, 25 obsolete duplicate phase test files pruned to reduce context tokens.

---

## 4. Immediate Backlog / Future Opportunities
1. **Printable Shelf Tags & QR Check-off Cards**: Front-facing Montessori bookshelf labels with covers/QR codes.
2. **Visual Cover Embedding Match**: Local on-device quantized embeddings for cover identification.
3. **P2P Family Sync**: Encrypted QR or WebRTC device-to-device sync between parent devices.
4. **Performance & Bundle Optimization**: Preload critical icons, tune service worker cache limits.

---

## 5. Token-Saver Protocol for You & the AI

### When finishing a feature / turn:
Simply say:
> **"Summarize our progress, what files we touched, and update TODO.md."**

The assistant will:
1. Update `TODO.md` directly in the project.
2. Output a brief 4-line markdown snippet you can copy.

### When starting a fresh chat session:
Paste the snippet or the following prompt into your brand new chat:
```markdown
We are working on Library Rotation (PWA). Here is our current TODO.md state:
[Paste Section 1 & Section 3 from TODO.md or the recent update snippet]

Our next task is: [Describe what you want to build next]
```
This avoids sending dozens of previous chat turns and cuts prompt token consumption by 90%+.
