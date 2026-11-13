/**
 * @fileoverview Consolidated Rotation Engine & Shelf Management Suite:
 * - Deterministic seeded PRNG repeatability and order-independence.
 * - Free-text rotation objective parsing (formats, stages, themes).
 * - Cooldown recency prioritization and graceful relaxation.
 * - Author diversity and variety constraints.
 * - In-place shelf operations: Random swap, manual replacement, and random/manual additions.
 * - Rotation history tracking, read sync, and stale book spotlight.
 * - Rotation eligibility flag (excludeFromRotations) and toggleBookRotationEligibility.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBookAdditions,
  applyBookReplacement,
  createSeededRng,
  generateRotationSelection,
  isBookInCooldown,
  parseRotationObjective,
  pickRandomEligibleBooks,
} from '../src/features/rotations/rotation-engine.js';
import { createStorageAdapter, migrateState } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createSeedState } from '../src/data/seed.js';
import { isBookPickedInRotation, isBookReadInRotation } from '../src/types/models.js';

describe('Rotation Engine & Shelf Management Suite', () => {
  it('seeded PRNG produces 100% repeatable selections regardless of catalog order', () => {
    const rngA = createSeededRng('holiday-2026');
    const rngB = createSeededRng('holiday-2026');
    assert.deepEqual(
      [rngA(), rngA(), rngA(), rngA()],
      [rngB(), rngB(), rngB(), rngB()]
    );

    const seededState = createSeedState();
    const maya = seededState.profiles[0];
    const nowIso = '2026-11-25T12:00:00.000Z';

    const rules = {
      count: 4,
      objective: 'hardcover + nature & winter themes',
      preferredTags: ['nature', 'winter'],
      cooldownDays: 14,
      varietyMix: true,
      seed: 'winter-seed-42',
    };

    const run1 = generateRotationSelection({
      books: seededState.books,
      profile: maya,
      rules,
      nowIso,
    });

    const reversedCatalog = [...seededState.books].reverse();
    const run2 = generateRotationSelection({
      books: reversedCatalog,
      profile: maya,
      rules,
      nowIso,
    });

    assert.equal(run1.selectedBookIds.length, 4);
    assert.deepEqual(run1.selectedBookIds, run2.selectedBookIds);
  });

  it('parseRotationObjective extracts binding formats, reading stages, and normalized keywords', () => {
    const parsed = parseRotationObjective('Hardcover + Christmas & woodland animals themes');
    assert.deepEqual(parsed.formats, ['hardcover']);
    assert.ok(parsed.keywords.includes('christmas'));
    assert.ok(parsed.keywords.includes('woodland'));
    assert.ok(parsed.keywords.includes('animal'));

    const toddlerObj = parseRotationObjective('Board books for toddler bedtime');
    assert.deepEqual(toddlerObj.formats, ['board-book']);
    assert.deepEqual(toddlerObj.stages, ['board-toddler']);
    assert.ok(toddlerObj.keywords.includes('bedtime'));
  });

  it('cooldown window prioritizes fresh books and relaxes when needed to fill shelf', () => {
    const seeded = createSeedState();
    const maya = seeded.profiles[0];
    const twoDaysLater = '2026-11-01T12:00:00.000Z';

    assert.equal(isBookInCooldown(seeded.books[0], 14, twoDaysLater), true);
    const hungry = seeded.books.find((b) => b.id === 'book_very_hungry');
    assert.ok(hungry);
    assert.equal(isBookInCooldown(hungry, 14, twoDaysLater), false);

    const singleFresh = generateRotationSelection({
      books: seeded.books,
      profile: maya,
      rules: {
        count: 1,
        cooldownDays: 14,
        varietyMix: false,
        objective: '',
        preferredTags: [],
      },
      nowIso: twoDaysLater,
    });

    assert.equal(singleFresh.selectedBookIds.length, 1);
    assert.equal(singleFresh.selectedBookIds[0], 'book_very_hungry');
  });

  it('replacement and addition helpers preserve shelf order and prevent duplicates', () => {
    const seeded = createSeedState();
    const baseRot = seeded.rotations[0];

    // Replace completed slot 'book_goodnight_moon' with 'book_very_hungry'
    const replaced = applyBookReplacement(
      baseRot,
      'book_goodnight_moon',
      'book_very_hungry',
      '2026-11-02T00:00:00.000Z'
    );
    assert.equal(replaced.bookIds[3], 'book_very_hungry');
    assert.equal(replaced.completedBookIds.includes('book_goodnight_moon'), false);

    // Multi-book addition ignores duplicates and appends new IDs in order
    const added = applyBookAdditions(replaced, [
      'book_snowy_day', // already present -> skipped
      'book_ada_twist',
      'book_shark_lady',
    ]);
    assert.deepEqual(added.addedIds, ['book_ada_twist', 'book_shark_lady']);
    assert.equal(added.rotation.bookIds.length, 6);
  });

  it('allows books to be excluded from rotations via excludeFromRotations flag', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const book = store.getState().books[0];

    assert.equal(book.excludeFromRotations, undefined);

    // Toggle exclusion on
    const excluded = await store.toggleBookRotationEligibility(book.id);
    assert.equal(excluded?.excludeFromRotations, true);

    // Generator must not pick excluded book
    const profile = store.getState().profiles[0];
    const selection = generateRotationSelection({
      books: store.getState().books,
      profile,
      rules: { count: 6, cooldownDays: 0, varietyMix: false, objective: '', preferredTags: [] },
    });
    assert.equal(selection.selectedBookIds.includes(book.id), false);

    // Toggle back to included
    const included = await store.toggleBookRotationEligibility(book.id);
    assert.equal(included?.excludeFromRotations, undefined);
  });

  it('store executes full rotation lifecycle: generation, random swap, and read tracking', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const maya = store.getState().profiles[0];

    const shelf = await store.generateRotation({
      title: 'Spring Reading Basket',
      count: 3,
      cooldownDays: 0,
    });
    assert.equal(shelf.bookIds.length, 3);

    // Random swap on first book
    const oldBookId = shelf.bookIds[0];
    const swappedBook = await store.replaceRotationBookRandom(shelf.id, oldBookId);
    assert.ok(swappedBook);
    assert.notEqual(swappedBook.id, oldBookId);

    // Read toggle marks book in profile reading history
    const targetBookId = shelf.bookIds[1];
    await store.toggleRotationBookRead(shelf.id, targetBookId);
    const updatedMaya = store.getState().profiles.find((p) => p.id === maya.id);
    assert.ok(updatedMaya?.readHistoryBookIds.includes(targetBookId));

    // Unmarking read removes it from reading history
    await store.toggleRotationBookRead(shelf.id, targetBookId);
    const clearedMaya = store.getState().profiles.find((p) => p.id === maya.id);
    assert.equal(clearedMaya?.readHistoryBookIds.includes(targetBookId), false);
  });

  it('tracks per-rotation picked/read status independently of prior reading history', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Seed state: Maya read book_snowy_day previously, but only book_goodnight_moon was picked in rot_maya_woodland
    const seedMaya = store.getState().profiles[0];
    const seedRot = store.getState().rotations.find((r) => r.id === 'rot_maya_woodland');
    assert.ok(seedRot);
    assert.ok(seedMaya.readHistoryBookIds.includes('book_snowy_day'));
    assert.equal(isBookPickedInRotation(seedRot, 'book_snowy_day'), false);
    assert.equal(isBookReadInRotation(seedRot, 'book_snowy_day'), false);
    assert.equal(isBookPickedInRotation(seedRot, 'book_goodnight_moon'), true);
    assert.equal(isBookReadInRotation(seedRot, 'book_goodnight_moon'), true);

    // 1) Unread book: picking marks picked & read; unpicking reverts both picked & auto-read
    const targetBookId = seedRot.bookIds[0]; // book_owl_moon (unread)
    await store.toggleRotationBookPicked(seedRot.id, targetBookId);
    let afterPickRot = store.getState().rotations.find((r) => r.id === seedRot.id);
    let afterPickMaya = store.getState().profiles[0];
    assert.equal(isBookPickedInRotation(afterPickRot, targetBookId), true);
    assert.equal(isBookReadInRotation(afterPickRot, targetBookId), true);
    assert.ok(afterPickMaya.readHistoryBookIds.includes(targetBookId));

    await store.toggleRotationBookPicked(seedRot.id, targetBookId);
    let afterUnpickRot = store.getState().rotations.find((r) => r.id === seedRot.id);
    let afterUnpickMaya = store.getState().profiles[0];
    assert.equal(isBookPickedInRotation(afterUnpickRot, targetBookId), false);
    assert.equal(isBookReadInRotation(afterUnpickRot, targetBookId), false);
    assert.equal(afterUnpickMaya.readHistoryBookIds.includes(targetBookId), false);

    // 2) Book read in a previous rotation (book_snowy_day): picking shows picked & read,
    //    and unpicking removes picked + active cycle ring while preserving prior readHistoryBookIds!
    await store.toggleRotationBookPicked(seedRot.id, 'book_snowy_day');
    afterPickRot = store.getState().rotations.find((r) => r.id === seedRot.id);
    assert.equal(isBookPickedInRotation(afterPickRot, 'book_snowy_day'), true);
    assert.equal(isBookReadInRotation(afterPickRot, 'book_snowy_day'), true);
    assert.ok(store.getState().profiles[0].readHistoryBookIds.includes('book_snowy_day'));

    await store.toggleRotationBookPicked(seedRot.id, 'book_snowy_day');
    afterUnpickRot = store.getState().rotations.find((r) => r.id === seedRot.id);
    afterUnpickMaya = store.getState().profiles[0];
    assert.equal(isBookPickedInRotation(afterUnpickRot, 'book_snowy_day'), false);
    assert.equal(isBookReadInRotation(afterUnpickRot, 'book_snowy_day'), false);
    assert.ok(afterUnpickMaya.readHistoryBookIds.includes('book_snowy_day'));

    // Clearing prior read manually via book page (toggleProfileBookRead) removes it from readHistoryBookIds
    await store.toggleProfileBookRead(seedMaya.id, 'book_snowy_day');
    assert.equal(store.getState().profiles[0].readHistoryBookIds.includes('book_snowy_day'), false);

    // 3) Explicitly marked read in current rotation stays read when unpicked
    await store.setRotationBookStatus(seedRot.id, targetBookId, { read: true });
    await store.toggleRotationBookPicked(seedRot.id, targetBookId);
    await store.toggleRotationBookPicked(seedRot.id, targetBookId);
    const explicitReadRot = store.getState().rotations.find((r) => r.id === seedRot.id);
    assert.equal(isBookPickedInRotation(explicitReadRot, targetBookId), false);
    assert.equal(isBookReadInRotation(explicitReadRot, targetBookId), true);

    // 4) Explicit per-rotation status allows marking picked without read when explicitly specified
    await store.setRotationBookStatus(seedRot.id, targetBookId, { picked: true, read: false });
    const pickedOnlyRot = store.getState().rotations.find((r) => r.id === seedRot.id);
    assert.equal(isBookPickedInRotation(pickedOnlyRot, targetBookId), true);
    assert.equal(isBookReadInRotation(pickedOnlyRot, targetBookId), false);

    // Migration preserves explicit empty pickedBookIds while defaulting legacy rotations cleanly
    const migratedExplicit = migrateState({
      ...store.getState(),
      rotations: [
        { ...seedRot, pickedBookIds: [] },
      ],
    });
    assert.deepEqual(migratedExplicit.rotations[0].pickedBookIds, []);

    const legacyRot = { ...seedRot };
    delete legacyRot.pickedBookIds;
    delete legacyRot.placedBookIds;
    const migratedLegacy = migrateState({
      ...store.getState(),
      rotations: [legacyRot],
    });
    assert.deepEqual(migratedLegacy.rotations[0].pickedBookIds, legacyRot.completedBookIds);
    assert.deepEqual(migratedLegacy.rotations[0].placedBookIds, []);
  });

  it('shelf placement checklist helper tracks placedBookIds without mutating read/picked state', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const rot = store.getState().rotations[0];
    const [firstId, secondId] = rot.bookIds;
    const initialCompleted = [...rot.completedBookIds];
    const initialPicked = [...(rot.pickedBookIds || [])];

    await store.toggleRotationBookPlaced(rot.id, firstId);
    let updated = store.getState().rotations.find((r) => r.id === rot.id);
    assert.deepEqual(updated?.placedBookIds, [firstId]);
    assert.deepEqual(updated?.completedBookIds, initialCompleted);
    assert.deepEqual(updated?.pickedBookIds, initialPicked);

    await store.setRotationBooksPlaced(rot.id, [firstId, secondId, 'non_existent_id']);
    updated = store.getState().rotations.find((r) => r.id === rot.id);
    assert.deepEqual(updated?.placedBookIds, [firstId, secondId]);

    // Replacing a book prunes it from pickedBookIds and placedBookIds
    const replaced = applyBookReplacement(
      updated,
      firstId,
      'book_very_hungry',
      '2026-11-05T00:00:00.000Z'
    );
    assert.equal(replaced.placedBookIds?.includes(firstId), false);
    assert.equal(replaced.pickedBookIds?.includes(firstId), false);
  });
});
