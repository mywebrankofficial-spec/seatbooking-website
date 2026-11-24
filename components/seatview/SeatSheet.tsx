'use client';
/**
 * Bottom sheet for the seat view.
 * - Outer motion.div: enter (slide up as the camera lands) / exit (slide down first on Change seat).
 * - Inner motion.div: translateY from the SheetController MotionValue (drag, expand, scrub);
 *   plus x/y "nudge" values for the edge bounce when no seat is available.
 */
import { motion, type MotionValue } from 'framer-motion';
import { useEffect, useId, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Seat, SeatViewStats } from '@/types/cinema';
import { formatDegrees, formatMetres, formatPrice, formatSide, seatTypeLabel } from '@/lib/format';
import type { SheetController } from './useSheetController';
import type { SimilarSeat } from './seat-nav';
import { MiniMap } from './MiniMap';
import { StatTiles } from './StatTiles';
import { SeatDetails } from './SeatDetails';

const SHEET_BG = 'rgba(18,18,22,0.86)';
/** Space kept free above the expanded sheet (header + breathing room). */
const TOP_RESERVE = 112;
const DRAG_THRESHOLD = 6;

interface DragState {
  id: number;
  x0: number;
  y0: number;
  started: boolean;
  samples: { t: number; y: number }[];
}

export interface SeatSheetProps {
  seat: Seat;
  stats: SeatViewStats;
  seats: readonly Seat[];
  similar: SimilarSeat[];
  expanded: boolean;
  containerHeight: number;
  controller: SheetController;
  nudgeX: MotionValue<number>;
  nudgeY: MotionValue<number>;
  reducedMotion: boolean;
  /** Buttons / drag disabled (leaving, checkout open...). */
  disabled: boolean;
  onChangeSeat: () => void;
  onBook: () => void;
  onPickSimilar: (seatId: string) => void;
}

