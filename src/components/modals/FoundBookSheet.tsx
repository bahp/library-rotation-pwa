import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { AVATAR_TONES } from '../../config/index.js';
import {
  computeOwnerInitials,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  normalizeCollectionStatus,
} from '../../types/models.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';
import type { BookCondition, CollectionStatus } from '../../types/models.js';

interface FoundBookSheetProps {
  candidate: BookCandidate | null;
  isOpen: boolean;
  onAddOwned: (candidate: BookCandidate, options?: { condition?: BookCondition; owners?: string[]; loved?: boolean }) => void;
  onAddWishlist: (candidate: BookCandidate, options?: { condition?: BookCondition; owners?: string[]; loved?: boolean }) => void;
  onEditManual?: (candidate: BookCandidate) => void;
  onRescan?: () => void;
  onClose: () => void;
}

export const FoundBookSheet: React.FC<FoundBookSheetProps> = ({
  candidate,
  isOpen,
  onAddOwned,
  onAddWishlist,
  onEditManual,
  onRescan,
  onClose,
}) => {
  const { state, activeProfile, setInspectedBookId } = useApp();

  const [intakeLoved, setIntakeLoved] = useState(false);
  const [intakeCondition, setIntakeCondition] = useState<BookCondition>('good');
  const [targetStatus, setTargetStatus] = useState<CollectionStatus>('owned');
  const [intakeOwners, setIntakeOwners] = useState<string[]>(() => {
    return activeProfile ? [activeProfile.id, 'shared'] : ['shared'];
  });

  if (!isOpen || !candidate) return null;

  // Check if book already exists in catalog by isbn13 or title
  const existingBook = state.books.find((b) => {
    if (candidate.isbn13 && b.isbn13 === candidate.isbn13) return true;
    if (candidate.isbn10 && b.isbn10 === candidate.isbn10) return true;
    return b.title.trim().toLowerCase() === candidate.title.trim().toLowerCase();
  });

  const existingStatus = existingBook
    ? normalizeCollectionStatus(existingBook.collectionStatus)
    : null;

  const pseudoBook = {
    ...candidate,
    id: existingBook?.id || 'cand_found_preview',
    addedAt: '',
    format: candidate.format || 'hardcover',
    condition: intakeCondition,
    collectionStatus: targetStatus,
    loved: intakeLoved,
    owners: intakeOwners,
  };

  const toggleOwner = (ownerId: string) => {
    setIntakeOwners((prev) => {
      const lower = ownerId.toLowerCase();
      const exists = prev.some((o) => o.toLowerCase() === lower);
      const next = exists
        ? prev.filter((o) => o.toLowerCase() !== lower)
        : [...prev, ownerId];
      return next.length > 0 ? next : ['shared'];
    });
  };

  const handleSaveLibrary = () => {
    onAddOwned(candidate, {
      condition: intakeCondition,
      owners: intakeOwners,
      loved: intakeLoved,
    });
  };

  const handleSaveWishlist = () => {
    onAddWishlist(candidate, {
      condition: intakeCondition,
      owners: intakeOwners,
      loved: intakeLoved,
    });
  };

  const primaryAuthor = candidate.authors[0] || 'Unknown Author';

  return (
    <div
      data-found-book-sheet="true"
      data-backdrop-action="close-found-book-sheet"
      className="sheet-backdrop fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      role="dialog"
      aria-modal="true"
      aria-labelledby="found-book-sheet-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden" aria-hidden="true" />

        {/* Top Bar: Book Found + Re-scan + Close */}
        <div className="px-5 pt-3 pb-3 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-forest-700 dark:text-[#5ED3DA]">
            <Icon name="check" className="w-4 h-4" />
            <span id="found-book-sheet-title">Book Found</span>
          </span>

          <div className="flex items-center gap-1.5">
            {onRescan && (
              <button
                type="button"
                data-action="rescan-book"
                onClick={onRescan}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Icon name="barcode" className="w-4 h-4" />
                <span>Re-scan</span>
              </button>
            )}
            <button
              type="button"
              data-action="close-found-book-sheet"
              onClick={onClose}
              aria-label="Close book details"
              className="min-h-[40px] min-w-[40px] rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 flex items-center justify-center transition-colors"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Cover & Book Details Header */}
          <div className="flex gap-4 items-start">
            <div className="w-20 aspect-[3/4] rounded-xl overflow-hidden shrink-0 shadow-md">
              <BookCover
                book={pseudoBook as any}
                size="md"
                aspectRatio="portrait"
                showBadges={false}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-display text-base font-bold text-forest-900 dark:text-white line-clamp-2 leading-snug">
                {candidate.title}
              </h3>
              <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5 truncate">
                by {primaryAuthor}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-ink dark:text-slate-400 mt-1">
                <span>Ages {candidate.ageMin}–{candidate.ageMax}</span>
                <span>·</span>
                <span>{formatBookBinding(candidate.format || 'hardcover')}</span>
                {candidate.publishedYear && (
                  <>
                    <span>·</span>
                    <span>{candidate.publishedYear}</span>
                  </>
                )}
              </div>

              {candidate.isbn13 && (
                <p className="text-[10px] font-mono text-stone-400 mt-1">
                  ISBN {candidate.isbn13}
                </p>
              )}

              {/* Provider attribution badges */}
              {candidate.sources && candidate.sources.length > 0 && (
                <div className="mt-2">
                  <ProviderAttribution sources={candidate.sources} />
                </div>
              )}
            </div>
          </div>

          {/* If book already exists in family catalog */}
          {existingBook ? (
            <div className="rounded-2xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <p className="text-xs font-bold text-forest-900 dark:text-white">
                  {existingStatus === 'owned'
                    ? 'Already in your Family Library'
                    : `Currently saved in ${formatCollectionStatus(existingStatus || 'wishlist')}`}
                </p>
                <p className="text-[11px] text-stone-ink dark:text-slate-400">
                  Tap Open Book to view and edit details.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {existingStatus !== 'owned' && (
                  <button
                    type="button"
                    data-action="upgrade-existing-owned"
                    onClick={handleSaveLibrary}
                    className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    Mark Owned
                  </button>
                )}
                <button
                  type="button"
                  data-action="inspect-book"
                  data-book-id={existingBook.id}
                  onClick={() => {
                    onClose();
                    setInspectedBookId(existingBook.id);
                  }}
                  className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white transition-colors whitespace-nowrap"
                >
                  Open Book
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 3 Action Buttons: Love, Wishlist, Add to Library */}
              <div className="grid grid-cols-12 gap-2">
                <button
                  type="button"
                  data-action="toggle-intake-loved"
                  aria-pressed={intakeLoved ? 'true' : 'false'}
                  aria-label={intakeLoved ? 'Remove Loved mark' : 'Mark as Loved favorite'}
                  title="Mark as Loved"
                  onClick={() => setIntakeLoved(!intakeLoved)}
                  className={`col-span-3 min-h-[48px] px-2.5 py-2 rounded-2xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-colors ${
                    intakeLoved
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-white border border-linen-200 dark:border-night-700'
                  }`}
                >
                  <Icon name={intakeLoved ? 'heartFilled' : 'heart'} className="w-4 h-4" />
                  <span>{intakeLoved ? 'Loved' : 'Love'}</span>
                </button>

                <button
                  type="button"
                  data-action="save-found-wishlist"
                  aria-label={`Save ${candidate.title} to Wishlist`}
                  title="Save to Wishlist"
                  onClick={handleSaveWishlist}
                  className="col-span-4 min-h-[48px] px-3 py-2 rounded-2xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-espresso-800 dark:text-amber-200 flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-colors"
                >
                  <Icon name="bookmark" className="w-4 h-4" />
                  <span>Wishlist</span>
                </button>

                <button
                  type="button"
                  data-action="save-found-library"
                  aria-label={`Add to Library for ${candidate.title}`}
                  onClick={handleSaveLibrary}
                  className="col-span-5 min-h-[48px] px-3.5 py-2 rounded-2xl bg-forest-700 hover:bg-forest-800 text-xs sm:text-sm font-semibold text-white flex flex-col sm:flex-row items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  <span>Add to Library</span>
                </button>
              </div>

              {/* Progressive Disclosure for Reader Owner, Condition & Manual Edit */}
              <details className="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs select-none">
                  <span className="text-stone-ink dark:text-slate-300">
                    Saving for{' '}
                    <strong className="font-semibold text-forest-900 dark:text-white">
                      {intakeOwners.map((o) => (o === 'shared' ? 'Shared' : state.profiles.find((p) => p.id === o)?.name || o)).join(', ')}
                    </strong>{' '}
                    ·{' '}
                    <strong className="font-semibold text-forest-900 dark:text-white">
                      {formatCollectionStatus(targetStatus)}
                    </strong>
                    {intakeCondition !== 'good' && (
                      <span> · {formatBookCondition(intakeCondition)}</span>
                    )}
                  </span>
                  <span className="font-semibold text-forest-700 dark:text-[#5ED3DA] shrink-0">
                    Customize
                  </span>
                </summary>

                <div className="mt-3 pt-2.5 border-t border-linen-200/80 dark:border-night-800 space-y-3">
                  {/* Readers selection */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1.5">
                      Reader
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {state.profiles.map((p) => {
                        const active = intakeOwners.includes(p.id);
                        const tone = AVATAR_TONES[p.avatarTone || 'teal'] || AVATAR_TONES.teal;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleOwner(p.id)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                              active
                                ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                                : 'bg-linen-100 hover:bg-linen-200 text-stone-700 dark:bg-night-800 dark:text-slate-300'
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${tone}`}
                            >
                              {computeOwnerInitials(p.name)}
                            </span>
                            <span>{p.name}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => toggleOwner('shared')}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                          intakeOwners.includes('shared')
                            ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                            : 'bg-linen-100 hover:bg-linen-200 text-stone-700 dark:bg-night-800 dark:text-slate-300'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 bg-emerald-600 text-white">
                          S
                        </span>
                        <span>Shared</span>
                      </button>
                    </div>
                  </div>

                  {/* Physical condition */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-stone-ink dark:text-slate-400 mb-1.5">
                      Condition
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { id: 'good', label: 'Good' },
                        { id: 'torn', label: 'Torn / Tape' },
                        { id: 'broken', label: 'Broken' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setIntakeCondition(c.id as BookCondition)}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-colors ${
                            intakeCondition === c.id
                              ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                              : 'bg-linen-100 hover:bg-linen-200 text-stone-700 dark:bg-night-800 dark:text-slate-300'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Edit details manually trigger */}
                  {onEditManual && (
                    <div className="pt-1 flex items-center justify-end">
                      <button
                        type="button"
                        data-action="edit-found-book-manual"
                        onClick={() => onEditManual(candidate)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Icon name="edit" className="w-3.5 h-3.5" />
                        <span>Edit Details Manually</span>
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
