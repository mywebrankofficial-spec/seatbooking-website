'use client';
/**
 * Confirmation screen. Reads the booking from the store (client navigation from
 * checkout) or from sessionStorage by `ref` (reload / direct visit).
 */
import Link from 'next/link';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Ticket } from 'lucide-react';
import type { Booking } from '@/types/cinema';
import { useBooking } from '@/store/booking';
import { parseBooking, readBookingRaw } from '@/lib/booking-session';
import { formatPrice, seatTypeLabel } from '@/lib/format';
import { FILM_TITLE, findSeat, getShowDetails, isKnownShowtime, seatLongLabel } from './constants';

const noopSubscribe = () => () => {};

const pillBase =
  'flex h-14 w-full items-center justify-center rounded-full text-[16px] font-semibold transition-transform duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function BookingConfirmation({ showId, bookingRef }: { showId: string; bookingRef: string | null }) {
  const storeBooking = useBooking((s) => s.lastBooking);
  // undefined on the server / during hydration = "not known yet" (avoids a not-found flash).
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => readBookingRaw(bookingRef),
    () => undefined,
  );
  const sessionBooking = useMemo(() => parseBooking(raw), [raw]);

  const booking: Booking | null =
    storeBooking && (!bookingRef || storeBooking.ref === bookingRef) ? storeBooking : sessionBooking;
  const resolving = !booking && raw === undefined;

  // Keep the booking flow tidy for "Book another seat": remember the booking,
  // mark the seat as taken and clear the selection.
  useEffect(() => {
    if (!booking) return;
    const st = useBooking.getState();
    if (st.lastBooking?.ref !== booking.ref) st.setLastBooking(booking);
    if (st.showtimeId === booking.showtimeId) {
      if (st.seats.some((s) => s.id === booking.seatId && s.status !== 'taken')) {
        st.setSeats(st.seats.map((s) => (s.id === booking.seatId ? { ...s, status: 'taken' } : s)));
      }
      if (st.selectedSeatId === booking.seatId) st.selectSeat(null);
    }
    if (st.checkoutOpen) st.setCheckoutOpen(false);
  }, [booking]);

  const backHref = isKnownShowtime(showId) ? `/book/${showId}` : '/';

  return (
    <main className="app-column flex min-h-[100dvh] flex-col px-5 pt-[max(24px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]">
      {resolving ? (
        <div className="flex-1" aria-busy="true" />
      ) : booking ? (
        <Confirmed booking={booking} backHref={isKnownShowtime(booking.showtimeId) ? `/book/${booking.showtimeId}` : backHref} />
      ) : (
        <NotFound backHref={backHref} />
      )}
    </main>
  );
}

function Confirmed({ booking, backHref }: { booking: Booking; backHref: string }) {
  const reduce = useReducedMotion();
  const show = getShowDetails(booking.showtimeId);
  const seat = findSeat(booking.showtimeId, booking.seatId);
  const qrValue = JSON.stringify({ ref: booking.ref, showtime: booking.showtimeId, seat: booking.seatId });

  return (
    <>
      <header className="flex items-center gap-3 pt-2">
        <CheckBadge reduce={!!reduce} />
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Booking confirmed</h1>
          <p className="text-[13px] text-fg-2">Show this ticket at the entrance.</p>
        </div>
      </header>

      <motion.article
        aria-label={`Ticket for ${FILM_TITLE}, seat ${booking.seatId}`}
        className="relative mt-6 overflow-hidden rounded-[24px] border border-white/[0.07] bg-linear-to-b from-card to-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.97 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 140, damping: 20, delay: 0.08 }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl"
        />

        {/* Top half */}
        <div className="relative p-5 pb-6">
          <p className="text-[21px] font-semibold leading-tight tracking-tight">{FILM_TITLE}</p>
          <p className="mt-1 text-[14px] text-fg-2">{show.cinemaLine}</p>

          <dl className="mt-5 grid grid-cols-3 gap-3">
            <Detail label="Date" value={show.dateLabel} />
            <Detail label="Time" value={show.time} />
            <Detail label="Format" value={show.format} />
          </dl>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-3">Seat</p>
              <p className="tabular mt-1 text-[56px] font-semibold leading-[0.9] tracking-tight text-accent">
                {booking.seatId}
              </p>
            </div>
            <div className="pb-1 text-right text-[13px] leading-snug">
              <p className="text-fg">{seatLongLabel(booking.seatId)}</p>
              {seat && <p className="text-fg-2">{seatTypeLabel(seat.type)}</p>}
            </div>
          </div>
        </div>

        {/* Perforation */}
        <div className="relative h-0" aria-hidden>
          <span className="absolute -left-3 -top-3 size-6 rounded-full border border-white/[0.07] bg-app" />
          <span className="absolute -right-3 -top-3 size-6 rounded-full border border-white/[0.07] bg-app" />
          <span className="absolute inset-x-5 top-0 border-t border-dashed border-white/[0.14]" />
        </div>

        {/* Stub */}
        <div className="relative flex items-center gap-4 p-5 pt-6">
          <div
            role="img"
            aria-label={`QR code for booking ${booking.ref}`}
            className="shrink-0 rounded-[16px] border border-white/[0.08] bg-app p-3"
          >
            <QRCodeSVG value={qrValue} size={108} level="M" fgColor="#ffffff" bgColor="#0d0d10" marginSize={0} />
          </div>
          <dl className="min-w-0 flex-1 space-y-3">
            <Detail label="Booking ref" value={booking.ref} mono />
            <Detail label="Name" value={booking.name} />
            <Detail label="Paid" value={formatPrice(booking.price)} />
          </dl>
        </div>
      </motion.article>

      <motion.div
        className="mt-auto flex flex-col gap-3 pt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.2 : 0.5, delay: reduce ? 0 : 0.35 }}
      >
        <Link href="/" className={`${pillBase} bg-white text-black`}>
          Done
        </Link>
        <Link href={backHref} className={`${pillBase} border border-white/15 text-fg hover:bg-white/[0.04]`}>
          Book another seat
        </Link>
      </motion.div>
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-3">{label}</dt>
      <dd className={`mt-0.5 truncate text-[15px] font-medium ${mono ? 'tabular tracking-wide' : ''}`}>{value}</dd>
    </div>
  );
}

function CheckBadge({ reduce }: { reduce: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 18, delay: 0.25 }}
    >
      <svg viewBox="0 0 24 24" className="size-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2.5}>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.span>
  );
}

function NotFound({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span className="grid size-14 place-items-center rounded-full bg-card text-fg-2" aria-hidden>
        <Ticket size={24} />
      </span>
      <h1 className="mt-5 text-[20px] font-semibold tracking-tight">Booking not found</h1>
      <p className="mt-1.5 max-w-[280px] text-[14px] text-fg-2">
        We couldn’t find this booking on this device. It may have been made in another browser session.
      </p>
      <Link href={backHref} className={`${pillBase} mt-8 max-w-[280px] bg-white text-black`}>
        Back to seats
      </Link>
    </div>
  );
}
