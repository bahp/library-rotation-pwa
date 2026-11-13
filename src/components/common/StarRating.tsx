import React from 'react';
import { Icon } from './Icon.js';

interface StarRatingProps {
  rating: number; // 0 to 5
  onChange?: (nextRating: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  className?: string;
  dataInspectorCoverStars?: boolean;
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  onChange,
  readOnly = false,
  size = 'md',
  compact = false,
  className = '',
  dataInspectorCoverStars = false,
}) => {
  const currentRating = Math.max(0, Math.min(5, Math.trunc(rating || 0)));

  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <div
      data-inspector-cover-stars={dataInspectorCoverStars ? 'true' : undefined}
      className={`inline-flex items-center ${compact ? 'gap-0 -space-x-0.5' : 'gap-1'} ${className}`}
      role="radiogroup"
      aria-label="Book rating"
    >
      {[1, 2, 3, 4, 5].map((starIndex) => {
        const isFilled = starIndex <= currentRating;
        const isCurrentActive = starIndex === currentRating;
        const targetRating = isCurrentActive ? 0 : starIndex;
        const starAriaLabel = isCurrentActive
          ? 'Remove rating'
          : `Rate ${starIndex} star${starIndex > 1 ? 's' : ''}`;

        if (readOnly) {
          return (
            <span
              key={starIndex}
              className={`${sizeClasses} ${isFilled ? 'text-amber-500 fill-amber-500' : 'text-stone-300 dark:text-stone-700'}`}
              aria-hidden="true"
            >
              <Icon name={isFilled ? 'starFilled' : 'star'} className={sizeClasses} />
            </span>
          );
        }

        return (
          <button
            key={starIndex}
            type="button"
            data-rating={targetRating}
            aria-label={starAriaLabel}
            aria-checked={isCurrentActive}
            role="radio"
            onClick={() => onChange?.(targetRating)}
            className={`${
              compact ? 'w-4 sm:w-[18px] h-6 flex items-center justify-center' : 'p-1 rounded-md'
            } transition-transform hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-1 focus-visible:ring-forest-700 dark:focus-visible:ring-teal-400 ${
              isFilled
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-stone-300 dark:text-stone-700 hover:text-amber-400'
            }`}
          >
            <Icon name={isFilled ? 'starFilled' : 'star'} className={sizeClasses} />
          </button>
        );
      })}
    </div>
  );
};
