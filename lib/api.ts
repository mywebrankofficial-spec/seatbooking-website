/**
 * Mock API layer. Swap these implementations for real fetch() calls later;
 * the rest of the app only talks to these functions.
 */
import type { Booking, Cinema, Seat, Showtime } from '@/types/cinema';
import { CINEMA, SHOWTIMES, generateSeats } from '@/data/cinema';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getCinema(): Promise<Cinema> {
  return CINEMA;
}

export async function getShowtimes(): Promise<Showtime[]> {
  return SHOWTIMES;
}

export async function getShowtime(id: string): Promise<Showtime | null> {
  return SHOWTIMES.find((s) => s.id === id) ?? null;
}

export async function getSeats(showtimeId: string): Promise<Seat[]> {
  return generateSeats(showtimeId);
}

export interface SeatHold {
  holdId: string;
  seatId: string;
  showtimeId: string;
  expiresAt: string;
}

export async function holdSeat(showtimeId: string, seatId: string): Promise<SeatHold> {
  await wait(250);
  const seat = generateSeats(showtimeId).find((s) => s.id === seatId);
  if (!seat || seat.status === 'taken') throw new Error('Seat is no longer available');
  return {
    holdId: `H-${Date.now().toString(36).toUpperCase()}`,
    seatId,
    showtimeId,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

export async function confirmBooking(input: {
  holdId: string;
  showtimeId: string;
  seatId: string;
  name: string;
  email: string;
}): Promise<Booking> {
  await wait(900);
  const seat = generateSeats(input.showtimeId).find((s) => s.id === input.seatId);
  if (!seat) throw new Error('Unknown seat');
  const ref = `MRD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return {
    ref,
    showtimeId: input.showtimeId,
    seatId: input.seatId,
    name: input.name,
    email: input.email,
    price: seat.price,
    createdAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Stadium                                                              */
/* ------------------------------------------------------------------ */

import { STADIUM_EVENT, generateStadiumAvailability, type StadiumEvent, type StadiumAvailability } from '@/data/stadium/event';
import type { StadiumBooking } from '@/store/stadium';

export async function getStadiumEvent(eventId: string): Promise<StadiumEvent | null> {
  return eventId === STADIUM_EVENT.id ? STADIUM_EVENT : null;
}

/** Seeded availability (client-side safe: deterministic per event). */
export function getStadiumAvailability(eventId: string): StadiumAvailability {
  return generateStadiumAvailability(eventId);
}

/** Holds a stadium seat or skybox chair for 10 minutes. */
export async function holdStadiumSeat(eventId: string, key: string): Promise<SeatHold> {
  await wait(250);
  return {
    holdId: `H-${Date.now().toString(36).toUpperCase()}`,
    seatId: key,
    showtimeId: eventId,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}

export async function confirmStadiumBooking(
  input: Omit<StadiumBooking, 'ref' | 'createdAt'> & { holdId: string },
): Promise<StadiumBooking> {
  await wait(900);
  const { holdId, ...rest } = input;
  void holdId;
  return { ...rest, ref: `ARN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, createdAt: new Date().toISOString() };
}
