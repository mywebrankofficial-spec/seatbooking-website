/**
 * Procedural bowl: stepped risers (with seat-pattern attributes), walkways, fascia bands,
 * tier fronts/backs, outer shell and roof membrane. Everything from lib/stadium-geometry.ts.
 *
 * Bowl vertex attributes (consumed by bowlMaterial):
 *   color  = base albedo (linear)
 *   aInfo  = (slot, kind, rowStart, seatsInRow)   kind: 0 plain, 1 tread pattern, 2 riser pattern, 3 lit window, 4 fascia (never tinted)
 *   aUV    = (u in seat units, v across the tread 0 front → 1 back)
 *   aRow   = continuous row coordinate (tread r → r+0.5, riser r+0.5 → r+1)
 */
import type { BufferGeometry } from 'three';
import {
  FASCIA,
  getStadiumLayout,
  ROOF,
  SEAT,
  SKYBOX,
  STANDS,
  standLength,
  TIERS,
  type StandDef,
} from '@/lib/stadium-geometry';
import { frameAt, GeoBuilder, HEX, lin, MEMBRANE_D0, membraneY, STAND_INDEX, STAND_SLOT0, type RGB, type VAttr } from './common';

const C = {
  concrete: lin(HEX.concrete),
  dark: lin(HEX.concreteDark),
  walk: lin(HEX.walkway),
  fascia: lin(HEX.fascia),
  white: lin(HEX.white),
  win: lin(HEX.windowDark),
};

const CORNER_SEGS = 24;

function tierEnd(t: (typeof TIERS)[number]) {
  return t.d0 + t.rows * t.rowDepth;
}
function tierTopY(t: (typeof TIERS)[number]) {
  return t.y0 + (t.rows - 1) * t.rise;
}

/** Seating surfaces + structure of one stand. */
export function buildStandGeometry(stand: StandDef): BufferGeometry {
  const L = getStadiumLayout();
  const g = new GeoBuilder();
  const slot = STAND_SLOT0 + STAND_INDEX[stand.id];
  const plain = (color: RGB): (() => VAttr) => {
    const a: VAttr = { color, info: [slot, 0, 0, 0] };
    return () => a;
  };
  const segs = stand.kind === 'corner' ? CORNER_SEGS : 1;
  const longSide = stand.id === 'N' || stand.id === 'S';

  // --- Seating blocks: treads + risers with pattern attributes.
  for (const b of L.blocksByStand[stand.id]) {
    const tier = TIERS[b.tier - 1];
    const bSegs = stand.kind === 'corner' ? Math.max(2, Math.round((CORNER_SEGS * (b.sigma1 - b.sigma0)))) : 1;
    const sigmaC = (b.sigma0 + b.sigma1) / 2;
    for (let r = 0; r < tier.rows; r++) {
      const dF = tier.d0 + r * tier.rowDepth;
      const dB = dF + tier.rowDepth;
      const y = tier.y0 + r * tier.rise;
      const dSeat = dF + 0.3;
      const len = standLength(stand, dSeat);
      const n = b.seatsPerRow[r];
      const rowStart = b.rowStart[r];
      const uAt = (sg: number) => ((sg - sigmaC) * len) / SEAT.pitch + n / 2;
      // tread
      g.strip(stand, b.sigma0, b.sigma1, bSegs, dF, y, dB, y, (sg, end) => ({
        color: C.concrete,
        info: [b.index, 1, rowStart, n],
        uv: [uAt(sg), end],
        row: r + 0.5 * end,
      }));
      // riser up to the next row (none behind the last row)
      if (r < tier.rows - 1) {
        g.strip(stand, b.sigma0, b.sigma1, bSegs, dB, y, dB, y + tier.rise, (sg, end) => ({
          color: C.dark,
          info: [b.index, 2, rowStart, n],
          uv: [uAt(sg), end],
          row: r + 0.5 + 0.5 * end,
        }));
      }
    }
  }

  const fasciaAttr: VAttr = { color: C.fascia, info: [slot, 4, 0, 0] };
  const strip = (dA: number, yA: number, dB: number, yB: number, color: RGB) =>
    g.strip(stand, 0, 1, segs, dA, yA, dB, yB, color === C.fascia ? () => fasciaAttr : plain(color));

  const [t1, t2, t3] = TIERS;
  // Pitch-side walkway + wall (blue band) in front of the lower tier.
  strip(-0.6, 0.03, t1.d0, 0.03, C.walk);
  strip(t1.d0, 0, t1.d0, 0.25, C.dark);
  strip(t1.d0, 0.25, t1.d0, t1.y0, C.fascia);

  // Walkway between lower and middle tier + fascia 1.
  const y1 = tierTopY(t1);
  const f1 = FASCIA[0];
  strip(tierEnd(t1), y1, f1.d, y1, C.walk);
  strip(f1.d, y1, f1.d, f1.yBottom, C.concrete);
  strip(f1.d, f1.yBottom, f1.d, f1.yTop, C.fascia);
  strip(f1.d, f1.yTop, t2.d0, t2.y0, C.walk);

  // Between middle and upper tier: skyboxes (long sides) or a glazed hospitality band.
  const y2 = tierTopY(t2);
  const f2 = FASCIA[1];
  const boxTop = SKYBOX.floorY + SKYBOX.height;
  if (longSide) {
    // sill under the skybox glass, ledge above it
    strip(SKYBOX.glassD, y2, SKYBOX.glassD, SKYBOX.floorY + 0.05, C.white);
    strip(SKYBOX.glassD, boxTop, f2.d, boxTop, C.white);
    strip(f2.d, boxTop, f2.d, f2.yBottom, C.white);
  } else {
    strip(tierEnd(t2), y2, f2.d, y2, C.walk);
    strip(f2.d, y2, f2.d, SKYBOX.floorY, C.concrete);
    g.strip(stand, 0, 1, segs, f2.d, SKYBOX.floorY, f2.d, boxTop, () => ({ color: C.win, info: [slot, 3, 0, 0] }));
    strip(f2.d, boxTop, f2.d, f2.yBottom, C.white);
  }
  strip(f2.d, f2.yBottom, f2.d, f2.yTop, C.fascia);
  strip(f2.d, f2.yTop, t3.d0, t3.y0, C.walk);

  // Back of the upper tier: parapet with a blue band, then a wall up to the roof.
  const y3 = tierTopY(t3);
  const e3 = tierEnd(t3);
  strip(e3, y3, e3, y3 + 1.1, C.concrete);
  strip(e3, y3 + 1.1, e3, y3 + 1.9, C.fascia);
  strip(e3, y3 + 1.9, e3, membraneY(e3) + 0.2, C.white);

  return g.build();
}

