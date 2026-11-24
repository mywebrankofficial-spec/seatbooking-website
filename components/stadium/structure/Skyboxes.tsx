'use client';
/**
 * VIP Level 2 skyboxes (layout.skyboxes, 14 per long side): glass fronts, wood rooms with emissive
 * light strips, black leather recliners (instanced, eased per-chair colour), two real warm point lights
 * that follow the focused box, and an orange hover glow on the hovered box's glass.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  FrontSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferGeometry,
  type Mesh,
  type PointLight,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getStadiumLayout, SKYBOX, type SkyboxDef } from '@/lib/stadium-geometry';
import { useStadium } from '@/store/stadium';
import { HEX } from './common';
import { useAvailability } from './state';

const H = SKYBOX.height;
const D = SKYBOX.depth;
const STEP_Z = -1.7;
const STEP_H = 0.4;

function woodTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const planks = 8;
  for (let i = 0; i < planks; i++) {
    const l = 38 + ((i * 37) % 11);
    g.fillStyle = `hsl(28, 48%, ${l}%)`;
    g.fillRect((i * 256) / planks, 0, 256 / planks, 256);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `hsla(25, 50%, ${l - 10}%, 0.35)`;
      g.lineWidth = 1;
      const x = (i * 256) / planks + ((k * 13 + i * 7) % 32);
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 3, 80, x - 3, 170, x + 2, 256);
      g.stroke();
    }
    g.fillStyle = 'rgba(40,20,8,0.5)';
    g.fillRect((i * 256) / planks, 0, 1.5, 256);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function boxMatrix(box: SkyboxDef): Matrix4 {
  const o = new Object3D();
  o.position.set(box.glass.x, SKYBOX.floorY, box.glass.z);
  o.rotation.set(0, box.yaw, 0);
  o.updateMatrix();
  return o.matrix.clone();
}

function part(g: BufferGeometry, x: number, y: number, z: number, rx = 0): BufferGeometry {
  const o = new Object3D();
  o.position.set(x, y, z);
  o.rotation.set(rx, 0, 0);
  o.updateMatrix();
  const n = g.index ? g.toNonIndexed() : g;
  n.applyMatrix4(o.matrix);
  return n;
}

interface RoomGeos {
  wood: BufferGeometry;
  floor: BufferGeometry;
  ceiling: BufferGeometry;
  lights: BufferGeometry;
  frame: BufferGeometry;
  glass: BufferGeometry;
}

function buildRooms(boxes: SkyboxDef[]): RoomGeos | null {
  if (!boxes.length) return null;
  const acc: Record<keyof RoomGeos, BufferGeometry[]> = { wood: [], floor: [], ceiling: [], lights: [], frame: [], glass: [] };
  for (const box of boxes) {
    const w = box.width;
    const M = boxMatrix(box);
    const add = (k: keyof RoomGeos, g: BufferGeometry) => acc[k].push(g.applyMatrix4(M));
    // walls
    add('wood', part(new BoxGeometry(w, H, 0.12), 0, H / 2, -D));
    add('wood', part(new BoxGeometry(0.12, H, D), -w / 2 + 0.07, H / 2, -D / 2));
    add('wood', part(new BoxGeometry(0.12, H, D), w / 2 - 0.07, H / 2, -D / 2));
    // back counter
    add('wood', part(new BoxGeometry(w - 0.6, 1.02, 0.55), 0, STEP_H + 0.51, -D + 0.34));
    // floor + raised back platform
    add('floor', part(new BoxGeometry(w, 0.06, -STEP_Z), 0, -0.03, STEP_Z / 2));
    add('floor', part(new BoxGeometry(w, STEP_H, D + STEP_Z), 0, STEP_H / 2, (STEP_Z - D) / 2));
    // ceiling + light strips
    add('ceiling', part(new BoxGeometry(w, 0.08, D), 0, H + 0.04, -D / 2));
    add('lights', part(new BoxGeometry(w - 1.2, 0.03, 0.22), 0, H - 0.01, -1.1));
    add('lights', part(new BoxGeometry(w - 1.2, 0.03, 0.22), 0, H - 0.01, -3.4));
    add('lights', part(new BoxGeometry(w - 0.8, 0.05, 0.05), 0, STEP_H + 1.04, -D + 0.08));
    // glass frame: mullions, head, rail
    add('frame', part(new BoxGeometry(0.14, H, 0.16), -w / 2 + 0.07, H / 2, 0));
    add('frame', part(new BoxGeometry(0.14, H, 0.16), w / 2 - 0.07, H / 2, 0));
    add('frame', part(new BoxGeometry(w, 0.12, 0.18), 0, H - 0.06, 0));
    add('frame', part(new BoxGeometry(w, 0.14, 0.2), 0, 0.07, 0));
    // glass
    add('glass', part(new PlaneGeometry(w - 0.28, H - 0.26), 0, H / 2, 0.02));
  }
  const m = (k: keyof RoomGeos) => mergeGeometries(acc[k], false)!;
  return { wood: m('wood'), floor: m('floor'), ceiling: m('ceiling'), lights: m('lights'), frame: m('frame'), glass: m('glass') };
}

function buildChairGeometry(): BufferGeometry {
  const parts = [
    part(new RoundedBoxGeometry(0.66, 0.28, 0.76, 1, 0.05), 0, 0.14, 0),
    part(new RoundedBoxGeometry(0.54, 0.17, 0.62, 3, 0.07), 0, 0.37, 0.06),
    part(new RoundedBoxGeometry(0.6, 0.66, 0.22, 3, 0.09), 0, 0.72, -0.3, -0.2),
    part(new RoundedBoxGeometry(0.46, 0.15, 0.2, 3, 0.07), 0, 1.0, -0.37, -0.2),
    part(new RoundedBoxGeometry(0.13, 0.24, 0.74, 1, 0.05), -0.33, 0.5, 0.0),
    part(new RoundedBoxGeometry(0.13, 0.24, 0.74, 1, 0.05), 0.33, 0.5, 0.0),
    part(new RoundedBoxGeometry(0.5, 0.08, 0.16, 1, 0.03), 0, 0.27, 0.44),
  ];
  for (const p of parts) p.deleteAttribute('uv');
  return mergeGeometries(parts, false)!;
}

const LEATHER = new Color('#18181b');
const TAN = new Color('#D9894A');
const HOVER = new Color('#4d4038');

export function Skyboxes({ mode }: { mode: 'booking' | 'landing' }) {
  const L = getStadiumLayout();
  const availability = useAvailability();
  const avail = availability.skyboxAvailable;

  const res = useMemo(() => {
    const wood = woodTexture();
    wood.repeat.set(1, 1);
    const open = L.skyboxes.filter((b) => avail[b.id]);
    const sold = L.skyboxes.filter((b) => !avail[b.id]);
    const mk = (bright: boolean) => ({
      wood: new MeshStandardMaterial({ map: wood, emissiveMap: wood, emissive: '#ffb27a', emissiveIntensity: bright ? 0.42 : 0.14, roughness: 0.55 }),
      floor: new MeshStandardMaterial({ color: '#3b2f2b', roughness: 1 }),
      ceiling: new MeshStandardMaterial({ color: '#efe7dc', emissive: '#ffd9a8', emissiveIntensity: bright ? 0.32 : 0.1, roughness: 0.8 }),
      lights: new MeshBasicMaterial({ color: bright ? '#ffe4b8' : '#8c7b62' }),
    });
    const frameMat = new MeshStandardMaterial({ color: '#2b2f36', roughness: 0.4, metalness: 0.6 });
    const glassMat = new MeshPhysicalMaterial({
      color: '#d6e8f2',
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.16,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.0,
      side: FrontSide, // reflective from the bowl, clear when looking out from inside the box
      depthWrite: false,
    });
    return { wood, rooms: [buildRooms(open), buildRooms(sold)], mats: [mk(true), mk(false)], frameMat, glassMat };
  }, [L, avail]);

  const chairs = useMemo(() => {
    const geo = buildChairGeometry();
    const mat = new MeshStandardMaterial({ roughness: 0.42, metalness: 0.05 });
    const o = new Object3D();
    return (['N', 'S'] as const).map((side) => {
      const boxes = L.skyboxes.filter((b) => b.side === side);
      const mesh = new InstancedMesh(geo, mat, boxes.length * SKYBOX.chairsPerBox);
      const keys: Array<{ box: number; n: number }> = [];
      let i = 0;
      for (const b of boxes)
        for (const c of b.chairs) {
          o.position.set(c.position.x, c.position.y, c.position.z);
          o.rotation.set(0, c.yaw, 0);
          o.updateMatrix();
          mesh.setMatrixAt(i, o.matrix);
          mesh.setColorAt(i, LEATHER.clone().multiplyScalar(avail[b.id] ? 1 : 0.7));
          keys.push({ box: b.id, n: c.n });
          i++;
        }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      return { mesh, keys, cur: new Float32Array(keys.length * 2), geo, mat };
    });
  }, [L, avail]);

  useEffect(
    () => () => {
      res.wood.dispose();
      for (const r of res.rooms) if (r) Object.values(r).forEach((g) => g.dispose());
      for (const m of res.mats) Object.values(m).forEach((x) => x.dispose());
      res.frameMat.dispose();
      res.glassMat.dispose();
    },
    [res],
  );
  useEffect(
    () => () => {
      chairs[0].geo.dispose();
      chairs[0].mat.dispose();
      chairs.forEach((c) => c.mesh.dispose());
    },
    [chairs],
  );

  const light1 = useRef<PointLight>(null);
  const light2 = useRef<PointLight>(null);
  const glow = useRef<Mesh>(null);
  const glowMat = useMemo(() => new MeshBasicMaterial({ color: HEX.orange, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  const glowGeo = useMemo(() => new PlaneGeometry(1, 1), []);
  useEffect(
    () => () => {
      glowMat.dispose();
      glowGeo.dispose();
    },
    [glowMat, glowGeo],
  );
  const lightAmt = useRef(0);
  const tmp = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    const st = useStadium.getState();
    const k = 1 - Math.exp(-Math.min(delta, 0.1) / 0.06);
    const booking = mode === 'booking';
    const vip = booking && (st.level === 'skyboxes' || st.level === 'box' || st.level === 'boxView');
    const hoverBox = booking && st.level === 'skyboxes' && st.hover?.type === 'skybox' ? st.hover.skyboxId : null;
    const focusId = hoverBox ?? st.skyboxId ?? 12;
    const focus = L.skyboxById.get(focusId);

    // warm interior lights follow the focused box
    lightAmt.current += ((vip ? 1 : 0) - lightAmt.current) * k * 0.5;
    if (focus) {
      const ox = Math.cos(focus.yaw), oz = -Math.sin(focus.yaw); // local +x
      const ix = -Math.sin(focus.yaw) * 2.4, iz = -Math.cos(focus.yaw) * 2.4; // into the room
      const y = SKYBOX.floorY + H - 0.5;
      const dim = avail[focusId] ? 1 : 0.45;
      if (light1.current) {
        light1.current.position.set(focus.glass.x + ix + ox * 1.5, y, focus.glass.z + iz + oz * 1.5);
        light1.current.intensity = 14 * lightAmt.current * dim;
      }
      if (light2.current) {
        light2.current.position.set(focus.glass.x + ix - ox * 1.5, y, focus.glass.z + iz - oz * 1.5);
        light2.current.intensity = 14 * lightAmt.current * dim;
      }
    }

    // hover glow on the glass
    if (glow.current) {
      const target = hoverBox !== null ? (avail[hoverBox] ? 0.22 : 0.1) : 0;
      glowMat.opacity += (target - glowMat.opacity) * k;
      if (hoverBox !== null) {
        const b = L.skyboxById.get(hoverBox)!;
        glow.current.position.set(b.glass.x - Math.sin(b.yaw) * -0.06, b.glass.y, b.glass.z - Math.cos(b.yaw) * -0.06);
        glow.current.rotation.set(0, b.yaw, 0);
        glow.current.scale.set(b.width - 0.3, H - 0.3, 1);
      }
      glow.current.visible = glowMat.opacity > 0.005;
    }

    // chair colours
    const selBox = booking && (st.level === 'box' || st.level === 'boxView') ? st.skyboxId : null;
    const selChair = selBox !== null ? st.chair : null;
    const hov = booking && st.level === 'box' && st.hover?.type === 'chair' ? st.hover : null;
    for (const c of chairs) {
      let dirty = false;
      for (let i = 0; i < c.keys.length; i++) {
        const key = c.keys[i];
        const tSel = key.box === selBox && key.n === selChair ? 1 : 0;
        const tHov = hov && hov.skyboxId === key.box && hov.chair === key.n ? 1 : 0;
        const a = c.cur[i * 2], b = c.cur[i * 2 + 1];
        const na = a + (tSel - a) * k, nb = b + (tHov - b) * k;
        if (Math.abs(na - a) > 1e-4 || Math.abs(nb - b) > 1e-4) {
          c.cur[i * 2] = na;
          c.cur[i * 2 + 1] = nb;
          const chairFree = availability.chairAvailable[key.box]?.[key.n - 1] ?? false;
          tmp.copy(LEATHER).multiplyScalar(avail[key.box] ? 1 : 0.7);
          tmp.lerp(HOVER, nb * (chairFree ? 1 : 0.5));
          tmp.lerp(TAN, na);
          c.mesh.setColorAt(i, tmp);
          dirty = true;
        }
      }
      if (dirty && c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group name="arena-skyboxes">
      {res.rooms.map((r, i) =>
        r ? (
          <group key={i}>
            <mesh geometry={r.wood} material={res.mats[i].wood} receiveShadow />
            <mesh geometry={r.floor} material={res.mats[i].floor} receiveShadow />
            <mesh geometry={r.ceiling} material={res.mats[i].ceiling} />
            <mesh geometry={r.lights} material={res.mats[i].lights} />
            <mesh geometry={r.frame} material={res.frameMat} castShadow receiveShadow />
            <mesh geometry={r.glass} material={res.glassMat} renderOrder={2} />
          </group>
        ) : null,
      )}
      {chairs.map((c, i) => (
        <primitive key={i} object={c.mesh} />
      ))}
      <mesh ref={glow} geometry={glowGeo} material={glowMat} visible={false} renderOrder={3} />
      <pointLight ref={light1} color="#ffc98f" intensity={0} distance={9} decay={2} />
      <pointLight ref={light2} color="#ffc98f" intensity={0} distance={9} decay={2} />
    </group>
  );
}
