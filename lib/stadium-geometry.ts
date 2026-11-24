/**
 * SINGLE SOURCE OF TRUTH for the stadium ("Arena") geometry.
 *
 * World (metres, three.js): y up, pitch centred at the origin on y = 0.
 *   +x = East, -x = West, -z = North, +z = South. Pitch length (105) runs along x.
 *
 * The bowl is a rounded rectangle around the pitch. Every point of the seating bowl is
 * addressed by (stand, sigma, d):
 *   sigma in [0,1] runs CLOCKWISE (seen from above, north at the top) along the stand,
 *   d = metres outward from the inner bowl edge (the pitch-side boundary).
 * `standFrame(stand, sigma, d)` turns that into a world position + outward normal.
 *
 * Numbering (like real stadiums):
 *   block id = tier digit * 100 + block index (e.g. 232 = middle tier, block 32)
 *   rows 1.. from the front, seats 1.. from the LEFT as seen by a spectator facing the pitch.
 */
import type { Shot, Vec3 } from '@/lib/venue-engine/types';

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

export const PITCH = { length: 105, width: 68, runOff: 6 };

/** Inner bowl boundary (rounded rectangle) at d = 0. */
export const BOWL = { halfX: 58.5, halfZ: 40, cornerR: 14 };

export const SEAT = { pitch: 0.56, aisle: 1.3, eyeHeight: 1.15, eyeBack: 0.12, backHeight: 0.82 };

export type TierId = 1 | 2 | 3;
export interface TierDef {
  id: TierId;
  name: 'Lower' | 'Middle' | 'Upper';
  label: 'LOWER TIER' | 'MIDDLE TIER' | 'UPPER TIER';
  rows: number;
  /** d of the front edge of row 1. */
  d0: number;
  /** floor (tread) height of row 1. */
  y0: number;
  rowDepth: number;
  rise: number;
}

export const TIERS: TierDef[] = [
  { id: 1, name: 'Lower', label: 'LOWER TIER', rows: 18, d0: 1.5, y0: 0.9, rowDepth: 0.8, rise: 0.36 },
  { id: 2, name: 'Middle', label: 'MIDDLE TIER', rows: 16, d0: 17.5, y0: 10.5, rowDepth: 0.82, rise: 0.46 },
  { id: 3, name: 'Upper', label: 'UPPER TIER', rows: 18, d0: 31.5, y0: 23, rowDepth: 0.82, rise: 0.56 },
];

/** Blue fascia bands (front faces between tiers), in (d, y) profile coordinates. */
export const FASCIA = [
  { d: 16.9, yBottom: 7.4, yTop: 10.5 }, // in front of the middle tier
  { d: 30.9, yBottom: 21.6, yTop: 23.0 }, // in front of the upper tier (above the skyboxes)
];

/** VIP Level 2 skybox ring: between middle and upper tiers on the long sides (N, S). */
export const SKYBOX = {
  perSide: 14,
  glassD: 30.3,
  floorY: 17.9,
  height: 3.6,
  depth: 5.4,
  chairsPerBox: 8,
};

/** Roof: membrane ring with an open centre. */
export const ROOF = { innerD: -6, outerD: 52, innerY: 44, outerY: 38, screen: { width: 24, height: 10, y: 30 } };

export type StandId = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type StandKind = 'side' | 'end' | 'corner';

export interface StandDef {
  id: StandId;
  name: string; // "North Stand", "South-West Corner"
  kind: StandKind;
  /** Normal angle(s): n = (cos a, sin a) in (x, z). Straight stands: a0 === a1. */
  a0: number;
  a1: number;
  /** Corner arc centre (corners) or straight-segment midpoint at d = 0. */
  cx: number;
  cz: number;
  /** Half-length of a straight segment (0 for corners). */
  halfLen: number;
  /** Blocks per tier [lower, middle, upper]. */
  blocks: [number, number, number];
  /** First block index (block id = tier * 100 + base + i). */
  base: number;
  gatePrefix: string;
}

const D90 = Math.PI / 2;
const R = BOWL.cornerR;
const SX = BOWL.halfX - R; // 44.5
const SZ = BOWL.halfZ - R; // 26

