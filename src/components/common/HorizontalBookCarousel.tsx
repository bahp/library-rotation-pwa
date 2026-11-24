import React, { useCallback, useEffect, useRef, useState } from 'react';

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

  const recalc = useCallback(() => {
    if (!showPagination) return;
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    if (maxScroll <= 12 || itemCount <= 1) {
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
    if (!showPagination) return;
    recalc();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => recalc());
    observer.observe(el);
    return () => observer.disconnect();
  }, [recalc, showPagination]);

  const handleDotClick = (index: number) => {
    const el = scrollerRef.current;
    if (!el || dotCount <= 1) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const targetLeft = (index / (dotCount - 1)) * maxScroll;
    el.scrollTo({ left: targetLeft, behavior: 'smooth' });
  };

  return (
    <div className="min-w-0">
      <div
        ref={scrollerRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={showPagination ? recalc : undefined}
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
