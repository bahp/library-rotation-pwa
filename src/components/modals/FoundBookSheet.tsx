import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BookCover } from '../common/BookCover.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { AVATAR_TONES } from '../../config/index.js';
import { extractCoverPaletteFromUrl } from '../../features/catalog/cover-color-extractor.js';
import { isBookDiscardedForProfile } from '../../features/tagging/discovery-engine.js';
import {
  computeOwnerInitials,
  formatBookAgeLabel,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  normalizeCollectionStatus,
} from '../../types/models.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';
import type { BookCondition, CollectionStatus, DynamicCoverTintMode } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

export interface FoundBookIntakeOptions {
  condition?: BookCondition;
  owners?: string[];
  loved?: boolean;
  dominantColor?: string;
  dominantColorSwatches?: string[];
  dominantColorMode?: DynamicCoverTintMode;
}

interface FoundBookSheetProps {
  candidate: BookCandidate | null;
  isOpen: boolean;
  onAddOwned: (candidate: BookCandidate, options?: FoundBookIntakeOptions) => void;
  onAddWishlist: (candidate: BookCandidate, options?: FoundBookIntakeOptions) => void;
  onAddInterested?: (candidate: BookCandidate, options?: FoundBookIntakeOptions) => void;
  onEditManual?: (candidate: BookCandidate) => void;
  onRescan?: () => void;
  onClose: () => void;
}

