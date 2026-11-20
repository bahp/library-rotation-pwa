import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon.js';

export interface GiftStoreOption {
  id: string;
  label: string;
  desc: string;
  url: string;
  icon?: string;
}

interface BookGiftSheetProps {
  isOpen: boolean;
  bookTitle: string;
  authorsText: string;
  isbn?: string;
  stores: GiftStoreOption[];
  onClose: () => void;
  onConfigureStores: () => void;
  onNotify?: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export const BookGiftSheet: React.FC<BookGiftSheetProps> = ({
  isOpen,
  bookTitle,
  authorsText,
  isbn,
  stores,
  onClose,
  onConfigureStores,
  onNotify,
}) => {
  const [copiedIsbn, setCopiedIsbn] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCopiedIsbn(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyIsbn = async () => {
    if (!isbn) return;
    try {
      await navigator.clipboard.writeText(isbn);
      setCopiedIsbn(true);
      onNotify?.(`Copied ISBN ${isbn}`, 'success');
      window.setTimeout(() => setCopiedIsbn(false), 2000);
    } catch {
      onNotify?.('Copy unavailable on this browser.', 'error');
    }
  };

  return (
    <div
      data-backdrop-action="close-gift-sheet"
      className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gift or buy a copy"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sheet Header */}
        <div className="px-5 pt-4 pb-3 border-b border-edge-subtle flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted inline-flex items-center gap-1.5">
              <Icon name="gift" className="w-3.5 h-3.5 text-primary" />
              <span>Gift or Buy Copy</span>
            </p>
            <h3 className="font-display text-xl font-semibold text-ink mt-1 leading-tight line-clamp-2">
              {bookTitle}
            </h3>
            {authorsText && (
              <p className="text-xs text-ink-secondary truncate mt-0.5">{authorsText}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close bookstores sheet"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isbn && (
            <div className="rounded-xl bg-surface-subtle border border-edge px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Exact Edition ISBN
                </span>
                <span className="block text-xs font-mono-tabular font-semibold text-ink select-all">
                  {isbn}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyIsbn}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-primary inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                <Icon name={copiedIsbn ? 'check' : 'qrcode'} className="w-3.5 h-3.5" />
                <span>{copiedIsbn ? 'Copied' : 'Copy ISBN'}</span>
              </button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Choose a bookstore (opens in new tab)
            </p>

            {stores.length > 0 ? (
              <div className="rounded-2xl bg-surface-subtle/85 border border-edge divide-y divide-edge-subtle overflow-hidden">
                {stores.map((storeOpt) => (
                  <a
                    key={storeOpt.id}
                    href={storeOpt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-gift-store-link={storeOpt.id}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface-elevated/60 transition-colors"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-surface border border-edge/80 text-primary flex items-center justify-center shrink-0">
                        <Icon name={storeOpt.icon || 'gift'} className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink truncate">
                          {storeOpt.label}
                        </span>
                        <span className="block text-[11px] text-ink-muted truncate">
                          {storeOpt.desc}
                        </span>
                      </span>
                    </span>
                    <Icon name="externalLink" className="w-4 h-4 text-ink-muted shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-surface-subtle border border-edge p-4 text-center space-y-2">
                <p className="text-xs text-ink-secondary">
                  No bookstores are currently enabled in Settings.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-edge-subtle bg-surface flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onConfigureStores();
            }}
            className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold text-primary hover:bg-surface-subtle inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icon name="sliders" className="w-3.5 h-3.5" />
            <span>Configure Bookstores</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[96px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
