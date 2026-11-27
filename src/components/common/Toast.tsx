import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from './Icon.js';

export const Toast: React.FC = () => {
  const { toast, store } = useApp();

  if (!toast) return null;

  const toneClasses = {
    success: 'bg-primary text-primary-fg border border-accent/40 shadow-lg',
    error: 'bg-danger-solid text-danger-solid-fg border border-danger/60 shadow-lg',
    info: 'bg-surface-elevated text-ink border border-edge shadow-lg',
  }[toast.tone || 'success'];

  const iconName = {
    success: 'check',
    error: 'close',
    info: 'info',
  }[toast.tone || 'success'];

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] sm:max-w-md w-max pointer-events-auto transition-all"
    >
      <div
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium ${toneClasses}`}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          <Icon name={iconName} className="w-4 h-4" />
        </span>
        <span className="truncate max-w-[240px] sm:max-w-xs">{toast.message}</span>
        {toast.actionLabel && toast.onAction && (
          <button
            type="button"
            onClick={() => {
              const handler = toast.onAction;
              store.dismissToast();
              handler?.();
            }}
            className="shrink-0 px-2.5 py-1 rounded-[var(--radius-badge)] border border-current/25 text-[11px] font-semibold hover:bg-overlay-tint transition-colors cursor-pointer"
          >
            {toast.actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => store.dismissToast()}
          className="ml-0.5 p-1 hover:bg-overlay-tint rounded transition-colors cursor-pointer"
          aria-label="Dismiss message"
        >
          <Icon name="close" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