export const FoundBookSheet: React.FC<FoundBookSheetProps> = ({
  candidate,
  isOpen,
  onAddOwned,
  onAddWishlist,
  onAddInterested,
  onEditManual,
  onRescan,
  onClose,
}) => {
  const { state, store, activeProfile, setInspectedBookId } = useApp();

  const [intakeLoved, setIntakeLoved] = useState(false);
  const [intakeCondition, setIntakeCondition] = useState<BookCondition>('good');
  const [targetStatus] = useState<CollectionStatus>('owned');
  const [intakeOwners, setIntakeOwners] = useState<string[]>(() => {
    return activeProfile ? [activeProfile.id, 'shared'] : ['shared'];
  });
  const [precomputedTint, setPrecomputedTint] = useState<{
    dominantColor?: string;
    dominantColorSwatches?: string[];
    dominantColorMode?: DynamicCoverTintMode;
  }>({});

  const tintMode: DynamicCoverTintMode =
    state.settings?.dynamicCoverTintMode === 'dominant' ||
    state.settings?.dynamicCoverTintMode === 'soft'
      ? state.settings.dynamicCoverTintMode
      : 'prominent';

  useEffect(() => {
    let cancelled = false;
    const url = candidate?.coverUrl?.trim();
    if (!isOpen || !url) {
      setPrecomputedTint({});
      return;
    }
    extractCoverPaletteFromUrl(url, { mode: tintMode })
      .then((palette) => {
        if (cancelled || !palette?.primary) return;
        setPrecomputedTint({
          dominantColor: palette.primary,
          dominantColorSwatches: palette.swatches,
          dominantColorMode: tintMode,
        });
      })
      .catch(() => {
        if (!cancelled) setPrecomputedTint({});
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, candidate?.coverUrl, tintMode]);

  useBodyScrollLock(isOpen && Boolean(candidate));

  if (!isOpen || !candidate) return null;

  const existingBook = state.books.find((b) => {
    if (candidate.isbn13 && b.isbn13 === candidate.isbn13) return true;
    if (candidate.isbn10 && b.isbn10 === candidate.isbn10) return true;
    return b.title.trim().toLowerCase() === candidate.title.trim().toLowerCase();
  });

  const existingStatus = existingBook
    ? normalizeCollectionStatus(existingBook.collectionStatus)
    : null;
  const isExistingDiscarded = existingBook
    ? isBookDiscardedForProfile(existingBook, activeProfile?.id)
    : false;

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
      ...precomputedTint,
    });
  };

  const handleSaveWishlist = () => {
    onAddWishlist(candidate, {
      condition: intakeCondition,
      owners: intakeOwners,
      loved: intakeLoved,
      ...precomputedTint,
    });
  };

  const handleSaveSuggestion = () => {
    onAddInterested?.(candidate, {
      condition: intakeCondition,
      owners: intakeOwners,
      loved: intakeLoved,
      ...precomputedTint,
    });
  };

  const handleDiscard = async () => {
    await store.discardSuggestedBook(existingBook || candidate, activeProfile?.id);
    onClose();
  };

  const handleRestoreDiscarded = async () => {
    if (!existingBook) return;
    await store.restoreDiscardedBook(existingBook.id, activeProfile?.id);
    onClose();
  };

  const primaryAuthor = candidate.authors[0] || 'Unknown Author';
  const candidateAgeLabel = formatBookAgeLabel(candidate.ageMin, candidate.ageMax);

  return (
    <div
      data-found-book-sheet="true"
      data-backdrop-action="close-found-book-sheet"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      role="dialog"
      aria-modal="true"
      aria-labelledby="found-book-sheet-title"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden" aria-hidden="true" />

        {/* Top Bar: Book Found + Re-scan + Close */}
        <div className="px-5 pt-3 pb-3 border-b border-edge-subtle flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Icon name="check" className="w-4 h-4" />
            <span id="found-book-sheet-title">Book Found</span>
          </span>

          <div className="flex items-center gap-1.5">
            {onRescan && (
              <button
                type="button"
                data-action="rescan-book"
                onClick={onRescan}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
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
              className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            >
              <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Cover & Book Details Header */}
          <div className="flex gap-4 items-start">
            <div className="w-20 aspect-[3/4] rounded-lg overflow-hidden shrink-0 shadow-md border border-edge-subtle">
              <BookCover
                book={pseudoBook as any}
                size="md"
                aspectRatio="portrait"
                showBadges={false}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-display text-lg font-semibold text-ink line-clamp-2 leading-snug">
                {candidate.title}
              </h3>
              <p className="text-xs text-ink-secondary mt-0.5 truncate">
                by {primaryAuthor}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-secondary mt-1">
                {candidateAgeLabel && (
                  <>
                    <span>{candidateAgeLabel}</span>
                    <span>·</span>
                  </>
                )}
                <span>{formatBookBinding(candidate.format || 'hardcover')}</span>
                {candidate.publishedYear && (
                  <>
                    <span>·</span>
                    <span className="font-mono-tabular">{candidate.publishedYear}</span>
                  </>
                )}
              </div>

              {candidate.isbn13 && (
                <p className="text-[10px] font-mono-tabular text-ink-muted mt-1">
                  ISBN {candidate.isbn13}
                </p>
              )}

              {candidate.sources && candidate.sources.length > 0 && (
                <div className="mt-2">
                  <ProviderAttribution sources={candidate.sources} />
                </div>
              )}
            </div>
          </div>

          {existingBook ? (
            <div className="rounded-xl bg-surface-subtle border border-edge p-3.5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-ink">
                  {existingStatus === 'owned'
                    ? 'Already in your Family Library'
                    : isExistingDiscarded
                      ? 'Hidden from Suggestions (Not interested)'
                      : `Currently saved in ${formatCollectionStatus(existingStatus || 'wishlist')}`}
                </p>
                <p className="text-[11px] text-ink-secondary">
                  {existingStatus === 'interested'
                    ? 'Queried matches stay in Suggestions so your Library stays tidy. Promote it anytime or mark Not interested.'
                    : 'Tap Open Book to view and edit details.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {existingStatus !== 'owned' && (
                  <button
                    type="button"
                    data-action="upgrade-existing-owned"
                    onClick={handleSaveLibrary}
                    className="min-h-[42px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-xs font-semibold text-primary-fg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" />
                    <span>Add to Library</span>
                  </button>
                )}
                {existingStatus === 'interested' && (
                  <button
                    type="button"
                    data-action="upgrade-existing-wishlist"
                    onClick={handleSaveWishlist}
                    className="min-h-[42px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-accent inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Icon name="wishlist" className="w-3.5 h-3.5" />
                    <span>Wishlist</span>
                  </button>
                )}
                {isExistingDiscarded ? (
                  <button
                    type="button"
                    data-action="restore-discarded-book"
                    onClick={handleRestoreDiscarded}
                    className="min-h-[42px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-primary inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Icon name="check" className="w-3.5 h-3.5" />
                    <span>Restore suggestion</span>
                  </button>
                ) : (
                  (existingStatus === 'interested' || existingStatus === 'wishlist') && (
                    <button
                      type="button"
                      data-action="discard-found-book"
                      onClick={handleDiscard}
                      className="min-h-[42px] px-3 py-1.5 rounded-lg bg-surface hover:bg-danger/10 border border-edge text-xs font-semibold text-ink-secondary hover:text-danger inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Icon name="eyeOff" className="w-3.5 h-3.5" />
                      <span>Not interested</span>
                    </button>
                  )
                )}
                <button
                  type="button"
                  data-action="inspect-book"
                  data-book-id={existingBook.id}
                  onClick={() => {
                    onClose();
                    setInspectedBookId(existingBook.id);
                  }}
                  className="min-h-[42px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors whitespace-nowrap cursor-pointer"
                >
                  Open Book
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Action Buttons: Love, Wishlist, Add to Library (+ optional Save Suggestion) */}
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <button
                    type="button"
                    data-action="toggle-intake-loved"
                    aria-pressed={intakeLoved ? 'true' : 'false'}
                    aria-label={intakeLoved ? 'Remove Loved mark' : 'Mark as Loved favorite'}
                    title="Mark as Loved"
                    onClick={() => setIntakeLoved(!intakeLoved)}
                    className={`col-span-3 min-h-[48px] px-2.5 py-2 rounded-lg text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1 transition-colors cursor-pointer ${
                      intakeLoved
                        ? 'bg-loved text-loved-fg shadow-xs'
                        : 'bg-surface-subtle hover:bg-surface-elevated text-ink border border-edge'
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
                    className="col-span-4 min-h-[48px] px-3 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-accent flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Icon name="wishlist" className="w-4 h-4" />
                    <span>Wishlist</span>
                  </button>

                  <button
                    type="button"
                    data-action="save-found-library"
                    aria-label={`Add to Library for ${candidate.title}`}
                    onClick={handleSaveLibrary}
                    className="col-span-5 min-h-[48px] px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-xs sm:text-sm font-semibold text-primary-fg flex flex-col sm:flex-row items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Add to Library</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onAddInterested && (
                    <button
                      type="button"
                      data-action="save-found-suggestion"
                      aria-label={`Save ${candidate.title} to Suggestions`}
                      onClick={handleSaveSuggestion}
                      className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-surface-subtle/75 hover:bg-surface-elevated border border-edge text-xs font-medium text-ink-secondary hover:text-ink flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Icon name="bookmark" className="w-3.5 h-3.5 text-primary" />
                      <span>Save to Suggestions</span>
                    </button>
                  )}
                  <button
                    type="button"
                    data-action="discard-found-book"
                    onClick={handleDiscard}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface-subtle/75 hover:bg-danger/10 border border-edge text-xs font-medium text-ink-secondary hover:text-danger inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Icon name="eyeOff" className="w-3.5 h-3.5" />
                    <span>Not interested</span>
                  </button>
                </div>
              </div>

              {/* Progressive Disclosure for Reader Owner, Condition & Manual Edit */}
              <details className="rounded-xl bg-surface-subtle border border-edge px-3.5 py-2.5">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-xs select-none">
                  <span className="text-ink-secondary">
                    Saving for{' '}
                    <strong className="font-semibold text-ink">
                      {intakeOwners.map((o) => (o === 'shared' ? 'Shared' : state.profiles.find((p) => p.id === o)?.name || o)).join(', ')}
                    </strong>{' '}
                    ·{' '}
                    <strong className="font-semibold text-ink">
                      {formatCollectionStatus(targetStatus)}
                    </strong>
                    {intakeCondition !== 'good' && (
                      <span> · {formatBookCondition(intakeCondition)}</span>
                    )}
                  </span>
                  <span className="font-semibold text-primary shrink-0">
                    Customize
                  </span>
                </summary>

                <div className="mt-3 pt-2.5 border-t border-edge-subtle space-y-3">
                  {/* Readers selection */}
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1.5">
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
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                              active
                                ? 'bg-primary text-primary-fg'
                                : 'bg-surface hover:bg-surface-elevated border border-edge text-ink-secondary'
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
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          intakeOwners.includes('shared')
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface hover:bg-surface-elevated border border-edge text-ink-secondary'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 bg-secondary text-primary-fg">
                          S
                        </span>
                        <span>Shared</span>
                      </button>
                    </div>
                  </div>

                  {/* Physical condition */}
                  <div>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-1.5">
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
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            intakeCondition === c.id
                              ? 'bg-primary text-primary-fg'
                              : 'bg-surface hover:bg-surface-elevated border border-edge text-ink-secondary'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {onEditManual && (
                    <div className="pt-1 flex items-center justify-end">
                      <button
                        type="button"
                        data-action="edit-found-book-manual"
                        onClick={() => onEditManual(candidate)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer"
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
