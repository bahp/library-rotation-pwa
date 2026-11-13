import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { setWelcomeBooksModalDismissed } from '../../ui/components/welcome-setup-modal.js';

interface WelcomeSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeSetupModal: React.FC<WelcomeSetupModalProps> = ({ isOpen, onClose }) => {
  const { navigate } = useApp();

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
      className="sheet-backdrop fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg bg-ivory dark:bg-night-900 rounded-2xl border border-linen-200 dark:border-night-700 shadow-2xl p-5 sm:p-6 my-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center font-bold">
              <Icon name="book" className="w-4 h-4" />
            </span>
            <h2 id="welcome-setup-title" className="font-display text-lg font-bold text-forest-900 dark:text-white">
              Welcome to Library Rotation
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close welcome modal"
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-white hover:bg-linen-100 dark:hover:bg-night-800 transition-colors"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-3 text-xs sm:text-sm text-stone-700 dark:text-slate-300 leading-relaxed">
          <p>
            Your family library app catalogs children’s books with instant barcode scanning, OCR, and rich metadata.
          </p>

          <div className="p-3 rounded-xl bg-linen-100 dark:bg-night-800/80 border border-linen-200 dark:border-night-700 space-y-1.5">
            <h3 className="font-display font-bold text-forest-900 dark:text-white text-xs">
              Book Catalog Metadata Providers:
            </h3>
            <ul className="list-disc list-inside space-y-1 text-xs text-stone-600 dark:text-slate-400">
              <li>
                <strong>Open Library:</strong> Works out-of-the-box with zero configuration and no API keys required.
              </li>
              <li>
                <strong>Google Books:</strong> For higher search quotas and instant covers, you can configure your free Google Books API key securely in Settings without client leakage.
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-3 border-t border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDismissForever}
            className="text-xs font-semibold text-stone-600 dark:text-slate-400 hover:text-forest-900 dark:hover:text-white"
          >
            Got it, start scanning
          </button>

          <button
            type="button"
            onClick={handleGoToSettings}
            className="px-4 py-2 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs shadow-xs transition-colors"
          >
            Configure Providers…
          </button>
        </div>
      </div>
    </div>
  );
};