/** Clockwise order seen from above (north at the top). */
export const STANDS: StandDef[] = [
  { id: 'N', name: 'North Stand', kind: 'side', a0: -D90, a1: -D90, cx: 0, cz: -BOWL.halfZ, halfLen: SX, blocks: [6, 6, 6], base: 30, gatePrefix: 'N' },
  { id: 'NE', name: 'North-East Corner', kind: 'corner', a0: -D90, a1: 0, cx: SX, cz: -SZ, halfLen: 0, blocks: [3, 4, 6], base: 36, gatePrefix: 'NE' },
  { id: 'E', name: 'East Stand', kind: 'end', a0: 0, a1: 0, cx: BOWL.halfX, cz: 0, halfLen: SZ, blocks: [4, 4, 4], base: 42, gatePrefix: 'E' },
  { id: 'SE', name: 'South-East Corner', kind: 'corner', a0: 0, a1: D90, cx: SX, cz: SZ, halfLen: 0, blocks: [3, 4, 6], base: 46, gatePrefix: 'SE' },
  { id: 'S', name: 'South Stand', kind: 'side', a0: D90, a1: D90, cx: 0, cz: BOWL.halfZ, halfLen: SX, blocks: [6, 6, 6], base: 1, gatePrefix: 'S' },
  { id: 'SW', name: 'South-West Corner', kind: 'corner', a0: D90, a1: Math.PI, cx: -SX, cz: SZ, halfLen: 0, blocks: [3, 4, 6], base: 7, gatePrefix: 'SW' },
  { id: 'W', name: 'West Stand', kind: 'end', a0: Math.PI, a1: Math.PI, cx: -BOWL.halfX, cz: 0, halfLen: SZ, blocks: [4, 4, 4], base: 13, gatePrefix: 'W' },
  { id: 'NW', name: 'North-West Corner', kind: 'corner', a0: Math.PI, a1: 3 * D90, cx: -SX, cz: -SZ, halfLen: 0, blocks: [3, 4, 6], base: 17, gatePrefix: 'NW' },
];

export const STAND_BY_ID: Record<StandId, StandDef> = Object.fromEntries(STANDS.map((s) => [s.id, s])) as Record<
  StandId,
  StandDef
>;

/* ------------------------------------------------------------------ */
/* Frames & profile                                                     */
/* ------------------------------------------------------------------ */

export interface Frame {
  x: number;
  z: number;
  /** Outward normal (away from the pitch). */
  nx: number;
  nz: number;
  /** Clockwise tangent (seen from above). Spectator's LEFT when facing the pitch. */
  tx: number;
  tz: number;
}

/** World XZ frame of a bowl point. */
export function standFrame(stand: StandDef, sigma: number, d: number, out: Frame = {} as Frame): Frame {
  const a = stand.a0 + (stand.a1 - stand.a0) * sigma;
  const nx = Math.cos(a);
  const nz = Math.sin(a);
  out.nx = nx;
  out.nz = nz;
  out.tx = -nz;
  out.tz = nx;
  if (stand.kind === 'corner') {
    out.x = stand.cx + (R + d) * nx;
    out.z = stand.cz + (R + d) * nz;
  } else {
    const s = (sigma - 0.5) * 2 * stand.halfLen;
    out.x = stand.cx + nx * d + out.tx * s;
    out.z = stand.cz + nz * d + out.tz * s;
  }
  return out;
}

/** Arc length of a stand at outward distance d. */
export function standLength(stand: StandDef, d: number): number {
  return stand.kind === 'corner' ? (R + d) * Math.abs(stand.a1 - stand.a0) : 2 * stand.halfLen;
}

/** Tier containing distance d (or null for walkways/gaps). */
export function tierAt(d: number): TierDef | null {
  for (const t of TIERS) if (d >= t.d0 && d <= t.d0 + t.rows * t.rowDepth) return t;
  return null;
}

/** Height of the stepped seating surface (tread) at distance d, for any d in the bowl. */
export function profileHeight(d: number): number {
  for (const t of TIERS) {
    const end = t.d0 + t.rows * t.rowDepth;
    if (d < t.d0) {
      // In front of this tier: walkway at the previous tier's top, or ground for tier 1.
      const prev = TIERS[TIERS.indexOf(t) - 1];
      return prev ? prev.y0 + (prev.rows - 1) * prev.rise : 0;
    }
    if (d <= end) {
      const r = Math.min(t.rows - 1, Math.floor((d - t.d0) / t.rowDepth));
      return t.y0 + r * t.rise;
    }
  }
  const last = TIERS[TIERS.length - 1];
  return last.y0 + (last.rows - 1) * last.rise;
}

