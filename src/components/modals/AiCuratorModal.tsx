import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import { ClearableInput } from '../common/ClearableInput.js';

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
      className="sheet-backdrop fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-3.5 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="ai-curator-modal-title" className="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                AI Rotation Shelf Curator
              </h2>
              <p className="text-[11px] text-stone-ink dark:text-slate-400">
                Curating shelf for {activeProfile?.name || 'Reader'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Query Form */}
          <form onSubmit={handleCurate} className="space-y-3 bg-linen-50 dark:bg-night-800/60 p-3.5 rounded-2xl border border-linen-200/80 dark:border-night-700">
            <div>
              <label className="block font-bold text-forest-900 dark:text-white uppercase tracking-wider text-[11px] mb-1">
                Shelf Theme or Objective
              </label>
              <ClearableInput
                id="ai-curator-objective-input"
                value={objective}
                onValueChange={setObjective}
                placeholder="e.g. Bedtime routines, dinosaurs, seasons, emotional resilience"
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-700"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <label className="font-bold text-forest-900 dark:text-white text-xs">
                  Books to pick:
                </label>
                <select
                  value={bookCount}
                  onChange={(e) => setBookCount(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-xs font-semibold"
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
                className="px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>{isCurating ? 'Curating Shelf…' : 'Generate Shelf Plan'}</span>
              </button>
            </div>
          </form>

          {isCurating && (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-3 border-forest-200 border-t-forest-700 dark:border-night-700 dark:border-t-[#5ED3DA] animate-spin" />
              <p className="text-sm font-semibold text-forest-900 dark:text-white">
                Reading your library and building custom shelf…
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {curatorPlan && !isCurating && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-forest-50 dark:bg-forest-950/40 border border-forest-200 dark:border-forest-800/70">
                <h3 className="font-display font-bold text-sm text-forest-900 dark:text-white">
                  {curatorPlan.rotationTitle || 'Recommended Rotation'}
                </h3>
                {curatorPlan.rationale && (
                  <p className="text-xs text-forest-800 dark:text-slate-300 mt-1 leading-relaxed">
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
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-forest-700 dark:border-[#5ED3DA] bg-forest-700/5 dark:bg-[#5ED3DA]/10'
                          : 'border-linen-200 dark:border-night-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <BookCover book={book} size="sm" aspectRatio="portrait" />
                        <div className="min-w-0">
                          <h4 className="font-display text-xs font-bold text-forest-900 dark:text-white truncate">
                            {book.title}
                          </h4>
                          <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate">
                            {book.authors[0]}
                          </p>
                          <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 line-clamp-1">
                            {slot.reason}
                          </p>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleBook(book.id)}
                        className="w-4 h-4 rounded text-forest-700 shrink-0"
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
          <div className="p-4 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleSaveRotation(false)}
              className="px-3.5 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 text-stone-800 dark:text-white font-semibold text-xs"
            >
              Save Shelf
            </button>
            <button
              type="button"
              onClick={() => handleSaveRotation(true)}
              className="px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shadow-xs"
            >
              Activate Shelf Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
