'use client';
/**
 * Winding roads and park paths: flat ribbons extruded along the CatmullRom centre lines
 * from parkLayout. Asphalt roads get pale kerb/sidewalk edges in the shader.
 * Depth layering is done with polygonOffset (lawn +2, plaza +1, walk 0, path -1, asphalt -2).
 */
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial } from 'three';
import { COLORS } from './constants';
import { getParkLayout, type RoadKind, type RoadStrip } from './parkLayout';
import { NOISE_GLSL, WORLD_POS_VARYINGS, WORLD_POS_VERTEX, bindEnvUniforms } from './shaderChunks';

function buildRibbons(strips: RoadStrip[]): BufferGeometry {
  let verts = 0;
  let tris = 0;
  for (const s of strips) {
    const n = s.points.length / 2;
    verts += n * 2;
    tris += (n - 1) * 2;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const idx = new Uint32Array(tris * 3);
  let v = 0;
  let t = 0;
  for (const s of strips) {
    const p = s.points;
    const n = p.length / 2;
    const hw = s.width / 2;
    let along = 0;
    const base = v;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      let tx = p[i1 * 2] - p[i0 * 2];
      let tz = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (i > 0) along += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? -1 : 1;
        pos[v * 3] = x - tz * hw * sgn;
        pos[v * 3 + 1] = 0.02;
        pos[v * 3 + 2] = z + tx * hw * sgn;
        nor[v * 3 + 1] = 1;
        uv[v * 2] = side;
        uv[v * 2 + 1] = along / 10;
        v++;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      // Winding so the face points up (+y).
      idx[t++] = a;
      idx[t++] = a + 1;
      idx[t++] = a + 2;
      idx[t++] = a + 1;
      idx[t++] = a + 3;
      idx[t++] = a + 2;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const OFFSET: Record<RoadKind, number> = { walk: 0, path: -1, asphalt: -2 };

function makeRoadMaterial(kind: RoadKind): MeshLambertMaterial {
  const m = new MeshLambertMaterial({
    color: '#ffffff',
    polygonOffset: true,
    polygonOffsetFactor: OFFSET[kind],
    polygonOffsetUnits: OFFSET[kind],
  });
  const uniforms = {
    uMain: { value: new Color(kind === 'asphalt' ? COLORS.asphalt : kind === 'path' ? COLORS.gravel : COLORS.plaza) },
    uEdge: { value: new Color(kind === 'asphalt' ? COLORS.kerb : kind === 'path' ? COLORS.grassDry : COLORS.plazaJoint) },
    uEdgeW: { value: kind === 'asphalt' ? 0.13 : kind === 'path' ? 0.08 : 0.03 },
  };
  m.onBeforeCompile = (shader) => {
    bindEnvUniforms(shader.uniforms);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_POS_VARYINGS}\nvarying vec2 vRoadUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\nvRoadUv = uv;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_POS_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${WORLD_POS_VARYINGS}\n${NOISE_GLSL}\nvarying vec2 vRoadUv;\nuniform vec3 uMain;\nuniform vec3 uEdge;\nuniform float uEdgeW;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    float e = min(vRoadUv.x, 1.0 - vRoadUv.x);
    float edge = 1.0 - smoothstep(uEdgeW * 0.8, uEdgeW, e);
    vec3 c = mix(uMain, uEdge, edge);
    c *= 0.95 + 0.08 * envNoise(vEnvWorld.xz * 0.12);
    c *= 1.0 - 0.3 * envCloud(vEnvWorld.xz);
    diffuseColor.rgb = c;
  }`,
      );
  };
  m.customProgramCacheKey = () => `arena-road-${kind}`;
  return m;
}

const KINDS: RoadKind[] = ['walk', 'path', 'asphalt'];

export function Roads() {
  const parts = useMemo(() => {
    const { roads } = getParkLayout();
    return KINDS.map((kind) => ({
      kind,
      geometry: buildRibbons(roads.filter((r) => r.kind === kind)),
      material: makeRoadMaterial(kind),
    }));
  }, []);

  useEffect(
    () => () => {
      for (const p of parts) {
        p.geometry.dispose();
        p.material.dispose();
      }
    },
    [parts],
  );

  return (
    <group>
      {parts.map((p) => (
        <mesh key={p.kind} geometry={p.geometry} material={p.material} receiveShadow />
      ))}
    </group>
  );
}
