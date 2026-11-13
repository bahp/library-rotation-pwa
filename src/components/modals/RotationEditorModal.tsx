import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import type { Book } from '../../types/models.js';

interface RotationEditorModalProps {
  modalMode: 'replace' | 'add' | null;
  rotationId: string | null;
  targetBookId: string | null;
  onClose: () => void;
}

export const RotationEditorModal: React.FC<RotationEditorModalProps> = ({
  modalMode,
  rotationId,
  targetBookId,
  onClose,
}) => {
  const { state, store, activeProfile } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);

  const rotation = state.rotations.find((r) => r.id === rotationId);
  const targetBook = state.books.find((b) => b.id === targetBookId);

  // Eligible off-shelf books (owned, good condition, not currently in rotation, not excluded)
  const offShelfBooks = useMemo(() => {
    if (!rotation) return [];
    const currentShelfIds = new Set(rotation.bookIds);

    return state.books.filter((b) => {
      if (b.collectionStatus && b.collectionStatus !== 'owned') return false;
      if (b.excludeFromRotations) return false;
      if (currentShelfIds.has(b.id)) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const haystack = `${b.title} ${b.authors.join(' ')} ${b.tags.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [state.books, rotation, searchQuery]);

  if (!modalMode || !rotation) return null;

  const isReplace = modalMode === 'replace';

  const handleSelectReplaceCandidate = async (candidateBook: Book) => {
    if (!targetBookId || !rotationId) return;
    await store.replaceRotationBookManual(rotationId, targetBookId, candidateBook.id);
    onClose();
  };

  const handleToggleAddCandidate = (bookId: string) => {
    setSelectedAddIds((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  };

  const handleConfirmAddManual = async () => {
    if (!rotationId || selectedAddIds.length === 0) return;
    await store.addBooksToRotationManual(rotationId, selectedAddIds);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rotation-picker-modal-title"
      data-backdrop-action="close-rotation-modal"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl bg-ivory dark:bg-night-900 rounded-t-3xl sm:rounded-2xl border border-linen-200 dark:border-night-700 shadow-2xl p-5 sm:p-6 my-auto max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800">
          <div>
            <h2
              id="rotation-picker-modal-title"
              className="font-display text-lg font-bold text-forest-900 dark:text-white"
            >
              {isReplace ? 'Replace Book on Shelf' : 'Add Books to Rotation Shelf'}
            </h2>
            <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              {isReplace && targetBook
                ? `Replacing "${targetBook.title}"`
                : `Adding to "${rotation.title}"`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-linen-100 dark:hover:bg-night-800 transition-colors"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="py-3">
          <ClearableInput
            id="rotation-modal-search-input"
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search off-shelf books by title, author, or topic…"
            className="px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700"
          />
        </div>

        {/* Off-shelf Books List */}
        <div className="overflow-y-auto flex-1 divide-y divide-linen-200/60 dark:divide-night-800 space-y-1">
          {offShelfBooks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-stone-ink dark:text-slate-400">
                No eligible off-shelf books found.
              </p>
              <p className="text-xs text-stone-400 dark:text-slate-500 mt-1">
                Add more books to your catalog or clear the search query.
              </p>
            </div>
          ) : (
            offShelfBooks.map((book) => {
              const isSelected = selectedAddIds.includes(book.id);

              return (
                <div
                  key={book.id}
                  onClick={() => {
                    if (isReplace) {
                      handleSelectReplaceCandidate(book);
                    } else {
                      handleToggleAddCandidate(book.id);
                    }
                  }}
                  className={`p-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-forest-700/10 dark:bg-[#5ED3DA]/15'
                      : 'hover:bg-linen-100 dark:hover:bg-night-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookCover book={book} size="sm" aspectRatio="portrait" />
                    <div className="min-w-0">
                      <h4 className="font-display text-sm font-bold text-forest-900 dark:text-white truncate">
                        {book.title}
                      </h4>
                      <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
                        {book.authors.join(', ')}
                      </p>
                      {book.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 truncate">
                          {book.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] px-1.5 py-0.2 rounded-md bg-linen-200/70 dark:bg-night-700 text-stone-600 dark:text-slate-300"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {isReplace ? (
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-semibold shrink-0"
                    >
                      Select
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleAddCandidate(book.id)}
                      className="w-5 h-5 rounded text-forest-700 shrink-0"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer for Add Mode */}
        {!isReplace && (
          <div className="pt-3 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
            <span className="text-xs text-stone-ink dark:text-slate-400 font-medium">
              {selectedAddIds.length} book{selectedAddIds.length === 1 ? '' : 's'} selected
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl text-stone-600 dark:text-slate-400 hover:bg-linen-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedAddIds.length === 0}
                onClick={handleConfirmAddManual}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 disabled:opacity-40"
              >
                Add to Shelf
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
