'use client';
/**
 * Client-only bundle for the /stadium flythrough: StadiumCanvas + the landing
 * rig together, so three.js / R3F are code-split out of the page's first load.
 */
import { useMemo } from 'react';
import StadiumCanvas from '@/components/stadium/StadiumCanvas';
import { StadiumLandingRig } from './StadiumLandingRig';

export default function StadiumLandingCanvas({ className }: { className?: string }) {
  // Stable element so the canvas never sees a new rig on re-render.
  const rig = useMemo(() => <StadiumLandingRig />, []);
  return <StadiumCanvas mode="landing" rig={rig} className={className} />;
}
