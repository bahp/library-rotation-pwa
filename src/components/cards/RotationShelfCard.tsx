import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext.js';
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverList,
} from '../common/BookCoverCard.js';
import { Icon } from '../common/Icon.js';
import { RotationShelfEditorModal } from '../modals/RotationShelfEditorModal.js';
import { ShelfPlacementModal } from '../modals/ShelfPlacementModal.js';
import { RefreshRotationFromLibraryModal } from '../modals/RefreshRotationFromLibraryModal.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import { findMatchingNewBooksForRotation } from '../../features/rotations/rotation-engine.js';
import { resolveBookCardDisplayConfig } from '../../config/index.js';
import type { RotationShelf, Book } from '../../types/models.js';

interface RotationShelfCardProps {
  rotation: RotationShelf;
  books: Book[];
  isActive?: boolean;
  variant?: 'card' | 'sheet';
  hideHeaderTitle?: boolean;
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
  variant = 'card',
  hideHeaderTitle = false,
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
  const [isRefreshLibraryOpen, setIsRefreshLibraryOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [confirmDeleteInMenu, setConfirmDeleteInMenu] = useState(false);
  const [actionsMenuPos, setActionsMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
    maxHeight: number;
  } | null>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const actionsDropdownRef = useRef<HTMLDivElement>(null);

  const isEditorOpen = isEditorOpenProp !== undefined ? isEditorOpenProp : localEditorOpen;
  const openEditor = () => {
    setIsActionsMenuOpen(false);
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

  const updateActionsMenuPosition = useCallback(() => {
    const btn = actionsTriggerRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const right = Math.max(12, vw - rect.right);

    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
      setActionsMenuPos({
        top: Math.max(8, rect.bottom + 6),
        right,
        maxHeight: Math.max(180, Math.min(400, spaceBelow)),
      });
    } else {
      setActionsMenuPos({
        bottom: Math.max(8, vh - rect.top + 6),
        right,
        maxHeight: Math.max(180, Math.min(400, spaceAbove)),
      });
    }
  }, []);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      setConfirmDeleteInMenu(false);
      setActionsMenuPos(null);
      return;
    }

