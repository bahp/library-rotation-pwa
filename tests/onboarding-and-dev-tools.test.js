import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearQaUserSnapshot,
  createEmptyOnboardingState,
  createSafeDefaultSettings,
  createStorageAdapter,
  deleteBookAudioBlob,
  getBookAudioBlob,
  hasQaUserSnapshot,
  isValidAppState,
  migrateState,
  saveBookAudioBlob,
} from '../src/core/storage.js';
import {
  DARK_THEME_PRESET_IDS,
  DEFAULT_DARK_THEME_PRESET,
  DEFAULT_LIGHT_THEME_PRESET,
  LIGHT_THEME_PRESET_IDS,
  ONBOARDING_INTRO_SLIDES,
  ONBOARDING_LANDING_DEFAULT_MODE,
  THEME_PRESETS,
  THEME_PRESET_IDS,
  detectDeviceLanguage,
  normalizeBookCardCustomWidth,
  normalizeBookCardFields,
  normalizeBookCardInfoPlacement,
  normalizeBookCardSectionOverrides,
  normalizeBookCardShadow,
  normalizeBookCardSize,
  normalizeBottomNavStyle,
  normalizeThemePresetId,
  resolveBookCardDisplayConfig,
  resolveEffectiveThemeConfig,
} from '../src/config/index.js';
import { createDefaultAppSettings } from '../src/config/defaults.js';
import {
  computeAgeFromBirthDate,
  formatReadingStage,
  inferReadingStageFromAge,
} from '../src/types/models.js';
import { createAppStore } from '../src/core/store.js';
import { createSeedState } from '../src/data/seed.js';

