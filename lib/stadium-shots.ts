/**
 * Tuned camera shots for the stadium booking flow (owned by Interaction & Camera).
 *
 * Wraps the geometry baselines (lib/stadium-geometry.ts) with framings that match the
 * reference video, plus the pose maths used by lib/stadium-nav.ts for flights:
 *   - shots are authored for a 16:10 viewport (REF_ASPECT); `adaptToAspect` widens the
 *     vertical fov (and dollies back where safe) so portrait phones still frame well;
 *   - `interpolateShots` blends position linearly (+ optional vertical arc) and the look
 *     direction by yaw/pitch, so 180° turns (seat → pitch) never flip through lookAt.
 *
 * The roof membrane covers the whole bowl (ROOF.innerD = -6, ~40-44 m high), so every
 * shot below the aerial one stays under the roof rim and looks out from the pitch side.
 */
import type { Shot, Vec3 } from '@/lib/venue-engine/types';
import {
  SKYBOX,
  STAND_BY_ID,
  TIERS,
  aerialShot,
  chairEye,
  getStadiumLayout,
  seatEye,
  seatPosition,
  standFrame,
  type Frame,
  type StandId,
} from '@/lib/stadium-geometry';
import type { PickTarget, StadiumLevel } from '@/store/stadium';

/** Aspect ratio the shots are authored for. */
export const REF_ASPECT = 1.6;

/* ------------------------------------------------------------------ */
/* Tuned shots                                                          */
/* ------------------------------------------------------------------ */

/** Aerial: stadium small in the centre of the park, orbit angle 0 = seen from the south. */
export function tunedAerial(orbitAngle = 0): Shot {
  const s = aerialShot(orbitAngle);
  // A little higher/wider than the baseline so the bowl sits small in the park (~45% of the width).
  const k = 380 / 350;
  s.position.x *= k;
  s.position.y *= k;
  s.position.z *= k;
  s.fov = 40;
  return s;
}

/** Stand: over the pitch under the roof rim, the stand wedge fills the frame, pitch edge at the bottom. */
export function tunedStand(standId: StandId): Shot {
  const s = STAND_BY_ID[standId];
  const back = s.kind === 'end' ? -34 : s.kind === 'corner' ? -36 : -42;
  const p = standFrame(s, 0.5, back);
  const t = standFrame(s, 0.5, 19);
  return { position: { x: p.x, y: 37, z: p.z }, target: { x: t.x, y: 12.5, z: t.z }, fov: 54 };
}

/** Block: close and almost straight on, neighbouring blocks at the edges. */
export function tunedBlock(blockId: number): Shot {
  const b = getStadiumLayout().blockById.get(blockId);
  if (!b) return tunedAerial(0);
  const c = b.centre;
  const dist = 21;
  return {
    position: { x: c.x - b.nx * dist, y: c.y + 6, z: c.z - b.nz * dist },
    target: { x: c.x, y: c.y - 0.4, z: c.z },
    fov: 42,
  };
}

/** Seat rush: right into the row, chosen seat large in mid-frame. */
export function tunedSeatRush(index: number): Shot {
  const p = seatPosition(index);
  const yaw = getStadiumLayout().seatYaw[index];
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return {
    position: { x: p.x + fx * 2.9, y: p.y + 2.15, z: p.z + fz * 2.9 },
    target: { x: p.x, y: p.y + 0.45, z: p.z },
    fov: 40,
  };
}

/** Eye level from a seat, looking at the pitch with the far roof rim in frame. */
export function tunedSeatEye(index: number): Shot {
  const e = seatEye(index);
  return { position: e, target: { x: e.x * 0.15, y: 4, z: e.z * 0.15 }, fov: 60 };
}

/** VIP ring: facing the row of glass boxes (blue fascia above, red tiers above/below). */
export function tunedSkyboxRing(boxId: number): Shot {
  const box = getStadiumLayout().skyboxById.get(boxId);
  if (!box) return tunedAerial(0);
  const s = STAND_BY_ID[box.side];
  const f = standFrame(s, box.sigma, 5);
  const t = standFrame(s, box.sigma, SKYBOX.glassD + 1);
  return {
    position: { x: f.x, y: 19.6, z: f.z },
    target: { x: t.x, y: SKYBOX.floorY + 1.9, z: t.z },
    fov: 44,
  };
}

