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

  const handleCardClick = () => {
    if (onInspect) {
      onInspect(book);
    } else {
      setInspectedBookId(book.id);
    }
  };

  const primaryAuthor = (book.authors && book.authors[0]) || 'Unknown Author';

  if (variant === 'shelf') {
    return (
      <div
        className={`group relative flex flex-col rounded-2xl bg-white dark:bg-night-900 border border-linen-200/90 dark:border-night-700/80 p-2 sm:p-2.5 shadow-xs hover:shadow-md transition-all ${
          isRead ? 'ring-2 ring-emerald-600/30 dark:ring-emerald-400/20' : ''
        } ${className}`}
      >
        <button
          type="button"
          onClick={handleCardClick}
          className="text-left w-full focus:outline-none"
          aria-label={`Inspect ${book.title}`}
        >
          <div className="relative mb-2">
            <BookCover
              book={book}
              size="grid"
              aspectRatio={coverAspect}
              showBadges
              activeProfile={activeProfile}
              profiles={profiles}
              isOnActiveShelf={isOnShelf}
              isReadOnActiveShelf={isRead}
            />
          </div>

          <h4 className="font-display text-xs sm:text-sm font-bold text-forest-900 dark:text-white line-clamp-1 leading-snug">
            {book.title}
          </h4>
          <p className="text-[11px] text-stone-ink dark:text-slate-400 line-clamp-1 leading-tight">
            {primaryAuthor}
          </p>
        </button>

        {/* Read Check Button on Active Shelf */}
        <div className="mt-2 pt-2 border-t border-linen-200/60 dark:border-night-800 flex items-center justify-between gap-1">
          {onToggleRead && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRead(book);
              }}
              aria-label={isRead ? `Mark "${book.title}" as unread` : `Mark "${book.title}" as read`}
              className={`w-full min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                isRead
                  ? 'bg-emerald-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs'
                  : 'bg-linen-100 hover:bg-linen-200 text-stone-700 dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-300'
              }`}
            >
              <Icon name="check" className="w-3.5 h-3.5" />
              <span>{isRead ? 'Read Together' : 'Mark Read'}</span>
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
              className={`shrink-0 min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center transition-colors ${
                book.loved
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                  : 'text-stone-400 hover:text-stone-600 dark:text-slate-500 hover:bg-linen-100 dark:hover:bg-night-800'
              }`}
            >
              <Icon name={book.loved ? 'heartFilled' : 'heart'} className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid variant (default in Library and Recommendations)
  return (
    <div
      onClick={handleCardClick}
      className={`group cursor-pointer flex flex-col text-left focus:outline-none transition-transform active:scale-[0.98] ${className}`}
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
      <div className="relative mb-1.5 rounded-xl overflow-hidden shadow-xs group-hover:shadow-md transition-shadow">
        <BookCover
          book={book}
          size="grid"
          aspectRatio={coverAspect}
          showBadges
          activeProfile={activeProfile}
          profiles={profiles}
          isOnActiveShelf={isOnShelf}
          isReadOnActiveShelf={isRead}
          cooldownDaysRemaining={cooldownDaysRemaining}
          isStaleUnread={isStaleUnread}
          staleShelfDays={staleShelfDays}
        />
      </div>

      <div className="min-w-0 px-0.5">
        <h4 className="font-display text-xs sm:text-sm font-bold text-forest-900 dark:text-white line-clamp-1 leading-snug">
          {book.title}
        </h4>
        <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate leading-tight">
          {primaryAuthor}
        </p>

        {book.readingStage && (
          <p className="text-[10px] text-stone-400 dark:text-slate-500 mt-0.5 truncate">
            {formatReadingStage(book.readingStage)}
          </p>
        )}
      </div>
    </div>
  );
};
