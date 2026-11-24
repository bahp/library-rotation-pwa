import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverList,
} from '../common/BookCoverCard.js';
import { Icon } from '../common/Icon.js';
import { RotationShelfEditorModal } from '../modals/RotationShelfEditorModal.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import { resolveBookCardDisplayConfig } from '../../config/index.js';
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
  const { state, store, activeProfile, setInspectedBookId } = useApp();
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

  const rotCardConfig = resolveBookCardDisplayConfig(state.settings, 'rotations');
  const viewMode = state.settings?.bookViewMode || 'grid';

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
        className={`rounded-xl bg-surface border p-4 sm:p-5 lr-card space-y-3.5 transition-shadow ${
          isActive
            ? 'border-primary/50 ring-1 ring-primary/15'
            : 'border-edge hover:border-secondary'
        }`}
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-secondary">
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-elevated border border-primary/40 font-semibold text-primary">
                  <Icon name="check" className="w-3 h-3 shrink-0" />
                  <span>Active Shelf</span>
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface-subtle border border-edge font-semibold text-ink-secondary">
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

            <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink leading-tight truncate mt-1">
              {rotation.title}
            </h2>

            {rotation.rules?.objective && (
              <p className="font-sans text-xs text-ink-secondary mt-0.5 line-clamp-2 leading-snug">
                {rotation.rules.objective}
              </p>
            )}

            <p
              data-rotation-schedule={isActive ? 'active' : 'saved'}
              className={`font-sans text-xs mt-0.5 truncate flex items-center gap-1.5 leading-tight ${
                isActive && schedule.isDue
                  ? 'font-semibold text-accent'
                  : isActive && schedule.isDueSoon
                    ? 'font-medium text-primary'
                    : 'text-ink-secondary'
              }`}
            >
              <Icon name="calendar" className="w-3.5 h-3.5 shrink-0 opacity-75" />
              <span className="truncate">
                {isActive ? schedule.activeScheduleLine : schedule.savedScheduleLine}
              </span>
            </p>
          </div>

          {/* Right Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Shelf books layout"
              className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge"
            >
              <button
                type="button"
                aria-pressed={viewMode === 'grid'}
                aria-label="Grid view"
                title="Grid view"
                onClick={() => store.updateSettings({ bookViewMode: 'grid' })}
                className={`min-h-[34px] min-w-[34px] px-1.5 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <Icon name="grid" className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'list'}
                aria-label="List view"
                title="List view"
                onClick={() => store.updateSettings({ bookViewMode: 'list' })}
                className={`min-h-[34px] min-w-[34px] px-1.5 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <Icon name="list" className="w-3.5 h-3.5" />
              </button>
            </div>

            {onActivate && (
              <button
                type="button"
                onClick={onActivate}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary hover:text-ink'
                    : 'bg-primary hover:bg-primary-hover text-primary-fg shadow-2xs'
                }`}
              >
                {isActive ? 'Move to Saved' : 'Activate'}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsPlacementOpen(true)}
              aria-label={`Stock shelf checklist for ${rotation.title}`}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Icon name="checklist" className="w-3.5 h-3.5" />
              <span>Stock</span>
            </button>

            <button
              type="button"
              onClick={openEditor}
              aria-label={`Edit ${rotation.title}`}
              className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Icon name="edit" className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {totalCount > 0 && (
          <div className="mt-2.5 h-1.5 w-full rounded-full lr-progress-track overflow-hidden">
            <div
              className="h-full rounded-full lr-progress-fill transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {/* Cover Strip or List Rows */}
        {viewMode === 'list' ? (
          <BookCoverList className="pt-1">
            {shelfBooks.map((book: Book) => {
              const isBookRead = rotation.completedBookIds?.includes(book.id) || false;
              const isBookPicked = rotation.pickedBookIds?.includes(book.id) || false;

              return (
                <BookCoverCard
                  key={book.id}
                  book={book}
                  activeProfile={activeProfile}
                  profiles={state.profiles}
                  layout="list"
                  size={rotCardConfig.size}
                  customWidth={rotCardConfig.customWidth}
                  aspectRatio={rotCardConfig.aspectRatio}
                  infoPlacement={rotCardConfig.infoPlacement}
                  cardFrame={rotCardConfig.cardFrame}
                  showCoverOverlays={rotCardConfig.showCoverOverlays}
                  showUsageAdorno={false}
                  fields={rotCardConfig.fields}
                  isRead={isBookRead}
                  isPicked={isBookPicked}
                  highlightState={isBookRead ? 'read' : isBookPicked ? 'picked' : 'none'}
                  customStatusText={isBookRead ? 'Read' : isBookPicked ? 'Picked' : undefined}
                  onInspect={(b) => setInspectedBookId(b.id)}
                  listTrailingAction={
                    onToggleRead ? (
                      <button
                        type="button"
                        onClick={() => onToggleRead(book.id)}
                        className={`min-h-[36px] px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                          isBookRead
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface border border-edge text-ink hover:bg-surface-elevated'
                        }`}
                      >
                        <Icon name="check" className="w-3 h-3" />
                        <span>{isBookRead ? 'Read' : 'Mark Read'}</span>
                      </button>
                    ) : undefined
                  }
                />
              );
            })}
          </BookCoverList>
        ) : (
          <BookCoverGrid
            size={rotCardConfig.size}
            customWidth={rotCardConfig.customWidth}
            infoPlacement={rotCardConfig.infoPlacement}
            className="pt-1"
          >
            {shelfBooks.map((book: Book) => {
              const isBookRead = rotation.completedBookIds?.includes(book.id) || false;
              const isBookPicked = rotation.pickedBookIds?.includes(book.id) || false;

              return (
                <BookCoverCard
                  key={book.id}
                  book={book}
                  activeProfile={activeProfile}
                  profiles={state.profiles}
                  layout="grid"
                  size={rotCardConfig.size}
                  customWidth={rotCardConfig.customWidth}
                  aspectRatio={rotCardConfig.aspectRatio}
                  infoPlacement={rotCardConfig.infoPlacement}
                  cardFrame={rotCardConfig.cardFrame}
                  showCoverOverlays={rotCardConfig.showCoverOverlays}
                  fields={rotCardConfig.fields}
                  isRead={isBookRead}
                  isPicked={isBookPicked}
                  highlightState={isBookPicked ? 'picked' : isBookRead ? 'read' : 'none'}
                  onInspect={(b) => setInspectedBookId(b.id)}
                />
              );
            })}
          </BookCoverGrid>
        )}
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
