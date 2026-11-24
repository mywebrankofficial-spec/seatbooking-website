'use client';
/**
 * Screen anchors: a 3D world point projected to screen pixels every frame, so DOM
 * cards (HoverCard, labels) can follow objects in the scene without React re-renders.
 *
 *   const anchor = createScreenAnchor();
 *   anchor.setWorld({x, y, z})              // from pointer events / selection
 *   <ProjectAnchor anchor={anchor} />       // inside the R3F <Canvas>
 *   useAnchorPosition(anchor, ref)          // in a DOM component: writes ref.style.transform
 */
import { useEffect } from 'react';
import type { Vec3 } from './types';

export interface ScreenAnchor {
  world: Vec3 | null;
  /** CSS px relative to the canvas element's top-left. */
  x: number;
  y: number;
  /** Canvas size in CSS px (for flipping cards near edges). */
  width: number;
  height: number;
  /** False when behind the camera or no world point. */
  visible: boolean;
  setWorld(p: Vec3 | null): void;
  subscribe(fn: () => void): () => void;
  /** Called by ProjectAnchor after updating x/y. */
  notify(): void;
}

export function createScreenAnchor(): ScreenAnchor {
  const listeners = new Set<() => void>();
  const a: ScreenAnchor = {
    world: null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
    setWorld(p) {
      a.world = p ? { x: p.x, y: p.y, z: p.z } : null;
      if (!p) {
        a.visible = false;
        a.notify();
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify() {
      listeners.forEach((fn) => fn());
    },
  };
  return a;
}

/**
 * Subscribes a DOM element to an anchor and positions it with a transform.
 * `place` maps anchor coords to the final CSS translate (e.g. flip near edges).
 */
export function useAnchorPosition(
  anchor: ScreenAnchor,
  ref: React.RefObject<HTMLElement | null>,
  place?: (a: ScreenAnchor, el: HTMLElement) => { x: number; y: number },
): void {
  useEffect(() => {
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const p = place ? place(anchor, el) : { x: anchor.x, y: anchor.y };
      el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
      el.style.visibility = anchor.visible ? 'visible' : 'hidden';
    };
    apply();
    return anchor.subscribe(apply);
  }, [anchor, ref, place]);
}
