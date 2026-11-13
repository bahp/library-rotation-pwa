import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import {
  INTERACTIVE_FORMAT_CATEGORIES,
  DEVELOPMENTAL_THEME_CATEGORIES,
  CONCEPT_CATEGORIES,
} from '../../features/llm/llm-client.js';

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
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
          isSelected
            ? 'bg-forest-700 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs'
            : 'bg-linen-100 hover:bg-linen-200 text-forest-900 dark:bg-night-800 dark:hover:bg-night-700 dark:text-slate-200 border border-linen-200 dark:border-night-700'
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
      className="sheet-backdrop fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg sm:max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-ivory dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl overflow-hidden"
      >
        {/* Top bar */}
        <div className="px-5 pt-3.5 pb-2.5 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-forest-50 dark:bg-forest-950/60 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="ai-tag-modal-title" className="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                AI Tagging & Categorization
              </h2>
              <p className="text-[11px] text-stone-ink dark:text-slate-400 truncate max-w-[240px] sm:max-w-sm">
                {book.title} · {book.authors[0] || ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-xl text-stone-ink hover:bg-linen-100 dark:text-slate-300 dark:hover:bg-night-800"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-3 border-forest-200 border-t-forest-700 dark:border-night-700 dark:border-t-[#5ED3DA] animate-spin" />
              <div>
                <p className="text-sm font-semibold text-forest-900 dark:text-white">
                  Querying LLM for Categorized Tags…
                </p>
                <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                  Identifying interactive features, developmental themes, and story topics.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/45 border border-rose-300 dark:border-rose-800 p-4 space-y-2">
              <p className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                <Icon name="close" className="w-4 h-4 text-rose-600" />
                <span>LLM Query Error</span>
              </p>
              <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                {error}
              </p>
              <button
                type="button"
                onClick={() => handleRunQuery(book.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-xs"
              >
                Retry
              </button>
            </div>
          ) : tagResults ? (
            <div className="space-y-4">
              {tagResults.readingLevelHint && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300 block mb-0.5">
                    Suggested Storytime Read-Aloud Hint:
                  </span>
                  <span className="text-emerald-900 dark:text-emerald-200">
                    {tagResults.readingLevelHint}
                  </span>
                </div>
              )}

              {tagResults.interactiveFormats && tagResults.interactiveFormats.length > 0 && (
                <div>
                  <h4 className="font-bold text-forest-900 dark:text-white uppercase tracking-wider text-[11px] mb-2">
                    Interactive & Sensory Formats
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.interactiveFormats.map((t) => renderChip(t, 'format'))}
                  </div>
                </div>
              )}

              {tagResults.developmentalThemes && tagResults.developmentalThemes.length > 0 && (
                <div>
                  <h4 className="font-bold text-forest-900 dark:text-white uppercase tracking-wider text-[11px] mb-2">
                    Developmental Themes & Milestones
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.developmentalThemes.map((t) => renderChip(t, 'theme'))}
                  </div>
                </div>
              )}

              {tagResults.concepts && tagResults.concepts.length > 0 && (
                <div>
                  <h4 className="font-bold text-forest-900 dark:text-white uppercase tracking-wider text-[11px] mb-2">
                    Core Concepts & Subjects
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {tagResults.concepts.map((t) => renderChip(t, 'concept'))}
                  </div>
                </div>
              )}

              {tagResults.freeform && tagResults.freeform.length > 0 && (
                <div>
                  <h4 className="font-bold text-forest-900 dark:text-white uppercase tracking-wider text-[11px] mb-2">
                    Storyline & Specific Topics
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
          <div className="p-4 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-3">
            <span className="text-xs text-stone-ink dark:text-slate-400">
              {selectedTags.size} tags selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl text-stone-600 dark:text-slate-400 hover:bg-linen-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyTags}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-xs"
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
