'use client';
/**
 * Shared GPU state for seat colouring + stand/block highlights.
 *
 *  uBlockTex (128 x 2, RGBA8):
 *    row 0, x = block index (0..111) or STAND_SLOT0 + stand index:
 *      R = orange tint, G = sold-out grey, B = "active block" (seats white/blue), A = real 3D seats shown (pattern off)
 *    row 1: R = click flash glow
 *  uAvail (256 x H, R8): 255 = seat available, by global seat index.
 *
 * Eased every frame from the store (refs + useFrame, no React re-renders).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import {
  DataTexture,
  NearestFilter,
  RedFormat,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { getStadiumLayout, STANDS } from '@/lib/stadium-geometry';
import { generateStadiumAvailability, type StadiumAvailability } from '@/data/stadium/event';
import { useStadium } from '@/store/stadium';
import { BLOCK_TEX_W, HEX, lin, STAND_INDEX, STAND_SLOT0 } from './common';

export const AVAIL_W = 256;

export interface StructureShared {
  uniforms: {
    uBlockTex: { value: DataTexture };
    uAvail: { value: DataTexture };
    uHover: { value: Vector4 };
    uSel: { value: Vector2 };
    uRed: { value: Vector3 };
    uBlue: { value: Vector3 };
    uGrey: { value: Vector3 };
    uOrange: { value: Vector3 };
    uHoverCol: { value: Vector3 };
    uSoldGrey: { value: Vector3 };
  };
  blockData: Uint8Array;
  availData: Uint8Array;
  /** Eased values [slot*4 + channel] for row 0, plus flash per slot. */
  cur: Float32Array;
  flash: Float32Array;
  /** Real-seat flags written by <Seats/> (per block). */
  real: Uint8Array;
  availability: StadiumAvailability | null;
}

let shared: StructureShared | null = null;

const v3 = (hex: string) => new Vector3(...lin(hex));

export function getShared(): StructureShared {
  if (shared) return shared;
  const L = getStadiumLayout();
  const blockData = new Uint8Array(BLOCK_TEX_W * 2 * 4);
  const blockTex = new DataTexture(blockData, BLOCK_TEX_W, 2, RGBAFormat, UnsignedByteType);
  blockTex.magFilter = NearestFilter;
  blockTex.minFilter = NearestFilter;
  blockTex.generateMipmaps = false;
  blockTex.needsUpdate = true;
  const h = Math.ceil(L.seatCount / AVAIL_W);
  const availData = new Uint8Array(AVAIL_W * h);
  const availTex = new DataTexture(availData, AVAIL_W, h, RedFormat, UnsignedByteType);
  availTex.magFilter = NearestFilter;
  availTex.minFilter = NearestFilter;
  availTex.generateMipmaps = false;
  availTex.unpackAlignment = 1;
  availTex.needsUpdate = true;
  shared = {
    uniforms: {
      uBlockTex: { value: blockTex },
      uAvail: { value: availTex },
      uHover: { value: new Vector4(-10, 0, -10, 0) },
      uSel: { value: new Vector2(-10, 0) },
      uRed: { value: v3(HEX.seatRed) },
      uBlue: { value: v3(HEX.seatBlue) },
      uGrey: { value: v3(HEX.seatGrey) },
      uOrange: { value: v3(HEX.orange) },
      uHoverCol: { value: v3(HEX.hover) },
      uSoldGrey: { value: v3(HEX.soldGrey) },
    },
    blockData,
    availData,
    cur: new Float32Array(BLOCK_TEX_W * 4),
    flash: new Float32Array(BLOCK_TEX_W),
    real: new Uint8Array(L.blocks.length),
    availability: null,
  };
  return shared;
}

