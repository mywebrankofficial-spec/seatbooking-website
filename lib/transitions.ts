/**
 * Camera & motion transitions for the booking flow.
 *
 * GSAP only tweens numbers: the store's `progress` (via a plain proxy object and
 * `setProgress` in onUpdate) and the module-level `glide` value below. It never
 * touches the camera; CameraRig turns those numbers into a pose every frame
 * (see lib/camera-path.ts).
 *
 * Every function copes with being called mid-transition: it kills the running
 * progress tween and continues from the current progress, never snapping. Promises of
 * interrupted calls resolve when they are superseded.
 *
 * SSR: gsap is SSR safe to import and nothing here touches `window` at import time;
 * tweens are only created when these functions are called (client side).
 */
import { gsap } from 'gsap';
import { CROSSFADE_END, useBooking } from '@/store/booking';
import { createPose, type CamPose } from '@/lib/camera-path';
import { parseSeatId } from '@/lib/hall-geometry';

/* ------------------------------------------------------------------ */
/* Shared state with CameraRig (module level, mutated, never rendered)   */
/* ------------------------------------------------------------------ */

/** Last pose CameraRig applied to the camera (written every frame by the rig). */
export const rigState: { ready: boolean; pose: CamPose } = { ready: false, pose: createPose() };

/**
 * Seat-to-seat glide. While active, the rig shows
 *   blendPose(from, pathPose(progress, cameraSeat), t, lift)
 * so the camera moves smoothly from wherever it was (`from`, a snapshot of the
 * displayed pose) to the path pose of the new seat.
 */
export const glide: {
  active: boolean;
  t: number;
  lift: number;
  seatId: string | null;
  from: CamPose;
} = { active: false, t: 1, lift: 0, seatId: null, from: createPose() };

/* ------------------------------------------------------------------ */
/* Durations                                                            */
/* ------------------------------------------------------------------ */

const CROSSFADE_IN_S = 0.35;
const FLIGHT_IN_S = 1.25;
const FLIGHT_OUT_S = 1.1;
const CROSSFADE_OUT_S = 0.35;
const GLIDE_S = 0.65;
const REDUCED_S = 0.45;
/** Row change glides arc up by this much (m). */
const ROW_CHANGE_LIFT = 0.35;
/** Downward fling speed (px/s) that completes a scrub to the map regardless of distance. */
const FLING_PX_S = 800;

/* ------------------------------------------------------------------ */
/* Progress tween plumbing                                              */
/* ------------------------------------------------------------------ */

const proxy = { p: 0 };
let progressAnim: gsap.core.Animation | null = null;
let progressWaiters: Array<() => void> = [];
let glideTween: gsap.core.Tween | null = null;
let glideWaiters: Array<() => void> = [];

function flush(list: Array<() => void>): void {
  for (const fn of list) fn();
}

function killProgress(): void {
  if (progressAnim) {
    progressAnim.kill();
    progressAnim = null;
  }
  const w = progressWaiters;
  progressWaiters = [];
  flush(w);
}

const writeProgress = () => useBooking.getState().setProgress(proxy.p);

interface Segment {
  to: number;
  duration: number;
  ease: string;
}

/**
 * Runs `segments` on the store progress from its current value. Resolves when done
 * (after `onDone`) or when superseded by another call.
 */
function animateProgress(segments: Segment[], onDone: () => void): Promise<void> {
  killProgress();
  proxy.p = useBooking.getState().progress;
  const live = segments.filter((s) => s.duration > 0.001);
  if (live.length === 0) {
    const last = segments[segments.length - 1];
    if (last) useBooking.getState().setProgress(last.to);
    onDone();
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    progressWaiters.push(resolve);
    const tl = gsap.timeline({
      onComplete: () => {
        if (progressAnim !== tl) return;
        progressAnim = null;
        onDone();
        const w = progressWaiters;
        progressWaiters = [];
        flush(w);
      },
    });
    for (const s of live) tl.to(proxy, { p: s.to, duration: s.duration, ease: s.ease, onUpdate: writeProgress });
    progressAnim = tl;
  });
}

/* ------------------------------------------------------------------ */
/* Glide plumbing                                                       */
/* ------------------------------------------------------------------ */

function endGlide(): void {
  glide.active = false;
  glide.t = 1;
  glideTween = null;
  const w = glideWaiters;
  glideWaiters = [];
  flush(w);
}

function cancelGlide(): void {
  if (glideTween) glideTween.kill();
  endGlide();
}

/**
 * Starts a glide from the currently displayed pose towards the path pose of
 * `seatId` (already set as the store's cameraSeatId by the caller). Interrupting a
 * glide starts from the current interpolated pose, so there are no jumps.
 * Also used by CameraRig when cameraSeatId changes behind our back mid-flight.
 */
