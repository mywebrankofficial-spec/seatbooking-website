/**
 * Static auditorium shell, built once and merged into a handful of
 * BufferGeometries (one draw call each):
 *   - floor:   flat front floor + one stepped riser slab per row, aisles darker,
 *              aisle half-steps (vertex colours)
 *   - walls:   inward-facing side/back/front wall planes + acoustic ribs
 *   - ceiling: single plane facing DOWN (back-face culled from the overhead camera)
 *   - lights:  thin step-edge strips + brighter aisle step lights (unlit)
 *   - shadows: soft vertex-alpha quads faking contact shadows / AO
 *   - screen:  curved screen surface + masking border
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HallLayout } from '@/types/cinema';
import { DEFAULT_LAYOUT, rowFloorY, rowZ } from '@/lib/hall-geometry';
import { CEILING_Y, FLOOR_BOTTOM_Y, floorYAt, hallDims, type HallDims } from './hallDims';

export const ROOM_COLORS = {
  carpet: '#1b161b',
  aisle: '#0d0c0f',
  riserFace: '#141116',
  frontFloor: '#141217',
  wall: '#1a171e',
  rib: '#2b262f',
  backWall: '#141218',
  frontWall: '#050506',
  ceiling: '#0b0a0d',
  stepStrip: '#4a3d2c',
  aisleLight: '#c99a5c',
};

const _c = new Color();

function colorize(g: BufferGeometry, hex: string, alpha?: number): BufferGeometry {
  _c.set(hex);
  const n = g.getAttribute('position').count;
  const size = alpha === undefined ? 3 : 4;
  const arr = new Float32Array(n * size);
  for (let i = 0; i < n; i++) {
    arr[i * size] = _c.r;
    arr[i * size + 1] = _c.g;
    arr[i * size + 2] = _c.b;
    if (size === 4) arr[i * size + 3] = alpha as number;
  }
  g.setAttribute('color', new Float32BufferAttribute(arr, size));
  return g;
}

function box(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  hex: string,
): BufferGeometry {
  const g = new BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
  g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  return colorize(g, hex);
}

function mergeAll(list: BufferGeometry[]): BufferGeometry {
  // Drop uv so every part has identical attribute sets.
  for (const g of list) if (g.getAttribute('uv')) g.deleteAttribute('uv');
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  if (!merged) throw new Error('roomGeometry: merge failed');
  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------------ */
/* Floor                                                                */
/* ------------------------------------------------------------------ */

/** x segments of a tread: [minX, maxX, isAisle] */
function treadSegments(d: HallDims): Array<[number, number, boolean]> {
  const segs: Array<[number, number, boolean]> = [];
  for (let i = 0; i < d.aisleSpans.length; i++) {
    segs.push([d.aisleSpans[i][0], d.aisleSpans[i][1], true]);
    if (i < d.blockSpans.length) segs.push([d.blockSpans[i][0], d.blockSpans[i][1], false]);
  }
  return segs;
}

export function buildFloorGeometry(layout: HallLayout = DEFAULT_LAYOUT): BufferGeometry {
  const d = hallDims(layout);
  const parts: BufferGeometry[] = [];
  const segs = treadSegments(d);

  // Flat floor between the screen wall and row A's tread.
  parts.push(box(-d.wallX, d.wallX, FLOOR_BOTTOM_Y, 0, d.frontWallZ, d.riserFrontZ(0), ROOM_COLORS.frontFloor));

  for (let r = 0; r < d.rows; r++) {
    const top = rowFloorY(r, layout);
    const bottom = r === 0 ? FLOOR_BOTTOM_Y : rowFloorY(r - 1, layout);
    const z0 = d.riserFrontZ(r);
    const z1 = d.treadBackZ(r);
    for (const [x0, x1, aisle] of segs) {
      parts.push(box(x0, x1, bottom, top, z0, z1, aisle ? ROOM_COLORS.aisle : ROOM_COLORS.carpet));
    }
    // Aisle half-step in front of each riser (walkable steps in the aisles).
    if (r > 0) {
      const half = bottom + layout.rowRise / 2;
      for (const [x0, x1] of d.aisleSpans) {
        parts.push(box(x0, x1, bottom - 0.01, half, z0 - 0.45, z0, ROOM_COLORS.aisle));
      }
    }
  }
  return mergeAll(parts);
}

/* ------------------------------------------------------------------ */
/* Step lights                                                          */
/* ------------------------------------------------------------------ */

