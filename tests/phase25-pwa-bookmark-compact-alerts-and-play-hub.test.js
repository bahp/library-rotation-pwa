/**
 * @fileoverview Phase 25 Regression Suite:
 * 1) Home Screen PWA Bookmark button in Settings + smart dismissible Home Screen notification banner + universal install guide sheet.
 * 2) Compact phone notification banners (`Suggested 5 days ago (Oct 15)`, `h-7 sm:h-8` mobile buttons, corner `×` dismiss).
 * 3) Play hub (`#/play`) configurable game preview cards (`src/data/play-apps-config.js`) + slide-up Material bottom sheet.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  createPwaInstallController,
  renderPwaInstallBanner,
} from '../src/features/pwa/pwa-install-banner.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import {
  getAllRotationPresets,
  renderPresetStartDateAlertBanner,
} from '../src/features/rotations/rotation-presets.js';
import {
  computeRotationSchedule,
  renderSwapDayAlertBanner,
} from '../src/features/rotations/rotation-schedule.js';
import {
  PLAY_APPS_CONFIG,
  getPlayAppsConfig,
} from '../src/data/play-apps-config.js';
import {
  createDefaultPlayUiState,
  renderPlayView,
  resolveActivePlayAppId,
} from '../src/features/play/play-view.js';
import { APP_DOCS_LINKS, APP_VERSION } from '../src/version.js';

/**
 * Helper to create an initialized in-memory store with starter seed data.
 */
