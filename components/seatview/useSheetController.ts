'use client';
/**
 * Bottom-sheet motion controller. Everything that moves per frame lives in
 * MotionValues; React state only flips at gesture boundaries (scrub start/end).
 *
 * Inner sheet offset `y` (px, translateY of the sheet body):
 *   0            -> expanded (extra info visible)
 *   extra        -> default / collapsed rest position
 *   extra + d    -> dragged d px below rest: scrubbing the camera back towards the map
 */
import { animate, useMotionValue, type MotionValue } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { endScrub, scrubTo, startScrub } from '@/lib/transitions';
import { useBooking } from '@/store/booking';

export interface SheetMetrics {
  /** Visible height of the default (collapsed) sheet. */
  base: number;
  /** Extra height revealed when expanded. */
  extra: number;
}

export interface SheetController {
  y: MotionValue<number>;
  /** Scrub amount 0 (seated) .. 1 (back at the map); also drives header fade. */
  amount: MotionValue<number>;
  /** React-level flags (change at gesture boundaries only). */
  scrubbing: boolean;
  leaving: boolean;
  setMetrics: (m: SheetMetrics) => void;
  reset: () => void;
  syncExpanded: (expanded: boolean) => void;
  snap: (expanded: boolean, velocity?: number) => void;
  dragStart: () => boolean;
  dragMove: (dy: number) => void;
  dragEnd: (velocityY: number) => void;
  beginScrub: () => boolean;
  updateScrub: (amount: number, followY?: boolean) => void;
  releaseScrub: (velocityY: number) => Promise<'seat' | 'map'>;
  isBusy: () => boolean;
  travel: () => number;
}

type Anim = { stop: () => void };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const SNAP_SPRING = { type: 'spring' as const, stiffness: 420, damping: 44, mass: 1 };
const LEAVE_EASE = [0.32, 0.72, 0, 1] as const;

