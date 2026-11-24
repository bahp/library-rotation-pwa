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
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  applyBookAdditions,
  applyBookReplacement,
  createSeededRng,
  findMatchingNewBooksForRotation,
  generateRotationSelection,
  isBookInCooldown,
  parseRotationObjective,
  pickRandomEligibleBooks,
} from '../src/features/rotations/rotation-engine.js';
import { computeRotationSchedule } from '../src/features/rotations/rotation-schedule.js';
import { createStorageAdapter, migrateState } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createSeedState } from '../src/data/seed.js';
import { isBookPickedInRotation, isBookReadInRotation } from '../src/types/models.js';
import {
  findMatchingStartDatePresets,
  getAllRotationPresets,
  normalizeRotationPresetInput,
} from '../src/features/rotations/rotation-presets.js';
import { DEFAULT_ROTATION_PRESETS } from '../src/config/presets.js';
import {
  COLLECTION_ILLUSTRATIONS,
  SIDEBAR_ILLUSTRATIONS,
  PRESET_ILLUSTRATION_MAP,
  getIllustrationById,
  getSuggestedIllustrationForPreset,
  isLegacyOpaqueArtworkUrl,
} from '../src/config/illustrations.js';

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

    // Every selected book from seeded catalog must be outside the cooldown window
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
    const chosenFresh = seeded.books.find((b) => b.id === singleFresh.selectedBookIds[0]);
    assert.ok(chosenFresh);
    assert.equal(isBookInCooldown(chosenFresh, 14, twoDaysLater), false);

    // When book_very_hungry is the sole fresh book, it is selected first; requesting 2 relaxes cooldown
    const onlyHungryFresh = seeded.books.map((b) =>
      b.id === 'book_very_hungry' ? b : { ...b, lastRotatedAt: '2026-10-30T12:00:00.000Z' }
    );
    const forcedSingle = generateRotationSelection({
      books: onlyHungryFresh,
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
    assert.deepEqual(forcedSingle.selectedBookIds, ['book_very_hungry']);

    const relaxedTwo = generateRotationSelection({
      books: onlyHungryFresh,
      profile: maya,
      rules: {
        count: 2,
        cooldownDays: 14,
        varietyMix: false,
        objective: '',
        preferredTags: [],
      },
      nowIso: twoDaysLater,
    });
    assert.equal(relaxedTwo.selectedBookIds.length, 2);
    assert.ok(relaxedTwo.selectedBookIds.includes('book_very_hungry'));
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

  it('supports creating/editing rotations as saved vs active, pausing presets, and notification lifecycle', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const initialActive = store
      .getState()
      .rotations.find((r) => r.profileId === store.getState().activeProfileId && r.status === 'active');
    assert.ok(initialActive);

    // 1. Generate rotation directly in saved state without displacing current active shelf
    const savedShelf = await store.generateRotation({
      title: 'Saved Spring Draft',
      status: 'saved',
      count: 3,
      cooldownDays: 0,
    });
    assert.equal(savedShelf.status, 'saved');
    const stillActive = store.getState().rotations.find((r) => r.id === initialActive.id);
    assert.equal(stillActive?.status, 'active');

    // Promote saved shelf to active via updateRotationDetails
    await store.updateRotationDetails(savedShelf.id, { status: 'active' });
    assert.equal(
      store.getState().rotations.find((r) => r.id === savedShelf.id)?.status,
      'active'
    );
    assert.equal(
      store.getState().rotations.find((r) => r.id === initialActive.id)?.status,
      'saved'
    );

    // 2. Preset isActive toggle, illustration fields & schedule matching
    const customPreset = await store.addRotationPreset({
      title: 'December Reading Spark',
      description: 'Festive winter read-alouds',
      category: 'seasonal-holidays',
      preferredTags: ['winter'],
      suggestedStartMonthDay: '12-10',
      count: 4,
      swapDays: 14,
      cooldownDays: 14,
      varietyMix: true,
      isActive: true,
      illustrationUrl: 'data:image/png;base64,iVBORw0KGgo=',
      illustrationPrompt: 'Watercolor pine branch in top right corner',
    });
    assert.equal(customPreset.isActive, true);
    assert.equal(customPreset.illustrationUrl, 'data:image/png;base64,iVBORw0KGgo=');
    assert.equal(customPreset.illustrationPrompt, 'Watercolor pine branch in top right corner');

    const refDate = new Date(2026, 11, 8, 12, 0, 0); // Dec 8 -> 2 days before Dec 10
    let matches = findMatchingStartDatePresets(getAllRotationPresets(store.getState()), refDate, {
      daysBefore: 3,
      daysAfter: 5,
    });
    assert.ok(matches.some((m) => m.preset.id === customPreset.id));

    // Pause preset -> excluded from matching alerts
    await store.togglePresetActive(customPreset.id);
    matches = findMatchingStartDatePresets(getAllRotationPresets(store.getState()), refDate, {
      daysBefore: 3,
      daysAfter: 5,
    });
    assert.equal(matches.some((m) => m.preset.id === customPreset.id), false);

    // Resume preset -> included again & notification sync generates persistent reminder
    await store.togglePresetActive(customPreset.id);
    const synced = await store.syncNotifications(refDate);
    const presetNotif = synced.find((n) => n.presetId === customPreset.id);
    assert.ok(presetNotif);
    assert.equal(presetNotif.daysRemaining, 2);
    assert.ok(presetNotif.title.includes('Available in 2 days'));

    // Re-syncing does not duplicate the notification
    const resynced = await store.syncNotifications(refDate);
    assert.equal(
      resynced.filter((n) => n.presetId === customPreset.id).length,
      1
    );

    // Mark read, dismiss to history, and clear history
    await store.markNotificationRead(presetNotif.id);
    assert.ok(
      (store.getState().notifications || []).find((n) => n.id === presetNotif.id)?.readAt
    );

    await store.dismissNotificationAlert(presetNotif.id);
    assert.equal(
      (store.getState().notifications || []).find((n) => n.id === presetNotif.id)?.dismissed,
      true
    );

    await store.clearNotificationHistory();
    assert.equal((store.getState().notifications || []).length, 0);
  });

  it('maps every starter preset to a verified transparent 4:3 PNG and preserves legacy artwork', () => {
    assert.equal(DEFAULT_ROTATION_PRESETS.length, 42);
    assert.equal(COLLECTION_ILLUSTRATIONS.length, 42);

    const seenIllustrationIds = new Set();
    for (const preset of DEFAULT_ROTATION_PRESETS) {
      const mappedId = PRESET_ILLUSTRATION_MAP[preset.id];
      assert.ok(mappedId, `Missing PRESET_ILLUSTRATION_MAP entry for ${preset.id}`);
      assert.equal(
        seenIllustrationIds.has(mappedId),
        false,
        `Duplicate illustration ${mappedId} assigned across built-in presets`
      );
      seenIllustrationIds.add(mappedId);

      const meta = getIllustrationById(mappedId);
      assert.ok(meta, `Missing illustration metadata for ${mappedId}`);
      assert.equal(isLegacyOpaqueArtworkUrl(meta.path), false);

      const filePath = path.resolve(process.cwd(), 'public', meta.path);
      assert.ok(fs.existsSync(filePath), `Missing PNG file on disk: ${filePath}`);

      const buf = fs.readFileSync(filePath);
      assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      const colorType = buf.readUInt8(25);
      assert.equal(width, 640, `${meta.filename} width should be 640`);
      assert.equal(height, 480, `${meta.filename} height should be 480`);
      assert.equal(colorType, 6, `${meta.filename} must be RGBA (colorType 6)`);

      // Decompress IDAT chunks and verify top-left pixel (0, 0) has alpha === 0 (transparent)
      let offset = 8;
      const idatChunks = [];
      while (offset < buf.length) {
        const len = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
        if (type === 'IDAT') {
          idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
        }
        offset += 12 + len;
      }
      const raw = zlib.inflateSync(Buffer.concat(idatChunks));
      // Filter type 0 (None) or Sub (1) on row 0: pixel (0,0) RGBA starts at raw[1..4]; alpha is raw[4] when filter 0/1
      assert.equal(raw[4], 0, `${meta.filename} top-left pixel must be transparent`);
    }

    // Legacy opaque watercolor assets remain untouched
    const legacyDir = path.resolve(process.cwd(), 'src/assets/images');
    const legacyFiles = fs.readdirSync(legacyDir).filter((f) => f.startsWith('preset_corner_'));
    assert.equal(legacyFiles.length, 6);
    for (const f of legacyFiles) {
      assert.equal(isLegacyOpaqueArtworkUrl(`src/assets/images/${f}`), true);
    }
  });

  it('supports decoupled illustrationId reuse, topic suggestions, portable paths, and built-in resets', async () => {
    const oceanSuggestion = getSuggestedIllustrationForPreset({
      title: 'Sea Creatures & Coral Reefs',
      preferredTags: ['octopus', 'ocean', 'marine life'],
      category: 'evergreen',
    });
    assert.equal(oceanSuggestion.id, 'underwater-ocean');

    const normalizedPortable = normalizeRotationPresetInput({
      title: 'Our Favourite Animal Stories',
      description: 'Woodland foxes and cozy animal tales',
      illustrationId: 'animals-habitats',
      illustrationUrl: 'assets/illustrations/presets/animals-habitats.png',
    });
    assert.equal(normalizedPortable.illustrationId, 'animals-habitats');
    assert.equal(
      normalizedPortable.illustrationUrl,
      'assets/illustrations/presets/animals-habitats.png'
    );

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Custom collection reusing an existing illustrationId cleanly
    const created = await store.addRotationPreset({
      title: 'Our Favourite Animal Stories',
      description: 'Fox, owl, and hedgehog read-alouds',
      category: 'evergreen',
      preferredTags: ['animals', 'fox'],
      illustrationId: 'animals-habitats',
    });
    assert.equal(created.illustrationId, 'animals-habitats');

    // Reassigning illustrationId decouples cleanly
    await store.updateRotationPreset(created.id, { illustrationId: 'calm-bedtime' });
    const updatedCustom = getAllRotationPresets(store.getState()).find((p) => p.id === created.id);
    assert.equal(updatedCustom?.illustrationId, 'calm-bedtime');

    // Built-in preset override and reset restores default state
    await store.updateRotationPreset('preset-winter-cozy', {
      illustrationId: 'hanukkah-lights',
    });
    const overridden = getAllRotationPresets(store.getState()).find(
      (p) => p.id === 'preset-winter-cozy'
    );
    assert.equal(overridden?.illustrationId, 'hanukkah-lights');
    assert.equal(overridden?.isBuiltInOverride, true);

    await store.resetBuiltInPreset('preset-winter-cozy');
    const restored = getAllRotationPresets(store.getState()).find(
      (p) => p.id === 'preset-winter-cozy'
    );
    assert.equal(restored?.illustrationId, undefined);
    assert.equal(restored?.isBuiltInOverride, false);
  });

  it('includes 15 verified 640x480 transparent PNG sidebar/library illustrations across 4 categories', () => {
    assert.equal(SIDEBAR_ILLUSTRATIONS.length, 15);
    const categories = new Set(SIDEBAR_ILLUSTRATIONS.map((item) => item.category));
    assert.deepEqual(
      Array.from(categories).sort(),
      ['childrens-library', 'literary-lifestyle', 'reading-corners', 'whimsical']
    );

    for (const meta of SIDEBAR_ILLUSTRATIONS) {
      assert.equal(getIllustrationById(meta.id)?.id, meta.id);
      assert.equal(isLegacyOpaqueArtworkUrl(meta.path), false);

      const filePath = path.resolve(process.cwd(), 'public', meta.path);
      assert.ok(fs.existsSync(filePath), `Missing sidebar PNG on disk: ${filePath}`);

      const buf = fs.readFileSync(filePath);
      assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      const colorType = buf.readUInt8(25);
      assert.equal(width, 640, `${meta.filename} width should be 640`);
      assert.equal(height, 480, `${meta.filename} height should be 480`);
      assert.equal(colorType, 6, `${meta.filename} must be RGBA (colorType 6)`);

      let offset = 8;
      const idatChunks = [];
      while (offset < buf.length) {
        const len = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
        if (type === 'IDAT') {
          idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
        }
        offset += 12 + len;
      }
      const raw = zlib.inflateSync(Buffer.concat(idatChunks));
      assert.equal(raw[4], 0, `${meta.filename} top-left pixel must be transparent`);
    }
  });

  it('tracks lastActiveAt on deactivated rotations and refreshes shelves when new matching books are added', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // 1. Saved rotation created directly without activation shows "Created ..."
    const draftSaved = await store.generateRotation({
      title: 'Winter Animals Shelf',
      preferredTags: ['winter', 'snow'],
      count: 2,
      status: 'saved',
      cooldownDays: 0,
    });
    assert.equal(draftSaved.lastActiveAt, undefined);
    const draftSched = computeRotationSchedule(
      draftSaved,
      store.getState().profiles[0],
      '2026-11-24T12:00:00.000Z'
    );
    assert.equal(draftSched.lastActiveDateLabel, null);
    assert.ok(draftSched.savedScheduleLine.startsWith('Created '));

    // 2. Activating then deactivating preserves lastActiveAt and surfaces "Last active ..."
    await store.toggleRotationActive(draftSaved.id);
    const activeRot = store.getState().rotations.find((r) => r.id === draftSaved.id);
    assert.equal(activeRot?.status, 'active');
    assert.ok(activeRot?.lastActiveAt);

    await store.toggleRotationActive(draftSaved.id);
    const deactivated = store.getState().rotations.find((r) => r.id === draftSaved.id);
    if (!deactivated) throw new Error('Expected deactivated rotation');
    assert.equal(deactivated.status, 'saved');
    assert.ok(deactivated.lastActiveAt);
    const deactivatedSched = computeRotationSchedule(
      deactivated,
      store.getState().profiles[0],
      deactivated.lastActiveAt
    );
    assert.ok(deactivatedSched.lastActiveDateLabel);
    assert.ok(deactivatedSched.savedScheduleLine.startsWith('Last active '));

    // 3. Adding a new matching library book surfaces it in findMatchingNewBooksForRotation
    const newWinterBook = await store.addManualBook({
      title: 'Snowy Owl Express',
      authors: ['Clara Frost'],
      format: 'hardcover',
      ageMin: 3,
      ageMax: 7,
      readingStage: 'picture-book',
      tags: ['winter', 'snow', 'owl'],
    });
    assert.ok(newWinterBook.id);

    const refreshedRotation = store.getState().rotations.find((r) => r.id === draftSaved.id);
    if (!refreshedRotation) throw new Error('Expected refreshed rotation');
    const matchInfo = findMatchingNewBooksForRotation({
      books: store.getState().books,
      profile: store.getState().profiles[0],
      rotation: refreshedRotation,
      rotations: store.getState().rotations,
    });
    assert.ok(matchInfo.matchingBooks.some((entry) => entry.book.id === newWinterBook.id));

    // 4. Adding matches appends new matching book without disturbing existing shelf books
    const prevFirstId = refreshedRotation.bookIds[0];
    await store.toggleRotationBookRead(draftSaved.id, prevFirstId);
    const addRes = await store.refreshRotationFromRules(draftSaved.id, {
      mode: 'add-matches',
      bookIds: [newWinterBook.id],
    });
    assert.deepEqual(addRes.addedIds, [newWinterBook.id]);
    const afterAdd = store.getState().rotations.find((r) => r.id === draftSaved.id);
    assert.ok(afterAdd?.bookIds.includes(newWinterBook.id));
    assert.ok(afterAdd?.completedBookIds.includes(prevFirstId));

    // 5. Redraw-unread keeps already-read books while refreshing unread slots to rules.count
    const redrawRes = await store.refreshRotationFromRules(draftSaved.id, {
      mode: 'redraw-unread',
      rulesPatch: { count: 3, preferredTags: ['winter', 'snow'] },
    });
    assert.ok(redrawRes.rotation.bookIds.includes(prevFirstId));
    assert.equal(redrawRes.rotation.bookIds.length, 3);
  });
});

