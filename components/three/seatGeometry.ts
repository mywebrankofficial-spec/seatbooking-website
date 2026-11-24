/**
 * Procedural cinema seat geometry + instance transforms.
 *
 * Seat-local space: origin = seat centre on its riser floor (exactly
 * `seatWorldPosition()`), +y up, the seat FACES -z (towards the screen), so
 * the back rest sits on the +z side. Everything is built once and rendered
 * with one InstancedMesh per part group.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HallLayout, SeatType } from '@/types/cinema';
import { DEFAULT_LAYOUT, RECLINER_ROWS, seatWorldPosition, seatX, seatsPerRow } from '@/lib/hall-geometry';
import { hallDims } from './hallDims';

export interface SeatPartGeometries {
  /** Velvet parts (cushion, back, pads, footrest). Vertex colour = shading factor. */
  upholstery: BufferGeometry;
  /** Hard dark parts under the seat. */
  shell: BufferGeometry;
  /** One shared armrest / side standard (placed between neighbours). */
  arm: BufferGeometry;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3(1, 1, 1);
const _x = new Vector3(1, 0, 0);

interface PartSpec {
  geo: BufferGeometry;
  pos: [number, number, number];
  /** rotation about +x in radians (positive tilts the top towards +z / raises the front) */
  tilt?: number;
  /** extra local offset applied in the tilted frame (e.g. pads on a reclined back) */
  local?: [number, number, number];
  shade: number;
}

function place(spec: PartSpec): BufferGeometry {
  // RoundedBoxGeometry is non-indexed: re-index so every part merges (and shares verts).
  const g = spec.geo.index ? spec.geo : mergeVertices(spec.geo);
  if (g !== spec.geo) spec.geo.dispose();
  _q.setFromAxisAngle(_x, spec.tilt ?? 0);
  _v.set(spec.pos[0], spec.pos[1], spec.pos[2]);
  _m.compose(_v, _q, _s);
  if (spec.local) {
    const off = new Matrix4().makeTranslation(spec.local[0], spec.local[1], spec.local[2]);
    _m.multiply(off);
  }
  g.applyMatrix4(_m);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3).fill(spec.shade);
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

function merge(parts: PartSpec[]): BufferGeometry {
  const placed = parts.map(place);
  const merged = mergeGeometries(placed, false);
  placed.forEach((g) => g.dispose());
  if (!merged) throw new Error('seatGeometry: merge failed');
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function rbox(w: number, h: number, d: number, seg: number, r: number): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, r);
}

/** Seat back tilt (radians). Top of the back stays <= ~1.0 m above the riser. */
export const STANDARD_BACK = { tilt: 0.2, centre: [0, 0.7, 0.22] as [number, number, number], height: 0.6, depth: 0.11 };
export const RECLINER_BACK = { tilt: 0.17, centre: [0, 0.69, 0.27] as [number, number, number], height: 0.58, depth: 0.2 };

