'use client';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { mapFrameHeight } from '@/lib/hall-geometry';
import { useBooking } from '@/store/booking';
import type { Rect } from '@/types/cinema';
import { ScreenArc } from './ScreenArc';
import { SeatGrid } from './SeatGrid';

/** Height / width of the world box (mapFrameHeight is linear in width). */
const WORLD_ASPECT = mapFrameHeight(1);

interface MapAreaProps {
  onContinue: () => void;
}

/**
 * Takes all free vertical space and centres the map frame inside it. The frame is a
 * literal top-down projection of MAP_WORLD_RECT; its viewport rect is published to the
 * store so the overhead 3D camera can line up with it exactly.
 */
export function MapArea({ onContinue }: MapAreaProps) {
  const spaceRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);

  // Measure the free space (content box) before paint.
  useLayoutEffect(() => {
    const el = spaceRef.current;
    if (!el) return;
    const read = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setSpace((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = space ? Math.max(0, Math.floor(Math.min(space.width, space.height / WORLD_ASPECT))) : 0;
  const H = mapFrameHeight(W);
  const frameLeft = space ? Math.round((space.width - W) / 2) : 0;
  const frameTop = space ? Math.round((space.height - H) / 2) : 0;

  usePublishMapFrame(frameRef, W);

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={spaceRef} className="absolute inset-x-3 inset-y-1">
        {W > 0 && (
          <div
            ref={frameRef}
            data-seatmap-frame
            className="absolute"
            style={{
              width: W,
              height: H,
              left: frameLeft,
              top: frameTop,
            }}
          >
            <ScreenArc frameWidth={W} />
            <SeatGrid frameWidth={W} onContinue={onContinue} />
          </div>
        )}
      </div>
    </div>
  );
}

const EPS = 0.5;
function sameRect(a: Rect | null, b: Rect): boolean {
  return (
    !!a &&
    Math.abs(a.left - b.left) < EPS &&
    Math.abs(a.top - b.top) < EPS &&
    Math.abs(a.width - b.width) < EPS &&
    Math.abs(a.height - b.height) < EPS
  );
}

/**
 * Publishes the frame's viewport rect to the store. Only measures while the map is the
 * resting view (mode 'map', progress 0): during the crossfade the parent scales this
 * layer, which would distort the rect.
 */
function usePublishMapFrame(ref: RefObject<HTMLDivElement | null>, frameWidth: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || frameWidth <= 0) return;
    let raf = 0;

    const measure = () => {
      const st = useBooking.getState();
      if (st.mode !== 'map' || st.progress > 0.0001) return;
      const r = el.getBoundingClientRect();
      const next: Rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      if (!sameRect(st.mapFrame, next)) st.setMapFrame(next);
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.visualViewport?.addEventListener('resize', schedule);

    const unsub = useBooking.subscribe((s, prev) => {
      const resting = s.mode === 'map' && s.progress <= 0.0001;
      const wasResting = prev.mode === 'map' && prev.progress <= 0.0001;
      if (resting && !wasResting) schedule();
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.visualViewport?.removeEventListener('resize', schedule);
      unsub();
    };
  }, [ref, frameWidth]);
}
