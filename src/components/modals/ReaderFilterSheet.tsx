import React from 'react';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

export interface ReaderChoice {
  key: string;
  label: string;
  initial: string;
  tone: string;
}

interface ReaderFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  ownerChoices: ReaderChoice[];
  effectiveOwners: string[];
  onToggleOwner: (ownerKey: string) => void;
  onSelectAll: () => void;
  filteredCount: number;
}

export const ReaderFilterSheet: React.FC<ReaderFilterSheetProps> = ({
  isOpen,
  onClose,
  ownerChoices,
  effectiveOwners,
  onToggleOwner,
  onSelectAll,
  filteredCount,
}) => {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const isAllSelected = effectiveOwners.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-filter-sheet-title"
      data-reader-filter-sheet="true"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md bg-surface rounded-t-2xl sm:rounded-xl border border-edge shadow-2xl px-5 pt-3 pb-5 sm:p-6 pb-safe sm:pb-6 flex flex-col max-h-[82vh]"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />

        <div className="flex items-center justify-between pb-3 border-b border-edge-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-surface-elevated border border-edge text-primary flex items-center justify-center">
              <Icon name="profiles" className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="reader-filter-sheet-title"
                className="font-display text-lg font-semibold text-ink leading-tight"
              >
                Filter by Reader
              </h2>
              <p className="text-[11px] text-ink-muted">
                Select one or more readers
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close reader filter"
            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-2">
          {/* All Readers Option */}
          <button
            type="button"
            data-action="select-all-readers"
            aria-pressed={isAllSelected ? 'true' : 'false'}
            onClick={onSelectAll}
            className={`min-h-[50px] w-full px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-left transition-all active:scale-[0.99] cursor-pointer ${
              isAllSelected
                ? 'border-primary bg-surface-elevated ring-1 ring-primary/30'
                : 'border-edge bg-surface-subtle hover:bg-surface-elevated'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-surface border border-edge text-ink-secondary flex items-center justify-center shrink-0">
                <Icon name="profiles" className="w-4 h-4" />
              </span>
              <div>
                <span className="block text-sm font-semibold text-ink">All Readers</span>
                <span className="block text-[11px] text-ink-muted">
                  Show every book in the collection
                </span>
              </div>
            </div>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                isAllSelected
                  ? 'bg-primary border-primary text-primary-fg'
                  : 'border-edge bg-surface'
              }`}
            >
              {isAllSelected && <Icon name="check" className="w-3.5 h-3.5" />}
            </span>
          </button>

          {/* Individual Readers & Shared (Multi-select) */}
          <div className="space-y-1.5 pt-1">
            {ownerChoices.map((choice) => {
              const active = effectiveOwners.some(
                (o) => o.toLowerCase() === choice.key.toLowerCase()
              );
              const toneClass = AVATAR_TONES[choice.tone] || AVATAR_TONES.teal;

              return (
                <button
                  key={choice.key}
                  type="button"
                  data-action="toggle-reader-sheet-owner"
                  data-owner={choice.key}
                  aria-pressed={active ? 'true' : 'false'}
                  onClick={() => onToggleOwner(choice.key)}
                  className={`min-h-[50px] w-full px-3.5 py-2 rounded-xl border flex items-center justify-between text-left transition-all active:scale-[0.99] cursor-pointer ${
                    active
                      ? 'border-primary bg-surface-elevated ring-1 ring-primary/30'
                      : 'border-edge bg-surface-subtle hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs ${toneClass}`}
                    >
                      {choice.initial}
                    </span>
                    <span className="text-sm font-semibold text-ink truncate">
                      {choice.label}
                    </span>
                  </div>

                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors shrink-0 ${
                      active
                        ? 'bg-primary border-primary text-primary-fg'
                        : 'border-edge bg-surface'
                    }`}
                  >
                    {active && <Icon name="check" className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isAllSelected}
            onClick={onSelectAll}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated disabled:opacity-45 border border-edge text-xs font-semibold text-ink transition-all cursor-pointer"
          >
            All
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold transition-all active:scale-[0.98] cursor-pointer"
          >
            Show <span className="font-mono-tabular">{filteredCount}</span>{' '}
            {filteredCount === 1 ? 'Book' : 'Books'}
          </button>
        </div>
      </div>
    </div>
  );
};
