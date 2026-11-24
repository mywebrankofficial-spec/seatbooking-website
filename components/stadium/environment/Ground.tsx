'use client';
/**
 * Park lawn (procedural grass: baked large-scale colour variation and dry patches, mid/fine
 * noise, mowing stripes near the stadium, occlusion under tree clusters, drifting cloud
 * shadows) and the pale concrete plaza ring around the stadium. The lawn has a hole where
 * the plaza is and the plaza a hole where the pitch is, so nothing overlaps at y = 0.
 */
import { useEffect, useMemo } from 'react';
import {
  Color,
  MeshLambertMaterial,
  Path,
  Shape,
  ShapeGeometry,
  Vector2,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { COLORS, PLAZA_OUT_D, WORLD_HALF } from './constants';
import { getParkLayout, roundedRectPoints } from './parkLayout';
import { NOISE_GLSL, WORLD_POS_VARYINGS, WORLD_POS_VERTEX, bindEnvUniforms } from './shaderChunks';
import { LAWN_HALF, bakeLawnTexture } from './textures';

function injectWorldPos(shader: WebGLProgramParametersWithUniforms): void {
  bindEnvUniforms(shader.uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WORLD_POS_VARYINGS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_POS_VERTEX}`);
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\n${WORLD_POS_VARYINGS}\n${NOISE_GLSL}`,
  );
}

function makeGrassMaterial(lawn: Texture | null): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const uniforms = {
    uGrassA: { value: new Color(COLORS.grassA) },
    uGrassB: { value: new Color(COLORS.grassB) },
    uGrassDry: { value: new Color(COLORS.grassDry) },
    uGrassDark: { value: new Color(COLORS.grassDark) },
    uLawn: { value: lawn },
    uLawnHalf: { value: LAWN_HALF },
  };
  m.onBeforeCompile = (shader) => {
    injectWorldPos(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uGrassA;
uniform vec3 uGrassB;
uniform vec3 uGrassDry;
uniform vec3 uGrassDark;
uniform sampler2D uLawn;
uniform float uLawnHalf;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec2 p = vEnvWorld.xz;
    vec2 luv = p / (2.0 * uLawnHalf) + 0.5;
    vec3 lawn = texture2D(uLawn, vec2(luv.x, 1.0 - luv.y)).rgb;
    float inside = step(max(abs(p.x), abs(p.y)), uLawnHalf);
    vec3 g = mix(uGrassA, uGrassB, lawn.g);
    g *= 0.9 + 0.2 * envNoise(p * 0.043 + 7.0);
    float fineFade = 1.0 - smoothstep(50.0, 240.0, vEnvViewDist);
    if (fineFade > 0.0) g *= 1.0 + (envNoise(p * 0.55) - 0.5) * 0.14 * fineFade;
    g = mix(g, uGrassDry, lawn.b * 0.32);
    // Broad mowing stripes on the lawns near the stadium.
    float stripe = sin(dot(p, vec2(0.866, 0.5)) * 0.2244);
    float mow = 1.0 - smoothstep(330.0, 520.0, length(p));
    g *= 1.0 + 0.035 * mow * (smoothstep(-0.2, 0.2, stripe) * 2.0 - 1.0);
    // Soft occlusion under tree clusters (shifted away from the sun).
    g = mix(g, uGrassDark * 0.5, clamp(lawn.r * inside, 0.0, 1.0) * 0.6);
    // Slow cloud shadows.
    g *= 1.0 - 0.3 * envCloud(p);
    diffuseColor.rgb = g;
  }`,
      );
  };
  m.customProgramCacheKey = () => 'arena-grass';
  return m;
}

function makePlazaMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const uniforms = {
    uPlaza: { value: new Color(COLORS.plaza) },
    uJoint: { value: new Color(COLORS.plazaJoint) },
  };
  m.onBeforeCompile = (shader) => {
    injectWorldPos(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uPlaza;\nuniform vec3 uJoint;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    vec2 p = vEnvWorld.xz;
    float near = 1.0 - smoothstep(60.0, 220.0, vEnvViewDist);
    vec2 cell = abs(fract(p / 3.0) - 0.5);
    float joint = 1.0 - smoothstep(0.46, 0.49, max(cell.x, cell.y));
    vec3 c = mix(uJoint, uPlaza, mix(1.0, joint, near * 0.7));
    c *= 0.94 + 0.08 * envNoise(p * 0.08) + 0.04 * envNoise(floor(p / 3.0) * 1.7) * near;
    c *= 1.0 - 0.3 * envCloud(p);
    diffuseColor.rgb = c;
  }`,
      );
  };
  m.customProgramCacheKey = () => 'arena-plaza';
  return m;
}

function ringShape(outer: Array<[number, number]>, inner: Array<[number, number]>): Shape {
  // ShapeGeometry lies in xy; after rotateX(-90°) shape y becomes world -z.
  const shape = new Shape(outer.map(([x, z]) => new Vector2(x, -z)));
  shape.holes.push(new Path(inner.map(([x, z]) => new Vector2(x, -z))));
  return shape;
}

export function Ground() {
  const lawnTex = useMemo(() => bakeLawnTexture(getParkLayout().trees), []);
  const grassMat = useMemo(() => makeGrassMaterial(lawnTex), [lawnTex]);
  const plazaMat = useMemo(() => makePlazaMaterial(), []);

  const grassGeo = useMemo(() => {
    const H = WORLD_HALF;
    const outer: Array<[number, number]> = [
      [-H, -H],
      [H, -H],
      [H, H],
      [-H, H],
    ];
    const g = new ShapeGeometry(ringShape(outer, roundedRectPoints(PLAZA_OUT_D, 16)));
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  const plazaGeo = useMemo(() => {
    const g = new ShapeGeometry(ringShape(roundedRectPoints(PLAZA_OUT_D, 16), roundedRectPoints(0, 16)));
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  useEffect(
    () => () => {
      grassGeo.dispose();
      plazaGeo.dispose();
      grassMat.dispose();
      plazaMat.dispose();
      lawnTex?.dispose();
    },
    [grassGeo, plazaGeo, grassMat, plazaMat, lawnTex],
  );

  return (
    <group>
      <mesh geometry={grassGeo} material={grassMat} receiveShadow frustumCulled={false} />
      <mesh geometry={plazaGeo} material={plazaMat} receiveShadow />
    </group>
  );
}
