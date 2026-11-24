/**
 * sessionStorage persistence for confirmed stadium bookings, so the stadium
 * confirmation page survives a reload or a direct visit within the same tab.
 * Separate key space from the cinema (lib/booking-session.ts).
 */
import type { StadiumBooking } from '@/store/stadium';

const PREFIX = 'arena:booking:';
const LAST_KEY = `${PREFIX}last`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveStadiumBooking(booking: StadiumBooking): void {
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
export function readStadiumBookingRaw(ref: string | null): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(ref ? PREFIX + ref : LAST_KEY);
  } catch {
    return null;
  }
}

const numOrNull = (v: unknown) => v === null || typeof v === 'number';

export function parseStadiumBooking(raw: string | null | undefined): StadiumBooking | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<StadiumBooking> | null;
    if (
      v &&
      typeof v.ref === 'string' &&
      typeof v.eventId === 'string' &&
      (v.kind === 'standard' || v.kind === 'vip') &&
      typeof v.label === 'string' &&
      typeof v.standName === 'string' &&
      typeof v.gate === 'string' &&
      numOrNull(v.blockId) &&
      numOrNull(v.row) &&
      numOrNull(v.seat) &&
      numOrNull(v.skyboxId) &&
      numOrNull(v.chair) &&
      typeof v.price === 'number' &&
      typeof v.name === 'string' &&
      typeof v.email === 'string' &&
      typeof v.createdAt === 'string'
    ) {
      return v as StadiumBooking;
    }
  } catch {
    /* corrupted entry */
  }
  return null;
}

export function loadStadiumBooking(ref: string | null): StadiumBooking | null {
  return parseStadiumBooking(readStadiumBookingRaw(ref));
}
