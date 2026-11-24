/**
 * /stadium landing flythrough: scroll progress store + path timeline.
 *
 * Deliberately separate from the booking store (and from the cinema landing
 * store). Geometry-free so the overlay can import it without pulling in the
 * stadium layout; the actual camera shots live in `stadium-path.ts`, which only
 * the (code-split) rig imports.
 *
 * The path is a list of keyframes (camera shots) with a "hold" (scroll spent
 * resting on that shot) and a "move" to the next one. Durations are in
 * arbitrary timeline units; progress 0..1 is mapped linearly over their sum.
 */
import { useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ */
/* Timeline                                                             */
/* ------------------------------------------------------------------ */

export interface StageCopy {
  title: string;
  line: string;
}

/** Text panels shown over the canvas, one per stage. */
export const STAGES: readonly StageCopy[] = [
  { title: 'Start in the sky.', line: 'The whole Arena, from above, before you pick a side.' },
  { title: 'Dive into any stand.', line: 'One tap and you drop straight into the bowl.' },
  { title: 'Walk the tiers.', line: 'Glide block to block and see what is still free.' },
  { title: 'Step into a skybox.', line: 'Leather recliners, glass front, the whole pitch below.' },
  { title: 'See the pitch from your seat.', line: 'A real 3D view from the exact chair you buy.' },
];

export interface PathKey {
  /** Stage (text panel) this keyframe belongs to. */
  stage: number;
  /** Timeline units spent resting on this shot. */
  hold: number;
}

export interface PathMove {
  /** Timeline units spent moving to the next keyframe. */
  dur: number;
  /** Extra height (m) at the middle of the move (sine arc). */
  arc: number;
  /**
   * Swing moves turn the view direction by angle (yaw/pitch) instead of
   * lerping the look target, for 180° turns where the target would pass
   * through the camera. -1 / +1 = turn direction (yaw), 0 = shortest.
   */
  swing?: -1 | 0 | 1;
  /** Extra downward look (deg) at the middle of a swing. */
  dip?: number;
}

/**
 * Keyframes (see stadium-path.ts for the matching shots):
 *  0 aerial · 1 North Stand · 2 Block 232 · 3 Block 234 · 4 Block 202 (South)
 *  5 Skybox ring (12) · 6 inside Skybox 12 · 7 Skybox 12 seat 5 eye
 */
export const PATH_KEYS: readonly PathKey[] = [
  { stage: 0, hold: 0.8 },
  { stage: 1, hold: 0.55 },
  { stage: 2, hold: 0.3 },
  { stage: 2, hold: 0.15 },
  { stage: 2, hold: 0.45 },
  { stage: 3, hold: 0.35 },
  { stage: 3, hold: 0.35 },
  { stage: 4, hold: 0.9 },
];

export const PATH_MOVES: readonly PathMove[] = [
  { dur: 1.4, arc: 0 }, // dive into the bowl
  { dur: 0.8, arc: 0 }, // down to block 232
  { dur: 0.7, arc: 2 }, // along the middle tier to 234
  { dur: 1.4, arc: 30, swing: 1, dip: 38 }, // arc over the pitch to 202, looking west down its length
  { dur: 1.4, arc: 18, swing: -1, dip: 26 }, // rise and turn to the skybox ring
  { dur: 0.75, arc: 0 }, // glide through the glass
  { dur: 1.0, arc: 0, swing: 0, dip: 0 }, // turn from the chair to the pitch
];

/** Keyframe shown per stage when stepping (prefers-reduced-motion). */
export const STAGE_KEY: readonly number[] = [0, 1, 2, 5, 7];

/** Cumulative start of each keyframe's hold, and of each move, in timeline units. */
const HOLD_START: number[] = [];
const MOVE_START: number[] = [];
let total = 0;
for (let i = 0; i < PATH_KEYS.length; i++) {
  HOLD_START.push(total);
  total += PATH_KEYS[i].hold;
  if (i < PATH_MOVES.length) {
    MOVE_START.push(total);
    total += PATH_MOVES[i].dur;
  }
}
const TOTAL = total;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Scratch result of `locate` (mutated in place, no allocation). */
export interface PathLocation {
  /** Keyframe index the camera is at / leaving. */
  key: number;
  /** 0 while holding on `key`, otherwise raw 0..1 progress of the move key -> key+1. */
  move: number;
  /** True while resting on `key`. */
  holding: boolean;
  /** 0..1 progress through the hold of `key` (only meaningful while holding). */
  hold: number;
}

export function locate(progress: number, out: PathLocation): PathLocation {
  const u = clamp01(progress) * TOTAL;
  for (let i = PATH_KEYS.length - 1; i >= 0; i--) {
    if (u >= HOLD_START[i]) {
      const holdEnd = HOLD_START[i] + PATH_KEYS[i].hold;
      out.key = i;
      if (u <= holdEnd || i >= PATH_MOVES.length) {
        out.holding = true;
        out.move = 0;
        out.hold = PATH_KEYS[i].hold > 0 ? clamp01((u - HOLD_START[i]) / PATH_KEYS[i].hold) : 1;
      } else {
        out.holding = false;
        out.hold = 1;
        out.move = clamp01((u - MOVE_START[i]) / PATH_MOVES[i].dur);
      }
      return out;
    }
  }
  out.key = 0;
  out.holding = true;
  out.move = 0;
  out.hold = 0;
  return out;
}

const scratch: PathLocation = { key: 0, move: 0, holding: true, hold: 0 };

/** Stage (text panel) at a progress; switches halfway through a move. */
export function stageAt(progress: number): number {
  const l = locate(progress, scratch);
  if (l.holding || l.move < 0.5) return PATH_KEYS[l.key].stage;
  return PATH_KEYS[Math.min(l.key + 1, PATH_KEYS.length - 1)].stage;
}

/** Scroll progress at which a stage's representative keyframe is centred. */
export function stageProgress(stage: number): number {
  const k = STAGE_KEY[stage] ?? 0;
  return (HOLD_START[k] + PATH_KEYS[k].hold / 2) / TOTAL;
}

/* ------------------------------------------------------------------ */
/* Store                                                                */
/* ------------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Mutable, read every frame by StadiumLandingRig (no React re-render involved). */
export const stadiumFlyState = {
  progress: 0,
  reduced: false,
  stage: 0,
};

function emit(): void {
  listeners.forEach((l) => l());
}

export function setStadiumFlyProgress(progress: number): void {
  const p = clamp01(progress);
  if (p === stadiumFlyState.progress) return;
  stadiumFlyState.progress = p;
  stadiumFlyState.stage = stageAt(p);
  emit();
}

export function setStadiumFlyReduced(reduced: boolean): void {
  if (reduced === stadiumFlyState.reduced) return;
  stadiumFlyState.reduced = reduced;
  emit();
}

export function subscribeStadiumFly(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getStage = () => stadiumFlyState.stage;
const getServerStage = () => 0;

/** Current stage index; re-renders only when the stage changes. */
export function useStadiumStage(): number {
  return useSyncExternalStore(subscribeStadiumFly, getStage, getServerStage);
}
