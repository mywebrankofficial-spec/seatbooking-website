/**
 * Derived dimensions of the 3D auditorium shell (walls, risers, aisles).
 * Everything here is computed from `lib/hall-geometry.ts`; seat positions
 * themselves always come straight from `seatWorldPosition()`.
 */
import type { HallLayout } from '@/types/cinema';
import { DEFAULT_LAYOUT, rowFloorY, rowZ, seatX } from '@/lib/hall-geometry';

/** Riser nose of row r sits this far in front (-z) of the row's seat centres. */
export const RISER_FRONT_OFFSET = 0.55;
/** Half-width of the shared armrest / side standard between two seats. */
export const ARM_HALF = 0.05;
/** Ceiling height (world y). */
export const CEILING_Y = 9.6;
/** Bottom of all floor slabs (hidden below row A level). */
export const FLOOR_BOTTOM_Y = -0.3;

export interface HallDims {
  layout: HallLayout;
  rows: number;
  wallX: number;
  frontWallZ: number;
  backWallZ: number;
  /** z of the riser nose (front edge of the tread) of row r. */
  riserFrontZ: (r: number) => number;
  /** z where row r's tread ends (next riser nose, or the back wall). */
  treadBackZ: (r: number) => number;
  /** [minX, maxX] of each seat block including the outer armrests. */
  blockSpans: Array<[number, number]>;
  /** x ranges of the aisles, left to right (outer, inner..., outer). */
  aisleSpans: Array<[number, number]>;
  /** First/last 1-based seat number of each block. */
  blockSeats: Array<[number, number]>;
}

export function hallDims(layout: HallLayout = DEFAULT_LAYOUT): HallDims {
  const rows = layout.rows.length;
  const wallX = layout.screen.width / 2 + 1.2;
  // >= 14.8 so camera flights that pass behind row I (z ~ 14.3) stay inside the hall.
  const backWallZ = rowZ(rows - 1, layout) + 2.2;
  const frontWallZ = -0.45;
  const riserFrontZ = (r: number) => rowZ(r, layout) - RISER_FRONT_OFFSET;
  const treadBackZ = (r: number) => (r < rows - 1 ? riserFrontZ(r + 1) : backWallZ);

  const blockSeats: Array<[number, number]> = [];
  let n = 1;
  for (const count of layout.blocks) {
    blockSeats.push([n, n + count - 1]);
    n += count;
  }
  const halfPitch = layout.seatPitch / 2;
  const blockSpans = blockSeats.map(
    ([a, b]) =>
      [seatX(a, layout) - halfPitch - ARM_HALF, seatX(b, layout) + halfPitch + ARM_HALF] as [
        number,
        number,
      ],
  );
  const aisleSpans: Array<[number, number]> = [];
  aisleSpans.push([-wallX, blockSpans[0][0]]);
  for (let i = 0; i < blockSpans.length - 1; i++) aisleSpans.push([blockSpans[i][1], blockSpans[i + 1][0]]);
  aisleSpans.push([blockSpans[blockSpans.length - 1][1], wallX]);

  return { layout, rows, wallX, frontWallZ, backWallZ, riserFrontZ, treadBackZ, blockSpans, aisleSpans, blockSeats };
}

/** Floor height under world z (stepped stadium floor). */
export function floorYAt(z: number, dims: HallDims): number {
  let y = 0;
  for (let r = 1; r < dims.rows; r++) if (z >= dims.riserFrontZ(r)) y = rowFloorY(r, dims.layout);
  return y;
}
