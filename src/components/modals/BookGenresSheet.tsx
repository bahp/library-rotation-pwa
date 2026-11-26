import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import {
  resolveBookTagOrigin,
  type Book,
  type TagOrigin,
} from '../../types/models.js';

const TAG_ORIGIN_META: Record<
  TagOrigin,
  { icon: string; label: string; badgeTitle: string }
> = {
  provider: {
    icon: 'book',
    label: 'Provider',
    badgeTitle: 'From catalog metadata provider',
  },
  ai: {
    icon: 'sparkles',
    label: 'AI',
    badgeTitle: 'From AI Tag Assistant',
  },
  rules: {
    icon: 'compass',
    label: 'Rules',
    badgeTitle: 'From Quick Rules',
  },
  manual: {
    icon: 'edit',
    label: 'Manual',
    badgeTitle: 'Added manually',
  },
};

const BROWSE_GENRE_OPTIONS = [
  'Fiction',
  'Bedtime',
  'Animals',
  'Nature',
  'Adventure',
  'Fairy Tales',
  'STEM',
  'Space',
  'Dinosaurs',
  'Vehicles',
  'Seasons',
  'Friendship',
  'Feelings',
  'Art & Music',
  'Humor',
  'Mystery & Thriller',
  'Romance',
  'Historical Fiction',
  'Biography & Memoir',
  'History',
  'Poetry',
  'Science',
];

function normalizeTagSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

interface BookGenresSheetProps {
  isOpen: boolean;
  book: Book;
  quickRulesFeedback?: string;
  onClose: () => void;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
  onOpenAiAssistant: () => void;
  onRunQuickRules: () => Promise<void>;
}

