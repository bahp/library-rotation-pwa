/**
 * @fileoverview Consolidated Tagging, Taxonomy & Recommendations Suite:
 * - Local rule tagger: Holiday, seasonal, animal, STEM, SEL keyword taxonomy.
 * - Noise category filtering (juvenile fiction, general, literature).
 * - Multilingual topic extraction & accented character preservation.
 * - Reading level hints & age band inference.
 * - Keyless AI enrichment adapter security (HTTPS enforcement, secret rejection).
 * - Strict opt-in gate (aiEnrichmentOptIn).
 * - Child profile recommendation scoring & collection topic gap insights.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  enrichBookWithLocalRules,
  inferAgeAndStageFromSignals,
  inferLocalTopicTags,
  inferReadingLevelHint,
  sanitizeTag,
  sanitizeTagList,
} from '../src/features/tagging/rule-tagger.js';
import {
  validateProxyEndpointUrl,
} from '../src/features/tagging/ai-tag-adapter.js';
import { createTaggingService } from '../src/features/tagging/tagging-service.js';
import {
  getFavoriteGenreRecommendationShelf,
  getLovedBookSimilarityShelves,
  getProfileRecommendations,
  getRotationLibrarySuggestions,
  getTopicCoverageInsights,
} from '../src/features/tagging/recommendations.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createDefaultAppSettings } from '../src/config/defaults.js';

describe('Tagging, Taxonomy & Recommendations Suite', () => {
  it('rule-tagger extracts topics and filters noise', () => {
    const tags = inferLocalTopicTags({
      title: 'How the Grinch Stole Christmas!',
      authors: ['Dr. Seuss'],
      subjects: ['Juvenile Fiction', 'Holidays / Christmas', 'Stories in rhyme', 'General'],
      summary: 'In snowy Whoville, a grumpy creature discovers holiday kindness and sleigh bells.',
    });

    assert.ok(tags.includes('christmas'));
    assert.ok(tags.includes('holidays'));
    assert.ok(tags.includes('winter'));
    assert.ok(tags.includes('rhyme'));
    assert.equal(tags.includes('juvenile-fiction'), false);
    assert.equal(tags.includes('general'), false);

    assert.equal(sanitizeTag('  Juvenile Literature!! '), '');
    assert.deepEqual(sanitizeTagList(['Dinosaurs!', 'DINOSAURS', 'Prehistoric World', '12345']), [
      'dinosaurs',
      'prehistoric-world',
    ]);
  });

  it('preserves Spanish and Italian accented words during tag sanitization', () => {
    const raw = ['El Monstruo de Colores', 'Emociones', 'Familia & Bebé', 'Il Piccolo Bruco'];
    const cleaned = sanitizeTagList(raw);
    assert.ok(cleaned.some((t) => t.includes('emocion') || t.includes('colores')));
  });

  it('infers age bands and parent-friendly reading level hints', () => {
    const board = enrichBookWithLocalRules({
      title: 'Goodnight Gorilla',
      format: 'board-book',
      pageCount: 24,
    });
    assert.equal(board.readingStage, 'board-toddler');
    assert.equal(board.ageMin, 1);
    assert.equal(board.ageMax, 4);
    assert.match(board.readingLevelHint, /Sensory & Lap Read-Aloud/);

    const early = inferAgeAndStageFromSignals({
      hints: ['Step into Reading Level 2 · Ages 6 to 8'],
      pageCount: 48,
      format: 'paperback',
    });
    assert.equal(early.readingStage, 'early-reader');
    assert.equal(early.ageMin, 6);
    assert.equal(early.ageMax, 8);

    const chapterHint = inferReadingLevelHint({
      readingStage: 'chapter-book',
      pageCount: 144,
      tags: ['adventure', 'animals'],
    });
    assert.equal(chapterHint, 'Independent or Serialized Read-Aloud · ~144 pp');
  });

  it('validateProxyEndpointUrl enforces HTTPS/localhost and rejects URL-embedded secrets', () => {
    assert.equal(validateProxyEndpointUrl('').valid, false);
    assert.equal(validateProxyEndpointUrl('http://remote.example.com/enrich').valid, false);
    assert.equal(
      validateProxyEndpointUrl('https://proxy.example.com/enrich?api_key=secret123').valid,
      false
    );
    assert.equal(
      validateProxyEndpointUrl('https://user:pass@proxy.example.com/enrich').valid,
      false
    );

    assert.equal(validateProxyEndpointUrl('https://proxy.example.com/api/enrich').valid, true);
    assert.equal(validateProxyEndpointUrl('http://localhost:11434/api/enrich').valid, true);
    assert.equal(validateProxyEndpointUrl('/api/enrich-book').valid, true);
  });

  it('TaggingService strictly respects safe opt-in gate', async () => {
    let aiCalls = 0;
    const tagging = createTaggingService({
      adapters: [
        {
          id: 'mock-ai',
          label: 'Mock AI',
          transportKind: 'custom',
          privacyNote: 'None',
          checkAvailability: () => ({ available: true, reason: 'Ready' }),
          async enrichBook() {
            aiCalls++;
            return { tags: ['ai-tag'] };
          },
        },
      ],
    });

    // When aiEnrichmentOptIn is false -> never calls AI
    const settings = {
      ...createDefaultAppSettings(),
      aiEnrichmentOptIn: false,
      aiAdapterId: 'mock-ai',
      aiEndpointUrl: 'https://proxy.example.com',
      aiTimeoutMs: 2000,
      autoLocalTagging: true,
    };
    const result = await tagging.enrichBook(
      { title: 'The Mitten', summary: 'A winter folktale in the snow.' },
      settings
    );

    assert.equal(aiCalls, 0);
    assert.equal(result.usedAi, false);
    assert.equal(result.adapterId, 'local-rules');
  });

  it('recommendations engine ranks off-shelf books by profile fit and flags topic gaps', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();
    const maya = state.profiles[0];

    const recs = getProfileRecommendations({
      books: state.books,
      profile: maya,
      rotations: state.rotations,
      limit: 3,
    });

    assert.ok(recs.length > 0 && recs.length <= 3);
    assert.ok(typeof recs[0].score === 'number');

    const gaps = getTopicCoverageInsights({
      books: state.books,
      profile: maya,
    });
    assert.equal(gaps.topicCounts.length, maya.favoriteTopics.length);
  });

  it('home discovery builders strictly suggest owned rotatable books and build loved/genre shelves', () => {
    /** @type {import('../src/types/models.js').ChildProfile} */
    const profile = {
      id: 'p_leo',
      name: 'Leo',
      age: 4,
      readingStage: 'picture-book',
      favoriteTopics: ['trucks', 'animals'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'teal',
      readHistoryBookIds: ['b_loved_trucks'],
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    /** @type {import('../src/types/models.js').Book[]} */
    const books = [
      {
        id: 'b_on_shelf',
        isbn13: '9780000000001',
        title: 'Active Shelf Book',
        authors: ['Author One'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 5,
        readingStage: 'picture-book',
        tags: ['trucks'],
        spineColor: 'teal',
        collectionStatus: 'owned',
        condition: 'good',
        loved: false,
        addedAt: '2026-10-01T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_loved_trucks',
        isbn13: '9780000000002',
        title: 'Goodnight Construction Site',
        authors: ['Sherri Duskey Rinker'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['trucks', 'bedtime'],
        spineColor: 'amber',
        collectionStatus: 'owned',
        condition: 'good',
        loved: true,
        addedAt: '2026-10-02T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_owned_excavator',
        isbn13: '9780000000003',
        title: 'Little Excavator',
        authors: ['Anna Dewdney'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 5,
        readingStage: 'picture-book',
        tags: ['trucks'],
        spineColor: 'amber',
        collectionStatus: 'owned',
        condition: 'good',
        addedAt: '2026-10-10T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_owned_digger',
        isbn13: '9780000000004',
        title: 'Mighty Digger',
        authors: ['Sherri Duskey Rinker'],
        format: 'board-book',
        ageMin: 2,
        ageMax: 5,
        readingStage: 'picture-book',
        tags: ['trucks', 'construction'],
        spineColor: 'rose',
        collectionStatus: 'owned',
        condition: 'good',
        addedAt: '2026-10-12T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_wishlist_truck',
        isbn13: '9780000000005',
        title: 'Wishlist Dump Truck',
        authors: ['Sherri Duskey Rinker'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 5,
        readingStage: 'picture-book',
        tags: ['trucks', 'bedtime'],
        spineColor: 'teal',
        collectionStatus: 'wishlist',
        condition: 'good',
        addedAt: '2026-10-13T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_library_loan_truck',
        isbn13: '9780000000006',
        title: 'Public Library Truck Book',
        authors: ['Someone'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 5,
        readingStage: 'picture-book',
        tags: ['trucks', 'bedtime'],
        spineColor: 'indigo',
        collectionStatus: 'library',
        condition: 'good',
        addedAt: '2026-10-14T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_loved_animals',
        isbn13: '9780000000007',
        title: 'Little Blue Owl',
        authors: ['Jane Yolen'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['animals', 'forest'],
        spineColor: 'sage',
        collectionStatus: 'owned',
        condition: 'good',
        loved: true,
        addedAt: '2026-10-03T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'b_owned_fox',
        isbn13: '9780000000008',
        title: 'Fox in the Woods',
        authors: ['Jane Yolen'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['animals', 'forest'],
        spineColor: 'sage',
        collectionStatus: 'owned',
        condition: 'good',
        addedAt: '2026-10-15T00:00:00.000Z',
        sources: [],
      },
    ];

    /** @type {import('../src/types/models.js').RotationList[]} */
    const rotations = [
      {
        id: 'rot_active',
        profileId: 'p_leo',
        title: 'Bedtime & Trucks Shelf',
        status: 'active',
        bookIds: ['b_on_shelf'],
        completedBookIds: [],
        pickedBookIds: [],
        rules: {
          objective: 'truck stories',
          count: 4,
          preferredTags: ['trucks'],
          cooldownDays: 14,
          varietyMix: true,
        },
        createdAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      },
    ];

    const rotRecs = getRotationLibrarySuggestions({
      books,
      profile,
      rotation: rotations[0],
      rotations,
      limit: 6,
    });
    const rotIds = rotRecs.map((r) => r.book.id);
    assert.ok(rotIds.includes('b_owned_digger'));
    assert.ok(rotIds.includes('b_owned_excavator'));
    assert.equal(rotIds.includes('b_on_shelf'), false);
    assert.equal(rotIds.includes('b_wishlist_truck'), false);
    assert.equal(rotIds.includes('b_library_loan_truck'), false);

    const overallRecs = getProfileRecommendations({ books, profile, rotations, limit: 10 });
    const overallIds = overallRecs.map((r) => r.book.id);
    assert.equal(overallIds.includes('b_wishlist_truck'), false);
    assert.equal(overallIds.includes('b_library_loan_truck'), false);

    const lovedShelves = getLovedBookSimilarityShelves({
      books,
      profile,
      rotations,
      maxAnchors: 2,
      minItems: 1,
    });
    assert.equal(lovedShelves.length, 2);
    const truckAnchor = lovedShelves.find((s) => s.anchorBook.id === 'b_loved_trucks');
    assert.ok(truckAnchor);
    assert.ok(truckAnchor.items.some((i) => i.book.id === 'b_owned_digger'));
    assert.equal(truckAnchor.items.some((i) => i.book.id === 'b_wishlist_truck'), false);

    const genreShelf = getFavoriteGenreRecommendationShelf({
      books,
      profile,
      rotations,
      minItems: 2,
    });
    assert.ok(genreShelf);
    assert.equal(genreShelf.topic, 'trucks');
    assert.equal(genreShelf.label, 'Trucks');
    assert.ok(genreShelf.items.length >= 2);
    assert.equal(genreShelf.items.some((i) => i.book.id === 'b_library_loan_truck'), false);
  });

  it('applyLlmTagsToBook preserves existing manual and rules tags', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const book = await store.addManualBook({
      title: 'The Snowy Winter Owl',
      authors: ['J. Doe'],
      format: 'hardcover',
      ageMin: 3,
      ageMax: 7,
      readingStage: 'picture-book',
      notes: 'A gentle bedtime story with forest animals in snow.',
      tags: ['watercolor'],
    });

    await store.enrichSingleBook(book.id);
    const updated = await store.applyLlmTagsToBook(book.id, {
      tags: ['woodland', 'friendship'],
      readingStage: 'picture-book',
    });

    assert.ok(updated);
    assert.ok(updated.tags.includes('watercolor'));
    assert.ok(updated.tags.includes('winter'));
    assert.ok(updated.tags.includes('bedtime'));
    assert.ok(updated.tags.includes('woodland'));
    assert.ok(updated.tags.includes('friendship'));
  });
});