async function createTestStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 25 — Home Screen PWA Bookmark Button & Smart Notification Banner', () => {
  it('always renders an actionable Home Screen install button in Settings when not yet installed', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const diagnostics = store.getTaggingService().getAdapterDiagnostics(state.settings);

    // 1) Browser without beforeinstallprompt (e.g. Firefox / Safari / already dismissed native prompt)
    const fallbackSettingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      adapterDiagnostics: diagnostics,
    });
    assert.ok(
      fallbackSettingsHtml.includes('data-action="install-pwa"'),
      'Settings must always expose data-action="install-pwa" when not yet installed'
    );
    assert.ok(fallbackSettingsHtml.includes('Save to Home Screen'));

    // 2) Chromium with native beforeinstallprompt ready
    const nativeSettingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: true,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      adapterDiagnostics: diagnostics,
    });
    assert.ok(nativeSettingsHtml.includes('data-action="install-pwa"'));
    assert.ok(nativeSettingsHtml.includes('Save to Home Screen'));

    // 3) Already running as standalone installed PWA -> shows Installed badge instead of button
    const installedSettingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus: {
        isInstallable: false,
        isInstalled: true,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      adapterDiagnostics: diagnostics,
    });
    assert.equal(installedSettingsHtml.includes('data-action="install-pwa"'), false);
    assert.ok(installedSettingsHtml.includes('Installed in standalone home-screen mode'));
  });

  it('opens tailored Home Screen install instructions when native beforeinstallprompt is unavailable', async () => {
    const store = await createTestStore();
    const state = store.getState();

    const controller = createPwaInstallController();
    assert.equal(controller.getStatus().showIosInstructions, false);

    // Without deferredPrompt, triggerInstall() opens the step-by-step Home Screen guide sheet
    const outcome = await controller.triggerInstall();
    assert.equal(outcome, 'install-guide');
    assert.equal(controller.getStatus().showIosInstructions, true);

    // Verify AppShell renders browser menu instructions for non-iOS and Safari Share instructions for iOS
    const nonIosShellHtml = renderAppShell({
      activeRoute: 'settings',
      state,
      toast: null,
      pwaStatus: controller.getStatus(),
      contentHtml: '<div>Content</div>',
    });
    assert.ok(nonIosShellHtml.includes('Save Bookmark to Home Screen'));
    assert.ok(nonIosShellHtml.includes('Add to Home screen'));

    const iosShellHtml = renderAppShell({
      activeRoute: 'settings',
      state,
      toast: null,
      pwaStatus: {
        ...controller.getStatus(),
        isIOS: true,
        showIosInstructions: true,
      },
      contentHtml: '<div>Content</div>',
    });
    assert.ok(iosShellHtml.includes('Add Book Rotation to Home Screen'));
    assert.ok(iosShellHtml.includes('Share'));

    controller.closeIosGuide();
    assert.equal(controller.getStatus().showIosInstructions, false);
  });

  it('shows the compact Home Screen PWA notification banner on Home only when eligible and not dismissed', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const baseUiState = {
      catalogFilter: 'all',
      searchQuery: '',
      inspectedBookId: null,
      dismissedSwapReminderKeys: /** @type {string[]} */ ([]),
      dismissedPresetAlertKeys: /** @type {string[]} */ ([]),
      pwaBannerDismissed: false,
    };

    // 1) Initial frame before engagement timer / beforeinstallprompt -> no arrival popup
    const initialHomeHtml = renderHomeView({
      state,
      uiState: baseUiState,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: true,
        promptReady: false,
      },
      referenceDate: '2028-05-10',
    });
    assert.equal(initialHomeHtml.includes('data-pwa-install-banner="true"'), false);

    // 2) Once promptReady (or isInstallable) becomes true -> renders compact banner on Home
    const readyHomeHtml = renderHomeView({
      state,
      uiState: baseUiState,
      pwaStatus: {
        isInstallable: true,
        isInstalled: false,
        isIOS: false,
        promptReady: true,
      },
      referenceDate: '2028-05-10',
    });
    assert.equal(readyHomeHtml.includes('data-pwa-install-banner="true"'), true);
    assert.equal(readyHomeHtml.includes('data-action="install-pwa"'), true);
    assert.equal(readyHomeHtml.includes('data-action="dismiss-pwa-install-banner"'), true);

    // 3) Dismissed by user -> hidden
    const dismissedHomeHtml = renderHomeView({
      state,
      uiState: { ...baseUiState, pwaBannerDismissed: true },
      pwaStatus: {
        isInstallable: true,
        isInstalled: false,
        isIOS: false,
        promptReady: true,
      },
      referenceDate: '2028-05-10',
    });
    assert.equal(dismissedHomeHtml.includes('data-pwa-install-banner="true"'), false);

    // 4) Already installed -> hidden
    assert.equal(
      renderPwaInstallBanner({
        pwaStatus: { isInstallable: true, isInstalled: true, promptReady: true },
        dismissed: false,
      }),
      ''
    );
  });
});

