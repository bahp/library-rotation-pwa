import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from './Icon.js';

export const Toast: React.FC = () => {
  const { toast, store } = useApp();

  if (!toast) return null;

  const toneClasses = {
    success: 'bg-[#123C42] text-white border border-[#5ED3DA]/30 shadow-lg',
    error: 'bg-[#963E47] text-white border border-rose-300/30 shadow-lg',
    info: 'bg-[#1C2D33] text-white border border-slate-600/30 shadow-lg',
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
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium ${toneClasses}`}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          <Icon name={iconName} className="w-4 h-4" />
        </span>
        <span className="truncate max-w-[280px] sm:max-w-sm">{toast.message}</span>
        <button
          type="button"
          onClick={() => store.dismissToast()}
          className="ml-1 p-1 hover:bg-white/10 rounded-md transition-colors"
          aria-label="Dismiss message"
        >
          <Icon name="close" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
