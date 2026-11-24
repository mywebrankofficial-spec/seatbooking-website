/**
 * sessionStorage persistence for confirmed bookings, so the confirmation page
 * survives a reload or a direct visit within the same tab session.
 */
import type { Booking } from '@/types/cinema';

const PREFIX = 'seatview:booking:';
const LAST_KEY = `${PREFIX}last`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveBooking(booking: Booking): void {
  const s = storage();
  if (!s) return;
  try {
    const raw = JSON.stringify(booking);
    s.setItem(PREFIX + booking.ref, raw);
    s.setItem(LAST_KEY, raw);
  } catch {
    /* quota / private mode: the in-memory store still has it */
  }
}

/** Raw JSON for `ref` (or the most recent booking when `ref` is null). Stable string, safe as a snapshot. */
export function readBookingRaw(ref: string | null): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(ref ? PREFIX + ref : LAST_KEY);
  } catch {
    return null;
  }
}

export function parseBooking(raw: string | null | undefined): Booking | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Booking> | null;
    if (
      v &&
      typeof v.ref === 'string' &&
      typeof v.showtimeId === 'string' &&
      typeof v.seatId === 'string' &&
      typeof v.name === 'string' &&
      typeof v.email === 'string' &&
      typeof v.price === 'number' &&
      typeof v.createdAt === 'string'
    ) {
      return v as Booking;
    }
  } catch {
    /* corrupted entry */
  }
  return null;
}

export function loadBooking(ref: string | null): Booking | null {
  return parseBooking(readBookingRaw(ref));
}
