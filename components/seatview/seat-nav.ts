/**
 * Pure seat-view helpers: seat navigation (swipe / arrow keys), view scoring,
 * similar-seat suggestions and geometry-derived seat facts. No React here.
 */
import type { Seat } from '@/types/cinema';
import {
  DEFAULT_LAYOUT,
  SEAT_SIZE,
  computeStats,
  distance,
  neighbourSeatId,
  parseSeatId,
  rowFloorY,
  rowIndex,
  rowNeighbourSeatId,
  seatWorldPosition,
  seatX,
} from '@/lib/hall-geometry';

export type SeatLookup = ReadonlyMap<string, Seat>;

export function seatLookup(seats: readonly Seat[]): Map<string, Seat> {
  return new Map(seats.map((s) => [s.id, s]));
}

/**
 * Next AVAILABLE seat in the same row walking in `dir` (-1 = left, +1 = right),
 * skipping taken seats and crossing aisles. Null at the end of the row.
 */
export function nextAvailableInRow(byId: SeatLookup, fromId: string, dir: -1 | 1): string | null {
  let id = neighbourSeatId(fromId, dir);
  while (id) {
    const s = byId.get(id);
    if (s && s.status === 'available') return id;
    id = neighbourSeatId(id, dir);
  }
  return null;
}

/**
 * Nearest AVAILABLE seat one row forward (dir -1, towards the screen) or back (+1),
 * measured by world x so aisles count. Ties go to the seat nearer the centre line.
 */
export function nearestAvailableInAdjacentRow(
  seats: readonly Seat[],
  fromId: string,
  dir: -1 | 1,
): string | null {
  const target = rowNeighbourSeatId(fromId, dir);
  if (!target) return null;
  const { row } = parseSeatId(target);
  const x0 = seatX(parseSeatId(fromId).number);
  let best: Seat | null = null;
  let bestD = Infinity;
  for (const s of seats) {
    if (s.row !== row || s.status !== 'available') continue;
    const x = seatX(s.number);
    const d = Math.abs(x - x0);
    if (d < bestD - 1e-6 || (Math.abs(d - bestD) <= 1e-6 && best && Math.abs(x) < Math.abs(seatX(best.number)))) {
      best = s;
      bestD = d;
    }
  }
  return best?.id ?? null;
}

/** Ideal viewing distance (m) the view score is centred on. */
export const IDEAL_DISTANCE = 9.5;

/** Lower is better: closeness to the ideal distance plus a small penalty for sitting off-centre. */
export function viewScore(seat: Pick<Seat, 'row' | 'number' | 'block'>): number {
  const st = computeStats(seat);
  return Math.abs(st.distance - IDEAL_DISTANCE) + 0.25 * st.offset;
}

export interface SimilarSeat {
  seat: Seat;
  zone: string;
  distance: number;
}

/**
 * Up to `limit` AVAILABLE seats of the same type and price with a clearly better
 * view score, best first (ties broken by how close they are to the current seat).
 */
export function similarSeats(seats: readonly Seat[], current: Seat, limit = 3): SimilarSeat[] {
  const cur = viewScore(current);
  const here = seatWorldPosition(current);
  return seats
    .filter(
      (s) =>
        s.id !== current.id &&
        s.status === 'available' &&
        s.type === current.type &&
        s.price === current.price,
    )
    .map((s) => ({ s, score: viewScore(s), near: distance(seatWorldPosition(s), here) }))
    .filter((c) => c.score < cur - 0.15)
    .sort((a, b) => a.score - b.score || a.near - b.near)
    .slice(0, limit)
    .map(({ s }) => {
      const st = computeStats(s);
      return { seat: s, zone: st.zone, distance: st.distance };
    });
}

/** Typical stair riser height (m); each row riser is split into steps of about this size. */
const STEP_RISE = 0.175;

export interface SeatFacts {
  /** Steps up from the entrance (entrances are at the front corners, at row A floor level). */
  steps: number;
  entranceSide: 'left' | 'right';
  aisleSeat: boolean;
  /** Row A seat in a side block: level floor next to the side aisle. */
  wheelchairSpace: boolean;
  seatWidthCm: number;
  rowSpacing: number;
}

export function seatFacts(seat: Pick<Seat, 'row' | 'number' | 'block'>): SeatFacts {
  const r = rowIndex(seat.row);
  const steps = Math.round(rowFloorY(r) / STEP_RISE);
  const blockStart = DEFAULT_LAYOUT.blocks.slice(0, seat.block).reduce((a, b) => a + b, 0) + 1;
  const blockEnd = blockStart + DEFAULT_LAYOUT.blocks[seat.block] - 1;
  return {
    steps,
    entranceSide: seatX(seat.number) < 0 ? 'left' : 'right',
    aisleSeat: seat.number === blockStart || seat.number === blockEnd,
    wheelchairSpace: r === 0 && seat.block !== 1,
    seatWidthCm: Math.round(SEAT_SIZE.width * 100),
    rowSpacing: DEFAULT_LAYOUT.rowPitch,
  };
}
