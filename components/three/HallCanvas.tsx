'use client';
/**
 * The 3D auditorium canvas. Mounted client-only (dynamic import, ssr: false)
 * in an absolutely positioned layer; the parent drives its opacity.
 *
 * - Initial camera = overheadCamera() pose, so the very first frame already
 *   matches the 2D map. The camera is then driven exclusively by `rig`
 *   (default <CameraRig />); nothing in here moves it.
 * - Highlight = `highlightSeatId` if given (null = none), else the store's selectedSeatId.
 * - Calls setSceneReady(true) once the first frame has been rendered.
 * - Falls back to a pre-rendered zone image when WebGL is unavailable.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { PerspectiveCamera } from 'three';
import type { CameraPose, Rect } from '@/types/cinema';
import { DEFAULT_LAYOUT, overheadCamera } from '@/lib/hall-geometry';
import { useBooking } from '@/store/booking';
import { CameraRig } from './CameraRig';
import { Auditorium } from './Auditorium';
import { Effects } from './Effects';
import { WebGLFallback } from './WebGLFallback';
import { SCENE_BACKGROUND } from './hallScene';
import { DEGRADED_DPR, MAX_DPR, composerSamples, isWebGLAvailable, shouldUseBloom } from './webgl';

export { isWebGLAvailable } from './webgl';

export interface HallCanvasProps {
  /** Camera controller rendered inside the <Canvas>. Defaults to <CameraRig /> (booking flow). */
  rig?: ReactNode;
  /** Seat id rendered green. Defaults to the store's selectedSeatId; null = no highlight. */
  highlightSeatId?: string | null;
  className?: string;
}

export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 200;
/** App column max width (see globals.css .app-column). */
const COLUMN_MAX_WIDTH = 430;

const GL_PROPS = {
  antialias: true,
  alpha: false,
  stencil: false,
  powerPreference: 'high-performance' as const,
};

function applyPose(cam: PerspectiveCamera, pose: CameraPose): void {
  cam.position.set(pose.position.x, pose.position.y, pose.position.z);
  cam.up.set(pose.up.x, pose.up.y, pose.up.z);
  cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
  cam.fov = pose.fov;
  cam.updateProjectionMatrix();
}

/** Overhead camera for the canvas layer (fills the app column) before it is measured. */
function createInitialCamera(): PerspectiveCamera {
  const width = Math.min(window.innerWidth, COLUMN_MAX_WIDTH);
  const height = window.innerHeight;
  const colLeft = (window.innerWidth - width) / 2;
  const mapFrame = useBooking.getState().mapFrame;
  const frame: Rect | null = mapFrame
    ? { left: mapFrame.left - colLeft, top: mapFrame.top, width: mapFrame.width, height: mapFrame.height }
    : null;
  const cam = new PerspectiveCamera(50, width / Math.max(1, height), CAMERA_NEAR, CAMERA_FAR);
  applyPose(cam, overheadCamera(DEFAULT_LAYOUT, { width, height }, frame));
  return cam;
}

/** Flags the scene as ready once one frame has actually been drawn. */
function ReadySignal() {
  const frames = useRef(0);
  useFrame(() => {
    // useFrame runs before the render; the 2nd tick means frame 1 is on screen.
    if (frames.current < 2 && ++frames.current === 2) useBooking.getState().setSceneReady(true);
  });
  useEffect(() => () => useBooking.getState().setSceneReady(false), []);
  return null;
}

export default function HallCanvas({ rig, highlightSeatId, className }: HallCanvasProps) {
  const [webgl] = useState(isWebGLAvailable);
  const [camera] = useState(createInitialCamera);
  const [bloomCapable] = useState(shouldUseBloom);
  const [samples] = useState(composerSamples);
  const [degraded, setDegraded] = useState(false);

  const selectedSeatId = useBooking((s) => s.selectedSeatId);
  const highlight = highlightSeatId !== undefined ? highlightSeatId : selectedSeatId;

  // Booking flow: while the 2D map fully covers the (invisible) canvas, stop
  // the render loop to save battery. Custom rigs (landing page) always run.
  const idle = useBooking((s) => s.mode === 'map' && s.progress === 0 && s.sceneReady);
  const frameloop = !rig && idle ? 'demand' : 'always';

  const composer = bloomCapable && !degraded;

  if (!webgl) return <WebGLFallback className={className} />;

  return (
    <div className={className} style={{ position: 'relative', background: SCENE_BACKGROUND }}>
      <Canvas
        dpr={degraded ? DEGRADED_DPR : [1, MAX_DPR]}
        gl={GL_PROPS}
        camera={camera}
        frameloop={frameloop}
        fallback={<WebGLFallback />}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={[SCENE_BACKGROUND]} />
        <Auditorium highlightSeatId={highlight} composer={composer} />
        {rig ?? <CameraRig />}
        <ReadySignal />
        {/* Only judge performance while the hall is actually on screen (not during warm-up). */}
        {(rig || !idle) && <PerformanceMonitor flipflops={1} onDecline={() => setDegraded(true)} />}
        {composer && <Effects samples={samples} />}
      </Canvas>
    </div>
  );
}
