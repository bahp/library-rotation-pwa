import { useEffect } from 'react';

let activeLockCount = 0;
let previousBodyOverflow = '';
let previousHtmlOverscroll = '';
let previousBodyOverscroll = '';

/**
 * Prevents background scroll chaining while modals, drawers, or mobile bottom sheets are open.
 * Reference-counted so stacked/nested modals safely preserve the scroll lock until all close.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const { body, documentElement } = document;
    if (activeLockCount === 0) {
      previousBodyOverflow = body.style.overflow;
      previousHtmlOverscroll = documentElement.style.overscrollBehavior;
      previousBodyOverscroll = body.style.overscrollBehavior;

      body.style.overflow = 'hidden';
      documentElement.style.overscrollBehavior = 'none';
      body.style.overscrollBehavior = 'none';
    }
    activeLockCount += 1;

    return () => {
      activeLockCount = Math.max(0, activeLockCount - 1);
      if (activeLockCount === 0) {
        body.style.overflow = previousBodyOverflow;
        documentElement.style.overscrollBehavior = previousHtmlOverscroll;
        body.style.overscrollBehavior = previousBodyOverscroll;
      }
    };
  }, [locked]);
}
