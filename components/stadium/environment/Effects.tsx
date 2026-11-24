'use client';
/**
 * Post effects: SMAA, gated depth of field, subtle bloom, ACES tone mapping, vignette.
 *
 * DOF is OFF normally (its 7 internal passes are skipped entirely). It ramps up
 *  - on the 'ticket' level: focus on the selected seat, background softly out of focus;
 *  - briefly during fast camera flights (director.speed), unless reduced motion is on.
 * The DOF effect stays mounted (no shader rebuild when it toggles).
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { DepthOfFieldEffect, MaskFunction, ToneMappingMode } from 'postprocessing';
import { Vector3, type Camera, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { getStadiumLayout } from '@/lib/stadium-geometry';
import { director } from '@/lib/stadium-nav';
import { useStadium } from '@/store/stadium';

/** DepthOfFieldEffect that skips its internal passes while switched off. */
class GatedDepthOfField extends DepthOfFieldEffect {
  active = false;
  constructor(camera: Camera) {
    super(camera, { focusDistance: 10, focusRange: 4, bokehScale: 0, resolutionScale: 0.5 });
    this.maskFunction = MaskFunction.MULTIPLY_RGB_SET_ALPHA;
    this.target = new Vector3();
    this.blendMode.opacity.value = 0;
  }
  override update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, deltaTime?: number): void {
    if (this.active) super.update(renderer, inputBuffer, deltaTime);
  }
}

function smooth01(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export interface EffectsProps {
  bloom: boolean;
  dof: boolean;
}

export function StadiumEffects({ bloom, dof: dofEnabled }: EffectsProps) {
  const camera = useThree((s) => s.camera);
  const dof = useMemo(() => new GatedDepthOfField(camera), [camera]);
  useEffect(() => () => dof.dispose(), [dof]);

  const state = useMemo(() => ({ strength: 0, focus: new Vector3(), range: 4, bokeh: 0 }), []);

  useFrame((_, dt) => {
    const st = useStadium.getState();
    let want = 0;
    let wantBokeh = 0;
    if (dofEnabled && st.level === 'ticket' && st.seatIndex !== null) {
      const p = getStadiumLayout().seatPos;
      const i = st.seatIndex * 3;
      state.focus.set(p[i], p[i + 1] + 0.45, p[i + 2]);
      state.range = 1.1;
      want = 1;
      wantBokeh = 4.5;
    } else if (dofEnabled && !st.reducedMotion && director.flying) {
      const t = director.current.target;
      state.focus.set(t.x, t.y, t.z);
      const dist = camera.position.distanceTo(state.focus);
      state.range = Math.max(8, dist * 0.6);
      want = smooth01(45, 170, director.speed) * 0.85;
      wantBokeh = 2.4;
    }
    // Ease in / out (a bit faster out so the landing frame is crisp).
    const rate = want > state.strength ? 3.2 : 4.5;
    state.strength += (want - state.strength) * (1 - Math.exp(-dt * rate));
    if (state.strength < 0.004 && want === 0) state.strength = 0;
    if (wantBokeh > 0) state.bokeh = wantBokeh;

    dof.active = state.strength > 0;
    dof.blendMode.opacity.value = state.strength;
    if (dof.active) {
      dof.target!.copy(state.focus);
      dof.cocMaterial.focusRange = state.range;
      dof.bokehScale = state.bokeh * state.strength;
    }
  });

  return (
    <EffectComposer multisampling={0} stencilBuffer={false}>
      <SMAA />
      <primitive object={dof} />
      {bloom && (
        <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.32} radius={0.65} levels={6} />
      )}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.3} darkness={0.38} />
    </EffectComposer>
  );
}
