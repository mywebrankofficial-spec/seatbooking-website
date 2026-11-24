/**
 * Shared constants + geometry helpers for the stadium structure.
 * All positions derive from lib/stadium-geometry.ts (standFrame / TIERS / FASCIA / SKYBOX / ROOF).
 */
import { BufferAttribute, BufferGeometry, Color } from 'three';
import { ROOF, STANDS, standFrame, type Frame, type StandDef } from '@/lib/stadium-geometry';

/* ------------------------------------------------------------------ */
/* Palette (sRGB hex; converted to linear by three.Color)               */
/* ------------------------------------------------------------------ */
export const HEX = {
  seatRed: '#C8102E',
  seatBlue: '#1E4FD8',
  seatGrey: '#DCDCE6',
  orange: '#F26A21',
  hover: '#FFA266',
  soldGrey: '#D4D4D8',
  concrete: '#B4B2AC',
  concreteDark: '#9A9892',
  walkway: '#CFCDC6',
  aisle: '#C2C0B9',
  fascia: '#1747C9',
  white: '#F2F2EF',
  windowDark: '#1F2731',
} as const;

export function lin(hex: string): [number, number, number] {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

/** Membrane spans the outer band of the roof; inside it the roof is an open white truss lattice. */
export const MEMBRANE_D0 = 30;

/** Roof top-chord height at bowl distance d (linear from inner to outer edge). */
export function roofChordY(d: number): number {
  return ROOF.innerY + ((ROOF.outerY - ROOF.innerY) * (d - ROOF.innerD)) / (ROOF.outerD - ROOF.innerD);
}
/** Truss depth (top chord to bottom chord). */
export function trussDepth(d: number): number {
  return 1.3 + (3.4 * (d - ROOF.innerD)) / (ROOF.outerD - ROOF.innerD);
}
/** Membrane surface height (slightly arched above the chord). */
export function membraneY(d: number): number {
  const t = Math.min(1, Math.max(0, (d - MEMBRANE_D0) / (ROOF.outerD - MEMBRANE_D0)));
  return roofChordY(d) + 0.45 + 1.1 * Math.sin(Math.PI * t);
}

/** Index of the stand pseudo-entry in the block-state texture. */
export const BLOCK_TEX_W = 128;
export const STAND_SLOT0 = 112;
export const STAND_INDEX: Record<string, number> = Object.fromEntries(STANDS.map((s, i) => [s.id, i]));

const _f: Frame = {} as Frame;
export function frameAt(stand: StandDef, sigma: number, d: number): Frame {
  return standFrame(stand, sigma, d, _f);
}

/* ------------------------------------------------------------------ */
/* Geometry builder with custom attributes                              */
/* ------------------------------------------------------------------ */
export type RGB = [number, number, number];
export interface VAttr {
  color?: RGB;
  /** blk, kind, rowStart, n */
  info?: [number, number, number, number];
  uv?: [number, number];
  /** Continuous row coordinate across a tier (treads + risers), for pattern anti-aliasing. */
  row?: number;
}

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  info: number[] = [];
  uv: number[] = [];
  row: number[] = [];
  idx: number[] = [];

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, a: VAttr): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    const c = a.color ?? [1, 1, 1];
    this.col.push(c[0], c[1], c[2]);
    const i = a.info ?? [0, 0, 0, 0];
    this.info.push(i[0], i[1], i[2], i[3]);
    const u = a.uv ?? [0, 0];
    this.uv.push(u[0], u[1]);
    this.row.push(a.row ?? 0);
    return this.pos.length / 3 - 1;
  }

  /** Quad a-b-c-d (a,b on one edge; d,c on the other). Winding chosen so the face normal matches (nx,ny,nz). */
  quad(a: number, b: number, c: number, d: number, nx: number, ny: number, nz: number) {
    const p = this.pos;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const e1x = p[b * 3] - ax, e1y = p[b * 3 + 1] - ay, e1z = p[b * 3 + 2] - az;
    const e2x = p[c * 3] - ax, e2y = p[c * 3 + 1] - ay, e2z = p[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    if (cx * nx + cy * ny + cz * nz >= 0) this.idx.push(a, b, c, a, c, d);
    else this.idx.push(a, c, b, a, d, c);
  }

  /**
   * A strip along a stand between profile points A=(dA,yA) and B=(dB,yB), sigma from s0 to s1.
   * The visible side is to the LEFT of A→B in the (d, y) plane (A→B outward ⇒ up; A→B upward ⇒ towards the pitch).
   */
  strip(
    stand: StandDef,
    s0: number,
    s1: number,
    segs: number,
    dA: number,
    yA: number,
    dB: number,
    yB: number,
    attr: (sigma: number, end: 0 | 1) => VAttr,
  ) {
    let ed = dB - dA;
    let ey = yB - yA;
    const l = Math.hypot(ed, ey) || 1;
    ed /= l;
    ey /= l;
    const pd = -ey; // profile normal (d component)
    const py = ed; // profile normal (y component)
    let prevA = -1;
    let prevB = -1;
    let pnx = 0, pnz = 0;
    for (let k = 0; k <= segs; k++) {
      const sg = s0 + ((s1 - s0) * k) / segs;
      const fa = frameAt(stand, sg, dA);
      const nx = pd * fa.nx, nz = pd * fa.nz;
      const ia = this.vert(fa.x, yA, fa.z, nx, py, nz, attr(sg, 0));
      const fb = frameAt(stand, sg, dB);
      const ib = this.vert(fb.x, yB, fb.z, nx, py, nz, attr(sg, 1));
      if (k > 0) this.quad(prevA, ia, ib, prevB, pnx, py, pnz);
      prevA = ia;
      prevB = ib;
      pnx = nx;
      pnz = nz;
    }
  }

  build(withInfo = true): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    if (withInfo) {
      g.setAttribute('aInfo', new BufferAttribute(new Float32Array(this.info), 4));
      g.setAttribute('aUV', new BufferAttribute(new Float32Array(this.uv), 2));
      g.setAttribute('aRow', new BufferAttribute(new Float32Array(this.row), 1));
    }
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    const n = this.pos.length / 3;
    g.setIndex(n > 65535 ? new BufferAttribute(new Uint32Array(this.idx), 1) : new BufferAttribute(new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