export function SeatSheet({
  seat,
  stats,
  seats,
  similar,
  expanded,
  containerHeight,
  controller,
  nudgeX,
  nudgeY,
  reducedMotion,
  disabled,
  onChangeSeat,
  onBook,
  onPickSimilar,
}: SeatSheetProps) {
  const titleId = useId();
  const extraId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const extraInnerRef = useRef<HTMLDivElement>(null);
  const extraOuterRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  // Measure base + extra heights and report them to the controller (before paint).
  useLayoutEffect(() => {
    const base = baseRef.current;
    const inner = extraInnerRef.current;
    const outer = extraOuterRef.current;
    if (!base || !inner || !outer) return;
    const measure = () => {
      const b = base.offsetHeight;
      const natural = inner.offsetHeight;
      const room = Math.max(0, containerHeight - b - TOP_RESERVE);
      const extra = Math.max(0, Math.min(natural, room));
      outer.style.height = `${extra}px`;
      controller.setMetrics({ base: b, extra });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(base);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [containerHeight, controller]);

  // Move focus into the sheet when it appears so keyboard users land in the seat view.
  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, samples: [] };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.started) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      if (Math.abs(dx) > Math.abs(dy) || !controller.dragStart()) {
        drag.current = null;
        return;
      }
      d.started = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
    }
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    if (d.samples.length > 8) d.samples.shift();
    controller.dragMove(dy);
  };

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.started) return;
    suppressClick.current = true;
    let v = 0;
    const last = d.samples[d.samples.length - 1];
    const first = d.samples.find((s) => last && last.t - s.t <= 100);
    if (!cancelled && first && last && last.t > first.t) v = ((last.y - first.y) / (last.t - first.t)) * 1000;
    controller.dragEnd(v);
  };

  const toggleExpanded = () => {
    if (!disabled) controller.snap(!expanded);
  };

  const price = formatPrice(seat.price);
  const zoneLabel = stats.zone;

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-0"
      initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
      animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
      exit={
        reducedMotion
          ? { opacity: 0, transition: { duration: 0.15 } }
          : { y: '100%', transition: { duration: 0.42, ease: [0.4, 0, 0.7, 0.2] } }
      }
      transition={
        reducedMotion
          ? { duration: 0.18 }
          : { type: 'spring', bounce: 0, duration: 0.6 }
      }
      data-testid="seat-sheet"
    >
      <motion.div style={{ x: nudgeX, y: nudgeY }}>
        <motion.div
          ref={sheetRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{
            y: controller.y,
            background: SHEET_BG,
            pointerEvents: disabled ? 'none' : 'auto',
          }}
          className="relative rounded-t-[28px] border-t border-white/[0.06] shadow-[0_-12px_40px_rgba(0,0,0,0.35)] outline-none backdrop-blur-[24px] backdrop-saturate-150"
        >
          {/* Same glass continues below the sheet so an overdrag never shows a gap. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-full h-[50vh]"
            style={{ background: SHEET_BG }}
            aria-hidden
          />

          <div
            ref={baseRef}
            className="select-none px-5 pb-[max(20px,env(safe-area-inset-bottom))]"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => finishDrag(e, false)}
            onPointerCancel={(e) => finishDrag(e, true)}
            onClickCapture={(e) => {
              if (suppressClick.current) {
                suppressClick.current = false;
                e.stopPropagation();
                e.preventDefault();
              }
            }}
          >
            <button
              type="button"
              onClick={toggleExpanded}
              aria-label={expanded ? 'Collapse seat details' : 'Expand seat details'}
              aria-expanded={expanded}
              aria-controls={extraId}
              className="mx-auto flex h-6 w-16 items-center justify-center outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-white/30"
            >
              <span className="h-[5px] w-9 rounded-full bg-white/20" aria-hidden />
            </button>

            <div className="mt-2 flex items-start justify-between gap-4">
              <motion.div
                key={seat.id}
                className="min-w-0"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reducedMotion ? 0.12 : 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">{zoneLabel}</div>
                <h2 id={titleId} className="mt-1.5 truncate text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                  Row {seat.row}, Seat {seat.number}
                </h2>
                <p className="mt-1 text-[15px] text-fg-2">
                  {seatTypeLabel(seat.type)} · {price}
                </p>
              </motion.div>
              <MiniMap seats={seats} activeSeat={seat} reducedMotion={reducedMotion} />
            </div>

            <StatTiles stats={stats} reducedMotion={reducedMotion} className="mt-5" />

            <div className="mt-4 flex gap-3">
              <motion.button
                type="button"
                onClick={onChangeSeat}
                disabled={disabled}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                className="h-12 flex-1 rounded-full border border-white/[0.16] bg-white/[0.04] text-[15px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Change seat
              </motion.button>
              <motion.button
                type="button"
                onClick={onBook}
                disabled={disabled}
                whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                aria-label={`Book Row ${seat.row}, Seat ${seat.number} for ${price}`}
                className="tabular h-12 flex-1 rounded-full bg-white text-[15px] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Book · {price}
              </motion.button>
            </div>
          </div>

          <div
            ref={extraOuterRef}
            id={extraId}
            data-sheet-scroll
            inert={!expanded}
            aria-hidden={!expanded}
            className="overflow-y-auto overscroll-contain"
            style={{ height: 0, touchAction: 'pan-y' }}
          >
            <div ref={extraInnerRef} className="px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
              <SeatDetails seat={seat} similar={similar} disabled={disabled} onPick={onPickSimilar} />
            </div>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {`Row ${seat.row}, Seat ${seat.number}. ${stats.zone.toLowerCase()}. ${seatTypeLabel(seat.type)}, ${price}. ${formatMetres(stats.distance)} to screen, ${formatDegrees(stats.fov)} field of view, ${stats.side === 'centre' ? 'centre of the row' : `${formatMetres(stats.offset)} ${formatSide(stats.side)}`}.`}
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
