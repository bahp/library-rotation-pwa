import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { CoverGridSkeleton } from '../common/SkeletonLoaders.js';
import { BookCover } from '../common/BookCover.js';
import { compressImageFileToDataUrl } from '../../features/catalog/cover-image-utils.js';
import type { Book, CoverAspectRatio } from '../../types/models.js';

interface CoverSearchResult {
  title: string;
  author: string;
  coverUrl: string;
  source: string;
}

interface BookCoverStudioSheetProps {
  isOpen: boolean;
  book: Book;
  coverAspectRatio?: CoverAspectRatio;
  enabledMetadataProviders?: string[];
  catalogService: {
    searchBooks: (
      params: { query: string },
      opts: { retainRaw: boolean; enabledProviderIds?: string[]; limit: number }
    ) => Promise<{
      candidates: Array<{
        title: string;
        authors: string[];
        coverUrl?: string;
        sources: Array<{ provider?: string }>;
      }>;
    }>;
  };
  onSelectCover: (coverUrl: string) => Promise<void>;
  onClearCover: () => Promise<void>;
  onClose: () => void;
  onNotify?: (message: string, tone: 'info' | 'success' | 'error') => void;
}

export const BookCoverStudioSheet: React.FC<BookCoverStudioSheetProps> = ({
  isOpen,
  book,
  coverAspectRatio = 'square',
  enabledMetadataProviders,
  catalogService,
  onSelectCover,
  onClearCover,
  onClose,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<CoverSearchResult[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery(`${book.title} ${book.authors[0] || ''}`.trim());
    setCustomUrlInput(
      book.coverUrl && /^https?:\/\//i.test(book.coverUrl) ? book.coverUrl : ''
    );
    setError('');
    setResults([]);
    setLoading(false);
  }, [isOpen, book.id, book.title, book.authors, book.coverUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCoverSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchQuery.trim() || `${book.title} ${book.authors[0] || ''}`.trim();
    if (!q) return;

    setLoading(true);
    setError('');

    try {
      const res = await catalogService.searchBooks(
        { query: q },
        {
          retainRaw: false,
          enabledProviderIds: enabledMetadataProviders,
          limit: 10,
        }
      );

      const seen = new Set<string>();
      const next: CoverSearchResult[] = [];

      for (const cand of res.candidates) {
        if (!cand.coverUrl || seen.has(cand.coverUrl)) continue;
        seen.add(cand.coverUrl);
        next.push({
          title: cand.title,
          author: cand.authors[0] || '',
          coverUrl: cand.coverUrl,
          source: cand.sources[0]?.provider === 'open-library' ? 'Open Library' : 'Google Books',
        });
        if (next.length >= 8) break;
      }

      setResults(next);
      if (next.length === 0) {
        setError('No cover images found. Try different keywords.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      await onSelectCover(dataUrl);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onNotify?.(msg, 'error');
    }
  };

  const handleApplyCustomUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customUrlInput.trim();
    if (!trimmed) {
      await onClearCover();
      onClose();
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Enter an HTTPS or HTTP image URL.');
      return;
    }
    await onSelectCover(trimmed);
    onClose();
  };

  return (
    <div
      data-cover-studio-sheet="true"
      className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cover Studio"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sheet Header */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 rounded-lg overflow-hidden shadow-md ring-1 ring-black/10 dark:ring-white/10">
              <BookCover book={book} size="sm" aspectRatio={coverAspectRatio} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Cover Studio
              </p>
              <h3 className="font-display text-xl font-semibold text-ink mt-0.5 leading-tight truncate">
                Choose a book cover
              </h3>
              <p className="text-xs text-ink-secondary truncate mt-0.5">{book.title}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close cover studio"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          {/* Quick Camera / Phone Library Upload */}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="min-h-[46px] px-3 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
              <Icon name="photo" className="w-4 h-4" />
              <span>From Phone</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>

            <label className="min-h-[46px] px-3 py-2 rounded-xl bg-primary hover:bg-primary-hover text-xs font-semibold text-primary-fg inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
              <Icon name="camera" className="w-4 h-4" />
              <span>Take Picture</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
          </div>

          {/* Search Catalog Covers */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Search Catalog Covers
            </p>
            <form onSubmit={handleCoverSearch} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ClearableInput
                  id="inspector-cover-search-input"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  placeholder="Search Google Books / Open Library…"
                  className="w-full h-11 pl-3.5 pr-9 rounded-xl bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-11 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-55 text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Icon name="search" className="w-3.5 h-3.5" />
                <span>{loading ? 'Searching…' : 'Search'}</span>
              </button>
            </form>

            {error && (
              <p role="alert" className="text-xs text-[#8C4A4F] dark:text-[#C48A8E]">
                {error}
              </p>
            )}

            {loading ? (
              <div className="pt-1">
                <CoverGridSkeleton count={4} />
              </div>
            ) : (
              results.length > 0 && (
                <div className="grid grid-cols-4 gap-2 pt-0.5">
                  {results.map((res, i) => (
                    <button
                      key={`${res.coverUrl}-${i}`}
                      type="button"
                      onClick={async () => {
                        await onSelectCover(res.coverUrl);
                        onClose();
                      }}
                      className="group flex flex-col items-center text-left rounded-xl p-1.5 bg-surface-subtle hover:bg-surface-elevated border border-edge transition-transform active:scale-95 cursor-pointer"
                    >
                      <div className="w-full aspect-[3/4] rounded-lg overflow-hidden bg-surface-elevated shadow-sm">
                        <img
                          src={res.coverUrl}
                          alt={res.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="mt-1 text-[10px] text-ink-secondary truncate w-full text-center">
                        {res.source}
                      </span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Direct HTTPS Image URL + Cloth Cover Reset */}
          <form onSubmit={handleApplyCustomUrl} className="pt-2 border-t border-edge-subtle space-y-2">
            <label
              htmlFor="cover-studio-url-input"
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
            >
              Or Paste Cover URL
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ClearableInput
                  id="cover-studio-url-input"
                  value={customUrlInput}
                  onValueChange={setCustomUrlInput}
                  placeholder="https://covers.openlibrary.org/..."
                  className="w-full h-10 pl-3 pr-8 rounded-xl bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="submit"
                className="h-10 px-3.5 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink whitespace-nowrap cursor-pointer"
              >
                Use URL
              </button>
            </div>
          </form>

          {book.coverUrl && (
            <div className="pt-1 flex justify-between items-center">
              <button
                type="button"
                data-action="clear-book-cover"
                onClick={async () => {
                  await onClearCover();
                  onClose();
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#8C4A4F] dark:text-[#C48A8E] hover:bg-[#8C4A4F]/10 transition-colors cursor-pointer"
              >
                Reset to Cloth Cover
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-surface-subtle border border-edge text-xs font-semibold text-ink cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
