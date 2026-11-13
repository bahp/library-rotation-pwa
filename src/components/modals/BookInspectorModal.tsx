import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { StarRating } from '../common/StarRating.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import { compressImageFileToDataUrl } from '../../features/catalog/cover-image-utils.js';
import { resolveBookCardTintHex } from '../../features/catalog/cover-color-extractor.js';
import {
  computeBookUsageSummary,
  formatShortShelfDate,
} from '../../features/rotations/usage-insights.js';
import {
  computeOwnerInitials,
  formatBookBinding,
  formatBookCondition,
  formatCollectionStatus,
  formatReadingStage,
  getBookUserRating,
  isBookRotatable,
  normalizeBookCondition,
  normalizeCollectionStatus,
  normalizeOwnersList,
  resolveBookTagOrigin,
} from '../../types/models.js';
import { AVATAR_TONES } from '../../config/index.js';
import type {
  BookCondition,
  BookFormat,
  CollectionStatus,
  ReadingStage,
  TagOrigin,
} from '../../types/models.js';

const TAG_ORIGIN_META: Record<
  TagOrigin,
  { icon: string; label: string; badgeTitle: string }
> = {
  provider: {
    icon: 'book',
    label: 'Provider',
    badgeTitle: 'From catalog metadata provider',
  },
  ai: {
    icon: 'sparkles',
    label: 'AI',
    badgeTitle: 'From AI Tag Assistant',
  },
  rules: {
    icon: 'compass',
    label: 'Rules',
    badgeTitle: 'From Quick Rules',
  },
  manual: {
    icon: 'edit',
    label: 'Manual',
    badgeTitle: 'Added manually',
  },
};

interface BookInspectorModalProps {
  bookId: string | null;
  onClose: () => void;
  onOpenCoverStudio?: () => void;
}

