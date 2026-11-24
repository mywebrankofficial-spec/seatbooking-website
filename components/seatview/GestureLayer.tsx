'use client';
/**
 * Transparent full-screen layer above the 3D canvas, below the header and sheet.
 * It always catches pointer/wheel events while mounted (so a wheel scrub keeps
 * reaching the overlay); swipes are only acted on when `enabled`.
 * Swipes over the 3D view change seats:
 *   horizontal  -> paging convention: swipe LEFT = seat to the RIGHT (+1), swipe RIGHT = seat to the LEFT (-1)
 *   vertical    -> swipe UP = one row forward (towards the screen), swipe DOWN = one row back
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

const MIN_DISTANCE = 40;
const DOMINANCE = 1.4;
const MAX_DURATION = 900;

export function GestureLayer({
  enabled,
  onSwipe,
}: {
  enabled: boolean;
  onSwipe: (dir: SwipeDirection) => void;
}) {
  const start = useRef<{ id: number; x: number; y: number; t: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId || !enabled) return;
    if (e.timeStamp - s.t > MAX_DURATION) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax >= MIN_DISTANCE && ax > ay * DOMINANCE) onSwipe(dx < 0 ? 'left' : 'right');
    else if (ay >= MIN_DISTANCE && ay > ax * DOMINANCE) onSwipe(dy < 0 ? 'up' : 'down');
  };

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: 'auto', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
      }}
      aria-hidden
      data-testid="seat-gesture-layer"
    />
  );
}
