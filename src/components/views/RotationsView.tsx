import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { RotationShelfCard } from '../cards/RotationShelfCard.js';
import { RotationEditorModal } from '../modals/RotationEditorModal.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { formatProfileAgeLabel } from '../../types/models.js';
import type { BookFormat } from '../../types/models.js';

export const RotationsView: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    activeRotation,
    navigate,
    rotationEditor,
    setRotationEditor,
    setAiCuratorModal,
  } = useApp();

  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [bookCount, setBookCount] = useState(activeProfile?.defaultRotationSize || 5);
  const [format, setFormat] = useState<BookFormat | 'any'>('any');
  const [preferredTags, setPreferredTags] = useState('');
  const [cooldownDays, setCooldownDays] = useState(activeProfile?.cooldownDays ?? 14);
  const [varietyMix, setVarietyMix] = useState(true);
  const [seed, setSeed] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const savedRotations = state.rotations.filter(
    (r) => r.profileId === activeProfile?.id && r.status !== 'active'
  );

  const orderedRotations = activeRotation
    ? [activeRotation, ...savedRotations]
    : savedRotations;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;

    setIsGenerating(true);
    try {
      const tagsList = preferredTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await store.generateRotation({
        title: title.trim() || `${activeProfile.name}’s Shelf Rotation`,
        objective: objective.trim() || undefined,
        count: Number(bookCount),
        requiredFormat: format,
        preferredTags: tagsList,
        cooldownDays: Number(cooldownDays),
        varietyMix,
        seed: seed.trim() || undefined,
      });

      setIsGeneratorOpen(false);
      setTitle('');
      setObjective('');
      setPreferredTags('');
      setSeed('');
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSwapBook = async (rotId: string, bookId: string) => {
    await store.replaceRotationBookRandom(rotId, bookId);
  };

  const handleReplaceBook = (rotId: string, bookId: string) => {
    setRotationEditor({
      modalMode: 'replace',
      rotationId: rotId,
      targetBookId: bookId,
    });
  };

  const handleOpenAddModal = (rotId: string) => {
    setRotationEditor({
      modalMode: 'add',
      rotationId: rotId,
      targetBookId: null,
    });
  };

  const handleAddRandom = async (rotId: string, count: number) => {
    await store.addBooksToRotationRandom(rotId, count);
  };

  const handleToggleRead = async (rotId: string, bookId: string) => {
    await store.toggleRotationBookRead(rotId, bookId);
  };

  const handleActivateRotation = async (rotId: string) => {
    await store.setActiveRotation(rotId);
  };

  const handleDeleteRotation = async (rotId: string) => {
    await store.deleteRotation(rotId);
  };

  return (
    <div className="space-y-4 text-left max-w-4xl mx-auto">
      {/* Header bar */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-linen-200/90 dark:border-night-800 pb-3">
        <div>
          <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
            {activeProfile
              ? `${activeProfile.name} · ${formatProfileAgeLabel(activeProfile)}`
              : 'Book Rotations'}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5">
            Book Rotations
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAiCuratorModal({ isOpen: true })}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Icon name="sparkles" className="w-3.5 h-3.5 text-forest-700 dark:text-[#5ED3DA]" />
            <span>AI Curator</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('presets')}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Icon name="presets" className="w-3.5 h-3.5" />
            <span>Presets</span>
          </button>

          <button
            type="button"
            onClick={() => setIsGeneratorOpen((prev) => !prev)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-semibold text-xs inline-flex items-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap"
          >
            <Icon name={isGeneratorOpen ? 'close' : 'plus'} className="w-4 h-4" />
            <span>{isGeneratorOpen ? 'Close' : 'New Shelf'}</span>
          </button>
        </div>
      </div>

      {/* Generator Form Collapsible */}
      {isGeneratorOpen && (
        <form
          onSubmit={handleGenerate}
          className="p-4 sm:p-5 rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-md space-y-4"
        >
          <div className="flex items-center justify-between border-b border-linen-200/80 dark:border-night-800 pb-2">
            <h2 className="font-display text-base font-bold text-forest-900 dark:text-white">
              Generate Shelf Rotation
            </h2>
            <span className="text-xs text-stone-ink dark:text-slate-400">
              Reader: <strong>{activeProfile?.name}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Shelf Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. ${activeProfile?.name || 'Reader'}’s Winter Shelf`}
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Objective / Natural Language Rules
              </label>
              <ClearableInput
                value={objective}
                onValueChange={setObjective}
                placeholder="e.g. hardcover + bedtime & winter stories"
                className="px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Number of Books
              </label>
              <input
                type="number"
                min={2}
                max={20}
                value={bookCount}
                onChange={(e) => setBookCount(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Binding Format Filter
              </label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-semibold"
              >
                <option value="any">Any Binding Format</option>
                <option value="hardcover">Hardcover Only</option>
                <option value="board-book">Board Book Only</option>
                <option value="paperback">Paperback Only</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Preferred Topics (comma-separated)
              </label>
              <input
                type="text"
                value={preferredTags}
                onChange={(e) => setPreferredTags(e.target.value)}
                placeholder="e.g. animals, bedtime, space"
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Cooldown Window (Days)
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={cooldownDays}
                onChange={(e) => setCooldownDays(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-stone-ink dark:text-slate-400 mb-1">
                Deterministic Seed (Optional)
              </label>
              <input
                type="text"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Repeatable PRNG seed string"
                className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-mono"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={varietyMix}
                  onChange={(e) => setVarietyMix(e.target.checked)}
                  className="w-4 h-4 rounded text-forest-700"
                />
                <span className="font-semibold text-stone-700 dark:text-slate-300">
                  Enforce author &amp; topic variety mix
                </span>
              </label>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsGeneratorOpen(false)}
              className="px-4 py-2 rounded-xl text-stone-600 dark:text-slate-400 hover:bg-linen-100 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="px-5 py-2 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shadow-xs"
            >
              {isGenerating ? 'Generating Shelf…' : 'Generate & Activate Shelf'}
            </button>
          </div>
        </form>
      )}

      {/* Flat Full-Width Editorial Shelves List (No nested boxes on phone screens) */}
      {orderedRotations.length > 0 ? (
        <div>
          {orderedRotations.map((rot) => {
            const isActive = rot.status === 'active';
            return (
              <RotationShelfCard
                key={rot.id}
                rotation={rot}
                books={state.books}
                isActive={isActive}
                onActivate={isActive ? undefined : () => handleActivateRotation(rot.id)}
                onDelete={() => handleDeleteRotation(rot.id)}
                onSwapBook={(bookId) => handleSwapBook(rot.id, bookId)}
                onReplaceBook={(bookId) => handleReplaceBook(rot.id, bookId)}
                onAddRandom={(count) => handleAddRandom(rot.id, count)}
                onOpenAddModal={() => handleOpenAddModal(rot.id)}
                onToggleRead={(bookId) => handleToggleRead(rot.id, bookId)}
              />
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700">
          <p className="text-sm font-semibold text-forest-900 dark:text-white">
            No shelf rotations yet for {activeProfile?.name || 'this reader'}.
          </p>
          <p className="text-xs text-stone-ink dark:text-slate-400 mt-1 mb-3">
            Generate a new rotation shelf above or pick a curated preset.
          </p>
          <button
            type="button"
            onClick={() => setIsGeneratorOpen(true)}
            className="px-4 py-2 rounded-xl bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs"
          >
            New Shelf
          </button>
        </div>
      )}

      {/* Modal for replacing or adding books */}
      <RotationEditorModal
        modalMode={rotationEditor.modalMode}
        rotationId={rotationEditor.rotationId}
        targetBookId={rotationEditor.targetBookId}
        onClose={() =>
          setRotationEditor({ modalMode: null, rotationId: null, targetBookId: null })
        }
      />
    </div>
  );
};
