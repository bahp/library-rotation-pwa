import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { StarRating } from '../common/StarRating.js';
import { Icon } from '../common/Icon.js';
import { ToggleSwitch } from '../common/ToggleSwitch.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import {
  EditorialFieldSheet,
  formatBookDimensionsLabel,
  type EditorialFieldKey,
} from './EditorialFieldSheet.js';
import { getBookAudioBlob } from '../../core/storage.js';
import { compressImageFileToDataUrl } from '../../features/catalog/cover-image-utils.js';
import { resolveBookCardTintHex } from '../../features/catalog/cover-color-extractor.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { CoverGridSkeleton } from '../common/SkeletonLoaders.js';
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
  BookNote,
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
  const { state, store, catalogService, activeProfile, setAiTagModal, navigate } = useApp();

  const book = state.books.find((b) => b.id === bookId);
  const detailStyle = state.settings?.bookDetailStyle || 'compact';

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
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Editorial layout interactive states
  const [editorialStatusMenuOpen, setEditorialStatusMenuOpen] = useState(false);
  const [editorialReadMenuOpen, setEditorialReadMenuOpen] = useState(false);
  const [editorialEditionExpanded, setEditorialEditionExpanded] = useState(true);
  const [activeEditorialField, setActiveEditorialField] = useState<EditorialFieldKey | null>(null);

  // Quotes & Notes composer / inline editor states
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [noteAuthorId, setNoteAuthorId] = useState('');
  const [noteForProfileId, setNoteForProfileId] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [noteError, setNoteError] = useState('');

  // Audio recording & playback states
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const [audioTitleDraft, setAudioTitleDraft] = useState('');
  const [audioAuthorId, setAudioAuthorId] = useState('');
  const [audioForProfileId, setAudioForProfileId] = useState('');
  const [audioError, setAudioError] = useState('');
  const [audioSaving, setAudioSaving] = useState(false);
  const [audioObjectUrls, setAudioObjectUrls] = useState<Record<string, string>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const audioUrlsRef = useRef<Record<string, string>>({});

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
  const [editPublisher, setEditPublisher] = useState(book?.publisher || '');
  const [editLanguage, setEditLanguage] = useState(book?.language || '');
  const [editCoverUrl, setEditCoverUrl] = useState(
    book?.coverUrl && book.coverUrl.startsWith('https://') ? book.coverUrl : ''
  );

  const stopActiveRecorderResources = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.onstop = null;
        rec.stop();
      } catch {
        // ignore cleanup stop errors
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }
    setIsRecordingAudio(false);
    setRecordingElapsedSec(0);
  };

  // Sync draft state whenever inspected book changes
  useEffect(() => {
    stopActiveRecorderResources();
    setIsEditing(false);
    setIsCoverPickerOpen(false);
    setCoverSearchError('');
    setCoverSearchResults([]);
    setEditError('');
    setConfirmDelete(false);
    setNewTagInput('');
    setNewOwnerInput('');
    setEditorialStatusMenuOpen(false);
    setEditorialReadMenuOpen(false);
    setEditorialEditionExpanded(true);
    setActiveEditorialField(null);
    setIsAddingNote(false);
    setNewNoteText('');
    setEditingNoteId(null);
    setEditingNoteText('');
    setNoteError('');
    setAudioError('');
    setAudioTitleDraft('');
    setNoteAuthorId(activeProfile?.id || state.profiles[0]?.id || '');
    setNoteForProfileId('');
    setAudioAuthorId(activeProfile?.id || state.profiles[0]?.id || '');
    setAudioForProfileId('');
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
      setEditPublisher(book.publisher || '');
      setEditLanguage(book.language || '');
      setEditCoverUrl(
        book.coverUrl && book.coverUrl.startsWith('https://') ? book.coverUrl : ''
      );
    }
  }, [bookId]);

  // Lazy-load IndexedDB audio blobs for playback & revoke stale object URLs
  useEffect(() => {
    let cancelled = false;
    const recs = book?.recordings || [];
    const activeIds = new Set(recs.map((r) => r.id));

    // Revoke any URLs whose recordings were deleted or belong to another book
    setAudioObjectUrls((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [id, url] of Object.entries(prev)) {
        if (activeIds.has(id)) {
          next[id] = url;
        } else {
          URL.revokeObjectURL(url);
          changed = true;
        }
      }
      if (changed) audioUrlsRef.current = next;
      return changed ? next : prev;
    });

    (async () => {
      for (const rec of recs) {
        if (audioUrlsRef.current[rec.id]) continue;
        try {
          const blob = await getBookAudioBlob(rec.id);
          if (!blob || cancelled) continue;
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            continue;
          }
          setAudioObjectUrls((prev) => {
            const updated = { ...prev, [rec.id]: url };
            audioUrlsRef.current = updated;
            return updated;
          });
        } catch {
          // ignore blob read errors for missing local clips
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, book?.recordings]);

  // Stop active streams & revoke object URLs on unmount
  useEffect(() => {
    return () => {
      stopActiveRecorderResources();
      for (const url of Object.values(audioUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
      audioUrlsRef.current = {};
    };
  }, []);

  useBodyScrollLock(Boolean(book));

  if (!book) return null;

  const activeRot = state.rotations.find(
    (r) => r.profileId === activeProfile?.id && r.status === 'active'
  );
  const effectiveReader =
    activeProfile ||
    (activeRot
      ? state.profiles.find((p) => p.id === activeRot.profileId) || state.profiles[0] || null
      : state.profiles[0] || null);

  const handleRatingChange = async (rating: number, targetProfileId?: string) => {
    await store.setUserRating(book.id, rating, targetProfileId || effectiveReader?.id);
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
        publisher: editPublisher.trim(),
        language: editLanguage.trim().toLowerCase(),
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

  const handleAddFamilyNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoteError('');
    if (!newNoteText.trim()) {
      setNoteError('Write a quote or note before saving.');
      return;
    }
    try {
      await store.addBookNote(book.id, {
        text: newNoteText.trim(),
        authorProfileId: noteAuthorId || effectiveReader?.id || undefined,
        forProfileId: noteForProfileId || undefined,
      });
      setNewNoteText('');
      setIsAddingNote(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveEditedNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNoteId) return;
    setNoteError('');
    try {
      if (editingNoteId === `legacy_${book.id}`) {
        await store.updateBook(book.id, { notes: editingNoteText.trim() });
      } else {
        await store.updateBookNote(book.id, editingNoteId, { text: editingNoteText.trim() });
      }
      setEditingNoteId(null);
      setEditingNoteText('');
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteNoteItem = async (noteId: string) => {
    if (noteId === `legacy_${book.id}`) {
      await store.updateBook(book.id, { notes: '' });
    } else {
      await store.deleteBookNote(book.id, noteId);
    }
  };

  const handleStartAudioRecording = async () => {
    setAudioError('');
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setAudioError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      setRecordingElapsedSec(0);
      setIsRecordingAudio(true);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingElapsedSec(
          Math.max(0, Math.floor((Date.now() - recordStartedAtRef.current) / 1000))
        );
      }, 250);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (recordTimerRef.current !== null) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const elapsedSec = Math.max(
          0.5,
          (Date.now() - recordStartedAtRef.current) / 1000
        );
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
          mediaStreamRef.current = null;
        }
        mediaRecorderRef.current = null;
        setIsRecordingAudio(false);
        setRecordingElapsedSec(0);

        if (blob.size > 0) {
          setAudioSaving(true);
          try {
            await store.addBookRecording(book.id, {
              title: audioTitleDraft.trim() || undefined,
              durationSec: elapsedSec,
              mimeType: blob.type || mimeType,
              blob,
              authorProfileId: audioAuthorId || effectiveReader?.id || undefined,
              forProfileId: audioForProfileId || undefined,
            });
            setAudioTitleDraft('');
          } catch (err) {
            setAudioError(err instanceof Error ? err.message : String(err));
          } finally {
            setAudioSaving(false);
          }
        }
      };

      recorder.start();
    } catch (err) {
      stopActiveRecorderResources();
      setAudioError(
        err instanceof Error
          ? `Microphone unavailable: ${err.message}`
          : 'Microphone permission denied or unavailable.'
      );
    }
  };

  const handleStopAudioRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      stopActiveRecorderResources();
    }
  };

  const handleVerifyScanMatch = async () => {
    await store.updateBook(book.id, {
      needsScanReview: false,
      verifiedAt: new Date().toISOString(),
    });
    store.notify('Book match confirmed.', 'success');
  };

  const handleConfirmDelete = async () => {
    await store.deleteBook(book.id);
    onClose();
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
  const formattedAddedDate = (() => {
    try {
      const d = new Date(book.addedAt);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  })();

  const primaryGenreLabel =
    book.tags.length > 0
      ? book.tags[0]
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : '';
  const dimensionsLabel = formatBookDimensionsLabel(book.dimensions);
  const displayedNotes: BookNote[] =
    Array.isArray(book.bookNotes) && book.bookNotes.length > 0
      ? book.bookNotes
      : book.notes
        ? [
            {
              id: `legacy_${book.id}`,
              text: book.notes,
              createdAt: book.addedAt || '',
            },
          ]
        : [];
  const recordingsList = Array.isArray(book.recordings) ? book.recordings : [];

  const titleAuthorQuery = `${book.title} ${book.authors[0] || ''}`.trim();
  const encodedQuery = encodeURIComponent(isbnVal || titleAuthorQuery);
  const olSource = (book.sources || []).find((s) => s.provider === 'open-library');
  const gbSource = (book.sources || []).find((s) => s.provider === 'google-books');
  const googleBooksUrl =
    book.previewLink && /^https?:\/\//i.test(book.previewLink)
      ? book.previewLink
      : gbSource?.externalId
        ? `https://books.google.com/books?id=${encodeURIComponent(gbSource.externalId)}`
        : isbnVal
          ? `https://books.google.com/books?vid=ISBN${encodeURIComponent(isbnVal)}`
          : `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(titleAuthorQuery)}`;
  const openLibraryUrl = olSource?.externalId
    ? olSource.externalId.startsWith('/')
      ? `https://openlibrary.org${olSource.externalId}`
      : `https://openlibrary.org/books/${encodeURIComponent(olSource.externalId)}`
    : isbnVal
      ? `https://openlibrary.org/isbn/${encodeURIComponent(isbnVal)}`
      : `https://openlibrary.org/search?q=${encodeURIComponent(titleAuthorQuery)}`;
  const externalBookLinks = [
    { label: 'Google Books', url: googleBooksUrl },
    { label: 'Open Library', url: openLibraryUrl },
    { label: 'Goodreads', url: `https://www.goodreads.com/search?q=${encodedQuery}` },
    { label: 'Amazon', url: `https://www.amazon.com/s?k=${encodedQuery}` },
  ];

  const coverStudioSection = isCoverPickerOpen && (
    <section
      aria-label="Change book cover"
      className="rounded-xl bg-surface-subtle border border-edge p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink">Cover Studio</p>
          <p className="text-[11px] text-ink-secondary">
            Choose a photo, snap a picture, or search Google Books &amp; Open Library.
          </p>
        </div>
        {book.coverUrl && (
          <button
            type="button"
            data-action="clear-book-cover"
            onClick={handleClearCover}
            className="min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-semibold text-ink-secondary hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] transition-colors shrink-0"
          >
            Cloth Cover
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="min-h-[44px] px-3 py-2 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
          <Icon name="photo" className="w-4 h-4" />
          <span>From Phone</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="sr-only"
          />
        </label>

        <label className="min-h-[44px] px-3 py-2 rounded-lg bg-primary hover:bg-primary-hover text-xs font-semibold text-primary-fg inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
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
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={coverSearchLoading}
          className="h-12 px-3.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-55 text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Icon name="search" className="w-3.5 h-3.5" />
          <span>{coverSearchLoading ? 'Searching…' : 'Search'}</span>
        </button>
      </form>

      {coverSearchError && (
        <p role="alert" className="text-xs text-[#8C4A4F] dark:text-[#C48A8E]">
          {coverSearchError}
        </p>
      )}

      {coverSearchLoading ? (
        <div className="pt-1">
          <CoverGridSkeleton count={4} />
        </div>
      ) : coverSearchResults.length > 0 && (
        <div className="grid grid-cols-4 gap-2 pt-0.5">
          {coverSearchResults.map((res, i) => (
            <button
              key={`${res.coverUrl}-${i}`}
              type="button"
              onClick={() => handleSelectCover(res.coverUrl)}
              className="group flex flex-col items-center text-left rounded-lg p-1 bg-surface hover:bg-surface-elevated border border-edge transition-transform active:scale-95"
            >
              <div className="w-full aspect-[3/4] rounded-md overflow-hidden bg-surface-elevated">
                <img
                  src={res.coverUrl}
                  alt={res.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="mt-1 text-[10px] text-ink-secondary truncate w-full text-center">
                {res.source}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );

  const editBookSection = isEditing && (
    <form
      id="edit-book-form"
      onSubmit={handleSaveEdits}
      noValidate
      className="rounded-xl bg-surface-subtle border border-edge p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink">
          Edit Bibliographic Info
        </p>
        <span className="text-[11px] text-ink-muted">
          Saved on device
        </span>
      </div>

      {editError && (
        <div
          role="alert"
          className="rounded-lg bg-[#8C4A4F]/10 border border-[#8C4A4F]/35 px-3.5 py-2 text-xs font-medium text-[#8C4A4F] dark:text-[#C48A8E]"
        >
          {editError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="sm:col-span-2">
          <label
            htmlFor="edit-book-title"
            className="block text-xs font-semibold text-ink mb-1"
          >
            Title *
          </label>
          <ClearableInput
            id="edit-book-title"
            value={editTitle}
            onValueChange={setEditTitle}
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="edit-book-authors"
            className="block text-xs font-semibold text-ink mb-1"
          >
            Author(s)
          </label>
          <ClearableInput
            id="edit-book-authors"
            value={editAuthors}
            onValueChange={setEditAuthors}
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="edit-book-isbn"
            className="block text-xs font-semibold text-ink mb-1"
          >
            ISBN (optional)
          </label>
          <ClearableInput
            id="edit-book-isbn"
            value={editIsbn}
            onValueChange={setEditIsbn}
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="edit-book-format"
            className="block text-xs font-semibold text-ink mb-1"
          >
            Binding Format
          </label>
          <select
            id="edit-book-format"
            value={editFormat}
            onChange={(e) => setEditFormat(e.target.value as BookFormat)}
            className="w-full h-12 px-3.5 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="hardcover">Hardcover</option>
            <option value="board-book">Board Book</option>
            <option value="paperback">Paperback</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="edit-book-stage"
            className="block text-xs font-semibold text-ink mb-1"
          >
            Reading Stage
          </label>
          <select
            id="edit-book-stage"
            value={editStage}
            onChange={(e) => setEditStage(e.target.value as ReadingStage)}
            className="w-full h-12 px-3.5 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="board-toddler">Board &amp; Toddler</option>
            <option value="picture-book">Picture Book</option>
            <option value="early-reader">Early Reader</option>
            <option value="chapter-book">Chapter Book</option>
            <option value="middle-grade">Middle Grade</option>
            <option value="teen-ya">Teen / YA</option>
            <option value="adult">Adult Reader</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="edit-book-age-min"
              className="block text-xs font-semibold text-ink mb-1"
            >
              Min Age
            </label>
            <input
              id="edit-book-age-min"
              type="number"
              min={0}
              max={120}
              value={editAgeMin}
              onChange={(e) => setEditAgeMin(e.target.value)}
              className="w-full h-12 px-3 rounded-lg bg-surface border border-edge text-base sm:text-sm font-mono-tabular text-ink focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label
              htmlFor="edit-book-age-max"
              className="block text-xs font-semibold text-ink mb-1"
            >
              Max Age
            </label>
            <input
              id="edit-book-age-max"
              type="number"
              min={0}
              max={120}
              value={editAgeMax}
              onChange={(e) => setEditAgeMax(e.target.value)}
              className="w-full h-12 px-3 rounded-lg bg-surface border border-edge text-base sm:text-sm font-mono-tabular text-ink focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label
              htmlFor="edit-book-pages"
              className="block text-xs font-semibold text-ink mb-1"
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
              className="w-full h-12 px-3 rounded-lg bg-surface border border-edge text-base sm:text-sm font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label
              htmlFor="edit-book-year"
              className="block text-xs font-semibold text-ink mb-1"
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
              className="w-full h-12 px-3 rounded-lg bg-surface border border-edge text-base sm:text-sm font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="edit-book-publisher"
            className="block text-xs font-semibold text-ink mb-1"
          >
            Publisher (optional)
          </label>
          <ClearableInput
            id="edit-book-publisher"
            value={editPublisher}
            onValueChange={setEditPublisher}
            placeholder="e.g., Candlewick Press"
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label
            htmlFor="edit-book-language"
            className="block text-xs font-semibold text-ink mb-1"
          >
            Language (optional)
          </label>
          <ClearableInput
            id="edit-book-language"
            value={editLanguage}
            onValueChange={setEditLanguage}
            placeholder="e.g., english, spanish"
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="edit-book-cover-url"
            className="block text-xs font-semibold text-ink mb-1"
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
            className="w-full h-12 pl-3.5 pr-9 rounded-lg bg-surface border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="pt-1 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="min-h-[44px] px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
        >
          Save Changes
        </button>
      </div>
    </form>
  );

  // =========================================================================
  // EDITORIAL BOOK DETAIL VIEW (Option B — Matching Midnight Library Reference)
  // =========================================================================
  if (detailStyle === 'editorial') {
    const readStatusLabel = isReadInActive || usageSummary.isReadByActiveProfile
      ? 'READ'
      : inActiveShelf
        ? 'ON SHELF'
        : 'TO BE READ';
    const durationChip = hintParts[0] ? hintParts[0].toUpperCase() : 'STORYTIME';

    const handlePrimaryEditorialAction = async () => {
      if (inActiveShelf && activeRot) {
        await store.toggleRotationBookRead(activeRot.id, book.id);
      } else if (effectiveReader) {
        await store.toggleProfileBookRead(effectiveReader.id, book.id);
      }
    };

    return (
      <div
        data-backdrop-action="close-inspect-book"
        className="sheet-backdrop fixed inset-0 z-[60] bg-[#0F100F]/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-book-title"
          data-book-detail-style="editorial"
          style={dialogTintStyle}
          data-cover-tint={dynamicCoverTint ? tintHex : undefined}
          onClick={(e) => e.stopPropagation()}
          className="animate-sheet-up w-full max-w-lg sm:max-w-xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
        >
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {/* Ambient Radial Cover-Tinted Hero Header */}
            <div
              className="relative px-5 pt-4 pb-6"
              style={{
                background: dynamicCoverTint
                  ? `radial-gradient(ellipse 90% 80% at 50% 15%, color-mix(in srgb, var(--lr-cover-tint, var(--primary)) 26%, transparent), transparent 72%)`
                  : `radial-gradient(ellipse 90% 80% at 50% 15%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 72%)`,
              }}
            >
              {/* Top Circular Controls: Back/Close (left) & Love/Edit (right) */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-action="close-inspect-book"
                  onClick={onClose}
                  aria-label="Close book details"
                  className="w-10 h-10 rounded-full bg-surface-elevated/85 hover:bg-surface-elevated border border-edge/80 text-ink flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <Icon name="arrowLeft" className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-action="toggle-book-loved"
                    onClick={handleToggleLoved}
                    aria-pressed={book.loved ? 'true' : 'false'}
                    aria-label={book.loved ? 'Remove Loved mark' : 'Mark as Loved'}
                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                      book.loved
                        ? 'bg-[#8C4A4F] border-[#8C4A4F] text-[#FFFCF5]'
                        : 'bg-surface-elevated/85 hover:bg-surface-elevated border-edge/80 text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    data-action="toggle-edit-book-info"
                    onClick={() => setIsEditing((prev) => !prev)}
                    aria-pressed={isEditing ? 'true' : 'false'}
                    aria-label="Edit book details"
                    className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                      isEditing
                        ? 'bg-primary border-primary text-primary-fg'
                        : 'bg-surface-elevated/85 hover:bg-surface-elevated border-edge/80 text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <Icon name="edit" className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Centered Tracked Uppercase Collection Status Divider */}
              <div className="mt-2 flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setEditorialStatusMenuOpen((p) => !p)}
                  aria-expanded={editorialStatusMenuOpen}
                  className="inline-flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary hover:opacity-85 transition-opacity cursor-pointer"
                >
                  <span className="w-4 h-px bg-primary/50" aria-hidden="true" />
                  <span>{formatCollectionStatus(currentStatus)}</span>
                  <Icon name="chevronDown" className="w-3 h-3" />
                  <span className="w-4 h-px bg-primary/50" aria-hidden="true" />
                </button>

                {editorialStatusMenuOpen && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-xl bg-surface-elevated border border-edge shadow-lg">
                    {(['owned', 'library', 'wishlist', 'interested'] as CollectionStatus[]).map((st) => {
                      const active = currentStatus === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={async () => {
                            await handleStatusChange(st);
                            setEditorialStatusMenuOpen(false);
                          }}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            active
                              ? 'bg-primary text-primary-fg'
                              : 'text-ink-secondary hover:text-ink hover:bg-surface'
                          }`}
                        >
                          {formatCollectionStatus(st)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Centered Floating Cover with Top-Right Pencil Badge */}
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  data-action="toggle-cover-picker"
                  aria-expanded={isCoverPickerOpen}
                  aria-label={`Change cover for ${book.title}`}
                  onClick={() => setIsCoverPickerOpen((prev) => !prev)}
                  className="group relative rounded-xl shadow-2xl transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
                >
                  <BookCover
                    book={book}
                    size="lg"
                    aspectRatio={state.settings?.coverAspectRatio || 'portrait'}
                  />
                  <span
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-canvas/85 backdrop-blur-xs border border-edge/70 text-ink flex items-center justify-center shadow-sm"
                    aria-hidden="true"
                  >
                    <Icon name="edit" className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>

              {/* Centered Bold Title + Italic Serif Author + Inline Active Reader Rating */}
              <div className="mt-5 text-center px-2">
                <h2
                  id="inspect-book-title"
                  className="font-display text-2xl sm:text-[28px] font-bold text-ink leading-tight text-balance"
                >
                  {book.title}
                </h2>
                <p className="mt-1 font-serif-italic italic text-base text-ink-secondary">
                  by {book.authors.join(', ')}
                </p>
                <div
                  data-editorial-active-rating="true"
                  className="mt-2.5 inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-surface-subtle/75 border border-edge/70"
                >
                  {effectiveReader && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                      <span
                        className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${
                          AVATAR_TONES[effectiveReader.avatarTone || 'teal'] || AVATAR_TONES.teal
                        }`}
                      >
                        {computeOwnerInitials(effectiveReader.name)}
                      </span>
                      <span>{effectiveReader.name}</span>
                    </span>
                  )}
                  <StarRating
                    rating={readerRating}
                    onChange={(r) => handleRatingChange(r, effectiveReader?.id)}
                    size="sm"
                    compact
                    dataInspectorCoverStars
                  />
                </div>
              </div>

              {/* Dual Action Pill Row */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setEditorialReadMenuOpen((p) => !p)}
                    aria-expanded={editorialReadMenuOpen}
                    className="min-h-[42px] px-4 py-2 rounded-full border border-primary/50 bg-primary/10 hover:bg-primary/15 text-primary text-[11px] font-bold uppercase tracking-[0.12em] inline-flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
                    <span>{readStatusLabel}</span>
                    <Icon name="chevronDown" className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handlePrimaryEditorialAction}
                  className="min-h-[42px] px-5 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-primary-fg inline-flex items-center gap-2.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Icon
                    name={isReadInActive || usageSummary.isReadByActiveProfile ? 'check' : 'clock'}
                    className="w-4 h-4 shrink-0"
                  />
                  <span className="text-left leading-tight">
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] opacity-85">
                      {durationChip}
                    </span>
                    <span className="block text-xs font-bold">
                      {isReadInActive || usageSummary.isReadByActiveProfile
                        ? 'Read · Undo'
                        : "Let's read!"}
                    </span>
                  </span>
                </button>
              </div>

              {/* Inline Shelf & Cycle Action Bar (when status pill tapped) */}
              {editorialReadMenuOpen && (
                <div className="mt-3 p-3 rounded-2xl bg-surface-elevated border border-edge flex flex-wrap items-center justify-center gap-2 shadow-md">
                  {inActiveShelf && activeRot ? (
                    <>
                      <button
                        type="button"
                        onClick={() => store.toggleRotationBookPicked(activeRot.id, book.id)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          isPickedInActive
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface border border-edge text-ink'
                        }`}
                      >
                        <Icon name={isPickedInActive ? 'bookmarkFilled' : 'bookmark'} className="w-3.5 h-3.5" />
                        <span>{isPickedInActive ? 'Picked' : 'Mark Picked'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => store.toggleRotationBookRead(activeRot.id, book.id)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                          isReadInActive
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface border border-edge text-ink'
                        }`}
                      >
                        <Icon name="check" className="w-3.5 h-3.5" />
                        <span>{isReadInActive ? 'Read · Undo' : 'Mark Read'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => store.replaceRotationBookRandom(activeRot.id, book.id)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-surface border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Icon name="shuffle" className="w-3.5 h-3.5" />
                        <span>Swap Book</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {effectiveReader && (
                        <button
                          type="button"
                          onClick={() => store.toggleProfileBookRead(effectiveReader.id, book.id)}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                            usageSummary.isReadByActiveProfile
                              ? 'bg-primary text-primary-fg'
                              : 'bg-surface border border-edge text-ink'
                          }`}
                        >
                          <Icon name="check" className="w-3.5 h-3.5" />
                          <span>{usageSummary.isReadByActiveProfile ? 'Read · Undo' : 'Mark Read'}</span>
                        </button>
                      )}
                      {rotatable && activeRot && (
                        <button
                          type="button"
                          onClick={async () => {
                            await store.addBooksToRotationManual(activeRot.id, [book.id]);
                            store.notify(`Added "${book.title}" to active shelf!`, 'success');
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Icon name="plus" className="w-3.5 h-3.5" />
                          <span>Add to Active Shelf</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 pb-6 space-y-4">
              {/* Contextual Scan Verification Card ("Is this the right book?") */}
              {book.needsScanReview && (
                <section
                  aria-label="Verify scanned book"
                  className="rounded-2xl bg-surface-subtle border border-edge p-4 sm:p-5 space-y-3.5"
                >
                  <div>
                    <h3 className="font-display text-xl font-semibold text-ink">
                      Is this the right book?
                    </h3>
                    <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
                      We matched this title to the catalog details below. Check that the cover and edition look right, or correct them anytime.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyScanMatch}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Icon name="check" className="w-4 h-4" />
                    <span>Yes, this is correct</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="edit" className="w-3.5 h-3.5" />
                      <span>Edit details</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('scan');
                      }}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="qrcode" className="w-3.5 h-3.5" />
                      <span>Scan ISBN</span>
                    </button>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="text-xs font-medium text-ink-secondary hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </section>
              )}

              {coverStudioSection}
              {editBookSection}

              {/* Bento Metadata Grid (Every tile opens 1-tap EditorialFieldSheet) */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-editorial-field="genre"
                    onClick={() => setActiveEditorialField('genre')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3.5 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Genre
                    </span>
                    <Icon name="tag" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span
                      className={`mt-1.5 block font-display text-base font-medium truncate ${
                        primaryGenreLabel ? 'text-ink' : 'italic text-ink-muted'
                      }`}
                    >
                      {primaryGenreLabel
                        ? book.tags.length > 1
                          ? `${primaryGenreLabel} +${book.tags.length - 1}`
                          : primaryGenreLabel
                        : 'Set genre'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-editorial-field="format"
                    onClick={() => setActiveEditorialField('format')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3.5 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Format
                    </span>
                    <Icon name="bookmark" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span className="mt-1.5 block font-display text-base font-medium text-ink truncate">
                      {formatBookBinding(book.format) || 'Set format'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    data-editorial-field="publishedYear"
                    onClick={() => setActiveEditorialField('publishedYear')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Pub. Year
                    </span>
                    <Icon name="calendar" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span
                      className={`mt-1.5 block font-display text-base font-medium ${
                        book.publishedYear
                          ? 'text-ink font-mono-tabular'
                          : 'italic text-ink-muted text-sm'
                      }`}
                    >
                      {book.publishedYear || 'Set year'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-editorial-field="pageCount"
                    onClick={() => setActiveEditorialField('pageCount')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Pages
                    </span>
                    <Icon name="fileText" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span
                      className={`mt-1.5 block font-display text-base font-medium ${
                        book.pageCount
                          ? 'text-ink font-mono-tabular'
                          : 'italic text-ink-muted text-sm'
                      }`}
                    >
                      {book.pageCount || 'Set pages'}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-editorial-field="estimatedValue"
                    onClick={() => setActiveEditorialField('estimatedValue')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Est. Value
                    </span>
                    <Icon name="award" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span
                      className={`mt-1.5 block font-display font-medium truncate ${
                        book.estimatedValue !== undefined
                          ? 'text-base text-ink font-mono-tabular'
                          : 'text-sm italic text-ink-muted'
                      }`}
                    >
                      {book.estimatedValue !== undefined
                        ? `${book.estimatedCurrency || 'USD'} ${Number(book.estimatedValue).toFixed(2)}`
                        : book.listPriceAmount !== undefined
                          ? `${book.listPriceCurrency || 'USD'} ${Number(book.listPriceAmount).toFixed(2)}`
                          : 'Set value'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-editorial-field="readingStage"
                    onClick={() => setActiveEditorialField('readingStage')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Stage
                    </span>
                    <Icon name="layers" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span className="mt-1.5 block font-display text-sm font-medium text-ink truncate">
                      {formatReadingStage(book.readingStage)}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-editorial-field="ages"
                    onClick={() => setActiveEditorialField('ages')}
                    className="rounded-2xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/90 p-3 text-center transition-colors cursor-pointer"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Ages
                    </span>
                    <Icon name="profiles" className="w-4 h-4 mx-auto mt-1.5 text-ink-secondary" />
                    <span className="mt-1.5 block font-display text-sm font-medium text-ink font-mono-tabular">
                      {book.ageMax >= 99 ? `${book.ageMin}+ yrs` : `${book.ageMin}–${book.ageMax} yrs`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Collapsible EDITION Card (shows Publisher · ISBN summary when collapsed) */}
              <section className="rounded-2xl bg-surface-subtle/90 border border-edge/90 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEditorialEditionExpanded((p) => !p)}
                  aria-expanded={editorialEditionExpanded}
                  className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-elevated/40 transition-colors"
                >
                  <span className="inline-flex items-center gap-2.5 shrink-0">
                    <Icon name="fileText" className="w-4 h-4 text-ink-secondary" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
                      Edition
                    </span>
                  </span>

                  <span className="flex items-center gap-2 min-w-0">
                    {!editorialEditionExpanded && (book.publisher || isbnVal) && (
                      <span className="text-[11px] text-ink-muted truncate font-mono-tabular">
                        {[book.publisher, isbnVal].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    <Icon
                      name="chevronDown"
                      className={`w-4 h-4 text-ink-secondary shrink-0 transition-transform ${
                        editorialEditionExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </span>
                </button>

                {editorialEditionExpanded && (
                  <div className="px-4 pb-3.5 divide-y divide-edge-subtle text-xs">
                    <button
                      type="button"
                      data-editorial-field="isbn"
                      onClick={() => setActiveEditorialField('isbn')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="qrcode" className="w-4 h-4" />
                        <span>ISBN</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <span className={isbnVal ? 'font-mono-tabular text-ink' : 'italic text-ink-muted'}>
                          {isbnVal || 'Add ISBN'}
                        </span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-editorial-field="publisher"
                      onClick={() => setActiveEditorialField('publisher')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="building" className="w-4 h-4" />
                        <span>Publisher</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <span className={book.publisher ? 'text-ink' : 'italic text-ink-muted'}>
                          {book.publisher || 'Add publisher'}
                        </span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-editorial-field="edition"
                      onClick={() => setActiveEditorialField('edition')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="bookmark" className="w-4 h-4" />
                        <span>Edition</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <span className={book.edition ? 'text-ink' : 'italic text-ink-muted'}>
                          {book.edition || 'Add edition'}
                        </span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-editorial-field="language"
                      onClick={() => setActiveEditorialField('language')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="globe" className="w-4 h-4" />
                        <span>Language</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <span className={book.language ? 'text-ink capitalize' : 'italic text-ink-muted'}>
                          {book.language || 'Add language'}
                        </span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-editorial-field="condition"
                      onClick={() => setActiveEditorialField('condition')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="compass" className="w-4 h-4" />
                        <span>Condition</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-ink font-medium">
                        <span>{formatBookCondition(currentCondition)}</span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      </span>
                    </button>

                    <button
                      type="button"
                      data-editorial-field="dimensions"
                      onClick={() => setActiveEditorialField('dimensions')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="ruler" className="w-4 h-4" />
                        <span>Dimensions</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <span className={dimensionsLabel ? 'font-mono-tabular text-ink' : 'italic text-ink-muted'}>
                          {dimensionsLabel || 'Add dimensions'}
                        </span>
                        <Icon name="chevronRight" className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      </span>
                    </button>
                  </div>
                )}
              </section>

              {/* Rotation Eligibility Pill Switch */}
              <div className="px-1 py-2 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Icon name="rotations" className="w-5 h-5 text-ink-secondary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p id="editorial-rotation-label" className="text-sm font-semibold text-ink">
                      Eligible for shelf rotations
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {isExcluded
                        ? 'Kept in catalog only; skipped when building rotations'
                        : showRotationHistory && usageSegments.length > 0
                          ? usageSegments.slice(0, 2).join(' · ')
                          : 'Included in automatic family shelf rotations'}
                    </p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={!isExcluded}
                  onChange={handleToggleEligibility}
                  ariaLabelledBy="editorial-rotation-label"
                  onLabel="Included"
                  offLabel="Excluded"
                />
              </div>

              {/* Community Rating + See More External Book Links */}
              <section
                aria-label="Community rating and external catalog links"
                className="rounded-2xl bg-surface-subtle/80 border border-edge/80 p-4 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Community &amp; Catalog
                  </span>
                  {book.averageRating ? (
                    <span className="inline-flex items-center gap-1 font-mono-tabular font-semibold text-ink">
                      <span className="text-accent">★</span>
                      <span>{book.averageRating}</span>
                      {book.ratingsCount ? (
                        <span className="text-ink-muted font-normal">
                          ({book.ratingsCount} ratings)
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="italic text-ink-muted">No community rating yet</span>
                  )}
                </div>

                <div>
                  <p className="text-[11px] font-semibold text-ink-secondary mb-2">
                    See more about this book
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {externalBookLinks.map((ext) => (
                      <a
                        key={ext.label}
                        href={ext.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-ink inline-flex items-center gap-1 transition-colors"
                      >
                        <span>{ext.label}</span>
                        <span aria-hidden="true" className="text-ink-muted">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              </section>

              {/* Compact Other Readers' Ratings + Owners */}
              {(() => {
                const otherProfiles = effectiveReader
                  ? state.profiles.filter((p) => p.id !== effectiveReader.id)
                  : state.profiles;
                return (
                  <section className="rounded-2xl bg-surface-subtle/80 border border-edge/80 p-3.5 space-y-2.5 text-xs">
                    {otherProfiles.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                          Other Readers
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {otherProfiles.map((prof) => {
                            const profRating = getBookUserRating(book, prof.id);
                            const tone = AVATAR_TONES[prof.avatarTone || 'teal'] || AVATAR_TONES.teal;
                            return (
                              <div
                                key={prof.id}
                                className="flex items-center justify-between gap-2 py-0.5"
                              >
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center shrink-0 ${tone}`}
                                  >
                                    {computeOwnerInitials(prof.name)}
                                  </span>
                                  <span className="font-medium text-ink truncate">{prof.name}</span>
                                </span>
                                <StarRating
                                  rating={profRating}
                                  onChange={(r) => handleRatingChange(r, prof.id)}
                                  size="sm"
                                  compact
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div
                      className={`${
                        otherProfiles.length > 0 ? 'pt-2.5 border-t border-edge-subtle ' : ''
                      }flex flex-wrap items-center justify-between gap-2`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                        Owners
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
                              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                                active
                                  ? 'bg-primary text-primary-fg'
                                  : 'bg-surface border border-edge text-ink-secondary hover:text-ink'
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
                  </section>
                );
              })()}

              {/* Multi-Entry Family Quotes & Notes */}
              <section aria-label="Quotes and notes" className="rounded-2xl bg-surface-subtle/80 border border-edge/80 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    <Icon name="quote" className="w-3.5 h-3.5 text-primary" />
                    <span>Quotes &amp; Notes ({displayedNotes.length})</span>
                  </span>
                  <button
                    type="button"
                    data-action="open-add-quote-note"
                    onClick={() => {
                      setIsAddingNote((prev) => !prev);
                      setNoteError('');
                    }}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-primary cursor-pointer"
                  >
                    {isAddingNote ? 'Close' : '+ Add Quote / Note'}
                  </button>
                </div>

                {noteError && (
                  <p role="alert" className="text-xs font-medium text-[#8C4A4F] dark:text-[#C48A8E]">
                    {noteError}
                  </p>
                )}

                {isAddingNote && (
                  <form onSubmit={handleAddFamilyNote} className="rounded-xl bg-surface border border-edge p-3 space-y-2.5">
                    <textarea
                      rows={3}
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Write a favorite quote, reading memory, or bedtime note…"
                      className="w-full px-3 py-2 rounded-lg bg-canvas border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {state.profiles.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-ink-secondary space-y-1">
                          <span className="block font-semibold">By reader</span>
                          <select
                            value={noteAuthorId}
                            onChange={(e) => setNoteAuthorId(e.target.value)}
                            className="w-full h-9 px-2 rounded-lg bg-surface-subtle border border-edge text-xs text-ink"
                          >
                            <option value="">Household</option>
                            {state.profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-[11px] text-ink-secondary space-y-1">
                          <span className="block font-semibold">About / for</span>
                          <select
                            value={noteForProfileId}
                            onChange={(e) => setNoteForProfileId(e.target.value)}
                            className="w-full h-9 px-2 rounded-lg bg-surface-subtle border border-edge text-xs text-ink"
                          >
                            <option value="">Everyone</option>
                            {state.profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingNote(false);
                          setNewNoteText('');
                        }}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-surface-subtle border border-edge text-xs font-semibold text-ink-secondary cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[34px] px-3.5 py-1 rounded-lg bg-primary text-primary-fg text-xs font-semibold cursor-pointer"
                      >
                        Save Note
                      </button>
                    </div>
                  </form>
                )}

                {displayedNotes.length > 0 ? (
                  <div className="space-y-2.5">
                    {displayedNotes.map((entry) => {
                      const authorProf = state.profiles.find((p) => p.id === entry.authorProfileId);
                      const forProf = state.profiles.find((p) => p.id === entry.forProfileId);
                      const isEditingThis = editingNoteId === entry.id;
                      const formattedDate = entry.createdAt
                        ? formatShortShelfDate(entry.createdAt)
                        : '';
                      return (
                        <div
                          key={entry.id}
                          className="border-l-2 border-primary/70 pl-3 py-1 space-y-1.5"
                        >
                          {isEditingThis ? (
                            <form onSubmit={handleSaveEditedNote} className="space-y-2">
                              <textarea
                                rows={2}
                                value={editingNoteText}
                                onChange={(e) => setEditingNoteText(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg bg-canvas border border-edge text-sm text-ink focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingNoteId(null)}
                                  className="px-2.5 py-1 rounded bg-surface border border-edge text-[11px] font-semibold text-ink-secondary cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="px-2.5 py-1 rounded bg-primary text-primary-fg text-[11px] font-semibold cursor-pointer"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <p className="font-serif-italic italic text-sm text-ink leading-relaxed">
                                “{entry.text}”
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
                                <span className="inline-flex items-center gap-1.5 flex-wrap">
                                  {authorProf && (
                                    <span className="font-semibold text-ink-secondary">
                                      By {authorProf.name}
                                    </span>
                                  )}
                                  {forProf && (
                                    <span>· For {forProf.name}</span>
                                  )}
                                  {formattedDate && <span>· {formattedDate}</span>}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNoteId(entry.id);
                                      setEditingNoteText(entry.text);
                                    }}
                                    className="font-semibold text-primary hover:underline cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNoteItem(entry.id)}
                                    className="font-semibold text-[#8C4A4F] dark:text-[#C48A8E] hover:underline cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : !isAddingNote && (
                  <button
                    type="button"
                    onClick={() => setIsAddingNote(true)}
                    className="w-full text-left font-serif-italic italic text-sm text-ink-muted hover:text-ink transition-colors cursor-pointer"
                  >
                    Add a quote or family reading memory…
                  </button>
                )}
              </section>

              {/* Audio Clips & Read-Aloud Recordings (IndexedDB Persisted) */}
              <section
                aria-label="Audio clips and read-aloud recordings"
                className="rounded-2xl bg-surface-subtle/80 border border-edge/80 p-4 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    <Icon name="volume2" className="w-3.5 h-3.5 text-primary" />
                    <span>Voice Notes &amp; Read-Alouds ({recordingsList.length})</span>
                  </span>

                  {!isRecordingAudio ? (
                    <button
                      type="button"
                      data-action="start-audio-recording"
                      disabled={audioSaving}
                      onClick={handleStartAudioRecording}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-55 text-primary-fg text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="mic" className="w-3.5 h-3.5" />
                      <span>{audioSaving ? 'Saving…' : 'Record Audio'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-action="stop-audio-recording"
                      onClick={handleStopAudioRecording}
                      className="min-h-[32px] px-3 py-1 rounded-lg bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="square" className="w-3 h-3" />
                      <span className="font-mono-tabular">
                        Stop · {String(Math.floor(recordingElapsedSec / 60)).padStart(2, '0')}:
                        {String(recordingElapsedSec % 60).padStart(2, '0')}
                      </span>
                    </button>
                  )}
                </div>

                {audioError && (
                  <p role="alert" className="text-xs font-medium text-[#8C4A4F] dark:text-[#C48A8E]">
                    {audioError}
                  </p>
                )}

                {state.profiles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={audioTitleDraft}
                      onChange={(e) => setAudioTitleDraft(e.target.value)}
                      placeholder="Clip label (optional)"
                      className="h-9 px-2.5 rounded-lg bg-surface border border-edge text-xs text-ink placeholder:text-ink-muted"
                    />
                    <select
                      aria-label="Recorded by"
                      value={audioAuthorId}
                      onChange={(e) => setAudioAuthorId(e.target.value)}
                      className="h-9 px-2 rounded-lg bg-surface border border-edge text-xs text-ink"
                    >
                      <option value="">Recorded by: Household</option>
                      {state.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          By: {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="For reader"
                      value={audioForProfileId}
                      onChange={(e) => setAudioForProfileId(e.target.value)}
                      className="h-9 px-2 rounded-lg bg-surface border border-edge text-xs text-ink"
                    >
                      <option value="">For: Everyone</option>
                      {state.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          For: {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {recordingsList.length > 0 ? (
                  <div className="space-y-2">
                    {recordingsList.map((rec) => {
                      const recAuthor = state.profiles.find((p) => p.id === rec.authorProfileId);
                      const recFor = state.profiles.find((p) => p.id === rec.forProfileId);
                      const mins = Math.floor((rec.durationSec || 0) / 60);
                      const secs = Math.round((rec.durationSec || 0) % 60);
                      const blobUrl = audioObjectUrls[rec.id];
                      return (
                        <div
                          key={rec.id}
                          className="rounded-xl bg-surface border border-edge p-2.5 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-ink truncate">
                                {rec.title || (recAuthor ? `Voice clip by ${recAuthor.name}` : 'Voice recording')}
                              </p>
                              <p className="text-[11px] text-ink-muted">
                                <span className="font-mono-tabular">
                                  {mins}:{String(secs).padStart(2, '0')}
                                </span>
                                {recFor ? ` · For ${recFor.name}` : ''}
                                {rec.createdAt ? ` · ${formatShortShelfDate(rec.createdAt)}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => store.deleteBookRecording(book.id, rec.id)}
                              aria-label="Delete recording"
                              className="min-h-[32px] min-w-[32px] rounded-lg text-ink-muted hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] flex items-center justify-center cursor-pointer"
                            >
                              <Icon name="trash" className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {blobUrl && (
                            <audio controls src={blobUrl} className="w-full h-8" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="italic text-ink-muted">
                    Record a bedtime read-aloud or child voice reaction saved privately on device.
                  </p>
                )}
              </section>

              {/* Topics & Themes Curation */}
              <section aria-label="Topics and themes" className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Topics &amp; Themes
                  </strong>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-action="open-ai-tag-modal"
                      onClick={() => setAiTagModal({ isOpen: true, bookId: book.id })}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="sparkles" className="w-3.5 h-3.5" />
                      <span>AI Tag Assistant</span>
                    </button>
                    <button
                      type="button"
                      data-action="enrich-book-tags"
                      onClick={handleEnrichRules}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink cursor-pointer"
                    >
                      Quick Rules
                    </button>
                  </div>
                </div>

                {book.tags.length > 0 && (
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
                          className="min-h-[32px] px-2.5 py-1 rounded-md bg-surface-subtle hover:bg-[#8C4A4F]/10 border border-edge text-xs font-medium text-ink hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Icon name={meta.icon} className="w-3 h-3 opacity-60 shrink-0" />
                          <span>{tag}</span>
                          <span aria-hidden="true" className="opacity-55">×</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <form onSubmit={handleAddTag} className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <ClearableInput
                      id="inspector-new-tag-input"
                      value={newTagInput}
                      onValueChange={setNewTagInput}
                      placeholder="Add topic (e.g., bedtime, dinosaurs)"
                      className="w-full h-10 pl-3 pr-8 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-10 px-3.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Add Tag
                  </button>
                </form>
              </section>

              {/* Centered Date Added */}
              {formattedAddedDate && (
                <p className="pt-2 text-center text-[11px] text-ink-muted">
                  Date added: {formattedAddedDate}
                </p>
              )}

              {/* Bottom Replace / Remove Hairline Footer */}
              <div className="pt-3 border-t border-edge-subtle">
                {!confirmDelete ? (
                  <div className="grid grid-cols-2 divide-x divide-edge-subtle text-xs">
                    <button
                      type="button"
                      onClick={() => setIsCoverPickerOpen(true)}
                      className="min-h-[40px] flex items-center justify-center gap-2 text-ink-secondary hover:text-ink font-semibold transition-colors cursor-pointer"
                    >
                      <Icon name="replace" className="w-3.5 h-3.5" />
                      <span>Replace book</span>
                    </button>
                    <button
                      type="button"
                      data-action="delete-book"
                      onClick={() => setConfirmDelete(true)}
                      className="min-h-[40px] flex items-center justify-center gap-2 text-[#8C4A4F] dark:text-[#C48A8E] hover:opacity-80 font-semibold transition-opacity cursor-pointer"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                      <span>Remove book</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-[#8C4A4F]/10 border border-[#8C4A4F]/35 px-3 py-2.5 text-xs">
                    <span className="font-semibold text-[#8C4A4F] dark:text-[#C48A8E]">
                      Remove from library?
                    </span>
                    <button
                      type="button"
                      data-action="confirm-delete-book"
                      onClick={handleConfirmDelete}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] font-semibold cursor-pointer"
                    >
                      Yes, Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface border border-edge text-ink font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Single-Field Mobile Slide-Up / Desktop Modal Sheet */}
        <EditorialFieldSheet
          field={activeEditorialField}
          book={book}
          onClose={() => setActiveEditorialField(null)}
          onPatchBook={async (patch) => {
            await store.updateBook(book.id, patch);
          }}
          onAddTag={async (tag) => {
            await store.addBookTag(book.id, tag);
          }}
          onRemoveTag={async (tag) => {
            await store.removeBookTag(book.id, tag);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // COMPACT BOOK DETAIL VIEW (Option A — Preserved Information-Dense View)
  // =========================================================================
  return (
    <div
      data-backdrop-action="close-inspect-book"
      className="sheet-backdrop fixed inset-0 z-[60] bg-[#142321]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-book-title"
        data-book-detail-style="compact"
        style={dialogTintStyle}
        data-cover-tint={dynamicCoverTint ? tintHex : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`animate-sheet-up w-full max-w-lg sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-xl ${
          dynamicCoverTint ? 'lr-tinted-card ' : ''
        }bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0`}
      >
        {/* Mobile Handle Pill */}
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 sm:hidden shrink-0" aria-hidden="true" />

        {/* Top Utility Header: Calm Status Context (left) + Love / Edit / Close (right) */}
        <div className="px-5 pt-3 pb-2.5 border-b border-edge-subtle flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 truncate flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className="font-semibold text-ink">
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
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                book.loved
                  ? 'bg-[#8C4A4F] text-[#FFFCF5]'
                  : 'bg-surface-subtle hover:bg-surface-elevated border border-edge-subtle text-ink'
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
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isEditing
                  ? 'bg-primary text-primary-fg'
                  : 'bg-surface-subtle hover:bg-surface-elevated border border-edge-subtle text-ink'
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
              className="min-h-[48px] min-w-[48px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-all active:scale-95"
            >
              <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Card Body */}
        <div className="p-4 sm:p-6 overflow-y-auto md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-6 md:items-start space-y-4 md:space-y-0">
          {/* Column 1: Cover + Stars + Mobile-Inline Title Block */}
          <div className="flex items-start gap-3.5 sm:gap-4 md:flex-col md:items-center md:sticky md:top-0 min-w-0">
            <div className="flex flex-col items-center shrink-0">
              <button
                type="button"
                data-action="toggle-cover-picker"
                aria-expanded={isCoverPickerOpen}
                aria-label={`Change cover for ${book.title}`}
                title="Tap to change book cover"
                onClick={() => setIsCoverPickerOpen((prev) => !prev)}
                className="group relative rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-transform active:scale-95"
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
                  <span className="px-2 py-0.5 rounded-md bg-[#142321]/85 backdrop-blur-xs text-[#F0E7D5] text-[10px] font-semibold inline-flex items-center justify-center gap-1 shadow-xs whitespace-nowrap">
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
                  <span className="mt-0.5 text-[10px] text-ink-muted leading-tight">
                    {effectiveReader.name}’s rating
                  </span>
                )}
                {book.averageRating ? (
                  <span
                    className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-mono-tabular text-ink-muted"
                    title="Catalog community rating"
                  >
                    <span className="text-accent">★</span>
                    <span>
                      {book.averageRating}
                      {book.ratingsCount ? ` (${book.ratingsCount})` : ''}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>

            {/* Mobile/Compact Title & Meta beside Cover */}
            <div className="min-w-0 flex-1 md:hidden">
              <h2
                id="inspect-book-title"
                className="font-display text-lg sm:text-xl font-semibold text-ink leading-snug text-balance"
              >
                {book.title}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-ink-secondary mt-0.5">
                {book.authors.join(', ')}
              </p>

              {/* Compact Hairline Edition Metrics */}
              <div className="mt-2.5 grid grid-cols-2 divide-x divide-edge-subtle rounded-lg bg-surface-subtle border border-edge-subtle py-1.5 px-1">
                <div className="px-2">
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                    Ages
                  </span>
                  <span className="text-xs font-semibold text-ink font-mono-tabular">
                    {book.ageMin}–{book.ageMax}
                  </span>
                </div>
                <div className="px-2 min-w-0">
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                    Stage
                  </span>
                  <span className="block text-xs font-semibold text-ink truncate">
                    {formatReadingStage(book.readingStage)}
                  </span>
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {editionSpecs.length > 0 && (
                  <p className="text-[11px] text-ink-secondary leading-snug">
                    {editionSpecs.join(' · ')}
                  </p>
                )}

                {hintParts.length > 0 && (
                  <p
                    className="text-[11px] text-primary dark:text-accent font-medium leading-snug"
                    title="Read-aloud pacing & duration"
                  >
                    {hintParts.join(' · ')}
                  </p>
                )}

                {isbnVal && (
                  <p className="text-[11px] font-mono-tabular text-ink-muted select-all">
                    ISBN {isbnVal}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Column 2: Desktop Title Block + Actions, Editor, Customize, Tags, Footer */}
          <div className="min-w-0 space-y-4">
            <div className="hidden md:block">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ink leading-snug text-balance">
                {book.title}
              </h2>
              <p className="text-sm font-medium text-ink-secondary mt-0.5">
                {book.authors.join(', ')}
              </p>

              {/* Desktop Structured Edition Metrics Strip */}
              <div className="mt-3 grid grid-cols-4 divide-x divide-edge-subtle rounded-lg bg-surface-subtle border border-edge-subtle py-2">
                <div className="px-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Ages
                  </span>
                  <span
                    className="text-xs font-semibold text-ink font-mono-tabular cursor-help"
                    title="Recommended reading ages (tap Edit to adjust)"
                  >
                    {book.ageMin}–{book.ageMax} yrs
                  </span>
                </div>
                <div className="px-3 min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Stage
                  </span>
                  <span className="block text-xs font-semibold text-ink truncate">
                    {formatReadingStage(book.readingStage)}
                  </span>
                </div>
                <div className="px-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Pages
                  </span>
                  <span className="text-xs font-semibold text-ink font-mono-tabular">
                    {book.pageCount ? `${book.pageCount} pp` : '—'}
                  </span>
                </div>
                <div className="px-3">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Published
                  </span>
                  <span className="text-xs font-semibold text-ink font-mono-tabular">
                    {book.publishedYear || '—'}
                  </span>
                </div>
              </div>

              {(editionSpecs.length > 0 || hintParts.length > 0 || isbnVal) && (
                <div className="mt-2.5 space-y-1">
                  {(book.publisher || (book.language && book.language !== 'english')) && (
                    <p className="text-xs text-ink-secondary">
                      {[book.publisher, book.language && book.language !== 'english' ? book.language : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}

                  {hintParts.length > 0 && (
                    <p
                      className="text-xs text-primary dark:text-accent font-medium leading-snug"
                      title="Read-aloud pacing & duration"
                    >
                      {hintParts.join(' · ')}
                    </p>
                  )}

                  {isbnVal && (
                    <p className="text-[11px] font-mono-tabular text-ink-muted select-all">
                      ISBN {isbnVal}
                    </p>
                  )}
                </div>
              )}
            </div>

          {/* Contextual Drawers: Cover Studio & Bibliographic Editor */}
          {coverStudioSection}
          {editBookSection}

          {/* Quick Shelf & Read Bar */}
          <div className="rounded-xl bg-surface-subtle border border-edge px-4 py-3 space-y-2 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-secondary">
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
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isPickedInActive
                          ? 'bg-primary text-primary-fg'
                          : 'bg-surface hover:bg-surface-elevated text-ink border border-edge'
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
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                        isReadInActive
                          ? 'bg-primary text-primary-fg'
                          : 'bg-surface hover:bg-surface-elevated text-ink border border-edge'
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-[#8C4A4F]/10 border border-edge text-xs font-semibold text-ink-secondary hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Icon name="close" className="w-3.5 h-3.5" />
                        <span>Clear Read</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => store.replaceRotationBookRandom(activeRot.id, book.id)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
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
                          className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                            usageSummary.isReadByActiveProfile
                              ? 'bg-primary text-primary-fg'
                              : 'bg-surface hover:bg-surface-elevated text-ink border border-edge'
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
                          className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
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
                    ? 'font-semibold text-accent'
                    : 'text-ink-secondary'
                }`}
              >
                {usageSegments.join(' · ')}
              </p>
            )}
          </div>

          {/* Unified Customize Table: Reader, Shelf, Condition, Rotations */}
          <section
            aria-label="Customize reader, shelf status, and condition"
            className="rounded-xl bg-surface-subtle border border-edge px-4 py-3 text-xs shadow-2xs"
          >
            <div className="divide-y divide-edge-subtle">
              {/* Row 1: Reader / Household Owners */}
              <div data-customize-row="owner" className="py-2 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-ink-secondary shrink-0">
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
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-primary text-primary-fg'
                              : 'bg-surface border border-edge text-ink-secondary hover:text-ink'
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
                  <summary className="cursor-pointer list-none flex justify-end text-[11px] font-semibold text-primary dark:text-accent select-none">
                    <span>+ Custom owner / house</span>
                  </summary>
                  <form onSubmit={handleAddCustomOwner} className="mt-2 flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <ClearableInput
                        id="inspector-new-owner-input"
                        value={newOwnerInput}
                        onValueChange={setNewOwnerInput}
                        placeholder="e.g., Grandma's House, Cousin Maya"
                        className="w-full h-11 pl-3 pr-8 rounded-lg bg-surface border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <button
                      type="submit"
                      className="h-11 px-3 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
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
                <span className="text-xs font-semibold text-ink-secondary shrink-0">
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
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface border border-edge text-ink-secondary hover:text-ink'
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
                <span className="text-xs font-semibold text-ink-secondary shrink-0">
                  Condition
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {(['good', 'torn', 'broken', 'retired'] as BookCondition[]).map((cond) => {
                    const active = currentCondition === cond;
                    const activeClass =
                      cond === 'broken' || cond === 'retired'
                        ? 'bg-[#8C4A4F] text-[#FFFCF5]'
                        : cond === 'torn'
                          ? 'bg-accent text-[#FFFCF5]'
                          : 'bg-primary text-primary-fg';
                    return (
                      <button
                        key={cond}
                        type="button"
                        onClick={() => handleConditionChange(cond)}
                        aria-pressed={active}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? activeClass
                            : 'bg-surface border border-edge text-ink-secondary hover:text-ink'
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
                  <span className="text-xs font-semibold text-ink-secondary block">
                    Rotations
                  </span>
                  <p className="text-[11px] text-ink-muted">
                    {isExcluded ? 'Excluded from shelf rotations' : 'Eligible for shelf rotations'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  onClick={handleToggleEligibility}
                  aria-checked={!isExcluded}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    isExcluded
                      ? 'bg-surface-elevated text-ink-secondary border border-edge'
                      : 'bg-primary text-primary-fg'
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
            className="space-y-2.5 text-xs text-ink-secondary"
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Topics &amp; Themes
              </strong>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-action="open-ai-tag-modal"
                  onClick={() => setAiTagModal({ isOpen: true, bookId: book.id })}
                  title="Query LLM for interactive features, developmental themes & story tags"
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Icon name="sparkles" className="w-3.5 h-3.5" />
                  <span>AI Tag Assistant</span>
                </button>
                <button
                  type="button"
                  data-action="enrich-book-tags"
                  onClick={handleEnrichRules}
                  title="Quick local rule enrichment"
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
                        className="min-h-[34px] px-2.5 py-1 rounded-md bg-surface-subtle hover:bg-[#8C4A4F]/10 border border-edge-subtle text-xs font-medium text-ink hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
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
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-muted pt-0.5"
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
              <p className="text-ink-muted">No topics tagged yet.</p>
            )}

            <form onSubmit={handleAddTag} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ClearableInput
                  id="inspector-new-tag-input"
                  value={newTagInput}
                  onValueChange={setNewTagInput}
                  placeholder="Add topic (e.g., bedtime, dinosaurs)"
                  className="w-full h-11 pl-3 pr-8 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                className="h-11 px-3.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Add Tag
              </button>
            </form>
          </section>

          {/* Quiet Footer: Source Attribution + External IDs + Preview + Raw Payloads + Remove Book */}
          <div className="pt-3 border-t border-edge-subtle space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                <ProviderAttribution
                  sources={book.sources}
                  prefix="Sources:"
                  includeExternalIds
                />

                {aiSources.length > 0 && (
                  <span
                    className="text-[11px] text-ink-muted whitespace-nowrap cursor-help"
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
                    className="text-[11px] font-semibold text-primary dark:text-accent hover:underline inline-flex items-center gap-0.5 whitespace-nowrap"
                  >
                    <span>Preview ↗</span>
                  </a>
                )}
              </div>

              {!confirmDelete ? (
                <button
                  type="button"
                  data-action="delete-book"
                  onClick={() => setConfirmDelete(true)}
                  aria-label={`Remove ${book.title} from catalog`}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#8C4A4F] dark:text-[#C48A8E] hover:bg-[#8C4A4F]/10 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Icon name="trash" className="w-3.5 h-3.5" />
                  <span>Remove Book</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#8C4A4F]/10 border border-[#8C4A4F]/35 px-3 py-2">
                  <span className="text-xs font-semibold text-[#8C4A4F] dark:text-[#C48A8E]">
                    Remove from library?
                  </span>
                  <button
                    type="button"
                    data-action="confirm-delete-book"
                    onClick={handleConfirmDelete}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] text-xs font-semibold transition-colors"
                  >
                    Yes, Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface border border-edge text-xs font-semibold text-ink hover:bg-surface-elevated"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {hasRawPayloads && (
              <details className="pt-0.5">
                <summary className="cursor-pointer font-semibold text-primary dark:text-accent">
                  View Captured Raw Provider Payloads
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-[#142321] text-[#F0E7D5] border border-edge font-mono-tabular text-[11px] overflow-x-auto max-h-52">
                  {JSON.stringify(book.sources, null, 2)}
                </pre>
              </details>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
