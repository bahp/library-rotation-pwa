import React from 'react';
import { Icon } from './Icon.js';

export type SectionBookLayout = 'scroll' | 'grid' | 'list';

interface BookSectionViewToggleProps {
  value: SectionBookLayout;
  onChange: (mode: SectionBookLayout) => void;
  ariaLabel?: string;
}

const OPTIONS: Array<{ id: SectionBookLayout; label: string; icon: string }> = [
  { id: 'scroll', label: 'Horizontal scroll view', icon: 'carousel' },
  { id: 'grid', label: 'Grid view', icon: 'grid' },
  { id: 'list', label: 'List view', icon: 'list' },
];

export const BookSectionViewToggle: React.FC<BookSectionViewToggleProps> = ({
  value,
  onChange,
  ariaLabel = 'Section book layout',
}) => {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge shrink-0"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            data-action="set-section-view-mode"
            data-view-mode={opt.id}
            aria-pressed={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => onChange(opt.id)}
            className={`min-h-[34px] min-w-[34px] px-2 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
              active
                ? 'bg-primary text-primary-fg shadow-2xs'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            <Icon name={opt.icon} className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
};
