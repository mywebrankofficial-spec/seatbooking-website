/**
 * Shared GLSL + uniforms for the procedural environment (grass, plaza, trees, roads).
 * One time uniform object is shared by every material, updated once per frame.
 */
import { Vector2, type IUniform, type Texture } from 'three';

export const envUniforms: { uEnvTime: IUniform<number>; uCloudWind: IUniform<Vector2>; uCloudTex: IUniform<Texture | null> } = {
  uEnvTime: { value: 0 },
  /** Cloud shadow drift (m/s). */
  uCloudWind: { value: new Vector2(5.5, -2.2) },
  /** Tileable cloud noise (set on the client by StadiumEnvironment). */
  uCloudTex: { value: null },
};

export const NOISE_GLSL = /* glsl */ `
uniform float uEnvTime;
uniform vec2 uCloudWind;
uniform sampler2D uCloudTex;
float envHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float envNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = envHash(i);
  float b = envHash(i + vec2(1.0, 0.0));
  float c = envHash(i + vec2(0.0, 1.0));
  float d = envHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float envFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * envNoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}
/** 0 = sunlit, 1 = under a passing cloud. */
float envCloud(vec2 xz) {
  vec2 p = (xz - uCloudWind * uEnvTime) / 1400.0;
  float n = texture2D(uCloudTex, p).r * 0.7 + texture2D(uCloudTex, p * 2.3 + 0.37).r * 0.3;
  return smoothstep(0.53, 0.7, n);
}
`;

/** Bind the shared env uniforms into a compiled shader. */
export function bindEnvUniforms(uniforms: Record<string, IUniform>): void {
  uniforms.uEnvTime = envUniforms.uEnvTime;
  uniforms.uCloudWind = envUniforms.uCloudWind;
  uniforms.uCloudTex = envUniforms.uCloudTex;
}

/** Vertex: world position (instancing aware) + view distance. Insert after <project_vertex>. */
export const WORLD_POS_VERTEX = /* glsl */ `
  vec4 envWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    envWp = instanceMatrix * envWp;
  #endif
  envWp = modelMatrix * envWp;
  vEnvWorld = envWp.xyz;
  vEnvViewDist = -mvPosition.z;
`;

export const WORLD_POS_VARYINGS = /* glsl */ `
varying vec3 vEnvWorld;
varying float vEnvViewDist;
`;
