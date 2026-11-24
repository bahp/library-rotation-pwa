import React from 'react';
import { BookCover } from './BookCover.js';
import { HorizontalBookCarousel } from './HorizontalBookCarousel.js';
import { Icon } from './Icon.js';
import {
  formatBookBinding,
  isBookRotatable,
  normalizeBookCondition,
  normalizeCollectionStatus,
} from '../../types/models.js';
import {
  AVATAR_TONES,
  COVER_BADGE_SLOTS,
  COVER_CATALOG_BADGE_STYLES,
  normalizeBookCardCustomWidth,
} from '../../config/index.js';
import type {
  Book,
  BookCardFrame,
  BookCardInfoPlacement,
  BookCardMetaField,
  BookCardSize,
  ChildProfile,
  CoverAspectRatio,
} from '../../types/models.js';

export interface BookCardUsageMeta {
  compactRecencyLabel?: string;
  shortRecencyLabel?: string;
  inCooldown?: boolean;
  isCurrentlyOnActiveShelf?: boolean;
}

export function extractBookPublicationYear(book: Book): string | null {
  if (typeof book.publishedYear === 'number' && Number.isFinite(book.publishedYear) && book.publishedYear > 0) {
    return String(Math.trunc(book.publishedYear));
  }
  const raw = String(book.publishedYear || '').trim();
  if (!raw) return null;
  const match = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(raw);
  return match ? match[1] : null;
}

export function getBookCardWidthTokens(
  size: BookCardSize = 'compact',
  customWidth?: number,
  infoPlacement: BookCardInfoPlacement = 'below',
  density: 'standard' | 'dense' = 'standard'
) {
  const isCoverOnly = infoPlacement === 'cover-only';
  const isDense = density === 'dense';

  if (size === 'custom') {
    const px = normalizeBookCardCustomWidth(customWidth);
    const tightGap = isDense || isCoverOnly || px <= 120;
    return {
      sm: px,
      lg: px,
      gapSm: tightGap ? '0.5rem' : '0.75rem',
      gapLg: tightGap ? '0.625rem' : '0.875rem',
      effectiveTier: (px < 130 ? 'compact' : px >= 200 ? 'large' : 'regular') as 'compact' | 'regular' | 'large',
    };
  }

  if (size === 'large') {
    return {
      sm: 204,
      lg: 222,
      gapSm: isDense ? '0.75rem' : '0.875rem',
      gapLg: isDense ? '1rem' : '1.25rem',
      effectiveTier: 'large' as const,
    };
  }

  if (size === 'regular') {
    return {
      sm: 150,
      lg: 168,
      gapSm: isDense || isCoverOnly ? '0.625rem' : '0.75rem',
      gapLg: isDense || isCoverOnly ? '0.75rem' : '1rem',
      effectiveTier: 'regular' as const,
    };
  }

  return {
    sm: 104,
    lg: 126,
    gapSm: isDense || isCoverOnly ? '0.5rem' : '0.625rem',
    gapLg: isDense || isCoverOnly ? '0.625rem' : '0.75rem',
    effectiveTier: 'compact' as const,
  };
}

export interface BookCoverGridProps {
  size?: BookCardSize;
  customWidth?: number;
  density?: 'standard' | 'dense';
  infoPlacement?: BookCardInfoPlacement;
  className?: string;
  children: React.ReactNode;
}

export const BookCoverGrid: React.FC<BookCoverGridProps> = ({
  size = 'compact',
  customWidth,
  density = 'standard',
  infoPlacement = 'below',
  className = '',
  children,
}) => {
  const tokens = getBookCardWidthTokens(size, customWidth, infoPlacement, density);

  return (
    <div
      data-book-grid-size={size}
      style={
        {
          '--lr-card-min-sm': `${tokens.sm}px`,
          '--lr-card-min-lg': `${tokens.lg}px`,
          '--lr-grid-gap': tokens.gapSm,
          '--lr-grid-gap-lg': tokens.gapLg,
        } as React.CSSProperties
      }
      className={`lr-book-grid ${className}`}
    >
      {children}
    </div>
  );
};

export interface BookCoverListProps {
  className?: string;
  children: React.ReactNode;
}

export const BookCoverList: React.FC<BookCoverListProps> = ({
  className = '',
  children,
}) => {
  return <div className={`space-y-2 ${className}`}>{children}</div>;
};