/** GLSL shared by the bowl (pattern) and the instanced seats. */
export const SEAT_GLSL = /* glsl */ `
uniform sampler2D uBlockTex;
uniform sampler2D uAvail;
uniform vec4 uHover;
uniform vec2 uSel;
uniform vec3 uRed;
uniform vec3 uBlue;
uniform vec3 uGrey;
uniform vec3 uOrange;
uniform vec3 uHoverCol;
uniform vec3 uSoldGrey;

uint arenaPcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float arenaHash(float i) { return float(arenaPcg(uint(max(i, 0.0))) & 0xffffu) / 65535.0; }
vec4 arenaBlock(float blk) { return texelFetch(uBlockTex, ivec2(int(blk + 0.5), 0), 0); }
float arenaFlash(float blk) { return texelFetch(uBlockTex, ivec2(int(blk + 0.5), 1), 0).r; }
float arenaAvail(float idx) {
  int i = int(idx + 0.5);
  return texelFetch(uAvail, ivec2(i - (i / ${AVAIL_W}) * ${AVAIL_W}, i / ${AVAIL_W}), 0).r;
}
/* Seat colour for global seat idx in block blk. far (0..1) blends to the bowl's average look. */
vec3 arenaSeatColour(float idx, float blk, float far, out vec3 emis) {
  vec4 st = arenaBlock(blk);
  float avail = arenaAvail(idx) > 0.5 ? 1.0 : 0.0;
  float h = arenaHash(idx);
  vec3 phys = (avail < 0.5 && h < 0.16) ? uBlue : uRed;
  phys = mix(phys, mix(uRed, uBlue, 0.05), far);
  phys = mix(phys, uRed, clamp(st.r * 1.6, 0.0, 1.0));
  vec3 act = avail > 0.5 ? uGrey : (h < 0.6 ? uBlue : uRed);
  vec3 c = mix(phys, act, st.b);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, mix(vec3(lum), uSoldGrey, 0.55), 0.8 * st.g);
  c = mix(c, uOrange, 0.82 * st.r);
  float fl = arenaFlash(blk);
  c = mix(c, uOrange, 0.85 * fl);
  float hv = clamp((abs(idx - uHover.x) < 0.5 ? uHover.y : 0.0) + (abs(idx - uHover.z) < 0.5 ? uHover.w : 0.0), 0.0, 1.0);
  c = mix(c, uHoverCol, hv);
  float sl = abs(idx - uSel.x) < 0.5 ? uSel.y : 0.0;
  c = mix(c, uOrange, sl);
  emis = uOrange * (0.3 * st.r + 0.7 * fl + 0.45 * sl) + uHoverCol * 0.3 * hv;
  return c;
}
`;

/* ------------------------------------------------------------------ */
/* Per-frame updater                                                    */
/* ------------------------------------------------------------------ */

function writeAvailability(s: StructureShared, a: StadiumAvailability) {
  s.availData.fill(0);
  const src = a.seatAvailable;
  for (let i = 0; i < src.length; i++) s.availData[i] = src[i] ? 255 : 0;
  s.uniforms.uAvail.value.needsUpdate = true;
  s.availability = a;
}

const fallbackCache = new Map<string, StadiumAvailability>();
export function useAvailability(): StadiumAvailability {
  const a = useStadium((st) => st.availability);
  const eventId = useStadium((st) => st.eventId);
  if (a) return a;
  let f = fallbackCache.get(eventId);
  if (!f) {
    f = generateStadiumAvailability(eventId);
    fallbackCache.set(eventId, f);
  }
  return f;
}

const BOOKING_ACTIVE = new Set(['block', 'ticket', 'seatView']);

