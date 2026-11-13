import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { compressImageFileToDataUrl } from '../../features/catalog/cover-image-utils.js';

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
      className="sheet-backdrop fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-xl bg-ivory dark:bg-night-900 rounded-t-3xl sm:rounded-2xl border border-linen-200 dark:border-night-700 shadow-2xl p-5 sm:p-6 my-auto max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center font-bold">
              <Icon name="photo" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="cover-studio-title" className="font-display text-lg font-bold text-forest-900 dark:text-white">
                Cover Art Studio
              </h2>
              <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
                Update cover for “{book.title}”
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close cover studio"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-linen-100 dark:hover:bg-night-800 transition-colors"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Upload or Custom URL options */}
        <div className="pt-4 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer px-3 py-2 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-800 dark:text-white text-xs font-semibold flex items-center gap-2 transition-colors border border-linen-200 dark:border-night-700">
            <Icon name="camera" className="w-4 h-4 text-forest-700 dark:text-[#5ED3DA]" />
            <span>Upload Photo / Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="pt-3">
          <div className="flex gap-2">
            <ClearableInput
              id="inspector-cover-search-input"
              value={query}
              onValueChange={setQuery}
              placeholder="Search Google & Open Library for covers…"
              className="px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shrink-0 flex items-center gap-1.5"
            >
              <Icon name="search" className="w-3.5 h-3.5" />
              <span>{loading ? 'Searching…' : 'Find'}</span>
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
            {error}
          </p>
        )}

        {/* Search Results */}
        <div className="overflow-y-auto flex-1 py-4">
          {results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {results.map((res, i) => (
                <div
                  key={`${res.coverUrl}-${i}`}
                  onClick={() => handleSelectCover(res.coverUrl)}
                  className="group cursor-pointer rounded-xl overflow-hidden border border-linen-200 dark:border-night-700 bg-white dark:bg-night-800 hover:ring-2 hover:ring-forest-700 dark:hover:ring-[#5ED3DA] transition-all flex flex-col p-1.5"
                >
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-1.5 bg-linen-100 dark:bg-night-900">
                    <img
                      src={res.coverUrl}
                      alt={res.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <span className="text-[10px] text-stone-500 truncate block">
                    {res.source}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            !loading && (
              <div className="py-8 text-center text-stone-ink dark:text-slate-400 text-xs">
                Search above to find jacket artwork across Google Books and Open Library.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
