import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import {
  INTERACTIVE_FORMAT_CATEGORIES,
  DEVELOPMENTAL_THEME_CATEGORIES,
  CONCEPT_CATEGORIES,
} from '../../features/llm/llm-client.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { AiTagsSkeleton } from '../common/SkeletonLoaders.js';

interface AiTaggingModalProps {
  bookId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AiTaggingModal: React.FC<AiTaggingModalProps> = ({ bookId, isOpen, onClose }) => {
  const { state, store } = useApp();
  const book = state.books.find((b) => b.id === bookId);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tagResults, setTagResults] = useState<{
    interactiveFormats?: string[];
    developmentalThemes?: string[];
    concepts?: string[];
    freeform?: string[];
    allTags?: string[];
    readingStage?: string;
    readingLevelHint?: string;
  } | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && bookId) {
      handleRunQuery(bookId);
    } else {
      setTagResults(null);
      setSelectedTags(new Set());
      setError('');
    }
  }, [isOpen, bookId]);

  useBodyScrollLock(isOpen && Boolean(book));

  if (!isOpen || !book) return null;

  const handleRunQuery = async (id: string) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await store.queryCategorizedTagsForBook(id);
      setTagResults(res);
      setSelectedTags(new Set(res.allTags || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const handleApplyTags = async () => {
    try {
      const tagsToSave = Array.from(selectedTags);
      await store.applyLlmTagsToBook(book.id, {
        tags: tagsToSave,
        readingStage: (tagResults?.readingStage as any) || undefined,
        readingLevelHint: tagResults?.readingLevelHint || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatLabels = new Map(INTERACTIVE_FORMAT_CATEGORIES.map((c) => [c.id, c.label]));
  const themeLabels = new Map(DEVELOPMENTAL_THEME_CATEGORIES.map((c) => [c.id, c.label]));
  const conceptLabels = new Map(CONCEPT_CATEGORIES.map((c) => [c.id, c.label]));

  const renderChip = (tag: string, cat: 'format' | 'theme' | 'concept' | 'freeform') => {
    const isSelected = selectedTags.has(tag);
    let label = tag;
    if (cat === 'format') label = formatLabels.get(tag) || tag;
    else if (cat === 'theme') label = themeLabels.get(tag) || tag;
    else if (cat === 'concept') label = conceptLabels.get(tag) || tag;

    return (
      <button
        key={tag}
        type="button"
        onClick={() => handleToggleTag(tag)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
          isSelected
            ? 'bg-primary text-primary-fg shadow-2xs'
            : 'bg-surface-subtle hover:bg-surface-elevated text-ink border border-edge'
        }`}
      >
        <span>{label}</span>
        <span className="text-[10px] opacity-75">{isSelected ? '✓' : '+'}</span>
      </button>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-tag-modal-title"
      className="sheet-backdrop fixed inset-0 z-[70] bg-[#142321]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden" />
        {/* Top bar */}
        <div className="px-5 pt-3.5 pb-2.5 border-b border-edge-subtle flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="ai-tag-modal-title" className="font-display text-lg font-semibold text-ink">
                AI Tagging &amp; Categorization
              </h2>
              <p className="text-[11px] text-ink-secondary truncate max-w-[240px] sm:max-w-sm">
                {book.title} · {book.authors[0] || ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="space-y-2 py-2">
              <div className="px-1">
                <p className="text-xs font-semibold text-ink">
                  Querying LLM for Categorized Tags…
                </p>
                <p className="text-[11px] text-ink-secondary mt-0.5">
                  Identifying interactive features, developmental themes, and story topics.
                </p>
              </div>
              <AiTagsSkeleton />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-[#8C4A4F]/10 border border-[#8C4A4F]/35 p-4 space-y-2">
              <p className="font-semibold text-[#8C4A4F] dark:text-[#C48A8E] flex items-center gap-1.5">
                <Icon name="close" className="w-4 h-4" />
                <span>LLM Query Error</span>
              </p>
              <p className="text-xs text-ink-secondary leading-relaxed">
                {error}
              </p>
              <button
                type="button"
                onClick={() => handleRunQuery(book.id)}
                className="px-3 py-1.5 rounded-lg bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] font-semibold text-xs cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : tagResults ? (
            <div className="space-y-4">
              {tagResults.readingLevelHint && (
                <div className="p-3 rounded-lg bg-secondary/12 border border-secondary/35">
                  <span className="font-semibold text-primary block mb-0.5">
                    Suggested Storytime Read-Aloud Hint:
                  </span>
                  <span className="text-ink-secondary">
                    {tagResults.readingLevelHint}
                  </span>
                </div>
              )}

              {tagResults.interactiveFormats && tagResults.interactiveFormats.length > 0 && (
                <div>
                  <h4 className="font-semibold text-ink-muted uppercase tracking-[0.08em] text-[11px] mb-2">
                    Interactive &amp; Sensory Formats
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.interactiveFormats.map((t) => renderChip(t, 'format'))}
                  </div>
                </div>
              )}

              {tagResults.developmentalThemes && tagResults.developmentalThemes.length > 0 && (
                <div>
                  <h4 className="font-semibold text-ink-muted uppercase tracking-[0.08em] text-[11px] mb-2">
                    Developmental Themes &amp; Milestones
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.developmentalThemes.map((t) => renderChip(t, 'theme'))}
                  </div>
                </div>
              )}

              {tagResults.concepts && tagResults.concepts.length > 0 && (
                <div>
                  <h4 className="font-semibold text-ink-muted uppercase tracking-[0.08em] text-[11px] mb-2">
                    Core Concepts &amp; Subjects
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.concepts.map((t) => renderChip(t, 'concept'))}
                  </div>
                </div>
              )}

              {tagResults.freeform && tagResults.freeform.length > 0 && (
                <div>
                  <h4 className="font-semibold text-ink-muted uppercase tracking-[0.08em] text-[11px] mb-2">
                    Storyline &amp; Specific Topics
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.freeform.map((t) => renderChip(t, 'freeform'))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {tagResults && (
          <div className="p-4 border-t border-edge-subtle flex items-center justify-between gap-3">
            <span className="text-xs font-mono-tabular text-ink-secondary">
              {selectedTags.size} tags selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 text-xs font-semibold rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle active:scale-[0.98] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyTags}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-hover text-primary-fg shadow-xs active:scale-[0.98] transition-all cursor-pointer"
              >
                Save Selected Tags
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