export interface BookCoverSlideProps {
  itemCount: number;
  ariaLabel?: string;
  children: React.ReactNode;
}

export const BookCoverSlide: React.FC<BookCoverSlideProps> = ({
  itemCount,
  ariaLabel,
  children,
}) => {
  return (
    <HorizontalBookCarousel itemCount={itemCount} ariaLabel={ariaLabel}>
      {children}
    </HorizontalBookCarousel>
  );
};

export interface BookCoverCardProps {
  book: Book;
  activeProfile?: ChildProfile | null;
  profiles?: ChildProfile[];
  layout?: 'grid' | 'carousel' | 'list';
  size?: BookCardSize;
  customWidth?: number;
  aspectRatio?: CoverAspectRatio;
  infoPlacement?: BookCardInfoPlacement;
  cardFrame?: BookCardFrame;
  showCoverOverlays?: boolean;
  showUsageAdorno?: boolean;
  showRotationHistory?: boolean;
  fields?: readonly BookCardMetaField[];
  usage?: BookCardUsageMeta | null;
  customMetaLine?: string | null;
  customStatusText?: string | null;
  isOnShelf?: boolean;
  isRead?: boolean;
  isPicked?: boolean;
  highlightState?: 'none' | 'picked' | 'read' | 'selected';
  hideBookCoverInternalBadges?: boolean;
  dataBookCard?: string;
  onInspect: (book: Book) => void;
  bottomLeftCoverAction?: React.ReactNode;
  bottomRightCoverAction?: React.ReactNode;
  listTrailingAction?: React.ReactNode;
  className?: string;
}