export function buildStepStripGeometry(layout: HallLayout = DEFAULT_LAYOUT): BufferGeometry {
  const d = hallDims(layout);
  const parts: BufferGeometry[] = [];
  for (let r = 1; r < d.rows; r++) {
    const y = rowFloorY(r, layout);
    const z = d.riserFrontZ(r);
    // Thin strip on the nose: visible from the front (face) and from above (top lip).
    parts.push(box(-d.wallX + 0.02, d.wallX - 0.02, y - 0.03, y + 0.004, z - 0.006, z + 0.018, ROOM_COLORS.stepStrip));
  }
  return mergeAll(parts);
}

export function buildAisleLightGeometry(layout: HallLayout = DEFAULT_LAYOUT): BufferGeometry {
  const d = hallDims(layout);
  const parts: BufferGeometry[] = [];
  const dot = (x: number, y: number, z: number) =>
    parts.push(box(x - 0.035, x + 0.035, y - 0.045, y - 0.02, z - 0.008, z + 0.002, ROOM_COLORS.aisleLight));
  for (let r = 1; r < d.rows; r++) {
    const top = rowFloorY(r, layout);
    const half = rowFloorY(r - 1, layout) + layout.rowRise / 2;
    const z = d.riserFrontZ(r);
    d.aisleSpans.forEach(([x0, x1], i) => {
      const outer = i === 0 || i === d.aisleSpans.length - 1;
      const xs = outer ? (i === 0 ? [x1 - 0.25, x0 + 0.35] : [x0 + 0.25, x1 - 0.35]) : [(x0 + x1) / 2];
      for (const x of xs) {
        dot(x, top, z); // main riser nose
        dot(x, half, z - 0.45); // half-step nose
      }
    });
  }
  return mergeAll(parts);
}

/* ------------------------------------------------------------------ */
/* Walls & ceiling                                                      */
/* ------------------------------------------------------------------ */

function plane(w: number, h: number, hex: string): BufferGeometry {
  return colorize(new PlaneGeometry(w, h), hex);
}

export function buildWallGeometry(layout: HallLayout = DEFAULT_LAYOUT): BufferGeometry {
  const d = hallDims(layout);
  const parts: BufferGeometry[] = [];
  const depth = d.backWallZ - d.frontWallZ;
  const height = CEILING_Y - FLOOR_BOTTOM_Y;
  const midZ = (d.backWallZ + d.frontWallZ) / 2;
  const midY = (CEILING_Y + FLOOR_BOTTOM_Y) / 2;

  // Side walls: planes facing inwards (no top caps -> invisible from above).
  const left = plane(depth, height, ROOM_COLORS.wall);
  left.rotateY(Math.PI / 2);
  left.translate(-d.wallX, midY, midZ);
  parts.push(left);
  const right = plane(depth, height, ROOM_COLORS.wall);
  right.rotateY(-Math.PI / 2);
  right.translate(d.wallX, midY, midZ);
  parts.push(right);

  // Back wall facing the screen (-z).
  const back = plane(d.wallX * 2, height, ROOM_COLORS.backWall);
  back.rotateY(Math.PI);
  back.translate(0, midY, d.backWallZ);
  parts.push(back);

  // Front (screen) wall facing the audience (+z).
  const front = plane(d.wallX * 2, height, ROOM_COLORS.frontWall);
  front.translate(0, midY, d.frontWallZ);
  parts.push(front);

  // Acoustic ribs along the side walls: thin vertical battens.
  const ribTop = CEILING_Y - 0.9;
  const ribBottom = 0.2;
  for (let z = d.frontWallZ + 0.9; z < d.backWallZ - 0.3; z += 0.6) {
    const yb = ribBottom + floorYAt(z, d);
    for (const side of [-1, 1]) {
      const xIn = side * (d.wallX - 0.08);
      const xOut = side * d.wallX;
      parts.push(box(Math.min(xIn, xOut), Math.max(xIn, xOut), yb, ribTop, z - 0.03, z + 0.03, ROOM_COLORS.rib));
    }
  }
  // Ribs on the back wall.
  for (let x = -d.wallX + 0.6; x < d.wallX - 0.3; x += 0.6) {
    const yb = rowFloorY(d.rows - 1, layout) + 0.2;
    parts.push(box(x - 0.03, x + 0.03, yb, ribTop, d.backWallZ - 0.05, d.backWallZ, ROOM_COLORS.rib));
  }
  return mergeAll(parts);
}

