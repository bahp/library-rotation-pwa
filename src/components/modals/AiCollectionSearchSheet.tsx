import React, { useState } from 'react';
import { Icon } from '../common/Icon.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

interface AiCollectionSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
  householdName?: string;
}

const EXAMPLE_PROMPTS = [
  'Cozy bedtime stories with animals for ages 3–5',
  'Books about space or trains we have not rotated lately',
  'Read-aloud stories similar to our loved favorites',
  'Short illustrated books for early readers',
];

export const AiCollectionSearchSheet: React.FC<AiCollectionSearchSheetProps> = ({
  isOpen,
  onClose,
  householdName,
}) => {
  useBodyScrollLock(isOpen);

  const [prompt, setPrompt] = useState('');
  const [includeMyCollection, setIncludeMyCollection] = useState(true);
  const [includeReadingHistory, setIncludeReadingHistory] = useState(true);
  const [previewNotice, setPreviewNotice] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewNotice(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-collection-search-title"
      data-ai-search-sheet="true"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md bg-surface rounded-t-2xl sm:rounded-xl border border-edge shadow-2xl px-5 pt-3 pb-5 sm:p-6 pb-safe sm:pb-6 flex flex-col max-h-[85vh]"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-edge-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-surface-elevated border border-edge text-accent flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4" />
            </span>
            <div className="text-left">
              <h2
                id="ai-collection-search-title"
                className="font-display text-lg font-semibold text-ink leading-tight"
              >
                AI Book Search
              </h2>
              <p className="text-[11px] text-ink-muted">
                Find books by theme, mood, age, or reading habits
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI search"
            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg text-ink-muted hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pt-4 space-y-4 text-left">
          <div>
            <label
              htmlFor="ai-collection-prompt"
              className="block text-xs font-semibold text-ink mb-1.5"
            >
              What kind of books are you looking for?
            </label>
            <textarea
              id="ai-collection-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (previewNotice) setPreviewNotice(false);
              }}
              placeholder="e.g. Find books about kindness, seasons, or trains for a 4-year-old…"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-edge text-base sm:text-sm text-ink placeholder:text-ink-muted focus:bg-surface focus:outline-none focus:border-primary resize-none transition-colors"
            />
          </div>

          {/* Starter Prompt Suggestions */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setPrompt(example);
                  if (previewNotice) setPreviewNotice(false);
                }}
                className="px-3 py-1.5 rounded-full bg-surface-subtle hover:bg-surface-elevated border border-edge text-[11px] font-medium text-ink-secondary hover:text-ink text-left transition-colors cursor-pointer"
              >
                {example}
              </button>
            ))}
          </div>

          {/* Slide Toggle Options */}
          <div className="rounded-xl bg-surface-subtle border border-edge divide-y divide-edge-subtle">
            <div className="px-3.5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-ink">
                  Include my collection
                </span>
                <span className="block text-[11px] text-ink-muted">
                  {householdName
                    ? `Search within ${householdName} shelves first`
                    : 'Search books you already own and saved'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeMyCollection}
                aria-label="Include my collection"
                onClick={() => setIncludeMyCollection((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  includeMyCollection ? 'bg-primary' : 'bg-edge'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-surface shadow-xs transition-transform ${
                    includeMyCollection ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="px-3.5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-semibold text-ink">
                  Use reader ages &amp; favorites
                </span>
                <span className="block text-[11px] text-ink-muted">
                  Tailor matches using reader stages and loved titles
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeReadingHistory}
                aria-label="Use reader ages and favorites"
                onClick={() => setIncludeReadingHistory((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  includeReadingHistory ? 'bg-primary' : 'bg-edge'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-surface shadow-xs transition-transform ${
                    includeReadingHistory ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {previewNotice && (
            <p
              role="status"
              className="rounded-xl bg-surface-elevated border border-edge px-3.5 py-2.5 text-xs text-ink-secondary"
            >
              AI search interface ready — connect an AI provider in Settings when you want to run semantic queries.
            </p>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-between gap-2.5">
            <button
              type="button"
              disabled={!prompt}
              onClick={() => {
                setPrompt('');
                setPreviewNotice(false);
              }}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated disabled:opacity-45 border border-edge text-xs font-semibold text-ink transition-all cursor-pointer"
            >
              Clear
            </button>

            <button
              type="submit"
              className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Icon name="sparkles" className="w-4 h-4" />
              <span>Find Books</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