describe('Onboarding, Household Settings & Dev/QA Store Flows', () => {
  it('starts fresh in onboarding when seedOnEmpty is false while preserving seeded default for tests', async () => {
    const cleanStorage = createStorageAdapter({ forceMemory: true, seedOnEmpty: false });
    const cleanStore = createAppStore(cleanStorage);
    await cleanStore.init();

    const cleanState = cleanStore.getState();
    assert.equal(isValidAppState(cleanState), true);
    assert.equal(cleanState.profiles.length, 0);
    assert.equal(cleanState.books.length, 0);
    assert.equal(cleanState.activeProfileId, '');
    assert.equal(cleanState.settings.onboarding?.status, 'pending');
    assert.equal(cleanState.settings.onboarding?.currentStep, 0);

    // Confirm legacy tests calling createStorageAdapter({ forceMemory: true }) still get seed state
    const defaultStorage = createStorageAdapter({ forceMemory: true });
    const seededState = await defaultStorage.load();
    assert.equal(seededState.profiles.length, 2);
    assert.ok(seededState.books.length >= 8);
    assert.equal(seededState.settings.onboarding?.status, 'completed');
  });

  it('migrates legacy non-empty user snapshots as onboarding completed without triggering onboarding', () => {
    const legacy = createSeedState();
    delete legacy.settings.onboarding;
    delete legacy.settings.householdName;

    const migrated = migrateState(legacy);
    assert.equal(migrated.settings.onboarding?.status, 'completed');
    assert.equal(migrated.settings.householdName, '');

    // Zero-profile without onboarding flags should fail validation; with pending/skipped passes
    assert.equal(
      isValidAppState({
        schemaVersion: 2,
        activeProfileId: '',
        profiles: [],
        books: [],
        rotations: [],
        settings: {},
      }),
      false
    );
    assert.equal(isValidAppState(createEmptyOnboardingState()), true);
  });

  it('persists householdName across updates, provider reset, and JSON backup import', async () => {
    const storage = createStorageAdapter({ forceMemory: true, seedOnEmpty: false });
    const store = createAppStore(storage);
    await store.init();

    await store.setHouseholdName('The Alvarez Family');
    const reader = await store.addProfile({
      name: 'Sofia',
      age: 4,
      favoriteTopics: ['animals', 'space'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'teal',
    });

    assert.equal(store.getState().settings.householdName, 'The Alvarez Family');

    await store.resetProviderSettingsToSafeDefaults();
    assert.equal(store.getState().settings.householdName, 'The Alvarez Family');

    const exported = JSON.stringify(store.getState());
    await store.clearAllTestData();
    assert.equal(store.getState().profiles.length, 0);

    await store.importBackupJson(exported);
    assert.equal(store.getState().settings.householdName, 'The Alvarez Family');
    assert.equal(store.getState().profiles[0].id, reader.id);
  });

  it('additively imports predefined sample collection without overwriting household profile', async () => {
    const storage = createStorageAdapter({ forceMemory: true, seedOnEmpty: false });
    const store = createAppStore(storage);
    await store.init();

    await store.setHouseholdName('Casa Rossi');
    const child = await store.addProfile({
      name: 'Marco',
      age: 5,
      favoriteTopics: ['ocean', 'nature'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'amber',
    });

    const expectedSeedCount = createSeedState().books.length;
    assert.ok(expectedSeedCount >= 20);
    assert.ok(
      createSeedState().books.every(
        (b) =>
          typeof b.coverUrl === 'string' &&
          b.coverUrl.startsWith('https://') &&
          typeof b.dominantColor === 'string' &&
          /^#[0-9A-F]{6}$/i.test(b.dominantColor)
      )
    );

    const firstImport = await store.importSampleCollectionAdditive({
      assignToProfileId: child.id,
    });
    assert.equal(firstImport.addedBooks.length, expectedSeedCount);
    assert.equal(firstImport.skippedDuplicatesCount, 0);
    assert.equal(store.getState().profiles.length, 1);
    assert.equal(store.getState().profiles[0].name, 'Marco');
    assert.equal(store.getState().settings.householdName, 'Casa Rossi');
    assert.ok(store.getState().books.every((b) => b.owners?.includes(child.id)));

    // Second import deduplicates cleanly
    const secondImport = await store.importSampleCollectionAdditive({
      assignToProfileId: child.id,
    });
    assert.equal(secondImport.addedBooks.length, 0);
    assert.equal(secondImport.skippedDuplicatesCount, expectedSeedCount);

    // Generating first rotation works smoothly from imported sample books
    const firstRot = await store.generateRotation({
      title: 'Marco First Shelf',
      count: 4,
      profileId: child.id,
    });
    assert.equal(firstRot.bookIds.length, 4);
    assert.equal(firstRot.status, 'active');
  });

  it('supports previewOnboarding, clean-slate QA switch, snapshot restore, and reset flags', async () => {
    clearQaUserSnapshot();
    const storage = createStorageAdapter({ forceMemory: true, seedOnEmpty: false });
    const store = createAppStore(storage);
    await store.init();

    await store.setHouseholdName('Miller Household');
    await store.addProfile({
      name: 'Hannah',
      age: 3,
      favoriteTopics: ['animals'],
      defaultRotationSize: 3,
      cooldownDays: 14,
      avatarTone: 'rose',
    });
    await store.importSampleCollectionAdditive();
    await store.completeOnboarding();
    assert.equal(store.getState().settings.onboarding?.status, 'completed');

    // Preview mode preserves library and exits cleanly back to user library
    await store.previewOnboarding();
    assert.equal(store.getState().settings.onboarding?.previewMode, true);
    assert.equal(store.getState().settings.onboarding?.currentStep, 0);

    const expectedSeedCount = createSeedState().books.length;
    await store.exitPreviewOnboarding();
    assert.equal(store.getState().settings.onboarding?.previewMode, undefined);
    assert.equal(store.getState().settings.onboarding?.status, 'completed');
    assert.equal(store.getState().profiles[0].name, 'Hannah');
    assert.equal(store.getState().books.length, expectedSeedCount);

    // Switch to New User clean slate -> archives Existing User snapshot
    await store.switchToNewUserCleanSlate();
    assert.equal(hasQaUserSnapshot(), true);
    assert.equal(store.getState().profiles.length, 0);
    assert.equal(store.getState().books.length, 0);
    assert.equal(store.getState().settings.onboarding?.status, 'pending');

    // Restore Existing User snapshot -> restores Hannah + starter books + householdName
    await store.restoreExistingUserSnapshot();
    assert.equal(store.getState().profiles.length, 1);
    assert.equal(store.getState().profiles[0].name, 'Hannah');
    assert.equal(store.getState().settings.householdName, 'Miller Household');
    assert.equal(store.getState().books.length, expectedSeedCount);

    // Reset flag keeps data while reopening onboarding
    await store.resetOnboardingCompletionFlag();
    assert.equal(store.getState().settings.onboarding?.status, 'pending');
    assert.equal(store.getState().profiles.length, 1);

    // Clear all test data removes snapshot and returns clean slate
    await store.clearAllTestData();
    assert.equal(hasQaUserSnapshot(), false);
    assert.equal(store.getState().profiles.length, 0);
    assert.equal(store.getState().books.length, 0);
  });

  it('persists showMiniWizards, devModeUnlocked, and supports custom/override presets cleanly', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Verify sensible defaults
    assert.equal(store.getState().settings.showMiniWizards, true);
    assert.equal(store.getState().settings.devModeUnlocked, false);

    await store.updateSettings({
      showMiniWizards: false,
      devModeUnlocked: true,
    });
    assert.equal(store.getState().settings.showMiniWizards, false);
    assert.equal(store.getState().settings.devModeUnlocked, true);

    // Verify custom preset lifecycle + built-in override & reset
    const customPreset = await store.addRotationPreset({
      title: 'Rainy Day Cozy',
      description: 'Warm indoor read-alouds',
      category: 'evergreen',
      preferredTags: ['bedtime', 'animals'],
      count: 4,
      swapDays: 7,
      cooldownDays: 14,
      varietyMix: true,
    });
    assert.equal(customPreset.isCustom, true);
    const customPresetsList = store.getState().customPresets || [];
    assert.ok(customPresetsList.some((p) => p.id === customPreset.id));

    await store.updateRotationPreset(customPreset.id, { title: 'Rainy Afternoon Read' });
    assert.equal(
      (store.getState().customPresets || []).find((p) => p.id === customPreset.id)?.title,
      'Rainy Afternoon Read'
    );

    await store.deleteRotationPreset(customPreset.id);
    assert.equal(
      (store.getState().customPresets || []).some((p) => p.id === customPreset.id),
      false
    );
  });

  it('contains zero window.confirm, window.alert, or window.open calls in React components', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    /**
     * @param {string} dir
     * @returns {string[]}
     */
    const collectFiles = (dir) => {
      const entries = readdirSync(dir);
      /** @type {string[]} */
      const files = [];
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          files.push(...collectFiles(full));
        } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
          files.push(full);
        }
      }
      return files;
    };

    const componentFiles = collectFiles(join(process.cwd(), 'src', 'components'));
    assert.ok(componentFiles.length >= 25);

    for (const file of componentFiles) {
      const content = readFileSync(file, 'utf8');
      assert.equal(
        /\bwindow\.(alert|confirm|open)\s*\(/.test(content),
        false,
        `Forbidden browser dialog call found in ${file}`
      );
    }
  });

  it('defaults theme to light and supports extended ages (0-120) and teen/adult reading stages', async () => {
    assert.equal(createDefaultAppSettings().theme, 'light');
    assert.equal(createSafeDefaultSettings().theme, 'light');
    assert.equal(createEmptyOnboardingState().settings.theme, 'light');
    assert.equal(createSeedState().settings.theme, 'light');

    assert.equal(inferReadingStageFromAge(10), 'middle-grade');
    assert.equal(inferReadingStageFromAge(15), 'teen-ya');
    assert.equal(inferReadingStageFromAge(42), 'adult');
    assert.equal(formatReadingStage('middle-grade'), 'Middle Grade');
    assert.equal(formatReadingStage('teen-ya'), 'Teen / YA');
    assert.equal(formatReadingStage('adult'), 'Adult Reader');

    const adultBirthYear = new Date().getUTCFullYear() - 35;
    const computedAdultAge = computeAgeFromBirthDate(`${adultBirthYear}-01-15`);
    assert.ok(computedAdultAge !== null && computedAdultAge >= 34 && computedAdultAge <= 35);

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const adultProfile = await store.addProfile({
      name: 'Parent Alex',
      age: 38,
      readingStage: 'adult',
      favoriteTopics: ['fiction', 'history'],
      defaultRotationSize: 5,
      cooldownDays: 14,
      avatarTone: 'teal',
    });
    assert.equal(adultProfile.age, 38);
    assert.equal(adultProfile.readingStage, 'adult');

    const updatedAdult = await store.updateProfile(adultProfile.id, { age: 95 });
    assert.equal(updatedAdult?.age, 95);

    const sampleBook = store.getState().books[0];
    const updatedBook = await store.updateBook(sampleBook.id, {
      readingStage: 'teen-ya',
      ageMin: 13,
      ageMax: 99,
    });
    assert.equal(updatedBook?.readingStage, 'teen-ya');
    assert.equal(updatedBook?.ageMin, 13);
    assert.equal(updatedBook?.ageMax, 99);
  });

  it('persists preferredBookTypes and allows deleting the last reader profile during onboarding', async () => {
    const storage = createStorageAdapter({ forceMemory: true, seedOnEmpty: false });
    const store = createAppStore(storage);
    await store.init();

    const reader = await store.addProfile({
      name: 'Leo',
      age: 4,
      readingStage: 'picture-book',
      favoriteTopics: ['animals', 'space'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'teal',
    });
    assert.equal(store.getState().profiles.length, 1);

    // Deleting the sole reader is permitted while onboarding is pending or in_progress
    await store.deleteProfile(reader.id);
    assert.equal(store.getState().profiles.length, 0);

    await store.updateSettings({
      preferredBookTypes: ['picture-books', 'illustrated-non-fiction', 'bilingual'],
    });
    assert.deepEqual(store.getState().settings.preferredBookTypes, [
      'picture-books',
      'illustrated-non-fiction',
      'bilingual',
    ]);

    // Once onboarding is completed, the final profile cannot be deleted
    const finalReader = await store.addProfile({
      name: 'Maya',
      age: 6,
      readingStage: 'early-reader',
      favoriteTopics: ['nature'],
      defaultRotationSize: 5,
      cooldownDays: 14,
      avatarTone: 'amber',
    });
    await store.completeOnboarding();
    const deletedAfterComplete = await store.deleteProfile(finalReader.id);
    assert.equal(deletedAfterComplete, false);
    assert.equal(store.getState().profiles.length, 1);
  });

  it('resolves theme presets, normalizes view/detail settings, clamps 0..6 onboarding steps, and persists book notes/verification', async () => {
    // 1. Theme resolution & normalization across all 19 presets (10 light + 9 dark)
    assert.equal(DEFAULT_LIGHT_THEME_PRESET, 'bunko');
    assert.equal(DEFAULT_DARK_THEME_PRESET, 'forest-brass');
    assert.equal(THEME_PRESET_IDS.length, 19);
    assert.equal(LIGHT_THEME_PRESET_IDS.length, 10);
    assert.equal(DARK_THEME_PRESET_IDS.length, 9);
    assert.equal(THEME_PRESETS['bunko']?.mode, 'light');
    assert.equal(THEME_PRESETS['shiori']?.mode, 'light');
    assert.equal(THEME_PRESETS['mimir']?.mode, 'dark');
    assert.equal(THEME_PRESETS['darker-teal']?.emblemHex, '#1E322C');
    assert.equal(THEME_PRESETS['hylle-editorial']?.mode, 'dark');

    assert.equal(normalizeThemePresetId('bunko'), 'bunko');
    assert.equal(normalizeThemePresetId('shiori'), 'shiori');
    assert.equal(normalizeThemePresetId('mimir'), 'mimir');
    assert.equal(normalizeThemePresetId('classic-teal'), 'classic-teal');
    assert.equal(normalizeThemePresetId('darker-teal'), 'darker-teal');
    assert.equal(normalizeThemePresetId('hylle-editorial'), 'hylle-editorial');
    assert.equal(normalizeThemePresetId('MIDNIGHT-LIBRARY'), 'midnight-library');
    assert.equal(normalizeThemePresetId('forest-brass'), 'forest-brass');
    assert.equal(normalizeThemePresetId('invalid-preset'), undefined);

    for (const presetId of THEME_PRESET_IDS) {
      const cfg = THEME_PRESETS[presetId];
      assert.equal(resolveEffectiveThemeConfig(cfg.mode, cfg.id, false).id, cfg.id);
    }

    assert.equal(
      resolveEffectiveThemeConfig('system', 'classic-teal', true).id,
      DEFAULT_DARK_THEME_PRESET
    );
    assert.equal(
      resolveEffectiveThemeConfig('system', 'midnight-ink', true).id,
      'midnight-ink'
    );
    assert.equal(
      resolveEffectiveThemeConfig('system', 'forest-brass', false).id,
      DEFAULT_LIGHT_THEME_PRESET
    );

    // 2. Onboarding slides config & AppSettings normalization
    assert.equal(ONBOARDING_LANDING_DEFAULT_MODE, 'slideshow');
    assert.equal(ONBOARDING_INTRO_SLIDES.length, 4);
    assert.equal(ONBOARDING_INTRO_SLIDES[0].id, 'instant-scan');
    assert.equal(ONBOARDING_INTRO_SLIDES[1].id, 'smart-rotations');

    const safeDefaults = createSafeDefaultSettings({
      themePreset: 'midnight-library',
      bookDetailStyle: 'editorial',
      bookViewMode: 'list',
      bookCardSize: 'large',
      bookCardInfoPlacement: 'overlay',
      showBookCoverOverlays: false,
      bookCardFields: ['title', 'year', 'pages'],
      bookCardSectionOverrides: {
        library: { infoPlacement: 'cover-only', size: 'compact' },
      },
      sidebarArtworkMode: 'illustration',
      sidebarArtworkId: 'library-cat',
      onboardingLandingMode: 'compact',
      nativeAppStyle: false,
      presetCornerArtSize: 'lg',
      notificationsEnabled: true,
    });
    assert.equal(safeDefaults.theme, 'light');
    assert.equal(safeDefaults.themePreset, 'midnight-library');
    assert.equal(safeDefaults.bookDetailStyle, 'editorial');
    assert.equal(safeDefaults.bookViewMode, 'list');
    assert.equal(safeDefaults.bookCardSize, 'large');
    assert.equal(safeDefaults.bookCardInfoPlacement, 'overlay');
    assert.equal(safeDefaults.showBookCoverOverlays, false);
    assert.deepEqual(safeDefaults.bookCardFields, ['title', 'year', 'pages']);
    assert.deepEqual(safeDefaults.bookCardSectionOverrides, {
      library: { infoPlacement: 'cover-only', size: 'compact' },
    });
    assert.equal(safeDefaults.sidebarArtworkMode, 'illustration');
    assert.equal(safeDefaults.sidebarArtworkId, 'library-cat');
    assert.equal(safeDefaults.onboardingLandingMode, 'compact');
    assert.equal(safeDefaults.nativeAppStyle, false);
    assert.equal(safeDefaults.translucentTopBar, false);
    assert.equal(safeDefaults.translucentBottomBar, false);
    assert.equal(safeDefaults.bottomNavStyle, 'floating');
    assert.equal(safeDefaults.bookCardShadow, 'subtle');
    assert.equal(safeDefaults.presetCornerArtSize, 'lg');
    assert.equal(safeDefaults.notificationsEnabled, true);
    assert.equal(
      createSafeDefaultSettings({
        presetCornerArtSize: /** @type {any} */ ('giant'),
        bottomNavStyle: /** @type {any} */ ('pill-invalid'),
        bookCardShadow: /** @type {any} */ ('ultra'),
      }).presetCornerArtSize,
      'sm'
    );
    const explicitChromeDefaults = createSafeDefaultSettings({
      nativeAppStyle: false,
      translucentTopBar: true,
      translucentBottomBar: false,
      bottomNavStyle: 'full',
      bookCardShadow: 'elevated',
    });
    assert.equal(explicitChromeDefaults.translucentTopBar, true);
    assert.equal(explicitChromeDefaults.translucentBottomBar, false);
    assert.equal(explicitChromeDefaults.bottomNavStyle, 'full');
    assert.equal(explicitChromeDefaults.bookCardShadow, 'elevated');
    assert.equal(normalizeBottomNavStyle('full'), 'full');
    assert.equal(normalizeBottomNavStyle('floating'), 'floating');
    assert.equal(normalizeBottomNavStyle('invalid'), 'floating');
    assert.equal(normalizeBookCardShadow('none'), 'none');
    assert.equal(normalizeBookCardShadow('elevated'), 'elevated');
    assert.equal(normalizeBookCardShadow('invalid'), 'subtle');

    const globalFallback = createSafeDefaultSettings();
    assert.equal(globalFallback.themePreset, 'bunko');
    assert.equal(globalFallback.bookDetailStyle, 'editorial');
    assert.equal(globalFallback.bookViewMode, 'grid');
    assert.equal(globalFallback.bookCardSize, 'compact');
    assert.equal(globalFallback.bookCardInfoPlacement, 'below');
    assert.equal(globalFallback.showBookCoverOverlays, true);
    assert.deepEqual(globalFallback.bookCardFields, ['title', 'author', 'ageFormat', 'usage']);
    assert.equal(globalFallback.coverAspectRatio, 'square');
    assert.equal(globalFallback.presetCornerArtSize, 'sm');
    assert.equal(globalFallback.sidebarArtworkId, 'books-reading-lamp');
    assert.equal(globalFallback.nativeAppStyle, true);
    assert.equal(globalFallback.translucentTopBar, true);
    assert.equal(globalFallback.translucentBottomBar, true);
    assert.equal(globalFallback.bottomNavStyle, 'floating');
    assert.equal(globalFallback.bookCardShadow, 'subtle');
    assert.equal(globalFallback.bookCardCustomWidth, 136);

    // BookCoverCard display config & section override resolution
    assert.equal(normalizeBookCardSize('custom'), 'custom');
    assert.equal(normalizeBookCardSize('bogus-size'), 'compact');
    assert.equal(normalizeBookCardCustomWidth(40), 88);
    assert.equal(normalizeBookCardCustomWidth(999), 260);
    assert.equal(normalizeBookCardCustomWidth(154.6), 155);
    assert.equal(normalizeBookCardCustomWidth(undefined), 136);
    assert.equal(normalizeBookCardInfoPlacement('cover-only'), 'cover-only');
    assert.equal(normalizeBookCardInfoPlacement('invalid'), 'below');
    assert.deepEqual(normalizeBookCardFields(['title', 'bogus', 'year', 'title']), ['title', 'year']);
    assert.deepEqual(
      normalizeBookCardSectionOverrides({
        library: { infoPlacement: 'cover-only', showCoverOverlays: false },
        homeSuggested: { size: 'custom', customWidth: 192 },
        unknownSection: { size: 'large' },
      }),
      {
        library: { infoPlacement: 'cover-only', showCoverOverlays: false },
        homeSuggested: { size: 'custom', customWidth: 192 },
      }
    );
    const libResolved = resolveBookCardDisplayConfig(safeDefaults, 'library');
    assert.equal(libResolved.infoPlacement, 'cover-only');
    assert.equal(libResolved.size, 'compact');
    assert.equal(libResolved.customWidth, 136);
    assert.equal(libResolved.hasCustomOverride, true);
    const homeResolved = resolveBookCardDisplayConfig(safeDefaults, 'homeShelf');
    assert.equal(homeResolved.infoPlacement, 'overlay');
    assert.equal(homeResolved.size, 'large');
    assert.equal(homeResolved.customWidth, 136);
    assert.equal(homeResolved.hasCustomOverride, false);
    const customSettings = createSafeDefaultSettings({
      bookCardSize: 'custom',
      bookCardCustomWidth: 175,
      bookCardSectionOverrides: {
        homeSuggested: { size: 'custom', customWidth: 112 },
      },
    });
    assert.equal(resolveBookCardDisplayConfig(customSettings, 'homeShelf').size, 'custom');
    assert.equal(resolveBookCardDisplayConfig(customSettings, 'homeShelf').customWidth, 175);
    assert.equal(resolveBookCardDisplayConfig(customSettings, 'homeSuggested').customWidth, 112);

    // 3. 0..6 onboarding step bounds & Book notes/verification persistence
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    await store.updateOnboarding({
      status: 'in_progress',
      currentStep: 6,
      completedSteps: [0, 1, 2, 3, 4, 5, 99],
      skippedSteps: [-1, 6],
    });
    assert.equal(store.getState().settings.onboarding?.currentStep, 6);
    assert.deepEqual(store.getState().settings.onboarding?.completedSteps, [0, 1, 2, 3, 4, 5]);
    assert.deepEqual(store.getState().settings.onboarding?.skippedSteps, [6]);

    const firstBook = store.getState().books[0];
    const verifiedTs = '2026-11-17T10:00:00.000Z';
    const updated = await store.updateBook(firstBook.id, {
      notes: 'Favorite bedtime quote on page 12.',
      needsScanReview: false,
      verifiedAt: verifiedTs,
    });
    assert.equal(updated?.notes, 'Favorite bedtime quote on page 12.');
    assert.equal(updated?.needsScanReview, false);
    assert.equal(updated?.verifiedAt, verifiedTs);
  });

  it('supports pre-1990 adult birth dates and adding 3+ readers during onboarding', async () => {
    const pre1990Age = computeAgeFromBirthDate('1984-05-10');
    assert.ok(pre1990Age !== null && pre1990Age >= 40);

    const storage = createStorageAdapter({ forceMemory: true, seedOnEmpty: false });
    const store = createAppStore(storage);
    await store.init();

    const child1 = await store.addProfile({
      name: 'Maya',
      birthDate: '2021-03-14',
      favoriteTopics: ['animals', 'bedtime'],
      defaultRotationSize: 5,
      cooldownDays: 14,
      avatarTone: 'teal',
    });
    const child2 = await store.addProfile({
      name: 'Leo',
      birthDate: '2018-09-02',
      favoriteTopics: ['space', 'dinosaurs'],
      defaultRotationSize: 5,
      cooldownDays: 14,
      avatarTone: 'amber',
    });
    const parent3 = await store.addProfile({
      name: 'Elena',
      birthDate: '1984-05-10',
      readingStage: 'adult',
      favoriteTopics: ['history', 'cooking'],
      defaultRotationSize: 5,
      cooldownDays: 14,
      avatarTone: 'indigo',
    });

    assert.equal(store.getState().profiles.length, 3);
    assert.equal(child1.name, 'Maya');
    assert.equal(child2.name, 'Leo');
    assert.equal(parent3.birthDate, '1984-05-10');
    assert.ok(parent3.age >= 40);
  });

  it('detects device language with device-settings-first, region-second, and English fallback', () => {
    assert.equal(
      detectDeviceLanguage({ languages: ['es-AR', 'en-US'], language: 'en-US', timeZone: 'America/New_York' }),
      'es'
    );
    assert.equal(
      detectDeviceLanguage({ languages: ['it-CH'], language: 'de-CH', timeZone: 'Europe/Zurich' }),
      'it'
    );
    assert.equal(
      detectDeviceLanguage({ languages: ['fr-FR', 'es-ES'], language: 'fr-FR', timeZone: 'Europe/Paris' }),
      'es'
    );
    // Region subtag fallback when primary subtag is unsupported
    assert.equal(
      detectDeviceLanguage({ languages: ['ca-ES'], language: 'ca-ES', timeZone: 'UTC' }),
      'es'
    );
    // Timezone region fallback
    assert.equal(
      detectDeviceLanguage({ languages: ['de-DE'], language: 'de-DE', timeZone: 'America/Buenos_Aires' }),
      'es'
    );
    assert.equal(
      detectDeviceLanguage({ languages: ['de-DE'], language: 'de-DE', timeZone: 'Europe/Rome' }),
      'it'
    );
    // Default fallback
    assert.equal(
      detectDeviceLanguage({ languages: ['ja-JP'], language: 'ja-JP', timeZone: 'Asia/Tokyo' }),
      'en'
    );
  });

  it('persists editorial metadata, multi-entry bookNotes, and audio recordings with deleteBook blob cleanup', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const book = store.getState().books[0];
    const profiles = store.getState().profiles;
    const readerA = profiles[0].id;
    const readerB = profiles[1].id;

    // 1. Extended editorial fields
    const edited = await store.updateBook(book.id, {
      edition: 'First illustrated edition',
      estimatedValue: 18.5,
      estimatedCurrency: 'EUR',
      dimensions: { height: '24 cm', width: '19 cm', thickness: '1.2 cm' },
    });
    assert.equal(edited?.edition, 'First illustrated edition');
    assert.equal(edited?.estimatedValue, 18.5);
    assert.equal(edited?.estimatedCurrency, 'EUR');
    assert.deepEqual(edited?.dimensions, {
      height: '24 cm',
      width: '19 cm',
      thickness: '1.2 cm',
    });

    // 2. Multi-entry bookNotes CRUD & legacy notes sync
    const note1 = await store.addBookNote(book.id, {
      text: 'Loved the watercolor moon illustration.',
      authorProfileId: readerA,
      forProfileId: readerB,
    });
    assert.ok(note1);
    assert.equal(store.getState().books.find((b) => b.id === book.id)?.bookNotes?.length, 1);
    assert.equal(
      store.getState().books.find((b) => b.id === book.id)?.notes,
      'Loved the watercolor moon illustration.'
    );

    await store.updateBookNote(book.id, note1.id, {
      text: 'Updated bedtime memory on page 8.',
    });
    assert.equal(
      store.getState().books.find((b) => b.id === book.id)?.bookNotes?.[0]?.text,
      'Updated bedtime memory on page 8.'
    );

    await store.deleteBookNote(book.id, note1.id);
    assert.equal(store.getState().books.find((b) => b.id === book.id)?.bookNotes?.length ?? 0, 0);

    // 3. Audio recordings metadata + blob storage & cleanup on deleteBook
    const sampleBlob = new Blob(['mock-audio-bytes'], { type: 'audio/webm' });
    const rec = await store.addBookRecording(book.id, {
      title: 'Grandma Read-Aloud',
      durationSec: 42,
      mimeType: 'audio/webm',
      blob: sampleBlob,
      authorProfileId: readerA,
      forProfileId: 'shared',
    });
    assert.ok(rec);
    assert.equal(store.getState().books.find((b) => b.id === book.id)?.recordings?.length, 1);
    const storedBlob = await getBookAudioBlob(rec.id);
    assert.ok(storedBlob);

    await saveBookAudioBlob('extra_orphan_test', new Blob(['extra'], { type: 'audio/webm' }));
    assert.ok(await getBookAudioBlob('extra_orphan_test'));
    await deleteBookAudioBlob('extra_orphan_test');
    assert.equal(await getBookAudioBlob('extra_orphan_test'), null);

    // Deleting the book also cleans up its audio blobs
    await store.deleteBook(book.id);
    assert.equal(await getBookAudioBlob(rec.id), null);
  });
});




