import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { formatBookBinding } from '../../types/models.js';
import type { Book, RotationShelf } from '../../types/models.js';

interface ShelfPlacementModalProps {
  rotation: RotationShelf | null;
  isOpen: boolean;
  onClose: () => void;
}

type PlacementFilter = 'all' | 'remaining' | 'completed';

export const ShelfPlacementModal: React.FC<ShelfPlacementModalProps> = ({
  rotation,
  isOpen,
  onClose,
}) => {
  const { state, store } = useApp();
  const [filter, setFilter] = useState<PlacementFilter>('all');

  const coverAspect = state.settings?.coverAspectRatio || 'portrait';

  const shelfBooks = useMemo(() => {
    if (!rotation) return [];
    const bookMap = new Map(state.books.map((b: Book) => [b.id, b]));
    return rotation.bookIds
      .map((id: string) => bookMap.get(id))
      .filter((b): b is Book => Boolean(b));
  }, [rotation, state.books]);

  if (!isOpen || !rotation) return null;

  const placedSet = new Set(rotation.placedBookIds || []);
  const readSet = new Set(rotation.completedBookIds || []);
  const pickedSet = new Set(rotation.pickedBookIds || []);

  const validBookIds = shelfBooks.map((b) => b.id);
  const placedCount = validBookIds.filter((id) => placedSet.has(id)).length;
  const completedIds = validBookIds.filter((id) => readSet.has(id) || pickedSet.has(id));
  const completedCount = completedIds.length;
  const remainingCount = validBookIds.filter((id) => !placedSet.has(id)).length;
  const progressPct =
    validBookIds.length > 0 ? Math.round((placedCount / validBookIds.length) * 100) : 0;

  const filteredBooks = shelfBooks.filter((book) => {
    if (filter === 'remaining') return !placedSet.has(book.id);
    if (filter === 'completed') return readSet.has(book.id) || pickedSet.has(book.id);
    return true;
  });

  const handleTogglePlaced = async (bookId: string) => {
    await store.toggleRotationBookPlaced(rotation.id, bookId);
  };

  const handleCheckCompleted = async () => {
    const next = Array.from(new Set([...(rotation.placedBookIds || []), ...completedIds]));
    await store.setRotationBooksPlaced(rotation.id, next);
  };

  const handleCheckAll = async () => {
    await store.setRotationBooksPlaced(rotation.id, validBookIds);
  };

  const handleClearAll = async () => {
    await store.setRotationBooksPlaced(rotation.id, []);
  };

  const allCompletedChecked =
    completedIds.length > 0 && completedIds.every((id) => placedSet.has(id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shelf-placement-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <div
          className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="px-5 pt-3.5 pb-3 border-b border-linen-200 dark:border-night-800 space-y-2.5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA]">
                Shelf Placement Helper
              </p>
              <h2
                id="shelf-placement-title"
                className="font-display text-lg font-bold text-forest-900 dark:text-white leading-tight truncate mt-0.5"
              >
                {rotation.title}
              </h2>
              <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5 font-mono-tabular">
                {placedCount} of {shelfBooks.length} checked · {completedCount} completed
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close shelf placement checklist"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 transition-colors shrink-0"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-linen-200/80 dark:bg-night-800 overflow-hidden">
            <div
              className="h-full bg-forest-700 dark:bg-[#5ED3DA] transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {(
              [
                { id: 'all', label: `All (${shelfBooks.length})` },
                { id: 'remaining', label: `To Do (${remainingCount})` },
                { id: 'completed', label: `Completed (${completedCount})` },
              ] as const
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  aria-pressed={active}
                  className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                      : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-ink dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fast Single-Tap Checklist */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2">
          {filteredBooks.length > 0 ? (
            filteredBooks.map((book) => {
              const isPlaced = placedSet.has(book.id);
              const isRead = readSet.has(book.id);
              const isPicked = pickedSet.has(book.id);
              const primaryAuthor = book.authors[0] || 'Unknown Author';

              const statusTag =
                isPicked && isRead
                  ? 'Picked & Read'
                  : isPicked
                    ? 'Picked'
                    : isRead
                      ? 'Read'
                      : null;

              return (
                <button
                  key={book.id}
                  type="button"
                  data-placement-book-id={book.id}
                  aria-pressed={isPlaced}
                  onClick={() => handleTogglePlaced(book.id)}
                  className={`w-full min-h-[58px] px-3 py-2 rounded-2xl border flex items-center gap-3 text-left transition-colors ${
                    isPlaced
                      ? 'bg-linen-100/75 dark:bg-night-950/60 border-linen-200/80 dark:border-night-800'
                      : 'bg-ivory hover:bg-linen-50 dark:bg-night-900 dark:hover:bg-night-800/80 border-linen-200 dark:border-night-700'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      isPlaced
                        ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                        : 'border-2 border-linen-300 dark:border-night-600 bg-white dark:bg-night-950'
                    }`}
                    aria-hidden="true"
                  >
                    {isPlaced && <Icon name="check" className="w-3.5 h-3.5" />}
                  </span>

                  <BookCover book={book} size="xs" aspectRatio={coverAspect} />

                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-sans text-xs sm:text-sm font-bold text-forest-900 dark:text-white leading-snug truncate ${
                        isPlaced ? 'line-through opacity-60' : ''
                      }`}
                    >
                      {book.title}
                    </p>
                    <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate mt-0.5">
                      {primaryAuthor} · {formatBookBinding(book.format)}
                    </p>
                  </div>

                  {statusTag && (
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${
                        isPlaced
                          ? 'bg-linen-100 text-stone-ink border-linen-200 dark:bg-night-800 dark:text-slate-400 dark:border-night-700'
                          : 'bg-forest-50 text-forest-800 border-forest-200 dark:bg-night-800 dark:text-[#5ED3DA] dark:border-night-700'
                      }`}
                    >
                      {statusTag}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-stone-ink dark:text-slate-400">
              {filter === 'remaining'
                ? 'All books on this shelf are checked off!'
                : 'No completed books on this shelf yet.'}
            </div>
          )}
        </div>

        {/* Batch Actions Footer */}
        <div className="px-4 py-3 border-t border-linen-200 dark:border-night-800 bg-linen-50/70 dark:bg-night-950/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {completedIds.length > 0 && (
              <button
                type="button"
                onClick={handleCheckCompleted}
                disabled={allCompletedChecked}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-45 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
              >
                Check Completed
              </button>
            )}
            <button
              type="button"
              onClick={handleCheckAll}
              disabled={placedCount === shelfBooks.length || shelfBooks.length === 0}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-45 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors whitespace-nowrap"
            >
              Check All
            </button>
            {placedCount > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-ink hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 transition-colors whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold transition-colors whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
