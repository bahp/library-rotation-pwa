/**
 * @fileoverview Cover Color Extraction, Cover Image Proxy & Sidebar/Tint Settings Suite:
 * - Multi-swatch palette extraction across 'prominent', 'dominant', and 'soft' modes.
 * - Server-side cover proxy SSRF allowlist & image content validation.
 * - Safe normalization & range clamping for new sidebar artwork, divider, and tint settings.
 * - Manual vs automatic cover tint persistence in the store.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCoverPaletteFromRgba,
  extractDominantColorFromRgba,
  resolveBookCardTintHex,
} from '../src/features/catalog/cover-color-extractor.js';
import {
  parseAllowedCoverImageUrl,
  proxyBookCoverImage,
} from '../src/server/books-proxy.js';
import { createSafeDefaultSettings, createStorageAdapter } from '../src/core/storage.js';
import { normalizeSidebarDividerStyle } from '../src/config/defaults.js';
import { createAppStore } from '../src/core/store.js';

/**
 * Builds an artificial RGBA buffer divided vertically into colored bands.
 * @param {Array<[number, number, number, number]>} bands `[r, g, b, pixelFraction]`
 * @param {number} width
 * @param {number} height
 */
function buildSyntheticCoverRgba(bands, width = 20, height = 20) {
  const totalPixels = width * height;
  const rgba = new Uint8ClampedArray(totalPixels * 4);
  let cursor = 0;
  bands.forEach(([r, g, b, fraction], idx) => {
    const count =
      idx === bands.length - 1 ? totalPixels - cursor : Math.round(totalPixels * fraction);
    for (let i = 0; i < count && cursor < totalPixels; i++, cursor++) {
      const off = cursor * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 255;
    }
  });
  return rgba;
}

