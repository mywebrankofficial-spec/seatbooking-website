'use client';
/**
 * Sun shafts through the roof opening, shown when looking at the pitch from the stands
 * (levels 'seatView' and 'boxView'): a slanted additive light prism from the roof opening
 * down to the pitch, plus a warm yellow-green light patch where it lands.
 * Hidden (not drawn at all) on every other level.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { BOWL, ROOF } from '@/lib/stadium-geometry';
import { useStadium } from '@/store/stadium';
import { COLORS, SUN_DIR } from './constants';
import { roundedRectPoints } from './parkLayout';

const SHAFT_LEVELS = new Set(['seatView', 'boxView']);

/** Ground offset of the light that passes the roof opening (sun is low: shifted away from it). */
const DROP_X = (-SUN_DIR.x / SUN_DIR.y) * ROOF.innerY;
const DROP_Z = (-SUN_DIR.z / SUN_DIR.y) * ROOF.innerY;

function prismGeometry(): BufferGeometry {
  const ring = roundedRectPoints(ROOF.innerD, 12);
  const n = ring.length;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const uv = new Float32Array((n + 1) * 2 * 2);
  for (let i = 0; i <= n; i++) {
    const [x, z] = ring[i % n];
    const k = i * 2;
    // bottom (on the pitch)
    pos.set([x + DROP_X, 0.05, z + DROP_Z], k * 3);
    uv.set([i / n, 0], k * 2);
    // top (roof opening)
    pos.set([x, ROOF.innerY, z], (k + 1) * 3);
    uv.set([i / n, 1], (k + 1) * 2);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const SHAFT_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHAFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
void main() {
  float u = vUv.x * 6.2831853;
  float streak = 0.55 + 0.25 * sin(u * 37.0 + sin(u * 5.0 + uTime * 0.05) * 3.0) + 0.2 * sin(u * 91.0 - uTime * 0.03);
  float fadeV = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float graze = 1.0 - abs(dot(normalize(vNormalW), v));
  float a = uOpacity * streak * fadeV * (0.35 + 0.65 * graze);
  gl_FragColor = vec4(uColor * a * 0.085, 1.0);
}
`;

const PATCH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec2 uDrop;
uniform vec4 uRect; // sx, sz, r, d (opening)
varying vec3 vWorld;
float rrect(vec2 p) {
  vec2 q = abs(p) - uRect.xy;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRect.z - uRect.w;
}
void main() {
  vec2 p = vWorld.xz;
  // Back along the sun ray to the roof plane: inside the opening = lit.
  float lit = 1.0 - smoothstep(-4.0, 3.0, rrect(p - uDrop));
  gl_FragColor = vec4(uColor * lit * uOpacity * 0.16, 1.0);
}
`;

const PATCH_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export function SunShafts() {
  const group = useRef<Group>(null);
  const fade = useRef(0);

  const parts = useMemo(() => {
    const shaftMat = new ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: { uColor: { value: new Color(COLORS.shaft) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const patchMat = new ShaderMaterial({
      vertexShader: PATCH_VERT,
      fragmentShader: PATCH_FRAG,
      uniforms: {
        uColor: { value: new Color(COLORS.pitchPatch) },
        uOpacity: { value: 0 },
        uDrop: { value: [DROP_X, DROP_Z] },
        uRect: { value: [BOWL.halfX - BOWL.cornerR, BOWL.halfZ - BOWL.cornerR, BOWL.cornerR, ROOF.innerD] },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      fog: false,
      toneMapped: false,
    });
    const patchGeo = new PlaneGeometry(BOWL.halfX * 2, BOWL.halfZ * 2);
    patchGeo.rotateX(-Math.PI / 2);
    patchGeo.translate(0, 0.04, 0);
    return { shaftGeo: prismGeometry(), shaftMat, patchGeo, patchMat };
  }, []);

  useEffect(
    () => () => {
      parts.shaftGeo.dispose();
      parts.shaftMat.dispose();
      parts.patchGeo.dispose();
      parts.patchMat.dispose();
    },
    [parts],
  );

  useFrame((state, dt) => {
    const want = SHAFT_LEVELS.has(useStadium.getState().level) ? 1 : 0;
    fade.current += (want - fade.current) * (1 - Math.exp(-dt * 2.2));
    if (Math.abs(fade.current - want) < 0.002) fade.current = want;
    const g = group.current;
    if (!g) return;
    g.visible = fade.current > 0.001;
    parts.shaftMat.uniforms.uOpacity.value = fade.current;
    parts.shaftMat.uniforms.uTime.value = state.clock.elapsedTime;
    parts.patchMat.uniforms.uOpacity.value = fade.current;
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={parts.shaftGeo} material={parts.shaftMat} renderOrder={10} frustumCulled={false} />
      <mesh geometry={parts.patchGeo} material={parts.patchMat} renderOrder={9} />
    </group>
  );
}
