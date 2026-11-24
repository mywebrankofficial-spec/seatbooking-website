/**
 * Wheel / pinch zoom within a level, and threshold navigation between levels.
 *
 * `zoom.value` is a dolly fraction of the shot distance (+ = closer), clamped to ±MAX and
 * springing back to 0 when input stops (StadiumCameraRig applies it). Input past the clamp
 * accumulates in `zoom.overflow`; past ±THRESHOLD it goes one level deeper (into the hovered
 * target, if any) or back(). After a level change the wheel is locked until the input stream
 * goes quiet, so trackpad momentum can't chain several levels.
 */
import { useStadium } from '@/store/stadium';
import { back, deeperIntoHover, director } from '@/lib/stadium-nav';

export const ZOOM_MAX = 0.25;
export const ZOOM_THRESHOLD = 0.3;
/** Quiet time (ms) after which the zoom springs back / the lock releases. */
export const ZOOM_IDLE_MS = 420;
const LOCK_GAP_MS = 260;

export const zoom = {
  value: 0,
  overflow: 0,
  lastInput: 0,
  locked: false,
};

/** Rubber-band extra dolly shown while overflowing toward a level change. */
export function zoomRubber(): number {
  return 0.06 * Math.tanh(zoom.overflow / ZOOM_THRESHOLD);
}

/** Feed a zoom delta (+ = in). */
export function zoomInput(delta: number): void {
  const now = performance.now();
  const gap = now - zoom.lastInput;
  zoom.lastInput = now;
  const s = useStadium.getState();
  if (s.transitioning || director.flying || s.checkoutOpen) {
    zoom.overflow = 0;
    return;
  }
  if (zoom.locked) {
    if (gap < LOCK_GAP_MS) return;
    zoom.locked = false;
  }
  if (zoom.overflow !== 0 && Math.sign(delta) !== Math.sign(zoom.overflow)) zoom.overflow = 0;
  let v = zoom.value + delta;
  if (v > ZOOM_MAX) {
    zoom.overflow += v - ZOOM_MAX;
    v = ZOOM_MAX;
  } else if (v < -ZOOM_MAX) {
    zoom.overflow += v + ZOOM_MAX;
    v = -ZOOM_MAX;
  }
  zoom.value = v;

  if (zoom.overflow > ZOOM_THRESHOLD) {
    if (deeperIntoHover()) {
      zoom.overflow = 0;
      zoom.locked = true;
    } else {
      zoom.overflow = ZOOM_THRESHOLD; // nothing hovered: just hold the rubber band
    }
  } else if (zoom.overflow < -ZOOM_THRESHOLD) {
    zoom.overflow = 0;
    if (s.level !== 'aerial') {
      zoom.locked = true;
      void back();
    } else {
      zoom.overflow = -ZOOM_THRESHOLD;
    }
  }
}

/** Per-frame spring back (called by the rig). */
export function updateZoom(dt: number): void {
  const idle = performance.now() - zoom.lastInput > ZOOM_IDLE_MS || director.flying;
  if (idle) {
    const k = 1 - Math.exp(-dt * (director.flying ? 7 : 4.5));
    zoom.value -= zoom.value * k;
    zoom.overflow -= zoom.overflow * Math.min(1, k * 1.6);
    if (Math.abs(zoom.value) < 1e-4) zoom.value = 0;
    if (Math.abs(zoom.overflow) < 1e-4) zoom.overflow = 0;
  }
}
