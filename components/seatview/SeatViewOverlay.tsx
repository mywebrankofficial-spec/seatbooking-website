'use client';
/**
 * Seat view UI (Screen B): header + bottom sheet + gesture layer above the 3D canvas.
 *
 * Visibility: shown while mode === 'seat', and kept mounted during our own scrub
 * (mode flips to 'transition') and during seat-to-seat glides (moveToSeat), so the
 * sheet never jumps. On Change seat / Escape the header fades and the sheet slides
 * down while the camera rises.
 *
 * Input:
 *   - drag sheet down / wheel up      -> scrub the camera back towards the map
 *   - drag sheet up / tap handle / wheel down -> expand the sheet (store.sheetExpanded)
 *   - swipe on the 3D view (GestureLayer) or arrow keys -> neighbouring available seat / row
 *     (swipe LEFT = seat to the RIGHT, swipe UP = row forward; ArrowRight = right, ArrowUp = forward)
 *   - Escape -> Change seat
 */
import { AnimatePresence, animate, motionValue, useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBooking } from '@/store/booking';
import { computeStats } from '@/lib/hall-geometry';
import { exitToMap, moveToSeat } from '@/lib/transitions';
import { GestureLayer, type SwipeDirection } from './GestureLayer';
import { SeatSheet } from './SeatSheet';
import { SeatViewHeader } from './SeatViewHeader';
import {
  nearestAvailableInAdjacentRow,
  nextAvailableInRow,
  seatLookup,
  similarSeats,
} from './seat-nav';
import { useSheetController } from './useSheetController';

const WHEEL_END_MS = 150;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Axis = 'seat' | 'row';

