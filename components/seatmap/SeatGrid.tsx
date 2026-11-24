'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useBooking } from '@/store/booking';
import {
  DEFAULT_LAYOUT,
  neighbourSeatId,
  parseSeatId,
  rowNeighbourSeatId,
  seatMapPosition,
  seatsPerRow,
} from '@/lib/hall-geometry';
import { Seat } from './Seat';
import { usePrefersReducedMotion } from './motion';

/** Max gap between two taps on the same seat that counts as a double-tap (ms). */
const DOUBLE_TAP_MS = 340;

interface SeatGridProps {
  /** Width (px) of the map frame the world box is drawn into. */
  frameWidth: number;
  onContinue: () => void;
}

/** Row letters + every seat, absolutely positioned inside the map frame. */
export const SeatGrid = memo(function SeatGrid({ frameWidth, onContinue }: SeatGridProps) {
  const seats = useBooking((s) => s.seats);
  const selectedSeatId = useBooking((s) => s.selectedSeatId);
  const reducedMotion = usePrefersReducedMotion();
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const refs = useRef(new Map<string, HTMLButtonElement>());
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const onContinueRef = useRef(onContinue);
  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  const placed = useMemo(
    () => seats.map((seat) => ({ seat, ...seatMapPosition(seat, frameWidth) })),
    [seats, frameWidth],
  );

  const rowLabels = useMemo(
    () =>
      DEFAULT_LAYOUT.rows.map((row) => {
        const first = seatMapPosition({ row, number: 1 }, frameWidth);
        // Centred in the frame margin between the frame edge and seat 1.
        return { row, top: first.top, left: (first.left - first.size / 2) / 2 };
      }),
    [frameWidth],
  );

  const ids = useMemo(() => new Set(seats.map((s) => s.id)), [seats]);

  const tabId =
    (focusedId && ids.has(focusedId) ? focusedId : null) ??
    (selectedSeatId && ids.has(selectedSeatId) ? selectedSeatId : null) ??
    seats.find((s) => s.status === 'available')?.id ??
    seats[0]?.id ??
    null;

  const registerRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  }, []);

  const onFocusSeat = useCallback((id: string) => setFocusedId(id), []);

  const onActivate = useCallback((id: string, pointer: boolean) => {
    const st = useBooking.getState();
    const seat = st.seats.find((s) => s.id === id);
    if (!seat || seat.status === 'taken') return;

    const now = performance.now();
    const last = lastTap.current;
    if (pointer && last && last.id === id && now - last.t < DOUBLE_TAP_MS) {
      // Double-tap: make sure it is selected, then go straight to the 3D view.
      lastTap.current = null;
      if (st.selectedSeatId !== id) st.selectSeat(id);
      onContinueRef.current();
      return;
    }
    lastTap.current = pointer ? { id, t: now } : null;
    st.toggleSeat(id);
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-seat-id]')?.dataset.seatId;
    if (!id) return;
    const { row } = parseSeatId(id);
    let next: string | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = neighbourSeatId(id, -1);
        break;
      case 'ArrowRight':
        next = neighbourSeatId(id, 1);
        break;
      case 'ArrowUp':
        next = rowNeighbourSeatId(id, -1);
        break;
      case 'ArrowDown':
        next = rowNeighbourSeatId(id, 1);
        break;
      case 'Home':
        next = `${row}1`;
        break;
      case 'End':
        next = `${row}${seatsPerRow()}`;
        break;
      default:
        return;
    }
    e.preventDefault();
    const el = next ? refs.current.get(next) : undefined;
    if (el && next) {
      setFocusedId(next);
      el.focus();
    }
  }, []);

  return (
    <div
      role="group"
      aria-label="Seats. The screen is at the top. Use arrow keys to move between seats."
      className="absolute inset-0"
      onKeyDown={onKeyDown}
    >
      {rowLabels.map(({ row, top, left }) => (
        <span
          key={row}
          aria-hidden
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[9px] leading-none font-medium text-white/30 select-none"
          style={{ left, top }}
        >
          {row}
        </span>
      ))}
      {placed.map(({ seat, left, top, size }) => (
        <Seat
          key={seat.id}
          seat={seat}
          left={left}
          top={top}
          size={size}
          selected={seat.id === selectedSeatId}
          tabbable={seat.id === tabId}
          reducedMotion={reducedMotion}
          onActivate={onActivate}
          onFocusSeat={onFocusSeat}
          registerRef={registerRef}
        />
      ))}
    </div>
  );
});
