import { useEffect } from 'react';

interface SheetMatch {
  sheetEl: HTMLElement;
  backdropEl: HTMLElement;
}

interface ActiveDragState {
  mode: 'touch' | 'mouse';
  sheetEl: HTMLElement;
  backdropEl: HTMLElement;
  startX: number;
  startY: number;
  currentY: number;
  lastY: number;
  lastTime: number;
  prevY: number;
  prevTime: number;
  sheetHeight: number;
  startedInTopZone: boolean;
  isDragging: boolean;
  aborted: boolean;
}

const TOP_HANDLE_ZONE_PX = 76;
const DRAG_SLOP_PX = 8;
const INTERACTIVE_SELECTOR =
  'input, textarea, select, [role="slider"], [contenteditable="true"]';
const CLICKABLE_CONTROL_SELECTOR = 'button, a, input, select, textarea, summary, label';

function findSheetAndBackdrop(target: EventTarget | null): SheetMatch | null {
  if (!(target instanceof Element)) return null;
  const sheetEl = target.closest('.animate-sheet-up') as HTMLElement | null;
  if (!sheetEl) return null;

  const explicitBackdrop = sheetEl.closest('.sheet-backdrop') as HTMLElement | null;
  if (explicitBackdrop) {
    return { sheetEl, backdropEl: explicitBackdrop };
  }

  // Fallback for dialog patterns where scrim is a sibling inside [role="dialog"] (e.g., PlayView)
  const parentDialog = sheetEl.parentElement;
  if (parentDialog && parentDialog.getAttribute('role') === 'dialog') {
    const siblingBackdrop = parentDialog.querySelector(
      ':scope > [class*="bg-scrim"]'
    ) as HTMLElement | null;
    if (siblingBackdrop) {
      return { sheetEl, backdropEl: siblingBackdrop };
    }
  }

  return null;
}

function isDragHandlePill(target: Element): boolean {
  return Boolean(
    target.closest(
      '.animate-sheet-up div.w-10.h-1.rounded-full.mx-auto, .animate-sheet-up div.w-10.h-1\\.5.rounded-full.mx-auto'
    )
  );
}