describe('Phase 25 — Compact Phone Notification Banners & Concise Date Copy', () => {
  it('renders shorter Suggested X days ago (Date) copy, compact mobile buttons, and corner dismiss icons', async () => {
    const store = await createTestStore();
    const state = store.getState();
    const activeProfile = state.profiles[0];
    const presets = getAllRotationPresets(state);

    // 5 days after Oct 15 ('2028-10-20') -> "Suggested 5 days ago (Oct 15)"
    const pastDueBanner = renderPresetStartDateAlertBanner({
      presets,
      activeProfile,
      daysBefore: 2,
      daysAfter: 5,
      referenceDate: '2028-10-20',
      showBrowseLink: true,
    });
    assert.ok(
      pastDueBanner.includes('Suggested 5 days ago (Oct 15)'),
      'Past-due alert must use concise "Suggested 5 days ago (Oct 15)" with only the date in parentheses'
    );
    assert.equal(
      pastDueBanner.includes('Notification appeared'),
      false,
      'Old verbose "Notification appeared..." copy must be removed'
    );
    assert.equal(
      pastDueBanner.includes('(Suggested Oct 15)'),
      false,
      'Parentheses must contain just the date "(Oct 15)"'
    );
    // Compact mobile button & clamping classes
    assert.ok(pastDueBanner.includes('h-7 sm:h-8'));
    assert.ok(pastDueBanner.includes('text-[11px] sm:text-xs'));
    assert.ok(pastDueBanner.includes('line-clamp-1'));
    assert.ok(pastDueBanner.includes('data-action="dismiss-preset-start-alert"'));

    // Exact start date ('2028-10-15') -> "Suggested today (Oct 15)"
    const todayBanner = renderPresetStartDateAlertBanner({
      presets,
      activeProfile,
      daysBefore: 2,
      daysAfter: 5,
      referenceDate: '2028-10-15',
    });
    assert.ok(todayBanner.includes('Suggested today (Oct 15)'));

    // 2 days before ('2028-10-13') -> "Starts in 2 days (Oct 15)"
    const upcomingBanner = renderPresetStartDateAlertBanner({
      presets,
      activeProfile,
      daysBefore: 2,
      daysAfter: 5,
      referenceDate: '2028-10-13',
    });
    assert.ok(upcomingBanner.includes('Starts in 2 days (Oct 15)'));

    // Swap-day overdue banner also uses compact mobile layout + date in parentheses
    const activeRotation = state.rotations.find((r) => r.status === 'active');
    assert.ok(activeRotation);
    const overdueRotation = {
      ...activeRotation,
      createdAt: '2028-10-01T10:00:00.000Z',
      rules: { ...activeRotation.rules, swapDays: 10 },
    };
    const overdueSchedule = computeRotationSchedule(
      overdueRotation,
      activeProfile,
      '2028-10-15T12:00:00.000Z'
    );
    const swapBanner = renderSwapDayAlertBanner({
      rotation: overdueRotation,
      profile: activeProfile,
      schedule: overdueSchedule,
      dismissedReminderKeys: [],
    });
    assert.ok(swapBanner.includes('Swap due 4 days ago (Oct 11)'));
    assert.ok(swapBanner.includes('h-7 sm:h-8'));
    assert.ok(swapBanner.includes('data-action="dismiss-swap-reminder"'));
  });
});

