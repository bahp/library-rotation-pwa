import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { StarRating } from '../common/StarRating.js';
import { Icon } from '../common/Icon.js';
import { ToggleSwitch } from '../common/ToggleSwitch.js';
import { ProviderAttribution } from '../common/ProviderAttribution.js';
import {
  EditorialFieldSheet,
  formatBookDimensionsLabel,
  type EditorialFieldKey,
  type PublisherOption,
} from './EditorialFieldSheet.js';
import { BookQuotesSheet } from './BookQuotesSheet.js';
import {
  BookVoiceNoteSheet,
  BookVoiceRecordingEditSheet,
  VoiceWaveformPlayer,
} from './BookVoiceNoteSheet.js';
import { BookOwnersSheet } from './BookOwnersSheet.js';
import { BookCoverStudioSheet } from './BookCoverStudioSheet.js';
import { BookGiftSheet, type GiftStoreOption } from './BookGiftSheet.js';
import { BookGenresSheet } from './BookGenresSheet.js';
import { BookRotationsSheet } from './BookRotationsSheet.js';
import { getBookAudioBlob } from '../../core/storage.js';
import {
  extractCoverPaletteFromUrl,
  normalizeHexColor,
  resolveAccessibleAccentTokens,
  resolveBookCardTintHex,
} from '../../features/catalog/cover-color-extractor.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import {
  computeBookUsageSummary,
  formatShortShelfDate,
} from '../../features/rotations/usage-insights.js';
import { isBookDiscardedForProfile } from '../../features/tagging/discovery-engine.js';
import {
  computeOwnerInitials,
  formatBookAgeLabel,
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
import { AVATAR_TONES, DARK_THEME_PRESET_IDS } from '../../config/index.js';
import type {
  BookAudioRecording,
  BookCondition,
  BookNote,
  BookReadingStatus,
  CollectionStatus,
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
  const { state, store, catalogService, activeProfile, setAiTagModal, setIsSearchOpen, navigate } = useApp();

  const book = state.books.find((b) => b.id === bookId);
  const detailStyle = state.settings?.bookDetailStyle || 'editorial';

  const [isCoverPickerOpen, setIsCoverPickerOpen] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickRulesFeedback, setQuickRulesFeedback] = useState('');

  // Editorial layout interactive states
  const [editorialEditionExpanded, setEditorialEditionExpanded] = useState(true);
  const [activeEditorialField, setActiveEditorialField] = useState<EditorialFieldKey | null>(null);

  // Quotes & Notes slide-up sheet state
  const [quoteSheetState, setQuoteSheetState] = useState<{
    isOpen: boolean;
    note: BookNote | null;
  }>({ isOpen: false, note: null });

  // Voice Note, Owners, Gift, and Genres slide-up sheet states
  const [isVoiceNoteSheetOpen, setIsVoiceNoteSheetOpen] = useState(false);
  const [editingRecording, setEditingRecording] = useState<BookAudioRecording | null>(null);
  const [isOwnersSheetOpen, setIsOwnersSheetOpen] = useState(false);
  const [isGiftSheetOpen, setIsGiftSheetOpen] = useState(false);
  const [isGenresSheetOpen, setIsGenresSheetOpen] = useState(false);
  const [isRotationsSheetOpen, setIsRotationsSheetOpen] = useState(false);
  const [audioObjectUrls, setAudioObjectUrls] = useState<Record<string, string>>({});
  const audioUrlsRef = useRef<Record<string, string>>({});
  const [coverPalette, setCoverPalette] = useState<{ primary: string | null; swatches: string[] }>({
    primary: null,
    swatches: [],
  });

  const existingPublishers = useMemo<PublisherOption[]>(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of state.books) {
      const raw = String(item.publisher || '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(key, { name: raw, count: 1 });
      }
    }
    return Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name)
    );
  }, [state.books]);

  // Reset transient modal state whenever inspected book changes
  useEffect(() => {
    setIsCoverPickerOpen(false);
    setConfirmDelete(false);
    setQuickRulesFeedback('');
    setEditorialEditionExpanded(true);
    setActiveEditorialField(null);
    setQuoteSheetState({ isOpen: false, note: null });
    setIsVoiceNoteSheetOpen(false);
    setEditingRecording(null);
    setIsOwnersSheetOpen(false);
    setIsGiftSheetOpen(false);
    setIsGenresSheetOpen(false);
    setIsRotationsSheetOpen(false);
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

  // Revoke audio blob object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(audioUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
      audioUrlsRef.current = {};
    };
  }, []);

  const showBookDescriptionSetting = state.settings?.showBookDescription !== false;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionHidden, setDescriptionHidden] = useState(!showBookDescriptionSetting);

  const dynamicCoverTint = state.settings?.dynamicCoverTint !== false;
  const dynamicCoverTintMode =
    state.settings?.dynamicCoverTintMode === 'dominant' ||
    state.settings?.dynamicCoverTintMode === 'soft'
      ? state.settings.dynamicCoverTintMode
      : 'prominent';

  useEffect(() => {
    setDescriptionExpanded(false);
    setDescriptionHidden(!showBookDescriptionSetting);
  }, [bookId, showBookDescriptionSetting]);

  // Hydrate immediately from persisted tint/swatches on the Book record; extract only if missing or tint mode changed
  useEffect(() => {
    let cancelled = false;
    const url = book?.coverUrl?.trim();
    if (!book || !url || !dynamicCoverTint) {
      setCoverPalette({ primary: null, swatches: [] });
      return;
    }

    const storedPrimary = normalizeHexColor(book.dominantColor) || null;
    const storedSwatches = Array.isArray(book.dominantColorSwatches)
      ? book.dominantColorSwatches.filter(Boolean)
      : [];
    const hasMatchingMode =
      !book.dominantColorMode || book.dominantColorMode === dynamicCoverTintMode;
    const isManual = book.dominantColorSource === 'manual';

    if (storedPrimary && (isManual || hasMatchingMode)) {
      setCoverPalette({
        primary: storedPrimary,
        swatches: storedSwatches.length > 0 ? storedSwatches : [storedPrimary],
      });
      // Backfill missing swatches silently in the background without changing the locked primary tint
      if (storedSwatches.length === 0) {
        extractCoverPaletteFromUrl(url, { mode: dynamicCoverTintMode })
          .then((palette) => {
            if (cancelled || !palette?.swatches?.length) return;
            setCoverPalette({
              primary: storedPrimary,
              swatches: palette.swatches,
            });
            store
              .setBookDominantColor(book.id, storedPrimary, {
                manual: isManual,
                swatches: palette.swatches,
                mode: dynamicCoverTintMode,
              })
              .catch(() => {});
          })
          .catch(() => {});
      }
      return;
    }

    if (storedPrimary) {
      setCoverPalette({
        primary: storedPrimary,
        swatches: storedSwatches.length > 0 ? storedSwatches : [storedPrimary],
      });
    }

    extractCoverPaletteFromUrl(url, { mode: dynamicCoverTintMode })
      .then((palette) => {
        if (cancelled) return;
        const resolvedSwatches =
          palette.swatches.length > 0 ? palette.swatches : storedSwatches;
        setCoverPalette({
          primary: palette.primary || storedPrimary,
          swatches: resolvedSwatches,
        });

        const shouldPersistAutoTint =
          Boolean(palette.primary) &&
          !isManual &&
          (normalizeHexColor(book.dominantColor) !== palette.primary ||
            book.dominantColorMode !== dynamicCoverTintMode ||
            (resolvedSwatches.length > 0 && storedSwatches.length === 0));

        if (shouldPersistAutoTint && palette.primary) {
          store
            .setBookDominantColor(book.id, palette.primary, {
              manual: false,
              swatches: resolvedSwatches,
              mode: dynamicCoverTintMode,
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled && !storedPrimary) {
          setCoverPalette({ primary: null, swatches: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    book?.id,
    book?.coverUrl,
    book?.dominantColor,
    book?.dominantColorSource,
    book?.dominantColorMode,
    book?.dominantColorSwatches,
    dynamicCoverTint,
    dynamicCoverTintMode,
    store,
  ]);

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

  const handleAddTagValue = async (tagValue: string) => {
    const trimmed = tagValue.trim();
    if (!trimmed) return;
    try {
      await store.addBookTag(book.id, trimmed);
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleRemoveTag = async (tag: string) => {
    await store.removeBookTag(book.id, tag);
  };

  const handleEnrichRules = async () => {
    try {
      const prevTagsCount = book.tags.length;
      const updated = await store.enrichSingleBook(book.id);
      const nextCount = updated?.tags?.length ?? prevTagsCount;
      const added = Math.max(0, nextCount - prevTagsCount);
      setQuickRulesFeedback(
        added > 0
          ? `Added ${added} rule-based ${added === 1 ? 'tag' : 'tags'} & updated reading hints.`
          : 'Reading hints & taxonomy checked — tags are up to date.'
      );
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

  const handleAddCustomOwnerByName = async (customName: string) => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    const raw = normalizeOwnersList(book.owners);
    if (!raw.some((o) => o.toLowerCase() === trimmed.toLowerCase())) {
      await store.updateBook(book.id, {
        owners: [...raw, trimmed],
      });
    }
  };

  const handleSelectCover = async (coverUrl: string) => {
    let extractedPrimary: string | null = null;
    let extractedSwatches: string[] = [];
    try {
      const palette = await extractCoverPaletteFromUrl(coverUrl, {
        mode: dynamicCoverTintMode,
      });
      extractedPrimary = palette.primary;
      extractedSwatches = palette.swatches;
    } catch {
      // Non-fatal; store will also fall back gracefully
    }
    await store.updateBook(book.id, {
      coverUrl,
      ...(extractedPrimary
        ? {
            dominantColor: extractedPrimary,
            dominantColorSource: 'auto',
            dominantColorSwatches: extractedSwatches,
            dominantColorMode: dynamicCoverTintMode,
          }
        : {}),
    });
    setIsCoverPickerOpen(false);
  };

  const handleClearCover = async () => {
    await store.updateBook(book.id, {
      coverUrl: '',
      dominantColor: null,
      dominantColorSwatches: null,
      dominantColorMode: null,
    });
    setIsCoverPickerOpen(false);
  };

  const handleSaveQuoteSheet = async (payload: {
    text: string;
    imageDataUrl?: string;
    authorProfileId?: string;
    forProfileId?: string;
  }) => {
    const editing = quoteSheetState.note;
    if (!editing) {
      await store.addBookNote(book.id, {
        text: payload.text,
        imageDataUrl: payload.imageDataUrl,
        authorProfileId: payload.authorProfileId || effectiveReader?.id || undefined,
        forProfileId: payload.forProfileId || undefined,
      });
    } else {
      await store.updateBookNote(book.id, editing.id, {
        text: payload.text,
        imageDataUrl: payload.imageDataUrl ?? '',
        authorProfileId: payload.authorProfileId ?? '',
        forProfileId: payload.forProfileId ?? '',
      });
    }
  };

  const handleDeleteNoteItem = async (noteId: string) => {
    await store.deleteBookNote(book.id, noteId);
  };

  const handleSaveVoiceNote = async (payload: {
    title?: string;
    durationSec: number;
    mimeType: string;
    blob: Blob;
    authorProfileId?: string;
    forProfileId?: string;
  }) => {
    await store.addBookRecording(book.id, {
      title: payload.title,
      durationSec: payload.durationSec,
      mimeType: payload.mimeType,
      blob: payload.blob,
      authorProfileId: payload.authorProfileId || effectiveReader?.id || undefined,
      forProfileId: payload.forProfileId || undefined,
    });
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
  const discardProfileId = activeProfile?.id;
  const isDiscardedForProfile = isBookDiscardedForProfile(book, discardProfileId);

  const handleDiscardBook = async () => {
    await store.discardSuggestedBook(book, discardProfileId);
    onClose();
  };

  const handleRestoreDiscardedBook = async () => {
    await store.restoreDiscardedBook(book.id, discardProfileId);
  };

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

  const assignedOwnerChips = ownerToggleChips.filter((chip) =>
    currentOwners.some((o) => o.toLowerCase() === chip.key.toLowerCase())
  );
  const displayedOwnerChips =
    assignedOwnerChips.length > 0 ? assignedOwnerChips : [ownerToggleChips[0]];

  const dynamicCoverTintStyle =
    state.settings?.dynamicCoverTintStyle === 'linear' ? 'linear' : 'circular';
  const dynamicCoverTintBehavior =
    state.settings?.dynamicCoverTintBehavior === 'scroll' ? 'scroll' : 'fixed';
  const circularFadePx = Math.max(
    180,
    Math.min(520, Number(state.settings?.dynamicCoverTintCircularFade) || 310)
  );
  const linearFadePct = Math.max(
    35,
    Math.min(100, Number(state.settings?.dynamicCoverTintLinearFade) || 92)
  );
  const tintLayerClass =
    dynamicCoverTintStyle === 'linear' ? 'lr-tint-layer-linear' : 'lr-tint-layer-circular';
  const tintHex = resolveBookCardTintHex(book);
  const activeTintSourceHex = dynamicCoverTint
    ? coverPalette.primary || normalizeHexColor(book.dominantColor) || null
    : null;
  const activeThemePreset =
    state.settings?.themePreset || (state.settings?.theme === 'dark' ? 'forest-brass' : 'bunko');
  const isDarkTheme =
    state.settings?.theme === 'dark' || DARK_THEME_PRESET_IDS.includes(activeThemePreset);
  const coverAccentTokens =
    dynamicCoverTint && state.settings?.dynamicCoverTintAccent && activeTintSourceHex
      ? resolveAccessibleAccentTokens(activeTintSourceHex, isDarkTheme)
      : null;

  const dialogTintStyle =
    dynamicCoverTint || coverAccentTokens
      ? ({
          ...(dynamicCoverTint
            ? {
                '--lr-cover-tint': tintHex,
                '--lr-tint-circular-fade': `${circularFadePx}px`,
                '--lr-tint-linear-fade': `${linearFadePct}%`,
              }
            : {}),
          ...(coverAccentTokens
            ? {
                '--lr-book-accent': coverAccentTokens.accent,
                '--lr-book-accent-hover': coverAccentTokens.accentHover,
                '--lr-book-accent-fg': coverAccentTokens.accentFg,
                '--lr-book-accent-ink': coverAccentTokens.accentInk,
              }
            : {}),
        } as React.CSSProperties)
      : undefined;

  const assignedRotations = state.rotations.filter((r) => r.bookIds.includes(book.id));
  const bookAgesEditorialLabel = formatBookAgeLabel(book.ageMin, book.ageMax, {
    withPrefix: false,
    withYrs: true,
    emptyLabel: 'Set ages',
  });
  const bookAgesCompactLabel = formatBookAgeLabel(book.ageMin, book.ageMax, {
    withPrefix: false,
    withYrs: true,
    emptyLabel: 'Set',
  });

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
  const catalogLinks = [
    {
      id: 'google-books',
      label: 'Google Books',
      url: googleBooksUrl,
      desc: 'Catalog details & preview',
    },
    {
      id: 'open-library',
      label: 'Open Library',
      url: openLibraryUrl,
      desc: 'Editions & open catalog',
    },
    {
      id: 'goodreads',
      label: 'Goodreads',
      url: `https://www.goodreads.com/search?q=${encodedQuery}`,
      desc: 'Reader reviews & lists',
    },
  ];

  const enabledGiftStores = Array.isArray(state.settings?.enabledGiftStores)
    ? state.settings.enabledGiftStores
    : ['bookshop', 'amazon'];
  const amazonDomain = state.settings?.amazonDomain || 'amazon.com';
  const amazonRegionSuffix =
    amazonDomain !== 'amazon.com' ? ` (${amazonDomain.replace(/^amazon\./, '')})` : '';
  const customGiftStoreName =
    String(state.settings?.customGiftStoreName || '').trim() || 'Local Bookstore';
  const rawCustomGiftStoreUrl = String(state.settings?.customGiftStoreUrl || '').trim();
  const resolvedCustomGiftStoreUrl = /^https?:\/\//i.test(rawCustomGiftStoreUrl)
    ? rawCustomGiftStoreUrl.includes('{query}')
      ? rawCustomGiftStoreUrl.replace(/\{query\}/g, encodedQuery)
      : rawCustomGiftStoreUrl.endsWith('=')
        ? `${rawCustomGiftStoreUrl}${encodedQuery}`
        : `${rawCustomGiftStoreUrl}${rawCustomGiftStoreUrl.includes('?') ? '&' : '?'}q=${encodedQuery}`
    : '';

  const giftStoreOptions: GiftStoreOption[] = [];
  if (enabledGiftStores.includes('bookshop')) {
    giftStoreOptions.push({
      id: 'bookshop',
      label: 'Bookshop.org',
      desc: 'Supports independent local bookshops',
      url: `https://bookshop.org/beta-search?keywords=${encodedQuery}`,
      icon: 'bookOpen',
    });
  }
  if (enabledGiftStores.includes('amazon')) {
    giftStoreOptions.push({
      id: 'amazon',
      label: `Amazon${amazonRegionSuffix}`,
      desc: `Search ${amazonDomain} by ISBN or title`,
      url: `https://www.${amazonDomain}/s?k=${encodedQuery}`,
      icon: 'globe',
    });
  }
  if (resolvedCustomGiftStoreUrl) {
    giftStoreOptions.push({
      id: 'custom',
      label: customGiftStoreName,
      desc: 'Your configured bookstore link',
      url: resolvedCustomGiftStoreUrl,
      icon: 'building',
    });
  }

  const totalNotesAndVoiceCount = displayedNotes.length + recordingsList.length;

  const cleanDesc = typeof book.description === 'string' ? book.description.trim() : '';
  const isLongDesc = cleanDesc.length > 220;

  // Book Description / Synopsis section
  const descriptionSection = (
    <section
      aria-label="Book description"
      className="pt-4 border-t border-edge-subtle space-y-2 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          <Icon name="bookOpen" className="w-3.5 h-3.5 text-primary" />
          <span>About This Book</span>
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            data-action="toggle-description-visibility"
            onClick={() => setDescriptionHidden((prev) => !prev)}
            aria-expanded={!descriptionHidden}
            className="text-[11px] font-semibold text-ink-muted hover:text-ink cursor-pointer"
          >
            {descriptionHidden ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            data-editorial-field="description"
            onClick={() => setActiveEditorialField('description')}
            className="text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <Icon name="edit" className="w-3 h-3" />
            <span>{cleanDesc ? 'Edit' : 'Add'}</span>
          </button>
        </div>
      </div>

      {!descriptionHidden &&
        (cleanDesc ? (
          <div className="rounded-2xl bg-surface-subtle/85 border border-edge/85 p-3.5 space-y-1.5">
            <p
              className={`text-xs sm:text-[13px] text-ink-secondary leading-relaxed ${
                !descriptionExpanded && isLongDesc ? 'line-clamp-4' : ''
              }`}
            >
              {cleanDesc}
            </p>
            {isLongDesc && (
              <button
                type="button"
                onClick={() => setDescriptionExpanded((prev) => !prev)}
                className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
              >
                {descriptionExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            data-editorial-field="description"
            onClick={() => setActiveEditorialField('description')}
            className="w-full rounded-xl bg-surface-subtle/60 hover:bg-surface-subtle border border-dashed border-edge px-3.5 py-2.5 text-left text-xs text-ink-muted hover:text-ink transition-colors cursor-pointer"
          >
            Add a short story blurb or description…
          </button>
        ))}
    </section>
  );

  // Unified Quotes, Notes & Voice Notes section
  const quotesAndNotesSection = (
    <section
      aria-label="Quotes, notes, and voice recordings"
      className="pt-4 border-t border-edge-subtle space-y-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          <Icon name="quote" className="w-3.5 h-3.5 text-primary" />
          <span>Quotes &amp; Notes ({totalNotesAndVoiceCount})</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-action="open-add-quote-note"
            onClick={() => setQuoteSheetState({ isOpen: true, note: null })}
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-primary inline-flex items-center gap-1 cursor-pointer"
          >
            <Icon name="stickyNote" className="w-3.5 h-3.5" />
            <span>Note</span>
          </button>
          <button
            type="button"
            data-action="open-voice-note-sheet"
            onClick={() => setIsVoiceNoteSheetOpen(true)}
            aria-label="Record voice note"
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <Icon name="mic" className="w-3.5 h-3.5" />
            <span>Voice</span>
          </button>
        </div>
      </div>

      {/* Written Quotes & Notes inside one clean divided container */}
      {displayedNotes.length > 0 && (
        <div className="rounded-2xl bg-surface-subtle/85 border border-edge/85 divide-y divide-edge-subtle overflow-hidden">
          {displayedNotes.map((entry) => {
            const authorProf = state.profiles.find((p) => p.id === entry.authorProfileId);
            const forProf = state.profiles.find((p) => p.id === entry.forProfileId);
            const authorName = authorProf?.name || 'Household';
            const authorTone = AVATAR_TONES[authorProf?.avatarTone || 'teal'] || AVATAR_TONES.teal;
            const authorInitial = authorProf ? computeOwnerInitials(authorProf.name) : 'H';
            const formattedDate = entry.createdAt ? formatShortShelfDate(entry.createdAt) : '';

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setQuoteSheetState({ isOpen: true, note: entry })}
                aria-label={`Edit note by ${authorName}`}
                className="w-full px-3.5 py-3 flex items-center gap-3 text-left hover:bg-surface-elevated/55 transition-colors cursor-pointer"
              >
                <span
                  className={`w-8 h-8 rounded-full text-[11px] font-bold inline-flex items-center justify-center shrink-0 ${
                    authorProf
                      ? authorTone
                      : 'bg-surface border border-edge text-ink-secondary'
                  }`}
                >
                  {authorInitial}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-serif-italic italic text-sm text-ink leading-snug break-words">
                    {entry.text ? `“${entry.text}”` : 'Photo memory'}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-muted truncate">
                    By {authorName}
                    {forProf ? ` · For ${forProf.name}` : ''}
                    {formattedDate ? ` · ${formattedDate}` : ''}
                  </span>
                </span>
                {entry.imageDataUrl && (
                  <img
                    src={entry.imageDataUrl}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover border border-edge shrink-0"
                  />
                )}
                <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Voice Notes & Read-Alouds directly below in the same section */}
      {recordingsList.length > 0 && (
        <div className="space-y-2">
          {recordingsList.map((rec) => {
            const recAuthor = state.profiles.find((p) => p.id === rec.authorProfileId) || null;
            const recFor = state.profiles.find((p) => p.id === rec.forProfileId) || null;
            return (
              <VoiceWaveformPlayer
                key={rec.id}
                recording={rec}
                srcUrl={audioObjectUrls[rec.id]}
                authorProfile={recAuthor}
                forProfile={recFor}
                onSelect={() => setEditingRecording(rec)}
              />
            );
          })}
        </div>
      )}

      {totalNotesAndVoiceCount === 0 && (
        <button
          type="button"
          onClick={() => setQuoteSheetState({ isOpen: true, note: null })}
          className="w-full text-left py-1 font-serif-italic italic text-sm text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          Tap Note or Voice to save a favorite quote, photo, or bedtime memory…
        </button>
      )}
    </section>
  );

  // Compact Genres & Topics Card + Separated Provider Catalog Categories
  const providerCategories = Array.isArray(book.categories) ? book.categories : [];
  const genresAndTopicsSection = (
    <section
      aria-label="Genres, topics, and catalog categories"
      className="lr-card rounded-2xl bg-surface-subtle/80 border border-edge/80 p-4 space-y-3 text-xs text-ink-secondary"
    >
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Genres &amp; Topics ({book.tags.length})
        </strong>
        <button
          type="button"
          data-action="open-genres-sheet"
          onClick={() => setIsGenresSheetOpen(true)}
          aria-label="Manage genres, AI tag assistant, and quick rules"
          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-primary inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Icon name="sliders" className="w-3.5 h-3.5" />
          <span>Manage</span>
        </button>
      </div>

      {book.tags.length > 0 ? (
        <button
          type="button"
          onClick={() => setIsGenresSheetOpen(true)}
          className="w-full flex flex-wrap items-center gap-1.5 text-left cursor-pointer"
        >
          {book.tags.map((tag) => {
            const origin = resolveBookTagOrigin(book, tag);
            const meta = TAG_ORIGIN_META[origin];
            return (
              <span
                key={tag}
                data-tag-origin={origin}
                title={meta.badgeTitle}
                className="min-h-[28px] px-2.5 py-0.5 rounded-md bg-surface border border-edge text-xs font-medium text-ink inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Icon name={meta.icon} className="w-3 h-3 opacity-60 shrink-0" />
                <span>{tag}</span>
              </span>
            );
          })}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsGenresSheetOpen(true)}
          className="w-full text-left text-ink-muted hover:text-ink transition-colors cursor-pointer"
        >
          No genres or topics yet. Tap Manage to add tags, browse genres, or run AI / Quick Rules.
        </button>
      )}

      {providerCategories.length > 0 && (
        <div
          data-catalog-categories="true"
          className="pt-2.5 border-t border-edge-subtle space-y-1.5"
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Catalog Categories ({providerCategories.length})
          </span>
          <p className="text-xs text-ink-secondary leading-relaxed">
            {providerCategories.join(' · ')}
          </p>
        </div>
      )}
    </section>
  );

  const renderCatalogBrandLogo = (id: string) => {
    if (id === 'google-books') {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09a6.97 6.97 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
          />
        </svg>
      );
    }
    if (id === 'open-library') {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 shrink-0 text-accent"
          aria-hidden="true"
        >
          <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22.5v-17Z" />
          <path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5a2.5 2.5 0 0 1 2.5 2.5v-17Z" />
        </svg>
      );
    }
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-5 h-5 shrink-0 text-goodreads"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="5"
          fill="currentColor"
          fillOpacity="0.16"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.2"
        />
        <text
          x="12"
          y="16.2"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="600"
          fontSize="14.5"
          fill="currentColor"
        >
          g
        </text>
      </svg>
    );
  };

  const cardTintSwatchesBar =
    dynamicCoverTint && (coverPalette.swatches.length > 0 || book.dominantColor) ? (
      <div
        data-cover-tint-swatches="true"
        className="flex flex-wrap items-center justify-between gap-2.5 pt-2 text-[11px]"
      >
        <span className="inline-flex items-center gap-1.5 text-ink-muted font-medium">
          <span
            className="w-2.5 h-2.5 rounded-full border border-edge/80 shrink-0"
            style={{ backgroundColor: tintHex }}
            aria-hidden="true"
          />
          <span>
            Card tint ({book.dominantColorSource === 'manual' ? 'Custom' : dynamicCoverTintMode})
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {coverPalette.swatches.map((hex) => {
            const active = tintHex.toUpperCase() === hex.toUpperCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() =>
                  store.setBookDominantColor(book.id, hex, {
                    manual: true,
                    swatches: coverPalette.swatches,
                    mode: dynamicCoverTintMode,
                  })
                }
                aria-label={`Use cover tint ${hex}`}
                aria-pressed={active}
                title={`Use cover tint ${hex}`}
                style={{ backgroundColor: hex }}
                className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                  active
                    ? 'ring-2 ring-offset-2 ring-primary ring-offset-[var(--surface)] scale-110'
                    : 'ring-1 ring-hairline hover:scale-110'
                }`}
              />
            );
          })}
          {book.dominantColorSource === 'manual' && coverPalette.primary && (
            <button
              type="button"
              onClick={() =>
                store.setBookDominantColor(book.id, coverPalette.primary, {
                  manual: false,
                  swatches: coverPalette.swatches,
                  mode: dynamicCoverTintMode,
                })
              }
              className="ml-0.5 px-2 py-0.5 rounded-md bg-surface-subtle hover:bg-surface-elevated border border-edge text-[10px] font-semibold text-ink-secondary hover:text-ink cursor-pointer"
            >
              Auto
            </button>
          )}
        </div>
      </div>
    ) : null;

  // Shared slide-up editor overlays mounted across both Editorial & Compact modes
  const sharedOverlaySheets = (
    <>
      <EditorialFieldSheet
        field={activeEditorialField}
        book={book}
        existingPublishers={existingPublishers}
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

      <BookGenresSheet
        isOpen={isGenresSheetOpen}
        book={book}
        quickRulesFeedback={quickRulesFeedback}
        onClose={() => setIsGenresSheetOpen(false)}
        onAddTag={handleAddTagValue}
        onRemoveTag={handleRemoveTag}
        onOpenAiAssistant={() => setAiTagModal({ isOpen: true, bookId: book.id })}
        onRunQuickRules={handleEnrichRules}
      />

      <BookGiftSheet
        isOpen={isGiftSheetOpen}
        bookTitle={book.title}
        authorsText={book.authors.join(', ')}
        isbn={isbnVal || undefined}
        stores={giftStoreOptions}
        onClose={() => setIsGiftSheetOpen(false)}
        onConfigureStores={() => {
          onClose();
          navigate('settings', { section: 'catalog' });
        }}
        onNotify={(msg, tone) => store.notify(msg, tone)}
      />

      <BookQuotesSheet
        isOpen={quoteSheetState.isOpen}
        editingNote={quoteSheetState.note}
        profiles={state.profiles}
        defaultAuthorId={effectiveReader?.id || state.profiles[0]?.id || ''}
        onClose={() => setQuoteSheetState({ isOpen: false, note: null })}
        onSave={handleSaveQuoteSheet}
        onDelete={handleDeleteNoteItem}
      />

      <BookVoiceNoteSheet
        isOpen={isVoiceNoteSheetOpen}
        profiles={state.profiles}
        defaultAuthorId={effectiveReader?.id || state.profiles[0]?.id || ''}
        onClose={() => setIsVoiceNoteSheetOpen(false)}
        onSaveRecording={handleSaveVoiceNote}
      />

      <BookVoiceRecordingEditSheet
        recording={editingRecording}
        srcUrl={editingRecording ? audioObjectUrls[editingRecording.id] : undefined}
        profiles={state.profiles}
        onClose={() => setEditingRecording(null)}
        onSave={async (recId, patch) => {
          await store.updateBookRecording(book.id, recId, patch);
        }}
        onDelete={async (recId) => {
          await store.deleteBookRecording(book.id, recId);
        }}
      />

      <BookOwnersSheet
        isOpen={isOwnersSheetOpen}
        bookTitle={book.title}
        options={ownerToggleChips}
        selectedOwners={currentOwners}
        onToggleOwner={handleToggleOwner}
        onAddCustomOwner={handleAddCustomOwnerByName}
        onClose={() => setIsOwnersSheetOpen(false)}
      />

      <BookCoverStudioSheet
        isOpen={isCoverPickerOpen}
        book={book}
        coverAspectRatio={state.settings?.coverAspectRatio || 'square'}
        enabledMetadataProviders={state.settings?.enabledMetadataProviders}
        catalogService={catalogService}
        onSelectCover={handleSelectCover}
        onClearCover={handleClearCover}
        onClose={() => setIsCoverPickerOpen(false)}
        onNotify={(msg, tone) => store.notify(msg, tone)}
      />

      <BookRotationsSheet
        isOpen={isRotationsSheetOpen}
        book={book}
        rotations={state.rotations}
        profiles={state.profiles}
        onToggleRotation={async (rotationId) => {
          await store.toggleBookInRotation(rotationId, book.id);
        }}
        onClose={() => setIsRotationsSheetOpen(false)}
      />
    </>
  );

  // =========================================================================
  // EDITORIAL BOOK DETAIL VIEW (Option B — Matching Midnight Library Reference)
  // =========================================================================
  if (detailStyle === 'editorial') {
    const isReadByReader = isReadInActive || usageSummary.isReadByActiveProfile;
    const isCurrentlyReading = Boolean(
      effectiveReader &&
        Array.isArray(effectiveReader.currentlyReadingBookIds) &&
        effectiveReader.currentlyReadingBookIds.includes(book.id)
    );
    const readingStatus: BookReadingStatus = isReadByReader
      ? 'read'
      : isCurrentlyReading
        ? 'reading'
        : 'to-read';

    return (
      <div
        data-backdrop-action="close-inspect-book"
        className="sheet-backdrop fixed inset-0 z-[60] bg-scrim-dense backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-book-title"
          data-book-detail-style="editorial"
          style={dialogTintStyle}
          data-cover-tint={dynamicCoverTint ? tintHex : undefined}
          data-cover-tint-style={dynamicCoverTint ? dynamicCoverTintStyle : undefined}
          data-cover-tint-behavior={dynamicCoverTint ? dynamicCoverTintBehavior : undefined}
          data-book-accent={coverAccentTokens ? 'cover' : undefined}
          onClick={(e) => e.stopPropagation()}
          className={`lr-book-accent-scope relative animate-sheet-up w-full max-w-lg sm:max-w-xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl ${
            dynamicCoverTint ? 'lr-tinted-card ' : ''
          }bg-surface border border-edge shadow-2xl overflow-hidden`}
        >
          {dynamicCoverTint && dynamicCoverTintBehavior === 'fixed' && (
            <div
              aria-hidden="true"
              data-cover-tint-layer="fixed"
              className={`pointer-events-none absolute inset-0 z-0 ${tintLayerClass}`}
            />
          )}

          <div className="relative z-10 flex-1 overflow-y-auto no-scrollbar">
            <div className="relative min-h-full">
              {dynamicCoverTint && dynamicCoverTintBehavior === 'scroll' && (
                <div
                  aria-hidden="true"
                  data-cover-tint-layer="scroll"
                  className={`pointer-events-none absolute top-0 inset-x-0 h-[640px] z-0 [mask-image:linear-gradient(180deg,#000_62%,transparent_100%)] ${tintLayerClass}`}
                />
              )}

              {/* Sticky Floating Top Controls: Back (left), Drag Handle (mobile), & Love (right) */}
              <div className="sticky top-0 z-30 px-5 pt-4 pb-1 flex items-center justify-between pointer-events-none">
                <button
                  type="button"
                  data-action="close-inspect-book"
                  onClick={onClose}
                  aria-label="Close book details"
                  className="pointer-events-auto w-10 h-10 rounded-full bg-glass-surface backdrop-blur-md hover:bg-surface-elevated border border-edge/80 shadow-float text-ink flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
                >
                  <Icon name="arrowLeft" className="w-4 h-4" />
                </button>

                <div
                  className="pointer-events-auto self-start mt-1 w-10 h-1 rounded-full bg-ink/25 mx-auto sm:hidden shrink-0"
                  aria-hidden="true"
                />

                <button
                  type="button"
                  data-action="toggle-book-loved"
                  onClick={handleToggleLoved}
                  aria-pressed={book.loved ? 'true' : 'false'}
                  aria-label={book.loved ? 'Remove Loved mark' : 'Mark as Loved'}
                  className={`pointer-events-auto w-10 h-10 rounded-full border shadow-float flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                    book.loved
                      ? 'bg-loved border-loved text-loved-fg'
                      : 'bg-glass-surface backdrop-blur-md hover:bg-surface-elevated border-edge/80 text-ink-secondary hover:text-ink'
                  }`}
                >
                  <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-4 h-4" />
                </button>
              </div>

              {/* Hero Header (flush top alignment so tint covers 100% of top area without gap) */}
              <div className="relative z-10 -mt-[60px] px-5 pt-[60px] pb-6">
              {/* Centered Tracked Uppercase Collection Status Divider (taps open slide-up sheet) */}
              <div className="mt-1 flex flex-col items-center">
                <button
                  type="button"
                  data-editorial-field="collectionStatus"
                  onClick={() => setActiveEditorialField('collectionStatus')}
                  aria-label={`Collection status: ${formatCollectionStatus(currentStatus)}. Tap to change`}
                  className="inline-flex items-center gap-2.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em] text-primary hover:bg-surface-subtle/60 transition-colors cursor-pointer"
                >
                  <span className="w-4 h-px bg-primary/50" aria-hidden="true" />
                  <span>{formatCollectionStatus(currentStatus)}</span>
                  <Icon name="chevronDown" className="w-3 h-3" />
                  <span className="w-4 h-px bg-primary/50" aria-hidden="true" />
                </button>
              </div>

              {/* Centered Floating Cover with Subtle Physical Depth & Pencil Cue */}
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  data-action="toggle-cover-picker"
                  aria-expanded={isCoverPickerOpen}
                  aria-label={`Change cover for ${book.title}`}
                  onClick={() => setIsCoverPickerOpen(true)}
                  className="group relative rounded-xl shadow-cover-hero ring-1 ring-hairline transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
                >
                  <BookCover
                    book={book}
                    size="lg"
                    aspectRatio={state.settings?.coverAspectRatio || 'square'}
                  />
                  <span
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-canvas/85 backdrop-blur-xs border border-edge/70 text-ink flex items-center justify-center shadow-sm opacity-90 group-hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  >
                    <Icon name="edit" className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>

              {/* Centered Individually Editable Title + Author + Active Reader Rating */}
              <div className="mt-5 text-center px-2 flex flex-col items-center">
                <button
                  type="button"
                  data-editorial-field="title"
                  onClick={() => setActiveEditorialField('title')}
                  title="Tap to edit title"
                  className="group inline-flex items-baseline justify-center gap-1.5 rounded-lg px-2 py-0.5 hover:bg-surface-subtle/60 transition-colors cursor-pointer max-w-full"
                >
                  <h2
                    id="inspect-book-title"
                    className="font-display text-2xl sm:text-[28px] font-bold text-ink leading-tight text-balance"
                  >
                    {book.title}
                  </h2>
                </button>
                <button
                  type="button"
                  data-editorial-field="authors"
                  onClick={() => setActiveEditorialField('authors')}
                  title="Tap to edit authors"
                  className="mt-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-0.5 font-serif-italic italic text-base text-ink-secondary hover:text-ink hover:bg-surface-subtle/60 transition-colors cursor-pointer"
                >
                  <span>by {book.authors.join(', ')}</span>
                </button>
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

              {/* Clean 3-State Reading Status Control + Shelf Quick Actions */}
              <div className="mt-4 flex flex-col items-center gap-2.5">
                <div
                  role="group"
                  aria-label="Reading status"
                  className="inline-flex items-center p-1 rounded-full bg-surface-subtle/90 border border-edge/85 shadow-2xs"
                >
                  {(
                    [
                      { id: 'to-read', label: 'To Read', icon: 'bookmark' },
                      { id: 'reading', label: 'Reading', icon: 'bookOpen' },
                      { id: 'read', label: 'Read', icon: 'check' },
                    ] as Array<{ id: BookReadingStatus; label: string; icon: string }>
                  ).map((opt) => {
                    const active = readingStatus === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={active}
                        data-reading-status-option={opt.id}
                        onClick={() =>
                          store.setProfileBookReadingStatus(effectiveReader?.id, book.id, opt.id)
                        }
                        className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          active
                            ? 'bg-primary text-primary-fg shadow-xs'
                            : 'text-ink-secondary hover:text-ink'
                        }`}
                      >
                        <Icon name={opt.icon} className="w-3.5 h-3.5 shrink-0" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {activeRot && (inActiveShelf || rotatable) && (
                    inActiveShelf ? (
                      <>
                        <span className="min-h-[32px] px-3 py-1 rounded-full bg-surface-subtle/80 border border-edge/80 text-[11px] font-medium text-ink-secondary inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" />
                          <span>On Active Shelf</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => store.toggleRotationBookPicked(activeRot.id, book.id)}
                          className={`min-h-[32px] px-3 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                            isPickedInActive
                              ? 'bg-primary/15 border border-primary/50 text-primary'
                              : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
                          }`}
                        >
                          <Icon name={isPickedInActive ? 'bookmarkFilled' : 'bookmark'} className="w-3 h-3" />
                          <span>{isPickedInActive ? 'Picked' : 'Mark Picked'}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await store.addBooksToRotationManual(activeRot.id, [book.id]);
                          store.notify(`Added "${book.title}" to active shelf!`, 'success');
                        }}
                        className="min-h-[32px] px-3 py-1 rounded-full bg-surface-subtle hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-primary inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Icon name="plus" className="w-3 h-3" />
                        <span>Add to Active Shelf</span>
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    data-action="open-gift-sheet"
                    onClick={() => setIsGiftSheetOpen(true)}
                    className="min-h-[32px] px-3 py-1 rounded-full bg-surface-subtle/90 hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Icon name="gift" className="w-3.5 h-3.5 text-primary" />
                    <span>Gift / Buy</span>
                  </button>

                  {isDiscardedForProfile ? (
                    <button
                      type="button"
                      data-action="restore-discarded-book"
                      onClick={handleRestoreDiscardedBook}
                      className="min-h-[32px] px-3 py-1 rounded-full bg-surface-subtle/90 hover:bg-surface-elevated border border-primary/40 text-[11px] font-semibold text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Icon name="check" className="w-3.5 h-3.5" />
                      <span>Restore suggestion</span>
                    </button>
                  ) : (
                    (currentStatus === 'interested' || currentStatus === 'wishlist') && (
                      <button
                        type="button"
                        data-action="discard-suggested-book"
                        onClick={handleDiscardBook}
                        className="min-h-[32px] px-3 py-1 rounded-full bg-surface-subtle/90 hover:bg-danger/10 border border-edge text-[11px] font-semibold text-ink-secondary hover:text-danger inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Icon name="eyeOff" className="w-3.5 h-3.5" />
                        <span>Not interested</span>
                      </button>
                    )
                  )}
                </div>

                {hintParts.length > 0 && (
                  <p className="text-[11px] text-ink-muted font-medium">
                    {hintParts.join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <div className="relative z-10 px-5 pb-[max(1.75rem,calc(env(safe-area-inset-bottom,0px)+1rem))] space-y-4">
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
                      onClick={() => setActiveEditorialField('title')}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="edit" className="w-3.5 h-3.5" />
                      <span>Edit title</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        setIsSearchOpen(true);
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
                      className="text-xs font-medium text-ink-secondary hover:text-danger transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </section>
              )}

              {/* Slightly Separated 2x2 / 1x4 Metadata Mini-Cards (Format · Stage · Ages · Pages) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  data-editorial-field="format"
                  onClick={() => setActiveEditorialField('format')}
                  className="lr-card rounded-xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/85 px-3 py-2.5 text-center transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Format
                  </span>
                  <span className="mt-0.5 block font-display text-sm font-semibold text-ink truncate">
                    {formatBookBinding(book.format) || 'Set format'}
                  </span>
                </button>

                <button
                  type="button"
                  data-editorial-field="readingStage"
                  onClick={() => setActiveEditorialField('readingStage')}
                  className="lr-card rounded-xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/85 px-3 py-2.5 text-center transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Stage
                  </span>
                  <span className="mt-0.5 block font-display text-sm font-semibold text-ink truncate">
                    {formatReadingStage(book.readingStage)}
                  </span>
                </button>

                <button
                  type="button"
                  data-editorial-field="ages"
                  onClick={() => setActiveEditorialField('ages')}
                  className="lr-card rounded-xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/85 px-3 py-2.5 text-center transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Ages
                  </span>
                  <span
                    className={`mt-0.5 block font-display text-sm font-semibold truncate ${
                      typeof book.ageMin === 'number'
                        ? 'text-ink font-mono-tabular'
                        : 'italic text-ink-muted'
                    }`}
                  >
                    {bookAgesEditorialLabel}
                  </span>
                </button>

                <button
                  type="button"
                  data-editorial-field="pageCount"
                  onClick={() => setActiveEditorialField('pageCount')}
                  className="lr-card rounded-xl bg-surface-subtle/90 hover:bg-surface-elevated border border-edge/85 px-3 py-2.5 text-center transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Pages
                  </span>
                  <span
                    className={`mt-0.5 block font-display text-sm font-semibold truncate ${
                      book.pageCount
                        ? 'text-ink font-mono-tabular'
                        : 'italic text-ink-muted'
                    }`}
                  >
                    {book.pageCount ? `${book.pageCount} pp` : 'Set pages'}
                  </span>
                </button>
              </div>

              {/* Collapsible EDITION Card (Publisher, ISBN, Pub Year, Edition, Est. Value, Language, Condition, Dimensions) */}
              <section className="lr-card rounded-2xl bg-surface-subtle/90 border border-edge/90 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setEditorialEditionExpanded((p) => !p)}
                  aria-expanded={editorialEditionExpanded}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-elevated/40 transition-colors"
                >
                  <span className="inline-flex items-center gap-2.5 shrink-0">
                    <Icon name="fileText" className="w-4 h-4 text-ink-secondary" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
                      Edition
                    </span>
                  </span>

                  <span className="flex items-center gap-2 min-w-0">
                    {!editorialEditionExpanded && (book.publisher || book.publishedYear || isbnVal) && (
                      <span className="text-[11px] text-ink-muted truncate font-mono-tabular">
                        {[book.publisher, book.publishedYear, isbnVal].filter(Boolean).join(' · ')}
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
                      data-editorial-field="publishedYear"
                      onClick={() => setActiveEditorialField('publishedYear')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="calendar" className="w-4 h-4" />
                        <span>Pub. Year</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <span className={book.publishedYear ? 'font-mono-tabular text-ink' : 'italic text-ink-muted'}>
                          {book.publishedYear || 'Set year'}
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
                      data-editorial-field="estimatedValue"
                      onClick={() => setActiveEditorialField('estimatedValue')}
                      className="w-full py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2.5 text-ink-secondary">
                        <Icon name="award" className="w-4 h-4" />
                        <span>Est. Value</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <span
                          className={
                            book.estimatedValue !== undefined || book.listPriceAmount !== undefined
                              ? 'font-mono-tabular text-ink'
                              : 'italic text-ink-muted'
                          }
                        >
                          {book.estimatedValue !== undefined
                            ? `${book.estimatedCurrency || 'USD'} ${Number(book.estimatedValue).toFixed(2)}`
                            : book.listPriceAmount !== undefined
                              ? `${book.listPriceCurrency || 'USD'} ${Number(book.listPriceAmount).toFixed(2)}`
                              : 'Set value'}
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

              {/* Assigned Rotations + Rotation Eligibility Card */}
              <div className="lr-card rounded-2xl bg-surface-subtle/85 border border-edge/85 divide-y divide-edge-subtle overflow-hidden">
                <button
                  type="button"
                  data-action="open-book-rotations-sheet"
                  onClick={() => setIsRotationsSheetOpen(true)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-elevated/45 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-surface border border-edge/80 flex items-center justify-center text-primary shrink-0 mt-0.5">
                      <Icon name="rotations" className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink leading-snug">
                        Assigned Rotations
                      </p>
                      <p className="text-xs text-ink-secondary mt-0.5 leading-snug truncate">
                        {assignedRotations.length > 0
                          ? assignedRotations
                              .map((r) => `${r.title}${r.status === 'active' ? ' (Active)' : ''}`)
                              .join(' · ')
                          : 'Not placed on any rotation yet'}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary shrink-0">
                    <span>{assignedRotations.length > 0 ? 'Manage' : 'Assign'}</span>
                    <Icon name="chevronRight" className="w-4 h-4 text-ink-muted" />
                  </span>
                </button>

                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p id="editorial-rotation-label" className="text-sm font-semibold text-ink leading-snug">
                      Eligible for shelf rotations
                    </p>
                    <p className="text-xs text-ink-secondary mt-0.5 leading-snug">
                      {isExcluded
                        ? 'Kept in catalog only · skipped in rotations'
                        : rotatable && showRotationHistory && usageSegments.length > 0
                          ? usageSegments.slice(0, 2).join(' · ')
                          : 'Included in automatic family shelf rotations'}
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={!isExcluded}
                    onChange={handleToggleEligibility}
                    ariaLabelledBy="editorial-rotation-label"
                    onLabel="Included"
                    offLabel="Excluded"
                  />
                </div>
              </div>

              {/* Community Rating & External Catalog Links */}
              <section
                aria-label="Community rating and external catalog links"
                className="lr-card rounded-2xl bg-surface-subtle/85 border border-edge/85 overflow-hidden text-xs"
              >
                {book.averageRating ? (
                  <div className="px-4 py-2 border-b border-edge-subtle flex items-center justify-center gap-1.5 font-mono-tabular font-semibold text-ink">
                    <span className="text-accent">★</span>
                    <span>{book.averageRating}</span>
                    {book.ratingsCount ? (
                      <span className="text-ink-muted font-normal">
                        ({book.ratingsCount})
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-3 divide-x divide-edge-subtle">
                  {catalogLinks.map((ext) => (
                    <a
                      key={ext.id}
                      href={ext.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${ext.label} — ${ext.desc}`}
                      className="group min-h-[64px] px-2 py-2.5 flex flex-col items-center justify-center gap-1.5 hover:bg-surface-elevated/60 transition-colors text-center"
                    >
                      {renderCatalogBrandLogo(ext.id)}
                      <span className="text-[11px] font-medium text-ink-secondary group-hover:text-ink leading-tight truncate max-w-full">
                        {ext.label}
                      </span>
                    </a>
                  ))}
                </div>
              </section>

              {/* Aligned Other Readers' Ratings + Owners Row with Chevron */}
              {(() => {
                const otherProfiles = effectiveReader
                  ? state.profiles.filter((p) => p.id !== effectiveReader.id)
                  : state.profiles;
                return (
                  <section className="lr-card rounded-2xl bg-surface-subtle/85 border border-edge/85 p-4 space-y-3 text-xs">
                    {otherProfiles.length > 0 && (
                      <div className="space-y-2">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                          Other Readers
                        </span>
                        <div className="divide-y divide-edge-subtle/70">
                          {otherProfiles.map((prof) => {
                            const profRating = getBookUserRating(book, prof.id);
                            const tone = AVATAR_TONES[prof.avatarTone || 'teal'] || AVATAR_TONES.teal;
                            return (
                              <div
                                key={prof.id}
                                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                              >
                                <span className="inline-flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={`w-6 h-6 rounded-full text-[10px] font-bold inline-flex items-center justify-center shrink-0 ${tone}`}
                                  >
                                    {computeOwnerInitials(prof.name)}
                                  </span>
                                  <span className="font-medium text-ink truncate text-xs sm:text-[13px]">
                                    {prof.name}
                                  </span>
                                </span>
                                <div className="shrink-0">
                                  <StarRating
                                    rating={profRating}
                                    onChange={(r) => handleRatingChange(r, prof.id)}
                                    size="sm"
                                    compact
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      data-action="open-owners-sheet"
                      onClick={() => setIsOwnersSheetOpen(true)}
                      aria-label="Edit book owners"
                      className={`${
                        otherProfiles.length > 0 ? 'pt-3 border-t border-edge-subtle ' : ''
                      }w-full flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted shrink-0">
                        Owners
                      </span>
                      <span className="inline-flex items-center justify-end gap-2 min-w-0">
                        <span className="inline-flex flex-wrap items-center justify-end gap-1.5 text-xs font-semibold text-ink">
                          {displayedOwnerChips.map((chip) => {
                            const tone = AVATAR_TONES[chip.tone] || AVATAR_TONES.teal;
                            return (
                              <span
                                key={chip.key}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-edge/80"
                              >
                                <span
                                  className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ${tone}`}
                                >
                                  {chip.initial}
                                </span>
                                <span>{chip.label}</span>
                              </span>
                            );
                          })}
                        </span>
                        <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
                      </span>
                    </button>
                  </section>
                );
              })()}

              {descriptionSection}

              {quotesAndNotesSection}

              {genresAndTopicsSection}

              {cardTintSwatchesBar}

              {/* Source Provenance, External IDs & Date Added */}
              <div className="pt-2 space-y-2 text-xs">
                <div className="flex flex-col items-start gap-2">
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
                  </div>
                </div>

                {formattedAddedDate && (
                  <p className="text-[11px] text-ink-muted text-center w-full mt-2">
                    Added {formattedAddedDate}
                  </p>
                )}

                {hasRawPayloads && (
                  <details className="pt-0.5">
                    <summary className="cursor-pointer font-semibold text-primary dark:text-accent">
                      View Captured Raw Provider Payloads
                    </summary>
                    <pre className="mt-2 p-3 rounded-lg bg-code text-code-ink border border-code-edge font-mono-tabular text-[11px] overflow-x-auto max-h-52">
                      {JSON.stringify(book.sources, null, 2)}
                    </pre>
                  </details>
                )}
              </div>

              {/* Bottom Remove Hairline Footer */}
              <div className="pt-3 border-t border-edge-subtle flex flex-wrap items-center justify-center gap-2">
                {isDiscardedForProfile ? (
                  <button
                    type="button"
                    data-action="restore-discarded-book"
                    onClick={handleRestoreDiscardedBook}
                    className="min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Icon name="check" className="w-3.5 h-3.5" />
                    <span>Restore to suggestions</span>
                  </button>
                ) : (
                  (currentStatus === 'interested' || currentStatus === 'wishlist') && (
                    <button
                      type="button"
                      data-action="discard-suggested-book"
                      onClick={handleDiscardBook}
                      className="min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold text-ink-secondary hover:text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Icon name="eyeOff" className="w-3.5 h-3.5" />
                      <span>Not interested</span>
                    </button>
                  )
                )}
                {!confirmDelete ? (
                  <button
                    type="button"
                    data-action="delete-book"
                    onClick={() => setConfirmDelete(true)}
                    className="min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
                    <span>Remove book</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-danger/10 border border-danger/35 px-3 py-2.5 text-xs">
                    <span className="font-semibold text-danger">
                      Remove from library?
                    </span>
                    <button
                      type="button"
                      data-action="confirm-delete-book"
                      onClick={handleConfirmDelete}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-danger-solid hover:bg-danger-solid-hover text-danger-solid-fg font-semibold cursor-pointer"
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
        </div>

        {sharedOverlaySheets}
      </div>
    );
  }

  // =========================================================================
  // COMPACT BOOK DETAIL VIEW (Option A — Preserved Information-Dense View)
  // =========================================================================
  return (
    <div
      data-backdrop-action="close-inspect-book"
      className="sheet-backdrop fixed inset-0 z-[60] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-book-title"
        data-book-detail-style="compact"
        style={dialogTintStyle}
        data-cover-tint={dynamicCoverTint ? tintHex : undefined}
        data-cover-tint-style={dynamicCoverTint ? dynamicCoverTintStyle : undefined}
        data-cover-tint-behavior={dynamicCoverTint ? dynamicCoverTintBehavior : undefined}
        data-book-accent={coverAccentTokens ? 'cover' : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`lr-book-accent-scope relative animate-sheet-up w-full max-w-lg sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-xl ${
          dynamicCoverTint ? 'lr-tinted-card ' : ''
        }bg-surface border border-edge shadow-2xl overflow-hidden`}
      >
        {dynamicCoverTint && dynamicCoverTintBehavior === 'fixed' && (
          <div
            aria-hidden="true"
            data-cover-tint-layer="fixed"
            className={`pointer-events-none absolute inset-0 z-0 ${tintLayerClass}`}
          />
        )}

        <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-y-auto no-scrollbar">
          <div className="relative flex-1 flex flex-col">
            {dynamicCoverTint && dynamicCoverTintBehavior === 'scroll' && (
              <div
                aria-hidden="true"
                data-cover-tint-layer="scroll"
                className={`pointer-events-none absolute top-0 inset-x-0 h-[620px] z-0 [mask-image:linear-gradient(180deg,#000_62%,transparent_100%)] ${tintLayerClass}`}
              />
            )}

            {/* Mobile Handle Pill */}
            <div className="relative z-10 w-10 h-1 bg-edge rounded-full mx-auto mt-3 sm:hidden shrink-0" aria-hidden="true" />

            {/* Top Utility Header: Calm Status Context (left) + Love / Close (right) */}
            <div className="relative z-10 px-5 pt-3 pb-2.5 border-b border-edge-subtle flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 truncate flex items-center gap-1.5 text-xs text-ink-secondary">
            <button
              type="button"
              data-editorial-field="collectionStatus"
              onClick={() => setActiveEditorialField('collectionStatus')}
              className="font-semibold text-ink hover:text-primary inline-flex items-center gap-1 cursor-pointer"
            >
              <span>{formatCollectionStatus(currentStatus)}</span>
              <Icon name="chevronDown" className="w-3 h-3 text-ink-muted" />
            </button>
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
                  ? 'bg-loved text-loved-fg'
                  : 'bg-surface-subtle hover:bg-surface-elevated border border-edge-subtle text-ink'
              }`}
            >
              <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-3.5 h-3.5" />
              <span>{book.loved ? 'Loved' : 'Love'}</span>
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
        <div className="relative z-10 p-4 sm:p-6 pb-[max(1.75rem,calc(env(safe-area-inset-bottom,0px)+1rem))] md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-6 md:items-start space-y-4 md:space-y-0">
          {/* Column 1: Cover + Stars + Mobile-Inline Title Block */}
          <div className="flex items-start gap-3.5 sm:gap-4 md:flex-col md:items-center md:sticky md:top-0 min-w-0">
            <div className="flex flex-col items-center shrink-0">
              <button
                type="button"
                data-action="toggle-cover-picker"
                aria-expanded={isCoverPickerOpen}
                aria-label={`Change cover for ${book.title}`}
                title="Tap to change book cover"
                onClick={() => setIsCoverPickerOpen(true)}
                className="group relative rounded-xl shadow-cover ring-1 ring-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-transform active:scale-95 cursor-pointer"
              >
                <BookCover
                  book={book}
                  size="md"
                  aspectRatio={state.settings?.coverAspectRatio || 'square'}
                />
                <span
                  data-cover-badge="centered"
                  className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-20 flex justify-center"
                >
                  <span className="px-2 py-0.5 rounded-md bg-scanner/90 backdrop-blur-xs text-scanner-ink text-[10px] font-semibold inline-flex items-center justify-center gap-1 shadow-xs whitespace-nowrap">
                    <Icon name="camera" className="w-3 h-3" />
                    <span>Cover</span>
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
              <button
                type="button"
                data-editorial-field="title"
                onClick={() => setActiveEditorialField('title')}
                className="text-left hover:opacity-80 transition-opacity cursor-pointer"
              >
                <h2
                  id="inspect-book-title"
                  className="font-display text-lg sm:text-xl font-semibold text-ink leading-snug text-balance"
                >
                  {book.title}
                </h2>
              </button>
              <button
                type="button"
                data-editorial-field="authors"
                onClick={() => setActiveEditorialField('authors')}
                className="block text-left text-xs sm:text-sm font-medium text-ink-secondary mt-0.5 hover:text-ink transition-colors cursor-pointer"
              >
                {book.authors.join(', ')}
              </button>

              {/* Slightly Separated 2x2 Metadata Cards */}
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-editorial-field="format"
                  onClick={() => setActiveEditorialField('format')}
                  className="rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge px-2.5 py-1.5 text-center cursor-pointer"
                >
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                    Format
                  </span>
                  <span className="block text-[11px] font-semibold text-ink truncate">
                    {formatBookBinding(book.format) || 'Set'}
                  </span>
                </button>
                <button
                  type="button"
                  data-editorial-field="readingStage"
                  onClick={() => setActiveEditorialField('readingStage')}
                  className="rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge px-2.5 py-1.5 text-center cursor-pointer"
                >
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                    Stage
                  </span>
                  <span className="block text-[11px] font-semibold text-ink truncate">
                    {formatReadingStage(book.readingStage)}
                  </span>
                </button>
                <button
                  type="button"
                  data-editorial-field="ages"
                  onClick={() => setActiveEditorialField('ages')}
                  className="rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge px-2.5 py-1.5 text-center cursor-pointer"
                >
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                    Ages
                  </span>
                  <span
                    className={`block text-[11px] font-semibold truncate ${
                      typeof book.ageMin === 'number'
                        ? 'text-ink font-mono-tabular'
                        : 'italic text-ink-muted'
                    }`}
                  >
                    {bookAgesCompactLabel}
                  </span>
                </button>
                <button
                  type="button"
                  data-editorial-field="pageCount"
                  onClick={() => setActiveEditorialField('pageCount')}
                  className="rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge px-2.5 py-1.5 text-center cursor-pointer"
                >
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-ink-muted">
                    Pages
                  </span>
                  <span className="block text-[11px] font-semibold text-ink font-mono-tabular truncate">
                    {book.pageCount ? `${book.pageCount} pp` : 'Set'}
                  </span>
                </button>
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

          {/* Column 2: Desktop Title Block + Actions, Customize, Tags, Footer */}
          <div className="min-w-0 space-y-4">
            <div className="hidden md:block">
              <button
                type="button"
                data-editorial-field="title"
                onClick={() => setActiveEditorialField('title')}
                className="text-left hover:opacity-80 transition-opacity cursor-pointer"
              >
                <h2 className="font-display text-2xl font-semibold tracking-tight text-ink leading-snug text-balance">
                  {book.title}
                </h2>
              </button>
              <button
                type="button"
                data-editorial-field="authors"
                onClick={() => setActiveEditorialField('authors')}
                className="block text-left text-sm font-medium text-ink-secondary mt-0.5 hover:text-ink transition-colors cursor-pointer"
              >
                {book.authors.join(', ')}
              </button>

              {/* Desktop Slightly Separated Metadata Cards */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                <button
                  type="button"
                  data-editorial-field="format"
                  onClick={() => setActiveEditorialField('format')}
                  className="rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge px-3 py-2 text-center transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Format
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-ink truncate">
                    {formatBookBinding(book.format) || 'Set'}
                  </span>
                </button>
                <button
                  type="button"
                  data-editorial-field="readingStage"
                  onClick={() => setActiveEditorialField('readingStage')}
                  className="rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge px-3 py-2 text-center transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Stage
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-ink truncate">
                    {formatReadingStage(book.readingStage)}
                  </span>
                </button>
                <button
                  type="button"
                  data-editorial-field="ages"
                  onClick={() => setActiveEditorialField('ages')}
                  className="rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge px-3 py-2 text-center transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Ages
                  </span>
                  <span
                    className={`mt-0.5 block text-xs font-semibold truncate ${
                      typeof book.ageMin === 'number'
                        ? 'text-ink font-mono-tabular'
                        : 'italic text-ink-muted'
                    }`}
                  >
                    {bookAgesEditorialLabel}
                  </span>
                </button>
                <button
                  type="button"
                  data-editorial-field="pageCount"
                  onClick={() => setActiveEditorialField('pageCount')}
                  className="rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge px-3 py-2 text-center transition-colors cursor-pointer"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                    Pages
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-ink font-mono-tabular truncate">
                    {book.pageCount ? `${book.pageCount} pp` : 'Set pages'}
                  </span>
                </button>
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

          {/* Quick Shelf & Read Bar */}
          <div className="lr-card rounded-xl bg-surface-subtle border border-edge px-4 py-3 space-y-2">
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
                        className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-danger/10 border border-edge text-xs font-semibold text-ink-secondary hover:text-danger transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Icon name="close" className="w-3.5 h-3.5" />
                        <span>Clear Read</span>
                      </button>
                    )}
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

                <button
                  type="button"
                  data-action="open-gift-sheet"
                  onClick={() => setIsGiftSheetOpen(true)}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Icon name="gift" className="w-3.5 h-3.5 text-primary" />
                  <span>Gift / Buy</span>
                </button>
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
            className="lr-card rounded-xl bg-surface-subtle border border-edge px-4 py-3 text-xs"
          >
            <div className="divide-y divide-edge-subtle">
              {/* Row 1: Assigned Owners (current only, tap with > chevron to open slide-up BookOwnersSheet) */}
              <button
                type="button"
                data-customize-row="owner"
                data-action="open-owners-sheet"
                onClick={() => setIsOwnersSheetOpen(true)}
                aria-label="Edit book owners"
                className="w-full py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer"
              >
                <span className="text-xs font-semibold text-ink-secondary shrink-0">
                  Owners
                </span>
                <span className="inline-flex items-center justify-end gap-1.5 min-w-0">
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5 text-xs font-semibold text-ink">
                    {displayedOwnerChips.map((chip) => {
                      const tone = AVATAR_TONES[chip.tone] || AVATAR_TONES.teal;
                      return (
                        <span
                          key={chip.key}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-edge/80"
                        >
                          <span
                            className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ${tone}`}
                          >
                            {chip.initial}
                          </span>
                          <span>{chip.label}</span>
                        </span>
                      );
                    })}
                  </span>
                  <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
                </span>
              </button>

              {/* Row 2: Shelf Status (Owned vs Wishlist vs Suggestions) */}
              <div
                data-customize-row="status"
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
              >
                <span className="text-xs font-semibold text-ink-secondary shrink-0">
                  Shelf
                </span>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {(['owned', 'wishlist', 'interested'] as CollectionStatus[]).map((st) => {
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
                        ? 'bg-danger-solid text-danger-solid-fg'
                        : cond === 'torn'
                          ? 'bg-accent text-accent-fg'
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

              {/* Row 4: Assigned Shelf Rotations */}
              <button
                type="button"
                data-customize-row="assigned-rotations"
                data-action="open-book-rotations-sheet"
                onClick={() => setIsRotationsSheetOpen(true)}
                className="w-full py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer"
              >
                <span className="text-xs font-semibold text-ink-secondary shrink-0">
                  Assigned
                </span>
                <span className="inline-flex items-center justify-end gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-ink truncate">
                    {assignedRotations.length > 0
                      ? assignedRotations.map((r) => r.title).join(', ')
                      : 'Not assigned'}
                  </span>
                  <Icon name="chevronRight" className="w-4 h-4 text-ink-muted shrink-0" />
                </span>
              </button>

              {/* Row 5: Rotations Eligibility */}
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
                <ToggleSwitch
                  checked={!isExcluded}
                  onChange={handleToggleEligibility}
                  ariaLabel="Eligible for shelf rotations"
                  onLabel="Included"
                  offLabel="Excluded"
                />
              </div>
            </div>
          </section>

          {descriptionSection}

          {quotesAndNotesSection}

          {genresAndTopicsSection}

          {cardTintSwatchesBar}

          {/* Quiet Footer: Source Attribution + External IDs + Raw Payloads + Remove Book */}
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
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isDiscardedForProfile ? (
                  <button
                    type="button"
                    data-action="restore-discarded-book"
                    onClick={handleRestoreDiscardedBook}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Icon name="check" className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                ) : (
                  (currentStatus === 'interested' || currentStatus === 'wishlist') && (
                    <button
                      type="button"
                      data-action="discard-suggested-book"
                      onClick={handleDiscardBook}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-secondary hover:text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Icon name="eyeOff" className="w-3.5 h-3.5" />
                      <span>Not interested</span>
                    </button>
                  )
                )}

                {!confirmDelete ? (
                  <button
                    type="button"
                    data-action="delete-book"
                    onClick={() => setConfirmDelete(true)}
                    aria-label={`Remove ${book.title} from catalog`}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Icon name="trash" className="w-3.5 h-3.5" />
                    <span>Remove Book</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger/10 border border-danger/35 px-3 py-2">
                    <span className="text-xs font-semibold text-danger">
                      Remove from library?
                    </span>
                    <button
                      type="button"
                      data-action="confirm-delete-book"
                      onClick={handleConfirmDelete}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-danger-solid hover:bg-danger-solid-hover text-danger-solid-fg text-xs font-semibold transition-colors"
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
            </div>

            {formattedAddedDate && (
              <p className="text-[11px] text-ink-muted text-center w-full mt-2">
                Added {formattedAddedDate}
              </p>
            )}

            {hasRawPayloads && (
              <details className="pt-0.5">
                <summary className="cursor-pointer font-semibold text-primary dark:text-accent">
                  View Captured Raw Provider Payloads
                </summary>
                <pre className="mt-2 p-3 rounded-lg bg-code text-code-ink border border-code-edge font-mono-tabular text-[11px] overflow-x-auto max-h-52">
                  {JSON.stringify(book.sources, null, 2)}
                </pre>
              </details>
            )}
          </div>
          </div>
          </div>
          </div>
        </div>
      </div>

      {sharedOverlaySheets}
    </div>
  );
};
