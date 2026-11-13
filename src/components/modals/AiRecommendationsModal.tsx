import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';

interface AiRecommendationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiRecommendationsModal: React.FC<AiRecommendationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { state, store, activeProfile } = useApp();

  const [activeGoal, setActiveGoal] = useState<'gaps' | 'similar-favorites' | 'next-stage' | 'custom'>('gaps');
  const [customPrompt, setCustomPrompt] = useState('');
  const [count, setCount] = useState(4);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await store.generateLibraryRecommendationsWithLlm({
        goal: activeGoal,
        customPrompt,
        count,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToWishlist = async (rec: any) => {
    try {
      await store.addRecommendedBookToWishlist(rec, activeProfile?.id);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const recs = state.aiRecommendations || [];
  const existingTitles = new Set(state.books.map((b) => b.title.trim().toLowerCase()));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-recs-modal-title"
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
              <h2 id="ai-recs-modal-title" className="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                Smart Library Recommendations
              </h2>
              <p className="text-[11px] text-stone-ink dark:text-slate-400">
                Finding tailored book suggestions for {activeProfile?.name || 'Reader'}
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
          {/* Goal Selector */}
          <div className="space-y-2">
            <label className="block font-bold text-forest-900 dark:text-white uppercase tracking-wider text-[11px]">
              Recommendation Goal
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'gaps', label: 'Fill Missing Gaps' },
                { id: 'similar-favorites', label: 'Similar to Loved' },
                { id: 'next-stage', label: 'Next Stage Prep' },
                { id: 'custom', label: 'Custom Prompt' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setActiveGoal(opt.id as any)}
                  className={`p-2 rounded-xl text-xs font-semibold text-center transition-colors ${
                    activeGoal === opt.id
                      ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
                      : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 text-stone-700 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {activeGoal === 'custom' && (
              <div className="pt-2">
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g. Books that teach sharing, poetry, or early phonics"
                  className="w-full px-3.5 py-2 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-700"
                />
              </div>
            )}

            <div className="pt-1 flex items-center justify-between">
              <span className="text-stone-ink dark:text-slate-400 text-[11px]">
                Ask for {count} recommendations
              </span>
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Generating…' : 'Discover Books'}</span>
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-3 border-forest-200 border-t-forest-700 dark:border-night-700 dark:border-t-[#5ED3DA] animate-spin" />
              <p className="text-sm font-semibold text-forest-900 dark:text-white">
                Discovering targeted titles based on your library…
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Results List */}
          {recs.length > 0 && !isLoading && (
            <div className="space-y-3 pt-2">
              <h3 className="font-display font-bold text-sm text-forest-900 dark:text-white">
                Suggested Books
              </h3>

              <div className="space-y-2.5">
                {recs.map((rec, i) => {
                  const alreadySaved = existingTitles.has(rec.title.trim().toLowerCase());

                  return (
                    <div
                      key={`${rec.title}-${i}`}
                      className="p-3 rounded-xl bg-white dark:bg-night-800/80 border border-linen-200 dark:border-night-700 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-display font-bold text-sm text-forest-900 dark:text-white">
                            {rec.title}
                          </h4>
                          {rec.ageRange && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-linen-100 dark:bg-night-700 text-stone-600 dark:text-slate-300">
                              {rec.ageRange}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                          by {rec.author || 'Unknown'}
                        </p>

                        {rec.reason && (
                          <p className="text-xs text-stone-700 dark:text-slate-300 mt-1 leading-relaxed">
                            {rec.reason}
                          </p>
                        )}

                        {rec.gapFilled && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-teal-700 dark:text-[#5ED3DA]">
                            Fills gap: {rec.gapFilled}
                          </span>
                        )}
                      </div>

                      <div className="shrink-0 pt-0.5">
                        {alreadySaved ? (
                          <span className="px-2.5 py-1 rounded-lg bg-linen-100 dark:bg-night-700 text-stone-500 dark:text-slate-400 text-xs font-medium">
                            In Library
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddToWishlist(rec)}
                            className="px-3 py-1.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-semibold text-xs flex items-center gap-1 transition-colors shadow-2xs"
                          >
                            <Icon name="bookmark" className="w-3.5 h-3.5" />
                            <span>Wishlist</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
