/**
 * @fileoverview Phase 7 Mobile-First Space Optimization, Warm Editorial Redesign,
 * Dedicated Library Route, Bottom-Sheet `+` Forms, Top Avatar Switcher, and DOB Auto-Age Tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as models from '../src/types/models.js';
import { parseHashRoute } from '../src/core/router.js';
import { createStorageAdapter, migrateState } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { renderAppShell } from '../src/ui/components/app-shell.js';
import { renderHomeView } from '../src/features/home/home-view.js';
import { renderRotationsView } from '../src/features/rotations/rotations-view.js';
import { renderProfilesView } from '../src/features/profiles/profiles-view.js';
import { renderSettingsView } from '../src/features/settings/settings-view.js';

describe('Phase 7 Redesign: Compact Mobile Layout, Library Page, Bottom Sheets & DOB Auto-Age', () => {
  it('1. Computes child age automatically from birthDate across birthday boundaries and refreshes on state migration', async () => {
    assert.equal(
      typeof models.computeAgeFromBirthDate,
      'function',
      'Expected computeAgeFromBirthDate helper in models.js'
    );

    // Birthday already passed in reference year (May 10 -> Oct 30 = 5)
    assert.equal(models.computeAgeFromBirthDate('2021-05-10', '2026-10-30'), 5);
    // Birthday not yet reached in reference year (Dec 15 -> Oct 30 = 4)
    assert.equal(models.computeAgeFromBirthDate('2021-12-15', '2026-10-30'), 4);
    // Exact birthday day (Oct 30 -> Oct 30 = 5)
    assert.equal(models.computeAgeFromBirthDate('2021-10-30', '2026-10-30'), 5);
    // Infant under 1 year old (Apr 1 -> Oct 30 = 0)
    assert.equal(models.computeAgeFromBirthDate('2026-04-01', '2026-10-30'), 0);
    // Invalid / blank returns null safely
    assert.equal(models.computeAgeFromBirthDate('not-a-date', '2026-10-30'), null);

    // Store addProfile computes age automatically from birthDate
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const nowYear = new Date().getUTCFullYear();
    const dobFiveYearsAgo = `${nowYear - 5}-01-01`;

    const nora = await store.addProfile({
      name: 'Nora',
      birthDate: dobFiveYearsAgo,
      readingStage: 'early-reader',
      favoriteTopics: ['space', 'nature'],
      defaultRotationSize: 5,
      cooldownDays: 14,
      avatarTone: 'teal',
    });

    assert.equal(nora.birthDate, dobFiveYearsAgo);
    assert.equal(nora.age, 5, 'Expected age to be computed automatically from birthDate');

    // Updating a profile birthDate recomputes age automatically
    assert.equal(typeof store.updateProfile, 'function', 'Expected store.updateProfile action');
    const dobSixYearsAgo = `${nowYear - 6}-01-01`;
    const updatedNora = await store.updateProfile(nora.id, {
      birthDate: dobSixYearsAgo,
    });
    assert.equal(updatedNora?.age, 6);

    // migrateState dynamically updates age from birthDate as years pass
    const snapshotWithStaleAge = {
      ...store.getState(),
      profiles: store.getState().profiles.map((p) =>
        p.id === nora.id ? { ...p, birthDate: `${nowYear - 8}-01-01`, age: 2 } : p
      ),
    };
    const migrated = migrateState(snapshotWithStaleAge);
    const rehydratedNora = migrated.profiles.find((p) => p.id === nora.id);
    assert.equal(rehydratedNora?.age, 8, 'Expected migrateState to recompute age from birthDate');
  });

  it('2. Separates Family Book Catalog onto dedicated #/library route and keeps Home compact', async () => {
    const libRoute = parseHashRoute('#/library?filter=hardcover');
    assert.equal(libRoute.route, 'library', 'Router must recognize #/library as independent route');
    assert.equal(libRoute.params.get('filter'), 'hardcover');

    const libraryModule = await import('../src/features/library/library-view.js');
    assert.equal(typeof libraryModule.renderLibraryView, 'function');

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const homeHtml = renderHomeView({
      state,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
      },
    });

    // Home shows compact Books in Rotation with read summary and minimal title/author cards
    assert.match(homeHtml, /Books in Rotation/i);
    assert.match(homeHtml, /1 of 4 read/i);
    // Home must NOT inline the full Family Book Catalog search bar or inline profile switcher tabs
    assert.equal(
      homeHtml.includes('id="catalog-search-input"'),
      false,
      'Catalog search bar should live on #/library, not Home'
    );
    assert.equal(
      homeHtml.includes('data-action="switch-profile"'),
      false,
      'Inline profile tab bar removed from Home in favor of top avatar switcher'
    );

    // Independent Library view renders the searchable & filterable catalog
    const libraryHtml = libraryModule.renderLibraryView({
      state,
      uiState: {
        catalogFilter: 'all',
        searchQuery: '',
        inspectedBookId: null,
      },
    });
    assert.equal(libraryHtml.includes('id="catalog-search-input"'), true);
    assert.equal(libraryHtml.includes('data-action="set-catalog-filter"'), true);
    assert.ok(libraryHtml.includes('Owl Moon'));
  });

  it('3. Replaces repeated profile bars with Top Avatar Switcher and exposes profile details in Settings', async () => {
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

    // Closed avatar switcher shows active reader trigger in top bar
    const closedShellHtml = renderAppShell({
      activeRoute: 'home',
      state,
      toast: null,
      pwaStatus,
      shellUiState: {
        isProfileSwitcherOpen: false,
        isProfileFormSheetOpen: false,
        editingProfileId: null,
      },
      contentHtml: '<div>Content</div>',
    });
    assert.ok(
      closedShellHtml.includes('data-action="open-profile-switcher"'),
      'Top header must render active reader avatar button'
    );
    assert.ok(closedShellHtml.includes('href="#/library"'), 'Navigation must link to #/library');
    assert.equal(closedShellHtml.includes('id="profile-switcher-sheet-title"'), false);

    // Clicking avatar opens profile switcher sheet with profile selection + create new profile (`+`) + manage link
    const openShellHtml = renderAppShell({
      activeRoute: 'home',
      state,
      toast: null,
      pwaStatus,
      shellUiState: {
        isProfileSwitcherOpen: true,
        isProfileFormSheetOpen: false,
        editingProfileId: null,
      },
      contentHtml: '<div>Content</div>',
    });
    assert.ok(openShellHtml.includes('id="profile-switcher-sheet-title"'));
    assert.ok(openShellHtml.includes('data-action="switch-profile"'));
    assert.ok(openShellHtml.includes('data-action="open-add-profile-sheet"'));
    assert.ok(openShellHtml.includes('href="#/profiles"'));

    // Settings view also surfaces Reader Profiles details & management
    const settingsHtml = renderSettingsView({
      state,
      storageBackend: 'memory',
      pwaStatus,
      adapterDiagnostics: store.getTaggingService().getAdapterDiagnostics(state.settings),
    });
    assert.match(settingsHtml, /Reader Profiles/i);
    assert.ok(settingsHtml.includes('Maya') && settingsHtml.includes('Leo'));
  });

  it('4. Hides Generate Shelf & Add Profile forms behind + buttons and slides them up as bottom sheets', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    // Rotations: inline form hidden by default, `+` trigger shown
    const rotationsClosedHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
      },
    });
    assert.equal(
      rotationsClosedHtml.includes('data-action="switch-profile"'),
      false,
      'Rotations should not duplicate profile tabs inline'
    );
    assert.equal(
      rotationsClosedHtml.includes('data-action="open-generate-rotation-sheet"'),
      true,
      'Rotations must expose a + button to open the generator sheet'
    );
    assert.equal(
      rotationsClosedHtml.includes('id="generate-rotation-form"'),
      false,
      'Generate Shelf form must stay closed until + is clicked'
    );

    // Rotations: clicking `+` opens bottom sheet with form using most (not all) of viewport height
    const rotationsOpenHtml = renderRotationsView({
      state,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: true,
      },
    });
    assert.equal(rotationsOpenHtml.includes('id="generate-rotation-form"'), true);
    assert.match(rotationsOpenHtml, /max-h-\[85vh\]/);
    assert.ok(rotationsOpenHtml.includes('rounded-t-3xl'));

    // Profiles: inline form hidden by default, `+` trigger shown
    const profilesClosedHtml = renderProfilesView({
      state,
      profilesUiState: { isFormOpen: false, editingProfileId: null },
    });
    assert.equal(profilesClosedHtml.includes('data-action="open-add-profile-sheet"'), true);
    assert.equal(
      profilesClosedHtml.includes('id="add-profile-form"'),
      false,
      'Add Profile form must stay closed until + is clicked'
    );

    // Profiles: clicking `+` opens bottom sheet form with Date of Birth input
    const profilesOpenHtml = renderProfilesView({
      state,
      profilesUiState: { isFormOpen: true, editingProfileId: null },
    });
    assert.equal(profilesOpenHtml.includes('id="add-profile-form"'), true);
    assert.equal(profilesOpenHtml.includes('name="birthDate"'), true);
    assert.match(profilesOpenHtml, /max-h-\[85vh\]/);
  });
});
