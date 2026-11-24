'use client';
/** R3F component: projects a ScreenAnchor's world point to canvas pixels every frame. */
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { ScreenAnchor } from './anchor';

export function ProjectAnchor({ anchor }: { anchor: ScreenAnchor }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame((state) => {
    const w = anchor.world;
    const { width, height } = state.size;
    if (!w) {
      if (anchor.visible) {
        anchor.visible = false;
        anchor.notify();
      }
      return;
    }
    v.set(w.x, w.y, w.z).project(state.camera);
    const visible = v.z < 1 && v.z > -1;
    const x = (v.x * 0.5 + 0.5) * width;
    const y = (-v.y * 0.5 + 0.5) * height;
    if (
      Math.abs(x - anchor.x) > 0.25 ||
      Math.abs(y - anchor.y) > 0.25 ||
      visible !== anchor.visible ||
      width !== anchor.width ||
      height !== anchor.height
    ) {
      anchor.x = x;
      anchor.y = y;
      anchor.width = width;
      anchor.height = height;
      anchor.visible = visible;
      anchor.notify();
    }
  });
  return null;
}