export function SeatViewOverlay() {
  const mode = useBooking((s) => s.mode);
  const seats = useBooking((s) => s.seats);
  const seatId = useBooking((s) => s.cameraSeatId ?? s.selectedSeatId);
  const expanded = useBooking((s) => s.sheetExpanded);
  const checkoutOpen = useBooking((s) => s.checkoutOpen);
  const reducedMotion = useBooking((s) => s.reducedMotion);

  const byId = useMemo(() => seatLookup(seats), [seats]);
  const seat = seatId ? (byId.get(seatId) ?? null) : null;
  const stats = useMemo(() => (seat ? computeStats(seat) : null), [seat]);
  const similar = useMemo(() => (seat ? similarSeats(seats, seat) : []), [seats, seat]);

  const [moving, setMoving] = useState(false);
  const [exiting, setExiting] = useState(false);
  const movingRef = useRef(false);
  const moveCount = useRef(0);
  const moveGen = useRef(0);
  const pendingTarget = useRef<string | null>(null);

  const ctrl = useSheetController({
    reducedMotion,
    canScrub: () => {
      const st = useBooking.getState();
      return st.mode === 'seat' && !st.checkoutOpen && !movingRef.current;
    },
  });
  const ctrlRef = useRef(ctrl);
  ctrlRef.current = ctrl;
  const { reset, syncExpanded } = ctrl;

  const nudgeX = useMotionValue(0);
  const nudgeY = useMotionValue(0);

  const visible = !!seat && !exiting && (mode === 'seat' || ctrl.scrubbing || moving);
  const interactive =
    visible && !ctrl.leaving && !ctrl.scrubbing && !checkoutOpen && (mode === 'seat' || moving);

  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  /* ---------------- container size ---------------- */
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setContainerHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------- lifecycle ---------------- */
  const clearMoves = useCallback(() => {
    moveGen.current += 1;
    moveCount.current = 0;
    pendingTarget.current = null;
    movingRef.current = false;
    setMoving(false);
  }, []);

  useEffect(() => {
    if (mode !== 'transition') setExiting(false);
    if (mode === 'map') clearMoves();
  }, [mode, clearMoves]);

  // Fresh sheet state every time the overlay appears.
  useLayoutEffect(() => {
    if (visible) reset();
  }, [visible, reset]);

  // Store -> sheet (e.g. exitToMap resets sheetExpanded, or another component toggles it).
  useEffect(() => {
    syncExpanded(expanded);
  }, [expanded, syncExpanded]);

  /* ---------------- actions ---------------- */
  const onExit = useCallback(() => {
    if (useBooking.getState().mode === 'map') return;
    clearMoves();
    setExiting(true);
    void exitToMap();
  }, [clearMoves]);

  const onBook = useCallback(() => {
    useBooking.getState().setCheckoutOpen(true);
  }, []);

  const go = useCallback((id: string) => {
    const gen = moveGen.current;
    pendingTarget.current = id;
    moveCount.current += 1;
    movingRef.current = true;
    setMoving(true);
    navigator.vibrate?.(6);
    moveToSeat(id)
      .catch(() => undefined)
      .finally(() => {
        if (gen !== moveGen.current) return;
        moveCount.current -= 1;
        if (moveCount.current <= 0) {
          moveCount.current = 0;
          pendingTarget.current = null;
          movingRef.current = false;
          setMoving(false);
        }
      });
  }, []);

  const bounce = useCallback(
    (axis: Axis, dir: -1 | 1) => {
      if (reducedRef.current) return;
      // Nudge in the direction of the finger (opposite of the seat we tried to reach), then settle.
      const mv = axis === 'seat' ? nudgeX : nudgeY;
      const d = axis === 'seat' ? -dir * 14 : dir * 10;
      animate(mv, [0, d, 0], { duration: 0.45, times: [0, 0.3, 1], ease: ['easeOut', [0.22, 1, 0.36, 1]] });
    },
    [nudgeX, nudgeY],
  );

  /** axis 'seat': dir -1 = left, +1 = right. axis 'row': dir -1 = forward, +1 = back. */
  const step = useCallback(
    (axis: Axis, dir: -1 | 1) => {
      const st = useBooking.getState();
      const from = pendingTarget.current ?? st.cameraSeatId ?? st.selectedSeatId;
      if (!from) return;
      const target =
        axis === 'seat'
          ? nextAvailableInRow(seatLookup(st.seats), from, dir)
          : nearestAvailableInAdjacentRow(st.seats, from, dir);
      if (!target || target === from) bounce(axis, dir);
      else go(target);
    },
    [bounce, go],
  );

  const onSwipe = useCallback(
    (d: SwipeDirection) => {
      if (d === 'left') step('seat', 1);
      else if (d === 'right') step('seat', -1);
      else if (d === 'up') step('row', -1);
      else step('row', 1);
    },
    [step],
  );

  const onPickSimilar = useCallback(
    (id: string) => {
      ctrlRef.current.snap(false);
      go(id);
    },
    [go],
  );

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!interactiveRef.current || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const inScroller = !!t?.closest?.('[data-sheet-scroll]');
      switch (e.key) {
        case 'ArrowLeft':
          step('seat', -1);
          break;
        case 'ArrowRight':
          step('seat', 1);
          break;
        case 'ArrowUp':
          if (inScroller) return;
          step('row', -1);
          break;
        case 'ArrowDown':
          if (inScroller) return;
          step('row', 1);
          break;
        case 'Escape':
          onExit();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onExit]);

  /* ---------------- wheel / trackpad ---------------- */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const wheelMV = motionValue(0);
    const w: {
      intent: null | 'scrub' | 'expand' | 'collapse' | 'none';
      target: number;
      timer: number | undefined;
      anim: { stop: () => void } | null;
    } = { intent: null, target: 0, timer: undefined, anim: null };

    const end = () => {
      w.timer = undefined;
      if (w.intent === 'scrub') {
        w.anim?.stop();
        w.anim = null;
        ctrlRef.current.updateScrub(w.target);
        void ctrlRef.current.releaseScrub(0);
      }
      w.intent = null;
      w.target = 0;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pinch-zoom gesture
      const c = ctrlRef.current;
      if (w.intent === null && (!interactiveRef.current || c.isBusy())) return;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= el.clientHeight;

      // Let the expanded sheet's own content scroll natively while it can.
      if (w.intent !== 'scrub' && expandedRef.current) {
        const scroller = (e.target as Element | null)?.closest?.('[data-sheet-scroll]') as HTMLElement | null;
        if (scroller) {
          const canDown = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
          const canUp = scroller.scrollTop > 0;
          if ((dy > 0 && canDown) || (dy < 0 && canUp)) return;
        }
      }

      e.preventDefault();
      window.clearTimeout(w.timer);
      w.timer = window.setTimeout(end, WHEEL_END_MS);

      if (w.intent === null) {
        if (Math.abs(dy) < 2) return;
        if (dy < 0) w.intent = expandedRef.current ? 'collapse' : c.beginScrub() ? 'scrub' : 'none';
        else w.intent = expandedRef.current ? 'none' : 'expand';
        if (w.intent === 'expand') c.snap(true);
        else if (w.intent === 'collapse') c.snap(false);
        else if (w.intent === 'scrub') {
          w.target = 0;
          wheelMV.set(0);
        }
      }

      if (w.intent === 'scrub') {
        // Scroll up (dy < 0) pulls the camera back; scrolling the other way returns it.
        w.target = clamp01(w.target - dy / c.travel());
        w.anim?.stop();
        w.anim = animate(wheelMV, w.target, {
          duration: 0.12,
          ease: 'easeOut',
          onUpdate: (v) => ctrlRef.current.updateScrub(v),
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(w.timer);
      w.anim?.stop();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-testid="seat-view-overlay"
    >
      {visible && <GestureLayer enabled={interactive} onSwipe={onSwipe} />}
      <AnimatePresence>
        {visible && seat && (
          <SeatViewHeader
            key="seat-header"
            seatId={seat.id}
            scrubAmount={ctrl.amount}
            reducedMotion={reducedMotion}
            disabled={ctrl.leaving || ctrl.scrubbing}
            onBack={onExit}
          />
        )}
        {visible && seat && stats && (
          <SeatSheet
            key="seat-sheet"
            seat={seat}
            stats={stats}
            seats={seats}
            similar={similar}
            expanded={expanded}
            containerHeight={containerHeight}
            controller={ctrl}
            nudgeX={nudgeX}
            nudgeY={nudgeY}
            reducedMotion={reducedMotion}
            disabled={ctrl.leaving}
            onChangeSeat={onExit}
            onBook={onBook}
            onPickSimilar={onPickSimilar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
