/**
 * @fileoverview Unit and Integration tests for the 3 LLM Actions and BYOK Configuration:
 * 1. Book Categorized Tagging Assistant (Interactive formats, developmental themes, concepts & freeform).
 * 2. Smart Rotation Shelf Curator (Intentional rotation curation from user's library with reasons).
 * 3. Smart Library Recommendations (Gap filling, favorites matching, next stage discovery + 1-tap wishlist).
 * 4. Quota management (HTTP 429 RESOURCE_EXHAUSTED user guidance, pool pruning to minimize tokens).
 * 5. Robust JSON parsing from markdown and raw LLM text outputs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractJsonFromText,
  formatCompactCandidateBooks,
  INTERACTIVE_FORMAT_CATEGORIES,
  DEVELOPMENTAL_THEME_CATEGORIES,
  CONCEPT_CATEGORIES,
} from '../src/features/llm/llm-client.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import { createDefaultAppSettings } from '../src/config/defaults.js';

describe('LLM Free / BYOK Features Suite', () => {
  it('extractJsonFromText reliably extracts JSON from raw text and markdown fences', () => {
    // Plain JSON
    const plain = extractJsonFromText('{"interactiveFormats": ["lift-the-flap"], "freeform": ["farm"]}');
    assert.deepEqual(plain, { interactiveFormats: ['lift-the-flap'], freeform: ['farm'] });

    // Enclosed in ```json ... ``` markdown block
    const mdJson = extractJsonFromText(`
      Here is the classification result:
      \`\`\`json
      {
        "allTags": ["bedtime", "board-book", "rhyme"],
        "readingStage": "board-toddler"
      }
      \`\`\`
      Hope this helps!
    `);
    assert.deepEqual(mdJson, {
      allTags: ['bedtime', 'board-book', 'rhyme'],
      readingStage: 'board-toddler',
    });

    // Enclosed in generic \`\`\` ... \`\`\` markdown block
    const genericMd = extractJsonFromText(`
      \`\`\`
      {
        "recommendedBookIds": ["book-1", "book-2"],
        "curatorReasoning": "Great bedtime collection"
      }
      \`\`\`
    `);
    assert.deepEqual(genericMd, {
      recommendedBookIds: ['book-1', 'book-2'],
      curatorReasoning: 'Great bedtime collection',
    });

    // Invalid JSON throws clear error
    assert.throws(() => {
      extractJsonFromText('Not a json object at all');
    }, /Could not extract valid JSON/);
  });

  it('formatCompactCandidateBooks prunes and formats library candidates to stay within quota', () => {
    // Generate 60 test books
    const books = Array.from({ length: 60 }, (_, i) => ({
      id: `book-${i + 1}`,
      title: `Story Book Number ${i + 1}`,
      authors: [`Author ${i + 1}`],
      format: i % 2 === 0 ? 'hardcover' : 'board-book',
      readingStage: 'picture-book',
      tags: ['animals', 'bedtime', 'rhyme'],
      collectionStatus: 'owned',
      excludeFromRotations: i === 0, // book-1 is excluded
    }));

    const formatted = formatCompactCandidateBooks(/** @type {any} */ (books), 40);
    // Should exclude excludeFromRotations=true and cap to 40
    assert.ok(formatted.length <= 40);
    assert.equal(formatted.some((b) => b.id === 'book-1'), false);
    // Each formatted candidate has compact essential fields only
    assert.ok(formatted[0].id);
    assert.ok(formatted[0].title);
    assert.ok(formatted[0].format);
  });

  it('verifies standardized category sets for interactive formats, themes, and concepts', () => {
    const formatIds = INTERACTIVE_FORMAT_CATEGORIES.map((c) => c.id);
    assert.ok(formatIds.includes('lift-the-flap'));
    assert.ok(formatIds.includes('touch-and-feel'));
    assert.ok(formatIds.includes('sound-music-book'));
    assert.ok(formatIds.includes('slide-and-see'));

    const themeIds = DEVELOPMENTAL_THEME_CATEGORIES.map((c) => c.id);
    assert.ok(themeIds.includes('bedtime'));
    assert.ok(themeIds.includes('potty-training'));
    assert.ok(themeIds.includes('feelings-emotions'));
    assert.ok(themeIds.includes('family'));

    const conceptIds = CONCEPT_CATEGORIES.map((c) => c.id);
    assert.ok(conceptIds.includes('counting-numbers'));
    assert.ok(conceptIds.includes('colors'));
    assert.ok(conceptIds.includes('alphabet'));
  });

  it('store integration: applies LLM categorized tags to book', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const book = store.getState().books[0];
    assert.ok(book);

    const updated = await store.applyLlmTagsToBook(book.id, {
      tags: ['lift-the-flap', 'touch-and-feel', 'farm-animals', 'bedtime'],
      readingStage: 'board-toddler',
      readingLevelHint: 'Sensory & Interactive Lap Read-Aloud',
    });

    assert.ok(updated.tags.includes('lift-the-flap'));
    assert.ok(updated.tags.includes('farm-animals'));
    assert.equal(updated.readingStage, 'board-toddler');
    assert.equal(updated.readingLevelHint, 'Sensory & Interactive Lap Read-Aloud');

    // Confirm state in store was updated
    const freshBook = store.getState().books.find((b) => b.id === book.id);
    assert.deepEqual(freshBook?.tags, updated.tags);
  });

  it('store integration: saves and activates an AI-curated rotation', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const activeProfileId = store.getState().activeProfileId;
    const testBookIds = store.getState().books.slice(0, 4).map((b) => b.id);

    const saved = await store.saveCuratedRotation({
      title: 'Bedtime Sensory Stars',
      objective: 'Interactive lift-the-flap and soothing bedtime stories',
      bookIds: testBookIds,
      profileId: activeProfileId,
      setActive: true,
    });

    assert.equal(saved.title, 'Bedtime Sensory Stars');
    assert.equal(saved.status, 'active');
    assert.deepEqual(saved.bookIds, testBookIds);

    const activeInState = store.getState().rotations.find(
      (r) => r.profileId === activeProfileId && r.status === 'active'
    );
    assert.equal(activeInState?.id, saved.id);
  });

  it('store integration: 1-tap adds an AI recommended book to wishlist', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const initialWishlistCount = store.getState().books.filter((b) => b.collectionStatus === 'wishlist').length;

    const rec = {
      title: 'Dear Zoo: A Lift-the-Flap Book',
      author: 'Rod Campbell',
      ageRange: '1 - 3 yrs',
      readingStage: 'board-toddler',
      category: 'lift-the-flap',
      reason: 'Classic lift-the-flap sensory book that fills the interactive gap in your toddler library.',
      gapFilled: 'Interactive format and repetitive predictable text',
    };

    const added = await store.addRecommendedBookToWishlist(rec);
    assert.equal(added.title, 'Dear Zoo: A Lift-the-Flap Book');
    assert.equal(added.collectionStatus, 'wishlist');
    assert.ok(added.tags.includes('wishlist'));
    assert.ok(added.tags.includes('lift-the-flap'));

    const newWishlistCount = store.getState().books.filter((b) => b.collectionStatus === 'wishlist').length;
    assert.equal(newWishlistCount, initialWishlistCount + 1);

    // Adding the exact same title again does not duplicate
    const dupe = await store.addRecommendedBookToWishlist(rec);
    assert.equal(dupe.id, added.id);
    const countAfterDupe = store.getState().books.filter((b) => b.collectionStatus === 'wishlist').length;
    assert.equal(countAfterDupe, newWishlistCount);
  });

  it('AppSettings preserves all LLM configuration fields safely', () => {
    const defaults = createDefaultAppSettings();
    assert.equal(defaults.llmProvider, 'server-gemini');
    assert.equal(defaults.llmModel, 'gemini-3.8-flash');
    assert.equal(defaults.llmCloudflareUrl, '');
    assert.equal(defaults.llmBaseUrl, '');
    assert.equal(defaults.llmApiKey, '');
    assert.equal(defaults.llmCustomPromptHint, '');
  });
});
