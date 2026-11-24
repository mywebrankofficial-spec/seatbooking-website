'use client';
/**
 * Camera controller for the landing-page flythrough. Rendered inside the
 * HallCanvas <Canvas> via its `rig` prop. Reads the scroll progress from the
 * landing flythrough store and damps the camera towards the path pose.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three';
import {
  flythroughState,
  landingFov,
  subscribeFlythrough,
  writeFlythroughPose,
} from '@/components/landing/flythrough-store';

/** Damping rate (1/s). Light: Lenis + scrub already smooth the input. */
const DAMPING = 8;
const EPS = 1e-5;
/** NDC y at which the screen centre is drawn (see the lens shift in useFrame). */
const LENS_SHIFT = 0.38;

interface RigVectors {
  goalPos: Vector3;
  goalTarget: Vector3;
  pos: Vector3;
  target: Vector3;
  fov: number;
  ready: boolean;
}

export function LandingRig(): null {
  const invalidate = useThree((s) => s.invalidate);
  const rig = useRef<RigVectors | null>(null);
  if (rig.current === null) {
    rig.current = {
      goalPos: new Vector3(),
      goalTarget: new Vector3(),
      pos: new Vector3(),
      target: new Vector3(),
      fov: 50,
      ready: false,
    };
  }

  // Works with frameloop="demand" too: wake the loop on every scroll update.
  useEffect(() => subscribeFlythrough(() => invalidate()), [invalidate]);

  useFrame((state, delta) => {
    const v = rig.current;
    if (!v) return;
    const cam = state.camera as PerspectiveCamera;
    const { progress, reduced } = flythroughState;

    writeFlythroughPose(progress, reduced, v.goalPos, v.goalTarget);
    const goalFov = landingFov(state.size.width / Math.max(1, state.size.height));

    if (!v.ready || reduced) {
      v.pos.copy(v.goalPos);
      v.target.copy(v.goalTarget);
      v.fov = goalFov;
      v.ready = true;
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * DAMPING);
      v.pos.lerp(v.goalPos, k);
      v.target.lerp(v.goalTarget, k);
      v.fov += (goalFov - v.fov) * k;
    }

    cam.position.copy(v.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(v.target);
    if (cam.isPerspectiveCamera) {
      const w = state.size.width;
      const h = state.size.height;
      // Lens shift: draw the optical axis (screen centre) at NDC y = LENS_SHIFT so the
      // screen sits in the upper part of the frame and the seat backs in front show below,
      // without tilting the camera (no keystoning).
      const offY = (LENS_SHIFT * h) / 2;
      const view = cam.view;
      const viewChanged = !view || !view.enabled || view.offsetY !== offY || view.fullWidth !== w || view.fullHeight !== h;
      if (viewChanged || Math.abs(cam.fov - v.fov) > 1e-3) {
        cam.fov = v.fov;
        cam.setViewOffset(w, h, 0, offY, w, h); // also updates the projection matrix
      }
    }

    if (
      v.pos.distanceToSquared(v.goalPos) > EPS ||
      v.target.distanceToSquared(v.goalTarget) > EPS ||
      Math.abs(goalFov - v.fov) > 1e-2
    ) {
      state.invalidate();
    }
  });

  return null;
}

export default LandingRig;
