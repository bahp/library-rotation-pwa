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
  explainLocalTagMatches,
  getBuiltInTaxonomyRuleCatalog,
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
  getBedtimeWindDownShelf,
  getDustyGemsShelf,
  getFavoriteGenreRecommendationShelf,
  getLanguageShelf,
  getLovedBookSimilarityShelves,
  getMoreByAuthorShelf,
  getProfileRecommendations,
  getReadyForRereadShelf,
  getRotationLibrarySuggestions,
  getSeasonalPresetShelf,
  getTopicCoverageInsights,
  getWishlistSpotlightShelf,
  isWindDownEveningWindow,
  scoreSimilarBooksForAnchor,
} from '../src/features/tagging/recommendations.js';
import { DEFAULT_ROTATION_PRESETS } from '../src/data/rotation-presets-config.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  createDefaultAppSettings,
  createDefaultMatchingWeights,
} from '../src/config/defaults.js';

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

  it('builds mood, dusty gems, re-read, author, language, seasonal, and wishlist shelves for Home discovery', () => {
    /** @type {import('../src/types/models.js').ChildProfile} */
    const profile = {
      id: 'p_leo',
      name: 'Leo',
      age: 4,
      readingStage: 'picture-book',
      favoriteTopics: ['animals', 'bedtime'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'teal',
      readHistoryBookIds: ['b_reread', 'b_bedtime'],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const nowIso = '2026-10-20T20:00:00.000Z';
    const localEvening = new Date(2026, 9, 20, 19, 0, 0);
    const localNoon = new Date(2026, 9, 20, 12, 0, 0);
    assert.equal(isWindDownEveningWindow(localEvening), true);
    assert.equal(isWindDownEveningWindow(localNoon), false);

    /** @type {import('../src/types/models.js').Book[]} */
    const books = [
      {
        id: 'b_bedtime',
        isbn13: '9780000001001',
        title: 'Whispering Moon',
        authors: ['Clara Night'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['bedtime', 'calm'],
        description: 'A soothing lullaby for sleepy woodland friends.',
        spineColor: 'indigo',
        collectionStatus: 'owned',
        condition: 'good',
        loved: true,
        addedAt: '2026-02-01T00:00:00.000Z',
        lastReadAt: '2026-10-18T00:00:00.000Z',
        lastRotatedAt: '2026-10-10T00:00:00.000Z',
        rotationCount: 2,
        sources: [],
      },
      {
        id: 'b_dusty',
        isbn13: '9780000001002',
        title: 'Forgotten Attic Pumpkin',
        authors: ['Clara Night'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['autumn', 'halloween'],
        spineColor: 'amber',
        collectionStatus: 'owned',
        condition: 'good',
        language: 'spanish',
        addedAt: '2025-11-01T00:00:00.000Z',
        lastRotatedAt: '2026-04-01T00:00:00.000Z',
        rotationCount: 1,
        sources: [],
      },
      {
        id: 'b_reread',
        isbn13: '9780000001003',
        title: 'Autumn Squirrel Festival',
        authors: ['Clara Night'],
        format: 'hardcover',
        ageMin: 2,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['autumn', 'animals'],
        spineColor: 'rose',
        collectionStatus: 'owned',
        condition: 'good',
        language: 'spanish',
        loved: true,
        addedAt: '2026-01-10T00:00:00.000Z',
        lastReadAt: '2026-08-01T00:00:00.000Z',
        lastRotatedAt: '2026-06-01T00:00:00.000Z',
        rotationCount: 2,
        sources: [],
      },
      {
        id: 'b_wishlist_only',
        isbn13: '9780000001004',
        title: 'Wished Starlight Express',
        authors: ['Someone'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['bedtime'],
        spineColor: 'teal',
        collectionStatus: 'wishlist',
        condition: 'good',
        loved: true,
        addedAt: '2026-10-19T00:00:00.000Z',
        sources: [],
      },
    ];

    /** @type {import('../src/types/models.js').RotationList[]} */
    const rotations = [];

    const bedtime = getBedtimeWindDownShelf({ books, profile, rotations, nowIso });
    assert.equal(bedtime.length, 1);
    assert.equal(bedtime[0].book.id, 'b_bedtime');

    const dusty = getDustyGemsShelf({ books, profile, rotations, nowIso, minDaysUntouched: 90 });
    assert.ok(dusty.some((item) => item.book.id === 'b_dusty'));
    assert.equal(dusty.some((item) => item.book.id === 'b_wishlist_only'), false);

    const rereads = getReadyForRereadShelf({ books, profile, rotations, nowIso, minDaysSinceRead: 30 });
    assert.equal(rereads.length, 1);
    assert.equal(rereads[0].book.id, 'b_reread');

    const byAuthor = getMoreByAuthorShelf({ books, profile, rotations, nowIso, minItems: 2 });
    assert.equal(byAuthor?.author, 'Clara Night');
    assert.equal(byAuthor?.items.length, 3);

    const byLang = getLanguageShelf({ books, profile, rotations, minItems: 2 });
    assert.equal(byLang?.language, 'spanish');
    assert.equal(byLang?.items.length, 2);

    const seasonal = getSeasonalPresetShelf({
      books,
      profile,
      rotations,
      presets: DEFAULT_ROTATION_PRESETS,
      nowDate: localEvening,
      minItems: 2,
    });
    assert.ok(seasonal && seasonal.items.length >= 2);

    const wishlist = getWishlistSpotlightShelf({ books });
    assert.equal(wishlist.length, 1);
    assert.equal(wishlist[0].id, 'b_wishlist_only');
  });

  it('supports customizable tagging rules (disable built-in, extra keywords, custom rules, noise words) and live explanations', () => {
    const ruleConfig = {
      disabledBuiltInTags: ['animals'],
      extraKeywordsByTag: {
        bedtime: ['tuck-in'],
      },
      customRules: [
        {
          tag: 'rainy-day',
          keywords: ['puddle', 'umbrella'],
        },
      ],
      extraNoiseWords: ['publisher-imprint'],
    };

    const catalog = getBuiltInTaxonomyRuleCatalog(ruleConfig);
    assert.ok(catalog.length >= 30);
    const animalsEntry = catalog.find((r) => r.tag === 'animals');
    assert.equal(animalsEntry?.enabled, false);
    const bedtimeEntry = catalog.find((r) => r.tag === 'bedtime');
    assert.deepEqual(bedtimeEntry?.extraKeywords, ['tuck-in']);

    const explanation = explainLocalTagMatches(
      {
        title: 'Jumping in the Puddle with Bear',
        subjects: ['publisher-imprint'],
        summary: 'After grabbing an umbrella, little bear gets ready for tuck-in.',
      },
      ruleConfig
    );

    assert.ok(explanation.tags.includes('bedtime'));
    assert.ok(explanation.tags.includes('rainy-day'));
    assert.equal(explanation.tags.includes('animals'), false);
    assert.equal(explanation.tags.includes('publisher-imprint'), false);

    const disabledHit = explanation.ruleHits.find((h) => h.tag === 'animals');
    assert.equal(disabledHit?.enabled, false);
    const customHit = explanation.ruleHits.find((h) => h.tag === 'rainy-day');
    assert.equal(customHit?.source, 'custom');
    assert.ok(customHit?.matchedTerms.includes('puddle'));
  });

  it('applies custom matchingWeights to profile recommendations and similarity scoring', () => {
    /** @type {import('../src/types/models.js').ChildProfile} */
    const profile = {
      id: 'child_weights',
      name: 'Leo',
      age: 4,
      readingStage: 'picture-book',
      favoriteTopics: ['trucks'],
      defaultRotationSize: 4,
      cooldownDays: 14,
      avatarTone: 'teal',
      readHistoryBookIds: [],
      currentlyReadingBookIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    /** @type {import('../src/types/models.js').Book[]} */
    const books = [
      {
        id: 'anchor_loved',
        isbn13: '9780000002001',
        title: 'Trucks in the Mud',
        authors: ['Jane Doe'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['trucks'],
        spineColor: 'teal',
        collectionStatus: 'owned',
        condition: 'good',
        loved: true,
        addedAt: '2026-01-01T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'cand_author',
        isbn13: '9780000002002',
        title: 'Trains in the Snow',
        authors: ['Jane Doe'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['trains'],
        spineColor: 'amber',
        collectionStatus: 'owned',
        condition: 'good',
        loved: false,
        addedAt: '2026-01-01T00:00:00.000Z',
        sources: [],
      },
      {
        id: 'cand_topic',
        isbn13: '9780000002003',
        title: 'Big Dump Truck',
        authors: ['Other Author'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 6,
        readingStage: 'picture-book',
        tags: ['trucks', 'construction'],
        spineColor: 'terracotta',
        collectionStatus: 'owned',
        condition: 'good',
        loved: true,
        addedAt: '2026-01-01T00:00:00.000Z',
        sources: [],
      },
    ];

    const customWeights = createDefaultMatchingWeights();
    customWeights.similarity.sharedAuthor = 90;
    customWeights.similarity.sharedTag = 5;
    customWeights.profile.lovedBonus = 50;
    customWeights.profile.favoriteTopicPerMatch = 4;

    const similar = scoreSimilarBooksForAnchor({
      anchorBook: books[0],
      candidatePool: books,
      profile,
      weights: customWeights,
      nowIso: '2026-11-25T12:00:00.000Z',
    });

    assert.equal(similar[0].book.id, 'cand_author');
    assert.ok(Array.isArray(similar[0].scoreBreakdown) && similar[0].scoreBreakdown.length > 0);

    const recs = getProfileRecommendations({
      books: [books[1], books[2]],
      profile,
      rotations: [],
      weights: customWeights,
      nowIso: '2026-11-25T12:00:00.000Z',
      limit: 5,
    });
    assert.equal(recs[0].book.id, 'cand_topic');
    assert.ok(recs[0].scoreBreakdown?.some((b) => b.points === 50));
  });
});

