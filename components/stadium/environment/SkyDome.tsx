'use client';
/**
 * Gradient sky with sun glow and faint high cirrus. Rendered at the far plane
 * (z = w) around the camera, after all opaque geometry, so it only shades visible sky.
 * Its horizon colour equals the fog colour: the fogged ground melts into it.
 */
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { SKY_HORIZON, SKY_ZENITH, SUN_COLOR, SUN_DIR } from './constants';
import { NOISE_GLSL, envUniforms } from './shaderChunks';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, max(h, 0.0)), 0.5));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 90.0) * 0.8);
  col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 18.0;
  // Faint drifting cirrus.
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uEnvTime * 0.004, uEnvTime * 0.0015);
    float c = smoothstep(0.5, 0.85, envFbm(uv * vec2(1.0, 2.6)));
    col = mix(col, vec3(1.0) * (0.85 + 0.6 * pow(sd, 4.0)), c * 0.35 * smoothstep(0.02, 0.25, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function SkyDome() {
  const mesh = useMemo(() => {
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uZenith: { value: new Color(SKY_ZENITH) },
        uHorizon: { value: new Color(SKY_HORIZON) },
        uSunColor: { value: new Color(SUN_COLOR) },
        uSunDir: { value: SUN_DIR.clone() },
        uEnvTime: envUniforms.uEnvTime,
        uCloudWind: envUniforms.uCloudWind,
        uCloudTex: envUniforms.uCloudTex,
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    const m = new Mesh(new SphereGeometry(1000, 32, 16), mat);
    m.frustumCulled = false;
    m.renderOrder = 1000;
    m.matrixAutoUpdate = false;
    return m;
  }, []);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as ShaderMaterial).dispose();
    },
    [mesh],
  );

  useFrame(({ camera }) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrix();
  });

  return <primitive object={mesh} />;
}