export function buildSeatGeometries(type: SeatType): SeatPartGeometries {
  if (type === 'recliner') {
    const b = RECLINER_BACK;
    const upholstery = merge([
      // deep seat cushion
      { geo: rbox(0.5, 0.18, 0.56, 2, 0.06), pos: [0, 0.43, -0.07], tilt: 0.04, shade: 0.95 },
      // thick back
      { geo: rbox(0.5, b.height, b.depth, 2, 0.08), pos: b.centre, tilt: b.tilt, shade: 0.8 },
      // lumbar pad
      { geo: rbox(0.42, 0.3, 0.06, 1, 0.025), pos: b.centre, tilt: b.tilt, local: [0, -0.07, -0.115], shade: 1 },
      // head pillow
      { geo: rbox(0.44, 0.15, 0.07, 1, 0.03), pos: b.centre, tilt: b.tilt, local: [0, 0.18, -0.12], shade: 1 },
      // closed footrest panel under the front edge
      { geo: rbox(0.46, 0.26, 0.08, 1, 0.03), pos: [0, 0.21, -0.37], tilt: -0.25, shade: 0.75 },
    ]);
    const shell = merge([{ geo: new BoxGeometry(0.46, 0.3, 0.5), pos: [0, 0.16, 0.02], shade: 1 }]);
    // Chunky upholstered side console (shared between neighbours).
    const arm = merge([
      { geo: rbox(0.1, 0.62, 0.8, 2, 0.04), pos: [0, 0.31, -0.03], shade: 0.85 },
      { geo: rbox(0.105, 0.06, 0.66, 1, 0.025), pos: [0, 0.63, -0.04], shade: 1 },
    ]);
    return { upholstery, shell, arm };
  }

  const b = STANDARD_BACK;
  const upholstery = merge([
    // seat cushion, front slightly raised
    { geo: rbox(0.5, 0.12, 0.48, 2, 0.045), pos: [0, 0.44, -0.04], tilt: 0.06, shade: 0.95 },
    // back rest, rounded all round so the rear reads well from the row behind
    { geo: rbox(0.5, b.height, b.depth, 2, 0.05), pos: b.centre, tilt: b.tilt, shade: 0.8 },
    // inner back pad
    { geo: rbox(0.42, 0.44, 0.05, 1, 0.02), pos: b.centre, tilt: b.tilt, local: [0, -0.02, -0.062], shade: 1 },
  ]);
  const shell = merge([
    // dark seat pan under the cushion
    { geo: rbox(0.46, 0.07, 0.42, 1, 0.02), pos: [0, 0.355, -0.03], tilt: 0.06, shade: 1 },
  ]);
  const arm = merge([
    // side standard to the floor
    { geo: new BoxGeometry(0.045, 0.58, 0.46), pos: [0, 0.29, 0.0], shade: 0.7 },
    // arm pad
    { geo: rbox(0.075, 0.05, 0.52, 1, 0.02), pos: [0, 0.62, -0.03], shade: 1 },
  ]);
  return { upholstery, shell, arm };
}

/* ------------------------------------------------------------------ */
/* Instance layout                                                      */
/* ------------------------------------------------------------------ */

export interface SeatInstance {
  id: string;
  row: string;
  number: number;
  type: SeatType;
  /** index inside the instanced mesh of its type */
  index: number;
  position: Vector3;
}

export interface SeatLayoutInstances {
  byType: Record<SeatType, SeatInstance[]>;
  byId: Map<string, SeatInstance>;
  /** Armrest world positions per seat type. */
  arms: Record<SeatType, Vector3[]>;
}

export function seatTypeForRow(row: string): SeatType {
  return RECLINER_ROWS.includes(row) ? 'recliner' : 'standard';
}

/** All seat + armrest transforms, positions straight from hall-geometry. */
export function buildSeatInstances(layout: HallLayout = DEFAULT_LAYOUT): SeatLayoutInstances {
  const byType: Record<SeatType, SeatInstance[]> = { standard: [], recliner: [] };
  const arms: Record<SeatType, Vector3[]> = { standard: [], recliner: [] };
  const byId = new Map<string, SeatInstance>();
  const perRow = seatsPerRow(layout);
  const dims = hallDims(layout);
  const halfPitch = layout.seatPitch / 2;

  for (const row of layout.rows) {
    const type = seatTypeForRow(row);
    for (let number = 1; number <= perRow; number++) {
      const p = seatWorldPosition({ row, number }, layout);
      const inst: SeatInstance = {
        id: `${row}${number}`,
        row,
        number,
        type,
        index: byType[type].length,
        position: new Vector3(p.x, p.y, p.z),
      };
      byType[type].push(inst);
      byId.set(inst.id, inst);
    }
    // Shared armrests: one left of every seat in a block + one right of the block's last seat.
    const base = seatWorldPosition({ row, number: 1 }, layout);
    for (const [first, last] of dims.blockSeats) {
      for (let s = first; s <= last; s++) arms[type].push(new Vector3(seatX(s, layout) - halfPitch, base.y, base.z));
      arms[type].push(new Vector3(seatX(last, layout) + halfPitch, base.y, base.z));
    }
  }
  return { byType, byId, arms };
}