export const BookGenresSheet: React.FC<BookGenresSheetProps> = ({
  isOpen,
  book,
  quickRulesFeedback,
  onClose,
  onAddTag,
  onRemoveTag,
  onOpenAiAssistant,
  onRunQuickRules,
}) => {
  const [newTagInput, setNewTagInput] = useState('');
  const [browseSearch, setBrowseSearch] = useState('');
  const [runningRules, setRunningRules] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNewTagInput('');
    setBrowseSearch('');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredGenres = useMemo(() => {
    const q = browseSearch.trim().toLowerCase();
    const combined = Array.from(
      new Set([
        ...BROWSE_GENRE_OPTIONS,
        ...book.tags.map((tag) =>
          tag
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
        ),
      ])
    );
    if (!q) return combined;
    return combined.filter((g) => g.toLowerCase().includes(q));
  }, [browseSearch, book.tags]);

  if (!isOpen) return null;

  const handleAddManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    await onAddTag(trimmed);
    setNewTagInput('');
  };

  const toggleBrowseGenre = async (label: string) => {
    const slug = normalizeTagSlug(label);
    if (!slug) return;
    if (book.tags.includes(slug)) {
      await onRemoveTag(slug);
    } else {
      await onAddTag(slug);
    }
  };

  const handleQuickRulesClick = async () => {
    if (runningRules) return;
    setRunningRules(true);
    try {
      await onRunQuickRules();
    } finally {
      setRunningRules(false);
    }
  };

  return (
    <div
      data-backdrop-action="close-genres-sheet"
      className="fixed inset-0 z-[75] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage genres and topics"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sheet Header */}
        <div className="px-5 pt-4 pb-3 border-b border-edge-subtle flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted inline-flex items-center gap-1.5">
              <Icon name="tag" className="w-3.5 h-3.5 text-primary" />
              <span>Genres &amp; Topics</span>
            </p>
            <h3 className="font-display text-xl font-semibold text-ink mt-1 leading-tight truncate">
              Tag “{book.title}”
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close genres editor"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Smart Tagging Tools */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Tagging Assistants
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                data-action="open-ai-tag-modal"
                onClick={() => {
                  onClose();
                  onOpenAiAssistant();
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5 shrink-0" />
                <span>AI Tag Assistant</span>
              </button>

              <button
                type="button"
                data-action="enrich-book-tags"
                disabled={runningRules}
                onClick={handleQuickRulesClick}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-55"
              >
                <Icon name="compass" className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{runningRules ? 'Running…' : 'Quick Rules'}</span>
              </button>
            </div>

            {quickRulesFeedback && (
              <p className="text-[11px] font-medium text-primary bg-surface-subtle border border-primary/30 rounded-lg px-3 py-1.5">
                {quickRulesFeedback}
              </p>
            )}
          </div>

          {/* Manual Tag Input */}
          <form onSubmit={handleAddManualSubmit} className="space-y-1.5">
            <label
              htmlFor="genres-sheet-new-tag"
              className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
            >
              Add custom topic or genre
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ClearableInput
                  id="genres-sheet-new-tag"
                  value={newTagInput}
                  onValueChange={setNewTagInput}
                  placeholder="e.g. dinosaurs, bilingual, bedtime"
                  className="w-full h-11 pl-3.5 pr-8 rounded-xl bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="submit"
                className="h-11 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Add Tag
              </button>
            </div>
          </form>

          {/* Provider Catalog Categories (read-only metadata separate from curated tags) */}
          {Array.isArray(book.categories) && book.categories.length > 0 && (
            <div className="space-y-2 pb-2 border-b border-edge-subtle">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Catalog Categories ({book.categories.length})
                </p>
                <span className="text-[10px] text-ink-muted">From providers · Tap + to add as tag</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {book.categories.map((cat) => {
                  const slug = normalizeTagSlug(cat);
                  const alreadyTagged = slug ? book.tags.includes(slug) : false;
                  return alreadyTagged ? (
                    <span
                      key={cat}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-surface-subtle/60 border border-edge-subtle text-xs text-ink-secondary inline-flex items-center gap-1.5"
                    >
                      <Icon name="check" className="w-3 h-3 text-primary shrink-0" />
                      <span>{cat}</span>
                    </span>
                  ) : (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => void onAddTag(cat)}
                      title={`Add "${cat}" as a topic tag`}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs text-ink-secondary hover:text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>{cat}</span>
                      <Icon name="plus" className="w-3 h-3 text-primary shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current Applied Tags + Origin Legend */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Current Tags ({book.tags.length})
            </p>
            {book.tags.length > 0 ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  {book.tags.map((tag) => {
                    const origin = resolveBookTagOrigin(book, tag);
                    const meta = TAG_ORIGIN_META[origin];
                    return (
                      <button
                        key={tag}
                        type="button"
                        data-tag-origin={origin}
                        onClick={() => onRemoveTag(tag)}
                        title={`${meta.badgeTitle} — tap to remove "${tag}"`}
                        aria-label={`Remove topic ${tag} (${meta.label})`}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-danger/10 border border-edge text-xs font-medium text-ink hover:text-danger inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Icon name={meta.icon} className="w-3 h-3 opacity-65 shrink-0" />
                        <span>{tag}</span>
                        <span aria-hidden="true" className="opacity-55">
                          ×
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-muted pt-0.5"
                  aria-label="Topic origin legend"
                >
                  {(['provider', 'ai', 'rules', 'manual'] as TagOrigin[]).map((originKey) => {
                    const meta = TAG_ORIGIN_META[originKey];
                    return (
                      <span
                        key={originKey}
                        className="inline-flex items-center gap-1 whitespace-nowrap"
                        title={meta.badgeTitle}
                      >
                        <Icon name={meta.icon} className="w-2.5 h-2.5 opacity-75" />
                        <span>{meta.label}</span>
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-muted italic">
                No tags yet. Use AI Tag Assistant, Quick Rules, or pick from the catalog below.
              </p>
            )}
          </div>

          {/* Browse Popular & All Genres */}
          <div className="space-y-2.5 pt-2 border-t border-edge-subtle">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Browse Genres &amp; Themes
            </p>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted">
                <Icon name="search" className="w-4 h-4" />
              </span>
              <ClearableInput
                id="genres-sheet-browse-search"
                value={browseSearch}
                onValueChange={setBrowseSearch}
                placeholder="Filter genres…"
                className="w-full h-10 pl-10 pr-8 rounded-xl bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filteredGenres.map((label) => {
                const active = book.tags.includes(normalizeTagSlug(label));
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleBrowseGenre(label)}
                    aria-pressed={active}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      active
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-surface-subtle/75 border-edge text-ink hover:border-primary/40'
                    }`}
                  >
                    <span className="truncate">{label}</span>
                    {active && <Icon name="check" className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
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
