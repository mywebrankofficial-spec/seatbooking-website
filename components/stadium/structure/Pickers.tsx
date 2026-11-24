'use client';
/**
 * Invisible pick proxies per level. Only the active level's targets are mounted.
 *   aerial   → stand wedges        {type:'stand'}
 *   stand    → blocks of the stand {type:'block'}
 *   block    → seats of the block  {type:'seat'}   (instanced boxes, instanceId → global seat index)
 *   skyboxes → glass fronts        {type:'skybox'}
 *   box      → chairs of the box   {type:'chair'}
 */
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BoxGeometry, DoubleSide, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, type BufferGeometry } from 'three';
import { getStadiumLayout, ROOF, SKYBOX, STANDS, TIERS, type StandDef } from '@/lib/stadium-geometry';
import { pointer } from '@/lib/stadium-nav';
import { useStadium, type PickTarget } from '@/store/stadium';
import { GeoBuilder } from './common';

const hidden = new MeshBasicMaterial({ visible: false, side: DoubleSide });
let lastPointerType = 'mouse';

function setCursor(on: boolean) {
  if (typeof document !== 'undefined') document.body.style.cursor = on ? 'pointer' : '';
}

type Ev = ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>;

function handlers(target: (e: Ev) => PickTarget | null) {
  const pt = (e: Ev) => ({ x: e.point.x, y: e.point.y, z: e.point.z });
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      const t = target(e);
      if (!t) return;
      e.stopPropagation();
      lastPointerType = e.pointerType || lastPointerType;
      setCursor(true);
      pointer(t, 'over', pt(e));
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const t = target(e);
      if (!t) return;
      e.stopPropagation();
      lastPointerType = e.pointerType || lastPointerType;
      pointer(t, 'move', pt(e));
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      const t = target(e);
      if (!t) return;
      e.stopPropagation();
      setCursor(false);
      pointer(t, 'out', pt(e));
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      lastPointerType = e.pointerType || lastPointerType;
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const t = target(e);
      if (!t) return;
      e.stopPropagation();
      const ne = e.nativeEvent as MouseEvent & { pointerType?: string };
      const type = ne.pointerType || lastPointerType;
      pointer(t, type === 'touch' ? 'tap' : 'click', pt(e));
    },
  };
}

/** Sloped ruled surface over a stand between sigma s0..s1 and (dA,yA)→(dB,yB). */
function wedge(stand: StandDef, s0: number, s1: number, dA: number, yA: number, dB: number, yB: number): BufferGeometry {
  const g = new GeoBuilder();
  const segs = stand.kind === 'corner' ? Math.max(2, Math.round(16 * (s1 - s0))) : 1;
  g.strip(stand, s0, s1, segs, dA, yA, dB, yB, () => ({}));
  return g.build(false);
}

function StandPickers() {
  const geos = useMemo(() => STANDS.map((s) => wedge(s, 0, 1, -1, 0, ROOF.outerD, ROOF.outerY)), []);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  return (
    <group>
      {STANDS.map((s, i) => (
        <mesh key={s.id} geometry={geos[i]} material={hidden} {...handlers(() => ({ type: 'stand', standId: s.id }))} />
      ))}
    </group>
  );
}

function BlockPickers({ standId }: { standId: StandDef['id'] }) {
  const L = getStadiumLayout();
  const items = useMemo(
    () =>
      L.blocksByStand[standId].map((b) => {
        const t = TIERS[b.tier - 1];
        const stand = STANDS.find((s) => s.id === standId)!;
        const end = t.d0 + t.rows * t.rowDepth;
        return { b, geo: wedge(stand, b.sigma0, b.sigma1, t.d0 - 0.3, t.y0, end, t.y0 + (t.rows - 1) * t.rise + 0.9) };
      }),
    [L, standId],
  );
  useEffect(() => () => items.forEach((i) => i.geo.dispose()), [items]);
  return (
    <group>
      {items.map(({ b, geo }) => (
        <mesh key={b.id} geometry={geo} material={hidden} {...handlers(() => ({ type: 'block', blockId: b.id }))} />
      ))}
    </group>
  );
}

function SeatPickers({ blockId }: { blockId: number }) {
  const L = getStadiumLayout();
  const { mesh, start } = useMemo(() => {
    const b = L.blockById.get(blockId)!;
    const geo = new BoxGeometry(0.52, 0.86, 0.6);
    geo.translate(0, 0.43, -0.05);
    const mesh = new InstancedMesh(geo, hidden, b.seatCount);
    const o = new Object3D();
    for (let i = 0; i < b.seatCount; i++) {
      const s = b.seatStart + i;
      o.position.set(L.seatPos[s * 3], L.seatPos[s * 3 + 1], L.seatPos[s * 3 + 2]);
      o.rotation.set(0, L.seatYaw[s], 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    return { mesh, start: b.seatStart };
  }, [L, blockId]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.dispose();
    },
    [mesh],
  );
  const h = handlers((e) => (e.instanceId === undefined ? null : { type: 'seat', seatIndex: start + e.instanceId }));
  return <primitive object={mesh} {...h} />;
}

function SkyboxPickers() {
  const L = getStadiumLayout();
  const geo = useMemo(() => new PlaneGeometry(1, 1), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      {L.skyboxes.map((box) => (
        <mesh
          key={box.id}
          geometry={geo}
          material={hidden}
          position={[box.glass.x, box.glass.y, box.glass.z]}
          rotation={[0, box.yaw, 0]}
          scale={[box.width - 0.25, SKYBOX.height, 1]}
          {...handlers(() => ({ type: 'skybox', skyboxId: box.id }))}
        />
      ))}
    </group>
  );
}

function ChairPickers({ skyboxId }: { skyboxId: number }) {
  const box = getStadiumLayout().skyboxById.get(skyboxId);
  const geo = useMemo(() => {
    const g = new BoxGeometry(0.8, 1.15, 0.95);
    g.translate(0, 0.575, 0);
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  if (!box) return null;
  return (
    <group>
      {box.chairs.map((c) => (
        <mesh
          key={c.n}
          geometry={geo}
          material={hidden}
          position={[c.position.x, c.position.y, c.position.z]}
          rotation={[0, c.yaw, 0]}
          {...handlers(() => ({ type: 'chair', skyboxId, chair: c.n }))}
        />
      ))}
    </group>
  );
}

export function Pickers() {
  const level = useStadium((s) => s.level);
  const standId = useStadium((s) => s.standId);
  const blockId = useStadium((s) => s.blockId);
  const skyboxId = useStadium((s) => s.skyboxId);
  // reset the cursor when the level (and so the pick set) changes
  useEffect(() => {
    setCursor(false);
  }, [level]);
  useEffect(() => () => setCursor(false), []);

  if (level === 'aerial') return <StandPickers />;
  if (level === 'stand' && standId) return <BlockPickers standId={standId} />;
  if (level === 'block' && blockId !== null) return <SeatPickers key={blockId} blockId={blockId} />;
  if (level === 'skyboxes') return <SkyboxPickers />;
  if (level === 'box' && skyboxId !== null) return <ChairPickers skyboxId={skyboxId} />;
  return null;
}
