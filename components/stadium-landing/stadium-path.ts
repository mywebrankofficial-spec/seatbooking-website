/**
 * Camera path for the /stadium scroll flythrough. Only imported by the
 * (code-split) rig, since it builds the stadium layout for the shots.
 *
 * Stages: aerial -> dive into the North Stand -> blocks 232 -> 234 -> arc over
 * the pitch to 202 -> rise and turn to the skybox ring (box 12) -> through the
 * glass -> turn from chair 5 to the pitch.
 */
import {
  aerialShot,
  blockShot,
  boxSeatEyeShot,
  skyboxInsideShot,
  skyboxRingShot,
  standShot,
} from '@/lib/stadium-geometry';
import { cloneShot, lerpShot } from '@/lib/venue-engine/shots';
import type { Shot } from '@/lib/venue-engine/types';
import { PATH_KEYS, PATH_MOVES, STAGE_KEY, locate, stageAt, type PathLocation } from './stadium-flythrough-store';

interface KeyShot {
  shot: Shot;
  /** Look direction as yaw (rad, atan2(dx, dz)), pitch (rad) and target distance. */
  yaw: number;
  pitch: number;
  dist: number;
}

const TAU = Math.PI * 2;
/** Gentle orbit (rad) of the aerial shot while the first panel is on screen. */
const AERIAL_ORBIT = -0.32;

let keys: KeyShot[] | null = null;

function toKey(shot: Shot): KeyShot {
  const dx = shot.target.x - shot.position.x;
  const dy = shot.target.y - shot.position.y;
  const dz = shot.target.z - shot.position.z;
  const h = Math.hypot(dx, dz);
  return { shot: cloneShot(shot), yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, h), dist: Math.hypot(h, dy) };
}

function getKeys(): KeyShot[] {
  if (!keys) {
    keys = [
      aerialShot(0),
      standShot('N'),
      blockShot(232),
      blockShot(234),
      blockShot(202),
      skyboxRingShot(12),
      skyboxInsideShot(12),
      boxSeatEyeShot(12, 5),
    ].map(toKey);
    if (keys.length !== PATH_KEYS.length) throw new Error('stadium-path: keyframe count mismatch');
  }
  return keys;
}

const easeInOutCubic = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);

function copyShot(out: Shot, s: Shot): void {
  out.position.x = s.position.x;
  out.position.y = s.position.y;
  out.position.z = s.position.z;
  out.target.x = s.target.x;
  out.target.y = s.target.y;
  out.target.z = s.target.z;
  out.fov = s.fov;
}

/** Signed yaw delta from a to b, in the given turn direction (0 = shortest). */
function yawDelta(a: number, b: number, dir: -1 | 0 | 1): number {
  let d = (b - a) % TAU;
  if (dir === 0) {
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
  } else if (dir < 0) {
    if (d > 0) d -= TAU;
  } else if (d < 0) {
    d += TAU;
  }
  return d;
}

const loc: PathLocation = { key: 0, move: 0, holding: true, hold: 0 };

/** Writes the camera goal shot for `progress` into `out` (allocation free). */
export function writeStadiumPose(progress: number, reduced: boolean, out: Shot): Shot {
  const K = getKeys();

  if (reduced) {
    copyShot(out, K[STAGE_KEY[stageAt(progress)]].shot);
    return out;
  }

  locate(progress, loc);
  const a = K[loc.key];

  if (loc.holding) {
    copyShot(out, a.shot);
    if (loc.key === 0) {
      // Slow orbit around the stadium while the first panel reads.
      const ang = AERIAL_ORBIT * (1 - easeInOutCubic(loc.hold));
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const x = a.shot.position.x;
      const z = a.shot.position.z;
      out.position.x = x * c + z * s;
      out.position.z = -x * s + z * c;
    }
    return out;
  }

  const b = K[loc.key + 1];
  const m = PATH_MOVES[loc.key];
  const e = easeInOutCubic(loc.move);
  const bump = Math.sin(Math.PI * e);

  lerpShot(out, a.shot, b.shot, e);
  out.position.y += m.arc * bump;

  if (m.swing !== undefined) {
    // Turn the view by angle so long 180° turns pan instead of flipping through the camera.
    const yaw = a.yaw + yawDelta(a.yaw, b.yaw, m.swing) * e;
    const pitch = a.pitch + (b.pitch - a.pitch) * e - ((m.dip ?? 0) * Math.PI * bump) / 180;
    const dist = a.dist + (b.dist - a.dist) * e;
    const cp = Math.cos(pitch);
    out.target.x = out.position.x + Math.sin(yaw) * cp * dist;
    out.target.y = out.position.y + Math.sin(pitch) * dist;
    out.target.z = out.position.z + Math.cos(yaw) * cp * dist;
  }
  return out;
}