/* ------------------------------------------------------------------ */
/* Layout (blocks, seats, skyboxes)                                     */
/* ------------------------------------------------------------------ */

export interface BlockDef {
  /** Index into layout.blocks. */
  index: number;
  id: number; // 232
  standId: StandId;
  tier: TierId;
  /** 0-based position in the stand, clockwise. */
  pos: number;
  sigma0: number;
  sigma1: number;
  rows: number;
  /** Seats per row (index 0 = row 1). Constant on straight stands, grows in corners. */
  seatsPerRow: number[];
  /** Absolute seat index of the first seat of each row (row 1 at [0]). */
  rowStart: number[];
  seatStart: number;
  seatCount: number;
  gate: string;
  /** Centre of the block's seating surface. */
  centre: Vec3;
  nx: number;
  nz: number;
}

export interface SkyboxChair {
  /** 1..8: 1-4 front row left→right facing the pitch, 5-8 back row. */
  n: number;
  position: Vec3; // seat floor point
  yaw: number;
}

export interface SkyboxDef {
  id: number; // 1..14 north side, 15..28 south side
  side: 'N' | 'S';
  sigma: number;
  width: number;
  /** Centre of the glass front (mid height). */
  glass: Vec3;
  nx: number;
  nz: number;
  yaw: number; // facing the pitch
  chairs: SkyboxChair[];
}

export interface StadiumLayout {
  stands: StandDef[];
  blocks: BlockDef[];
  blockById: Map<number, BlockDef>;
  blocksByStand: Record<StandId, BlockDef[]>;
  seatCount: number;
  /** xyz of each seat's floor point (front-centre of its tread). */
  seatPos: Float32Array;
  /** Rotation about y so a model whose front faces local +z faces the pitch. */
  seatYaw: Float32Array;
  /** Index into `blocks`. */
  seatBlock: Uint16Array;
  seatRow: Uint8Array;
  seatNum: Uint8Array;
  skyboxes: SkyboxDef[];
  skyboxById: Map<number, SkyboxDef>;
}

/** Yaw so local +z faces the pitch (inward = -normal). */
export function yawFacingPitch(nx: number, nz: number): number {
  return Math.atan2(-nx, -nz);
}

