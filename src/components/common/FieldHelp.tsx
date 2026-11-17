import React, { useState } from 'react';
import { Icon } from './Icon.js';

interface FieldHelpProps {
  id: string;
  label?: string;
  children: React.ReactNode;
}

export const FieldHelp: React.FC<FieldHelpProps> = ({ id, label = 'Help information', children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="inline-block">
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={isOpen}
        aria-controls={id}
        aria-label={label}
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold text-ink-secondary hover:text-ink bg-surface-elevated hover:bg-edge/60 border border-edge transition-colors align-middle cursor-pointer"
      >
        i
      </button>
      {isOpen && (
        <div
          id={id}
          role="region"
          aria-labelledby={`${id}-trigger`}
          className="mt-2 p-3 text-xs leading-relaxed rounded-lg bg-surface-subtle border border-edge text-ink-secondary shadow-xs animate-sheet-up"
        >
          {children}
        </div>
      )}
    </div>
  );
};
