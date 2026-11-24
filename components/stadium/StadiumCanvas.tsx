'use client';
/** STUB — owned by the Environment & Rendering agent, who replaces this file. */
import type { ReactNode } from 'react';

export interface StadiumCanvasProps {
  /** Camera controller inside the Canvas. Default: <StadiumCameraRig /> (booking). Landing passes its own. */
  rig?: ReactNode;
  /** 'booking' = interactive with seat LOD; 'landing' = scroll flythrough, no picking. */
  mode?: 'booking' | 'landing';
  className?: string;
}

export default function StadiumCanvas({ className }: StadiumCanvasProps) {
  return <div className={className} style={{ background: '#9fb7c9' }} />;
}
