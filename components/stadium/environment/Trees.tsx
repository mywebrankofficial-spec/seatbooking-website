'use client';
/**
 * Dense dark-green tree clusters: instanced low-poly clumped canopies + trunks.
 * Trees near the stadium (inside the sun's shadow camera) cast shadows; far ones don't.
 * Canopies sway gently in the vertex shader (also in the shadow depth pass).
 */
import { useEffect, useMemo } from 'react';
import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  MeshLambertMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COLORS, TREES } from './constants';
import { getParkLayout, type TreeInstance } from './parkLayout';
import { NOISE_GLSL, WORLD_POS_VARYINGS, WORLD_POS_VERTEX, bindEnvUniforms, envUniforms } from './shaderChunks';

/** Normalised tree: total height 1. Canopy spans y ≈ 0.27..1. */
function canopyGeometry(detail: number): BufferGeometry {
  const blobs: Array<[number, number, number, number]> = [
    [0, 0.58, 0, 0.3],
    [0.2, 0.5, 0.08, 0.22],
    [-0.18, 0.52, -0.1, 0.23],
    [0.03, 0.78, -0.04, 0.2],
    [-0.05, 0.47, 0.19, 0.2],
  ];
  const parts = blobs.map(([x, y, z, r]) => {
    const g = new IcosahedronGeometry(r, detail);
    g.translate(x, y, z);
    return g;
  });
  let g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  // Organic lumps: jitter by a hash of the position (identical for shared vertices).
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.sin(x * 91.7 + y * 47.3 + z * 13.1) * 43758.5453;
    const j = (h - Math.floor(h) - 0.5) * 0.05;
    pos.setXYZ(i, x * (1 + j * 1.5), y + j * 0.5, z * (1 + j * 1.5));
  }
  g.computeVertexNormals();
  return g;
}

function trunkGeometry(): BufferGeometry {
  const g = new CylinderGeometry(0.028, 0.04, 0.4, 6, 1, true);
  g.translate(0, 0.2, 0);
  return g;
}

const SWAY_VERTEX = /* glsl */ `
  {
    vec3 ip = vec3(0.0);
    #ifdef USE_INSTANCING
      ip = instanceMatrix[3].xyz;
    #endif
    float ph = dot(ip.xz, vec2(0.071, 0.053));
    float k = max(position.y - 0.3, 0.0);
    transformed.x += sin(uEnvTime * 1.1 + ph) * 0.012 * k;
    transformed.z += cos(uEnvTime * 0.83 + ph * 1.3) * 0.009 * k;
  }
`;

function swayVertex(shader: WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uEnvTime = envUniforms.uEnvTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uEnvTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWAY_VERTEX}`);
}

function makeCanopyMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (shader) => {
    bindEnvUniforms(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uEnvTime;\n${WORLD_POS_VARYINGS}\nvarying float vCanopyY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvCanopyY = position.y;\n${SWAY_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_POS_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_POS_VARYINGS}\n${NOISE_GLSL}\nvarying float vCanopyY;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  diffuseColor.rgb *= mix(0.45, 1.1, smoothstep(0.3, 0.95, vCanopyY));
  diffuseColor.rgb *= 0.9 + 0.2 * envNoise(vEnvWorld.xz * 0.9 + vEnvWorld.y * 0.7);
  diffuseColor.rgb *= 1.0 - 0.3 * envCloud(vEnvWorld.xz);`,
      );
  };
  m.customProgramCacheKey = () => 'arena-canopy';
  return m;
}

function makeCanopyDepthMaterial(): MeshDepthMaterial {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = swayVertex;
  m.customProgramCacheKey = () => 'arena-canopy-depth';
  return m;
}

function fill(mesh: InstancedMesh, trees: TreeInstance[], palette: Color[], tint: boolean): void {
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rot);
    p.set(t.x, 0, t.z);
    s.set(t.h * t.w, t.h, t.h * t.w);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (tint) mesh.setColorAt(i, palette[t.color % palette.length]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function Trees() {
  const built = useMemo(() => {
    const { trees } = getParkLayout();
    const near = trees.filter((t) => Math.hypot(t.x, t.z) < TREES.nearRadius);
    const far = trees.filter((t) => Math.hypot(t.x, t.z) >= TREES.nearRadius);
    const canopyGeo = canopyGeometry(1);
    const canopyFarGeo = canopyGeometry(0);
    const trunkGeo = trunkGeometry();
    const canopyMat = makeCanopyMaterial();
    const depthMat = makeCanopyDepthMaterial();
    const trunkMat = new MeshLambertMaterial({ color: COLORS.trunk });
    const palette = COLORS.canopy.map((c) => new Color(c));

    const make = (geo: BufferGeometry, mat: MeshLambertMaterial, list: TreeInstance[], tint: boolean) => {
      const mesh = new InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.count = list.length;
      fill(mesh, list, palette, tint);
      return mesh;
    };

    const canopyNear = make(canopyGeo, canopyMat, near, true);
    canopyNear.castShadow = true;
    canopyNear.receiveShadow = true;
    canopyNear.customDepthMaterial = depthMat;
    const canopyFar = make(canopyFarGeo, canopyMat, far, true);
    canopyFar.receiveShadow = true;
    const trunkNear = make(trunkGeo, trunkMat, near, false);
    trunkNear.castShadow = true;
    trunkNear.receiveShadow = true;
    const trunkFar = make(trunkGeo, trunkMat, far, false);

    return {
      meshes: [canopyNear, canopyFar, trunkNear, trunkFar],
      dispose: () => {
        canopyGeo.dispose();
        canopyFarGeo.dispose();
        trunkGeo.dispose();
        canopyMat.dispose();
        depthMat.dispose();
        trunkMat.dispose();
        [canopyNear, canopyFar, trunkNear, trunkFar].forEach((m) => m.dispose());
      },
    };
  }, []);

  useEffect(() => built.dispose, [built]);

  return (
    <group>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
