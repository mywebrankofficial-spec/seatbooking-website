'use client';
/**
 * The stadium's R3F canvas (Environment & Rendering). Full screen, client only.
 *
 * Render order: environment (sky, haze, sun + IBL, park) → <Stadium> → camera rig →
 * <ViewRenderer> (booking only: seat view thumbnails) → post effects.
 * ACES tone mapping (applied by the composer's ToneMapping pass), sRGB output.
 *
 * Adaptive quality (drei PerformanceMonitor, armed a few seconds after mount so shader
 * compilation doesn't count):
 *   2 = dpr up to 2, bloom + DOF, 4096 shadow map
 *   1 = dpr up to 1.4, DOF, no bloom, 4096 shadow map
 *   0 = dpr 1, no DOF / bloom, 2048 shadow map refreshed less often
 */
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace } from 'three';
import { aerialShot } from '@/lib/stadium-geometry';
import { isWebGLAvailable } from '@/components/three/webgl';
import { Stadium } from '@/components/stadium/structure/Stadium';
import { StadiumCameraRig } from './StadiumCameraRig';
import { ViewRenderer } from './ViewRenderer';
import { StadiumEnvironment } from './environment/StadiumEnvironment';
import { StadiumEffects } from './environment/Effects';
import { HAZE } from './environment/constants';

export interface StadiumCanvasProps {
  /** Camera controller inside the Canvas. Default: <StadiumCameraRig /> (booking). Landing passes its own. */
  rig?: ReactNode;
  /** 'booking' = interactive with seat LOD; 'landing' = scroll flythrough, no picking. */
  mode?: 'booking' | 'landing';
  className?: string;
}

export const STADIUM_CAMERA_NEAR = 0.1;
export const STADIUM_CAMERA_FAR = 4000;

type Quality = 0 | 1 | 2;

const DPR: Record<Quality, number | [number, number]> = { 2: [1, 2], 1: [1, 1.4], 0: 1 };

const GL_PROPS = {
  antialias: false, // SMAA in the composer
  alpha: false,
  stencil: false,
  powerPreference: 'high-performance' as const,
  toneMapping: ACESFilmicToneMapping,
  outputColorSpace: SRGBColorSpace,
};

function createCamera(): PerspectiveCamera {
  const shot = aerialShot();
  const aspect = typeof window === 'undefined' ? 1.6 : window.innerWidth / Math.max(1, window.innerHeight);
  const cam = new PerspectiveCamera(shot.fov, aspect, STADIUM_CAMERA_NEAR, STADIUM_CAMERA_FAR);
  cam.position.set(shot.position.x, shot.position.y, shot.position.z);
  cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * Steps quality down when fps stays below ~45, and back up when it stays near the refresh
 * rate, but never back up to a level it already had to leave (no oscillation).
 */
function AdaptiveQuality({ setQuality }: { setQuality: (fn: (q: Quality) => Quality) => void }) {
  const [armed, setArmed] = useState(false);
  const [declinedFrom] = useState(() => new Set<Quality>());
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 4000);
    return () => window.clearTimeout(t);
  }, []);
  if (!armed) return null;
  return (
    <PerformanceMonitor
      ms={300}
      iterations={8}
      bounds={(refresh) => (refresh > 90 ? [55, 100] : [45, 58])}
      onDecline={() =>
        setQuality((q) => {
          if (q === 0) return q;
          declinedFrom.add(q);
          return (q - 1) as Quality;
        })
      }
      onIncline={() =>
        setQuality((q) => {
          const next = (q + 1) as Quality;
          return q < 2 && !declinedFrom.has(next) ? next : q;
        })
      }
    />
  );
}

export default function StadiumCanvas({ rig, mode = 'booking', className }: StadiumCanvasProps) {
  const [webgl] = useState(isWebGLAvailable);
  const [camera] = useState(createCamera);
  const [quality, setQuality] = useState<Quality>(2);

  if (!webgl) return <div className={className} style={{ background: HAZE }} />;

  return (
    <div className={className} style={{ position: 'relative', background: HAZE }}>
      <Canvas
        shadows
        dpr={DPR[quality]}
        gl={GL_PROPS}
        camera={camera}
        style={{ position: 'absolute', inset: 0 }}
      >
        <StadiumEnvironment shadowMapSize={quality === 0 ? 2048 : 4096} shadowEvery={quality === 0 ? 4 : 2} />
        <Suspense fallback={null}>
          <Stadium mode={mode} />
        </Suspense>
        {rig ?? <StadiumCameraRig />}
        {mode === 'booking' && <ViewRenderer />}
        <StadiumEffects bloom={quality === 2} dof={quality >= 1} />
        <AdaptiveQuality setQuality={setQuality} />
      </Canvas>
    </div>
  );
}