/** VIP box: just through the glass, looking in at the leather chairs. */
export function tunedSkyboxInside(boxId: number): Shot {
  const box = getStadiumLayout().skyboxById.get(boxId);
  if (!box) return tunedAerial(0);
  const s = STAND_BY_ID[box.side];
  const f = standFrame(s, box.sigma, SKYBOX.glassD + 0.35);
  const t = standFrame(s, box.sigma, SKYBOX.glassD + 3.6);
  return {
    position: { x: f.x, y: SKYBOX.floorY + 2.4, z: f.z },
    target: { x: t.x, y: SKYBOX.floorY + 0.5, z: t.z },
    fov: 62,
  };
}

/** VIP chair eye: roof truss + screen and the pitch. */
export function tunedBoxSeatEye(boxId: number, chairN: number): Shot {
  const box = getStadiumLayout().skyboxById.get(boxId);
  if (!box || !box.chairs[chairN - 1]) return tunedAerial(0);
  const e = chairEye(box, chairN);
  return { position: e, target: { x: e.x * 0.1, y: 5, z: e.z * 0.1 }, fov: 64 };
}

export interface ShotState {
  level: StadiumLevel;
  standId: StandId | null;
  blockId: number | null;
  seatIndex: number | null;
  skyboxId: number | null;
  chair: number | null;
}

/** The resting shot for a booking state (null if its selection is missing). */
export function shotForState(s: ShotState, orbitAngle = 0): Shot | null {
  switch (s.level) {
    case 'aerial':
      return tunedAerial(orbitAngle);
    case 'stand':
      return s.standId ? tunedStand(s.standId) : null;
    case 'block':
      return s.blockId !== null ? tunedBlock(s.blockId) : null;
    case 'ticket':
      return s.seatIndex !== null ? tunedSeatRush(s.seatIndex) : null;
    case 'seatView':
      return s.seatIndex !== null ? tunedSeatEye(s.seatIndex) : null;
    case 'skyboxes':
      return tunedSkyboxRing(s.skyboxId ?? 12);
    case 'box':
      return s.skyboxId !== null ? tunedSkyboxInside(s.skyboxId) : null;
    case 'boxView':
      return s.skyboxId !== null && s.chair !== null ? tunedBoxSeatEye(s.skyboxId, s.chair) : null;
  }
}

/** Aerial orbit angle whose view direction matches a shot's horizontal view direction. */
export function aerialAngleFor(shot: Shot): number {
  const vx = shot.target.x - shot.position.x;
  const vz = shot.target.z - shot.position.z;
  if (Math.hypot(vx, vz) < 1e-6) return 0;
  return Math.atan2(-vx, -vz);
}

/* ------------------------------------------------------------------ */
/* Card anchors (stable world points, not raw ray hits)                 */
/* ------------------------------------------------------------------ */

const _f: Frame = {} as Frame;

