'use client';
/**
 * Pitch: 105 x 68 at y = 0 with mowed stripes and analytic (anti-aliased) line markings,
 * run-off grass up to the bowl edge, goals with nets, LED advertising boards.
 */
import { useEffect, useMemo } from 'react';
import {
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  BoxGeometry,
  MeshBasicMaterial,
} from 'three';
import { BOWL, PITCH } from '@/lib/stadium-geometry';

const HL = PITCH.length / 2;
const HW = PITCH.width / 2;

const PITCH_GLSL = /* glsl */ `
varying vec2 vPitchXZ;
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float pitchLines(vec2 p) {
  // p = (x along length, z across), use symmetry
  vec2 q = abs(p);
  float d = 1e5;
  d = min(d, sdSeg(q, vec2(0.0, ${HW.toFixed(2)}), vec2(${HL.toFixed(2)}, ${HW.toFixed(2)})));
  d = min(d, sdSeg(q, vec2(${HL.toFixed(2)}, 0.0), vec2(${HL.toFixed(2)}, ${HW.toFixed(2)})));
  d = min(d, abs(p.x) + step(${HW.toFixed(2)}, q.y) * 1e5);
  d = min(d, abs(length(p) - 9.15));
  d = min(d, max(length(p) - 0.16, 0.0));
  // penalty area
  d = min(d, sdSeg(q, vec2(${(HL - 16.5).toFixed(2)}, 0.0), vec2(${(HL - 16.5).toFixed(2)}, 20.16)));
  d = min(d, sdSeg(q, vec2(${(HL - 16.5).toFixed(2)}, 20.16), vec2(${HL.toFixed(2)}, 20.16)));
  // goal area
  d = min(d, sdSeg(q, vec2(${(HL - 5.5).toFixed(2)}, 0.0), vec2(${(HL - 5.5).toFixed(2)}, 9.16)));
  d = min(d, sdSeg(q, vec2(${(HL - 5.5).toFixed(2)}, 9.16), vec2(${HL.toFixed(2)}, 9.16)));
  // penalty spot + arc outside the box
  vec2 ps = vec2(${(HL - 11).toFixed(2)}, 0.0);
  d = min(d, max(length(q - ps) - 0.14, 0.0));
  float arc = abs(length(q - ps) - 9.15);
  d = min(d, q.x < ${(HL - 16.5).toFixed(2)} ? arc : 1e5);
  // corner arcs
  float ca = abs(length(q - vec2(${HL.toFixed(2)}, ${HW.toFixed(2)})) - 1.0);
  d = min(d, (q.x < ${HL.toFixed(2)} && q.y < ${HW.toFixed(2)}) ? ca : 1e5);
  return d;
}
float arenaNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
  float e = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, e, u.x), u.y);
}
`;

function createPitchMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPitchXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPitchXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PITCH_GLSL}`)
      .replace(
        '#include <color_fragment>',
        `
{
  vec2 p = vPitchXZ;
  vec3 g1 = vec3(0.105, 0.30, 0.075);
  vec3 g2 = vec3(0.145, 0.39, 0.10);
  bool inPitch = abs(p.x) <= ${(HL + 1.5).toFixed(2)} && abs(p.y) <= ${(HW + 1.5).toFixed(2)};
  float stripeW = ${(PITCH.length / 18).toFixed(4)};
  float tri = abs(fract((p.x + ${HL.toFixed(2)}) / (2.0 * stripeW)) - 0.5) * 2.0;
  float fw = fwidth(p.x) / stripeW + 1e-4;
  float band = smoothstep(0.5 - fw, 0.5 + fw, tri);
  vec3 grass = mix(g2, g1, band);
  float n = arenaNoise(p * 0.35) * 0.6 + arenaNoise(p * 2.1) * 0.4;
  grass *= 0.92 + 0.14 * n;
  if (!inPitch) grass = vec3(0.10, 0.27, 0.08) * (0.9 + 0.12 * n);
  float d = pitchLines(p);
  float aa = max(fwidth(d), 0.004);
  float line = 1.0 - smoothstep(0.06 - aa, 0.06 + aa, d);
  diffuseColor.rgb = mix(grass, vec3(0.93), line * 0.95);
}
`,
      );
  };
  m.customProgramCacheKey = () => 'arena-pitch-v1';
  return m;
}

function netTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function boardTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d2c8c';
  g.fillRect(0, 0, 512, 32);
  g.fillStyle = '#ffffff';
  g.font = '800 22px Arial, Helvetica, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('ARENA', 24, 17);
  g.fillStyle = '#F26A21';
  g.fillRect(150, 8, 60, 16);
  g.fillStyle = '#ffffff';
  g.fillText('CITY DERBY', 280, 17);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.repeat.set(14, 1);
  return t;
}

const GOAL_W = 7.32;
const GOAL_H = 2.44;
const GOAL_D = 2.0;

export function Pitch() {
  const r = useMemo(() => {
    const ground = new PlaneGeometry(BOWL.halfX * 2 + 4, BOWL.halfZ * 2 + 4, 1, 1);
    ground.rotateX(-Math.PI / 2);
    const groundMat = createPitchMaterial();

    const post = new CylinderGeometry(0.06, 0.06, 1, 10);
    const postMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 });
    const net = netTexture();
    const netMat = new MeshStandardMaterial({
      color: '#ffffff',
      alphaMap: net,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      roughness: 0.9,
    });
    const plane = new PlaneGeometry(1, 1);

    const boardTex = boardTexture();
    const boardMat = new MeshBasicMaterial({ map: boardTex, toneMapped: false, color: '#c8c8c8', side: DoubleSide });
    const boardBox = new BoxGeometry(1, 0.9, 0.12);
    return { ground, groundMat, post, postMat, net, netMat, plane, boardTex, boardMat, boardBox };
  }, []);
  useEffect(
    () => () => {
      Object.values(r).forEach((x) => (x as { dispose: () => void }).dispose());
    },
    [r],
  );

  const bx = HL + 4.2;
  const bz = HW + 3.6;
  const boards: Array<{ pos: [number, number, number]; rotY: number; len: number }> = [
    { pos: [0, 0.45, -bz], rotY: 0, len: 2 * bx },
    { pos: [0, 0.45, bz], rotY: Math.PI, len: 2 * bx },
    { pos: [bx, 0.45, 0], rotY: -Math.PI / 2, len: 2 * bz - 14 },
    { pos: [-bx, 0.45, 0], rotY: Math.PI / 2, len: 2 * bz - 14 },
  ];

  return (
    <group name="arena-pitch">
      <mesh geometry={r.ground} material={r.groundMat} receiveShadow />
      {[1, -1].map((side) => (
        <group key={side} position={[side * HL, 0, 0]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          {/* posts + crossbar (goal mouth on x = 0 of this local frame, net towards +x) */}
          <mesh geometry={r.post} material={r.postMat} position={[0, GOAL_H / 2, -GOAL_W / 2]} scale={[1, GOAL_H, 1]} castShadow />
          <mesh geometry={r.post} material={r.postMat} position={[0, GOAL_H / 2, GOAL_W / 2]} scale={[1, GOAL_H, 1]} castShadow />
          <mesh geometry={r.post} material={r.postMat} position={[0, GOAL_H, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, GOAL_W + 0.12, 1]} castShadow />
          <mesh geometry={r.post} material={r.postMat} position={[GOAL_D, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.6, GOAL_W, 0.6]} />
          {/* nets: back, roof, sides */}
          <mesh geometry={r.plane} material={r.netMat} position={[GOAL_D, GOAL_H / 2 - 0.1, 0]} rotation={[0, Math.PI / 2, 0.0]} scale={[GOAL_W, GOAL_H - 0.2, 1]} />
          <mesh geometry={r.plane} material={r.netMat} position={[GOAL_D / 2, GOAL_H - 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[GOAL_D, GOAL_W, 1]} />
          <mesh geometry={r.plane} material={r.netMat} position={[GOAL_D / 2, GOAL_H / 2, -GOAL_W / 2]} scale={[GOAL_D, GOAL_H, 1]} />
          <mesh geometry={r.plane} material={r.netMat} position={[GOAL_D / 2, GOAL_H / 2, GOAL_W / 2]} scale={[GOAL_D, GOAL_H, 1]} />
        </group>
      ))}
      {boards.map((b, i) => (
        <mesh key={i} geometry={r.boardBox} material={r.boardMat} position={b.pos} rotation={[0, b.rotY, 0]} scale={[b.len, 1, 1]} />
      ))}
    </group>
  );
}
