'use client';
/**
 * Roof: white membrane over the outer band (MEMBRANE_D0 → ROOF.outerD), an exposed white truss
 * lattice over the open inner band down to ROOF.innerD (instanced cylinders), and two big video
 * screens hanging under the roof at the east and west ends (CanvasTexture score graphic).
 */
import { useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { ROOF, STAND_BY_ID, STANDS, yawFacingPitch, type StandDef } from '@/lib/stadium-geometry';
import { buildMembraneGeometry } from './bowlGeometry';
import { frameAt, HEX, MEMBRANE_D0, roofChordY, trussDepth } from './common';

type P = [number, number, number];

function point(stand: StandDef, sigma: number, d: number, y: number): P {
  const f = frameAt(stand, sigma, d);
  return [f.x, y, f.z];
}

function buildMembers(): Array<[P, P, number]> {
  const out: Array<[P, P, number]> = [];
  const ribs: Array<{ stand: StandDef; sigma: number }> = [];
  const ring: Array<{ stand: StandDef; sigma: number }> = [];
  for (const s of STANDS) {
    const n = s.kind === 'side' ? 10 : s.kind === 'end' ? 6 : 4;
    for (let k = 0; k < n; k++) ribs.push({ stand: s, sigma: k / n });
    const m = s.kind === 'corner' ? 12 : n;
    for (let k = 0; k < m; k++) ring.push({ stand: s, sigma: k / m });
  }
  const top = (d: number) => roofChordY(d);
  const bot = (d: number) => roofChordY(d) - trussDepth(d);
  const panels = 12;
  const nodes: number[] = [];
  for (let i = 0; i <= panels; i++) nodes.push(ROOF.innerD + ((ROOF.outerD - ROOF.innerD) * i) / panels);

  for (const { stand, sigma } of ribs) {
    const d0 = ROOF.innerD, d1 = ROOF.outerD;
    out.push([point(stand, sigma, d0, top(d0)), point(stand, sigma, d1, top(d1)), 0.24]);
    out.push([point(stand, sigma, d0, bot(d0)), point(stand, sigma, d1, bot(d1)), 0.2]);
    for (let i = 0; i < nodes.length; i++) {
      const d = nodes[i];
      if (i % 2 === 0) out.push([point(stand, sigma, d, bot(d)), point(stand, sigma, d, top(d)), 0.11]);
      if (i < nodes.length - 1) {
        const dn = nodes[i + 1];
        const a = i % 2 === 0;
        out.push([point(stand, sigma, d, a ? top(d) : bot(d)), point(stand, sigma, dn, a ? bot(dn) : top(dn)), 0.08]);
      }
    }
    // outer leg down into the shell
    out.push([point(stand, sigma, ROOF.outerD, bot(ROOF.outerD)), point(stand, sigma, ROOF.outerD + 2.2, 26), 0.35]);
  }
  const rings: Array<[number, (d: number) => number, number]> = [
    [ROOF.innerD, top, 0.36],
    [ROOF.innerD, bot, 0.32],
    [ROOF.innerD + 17, top, 0.12],
    [MEMBRANE_D0, top, 0.22],
    [MEMBRANE_D0, bot, 0.14],
    [40, bot, 0.14],
  ];
  for (const [d, yf, r] of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      out.push([point(a.stand, a.sigma, d, yf(d)), point(b.stand, b.sigma, d, yf(d)), r]);
    }
  }
  return out;
}

function screenTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 428;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#0b1d4f');
  grad.addColorStop(1, '#061233');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#F26A21';
  g.fillRect(0, 0, c.width, 14);
  g.fillRect(0, c.height - 14, c.width, 14);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.font = '600 34px Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.fillText('ARENA  ·  CITY DERBY', c.width / 2, 72);
  g.fillStyle = '#ffffff';
  g.font = '800 104px Arial, Helvetica, sans-serif';
  g.fillText('CITY', 190, 250, 300);
  g.fillText('ROVERS', 834, 250, 310);
  g.font = '800 124px Arial, Helvetica, sans-serif';
  g.fillStyle = '#ffd24a';
  g.fillText('0 – 0', c.width / 2, 256, 250);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = '700 54px Arial, Helvetica, sans-serif';
  g.fillText("45:00", c.width / 2, 350);
  g.fillStyle = '#d61f3a';
  g.fillRect(90, 290, 200, 10);
  g.fillStyle = '#2d6cff';
  g.fillRect(734, 290, 200, 10);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Roof() {
  const { membrane, membraneMat, truss, trussGeo, trussMat } = useMemo(() => {
    const membrane = buildMembraneGeometry();
    const membraneMat = new MeshStandardMaterial({ color: HEX.white, roughness: 0.72, metalness: 0, side: DoubleSide });
    const members = buildMembers();
    const trussGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
    const trussMat = new MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.45, metalness: 0.25 });
    const truss = new InstancedMesh(trussGeo, trussMat, members.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const a = new Vector3(), b = new Vector3(), dir = new Vector3(), mid = new Vector3(), sc = new Vector3();
    members.forEach(([p, r2, rad], i) => {
      a.set(...p);
      b.set(...r2);
      dir.subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      q.setFromUnitVectors(up, dir);
      mid.addVectors(a, b).multiplyScalar(0.5);
      sc.set(rad, len, rad);
      m.compose(mid, q, sc);
      truss.setMatrixAt(i, m);
    });
    truss.instanceMatrix.needsUpdate = true;
    truss.computeBoundingSphere();
    truss.castShadow = true;
    truss.receiveShadow = true;
    return { membrane, membraneMat, truss, trussGeo, trussMat };
  }, []);

  const screens = useMemo(() => {
    const tex = screenTexture();
    const faceMat = new MeshBasicMaterial({ map: tex, toneMapped: false, color: '#d8d8d8' });
    const housingMat = new MeshStandardMaterial({ color: '#1d2026', roughness: 0.6, metalness: 0.4 });
    const { width: w, height: h, y } = ROOF.screen;
    const housing = new BoxGeometry(w + 0.9, h + 0.9, 1.6);
    const face = new PlaneGeometry(w, h);
    const cable = new CylinderGeometry(0.07, 0.07, 1, 4, 1, true);
    const list = (['E', 'W'] as const).map((id) => {
      const s = STAND_BY_ID[id];
      const d = 0.5;
      const f = frameAt(s, 0.5, d);
      const yaw = yawFacingPitch(f.nx, f.nz);
      const cableLen = roofChordY(d) - trussDepth(d) - (y + h / 2 + 0.45);
      return { id, pos: [f.x, y, f.z] as P, yaw, cableLen };
    });
    return { tex, faceMat, housingMat, housing, face, cable, list, w, h };
  }, []);

  useEffect(
    () => () => {
      membrane.dispose();
      membraneMat.dispose();
      trussGeo.dispose();
      trussMat.dispose();
      truss.dispose();
      screens.tex.dispose();
      screens.faceMat.dispose();
      screens.housingMat.dispose();
      screens.housing.dispose();
      screens.face.dispose();
      screens.cable.dispose();
    },
    [membrane, membraneMat, truss, trussGeo, trussMat, screens],
  );

  return (
    <group name="arena-roof">
      <mesh geometry={membrane} material={membraneMat} castShadow receiveShadow />
      <primitive object={truss} />
      {screens.list.map((s) => (
        <group key={s.id} position={s.pos} rotation={[0, s.yaw, 0]}>
          <mesh geometry={screens.housing} material={screens.housingMat} castShadow />
          <mesh geometry={screens.face} material={screens.faceMat} position={[0, 0, 0.81]} />
          {[-0.35, 0.35].map((fx) => (
            <mesh
              key={fx}
              geometry={screens.cable}
              material={screens.housingMat}
              position={[fx * screens.w, screens.h / 2 + 0.45 + s.cableLen / 2, 0]}
              scale={[1, s.cableLen, 1]}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