export function beginGlide(seatId: string | null, lift = 0, duration = GLIDE_S): Promise<void> {
  if (glideTween) glideTween.kill();
  const pending = glideWaiters;
  glideWaiters = [];
  flush(pending);
  if (!rigState.ready || duration <= 0) {
    endGlide();
    return Promise.resolve();
  }
  // Snapshot what is on screen right now (blended if a glide was running).
  const f = glide.from;
  const p = rigState.pose;
  f.x = p.x;
  f.y = p.y;
  f.z = p.z;
  f.yaw = p.yaw;
  f.pitch = p.pitch;
  f.fov = p.fov;
  f.shiftY = p.shiftY;
  glide.active = true;
  glide.t = 0;
  glide.lift = lift;
  glide.seatId = seatId;
  return new Promise<void>((resolve) => {
    glideWaiters.push(resolve);
    const tw = gsap.to(glide, {
      t: 1,
      duration,
      ease: 'power2.inOut',
      onComplete: () => {
        if (glideTween === tw) endGlide();
      },
    });
    glideTween = tw;
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

/** Map -> overhead 3D -> fly down into `seatId`. Resolves when seated (mode 'seat'). */
export async function enterSeat(seatId: string): Promise<void> {
  const st = useBooking.getState();
  const p0 = st.progress;
  const reduced = st.reducedMotion;
  const prev = st.cameraSeatId;
  useBooking.setState({ selectedSeatId: seatId, cameraSeatId: seatId, mode: 'transition' });
  // Re-targeting mid-flight: glide from the displayed pose instead of jumping.
  if (prev && prev !== seatId && p0 > CROSSFADE_END && !reduced) void beginGlide(seatId, ROW_CHANGE_LIFT);
  const done = () => useBooking.getState().setMode('seat');

  if (reduced) {
    return animateProgress([{ to: 1, duration: REDUCED_S * (1 - p0), ease: 'none' }], done);
  }
  const segments: Segment[] = [];
  if (p0 < CROSSFADE_END) {
    segments.push({
      to: CROSSFADE_END,
      duration: (CROSSFADE_IN_S * (CROSSFADE_END - p0)) / CROSSFADE_END,
      ease: 'power1.out',
    });
  }
  const from = Math.max(p0, CROSSFADE_END);
  const frac = (1 - from) / (1 - CROSSFADE_END);
  segments.push({
    to: 1,
    duration: FLIGHT_IN_S * frac,
    // A full flight eases in and out; a resumed one (e.g. reversing an exit) eases softer.
    ease: frac > 0.999 ? 'power3.inOut' : 'power2.inOut',
  });
  return animateProgress(segments, done);
}

/** Exit with an optional first-leg ease (scrub release keeps moving: ease-out). */
function runExit(releaseEase?: string): Promise<void> {
  const st = useBooking.getState();
  const p0 = st.progress;
  useBooking.setState({ sheetExpanded: false, mode: 'transition' });
  const done = () => useBooking.getState().setMode('map');

  if (st.reducedMotion) {
    return animateProgress([{ to: 0, duration: REDUCED_S * p0, ease: 'none' }], done);
  }
  const segments: Segment[] = [];
  if (p0 > CROSSFADE_END) {
    const frac = (p0 - CROSSFADE_END) / (1 - CROSSFADE_END);
    segments.push({
      to: CROSSFADE_END,
      duration: FLIGHT_OUT_S * frac,
      ease: releaseEase ?? (frac > 0.999 ? 'power3.inOut' : 'power2.inOut'),
    });
  }
  segments.push({
    to: 0,
    duration: (CROSSFADE_OUT_S * Math.min(p0, CROSSFADE_END)) / CROSSFADE_END,
    ease: 'power1.inOut',
  });
  return animateProgress(segments, done);
}

/** Seat -> rise to overhead -> crossfade to 2D map. Resolves when mode is 'map'. */
export async function exitToMap(): Promise<void> {
  return runExit();
}

/** While seated: glide the camera to another seat (neighbour in row / row in front or behind). */
export async function moveToSeat(seatId: string): Promise<void> {
  const st = useBooking.getState();
  const prev = st.cameraSeatId;
  // Stats in the UI update immediately; the camera follows.
  useBooking.setState({ selectedSeatId: seatId, cameraSeatId: seatId });
  if (!prev || prev === seatId) return;
  if (st.reducedMotion || st.progress <= CROSSFADE_END) {
    cancelGlide();
    return;
  }
  const rowChange = parseSeatId(prev).row !== parseSeatId(seatId).row;
  return beginGlide(seatId, rowChange ? ROW_CHANGE_LIFT : 0);
}

/** Begin a user-driven scrub (sheet drag / scroll). Kills running tweens. */
export function startScrub(): void {
  killProgress();
  useBooking.getState().setMode('transition');
}

/** amount: 0 = seated, 1 = fully back at the overhead view (still in 3D). */
export function scrubTo(amount: number): void {
  if (progressAnim) killProgress();
  const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
  const st = useBooking.getState();
  st.setProgress(1 - a * (1 - CROSSFADE_END));
  if (st.mode !== 'transition') st.setMode('transition');
}

/**
 * Release the scrub. velocity: px/s, positive = downward (towards the map).
 * Past 50% (unless flung back up) or a fast downward fling completes to the map,
 * otherwise snaps back to the seat.
 */
export async function endScrub(velocity = 0): Promise<'seat' | 'map'> {
  const { progress } = useBooking.getState();
  const amount = Math.min(1, Math.max(0, (1 - progress) / (1 - CROSSFADE_END)));
  const toMap = velocity > FLING_PX_S || (amount >= 0.5 && velocity > -FLING_PX_S);
  if (toMap) {
    await runExit('power2.out');
    return 'map';
  }
  const done = () => useBooking.getState().setMode('seat');
  const reduced = useBooking.getState().reducedMotion;
  await animateProgress(
    [{ to: 1, duration: reduced ? REDUCED_S * amount : 0.25 + 0.5 * amount, ease: reduced ? 'none' : 'power3.out' }],
    done,
  );
  return 'seat';
}
