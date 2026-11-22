import React from 'react';
import { Icon } from './Icon.js';

export type SectionBookLayout = 'scroll' | 'grid' | 'list';

interface BookSectionViewToggleProps {
  value: SectionBookLayout;
  onChange: (mode: SectionBookLayout) => void;
  ariaLabel?: string;
  variant?: 'boxed' | 'capsule';
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
  variant = 'boxed',
}) => {
  const isCapsule = variant === 'capsule';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={
        isCapsule
          ? 'inline-flex items-center gap-0.5 shrink-0'
          : 'inline-flex items-center p-0.5 rounded-lg bg-surface-subtle border border-edge shrink-0'
      }
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        const iconName = isCapsule && opt.id === 'scroll' ? 'bookOpen' : opt.icon;
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
            style={
              isCapsule && active
                ? {
                    backgroundColor: 'var(--control-active-bg)',
                    color: 'var(--control-active-fg)',
                  }
                : undefined
            }
            className={
              isCapsule
                ? `w-9 h-9 rounded-full inline-flex items-center justify-center transition-all cursor-pointer ${
                    active ? 'shadow-2xs' : 'text-ink-secondary hover:text-ink'
                  }`
                : `min-h-[34px] min-w-[34px] px-2 rounded-md inline-flex items-center justify-center transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary text-primary-fg shadow-2xs'
                      : 'text-ink-secondary hover:text-ink'
                  }`
            }
          >
            <Icon name={iconName} className={isCapsule ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          </button>
        );
      })}
    </div>
  );
};
