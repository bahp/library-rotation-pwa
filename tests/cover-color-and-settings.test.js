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

  it('createSafeDefaultSettings normalizes and clamps sidebar artwork, divider, and tint gradient controls', () => {
    const defaults = createSafeDefaultSettings();
    assert.equal(defaults.sidebarArtworkMode, 'theme');
    assert.equal(defaults.sidebarArtworkStyle, 'integrated');
    assert.equal(defaults.sidebarDividerStyle, 'illustration');
    assert.equal(defaults.dynamicCoverTintMode, 'prominent');
    assert.equal(defaults.dynamicCoverTintCircularFade, 310);
    assert.equal(defaults.dynamicCoverTintLinearFade, 92);

    const clamped = createSafeDefaultSettings({
      sidebarArtworkMode: 'none',
      sidebarArtworkStyle: 'muted',
      sidebarDividerStyle: 'line',
      dynamicCoverTintMode: 'soft',
      dynamicCoverTintCircularFade: 9999,
      dynamicCoverTintLinearFade: 5,
    });
    assert.equal(clamped.sidebarArtworkMode, 'none');
    assert.equal(clamped.sidebarArtworkStyle, 'muted');
    assert.equal(clamped.sidebarDividerStyle, 'line');
    assert.equal(clamped.dynamicCoverTintMode, 'soft');
    assert.equal(clamped.dynamicCoverTintCircularFade, 520);
    assert.equal(clamped.dynamicCoverTintLinearFade, 35);
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
  });
});
