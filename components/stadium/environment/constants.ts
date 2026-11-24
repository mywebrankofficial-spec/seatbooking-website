/**
 * Look constants for the park / sky / light around the stadium.
 * World units are metres (see lib/stadium-geometry.ts): y up, pitch at the origin.
 */
import { Vector3 } from 'three';
import { BOWL } from '@/lib/stadium-geometry';

const DEG = Math.PI / 180;

/**
 * Afternoon sun: low-ish from the west-north-west, side-lighting the default aerial view
 * (camera south of the stadium) so the stadium throws a long, visible shadow to the east.
 */
export const SUN = { azimuthSouthOfWest: -22 * DEG, elevation: 30 * DEG };

/** Unit vector pointing from the ground TOWARDS the sun. */
export const SUN_DIR = new Vector3(
  -Math.cos(SUN.elevation) * Math.cos(SUN.azimuthSouthOfWest),
  Math.sin(SUN.elevation),
  Math.cos(SUN.elevation) * Math.sin(SUN.azimuthSouthOfWest),
).normalize();

export const SUN_COLOR = '#fff0da';
export const SUN_INTENSITY = 2.8;
/** Shadow camera half-extent (m): tightly covers the stadium shell + roof + nearby trees. */
export const SHADOW_EXTENT = 160;
export const SHADOW_DISTANCE = 450;

/** Haze colour = sky horizon colour, so the ground fades seamlessly into the sky. */
export const HAZE = '#c9d7e3';
export const FOG_NEAR = 420;
export const FOG_FAR = 3600;
export const SKY_ZENITH = '#4f86cf';
export const SKY_HORIZON = HAZE;

/** Half-size of the ground square (m). Far beyond the fog far plane. */
export const WORLD_HALF = 6000;

/** Pale concrete plaza ring: from the inner bowl edge (d = 0) out to this bowl distance. */
export const PLAZA_OUT_D = 80;
/** Centre line of the ring road (bowl distance d). */
export const RING_ROAD_D = 114;

/** Grass / tree / hard-surface palette (sRGB hex; converted to linear by THREE.Color). */
export const COLORS = {
  grassA: '#3f6a25',
  grassB: '#5b8a31',
  grassDry: '#859047',
  grassDark: '#284c1d',
  plaza: '#d9d5cc',
  plazaJoint: '#b9b4aa',
  asphalt: '#73777c',
  kerb: '#c3c0b8',
  gravel: '#bdb5a2',
  trunk: '#4a3a2c',
  canopy: ['#30592a', '#3a662e', '#2b4f23', '#447232', '#26471d', '#355f2e'],
  hemiSky: '#cfe2ff',
  hemiGround: '#55703a',
  shaft: '#fff6c8',
  pitchPatch: '#e8ff9a',
};

/** Tree population. */
export const TREES = { count: 2000, nearRadius: 175 };

/** Clockwise-from-above rounded-rect distance (bowl "d") of an xz point. */
export function bowlDistance(x: number, z: number): number {
  const sx = BOWL.halfX - BOWL.cornerR;
  const sz = BOWL.halfZ - BOWL.cornerR;
  const qx = Math.abs(x) - sx;
  const qz = Math.abs(z) - sz;
  const ox = Math.max(qx, 0);
  const oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - BOWL.cornerR;
}
