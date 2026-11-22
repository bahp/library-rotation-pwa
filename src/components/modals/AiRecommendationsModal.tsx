import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { AiListSkeleton } from '../common/SkeletonLoaders.js';

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

  useBodyScrollLock(isOpen);

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
            <span className="w-8 h-8 rounded-lg bg-surface-subtle border border-edge-subtle text-primary dark:text-accent flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="ai-recs-modal-title" className="font-display text-base sm:text-lg font-semibold text-ink">
                Smart Library Recommendations
              </h2>
              <p className="text-[11px] text-ink-secondary">
                Finding tailored book suggestions for {activeProfile?.name || 'Reader'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[48px] min-w-[48px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated flex items-center justify-center active:scale-95 transition-all"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Goal Selector */}
          <div className="space-y-2">
            <label className="block font-semibold text-ink-muted uppercase tracking-wider text-[11px]">
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
                  className={`min-h-[48px] sm:min-h-0 p-2 rounded-lg text-xs font-semibold text-center transition-all active:scale-[0.98] ${
                    activeGoal === opt.id
                      ? 'bg-primary text-primary-fg shadow-xs'
                      : 'bg-surface-subtle hover:bg-surface-elevated border border-edge-subtle text-ink-secondary'
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
                  className="w-full px-3.5 py-2 rounded-lg bg-surface-subtle border border-edge text-ink placeholder:text-ink-muted text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            <div className="pt-1 flex items-center justify-between">
              <span className="text-ink-secondary text-[11px]">
                Ask for {count} recommendations
              </span>
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isLoading}
                className="min-h-[48px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98] disabled:opacity-55"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Generating…' : 'Discover Books'}</span>
              </button>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-2 py-2">
              <p className="text-xs font-semibold text-ink px-1">
                Discovering targeted titles based on your library…
              </p>
              <AiListSkeleton rows={count} showHeaderBanner={false} />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/35 text-xs text-danger">
              {error}
            </div>
          )}

          {/* Results List */}
          {recs.length > 0 && !isLoading && (
            <div className="space-y-3 pt-2">
              <h3 className="font-display font-semibold text-base text-ink">
                Suggested Books
              </h3>

              <div className="space-y-2.5">
                {recs.map((rec, i) => {
                  const alreadySaved = existingTitles.has(rec.title.trim().toLowerCase());

                  return (
                    <div
                      key={`${rec.title}-${i}`}
                      className="p-3.5 rounded-xl bg-surface-subtle border border-edge flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-display font-semibold text-base text-ink leading-snug">
                            {rec.title}
                          </h4>
                          {rec.ageRange && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-surface-elevated border border-edge-subtle text-ink-secondary font-mono-tabular">
                              {rec.ageRange}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-ink-secondary mt-0.5">
                          by {rec.author || 'Unknown'}
                        </p>

                        {rec.reason && (
                          <p className="text-xs text-ink mt-1 leading-relaxed">
                            {rec.reason}
                          </p>
                        )}

                        {rec.gapFilled && (
                          <span className="inline-block mt-1 text-[10px] font-semibold text-accent">
                            Fills gap: {rec.gapFilled}
                          </span>
                        )}
                      </div>

                      <div className="shrink-0 pt-0.5">
                        {alreadySaved ? (
                          <span className="px-2.5 py-1 rounded-lg bg-surface-elevated border border-edge-subtle text-ink-muted text-xs font-medium">
                            In Library
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddToWishlist(rec)}
                            className="min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
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
