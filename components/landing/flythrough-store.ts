/**
 * Landing-page flythrough: scroll progress store + camera path.
 *
 * Deliberately separate from the booking store: the landing page owns its own
 * tiny mutable state so the booking flow's progress/mode are never touched.
 *
 * progress 0 -> 1 maps to:
 *   [0, INTRO_END]  camera descends from high above row I into seat I8
 *   [INTRO_END, 1]  camera glides row by row I -> A along seat 8 at seated eye
 *                   height, easing within each row so it settles at every row.
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_LAYOUT, OVERHEAD_PLANE_Y, eyePosition, rowZ, screenCentre, seatX } from '@/lib/hall-geometry';
import type { Vec3 } from '@/types/cinema';

/* ------------------------------------------------------------------ */
/* Path constants                                                       */
/* ------------------------------------------------------------------ */

/** Centre-block seat the camera travels along (row I8 -> A8). */
export const FLY_SEAT_NUMBER = 8;
const ROWS = DEFAULT_LAYOUT.rows;
const N = ROWS.length;
const BACK_ROW = N - 1;

/** Fraction of the scroll spent descending from overhead into the back row. */
export const INTRO_END = 0.12;
/** Extra scroll (in row units) held still on the first and last row. */
const END_HOLD = 0.45;
/** Fraction of each row-to-row segment spent settled at either end. */
const DWELL = 0.2;
/** Upward arc (m) while gliding over the seat backs between rows. */
const GLIDE_LIFT = 0.22;

/** Eye positions ordered back to front: index 0 = row I, N-1 = row A. */
const EYES: readonly Vec3[] = ROWS.map((_, i) =>
  eyePosition({ row: ROWS[BACK_ROW - i], number: FLY_SEAT_NUMBER }),
);
const SCREEN = screenCentre();

const X = seatX(FLY_SEAT_NUMBER);
const INTRO_POS: Vec3 = { x: X, y: OVERHEAD_PLANE_Y + 11, z: rowZ(BACK_ROW) + 0.6 };
const INTRO_TARGET: Vec3 = { x: X, y: 0.4, z: rowZ(3) };

/* ------------------------------------------------------------------ */
/* Math helpers (allocation free)                                       */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (v: number) => v * v * (3 - 2 * v);
const easeInOutCubic = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);

function lerpInto(out: Vec3, a: Vec3, b: Vec3, t: number): void {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
}

function copyInto(out: Vec3, a: Vec3): void {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
}

/** Raw (un-eased) travel coordinate in row units: 0 = row I .. N-1 = row A. */
function rawTravel(progress: number): number {
  const u = clamp01((progress - INTRO_END) / (1 - INTRO_END));
  const t = u * (N - 1 + 2 * END_HOLD) - END_HOLD;
  return t < 0 ? 0 : t > N - 1 ? N - 1 : t;
}

/** Eased travel coordinate: settles briefly on each row. */
function easedTravel(progress: number): number {
  const t = rawTravel(progress);
  const k = Math.min(Math.floor(t), N - 2);
  const f = t - k;
  const g = clamp01((f - DWELL) / (1 - 2 * DWELL));
  return k + smoothstep(g);
}

/** Row index (A = 0 .. I = N-1) the camera is currently in / nearest to. */
export function activeRowIndexAt(progress: number): number {
  if (progress < INTRO_END) return BACK_ROW;
  return BACK_ROW - Math.round(rawTravel(progress));
}

/**
 * Writes the camera goal pose for `progress` into `outPos` / `outTarget`.
 * With `reduced` the intro is skipped and the camera jumps from row to row.
 */
export function writeFlythroughPose(progress: number, reduced: boolean, outPos: Vec3, outTarget: Vec3): void {
  if (reduced) {
    copyInto(outPos, EYES[BACK_ROW - activeRowIndexAt(progress)]);
    copyInto(outTarget, SCREEN);
    return;
  }

  if (progress < INTRO_END) {
    const s = easeInOutCubic(clamp01(progress / INTRO_END));
    lerpInto(outPos, INTRO_POS, EYES[0], s);
    lerpInto(outTarget, INTRO_TARGET, SCREEN, s);
    return;
  }

  const t = easedTravel(progress);
  const k = Math.min(Math.floor(t), N - 2);
  const e = t - k;
  lerpInto(outPos, EYES[k], EYES[k + 1], e);
  outPos.y += Math.sin(Math.PI * e) * GLIDE_LIFT;
  copyInto(outTarget, SCREEN);
}

/**
 * Vertical fov (deg): ~50 in landscape, widening in portrait so more of the
 * screen stays in frame (keeps roughly a 64 deg horizontal fov, capped at 90).
 */
export function landingFov(aspect: number): number {
  const hHalf = (32 * Math.PI) / 180;
  const v = (2 * Math.atan(Math.tan(hHalf) / Math.max(aspect, 0.1)) * 180) / Math.PI;
  return v < 62 ? 62 : v > 100 ? 100 : v;
}

/* ------------------------------------------------------------------ */
/* Store                                                                */
/* ------------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Mutable, read every frame by LandingRig (no React re-render involved). */
export const flythroughState = {
  progress: 0,
  reduced: false,
  activeRow: BACK_ROW,
};

function emit(): void {
  listeners.forEach((l) => l());
}

export function setFlythroughProgress(progress: number): void {
  const p = clamp01(progress);
  if (p === flythroughState.progress) return;
  flythroughState.progress = p;
  flythroughState.activeRow = activeRowIndexAt(p);
  emit();
}

export function setFlythroughReduced(reduced: boolean): void {
  if (reduced === flythroughState.reduced) return;
  flythroughState.reduced = reduced;
  emit();
}

export function subscribeFlythrough(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getActiveRow = () => flythroughState.activeRow;
const getServerActiveRow = () => BACK_ROW;

/** Active row index (A = 0 .. I = 8); re-renders only when the row changes. */
export function useActiveRowIndex(): number {
  return useSyncExternalStore(subscribeFlythrough, getActiveRow, getServerActiveRow);
}

export function rowLetter(index: number): string {
  return ROWS[index];
}

export const LANDING_ROWS = ROWS;
