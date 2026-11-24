'use client';
/**
 * Client-only bundle for the landing 3D view: HallCanvas + LandingRig together,
 * so three.js / R3F are code-split out of the landing page's first load.
 */
import { useMemo } from 'react';
import HallCanvas from '@/components/three/HallCanvas';
import { LandingRig } from '@/components/three/LandingRig';

export default function LandingCanvas({
  highlightSeatId,
  className,
}: {
  highlightSeatId: string | null;
  className?: string;
}) {
  // Stable element so HallCanvas never sees a new rig on re-render.
  const rig = useMemo(() => <LandingRig />, []);
  return <HallCanvas rig={rig} highlightSeatId={highlightSeatId} className={className} />;
}