export function anchorFor(t: PickTarget): Vec3 | null {
  const L = getStadiumLayout();
  switch (t.type) {
    case 'stand': {
      const f = standFrame(STAND_BY_ID[t.standId], 0.5, 50, _f);
      return { x: f.x, y: 40, z: f.z };
    }
    case 'block': {
      const b = L.blockById.get(t.blockId);
      if (!b) return null;
      const tier = TIERS[b.tier - 1];
      const f = standFrame(STAND_BY_ID[b.standId], (b.sigma0 + b.sigma1) / 2, tier.d0 + tier.rows * tier.rowDepth, _f);
      return { x: f.x, y: tier.y0 + (tier.rows - 1) * tier.rise + 1.3, z: f.z };
    }
    case 'seat': {
      if (t.seatIndex < 0 || t.seatIndex >= L.seatCount) return null;
      const p = seatPosition(t.seatIndex);
      return { x: p.x, y: p.y + 1.0, z: p.z };
    }
    case 'skybox': {
      const box = L.skyboxById.get(t.skyboxId);
      return box ? { ...box.glass } : null;
    }
    case 'chair': {
      const c = L.skyboxById.get(t.skyboxId)?.chairs[t.chair - 1];
      return c ? { x: c.position.x, y: c.position.y + 1.1, z: c.position.z } : null;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Pose interpolation                                                   */
/* ------------------------------------------------------------------ */

const MAX_PITCH = 1.45;

export interface Pose {
  p: Vec3;
  yaw: number;
  pitch: number;
  dist: number;
  fov: number;
}

export function shotToPose(s: Shot, out?: Pose): Pose {
  const dx = s.target.x - s.position.x;
  const dy = s.target.y - s.position.y;
  const dz = s.target.z - s.position.z;
  const o = out ?? { p: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, dist: 1, fov: 50 };
  o.p.x = s.position.x;
  o.p.y = s.position.y;
  o.p.z = s.position.z;
  o.yaw = Math.atan2(dx, dz);
  o.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(dy, Math.hypot(dx, dz))));
  o.dist = Math.max(0.05, Math.hypot(dx, dy, dz));
  o.fov = s.fov;
  return o;
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

export function copyShot(dst: Shot, src: Shot): Shot {
  dst.position.x = src.position.x;
  dst.position.y = src.position.y;
  dst.position.z = src.position.z;
  dst.target.x = src.target.x;
  dst.target.y = src.target.y;
  dst.target.z = src.target.z;
  dst.fov = src.fov;
  return dst;
}

export function makeShot(): Shot {
  return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 50 };
}

const _pa: Pose = { p: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, dist: 1, fov: 50 };
const _pb: Pose = { p: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, dist: 1, fov: 50 };

/**
 * Blend two shots. `ep` = position/fov progress, `eo` = orientation progress (both eased 0..1),
 * `arc` = extra height mid-flight (sine hump on ep).
 */
export function interpolateShots(a: Shot, b: Shot, ep: number, eo: number, arc: number, out: Shot): Shot {
  const A = shotToPose(a, _pa);
  const B = shotToPose(b, _pb);
  const px = A.p.x + (B.p.x - A.p.x) * ep;
  const py = A.p.y + (B.p.y - A.p.y) * ep + arc * Math.sin(Math.PI * ep);
  const pz = A.p.z + (B.p.z - A.p.z) * ep;
  // Small turns: lerp the look target (keeps the subject framed during dives / rises).
  // Big turns (seat → pitch, box glass → chair eye): rotate yaw/pitch so lookAt never flips.
  // Blended smoothly on the yaw difference so moving start shots (spiral dive) stay continuous.
  const dYaw = Math.abs(wrapAngle(B.yaw - A.yaw));
  const w = smoothstep(TURN_BLEND0, TURN_BLEND1, dYaw);
  const lx = a.target.x + (b.target.x - a.target.x) * eo;
  const ly = a.target.y + (b.target.y - a.target.y) * eo;
  const lz = a.target.z + (b.target.z - a.target.z) * eo;
  let tx = lx;
  let ty = ly;
  let tz = lz;
  if (w > 0) {
    const yaw = lerpAngle(A.yaw, B.yaw, eo);
    const pitch = A.pitch + (B.pitch - A.pitch) * eo;
    const dist = Math.exp(Math.log(A.dist) + (Math.log(B.dist) - Math.log(A.dist)) * eo);
    const cp = Math.cos(pitch);
    tx = lx + (px + Math.sin(yaw) * cp * dist - lx) * w;
    ty = ly + (py + Math.sin(pitch) * dist - ly) * w;
    tz = lz + (pz + Math.cos(yaw) * cp * dist - lz) * w;
  }
  out.position.x = px;
  out.position.y = py;
  out.position.z = pz;
  out.target.x = tx;
  out.target.y = ty;
  out.target.z = tz;
  out.fov = A.fov + (B.fov - A.fov) * ep;
  return out;
}

const TURN_BLEND0 = (55 * Math.PI) / 180;
const TURN_BLEND1 = (100 * Math.PI) / 180;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ */
/* Aspect adaptation                                                    */
/* ------------------------------------------------------------------ */

const FOV_CAP = (76 * Math.PI) / 180;

/**
 * Portrait / narrow viewports: widen the vertical fov to keep most of the authored horizontal
 * framing; beyond FOV_CAP, dolly back along the view direction by `dollyWeight` (0 for eye-level
 * shots that must not leave the seat). Writes into `out`.
 */
export function adaptToAspect(shot: Shot, aspect: number, dollyWeight: number, out: Shot): Shot {
  copyShot(out, shot);
  if (!(aspect > 0) || aspect >= REF_ASPECT) return out;
  const want = Math.tan(((shot.fov * Math.PI) / 180) / 2) * Math.pow(REF_ASPECT / aspect, 0.85);
  const capT = Math.tan(FOV_CAP / 2);
  const tanFov = Math.min(want, capT);
  out.fov = (2 * Math.atan(tanFov) * 180) / Math.PI;
  const mult = 1 + (want / tanFov - 1) * Math.max(0, Math.min(1, dollyWeight));
  if (mult > 1.0001) {
    out.position.x = shot.target.x + (shot.position.x - shot.target.x) * mult;
    out.position.y = shot.target.y + (shot.position.y - shot.target.y) * mult;
    out.position.z = shot.target.z + (shot.position.z - shot.target.z) * mult;
  }
  return out;
}
