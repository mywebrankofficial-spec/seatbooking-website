'use client';
/**
 * Drives the booking-flow camera. Every frame the pose is evaluated as a pure function
 *   pose = f(progress, cameraSeatId, glide, canvas size, mapFrame, reducedMotion)
 * (lib/camera-path.ts) and applied to the default camera. State is read with
 * `useBooking.getState()` inside useFrame, so nothing re-renders per frame.
 * GSAP (lib/transitions.ts) only tweens the numbers that feed this.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, type PerspectiveCamera } from 'three';
import type { Rect } from '@/types/cinema';
import { CROSSFADE_END, useBooking } from '@/store/booking';
import { DEFAULT_LAYOUT, parseSeatId } from '@/lib/hall-geometry';
import {
  MAP_CROSSFADE_SCALE,
  blendPose,
  copyPose,
  createPose,
  frameToCanvas,
  overheadPose,
  pathPose,
  seatPose,
} from '@/lib/camera-path';
import { beginGlide, glide, rigState } from '@/lib/transitions';

/** Glide used when cameraSeatId changes mid-flight without going through transitions.ts. */
const AUTO_GLIDE_LIFT = 0.2;

function createRigCache() {
  return {
    euler: new Euler(0, 0, 0, 'YXZ'),
    overhead: createPose(),
    seat: createPose(),
    base: createPose(),
    out: createPose(),
    frame: { left: 0, top: 0, width: 0, height: 0 } as Rect,
    // Canvas position in the viewport (mapFrame is in viewport px).
    canvasLeft: 0,
    canvasTop: 0,
    rectDirty: true,
    // Overhead cache key
    oW: -1,
    oH: -1,
    oFrame: null as Rect | null,
    oScale: -1,
    oLeft: Number.NaN,
    oTop: Number.NaN,
    // Seat cache key
    sId: null as string | null,
    sAspect: -1,
    sValid: false,
    // Applied projection key
    pFov: -1,
    pShift: Number.NaN,
    pW: -1,
    pH: -1,
    lastSeatId: undefined as string | null | undefined,
  };
}

export function CameraRig() {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const cache = useRef<ReturnType<typeof createRigCache> | null>(null);
  if (cache.current === null) cache.current = createRigCache();

  // Canvas rect must be re-measured when the canvas moves/resizes or the map frame changes.
  useEffect(() => {
    const c = cache.current;
    if (c) c.rectDirty = true;
  }, [size]);

  useEffect(() => {
    const markDirty = () => {
      const c = cache.current;
      if (c) c.rectDirty = true;
      invalidate();
    };
    window.addEventListener('resize', markDirty);
    window.addEventListener('scroll', markDirty, true);
    const unsub = useBooking.subscribe((s, prev) => {
      if (s.mapFrame !== prev.mapFrame) markDirty();
      else if (
        s.progress !== prev.progress ||
        s.cameraSeatId !== prev.cameraSeatId ||
        s.reducedMotion !== prev.reducedMotion
      ) {
        invalidate();
      }
    });
    return () => {
      window.removeEventListener('resize', markDirty);
      window.removeEventListener('scroll', markDirty, true);
      unsub();
      rigState.ready = false;
    };
  }, [invalidate]);

  useFrame((state) => {
    const c = cache.current;
    const cam = state.camera as PerspectiveCamera;
    if (!c || !cam.isPerspectiveCamera) return;
    const w = state.size.width;
    const h = state.size.height;
    if (w <= 0 || h <= 0) return;
    const st = useBooking.getState();

    if (c.rectDirty) {
      const r = state.gl.domElement.getBoundingClientRect();
      c.canvasLeft = r.left;
      c.canvasTop = r.top;
      c.rectDirty = false;
    }

    // Overhead pose, aligned with the 2D map frame (which scales slightly while it fades out).
    const fade = Math.min(1, Math.max(0, st.progress / CROSSFADE_END));
    const scale = 1 + MAP_CROSSFADE_SCALE * fade;
    if (
      w !== c.oW ||
      h !== c.oH ||
      st.mapFrame !== c.oFrame ||
      scale !== c.oScale ||
      c.canvasLeft !== c.oLeft ||
      c.canvasTop !== c.oTop
    ) {
      const frame = st.mapFrame
        ? frameToCanvas(st.mapFrame, c.canvasLeft, c.canvasTop, state.size, scale, c.frame)
        : null;
      overheadPose(state.size, frame, c.overhead);
      c.oW = w;
      c.oH = h;
      c.oFrame = st.mapFrame;
      c.oScale = scale;
      c.oLeft = c.canvasLeft;
      c.oTop = c.canvasTop;
    }

    // Seat pose (cached per seat + aspect).
    const seatId = st.cameraSeatId;
    const aspect = w / h;
    if (seatId !== c.sId || aspect !== c.sAspect) {
      c.sId = seatId;
      c.sAspect = aspect;
      c.sValid = false;
      if (seatId) {
        const { row, number } = parseSeatId(seatId);
        if (DEFAULT_LAYOUT.rows.includes(row) && Number.isFinite(number) && number >= 1) {
          seatPose({ row, number }, aspect, c.seat);
          c.sValid = true;
        }
      }
    }

    // Camera seat changed mid-flight outside transitions.ts: glide instead of jumping.
    if (
      c.lastSeatId !== undefined &&
      seatId !== c.lastSeatId &&
      rigState.ready &&
      st.progress > CROSSFADE_END &&
      !st.reducedMotion &&
      !(glide.active && glide.seatId === seatId)
    ) {
      void beginGlide(seatId, AUTO_GLIDE_LIFT);
    }
    c.lastSeatId = seatId;

    pathPose(st.progress, CROSSFADE_END, c.overhead, c.sValid ? c.seat : null, st.reducedMotion, c.base);
    const o = glide.active ? blendPose(c.out, glide.from, c.base, glide.t, glide.lift) : copyPose(c.out, c.base);
    copyPose(rigState.pose, o);
    rigState.ready = true;

    cam.position.set(o.x, o.y, o.z);
    cam.quaternion.setFromEuler(c.euler.set(o.pitch, o.yaw, 0, 'YXZ'));

    if (o.fov !== c.pFov || o.shiftY !== c.pShift || w !== c.pW || h !== c.pH || cam.aspect !== aspect) {
      cam.fov = o.fov;
      cam.aspect = aspect;
      if (Math.abs(o.shiftY) > 1e-6) {
        // Lens shift: optical axis drawn at NDC y = shiftY (setViewOffset updates the projection).
        cam.setViewOffset(w, h, 0, (o.shiftY * h) / 2, w, h);
      } else if (cam.view && cam.view.enabled) {
        cam.clearViewOffset();
      } else {
        cam.updateProjectionMatrix();
      }
      c.pFov = o.fov;
      c.pShift = o.shiftY;
      c.pW = w;
      c.pH = h;
    }

    if (glide.active) state.invalidate();
  });

  return null;
}

export default CameraRig;