function buildLayout(): StadiumLayout {
  const blocks: BlockDef[] = [];
  const blocksByStand = Object.fromEntries(STANDS.map((s) => [s.id, [] as BlockDef[]])) as Record<StandId, BlockDef[]>;
  const pos: number[] = [];
  const yaw: number[] = [];
  const sb: number[] = [];
  const sr: number[] = [];
  const sn: number[] = [];
  const f: Frame = {} as Frame;

  for (const stand of STANDS) {
    for (const tier of TIERS) {
      const count = stand.blocks[tier.id - 1];
      for (let i = 0; i < count; i++) {
        const sigma0 = i / count;
        const sigma1 = (i + 1) / count;
        const sigmaC = (sigma0 + sigma1) / 2;
        const block: BlockDef = {
          index: blocks.length,
          id: tier.id * 100 + stand.base + i,
          standId: stand.id,
          tier: tier.id,
          pos: i,
          sigma0,
          sigma1,
          rows: tier.rows,
          seatsPerRow: [],
          rowStart: [],
          seatStart: pos.length / 3,
          seatCount: 0,
          gate: `${stand.gatePrefix}${i + 1}`,
          centre: { x: 0, y: 0, z: 0 },
          nx: 0,
          nz: 0,
        };
        for (let r = 0; r < tier.rows; r++) {
          const d = tier.d0 + r * tier.rowDepth + 0.3;
          const y = tier.y0 + r * tier.rise;
          const len = standLength(stand, d);
          const usable = len * (sigma1 - sigma0) - SEAT.aisle;
          const n = Math.max(6, Math.floor(usable / SEAT.pitch));
          block.seatsPerRow.push(n);
          block.rowStart.push(pos.length / 3);
          for (let j = 0; j < n; j++) {
            // j runs clockwise (= towards the spectator's left), so seat 1 is j = n-1.
            const sigma = sigmaC + ((j - (n - 1) / 2) * SEAT.pitch) / len;
            standFrame(stand, sigma, d, f);
            pos.push(f.x, y, f.z);
            yaw.push(yawFacingPitch(f.nx, f.nz));
            sb.push(block.index);
            sr.push(r + 1);
            sn.push(n - j);
          }
        }
        block.seatCount = pos.length / 3 - block.seatStart;
        const midD = tier.d0 + (tier.rows * tier.rowDepth) / 2;
        standFrame(stand, sigmaC, midD, f);
        block.centre = { x: f.x, y: tier.y0 + ((tier.rows - 1) * tier.rise) / 2, z: f.z };
        block.nx = f.nx;
        block.nz = f.nz;
        blocks.push(block);
        blocksByStand[stand.id].push(block);
      }
    }
  }

  // Skyboxes on the long sides.
  const skyboxes: SkyboxDef[] = [];
  for (const side of ['N', 'S'] as const) {
    const stand = STAND_BY_ID[side];
    const len = standLength(stand, SKYBOX.glassD);
    const width = len / SKYBOX.perSide;
    for (let k = 0; k < SKYBOX.perSide; k++) {
      const sigma = (k + 0.5) / SKYBOX.perSide;
      standFrame(stand, sigma, SKYBOX.glassD, f);
      const boxYaw = yawFacingPitch(f.nx, f.nz);
      const glass = { x: f.x, y: SKYBOX.floorY + SKYBOX.height / 2, z: f.z };
      const chairs: SkyboxChair[] = [];
      for (let row = 0; row < 2; row++) {
        const d = SKYBOX.glassD + 1.0 + row * 1.3;
        const y = SKYBOX.floorY + row * 0.4;
        for (let c = 0; c < 4; c++) {
          // c = 0 is the spectator's leftmost chair (most clockwise).
          const off = (1.5 - c) * 0.95;
          const s = sigma + off / len;
          const cf = standFrame(stand, s, d, {} as Frame);
          chairs.push({ n: row * 4 + c + 1, position: { x: cf.x, y, z: cf.z }, yaw: boxYaw });
        }
      }
      skyboxes.push({
        id: side === 'N' ? k + 1 : SKYBOX.perSide + k + 1,
        side,
        sigma,
        width,
        glass,
        nx: f.nx,
        nz: f.nz,
        yaw: boxYaw,
        chairs,
      });
    }
  }

  return {
    stands: STANDS,
    blocks,
    blockById: new Map(blocks.map((b) => [b.id, b])),
    blocksByStand,
    seatCount: pos.length / 3,
    seatPos: new Float32Array(pos),
    seatYaw: new Float32Array(yaw),
    seatBlock: new Uint16Array(sb),
    seatRow: new Uint8Array(sr),
    seatNum: new Uint8Array(sn),
    skyboxes,
    skyboxById: new Map(skyboxes.map((s) => [s.id, s])),
  };
}

let cached: StadiumLayout | null = null;
/** The stadium layout (built once, deterministic). */
export function getStadiumLayout(): StadiumLayout {
  if (!cached) cached = buildLayout();
  return cached;
}

/* ------------------------------------------------------------------ */
/* Seat helpers                                                         */
/* ------------------------------------------------------------------ */

export function seatIndexOf(blockId: number, row: number, seat: number): number | null {
  const L = getStadiumLayout();
  const b = L.blockById.get(blockId);
  if (!b || row < 1 || row > b.rows) return null;
  const n = b.seatsPerRow[row - 1];
  if (seat < 1 || seat > n) return null;
  // Seats are stored clockwise: j = n - seat.
  return b.rowStart[row - 1] + (n - seat);
}

export function seatPosition(index: number): Vec3 {
  const p = getStadiumLayout().seatPos;
  return { x: p[index * 3], y: p[index * 3 + 1], z: p[index * 3 + 2] };
}

export function seatInfo(index: number) {
  const L = getStadiumLayout();
  const block = L.blocks[L.seatBlock[index]];
  return { block, row: L.seatRow[index], seat: L.seatNum[index], stand: STAND_BY_ID[block.standId] };
}

/** Seated eye: above the tread, slightly behind the seat front. */
export function seatEye(index: number): Vec3 {
  const L = getStadiumLayout();
  const p = seatPosition(index);
  const y = L.seatYaw[index];
  // facing f = (sin y, cos y); behind = -f
  return { x: p.x - Math.sin(y) * SEAT.eyeBack, y: p.y + SEAT.eyeHeight, z: p.z - Math.cos(y) * SEAT.eyeBack };
}