/** Ceiling: single plane whose front face points DOWN (-y). */
export function buildCeilingGeometry(layout: HallLayout = DEFAULT_LAYOUT): BufferGeometry {
  const d = hallDims(layout);
  const depth = d.backWallZ - d.frontWallZ;
  const g = plane(d.wallX * 2, depth, ROOM_COLORS.ceiling);
  g.rotateX(Math.PI / 2); // +z normal -> -y normal
  g.translate(0, CEILING_Y, (d.backWallZ + d.frontWallZ) / 2);
  g.deleteAttribute('uv');
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ */
/* Fake contact shadows (vertex alpha, no textures)                      */
/* ------------------------------------------------------------------ */

/**
 * Soft-edged rectangle on a horizontal plane: 4x4 vertex grid, inner vertices
 * opaque, outer ring transparent, so the GPU interpolates a soft falloff.
 */
function softRect(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  feather: number,
  alpha: number,
  alphaFront = alpha,
): BufferGeometry {
  const xs = [x0 - feather, x0 + feather, x1 - feather, x1 + feather];
  const zs = [z0 - feather, z0 + feather, z1 - feather, z1 + feather];
  const pos: number[] = [];
  const col: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      pos.push(xs[i], y, zs[j]);
      const inner = i > 0 && i < 3 && j > 0 && j < 3;
      const a = inner ? (j === 1 ? alphaFront : alpha) : 0;
      col.push(0, 0, 0, a);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const a = j * 4 + i;
      const b = a + 1;
      const c = a + 4;
      const e = c + 1;
      // CCW seen from above (+y)
      idx.push(a, c, b, b, c, e);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

export function buildContactShadowGeometry(layout: HallLayout = DEFAULT_LAYOUT): BufferGeometry {
  const d = hallDims(layout);
  const parts: BufferGeometry[] = [];
  for (let r = 0; r < d.rows; r++) {
    const y = rowFloorY(r, layout) + 0.004;
    const z = rowZ(r, layout);
    // Under the seats of each block.
    for (const [x0, x1] of d.blockSpans) {
      parts.push(softRect(x0 + 0.02, x1 - 0.02, z - 0.38, z + 0.42, y, 0.12, 0.62, 0.45));
    }
    // AO where this tread meets the next riser face.
    if (r < d.rows - 1) {
      const zb = d.treadBackZ(r);
      parts.push(softRect(-d.wallX, d.wallX, zb - 0.12, zb - 0.02, y + 0.001, 0.1, 0.5));
    }
  }
  // Darkening along the side walls.
  for (const side of [-1, 1]) {
    for (let r = 0; r < d.rows; r++) {
      const y = rowFloorY(r, layout) + 0.006;
      const x = side * (d.wallX - 0.15);
      parts.push(softRect(x - 0.12, x + 0.12, d.riserFrontZ(r) + 0.05, d.treadBackZ(r) - 0.05, y, 0.12, 0.55));
    }
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error('roomGeometry: shadow merge failed');
  merged.computeBoundingSphere();
  return merged;
}

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */

/**
 * Curved screen: chord `width`, sagitta `curve` (edges bend towards +z),
 * bottom at `screen.bottom`, centre of the curve at z = 0, facing +z.
 * `pad` grows the surface (for the masking border) along the same arc;
 * `zOffset` pushes it back.
 */
export function buildScreenGeometry(
  layout: HallLayout = DEFAULT_LAYOUT,
  pad = 0,
  zOffset = 0,
  segments = 48,
): BufferGeometry {
  const { width, height, curve, bottom } = layout.screen;
  const radius = (width * width) / 4 / (2 * curve) + curve / 2;
  const halfAngle = Math.asin(width / 2 / radius);
  const arcHalf = halfAngle * radius + pad;
  const h = height + pad * 2;
  const g = new PlaneGeometry(1, h, segments, 1);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i); // -0.5..0.5
    const theta = (u * 2 * arcHalf) / radius;
    pos.setXYZ(i, radius * Math.sin(theta), pos.getY(i) + bottom + height / 2, radius * (1 - Math.cos(theta)) - zOffset);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function screenRadius(layout: HallLayout = DEFAULT_LAYOUT): number {
  const { width, curve } = layout.screen;
  return (width * width) / 4 / (2 * curve) + curve / 2;
}
