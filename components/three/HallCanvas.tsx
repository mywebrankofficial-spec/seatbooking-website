'use client';
/** STUB — owned by the 3D Scene agent, who replaces this file. */
import type { ReactNode } from 'react';

export interface HallCanvasProps {
  /** Camera controller rendered inside the <Canvas>. Defaults to <CameraRig /> (booking flow). */
  rig?: ReactNode;
  /** Seat id rendered green. Defaults to the store's cameraSeatId ?? selectedSeatId. */
  highlightSeatId?: string | null;
  className?: string;
}

export default function HallCanvas({ className }: HallCanvasProps) {
  return <div className={className} />;
}
