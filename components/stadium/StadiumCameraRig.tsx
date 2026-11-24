'use client';
/** STUB — owned by the Interaction & Camera agent, who replaces this file. */
import { useDirectedCamera } from '@/lib/venue-engine/shots';
import { ProjectAnchor } from '@/lib/venue-engine/ProjectAnchor';
import { director, hoverAnchor } from '@/lib/stadium-nav';

export function StadiumCameraRig() {
  useDirectedCamera(director);
  return <ProjectAnchor anchor={hoverAnchor} />;
}
