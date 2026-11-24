/** Shared materials + colour constants for the auditorium. */
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
} from 'three';

export const SEAT_COLORS = {
  standard: '#7d1522',
  recliner: '#681a28',
  /** Same mint as the 2D map's selected seat. */
  selected: '#6EE7A0',
  shell: '#141215',
  armStandard: '#1d1a1e',
  armRecliner: '#521119',
};

/** Red velvet: white base so per-instance colours (setColorAt) set the hue. */
export function createVelvetMaterial(color = '#ffffff'): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(color),
    vertexColors: true,
    roughness: 0.82,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new Color('#ff9a9a').multiplyScalar(0.55),
  });
}

/** Highlighted (selected) seat: mint with a touch of self-illumination. */
export function createHighlightMaterial(): MeshStandardMaterial {
  const c = new Color(SEAT_COLORS.selected);
  return new MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: 0.42,
    roughness: 0.75,
    metalness: 0,
    vertexColors: true,
  });
}

export function createShellMaterial(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness: 0.55, metalness: 0.1, vertexColors: true });
}

/** Carpet / walls: rough, colour from vertex colours. */
export function createRoomMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.96, metalness: 0 });
}

/** Unlit emissive strips (step lights). */
export function createGlowMaterial(intensity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(intensity, intensity, intensity), vertexColors: true });
}

/** Contact shadows: black, vertex alpha, no depth write. */
export function createShadowMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0x000000,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Masking border around the screen. */
export function createMaskingMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color('#040405'), side: DoubleSide });
}