export const BookInspectorModal: React.FC<BookInspectorModalProps> = ({
  bookId,
  onClose,
}) => {
  const { state, store, catalogService, activeProfile, setAiTagModal } = useApp();

  const book = state.books.find((b) => b.id === bookId);

  const [isEditing, setIsEditing] = useState(false);
  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);
  const [coverSearchQuery, setCoverSearchQuery] = useState('');
  const [coverSearchLoading, setCoverSearchLoading] = useState(false);
  const [coverSearchError, setCoverSearchError] = useState('');
  const [coverSearchResults, setCoverSearchResults] = useState<
    Array<{ title: string; author: string; coverUrl: string; source: string }>
  >([]);

  const [newTagInput, setNewTagInput] = useState('');
  const [newOwnerInput, setNewOwnerInput] = useState('');
  const [editError, setEditError] = useState('');

  // Form edit state
  const [editTitle, setEditTitle] = useState(book?.title || '');
  const [editAuthors, setEditAuthors] = useState((book?.authors || []).join(', '));
  const [editIsbn, setEditIsbn] = useState(book?.isbn13 || book?.isbn10 || '');
  const [editYear, setEditYear] = useState(book?.publishedYear ? String(book.publishedYear) : '');
  const [editPages, setEditPages] = useState(book?.pageCount ? String(book.pageCount) : '');
  const [editFormat, setEditFormat] = useState<BookFormat>(book?.format || 'hardcover');
  const [editStage, setEditStage] = useState<ReadingStage>(book?.readingStage || 'picture-book');
  const [editAgeMin, setEditAgeMin] = useState(book ? String(book.ageMin) : '2');
  const [editAgeMax, setEditAgeMax] = useState(book ? String(book.ageMax) : '6');
  const [editCoverUrl, setEditCoverUrl] = useState(
    book?.coverUrl && book.coverUrl.startsWith('https://') ? book.coverUrl : ''
  );

  // Sync draft state whenever inspected book changes
  useEffect(() => {
    setIsEditing(false);
    setIsCoverPickerOpen(false);
    setCoverSearchError('');
    setCoverSearchResults([]);
    setEditError('');
    setNewTagInput('');
    setNewOwnerInput('');
    if (book) {
      setCoverSearchQuery(`${book.title} ${book.authors[0] || ''}`.trim());
      setEditTitle(book.title);
      setEditAuthors((book.authors || []).join(', '));
      setEditIsbn(book.isbn13 || book.isbn10 || '');
      setEditYear(book.publishedYear ? String(book.publishedYear) : '');
      setEditPages(book.pageCount ? String(book.pageCount) : '');
      setEditFormat(book.format || 'hardcover');
      setEditStage(book.readingStage || 'picture-book');
      setEditAgeMin(String(book.ageMin));
      setEditAgeMax(String(book.ageMax));
      setEditCoverUrl(
        book.coverUrl && book.coverUrl.startsWith('https://') ? book.coverUrl : ''
      );
    }
  }, [bookId]);

  if (!book) return null;

  const activeRot = state.rotations.find(
    (r) => r.profileId === activeProfile?.id && r.status === 'active'
  );
  const effectiveReader =
    activeProfile ||
    (activeRot
      ? state.profiles.find((p) => p.id === activeRot.profileId) || state.profiles[0] || null
      : state.profiles[0] || null);

  const handleRatingChange = async (rating: number) => {
    await store.setUserRating(book.id, rating, effectiveReader?.id);
  };

  const handleToggleLoved = async () => {
    await store.toggleBookLoved(book.id);
  };

  const handleToggleEligibility = async () => {
    await store.toggleBookRotationEligibility(book.id);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    try {
      await store.addBookTag(book.id, newTagInput.trim());
      setNewTagInput('');
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRemoveTag = async (tag: string) => {
    await store.removeBookTag(book.id, tag);
  };

  const handleEnrichRules = async () => {
    try {
      await store.enrichSingleBook(book.id);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleStatusChange = async (status: CollectionStatus) => {
    await store.updateBook(book.id, { collectionStatus: status });
  };

  const handleConditionChange = async (condition: BookCondition) => {
    await store.updateBook(book.id, { condition });
  };

  const handleToggleOwner = async (ownerId: string) => {
    const raw = normalizeOwnersList(book.owners);
    const lower = ownerId.toLowerCase();
    const exists = raw.some((o) => o.toLowerCase() === lower);
    const nextOwners = exists
      ? raw.filter((o) => o.toLowerCase() !== lower)
      : [...raw, ownerId];
    await store.updateBook(book.id, {
      owners: nextOwners.length > 0 ? nextOwners : ['shared'],
    });
  };

  const handleAddCustomOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newOwnerInput.trim();
    if (!trimmed) return;
    const raw = normalizeOwnersList(book.owners);
    if (!raw.some((o) => o.toLowerCase() === trimmed.toLowerCase())) {
      await store.updateBook(book.id, {
        owners: [...raw, trimmed],
      });
    }
    setNewOwnerInput('');
  };

  const handleCoverSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = coverSearchQuery.trim() || `${book.title} ${book.authors[0] || ''}`.trim();
    if (!q) return;

    setCoverSearchLoading(true);
    setCoverSearchError('');

    try {
      const res = await catalogService.searchBooks(
        { query: q },
        {
          retainRaw: false,
          enabledProviderIds: state.settings?.enabledMetadataProviders,
          limit: 10,
        }
      );

      const seen = new Set<string>();
      const results: Array<{ title: string; author: string; coverUrl: string; source: string }> = [];

      for (const cand of res.candidates) {
        if (!cand.coverUrl || seen.has(cand.coverUrl)) continue;
        seen.add(cand.coverUrl);
        results.push({
          title: cand.title,
          author: cand.authors[0] || '',
          coverUrl: cand.coverUrl,
          source: cand.sources[0]?.provider === 'open-library' ? 'Open Library' : 'Google Books',
        });
        if (results.length >= 8) break;
      }

      setCoverSearchResults(results);
      if (results.length === 0) {
        setCoverSearchError('No cover images found. Try different keywords.');
      }
    } catch (err) {
      setCoverSearchError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoverSearchLoading(false);
    }
  };

  const handleSelectCover = async (coverUrl: string) => {
    await store.updateBook(book.id, { coverUrl });
    setIsCoverPickerOpen(false);
  };

  const handleClearCover = async () => {
    await store.updateBook(book.id, { coverUrl: '' });
    setIsCoverPickerOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      await store.updateBook(book.id, { coverUrl: dataUrl });
      setIsCoverPickerOpen(false);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleSaveEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editTitle.trim()) {
      setEditError('Title is required.');
      return;
    }

    try {
      const authorsList = editAuthors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const patch: Record<string, unknown> = {
        title: editTitle.trim(),
        authors: authorsList.length > 0 ? authorsList : ['Unknown Author'],
        isbn: editIsbn.trim() || undefined,
        publishedYear: editYear ? Number(editYear) : null,
        pageCount: editPages ? Number(editPages) : null,
        format: editFormat,
        readingStage: editStage,
        ageMin: Number(editAgeMin),
        ageMax: Number(editAgeMax),
      };

      if (editCoverUrl.trim() || !(book.coverUrl || '').startsWith('data:image/')) {
        patch.coverUrl = editCoverUrl.trim();
      }

      await store.updateBook(book.id, patch);
      setIsEditing(false);
      store.notify('Book details updated!', 'success');
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to remove "${book.title}" from your family library?`)) {
      await store.deleteBook(book.id);
      onClose();
    }
  };

  const currentStatus = normalizeCollectionStatus(book.collectionStatus);
  const currentCondition = normalizeBookCondition(book.condition);
  const isExcluded = Boolean(book.excludeFromRotations);
  const rotatable = isBookRotatable(book);

  const rawOwners = normalizeOwnersList(book.owners);
  const currentOwners = rawOwners.length > 0 ? rawOwners : ['shared'];
  const profileIdsLower = new Set(state.profiles.map((p) => p.id.toLowerCase()));
  const customAssignedOwners = currentOwners.filter(
    (o) => o.toLowerCase() !== 'shared' && !profileIdsLower.has(o.toLowerCase())
  );

  const ownerToggleChips = [
    { key: 'shared', label: 'Shared', initial: 'S', tone: 'emerald' },
    ...state.profiles.map((p) => ({
      key: p.id,
      label: p.name,
      initial: computeOwnerInitials(p.name),
      tone: p.avatarTone || 'teal',
    })),
    ...customAssignedOwners.map((custom) => ({
      key: custom,
      label: custom,
      initial: computeOwnerInitials(custom),
      tone: 'indigo',
    })),
  ];

  const dynamicCoverTint = state.settings?.dynamicCoverTint !== false;
  const tintHex = resolveBookCardTintHex(book);
  const dialogTintStyle = dynamicCoverTint
    ? ({ '--lr-cover-tint': tintHex } as React.CSSProperties)
    : undefined;

  const inActiveShelf = Boolean(activeRot && activeRot.bookIds.includes(book.id));
  const isReadInActive = Boolean(activeRot && activeRot.completedBookIds?.includes(book.id));
  const isPickedInActive = Boolean(activeRot && activeRot.pickedBookIds?.includes(book.id));

  const usageSummary = computeBookUsageSummary(book, {
    profiles: state.profiles,
    rotations: state.rotations,
    activeProfile: effectiveReader,
    activeRotation: activeRot || null,
    staleBookDays: state.settings?.staleBookDays ?? 10,
  });

  const usageSegments: string[] = [];
  if (usageSummary.isCurrentlyOnActiveShelf) {
    usageSegments.push(
      usageSummary.daysOnActiveShelf && usageSummary.daysOnActiveShelf > 0
        ? `On active shelf ${usageSummary.daysOnActiveShelf}d`
        : 'On active shelf today'
    );
    if (usageSummary.isPickedInActiveShelf && usageSummary.isReadInActiveShelf) {
      usageSegments.push('Picked & read this cycle');
    } else if (usageSummary.isPickedInActiveShelf) {
      usageSegments.push('Picked this cycle');
    } else if (usageSummary.isStaleUnreadOnShelf) {
      usageSegments.push('Unread this cycle');
    } else if (usageSummary.isReadInActiveShelf) {
      usageSegments.push('Read this cycle');
    }
  } else if (usageSummary.neverRotated) {
    usageSegments.push('Never rotated yet');
  } else if (usageSummary.lastRotatedAt) {
    const shortDate = formatShortShelfDate(usageSummary.lastRotatedAt);
    const agoPart =
      usageSummary.daysSinceLastRotated === 0 ? 'today' : `${usageSummary.daysSinceLastRotated}d ago`;
    usageSegments.push(`Last on shelf ${shortDate} (${agoPart})`);
    if (usageSummary.inCooldown) {
      usageSegments.push(`Cooldown: ${usageSummary.cooldownDaysRemaining}d left`);
    } else if (
      usageSummary.rotationsSinceLastOut !== null &&
      usageSummary.rotationsSinceLastOut >= 2
    ) {
      usageSegments.push(`Unseen ${usageSummary.rotationsSinceLastOut} rotations`);
    }
  }
  if (usageSummary.rotationCount > 0) {
    usageSegments.push(`Rotated ${usageSummary.rotationCount}×`);
  }
  if (usageSummary.readByProfileNames.length > 0) {
    const readDateSuffix = usageSummary.lastReadAt
      ? ` (${formatShortShelfDate(usageSummary.lastReadAt)})`
      : '';
    const readPrefix =
      usageSummary.isCurrentlyOnActiveShelf &&
      !usageSummary.isReadInActiveShelf &&
      !usageSummary.isPickedInActiveShelf
        ? 'Read earlier with'
        : 'Read with';
    usageSegments.push(`${readPrefix} ${usageSummary.readByProfileNames.join(', ')}${readDateSuffix}`);
  } else {
    usageSegments.push('Unread together');
  }

  const showRotationHistory = state.settings?.enableRotationHistoryInsights !== false;

  const hintParts = book.readingLevelHint
    ? String(book.readingLevelHint)
        .split('·')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const isbnVal = book.isbn13 || book.isbn10;
  const hasRawPayloads = book.sources?.some((s) => Boolean(s.rawPayload));
  const aiSources = (book.sources || []).filter((s) =>
    String(s?.provider || '').toLowerCase().startsWith('ai:')
  );
  const editionSpecs = [
    book.pageCount ? `${book.pageCount} pp` : '',
    book.publishedYear ? String(book.publishedYear) : '',
    book.language && book.language !== 'english' ? book.language : '',
    book.publisher || '',
  ].filter(Boolean);
  const readerRating = getBookUserRating(book, effectiveReader?.id);

  return (
    <div
      data-backdrop-action="close-inspect-book"
      className="sheet-backdrop fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-book-title"
        style={dialogTintStyle}
        data-cover-tint={dynamicCoverTint ? tintHex : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`animate-sheet-up w-full max-w-lg sm:max-w-xl lg:max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl ${
          dynamicCoverTint ? 'lr-tinted-card ' : ''
        }bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden`}
      >
        {/* Mobile Handle Pill */}
        <div className="w-10 h-1.5 bg-linen-200 dark:bg-night-700 rounded-full mx-auto mt-3 sm:hidden shrink-0" aria-hidden="true" />

        {/* Top Utility Header: Calm Status Context (left) + Love / Edit / Close (right) */}
        <div className="px-5 pt-3 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 truncate flex items-center gap-1.5 text-xs text-stone-ink dark:text-slate-400">
            <span className="font-semibold text-forest-900 dark:text-slate-200">
              {formatCollectionStatus(currentStatus)}
            </span>
            <span aria-hidden="true" className="opacity-50">·</span>
            <span className="truncate">{formatBookBinding(book.format)}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-action="toggle-book-loved"
              onClick={handleToggleLoved}
              aria-pressed={book.loved ? 'true' : 'false'}
              aria-label={book.loved ? 'Remove Loved mark' : 'Mark as Loved'}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                book.loved
                  ? 'bg-rose-600 text-white'
                  : 'bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
              }`}
            >
              <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-3.5 h-3.5" />
              <span>{book.loved ? 'Loved' : 'Love'}</span>
            </button>

            <button
              type="button"
              data-action="toggle-edit-book-info"
              onClick={() => setIsEditing((prev) => !prev)}
              aria-pressed={isEditing ? 'true' : 'false'}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isEditing
                  ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                  : 'bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-forest-900 dark:text-slate-200'
              }`}
            >
              <Icon name="edit" className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>

            <button
              type="button"
              data-action="close-inspect-book"
              onClick={onClose}
              aria-label="Close book details"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800 transition-colors"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Card Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Hero Identity: Cover + Stars Underneath (left) + Title, Author, Metadata Block & ISBN (right) */}
          <div className="flex items-start gap-3.5 sm:gap-4 min-w-0">
            <div className="flex flex-col items-center shrink-0">
              <button
                type="button"
                data-action="toggle-cover-picker"
                aria-expanded={isCoverPickerOpen}
                aria-label={`Change cover for ${book.title}`}
                title="Tap to change book cover"
                onClick={() => setIsCoverPickerOpen((prev) => !prev)}
                className="group relative rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 transition-transform active:scale-95"
              >
                <BookCover
                  book={book}
                  size="md"
                  aspectRatio={state.settings?.coverAspectRatio || 'portrait'}
                />
                <span
                  data-cover-badge="centered"
                  className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-20 flex justify-center"
                >
                  <span className="px-2 py-0.5 rounded-lg bg-night-950/80 backdrop-blur-xs text-ivory text-[10px] font-semibold inline-flex items-center justify-center gap-1 shadow-xs whitespace-nowrap">
                    <Icon name="camera" className="w-3 h-3" />
                    <span>{isCoverPickerOpen ? 'Close' : 'Cover'}</span>
                  </span>
                </span>
              </button>

              {/* Per-Reader 5 Stars Underneath the Cover Image */}
              <div className="mt-2 flex flex-col items-center justify-center" data-inspector-cover-stars="true">
                <StarRating
                  rating={readerRating}
                  onChange={handleRatingChange}
                  size="sm"
                  compact
                  dataInspectorCoverStars
                />
                {effectiveReader && (
                  <span className="mt-0.5 text-[10px] text-stone-ink/75 dark:text-slate-400 leading-tight">
                    {effectiveReader.name}’s rating
                  </span>
                )}
                {book.averageRating ? (
                  <span
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-mono-tabular text-stone-ink/75 dark:text-slate-400"
                    title="Catalog community rating"
                  >
                    <span className="text-amber-500">★</span>
                    <span>
                      {book.averageRating}
                      {book.ratingsCount ? ` (${book.ratingsCount})` : ''}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <h2
                id="inspect-book-title"
                className="font-display text-lg sm:text-xl font-bold text-forest-900 dark:text-white leading-snug text-balance"
              >
                {book.title}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-stone-ink dark:text-slate-300 mt-0.5">
                {book.authors.join(', ')}
              </p>

              {/* De-crowded 2-Tier Metadata Block: Reading Fit -> Edition Specs -> Storytime Pacing -> ISBN */}
              <div className="mt-2.5 space-y-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-stone-ink dark:text-slate-300">
                  <span
                    className="font-bold text-forest-900 dark:text-white whitespace-nowrap cursor-help"
                    title="Recommended reading ages (tap Edit to adjust)"
                  >
                    Ages {book.ageMin}–{book.ageMax}
                  </span>
                  <span aria-hidden="true" className="text-stone-ink/40 select-none">·</span>
                  <span className="whitespace-nowrap">{formatReadingStage(book.readingStage)}</span>
                </div>

                {editionSpecs.length > 0 && (
                  <p className="text-[11px] text-stone-ink/85 dark:text-slate-400 leading-snug">
                    {editionSpecs.join(' · ')}
                  </p>
                )}

                {hintParts.length > 0 && (
                  <p
                    className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium leading-snug"
                    title="Read-aloud pacing & duration"
                  >
                    {hintParts.join(' · ')}
                  </p>
                )}

                {isbnVal && (
                  <p className="text-[11px] font-mono-tabular text-stone-ink/75 dark:text-slate-400 select-all">
                    ISBN {isbnVal}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Contextual Drawer 1: Cover Studio (opens when tapping cover) */}
          {isCoverPickerOpen && (
            <section
              aria-label="Change book cover"
              className="rounded-2xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-forest-900 dark:text-white">Cover Studio</p>
                  <p className="text-[11px] text-stone-ink dark:text-slate-400">
                    Choose a photo, snap a picture, or search Google Books &amp; Open Library.
                  </p>
                </div>
                {book.coverUrl && (
                  <button
                    type="button"
                    data-action="clear-book-cover"
                    onClick={handleClearCover}
                    className="min-h-[36px] px-2.5 py-1 rounded-xl text-[11px] font-semibold text-stone-ink hover:text-rose-700 dark:text-slate-400 dark:hover:text-rose-300 transition-colors shrink-0"
                  >
                    Cloth Cover
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="min-h-[44px] px-3 py-2 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <Icon name="photo" className="w-4 h-4" />
                  <span>From Phone</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>

                <label className="min-h-[44px] px-3 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                  <Icon name="camera" className="w-4 h-4" />
                  <span>Take Picture</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              <form onSubmit={handleCoverSearch} className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <ClearableInput
                    id="inspector-cover-search-input"
                    value={coverSearchQuery}
                    onValueChange={setCoverSearchQuery}
                    placeholder="Search Google Books / Open Library covers…"
                    className="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={coverSearchLoading}
                  className="h-12 px-3.5 rounded-xl bg-forest-900 hover:bg-forest-800 disabled:opacity-55 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Icon name="search" className="w-3.5 h-3.5" />
                  <span>{coverSearchLoading ? 'Searching…' : 'Search'}</span>
                </button>
              </form>

              {coverSearchError && (
                <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
                  {coverSearchError}
                </p>
              )}

              {coverSearchResults.length > 0 && (
                <div className="grid grid-cols-4 gap-2 pt-0.5">
                  {coverSearchResults.map((res, i) => (
                    <button
                      key={`${res.coverUrl}-${i}`}
                      type="button"
                      onClick={() => handleSelectCover(res.coverUrl)}
                      className="group flex flex-col items-center text-left rounded-xl p-1 bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 transition-transform active:scale-95"
                    >
                      <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-linen-100 dark:bg-night-800">
                        <img
                          src={res.coverUrl}
                          alt={res.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="mt-1 text-[10px] text-stone-ink dark:text-slate-400 truncate w-full text-center">
                        {res.source}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Contextual Drawer 2: Bibliographic Details Editor (opens when tapping Edit) */}
          {isEditing && (
            <form
              id="edit-book-form"
              onSubmit={handleSaveEdits}
              noValidate
              className="rounded-2xl bg-linen-50/90 dark:bg-night-950/70 border border-linen-200 dark:border-night-800 p-3.5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-forest-900 dark:text-white">
                  Edit Bibliographic Info
                </p>
                <span className="text-[11px] text-stone-ink dark:text-slate-400">
                  Saved on device
                </span>
              </div>

              {editError && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3.5 py-2 text-xs font-medium text-rose-800 dark:text-rose-200"
                >
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="edit-book-title"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    Title *
                  </label>
                  <ClearableInput
                    id="edit-book-title"
                    value={editTitle}
                    onValueChange={setEditTitle}
                    className="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-book-authors"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    Author(s)
                  </label>
                  <ClearableInput
                    id="edit-book-authors"
                    value={editAuthors}
                    onValueChange={setEditAuthors}
                    className="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-book-isbn"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    ISBN (optional)
                  </label>
                  <ClearableInput
                    id="edit-book-isbn"
                    value={editIsbn}
                    onValueChange={setEditIsbn}
                    className="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  />
                </div>

                <div>
                  <label
                    htmlFor="edit-book-format"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    Binding Format
                  </label>
                  <select
                    id="edit-book-format"
                    value={editFormat}
                    onChange={(e) => setEditFormat(e.target.value as BookFormat)}
                    className="w-full h-12 px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  >
                    <option value="hardcover">Hardcover</option>
                    <option value="board-book">Board Book</option>
                    <option value="paperback">Paperback</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-book-stage"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    Reading Stage
                  </label>
                  <select
                    id="edit-book-stage"
                    value={editStage}
                    onChange={(e) => setEditStage(e.target.value as ReadingStage)}
                    className="w-full h-12 px-3.5 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  >
                    <option value="board-toddler">Board &amp; Toddler</option>
                    <option value="picture-book">Picture Book</option>
                    <option value="early-reader">Early Reader</option>
                    <option value="chapter-book">Chapter Book</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="edit-book-age-min"
                      className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                    >
                      Min Age
                    </label>
                    <input
                      id="edit-book-age-min"
                      type="number"
                      min={0}
                      max={16}
                      value={editAgeMin}
                      onChange={(e) => setEditAgeMin(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-book-age-max"
                      className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                    >
                      Max Age
                    </label>
                    <input
                      id="edit-book-age-max"
                      type="number"
                      min={0}
                      max={18}
                      value={editAgeMax}
                      onChange={(e) => setEditAgeMax(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="edit-book-pages"
                      className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                    >
                      Pages
                    </label>
                    <input
                      id="edit-book-pages"
                      type="number"
                      min={1}
                      max={2000}
                      value={editPages}
                      placeholder="—"
                      onChange={(e) => setEditPages(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="edit-book-year"
                      className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                    >
                      Year
                    </label>
                    <input
                      id="edit-book-year"
                      type="number"
                      min={1800}
                      max={2100}
                      value={editYear}
                      placeholder="—"
                      onChange={(e) => setEditYear(e.target.value)}
                      className="w-full h-12 px-3 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm font-mono-tabular text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="edit-book-cover-url"
                    className="block text-xs font-semibold text-forest-900 dark:text-slate-200 mb-1"
                  >
                    HTTPS Cover URL (optional
                    {book.coverUrl && book.coverUrl.startsWith('data:image/')
                      ? ' · custom photo saved'
                      : ''}
                    )
                  </label>
                  <ClearableInput
                    id="edit-book-cover-url"
                    value={editCoverUrl}
                    onValueChange={setEditCoverUrl}
                    placeholder="https://covers.openlibrary.org/..."
                    className="w-full h-12 pl-3.5 pr-9 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-sm text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                  />
                </div>
              </div>

              <div className="pt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Save Changes
                </button>
              </div>
            </form>
          )}

          {/* Quick Shelf & Read Bar */}
          <div className="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-stone-ink dark:text-slate-300">
                {inActiveShelf
                  ? 'On current rotation shelf'
                  : rotatable
                    ? activeRot
                      ? 'Available for active shelf'
                      : 'Ready in family library'
                    : isExcluded
                      ? 'Excluded from auto-rotations'
                      : `${formatCollectionStatus(currentStatus)} (${formatBookCondition(
                          currentCondition
                        )}) — off auto-rotations`}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {inActiveShelf && activeRot ? (
                  <>
                    <button
                      type="button"
                      onClick={() => store.toggleRotationBookPicked(activeRot.id, book.id)}
                      aria-pressed={isPickedInActive}
                      title={
                        isPickedInActive
                          ? 'Picked during this rotation (tap to unmark picked)'
                          : 'Mark picked during this rotation (automatically marks read)'
                      }
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isPickedInActive
                          ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                          : 'bg-ivory hover:bg-linen-100 text-forest-900 dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-100 border border-linen-200 dark:border-night-700'
                      }`}
                    >
                      <Icon
                        name={isPickedInActive ? 'bookmarkFilled' : 'bookmark'}
                        className="w-3.5 h-3.5"
                      />
                      <span>{isPickedInActive ? 'Picked' : 'Mark Picked'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => store.toggleRotationBookRead(activeRot.id, book.id)}
                      aria-pressed={isReadInActive}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isReadInActive
                          ? 'bg-forest-700 text-white dark:bg-forest-600'
                          : 'bg-ivory hover:bg-linen-100 text-forest-900 dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-100 border border-linen-200 dark:border-night-700'
                      }`}
                    >
                      <Icon name="check" className="w-3.5 h-3.5" />
                      <span>{isReadInActive ? 'Read · Undo' : 'Mark Read'}</span>
                    </button>

                    {!isReadInActive && usageSummary.isReadByActiveProfile && effectiveReader && (
                      <button
                        type="button"
                        onClick={() => store.toggleProfileBookRead(effectiveReader.id, book.id)}
                        title="Clear previous Read status for this reader"
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-ivory hover:bg-rose-50 dark:bg-night-900 dark:hover:bg-rose-950/40 border border-linen-200 dark:border-night-700 text-xs font-semibold text-stone-ink hover:text-rose-700 dark:text-slate-300 dark:hover:text-rose-300 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Icon name="close" className="w-3.5 h-3.5" />
                        <span>Clear Read</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => store.replaceRotationBookRandom(activeRot.id, book.id)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-ivory hover:bg-linen-100 dark:bg-night-900 dark:hover:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-100 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Icon name="shuffle" className="w-3.5 h-3.5" />
                      <span>Swap Book</span>
                    </button>
                  </>
                ) : (
                  rotatable && (
                    <>
                      {effectiveReader && (
                        <button
                          type="button"
                          onClick={() => store.toggleProfileBookRead(effectiveReader.id, book.id)}
                          aria-pressed={usageSummary.isReadByActiveProfile}
                          className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                            usageSummary.isReadByActiveProfile
                              ? 'bg-forest-700 text-white dark:bg-forest-600'
                              : 'bg-ivory hover:bg-linen-100 text-forest-900 dark:bg-night-900 dark:hover:bg-night-800 dark:text-slate-100 border border-linen-200 dark:border-night-700'
                          }`}
                        >
                          <Icon name="check" className="w-3.5 h-3.5" />
                          <span>
                            {usageSummary.isReadByActiveProfile ? 'Read · Undo' : 'Mark Read'}
                          </span>
                        </button>
                      )}
                      {activeRot && (
                        <button
                          type="button"
                          onClick={async () => {
                            await store.addBooksToRotationManual(activeRot.id, [book.id]);
                            store.notify(`Added "${book.title}" to active shelf!`, 'success');
                          }}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                          <span>Add to Active Shelf</span>
                        </button>
                      )}
                    </>
                  )
                )}
              </div>
            </div>

            {showRotationHistory && rotatable && (
              <p
                data-book-usage-summary="true"
                className={`text-[11px] font-mono-tabular ${
                  usageSummary.isStaleUnreadOnShelf
                    ? 'font-semibold text-amber-800 dark:text-amber-300'
                    : 'text-stone-ink dark:text-slate-400'
                }`}
              >
                {usageSegments.join(' · ')}
              </p>
            )}
          </div>

          {/* Unified Customize Table: Reader, Shelf, Condition, Rotations */}
          <section
            aria-label="Customize reader, shelf status, and condition"
            className="rounded-2xl bg-linen-50/85 dark:bg-night-950/65 border border-linen-200 dark:border-night-800 px-3.5 py-2.5 text-xs"
          >
            <div className="divide-y divide-linen-200/70 dark:divide-night-800/80">
              {/* Row 1: Reader / Household Owners */}
              <div data-customize-row="owner" className="py-2 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">
                    Reader
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {ownerToggleChips.map((chip) => {
                      const active = currentOwners.some(
                        (o) => o.toLowerCase() === chip.key.toLowerCase()
                      );
                      const tone = AVATAR_TONES[chip.tone] || AVATAR_TONES.teal;
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => handleToggleOwner(chip.key)}
                          aria-pressed={active}
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-forest-900 text-white dark:bg-linen-100 dark:text-night-950'
                              : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ${tone}`}
                          >
                            {chip.initial}
                          </span>
                          <span>{chip.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <details className="group">
                  <summary className="cursor-pointer list-none flex justify-end text-[11px] font-semibold text-forest-700 dark:text-[#5ED3DA] select-none">
                    <span>+ Custom owner / house</span>
                  </summary>
                  <form onSubmit={handleAddCustomOwner} className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <ClearableInput
                        id="inspector-new-owner-input"
                        value={newOwnerInput}
                        onValueChange={setNewOwnerInput}
                        placeholder="e.g., Grandma's House, Cousin Maya"
                        className="w-full h-11 pl-3 pr-8 rounded-xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-11 px-3 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      Add
                    </button>
                  </form>
                </details>
              </div>

              {/* Row 2: Shelf Status (Owned vs Wishlist) */}
              <div
                data-customize-row="status"
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <span className="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">
                  Shelf
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {(['owned', 'wishlist'] as CollectionStatus[]).map((st) => {
                    const active = currentStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStatusChange(st)}
                        aria-pressed={active}
                        className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                            : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                        }`}
                      >
                        {formatCollectionStatus(st)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Physical Condition */}
              <div
                data-customize-row="condition"
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <span className="text-xs font-semibold text-stone-ink dark:text-slate-300 shrink-0">
                  Condition
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {(['good', 'torn', 'broken', 'retired'] as BookCondition[]).map((cond) => {
                    const active = currentCondition === cond;
                    const activeClass =
                      cond === 'broken' || cond === 'retired'
                        ? 'bg-rose-700 text-white'
                        : cond === 'torn'
                          ? 'bg-amber-700 text-white'
                          : 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950';
                    return (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => handleConditionChange(cond)}
                        aria-pressed={active}
                        className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? activeClass
                            : 'bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-ink dark:text-slate-300'
                        }`}
                      >
                        {formatBookCondition(cond)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Rotations Eligibility */}
              <div
                data-customize-row="rotations"
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <div>
                  <span className="text-xs font-semibold text-stone-ink dark:text-slate-300 block">
                    Rotations
                  </span>
                  <p className="text-[11px] text-stone-ink/80 dark:text-slate-400">
                    {isExcluded ? 'Excluded from shelf rotations' : 'Eligible for shelf rotations'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  onClick={handleToggleEligibility}
                  aria-checked={!isExcluded}
                  className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                    isExcluded
                      ? 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300 border border-linen-200 dark:border-night-700'
                      : 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                  }`}
                >
                  {isExcluded ? 'Excluded' : 'Included'}
                </button>
              </div>
            </div>
          </section>

          {/* Topics & Themes Curation */}
          <section
            aria-label="Topics and themes"
            className="space-y-2.5 text-xs text-stone-ink dark:text-slate-300"
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs font-bold text-forest-900 dark:text-white">
                Topics &amp; Themes
              </strong>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-action="open-ai-tag-modal"
                  onClick={() => setAiTagModal({ isOpen: true, bookId: book.id })}
                  title="Query LLM for interactive features, developmental themes & story tags"
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Icon name="sparkles" className="w-3.5 h-3.5" />
                  <span>AI Tag Assistant</span>
                </button>
                <button
                  type="button"
                  data-action="enrich-book-tags"
                  onClick={handleEnrichRules}
                  title="Quick local rule enrichment"
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-linen-100/90 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <span>Quick Rules</span>
                </button>
              </div>
            </div>

            {book.tags.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {book.tags.map((tag) => {
                    const origin = resolveBookTagOrigin(book, tag);
                    const meta = TAG_ORIGIN_META[origin];
                    return (
                      <button
                        key={tag}
                        type="button"
                        data-tag-origin={origin}
                        onClick={() => handleRemoveTag(tag)}
                        title={`${meta.badgeTitle} — tap to remove "${tag}"`}
                        aria-label={`Remove topic ${tag} (${meta.label})`}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-linen-100/90 hover:bg-rose-50 dark:bg-night-800 dark:hover:bg-rose-950/50 text-xs font-medium text-forest-900 hover:text-rose-700 dark:text-slate-200 dark:hover:text-rose-300 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Icon
                          name={meta.icon}
                          className="w-3 h-3 opacity-60 shrink-0"
                        />
                        <span>{tag}</span>
                        <span aria-hidden="true" className="opacity-55">×</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quiet Origin Micro-Legend */}
                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-ink/75 dark:text-slate-400 pt-0.5"
                  aria-label="Topic origin legend"
                >
                  {(['provider', 'ai', 'rules', 'manual'] as TagOrigin[]).map((originKey) => {
                    const meta = TAG_ORIGIN_META[originKey];
                    return (
                      <span
                        key={originKey}
                        className="inline-flex items-center gap-1 whitespace-nowrap"
                        title={meta.badgeTitle}
                      >
                        <Icon name={meta.icon} className="w-2.5 h-2.5 opacity-75" />
                        <span>{meta.label}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-stone-ink dark:text-slate-400">No topics tagged yet.</p>
            )}

            <form onSubmit={handleAddTag} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ClearableInput
                  id="inspector-new-tag-input"
                  value={newTagInput}
                  onValueChange={setNewTagInput}
                  placeholder="Add topic (e.g., bedtime, dinosaurs)"
                  className="w-full h-11 pl-3 pr-8 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-base sm:text-xs text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                />
              </div>
              <button
                type="submit"
                className="h-11 px-3.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Add Tag
              </button>
            </form>
          </section>

          {/* Quiet Footer: Source Attribution + External IDs + Preview + Raw Payloads + Remove Book */}
          <div className="pt-3 border-t border-linen-200/80 dark:border-night-800 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                <ProviderAttribution
                  sources={book.sources}
                  prefix="Sources:"
                  includeExternalIds
                />

                {aiSources.length > 0 && (
                  <span
                    className="text-[11px] text-stone-ink/75 dark:text-slate-400 whitespace-nowrap cursor-help"
                    title={`AI enrichment via ${aiSources
                      .map((s) => String(s.provider || '').replace(/^ai:/i, ''))
                      .join(', ')}`}
                  >
                    · AI-assisted
                  </span>
                )}

                {book.previewLink && (
                  <a
                    href={book.previewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-forest-700 hover:underline dark:text-[#5ED3DA] inline-flex items-center gap-0.5 whitespace-nowrap"
                  >
                    <span>Preview ↗</span>
                  </a>
                )}
              </div>

              <button
                type="button"
                data-action="delete-book"
                onClick={handleDelete}
                aria-label={`Remove ${book.title} from catalog`}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Icon name="trash" className="w-3.5 h-3.5" />
                <span>Remove Book</span>
              </button>
            </div>

            {hasRawPayloads && (
              <details className="pt-0.5">
                <summary className="cursor-pointer font-semibold text-forest-700 dark:text-[#5ED3DA]">
                  View Captured Raw Provider Payloads
                </summary>
                <pre className="mt-2 p-3 rounded-xl bg-night-950 text-slate-100 font-mono-tabular text-[11px] overflow-x-auto max-h-52">
                  {JSON.stringify(book.sources, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