export function useSheetController(opts: { reducedMotion: boolean; canScrub: () => boolean }): SheetController {
  const y = useMotionValue(0);
  const amount = useMotionValue(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const metrics = useRef<SheetMetrics>({ base: 0, extra: 0 });
  const dragging = useRef(false);
  const dragOrigin = useRef(0);
  const scrub = useRef<'none' | 'active' | 'settling'>('none');
  const expandedTarget = useRef(false);
  const yAnim = useRef<Anim | null>(null);
  const aAnim = useRef<Anim | null>(null);
  const yAnimating = useRef(false);

  const api = useMemo<Omit<SheetController, 'scrubbing' | 'leaving'>>(() => {
    const rest = (expanded: boolean) => (expanded ? 0 : metrics.current.extra);
    const travel = () => Math.max(160, metrics.current.base * 0.9);
    const reduced = () => optsRef.current.reducedMotion;

    const stop = () => {
      yAnim.current?.stop();
      aAnim.current?.stop();
      yAnim.current = aAnim.current = null;
      yAnimating.current = false;
    };

    const animateY = (to: number, velocity = 0, leave = false) => {
      yAnim.current?.stop();
      yAnimating.current = true;
      const transition = reduced()
        ? { duration: 0.18, ease: 'easeOut' as const }
        : leave
          ? { duration: 0.5, ease: LEAVE_EASE }
          : { ...SNAP_SPRING, velocity };
      yAnim.current = animate(y, to, {
        ...transition,
        onComplete: () => {
          yAnimating.current = false;
        },
      });
    };

    const animateAmount = (to: number) => {
      aAnim.current?.stop();
      aAnim.current = animate(amount, to, reduced() ? { duration: 0.18 } : { duration: 0.45, ease: 'easeOut' });
    };

    const idle = () => !dragging.current && scrub.current === 'none';

    const snap = (expanded: boolean, velocity = 0) => {
      expandedTarget.current = expanded;
      const st = useBooking.getState();
      if (st.sheetExpanded !== expanded) st.setSheetExpanded(expanded);
      animateY(rest(expanded), velocity);
    };

    const beginScrub = () => {
      if (scrub.current === 'active') return true;
      if (scrub.current === 'settling' || !optsRef.current.canScrub()) return false;
      aAnim.current?.stop();
      startScrub();
      scrub.current = 'active';
      setScrubbing(true);
      expandedTarget.current = false;
      const st = useBooking.getState();
      if (st.sheetExpanded) st.setSheetExpanded(false);
      return true;
    };

    const updateScrub = (a: number, followY = true) => {
      if (scrub.current !== 'active') return;
      const v = clamp01(a);
      amount.set(v);
      scrubTo(v);
      if (followY) {
        yAnim.current?.stop();
        y.set(metrics.current.extra + v * travel());
      }
    };

    const leave = () => {
      setLeaving(true);
      animateY(metrics.current.extra + metrics.current.base + 48, 0, true);
      animateAmount(1);
    };

    const settleBack = (velocity: number) => {
      setLeaving(false);
      animateY(rest(false), velocity);
      animateAmount(0);
    };

    const releaseScrub = async (velocityY: number): Promise<'seat' | 'map'> => {
      if (scrub.current !== 'active') return 'seat';
      scrub.current = 'settling';
      // Predict the outcome with the same rule endScrub uses so the sheet reacts on release.
      const predictMap = amount.get() >= 0.5 || velocityY > 800;
      if (predictMap) leave();
      else settleBack(velocityY);
      let result: 'seat' | 'map' = 'seat';
      try {
        result = await endScrub(velocityY);
      } catch {
        result = useBooking.getState().mode === 'map' ? 'map' : 'seat';
      }
      if (result === 'map' && !predictMap) leave();
      if (result === 'seat' && predictMap) settleBack(0);
      scrub.current = 'none';
      setScrubbing(false);
      return result;
    };

    return {
      y,
      amount,
      travel,
      isBusy: () => !idle(),
      setMetrics: (m) => {
        const prev = metrics.current;
        if (prev.base === m.base && prev.extra === m.extra) return;
        metrics.current = m;
        if (!idle()) return;
        const r = rest(expandedTarget.current);
        if (yAnimating.current) animateY(r);
        else y.set(r);
      },
      reset: () => {
        stop();
        dragging.current = false;
        scrub.current = 'none';
        expandedTarget.current = useBooking.getState().sheetExpanded;
        amount.set(0);
        y.set(rest(expandedTarget.current));
        setLeaving(false);
        setScrubbing(false);
      },
      syncExpanded: (expanded) => {
        if (!idle() || expanded === expandedTarget.current) return;
        snap(expanded);
      },
      snap,
      dragStart: () => {
        if (scrub.current !== 'none') return false;
        yAnim.current?.stop();
        yAnimating.current = false;
        dragging.current = true;
        dragOrigin.current = y.get();
        return true;
      },
      dragMove: (dy) => {
        if (!dragging.current) return;
        const C = metrics.current.extra;
        const pos = dragOrigin.current + dy;
        if (pos > C + 0.5 && scrub.current === 'none') beginScrub();
        if (scrub.current === 'active') {
          const over = pos - C;
          const t = travel();
          updateScrub(over / t, false);
          y.set(pos < 0 ? pos * 0.3 : over > t ? C + t + (over - t) * 0.3 : pos);
        } else {
          // Rubber band past the expanded top and (if scrubbing is unavailable) past rest.
          y.set(pos < 0 ? pos * 0.3 : pos > C ? C + (pos - C) * 0.3 : pos);
        }
      },
      dragEnd: (velocityY) => {
        if (!dragging.current) return;
        dragging.current = false;
        if (scrub.current === 'active') {
          void releaseScrub(velocityY);
          return;
        }
        const C = metrics.current.extra;
        const pos = y.get();
        let expanded: boolean;
        if (C < 1) expanded = false;
        else if (velocityY < -450) expanded = true;
        else if (velocityY > 450) expanded = false;
        else expanded = pos < C / 2;
        snap(expanded, velocityY);
      },
      beginScrub,
      updateScrub,
      releaseScrub,
    };
    // MotionValues and refs are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(() => ({ ...api, scrubbing, leaving }), [api, scrubbing, leaving]);
}
