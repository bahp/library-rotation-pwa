/**
 * @fileoverview Phase 4 unit & integration tests covering:
 * - Deterministic seeded PRNG repeatability (`createSeededRng` & `generateRotationSelection`)
 * - Free-text rotation objective parsing (e.g. "hardcover + Christmas themes", "board books + bedtime")
 * - Cooldown recency filtering and graceful fallback when catalog is small
 * - Author/topic variety enforcement across shelf slots
 * - Post-generation edit operations (pure engine helpers + full `store` state actions):
 *   1) Replace selected book with a random eligible one (`replaceRotationBookRandom`)
 *   2) Replace selected book manually (`replaceRotationBookManual` + duplicate guard)
 *   3) Add one/multiple books manually & randomly (`addBooksToRotationManual`, `addBooksToRotationRandom`)
 *   4) Profile-isolated active/saved rotation shelves
 */

import test from 'node:test';
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
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createSeedState } from '../src/data/seed.js';

test('createSeededRng and generateRotationSelection produce 100% repeatable results for identical seeds regardless of input book order', () => {
  const rngA = createSeededRng('holiday-2026');
  const rngB = createSeededRng('holiday-2026');
  const seqA = [rngA(), rngA(), rngA(), rngA()];
  const seqB = [rngB(), rngB(), rngB(), rngB()];
  assert.deepEqual(seqA, seqB);

  const seededState = createSeedState();
  const maya = seededState.profiles[0];
  const nowIso = '2026-11-25T12:00:00.000Z';

  /** @type {import('../src/types/models.js').RotationRuleConfig} */
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

  // Reverse the input catalog array to prove order-independence with deterministic seed
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

test('parseRotationObjective extracts binding formats, reading stages, and normalized theme keywords', () => {
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

test('cooldown window prioritizes fresh books first and only relaxes cooldown when needed to fill target count', () => {
  const seeded = createSeedState();
  const maya = seeded.profiles[0];
  // Seed timestamp is 2026-10-30T12:00:00.000Z; all books except `book_very_hungry` have lastRotatedAt = 2026-10-30
  const twoDaysLater = '2026-11-01T12:00:00.000Z';

  assert.equal(isBookInCooldown(seeded.books[0], 14, twoDaysLater), true);
  const hungry = seeded.books.find((b) => b.id === 'book_very_hungry');
  assert.ok(hungry);
  assert.equal(isBookInCooldown(hungry, 14, twoDaysLater), false);

  // Requesting 1 book with 14-day cooldown must pick the fresh book (`book_very_hungry`) with 0 relaxed cooldown picks
  const singleFresh = generateRotationSelection({
    books: seeded.books,
    profile: maya,
    rules: {
      count: 1,
      objective: 'animals',
      preferredTags: ['animals'],
      cooldownDays: 14,
      seed: 'fresh-check',
    },
    nowIso: twoDaysLater,
  });

  assert.deepEqual(singleFresh.selectedBookIds, ['book_very_hungry']);
  assert.equal(singleFresh.relaxedCooldownCount, 0);

  // Requesting 3 books when only 1 is outside cooldown picks the 1 fresh book first, then relaxes cooldown for 2 more
  const threeMixed = generateRotationSelection({
    books: seeded.books,
    profile: maya,
    rules: {
      count: 3,
      objective: 'animals',
      preferredTags: ['animals'],
      cooldownDays: 14,
      seed: 'fresh-check',
    },
    nowIso: twoDaysLater,
  });

  assert.equal(threeMixed.selectedBookIds[0], 'book_very_hungry');
  assert.equal(threeMixed.relaxedCooldownCount, 2);
});

test('varietyMix penalizes duplicate authors when diverse authors are available', () => {
  const seeded = createSeedState();
  const maya = seeded.profiles[0];

  /** @type {import('../src/types/models.js').Book[]} */
  const customCatalog = [
    {
      ...seeded.books[0],
      id: 'b_author_1',
      title: 'Woodland Foxes One',
      authors: ['Same Author'],
      tags: ['nature'],
      lastRotatedAt: undefined,
    },
    {
      ...seeded.books[0],
      id: 'b_author_2',
      title: 'Woodland Foxes Two',
      authors: ['Same Author'],
      tags: ['nature'],
      lastRotatedAt: undefined,
    },
    {
      ...seeded.books[2],
      id: 'b_other_author',
      title: 'Forest Berries',
      authors: ['Distinct Author'],
      tags: ['nature'],
      lastRotatedAt: undefined,
    },
  ];

  const diversePick = generateRotationSelection({
    books: customCatalog,
    profile: maya,
    rules: {
      count: 2,
      objective: 'nature',
      preferredTags: ['nature'],
      cooldownDays: 0,
      varietyMix: true,
      seed: 'author-diversity',
    },
  });

  const pickedAuthors = diversePick.selectedBooks.map((b) => b.authors[0]);
  assert.equal(new Set(pickedAuthors).size, 2);
});

test('pure replacement and addition helpers preserve order, prune completed IDs, and block shelf duplicates', () => {
  const seeded = createSeedState();
  const baseRot = seeded.rotations[0]; // ['book_owl_moon', 'book_snowy_day', 'book_blueberry_sal', 'book_goodnight_moon'], completed: ['book_goodnight_moon']

  // Replace completed slot 'book_goodnight_moon' at index 3 with 'book_very_hungry'
  const replaced = applyBookReplacement(
    baseRot,
    'book_goodnight_moon',
    'book_very_hungry',
    '2026-11-02T00:00:00.000Z'
  );
  assert.equal(replaced.bookIds[3], 'book_very_hungry');
  assert.equal(replaced.completedBookIds.includes('book_goodnight_moon'), false);

  // Attempting to replace slot 0 with a book already in slot 1 throws a clear error
  assert.throws(() => {
    applyBookReplacement(replaced, 'book_owl_moon', 'book_snowy_day');
  }, /already in this rotation/i);

  // Multi-book addition ignores duplicates and appends only new IDs in order
  const added = applyBookAdditions(replaced, [
    'book_snowy_day', // already present -> skipped
    'book_ada_twist',
    'book_shark_lady',
  ]);
  assert.deepEqual(added.addedIds, ['book_ada_twist', 'book_shark_lady']);
  assert.equal(added.rotation.bookIds.length, 6);

  // pickRandomEligibleBooks never returns a book already on the shelf
  const randomExtra = pickRandomEligibleBooks({
    books: seeded.books,
    profile: seeded.profiles[0],
    rotation: baseRot,
    count: 2,
    seedOverride: 'swap-seed-1',
  });
  assert.equal(randomExtra.length, 2);
  for (const b of randomExtra) {
    assert.equal(baseRot.bookIds.includes(b.id), false);
  }
});

test('store executes full Phase 4 lifecycle: generateRotation + random swap + manual replace + manual/random additions across isolated child profiles', async () => {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();

  // Generate a deterministic 3-book shelf for Maya (active profile)
  const generated = await store.generateRotation({
    title: 'Maya Holiday Hardcovers',
    objective: 'hardcover + winter',
    count: 3,
    cooldownDays: 0,
    seed: 'maya-dec-01',
  });

  assert.equal(generated.profileId, 'profile_maya');
  assert.equal(generated.bookIds.length, 3);
  assert.equal(generated.status, 'active');

  // Leo's active shelf remains completely untouched
  const leoActive = store
    .getState()
    .rotations.find((r) => r.profileId === 'profile_leo' && r.status === 'active');
  assert.ok(leoActive);
  assert.equal(leoActive.id, 'rot_leo_discovery');

  // 1. Replace first book on Maya's new shelf with a random eligible book
  const firstSlotBefore = generated.bookIds[0];
  const swappedBook = await store.replaceRotationBookRandom(generated.id, firstSlotBefore, {
    seedOverride: 'swap-01',
  });
  const afterRandomSwap = store.getState().rotations.find((r) => r.id === generated.id);
  assert.ok(afterRandomSwap);
  assert.equal(afterRandomSwap.bookIds[0], swappedBook.id);
  assert.notEqual(afterRandomSwap.bookIds[0], firstSlotBefore);
  assert.equal(new Set(afterRandomSwap.bookIds).size, 3);

  // 2. Replace second book manually with a known off-shelf book (`firstSlotBefore` is now off-shelf!)
  const secondSlotBefore = afterRandomSwap.bookIds[1];
  await store.replaceRotationBookManual(generated.id, secondSlotBefore, firstSlotBefore);
  const afterManualSwap = store.getState().rotations.find((r) => r.id === generated.id);
  assert.ok(afterManualSwap);
  assert.equal(afterManualSwap.bookIds[1], firstSlotBefore);

  // 3a. Add 2 books manually
  const offShelfBooks = store
    .getState()
    .books.filter((b) => !afterManualSwap.bookIds.includes(b.id));
  assert.ok(offShelfBooks.length >= 3);

  const manualToAdd = [offShelfBooks[0].id, offShelfBooks[1].id];
  const addedIds = await store.addBooksToRotationManual(generated.id, manualToAdd);
  assert.deepEqual(addedIds, manualToAdd);

  // 3b. Add 1 random eligible book
  const randomAdded = await store.addBooksToRotationRandom(generated.id, 1, {
    seedOverride: 'rand-add-01',
  });
  assert.equal(randomAdded.length, 1);

  const finalShelf = store.getState().rotations.find((r) => r.id === generated.id);
  assert.ok(finalShelf);
  assert.equal(finalShelf.bookIds.length, 6);
  assert.equal(new Set(finalShelf.bookIds).size, 6);
});
