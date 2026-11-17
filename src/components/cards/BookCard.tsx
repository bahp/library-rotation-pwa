import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { formatReadingStage } from '../../types/models.js';
import type { Book, BookCardSize, BookViewMode, ChildProfile } from '../../types/models.js';

interface BookCardProps {
  book: Book;
  activeProfile?: ChildProfile | null;
  profiles?: ChildProfile[];
  isOnShelf?: boolean;
  isRead?: boolean;
  onInspect?: (book: Book) => void;
  onToggleRead?: (book: Book) => void;
  onToggleLoved?: (book: Book) => void;
  cooldownDaysRemaining?: number;
  isStaleUnread?: boolean;
  staleShelfDays?: number;
  variant?: 'grid' | 'shelf' | 'candidate';
  viewMode?: BookViewMode;
  cardSize?: BookCardSize;
  aspectRatio?: 'portrait' | 'square';
  actionSlot?: React.ReactNode;
  className?: string;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  activeProfile = null,
  profiles = [],
  isOnShelf = false,
  isRead = false,
  onInspect,
  onToggleRead,
  onToggleLoved,
  cooldownDaysRemaining = 0,
  isStaleUnread = false,
  staleShelfDays = 0,
  variant = 'grid',
  viewMode = 'grid',
  cardSize,
  aspectRatio,
  actionSlot,
  className = '',
}) => {
  const { state, setInspectedBookId } = useApp();
  const coverAspect = aspectRatio || state.settings?.coverAspectRatio || 'portrait';
  const showCoverAdornos = state.settings?.showCoverUsageAdornos !== false;
  const showFreshnessInsights = state.settings?.enableRotationHistoryInsights !== false;
  const resolvedCardSize: BookCardSize = cardSize || state.settings?.bookCardSize || 'regular';

  const handleCardClick = () => {
    if (onInspect) {
      onInspect(book);
    } else {
      setInspectedBookId(book.id);
    }
  };

  const primaryAuthor = (book.authors && book.authors[0]) || 'Unknown Author';

  const statusMeta = isRead
    ? 'Read'
    : isStaleUnread && staleShelfDays > 0
      ? `${staleShelfDays}d on shelf`
      : isOnShelf
        ? 'On shelf'
        : cooldownDaysRemaining > 0 && showFreshnessInsights
          ? `Resting · ${cooldownDaysRemaining}d left`
          : !book.rotationCount && showFreshnessInsights
            ? 'Unrotated'
            : null;

  if (viewMode === 'list') {
    const ownerLabels = (book.owners || [])
      .filter((o) => o && o !== 'shared')
      .map((ownerId) => {
        const prof = profiles.find((p) => p.id === ownerId);
        return (prof?.name || ownerId).slice(0, 1).toUpperCase();
      })
      .slice(0, 3);

    return (
      <div
        data-book-card={book.id}
        className={`group flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border transition-all ${
          isRead
            ? 'bg-surface-elevated border-secondary/60'
            : 'bg-surface border-edge shadow-2xs hover:border-primary/40'
        } ${className}`}
      >
        <button
          type="button"
          onClick={handleCardClick}
          aria-label={`Inspect ${book.title}`}
          className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <BookCover
            book={book}
            size="sm"
            aspectRatio={coverAspect}
            showBadges={variant !== 'grid'}
            hideRotationAdorno={!showCoverAdornos}
            activeProfile={activeProfile}
            profiles={profiles}
            isOnActiveShelf={isOnShelf}
            isReadOnActiveShelf={isRead}
            cooldownDaysRemaining={cooldownDaysRemaining}
            isStaleUnread={isStaleUnread}
            staleShelfDays={staleShelfDays}
          />
        </button>

        <button
          type="button"
          onClick={handleCardClick}
          className="flex-1 min-w-0 py-1 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-primary rounded"
        >
          <h4 className="font-display text-sm sm:text-base font-semibold text-ink truncate leading-snug group-hover:text-primary transition-colors">
            {book.title}
          </h4>
          <p className="text-xs text-ink-secondary truncate leading-tight mt-0.5">
            {primaryAuthor}
          </p>
          <p className="text-[11px] text-ink-muted truncate mt-1 font-medium">
            <span>{formatReadingStage(book.readingStage)}</span>
            {statusMeta && (
              <>
                <span aria-hidden="true" className="mx-1">·</span>
                <span
                  className={
                    isRead
                      ? 'text-primary font-semibold'
                      : isStaleUnread
                        ? 'text-accent font-semibold'
                        : isOnShelf
                          ? 'text-primary font-semibold'
                          : ''
                  }
                >
                  {statusMeta}
                </span>
              </>
            )}
            {ownerLabels.length > 0 && (
              <>
                <span aria-hidden="true" className="mx-1">·</span>
                <span>{ownerLabels.join(', ')}</span>
              </>
            )}
          </p>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {variant === 'shelf' && onToggleRead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRead(book);
              }}
              aria-label={isRead ? `Mark "${book.title}" as unread` : `Mark "${book.title}" as read`}
              className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                isRead
                  ? 'bg-primary text-primary-fg'
                  : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
              }`}
            >
              <Icon name="check" className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{isRead ? 'Read' : 'Mark Read'}</span>
            </button>
          )}

          {onToggleLoved && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLoved(book);
              }}
              aria-label={book.loved ? 'Remove from loved' : 'Mark as loved'}
              className={`shrink-0 min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center transition-colors border cursor-pointer ${
                book.loved
                  ? 'text-[#8C4A4F] dark:text-[#C48A8E] bg-surface-elevated border-[#8C4A4F]/40'
                  : 'text-ink-muted hover:text-ink bg-surface-subtle hover:bg-surface-elevated border-edge'
              }`}
            >
              <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-4 h-4" />
            </button>
          )}

          {actionSlot}

          {!actionSlot && !(variant === 'shelf' && onToggleRead) && !onToggleLoved && (
            <button
              type="button"
              onClick={handleCardClick}
              aria-label={`View ${book.title}`}
              className="min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-ink-muted group-hover:text-ink transition-colors cursor-pointer"
            >
              <Icon name="chevronRight" className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const cardPaddingClass =
    resolvedCardSize === 'compact'
      ? 'p-2'
      : resolvedCardSize === 'large'
        ? 'p-3 sm:p-3.5'
        : 'p-2.5 sm:p-3';

  const titleSizeClass =
    resolvedCardSize === 'compact'
      ? 'text-xs sm:text-sm'
      : resolvedCardSize === 'large'
        ? 'text-base sm:text-lg'
        : 'text-sm sm:text-[15px]';

  if (variant === 'shelf') {
    return (
      <div
        className={`group relative flex flex-col rounded-xl border ${cardPaddingClass} transition-all ${
          isRead
            ? 'bg-surface-elevated border-secondary/60'
            : 'bg-surface border-edge shadow-2xs hover:shadow-md hover:border-primary/40'
        } ${className}`}
      >
        <button
          type="button"
          onClick={handleCardClick}
          className="text-left w-full focus-visible:outline-2 focus-visible:outline-primary rounded-lg cursor-pointer"
          aria-label={`Inspect ${book.title}`}
        >
          <div className="relative mb-2.5">
            <BookCover
              book={book}
              size="grid"
              aspectRatio={coverAspect}
              showBadges
              hideRotationAdorno={!showCoverAdornos}
              activeProfile={activeProfile}
              profiles={profiles}
              isOnActiveShelf={isOnShelf}
              isReadOnActiveShelf={isRead}
              isStaleUnread={isStaleUnread}
              staleShelfDays={staleShelfDays}
            />
          </div>

          <h4 className={`font-display ${titleSizeClass} font-semibold text-ink line-clamp-1 leading-snug`}>
            {book.title}
          </h4>
          <p className="text-[11px] sm:text-xs text-ink-secondary line-clamp-1 leading-tight mt-0.5">
            {primaryAuthor}
          </p>
        </button>

        {/* Read Check & Favorite Actions */}
        <div className="mt-2.5 pt-2 border-t border-edge-subtle flex items-center justify-between gap-1.5">
          {onToggleRead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRead(book);
              }}
              aria-label={isRead ? `Mark "${book.title}" as unread` : `Mark "${book.title}" as read`}
              className={`flex-1 min-h-[38px] sm:min-h-[36px] px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                isRead
                  ? 'bg-primary text-primary-fg'
                  : 'bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink'
              }`}
            >
              <Icon name="check" className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{isRead ? 'Read Together' : 'Mark Read'}</span>
            </button>
          )}

          {onToggleLoved && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLoved(book);
              }}
              aria-label={book.loved ? 'Remove from loved' : 'Mark as loved'}
              className={`shrink-0 min-h-[38px] min-w-[38px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg flex items-center justify-center transition-colors border cursor-pointer ${
                book.loved
                  ? 'text-[#8C4A4F] dark:text-[#C48A8E] bg-surface-elevated border-[#8C4A4F]/40'
                  : 'text-ink-muted hover:text-ink bg-surface-subtle hover:bg-surface-elevated border-edge'
              }`}
            >
              <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid variant (Library & Discovery) — archival editorial card
  return (
    <div
      onClick={handleCardClick}
      className={`group cursor-pointer flex flex-col text-left rounded-xl bg-surface border border-edge ${cardPaddingClass} shadow-2xs hover:shadow-md hover:border-primary/40 transition-all active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-primary ${className}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={`View details for ${book.title}`}
    >
      <div className="relative mb-2.5 rounded-lg overflow-hidden bg-surface-subtle">
        <BookCover
          book={book}
          size="grid"
          aspectRatio={coverAspect}
          showBadges
          hideRotationAdorno={!showCoverAdornos}
          activeProfile={activeProfile}
          profiles={profiles}
          isOnActiveShelf={isOnShelf}
          isReadOnActiveShelf={isRead}
          cooldownDaysRemaining={cooldownDaysRemaining}
          isStaleUnread={isStaleUnread}
          staleShelfDays={staleShelfDays}
        />
      </div>

      <div className="min-w-0 px-0.5 space-y-0.5">
        <h4 className={`font-display ${titleSizeClass} font-semibold text-ink line-clamp-1 leading-snug`}>
          {book.title}
        </h4>
        <p className="text-[11px] sm:text-xs text-ink-secondary truncate leading-tight">
          {primaryAuthor}
        </p>

        <p className="text-[11px] text-ink-muted truncate font-medium pt-0.5">
          <span>{formatReadingStage(book.readingStage)}</span>
          {statusMeta && (
            <>
              <span aria-hidden="true" className="mx-1">·</span>
              <span
                className={
                  isRead
                    ? 'text-primary font-semibold'
                    : isStaleUnread
                      ? 'text-accent font-semibold'
                      : isOnShelf
                        ? 'text-primary font-semibold'
                        : ''
                }
              >
                {statusMeta}
              </span>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
