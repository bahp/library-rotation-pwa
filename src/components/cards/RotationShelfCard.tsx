import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { RotationShelfEditorModal } from '../modals/RotationShelfEditorModal.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import type { RotationShelf, Book } from '../../types/models.js';

interface RotationShelfCardProps {
  rotation: RotationShelf;
  books: Book[];
  isActive?: boolean;
  isEditorOpen?: boolean;
  onOpenEditor?: () => void;
  onCloseEditor?: () => void;
  onSwapBook?: (bookId: string) => void;
  onReplaceBook?: (bookId: string) => void;
  onAddRandom?: (count: number) => void;
  onOpenAddModal?: () => void;
  onToggleRead?: (bookId: string) => void;
  onRemoveBook?: (bookId: string) => void;
  onActivate?: () => void;
  onDelete?: () => void;
}

export const RotationShelfCard: React.FC<RotationShelfCardProps> = ({
  rotation,
  books,
  isActive = false,
  isEditorOpen: isEditorOpenProp,
  onOpenEditor,
  onCloseEditor,
  onSwapBook,
  onReplaceBook,
  onAddRandom,
  onOpenAddModal,
  onToggleRead,
  onActivate,
  onDelete,
}) => {
  const { state, activeProfile, setInspectedBookId } = useApp();
  const [localEditorOpen, setLocalEditorOpen] = useState(false);
  const [isPlacementOpen, setIsPlacementOpen] = useState(false);

  const isEditorOpen = isEditorOpenProp !== undefined ? isEditorOpenProp : localEditorOpen;
  const openEditor = () => {
    if (onOpenEditor) {
      onOpenEditor();
    } else {
      setLocalEditorOpen(true);
    }
  };
  const closeEditor = () => {
    if (onCloseEditor) {
      onCloseEditor();
    } else {
      setLocalEditorOpen(false);
    }
  };

  const coverAspect = state.settings?.coverAspectRatio || 'portrait';

  const bookMap = new Map(books.map((b: Book) => [b.id, b]));
  const shelfBooks = rotation.bookIds
    .map((id: string) => bookMap.get(id))
    .filter((b): b is Book => Boolean(b));

  const readCount = shelfBooks.filter((b: Book) =>
    rotation.completedBookIds?.includes(b.id)
  ).length;

  const totalCount = shelfBooks.length;
  const schedule = computeRotationSchedule(rotation, activeProfile || state.profiles[0]);

  return (
    <>
      <section className="py-4 first:pt-1 border-b border-linen-200/90 dark:border-night-800 last:border-b-0 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 font-bold text-espresso-800 dark:text-[#5ED3DA]">
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shrink-0"
                    aria-hidden="true"
                  />
                  <span>Active</span>
                </span>
              ) : (
                <span className="font-medium">Saved</span>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {readCount}/{totalCount} read
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {totalCount} {totalCount === 1 ? 'book' : 'books'}
              </span>
            </div>

            <h2 className="font-display text-lg font-bold text-forest-900 dark:text-white leading-snug truncate mt-0.5">
              {rotation.title}
            </h2>

            <p
              data-rotation-schedule={isActive ? 'active' : 'saved'}
              className={`font-sans text-xs mt-0.5 truncate ${
                isActive && schedule.isDue
                  ? 'font-semibold text-amber-800 dark:text-amber-300'
                  : isActive && schedule.isDueSoon
                    ? 'font-medium text-forest-700 dark:text-[#5ED3DA]'
                    : 'text-stone-ink dark:text-slate-400'
              }`}
            >
              {isActive ? schedule.activeScheduleLine : schedule.savedScheduleLine}
            </p>

            {rotation.rules?.objective && (
              <p className="font-sans text-xs text-stone-ink dark:text-slate-400 mt-0.5 line-clamp-1">
                {rotation.rules.objective}
              </p>
            )}
          </div>

          {/* Compact Right Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!isActive && onActivate && (
              <button
                type="button"
                onClick={onActivate}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors whitespace-nowrap"
              >
                Activate
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPlacementOpen(true)}
              aria-label={`Stock shelf checklist for ${rotation.title}`}
              className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Icon name="checklist" className="w-3.5 h-3.5" />
              <span>Stock</span>
            </button>

            <button
              type="button"
              onClick={openEditor}
              aria-label={`Edit ${rotation.title}`}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Icon name="edit" className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* DEFAULT VIEW MODE: Compact Cover-Only Strip */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 sm:gap-3 pt-0.5">
          {shelfBooks.map((book: Book) => {
            const isBookRead = rotation.completedBookIds?.includes(book.id) || false;
            const isBookPicked = rotation.pickedBookIds?.includes(book.id) || false;
            const coverRingClass = isBookPicked
              ? 'ring-2 ring-forest-700 dark:ring-[#5ED3DA] ring-offset-2 ring-offset-linen-50 dark:ring-offset-night-950'
              : isBookRead
                ? 'ring-[1.5px] ring-forest-700/75 dark:ring-[#5ED3DA]/75 ring-offset-2 ring-offset-linen-50 dark:ring-offset-night-950'
                : '';

            return (
              <div key={book.id} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setInspectedBookId(book.id)}
                  aria-label={`Inspect ${book.title}`}
                  className="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-[0.98]"
                >
                  <BookCover
                    book={book}
                    size="grid"
                    aspectRatio={coverAspect}
                    showBadges
                    activeProfile={activeProfile}
                    profiles={state.profiles}
                    isReadOnActiveShelf={isBookRead}
                    isPickedInRotation={isBookPicked}
                    className={coverRingClass}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Slide-Up Bottom Sheet Editor Modal */}
      <RotationShelfEditorModal
        rotation={rotation}
        isOpen={isEditorOpen}
        onClose={closeEditor}
        onOpenPlacement={() => {
          closeEditor();
          setIsPlacementOpen(true);
        }}
        onSwapBook={onSwapBook}
        onReplaceBook={onReplaceBook}
        onAddRandom={onAddRandom}
        onOpenAddModal={onOpenAddModal}
        onToggleRead={onToggleRead}
        onDelete={onDelete}
      />

      {/* Shelf Placement Helper Checklist Modal */}
      <ShelfPlacementModal
        rotation={rotation}
        isOpen={isPlacementOpen}
        onClose={() => setIsPlacementOpen(false)}
      />
    </>
  );
};
