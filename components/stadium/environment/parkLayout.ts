/**
 * Deterministic procedural park around the stadium: winding roads / paths (CatmullRom splines),
 * clustered trees that avoid the plaza and every road.
 * Built once (lazily) on the client.
 */
import { CatmullRomCurve3, Vector3 } from 'three';
import { STANDS, standFrame, type Frame } from '@/lib/stadium-geometry';
import { PLAZA_OUT_D, RING_ROAD_D, TREES, bowlDistance } from './constants';

export type RoadKind = 'asphalt' | 'path' | 'walk';

export interface RoadStrip {
  kind: RoadKind;
  width: number;
  /** xz samples along the centre line, ~3 m apart. */
  points: Float32Array;
}

export interface TreeInstance {
  x: number;
  z: number;
  /** Total height (m). */
  h: number;
  /** Canopy width factor. */
  w: number;
  rot: number;
  color: number;
}

export interface ParkLayout {
  roads: RoadStrip[];
  trees: TreeInstance[];
}

/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points along the rounded rectangle at bowl distance d, clockwise from above (x, z). */
export function roundedRectPoints(d: number, cornerSegments = 10): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const f: Frame = {} as Frame;
  for (const s of STANDS) {
    const n = s.kind === 'corner' ? cornerSegments : 1;
    for (let i = 0; i < n; i++) {
      standFrame(s, i / n, d, f);
      out.push([f.x, f.z]);
    }
  }
  return out;
}

/** Occupancy grid (4 m cells) used to keep trees off roads and the plaza. */
const GRID_HALF = 1800;
const CELL = 4;
const GRID_N = (GRID_HALF * 2) / CELL;

class Grid {
  readonly cells = new Uint8Array(GRID_N * GRID_N);
  index(x: number, z: number): number {
    const i = Math.floor((x + GRID_HALF) / CELL);
    const j = Math.floor((z + GRID_HALF) / CELL);
    if (i < 0 || j < 0 || i >= GRID_N || j >= GRID_N) return -1;
    return j * GRID_N + i;
  }
  stamp(x: number, z: number, radius: number): void {
    const r = Math.ceil(radius / CELL);
    const ci = Math.floor((x + GRID_HALF) / CELL);
    const cj = Math.floor((z + GRID_HALF) / CELL);
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= GRID_N) continue;
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || i >= GRID_N) continue;
        const cx = (i + 0.5) * CELL - GRID_HALF;
        const cz = (j + 0.5) * CELL - GRID_HALF;
        if (Math.hypot(cx - x, cz - z) <= radius + CELL * 0.5) this.cells[j * GRID_N + i] = 1;
      }
    }
  }
  blocked(x: number, z: number): boolean {
    const k = this.index(x, z);
    return k < 0 || this.cells[k] === 1;
  }
}

function sampleCurve(points: Vector3[], closed: boolean, spacing = 3): Float32Array {
  const curve = new CatmullRomCurve3(points, closed, 'centripetal', 0.5);
  const n = Math.max(8, Math.round(curve.getLength() / spacing));
  const pts = curve.getSpacedPoints(n);
  const out = new Float32Array(pts.length * 2);
  pts.forEach((p, i) => {
    out[i * 2] = p.x;
    out[i * 2 + 1] = p.z;
  });
  return out;
}

/** A road that wanders outward from (x, z) along heading `a`. */
function wander(
  rand: () => number,
  x: number,
  z: number,
  a: number,
  steps: number,
  stepLen: number,
  turn: number,
): Vector3[] {
  const pts = [new Vector3(x, 0, z)];
  let heading = a;
  for (let i = 0; i < steps; i++) {
    heading += (rand() - 0.5) * 2 * turn;
    // Keep heading roughly outward so roads never crawl back into the stadium.
    const out = Math.atan2(z, x);
    let diff = out - heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    heading += diff * 0.18;
    x += Math.cos(heading) * stepLen * (0.8 + rand() * 0.4);
    z += Math.sin(heading) * stepLen * (0.8 + rand() * 0.4);
    pts.push(new Vector3(x, 0, z));
  }
  return pts;
}

function pointOn(strip: Float32Array, t: number): [number, number, number] {
  const n = strip.length / 2;
  const i = Math.min(n - 2, Math.max(0, Math.floor(t * (n - 1))));
  const x = strip[i * 2];
  const z = strip[i * 2 + 1];
  const a = Math.atan2(strip[i * 2 + 3] - z, strip[i * 2 + 2] - x);
  return [x, z, a];
}

