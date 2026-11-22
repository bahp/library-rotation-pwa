import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { compressImageFileToDataUrl } from '../../features/catalog/cover-image-utils.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { CoverGridSkeleton } from '../common/SkeletonLoaders.js';

interface CoverStudioModalProps {
  bookId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CoverCandidate {
  title: string;
  author: string;
  coverUrl: string;
  source: string;
}

export const CoverStudioModal: React.FC<CoverStudioModalProps> = ({
  bookId,
  isOpen,
  onClose,
}) => {
  const { state, store, catalogService } = useApp();
  const book = state.books.find((b) => b.id === bookId);

  const [query, setQuery] = useState(
    book ? `${book.title} ${book.authors[0] || ''}`.trim() : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<CoverCandidate[]>([]);
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    if (isOpen && book) {
      setQuery(`${book.title} ${book.authors[0] || ''}`.trim());
      setResults([]);
      setError('');
      setCustomUrl('');
    }
  }, [isOpen, bookId]);

  useBodyScrollLock(isOpen && Boolean(book));

  if (!isOpen || !book) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const effectiveQuery = query.trim() || `${book.title} ${book.authors[0] || ''}`.trim();
    if (!effectiveQuery) {
      setError('Please enter a search query.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await catalogService.searchBooks(
        { query: effectiveQuery },
        {
          retainRaw: false,
          enabledProviderIds: state.settings.enabledMetadataProviders,
          limit: 10,
        }
      );

      const seenUrls = new Set<string>();
      const covers: CoverCandidate[] = [];

      for (const cand of response.candidates) {
        if (!cand.coverUrl || seenUrls.has(cand.coverUrl)) continue;
        seenUrls.add(cand.coverUrl);
        covers.push({
          title: cand.title,
          author: cand.authors[0] || '',
          coverUrl: cand.coverUrl,
          source:
            cand.sources[0]?.provider === 'open-library' ? 'Open Library' : 'Google Books',
        });
        if (covers.length >= 8) break;
      }

      setResults(covers);
      if (covers.length === 0) {
        setError('No cover images found. Try a different query or upload a photo.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCover = async (coverUrl: string) => {
    try {
      await store.updateBook(book.id, { coverUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const dataUrl = await compressImageFileToDataUrl(file);
      await store.updateBook(book.id, { coverUrl: dataUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCustomUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim()) return;
    await handleSelectCover(customUrl.trim());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-studio-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl sm:max-w-2xl bg-surface rounded-t-2xl sm:rounded-xl border border-edge shadow-2xl px-5 pt-3 pb-5 sm:p-6 my-auto max-h-[90vh] flex flex-col pb-safe sm:pb-6"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mb-3 shrink-0 sm:hidden" />
        <div className="flex items-center justify-between pb-3 border-b border-edge-subtle">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-surface-subtle border border-edge-subtle text-primary dark:text-accent flex items-center justify-center">
              <Icon name="photo" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="cover-studio-title" className="font-display text-lg font-semibold text-ink">
                Cover Art Studio
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Update cover for “{book.title}”
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close cover studio"
            className="min-h-[48px] min-w-[48px] sm:min-h-0 sm:min-w-0 p-2 sm:p-1.5 rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-all active:scale-95 flex items-center justify-center"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Upload or Custom URL options */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <label className="min-h-[48px] sm:min-h-0 cursor-pointer px-3.5 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated text-ink text-xs font-semibold inline-flex items-center justify-center sm:justify-start gap-2 transition-all active:scale-[0.98] border border-edge shrink-0">
            <Icon name="camera" className="w-4 h-4 text-primary dark:text-accent" />
            <span>Upload Photo / Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          <form onSubmit={handleCustomUrlSubmit} className="flex-1 flex items-center gap-2">
            <input
              type="url"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Or paste cover image URL…"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-subtle border border-edge text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {customUrl.trim() && (
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-surface-elevated hover:bg-edge/40 border border-edge text-ink text-xs font-semibold shrink-0"
              >
                Use URL
              </button>
            )}
          </form>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="pt-3">
          <div className="flex gap-2">
            <ClearableInput
              id="inspector-cover-search-input"
              value={query}
              onValueChange={setQuery}
              placeholder="Search Google & Open Library for covers…"
              className="px-3.5 py-2.5 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={loading}
              className="min-h-[48px] sm:min-h-0 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shrink-0 flex items-center gap-1.5 active:scale-[0.98] transition-all disabled:opacity-55"
            >
              <Icon name="search" className="w-3.5 h-3.5" />
              <span>{loading ? 'Searching…' : 'Find'}</span>
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-2 text-xs text-danger font-medium">
            {error}
          </p>
        )}

        {/* Search Results */}
        <div className="overflow-y-auto flex-1 py-4">
          {loading ? (
            <CoverGridSkeleton count={8} />
          ) : results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {results.map((res, i) => (
                <div
                  key={`${res.coverUrl}-${i}`}
                  onClick={() => handleSelectCover(res.coverUrl)}
                  className="group cursor-pointer rounded-xl overflow-hidden border border-edge bg-surface-subtle hover:ring-2 hover:ring-primary transition-all active:scale-[0.98] flex flex-col p-1.5"
                >
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-1.5 bg-surface-elevated">
                    <img
                      src={res.coverUrl}
                      alt={res.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <span className="text-[10px] text-ink-secondary truncate block">
                    {res.source}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-ink-secondary text-xs">
              Search above to find jacket artwork across Google Books and Open Library.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
