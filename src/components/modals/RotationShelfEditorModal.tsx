import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { computeBookUsageSummary } from '../../features/rotations/usage-insights.js';
import { findMatchingNewBooksForRotation } from '../../features/rotations/rotation-engine.js';
import { AVATAR_TONES } from '../../config/index.js';
import {
  computeOwnerInitials,
  formatBookBinding,
  formatReadingStage,
  normalizeOwnersList,
} from '../../types/models.js';
import type { RotationShelf, Book, BookFormat } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

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
  const [editStatus, setEditStatus] = useState<'active' | 'saved'>('active');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
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
      setEditStatus(rotation.status === 'active' ? 'active' : 'saved');
    }
  }, [rotation]);

  useBodyScrollLock(isOpen && Boolean(rotation));

  if (!isOpen || !rotation) return null;

  const coverAspect = state.settings?.coverAspectRatio || 'square';
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
  const [isRefreshingRules, setIsRefreshingRules] = useState(false);

  const draftRulesPatch = useMemo(() => {
    const cleanTags = editTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return {
      objective: editObjective.trim(),
      count: Math.max(1, Number(editCount) || rotation.bookIds.length || 4),
      cooldownDays: Math.max(0, Number(editCooldownDays) || 0),
      swapDays: Math.max(1, Number(editSwapDays) || 14),
      requiredFormat: editFormat,
      preferredTags: cleanTags,
      varietyMix: editVarietyMix,
      seed: editSeed.trim() || undefined,
    };
  }, [
    editTags,
    editObjective,
    editCount,
    editCooldownDays,
    editSwapDays,
    editFormat,
    editVarietyMix,
    editSeed,
    rotation.bookIds.length,
  ]);

  const ruleMatchesResult = useMemo(() => {
    const profile =
      state.profiles.find((p) => p.id === rotation.profileId) || activeProfile || state.profiles[0];
    if (!profile) {
      return { matchingBooks: [], allEligibleBooks: [], hasExplicitRuleFilters: false };
    }
    return findMatchingNewBooksForRotation({
      books: state.books,
      profile,
      rotation,
      rotations: state.rotations,
      rulesOverride: draftRulesPatch,
    });
  }, [state.books, state.profiles, state.rotations, rotation, activeProfile, draftRulesPatch]);

  const handleRefreshFromRules = async (mode: 'add-matches' | 'redraw-unread') => {
    setIsRefreshingRules(true);
    try {
      await store.refreshRotationFromRules(rotation.id, {
        mode,
        rulesPatch: draftRulesPatch,
        limit:
          mode === 'add-matches'
            ? Math.min(6, Math.max(1, ruleMatchesResult.matchingBooks.length))
            : undefined,
      });
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setIsRefreshingRules(false);
    }
  };

  const handleSaveAndClose = async () => {
    try {
      const tagsList = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      await store.updateRotationDetails(rotation.id, {
        title: editTitle.trim() || rotation.title,
        objective: editObjective.trim() || undefined,
        status: editStatus,
        count: Number(editCount),
        swapDays: Number(editSwapDays),
        cooldownDays: Number(editCooldownDays),
        requiredFormat: editFormat,
        preferredTags: tagsList,
        seed: editSeed.trim() || undefined,
        varietyMix: editVarietyMix,
      }, { keepOtherActive: true });
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
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
      onClick={handleSaveAndClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        {/* Mobile handle indicator */}
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sticky Header */}
        <div className="px-5 py-3.5 border-b border-edge flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2
              id="edit-rotation-sheet-title"
              className="font-display text-lg font-semibold text-ink truncate"
            >
              Edit Shelf: {rotation.title}
            </h2>
            <p className="text-xs text-ink-secondary truncate mt-0.5">
              Reader: <strong className="font-semibold text-ink">{activeProfile?.name || 'Reader'}</strong> · <span className="font-mono-tabular">{shelfBooks.length}</span> books on shelf
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="min-h-[48px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-[0.98]"
            >
              <Icon name="check" className="w-4 h-4" />
              <span>Done</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close edit shelf form"
              className="min-h-[48px] min-w-[48px] sm:min-h-[40px] sm:min-w-[40px] p-2 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center"
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-ink mb-1">
                    Shelf Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge text-sm font-semibold text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Shelf Status
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Rotation shelf status"
                    className="grid grid-cols-2 p-0.5 rounded-lg bg-surface-subtle border border-edge h-10"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={editStatus === 'active'}
                      onClick={() => setEditStatus('active')}
                      className={`rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        editStatus === 'active'
                          ? 'bg-primary text-primary-fg shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={editStatus === 'saved'}
                      onClick={() => setEditStatus('saved')}
                      className={`rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        editStatus === 'saved'
                          ? 'bg-primary text-primary-fg shadow-2xs'
                          : 'text-ink-secondary hover:text-ink'
                      }`}
                    >
                      Saved
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">
                  Description / Objective
                </label>
                <textarea
                  rows={2}
                  value={editObjective}
                  onChange={(e) => setEditObjective(e.target.value)}
                  placeholder="Description or theme note (optional)…"
                  className="w-full px-3 py-2 rounded-lg bg-surface-subtle border border-edge text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-ink-secondary mb-0.5">
                    Swap cycle (d)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={editSwapDays}
                    onChange={(e) => setEditSwapDays(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-mono-tabular text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-ink-secondary mb-0.5">
                    Cooldown (d)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={editCooldownDays}
                    onChange={(e) => setEditCooldownDays(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-mono-tabular text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-ink-secondary mb-0.5">
                    Target books
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={editCount}
                    onChange={(e) => setEditCount(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-mono-tabular text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-ink-secondary mb-0.5">
                    Binding
                  </label>
                  <select
                    value={editFormat}
                    onChange={(e) => setEditFormat(e.target.value as any)}
                    className="w-full h-9 pl-2.5 pr-7 rounded-lg bg-surface-subtle border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-primary"
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
                  <label className="block text-[11px] font-medium text-ink-secondary mb-0.5">
                    Topics (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="bedtime, animals, winter"
                    className="w-full h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-ink-secondary mb-0.5">
                    Seed (optional)
                  </label>
                  <input
                    type="text"
                    value={editSeed}
                    onChange={(e) => setEditSeed(e.target.value)}
                    placeholder="Auto"
                    className="w-full h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="pt-0.5">
                <label className="inline-flex items-center gap-2 text-xs text-ink-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editVarietyMix}
                    onChange={(e) => setEditVarietyMix(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-primary"
                  />
                  <span>Balance author &amp; topic variety</span>
                </label>
              </div>
            </div>
          </section>

          <hr className="border-edge-subtle" />

          {/* Section 2: Books on Shelf */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-ink">
                Books on Shelf (<span className="font-mono-tabular">{shelfBooks.length}</span>)
              </h3>
              <div className="flex items-center gap-2">
                {onOpenPlacement && (
                  <button
                    type="button"
                    onClick={onOpenPlacement}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Icon name="checklist" className="w-3.5 h-3.5" />
                    <span>Stock Shelf</span>
                  </button>
                )}
              </div>
            </div>

            {/* Clean inline library-sync bar when new matching books exist or rule refresh is useful */}
            {hasOffShelfBooks && (
              <div
                data-rotation-rule-sync="true"
                className="rounded-xl bg-surface-subtle border border-edge-subtle px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">
                    {ruleMatchesResult.matchingBooks.length > 0
                      ? `${ruleMatchesResult.matchingBooks.length} new matching ${ruleMatchesResult.matchingBooks.length === 1 ? 'book' : 'books'} in library`
                      : 'Update shelf from library'}
                  </p>
                  <p className="text-[11px] text-ink-secondary truncate mt-0.5">
                    {ruleMatchesResult.matchingBooks.length > 0
                      ? `Matches rules: ${ruleMatchesResult.matchingBooks
                          .slice(0, 3)
                          .map((m) => m.book.title)
                          .join(', ')}${ruleMatchesResult.matchingBooks.length > 3 ? '…' : ''}`
                      : 'Re-draw unread slots using these tags, binding, and newly added books.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {ruleMatchesResult.matchingBooks.length > 0 && (
                    <button
                      type="button"
                      data-action="add-rule-matches"
                      disabled={isRefreshingRules}
                      onClick={() => handleRefreshFromRules('add-matches')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Icon name="plus" className="w-3.5 h-3.5" />
                      <span>
                        Add Matches ({Math.min(6, ruleMatchesResult.matchingBooks.length)})
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    data-action="redraw-unread-from-rules"
                    disabled={isRefreshingRules}
                    onClick={() => handleRefreshFromRules('redraw-unread')}
                    title="Keep read and picked books, and refresh unread slots from your updated library"
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge disabled:opacity-50 text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Icon name="refresh" className="w-3.5 h-3.5" />
                    <span>Re-draw Unread</span>
                  </button>
                </div>
              </div>
            )}

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
                    className="rounded-xl bg-surface-subtle border border-edge-subtle p-3 flex flex-col justify-between gap-2.5 min-w-0"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectedBookId(book.id)}
                          aria-label={`Inspect ${book.title}`}
                          className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-transform active:scale-95"
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
                                  className={`w-4 h-4 rounded-full text-[8px] font-bold inline-flex items-center justify-center ring-1 ring-surface ${tone}`}
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
                          className="text-left block w-full focus-visible:outline-2 focus-visible:outline-primary rounded"
                        >
                          <h4
                            className={`font-display text-sm font-semibold text-ink leading-snug line-clamp-2 ${
                              isBookRead ? 'line-through opacity-70' : ''
                            }`}
                          >
                            {book.title}
                          </h4>
                          <p className="text-xs text-ink-secondary truncate mt-0.5">
                            {book.authors.join(', ')}
                          </p>
                        </button>

                        <p className="text-[11px] text-ink-secondary mt-1">
                          Ages <span className="font-mono-tabular">{book.ageMin}–{book.ageMax}</span> · {formatBookBinding(book.format)} ·{' '}
                          {formatReadingStage(book.readingStage)}
                          {book.pageCount ? ` · ${book.pageCount} pp` : ''}
                        </p>

                        <p className="text-[11px] text-accent truncate mt-0.5">
                          Topics: {topicsLabel}
                        </p>

                        {isActive && usage.isStaleUnreadOnShelf && showStaleSpotlight ? (
                          <p
                            data-rotation-slot-usage="true"
                            className="text-[11px] font-medium text-accent truncate mt-0.5"
                          >
                            Sitting unread {usage.daysOnActiveShelf}d on shelf · Ready to read or swap
                          </p>
                        ) : (
                          showRotationHistory && (
                            <p
                              data-rotation-slot-usage="true"
                              className="text-[11px] text-ink-muted truncate mt-0.5"
                            >
                              {usage.shortRecencyLabel}
                              {usage.rotationCount > 0 ? ` · Rotated ${usage.rotationCount}×` : ''}
                            </p>
                          )
                        )}
                      </div>
                    </div>

                    {/* 5-Icon Slot Control Strip spanning the full card width */}
                    <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-edge-subtle">
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
                        className={`min-h-[42px] rounded-lg transition-colors flex items-center justify-center ${
                          isBookPicked
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface hover:bg-surface-elevated text-ink-secondary hover:text-ink border border-edge-subtle'
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
                        className={`min-h-[42px] rounded-lg transition-colors flex items-center justify-center ${
                          isBookRead
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface hover:bg-surface-elevated text-ink-secondary hover:text-ink border border-edge-subtle'
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
                        className="min-h-[42px] rounded-lg bg-surface hover:bg-surface-elevated disabled:opacity-40 border border-edge-subtle text-ink transition-colors flex items-center justify-center"
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
                        className="min-h-[42px] rounded-lg bg-surface hover:bg-surface-elevated disabled:opacity-40 border border-edge-subtle text-ink transition-colors flex items-center justify-center"
                      >
                        <Icon name="replace" className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveBook(book.id)}
                        disabled={!canRemove}
                        title={!canRemove ? 'At least one book required' : 'Remove from shelf'}
                        aria-label={`Remove ${book.title} from shelf`}
                        className="min-h-[42px] rounded-lg bg-surface hover:bg-danger/10 disabled:opacity-35 border border-edge-subtle text-ink-secondary hover:text-danger transition-colors flex items-center justify-center"
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
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge disabled:opacity-45 text-xs font-semibold text-ink transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
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
                    className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-45 text-primary-fg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" />
                    <span>Add Books</span>
                  </button>
                )}
              </div>

              {onDelete && (
                !confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
                    <span>Delete Shelf</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger/10 border border-danger/35 px-3 py-1.5">
                    <span className="text-xs font-semibold text-danger">
                      Delete this shelf?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete();
                        onClose();
                      }}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-danger-solid hover:bg-danger-solid-hover text-danger-solid-fg text-xs font-semibold transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface border border-edge text-xs font-semibold text-ink hover:bg-surface-elevated"
                    >
                      Cancel
                    </button>
                  </div>
                )
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
