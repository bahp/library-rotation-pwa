/**
 * @fileoverview Phase 21 maintainer regression tests covering:
 * 1) Multi-line description auto-row computation (`computeDescriptionRows` stays compact `1` row for
 *    short/empty notes and expands automatically for multi-line or long descriptions)
 * 2) Scannable visual HTML documentation (`public/docs/*.html` & `docs.css`) with phone-size
 *    screenshot frames/placeholders, numbered steps, input->output examples, and collection preset docs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { computeDescriptionRows } from '../src/features/rotations/rotations-view.js';

describe('Phase 21 — Compact Multi-Line Description Row Sizing', () => {
  it('computes compact 1-row height for empty/short notes and expands for wrapped or multi-paragraph descriptions', () => {
    assert.equal(computeDescriptionRows(''), 1);
    assert.equal(computeDescriptionRows('Short shelf note.'), 1);
    assert.ok(computeDescriptionRows('Line 1\nLine 2\nLine 3\nLine 4') >= 4);
    assert.ok(computeDescriptionRows('A'.repeat(300)) >= 6);
    assert.ok(computeDescriptionRows('A'.repeat(2000)) <= 14);
  });
});

describe('Phase 21 — Visual Documentation & Phone Screenshot Placeholders', () => {
  it('provides scannable HTML docs with phone-size screenshot frames, examples, and screenshot drop-in guide', () => {
    const css = readFileSync(resolve('public/docs/docs.css'), 'utf8');
    assert.equal(css.includes('.phone-frame'), true);
    assert.equal(css.includes('.phone-placeholder'), true);
    assert.equal(css.includes('.step-card'), true);
    assert.equal(css.includes('.example-pair'), true);

    const indexHtml = readFileSync(resolve('public/docs/index.html'), 'utf8');
    assert.equal(indexHtml.includes('class="phone-frame"'), true);
    assert.equal(indexHtml.includes('./screenshots/home-shelf.png'), true);
    assert.equal(indexHtml.includes('./screenshots/scan-barcode.png'), true);
    assert.equal(indexHtml.includes('./screenshots/rotations-edit.png'), true);
    assert.equal(indexHtml.includes('./screenshots/play-games.png'), true);

    const configHtml = readFileSync(resolve('public/docs/configuration.html'), 'utf8');
    assert.equal(configHtml.includes('./screenshots/settings-providers.png'), true);
    assert.equal(configHtml.includes('GOOGLE_BOOKS_API_KEY'), true);

    const taggingHtml = readFileSync(resolve('public/docs/tagging-and-ai.html'), 'utf8');
    assert.equal(taggingHtml.includes('src/features/tagging/rule-tagger.js'), true);
    assert.equal(taggingHtml.includes('TAXONOMY_RULES'), true);
    assert.equal(taggingHtml.includes('src/data/rotation-presets-config.js'), true);
    assert.equal(taggingHtml.includes('AiTagEnrichmentAdapter'), true);

    const archHtml = readFileSync(resolve('public/docs/architecture-and-providers.html'), 'utf8');
    assert.equal(archHtml.includes('MetadataProvider'), true);
    assert.equal(archHtml.includes('lookupByIsbn'), true);
    assert.equal(archHtml.includes('searchBooks'), true);

    assert.equal(existsSync(resolve('public/docs/screenshots/README.md')), true);
  });
});
