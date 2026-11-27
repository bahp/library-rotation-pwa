import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import {
  BookCoverCard,
  BookCoverGrid,
  BookCoverSlide,
  getBookCardWidthTokens,
} from '../common/BookCoverCard.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { Icon } from '../common/Icon.js';
import { RotationShelfCard } from '../cards/RotationShelfCard.js';
import { RotationEditorModal } from '../modals/RotationEditorModal.js';
import { FoundBookSheet } from '../modals/FoundBookSheet.js';
import type { FoundBookIntakeOptions } from '../modals/FoundBookSheet.js';
import {
  getBedtimeWindDownShelf,
  getDustyGemsShelf,
  getFavoriteGenreRecommendationShelf,
  getLanguageShelf,
  getLovedBookSimilarityShelves,
  getMoreByAuthorShelf,
  getProfileRecommendations,
  getReadyForRereadShelf,
  getRotationLibrarySuggestions,
  getSeasonalPresetShelf,
  getWishlistSpotlightShelf,
  planHomeDiscoveryShelves,
} from '../../features/tagging/recommendations.js';
import {
  isBookDiscardedForProfile,
  matchCandidateInLibrary,
} from '../../features/tagging/discovery-engine.js';
import { getAllRotationPresets } from '../../features/rotations/rotation-presets.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import { resolveBookCardDisplayConfig } from '../../config/index.js';
import { formatCollectionStatus, normalizeCollectionStatus } from '../../types/models.js';
import type { Book, BookCardSize, RotationShelf } from '../../types/models.js';
import type { BookCandidate } from '../../features/catalog/normalizer.js';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

