import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import type { BookFormat, CollectionStatus, ReadingStage } from '../../types/models.js';

export const ManualBookEntryModal: React.FC = () => {
  const { manualAddModal, closeManualAddModal, activeProfile, store } = useApp();
  const isOpen = manualAddModal.isOpen;
  useBodyScrollLock(isOpen);

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [isbn, setIsbn] = useState('');
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus>('owned');
  const [format, setFormat] = useState<BookFormat>('hardcover');
  const [stage, setStage] = useState<ReadingStage>('picture-book');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [year, setYear] = useState('');
  const [pages, setPages] = useState('');
  const [tags, setTags] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(manualAddModal.prefill?.title || '');
    setAuthors(manualAddModal.prefill?.authors || '');
    setIsbn(manualAddModal.prefill?.isbn || '');
    setCollectionStatus('owned');
    setFormat('hardcover');
    setStage('picture-book');
    setAgeMin('');
    setAgeMax('');
    setYear('');
    setPages('');
    setTags('');
    setDescription('');
    setNotes('');
    setError('');
    setIsSaving(false);
  }, [isOpen, manualAddModal.prefill]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeManualAddModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeManualAddModal]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Book title is required.');
      return;
    }

    setIsSaving(true);
    try {
      const parsedAuthors = authors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const parsedTags = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const parsedAgeMin = ageMin.trim() ? Number(ageMin.trim()) : undefined;
      const parsedAgeMax = ageMax.trim()
        ? Number(ageMax.trim())
        : parsedAgeMin !== undefined
          ? 99
          : undefined;

      await store.addManualBook({
        title: title.trim(),
        authors: parsedAuthors.length > 0 ? parsedAuthors : ['Unknown Author'],
        isbn: isbn.trim() || undefined,
        publishedYear: year ? Number(year) : undefined,
        pageCount: pages ? Number(pages) : undefined,
        format,
        readingStage: stage,
        ...(parsedAgeMin !== undefined && Number.isFinite(parsedAgeMin)
          ? { ageMin: parsedAgeMin }
          : {}),
        ...(parsedAgeMax !== undefined && Number.isFinite(parsedAgeMax)
          ? { ageMax: parsedAgeMax }
          : {}),
        tags: parsedTags,
        collectionStatus,
        owners: activeProfile ? [activeProfile.id, 'shared'] : ['shared'],
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      store.notify(
        collectionStatus === 'wishlist'
          ? `Added "${title.trim()}" to Wishlist.`
          : collectionStatus === 'interested'
            ? `Saved "${title.trim()}" to Suggestions.`
            : `Saved "${title.trim()}" to your library!`,
        'success'
      );
      closeManualAddModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-book-entry-title"
      className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={closeManualAddModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full sm:max-w-lg max-h-[90vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-edge shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Sticky Top Header with Drag Handle */}
        <div className="shrink-0 bg-surface/95 backdrop-blur-sm px-5 pt-2.5 pb-3 border-b border-edge-subtle">
          <div className="sm:hidden w-10 h-1.5 rounded-full bg-edge mx-auto mb-2.5" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon name="edit" className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2
                  id="manual-book-entry-title"
                  className="font-display text-lg font-semibold text-ink leading-tight truncate"
                >
                  Add Book Details
                </h2>
                <p className="text-xs text-ink-secondary truncate">
                  Enter title, author, and shelf details manually
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeManualAddModal}
              aria-label="Close manual book entry"
              className="min-h-[40px] min-w-[40px] rounded-full bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Icon name="close" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 text-xs">
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger font-medium"
            >
              {error}
            </p>
          )}

          {/* Owned vs Wishlist vs Suggestions Toggle */}
          <div>
            <span className="block font-semibold text-ink-secondary mb-1.5">Collection</span>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-surface-subtle border border-edge">
              <button
                type="button"
                onClick={() => setCollectionStatus('owned')}
                className={`min-h-[38px] rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                  collectionStatus === 'owned'
                    ? 'bg-surface text-ink shadow-xs border border-edge-subtle'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Owned
              </button>
              <button
                type="button"
                onClick={() => setCollectionStatus('wishlist')}
                className={`min-h-[38px] rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                  collectionStatus === 'wishlist'
                    ? 'bg-surface text-ink shadow-xs border border-edge-subtle'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Wishlist
              </button>
              <button
                type="button"
                onClick={() => setCollectionStatus('interested')}
                className={`min-h-[38px] rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                  collectionStatus === 'interested'
                    ? 'bg-surface text-ink shadow-xs border border-edge-subtle'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                Suggestions
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="manual-modal-title" className="block font-semibold text-ink-secondary mb-1">
                Book Title *
              </label>
              <input
                id="manual-modal-title"
                type="text"
                required
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Where the Wild Things Are"
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="manual-modal-authors" className="block font-semibold text-ink-secondary mb-1">
                Authors (comma-separated)
              </label>
              <input
                id="manual-modal-authors"
                type="text"
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="e.g. Maurice Sendak"
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="manual-modal-isbn" className="block font-semibold text-ink-secondary mb-1">
                ISBN (Optional)
              </label>
              <input
                id="manual-modal-isbn"
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                placeholder="978…"
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-mono text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="manual-modal-format" className="block font-semibold text-ink-secondary mb-1">
                Format
              </label>
              <select
                id="manual-modal-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as BookFormat)}
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold text-base sm:text-xs text-ink focus:outline-none focus:border-primary"
              >
                <option value="hardcover">Hardcover</option>
                <option value="board-book">Board Book</option>
                <option value="paperback">Paperback</option>
              </select>
            </div>

            <div>
              <label htmlFor="manual-modal-stage" className="block font-semibold text-ink-secondary mb-1">
                Reading Stage
              </label>
              <select
                id="manual-modal-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value as ReadingStage)}
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge font-semibold text-base sm:text-xs text-ink focus:outline-none focus:border-primary"
              >
                <option value="board-toddler">Board Book (0–3)</option>
                <option value="picture-book">Picture Book (3–6)</option>
                <option value="early-reader">Early Reader (5–8)</option>
                <option value="chapter-book">Chapter Book (7–12)</option>
                <option value="middle-grade">Middle Grade (9–12)</option>
                <option value="teen-ya">Teen / YA (13–17)</option>
                <option value="adult">Adult Reader (18+)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="manual-modal-age-min" className="block font-semibold text-ink-secondary mb-1">
                  Min Age (Opt.)
                </label>
                <input
                  id="manual-modal-age-min"
                  type="number"
                  min={0}
                  max={120}
                  placeholder="e.g. 3"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="manual-modal-age-max" className="block font-semibold text-ink-secondary mb-1">
                  Max Age (Opt.)
                </label>
                <input
                  id="manual-modal-age-max"
                  type="number"
                  min={0}
                  max={120}
                  placeholder="e.g. 7"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label htmlFor="manual-modal-year" className="block font-semibold text-ink-secondary mb-1">
                Published Year
              </label>
              <input
                id="manual-modal-year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="e.g. 2021"
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="manual-modal-pages" className="block font-semibold text-ink-secondary mb-1">
                Page Count
              </label>
              <input
                id="manual-modal-pages"
                type="number"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                placeholder="e.g. 32"
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="manual-modal-tags" className="block font-semibold text-ink-secondary mb-1">
                Tags (comma-separated)
              </label>
              <input
                id="manual-modal-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. bedtime, animals, rhyming"
                className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="manual-modal-description" className="block font-semibold text-ink-secondary mb-1">
                Synopsis / Description (Optional)
              </label>
              <textarea
                id="manual-modal-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief story blurb or what this book is about…"
                className="w-full p-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary resize-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="manual-modal-notes" className="block font-semibold text-ink-secondary mb-1">
                Notes (Optional)
              </label>
              <textarea
                id="manual-modal-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Shelf location, gift giver, or reading notes…"
                className="w-full p-3 rounded-lg bg-surface-subtle border border-edge text-base sm:text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary resize-none"
              />
            </div>
          </div>

          <div className="pt-1 pb-safe flex items-center gap-2.5">
            <button
              type="button"
              onClick={closeManualAddModal}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-fg font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Icon name="plus" className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Saving…'
                  : collectionStatus === 'wishlist'
                    ? 'Save to Wishlist'
                    : 'Save Book to Library'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
