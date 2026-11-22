import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { setWelcomeBooksModalDismissed } from '../../ui/components/welcome-setup-modal.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

interface WelcomeSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeSetupModal: React.FC<WelcomeSetupModalProps> = ({ isOpen, onClose }) => {
  const { navigate } = useApp();

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleDismissForever = () => {
    setWelcomeBooksModalDismissed(true);
    onClose();
  };

  const handleGoToSettings = () => {
    handleDismissForever();
    navigate('settings');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-setup-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg bg-surface rounded-t-2xl sm:rounded-xl border border-edge shadow-2xl px-5 pt-3 pb-5 sm:p-6 my-auto pb-safe sm:pb-6"
      >
        <div className="w-10 h-1 bg-edge rounded-full mx-auto mb-3 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between pb-3 border-b border-edge-subtle">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="book" className="w-4 h-4" />
            </span>
            <h2 id="welcome-setup-title" className="font-display text-xl font-semibold text-ink">
              Welcome to Library Rotation
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close welcome modal"
            className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs sm:text-sm text-ink-secondary leading-relaxed">
          <p>
            Your family library app catalogs children’s books with instant barcode scanning, OCR, and rich metadata.
          </p>

          <div className="p-3.5 rounded-lg bg-surface-subtle border border-edge space-y-1.5">
            <h3 className="font-display font-semibold text-ink text-sm">
              Book Catalog Metadata Providers:
            </h3>
            <ul className="list-disc list-inside space-y-1 text-xs text-ink-secondary">
              <li>
                <strong className="text-ink">Open Library:</strong> Works out-of-the-box with zero configuration and no API keys required.
              </li>
              <li>
                <strong className="text-ink">Google Books:</strong> For higher search quotas and instant covers, you can configure your free Google Books API key securely in Settings without client leakage.
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-3 border-t border-edge-subtle flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDismissForever}
            className="min-h-[44px] sm:min-h-[36px] px-2 text-xs font-semibold text-ink-secondary hover:text-ink active:scale-[0.98] transition-all cursor-pointer"
          >
            Got it, start scanning
          </button>

          <button
            type="button"
            onClick={handleGoToSettings}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            Configure Providers…
          </button>
        </div>
      </div>
    </div>
  );
};