describe('Cover Color Extraction, Cover Proxy & Settings Suite', () => {
  it('extractCoverPaletteFromRgba distinguishes prominent, dominant, and soft extraction modes', () => {
    // 65% warm muted beige-taupe background, 20% vivid emerald accent, 15% coral terracotta
    const rgba = buildSyntheticCoverRgba([
      [176, 154, 128, 0.65],
      [26, 145, 98, 0.2],
      [212, 86, 62, 0.15],
    ]);

    const prominent = extractCoverPaletteFromRgba(rgba, 20, 20, {
      mode: 'prominent',
      maxSwatches: 5,
    });
    const dominant = extractCoverPaletteFromRgba(rgba, 20, 20, {
      mode: 'dominant',
      maxSwatches: 5,
    });
    const soft = extractCoverPaletteFromRgba(rgba, 20, 20, {
      mode: 'soft',
      maxSwatches: 5,
    });

    assert.ok(prominent.primary);
    assert.ok(dominant.primary);
    assert.ok(soft.primary);
    assert.ok(prominent.swatches.length >= 2);

    // Dominant favors the 65% warm beige field; prominent picks a vivid accent color
    assert.notEqual(dominant.primary, prominent.primary);
    assert.equal(
      extractDominantColorFromRgba(rgba, 20, 20, 'prominent'),
      prominent.primary
    );
  });

  it('parseAllowedCoverImageUrl blocks unsafe hosts and allows book catalog cover CDNs', () => {
    assert.ok(
      parseAllowedCoverImageUrl('https://books.google.com/books/content?id=abc&img=1&zoom=1')
    );
    assert.ok(parseAllowedCoverImageUrl('https://covers.openlibrary.org/b/id/12345-L.jpg'));
    assert.ok(parseAllowedCoverImageUrl('https://m.media-amazon.com/images/I/51abc.jpg'));

    // Reject HTTP, private IPs, localhost, and arbitrary domains
    assert.equal(
      parseAllowedCoverImageUrl('http://books.google.com/books/content?id=abc'),
      null
    );
    assert.equal(parseAllowedCoverImageUrl('https://localhost:3000/secret.png'), null);
    assert.equal(parseAllowedCoverImageUrl('https://127.0.0.1/internal.png'), null);
    assert.equal(parseAllowedCoverImageUrl('https://metadata.internal/cover.jpg'), null);
    assert.equal(parseAllowedCoverImageUrl('https://evil.example.com/track.png'), null);
  });

  it('proxyBookCoverImage enforces image content-type and returns clean bytes for valid CDN covers', async () => {
    const blocked = await proxyBookCoverImage({
      rawUrl: 'https://evil.example.com/cover.jpg',
    });
    assert.equal(blocked.status, 400);

    const nonImage = await proxyBookCoverImage({
      rawUrl: 'https://covers.openlibrary.org/b/id/999-L.jpg',
      fetchImpl: async () =>
        new Response('<html>Not an image</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    });
    assert.equal(nonImage.status, 502);

    const sampleBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const ok = await proxyBookCoverImage({
      rawUrl: 'https://covers.openlibrary.org/b/id/999-L.jpg',
      fetchImpl: async () =>
        new Response(sampleBytes, {
          status: 200,
          headers: { 'content-type': 'image/jpeg; charset=binary' },
        }),
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.contentType, 'image/jpeg');
    assert.deepEqual(Array.from(ok.buffer || []), Array.from(sampleBytes));
  });

  it('createSafeDefaultSettings normalizes and clamps sidebar artwork, divider motifs, and tint gradient controls', async () => {
    const defaults = createSafeDefaultSettings();
    assert.equal(defaults.sidebarArtworkMode, 'theme');
    assert.equal(defaults.sidebarArtworkStyle, 'integrated');
    assert.equal(defaults.sidebarDividerStyle, 'laurel');
    assert.equal(defaults.dynamicCoverTintMode, 'prominent');
    assert.equal(defaults.dynamicCoverTintCircularFade, 310);
    assert.equal(defaults.dynamicCoverTintLinearFade, 92);

    // Legacy 'illustration' value migrates cleanly to 'laurel'
    assert.equal(normalizeSidebarDividerStyle('illustration'), 'laurel');
    assert.equal(normalizeSidebarDividerStyle('JAPANESE'), 'japanese');
    assert.equal(normalizeSidebarDividerStyle('folio'), 'folio');
    assert.equal(normalizeSidebarDividerStyle('minimal'), 'minimal');
    assert.equal(normalizeSidebarDividerStyle('random'), 'random');
    assert.equal(normalizeSidebarDividerStyle('unknown-style'), 'laurel');
    assert.equal(
      createSafeDefaultSettings({ sidebarDividerStyle: /** @type {any} */ ('illustration') })
        .sidebarDividerStyle,
      'laurel'
    );

    const clamped = createSafeDefaultSettings({
      sidebarArtworkMode: 'none',
      sidebarArtworkId: 'random',
      sidebarArtworkStyle: 'muted',
      sidebarDividerStyle: 'japanese',
      dynamicCoverTintMode: 'soft',
      dynamicCoverTintCircularFade: 9999,
      dynamicCoverTintLinearFade: 5,
    });
    assert.equal(clamped.sidebarArtworkMode, 'none');
    assert.equal(clamped.sidebarArtworkId, 'random');
    assert.equal(clamped.sidebarArtworkStyle, 'muted');
    assert.equal(clamped.sidebarDividerStyle, 'japanese');
    assert.equal(clamped.dynamicCoverTintMode, 'soft');
    assert.equal(clamped.dynamicCoverTintCircularFade, 520);
    assert.equal(clamped.dynamicCoverTintLinearFade, 35);

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    await store.updateSettings({
      sidebarArtworkId: 'random',
      sidebarDividerStyle: 'random',
    });
    assert.equal(store.getState().settings.sidebarArtworkId, 'random');
    assert.equal(store.getState().settings.sidebarDividerStyle, 'random');
  });

  it('store.setBookDominantColor distinguishes manual vs automatic overrides and clears cleanly', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const target = store.getState().books[0];

    const autoSaved = await store.setBookDominantColor(target.id, '#2B6E68', { manual: false });
    assert.equal(autoSaved?.dominantColor, '#2B6E68');
    assert.equal(autoSaved?.dominantColorSource, 'auto');
    assert.equal(resolveBookCardTintHex(autoSaved), '#2B6E68');

    const manualSaved = await store.setBookDominantColor(target.id, '#9A5B25', { manual: true });
    assert.equal(manualSaved?.dominantColor, '#9A5B25');
    assert.equal(manualSaved?.dominantColorSource, 'manual');

    const cleared = await store.setBookDominantColor(target.id, null);
    assert.equal(cleared?.dominantColor, undefined);
    assert.equal(cleared?.dominantColorSource, undefined);
    assert.equal(cleared?.dominantColorSwatches, undefined);
    assert.equal(cleared?.dominantColorMode, undefined);

    const swatchSaved = await store.setBookDominantColor(target.id, '#336699', {
      manual: true,
      swatches: ['#336699', '#994422', '#228866'],
      mode: 'prominent',
    });
    assert.deepEqual(swatchSaved?.dominantColorSwatches, ['#336699', '#994422', '#228866']);
    assert.equal(swatchSaved?.dominantColorMode, 'prominent');
  });

  it('store persists precomputed cover tints and descriptions on intake and clears tint on cover removal', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    const added = await store.addBookFromCandidate(
      {
        candidateKey: 'cand_tint_test',
        isbn13: '9780399255373',
        title: 'The Day the Crayons Quit',
        authors: ['Drew Daywalt'],
        format: 'hardcover',
        ageMin: 3,
        ageMax: 7,
        readingStage: 'picture-book',
        tags: ['humor'],
        coverUrl: 'https://covers.openlibrary.org/b/id/12345-M.jpg',
        spineColor: 'amber',
        summary: 'Poor Duncan just wants to color, until his crayons go on strike.',
        sources: [{ provider: 'open-library', fetchedAt: '2026-10-01T00:00:00.000Z' }],
      },
      {
        collectionStatus: 'owned',
        dominantColor: '#D4563E',
        dominantColorSwatches: ['#D4563E', '#2A7B6E'],
        dominantColorMode: 'prominent',
      }
    );

    assert.equal(added.dominantColor, '#D4563E');
    assert.deepEqual(added.dominantColorSwatches, ['#D4563E', '#2A7B6E']);
    assert.equal(added.dominantColorMode, 'prominent');
    assert.equal(added.dominantColorSource, 'auto');
    assert.ok(added.description?.includes('Duncan'));

    const clearedCover = await store.updateBook(added.id, {
      coverUrl: '',
      description: 'Edited parent synopsis for bedtime reading.',
    });
    assert.equal(clearedCover?.coverUrl, undefined);
    assert.equal(clearedCover?.dominantColor, undefined);
    assert.equal(clearedCover?.dominantColorSwatches, undefined);
    assert.equal(clearedCover?.description, 'Edited parent synopsis for bedtime reading.');
  });

  it('normalizes showBookDescription and syncs missing descriptions + forceAll and description-aware re-tagging', async () => {
    const defaultSettings = createSafeDefaultSettings();
    assert.equal(defaultSettings.showBookDescription, true);
    assert.equal(createSafeDefaultSettings({ showBookDescription: false }).showBookDescription, false);

    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();

    // Remove seed books so only our controlled test book is inspected
    const seedIds = store.getState().books.map((b) => b.id);
    for (const id of seedIds) {
      await store.deleteBook(id);
    }

    // Add a book that has Google Books, cover, pages, year — ONLY missing description
    const added = await store.addBookFromCandidate({
      candidateKey: 'cand_corduroy_sync',
      isbn13: '9781999990011',
      title: 'Corduroy',
      authors: ['Don Freeman'],
      format: 'paperback',
      ageMin: 3,
      ageMax: 7,
      readingStage: 'picture-book',
      tags: ['bears'],
      spineColor: 'teal',
      publishedYear: 1976,
      pageCount: 32,
      coverUrl: 'https://covers.openlibrary.org/b/id/8231456-M.jpg',
      sources: [{ provider: 'google-books', fetchedAt: '2026-01-01T00:00:00.000Z' }],
    });
    assert.equal(added.description, undefined);

    let lookupCalls = 0;
    const mockCatalogService = {
      /**
       * @param {string} isbn13
       * @returns {Promise<{ candidate: import('../src/features/catalog/normalizer.js').BookCandidate | null }>}
       */
      async lookupByIsbn(isbn13) {
        lookupCalls += 1;
        return {
          candidate: {
            candidateKey: `gb_${isbn13}`,
            isbn13,
            title: 'Corduroy',
            authors: ['Don Freeman'],
            publishedYear: 1976,
            pageCount: 32,
            format: 'paperback',
            ageMin: 3,
            ageMax: 7,
            readingStage: 'picture-book',
            spineColor: 'teal',
            tags: ['bears'],
            summary: '<p>A little teddy bear searches for his missing button at bedtime.</p>',
            publisher: 'Viking Press',
            sources: [
              {
                provider: 'google-books',
                externalId: 'gb_corduroy',
                fetchedAt: '2026-11-01T00:00:00.000Z',
              },
            ],
          },
        };
      },
      async searchBooks() {
        return { candidates: [] };
      },
    };

    // Regular sync detects missing description
    const syncRes = await store.syncExistingCatalogMetadata(mockCatalogService);
    assert.equal(lookupCalls, 1);
    assert.equal(syncRes.checkedCount, 1);
    assert.equal(syncRes.addedDescriptionsCount, 1);
    const updated = store.getState().books.find((b) => b.id === added.id);
    assert.equal(
      updated?.description,
      'A little teddy bear searches for his missing button at bedtime.'
    );
    assert.equal(updated?.publisher, 'Viking Press');

    // Second regular sync skips now-complete book; forceAll re-checks all books
    const secondSync = await store.syncExistingCatalogMetadata(mockCatalogService);
    assert.equal(secondSync.checkedCount, 0);
    assert.equal(lookupCalls, 1);

    const forceSync = await store.syncExistingCatalogMetadata(mockCatalogService, {
      forceAll: true,
    });
    assert.equal(forceSync.checkedCount, 1);
    assert.equal(lookupCalls, 2);

    // Re-enrich uses persisted description when deriving tags
    const moonBook = await store.addManualBook({
      isbn: '',
      title: 'Sleepy Night Bear',
      authors: ['Test Author'],
      format: 'board-book',
      ageMin: 0,
      ageMax: 3,
      readingStage: 'board-toddler',
      description: 'A gentle bedtime story under the stars for calm wind-down.',
      tags: [],
    });
    await store.enrichAllCatalogBooks();
    const retagged = store.getState().books.find((b) => b.id === moonBook.id);
    assert.ok(retagged?.tags.includes('bedtime'));
  });
});
