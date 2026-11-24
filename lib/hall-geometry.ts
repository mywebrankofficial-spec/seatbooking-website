/**
 * SINGLE SOURCE OF TRUTH for hall geometry.
 *
 * World coordinates (metres, three.js convention):
 *   +x = right when facing the screen
 *   +y = up (row A floor is y = 0; each row rises by `rowRise`)
 *   +z = away from the screen, towards the back of the hall
 *   The screen plane is z = 0, centred on x = 0. Its edges curve towards the
 *   audience by `screen.curve` metres (sagitta).
 *
 * The 2D seat map is a literal top-down projection of this world:
 *   map x  <->  world x
 *   map y  <->  world z  (screen at the top, row I at the bottom)
 * using MAP_WORLD_RECT as the world-space box that the 2D map renders into.
 * The overhead 3D camera projects MAP_WORLD_RECT onto the same pixel rect,
 * which is what makes the 2D -> 3D morph line up.
 */
import type { CameraPose, HallLayout, Rect, Seat, SeatViewStats, Vec3 } from '@/types/cinema';

export const DEFAULT_LAYOUT: HallLayout = {
  rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  blocks: [3, 8, 3],
  seatPitch: 0.62,
  rowPitch: 1.05,
  rowRise: 0.35,
  aisleWidth: 0.52,
  firstRowDistance: 4.32,
  // Width tuned so the reference stats hold (B4 ~86deg, F8 ~60deg, I12 ~45deg).
  screen: { width: 11.8, height: 4.94, curve: 0.6, bottom: 1.25 },
};

/** Physical footprint of one seat (used by 2D squares and 3D seat meshes). */
export const SEAT_SIZE = { width: 0.52, depth: 0.55, backHeight: 1.0 };

/** Seated eye: height above the row floor and offset behind the seat centre. */
export const EYE_HEIGHT = 1.15;
export const EYE_BACK_OFFSET = 0.15;

export const RECLINER_ROWS = ['H', 'I'];

/** World-space box drawn by the 2D map (x: left->right, z: screen->back). */
export const MAP_WORLD_RECT = (() => {
  const half = rowHalfSpan(DEFAULT_LAYOUT) + SEAT_SIZE.width / 2 + 0.3;
  const lastZ = rowZ(DEFAULT_LAYOUT.rows.length - 1, DEFAULT_LAYOUT);
  return { minX: -half, maxX: half, minZ: -1.1, maxZ: lastZ + 0.6 };
})();

/* ------------------------------------------------------------------ */
/* Basic lookups                                                       */
/* ------------------------------------------------------------------ */

export function seatsPerRow(layout: HallLayout = DEFAULT_LAYOUT): number {
  return layout.blocks.reduce((a, b) => a + b, 0);
}

export function rowIndex(row: string, layout: HallLayout = DEFAULT_LAYOUT): number {
  return layout.rows.indexOf(row);
}

/** Block (0..n) a 1-based seat number belongs to. */
export function blockOf(number: number, layout: HallLayout = DEFAULT_LAYOUT): 0 | 1 | 2 {
  let acc = 0;
  for (let b = 0; b < layout.blocks.length; b++) {
    acc += layout.blocks[b];
    if (number <= acc) return b as 0 | 1 | 2;
  }
  return (layout.blocks.length - 1) as 0 | 1 | 2;
}

/** Half the centre-to-centre span of a full row (first seat to last seat). */
export function rowHalfSpan(layout: HallLayout = DEFAULT_LAYOUT): number {
  const n = seatsPerRow(layout);
  const aisles = layout.blocks.length - 1;
  return ((n - 1) * layout.seatPitch + aisles * layout.aisleWidth) / 2;
}

/** World x of a 1-based seat number. Rows are centred on x = 0. */
export function seatX(number: number, layout: HallLayout = DEFAULT_LAYOUT): number {
  const block = blockOf(number, layout);
  return -rowHalfSpan(layout) + (number - 1) * layout.seatPitch + block * layout.aisleWidth;
}

/** World z of the seat centres of a row (0-based row index). */
export function rowZ(index: number, layout: HallLayout = DEFAULT_LAYOUT): number {
  return layout.firstRowDistance + index * layout.rowPitch;
}

/** World y of the floor/riser of a row (0-based row index). */
export function rowFloorY(index: number, layout: HallLayout = DEFAULT_LAYOUT): number {
  return index * layout.rowRise;
}

/* ------------------------------------------------------------------ */
/* Contract functions                                                   */
/* ------------------------------------------------------------------ */

/** Seat centre on its riser floor (y = riser floor height). */
export function seatWorldPosition(
  seat: Pick<Seat, 'row' | 'number'>,
  layout: HallLayout = DEFAULT_LAYOUT,
): Vec3 {
  const r = rowIndex(seat.row, layout);
  return { x: seatX(seat.number, layout), y: rowFloorY(r, layout), z: rowZ(r, layout) };
}

/** Seated eye position: 1.15 m above the riser, slightly behind seat centre. */
export function eyePosition(
  seat: Pick<Seat, 'row' | 'number'>,
  layout: HallLayout = DEFAULT_LAYOUT,
): Vec3 {
  const p = seatWorldPosition(seat, layout);
  return { x: p.x, y: p.y + EYE_HEIGHT, z: p.z + EYE_BACK_OFFSET };
}