/** Mount once (in <Stadium/>). Drives every highlight uniform. */
export function useStructureState(mode: 'booking' | 'landing') {
  const availability = useAvailability();
  useEffect(() => {
    writeAvailability(getShared(), availability);
  }, [availability]);

  const m = useRef({
    lastLevel: '',
    lastBlock: -1,
    flashT: -1,
    flashBlock: -1,
    hoverSeat: -10,
    prevSeat: -10,
    hoverAmt: 0,
    prevAmt: 0,
    selAmt: 0,
    selSeat: -10,
  }).current;

  useFrame((_, delta) => {
    const s = getShared();
    const L = getStadiumLayout();
    const st = useStadium.getState();
    const dt = Math.min(delta, 0.1);
    const k = 1 - Math.exp(-dt / 0.06);
    const booking = mode === 'booking';
    const level = st.level;
    const hover = booking ? st.hover : null;
    const blockLeft = (s.availability ?? availability).blockLeft;

    // Flash when a block is entered.
    if (booking && level === 'block' && st.blockId !== null && (m.lastLevel !== 'block' || m.lastBlock !== st.blockId)) {
      const b = L.blockById.get(st.blockId);
      if (b) {
        m.flashBlock = b.index;
        m.flashT = performance.now() / 1000;
      }
    }
    m.lastLevel = level;
    m.lastBlock = st.blockId ?? -1;

    const hoverStand = hover?.type === 'stand' && level === 'aerial' ? STAND_INDEX[hover.standId] : -1;
    const selStand = level === 'stand' && st.standId ? STAND_INDEX[st.standId] : -1;
    const hoverBlock = hover?.type === 'block' && level === 'stand' ? (L.blockById.get(hover.blockId)?.index ?? -1) : -1;
    const activeBlock = booking && BOOKING_ACTIVE.has(level) && st.blockId !== null ? (L.blockById.get(st.blockId)?.index ?? -1) : -1;
    const greyOn = booking && (level === 'stand' || level === 'block') ? 1 : 0;

    const cur = s.cur;
    const data = s.blockData;
    let dirty = false;
    const nb = L.blocks.length;
    for (let slot = 0; slot < BLOCK_TEX_W; slot++) {
      let tR = 0, tG = 0, tB = 0, tA = 0;
      if (slot < nb) {
        const b = L.blocks[slot];
        const si = STAND_INDEX[b.standId];
        if (si === hoverStand) tR = 1;
        if (si === selStand) tR = slot === hoverBlock ? 1 : 0.42;
        if (greyOn && blockLeft[slot] === 0) tG = 1;
        if (slot === activeBlock) tB = 1;
        tA = s.real[slot];
      } else if (slot >= STAND_SLOT0 && slot < STAND_SLOT0 + STANDS.length) {
        const si = slot - STAND_SLOT0;
        if (si === hoverStand) tR = 1;
        if (si === selStand) tR = 0.42;
      }
      const o = slot * 4;
      cur[o] += (tR - cur[o]) * k;
      cur[o + 1] += (tG - cur[o + 1]) * k * 0.6;
      cur[o + 2] += (tB - cur[o + 2]) * k * 0.7;
      cur[o + 3] = tA;
      let fl = 0;
      if (slot === m.flashBlock && m.flashT >= 0) {
        const t = performance.now() / 1000 - m.flashT;
        fl = t < 0.15 ? t / 0.15 : t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.9);
        if (t > 1.4) m.flashT = -1;
      }
      s.flash[slot] = fl;
      const r = Math.round(cur[o] * 255), g = Math.round(cur[o + 1] * 255), bl = Math.round(cur[o + 2] * 255), a = tA ? 255 : 0;
      const f = Math.round(fl * 255);
      const o2 = (BLOCK_TEX_W + slot) * 4;
      if (data[o] !== r || data[o + 1] !== g || data[o + 2] !== bl || data[o + 3] !== a || data[o2] !== f) {
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = bl;
        data[o + 3] = a;
        data[o2] = f;
        dirty = true;
      }
    }
    if (dirty) s.uniforms.uBlockTex.value.needsUpdate = true;

    // Seat hover (cross-fade old → new).
    const hs = hover?.type === 'seat' && level === 'block' ? hover.seatIndex : -10;
    if (hs !== m.hoverSeat) {
      if (m.hoverAmt > 0.01) {
        m.prevSeat = m.hoverSeat;
        m.prevAmt = m.hoverAmt;
      }
      m.hoverSeat = hs;
      m.hoverAmt = 0;
    }
    m.hoverAmt += ((hs >= 0 ? 0.85 : 0) - m.hoverAmt) * k;
    m.prevAmt += (0 - m.prevAmt) * k;
    s.uniforms.uHover.value.set(m.hoverSeat, m.hoverAmt, m.prevSeat, m.prevAmt);

    const selTarget = booking && (level === 'ticket' || level === 'seatView') && st.seatIndex !== null ? st.seatIndex : -10;
    if (selTarget >= 0 && selTarget !== m.selSeat) {
      m.selSeat = selTarget;
      m.selAmt = 0;
    }
    m.selAmt += ((selTarget >= 0 ? 1 : 0) - m.selAmt) * k;
    s.uniforms.uSel.value.set(m.selSeat, m.selAmt);
  });
}
