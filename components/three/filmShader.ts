/**
 * Procedural "film" for the cinema screen: pale hazy sky over layered sandy
 * dunes drifting with gentle parallax, a tiny lone figure walking across a
 * dune crest, film grain and a soft vignette. Bright, unlit, not tone mapped.
 *
 * Colours are authored in sRGB and converted to linear in the shader, then
 * three's colorspace chunk encodes for the current target, so the result is
 * identical with and without the post-processing composer. `uGain` lets the
 * composer path compensate for its global ACES tone-mapping pass.
 */
import { ShaderMaterial, Vector2 } from 'three';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uGain;
uniform float uFade;
uniform float uSaturation;
uniform vec2 uAspect; // (width/height, 1)
varying vec2 vUv;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Dune silhouette height (0..1 screen space) for layer k at x (aspect units).
float dune(float x, float k) {
  float f = 1.6 + k * 0.55;
  float ph = k * 17.13;
  float h = 0.55 * sin(x * f + ph)
          + 0.28 * sin(x * f * 2.17 + ph * 1.7)
          + 0.12 * sin(x * f * 4.9 + ph * 0.37)
          + 0.16 * sin(x * f * 0.53 + ph * 2.3);
  // sharpen the crests a little: dunes have soft windward slopes, crisp tops
  h = h - 0.12 * h * h;
  return h;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;
  float aspect = uAspect.x;
  float t = uTime;
  float x = uv.x * aspect;
  float y = uv.y;
  float aa = 1.5 / 900.0;

  // --- sky: pale warm haze, slightly brighter near the horizon, soft sun glow
  vec3 skyTop = vec3(0.88, 0.86, 0.82);
  vec3 skyHorizon = vec3(0.97, 0.91, 0.82);
  vec3 col = mix(skyHorizon, skyTop, smoothstep(0.45, 1.0, y));
  vec2 sunPos = vec2(aspect * 0.68, 0.78);
  float sun = exp(-length((vec2(x, y) - sunPos) * vec2(1.0, 1.4)) * 4.5);
  col += vec3(0.05, 0.045, 0.03) * sun;
  // slow drifting haze bands
  col += 0.015 * sin(y * 18.0 + x * 0.6 + t * 0.05);

  // --- dune layers, far (0) to near (3)
  vec3 farSand = vec3(0.92, 0.84, 0.72);
  vec3 nearSand = vec3(0.86, 0.68, 0.47);
  float base[4];
  base[0] = 0.47; base[1] = 0.40; base[2] = 0.30; base[3] = 0.15;
  float amp[4];
  amp[0] = 0.035; amp[1] = 0.05; amp[2] = 0.07; amp[3] = 0.085;

  float figureLayerH = 0.0;
  float figureX = 0.0;
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    float drift = t * (0.006 + 0.007 * k); // parallax: near layers drift faster
    float shimmer = (i == 0) ? 0.0015 * sin(y * 90.0 + t * 1.7) : 0.0;
    float xs = x + drift + shimmer;
    float h = base[i] + amp[i] * dune(xs, k);
    // Shading boundary slants down-left from each crest (slip faces), so the
    // light/shade split is evaluated at a sheared x below the silhouette.
    float below = clamp(h - y, 0.0, 0.4);
    float xsh = xs - below * 1.1;
    float eps = 0.01;
    float slope = amp[i] * (dune(xsh + eps, k) - dune(xsh - eps, k)) / (2.0 * eps);
    float m = smoothstep(-aa, aa, h - y);
    float depth = k / 3.0;
    vec3 sand = mix(farSand, nearSand, depth);
    // sun from the right: slopes facing right are lit, left faces in soft shade
    float lit = smoothstep(-0.1, 0.1, slope);
    sand *= mix(0.86, 1.06, lit);
    // darker and warmer lower down each dune face
    sand *= mix(0.9, 1.0, smoothstep(h - 0.25, h, y));
    // crest highlight
    sand += vec3(0.05, 0.04, 0.02) * smoothstep(0.012, 0.0, h - y) * lit;
    // atmospheric haze on far layers
    sand = mix(sand, skyHorizon, (1.0 - depth) * 0.45);
    col = mix(col, sand, m);

    if (i == 2) {
      // --- tiny lone figure walking along this dune crest (screen-relative)
      float period = 150.0;
      float phase = fract(t / period);
      figureX = mix(-0.05, aspect + 0.05, phase);
      float fxs = figureX + drift;
      figureLayerH = base[2] + amp[2] * dune(fxs, 2.0);
      vec2 p = vec2(x, y);
      vec2 foot = vec2(figureX, figureLayerH - 0.002);
      float sz = 0.034;
      float stride = sin(t * 2.6);
      vec2 hip = foot + vec2(0.0, sz * 0.45);
      vec2 neck = foot + vec2(0.0005, sz * 0.86);
      float d = sdSegment(p, hip, neck) - sz * 0.085;
      d = min(d, length(p - (foot + vec2(0.0008, sz * 1.0))) - sz * 0.1);
      d = min(d, sdSegment(p, hip, foot + vec2(sz * 0.14 * stride, 0.0)) - sz * 0.05);
      d = min(d, sdSegment(p, hip, foot - vec2(sz * 0.14 * stride, 0.0)) - sz * 0.05);
      d = min(d, sdSegment(p, neck - vec2(0.0, sz * 0.06), neck + vec2(-sz * 0.12 * stride, -sz * 0.36)) - sz * 0.04);
      float fig = smoothstep(aa * 0.8, -aa * 0.8, d);
      // soft cast shadow to the left on the sand
      float sh = exp(-pow((x - (figureX - sz * 0.35)) / (sz * 0.45), 2.0)) *
                 exp(-pow((y - figureLayerH + 0.004) / 0.004, 2.0)) * m;
      col *= 1.0 - 0.18 * sh;
      col = mix(col, vec3(0.16, 0.13, 0.11), fig);
    }
  }

  // --- grain (24 fps), vignette, gentle exposure breathing
  float g = hash21(floor(uv * vec2(900.0, 380.0)) + floor(t * 24.0) * 7.31) - 0.5;
  col += g * 0.045;
  vec2 v = (uv - 0.5) * vec2(1.0, 1.25);
  col *= 1.0 - 0.32 * pow(clamp(length(v) * 1.35, 0.0, 1.0), 2.4);
  col *= 0.985 + 0.015 * sin(t * 0.4);

  col = clamp(col, 0.0, 1.0);
  col = clamp(mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSaturation), 0.0, 1.0);
  col = pow(col, vec3(2.2)) * uGain * uFade; // sRGB-ish -> linear
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createFilmMaterial(aspect: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGain: { value: 1 },
      uFade: { value: 1 },
      uSaturation: { value: 1 },
      uAspect: { value: new Vector2(aspect, 1) },
    },
    vertexShader,
    fragmentShader,
    toneMapped: false,
    fog: false,
  });
}
