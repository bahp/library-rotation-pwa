import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { AiListSkeleton } from '../common/SkeletonLoaders.js';

interface AiCuratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiCuratorModal: React.FC<AiCuratorModalProps> = ({ isOpen, onClose }) => {
  const { state, store, activeProfile } = useApp();

  const [objective, setObjective] = useState('Bedtime routines, lullabies & calming stories');
  const [bookCount, setBookCount] = useState(5);
  const [isCurating, setIsCurating] = useState(false);
  const [error, setError] = useState('');
  const [curatorPlan, setCuratorPlan] = useState<{
    rotationTitle?: string;
    rationale?: string;
    selectedBooks?: Array<{ bookId: string; reason: string }>;
  } | null>(null);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleCurate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!objective.trim()) {
      setError('Please enter a shelf objective.');
      return;
    }

    setIsCurating(true);
    setError('');

    try {
      const plan = await store.curateRotationWithLlm({
        objective,
        count: bookCount,
      });
      setCuratorPlan(plan);
      const ids = Array.isArray(plan.selectedBooks)
        ? plan.selectedBooks.map((s) => s.bookId).filter(Boolean)
        : [];
      setSelectedBookIds(new Set(ids));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCurating(false);
    }
  };

  const handleToggleBook = (id: string) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveRotation = async (setActive: boolean) => {
    if (!curatorPlan || selectedBookIds.size === 0) return;
    try {
      await store.saveCuratedRotation({
        title: curatorPlan.rotationTitle || 'Curated Rotation',
        objective,
        bookIds: Array.from(selectedBookIds),
        setActive,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const bookMap = new Map(state.books.map((b) => [b.id, b]));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-curator-modal-title"
      className="sheet-backdrop fixed inset-0 z-[70] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden" />
        {/* Header */}
        <div className="px-5 pt-3.5 pb-2.5 border-b border-edge-subtle flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="ai-curator-modal-title" className="font-display text-lg font-semibold text-ink">
                AI Rotation Shelf Curator
              </h2>
              <p className="text-[11px] text-ink-secondary">
                Curating shelf for {activeProfile?.name || 'Reader'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Query Form */}
          <form onSubmit={handleCurate} className="space-y-3 bg-surface-subtle p-3.5 rounded-xl border border-edge">
            <div>
              <label className="block font-semibold text-ink-muted uppercase tracking-[0.08em] text-[11px] mb-1">
                Shelf Theme or Objective
              </label>
              <ClearableInput
                id="ai-curator-objective-input"
                value={objective}
                onValueChange={setObjective}
                placeholder="e.g. Bedtime routines, dinosaurs, seasons, emotional resilience"
                className="px-3.5 py-2 rounded-lg bg-canvas border border-edge text-xs text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-primary"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="font-semibold text-ink text-xs">
                  Books to pick:
                </label>
                <select
                  value={bookCount}
                  onChange={(e) => setBookCount(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg bg-canvas border border-edge text-xs font-semibold text-ink"
                >
                  {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} books
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isCurating}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>{isCurating ? 'Curating Shelf…' : 'Generate Shelf Plan'}</span>
              </button>
            </div>
          </form>

          {isCurating && (
            <div className="space-y-2 py-2">
              <p className="text-xs font-semibold text-ink px-1">
                Reading your library and building custom shelf…
              </p>
              <AiListSkeleton rows={Math.min(Math.max(bookCount, 3), 5)} />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/35 text-xs text-danger">
              {error}
            </div>
          )}

          {curatorPlan && !isCurating && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-lg bg-secondary/12 border border-secondary/35">
                <h3 className="font-display font-semibold text-base text-ink">
                  {curatorPlan.rotationTitle || 'Recommended Rotation'}
                </h3>
                {curatorPlan.rationale && (
                  <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                    {curatorPlan.rationale}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {curatorPlan.selectedBooks?.map((slot) => {
                  const book = bookMap.get(slot.bookId);
                  if (!book) return null;
                  const isChecked = selectedBookIds.has(book.id);

                  return (
                    <div
                      key={book.id}
                      onClick={() => handleToggleBook(book.id)}
                      className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-primary bg-surface-elevated/60'
                          : 'border-edge opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <BookCover book={book} size="sm" aspectRatio="portrait" />
                        <div className="min-w-0">
                          <h4 className="font-display text-sm font-semibold text-ink truncate">
                            {book.title}
                          </h4>
                          <p className="text-[11px] text-ink-secondary truncate">
                            {book.authors[0]}
                          </p>
                          <p className="text-[10px] text-primary mt-0.5 line-clamp-1">
                            {slot.reason}
                          </p>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleBook(book.id)}
                        className="w-4 h-4 rounded accent-primary shrink-0"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {curatorPlan && !isCurating && (
          <div className="p-4 border-t border-edge-subtle flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleSaveRotation(false)}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink font-semibold text-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              Save Shelf
            </button>
            <button
              type="button"
              onClick={() => handleSaveRotation(true)}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shadow-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              Activate Shelf Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