export function screenCentre(layout: HallLayout = DEFAULT_LAYOUT): Vec3 {
  return { x: 0, y: layout.screen.bottom + layout.screen.height / 2, z: 0 };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function zoneFor(
  seat: Pick<Seat, 'row' | 'block'>,
  layout: HallLayout = DEFAULT_LAYOUT,
): SeatViewStats['zone'] {
  const r = rowIndex(seat.row, layout);
  const n = layout.rows.length;
  if (r >= n - 2) return 'FULL PICTURE'; // H, I
  if (r <= 2) return 'UP CLOSE'; // A, B, C
  return seat.block === 1 ? 'SWEET SPOT' : 'SIDE VIEW'; // D..G
}

/** Stats computed from the real 3D geometry (never hardcoded). */
export function computeStats(
  seat: Pick<Seat, 'row' | 'number' | 'block'>,
  layout: HallLayout = DEFAULT_LAYOUT,
): SeatViewStats {
  const eye = eyePosition(seat, layout);
  const d = distance(eye, screenCentre(layout));
  const fov = (2 * Math.atan(layout.screen.width / 2 / d) * 180) / Math.PI;
  const offset = Math.abs(eye.x);
  const side: SeatViewStats['side'] = offset < 0.05 ? 'centre' : eye.x < 0 ? 'left' : 'right';
  return { distance: d, fov, offset, side, zone: zoneFor(seat, layout) };
}

/* ------------------------------------------------------------------ */
/* 2D map projection                                                    */
/* ------------------------------------------------------------------ */

/** Pixels per metre when MAP_WORLD_RECT is drawn into a frame of `frameWidth` px. */
export function mapScale(frameWidth: number): number {
  return frameWidth / (MAP_WORLD_RECT.maxX - MAP_WORLD_RECT.minX);
}

/** Frame height (px) for a given frame width, preserving world aspect. */
export function mapFrameHeight(frameWidth: number): number {
  return (MAP_WORLD_RECT.maxZ - MAP_WORLD_RECT.minZ) * mapScale(frameWidth);
}

/** World (x, z) -> pixel position inside the 2D map frame (top-left origin). */
export function worldToMap(x: number, z: number, frameWidth: number): { left: number; top: number } {
  const s = mapScale(frameWidth);
  return { left: (x - MAP_WORLD_RECT.minX) * s, top: (z - MAP_WORLD_RECT.minZ) * s };
}

/** Seat centre as pixel position inside a 2D map frame of `frameWidth` px. */
export function seatMapPosition(
  seat: Pick<Seat, 'row' | 'number'>,
  frameWidth: number,
  layout: HallLayout = DEFAULT_LAYOUT,
): { left: number; top: number; size: number } {
  const p = seatWorldPosition(seat, layout);
  const pos = worldToMap(p.x, p.z, frameWidth);
  return { ...pos, size: SEAT_SIZE.width * mapScale(frameWidth) * 0.92 };
}

/* ------------------------------------------------------------------ */
/* Cameras                                                              */
/* ------------------------------------------------------------------ */

export const OVERHEAD_FOV = 28;
/** Height of the plane the 2D map is matched against (around seat-top height mid hall). */
export const OVERHEAD_PLANE_Y = rowFloorY(4) + 0.6;

/**
 * Top-down camera whose projection of MAP_WORLD_RECT (at y = OVERHEAD_PLANE_Y)
 * lands exactly on `frame` (the 2D map frame rect in viewport px).
 * Camera looks straight down with screen-side (-z) at the top of the image.
 */
export function overheadCamera(
  layout: HallLayout = DEFAULT_LAYOUT,
  viewport: { width: number; height: number } = { width: 390, height: 844 },
  frame?: Rect | null,
): CameraPose {
  void layout;
  const worldW = MAP_WORLD_RECT.maxX - MAP_WORLD_RECT.minX;
  const f: Rect = frame ?? {
    left: 0,
    top: (viewport.height - mapFrameHeight(viewport.width)) / 2,
    width: viewport.width,
    height: mapFrameHeight(viewport.width),
  };
  const ppm = f.width / worldW;
  const tanHalf = Math.tan((OVERHEAD_FOV * Math.PI) / 360);
  const h = viewport.height / (2 * ppm * tanHalf);
  const cx = MAP_WORLD_RECT.minX + (viewport.width / 2 - f.left) / ppm;
  const cz = MAP_WORLD_RECT.minZ + (viewport.height / 2 - f.top) / ppm;
  return {
    position: { x: cx, y: OVERHEAD_PLANE_Y + h, z: cz },
    target: { x: cx, y: OVERHEAD_PLANE_Y, z: cz },
    up: { x: 0, y: 0, z: -1 },
    fov: OVERHEAD_FOV,
  };
}

/** Neighbouring seat id in the same row (dir -1 = left, +1 = right), or null. */
export function neighbourSeatId(
  seatId: string,
  dir: -1 | 1,
  layout: HallLayout = DEFAULT_LAYOUT,
): string | null {
  const { row, number } = parseSeatId(seatId);
  const n = number + dir;
  if (n < 1 || n > seatsPerRow(layout)) return null;
  return `${row}${n}`;
}

/** Seat id one row forward (-1, towards screen) or back (+1), or null. */
export function rowNeighbourSeatId(
  seatId: string,
  dir: -1 | 1,
  layout: HallLayout = DEFAULT_LAYOUT,
): string | null {
  const { row, number } = parseSeatId(seatId);
  const r = rowIndex(row, layout) + dir;
  if (r < 0 || r >= layout.rows.length) return null;
  return `${layout.rows[r]}${number}`;
}

export function parseSeatId(seatId: string): { row: string; number: number } {
  return { row: seatId.charAt(0), number: Number(seatId.slice(1)) };
}