    updateActionsMenuPosition();

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inTrigger = actionsTriggerRef.current?.contains(target);
      const inDropdown = actionsDropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setIsActionsMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsActionsMenuOpen(false);
      }
    };
    const onViewportChange = () => {
      updateActionsMenuPosition();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isActionsMenuOpen, updateActionsMenuPosition]);

  const matchingLibraryCount = useMemo(() => {
    const profile =
      state.profiles.find((p) => p.id === rotation.profileId) || activeProfile || state.profiles[0];
    if (!profile) return 0;
    return findMatchingNewBooksForRotation({
      books,
      profile,
      rotation,
      rotations: state.rotations,
      weights: state.settings?.matchingWeights,
    }).matchingBooks.length;
  }, [books, state.profiles, state.rotations, state.settings?.matchingWeights, rotation, activeProfile]);

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
        className={
          variant === 'sheet'
            ? 'space-y-3.5'
            : `rounded-xl bg-surface border p-4 sm:p-5 lr-card space-y-3.5 transition-shadow ${
                isActive
                  ? 'border-primary/50 ring-1 ring-primary/15'
                  : 'border-edge hover:border-secondary'
              }`
        }
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {!hideHeaderTitle && (
              <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-secondary">
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-elevated border border-primary/40 font-semibold text-primary">
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full bg-success lr-active-dot-pulse shrink-0"
                      />
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
              </>
            )}

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

          {/* Right Actions: View Toggle + Primary Action + Unified Actions Menu */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
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
                className={`min-h-[36px] min-w-[36px] px-1.5 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
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
                className={`min-h-[36px] min-w-[36px] px-1.5 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-primary text-primary-fg shadow-2xs'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                <Icon name="list" className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {!isActive && onActivate ? (
                <button
                  type="button"
                  onClick={onActivate}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
                >
                  Activate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPlacementOpen(true)}
                  aria-label={`Stock shelf checklist for ${rotation.title}`}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Icon name="checklist" className="w-3.5 h-3.5" />
                  <span>Stock</span>
                </button>
              )}

              {/* Unified Actions Dropdown Trigger (menu rendered in document.body portal) */}
              <div className="relative">
                <button
                  ref={actionsTriggerRef}
                  type="button"
                  data-rotation-actions-trigger="true"
                  aria-haspopup="menu"
                  aria-expanded={isActionsMenuOpen}
                  aria-label={`Shelf actions for ${rotation.title}`}
                  onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    isActionsMenuOpen
                      ? 'bg-surface-elevated border-primary text-ink'
                      : 'bg-surface-subtle hover:bg-surface-elevated border-edge text-ink'
                  }`}
                >
                  <Icon name="moreVertical" className="w-3.5 h-3.5" />
                  <span>Actions</span>
                  {matchingLibraryCount > 0 && (
                    <span
                      aria-label={`${matchingLibraryCount} new library matches`}
                      className="w-2 h-2 rounded-full bg-primary shrink-0"
                    />
                  )}
                </button>
              </div>
            </div>
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

      {isActionsMenuOpen && actionsMenuPos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={actionsDropdownRef}
            role="menu"
            data-rotation-actions-menu="true"
            aria-label={`Actions for ${rotation.title}`}
            style={{
              position: 'fixed',
              top: actionsMenuPos.top !== undefined ? `${actionsMenuPos.top}px` : undefined,
              bottom: actionsMenuPos.bottom !== undefined ? `${actionsMenuPos.bottom}px` : undefined,
              right: `${actionsMenuPos.right}px`,
              maxHeight: `${actionsMenuPos.maxHeight}px`,
            }}
            className="w-64 max-w-[calc(100vw-24px)] rounded-xl bg-surface border border-edge shadow-2xl ring-1 ring-ink/10 z-[70] py-1.5 overflow-y-auto overscroll-y-contain text-left"
          >
            {onActivate && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsActionsMenuOpen(false);
                  onActivate();
                }}
                className="w-full min-h-[42px] px-3.5 py-2 text-left hover:bg-surface-subtle flex items-center gap-2.5 text-xs font-semibold text-ink transition-colors cursor-pointer"
              >
                <Icon name="rotations" className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p>{isActive ? 'Move to Saved' : 'Activate Shelf'}</p>
                  <p className="text-[11px] font-normal text-ink-secondary">
                    {isActive
                      ? 'Pause and store under Saved Rotations'
                      : 'Place this shelf on your active display'}
                  </p>
                </div>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsActionsMenuOpen(false);
                setIsPlacementOpen(true);
              }}
              className="w-full min-h-[42px] px-3.5 py-2 text-left hover:bg-surface-subtle flex items-center gap-2.5 text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              <Icon name="checklist" className="w-4 h-4 text-ink-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                <p>Stock Shelf Checklist</p>
                <p className="text-[11px] font-normal text-ink-secondary">
                  Tick off books as you place them on the shelf
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              data-action="menu-refresh-from-library"
              onClick={() => {
                setIsActionsMenuOpen(false);
                setIsRefreshLibraryOpen(true);
              }}
              className="w-full min-h-[42px] px-3.5 py-2 text-left hover:bg-surface-subtle flex items-center gap-2.5 text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              <Icon name="refresh" className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p>Refresh from Library</p>
                  {matchingLibraryCount > 0 && (
                    <span className="text-[10px] font-mono-tabular font-semibold px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
                      {matchingLibraryCount} new
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-normal text-ink-secondary">
                  Preview &amp; add new matching books from library
                </p>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={openEditor}
              className="w-full min-h-[42px] px-3.5 py-2 text-left hover:bg-surface-subtle flex items-center gap-2.5 text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              <Icon name="edit" className="w-4 h-4 text-ink-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                <p>Edit Rules &amp; Books</p>
                <p className="text-[11px] font-normal text-ink-secondary">
                  Rename, change rules, swap or remove books
                </p>
              </div>
            </button>

            {onDelete && (
              <>
                <div className="my-1 border-t border-edge-subtle" />
                {!confirmDeleteInMenu ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirmDeleteInMenu(true)}
                    className="w-full min-h-[40px] px-3.5 py-2 text-left hover:bg-danger/10 flex items-center gap-2.5 text-xs font-semibold text-danger transition-colors cursor-pointer"
                  >
                    <Icon name="trash" className="w-4 h-4 shrink-0" />
                    <span>Delete Shelf</span>
                  </button>
                ) : (
                  <div className="px-3.5 py-2 bg-danger/8 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-danger">
                      Delete shelf?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsActionsMenuOpen(false);
                          onDelete();
                        }}
                        className="px-2.5 py-1 rounded-md bg-danger-solid text-danger-solid-fg text-[11px] font-semibold cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteInMenu(false)}
                        className="px-2 py-1 rounded-md bg-surface border border-edge text-[11px] font-semibold text-ink cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>,
          document.body
        )}

      {/* Portaled Modals so they are never clipped/trapped by card or sheet transforms */}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
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

            <ShelfPlacementModal
              rotation={rotation}
              isOpen={isPlacementOpen}
              onClose={() => setIsPlacementOpen(false)}
            />

            <RefreshRotationFromLibraryModal
              rotation={rotation}
              isOpen={isRefreshLibraryOpen}
              onClose={() => setIsRefreshLibraryOpen(false)}
            />
          </>,
          document.body
        )}
    </>
  );
};
