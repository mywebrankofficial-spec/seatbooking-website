/**
 * Camera path math for the booking flow (pure functions, no React, no three.js).
 *
 * The camera is a pure function of state:
 *   pose = f(progress, cameraSeatId, glide, viewport size, mapFrame, reducedMotion)
 * CameraRig evaluates it every frame; GSAP only tweens the numbers that feed it.
 *
 * A pose is position + yaw/pitch (three.js Euler order 'YXZ', roll is always 0, so
 * the horizon stays level during every move) + vertical fov + a vertical lens shift.
 *
 * Lens shift (`shiftY`, NDC units): the optical axis is drawn at NDC y = shiftY
 * instead of the image centre (CameraRig maps it onto `camera.setViewOffset`). Like a
 * tilt-shift lens it moves the framing without tilting the camera, so the screen can
 * sit in the top part of the view (the bottom ~45% is covered by the bottom sheet)
 * while the camera still looks straight at it, i.e. without keystone distortion.
 */
import type { Rect, Seat } from '@/types/cinema';
import {
  DEFAULT_LAYOUT,
  EYE_BACK_OFFSET,
  EYE_HEIGHT,
  MAP_WORLD_RECT,
  SEAT_SIZE,
  eyePosition,
  overheadCamera,
  screenCentre,
} from '@/lib/hall-geometry';

export interface CamPose {
  x: number;
  y: number;
  z: number;
  /** Rotation about world +y (radians). 0 = looking towards the screen (-z). */
  yaw: number;
  /** Rotation about camera x (radians). -PI/2 = straight down, + = looking up. */
  pitch: number;
  /** Vertical fov, degrees. */
  fov: number;
  /** Optical axis position in NDC y (0 = centred, 0.6 = 30% of the height above centre). */
  shiftY: number;
}

export function createPose(): CamPose {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 50, shiftY: 0 };
}

export function copyPose(out: CamPose, a: CamPose): CamPose {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  out.yaw = a.yaw;
  out.pitch = a.pitch;
  out.fov = a.fov;
  out.shiftY = a.shiftY;
  return out;
}

const DEG = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/* ------------------------------------------------------------------ */
/* Overhead (2D map aligned)                                            */
/* ------------------------------------------------------------------ */

/** BookingExperience scales the 2D map by 1 + this * crossfade(0..1) about the column centre. */
export const MAP_CROSSFADE_SCALE = 0.025;

/**
 * Converts the store's `mapFrame` (viewport px) to canvas-relative px, optionally
 * scaled about the canvas centre (to follow the 2D map's crossfade scale).
 */
export function frameToCanvas(
  frame: Rect,
  canvasLeft: number,
  canvasTop: number,
  size: { width: number; height: number },
  scale = 1,
  out: Rect = { left: 0, top: 0, width: 0, height: 0 },
): Rect {
  const cx = size.width / 2;
  const cy = size.height / 2;
  out.left = cx + (frame.left - canvasLeft - cx) * scale;
  out.top = cy + (frame.top - canvasTop - cy) * scale;
  out.width = frame.width * scale;
  out.height = frame.height * scale;
  return out;
}

/**
 * Top-down pose whose projection of MAP_WORLD_RECT lands exactly on `frame`
 * (canvas-relative px). Wraps hall-geometry `overheadCamera` (looking straight
 * down with up = -z, i.e. Euler YXZ pitch -90deg, yaw 0).
 */
export function overheadPose(
  size: { width: number; height: number },
  frame: Rect | null,
  out: CamPose = createPose(),
): CamPose {
  const cam = overheadCamera(DEFAULT_LAYOUT, size, frame);
  out.x = cam.position.x;
  out.y = cam.position.y;
  out.z = cam.position.z;
  out.yaw = 0;
  out.pitch = -Math.PI / 2;
  out.fov = cam.fov;
  out.shiftY = 0;
  return out;
}

/* ------------------------------------------------------------------ */
/* Seat view framing                                                    */
/* ------------------------------------------------------------------ */

