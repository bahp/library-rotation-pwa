import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { RotationShelfCard } from '../cards/RotationShelfCard.js';
import { RotationEditorModal } from '../modals/RotationEditorModal.js';
import { PresetsView } from './PresetsView.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { formatProfileAgeLabel, isBookRotatable } from '../../types/models.js';
import type { BookFormat } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

export const RotationsView: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    activeRotation,
    currentRoute,
    navigate,
    routeParams,
    rotationEditor,
    setRotationEditor,
    setAiCuratorModal,
  } = useApp();

  const isPresetsTab = currentRoute === 'presets';

  const editParamId = routeParams.get('edit');
  const [editingShelfId, setEditingShelfId] = useState<string | null>(() => editParamId);

  useEffect(() => {
    setEditingShelfId(editParamId || null);
  }, [editParamId]);

  const showMiniWizards = state.settings?.showMiniWizards !== false;
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const [wizardMode, setWizardMode] = useState<boolean>(showMiniWizards);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [targetStatus, setTargetStatus] = useState<'active' | 'saved'>('active');
  const [bookCount, setBookCount] = useState(activeProfile?.defaultRotationSize || 5);
  const [swapDays, setSwapDays] = useState(14);
  const [format, setFormat] = useState<BookFormat | 'any'>('any');
  const [preferredTags, setPreferredTags] = useState('');
  const [cooldownDays, setCooldownDays] = useState(activeProfile?.cooldownDays ?? 14);
  const [varietyMix, setVarietyMix] = useState(true);
  const [seed, setSeed] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useBodyScrollLock(isGeneratorOpen && isMobileViewport);

  const savedRotations = state.rotations.filter(
    (r) => r.profileId === activeProfile?.id && r.status !== 'active'
  );

  const orderedRotations = activeRotation
    ? [activeRotation, ...savedRotations]
    : savedRotations;

  const topLibraryTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of state.books) {
      for (const raw of book.tags || []) {
        const tag = String(raw || '').trim().toLowerCase();
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [state.books]);

  const rotatableLibraryCount = useMemo(
    () => state.books.filter((b) => isBookRotatable(b)).length,
    [state.books]
  );

  const selectedTagList = useMemo(
    () =>
      preferredTags
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [preferredTags]
  );

  const toggleSuggestedTag = (tag: string) => {
    const lower = tag.toLowerCase();
    const next = selectedTagList.includes(lower)
      ? selectedTagList.filter((t) => t !== lower)
      : [...selectedTagList, lower];
    setPreferredTags(next.join(', '));
  };

  const openGenerator = () => {
    setWizardMode(state.settings?.showMiniWizards !== false);
    setWizardStep(1);
    setTargetStatus('active');
    setIsGeneratorOpen((prev) => !prev);
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
        status: targetStatus,
        count: Number(bookCount),
        swapDays: Number(swapDays),
        requiredFormat: format,
        preferredTags: tagsList,
        cooldownDays: Number(cooldownDays),
        varietyMix,
        seed: seed.trim() || undefined,
      });

      setIsGeneratorOpen(false);
      setWizardStep(1);
      setTargetStatus('active');
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
    <div className="space-y-5 text-left max-w-6xl mx-auto">
      {/* Unified Header + Segmented Control (My Shelves | Collection Presets) */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            {activeProfile
              ? `${activeProfile.name} · ${formatProfileAgeLabel(activeProfile)}`
              : 'Book Rotations'}
          </p>
          <h1 className="font-display text-3xl sm:text-[34px] font-semibold tracking-tight text-ink leading-tight mt-0.5">
            Book Rotations
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Unified Segmented Control */}
          <div
            role="tablist"
            aria-label="Rotation workspace views"
            className="inline-flex items-center p-1 rounded-xl bg-surface-subtle border border-edge"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isPresetsTab}
              onClick={() => navigate('rotations')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                !isPresetsTab
                  ? 'bg-surface text-ink shadow-2xs'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              My Shelves ({orderedRotations.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isPresetsTab}
              onClick={() => navigate('presets')}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isPresetsTab
                  ? 'bg-surface text-ink shadow-2xs'
                  : 'text-ink-secondary hover:text-ink'
              }`}
            >
              Collection Presets
            </button>
          </div>

          {!isPresetsTab && (
            <>
              <button
                type="button"
                onClick={() => setAiCuratorModal({ isOpen: true })}
                className="min-h-[42px] px-3.5 py-2 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-ink font-semibold text-xs inline-flex items-center gap-1.5 shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5 text-accent" />
                <span>AI Curator</span>
              </button>

              <button
                type="button"
                onClick={openGenerator}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap cursor-pointer"
              >
                <Icon name={isGeneratorOpen ? 'close' : 'plus'} className="w-4 h-4" />
                <span>{isGeneratorOpen ? 'Close' : 'New Shelf'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {isPresetsTab ? (
        <PresetsView embedded />
      ) : (
        <>
          {/* New Shelf Generator: Slide-up Bottom Sheet on Mobile (< sm), Inline Card on Tablet/Desktop */}
          {isGeneratorOpen && (
            <div
              role={isMobileViewport ? 'dialog' : undefined}
              aria-modal={isMobileViewport ? 'true' : undefined}
              aria-labelledby="new-shelf-generator-title"
              onClick={() => {
                if (isMobileViewport) setIsGeneratorOpen(false);
              }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center p-0 overflow-hidden sm:static sm:inset-auto sm:z-auto sm:bg-transparent sm:backdrop-blur-none sm:block"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="animate-sheet-up sm:animate-none w-full max-h-[90dvh] sm:max-h-none flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl sm:lr-card overflow-hidden pb-safe sm:pb-0"
              >
                <div
                  className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
                  aria-hidden="true"
                />
                <div className="px-4 sm:px-5 py-3.5 border-b border-edge-subtle flex items-center justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <h2
                      id="new-shelf-generator-title"
                      className="font-display text-lg sm:text-xl font-semibold text-ink truncate"
                    >
                      {wizardMode
                        ? `Create Shelf · Step ${wizardStep} of 3`
                        : 'Generate Shelf Rotation'}
                    </h2>
                    <p className="text-xs text-ink-secondary truncate">
                      Reader: <strong>{activeProfile?.name || 'Reader'}</strong> ·{' '}
                      {rotatableLibraryCount} rotatable books available
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setWizardMode((prev) => !prev)}
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap cursor-pointer"
                    >
                      {wizardMode ? 'Full Form' : 'Guided Wizard'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsGeneratorOpen(false)}
                      aria-label="Close new shelf panel"
                      className="min-h-[44px] min-w-[44px] rounded-lg text-ink-secondary hover:bg-surface-elevated flex items-center justify-center sm:hidden cursor-pointer"
                    >
                      <Icon name="close" className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                  {wizardMode ? (
                    <div className="space-y-4">
                      {/* Step 1: Theme & Focus */}
                      {wizardStep === 1 && (
                        <div className="space-y-3.5 text-xs">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block font-semibold text-ink mb-1">
                                Shelf Title
                              </label>
                              <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={`e.g. ${activeProfile?.name || 'Reader'}’s Cozy Bedtime Shelf`}
                                className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-ink mb-1">
                                Objective / Mood (Optional)
                              </label>
                              <ClearableInput
                                value={objective}
                                onValueChange={setObjective}
                                placeholder="e.g. hardcover + bedtime & winter stories"
                                className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted"
                              />
                            </div>
                          </div>

                          {topLibraryTags.length > 0 && (
                            <div>
                              <p className="font-semibold text-ink mb-1.5">
                                Pick Topics from Your Library
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {topLibraryTags.map((tag) => {
                                  const active = selectedTagList.includes(tag);
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() => toggleSuggestedTag(tag)}
                                      aria-pressed={active}
                                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                        active
                                          ? 'bg-primary text-primary-fg'
                                          : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
                                      }`}
                                    >
                                      #{tag}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block font-semibold text-ink-secondary mb-1">
                              Or Enter Custom Topics (comma-separated)
                            </label>
                            <input
                              type="text"
                              value={preferredTags}
                              onChange={(e) => setPreferredTags(e.target.value)}
                              placeholder="animals, space, seasons"
                              className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-ink placeholder:text-ink-muted"
                            />
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={() => setIsGeneratorOpen(false)}
                              className="min-h-[44px] sm:min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold text-ink-secondary hover:bg-surface-elevated cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => setWizardStep(2)}
                              className="min-h-[44px] sm:min-h-[40px] px-5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>Next: Rules &amp; Pacing</span>
                              <Icon name="chevronRight" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Rules & Pacing */}
                      {wizardStep === 2 && (
                        <div className="space-y-3.5 text-xs">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block font-semibold text-ink-secondary mb-1">
                                Books on Shelf
                              </label>
                              <input
                                type="number"
                                min={2}
                                max={20}
                                value={bookCount}
                                onChange={(e) => setBookCount(Number(e.target.value))}
                                className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-semibold font-mono-tabular text-ink"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-ink-secondary mb-1">
                                Swap Cycle (Days)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={90}
                                value={swapDays}
                                onChange={(e) => setSwapDays(Number(e.target.value))}
                                className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-semibold font-mono-tabular text-ink"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-ink-secondary mb-1">
                                Cooldown (Days)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={90}
                                value={cooldownDays}
                                onChange={(e) => setCooldownDays(Number(e.target.value))}
                                className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-semibold font-mono-tabular text-ink"
                              />
                            </div>
                            <div>
                              <label className="block font-semibold text-ink-secondary mb-1">
                                Binding Format
                              </label>
                              <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value as any)}
                                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold text-ink"
                              >
                                <option value="any">Any Format</option>
                                <option value="hardcover">Hardcover Only</option>
                                <option value="board-book">Board Book Only</option>
                                <option value="paperback">Paperback Only</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                            <div>
                              <label className="block font-semibold text-ink-secondary mb-1">
                                Deterministic Seed (Optional)
                              </label>
                              <input
                                type="text"
                                value={seed}
                                onChange={(e) => setSeed(e.target.value)}
                                placeholder="Repeatable PRNG seed string"
                                className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-mono text-ink placeholder:text-ink-muted"
                              />
                            </div>
                            <div className="pt-2 sm:pt-4">
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={varietyMix}
                                  onChange={(e) => setVarietyMix(e.target.checked)}
                                  className="w-4 h-4 rounded accent-[var(--primary)]"
                                />
                                <span className="font-semibold text-ink">
                                  Enforce author &amp; topic variety mix
                                </span>
                              </label>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              type="button"
                              onClick={() => setWizardStep(1)}
                              className="min-h-[44px] sm:min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer"
                            >
                              ← Back
                            </button>
                            <button
                              type="button"
                              onClick={() => setWizardStep(3)}
                              className="min-h-[44px] sm:min-h-[40px] px-5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>Review &amp; Generate</span>
                              <Icon name="chevronRight" className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Step 3: Review & Generate */}
                      {wizardStep === 3 && (
                        <div className="space-y-4 text-xs">
                          <div className="rounded-lg bg-surface-subtle border border-edge p-4 space-y-1.5">
                            <p className="font-display text-base font-semibold text-ink">
                              {title.trim() || `${activeProfile?.name || 'Reader'}’s Shelf Rotation`}
                            </p>
                            {objective.trim() && (
                              <p className="text-ink-secondary">{objective.trim()}</p>
                            )}
                            <p className="font-mono-tabular text-ink-secondary">
                              {bookCount} books · {swapDays}d cycle · {cooldownDays}d cooldown ·{' '}
                              {format === 'any' ? 'Any format' : format}
                            </p>
                            {selectedTagList.length > 0 && (
                              <p className="text-primary">
                                Topics: {selectedTagList.map((t) => `#${t}`).join(' · ')}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="font-semibold text-ink mb-1.5">
                              Create as Active or Saved Shelf
                            </p>
                            <div
                              role="radiogroup"
                              aria-label="New shelf initial state"
                              className="grid grid-cols-2 p-1 rounded-lg bg-surface-subtle border border-edge"
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={targetStatus === 'active'}
                                onClick={() => setTargetStatus('active')}
                                className={`min-h-[38px] rounded-md font-semibold transition-colors cursor-pointer ${
                                  targetStatus === 'active'
                                    ? 'bg-primary text-primary-fg shadow-2xs'
                                    : 'text-ink-secondary hover:text-ink'
                                }`}
                              >
                                Active Shelf Now
                              </button>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={targetStatus === 'saved'}
                                onClick={() => setTargetStatus('saved')}
                                className={`min-h-[38px] rounded-md font-semibold transition-colors cursor-pointer ${
                                  targetStatus === 'saved'
                                    ? 'bg-surface text-ink shadow-2xs'
                                    : 'text-ink-secondary hover:text-ink'
                                }`}
                              >
                                Saved (Inactive)
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setWizardStep(2)}
                              className="min-h-[44px] sm:min-h-[40px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer"
                            >
                              ← Back
                            </button>
                            <button
                              type="button"
                              disabled={isGenerating}
                              onClick={() => handleGenerate()}
                              className="min-h-[44px] px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                            >
                              {isGenerating
                                ? 'Generating Shelf…'
                                : targetStatus === 'active'
                                  ? 'Generate & Activate Shelf'
                                  : 'Generate & Save Shelf'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Full Classic Power-User Form */
                    <form onSubmit={handleGenerate} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Shelf Title
                          </label>
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={`e.g. ${activeProfile?.name || 'Reader'}’s Winter Shelf`}
                            className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-ink placeholder:text-ink-muted"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Objective / Natural Language Rules
                          </label>
                          <ClearableInput
                            value={objective}
                            onValueChange={setObjective}
                            placeholder="e.g. hardcover + bedtime & winter stories"
                            className="h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-ink placeholder:text-ink-muted"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Number of Books
                          </label>
                          <input
                            type="number"
                            min={2}
                            max={20}
                            value={bookCount}
                            onChange={(e) => setBookCount(Number(e.target.value))}
                            className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-semibold font-mono-tabular text-ink"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Binding Format Filter
                          </label>
                          <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value as any)}
                            className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-semibold text-ink"
                          >
                            <option value="any">Any Binding Format</option>
                            <option value="hardcover">Hardcover Only</option>
                            <option value="board-book">Board Book Only</option>
                            <option value="paperback">Paperback Only</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Preferred Topics (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={preferredTags}
                            onChange={(e) => setPreferredTags(e.target.value)}
                            placeholder="e.g. animals, bedtime, space"
                            className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-ink placeholder:text-ink-muted"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block font-semibold text-ink-secondary mb-1">
                              Swap Cycle (d)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={90}
                              value={swapDays}
                              onChange={(e) => setSwapDays(Number(e.target.value))}
                              className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold font-mono-tabular text-ink"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-ink-secondary mb-1">
                              Cooldown (d)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={90}
                              value={cooldownDays}
                              onChange={(e) => setCooldownDays(Number(e.target.value))}
                              className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold font-mono-tabular text-ink"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Deterministic Seed (Optional)
                          </label>
                          <input
                            type="text"
                            value={seed}
                            onChange={(e) => setSeed(e.target.value)}
                            placeholder="Repeatable PRNG seed string"
                            className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge font-mono text-ink placeholder:text-ink-muted"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold text-ink-secondary mb-1">
                            Initial Shelf State
                          </label>
                          <div
                            role="radiogroup"
                            aria-label="New shelf initial state"
                            className="grid grid-cols-2 p-1 rounded-lg bg-surface-subtle border border-edge h-11"
                          >
                            <button
                              type="button"
                              role="radio"
                              aria-checked={targetStatus === 'active'}
                              onClick={() => setTargetStatus('active')}
                              className={`rounded-md font-semibold transition-colors cursor-pointer ${
                                targetStatus === 'active'
                                  ? 'bg-primary text-primary-fg shadow-2xs'
                                  : 'text-ink-secondary hover:text-ink'
                              }`}
                            >
                              Active Shelf
                            </button>
                            <button
                              type="button"
                              role="radio"
                              aria-checked={targetStatus === 'saved'}
                              onClick={() => setTargetStatus('saved')}
                              className={`rounded-md font-semibold transition-colors cursor-pointer ${
                                targetStatus === 'saved'
                                  ? 'bg-surface text-ink shadow-2xs'
                                  : 'text-ink-secondary hover:text-ink'
                              }`}
                            >
                              Saved (Inactive)
                            </button>
                          </div>
                        </div>

                        <div className="sm:col-span-2 pt-1">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={varietyMix}
                              onChange={(e) => setVarietyMix(e.target.checked)}
                              className="w-4 h-4 rounded accent-[var(--primary)]"
                            />
                            <span className="font-semibold text-ink">
                              Enforce author &amp; topic variety mix
                            </span>
                          </label>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsGeneratorOpen(false)}
                          className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-lg text-ink-secondary hover:bg-surface-elevated text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isGenerating}
                          className="min-h-[44px] sm:min-h-[40px] px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                        >
                          {isGenerating
                            ? 'Generating Shelf…'
                            : targetStatus === 'active'
                              ? 'Generate & Activate Shelf'
                              : 'Generate & Save Shelf'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Shelves List */}
          {orderedRotations.length > 0 ? (
            <div className="space-y-4">
              {orderedRotations.map((rot) => {
                const isActive = rot.status === 'active';
                return (
                  <RotationShelfCard
                    key={rot.id}
                    rotation={rot}
                    books={state.books}
                    isActive={isActive}
                    isEditorOpen={editingShelfId === rot.id}
                    onOpenEditor={() => setEditingShelfId(rot.id)}
                    onCloseEditor={() => {
                      setEditingShelfId(null);
                      if (routeParams.get('edit')) {
                        navigate('rotations');
                      }
                    }}
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
            <div className="p-8 text-center rounded-xl bg-surface border border-edge space-y-3 lr-card">
              <BotanicalIllustration variant="empty-shelf" className="w-40 h-auto mx-auto" />
              <h2 className="font-display text-xl font-semibold text-ink">
                No shelf rotations yet for {activeProfile?.name || 'this reader'}.
              </h2>
              <p className="text-xs text-ink-secondary max-w-sm mx-auto">
                Create a custom rotation shelf or pick a seasonal Collection Preset in one tap.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={openGenerator}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs transition-colors cursor-pointer"
                >
                  New Shelf
                </button>
                <button
                  type="button"
                  onClick={() => navigate('presets')}
                  className="min-h-[42px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink font-semibold text-xs cursor-pointer transition-colors"
                >
                  Browse Presets
                </button>
              </div>
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
        </>
      )}
    </div>
  );
};
