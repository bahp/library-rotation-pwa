import React, { useEffect, useMemo } from 'react';
import { Icon } from '../common/Icon.js';
import type { Book, ChildProfile, RotationList } from '../../types/models.js';

interface BookRotationsSheetProps {
  isOpen: boolean;
  book: Book;
  rotations: RotationList[];
  profiles: ChildProfile[];
  onToggleRotation: (rotationId: string) => Promise<void>;
  onClose: () => void;
}

export const BookRotationsSheet: React.FC<BookRotationsSheetProps> = ({
  isOpen,
  book,
  rotations,
  profiles,
  onToggleRotation,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { activeList, savedList, profileById } = useMemo(() => {
    const pMap = new Map(profiles.map((p) => [p.id, p]));
    const active: RotationList[] = [];
    const saved: RotationList[] = [];
    for (const rot of rotations) {
      if (rot.status === 'active') {
        active.push(rot);
      } else {
        saved.push(rot);
      }
    }
    saved.sort((a, b) => {
      const ta = new Date(a.lastActiveAt || a.createdAt || 0).getTime();
      const tb = new Date(b.lastActiveAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return { activeList: active, savedList: saved, profileById: pMap };
  }, [rotations, profiles]);

  if (!isOpen) return null;

  const renderRotationRow = (rot: RotationList, isActive: boolean) => {
    const isAssigned = rot.bookIds.includes(book.id);
    const reader = profileById.get(rot.profileId);
    const count = rot.bookIds.length;
    return (
      <button
        key={rot.id}
        type="button"
        data-rotation-assign-id={rot.id}
        aria-pressed={isAssigned}
        onClick={() => void onToggleRotation(rot.id)}
        className={`w-full min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
          isAssigned
            ? 'bg-primary/10 border-primary/50 text-ink'
            : 'bg-surface-subtle/75 hover:bg-surface-elevated/60 border-edge text-ink'
        }`}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 min-w-0">
            {isActive && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full bg-success shrink-0"
              />
            )}
            <span className="font-sans text-sm font-semibold text-ink truncate">
              {rot.title}
            </span>
          </div>
          <p className="text-[11px] text-ink-secondary font-mono-tabular truncate">
            {reader ? `${reader.name} · ` : ''}
            {count} {count === 1 ? 'book' : 'books'}
            {isActive ? ' · Active shelf' : ' · Saved'}
          </p>
        </div>

        <span
          aria-hidden="true"
          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            isAssigned
              ? 'bg-primary text-primary-fg'
              : 'bg-surface border border-edge text-transparent'
          }`}
        >
          <Icon name="check" className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  };

  return (
    <div
      data-backdrop-action="close-book-rotations-sheet"
      className="fixed inset-0 z-[75] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assign book to shelf rotations"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1.5 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        <div className="px-5 pt-3.5 pb-3 border-b border-edge-subtle flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted inline-flex items-center gap-1.5">
              <Icon name="rotations" className="w-3.5 h-3.5 text-primary" />
              <span>Shelf Rotations</span>
            </p>
            <h3 className="font-display text-lg sm:text-xl font-semibold text-ink mt-0.5 leading-tight truncate">
              Assign “{book.title}”
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close rotations sheet"
            className="min-h-[44px] min-w-[44px] -mr-1.5 rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {rotations.length === 0 ? (
            <div className="rounded-xl bg-surface-subtle border border-edge p-4 text-center text-xs text-ink-secondary">
              No rotation shelves created yet. Create an active or saved shelf from the Rotations tab.
            </div>
          ) : (
            <>
              {activeList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Active Rotations ({activeList.length})
                  </p>
                  <div className="space-y-2">
                    {activeList.map((rot) => renderRotationRow(rot, true))}
                  </div>
                </div>
              )}

              {savedList.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                    Saved Rotations ({savedList.length})
                  </p>
                  <div className="space-y-2">
                    {savedList.map((rot) => renderRotationRow(rot, false))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

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
