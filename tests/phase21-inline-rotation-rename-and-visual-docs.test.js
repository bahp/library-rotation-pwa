/**
 * @fileoverview Phase 21 maintainer regression tests covering:
 * 1) Inline pen-icon rotation rename & multi-line auto-sized description editing
 *    (replacing the separate Edit-mode rename section with in-place header inputs)
 * 2) Multi-line description visibility (`computeDescriptionRows`, `<textarea data-auto-resize="true">`,
 *    and untruncated `whitespace-pre-line` rendering when shelf Edit mode is active)
 * 3) Scannable visual HTML documentation (`public/docs/*.html` & `docs.css`) with phone-size
 *    screenshot frames/placeholders, numbered steps, input->output examples, and collection preset docs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';
import {
  computeDescriptionRows,
  renderRotationsView,
} from '../src/features/rotations/rotations-view.js';

/**
 * Creates a fresh initialized store backed by an isolated in-memory storage adapter.
 */
async function createIsolatedStore() {
  const storage = createStorageAdapter({ forceMemory: true });
  const store = createAppStore(storage);
  await store.init();
  return store;
}

describe('Phase 21 — Inline Pen-to-Textbox Rotation Rename & Auto-Sized Description', () => {
  it('renders a pen button next to the title instead of a separate Edit section, and swaps title/description into inline controls on click', async () => {
    const store = await createIsolatedStore();
    const targetRot = store.getState().rotations[0];
    assert.ok(targetRot, 'Expected starter rotation');

    const longDescription =
      'Calm snowy winter stories, gentle woodland bedtime routines, cozy family traditions, ' +
      'and quiet rhyming picture books to wind down after bath time every evening this month.\n' +
      'Keep board books on the bottom ledge so toddlers can reach them independently.';

    await store.updateRotationDetails(targetRot.id, {
      title: 'Winter Bedtime Basket',
      description: longDescription,
    });

    const updatedState = store.getState();

    // 1. Book-slot Edit mode (`editingRotationId`) should NOT render a separate rename box anymore,
    //    and should show the full multi-line description untruncated (`whitespace-pre-line`).
    const bookEditHtml = renderRotationsView({
      state: updatedState,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: targetRot.id,
        renamingRotationId: null,
      },
      referenceDate: '2026-12-05',
    });

    assert.equal(
      bookEditHtml.includes('data-form="edit-rotation-details"'),
      false,
      'Book Edit mode should not render a separate boxed Rotation Name / Description section'
    );
    assert.equal(
      bookEditHtml.includes(`data-action="start-rename-rotation"`),
      true,
      'Pen button should remain right next to the rotation title'
    );
    assert.equal(
      bookEditHtml.includes('whitespace-pre-line leading-relaxed'),
      true,
      'Long description should display untruncated when Edit mode is open'
    );

    // 2. Clicking the pen icon (`renamingRotationId === targetRot.id`) swaps the title into its own
    //    textbox and the description into an auto-sized multi-line <textarea> large enough for all text.
    const inlineRenameHtml = renderRotationsView({
      state: updatedState,
      editorState: {
        modalMode: null,
        rotationId: null,
        targetBookId: null,
        searchQuery: '',
        selectedAddBookIds: [],
        randomAddCount: 1,
        isGeneratorOpen: false,
        editingRotationId: null,
        renamingRotationId: targetRot.id,
      },
      referenceDate: '2026-12-05',
    });

    assert.equal(inlineRenameHtml.includes('data-form="edit-rotation-details"'), true);
    assert.equal(
      inlineRenameHtml.includes(`id="edit-rot-title-${targetRot.id}"`),
      true,
      'Title should become an inline text input'
    );
    assert.equal(
      inlineRenameHtml.includes(`id="edit-rot-desc-${targetRot.id}"`),
      true,
      'Description should become an inline multi-line textarea'
    );
    assert.equal(
      inlineRenameHtml.includes('data-auto-resize="true"'),
      true,
      'Description textarea should carry data-auto-resize="true" for live height growth'
    );
    assert.equal(
      inlineRenameHtml.includes('data-action="cancel-rename-rotation"'),
      true,
      'Inline rename form should include a Cancel action'
    );

    const expectedRows = computeDescriptionRows(longDescription);
    assert.ok(
      expectedRows >= 6,
      `Expected long description (${longDescription.length} chars) to allocate >= 6 rows, got ${expectedRows}`
    );
    assert.equal(inlineRenameHtml.includes(`rows="${expectedRows}"`), true);
  });

  it('computes sensible textarea row heights for empty, short, wrapped, and multi-paragraph descriptions', () => {
    assert.equal(computeDescriptionRows(''), 2);
    assert.equal(computeDescriptionRows('Short shelf note.'), 2);
    assert.ok(computeDescriptionRows('Line 1\nLine 2\nLine 3\nLine 4') >= 4);
    assert.ok(computeDescriptionRows('A'.repeat(300)) >= 7);
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
