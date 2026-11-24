/**
 * Baked procedural textures (CPU, once) so the per-pixel shaders stay cheap:
 *  - lawn map (±LAWN_HALF m, mirrored beyond): R = tree-cluster occlusion, G = large-scale
 *    grass colour variation, B = dry patches;
 *  - tileable cloud-shadow noise, scrolled by the shaders.
 */
import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MirroredRepeatWrapping,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three';
import { SUN_DIR } from './constants';
import type { TreeInstance } from './parkLayout';

export const LAWN_HALF = 1536;
const LAWN_RES = 512;

function hash2(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise; `period` > 0 makes it tile every `period` lattice cells. */
function vnoise(x: number, y: number, seed: number, period = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
  const x0 = w(xi);
  const x1 = w(xi + 1);
  const y0 = w(yi);
  const y1 = w(yi + 1);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, octaves: number, period = 0): number {
  let v = 0;
  let amp = 0.5;
  let norm = 0;
  let p = period;
  for (let o = 0; o < octaves; o++) {
    v += amp * vnoise(x, y, seed + o * 31, p);
    norm += amp;
    x *= 2;
    y *= 2;
    p *= 2;
    amp *= 0.5;
  }
  return v / norm;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function bakeLawnTexture(trees: TreeInstance[]): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LAWN_RES;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // R: soft occlusion blobs under trees, shifted away from the sun.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, LAWN_RES, LAWN_RES);
  ctx.globalCompositeOperation = 'lighter';
  const px = LAWN_RES / (LAWN_HALF * 2);
  const sx = -SUN_DIR.x / SUN_DIR.y;
  const sz = -SUN_DIR.z / SUN_DIR.y;
  for (const t of trees) {
    const x = (t.x + sx * t.h * 0.35 + LAWN_HALF) * px;
    const y = (t.z + sz * t.h * 0.35 + LAWN_HALF) * px;
    const r = Math.max(1.6, t.h * 0.6 * t.w * px);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,0,0,0.45)');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // G / B: macro grass variation and dry patches (metres → noise space).
  const img = ctx.getImageData(0, 0, LAWN_RES, LAWN_RES);
  const d = img.data;
  const m = (LAWN_HALF * 2) / LAWN_RES;
  for (let j = 0; j < LAWN_RES; j++) {
    const wz = j * m - LAWN_HALF;
    for (let i = 0; i < LAWN_RES; i++) {
      const wx = i * m - LAWN_HALF;
      const big = fbm(wx * 0.0032, wz * 0.0032, 7, 4);
      const dry = smoothstep(0.58, 0.76, fbm(wx * 0.0085 + 11, wz * 0.0085, 19, 3));
      const k = (j * LAWN_RES + i) * 4;
      d[k + 1] = Math.round(smoothstep(0.3, 0.7, big) * 255);
      d[k + 2] = Math.round(dry * 255);
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = MirroredRepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** Tileable cloud noise (R8). One tile = CLOUD_TILE metres. */
export const CLOUD_TILE = 1400;
export function makeCloudTexture(): DataTexture {
  const N = 256;
  const data = new Uint8Array(N * N);
  const P = 6; // lattice cells per tile (base octave)
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const n = fbm((i / N) * P, (j / N) * P, 101, 4, P);
      data[j * N + i] = Math.round(Math.min(1, Math.max(0, n)) * 255);
    }
  }
  const tex = new DataTexture(data, N, N, RedFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