/** All stands' bowl geometry. */
export function buildBowlGeometries(): BufferGeometry[] {
  return STANDS.map((s) => buildStandGeometry(s));
}

/* ------------------------------------------------------------------ */
/* Outer shell + roof membrane (shared vertices → smooth normals)       */
/* ------------------------------------------------------------------ */

/** Outer façade profile (d, y), bottom → top. */
export const SHELL_PROFILE: Array<[number, number]> = [
  [50.8, 0],
  [53.8, 4.5],
  [55.6, 12],
  [56.2, 21],
  [55.6, 29],
  [54.1, 35],
  [ROOF.outerD, membraneY(ROOF.outerD)],
];

function ringGrid(profile: Array<[number, number]>, straightSegs: (s: StandDef) => number, cornerSegs: number, uScale: number, vOf: (d: number, y: number, i: number) => number, flip: boolean) {
  const g = new GeoBuilder();
  const cols: Array<{ stand: StandDef; sigma: number }> = [];
  for (const s of STANDS) {
    const n = s.kind === 'corner' ? cornerSegs : straightSegs(s);
    for (let k = 0; k < n; k++) cols.push({ stand: s, sigma: k / n });
  }
  const nc = cols.length;
  const np = profile.length;
  // arc length along the reference distance of the first profile point (for texture u)
  let arc = 0;
  let px = 0, pz = 0;
  for (let c = 0; c <= nc; c++) {
    const { stand, sigma } = cols[c % nc];
    const f0 = frameAt(stand, sigma, profile[0][0]);
    if (c > 0) arc += Math.hypot(f0.x - px, f0.z - pz);
    px = f0.x;
    pz = f0.z;
    for (let i = 0; i < np; i++) {
      const [d, y] = profile[i];
      const f = frameAt(stand, sigma, d);
      g.vert(f.x, y, f.z, 0, 1, 0, { color: [1, 1, 1], uv: [arc / uScale, vOf(d, y, i)] });
    }
  }
  for (let c = 0; c < nc; c++) {
    for (let i = 0; i < np - 1; i++) {
      const a = c * np + i;
      const b = (c + 1) * np + i;
      if (flip) g.idx.push(a, a + 1, b, b, a + 1, b + 1);
      else g.idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = g.build(false);
  geo.computeVertexNormals();
  return geo;
}

export function buildShellGeometry(): BufferGeometry {
  return ringGrid(SHELL_PROFILE, (s) => (s.kind === 'side' ? 16 : 10), 20, 6, (_d, y) => y / 38, false);
}

export function buildMembraneGeometry(): BufferGeometry {
  const prof: Array<[number, number]> = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const d = ROOF.outerD + ((MEMBRANE_D0 - ROOF.outerD) * i) / N;
    prof.push([d, membraneY(d)]);
  }
  return ringGrid(prof, (s) => (s.kind === 'side' ? 16 : 10), 20, 8, (d) => d / 10, false);
}