describe('Phase 25 — Configurable Play App Previews & Slide-Up Bottom Sheet', () => {
  it('ships static Play logos & preview images on disk and exposes easy declarative configuration', () => {
    assert.equal(APP_VERSION, '1.20.0');
    assert.equal(APP_DOCS_LINKS.playAppsGuide, 'docs/configuration.html#play-apps');
    assert.equal(PLAY_APPS_CONFIG.length, 2);

    for (const app of PLAY_APPS_CONFIG) {
      assert.ok(app.imageUrl.startsWith('assets/play/'));
      assert.ok(app.logoUrl.startsWith('assets/play/'));
      assert.equal(
        existsSync(resolve(process.cwd(), 'public', app.imageUrl)),
        true,
        `Expected public/${app.imageUrl} to exist`
      );
      assert.equal(
        existsSync(resolve(process.cwd(), 'public', app.logoUrl)),
        true,
        `Expected public/${app.logoUrl} to exist`
      );
    }

    const customized = getPlayAppsConfig({
      'storytime-picker': {
        logoUrl: 'assets/play/custom-owl-logo.png',
        imageUrl: 'assets/play/custom-bedtime-banner.png',
        title: 'Custom Bedtime Spinner',
      },
    });
    assert.equal(customized[0].title, 'Custom Bedtime Spinner');
    assert.equal(customized[0].logoUrl, 'assets/play/custom-owl-logo.png');
    assert.equal(customized[0].imageUrl, 'assets/play/custom-bedtime-banner.png');
    assert.equal(customized[1].id, 'book-hunt');

    const docsHtml = readFileSync(
      resolve(process.cwd(), 'public/docs/configuration.html'),
      'utf8'
    );
    assert.ok(docsHtml.includes('id="play-apps"'));
    assert.ok(docsHtml.includes('src/data/play-apps-config.js'));
  });

  it('renders preview cards by default on #/play, slides up the selected game in a bottom sheet, and honors custom logo/image overrides', async () => {
    const store = await createTestStore();
    const state = store.getState();

    // 1) Default entry to #/play -> shows 2 preview cards, NO open bottom sheet or inline game forms
    const defaultUi = createDefaultPlayUiState();
    assert.equal(resolveActivePlayAppId(defaultUi), null);

    const galleryHtml = renderPlayView({
      state,
      playUiState: defaultUi,
    });
    assert.ok(galleryHtml.includes('data-play-app-gallery="true"'));
    assert.ok(galleryHtml.includes('data-play-preview-card="storytime-picker"'));
    assert.ok(galleryHtml.includes('data-play-preview-card="book-hunt"'));
    assert.ok(galleryHtml.includes('assets/play/storytime-picker-preview.jpg'));
    assert.ok(galleryHtml.includes('assets/play/storytime-picker-logo.jpg'));
    assert.ok(galleryHtml.includes('assets/play/book-hunt-preview.jpg'));
    assert.ok(galleryHtml.includes('assets/play/book-hunt-logo.jpg'));
    assert.equal(
      galleryHtml.includes('data-play-app-sheet='),
      false,
      'Bottom sheet must remain closed until a Play card is tapped'
    );
    assert.equal(
      galleryHtml.includes('data-storytime-picker-card="true"'),
      false,
      'Full Storytime Picker form must not crowd the default preview screen'
    );

    // 2) Tapping Storytime Picker card -> slides up Storytime Picker bottom sheet
    const pickerSheetHtml = renderPlayView({
      state,
      playUiState: {
        ...defaultUi,
        activeAppId: 'storytime-picker',
      },
    });
    assert.ok(pickerSheetHtml.includes('data-play-app-sheet="storytime-picker"'));
    assert.ok(pickerSheetHtml.includes('data-backdrop-action="close-play-app-sheet"'));
    assert.ok(pickerSheetHtml.includes('data-action="close-play-app-sheet"'));
    assert.ok(pickerSheetHtml.includes('data-storytime-picker-card="true"'));
    assert.ok(pickerSheetHtml.includes('data-action="spin-storytime-randomizer"'));

    // 3) Tapping Book Hunt card -> slides up Book Hunt bottom sheet
    const huntSheetHtml = renderPlayView({
      state,
      playUiState: {
        ...defaultUi,
        activeAppId: 'book-hunt',
      },
    });
    assert.ok(huntSheetHtml.includes('data-play-app-sheet="book-hunt"'));
    assert.ok(huntSheetHtml.includes('data-book-hunt-card="true"'));
    assert.ok(huntSheetHtml.includes('data-action="start-book-hunt"'));

    // 4) Closing the sheet preserves session progress on the preview gallery without reopening the sheet
    const closedAfterHuntHtml = renderPlayView({
      state,
      playUiState: {
        ...defaultUi,
        activeAppId: null,
        sheetClosedExplicitly: true,
        huntBookId: state.books[0].id,
        huntFoundCount: 2,
      },
    });
    assert.equal(closedAfterHuntHtml.includes('data-play-app-sheet='), false);
    assert.match(closedAfterHuntHtml, /Books hunted today:[\s\S]*?2/);

    // 5) Custom logo/image overrides (including vector-only fallback '') render cleanly
    const customConfiguredHtml = renderPlayView({
      state,
      playUiState: defaultUi,
      playAppsOverrides: {
        'storytime-picker': {
          logoUrl: 'assets/play/my-custom-logo.webp',
          imageUrl: 'assets/play/my-custom-preview.webp',
        },
        'book-hunt': {
          logoUrl: '',
          imageUrl: '',
        },
      },
    });
    assert.ok(customConfiguredHtml.includes('assets/play/my-custom-logo.webp'));
    assert.ok(customConfiguredHtml.includes('assets/play/my-custom-preview.webp'));
    assert.equal(customConfiguredHtml.includes('data-play-logo-img="book-hunt"'), false);
    assert.equal(customConfiguredHtml.includes('data-play-preview-image="book-hunt"'), false);
  });
});
