import test from 'node:test';
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
  createBrowserPromptApiAdapter,
  createCustomEndpointAiAdapter,
  normalizeAiEnrichmentPayload,
  validateProxyEndpointUrl,
} from '../src/features/tagging/ai-tag-adapter.js';
import { createTaggingService } from '../src/features/tagging/tagging-service.js';
import {
  getProfileRecommendations,
  getTopicCoverageInsights,
} from '../src/features/tagging/recommendations.js';
import { createSafeDefaultSettings, createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';

test('rule-tagger extracts holiday, seasonal, animal, and SEL tags while filtering library noise', () => {
  const christmasTags = inferLocalTopicTags({
    title: 'How the Grinch Stole Christmas!',
    authors: ['Dr. Seuss'],
    subjects: ['Juvenile Fiction', 'Holidays / Christmas', 'Stories in rhyme', 'General'],
    summary: 'In snowy Whoville, a grumpy creature discovers holiday kindness and sleigh bells.',
  });

  assert.ok(christmasTags.includes('christmas'));
  assert.ok(christmasTags.includes('holidays'));
  assert.ok(christmasTags.includes('winter'));
  assert.ok(christmasTags.includes('rhyme'));
  assert.ok(christmasTags.includes('feelings') || christmasTags.includes('friendship'));
  assert.equal(christmasTags.includes('juvenile-fiction'), false);
  assert.equal(christmasTags.includes('general'), false);

  assert.equal(sanitizeTag('  Juvenile Literature!! '), '');
  assert.deepEqual(sanitizeTagList(['Dinosaurs!', 'DINOSAURS', 'Prehistoric World', '12345']), [
    'dinosaurs',
    'prehistoric-world',
  ]);
});

test('rule-tagger infers age bands and parent-friendly reading level hints across stages', () => {
  const board = enrichBookWithLocalRules({
    title: 'Goodnight Gorilla',
    format: 'board-book',
    pageCount: 24,
  });
  assert.equal(board.readingStage, 'board-toddler');
  assert.equal(board.ageMin, 1);
  assert.equal(board.ageMax, 4);
  assert.match(board.readingLevelHint, /Sensory & Lap Read-Aloud/);

  const explicitAges = inferAgeAndStageFromSignals({
    hints: ['Step into Reading Level 2 · Ages 6 to 8'],
    pageCount: 48,
    format: 'paperback',
  });
  assert.equal(explicitAges.readingStage, 'early-reader');
  assert.equal(explicitAges.ageMin, 6);
  assert.equal(explicitAges.ageMax, 8);

  const chapterHint = inferReadingLevelHint({
    readingStage: 'chapter-book',
    pageCount: 144,
    tags: ['adventure', 'animals'],
  });
  assert.equal(chapterHint, 'Independent or Serialized Read-Aloud · ~144 pp');
});

test('validateProxyEndpointUrl enforces HTTPS or localhost and rejects URL-embedded secrets', () => {
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

test('TaggingService strictly respects safe opt-in gate (never calls AI when aiEnrichmentOptIn is false)', async () => {
  let aiCallCount = 0;

  /** @type {import('../src/features/tagging/ai-tag-adapter.js').AiTagEnrichmentAdapter} */
  const spyAdapter = {
    id: 'spy-ai',
    label: 'Spy AI Adapter',
    transportKind: 'custom',
    privacyNote: 'Test spy adapter',
    checkAvailability: () => ({ available: true, reason: 'Ready' }),
    async enrichBook() {
      aiCallCount += 1;
      return { tags: ['folklore', 'woodland'] };
    },
  };

  const service = createTaggingService({ adapters: [spyAdapter] });
  const safeDefaults = createSafeDefaultSettings({ aiAdapterId: 'spy-ai' });

  // Safe default check
  assert.equal(safeDefaults.aiEnrichmentOptIn, false);
  assert.equal(safeDefaults.autoLocalTagging, true);
  assert.deepEqual(safeDefaults.enabledMetadataProviders, ['google-books', 'open-library']);

  const localOnlyRes = await service.enrichBook(
    {
      title: 'The Mitten: A Winter Folktale',
      summary: 'Woodland animals snuggle inside a lost white mitten in the snow.',
    },
    safeDefaults
  );

  assert.equal(aiCallCount, 0);
  assert.equal(localOnlyRes.usedAi, false);
  assert.equal(localOnlyRes.adapterId, 'local-rules');
  assert.ok(localOnlyRes.tags.includes('winter'));
  assert.ok(localOnlyRes.tags.includes('animals'));

  // Now explicitly opt in -> spyAdapter executes and merges tags + provenance
  const optedInSettings = { ...safeDefaults, aiEnrichmentOptIn: true };
  const optedInRes = await service.enrichBook(
    {
      title: 'The Mitten: A Winter Folktale',
      summary: 'Woodland animals snuggle inside a lost white mitten in the snow.',
    },
    optedInSettings
  );

  assert.equal(aiCallCount, 1);
  assert.equal(optedInRes.usedAi, true);
  assert.equal(optedInRes.adapterId, 'spy-ai');
  assert.ok(optedInRes.tags.includes('winter'));
  assert.ok(optedInRes.tags.includes('folklore'));
  assert.equal(optedInRes.aiProvenance?.provider, 'ai:spy-ai');
});

test('Built-in Browser Prompt API and Custom Endpoint adapters normalize responses and fall back cleanly on failure', async () => {
  let destroyed = false;
  const mockGlobalScope = {
    LanguageModel: {
      async create() {
        return {
          /** @param {string} _prompt */
          async prompt(_prompt) {
            return '```json\n{"tags":["Christmas"," Empathy ","juvenile"],"ageMin":4,"ageMax":8,"readingStage":"picture-book","readingLevelHint":"Festive Hearthside Read-Aloud · ~7 min"}\n```';
          },
          destroy() {
            destroyed = true;
          },
        };
      },
    },
  };

  const browserAdapter = createBrowserPromptApiAdapter({ globalScope: mockGlobalScope });

  /** @type {typeof fetch} */
  const failingFetch = async () => new Response('Gateway Timeout', { status: 504 });
  const failingWebhookAdapter = createCustomEndpointAiAdapter({ fetchImpl: failingFetch });

  const service = createTaggingService({
    adapters: [browserAdapter, failingWebhookAdapter],
  });

  // 1. Test On-Device Browser Prompt API adapter
  const promptSettings = createSafeDefaultSettings({
    aiEnrichmentOptIn: true,
    aiAdapterId: 'browser-prompt-api',
  });
  const promptRes = await service.enrichBook(
    { title: 'A Festive Pine Tree', authors: ['Clara Bell'] },
    promptSettings
  );

  assert.equal(promptRes.usedAi, true);
  assert.equal(destroyed, true);
  assert.ok(promptRes.tags.includes('christmas'));
  assert.ok(promptRes.tags.includes('empathy'));
  assert.equal(promptRes.tags.includes('juvenile'), false);
  assert.equal(promptRes.readingLevelHint, 'Festive Hearthside Read-Aloud · ~7 min');

  // 2. Test graceful fallback when Custom Endpoint returns HTTP 504
  const webhookSettings = createSafeDefaultSettings({
    aiEnrichmentOptIn: true,
    aiAdapterId: 'custom-endpoint',
    aiEndpointUrl: 'https://proxy.example.test/api/enrich',
  });
  const fallbackRes = await service.enrichBook(
    {
      title: 'Dinosaur Rocket Launch',
      summary: 'Silly dinosaurs build a rocket to explore planets in space.',
    },
    webhookSettings
  );

  assert.equal(fallbackRes.usedAi, false);
  assert.equal(fallbackRes.adapterId, 'local-rules');
  assert.match(fallbackRes.fallbackReason || '', /504/);
  assert.ok(fallbackRes.tags.includes('dinosaurs'));
  assert.ok(fallbackRes.tags.includes('space'));
  assert.ok(fallbackRes.tags.includes('humor'));

  // 3. Verify payload clamping helper directly
  const clamped = normalizeAiEnrichmentPayload({
    tags: ['Ocean Life', 'SHARKS'],
    ageMin: -3,
    ageMax: 99,
    readingStage: 'invalid-stage',
  });
  assert.equal(clamped.ageMin, 0);
  assert.equal(clamped.ageMax, 16);
  assert.equal(clamped.readingStage, undefined);
  assert.deepEqual(clamped.tags, ['ocean-life', 'sharks']);
});

test('Recommendations engine and AppStore enrich books, curate tags, and enforce safe provider defaults', async () => {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();

  const initialState = store.getState();
  const maya = initialState.profiles.find((p) => p.id === 'profile_maya');
  assert.ok(maya);

  // Recommendations exclude Maya's 4 active shelf books and surface 'The Very Hungry Caterpillar' first
  const recs = getProfileRecommendations({
    books: initialState.books,
    profile: maya,
    rotations: initialState.rotations,
    limit: 3,
  });
  assert.ok(recs.length > 0);
  assert.equal(recs[0].book.id, 'book_very_hungry');
  assert.equal(recs[0].isUnread, true);
  assert.ok(recs[0].matchedTopics.includes('nature') || recs[0].matchedTopics.includes('animals'));

  const coverage = getTopicCoverageInsights({
    books: initialState.books,
    profile: maya,
  });
  assert.equal(coverage.topicCounts.length, maya.favoriteTopics.length);

  // Add a manual book with no manual tags -> local rule-based tagger auto-populates tags & readingLevelHint
  const added = await store.addManualBook({
    title: 'Little Reindeer’s Snowy Christmas Eve',
    authors: ['Nora Winter'],
    format: 'hardcover',
    readingStage: 'picture-book',
    ageMin: 3,
    ageMax: 7,
    tags: [],
  });
  assert.ok(added.tags.includes('christmas'));
  assert.ok(added.tags.includes('winter'));
  assert.ok(added.readingLevelHint);

  // Curate tags manually (add + remove)
  const withCustomTag = await store.addBookTag(added.id, 'Nordic Cozy');
  assert.ok(withCustomTag.tags.includes('nordic-cozy'));
  await store.removeBookTag(added.id, 'nordic-cozy');
  const afterRemove = store.getState().books.find((b) => b.id === added.id);
  assert.equal(afterRemove?.tags.includes('nordic-cozy'), false);

  // Provider toggle guard prevents disabling ALL metadata providers
  const firstDisable = await store.toggleMetadataProvider('open-library');
  assert.equal(firstDisable, true);
  assert.deepEqual(store.getState().settings.enabledMetadataProviders, ['google-books']);

  const secondDisableBlocked = await store.toggleMetadataProvider('google-books');
  assert.equal(secondDisableBlocked, false);
  assert.deepEqual(store.getState().settings.enabledMetadataProviders, ['google-books']);

  // Reset provider settings restores safe privacy-first defaults
  await store.updateSettings({
    aiEnrichmentOptIn: true,
    aiAdapterId: 'custom-endpoint',
    aiEndpointUrl: 'https://proxy.example.test/enrich',
  });
  await store.resetProviderSettingsToSafeDefaults();
  assert.equal(store.getState().settings.aiEnrichmentOptIn, false);
  assert.equal(store.getState().settings.aiAdapterId, 'browser-prompt-api');
  assert.equal(store.getState().settings.aiEndpointUrl, '');
  assert.deepEqual(store.getState().settings.enabledMetadataProviders, [
    'google-books',
    'open-library',
  ]);
});
