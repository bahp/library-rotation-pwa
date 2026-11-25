import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';

interface HorizontalBookCarouselProps {
  children: React.ReactNode;
  itemCount: number;
  ariaLabel?: string;
  showPagination?: boolean;
}

export const HorizontalBookCarousel: React.FC<HorizontalBookCarouselProps> = ({
  children,
  itemCount,
  ariaLabel = 'Book carousel',
  showPagination = true,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [dotCount, setDotCount] = useState(1);
  const [activeDot, setActiveDot] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const recalc = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const hasOverflow = maxScroll > 12 && itemCount > 1;
    setCanScrollLeft(hasOverflow && el.scrollLeft > 8);
    setCanScrollRight(hasOverflow && el.scrollLeft < maxScroll - 8);

    if (!showPagination) return;
    if (!hasOverflow) {
      setDotCount(1);
      setActiveDot(0);
      return;
    }

    const pages = Math.min(
      7,
      Math.max(2, Math.round(el.scrollWidth / Math.max(1, el.clientWidth * 0.72)))
    );
    const ratio = Math.min(1, Math.max(0, el.scrollLeft / maxScroll));
    const idx = Math.min(pages - 1, Math.round(ratio * (pages - 1)));
    setDotCount(pages);
    setActiveDot(idx);
  }, [itemCount, showPagination]);

  useEffect(() => {
    recalc();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => recalc());
    observer.observe(el);
    return () => observer.disconnect();
  }, [recalc]);

  const handleDotClick = (index: number) => {
    const el = scrollerRef.current;
    if (!el || dotCount <= 1) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const targetLeft = (index / (dotCount - 1)) * maxScroll;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
  };

  const scrollByStep = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(220, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <div className="min-w-0 relative group/carousel">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByStep(-1)}
          aria-label={`Scroll ${ariaLabel} left`}
          className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-surface/92 hover:bg-surface border border-edge text-ink shadow-lg backdrop-blur-md absolute left-1.5 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
        >
          <Icon name="chevronLeft" className="w-4 h-4" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByStep(1)}
          aria-label={`Scroll ${ariaLabel} right`}
          className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-surface/92 hover:bg-surface border border-edge text-ink shadow-lg backdrop-blur-md absolute right-1.5 top-1/2 -translate-y-1/2 z-20 opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
        >
          <Icon name="chevronRight" className="w-4 h-4" />
        </button>
      )}

      <div
        ref={scrollerRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={recalc}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar pb-1"
      >
        {children}
      </div>

      {showPagination && dotCount > 1 && (
        <div
          aria-label="Carousel progress"
          className="mt-2 flex items-center justify-center gap-1"
        >
          {Array.from({ length: dotCount }).map((_, idx) => {
            const isActive = idx === activeDot;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleDotClick(idx)}
                aria-label={`Scroll to section ${idx + 1} of ${dotCount}`}
                aria-current={isActive ? 'true' : undefined}
                className="min-h-[24px] px-1 flex items-center justify-center cursor-pointer"
              >
                <span
                  className={`block w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                    isActive
                      ? 'bg-primary dark:bg-accent scale-110'
                      : 'bg-edge hover:bg-ink-muted'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