export const BookCoverCard: React.FC<BookCoverCardProps> = ({
  book,
  activeProfile = null,
  profiles = [],
  layout = 'grid',
  size = 'compact',
  customWidth,
  aspectRatio = 'square',
  infoPlacement = 'below',
  cardFrame = 'framed',
  showCoverOverlays = true,
  showUsageAdorno = true,
  showRotationHistory = true,
  fields = ['title', 'author', 'ageFormat', 'usage'],
  usage = null,
  customMetaLine = null,
  customStatusText = null,
  isOnShelf = false,
  isRead = false,
  isPicked = false,
  highlightState = 'none',
  hideBookCoverInternalBadges = false,
  dataBookCard,
  onInspect,
  bottomLeftCoverAction,
  bottomRightCoverAction,
  listTrailingAction,
  className = '',
}) => {
  const widthTokens = getBookCardWidthTokens(size, customWidth, infoPlacement);
  const sizeTier = widthTokens.effectiveTier;
  const primaryAuthor = (book.authors && book.authors[0]) || 'Unknown Author';
  const fieldSet = new Set<BookCardMetaField>(fields);
  const yearLabel = extractBookPublicationYear(book);
  const pagesLabel =
    typeof book.pageCount === 'number' && book.pageCount > 0 ? `${book.pageCount}p` : null;

  const status = normalizeCollectionStatus(book.collectionStatus);
  const condition = normalizeBookCondition(book.condition);

  const catalogConditionLabel =
    status === 'wishlist'
      ? 'Wishlist'
      : status === 'library'
        ? 'Loan'
        : status === 'interested'
          ? 'Saved'
          : condition !== 'good'
            ? condition === 'torn'
              ? 'Torn'
              : 'Damaged'
            : null;

  const inlineSpecs: string[] = [];
  if (fieldSet.has('year') && yearLabel) inlineSpecs.push(yearLabel);
  if (fieldSet.has('pages') && pagesLabel) inlineSpecs.push(pagesLabel);
  if (fieldSet.has('ageFormat')) {
    inlineSpecs.push(`Ages ${book.ageMin}–${book.ageMax}`);
    inlineSpecs.push(formatBookBinding(book.format));
  }

  const resolvedUsageText =
    customStatusText ||
    (fieldSet.has('usage') && showRotationHistory && isBookRotatable(book) && usage?.compactRecencyLabel
      ? usage.compactRecencyLabel
      : null);

  const nonSharedOwners = (book.owners || []).filter((o) => o && o !== 'shared');

  // ---------------------------------------------------------------------------
  // LIST ROW MODE
  // ---------------------------------------------------------------------------
  if (layout === 'list') {
    const listTitleVisible = infoPlacement !== 'cover-only' || fieldSet.has('title');
    const isListBorderless = cardFrame === 'borderless';
    return (
      <article
        data-book-card={dataBookCard ?? book.id}
        data-card-frame={cardFrame}
        className={
          isListBorderless
            ? `group isolate min-w-0 rounded-none bg-transparent border-0 border-b ${
                highlightState === 'read' || highlightState === 'picked'
                  ? 'border-primary/45'
                  : 'border-edge-subtle hover:border-primary/45'
              } px-0.5 py-2 flex items-center justify-between gap-2.5 transition-all ${className}`
            : `group isolate min-w-0 rounded-[var(--radius-card)] bg-surface border ${
                highlightState === 'read' || highlightState === 'picked'
                  ? 'border-primary/45'
                  : 'border-edge hover:border-primary/45'
              } p-2 sm:p-2.5 lr-card flex items-center justify-between gap-2.5 transition-all ${className}`
        }
      >
        <button
          type="button"
          data-action="inspect-book"
          data-book-id={book.id}
          onClick={() => onInspect(book)}
          aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
        >
          <div
            className={`shrink-0 rounded-[var(--radius-cover)] overflow-hidden bg-surface-subtle ${
              isListBorderless ? 'lr-cover-shadow' : ''
            }`}
          >
            <BookCover
              book={book}
              size={sizeTier === 'large' ? 'md' : sizeTier === 'regular' ? 'sm' : 'xs'}
              aspectRatio={aspectRatio}
              showBadges={showCoverOverlays && !hideBookCoverInternalBadges}
              hideRotationAdorno={!showCoverOverlays || !showUsageAdorno}
              activeProfile={activeProfile}
              profiles={profiles}
              isOnActiveShelf={isOnShelf}
              isReadOnActiveShelf={isRead}
              isPickedInRotation={isPicked}
              noShadow={isListBorderless}
            />
          </div>

          <div className="flex-1 min-w-0">
            {listTitleVisible && (
              <div className="flex items-center gap-2 min-w-0">
                <h2
                  className={`font-sans text-sm sm:text-[15px] font-semibold text-ink leading-tight truncate group-hover:text-primary transition-colors ${
                    isRead ? 'opacity-80' : ''
                  }`}
                >
                  {book.title}
                </h2>
                {catalogConditionLabel && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-surface-elevated border border-edge text-[10px] font-semibold text-ink-secondary">
                    {catalogConditionLabel}
                  </span>
                )}
              </div>
            )}

            {fieldSet.has('author') && (
              <p className="text-xs text-ink-secondary truncate leading-tight mt-0.5">
                {primaryAuthor}
              </p>
            )}

            {(inlineSpecs.length > 0 || resolvedUsageText || customMetaLine) && (
              <p className="text-[11px] text-ink-muted truncate leading-tight mt-0.5 font-mono-tabular">
                {customMetaLine ? (
                  <span className="font-sans text-primary font-semibold">{customMetaLine}</span>
                ) : (
                  <>
                    {inlineSpecs.length > 0 && (
                      <span className="font-sans">{inlineSpecs.join(' · ')}</span>
                    )}
                    {resolvedUsageText && (
                      <>
                        {inlineSpecs.length > 0 && (
                          <span aria-hidden="true" className="mx-1">
                            ·
                          </span>
                        )}
                        <span
                          data-library-usage-line="true"
                          className={`font-sans ${
                            usage?.inCooldown
                              ? 'text-accent font-medium'
                              : usage?.isCurrentlyOnActiveShelf || isRead || isPicked
                                ? 'text-primary font-semibold'
                                : ''
                          }`}
                        >
                          {resolvedUsageText}
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
            )}
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {showCoverOverlays && nonSharedOwners.length > 0 && (
            <div className="hidden sm:flex -space-x-1">
              {nonSharedOwners.slice(0, 2).map((ownerId) => {
                const prof = profiles.find((p) => p.id === ownerId);
                const tone = AVATAR_TONES[prof?.avatarTone || 'teal'] || AVATAR_TONES.teal;
                return (
                  <span
                    key={ownerId}
                    title={prof?.name || ownerId}
                    className={`w-5 h-5 rounded-full text-[10px] font-bold inline-flex items-center justify-center ring-1 ring-surface ${tone}`}
                  >
                    {(prof?.name || ownerId).charAt(0).toUpperCase()}
                  </span>
                );
              })}
            </div>
          )}
          {showCoverOverlays && book.loved && !listTrailingAction && (
            <span
              className="w-6 h-6 rounded-full bg-surface-elevated text-danger inline-flex items-center justify-center border border-edge"
              title="Loved favorite"
            >
              <Icon name="heartFilled" className="w-3.5 h-3.5" />
            </span>
          )}
          {listTrailingAction || (
            <button
              type="button"
              onClick={() => onInspect(book)}
              aria-label={`Inspect ${book.title}`}
              className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-ink-muted group-hover:text-ink cursor-pointer"
            >
              <Icon name="chevronRight" className="w-4 h-4" />
            </button>
          )}
        </div>
      </article>
    );
  }

  // ---------------------------------------------------------------------------
  // GRID & CAROUSEL CARD MODES
  // ---------------------------------------------------------------------------
  const isCarousel = layout === 'carousel';
  const isCoverOnly = infoPlacement === 'cover-only';
  const isOverlay = infoPlacement === 'overlay';
  const isBorderless = cardFrame === 'borderless' || isCoverOnly;

  const carouselWidthClass = isCarousel ? 'lr-book-slide-card' : '';

  const outerCardClass = isCoverOnly
    ? `group isolate relative min-w-0 transition-transform ${carouselWidthClass}`
    : isOverlay
      ? isBorderless
        ? `group isolate relative flex flex-col min-w-0 rounded-[var(--radius-cover)] overflow-hidden lr-cover-shadow transition-all ${
            highlightState === 'picked'
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas'
              : highlightState === 'read' || highlightState === 'selected'
                ? 'ring-[1.5px] ring-primary/70 ring-offset-2 ring-offset-canvas'
                : ''
          } ${carouselWidthClass}`
        : `group isolate relative flex flex-col min-w-0 rounded-[var(--radius-cover)] overflow-hidden bg-surface-subtle border ${
            highlightState === 'picked' || highlightState === 'read' || highlightState === 'selected'
              ? 'border-primary/60 ring-2 ring-primary/25'
              : 'border-edge hover:border-secondary'
          } lr-card transition-all ${carouselWidthClass}`
      : isBorderless
        ? `group isolate flex flex-col justify-between min-w-0 transition-transform ${carouselWidthClass}`
        : `group isolate flex flex-col justify-between min-w-0 rounded-[var(--radius-card)] bg-surface border ${
            highlightState === 'picked' || highlightState === 'read' || highlightState === 'selected'
              ? 'border-primary/50'
              : 'border-edge hover:border-secondary'
          } ${
            sizeTier === 'compact'
              ? 'p-1.5 sm:p-2'
              : sizeTier === 'large'
                ? 'p-3 sm:p-3.5'
                : 'p-2 sm:p-2.5'
          } lr-card transition-all ${carouselWidthClass}`;

  const coverHighlightRing =
    isBorderless &&
    !isOverlay &&
    (highlightState === 'picked'
      ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas'
      : highlightState === 'read' || highlightState === 'selected'
        ? 'ring-[1.5px] ring-primary/70 ring-offset-2 ring-offset-canvas'
        : '');

  let topLeftCatalogBadge: React.ReactNode = null;
  if (showCoverOverlays && hideBookCoverInternalBadges) {
    if (status === 'wishlist') {
      topLeftCatalogBadge = (
        <span
          data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
          data-cover-catalog-badge="wishlist"
          className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-[var(--radius-badge)] ${COVER_CATALOG_BADGE_STYLES.wishlist} text-[9px] font-bold tracking-wide shadow-2xs`}
        >
          Wishlist
        </span>
      );
    } else if (status === 'library') {
      topLeftCatalogBadge = (
        <span
          data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
          data-cover-catalog-badge="loan"
          className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-[var(--radius-badge)] ${COVER_CATALOG_BADGE_STYLES.libraryLoan} text-[9px] font-bold tracking-wide shadow-2xs`}
        >
          Loan
        </span>
      );
    } else if (status === 'interested') {
      topLeftCatalogBadge = (
        <span
          data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
          data-cover-catalog-badge="saved"
          className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-[var(--radius-badge)] ${COVER_CATALOG_BADGE_STYLES.saved} text-[9px] font-bold tracking-wide shadow-2xs`}
        >
          Saved
        </span>
      );
    } else if (condition !== 'good') {
      const label = condition === 'torn' ? 'Torn' : 'Damaged';
      const style =
        condition === 'torn'
          ? COVER_CATALOG_BADGE_STYLES.torn
          : COVER_CATALOG_BADGE_STYLES.damaged;
      topLeftCatalogBadge = (
        <span
          data-cover-slot={COVER_BADGE_SLOTS.catalogState.slot}
          data-cover-catalog-badge={condition}
          className={`${COVER_BADGE_SLOTS.catalogState.positionClass} px-1.5 py-0.5 rounded-[var(--radius-badge)] ${style} text-[9px] font-bold tracking-wide shadow-2xs`}
        >
          {label}
        </span>
      );
    }
  }

  const hasOverlayText =
    isOverlay &&
    (fieldSet.has('title') ||
      fieldSet.has('author') ||
      inlineSpecs.length > 0 ||
      Boolean(resolvedUsageText) ||
      Boolean(customMetaLine));

  const titleSizeClass =
    sizeTier === 'compact'
      ? 'text-xs sm:text-[13px]'
      : sizeTier === 'large'
        ? 'text-sm sm:text-base'
        : 'text-[13px] sm:text-sm';

  return (
    <article
      data-book-card={dataBookCard ?? book.id}
      data-card-frame={isBorderless ? 'borderless' : 'framed'}
      style={
        isCarousel
          ? ({
              '--lr-card-min-sm': `${widthTokens.sm}px`,
              '--lr-card-min-lg': `${widthTokens.lg}px`,
            } as React.CSSProperties)
          : undefined
      }
      className={`${outerCardClass} ${className}`}
    >
      <div className="relative">
        <button
          type="button"
          data-action="inspect-book"
          data-book-id={book.id}
          onClick={() => onInspect(book)}
          aria-label={`Inspect ${book.title} by ${primaryAuthor}`}
          className={`block w-full rounded-[var(--radius-cover)] overflow-hidden bg-surface-subtle transition-transform active:scale-[0.98] cursor-pointer ${
            isBorderless && !isOverlay ? 'lr-cover-shadow' : ''
          } ${coverHighlightRing}`}
        >
          <BookCover
            book={book}
            size="grid"
            aspectRatio={aspectRatio}
            showBadges={showCoverOverlays && !hideBookCoverInternalBadges}
            hideRotationAdorno={!showCoverOverlays || !showUsageAdorno || isOverlay}
            activeProfile={activeProfile}
            profiles={profiles}
            isOnActiveShelf={isOnShelf}
            isReadOnActiveShelf={isRead}
            isPickedInRotation={isPicked}
            noShadow={isBorderless}
          />
        </button>

        {/* Custom corner overlays when caller disables internal BookCover badges (Library style) */}
        {topLeftCatalogBadge}

        {showCoverOverlays && hideBookCoverInternalBadges && book.loved && (
          <span
            data-cover-slot={COVER_BADGE_SLOTS.affection.slot}
            className={`${COVER_BADGE_SLOTS.affection.positionClass} w-6 h-6 rounded-full bg-surface/95 text-danger flex items-center justify-center shadow-xs border border-edge`}
            title="Loved favorite"
          >
            <Icon name="heartFilled" className="w-3.5 h-3.5" />
          </span>
        )}

        {showCoverOverlays &&
          hideBookCoverInternalBadges &&
          !isOverlay &&
          showUsageAdorno &&
          usage?.compactRecencyLabel && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-20">
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-[var(--radius-badge)] shadow-xs border ${
                  usage.inCooldown
                    ? 'bg-surface-elevated/95 text-accent border-accent/45'
                    : usage.isCurrentlyOnActiveShelf
                      ? 'bg-primary text-primary-fg border-surface'
                      : 'bg-surface/95 text-ink border-edge'
                }`}
              >
                {usage.compactRecencyLabel}
              </span>
            </div>
          )}

        {showCoverOverlays &&
          hideBookCoverInternalBadges &&
          !isOverlay &&
          nonSharedOwners.length > 0 && (
            <div
              data-cover-slot={COVER_BADGE_SLOTS.owners.slot}
              className={`${COVER_BADGE_SLOTS.owners.positionClass} flex -space-x-1`}
            >
              {nonSharedOwners.slice(0, 2).map((ownerId) => {
                const prof = profiles.find((p) => p.id === ownerId);
                const tone = AVATAR_TONES[prof?.avatarTone || 'teal'] || AVATAR_TONES.teal;
                return (
                  <span
                    key={ownerId}
                    title={prof?.name || ownerId}
                    className={`w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center ring-1 ring-surface shadow-2xs ${tone}`}
                  >
                    {(prof?.name || ownerId).charAt(0).toUpperCase()}
                  </span>
                );
              })}
            </div>
          )}

        {/* Bottom Overlay Scrim Info Mode */}
        {isOverlay && (hasOverlayText || bottomLeftCoverAction || bottomRightCoverAction) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-8 pb-2 px-2 lr-cover-overlay-scrim flex items-end justify-between gap-1.5 rounded-b-[var(--radius-cover)]">
            {bottomLeftCoverAction && (
              <div className="pointer-events-auto shrink-0 relative z-10">
                {bottomLeftCoverAction}
              </div>
            )}

            {hasOverlayText && (
              <button
                type="button"
                onClick={() => onInspect(book)}
                className="pointer-events-auto flex-1 min-w-0 text-left cursor-pointer"
              >
                {fieldSet.has('title') && (
                  <h2
                    className={`font-sans ${
                      sizeTier === 'large' ? 'text-[13px] sm:text-sm' : 'text-[11px] sm:text-xs'
                    } font-semibold leading-tight line-clamp-2 drop-shadow-xs`}
                  >
                    {book.title}
                  </h2>
                )}
                {fieldSet.has('author') && (
                  <p className="text-[10px] lr-cover-overlay-muted truncate leading-tight mt-0.5">
                    {primaryAuthor}
                  </p>
                )}
                {(inlineSpecs.length > 0 || resolvedUsageText || customMetaLine) && (
                  <p className="text-[9.5px] lr-cover-overlay-muted truncate leading-tight mt-0.5 font-mono-tabular">
                    {customMetaLine ||
                      [...inlineSpecs, resolvedUsageText].filter(Boolean).join(' · ')}
                  </p>
                )}
              </button>
            )}

            {bottomRightCoverAction && (
              <div className="pointer-events-auto shrink-0 relative z-10">
                {bottomRightCoverAction}
              </div>
            )}
          </div>
        )}

        {/* Corner interactive slots for Below / Cover-Only modes */}
        {!isOverlay && bottomLeftCoverAction}
        {!isOverlay && bottomRightCoverAction}
      </div>

      {/* Below-Cover Metadata Block */}
      {infoPlacement === 'below' &&
        (fieldSet.has('title') ||
          fieldSet.has('author') ||
          inlineSpecs.length > 0 ||
          resolvedUsageText ||
          customMetaLine) && (
          <button
            type="button"
            data-action="inspect-book"
            data-book-id={book.id}
            onClick={() => onInspect(book)}
            className="mt-1.5 px-0.5 pb-0.5 text-left min-w-0 flex-1 flex flex-col justify-between rounded cursor-pointer"
          >
            <div className="min-w-0 w-full">
              {fieldSet.has('title') && (
                <h2
                  className={`font-sans ${titleSizeClass} font-semibold text-ink leading-tight line-clamp-2 group-hover:text-primary transition-colors ${
                    isRead ? 'opacity-75' : ''
                  }`}
                >
                  {book.title}
                </h2>
              )}
              {fieldSet.has('author') && (
                <p className="text-[11px] text-ink-secondary truncate leading-tight mt-0.5">
                  {primaryAuthor}
                </p>
              )}
            </div>

            {(inlineSpecs.length > 0 || resolvedUsageText || customMetaLine) && (
              <div className="mt-1 pt-1 border-t border-edge-subtle space-y-0.5 w-full min-w-0">
                {inlineSpecs.length > 0 && (
                  <p className="text-[10px] text-ink-secondary truncate leading-tight font-mono-tabular">
                    <span className="font-sans">{inlineSpecs.join(' · ')}</span>
                  </p>
                )}
                {customMetaLine && (
                  <p className="text-[10px] font-semibold text-primary truncate leading-tight">
                    {customMetaLine}
                  </p>
                )}
                {!customMetaLine && resolvedUsageText && (
                  <p
                    data-library-usage-line="true"
                    title={usage?.shortRecencyLabel}
                    className={`text-[10px] truncate leading-tight ${
                      usage?.inCooldown
                        ? 'text-accent font-medium'
                        : usage?.isCurrentlyOnActiveShelf
                          ? 'text-primary font-semibold'
                          : 'text-ink-muted'
                    }`}
                  >
                    {resolvedUsageText}
                  </p>
                )}
              </div>
            )}
          </button>
        )}
    </article>
  );
};
