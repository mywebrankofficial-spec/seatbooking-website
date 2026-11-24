'use client';
/**
 * Camera controller for the /stadium scroll flythrough. Rendered inside the
 * StadiumCanvas <Canvas> via its `rig` prop (mode="landing"). Reads the scroll
 * progress from the stadium landing store and damps the camera towards the
 * path pose. No per-frame allocations.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import type { Shot } from '@/lib/venue-engine/types';
import { stadiumFlyState, subscribeStadiumFly } from './stadium-flythrough-store';
import { writeStadiumPose } from './stadium-path';

/** Damping rate (1/s). Light: Lenis + scrub already smooth the input. */
const DAMPING = 6;
const EPS = 1e-4;
/** Aspect the shots are framed for; narrower viewports widen the vertical fov. */
const DESIGN_ASPECT = 1.6;
const MAX_FOV = 82;
/** The aerial shot sits ~430 m from the pitch. */
const MIN_FAR = 3000;

interface RigState {
  goal: Shot;
  cur: Shot;
  ready: boolean;
}

const newShot = (): Shot => ({ position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 45 });

/** Keep roughly the design horizontal fov on portrait / narrow screens. */
function fitFov(fov: number, aspect: number): number {
  if (aspect >= DESIGN_ASPECT) return fov;
  const half = (fov * Math.PI) / 360;
  const v = (2 * Math.atan((Math.tan(half) * DESIGN_ASPECT) / Math.max(aspect, 0.1)) * 180) / Math.PI;
  return Math.min(Math.max(v, fov), Math.max(MAX_FOV, fov));
}

export function StadiumLandingRig(): null {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const rig = useRef<RigState | null>(null);
  if (rig.current === null) rig.current = { goal: newShot(), cur: newShot(), ready: false };

  // Works with frameloop="demand" too: wake the loop on every scroll update.
  useEffect(() => subscribeStadiumFly(() => invalidate()), [invalidate]);

  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.far < MIN_FAR) {
      cam.far = MIN_FAR;
      cam.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame((state, delta) => {
    const v = rig.current;
    if (!v) return;
    const cam = state.camera as PerspectiveCamera;
    const { progress, reduced } = stadiumFlyState;

    writeStadiumPose(progress, reduced, v.goal);
    v.goal.fov = fitFov(v.goal.fov, state.size.width / Math.max(1, state.size.height));

    const g = v.goal;
    const c = v.cur;
    if (!v.ready || reduced) {
      c.position.x = g.position.x;
      c.position.y = g.position.y;
      c.position.z = g.position.z;
      c.target.x = g.target.x;
      c.target.y = g.target.y;
      c.target.z = g.target.z;
      c.fov = g.fov;
      v.ready = true;
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * DAMPING);
      c.position.x += (g.position.x - c.position.x) * k;
      c.position.y += (g.position.y - c.position.y) * k;
      c.position.z += (g.position.z - c.position.z) * k;
      c.target.x += (g.target.x - c.target.x) * k;
      c.target.y += (g.target.y - c.target.y) * k;
      c.target.z += (g.target.z - c.target.z) * k;
      c.fov += (g.fov - c.fov) * k;
    }

    cam.position.set(c.position.x, c.position.y, c.position.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.target.x, c.target.y, c.target.z);
    if (cam.isPerspectiveCamera && Math.abs(cam.fov - c.fov) > 1e-3) {
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
    }

    const dp =
      Math.abs(g.position.x - c.position.x) + Math.abs(g.position.y - c.position.y) + Math.abs(g.position.z - c.position.z);
    const dt = Math.abs(g.target.x - c.target.x) + Math.abs(g.target.y - c.target.y) + Math.abs(g.target.z - c.target.z);
    if (dp > EPS || dt > EPS || Math.abs(g.fov - c.fov) > 1e-2) state.invalidate();
  });

  return null;
}

export default StadiumLandingRig;