function hasScrolledVerticalAncestor(startTarget: Element, sheetEl: HTMLElement): boolean {
  let el: Element | null = startTarget;
  while (el && el !== sheetEl) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 2) {
      const style = window.getComputedStyle(el);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        if (el.scrollTop > 1) return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

function hasHorizontalScrollAncestor(startTarget: Element, sheetEl: HTMLElement): boolean {
  let el: Element | null = startTarget;
  while (el && el !== sheetEl) {
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 4) {
      const style = window.getComputedStyle(el);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

export function useGlobalSheetSwipeDismiss(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let active: ActiveDragState | null = null;
    let suppressSheetClicksUntil = 0;
    let suppressedSheetEl: HTMLElement | null = null;
    let programmaticBackdropTarget: HTMLElement | null = null;

    const resetSheetVisuals = (sheetEl: HTMLElement, backdropEl: HTMLElement) => {
      sheetEl.style.transition = '';
      sheetEl.style.transform = '';
      backdropEl.style.transition = '';
      backdropEl.style.opacity = '';
    };

    const triggerBackdropDismiss = (backdropEl: HTMLElement) => {
      suppressSheetClicksUntil = 0;
      suppressedSheetEl = null;
      programmaticBackdropTarget = backdropEl;
      try {
        backdropEl.click();
      } finally {
        programmaticBackdropTarget = null;
      }
    };

    const beginDrag = (
      mode: 'touch' | 'mouse',
      target: EventTarget | null,
      clientX: number,
      clientY: number
    ) => {
      if (!(target instanceof Element)) return;
      if (target.closest(INTERACTIVE_SELECTOR)) return;

      const matched = findSheetAndBackdrop(target);
      if (!matched) return;

      const { sheetEl, backdropEl } = matched;
      const rect = sheetEl.getBoundingClientRect();
      if (rect.height < 80) return;

      const relY = clientY - rect.top;
      const onPill = isDragHandlePill(target);
      const startedInTopZone = onPill || relY <= TOP_HANDLE_ZONE_PX;

      if (mode === 'mouse') {
        // On desktop pointer, allow dragging from the pill or non-clickable top header strip
        if (!onPill && (relY > TOP_HANDLE_ZONE_PX || Boolean(target.closest(CLICKABLE_CONTROL_SELECTOR)))) {
          return;
        }
      } else if (!startedInTopZone && hasScrolledVerticalAncestor(target, sheetEl)) {
        return;
      }

      const now = performance.now();
      active = {
        mode,
        sheetEl,
        backdropEl,
        startX: clientX,
        startY: clientY,
        currentY: clientY,
        lastY: clientY,
        lastTime: now,
        prevY: clientY,
        prevTime: now,
        sheetHeight: rect.height,
        startedInTopZone,
        isDragging: false,
        aborted: false,
      };
    };

    const updateDrag = (
      clientX: number,
      clientY: number,
      target: EventTarget | null,
      preventDefaultFn?: () => void
    ) => {
      if (!active || active.aborted) return;

      const dx = clientX - active.startX;
      const dy = clientY - active.startY;

      if (!active.isDragging) {
        if (Math.abs(dx) < DRAG_SLOP_PX && Math.abs(dy) < DRAG_SLOP_PX) {
          return;
        }

        // Upward drag or horizontal gesture -> yield immediately to native scrolling/carousels
        if (dy <= 0 || Math.abs(dx) > dy * 0.9) {
          active.aborted = true;
          return;
        }

        if (
          active.mode === 'touch' &&
          !active.startedInTopZone &&
          target instanceof Element
        ) {
          if (hasScrolledVerticalAncestor(target, active.sheetEl)) {
            active.aborted = true;
            return;
          }
          if (
            hasHorizontalScrollAncestor(target, active.sheetEl) &&
            Math.abs(dx) > dy * 0.65
          ) {
            active.aborted = true;
            return;
          }
        }

        active.isDragging = true;
        active.sheetEl.dataset.sheetSettled = 'true';
        active.sheetEl.style.animation = 'none';
      }

      if (preventDefaultFn) {
        preventDefaultFn();
      }

      const clampedDy = Math.max(0, dy);
      const now = performance.now();
      if (now - active.lastTime >= 16) {
        active.prevY = active.lastY;
        active.prevTime = active.lastTime;
        active.lastY = clientY;
        active.lastTime = now;
      }
      active.currentY = clientY;

      active.sheetEl.style.transition = 'none';
      active.sheetEl.style.transform = `translate3d(0, ${clampedDy}px, 0)`;

      const progress = Math.min(1, clampedDy / Math.max(220, active.sheetHeight));
      active.backdropEl.style.transition = 'none';
      active.backdropEl.style.opacity = String(Math.max(0.12, 1 - progress * 0.85));
    };

    const finishDrag = (cancelled = false) => {
      if (!active) return;
      const state = active;
      active = null;

      if (!state.isDragging) return;

      // Only suppress stray post-drag clicks originating inside the sheet itself (for 90ms)
      suppressSheetClicksUntil = performance.now() + 90;
      suppressedSheetEl = state.sheetEl;

      const dy = Math.max(0, state.currentY - state.startY);
      const dt = Math.max(1, state.lastTime - state.prevTime);
      const velocityY = (state.currentY - state.prevY) / dt;
      const dismissThreshold = Math.min(96, state.sheetHeight * 0.22);
      const shouldDismiss =
        !cancelled && (dy > dismissThreshold || (velocityY > 0.35 && dy > 20));

      if (shouldDismiss) {
        state.sheetEl.style.transition = 'transform 175ms cubic-bezier(0.2, 0, 0, 1)';
        state.sheetEl.style.transform = `translate3d(0, ${state.sheetHeight + 36}px, 0)`;
        state.backdropEl.style.transition = 'opacity 165ms ease-out';
        state.backdropEl.style.opacity = '0';

        window.setTimeout(() => {
          triggerBackdropDismiss(state.backdropEl);
          // Safety reset in case a modal blocks closing (e.g., unsaved changes prompt)
          window.setTimeout(() => {
            if (document.body.contains(state.sheetEl)) {
              resetSheetVisuals(state.sheetEl, state.backdropEl);
            }
          }, 50);
        }, 150);
      } else {
        state.sheetEl.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)';
        state.sheetEl.style.transform = 'translate3d(0, 0, 0)';
        state.backdropEl.style.transition = 'opacity 200ms ease-out';
        state.backdropEl.style.opacity = '';

        window.setTimeout(() => {
          if (document.body.contains(state.sheetEl)) {
            resetSheetVisuals(state.sheetEl, state.backdropEl);
          }
        }, 230);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        active = null;
        return;
      }
      const touch = e.touches[0];
      beginDrag('touch', e.target, touch.clientX, touch.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || active.mode !== 'touch') return;
      if (e.touches.length !== 1) {
        finishDrag(true);
        return;
      }
      const touch = e.touches[0];
      updateDrag(touch.clientX, touch.clientY, e.target, () => {
        if (e.cancelable) e.preventDefault();
      });
    };

    const onTouchEnd = () => {
      if (active?.mode === 'touch') {
        finishDrag(false);
      }
    };

    const onTouchCancel = () => {
      if (active?.mode === 'touch') {
        finishDrag(true);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      beginDrag('mouse', e.target, e.clientX, e.clientY);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!active || active.mode !== 'mouse') return;
      updateDrag(e.clientX, e.clientY, e.target, () => {
        e.preventDefault();
      });
    };

    const onMouseUp = () => {
      if (active?.mode === 'mouse') {
        finishDrag(false);
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (programmaticBackdropTarget && e.target === programmaticBackdropTarget) {
        return;
      }
      if (
        performance.now() < suppressSheetClicksUntil &&
        suppressedSheetEl &&
        e.target instanceof Node &&
        suppressedSheetEl.contains(e.target)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('click', onClickCapture, true);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, []);
}
