/**
 * @fileoverview Phase 26 Regression Tests:
 * 1) Play bottom-sheet full-height playability, z-index above mobile nav bar (`z-50`),
 *    Material slide-up/down class (`animate-sheet-up`), flex scrollable body (`flex-1 min-h-0 overflow-y-auto`),
 *    and Book Inspector stacking (`z-[60]`) above open Play sheets.
 * 2) Startup Welcome Setup modal roomy large-screen layout (`sm:max-w-2xl`) and non-squashed
 *    `"Continue with Open Library"` action button (`whitespace-nowrap shrink-0`, balanced footer spacing).
 * 3) Zero header/layout shift when navigating to `#/settings` (`scrollbar-gutter: stable` on `html`,
 *    locked 3-column desktop header grid `lg:grid-cols-[1fr_auto_1fr]`, and full-width `w-full space-y-5`
 *    page wrapper matching Home/Library/Scan/Rotations/Play).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderPlayView, createDefaultPlayUiState } from '../src/features/play/play-view.js';
import { renderWelcomeBooksSetupModal } from '../src/ui/components/welcome-setup-modal.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderProfilesView } from '../src/features/profiles/profiles-view.js';

async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 26 — Play Bottom Sheet Full-Content Scroll, Z-Layering & Slide-Up Motion', () => {
  it('1. Renders Play sheet above mobile nav (z-50), uses animate-sheet-up motion, and gives full scrollable flex-1 min-h-0 body + z-[60] Book Inspector above it', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const sampleBook = state.books[0];

    const defaultUi = createDefaultPlayUiState();
    const pickerOpenHtml = renderPlayView({
      state,
      playUiState: {
        ...defaultUi,
        activeAppId: 'storytime-picker',
        randomizerHasRun: true,
        pickedBookIds: state.books.slice(0, 3).map((b) => b.id),
      },
      inspectedBookId: sampleBook.id,
    });

    // Extract the Play sheet backdrop & dialog block
    const playSheetMatch = pickerOpenHtml.match(
      /<div[^>]*data-play-app-sheet="storytime-picker"[^>]*>[\s\S]*?data-play-sheet-body="true"/
    );
    assert.ok(playSheetMatch, 'Expected Play sheet backdrop and data-play-sheet-body container');

    const playSheetSnippet = playSheetMatch[0];
    assert.match(
      playSheetSnippet,
      /\bz-50\b/,
      'Play sheet backdrop must use z-50 so the z-40 mobile bottom navigation bar never covers bottom game controls'
    );
    assert.doesNotMatch(
      playSheetSnippet,
      /\bsheet-panel\b/,
      'Play sheet dialog must not use non-existent sheet-panel class'
    );
    assert.match(
      playSheetSnippet,
      /\banimate-sheet-up\b/,
      'Play sheet dialog must use animate-sheet-up so mobile devices slide up smoothly on open and slide down on close'
    );
    assert.match(
      playSheetSnippet,
      /\bmax-h-\[92dvh\](?:\s|")/,
      'Play sheet dialog should use dynamic viewport height max-h-[92dvh] on mobile so browser chrome never clips controls'
    );

    // Verify scrollable body has flex-1 min-h-0 overflow-y-auto and safe-area bottom clearance
    assert.match(
      pickerOpenHtml,
      /data-play-sheet-body="true"[^>]*\bflex-1\b[^>]*\bmin-h-0\b[^>]*\boverflow-y-auto\b/,
      'Play sheet body must use flex-1 min-h-0 overflow-y-auto so tall Storytime/Hunt states scroll all the way to the bottom'
    );

    // Verify Book Inspector stacks above the z-50 Play sheet when inspecting a picked/hunted book
    assert.match(
      pickerOpenHtml,
      /data-backdrop-action="close-inspect-book"[^>]*\bz-\[60\]/,
      'Book Inspector modal must use z-[60] so inspecting a book from inside Play layers cleanly above the z-50 Play sheet'
    );
  });
});

describe('Phase 26 — Startup Welcome Modal Large-Screen Spacing & Non-Squashed Actions', () => {
  it('2. Gives the startup Welcome Setup modal a roomy desktop width (sm:max-w-2xl) and protects Continue with Open Library from squashing', () => {
    const modalHtml = renderWelcomeBooksSetupModal({
      isOpen: true,
      googleBooksKeyStatus: 'static-host',
    });

    assert.match(
      modalHtml,
      /role="dialog"[^>]*\bsm:max-w-2xl\b/,
      'Welcome modal should widen on larger screens (sm:max-w-2xl) so 3 footer actions fit comfortably'
    );
    assert.match(
      modalHtml,
      /data-welcome-actions="true"[^>]*\bsm:justify-between\b/,
      'Welcome modal footer should separate Continue with Open Library from setup buttons with balanced space'
    );

    // Extract the "Continue with Open Library" button and ensure whitespace-nowrap + shrink-0 + comfortable padding
    const dismissButtons =
      modalHtml.match(/<button[^>]*data-action="dismiss-welcome-books-modal"[\s\S]*?<\/button>/g) ||
      [];
    const continueButtonHtml =
      dismissButtons.find((btn) => btn.includes('Continue with Open Library')) || '';
    assert.ok(continueButtonHtml, 'Expected Continue with Open Library button');
    assert.match(
      continueButtonHtml,
      /\bwhitespace-nowrap\b/,
      'Continue with Open Library button must include whitespace-nowrap so its label never wraps/squashes on desktop'
    );
    assert.match(
      continueButtonHtml,
      /\bshrink-0\b/,
      'Continue with Open Library button must include shrink-0 so adjacent buttons cannot crush its width'
    );
  });
});

describe('Phase 26 — Static Header & Main Layout Alignment Across Settings and Main Tabs', () => {
  it('3. Reserves stable scrollbar gutter, locks desktop header into a 3-column grid, and uses full-width page wrappers on Settings & Profiles', async () => {
    const rootDir = process.cwd();
    const indexCss = await fs.readFile(path.join(rootDir, 'src', 'index.css'), 'utf8');
    assert.match(
      indexCss,
      /html\s*\{[\s\S]*?scrollbar-gutter:\s*stable\s*;/,
      'html must reserve scrollbar-gutter: stable so navigating to tall pages like Settings never shifts centered layout horizontally'
    );

    const store = await createTestStore();
    const state = store.getState();
    const pwaStatus = {
      isInstallable: false,
      isInstalled: false,
      isIOS: false,
      isOnline: true,
      swReady: true,
      showIosInstructions: false,
    };

    const homeShellHtml = renderAppShell({
      activeRoute: 'home',
      state,
      toast: null,
      pwaStatus,
      contentHtml: '<div>Home</div>',
    });
    const settingsShellHtml = renderAppShell({
      activeRoute: 'settings',
      state,
      toast: null,
      pwaStatus,
      contentHtml: '<div>Settings</div>',
    });

    assert.match(
      homeShellHtml,
      /<header[\s\S]*?\blg:grid\b[\s\S]*?\blg:grid-cols-\[1fr_auto_1fr\]/,
      'Desktop header inner bar must lock Brand, Primary Nav, and Reader/Settings into lg:grid-cols-[1fr_auto_1fr]'
    );
    assert.match(
      settingsShellHtml,
      /<header[\s\S]*?\blg:grid\b[\s\S]*?\blg:grid-cols-\[1fr_auto_1fr\]/,
      'Settings route header must use identical lg:grid-cols-[1fr_auto_1fr] geometry'
    );

    const settingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus,
      adapterDiagnostics: [],
    });
    assert.doesNotMatch(
      settingsHtml,
      /^\s*<div class="max-w-3xl\b/,
      'Settings outer wrapper must not shrink to left-aligned max-w-3xl while all other pages span max-w-6xl'
    );
    assert.match(
      settingsHtml,
      /^\s*<div class="w-full space-y-5">/,
      'Settings outer wrapper must span w-full space-y-5 inside <main class="max-w-6xl mx-auto"> just like Home, Library, Scan, Rotations, and Play'
    );

    const profilesHtml = renderProfilesView({
      state,
      profilesUiState: { isFormOpen: false, editingProfileId: null },
    });
    assert.doesNotMatch(
      profilesHtml,
      /^\s*<div class="max-w-3xl\b/,
      'Profiles outer wrapper must also span w-full space-y-5 without left-aligned max-w-3xl shift'
    );
  });
});
