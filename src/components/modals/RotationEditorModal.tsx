import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import type { Book } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

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

  useBodyScrollLock(Boolean(modalMode && rotation));

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
      className="sheet-backdrop fixed inset-0 z-50 bg-[#142321]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl bg-surface rounded-t-2xl sm:rounded-xl border border-edge shadow-2xl px-5 pt-3 pb-5 sm:p-6 my-auto max-h-[90vh] flex flex-col pb-safe sm:pb-6"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mb-3 shrink-0 sm:hidden" aria-hidden="true" />
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-edge-subtle">
          <div>
            <h2
              id="rotation-picker-modal-title"
              className="font-display text-lg font-semibold text-ink"
            >
              {isReplace ? 'Replace Book on Shelf' : 'Add Books to Rotation Shelf'}
            </h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              {isReplace && targetBook
                ? `Replacing "${targetBook.title}"`
                : `Adding to "${rotation.title}"`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[48px] min-w-[48px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center"
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
            className="px-3.5 py-2.5 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Off-shelf Books List */}
        <div className="overflow-y-auto flex-1 divide-y divide-edge-subtle space-y-1">
          {offShelfBooks.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-ink-secondary">
                No eligible off-shelf books found.
              </p>
              <p className="text-xs text-ink-muted mt-1">
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
                  className={`min-h-[60px] p-2.5 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-all active:scale-[0.99] ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-surface-subtle'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookCover book={book} size="sm" aspectRatio="portrait" />
                    <div className="min-w-0">
                      <h4 className="font-display text-sm font-semibold text-ink truncate">
                        {book.title}
                      </h4>
                      <p className="text-xs text-ink-secondary truncate">
                        {book.authors.join(', ')}
                      </p>
                      {book.tags.length > 0 && (
                        <div className="flex gap-1 mt-1 truncate">
                          {book.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-elevated border border-edge-subtle text-ink-secondary"
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
                      className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold shrink-0"
                    >
                      Select
                    </button>
                  ) : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleAddCandidate(book.id)}
                      className="w-5 h-5 rounded accent-primary shrink-0"
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer for Add Mode */}
        {!isReplace && (
          <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-2">
            <span className="text-xs text-ink-secondary font-medium font-mono-tabular">
              {selectedAddIds.length} book{selectedAddIds.length === 1 ? '' : 's'} selected
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] sm:min-h-[36px] px-4 py-1.5 text-xs font-semibold rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedAddIds.length === 0}
                onClick={handleConfirmAddManual}
                className="min-h-[48px] sm:min-h-[36px] px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-primary-fg disabled:opacity-40 active:scale-[0.98] transition-all"
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
