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
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-white bg-linen-200 dark:bg-night-800 hover:bg-linen-300 dark:hover:bg-night-700 transition-colors align-middle"
      >
        i
      </button>
      {isOpen && (
        <div
          id={id}
          role="region"
          aria-labelledby={`${id}-trigger`}
          className="mt-2 p-3 text-xs leading-relaxed rounded-xl bg-linen-100 dark:bg-night-900 border border-linen-200 dark:border-night-700 text-stone-700 dark:text-slate-300 shadow-xs animate-sheet-up"
        >
          {children}
        </div>
      )}
    </div>
  );
};
