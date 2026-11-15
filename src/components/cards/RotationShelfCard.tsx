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

  const progressPct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  return (
    <>
      <section
        className={`rounded-2xl bg-ivory dark:bg-night-900 border p-4 sm:p-6 shadow-2xs space-y-4 transition-shadow ${
          isActive
            ? 'border-forest-700/35 ring-1 ring-forest-700/10 dark:border-[#5ED3DA]/35 dark:ring-[#5ED3DA]/15'
            : 'border-linen-200/90 dark:border-night-800 hover:shadow-md'
        }`}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-ink dark:text-slate-400">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800 font-bold text-emerald-800 dark:text-emerald-300">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shrink-0"
                    aria-hidden="true"
                  />
                  <span>Active Shelf</span>
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-linen-100 dark:bg-night-800 border border-linen-200 dark:border-night-700 font-semibold text-stone-ink dark:text-slate-300">
                  Saved
                </span>
              )}
              <span className="font-mono-tabular font-medium">
                {readCount}/{totalCount} read ({progressPct}%)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {totalCount} {totalCount === 1 ? 'book' : 'books'}
              </span>
            </div>

            <h2 className="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white leading-snug truncate mt-1.5">
              {rotation.title}
            </h2>

            <p
              data-rotation-schedule={isActive ? 'active' : 'saved'}
              className={`font-sans text-xs mt-1 truncate flex items-center gap-1.5 ${
                isActive && schedule.isDue
                  ? 'font-semibold text-amber-800 dark:text-amber-300'
                  : isActive && schedule.isDueSoon
                    ? 'font-medium text-forest-700 dark:text-[#5ED3DA]'
                    : 'text-stone-ink dark:text-slate-400'
              }`}
            >
              <Icon name="calendar" className="w-3.5 h-3.5 shrink-0 opacity-75" />
              <span className="truncate">
                {isActive ? schedule.activeScheduleLine : schedule.savedScheduleLine}
              </span>
            </p>

            {rotation.rules?.objective && (
              <p className="font-sans text-xs text-stone-ink dark:text-slate-400 mt-1 line-clamp-1">
                {rotation.rules.objective}
              </p>
            )}

            {totalCount > 0 && (
              <div className="mt-2.5 h-1.5 w-full max-w-xs rounded-full bg-linen-100 dark:bg-night-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-forest-700 dark:bg-[#5ED3DA] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isActive && onActivate && (
              <button
                type="button"
                onClick={onActivate}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-semibold transition-colors shadow-2xs whitespace-nowrap"
              >
                Activate
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPlacementOpen(true)}
              aria-label={`Stock shelf checklist for ${rotation.title}`}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-50 hover:bg-linen-100 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Icon name="checklist" className="w-3.5 h-3.5" />
              <span>Stock</span>
            </button>

            <button
              type="button"
              onClick={openEditor}
              aria-label={`Edit ${rotation.title}`}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-linen-50 hover:bg-linen-100 dark:bg-night-800 dark:hover:bg-night-700 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Icon name="edit" className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Cover Strip */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 sm:gap-3 pt-1">
          {shelfBooks.map((book: Book) => {
            const isBookRead = rotation.completedBookIds?.includes(book.id) || false;
            const isBookPicked = rotation.pickedBookIds?.includes(book.id) || false;
            const coverRingClass = isBookPicked
              ? 'ring-2 ring-forest-700 dark:ring-[#5ED3DA] ring-offset-2 ring-offset-ivory dark:ring-offset-night-900'
              : isBookRead
                ? 'ring-[1.5px] ring-forest-700/75 dark:ring-[#5ED3DA]/75 ring-offset-2 ring-offset-ivory dark:ring-offset-night-900'
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
