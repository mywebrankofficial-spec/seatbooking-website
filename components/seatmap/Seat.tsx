'use client';
import { memo, useCallback, useState, type MouseEvent } from 'react';
import { animate, motion } from 'framer-motion';
import type { Seat as SeatData } from '@/types/cinema';
import { formatPrice, seatTypeLabel } from '@/lib/format';
import { EASE_PREMIUM, SEAT_COLORS } from './motion';

export interface SeatProps {
  seat: SeatData;
  /** Centre of the seat inside the map frame (px). */
  left: number;
  top: number;
  size: number;
  selected: boolean;
  /** Roving tabindex: exactly one seat in the grid is tabbable. */
  tabbable: boolean;
  reducedMotion: boolean;
  /** `pointer` is false for keyboard activation (Enter/Space). */
  onActivate: (id: string, pointer: boolean) => void;
  onFocusSeat: (id: string) => void;
  registerRef: (id: string, el: HTMLButtonElement | null) => void;
}

function SeatImpl({
  seat,
  left,
  top,
  size,
  selected,
  tabbable,
  reducedMotion,
  onActivate,
  onFocusSeat,
  registerRef,
}: SeatProps) {
  const [pulse, setPulse] = useState(0);
  const taken = seat.status === 'taken';
  const recliner = seat.type === 'recliner';

  const setRef = useCallback((el: HTMLButtonElement | null) => registerRef(seat.id, el), [registerRef, seat.id]);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    if (taken) {
      if (!reducedMotion) {
        animate(el, { x: [0, -4, 4, -3, 3, -1.5, 0] }, { duration: 0.42, ease: 'easeInOut' });
      }
      return;
    }
    try {
      navigator.vibrate?.(8);
    } catch {
      /* vibration not permitted */
    }
    if (!reducedMotion) {
      animate(el, { scale: 0.9 }, { duration: 0.08, ease: 'easeOut' }).then(() =>
        animate(el, { scale: 1 }, { type: 'spring', stiffness: 520, damping: 14 }),
      );
      if (!selected) setPulse((p) => p + 1);
    }
    onActivate(seat.id, e.detail > 0);
  };

  const radius = Math.max(2, size * 0.28);
  const fill = taken ? 'transparent' : selected ? SEAT_COLORS.selected : recliner ? SEAT_COLORS.recliner : SEAT_COLORS.available;

  return (
    <button
      ref={setRef}
      type="button"
      data-seat-id={seat.id}
      tabIndex={tabbable ? 0 : -1}
      aria-pressed={taken ? undefined : selected}
      aria-disabled={taken || undefined}
      aria-label={`Row ${seat.row} seat ${seat.number}, ${seatTypeLabel(seat.type).toLowerCase()}, ${formatPrice(
        seat.price,
      )}, ${taken ? 'taken' : 'available'}`}
      onClick={handleClick}
      onFocus={() => onFocusSeat(seat.id)}
      className={[
        'absolute flex touch-manipulation items-center justify-center border p-0 outline-none select-none',
        'transition-[background-color,border-color,box-shadow,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80',
        taken ? 'cursor-default' : selected ? 'cursor-pointer' : 'cursor-pointer hover:brightness-125',
      ].join(' ')}
      style={{
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: fill,
        borderColor: taken ? SEAT_COLORS.takenBorder : 'transparent',
        boxShadow: selected ? '0 0 10px 0 rgba(110,231,160,0.35)' : '0 0 0 0 rgba(110,231,160,0)',
        zIndex: selected ? 2 : undefined,
      }}
    >
      <span
        aria-hidden
        className="tabular pointer-events-none leading-none font-semibold transition-opacity duration-300"
        style={{
          fontSize: Math.max(7, size * 0.46),
          color: SEAT_COLORS.selectedText,
          opacity: selected ? 1 : 0,
          letterSpacing: '-0.02em',
        }}
      >
        {seat.number}
      </span>
      {pulse > 0 && (
        <motion.span
          key={pulse}
          aria-hidden
          className="pointer-events-none absolute -inset-px"
          style={{
            borderRadius: radius + 1,
            boxShadow: '0 0 0 1.5px rgba(255,255,255,0.5), 0 0 14px 2px rgba(255,255,255,0.16)',
          }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.75, ease: EASE_PREMIUM }}
        />
      )}
    </button>
  );
}

export const Seat = memo(SeatImpl);