function buildRoads(rand: () => number): RoadStrip[] {
  const roads: RoadStrip[] = [];

  // Ring road: a softly wobbling loop around the plaza.
  const ringCtrl = roundedRectPoints(RING_ROAD_D, 3).map(([x, z], i) => {
    const len = Math.hypot(x, z);
    const wob = Math.sin(i * 1.7) * 6 + (rand() - 0.5) * 8;
    return new Vector3(x + (x / len) * wob, 0, z + (z / len) * wob);
  });
  const ring = sampleCurve(ringCtrl, true);
  roads.push({ kind: 'asphalt', width: 10, points: ring });

  // Plaza walkways linking the plaza to the ring road on the four axes.
  for (const [nx, nz, half] of [
    [0, -1, 40],
    [0, 1, 40],
    [1, 0, 58.5],
    [-1, 0, 58.5],
  ] as const) {
    const a = half + PLAZA_OUT_D - 6;
    const b = half + RING_ROAD_D + 2;
    roads.push({
      kind: 'walk',
      width: 16,
      points: sampleCurve([new Vector3(nx * a, 0, nz * a), new Vector3(nx * b, 0, nz * b)], false),
    });
  }

  // Approach roads winding out into the park.
  const approachAngles = [-2.2, -0.9, 0.35, 1.35, 2.55];
  for (const ang of approachAngles) {
    const t = ((ang / (Math.PI * 2) + 1) % 1);
    const [x, z] = pointOn(ring, t);
    const out = Math.atan2(z, x);
    const pts = wander(rand, x, z, out, 14, 150, 0.32);
    roads.push({ kind: 'asphalt', width: 9, points: sampleCurve(pts, false) });
  }

  // Thin gravel paths meandering through the lawns.
  const asphalt = roads.filter((r) => r.kind === 'asphalt');
  for (let k = 0; k < 14; k++) {
    const src = asphalt[k % asphalt.length];
    const [x, z, a] = pointOn(src.points, k === 0 ? 0.1 : 0.08 + rand() * 0.5);
    const side = rand() < 0.5 ? -1 : 1;
    const start = a + side * (Math.PI / 2) * (0.6 + rand() * 0.5);
    const pts = wander(rand, x, z, start, 6 + Math.floor(rand() * 6), 70, 0.55);
    roads.push({ kind: 'path', width: 3.4, points: sampleCurve(pts, false) });
  }
  return roads;
}

function buildTrees(rand: () => number, roads: RoadStrip[]): TreeInstance[] {
  const grid = new Grid();
  for (const r of roads) {
    const margin = r.kind === 'path' ? 3.5 : 5;
    for (let i = 0; i < r.points.length; i += 2) grid.stamp(r.points[i], r.points[i + 1], r.width / 2 + margin);
  }

  const trees: TreeInstance[] = [];
  const occ = new Int32Array(GRID_N * GRID_N); // tree index + 1 per cell
  const free = (x: number, z: number, minD: number): boolean => {
    if (bowlDistance(x, z) < PLAZA_OUT_D + 7) return false;
    if (grid.blocked(x, z)) return false;
    const ci = Math.floor((x + GRID_HALF) / CELL);
    const cj = Math.floor((z + GRID_HALF) / CELL);
    for (let j = cj - 2; j <= cj + 2; j++) {
      for (let i = ci - 2; i <= ci + 2; i++) {
        if (i < 0 || j < 0 || i >= GRID_N || j >= GRID_N) continue;
        const t = occ[j * GRID_N + i];
        if (t && Math.hypot(trees[t - 1].x - x, trees[t - 1].z - z) < minD) return false;
      }
    }
    return true;
  };
  const add = (x: number, z: number, h: number): void => {
    const k = grid.index(x, z);
    if (k < 0 || occ[k]) return;
    trees.push({
      x,
      z,
      h,
      w: 0.85 + rand() * 0.4,
      rot: rand() * Math.PI * 2,
      color: Math.floor(rand() * 6),
    });
    occ[k] = trees.length;
  };

  // Avenue trees along the first stretch of each approach road.
  for (const r of roads) {
    if (r.kind !== 'asphalt' || r === roads[0]) continue;
    const n = r.points.length / 2;
    for (let i = 4; i < Math.min(n - 1, 160); i += 4) {
      const x = r.points[i * 2];
      const z = r.points[i * 2 + 1];
      const a = Math.atan2(r.points[i * 2 + 3] - z, r.points[i * 2 + 2] - x);
      const off = r.width / 2 + 9;
      for (const s of [-1, 1]) {
        const tx = x - Math.sin(a) * off * s;
        const tz = z + Math.cos(a) * off * s;
        if (free(tx, tz, 7) && trees.length < TREES.count) add(tx, tz, 10 + rand() * 3);
      }
    }
  }

  // Dense clusters.
  let guard = 0;
  while (trees.length < TREES.count && guard++ < 4000) {
    // 80 % of the clumps in the ring the aerial camera sees, the rest out towards the horizon.
    const radius = rand() < 0.8 ? 135 + 340 * Math.pow(rand(), 0.85) : 480 + 950 * rand();
    const ang = rand() * Math.PI * 2;
    const cx = Math.cos(ang) * radius;
    const cz = Math.sin(ang) * radius;
    if (bowlDistance(cx, cz) < PLAZA_OUT_D + 12) continue;
    const cr = 14 + rand() * 34;
    const want = Math.round(cr * cr * Math.PI * (0.011 + rand() * 0.008));
    for (let k = 0, tries = 0; k < want && tries < want * 4 && trees.length < TREES.count; tries++) {
      // Gaussian-ish fill: denser in the middle of the clump.
      const rr = cr * Math.sqrt(rand()) * (0.55 + 0.45 * rand());
      const aa = rand() * Math.PI * 2;
      const x = cx + Math.cos(aa) * rr;
      const z = cz + Math.sin(aa) * rr;
      if (!free(x, z, 6)) continue;
      const edge = rr / cr;
      add(x, z, 9 + rand() * 7 - edge * 2.5);
      k++;
    }
  }
  return trees;
}

let cached: ParkLayout | null = null;
export function getParkLayout(): ParkLayout {
  if (cached) return cached;
  const rand = mulberry32(0x5eed);
  const roads = buildRoads(rand);
  const trees = buildTrees(rand, roads);
  cached = { roads, trees };
  return cached;
}
