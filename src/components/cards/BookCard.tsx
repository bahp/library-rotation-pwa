import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { formatReadingStage } from '../../types/models.js';
import type { Book, ChildProfile } from '../../types/models.js';

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
  aspectRatio?: 'portrait' | 'square';
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
  aspectRatio,
  className = '',
}) => {
  const { state, setInspectedBookId } = useApp();
  const coverAspect = aspectRatio || state.settings?.coverAspectRatio || 'portrait';
  const showCoverAdornos = state.settings?.showCoverUsageAdornos !== false;
  const showFreshnessInsights = state.settings?.enableRotationHistoryInsights !== false;

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

  if (variant === 'shelf') {
    return (
      <div
        className={`group relative flex flex-col rounded-2xl border p-2.5 sm:p-3 transition-all ${
          isRead
            ? 'bg-emerald-50/60 border-emerald-200/90 dark:bg-emerald-950/20 dark:border-emerald-800/50'
            : 'bg-white border-linen-200/90 shadow-xs hover:shadow-md dark:bg-night-900 dark:border-night-700/80'
        } ${className}`}
      >
        <button
          type="button"
          onClick={handleCardClick}
          className="text-left w-full focus-visible:outline-2 focus-visible:outline-forest-700 rounded-xl"
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

          <h4 className="font-display text-xs sm:text-sm font-bold text-forest-900 dark:text-white line-clamp-1 leading-snug">
            {book.title}
          </h4>
          <p className="text-[11px] sm:text-xs text-stone-ink dark:text-slate-400 line-clamp-1 leading-tight mt-0.5">
            {primaryAuthor}
          </p>
        </button>

        {/* Read Check & Favorite Actions */}
        <div className="mt-2.5 pt-2 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-1.5">
          {onToggleRead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRead(book);
              }}
              aria-label={isRead ? `Mark "${book.title}" as unread` : `Mark "${book.title}" as read`}
              className={`flex-1 min-h-[38px] sm:min-h-[36px] px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                isRead
                  ? 'bg-emerald-700 text-white dark:bg-[#5ED3DA] dark:text-night-950'
                  : 'bg-linen-100 hover:bg-linen-200 text-stone-800 dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-200'
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
              className={`shrink-0 min-h-[38px] min-w-[38px] sm:min-h-[36px] sm:min-w-[36px] rounded-xl flex items-center justify-center transition-colors ${
                book.loved
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                  : 'text-stone-400 hover:text-stone-700 dark:text-slate-400 bg-linen-50 hover:bg-linen-100 dark:bg-night-800/60 dark:hover:bg-night-800'
              }`}
            >
              <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid variant (Library & Discovery) — crisp white bookstore card with editorial typography
  return (
    <div
      onClick={handleCardClick}
      className={`group cursor-pointer flex flex-col text-left rounded-2xl bg-white dark:bg-night-900 border border-linen-200/90 dark:border-night-800 p-2.5 shadow-2xs hover:shadow-md transition-all active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-forest-700 ${className}`}
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
      <div className="relative mb-2.5 rounded-xl overflow-hidden bg-linen-100 dark:bg-night-800">
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
        <h4 className="font-display text-xs sm:text-[13px] font-bold text-forest-900 dark:text-white line-clamp-1 leading-snug">
          {book.title}
        </h4>
        <p className="text-[11px] sm:text-xs text-stone-ink dark:text-slate-400 truncate leading-tight">
          {primaryAuthor}
        </p>

        <p className="text-[11px] text-stone-ink/85 dark:text-slate-400 truncate font-medium pt-0.5">
          <span>{formatReadingStage(book.readingStage)}</span>
          {statusMeta && (
            <>
              <span aria-hidden="true" className="mx-1">·</span>
              <span
                className={
                  isRead
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                    : isStaleUnread
                      ? 'text-amber-700 dark:text-amber-400 font-semibold'
                      : isOnShelf
                        ? 'text-forest-700 dark:text-[#5ED3DA] font-semibold'
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

