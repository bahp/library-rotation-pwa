import React, { useState } from 'react';
import { BOOK_SPINE_PALETTES_BY_KEY, COVER_CATALOG_BADGE_STYLES, COVER_ROTATION_ADORNO_STYLES, AVATAR_TONES } from '../../config/index.js';
import { Icon } from './Icon.js';
import type { Book, ChildProfile, CoverAspectRatio } from '../../types/models.js';

interface BookCoverProps {
  book: Book;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'grid';
  aspectRatio?: CoverAspectRatio;
  showBadges?: boolean;
  activeProfile?: ChildProfile | null;
  profiles?: ChildProfile[];
  isReadOnActiveShelf?: boolean;
  isPickedInRotation?: boolean;
  isOnActiveShelf?: boolean;
  hideRotationAdorno?: boolean;
  cooldownDaysRemaining?: number;
  isStaleUnread?: boolean;
  staleShelfDays?: number;
  className?: string;
  onClick?: () => void;
}

export const BookCover: React.FC<BookCoverProps> = ({
  book,
  size = 'md',
  aspectRatio = 'square',
  showBadges = false,
  activeProfile = null,
  profiles = [],
  isReadOnActiveShelf = false,
  isPickedInRotation = false,
  isOnActiveShelf = false,
  hideRotationAdorno = false,
  cooldownDaysRemaining = 0,
  isStaleUnread = false,
  staleShelfDays = 0,
  className = '',
  onClick,
}) => {
  const [imageError, setImageError] = useState(false);

  const spineKey = book.spineColor || 'teal';
  const palette =
    BOOK_SPINE_PALETTES_BY_KEY[spineKey] || BOOK_SPINE_PALETTES_BY_KEY.teal;

  const isGrid = size === 'grid';
  const isSquare = aspectRatio !== 'portrait';

  const dims = isSquare
    ? isGrid
      ? 'w-full aspect-square rounded-lg shadow-xs'
      : size === 'xs'
        ? 'w-11 h-11 aspect-square rounded-md'
        : size === 'sm'
          ? 'w-14 h-14 aspect-square rounded-md'
          : size === 'lg'
            ? 'w-32 h-32 aspect-square rounded-xl'
            : 'w-20 h-20 aspect-square rounded-lg'
    : isGrid
      ? 'w-full aspect-[3/4] rounded-lg shadow-xs'
      : size === 'xs'
        ? 'w-11 h-[58px] rounded-md'
        : size === 'sm'
          ? 'w-14 h-[74px] rounded-md'
          : size === 'lg'
            ? 'w-32 h-[170px] rounded-xl'
            : 'w-20 h-[106px] rounded-lg';

  const radiusClass =
    size === 'lg' ? 'rounded-xl' : isGrid || size === 'md' ? 'rounded-lg' : 'rounded-md';
  const titleSnippet =
    book.title.length > 34 ? `${book.title.slice(0, 32).trim()}…` : book.title;
  const authorLast = (book.authors[0] || '').split(' ').pop() || '';

  // Badges logic
  let catalogBadge: { label: string; styleClass: string } | null = null;
  if (showBadges) {
    if (book.collectionStatus === 'wishlist') {
      catalogBadge = { label: 'Wishlist', styleClass: COVER_CATALOG_BADGE_STYLES.wishlist };
    } else if (book.collectionStatus === 'library') {
      catalogBadge = { label: 'Loan', styleClass: COVER_CATALOG_BADGE_STYLES.libraryLoan };
    } else if (book.collectionStatus === 'interested') {
      catalogBadge = { label: 'Saved', styleClass: COVER_CATALOG_BADGE_STYLES.saved };
    } else if (book.condition === 'torn') {
      catalogBadge = { label: 'Torn', styleClass: COVER_CATALOG_BADGE_STYLES.torn };
    } else if (book.condition === 'broken') {
      catalogBadge = { label: 'Broken', styleClass: COVER_CATALOG_BADGE_STYLES.damaged };
    }
  }

  // Rotation adorno logic
  let rotationAdorno: { label: string; icon: string; pillClass: string } | null = null;
  if (
    showBadges &&
    !hideRotationAdorno &&
    (!book.collectionStatus || book.collectionStatus === 'owned')
  ) {
    if (isReadOnActiveShelf) {
      rotationAdorno = {
        label: 'Read',
        icon: COVER_ROTATION_ADORNO_STYLES['shelf-read'].icon,
        pillClass: COVER_ROTATION_ADORNO_STYLES['shelf-read'].pillClass,
      };
    } else if (isPickedInRotation) {
      rotationAdorno = {
        label: 'Picked',
        icon: 'bookmarkFilled',
        pillClass: COVER_ROTATION_ADORNO_STYLES['shelf-read'].pillClass,
      };
    } else if (isStaleUnread) {
      rotationAdorno = {
        label: `Shelf ${staleShelfDays}d`,
        icon: COVER_ROTATION_ADORNO_STYLES['stale-unread'].icon,
        pillClass: COVER_ROTATION_ADORNO_STYLES['stale-unread'].pillClass,
      };
    } else if (isOnActiveShelf) {
      rotationAdorno = {
        label: 'Shelf',
        icon: COVER_ROTATION_ADORNO_STYLES['on-shelf'].icon,
        pillClass: COVER_ROTATION_ADORNO_STYLES['on-shelf'].pillClass,
      };
    } else if (cooldownDaysRemaining > 0) {
      rotationAdorno = {
        label: `Rest ${cooldownDaysRemaining}d`,
        icon: COVER_ROTATION_ADORNO_STYLES.cooldown.icon,
        pillClass: COVER_ROTATION_ADORNO_STYLES.cooldown.pillClass,
      };
    } else if (
      activeProfile &&
      Array.isArray(activeProfile.readHistoryBookIds) &&
      activeProfile.readHistoryBookIds.includes(book.id)
    ) {
      rotationAdorno = {
        label: 'Read',
        icon: COVER_ROTATION_ADORNO_STYLES['read-history'].icon,
        pillClass: COVER_ROTATION_ADORNO_STYLES['read-history'].pillClass,
      };
    } else if (!book.rotationCount || book.rotationCount === 0) {
      rotationAdorno = {
        label: 'New',
        icon: COVER_ROTATION_ADORNO_STYLES['never-rotated'].icon,
        pillClass: COVER_ROTATION_ADORNO_STYLES['never-rotated'].pillClass,
      };
    }
  }

  // Non-shared child owners
  const nonSharedOwners = showBadges && Array.isArray(book.owners)
    ? book.owners.filter((o) => o !== 'shared')
    : [];

  return (
    <div
      onClick={onClick}
      className={`relative ${isGrid ? '' : 'shrink-0'} ${dims} overflow-hidden bg-surface-subtle select-none ${className}`}
    >
      {/* Cloth-bound Fallback always underneath */}
      <div
        className={`lr-cover-fallback absolute inset-0 flex overflow-hidden ${radiusClass} ${palette.bg} ${palette.text} border border-black/15 dark:border-white/10`}
      >
        <div className={`${isGrid ? 'w-3' : 'w-2'} h-full shrink-0 ${palette.spine}`} />
        <div className={`flex-1 ${isGrid ? 'p-2.5 sm:p-3' : 'p-2'} flex flex-col justify-between min-w-0 text-left`}>
          <span
            className={`font-display ${
              isGrid ? 'text-[13px] sm:text-sm' : 'text-[11px]'
            } leading-snug font-semibold line-clamp-3 break-words`}
          >
            {titleSnippet}
          </span>
          <span className={`${isGrid ? 'text-[10px]' : 'text-[9px]'} opacity-85 truncate`}>
            {authorLast}
          </span>
        </div>
      </div>

      {/* Real Cover Image */}
      {book.coverUrl && !imageError && (
        <img
          src={book.coverUrl}
          alt={`Cover of ${book.title}`}
          width={180}
          height={isSquare ? 180 : 240}
          referrerPolicy="no-referrer"
          decoding="async"
          className="relative z-10 w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      )}

      {/* Top-Left: Catalog status or physical condition (only shown when non-owned or needs care) */}
      {catalogBadge && (
        <div className="pointer-events-none absolute top-1.5 left-1.5 z-20">
          <span
            className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-xs backdrop-blur-xs ${catalogBadge.styleClass}`}
          >
            {catalogBadge.label}
          </span>
        </div>
      )}

      {/* Top-Right: Loved indicator */}
      {showBadges && book.loved && (
        <div className="pointer-events-none absolute top-1.5 right-1.5 z-20">
          <span
            aria-label="Loved favorite"
            className="w-5 h-5 rounded-full bg-[#8C4A4F]/95 text-[#FFFCF5] flex items-center justify-center shadow-xs"
          >
            <Icon name="heartFilled" className="w-3 h-3" />
          </span>
        </div>
      )}

      {/* Bottom-Left: Rotation status adorno (only when enabled in settings and not suppressed) */}
      {rotationAdorno && (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-20">
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-xs border ${rotationAdorno.pillClass}`}
          >
            <Icon name={rotationAdorno.icon} className="w-2.5 h-2.5" />
            <span>{rotationAdorno.label}</span>
          </span>
        </div>
      )}

      {/* Bottom-Right: Child owner monograms */}
      {nonSharedOwners.length > 0 && (
        <div className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 flex -space-x-1">
          {nonSharedOwners.slice(0, 2).map((ownerId) => {
            const profile = profiles.find((p) => p.id === ownerId);
            const initial = profile?.name ? profile.name.charAt(0).toUpperCase() : ownerId.charAt(0).toUpperCase();
            const toneClass = AVATAR_TONES[profile?.avatarTone || 'teal'] || AVATAR_TONES.teal;
            return (
              <span
                key={ownerId}
                title={profile?.name || ownerId}
                className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center shadow-xs border border-surface ${toneClass}`}
              >
                {initial}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

