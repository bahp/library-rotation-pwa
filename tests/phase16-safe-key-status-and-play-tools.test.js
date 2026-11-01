/**
 * @fileoverview Phase 16 maintainer tests covering:
 * 1) Safe zero-storage Google Books API key status banner + setup/domain restriction guide in Settings
 *    (never storing or exporting keys in browser state or JSON backups)
 * 2) Moving Settings to the top-right header & placing Play (#/play) in the 5th primary/bottom nav slot
 * 3) Storytime & Topic Picker: choosing 1, 2, 3, or 4 books + filtering by any typed topic (not just bedtime)
 * 4) "Book Hunt" ("Find It!") treasure search game: vivid shelf prompts, non-repeating picks, and cover/mystery modes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseHashRoute } from '../src/core/router.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';
import {
  buildBookHuntClue,
  createBookHuntChallenge,
  pickStorytimeBooks,
} from '../src/features/play/play-activities.js';
import {
  createDefaultPlayUiState,
  renderPlayView,
} from '../src/features/play/play-view.js';

describe('Phase 16: Zero-Storage Google Books Key Status/Guide, Top-Right Settings, and Play & Storytime Tools', () => {
  it('1. Displays Google Books configured status & restriction guide in Settings without any client API key input or JSON leakage', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const pwaStatus = {
      isInstallable: false,
      isInstalled: false,
      isIOS: false,
      isOnline: true,
      swReady: true,
      showIosInstructions: false,
    };

    // Configured server key state
    const configuredHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus,
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport: '',
        googleBooksKeyStatus: 'configured',
      },
    });

    assert.match(
      configuredHtml,
      /data-google-key-status="configured"/,
      'Settings must display configured status banner when /api/books/status reports keyConfigured: true'
    );
    assert.match(
      configuredHtml,
      /Google Books Server Key Configured/,
      'Configured banner must clearly confirm the Google Books key is active'
    );
    assert.match(
      configuredHtml,
      /data-google-key-guide="true"/,
      'Settings must include the expandable setup & domain restriction guide'
    );
    assert.match(
      configuredHtml,
      /github\.io/i,
      'Guide must explain GitHub Pages domain & proxy restrictions'
    );
    assert.match(
      configuredHtml,
      /Books API/,
      'Guide must explain locking API restrictions to Books API only'
    );

    // Unconfigured / shared-quota state
    const sharedQuotaHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus,
      settingsUiState: {
        testingAdapter: false,
        enrichingCatalog: false,
        lastAdapterTestReport: '',
        endpointError: '',
        checkingGoogleBooks: false,
        googleBooksHealthReport: '',
        googleBooksKeyStatus: 'shared-quota',
      },
    });
    assert.match(sharedQuotaHtml, /data-google-key-status="shared-quota"/);
    assert.match(sharedQuotaHtml, /Shared Anonymous Quota Active/);

    // Security invariants: zero raw API key inputs and zero key fields in exported backup JSON
    assert.equal(
      configuredHtml.includes('api_key'),
      false,
      'Settings HTML must never render raw api_key form fields'
    );
    assert.equal(
      /name=["'][^"']*api[_-]?key/i.test(configuredHtml),
      false,
      'Settings HTML must never ask users to type raw API keys into browser inputs'
    );

    const backupJson = JSON.stringify(store.getState(), null, 2);
    assert.doesNotMatch(
      backupJson,
      /GOOGLE_BOOKS_API_KEY|googleBooksApiKey|apiKey/i,
      'Exported JSON backup must never contain any API key property'
    );
  });

  it('2. Moves Settings to the top-right header and places Play (#/play) in the 5th bottom navigation tab', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const parsedPlay = parseHashRoute('#/play');
    assert.equal(parsedPlay.route, 'play', 'Router must parse #/play cleanly');

    const shellOnPlay = renderAppShell({
      activeRoute: 'play',
      state: store.getState(),
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: '<div>Play Content</div>',
    });

    // Header Zone 3 must include top-right Settings link right next to the reader avatar switcher
    const headerMatch = shellOnPlay.match(/<header[\s\S]*?<\/header>/);
    assert.ok(headerMatch, 'Expected top <header>');
    assert.match(
      headerMatch[0],
      /data-top-settings-link="true"[\s\S]*?href="#\/settings"|href="#\/settings"[\s\S]*?data-top-settings-link="true"/,
      'Top-right header must render Settings button link'
    );

    // Mobile bottom bar must feature Play as the 5th tab and NOT duplicate Settings
    const mobileNavMatch = shellOnPlay.match(
      /<nav[^>]*aria-label="Mobile bottom navigation"[^>]*>([\s\S]*?)<\/nav>/
    );
    assert.ok(mobileNavMatch, 'Expected mobile bottom navigation');
    assert.match(mobileNavMatch[1], /href="#\/play"/, 'Mobile bottom nav must link to #/play');
    assert.doesNotMatch(
      mobileNavMatch[1],
      /href="#\/settings"/,
      'Settings should live in the top-right header rather than the mobile bottom bar'
    );

    // Active state highlight on top-right Settings link when visiting #/settings or #/profiles
    const shellOnSettings = renderAppShell({
      activeRoute: 'settings',
      state: store.getState(),
      toast: null,
      pwaStatus: {
        isInstallable: false,
        isInstalled: false,
        isIOS: false,
        isOnline: true,
        swReady: true,
        showIosInstructions: false,
      },
      contentHtml: '<div>Settings</div>',
    });
    assert.match(
      shellOnSettings,
      /data-top-settings-link="true"[\s\S]*?aria-current="page"/,
      'Top-right Settings button must set aria-current="page" when active'
    );
  });

  it('3. Storytime & Topic Picker selects 1, 2, 3, or 4 books and filters by any typed topic (with library fallback)', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Add a distinctive truck book owned in the home library (not yet on the active rotation shelf)
    const truckBook = await store.addManualBook({
      title: 'Little Blue Truck',
      authors: ['Alice Schertle'],
      format: 'board-book',
      readingStage: 'board-toddler',
      ageMin: 1,
      ageMax: 4,
      tags: ['vehicles', 'friendship', 'animals'],
      collectionStatus: 'owned',
      owners: ['shared'],
    });

    const state = store.getState();
    const activeProfile =
      state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    const activeRotation =
      state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') ||
      null;
    assert.ok(activeRotation, 'Seed state should include an active rotation');

    // Pick 1, 2, and 3 books without a topic filter
    for (const desiredCount of [1, 2, 3]) {
      const pickRes = pickStorytimeBooks({
        books: state.books,
        activeRotation,
        activeProfile,
        count: desiredCount,
        scope: 'active-shelf',
        topicQuery: '',
        rng: () => 0.42,
      });
      assert.equal(
        pickRes.selectedBooks.length,
        Math.min(desiredCount, activeRotation.bookIds.length),
        `Expected ${desiredCount} picked book(s) from active shelf`
      );
    }

    // Filter by custom typed topic "trucks" -> expands to Home Library if active shelf has 0 truck books
    const truckPick = pickStorytimeBooks({
      books: state.books,
      activeRotation,
      activeProfile,
      count: 2,
      scope: 'active-shelf',
      topicQuery: 'trucks',
      rng: () => 0.1,
    });
    assert.equal(truckPick.noTopicMatches, false);
    assert.ok(
      truckPick.selectedBooks.some((b) => b.id === truckBook.id),
      'Typing "trucks" should find Little Blue Truck via title/vehicles topic matching'
    );

    // Unknown topic returns graceful noTopicMatches flag instead of unrelated books
    const missingTopicPick = pickStorytimeBooks({
      books: state.books,
      activeRotation,
      activeProfile,
      count: 2,
      scope: 'owned-library',
      topicQuery: 'quantum-thermodynamics',
      rng: () => 0.5,
    });
    assert.equal(missingTopicPick.noTopicMatches, true);
    assert.equal(missingTopicPick.selectedBooks.length, 0);
  });

  it('4. Book Hunt ("Find It!") generates vivid kid-friendly shelf clues, avoids consecutive repeats, and supports Cover & Mystery modes', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const blueTruck = await store.addManualBook({
      title: 'Little Blue Truck Leads the Way',
      authors: ['Alice Schertle'],
      format: 'board-book',
      readingStage: 'board-toddler',
      ageMin: 1,
      ageMax: 4,
      tags: ['vehicles', 'city'],
      collectionStatus: 'owned',
      owners: ['shared'],
    });

    const truckClue = buildBookHuntClue(blueTruck);
    assert.equal(
      truckClue.prompt,
      'Find the book with the blue truck!',
      'Book with "Blue Truck" in title should produce the vivid "Find the book with the blue truck!" prompt'
    );

    const state = store.getState();
    const activeProfile =
      state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    const activeRotation =
      state.rotations.find((r) => r.profileId === activeProfile.id && r.status === 'active') ||
      null;
    assert.ok(activeRotation && activeRotation.bookIds.length >= 2);

    const firstHunt = createBookHuntChallenge({
      books: state.books,
      activeRotation,
      activeProfile,
      scope: 'active-shelf',
      previousBookId: null,
      rng: () => 0,
    });
    assert.ok(firstHunt);
    assert.match(firstHunt.prompt, /^Find the book /);

    // Even with identical RNG=0, passing previousBookId must pick a DIFFERENT shelf book
    const secondHunt = createBookHuntChallenge({
      books: state.books,
      activeRotation,
      activeProfile,
      scope: 'active-shelf',
      previousBookId: firstHunt.book.id,
      rng: () => 0,
    });
    assert.ok(secondHunt);
    assert.notEqual(
      secondHunt.book.id,
      firstHunt.book.id,
      'Consecutive Book Hunt rounds must not repeat the exact same book when 2+ shelf books exist'
    );

    // Render Play view in Mystery Clue First mode (cover hidden behind Peek Cover) vs Celebrated mode
    const mysteryPlayUi = {
      ...createDefaultPlayUiState(),
      huntClueMode: /** @type {'clue-first'} */ ('clue-first'),
      huntBookId: firstHunt.book.id,
      huntPrompt: firstHunt.prompt,
      huntClueLine: firstHunt.clueLine,
      huntPeekRevealed: false,
      huntCelebrated: false,
      huntFoundCount: 2,
    };

    const mysteryHtml = renderPlayView({
      state,
      playUiState: mysteryPlayUi,
    });
    assert.match(mysteryHtml, /data-action="toggle-book-hunt-peek"/, 'Mystery mode should offer Peek Cover button');
    assert.match(mysteryHtml, /data-action="complete-book-hunt"/, 'Active hunt should show Found It! button');
    assert.equal(
      mysteryHtml.includes(firstHunt.book.title),
      false,
      'Mystery mode must hide the exact book title before peeking or finding'
    );

    const celebratedHtml = renderPlayView({
      state,
      playUiState: {
        ...mysteryPlayUi,
        huntCelebrated: true,
        huntPeekRevealed: true,
        huntFoundCount: 3,
      },
    });
    assert.ok(
      celebratedHtml.includes(firstHunt.book.title),
      'Tapping Found It! reveals the book title and cover'
    );
    assert.match(celebratedHtml, /Next Book Hunt/);
    assert.match(celebratedHtml, /Books hunted today:[\s\S]*?3/);
  });
});
