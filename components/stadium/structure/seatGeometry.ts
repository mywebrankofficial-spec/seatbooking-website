/**
 * Low-poly red stadium shell seat (~150 tris): one continuous pan+back shell extruded across x,
 * wrapped forward at the sides, rounded top corners, plus a dark pedestal.
 * Seat-local: origin = seat floor point (layout.seatPos), +y up, front (towards the pitch) = +z.
 * Attribute aPart: 0 = plastic shell, 1 = metal pedestal.
 */
import { BufferAttribute, BufferGeometry, ShapeUtils, Vector2 } from 'three';

/** Closed CCW profile in (z, y). */
const PROFILE: Array<[number, number]> = [
  [0.2, 0.395],
  [0.222, 0.425],
  [0.19, 0.452],
  [0.0, 0.438],
  [-0.15, 0.452],
  [-0.215, 0.51],
  [-0.24, 0.66],
  [-0.255, 0.8],
  [-0.28, 0.825],
  [-0.3, 0.8],
  [-0.285, 0.64],
  [-0.255, 0.49],
  [-0.18, 0.412],
  [0.0, 0.4],
];
const HALF_W = 0.225;
const XS = 4;

function shapeAt(x: number): Array<[number, number]> {
  const t = x / HALF_W; // -1..1
  const t2 = t * t;
  return PROFILE.map(([z, y]) => {
    let zz = z;
    let yy = y;
    if (y > 0.47) zz += 0.055 * t2; // back wraps forward at the sides
    if (y > 0.72) yy -= 0.05 * t2 * t2; // rounded top corners
    if (z > 0.1) zz -= 0.025 * t2 * t2; // rounded front corners
    return [zz, yy];
  });
}

export function buildSeatGeometry(): BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  const v = (x: number, y: number, z: number, p: number) => {
    pos.push(x, y, z);
    part.push(p);
    return pos.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number, nx: number, ny: number, nz: number) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1 = [pos[b * 3] - ax, pos[b * 3 + 1] - ay, pos[b * 3 + 2] - az];
    const e2 = [pos[c * 3] - ax, pos[c * 3 + 1] - ay, pos[c * 3 + 2] - az];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nx + cy * ny + cz * nz >= 0) idx.push(a, b, c);
    else idx.push(a, c, b);
  };

  const shapes: Array<Array<[number, number]>> = [];
  const xs: number[] = [];
  for (let k = 0; k <= XS; k++) {
    const x = -HALF_W + (2 * HALF_W * k) / XS;
    xs.push(x);
    shapes.push(shapeAt(x));
  }
  const np = PROFILE.length;
  // side strips (one per profile edge, smooth across x)
  for (let i = 0; i < np; i++) {
    const i2 = (i + 1) % np;
    const dz = PROFILE[i2][0] - PROFILE[i][0];
    const dy = PROFILE[i2][1] - PROFILE[i][1];
    const nY = -dz, nZ = dy; // outward for a CCW profile
    const a: number[] = [];
    const b: number[] = [];
    for (let k = 0; k <= XS; k++) {
      a.push(v(xs[k], shapes[k][i][1], shapes[k][i][0], 0));
      b.push(v(xs[k], shapes[k][i2][1], shapes[k][i2][0], 0));
    }
    for (let k = 0; k < XS; k++) {
      tri(a[k], a[k + 1], b[k + 1], 0, nY, nZ);
      tri(a[k], b[k + 1], b[k], 0, nY, nZ);
    }
  }
  // end caps
  for (const k of [0, XS]) {
    const sh = shapes[k];
    const nx = k === 0 ? -1 : 1;
    const base = pos.length / 3;
    for (const [z, y] of sh) v(xs[k], y, z, 0);
    const tris = ShapeUtils.triangulateShape(sh.map(([z, y]) => new Vector2(z, y)), []);
    for (const t of tris) tri(base + t[0], base + t[1], base + t[2], nx, 0, 0);
  }
  // pedestal (box)
  const bx = 0.035, z0 = -0.16, z1 = -0.04, y0 = 0, y1 = 0.41;
  const corners = (x: number, y: number, z: number) => v(x, y, z, 1);
  const faces: Array<[number[], [number, number, number]]> = [
    [[-bx, y0, z1, bx, y0, z1, bx, y1, z1, -bx, y1, z1], [0, 0, 1]],
    [[-bx, y0, z0, bx, y0, z0, bx, y1, z0, -bx, y1, z0], [0, 0, -1]],
    [[bx, y0, z0, bx, y0, z1, bx, y1, z1, bx, y1, z0], [1, 0, 0]],
    [[-bx, y0, z0, -bx, y0, z1, -bx, y1, z1, -bx, y1, z0], [-1, 0, 0]],
  ];
  for (const [q, n] of faces) {
    const i0 = corners(q[0], q[1], q[2]);
    const i1 = corners(q[3], q[4], q[5]);
    const i2 = corners(q[6], q[7], q[8]);
    const i3 = corners(q[9], q[10], q[11]);
    tri(i0, i1, i2, n[0], n[1], n[2]);
    tri(i0, i2, i3, n[0], n[1], n[2]);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aPart', new BufferAttribute(new Float32Array(part), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
