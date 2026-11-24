'use client';
/**
 * Materials for the stadium structure. Shader patches via onBeforeCompile on MeshStandardMaterial
 * so lights/shadows/fog/tone mapping from the Environment agent apply unchanged.
 */
import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { HEX, lin } from './common';
import { getShared, SEAT_GLSL } from './state';

const CONCRETE = lin(HEX.concrete);
const AISLE = lin(HEX.aisle);

function bindShared(shader: WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, getShared().uniforms);
}

/** Bowl surfaces: plain albedo (vertex colour) + tint, or the procedural seat pattern on treads/risers. */
export function createBowlMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    bindShared(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aInfo;
attribute vec2 aUV;
attribute float aRow;
varying vec4 vInfo;
varying vec2 vUV;
varying float vRow;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vInfo = aInfo;
vUV = aUV;
vRow = aRow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vInfo;
varying vec2 vUV;
varying float vRow;
${SEAT_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `
vec3 arenaEmis = vec3(0.0);
float arenaFwU = fwidth(vUV.x);
float arenaFwV = fwidth(vUV.y);
float arenaFwRow = fwidth(vRow);
{
  float blk = floor(vInfo.x + 0.5);
  float kind = floor(vInfo.y + 0.5);
  vec4 st = arenaBlock(blk);
  vec3 base = vColor;
  if (kind > 0.5 && kind < 2.5) {
    float u = vUV.x;
    float v = vUV.y;
    float n = floor(vInfo.w + 0.5);
    float j = floor(u);
    float fw = arenaFwU;
    float far = smoothstep(0.18, 0.6, max(fw, arenaFwRow));
    bool inSeat = j >= 0.0 && j < n;
    if (!inSeat || st.a > 0.5) {
      // aisle stairs / concrete under real seats
      vec3 conc = inSeat ? base : vec3(${AISLE.join(',')});
      float step = kind < 1.5 ? (1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.06, abs(v - 0.5)))) : 0.9;
      base = conc * step;
      base = mix(base, uOrange, 0.5 * st.r);
      arenaEmis = uOrange * 0.12 * st.r;
    } else {
      vec3 e;
      vec3 sc = arenaSeatColour(floor(vInfo.z + 0.5) + j, blk, far, e);
      float fu = fract(u);
      float gap = smoothstep(0.03, 0.1 + fw, fu) * smoothstep(0.97, 0.9 - fw, fu);
      vec3 farC = mix(vec3(${CONCRETE.join(',')}) * 0.45, sc * 0.82, 0.93);
      if (kind < 1.5) {
        // tread seen from above: pan, back top, legroom
        float fv = max(arenaFwV, 0.02);
        float pan = smoothstep(0.05 - fv, 0.08 + fv, v) * (1.0 - smoothstep(0.74 - fv, 0.78 + fv, v));
        float backTop = smoothstep(0.56, 0.6, v);
        vec3 seatC = mix(sc, sc * 0.7, backTop);
        float cover = pan * gap;
        base = mix(mix(base * 0.62, uOrange * 0.8, 0.6 * st.r), seatC, cover);
      } else {
        // riser: hidden behind the seat backs of this row
        base = mix(base * 0.55, sc * 0.8, gap);
      }
      base = mix(base, farC, far);
      arenaEmis = e * 0.6;
    }
  } else if (kind < 3.5) {
    base = mix(base, uOrange, 0.65 * st.r);
    arenaEmis = uOrange * 0.18 * st.r;
    if (kind > 2.5) arenaEmis += vec3(0.55, 0.42, 0.26) * 0.12;
  }
  diffuseColor.rgb = base;
}
`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += arenaEmis;`,
      );
  };
  m.customProgramCacheKey = () => 'arena-bowl-v6';
  return m;
}

/** Instanced real seats. Per-instance attribute aSeat = (global seat index, block index); aPart 0 shell, 1 metal. */
export function createSeatMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    bindShared(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aSeat;
attribute float aPart;
varying vec3 vSeatCol;
varying vec3 vSeatEmis;
varying float vPart;
${SEAT_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec3 seatE;
vSeatCol = arenaSeatColour(aSeat.x, aSeat.y, 0.0, seatE);
vSeatEmis = seatE;
vPart = aPart;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSeatCol;
varying vec3 vSeatEmis;
varying float vPart;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = mix(vSeatCol, vec3(0.08, 0.085, 0.09), vPart);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vSeatEmis * (1.0 - vPart);`,
      );
  };
  m.customProgramCacheKey = () => 'arena-seat-v1';
  return m;
}
