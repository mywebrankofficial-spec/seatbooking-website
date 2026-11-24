import type { Cinema, Seat, Showtime } from '@/types/cinema';
import { DEFAULT_LAYOUT, RECLINER_ROWS, blockOf, seatsPerRow } from '@/lib/hall-geometry';

export const CINEMA: Cinema = {
  id: 'meridian',
  name: 'Meridian',
  hallName: 'Hall 3',
  dateLabel: 'Fri 14 Nov',
};

export const SHOWTIMES: Showtime[] = [
  { id: 's-1730', time: '17:30', format: '2D', hallId: 'hall-3' },
  { id: 's-1945', time: '19:45', format: 'IMAX', hallId: 'hall-3' },
  { id: 's-2215', time: '22:15', format: '2D', hallId: 'hall-3' },
];

export const DEFAULT_SHOWTIME_ID = 's-1945';

export const PRICES = { standard: 12.5, recliner: 16 } as const;

/** Seats that must stay free so the reference demo (B4, F8, I12) always works. */
const ALWAYS_FREE = new Set(['B4', 'F8', 'I12']);

/** mulberry32: tiny seeded PRNG so taken seats are stable per showtime. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function generateSeats(showtimeId: string): Seat[] {
  const rand = mulberry32(hash(showtimeId));
  const seats: Seat[] = [];
  const perRow = seatsPerRow(DEFAULT_LAYOUT);
  for (const row of DEFAULT_LAYOUT.rows) {
    const recliner = RECLINER_ROWS.includes(row);
    for (let number = 1; number <= perRow; number++) {
      const id = `${row}${number}`;
      const taken = !ALWAYS_FREE.has(id) && rand() < 0.33;
      seats.push({
        id,
        row,
        number,
        block: blockOf(number, DEFAULT_LAYOUT),
        type: recliner ? 'recliner' : 'standard',
        status: taken ? 'taken' : 'available',
        price: recliner ? PRICES.recliner : PRICES.standard,
      });
    }
  }
  return seats;
}
