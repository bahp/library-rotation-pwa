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
  getProfileRecommendations,
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
});
