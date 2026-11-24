'use client';
/**
 * Booking camera rig (owned by Interaction & Camera). Mounted inside the StadiumCanvas.
 *
 * Applies `director` to the camera every frame with small additive motion on top:
 *   - aerial idle orbit ~1°/s (written into the director so flights start from it), paused while a
 *     stand is hovered and resumed ~1.5 s after;
 *   - very slow lateral drift at stand level;
 *   - wheel / pinch dolly (components/stadium/controls/zoom.ts), springing back;
 *   - portrait / narrow viewports: wider fov (+ dolly back on overview shots).
 * Also wires keyboard + wheel input and projects the hover card anchor.
 */
import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Shot } from '@/lib/venue-engine/types';
import { useDirectedCamera } from '@/lib/venue-engine/shots';
import { ProjectAnchor } from '@/lib/venue-engine/ProjectAnchor';
import * as nav from '@/lib/stadium-nav';
import { director, hoverAnchor, navCamera, syncCameraToState } from '@/lib/stadium-nav';
import { adaptToAspect, copyShot, makeShot, tunedAerial } from '@/lib/stadium-shots';
import { useStadium, type StadiumLevel } from '@/store/stadium';
import { updateZoom, zoom, zoomRubber } from './controls/zoom';
import { useStadiumKeyboard, useStadiumWheel } from './controls/useStadiumInput';

const ORBIT_SPEED = (1 * Math.PI) / 180; // rad/s
const ORBIT_RESUME_MS = 1500;
const DRIFT_AMP = 1.4; // m
const DRIFT_PERIOD = 26; // s

/** Levels where the portrait adaptation may dolly back (camera not pinned to a seat / box). */
const DOLLY_LEVELS = new Set<StadiumLevel>(['aerial', 'stand', 'block', 'ticket', 'skyboxes']);
/** Levels where wheel zoom changes the lens instead of dollying. */
const EYE_LEVELS = new Set<StadiumLevel>(['seatView', 'box', 'boxView']);

function createMotion() {
  return {
    omega: 0,
    lastStandHover: -Infinity,
    drift: 0,
    driftT: 0,
    dollyW: 1,
    eyeW: 0,
    work: makeShot(),
    out: makeShot(),
  };
}

export function StadiumCameraRig() {
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const m = useMemo(createMotion, []);
  const [anchorReady, setAnchorReady] = useState(false);
  const [wheelEl, setWheelEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    syncCameraToState();
    if (process.env.NODE_ENV !== 'production') {
      // Dev/e2e handle: drive the flow from the console or Playwright.
      (window as unknown as { __arenaNav?: unknown }).__arenaNav = { nav, useStadium };
    }
    setWheelEl(gl.domElement.parentElement ?? gl.domElement);
    // Mount ProjectAnchor after this rig so its useFrame runs after the camera update (no 1-frame lag).
    setAnchorReady(true);
  }, [gl]);

  useStadiumKeyboard();
  useStadiumWheel(wheelEl);

  const aspect = size.height > 0 ? size.width / size.height : 1.6;

  useDirectedCamera(director, (shot: Shot, rawDt: number): Shot => {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    const st = useStadium.getState();
    const now = performance.now();
    const still = !director.flying && !st.transitioning;

    // 1) Aerial idle orbit, written into the director so the next flight starts from here.
    if (st.level === 'aerial' && still && !st.reducedMotion) {
      if (st.hover?.type === 'stand') m.lastStandHover = now;
      const want = now - m.lastStandHover < ORBIT_RESUME_MS ? 0 : ORBIT_SPEED;
      m.omega += (want - m.omega) * (1 - Math.exp(-dt * 2.5));
      if (m.omega > 1e-6) {
        navCamera.orbitAngle += m.omega * dt;
        copyShot(director.current, tunedAerial(navCamera.orbitAngle));
      }
    } else {
      m.omega = 0;
    }

    const out = copyShot(m.work, shot);
    const dx = shot.target.x - shot.position.x;
    const dy = shot.target.y - shot.position.y;
    const dz = shot.target.z - shot.position.z;
    const dist = Math.hypot(dx, dy, dz) || 1;

    // 2) Stand-level drift (envelope fades in when idle, out quickly on flights: continuous).
    const driftOn = st.level === 'stand' && still && !st.reducedMotion;
    m.drift += ((driftOn ? 1 : 0) - m.drift) * (1 - Math.exp(-dt * (driftOn ? 0.6 : 3)));
    m.driftT += dt;
    if (m.drift > 1e-4) {
      const h = Math.hypot(dx, dz) || 1;
      const rx = -dz / h;
      const rz = dx / h;
      const off = m.drift * DRIFT_AMP * Math.sin((m.driftT * 2 * Math.PI) / DRIFT_PERIOD);
      out.position.x += rx * off;
      out.position.z += rz * off;
      out.position.y += m.drift * 0.4 * Math.sin((m.driftT * 2 * Math.PI) / (DRIFT_PERIOD * 1.7));
    }

    // 3) Wheel / pinch dolly along the view direction.
    updateZoom(dt);
    // Pinned to a seat / inside a box the lens zooms instead of the camera moving (blended, no jumps).
    const z = zoom.value + zoomRubber();
    m.eyeW += ((EYE_LEVELS.has(st.level) ? 1 : 0) - m.eyeW) * (1 - Math.exp(-dt * 6));
    if (Math.abs(z) > 1e-5) {
      const zl = z * m.eyeW;
      const zd = z * (1 - m.eyeW);
      if (Math.abs(zl) > 1e-6) {
        const t = Math.tan((out.fov * Math.PI) / 360) / (1 + zl * 1.2);
        out.fov = (Math.atan(t) * 360) / Math.PI;
      }
      const k = zd * dist;
      out.position.x += (dx / dist) * k;
      out.position.y += (dy / dist) * k;
      out.position.z += (dz / dist) * k;
    }

    // 4) Narrow / portrait viewports.
    const wantDolly = DOLLY_LEVELS.has(st.level) ? 1 : 0;
    m.dollyW += (wantDolly - m.dollyW) * (1 - Math.exp(-dt * 4));
    return adaptToAspect(out, aspect, m.dollyW, m.out);
  });

  // Make the camera matrices current for anything projecting after us this frame (hover anchor).
  useFrame((state) => {
    state.camera.updateMatrixWorld();
  });

  return anchorReady ? <ProjectAnchor anchor={hoverAnchor} /> : null;
}
