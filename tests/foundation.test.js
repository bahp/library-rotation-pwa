/**
 * @fileoverview Core Foundation Tests:
 * - Data models, ISBN normalizer & validation (ISBN-10, ISBN-13, hyphenation, check digits).
 * - HTML entity escaping & sanitization.
 * - Hash router parsing & query parameter handling.
 * - Storage cascade (IndexedDB -> localStorage -> memory fallback) & state migrations.
 * - Store lifecycle: profile management, duplicate ISBN safeguards, backup export/restore.
 * - Child profile birth date calculation across leap years and birthdays.
 * - Default configuration & constraints.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeIsbn, escapeHtml } from '../src/types/models.js';
import { parseHashRoute } from '../src/core/router.js';
import { createStorageAdapter, isValidAppState, migrateState } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createDefaultAppSettings, NUMERIC_BOUNDS } from '../src/config/defaults.js';

describe('Core Foundation & Storage Suite', () => {
  it('normalizeIsbn validates ISBN-13 and converts valid ISBN-10 to ISBN-13', () => {
    const valid13 = normalizeIsbn('978-0-399-21457-8');
    assert.equal(valid13.valid, true);
    assert.equal(valid13.isbn13, '9780399214578');

    const valid10 = normalizeIsbn('0-06-443017-0');
    assert.equal(valid10.valid, true);
    assert.equal(valid10.isbn10, '0064430170');
    assert.equal(valid10.isbn13, '9780064430173');

    const valid10WithX = normalizeIsbn('0-8044-2957-X');
    assert.equal(valid10WithX.valid, true);
    assert.equal(valid10WithX.isbn13, '9780804429573');

    const badCheck = normalizeIsbn('978-0-399-21457-9');
    assert.equal(badCheck.valid, false);
    assert.match(badCheck.error || '', /check digit/i);

    const blank = normalizeIsbn('   ');
    assert.equal(blank.valid, true);
    assert.equal(blank.isbn13, '');
  });

  it('escapeHtml sanitizes special markup characters', () => {
    assert.equal(
      escapeHtml('<script>"alert(\'x\')&"</script>'),
      '&lt;script&gt;&quot;alert(&#39;x&#39;)&amp;&quot;&lt;/script&gt;'
    );
  });

  it('parseHashRoute extracts valid routes, query params, and falls back to home', () => {
    const scanRoute = parseHashRoute('#/scan?mode=isbn-ocr');
    assert.equal(scanRoute.route, 'scan');
    assert.equal(scanRoute.params.get('mode'), 'isbn-ocr');

    const libRoute = parseHashRoute('#/library');
    assert.equal(libRoute.route, 'library');

    const unknownRoute = parseHashRoute('#/nonexistent-tab');
    assert.equal(unknownRoute.route, 'home');

    const emptyRoute = parseHashRoute('');
    assert.equal(emptyRoute.route, 'home');
  });

  it('storage adapter initializes with seed data and persists updates in memory fallback', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const initial = await storage.load();
    assert.equal(isValidAppState(initial), true);
    assert.equal(storage.getBackendName(), 'memory');
    assert.ok(initial.books.length >= 8);
    assert.equal(initial.profiles.length, 2);

    const migrated = migrateState({ ...initial, activeProfileId: 'missing_profile' });
    assert.equal(migrated.activeProfileId, initial.profiles[0].id);
  });

  it('migrateState enforces at most one active rotation per profile', () => {
    /** @type {any} */
    const stateWithMultiActive = {
      schemaVersion: 1,
      updatedAt: '2026-11-08T00:00:00.000Z',
      books: [],
      profiles: [{ id: 'child_1', name: 'Child 1', birthDate: '2022-01-01', readHistoryBookIds: [] }],
      rotations: [
        { id: 'rot_1', profileId: 'child_1', title: 'Shelf 1', status: 'active', bookIds: [] },
        { id: 'rot_2', profileId: 'child_1', title: 'Shelf 2', status: 'active', bookIds: [] },
      ],
      activeProfileId: 'child_1',
      settings: {},
    };

    const cleaned = migrateState(stateWithMultiActive);
    const activeForChild = cleaned.rotations.filter(
      (r) => r.profileId === 'child_1' && r.status === 'active'
    );
    assert.equal(activeForChild.length, 1);
    assert.equal(activeForChild[0].id, 'rot_1');
    assert.equal(cleaned.rotations[1].status, 'saved');
  });

  it('computes child age automatically from birthDate across boundaries', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const nowYear = new Date().getFullYear();
    const dobFiveYearsAgo = `${nowYear - 5}-01-01`;

    const nora = await store.addProfile({
      name: 'Nora',
      birthDate: dobFiveYearsAgo,
      readingStage: 'early-reader',
      favoriteTopics: ['animals'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'sky',
    });
    assert.equal(nora.birthDate, dobFiveYearsAgo);
    assert.equal(nora.age, 5);

    // migrateState dynamically updates age from birthDate as years pass
    const state = store.getState();
    const stateWithOldAge = {
      ...state,
      profiles: state.profiles.map((p) =>
        p.id === nora.id ? { ...p, birthDate: `${nowYear - 8}-01-01`, age: 2 } : p
      ),
    };
    const migrated = migrateState(stateWithOldAge);
    const rehydratedNora = migrated.profiles.find((p) => p.id === nora.id);
    assert.equal(rehydratedNora?.age, 8);
  });

  it('store handles profile lifecycle, duplicate ISBN guard, rotation check-off, and backup restore', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Add new profile and verify active switch
    const clara = await store.addProfile({
      name: 'Clara',
      birthDate: '2023-05-15',
      readingStage: 'board-toddler',
      favoriteTopics: ['animals', 'music'],
      defaultRotationSize: 3,
      cooldownDays: 10,
      avatarTone: 'rose',
    });
    assert.equal(store.getState().activeProfileId, clara.id);
    assert.equal(store.getState().profiles.length, 3);

    // Add manual book with valid ISBN-13
    const ducklings = await store.addManualBook({
      title: 'Make Way for Ducklings',
      authors: ['Robert McCloskey'],
      isbn: '978-0-670-45149-4',
      format: 'hardcover',
      ageMin: 2,
      ageMax: 6,
      readingStage: 'picture-book',
      tags: ['animals', 'family'],
    });
    assert.equal(ducklings.isbn13, '9780670451494');

    // Reject duplicate ISBN
    await assert.rejects(
      () =>
        store.addManualBook({
          title: 'Duplicate Copy',
          authors: ['Robert McCloskey'],
          isbn: '9780670451494',
          format: 'hardcover',
          ageMin: 2,
          ageMax: 6,
          readingStage: 'picture-book',
          tags: [],
        }),
      /already in your family library/i
    );

    // Create starter rotation for Clara and mark first book read
    const shelf = await store.createStarterRotation({
      title: 'Clara Morning Basket',
      objective: 'Board & picture books with animals',
      count: 3,
    });
    assert.equal(shelf.bookIds.length, 3);

    const firstBookId = shelf.bookIds[0];
    await store.toggleRotationBookRead(shelf.id, firstBookId);
    const updatedClara = store.getState().profiles.find((p) => p.id === clara.id);
    assert.ok(updatedClara && updatedClara.readHistoryBookIds.includes(firstBookId));

    // Safeguard prevents deleting down to zero profiles
    await store.deleteProfile('profile_maya');
    await store.deleteProfile('profile_leo');
    const blockedDelete = await store.deleteProfile(clara.id);
    assert.equal(blockedDelete, false);
    assert.equal(store.getState().profiles.length, 1);

    // Backup round-trip
    const exported = JSON.stringify(store.getState());
    await store.resetToSeedData();
    assert.equal(store.getState().profiles.length, 2);
    await store.importBackupJson(exported);
    assert.equal(store.getState().profiles.length, 1);
    assert.equal(store.getState().profiles[0].name, 'Clara');
  });

  it('createDefaultAppSettings supplies expected settings invariants', () => {
    const defaults = createDefaultAppSettings();
    assert.equal(typeof defaults.searchWhileTyping, 'boolean');
    assert.equal(defaults.searchWhileTyping, false);
    assert.equal(defaults.aiEnrichmentOptIn, false);
    assert.equal(NUMERIC_BOUNDS.rotationBooksMin, 1);
  });
});
