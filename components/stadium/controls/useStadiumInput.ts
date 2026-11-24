'use client';
/**
 * DOM input for the stadium booking canvas:
 *   - wheel / trackpad (incl. ctrl+wheel pinch) on the canvas parent → zoom + level snapping
 *   - two-finger pinch on touch → same zoom
 *   - keyboard: Esc = back, arrows = move highlight, Enter = select highlight
 */
import { useEffect } from 'react';
import { useStadium } from '@/store/stadium';
import { activateHighlight, back, moveHighlight, type HighlightDir } from '@/lib/stadium-nav';
import { zoomInput } from './zoom';

function normalizeWheel(e: WheelEvent): number {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1;
  return e.deltaY * unit;
}

/** Wheel + pinch zoom on `el` (the canvas parent). */
export function useStadiumWheel(el: HTMLElement | null): void {
  useEffect(() => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = normalizeWheel(e);
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const k = e.ctrlKey ? 0.012 : 0.0012;
      const d = Math.max(-0.2, Math.min(0.2, -dy * k));
      zoomInput(d);
    };

    let pinch = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = dist(e.touches);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || pinch <= 0) return;
      e.preventDefault();
      const d = dist(e.touches);
      if (d > 0) zoomInput(Math.log(d / pinch) * 0.9);
      pinch = d;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = 0;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [el]);
}

const ARROWS: Record<string, HighlightDir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

function isInteractive(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (isEditable(t)) return true;
  return !!t.closest('button, a[href], [role="button"], [role="dialog"], summary');
}

/** Window keyboard shortcuts for the booking flow. */
export function useStadiumKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const s = useStadium.getState();
      if (s.checkoutOpen) return;
      if (e.key === 'Escape') {
        if (isEditable(e.target)) return;
        e.preventDefault();
        void back();
        return;
      }
      const dir = ARROWS[e.key];
      if (dir) {
        if (isEditable(e.target)) return;
        e.preventDefault();
        moveHighlight(dir);
        return;
      }
      if (e.key === 'Enter') {
        // A focused button/link handles its own Enter.
        if (isInteractive(e.target)) return;
        e.preventDefault();
        activateHighlight();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
