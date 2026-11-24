import type { Seat } from '@/types/cinema';
import { CINEMA, SHOWTIMES, generateSeats } from '@/data/cinema';

/** Fictional film shown in every showtime of the demo. */
export const FILM_TITLE = 'The Long Horizon';

export interface ShowDetails {
  cinemaLine: string; // "Meridian · Hall 3"
  dateLabel: string; // "Fri 14 Nov"
  time: string; // "19:45"
  format: string; // "IMAX"
  dateLine: string; // "Fri 14 Nov · 19:45 IMAX"
}

export function getShowDetails(showtimeId: string): ShowDetails {
  const show = SHOWTIMES.find((s) => s.id === showtimeId);
  const time = show?.time ?? '';
  const format = show?.format ?? '';
  return {
    cinemaLine: `${CINEMA.name} · ${CINEMA.hallName}`,
    dateLabel: CINEMA.dateLabel,
    time,
    format,
    dateLine: [CINEMA.dateLabel, [time, format].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
  };
}

export function isKnownShowtime(showtimeId: string): boolean {
  return SHOWTIMES.some((s) => s.id === showtimeId);
}

/** "B4" -> { row: "B", number: 4 } */
export function parseSeatId(seatId: string): { row: string; number: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(seatId);
  return m ? { row: m[1], number: Number(m[2]) } : null;
}

/** "B4" -> "Row B · Seat 4" */
export function seatLongLabel(seatId: string): string {
  const p = parseSeatId(seatId);
  return p ? `Row ${p.row} · Seat ${p.number}` : seatId;
}

/** Seat from the live list if present, otherwise from the deterministic mock data. */
export function findSeat(showtimeId: string, seatId: string, seats?: Seat[]): Seat | null {
  return (
    seats?.find((s) => s.id === seatId) ?? generateSeats(showtimeId).find((s) => s.id === seatId) ?? null
  );
}