export function chairEye(box: SkyboxDef, chairN: number): Vec3 {
  const c = box.chairs[chairN - 1];
  return {
    x: c.position.x - Math.sin(c.yaw) * 0.15,
    y: c.position.y + SEAT.eyeHeight,
    z: c.position.z - Math.cos(c.yaw) * 0.15,
  };
}

/* ------------------------------------------------------------------ */
/* Camera shots per level (baseline framings; nav may refine)           */
/* ------------------------------------------------------------------ */

const PITCH_CENTRE: Vec3 = { x: 0, y: 0, z: 0 };

/** Level 1: ~350 m up, 35° from vertical, looking at the stadium from the south. */
export function aerialShot(orbitAngle = 0): Shot {
  const h = 350;
  const back = h * Math.tan((35 * Math.PI) / 180);
  return {
    position: { x: Math.sin(orbitAngle) * back, y: h, z: Math.cos(orbitAngle) * back },
    target: { ...PITCH_CENTRE },
    fov: 32,
  };
}

/** Level 2: high over the pitch side of a stand, looking out/down at it, pitch edge at the bottom. */
export function standShot(standId: StandId): Shot {
  const s = STAND_BY_ID[standId];
  const f = standFrame(s, 0.5, -38);
  const t = standFrame(s, 0.5, 22);
  return { position: { x: f.x, y: 95, z: f.z }, target: { x: t.x, y: 12, z: t.z }, fov: 42 };
}

/** Level 3: close, nearly front-on to a block. */
export function blockShot(blockId: number): Shot {
  const b = getStadiumLayout().blockById.get(blockId)!;
  const c = b.centre;
  const dist = 22;
  return {
    position: { x: c.x - b.nx * dist, y: c.y + 7, z: c.z - b.nz * dist },
    target: { x: c.x, y: c.y, z: c.z },
    fov: 40,
  };
}

/** Level 4: rush into the row, chosen seat in the middle of the frame. */
export function seatRushShot(index: number): Shot {
  const p = seatPosition(index);
  const y = getStadiumLayout().seatYaw[index];
  const fx = Math.sin(y);
  const fz = Math.cos(y);
  return {
    position: { x: p.x + fx * 3.2, y: p.y + 2.1, z: p.z + fz * 3.2 },
    target: { x: p.x, y: p.y + 0.45, z: p.z },
    fov: 38,
  };
}

/** View from a seat: eye position looking at the pitch. */
export function seatEyeShot(index: number): Shot {
  const e = seatEye(index);
  return { position: e, target: { x: e.x * 0.15, y: 0, z: e.z * 0.15 }, fov: 58 };
}

/** VIP: facing the row of skyboxes on a side, centred on a given box. */
export function skyboxRingShot(boxId: number): Shot {
  const box = getStadiumLayout().skyboxById.get(boxId)!;
  const s = STAND_BY_ID[box.side];
  const f = standFrame(s, box.sigma, 6);
  const t = standFrame(s, box.sigma, SKYBOX.glassD + 1);
  return { position: { x: f.x, y: 20, z: f.z }, target: { x: t.x, y: SKYBOX.floorY + 1.8, z: t.z }, fov: 46 };
}

/** VIP: just inside the glass of a box, looking in at the chairs. */
export function skyboxInsideShot(boxId: number): Shot {
  const box = getStadiumLayout().skyboxById.get(boxId)!;
  const s = STAND_BY_ID[box.side];
  const f = standFrame(s, box.sigma, SKYBOX.glassD + 0.4);
  const t = standFrame(s, box.sigma, SKYBOX.glassD + 3.2);
  return {
    position: { x: f.x, y: SKYBOX.floorY + 2.3, z: f.z },
    target: { x: t.x, y: SKYBOX.floorY + 0.6, z: t.z },
    fov: 60,
  };
}

/** VIP: from a box chair, looking out over the pitch. */
export function boxSeatEyeShot(boxId: number, chairN: number): Shot {
  const box = getStadiumLayout().skyboxById.get(boxId)!;
  const e = chairEye(box, chairN);
  return { position: e, target: { x: e.x * 0.1, y: 0, z: e.z * 0.1 }, fov: 62 };
}
