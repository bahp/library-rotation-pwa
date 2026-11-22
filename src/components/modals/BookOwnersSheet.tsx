import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { AVATAR_TONES } from '../../config/index.js';

export interface OwnerToggleOption {
  key: string;
  label: string;
  initial: string;
  tone: string;
}

interface BookOwnersSheetProps {
  isOpen: boolean;
  bookTitle: string;
  options: OwnerToggleOption[];
  selectedOwners: string[];
  onToggleOwner: (ownerKey: string) => Promise<void>;
  onAddCustomOwner: (customName: string) => Promise<void>;
  onClose: () => void;
}

export const BookOwnersSheet: React.FC<BookOwnersSheetProps> = ({
  isOpen,
  bookTitle,
  options,
  selectedOwners,
  onToggleOwner,
  onAddCustomOwner,
  onClose,
}) => {
  const [customInput, setCustomInput] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setCustomInput('');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmitCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) return;
    await onAddCustomOwner(trimmed);
    setCustomInput('');
  };

  return (
    <div
      data-backdrop-action="close-owners-sheet"
      className="fixed inset-0 z-[75] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit book owners"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sheet Header */}
        <div className="px-5 pt-4 pb-3 border-b border-edge-subtle flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted inline-flex items-center gap-1.5">
              <Icon name="profiles" className="w-3.5 h-3.5 text-primary" />
              <span>Book Owners</span>
            </p>
            <h3 className="font-display text-xl font-semibold text-ink mt-1 leading-tight truncate">
              Who owns “{bookTitle}”?
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close owners editor"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Selectable Owners List + Custom Owner Input */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-2">
            {options.map((opt) => {
              const active = selectedOwners.some(
                (o) => o.toLowerCase() === opt.key.toLowerCase()
              );
              const tone = AVATAR_TONES[opt.tone] || AVATAR_TONES.teal;
              return (
                <button
                  key={opt.key}
                  type="button"
                  data-owner-option={opt.key}
                  aria-pressed={active}
                  onClick={() => onToggleOwner(opt.key)}
                  className={`w-full min-h-[48px] px-3.5 py-2 rounded-xl border flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    active
                      ? 'bg-primary/10 border-primary text-ink'
                      : 'bg-surface-subtle/75 hover:bg-surface-elevated border-edge text-ink-secondary hover:text-ink'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-7 h-7 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0 ${tone}`}
                    >
                      {opt.initial}
                    </span>
                    <span className="text-sm font-semibold truncate">{opt.label}</span>
                  </span>

                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      active
                        ? 'bg-primary text-primary-fg'
                        : 'border border-edge bg-surface text-transparent'
                    }`}
                    aria-hidden="true"
                  >
                    <Icon name="check" className="w-3.5 h-3.5" />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Owner / Location Input */}
          <form onSubmit={handleSubmitCustom} className="pt-3 border-t border-edge-subtle space-y-2">
            <label
              htmlFor="owners-sheet-custom-input"
              className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
            >
              Add custom owner or house
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ClearableInput
                  id="owners-sheet-custom-input"
                  value={customInput}
                  onValueChange={setCustomInput}
                  placeholder="e.g., Grandma's House, Cousin Maya"
                  className="w-full h-11 pl-3.5 pr-8 rounded-xl bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="submit"
                className="h-11 px-4 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Add
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-edge-subtle bg-surface flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[110px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
