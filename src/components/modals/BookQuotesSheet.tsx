import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { compressImageFileToDataUrl } from '../../features/catalog/cover-image-utils.js';
import { computeOwnerInitials, type BookNote, type ChildProfile } from '../../types/models.js';

interface BookQuotesSheetProps {
  isOpen: boolean;
  editingNote: BookNote | null;
  profiles: ChildProfile[];
  defaultAuthorId?: string;
  onClose: () => void;
  onSave: (payload: {
    text: string;
    imageDataUrl?: string;
    authorProfileId?: string;
    forProfileId?: string;
  }) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
}

export const BookQuotesSheet: React.FC<BookQuotesSheetProps> = ({
  isOpen,
  editingNote,
  profiles,
  defaultAuthorId = '',
  onClose,
  onSave,
  onDelete,
}) => {
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [authorProfileId, setAuthorProfileId] = useState(defaultAuthorId);
  const [forProfileId, setForProfileId] = useState('');
  const [saving, setSaving] = useState(false);
  const [compressingPhoto, setCompressingPhoto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSaving(false);
    setCompressingPhoto(false);
    setConfirmDelete(false);
    if (editingNote) {
      setText(editingNote.text || '');
      setImageDataUrl(editingNote.imageDataUrl || '');
      setAuthorProfileId(editingNote.authorProfileId || '');
      setForProfileId(editingNote.forProfileId || '');
    } else {
      setText('');
      setImageDataUrl('');
      setAuthorProfileId(defaultAuthorId);
      setForProfileId('');
    }
  }, [isOpen, editingNote, defaultAuthorId]);

  if (!isOpen) return null;

  const isEditing = Boolean(editingNote);
  const selectedAuthor = profiles.find((p) => p.id === authorProfileId);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCompressingPhoto(true);
    setError('');
    try {
      const compressed = await compressImageFileToDataUrl(file, {
        maxDimension: 640,
        quality: 0.78,
      });
      setImageDataUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach image.');
    } finally {
      setCompressingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !imageDataUrl) {
      setError('Write a quote, reading note, or attach a photo before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        text: text.trim(),
        imageDataUrl: editingNote ? imageDataUrl : imageDataUrl || undefined,
        authorProfileId: editingNote ? authorProfileId : authorProfileId || undefined,
        forProfileId: editingNote ? forProfileId : forProfileId || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!editingNote || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(editingNote.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div
      data-backdrop-action="close-quote-sheet"
      className="fixed inset-0 z-[75] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Edit quote or note' : 'Add quote or note'}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sheet Header */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted inline-flex items-center gap-1.5">
              <Icon name="quote" className="w-3.5 h-3.5 text-primary" />
              <span>Quotes &amp; Notes</span>
            </p>
            <h3 className="font-display text-2xl font-semibold text-ink mt-1 leading-tight">
              {isEditing ? 'Edit reading note' : 'Save a favorite quote or note'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close note sheet"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 pb-5 pt-2 space-y-4">
          {error && (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="quote-sheet-textarea"
              className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5"
            >
              Quote or family memory
            </label>
            <textarea
              id="quote-sheet-textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a favorite line, bedtime reaction, or reading milestone…"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted leading-relaxed focus:outline-none focus:border-primary"
            />
          </div>

          {/* Optional Compressed Photo Attachment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Photo / Drawing (Optional)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                {imageDataUrl && (
                  <button
                    type="button"
                    onClick={() => setImageDataUrl('')}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold text-danger hover:bg-danger/10 cursor-pointer"
                  >
                    Remove photo
                  </button>
                )}
                <button
                  type="button"
                  disabled={compressingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-55"
                >
                  <Icon name="photo" className="w-3.5 h-3.5 text-primary" />
                  <span>{compressingPhoto ? 'Optimizing…' : imageDataUrl ? 'Replace photo' : 'Attach photo'}</span>
                </button>
              </div>
            </div>

            {imageDataUrl && (
              <div className="rounded-xl overflow-hidden border border-edge bg-surface-subtle max-h-48 flex items-center justify-center">
                <img
                  src={imageDataUrl}
                  alt="Attached note memory"
                  className="max-h-48 w-auto object-contain"
                />
              </div>
            )}
          </div>

          {profiles.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="quote-sheet-author"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5"
                >
                  Written by
                </label>
                <div className="flex items-center gap-2">
                  {selectedAuthor ? (
                    <span
                      className={`w-8 h-8 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0 ${
                        AVATAR_TONES[selectedAuthor.avatarTone || 'teal'] || AVATAR_TONES.teal
                      }`}
                    >
                      {computeOwnerInitials(selectedAuthor.name)}
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-surface-subtle border border-edge text-ink-muted text-xs font-bold inline-flex items-center justify-center shrink-0">
                      H
                    </span>
                  )}
                  <select
                    id="quote-sheet-author"
                    value={authorProfileId}
                    onChange={(e) => setAuthorProfileId(e.target.value)}
                    className="flex-1 h-10 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-medium text-ink focus:outline-none focus:border-primary"
                  >
                    <option value="">Household</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="quote-sheet-for"
                  className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5"
                >
                  About / For reader
                </label>
                <select
                  id="quote-sheet-for"
                  value={forProfileId}
                  onChange={(e) => setForProfileId(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-medium text-ink focus:outline-none focus:border-primary"
                >
                  <option value="">Everyone</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Delete Zone (when editing existing note) */}
          {isEditing && onDelete && (
            <div className="pt-2 border-t border-edge-subtle">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-danger hover:bg-danger/10 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Icon name="trash" className="w-3.5 h-3.5" />
                  <span>Delete this note</span>
                </button>
              ) : (
                <div className="rounded-xl bg-danger/10 border border-danger/35 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-danger">
                    Delete this note?
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface border border-edge text-xs font-semibold text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleDeleteConfirmed}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-danger-solid hover:bg-danger-solid-hover text-danger-solid-fg text-xs font-semibold cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sheet Action Bar */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-ink-secondary hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] min-w-[120px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-55 text-primary-fg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