/** Horizontal fov target of the seat view (F8's curved screen spans ~66deg, it must fit). */
export const SEAT_HFOV = 70;
/** Vertical fov clamp: portrait 390x844 needs ~113deg for the hfov target; wide viewports get 50deg. */
export const SEAT_MAX_VFOV = 114;
export const SEAT_MIN_VFOV = 50;
/** Where the screen centre is drawn (NDC y) when the camera looks straight at it. */
export const SCREEN_NDC_Y_PORTRAIT = 0.6;
export const SCREEN_NDC_Y_LANDSCAPE = 0.35;
/** Portrait: top of the row-in-front seat backs stays at or above this NDC y (sheet top is ~-0.1). */
export const FRONT_BACKS_MIN_NDC_Y = 0.02;
/** Portrait: max pitch below the screen centre used to keep the seat backs in view. */
export const MAX_TILT_BELOW_SCREEN = 10 * DEG;

/** Elevation (radians, negative = below eye level) of the top of the seat backs one row ahead. */
export const FRONT_BACKS_ELEVATION = Math.atan2(
  SEAT_SIZE.backHeight - DEFAULT_LAYOUT.rowRise - EYE_HEIGHT,
  DEFAULT_LAYOUT.rowPitch + EYE_BACK_OFFSET - SEAT_SIZE.depth / 2,
);

const SCREEN_CENTRE = screenCentre(DEFAULT_LAYOUT);

/**
 * Vertical fov (degrees) of the seat view for a viewport aspect (width / height):
 * horizontal fov SEAT_HFOV, vertical clamped to [SEAT_MIN_VFOV, SEAT_MAX_VFOV]
 * (so wide landscape viewports end up at a 50deg vertical fov).
 */
export function seatFov(aspect: number): number {
  const v = (2 * Math.atan(Math.tan((SEAT_HFOV * DEG) / 2) / aspect)) / DEG;
  return Math.min(SEAT_MAX_VFOV, Math.max(SEAT_MIN_VFOV, v));
}

/**
 * Seated pose: at the eye, yawed towards the screen centre (off-centre seats see it
 * skewed), pitched at the screen centre, the lens shifted so the screen sits in the
 * upper part. In portrait, if that would push the row-in-front seat backs under the
 * sheet (front rows, where the screen is high above), the pitch is lowered (by at most
 * MAX_TILT_BELOW_SCREEN) until they show.
 */
export function seatPose(
  seat: Pick<Seat, 'row' | 'number'>,
  aspect: number,
  out: CamPose = createPose(),
): CamPose {
  const eye = eyePosition(seat, DEFAULT_LAYOUT);
  const dx = SCREEN_CENTRE.x - eye.x;
  const dy = SCREEN_CENTRE.y - eye.y;
  const dz = SCREEN_CENTRE.z - eye.z;
  const fov = seatFov(aspect);
  const tanHalf = Math.tan((fov * DEG) / 2);
  const shiftY = aspect >= 1 ? SCREEN_NDC_Y_LANDSCAPE : SCREEN_NDC_Y_PORTRAIT;
  const toScreen = Math.atan2(dy, Math.hypot(dx, dz));
  // Portrait: highest pitch at which the front seat backs are still drawn at
  // FRONT_BACKS_MIN_NDC_Y. Landscape lacks the vertical fov for both: the screen wins.
  const maxPitch =
    aspect >= 1
      ? toScreen
      : FRONT_BACKS_ELEVATION - Math.atan((FRONT_BACKS_MIN_NDC_Y - shiftY) * tanHalf);
  out.x = eye.x;
  out.y = eye.y;
  out.z = eye.z;
  out.yaw = Math.atan2(-dx, -dz);
  out.pitch = Math.max(toScreen - MAX_TILT_BELOW_SCREEN, Math.min(toScreen, maxPitch));
  out.fov = fov;
  out.shiftY = shiftY;
  return out;
}

