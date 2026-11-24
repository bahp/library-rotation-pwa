import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { findMatchingNewBooksForRotation } from '../../features/rotations/rotation-engine.js';
import { formatBookBinding } from '../../types/models.js';
import type { RotationRuleConfig, RotationShelf } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

interface RefreshRotationFromLibraryModalProps {
  rotation: RotationShelf | null;
  isOpen: boolean;
  rulesOverride?: Partial<RotationRuleConfig>;
  onClose: () => void;
}

export const RefreshRotationFromLibraryModal: React.FC<RefreshRotationFromLibraryModalProps> = ({
  rotation,
  isOpen,
  rulesOverride,
  onClose,
}) => {
  const { state, store, activeProfile, setInspectedBookId } = useApp();
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set());
  const [showOtherEligible, setShowOtherEligible] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useBodyScrollLock(isOpen && Boolean(rotation));

  const effectiveRules = useMemo(() => {
    if (!rotation) return null;
    return {
      ...rotation.rules,
      ...(rulesOverride || {}),
    };
  }, [rotation, rulesOverride]);

  const matchResult = useMemo(() => {
    if (!rotation) {
      return { matchingBooks: [], allEligibleBooks: [], hasExplicitRuleFilters: false };
    }
    const profile =
      state.profiles.find((p) => p.id === rotation.profileId) ||
      activeProfile ||
      state.profiles[0];
    if (!profile) {
      return { matchingBooks: [], allEligibleBooks: [], hasExplicitRuleFilters: false };
    }
    return findMatchingNewBooksForRotation({
      books: state.books,
      profile,
      rotation,
      rotations: state.rotations,
      rulesOverride,
    });
  }, [rotation, state.books, state.profiles, state.rotations, activeProfile, rulesOverride]);

  useEffect(() => {
    if (!isOpen || !rotation) return;
    // Pre-select up to 4 top rule matches that aren't in cooldown
    const preselected = matchResult.matchingBooks
      .filter((entry) => !entry.inCooldown)
      .slice(0, 4)
      .map((entry) => entry.book.id);
    setSelectedBookIds(new Set(preselected));
    setShowOtherEligible(matchResult.matchingBooks.length === 0);
  }, [isOpen, rotation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !rotation || !effectiveRules) return null;

  const coverAspect = state.settings?.coverAspectRatio || 'square';
  const strictIds = new Set(matchResult.matchingBooks.map((m) => m.book.id));
  const fallbackEligible = matchResult.allEligibleBooks.filter((m) => !strictIds.has(m.book.id));
  const displayedCandidates = showOtherEligible
    ? [...matchResult.matchingBooks, ...fallbackEligible.slice(0, 12)]
    : matchResult.matchingBooks;

  const toggleBook = (bookId: string) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    const ids = Array.from(selectedBookIds);
    if (ids.length === 0) return;
    setIsApplying(true);
    try {
      await store.refreshRotationFromRules(rotation.id, {
        mode: 'add-matches',
        bookIds: ids,
        rulesPatch: rulesOverride,
      });
      onClose();
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const handleRedrawUnread = async () => {
    setIsApplying(true);
    try {
      await store.refreshRotationFromRules(rotation.id, {
        mode: 'redraw-unread',
        rulesPatch: rulesOverride,
      });
      onClose();
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsApplying(false);
    }
  };

  const ruleSummaryParts: string[] = [];
  if (effectiveRules.preferredTags && effectiveRules.preferredTags.length > 0) {
    ruleSummaryParts.push(`Topics: ${effectiveRules.preferredTags.join(', ')}`);
  }
  if (effectiveRules.requiredFormat && effectiveRules.requiredFormat !== 'any') {
    ruleSummaryParts.push(`Binding: ${formatBookBinding(effectiveRules.requiredFormat)}`);
  }
  if (effectiveRules.objective) {
    ruleSummaryParts.push(effectiveRules.objective);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="refresh-library-modal-title"
      data-refresh-library-modal="true"
      className="sheet-backdrop fixed inset-0 z-[55] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-edge flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2
              id="refresh-library-modal-title"
              className="font-display text-lg font-semibold text-ink truncate"
            >
              Refresh from Library
            </h2>
            <p className="text-xs text-ink-secondary truncate mt-0.5">
              For <strong className="font-semibold text-ink">{rotation.title}</strong>
              {ruleSummaryParts.length > 0 ? ` · ${ruleSummaryParts.join(' · ')}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close refresh from library"
            className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {matchResult.matchingBooks.length > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">
                {matchResult.matchingBooks.length} matching{' '}
                {matchResult.matchingBooks.length === 1 ? 'book' : 'books'} found outside this shelf
              </p>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedBookIds(new Set(displayedCandidates.map((c) => c.book.id)))
                  }
                  className="font-semibold text-primary hover:underline cursor-pointer"
                >
                  Select all
                </button>
                {selectedBookIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedBookIds(new Set())}
                    className="font-semibold text-ink-secondary hover:text-ink cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-surface-subtle border border-edge-subtle p-3.5 space-y-1">
              <p className="text-xs font-semibold text-ink">
                No new off-shelf books match those exact tags or binding yet
              </p>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                {fallbackEligible.length > 0
                  ? 'You can still pick from other eligible library books below, or use Re-draw Unread to refresh unread slots.'
                  : 'All eligible books in your library are already on this rotation shelf.'}
              </p>
            </div>
          )}

          {displayedCandidates.length > 0 && (
            <div className="space-y-2">
              {displayedCandidates.map((entry) => {
                const { book, matchedReasons, inCooldown } = entry;
                const isStrictMatch = strictIds.has(book.id);
                const checked = selectedBookIds.has(book.id);
                const reasonLine =
                  matchedReasons.length > 0
                    ? matchedReasons.slice(0, 2).join(' · ')
                    : inCooldown
                      ? 'Recently rotated (cooldown)'
                      : formatBookBinding(book.format);

                return (
                  <div
                    key={book.id}
                    className={`rounded-xl border p-2.5 flex items-center gap-3 transition-colors ${
                      checked
                        ? 'bg-primary/6 border-primary/55'
                        : 'bg-surface-subtle border-edge-subtle hover:border-edge'
                    }`}
                  >
                    <input
                      type="checkbox"
                      id={`refresh-pick-${book.id}`}
                      checked={checked}
                      onChange={() => toggleBook(book.id)}
                      className="h-4 w-4 rounded accent-primary shrink-0 cursor-pointer"
                    />

                    <button
                      type="button"
                      onClick={() => setInspectedBookId(book.id)}
                      aria-label={`Inspect ${book.title}`}
                      className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-primary cursor-pointer"
                    >
                      <BookCover book={book} size="xs" aspectRatio={coverAspect} />
                    </button>

                    <label
                      htmlFor={`refresh-pick-${book.id}`}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="font-display text-sm font-semibold text-ink truncate">
                          {book.title}
                        </p>
                        {isStrictMatch && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
                            Match
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-secondary truncate">
                        {book.authors.join(', ')} · {formatBookBinding(book.format)}
                      </p>
                      <p className="text-[11px] text-ink-muted truncate mt-0.5">{reasonLine}</p>
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          {fallbackEligible.length > 0 && matchResult.matchingBooks.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOtherEligible((prev) => !prev)}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Icon
                name="chevronDown"
                className={`w-3.5 h-3.5 transition-transform ${showOtherEligible ? 'rotate-180' : ''}`}
              />
              <span>
                {showOtherEligible
                  ? 'Hide other library books'
                  : `Show ${fallbackEligible.length} other eligible library books`}
              </span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-edge bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={isApplying || matchResult.allEligibleBooks.length === 0}
            onClick={handleRedrawUnread}
            title="Keep already-read and picked books, and swap unread slots with fresh library matches"
            className="min-h-[42px] px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge disabled:opacity-45 text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icon name="refresh" className="w-3.5 h-3.5" />
            <span>Re-draw Unread</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-3.5 py-2 rounded-lg text-xs font-semibold text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApplying || selectedBookIds.size === 0}
              onClick={handleAddSelected}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-45 text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              <span>Add Selected ({selectedBookIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
