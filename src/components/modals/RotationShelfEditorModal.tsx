import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { computeBookUsageSummary } from '../../features/rotations/usage-insights.js';
import { AVATAR_TONES } from '../../config/index.js';
import {
  computeOwnerInitials,
  formatBookBinding,
  formatReadingStage,
  normalizeOwnersList,
} from '../../types/models.js';
import type { RotationShelf, Book, BookFormat } from '../../types/models.js';

interface RotationShelfEditorModalProps {
  rotation: RotationShelf | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenPlacement?: () => void;
  onSwapBook?: (bookId: string) => void;
  onReplaceBook?: (bookId: string) => void;
  onAddRandom?: (count: number) => void;
  onOpenAddModal?: () => void;
  onToggleRead?: (bookId: string) => void;
  onDelete?: () => void;
}

export const RotationShelfEditorModal: React.FC<RotationShelfEditorModalProps> = ({
  rotation,
  isOpen,
  onClose,
  onOpenPlacement,
  onSwapBook,
  onReplaceBook,
  onAddRandom,
  onOpenAddModal,
  onToggleRead,
  onDelete,
}) => {
  const { state, store, activeProfile, setInspectedBookId } = useApp();

  // Form draft state
  const [editTitle, setEditTitle] = useState('');
  const [editObjective, setEditObjective] = useState('');
  const [editCount, setEditCount] = useState(5);
  const [editSwapDays, setEditSwapDays] = useState(14);
  const [editCooldownDays, setEditCooldownDays] = useState(14);
  const [editFormat, setEditFormat] = useState<BookFormat | 'any'>('any');
  const [editTags, setEditTags] = useState('');
  const [editSeed, setEditSeed] = useState('');
  const [editVarietyMix, setEditVarietyMix] = useState(true);

  useEffect(() => {
    if (rotation) {
      setEditTitle(rotation.title);
      setEditObjective(rotation.rules?.objective || '');
      setEditCount(rotation.rules?.count || rotation.bookIds.length);
      setEditSwapDays(rotation.rules?.swapDays || 14);
      setEditCooldownDays(rotation.rules?.cooldownDays || 14);
      setEditFormat(rotation.rules?.requiredFormat || 'any');
      setEditTags(
        Array.isArray(rotation.rules?.preferredTags) ? rotation.rules.preferredTags.join(', ') : ''
      );
      setEditSeed(rotation.rules?.seed || '');
      setEditVarietyMix(rotation.rules?.varietyMix !== false);
    }
  }, [rotation]);

  if (!isOpen || !rotation) return null;

  const coverAspect = state.settings?.coverAspectRatio || 'portrait';
  const showRotationHistory = state.settings?.enableRotationHistoryInsights !== false;
  const showStaleSpotlight = state.settings?.enableStaleBookSpotlight !== false;
  const staleBookDays = state.settings?.staleBookDays ?? 10;
  const isActive = rotation.status === 'active';

  const bookMap = new Map(state.books.map((b: Book) => [b.id, b]));
  const shelfBooks = rotation.bookIds
    .map((id: string) => bookMap.get(id))
    .filter((b): b is Book => Boolean(b));
  const hasOffShelfBooks = state.books.length > shelfBooks.length;
  const canRemove = shelfBooks.length > 1;

  const handleSaveAndClose = async () => {
    try {
      const tagsList = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await store.updateRotationDetails(rotation.id, {
        title: editTitle.trim() || rotation.title,
        objective: editObjective.trim() || undefined,
        count: Number(editCount),
        swapDays: Number(editSwapDays),
        cooldownDays: Number(editCooldownDays),
        requiredFormat: editFormat,
        preferredTags: tagsList,
        seed: editSeed.trim() || undefined,
        varietyMix: editVarietyMix,
      });
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
    onClose();
  };

  const handleRemoveBook = async (bookId: string) => {
    if (!canRemove) {
      store.notify('At least one book is required on the shelf.', 'error');
      return;
    }
    await store.removeBookFromRotation(rotation.id, bookId);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-rotation-sheet-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
      onClick={handleSaveAndClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        {/* Mobile handle indicator */}
        <div
          className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sticky Header */}
        <div className="px-5 py-3.5 border-b border-linen-200 dark:border-night-700 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2
              id="edit-rotation-sheet-title"
              className="font-display text-lg font-bold text-forest-900 dark:text-white truncate"
            >
              Edit Shelf: {rotation.title}
            </h2>
            <p className="text-xs text-stone-ink dark:text-slate-400 truncate mt-0.5">
              Reader: <strong>{activeProfile?.name || 'Reader'}</strong> · {shelfBooks.length} books on shelf
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Icon name="check" className="w-4 h-4" />
              <span>Done</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit shelf form"
              className="p-2 rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 transition-colors"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Sheet Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Section 1: Compact Shelf Details Form */}
          <section className="space-y-2.5">
            <div className="space-y-2 text-xs">
              <div>
                <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                  Shelf Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-sm font-bold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>

              <div>
                <label className="block font-bold text-forest-900 dark:text-slate-200 mb-1">
                  Description / Objective
                </label>
                <textarea
                  rows={2}
                  value={editObjective}
                  onChange={(e) => setEditObjective(e.target.value)}
                  placeholder="Description or theme note (optional)…"
                  className="w-full px-3 py-2 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-stone-ink dark:text-slate-400 mb-0.5">
                    Swap cycle (d)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={editSwapDays}
                    onChange={(e) => setEditSwapDays(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-mono-tabular text-forest-900 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-ink dark:text-slate-400 mb-0.5">
                    Cooldown (d)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={editCooldownDays}
                    onChange={(e) => setEditCooldownDays(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-mono-tabular text-forest-900 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-ink dark:text-slate-400 mb-0.5">
                    Target books
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={editCount}
                    onChange={(e) => setEditCount(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-mono-tabular text-forest-900 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-ink dark:text-slate-400 mb-0.5">
                    Binding
                  </label>
                  <select
                    value={editFormat}
                    onChange={(e) => setEditFormat(e.target.value as any)}
                    className="w-full h-9 pl-2.5 pr-7 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-slate-200"
                  >
                    <option value="any">Any binding</option>
                    <option value="hardcover">Hardcover</option>
                    <option value="board-book">Board book</option>
                    <option value="paperback">Paperback</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-stone-ink dark:text-slate-400 mb-0.5">
                    Topics (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="bedtime, animals, winter"
                    className="w-full h-9 px-2.5 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-ink dark:text-slate-400 mb-0.5">
                    Seed (optional)
                  </label>
                  <input
                    type="text"
                    value={editSeed}
                    onChange={(e) => setEditSeed(e.target.value)}
                    placeholder="Auto"
                    className="w-full h-9 px-2.5 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-mono-tabular text-forest-900 dark:text-slate-200"
                  />
                </div>
              </div>

              <div className="pt-0.5">
                <label className="inline-flex items-center gap-2 text-xs text-stone-ink dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editVarietyMix}
                    onChange={(e) => setEditVarietyMix(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-[#1F6E75]"
                  />
                  <span>Balance author &amp; topic variety</span>
                </label>
              </div>
            </div>
          </section>

          <hr className="border-linen-200 dark:border-night-800" />

          {/* Section 2: Books on Shelf */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-forest-900 dark:text-white uppercase tracking-wider">
                Books on Shelf ({shelfBooks.length})
              </h3>
              {onOpenPlacement && (
                <button
                  type="button"
                  onClick={onOpenPlacement}
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Icon name="checklist" className="w-3.5 h-3.5" />
                  <span>Stock Shelf</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {shelfBooks.map((book: Book) => {
                const isBookRead = rotation.completedBookIds?.includes(book.id) || false;
                const isBookPicked = rotation.pickedBookIds?.includes(book.id) || false;
                const topicsLabel =
                  book.tags && book.tags.length > 0 ? book.tags.slice(0, 4).join(' · ') : 'general';
                const owners = normalizeOwnersList(book.owners).filter(
                  (o) => o.toLowerCase() !== 'shared'
                );

                const usage = computeBookUsageSummary(book, {
                  profiles: state.profiles,
                  rotations: state.rotations,
                  activeProfile,
                  activeRotation: isActive ? rotation : null,
                  cooldownDays: rotation.rules?.cooldownDays ?? activeProfile?.cooldownDays ?? 14,
                  staleBookDays,
                });

                return (
                  <article
                    key={book.id}
                    data-book-card={`${rotation.id}-${book.id}`}
                    className="rounded-2xl bg-linen-50/75 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3 flex flex-col justify-between gap-2.5 min-w-0"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectedBookId(book.id)}
                          aria-label={`Inspect ${book.title}`}
                          className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-95"
                        >
                          <BookCover book={book} size="sm" aspectRatio={coverAspect} />
                        </button>

                        {owners.length > 0 && (
                          <div className="pointer-events-none absolute -bottom-1 -right-1 z-20 flex -space-x-1">
                            {owners.slice(0, 2).map((ownerKey) => {
                              const prof = state.profiles.find(
                                (p) => p.id.toLowerCase() === ownerKey.toLowerCase()
                              );
                              const label = prof ? prof.name : ownerKey;
                              const initial = computeOwnerInitials(label);
                              const tone = prof
                                ? AVATAR_TONES[prof.avatarTone || 'teal'] || AVATAR_TONES.teal
                                : AVATAR_TONES.indigo;
                              return (
                                <span
                                  key={ownerKey}
                                  className={`w-4 h-4 rounded-full text-[8px] font-bold inline-flex items-center justify-center ring-1 ring-ivory dark:ring-night-950 ${tone}`}
                                >
                                  {initial}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setInspectedBookId(book.id)}
                          className="text-left block w-full focus-visible:outline-2 focus-visible:outline-forest-700 rounded"
                        >
                          <h4
                            className={`font-display text-sm font-bold text-forest-900 dark:text-white leading-snug line-clamp-2 ${
                              isBookRead ? 'line-through opacity-70' : ''
                            }`}
                          >
                            {book.title}
                          </h4>
                          <p className="text-xs text-stone-ink dark:text-slate-300 truncate mt-0.5">
                            {book.authors.join(', ')}
                          </p>
                        </button>

                        <p className="text-[11px] text-stone-ink dark:text-slate-400 mt-1">
                          Ages {book.ageMin}–{book.ageMax} · {formatBookBinding(book.format)} ·{' '}
                          {formatReadingStage(book.readingStage)}
                          {book.pageCount ? ` · ${book.pageCount} pp` : ''}
                        </p>

                        <p className="text-[11px] text-forest-700 dark:text-[#5ED3DA] truncate mt-0.5">
                          Topics: {topicsLabel}
                        </p>

                        {isActive && usage.isStaleUnreadOnShelf && showStaleSpotlight ? (
                          <p
                            data-rotation-slot-usage="true"
                            className="text-[11px] font-medium text-amber-800 dark:text-amber-300 truncate mt-0.5"
                          >
                            Sitting unread {usage.daysOnActiveShelf}d on shelf · Ready to read or swap
                          </p>
                        ) : (
                          showRotationHistory && (
                            <p
                              data-rotation-slot-usage="true"
                              className="text-[11px] text-stone-ink dark:text-slate-400 truncate mt-0.5"
                            >
                              {usage.shortRecencyLabel}
                              {usage.rotationCount > 0 ? ` · Rotated ${usage.rotationCount}×` : ''}
                            </p>
                          )
                        )}
                      </div>
                    </div>

                    {/* 5-Icon Slot Control Strip spanning the full card width */}
                    <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-linen-200/70 dark:border-night-800">
                      <button
                        type="button"
                        onClick={() => store.toggleRotationBookPicked(rotation.id, book.id)}
                        aria-pressed={isBookPicked}
                        aria-label={
                          isBookPicked
                            ? `Unmark ${book.title} picked in this rotation`
                            : `Mark ${book.title} picked in this rotation`
                        }
                        title={
                          isBookPicked
                            ? 'Picked in this rotation'
                            : 'Mark Picked (automatically marks read)'
                        }
                        className={`min-h-[42px] rounded-xl transition-colors flex items-center justify-center ${
                          isBookPicked
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-ivory hover:bg-linen-100 text-stone-ink dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-300 border border-linen-200 dark:border-night-700'
                        }`}
                      >
                        <Icon
                          name={isBookPicked ? 'bookmarkFilled' : 'bookmark'}
                          className="w-4 h-4"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleRead?.(book.id)}
                        disabled={!onToggleRead}
                        aria-pressed={isBookRead}
                        aria-label={
                          isBookRead ? `Mark ${book.title} unread` : `Mark ${book.title} read`
                        }
                        title={isBookRead ? 'Read' : 'Mark Read'}
                        className={`min-h-[42px] rounded-xl transition-colors flex items-center justify-center ${
                          isBookRead
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-ivory hover:bg-linen-100 text-stone-ink dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-300 border border-linen-200 dark:border-night-700'
                        }`}
                      >
                        <Icon name="check" className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSwapBook?.(book.id)}
                        disabled={!hasOffShelfBooks || !onSwapBook}
                        title={
                          !hasOffShelfBooks
                            ? 'No off-shelf books available'
                            : 'Swap with random eligible book'
                        }
                        aria-label={`Swap ${book.title} randomly`}
                        className="min-h-[42px] rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-40 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 transition-colors flex items-center justify-center"
                      >
                        <Icon name="shuffle" className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onReplaceBook?.(book.id)}
                        disabled={!hasOffShelfBooks || !onReplaceBook}
                        title={
                          !hasOffShelfBooks
                            ? 'No off-shelf books available'
                            : 'Replace manually from catalog'
                        }
                        aria-label={`Replace ${book.title} manually`}
                        className="min-h-[42px] rounded-xl bg-ivory hover:bg-linen-100 disabled:opacity-40 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-900 dark:text-slate-200 transition-colors flex items-center justify-center"
                      >
                        <Icon name="replace" className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveBook(book.id)}
                        disabled={!canRemove}
                        title={!canRemove ? 'At least one book required' : 'Remove from shelf'}
                        aria-label={`Remove ${book.title} from shelf`}
                        className="min-h-[42px] rounded-xl bg-ivory hover:bg-rose-50 disabled:opacity-35 dark:bg-night-900 dark:hover:bg-rose-950/40 border border-linen-200 dark:border-night-700 text-stone-ink hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 transition-colors flex items-center justify-center"
                      >
                        <Icon name="close" className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Bottom Edit Toolbar: Add Books + Delete Shelf */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {onAddRandom && (
                  <button
                    type="button"
                    onClick={() => onAddRandom(1)}
                    disabled={!hasOffShelfBooks}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100 hover:bg-linen-200 disabled:opacity-45 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="shuffle" className="w-3.5 h-3.5" />
                    <span>+1 Random</span>
                  </button>
                )}
                {onOpenAddModal && (
                  <button
                    type="button"
                    onClick={onOpenAddModal}
                    disabled={!hasOffShelfBooks}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 disabled:opacity-45 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" />
                    <span>Add Books</span>
                  </button>
                )}
              </div>

              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to delete "${rotation.title}"?`)) {
                      onDelete();
                      onClose();
                    }
                  }}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Icon name="trash" className="w-3.5 h-3.5" />
                  <span>Delete Shelf</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