/* ------------------------------------------------------------------ */
/* Flight overhead -> seat                                              */
/* ------------------------------------------------------------------ */

/** Rearmost z the low part of the flight may use (stay inside the back wall). */
const BACK_LIMIT_Z = MAP_WORLD_RECT.maxZ;

function bezier(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** Orientation weight: slow start, most of the tilt-up in the second half, flat landing. */
export function flightTurn(t: number): number {
  return Math.pow(smoothstep(clamp01(t)), 1.5);
}

/**
 * Pose along the flight, t in 0..1 (0 = overhead, 1 = seated). Position follows a
 * cubic Bezier that swoops down and forward:
 *   overhead -> high above and somewhat behind the seat -> just above/behind the eye -> eye
 * (the last leg drops almost vertically, so going back the camera lifts straight up
 * out of the seat). Orientation turns from straight down to the seat view with
 * most of the tilt in the second half; fov widens in tan space; lens shift follows
 * the orientation.
 */
export function flightPose(
  t: number,
  overhead: CamPose,
  seat: CamPose,
  out: CamPose = createPose(),
): CamPose {
  const k = clamp01(t);
  const p1x = lerp(overhead.x, seat.x, 0.6);
  const p1y = seat.y + (overhead.y - seat.y) * 0.4;
  const p1z = Math.max(seat.z, Math.min(seat.z + 3.2, BACK_LIMIT_Z + 1));
  const p2x = seat.x;
  const p2y = seat.y + 1.6;
  const p2z = Math.max(seat.z, Math.min(seat.z + 0.7, BACK_LIMIT_Z - 0.05));
  out.x = bezier(overhead.x, p1x, p2x, seat.x, k);
  out.y = bezier(overhead.y, p1y, p2y, seat.y, k);
  out.z = bezier(overhead.z, p1z, p2z, seat.z, k);

  const q = flightTurn(k);
  out.yaw = lerp(overhead.yaw, seat.yaw, q);
  out.pitch = lerp(overhead.pitch, seat.pitch, q);
  out.shiftY = lerp(overhead.shiftY, seat.shiftY, q);

  const ta = Math.tan((overhead.fov * DEG) / 2);
  const tb = Math.tan((seat.fov * DEG) / 2);
  out.fov = (2 * Math.atan(lerp(ta, tb, smoothstep(k)))) / DEG;
  return out;
}

/**
 * Full mapping of store progress to a pose.
 *   [0, crossfadeEnd]  -> overhead
 *   (crossfadeEnd, 1]  -> flightPose((p - crossfadeEnd) / (1 - crossfadeEnd))
 * Reduced motion: any progress > 0 is the seat pose (the change is the canvas crossfade).
 * `seat` null -> overhead.
 */
export function pathPose(
  progress: number,
  crossfadeEnd: number,
  overhead: CamPose,
  seat: CamPose | null,
  reducedMotion: boolean,
  out: CamPose = createPose(),
): CamPose {
  if (!seat) return copyPose(out, overhead);
  if (reducedMotion) return copyPose(out, progress > 0 ? seat : overhead);
  if (progress <= crossfadeEnd) return copyPose(out, overhead);
  return flightPose((progress - crossfadeEnd) / (1 - crossfadeEnd), overhead, seat, out);
}

/**
 * Blend between two poses (seat-to-seat glide), g in 0..1, with an optional vertical
 * arc that peaks at `lift` metres half way.
 */
export function blendPose(out: CamPose, a: CamPose, b: CamPose, g: number, lift = 0): CamPose {
  const k = clamp01(g);
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k) + lift * 4 * k * (1 - k);
  out.z = lerp(a.z, b.z, k);
  out.yaw = lerp(a.yaw, b.yaw, k);
  out.pitch = lerp(a.pitch, b.pitch, k);
  out.fov = lerp(a.fov, b.fov, k);
  out.shiftY = lerp(a.shiftY, b.shiftY, k);
  return out;
}