function formatFinishedDateLabel(iso?: string): string {
  if (!iso) return 'Last read';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Last read';
  const d = new Date(time);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Last read · Today';
  if (diffDays === 1) return 'Last read · Yesterday';
  return `Last read · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

type ExternalDiscoveryItem = {
  candidate: BookCandidate;
  score: number;
  semanticScore: number;
  matchReasons: string[];
  savedBook?: Book | null;
};

type ExternalFeedState = {
  loading: boolean;
  loadingMore: boolean;
  loaded: boolean;
  page: number;
  hasMore: boolean;
  usedFlash?: boolean;
  engineUsed?: string;
  items: ExternalDiscoveryItem[];
};

type DiscoveryShelfDescriptor =
  | {
      key: string;
      kind: 'owned-rec';
      title: string;
      subtitle?: string;
      size: BookCardSize;
      items: Array<{ book: Book; matchReasons: string[] }>;
      targetRotation?: RotationShelf | null;
      anchorBook?: Book;
      actionType?: 'manage-rotation' | 'ai-picks';
      showQuickAdd?: boolean;
      badgeText?: string;
      ranked?: boolean;
      contextReason?: string;
    }
  | {
      key: string;
      kind: 'external-discovery';
      title: string;
      subtitle?: string;
      badgeText?: string;
      intent: string;
      topic?: string;
      anchorBookId?: string;
      language?: string;
      size: BookCardSize;
      contextReason?: string;
      isPinned?: boolean;
    };

export const HomeView: React.FC = () => {
  const {
    state,
    store,
    catalogService,
    activeProfile,
    activeRotation,
    rotationEditor,
    setRotationEditor,
    navigate,
    setInspectedBookId,
    setAiRecsModal,
    setIsSearchOpen,
    openManualAddModal,
    t,
  } = useApp();

  const isDesktop = useIsDesktop();
  const [sheetRotationId, setSheetRotationId] = useState<string | null>(null);
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);
  const [foundCandidate, setFoundCandidate] = useState<BookCandidate | null>(null);
  const [visibleShelfCount, setVisibleShelfCount] = useState(5);
  const [externalFeeds, setExternalFeeds] = useState<Record<string, ExternalFeedState>>({});
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const bookMap = useMemo(() => {
    return new Map(state.books.map((b: Book) => [b.id, b]));
  }, [state.books]);

  const activeRotations = useMemo(() => {
    if (!activeProfile) return [];
    const list = state.rotations
      .filter((r) => r.profileId === activeProfile.id && r.status === 'active')
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.activatedAt || a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.activatedAt || b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    if (list.length === 0 && activeRotation) return [activeRotation];
    return list;
  }, [state.rotations, activeProfile, activeRotation]);

  const primaryActiveRotation: RotationShelf | null = activeRotations[0] || null;

  const sheetRotation: RotationShelf | null = useMemo(() => {
    if (!sheetRotationId) return null;
    return state.rotations.find((r) => r.id === sheetRotationId) || null;
  }, [state.rotations, sheetRotationId]);

  useEffect(() => {
    if (sheetRotationId && !sheetRotation) {
      setSheetRotationId(null);
      setEditingShelfId(null);
    }
  }, [sheetRotationId, sheetRotation]);

  useEffect(() => {
    if (!sheetRotationId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingShelfId && !rotationEditor.modalMode) {
        setSheetRotationId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetRotationId, editingShelfId, rotationEditor.modalMode]);

  // 1. Add to active rotation
  const rotationSuggestions = useMemo(() => {
    if (!activeProfile || !primaryActiveRotation) return [];
    return getRotationLibrarySuggestions({
      books: state.books,
      profile: activeProfile,
      rotation: primaryActiveRotation,
      rotations: state.rotations,
      weights: state.settings?.matchingWeights,
      limit: 12,
    });
  }, [state.books, activeProfile, primaryActiveRotation, state.rotations, state.settings?.matchingWeights]);

  // 2. Overall Suggested for [Profile]
  const recommendations = useMemo(() => {
    if (!activeProfile) return [];
    return getProfileRecommendations({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      weights: state.settings?.matchingWeights,
      limit: 20,
    });
  }, [state.books, activeProfile, state.rotations, state.settings?.matchingWeights]);

  // 3. Wind-down & Bedtime mood shelf (boosted up after 18:30)
  const bedtimeShelf = useMemo(() => {
    if (!activeProfile) return [];
    return getBedtimeWindDownShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 18,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 4. Ready for a re-read (loved / high-rated not read in 30+ days)
  const rereadShelf = useMemo(() => {
    if (!activeProfile) return [];
    return getReadyForRereadShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 18,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 5. Because you loved [Book]
  const lovedShelves = useMemo(() => {
    if (!activeProfile) return [];
    return getLovedBookSimilarityShelves({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      weights: state.settings?.matchingWeights,
      maxAnchors: 2,
      itemsPerAnchor: 16,
      minItems: 1,
    });
  }, [state.books, activeProfile, state.rotations, state.settings?.matchingWeights]);

  // 6. Because you like [Genre/Topic]
  const genreShelf = useMemo(() => {
    if (!activeProfile) return null;
    return getFavoriteGenreRecommendationShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 18,
      minItems: 2,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 7. Seasonal / Holiday Preset Picks
  const seasonalShelf = useMemo(() => {
    if (!activeProfile) return null;
    const presets = getAllRotationPresets(state);
    return getSeasonalPresetShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      presets,
      limit: 18,
      minItems: 2,
    });
  }, [state, activeProfile]);

  // 8. Dusty Gems on Your Shelf (unrotated 3+ months)
  const dustyGemsShelf = useMemo(() => {
    if (!activeProfile) return [];
    return getDustyGemsShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 18,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 9. More by [Author]
  const authorShelf = useMemo(() => {
    if (!activeProfile) return null;
    return getMoreByAuthorShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 18,
      minItems: 2,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 10. Multilingual shelf ("In [Language] Today")
  const languageShelf = useMemo(() => {
    if (!activeProfile) return null;
    return getLanguageShelf({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      limit: 18,
      minItems: 2,
    });
  }, [state.books, activeProfile, state.rotations]);

  // 11. From Your Wishlist
  const wishlistSpotlight = useMemo(() => {
    return getWishlistSpotlightShelf({
      books: state.books,
      profileId: activeProfile?.id,
      limit: 14,
    });
  }, [state.books, activeProfile?.id]);

  const discoverySettingsKey = JSON.stringify({
    profileId: activeProfile?.id || '',
    pool: state.settings?.discoverySettings?.candidatePoolSize ?? 60,
    engine: state.settings?.discoverySettings?.embeddingEngine || 'gemini-with-fallback',
    flash: state.settings?.discoverySettings?.useFlashQueryExpansion !== false,
    recency: state.settings?.discoverySettings?.recencyPreference || 'modern',
  });

  useEffect(() => {
    setExternalFeeds({});
  }, [discoverySettingsKey]);

  const discoveryShelves = useMemo<DiscoveryShelfDescriptor[]>(() => {
    return planHomeDiscoveryShelves({
      books: state.books,
      profile: activeProfile,
      rotations: state.rotations,
      presets: getAllRotationPresets(state),
      primaryActiveRotation,
      rotationSuggestions,
      recommendations,
      lovedShelves,
      genreShelf,
      bedtimeShelf,
      dustyGemsShelf,
      rereadShelf,
      authorShelf,
      languageShelf,
      seasonalShelf,
      wishlistSpotlight,
      discoverySettings: state.settings?.discoverySettings,
    }) as DiscoveryShelfDescriptor[];
  }, [
    state,
    activeProfile,
    primaryActiveRotation,
    rotationSuggestions,
    recommendations,
    lovedShelves,
    genreShelf,
    bedtimeShelf,
    dustyGemsShelf,
    rereadShelf,
    authorShelf,
    languageShelf,
    seasonalShelf,
    wishlistSpotlight,
  ]);

  // Progressive scroll-based shelf reveal via IntersectionObserver
  useEffect(() => {
    if (visibleShelfCount >= discoveryShelves.length) return;
    const node = loadMoreSentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleShelfCount((prev) => Math.min(discoveryShelves.length, prev + 3));
        }
      },
      { rootMargin: '280px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleShelfCount, discoveryShelves.length]);

  const visibleShelves = useMemo(
    () => discoveryShelves.slice(0, visibleShelfCount),
    [discoveryShelves, visibleShelfCount]
  );

  // Lazy-load Two-Stage External Discovery shelves as they enter the viewport window
  useEffect(() => {
    const windowSlice = discoveryShelves.slice(
      0,
      Math.min(discoveryShelves.length, visibleShelfCount + 1)
    );
    for (const shelf of windowSlice) {
      if (shelf.kind !== 'external-discovery') continue;
      const current = externalFeeds[shelf.key];
      if (current?.loading || current?.loaded) continue;

      setExternalFeeds((prev) => {
        if (prev[shelf.key]?.loading || prev[shelf.key]?.loaded) return prev;
        return {
          ...prev,
          [shelf.key]: {
            loading: true,
            loadingMore: false,
            loaded: false,
            page: 1,
            hasMore: true,
            items: prev[shelf.key]?.items || [],
          },
        };
      });

      void store
        .runHomeDiscoveryShelfQuery({
          catalogService,
          shelfKey: shelf.key,
          title: shelf.title,
          intent: shelf.intent,
          topic: shelf.topic || '',
          anchorBookId: shelf.anchorBookId || '',
          language: shelf.language || '',
          page: 1,
          limit: 12,
        })
        .then((res) => {
          setExternalFeeds((prev) => ({
            ...prev,
            [shelf.key]: {
              loading: false,
              loadingMore: false,
              loaded: true,
              page: 1,
              hasMore: res.hasMore,
              usedFlash: res.usedFlash,
              engineUsed: res.engineUsed,
              items: res.items,
            },
          }));
        })
        .catch(() => {
          setExternalFeeds((prev) => ({
            ...prev,
            [shelf.key]: {
              loading: false,
              loadingMore: false,
              loaded: true,
              page: 1,
              hasMore: false,
              items: prev[shelf.key]?.items || [],
            },
          }));
        });
    }
  }, [discoveryShelves, visibleShelfCount, catalogService, store, externalFeeds]);

  const handleQueryMoreForShelf = async (shelf: DiscoveryShelfDescriptor) => {
    const current = externalFeeds[shelf.key];
    if (current?.loading || current?.loadingMore) return;
    const nextPage = current?.loaded ? current.page + 1 : 1;

    setExternalFeeds((prev) => ({
      ...prev,
      [shelf.key]: {
        loading: !prev[shelf.key]?.loaded,
        loadingMore: Boolean(prev[shelf.key]?.loaded),
        loaded: Boolean(prev[shelf.key]?.loaded),
        page: prev[shelf.key]?.page || 1,
        hasMore: prev[shelf.key]?.hasMore ?? true,
        items: prev[shelf.key]?.items || [],
      },
    }));

    const querySpec =
      shelf.kind === 'external-discovery'
        ? {
            intent: shelf.intent,
            topic: shelf.topic || '',
            anchorBookId: shelf.anchorBookId || '',
            language: shelf.language || '',
          }
        : shelf.anchorBook
          ? {
              intent: 'similar',
              topic: shelf.anchorBook.tags?.[0] || '',
              anchorBookId: shelf.anchorBook.id,
              language: '',
            }
          : shelf.key === 'mood-bedtime'
            ? { intent: 'bedtime', topic: 'bedtime', anchorBookId: '', language: '' }
            : {
                intent: 'profile',
                topic:
                  shelf.items[0]?.book?.tags?.[0] ||
                  activeProfile?.favoriteTopics?.[0] ||
                  '',
                anchorBookId: '',
                language: '',
              };

    try {
      const res = await store.runHomeDiscoveryShelfQuery({
        catalogService,
        shelfKey: shelf.key,
        title: shelf.title,
        ...querySpec,
        page: nextPage,
        limit: 10,
      });

      let addedCount = 0;
      setExternalFeeds((prev) => {
        const existingItems = prev[shelf.key]?.items || [];
        const seenKeys = new Set(
          existingItems.flatMap((it) =>
            [it.candidate.candidateKey, it.candidate.isbn13 ? `isbn:${it.candidate.isbn13}` : ''].filter(
              Boolean
            )
          )
        );
        const fresh = res.items.filter((it) => {
          const k1 = it.candidate.candidateKey;
          const k2 = it.candidate.isbn13 ? `isbn:${it.candidate.isbn13}` : '';
          if (seenKeys.has(k1) || (k2 && seenKeys.has(k2))) return false;
          seenKeys.add(k1);
          if (k2) seenKeys.add(k2);
          return true;
        });
        addedCount = fresh.length;
        return {
          ...prev,
          [shelf.key]: {
            loading: false,
            loadingMore: false,
            loaded: true,
            page: nextPage,
            hasMore: res.hasMore && fresh.length > 0,
            usedFlash: res.usedFlash,
            engineUsed: res.engineUsed,
            items: [...existingItems, ...fresh],
          },
        };
      });

      if (res.allFetchedCount > 0) {
        store.notify(
          addedCount > 0
            ? `Found ${addedCount} more ${addedCount === 1 ? 'book' : 'books'} (queried ${res.allFetchedCount} candidates).`
            : `All ${res.allFetchedCount} candidates saved to Suggestions.`,
          'info'
        );
      } else {
        store.notify('No additional matching books found for this shelf.', 'info');
      }
    } catch (err) {
      setExternalFeeds((prev) => ({
        ...prev,
        [shelf.key]: {
          ...(prev[shelf.key] || { items: [], page: 1 }),
          loading: false,
          loadingMore: false,
          loaded: true,
          hasMore: false,
        },
      }));
      store.notify(err instanceof Error ? err.message : 'Unable to query more books right now.', 'error');
    }
  };

  // Deduplicate external discovery rows across shelves & filter out discarded/owned books live
  const dedupedExternalDiscoveryItems = useMemo(() => {
    const result: Record<string, ExternalDiscoveryItem[]> = {};
    const seenKeys = new Set<string>();
    const normalizeTA = (title: string, author?: string) => {
      const tNorm = String(title || '')
        .toLowerCase()
        .split(/[:—–(]/)[0]
        .replace(/[^a-z0-9]+/g, '');
      const aNorm = String(author || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
      return tNorm ? `${tNorm}|${aNorm}` : '';
    };

    for (const shelf of discoveryShelves) {
      const items = externalFeeds[shelf.key]?.items || [];
      if (items.length === 0) {
        result[shelf.key] = [];
        continue;
      }
      const unique: ExternalDiscoveryItem[] = [];
      for (const entry of items) {
        const cand = entry.candidate;
        const matchInfo = matchCandidateInLibrary(cand, state.books, activeProfile?.id);
        if (matchInfo.isDiscarded || matchInfo.alreadyInLibrary) continue;
        if (isBookDiscardedForProfile(matchInfo.matchedBook, activeProfile?.id)) continue;

        const taKey = normalizeTA(cand.title, cand.authors?.[0]);
        const keys = [
          cand.candidateKey,
          cand.isbn13 ? `isbn:${cand.isbn13}` : '',
          taKey ? `ta:${taKey}` : '',
        ].filter(Boolean);
        if (keys.some((k) => seenKeys.has(k))) continue;
        keys.forEach((k) => seenKeys.add(k));
        unique.push({
          ...entry,
          savedBook: matchInfo.matchedBook || entry.savedBook || null,
        });
      }
      result[shelf.key] = unique;
    }
    return result;
  }, [discoveryShelves, externalFeeds, state.books, activeProfile?.id]);

  const wishlistCount = useMemo(() => {
    return state.books.filter(
      (b) =>
        normalizeCollectionStatus(b.collectionStatus) === 'wishlist' &&
        !isBookDiscardedForProfile(b, activeProfile?.id)
    ).length;
  }, [state.books, activeProfile?.id]);

  const currentReadingBook: Book | null = useMemo(() => {
    const readingIds = activeProfile?.currentlyReadingBookIds;
    if (!Array.isArray(readingIds) || readingIds.length === 0) return null;
    for (let i = readingIds.length - 1; i >= 0; i -= 1) {
      const candidate = bookMap.get(readingIds[i]);
      if (candidate) return candidate;
    }
    return null;
  }, [activeProfile?.currentlyReadingBookIds, bookMap]);

  const lastReadBook: Book | null = useMemo(() => {
    if (currentReadingBook) return null;
    const historyIds = activeProfile?.readHistoryBookIds;
    if (!Array.isArray(historyIds) || historyIds.length === 0) return null;
    let bestBook: Book | null = null;
    let bestTime = -1;
    for (let i = historyIds.length - 1; i >= 0; i -= 1) {
      const candidate = bookMap.get(historyIds[i]);
      if (!candidate) continue;
      const ms = candidate.lastReadAt ? Date.parse(candidate.lastReadAt) : NaN;
      const validMs = Number.isFinite(ms) ? ms : 0;
      if (!bestBook || validMs > bestTime) {
        bestBook = candidate;
        bestTime = validMs;
      }
    }
    return bestBook;
  }, [currentReadingBook, activeProfile?.readHistoryBookIds, bookMap]);

  const bottomBarBook = currentReadingBook || lastReadBook;
  const isBottomBarFinished = !currentReadingBook && Boolean(lastReadBook);

  const handleTogglePicked = async (
    rotationId: string,
    bookId: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    await store.toggleRotationBookPicked(rotationId, bookId);
  };

  const handleToggleBottomBarRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomBarBook) return;
    if (isBottomBarFinished) {
      await store.setProfileBookReadingStatus(activeProfile?.id, bottomBarBook.id, 'reading');
      store.notify(`Marked "${bottomBarBook.title}" as currently reading`, 'info');
    } else {
      await store.setProfileBookReadingStatus(activeProfile?.id, bottomBarBook.id, 'read');
      store.notify(`Marked "${bottomBarBook.title}" as read!`, 'success');
    }
  };

  const handleToggleCurrentBookLoved = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!bottomBarBook) return;
    await store.toggleBookLoved(bottomBarBook.id);
  };

  const handleAddFoundCandidate = async (
    candidate: BookCandidate,
    status: 'owned' | 'wishlist' | 'interested',
    opts?: FoundBookIntakeOptions
  ) => {
    try {
      await store.addBookFromCandidate(candidate, {
        collectionStatus: status,
        condition: opts?.condition || 'good',
        owners: opts?.owners || (activeProfile ? [activeProfile.id, 'shared'] : ['shared']),
        loved: opts?.loved || false,
        dominantColor: opts?.dominantColor,
        dominantColorSwatches: opts?.dominantColorSwatches,
        dominantColorMode: opts?.dominantColorMode,
      });
      setFoundCandidate(null);
      store.notify(
        `Added "${candidate.title}" to ${
          status === 'owned'
            ? 'Library'
            : status === 'wishlist'
              ? 'Wishlist'
              : 'Suggestions'
        }`,
        'success'
      );
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const bottomNavStyle = state.settings?.bottomNavStyle === 'full' ? 'full' : 'floating';
  const useRotationCard = (state.settings?.homeActiveRotationStyle || 'card') === 'card';
  const shelfCardConfig = resolveBookCardDisplayConfig(state.settings, 'homeShelf');
  const suggestedCardConfig = resolveBookCardDisplayConfig(state.settings, 'homeSuggested');
  const coverAspectRatio = shelfCardConfig.aspectRatio;

  const renderShelfBookCard = (
    book: Book,
    rotation: RotationShelf,
    isCarouselItem: boolean
  ) => {
    const isRead = (rotation.completedBookIds || []).includes(book.id);
    const isPicked = (rotation.pickedBookIds || []).includes(book.id);
    const isReadPreviously = Boolean(
      activeProfile?.readHistoryBookIds?.includes(book.id)
    );
    const isOverlay = shelfCardConfig.infoPlacement === 'overlay';

    const badgeAriaLabel = isPicked
      ? `Unmark ${book.title} as picked in this rotation`
      : isReadPreviously
        ? `Read previously · Mark ${book.title} as picked in this rotation`
        : `Mark ${book.title} as picked and read`;

    const pickedButton = (
      <button
        type="button"
        onClick={(e) => handleTogglePicked(rotation.id, book.id, e)}
        aria-pressed={isPicked}
        aria-label={badgeAriaLabel}
        className={
          isOverlay
            ? 'min-h-[36px] min-w-[36px] flex items-end justify-start cursor-pointer'
            : 'absolute -bottom-1 -left-1 z-20 min-h-[44px] min-w-[44px] flex items-end justify-start p-2.5 cursor-pointer'
        }
      >
        {isRead ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border bg-primary text-primary-fg border-surface">
            <Icon name="check" className="w-2.5 h-2.5" />
            <span>Read</span>
          </span>
        ) : isPicked ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border bg-primary text-primary-fg border-surface">
            <Icon name="bookmarkFilled" className="w-2.5 h-2.5" />
            <span>Picked</span>
          </span>
        ) : isReadPreviously ? (
          <span
            title="Read previously (not picked in this rotation)"
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border bg-surface/95 text-primary border-edge"
          >
            <Icon name="check" className="w-2.5 h-2.5" />
            <span>Read</span>
          </span>
        ) : (
          <span className="w-6 h-6 rounded-full flex items-center justify-center shadow-xs border transition-colors bg-surface/95 border-edge text-ink-muted hover:text-ink">
            <Icon name="check" className="w-3 h-3" />
          </span>
        )}
      </button>
    );

    return (
      <BookCoverCard
        key={`${rotation.id}-${book.id}`}
        book={book}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout={isCarouselItem ? 'carousel' : 'grid'}
        size={shelfCardConfig.size}
        customWidth={shelfCardConfig.customWidth}
        aspectRatio={shelfCardConfig.aspectRatio}
        infoPlacement={shelfCardConfig.infoPlacement}
        cardFrame={shelfCardConfig.cardFrame}
        showCoverOverlays={shelfCardConfig.showCoverOverlays}
        showUsageAdorno={false}
        fields={shelfCardConfig.fields}
        isRead={isRead}
        isPicked={isPicked}
        highlightState={isRead ? 'read' : isPicked ? 'picked' : 'none'}
        onInspect={(b) => setInspectedBookId(b.id)}
        bottomLeftCoverAction={pickedButton}
      />
    );
  };

  const renderRecCoverCard = (
    book: Book,
    matchReasons: string[],
    keyPrefix: string,
    cardSize: BookCardSize,
    targetRotation: RotationShelf | null = null,
    rankNumber?: number,
    showQuickAdd = false
  ) => {
    const isOverlay = suggestedCardConfig.infoPlacement === 'overlay';
    const addAction =
      showQuickAdd && targetRotation ? (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await store.addBooksToRotationManual(targetRotation.id, [book.id]);
            store.notify(`Added "${book.title}" to "${targetRotation.title}"!`, 'success');
          }}
          aria-label={`Add ${book.title} to ${targetRotation.title}`}
          title={`Add to ${targetRotation.title}`}
          className={
            isOverlay
              ? 'min-h-[36px] min-w-[36px] flex items-end justify-end cursor-pointer'
              : 'absolute -bottom-1 -right-1 z-20 min-h-[40px] min-w-[40px] flex items-end justify-end p-2 cursor-pointer'
          }
        >
          <span className="w-7 h-7 rounded-full bg-surface/95 hover:bg-primary hover:text-primary-fg border border-edge text-ink shadow-xs flex items-center justify-center transition-colors">
            <Icon name="plus" className="w-3.5 h-3.5" />
          </span>
        </button>
      ) : undefined;

    const discardButton = (
      <button
        type="button"
        data-action="discard-suggestion"
        onClick={(e) => {
          e.stopPropagation();
          void store.discardSuggestedBook(book, activeProfile?.id);
        }}
        aria-label={`Hide ${book.title} from suggestions`}
        title="Not interested"
        className="absolute top-0.5 right-0.5 z-30 min-h-[36px] min-w-[36px] flex items-start justify-end p-1.5 cursor-pointer"
      >
        <span className="w-7 h-7 rounded-full bg-surface/90 hover:bg-danger-solid hover:text-danger-solid-fg border border-edge text-ink-secondary shadow-xs flex items-center justify-center transition-colors">
          <Icon name="eyeOff" className="w-3.5 h-3.5" />
        </span>
      </button>
    );

    return (
      <BookCoverCard
        key={`${keyPrefix}-${book.id}`}
        dataBookCard={`${keyPrefix}-${book.id}`}
        book={book}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout="carousel"
        size={cardSize}
        aspectRatio={suggestedCardConfig.aspectRatio}
        infoPlacement={suggestedCardConfig.infoPlacement}
        cardFrame={suggestedCardConfig.cardFrame}
        showCoverOverlays={suggestedCardConfig.showCoverOverlays}
        showUsageAdorno={false}
        fields={suggestedCardConfig.fields}
        rankNumber={rankNumber}
        customMetaLine={matchReasons[0] || 'Fresh pick'}
        onInspect={(b) => setInspectedBookId(b.id)}
        topRightCoverAction={discardButton}
        bottomRightCoverAction={addAction}
      />
    );
  };

  const renderExternalDiscoveryCard = (
    entry: ExternalDiscoveryItem,
    keyPrefix: string,
    cardSize: BookCardSize,
    rankNumber?: number
  ) => {
    const { candidate, matchReasons, savedBook } = entry;
    const matchedBook =
      savedBook ||
      matchCandidateInLibrary(candidate, state.books, activeProfile?.id)?.matchedBook ||
      null;
    const matchedStatus = matchedBook
      ? normalizeCollectionStatus(matchedBook.collectionStatus)
      : null;

    const previewBook: Book = matchedBook || {
      ...candidate,
      id: `${keyPrefix}-${candidate.candidateKey}`,
      addedAt: '',
      collectionStatus: 'interested',
      condition: 'good',
      loved: false,
      owners: ['shared'],
      sources: candidate.sources || [],
      tags: candidate.tags || [],
    };

    const metaHint = matchedBook && matchedStatus && matchedStatus !== 'interested'
      ? matchedStatus === 'wishlist'
        ? 'On Wishlist'
        : `${formatCollectionStatus(matchedBook.collectionStatus)}`
      : matchReasons?.[0] ||
        (candidate.publishedYear ? `${candidate.publishedYear} · Discovery` : 'Discovery pick');

    const discardButton = (
      <button
        type="button"
        data-action="discard-suggestion"
        onClick={(e) => {
          e.stopPropagation();
          void store.discardSuggestedBook(matchedBook || candidate, activeProfile?.id);
        }}
        aria-label={`Hide ${candidate.title} from suggestions`}
        title="Not interested"
        className="absolute top-0.5 right-0.5 z-30 min-h-[36px] min-w-[36px] flex items-start justify-end p-1.5 cursor-pointer"
      >
        <span className="w-7 h-7 rounded-full bg-surface/90 hover:bg-danger-solid hover:text-danger-solid-fg border border-edge text-ink-secondary shadow-xs flex items-center justify-center transition-colors">
          <Icon name="eyeOff" className="w-3.5 h-3.5" />
        </span>
      </button>
    );

    return (
      <BookCoverCard
        key={`${keyPrefix}-${candidate.candidateKey}`}
        dataBookCard={`${keyPrefix}-${candidate.candidateKey}`}
        book={previewBook}
        activeProfile={activeProfile}
        profiles={state.profiles}
        layout="carousel"
        size={cardSize}
        aspectRatio={suggestedCardConfig.aspectRatio}
        infoPlacement={suggestedCardConfig.infoPlacement}
        cardFrame={suggestedCardConfig.cardFrame}
        showCoverOverlays={Boolean(matchedBook && matchedStatus !== 'interested')}
        showUsageAdorno={false}
        fields={suggestedCardConfig.fields}
        rankNumber={rankNumber}
        customMetaLine={metaHint}
        onInspect={() => {
          if (matchedBook && matchedStatus !== 'interested') {
            setInspectedBookId(matchedBook.id);
          } else {
            setFoundCandidate(candidate);
          }
        }}
        topRightCoverAction={discardButton}
      />
    );
  };

  const renderQueryMoreBooksTile = (
    shelf: DiscoveryShelfDescriptor,
    isLoadingMore: boolean,
    hasLoadedBefore: boolean
  ) => {
    const widthTokens = getBookCardWidthTokens(
      shelf.size,
      suggestedCardConfig.customWidth,
      suggestedCardConfig.infoPlacement
    );
    const coverAspectClass =
      suggestedCardConfig.aspectRatio === 'portrait' ? 'aspect-[3/4]' : 'aspect-square';

    return (
      <div
        key={`${shelf.key}-query-more`}
        data-book-card={`${shelf.key}-query-more`}
        style={
          {
            '--lr-card-min-sm': `${widthTokens.sm}px`,
            '--lr-card-min-lg': `${widthTokens.lg}px`,
          } as React.CSSProperties
        }
        className="lr-carousel-item flex flex-col self-stretch"
      >
        <button
          type="button"
          data-action="query-more-books"
          data-shelf-key={shelf.key}
          disabled={isLoadingMore}
          onClick={() => void handleQueryMoreForShelf(shelf)}
          aria-label={`Query more books for ${shelf.title}`}
          className={`w-full ${coverAspectClass} rounded-[var(--radius-cover)] border border-dashed border-edge hover:border-primary/65 bg-surface-subtle/75 hover:bg-surface-elevated p-3 flex flex-col items-center justify-center text-center gap-2 transition-colors disabled:opacity-60 cursor-pointer`}
        >
          <span className="w-9 h-9 rounded-full bg-surface border border-edge text-primary flex items-center justify-center shadow-2xs">
            <Icon
              name={isLoadingMore ? 'refresh' : 'sparkles'}
              className={`w-4 h-4 ${isLoadingMore ? 'animate-spin' : ''}`}
            />
          </span>
          <span className="text-xs font-semibold text-ink leading-tight">
            {isLoadingMore
              ? 'Querying...'
              : hasLoadedBefore
                ? 'Query more books'
                : shelf.kind === 'external-discovery'
                  ? 'Query more books'
                  : 'Discover more online'}
          </span>
          <span className="text-[10px] text-ink-muted leading-tight line-clamp-2">
            {isLoadingMore ? 'Ranking fresh matches' : 'Save & rank new picks'}
          </span>
        </button>
      </div>
    );
  };

  return (
    <div className={`space-y-4 sm:space-y-6 text-left ${bottomBarBook ? 'pb-28' : 'pb-6'}`}>
      {/* Section 0: Active Rotations (Distinct card container or seamless inline; click card/header -> Rotations view) */}
      {activeRotations.length > 0 ? (
        <section aria-labelledby="active-rotations-section-heading" className="space-y-4 sm:space-y-5">
          {activeRotations.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span
                id="active-rotations-section-heading"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
              >
                Active Rotations ({activeRotations.length})
              </span>
              <button
                type="button"
                onClick={() => navigate('rotations')}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>{t('home.allShelves')}</span>
                <Icon name="chevronRight" className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-4 sm:space-y-6">
            {activeRotations.map((rot, idx) => {
              const rotBooks = rot.bookIds
                .map((id: string) => bookMap.get(id))
                .filter((b): b is Book => Boolean(b));
              const completedCount = rot.completedBookIds.filter((id) =>
                rot.bookIds.includes(id)
              ).length;
              const progressPct =
                rotBooks.length > 0 ? Math.round((completedCount / rotBooks.length) * 100) : 0;
              const sched = activeProfile ? computeRotationSchedule(rot, activeProfile) : null;

              const handleCardBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
                if (!useRotationCard) return;
                const target = e.target as HTMLElement | null;
                if (target?.closest('button, a, input, select, textarea, [data-no-card-nav="true"]')) {
                  return;
                }
                setSheetRotationId(rot.id);
              };

              return (
                <div
                  key={rot.id}
                  data-home-active-rotation={rot.id}
                  data-home-rotation-style={useRotationCard ? 'card' : 'seamless'}
                  onClick={handleCardBackgroundClick}
                  className={
                    useRotationCard
                      ? 'rounded-2xl bg-surface border border-edge lr-card p-3.5 sm:p-5 space-y-3 sm:space-y-4 transition-colors hover:border-primary/45 cursor-pointer'
                      : 'space-y-2.5 sm:space-y-3'
                  }
                >
                  <button
                    type="button"
                    data-action="open-home-rotation-sheet"
                    onClick={() => setSheetRotationId(rot.id)}
                    aria-label={`Open ${rot.title} details (${completedCount} of ${rotBooks.length} read, ${progressPct}%)`}
                    className={
                      useRotationCard
                        ? 'group w-full text-left flex items-center justify-between gap-3 pb-2.5 sm:pb-3 border-b border-edge-subtle cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-primary transition-colors'
                        : 'group w-full text-left flex items-center justify-between gap-3 pb-1.5 sm:pb-3 sm:border-b sm:border-edge-subtle cursor-pointer rounded-xl px-2 -mx-2 py-1.5 hover:bg-surface-subtle/60 transition-colors'
                    }
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      {useRotationCard ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="w-2 h-2 rounded-full bg-success ring-4 ring-success/15 lr-active-dot-pulse shrink-0"
                            />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                              Active Rotation
                            </span>
                          </div>
                          {idx === 0 && activeRotations.length === 1 ? (
                            <h1
                              id="active-rotations-section-heading"
                              className="font-display text-2xl sm:text-3xl font-semibold text-ink leading-[1.1] tracking-tight min-w-0 group-hover:text-primary transition-colors"
                            >
                              {rot.title}
                            </h1>
                          ) : (
                            <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink leading-[1.12] tracking-tight min-w-0 group-hover:text-primary transition-colors">
                              {rot.title}
                            </h2>
                          )}
                        </>
                      ) : (
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span
                            aria-hidden="true"
                            title="Active shelf"
                            className="w-2.5 h-2.5 rounded-full bg-success ring-4 ring-success/15 lr-active-dot-pulse shrink-0 mt-2 sm:mt-2.5"
                          />
                          {idx === 0 && activeRotations.length === 1 ? (
                            <h1
                              id="active-rotations-section-heading"
                              className="font-display text-2xl sm:text-3xl font-semibold text-ink leading-[1.1] tracking-tight min-w-0 group-hover:text-primary transition-colors"
                            >
                              {rot.title}
                            </h1>
                          ) : (
                            <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink leading-[1.12] tracking-tight min-w-0 group-hover:text-primary transition-colors">
                              {rot.title}
                            </h2>
                          )}
                        </div>
                      )}

                      {sched && (
                        <p
                          data-rotation-schedule="active"
                          className={`${useRotationCard ? '' : 'pl-5 '}flex items-center gap-1.5 text-xs leading-tight ${
                            sched.isDue
                              ? 'font-semibold text-accent'
                              : sched.isDueSoon
                                ? 'font-semibold text-primary'
                                : 'text-ink-secondary font-medium'
                          }`}
                        >
                          <Icon name="calendar" className="w-3.5 h-3.5 shrink-0 opacity-80" />
                          <span className="truncate">{sched.activeScheduleLine}</span>
                        </p>
                      )}
                    </div>

                    {/* Top-Right Progress Readout + Integrated Chevron */}
                    <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                      <div
                        data-home-progress-readout="true"
                        className="text-right space-y-1 min-w-[74px]"
                        title={`Reading progress: ${completedCount} of ${rotBooks.length} ${rotBooks.length === 1 ? 'book' : 'books'} (${progressPct}%)`}
                      >
                        <p className="font-display text-xl sm:text-2xl font-bold text-ink leading-none font-mono-tabular">
                          {progressPct}%
                        </p>
                        <p className="font-serif-italic italic text-[11px] sm:text-xs text-ink-secondary leading-none whitespace-nowrap">
                          {completedCount} of {rotBooks.length} read
                        </p>
                        <div className="h-[3px] w-full rounded-full lr-progress-track overflow-hidden">
                          <div
                            className="h-full rounded-full lr-progress-fill transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      <Icon
                        name="chevronRight"
                        className="w-5 h-5 text-ink-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
                      />
                    </div>
                  </button>

                  {rotBooks.length > 0 ? (
                    isDesktop ? (
                      <BookCoverGrid
                        size={shelfCardConfig.size}
                        customWidth={shelfCardConfig.customWidth}
                        infoPlacement={shelfCardConfig.infoPlacement}
                      >
                        {rotBooks.map((book) => renderShelfBookCard(book, rot, false))}
                      </BookCoverGrid>
                    ) : (
                      <BookCoverSlide
                        itemCount={rotBooks.length}
                        ariaLabel={`${rot.title} books`}
                        fullBleed={useRotationCard ? 'card' : true}
                      >
                        {rotBooks.map((book) => renderShelfBookCard(book, rot, true))}
                      </BookCoverSlide>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSheetRotationId(rot.id)}
                      className="w-full rounded-xl bg-surface-subtle/70 hover:bg-surface-subtle border border-dashed border-edge p-4 text-center text-xs text-ink-secondary transition-colors cursor-pointer"
                    >
                      No books placed on “{rot.title}” yet · Tap to add books
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-xl bg-surface border border-edge p-6 sm:p-10 text-center space-y-3 lr-card">
          <BotanicalIllustration variant="empty-shelf" className="w-44 h-auto mx-auto" />
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink">
            No active shelf rotation for {activeProfile?.name || 'Reader'}
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary max-w-md mx-auto leading-relaxed">
            Curate a calm, intentional face-out shelf from your home library so favorite stories stay fresh without clutter.
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
            {state.books.length === 0 && (
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Icon name="search" className="w-4 h-4" />
                <span>Add Books First</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>{t('home.createShelf')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('presets')}
              className="inline-flex items-center gap-1.5 justify-center min-h-[44px] px-5 py-2.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
            >
              <Icon name="sparkles" className="w-4 h-4 text-primary" />
              <span>{t('nav.presets')}</span>
            </button>
          </div>
        </section>
      )}

      {/* Discovery & Contextual Recommendation Rows */}
      {visibleShelves.map((shelf) => {
        if (shelf.kind === 'external-discovery') {
          const feedState = externalFeeds[shelf.key];
          const isLoading = !feedState || (feedState.loading && !feedState.loaded);
          const items = dedupedExternalDiscoveryItems[shelf.key] || [];

          if (feedState?.loaded && items.length === 0) {
            return null;
          }

          return (
            <section
              key={shelf.key}
              data-discovery-shelf={shelf.key}
              aria-labelledby={`shelf-heading-${shelf.key}`}
              className="pt-1.5 sm:pt-4 sm:border-t sm:border-edge-subtle/60 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2
                      id={`shelf-heading-${shelf.key}`}
                      className="font-display text-base sm:text-lg font-semibold text-ink leading-tight truncate"
                    >
                      {shelf.title}
                    </h2>
                    {shelf.badgeText && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-badge)] bg-primary/12 text-primary text-[10px] font-semibold shrink-0">
                        <Icon name="sparkles" className="w-2.5 h-2.5" />
                        <span>{shelf.badgeText}</span>
                      </span>
                    )}
                  </div>
                  {shelf.subtitle && (
                    <p className="text-[11px] text-ink-muted truncate mt-0.5">{shelf.subtitle}</p>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div
                  className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 flex gap-3 overflow-hidden py-1"
                  aria-busy="true"
                >
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="w-[104px] sm:w-[136px] aspect-square rounded-[var(--radius-cover)] bg-surface-subtle animate-pulse shrink-0 border border-edge-subtle"
                    />
                  ))}
                </div>
              ) : (
                <BookCoverSlide
                  itemCount={items.length + 1}
                  ariaLabel={shelf.title}
                  showPagination={false}
                  fullBleed
                >
                  {items.map((entry, idx) =>
                    renderExternalDiscoveryCard(entry, shelf.key, shelf.size, idx + 1)
                  )}
                  {renderQueryMoreBooksTile(shelf, Boolean(feedState?.loadingMore), Boolean(feedState?.loaded))}
                </BookCoverSlide>
              )}
            </section>
          );
        }

        const extraDiscoveryItems = dedupedExternalDiscoveryItems[shelf.key] || [];
        const ownedFeedState = externalFeeds[shelf.key];

        return (
          <section
            key={shelf.key}
            data-discovery-shelf={shelf.key}
            aria-labelledby={`shelf-heading-${shelf.key}`}
            className="pt-1.5 sm:pt-4 sm:border-t sm:border-edge-subtle/60 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2.5">
                {shelf.anchorBook ? (
                  <button
                    type="button"
                    onClick={() => setInspectedBookId(shelf.anchorBook!.id)}
                    className="group flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded overflow-hidden bg-surface-subtle border border-edge-subtle shrink-0">
                      <BookCover book={shelf.anchorBook} size="xs" aspectRatio="square" />
                    </div>
                    <h2
                      id={`shelf-heading-${shelf.key}`}
                      className="font-display text-base sm:text-lg font-semibold text-ink leading-tight truncate group-hover:text-primary transition-colors"
                    >
                      {shelf.title}
                    </h2>
                  </button>
                ) : (
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2
                        id={`shelf-heading-${shelf.key}`}
                        className="font-display text-base sm:text-lg font-semibold text-ink leading-tight truncate"
                      >
                        {shelf.title}
                      </h2>
                      {shelf.badgeText && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-badge)] bg-primary/12 text-primary text-[10px] font-semibold shrink-0">
                          <Icon name="moon" className="w-2.5 h-2.5" />
                          <span>{shelf.badgeText}</span>
                        </span>
                      )}
                    </div>
                    {shelf.subtitle && (
                      <p className="text-[11px] text-ink-muted truncate mt-0.5">{shelf.subtitle}</p>
                    )}
                  </div>
                )}
              </div>

              {shelf.actionType === 'manage-rotation' && primaryActiveRotation && (
                <button
                  type="button"
                  onClick={() => setSheetRotationId(primaryActiveRotation.id)}
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                >
                  <span>Manage</span>
                  <Icon name="chevronRight" className="w-3.5 h-3.5" />
                </button>
              )}

              {shelf.actionType === 'ai-picks' && (
                <button
                  type="button"
                  data-action="open-ai-recommendations"
                  onClick={() => setAiRecsModal({ isOpen: true })}
                  aria-label="See AI recommendations"
                  className="min-h-[30px] text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Icon name="sparkles" className="w-3.5 h-3.5 shrink-0" />
                  <span>AI Picks</span>
                </button>
              )}
            </div>

            <BookCoverSlide
              itemCount={shelf.items.length + extraDiscoveryItems.length + 1}
              ariaLabel={shelf.title}
              showPagination={false}
              fullBleed
            >
              {shelf.items.map(({ book, matchReasons }, idx) =>
                renderRecCoverCard(
                  book,
                  matchReasons,
                  shelf.key,
                  shelf.size,
                  shelf.targetRotation === undefined ? primaryActiveRotation : shelf.targetRotation,
                  shelf.ranked ? idx + 1 : undefined,
                  Boolean(shelf.showQuickAdd)
                )
              )}
              {extraDiscoveryItems.map((entry) =>
                renderExternalDiscoveryCard(entry, `${shelf.key}-ext`, shelf.size)
              )}
              {renderQueryMoreBooksTile(
                shelf,
                Boolean(ownedFeedState?.loading || ownedFeedState?.loadingMore),
                Boolean(ownedFeedState?.loaded)
              )}
            </BookCoverSlide>
          </section>
        );
      })}

      {/* Scroll Sentinel & Fallback Trigger for Progressive Loading */}
      {visibleShelfCount < discoveryShelves.length && (
        <div
          ref={loadMoreSentinelRef}
          className="pt-2 flex items-center justify-center"
        >
          <button
            type="button"
            onClick={() =>
              setVisibleShelfCount((prev) => Math.min(discoveryShelves.length, prev + 3))
            }
            className="text-xs font-semibold text-ink-secondary hover:text-primary px-3 py-1.5 rounded-full border border-edge bg-surface-subtle hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            Load more shelves ({discoveryShelves.length - visibleShelfCount} more)
          </button>
        </div>
      )}

      {/* Lower Summary: Quiet Inline Household Collection Summary */}
      <section
        aria-label="Active collection summary"
        className="pt-2 sm:pt-4 sm:border-t sm:border-edge-subtle/70 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold text-ink font-mono-tabular">
            {state.books.length} {state.books.length === 1 ? 'Book' : 'Books'} Cataloged
            <span className="text-ink-muted font-normal">
              {' · '}
              {activeProfile?.readHistoryBookIds?.length || 0} Read with{' '}
              {activeProfile?.name || 'Reader'}
              {wishlistCount > 0 ? ` · ${wishlistCount} Wishlisted` : ''}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate('rotations')}
            className="min-h-[38px] text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
          >
            {t('home.allShelves')}
          </button>
          <button
            type="button"
            onClick={() => navigate('library')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{t('nav.library')}</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Floating Bottom "Current Read / Last Read" Preview Bar */}
      {bottomBarBook && (
        <div
          role="region"
          aria-label={isBottomBarFinished ? 'Last read preview' : 'Currently reading preview'}
          data-current-read-bar="true"
          style={{ backgroundColor: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}
          className={`fixed ${
            bottomNavStyle === 'floating'
              ? 'bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))]'
              : 'bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))]'
          } inset-x-3 sm:inset-x-6 md:bottom-6 md:right-6 md:left-auto md:w-[390px] z-30 backdrop-blur-xl rounded-2xl border border-edge shadow-xl px-3 py-2 flex items-center justify-between gap-2.5`}
        >
          <button
            type="button"
            onClick={() => setInspectedBookId(bottomBarBook.id)}
            aria-label={`Open ${isBottomBarFinished ? 'last read' : 'currently reading'} book ${bottomBarBook.title}`}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
          >
            <div className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle shadow-2xs">
              <BookCover
                book={bottomBarBook}
                size="xs"
                aspectRatio={coverAspectRatio}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="min-w-0">
                <p className="font-sans text-[13px] font-semibold text-ink leading-tight truncate">
                  {bottomBarBook.title}
                </p>
                <p className="text-[11px] text-ink-secondary leading-tight truncate">
                  by {bottomBarBook.authors[0] || 'Unknown Author'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 max-w-[110px] rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isBottomBarFinished
                        ? 'w-full bg-success'
                        : 'w-1/2 bg-primary dark:bg-accent'
                    }`}
                  />
                </div>
                <span className="text-[10px] font-medium text-ink-muted whitespace-nowrap">
                  {isBottomBarFinished
                    ? formatFinishedDateLabel(bottomBarBook.lastReadAt)
                    : 'Reading'}
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={handleToggleBottomBarRead}
              aria-pressed={isBottomBarFinished}
              aria-label={
                isBottomBarFinished
                  ? `${bottomBarBook.title} finished. Tap to mark as reading again`
                  : `Mark ${bottomBarBook.title} as read`
              }
              title={
                isBottomBarFinished
                  ? 'Finished · Tap to mark as reading'
                  : 'Mark as read'
              }
              className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                isBottomBarFinished
                  ? 'text-success bg-success/12 hover:bg-success/20'
                  : 'text-ink-secondary hover:text-primary hover:bg-surface-elevated'
              }`}
            >
              <Icon name="check" className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleCurrentBookLoved}
              aria-pressed={Boolean(bottomBarBook.loved)}
              aria-label={bottomBarBook.loved ? 'Remove Loved mark' : 'Mark as Loved'}
              title={bottomBarBook.loved ? 'Loved' : 'Mark as Loved'}
              className={`min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                bottomBarBook.loved
                  ? 'text-loved hover:bg-surface-elevated'
                  : 'text-ink-secondary hover:text-loved hover:bg-surface-elevated'
              }`}
            >
              <Icon
                name={bottomBarBook.loved ? 'heartFilled' : 'heart'}
                className="w-4 h-4"
              />
            </button>
          </div>
        </div>
      )}

      {/* Slide-Up Detail Sheet for Clicking Any Active Rotation */}
      {sheetRotation && (() => {
        const isSheetActive = sheetRotation.status === 'active';
        const validIds = new Set(state.books.map((b) => b.id));
        const totalCount = sheetRotation.bookIds.filter((id) => validIds.has(id)).length;
        const readCount = sheetRotation.bookIds.filter(
          (id) => validIds.has(id) && sheetRotation.completedBookIds?.includes(id)
        ).length;
        const sheetProgressPct =
          totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;
        const sheetSchedule = computeRotationSchedule(
          sheetRotation,
          activeProfile || state.profiles[0]
        );

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-rotation-sheet-title"
            data-rotation-sheet="true"
            onClick={() => setSheetRotationId(null)}
            className="sheet-backdrop fixed inset-0 z-[45] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="animate-sheet-up w-full sm:max-w-2xl max-h-[90dvh] sm:max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
            >
              <div
                className="w-10 h-1.5 bg-edge rounded-full mx-auto mt-3 shrink-0"
                aria-hidden="true"
              />

              <div className="px-4 sm:px-5 pt-2.5 pb-3 border-b border-edge-subtle flex items-center justify-between gap-2.5 shrink-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {isSheetActive && (
                      <span
                        aria-hidden="true"
                        className="w-2 h-2 rounded-full bg-success ring-[3px] ring-success/20 lr-active-dot-pulse shrink-0"
                      />
                    )}
                    <h2
                      id="home-rotation-sheet-title"
                      className="font-display text-lg sm:text-xl font-semibold text-ink leading-tight truncate"
                    >
                      {sheetRotation.title}
                    </h2>
                  </div>
                  <p className="text-[11px] font-mono-tabular text-ink-secondary mt-0.5 truncate">
                    {isSheetActive
                      ? 'Active Shelf'
                      : sheetSchedule.lastActiveDateLabel
                        ? `Saved · Last active ${sheetSchedule.lastActiveDateLabel}`
                        : 'Saved Shelf'}{' '}
                    · {readCount}/{totalCount} read ({sheetProgressPct}%)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSheetRotationId(null)}
                  aria-label="Close rotation details"
                  className="min-h-[44px] min-w-[44px] -mr-1.5 rounded-full text-ink-secondary hover:text-ink hover:bg-surface-elevated active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  <Icon name="close" className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 sm:py-4">
                <RotationShelfCard
                  rotation={sheetRotation}
                  books={state.books}
                  isActive={isSheetActive}
                  variant="sheet"
                  hideHeaderTitle
                  isEditorOpen={editingShelfId === sheetRotation.id}
                  onOpenEditor={() => setEditingShelfId(sheetRotation.id)}
                  onCloseEditor={() => setEditingShelfId(null)}
                  onActivate={() => store.toggleRotationActive(sheetRotation.id)}
                  onDelete={async () => {
                    setSheetRotationId(null);
                    await store.deleteRotation(sheetRotation.id);
                  }}
                  onSwapBook={(bookId) =>
                    store.replaceRotationBookRandom(sheetRotation.id, bookId)
                  }
                  onReplaceBook={(bookId) =>
                    setRotationEditor({
                      modalMode: 'replace',
                      rotationId: sheetRotation.id,
                      targetBookId: bookId,
                    })
                  }
                  onAddRandom={(count) =>
                    store.addBooksToRotationRandom(sheetRotation.id, count)
                  }
                  onOpenAddModal={() =>
                    setRotationEditor({
                      modalMode: 'add',
                      rotationId: sheetRotation.id,
                      targetBookId: null,
                    })
                  }
                  onToggleRead={(bookId) =>
                    store.toggleRotationBookRead(sheetRotation.id, bookId)
                  }
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Found Book Intake Sheet for External Curated Discovery Picks */}
      <FoundBookSheet
        candidate={foundCandidate}
        isOpen={Boolean(foundCandidate)}
        onAddOwned={(cand, opts) => handleAddFoundCandidate(cand, 'owned', opts)}
        onAddWishlist={(cand, opts) => handleAddFoundCandidate(cand, 'wishlist', opts)}
        onAddInterested={(cand, opts) => handleAddFoundCandidate(cand, 'interested', opts)}
        onEditManual={(cand) => {
          setFoundCandidate(null);
          openManualAddModal({
            title: cand.title,
            authors: cand.authors.join(', '),
            isbn: cand.isbn13 || cand.isbn10 || '',
          });
        }}
        onClose={() => setFoundCandidate(null)}
      />

      {/* Manual Replace / Add Picker Modal for Home Rotation Slide-Up Sheet */}
      <RotationEditorModal
        modalMode={rotationEditor.modalMode}
        rotationId={rotationEditor.rotationId}
        targetBookId={rotationEditor.targetBookId}
        onClose={() =>
          setRotationEditor({ modalMode: null, rotationId: null, targetBookId: null })
        }
      />
    </div>
  );
};
