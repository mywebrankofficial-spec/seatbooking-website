'use client';
/**
 * Real 3D seats with distance LOD.
 *
 * One InstancedMesh per block (112 meshes, built once, hidden by default). Each frame the blocks whose
 * seats are within ~48 m of the camera (max MAX_BLOCKS, nearest first) are shown as real seats; every
 * other block is drawn by the bowl's seat-pattern shader. The bowl hides its pattern under blocks with
 * real seats (block-state texture alpha). In booking mode real seats are off at the aerial/stand levels.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Object3D, Vector3 } from 'three';
import { getStadiumLayout } from '@/lib/stadium-geometry';
import { useStadium } from '@/store/stadium';
import { createSeatMaterial } from './materials';
import { buildSeatGeometry } from './seatGeometry';
import { getShared } from './state';

/** Real-seat LOD tuning (metres from the camera to a block's bounding sphere; max blocks with real seats). */
export const SEAT_LOD = { show: 46, hide: 54, maxBlocks: 30 };

interface BlockMesh {
  mesh: InstancedMesh;
  centre: Vector3;
  radius: number;
}

export function Seats({ mode }: { mode: 'booking' | 'landing' }) {
  const L = getStadiumLayout();
  const { blocks, material, base } = useMemo(() => {
    const base = buildSeatGeometry();
    const material = createSeatMaterial();
    const o = new Object3D();
    const m = new Matrix4();
    const blocks: BlockMesh[] = L.blocks.map((b) => {
      const g = new BufferGeometry();
      g.setAttribute('position', base.getAttribute('position'));
      g.setAttribute('normal', base.getAttribute('normal'));
      g.setAttribute('aPart', base.getAttribute('aPart'));
      g.setIndex(base.getIndex());
      const seat = new Float32Array(b.seatCount * 2);
      for (let i = 0; i < b.seatCount; i++) {
        seat[i * 2] = b.seatStart + i;
        seat[i * 2 + 1] = b.index;
      }
      g.setAttribute('aSeat', new InstancedBufferAttribute(seat, 2));
      const mesh = new InstancedMesh(g, material, b.seatCount);
      const c = new Vector3();
      for (let i = 0; i < b.seatCount; i++) {
        const s = b.seatStart + i;
        o.position.set(L.seatPos[s * 3], L.seatPos[s * 3 + 1], L.seatPos[s * 3 + 2]);
        o.rotation.set(0, L.seatYaw[s], 0);
        o.updateMatrix();
        m.copy(o.matrix);
        mesh.setMatrixAt(i, m);
        c.x += o.position.x;
        c.y += o.position.y;
        c.z += o.position.z;
      }
      c.multiplyScalar(1 / b.seatCount);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.visible = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = `seats-${b.id}`;
      return { mesh, centre: c, radius: mesh.boundingSphere?.radius ?? 15 };
    });
    return { blocks, material, base };
  }, [L]);

  useEffect(
    () => () => {
      for (const b of blocks) {
        b.mesh.geometry.dispose();
        b.mesh.dispose();
      }
      base.dispose();
      material.dispose();
      getShared().real.fill(0);
    },
    [blocks, base, material],
  );

  const order = useMemo(() => new Float32Array(L.blocks.length), [L]);
  const idx = useMemo(() => L.blocks.map((_, i) => i), [L]);

  useFrame(({ camera }) => {
    const s = getShared();
    const st = useStadium.getState();
    const enabled = mode === 'landing' || !(st.level === 'aerial' || st.level === 'stand');
    const force =
      mode === 'booking' && (st.level === 'block' || st.level === 'ticket' || st.level === 'seatView') && st.blockId !== null
        ? (L.blockById.get(st.blockId)?.index ?? -1)
        : -1;
    const cam = camera.position;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      order[i] = enabled ? cam.distanceTo(b.centre) - b.radius : 1e9;
      if (i === force) order[i] = -1e3;
    }
    idx.sort((a, b) => order[a] - order[b]);
    for (let r = 0; r < idx.length; r++) {
      const i = idx[r];
      const was = blocks[i].mesh.visible;
      const d = order[i];
      const show = enabled && r < SEAT_LOD.maxBlocks && (d < SEAT_LOD.show || (was && d < SEAT_LOD.hide));
      if (show !== was) blocks[i].mesh.visible = show;
      s.real[i] = show ? 1 : 0;
    }
  });

  return (
    <group name="arena-seats">
      {blocks.map((b) => (
        <primitive key={b.mesh.name} object={b.mesh} />
      ))}
    </group>
  );
}
