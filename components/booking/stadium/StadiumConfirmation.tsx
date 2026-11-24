'use client';
/**
 * Stadium ticket confirmation. Reads the booking from the store (client
 * navigation from checkout) or from sessionStorage by `ref` (reload / direct visit).
 */
import Link from 'next/link';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Ticket } from 'lucide-react';
import { useStadium, type StadiumBooking } from '@/store/stadium';
import { parseStadiumBooking, readStadiumBookingRaw } from '@/lib/stadium-booking-session';
import { formatAmount } from '@/lib/venue-engine/money';
import { seatIndexOf } from '@/lib/stadium-geometry';
import { CURRENCY, getEvent, ticketDetails } from './ticket-details';
import { Barcode } from './Barcode';

const noopSubscribe = () => () => {};
const ORANGE = '#F26A21';
const PAGE_BG = '#eef1f4';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F26A21]';
const pillBase = `flex h-13 min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold transition-[transform,background-color,filter] duration-200 active:scale-[0.98] sm:w-auto sm:min-w-[200px] ${focusRing}`;

export function StadiumConfirmation({ eventId, bookingRef }: { eventId: string; bookingRef: string | null }) {
  const storeBooking = useStadium((s) => s.lastBooking);
  // undefined on the server / during hydration = "not known yet" (avoids a not-found flash).
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => readStadiumBookingRaw(bookingRef),
    () => undefined,
  );
  const sessionBooking = useMemo(() => parseStadiumBooking(raw), [raw]);

  const booking: StadiumBooking | null =
    storeBooking && (!bookingRef || storeBooking.ref === bookingRef) ? storeBooking : sessionBooking;
  const resolving = !booking && raw === undefined;

  useEffect(() => {
    if (!booking) return;
    const st = useStadium.getState();
    const patch: Partial<ReturnType<typeof useStadium.getState>> = {};
    if (st.lastBooking?.ref !== booking.ref) patch.lastBooking = booking;
    if (st.checkoutOpen) patch.checkoutOpen = false;
    // Mark the booked seat / chair as taken for the next visit to the stadium.
    if (st.availability && st.eventId === booking.eventId) {
      const a = st.availability;
      if (booking.kind === 'standard' && booking.blockId !== null && booking.row !== null && booking.seat !== null) {
        const i = seatIndexOf(booking.blockId, booking.row, booking.seat);
        if (i !== null && a.seatAvailable[i]) {
          const seatAvailable = a.seatAvailable.slice();
          seatAvailable[i] = 0;
          patch.availability = { ...a, seatAvailable };
        }
      } else if (booking.kind === 'vip' && booking.skyboxId !== null && booking.chair !== null) {
        const chairs = a.chairAvailable[booking.skyboxId];
        if (chairs?.[booking.chair - 1]) {
          const next = chairs.slice();
          next[booking.chair - 1] = false;
          patch.availability = { ...a, chairAvailable: { ...a.chairAvailable, [booking.skyboxId]: next } };
        }
      }
    }
    if (Object.keys(patch).length) useStadium.setState(patch);
  }, [booking]);

  const backHref = getEvent(booking?.eventId ?? eventId) ? `/stadium/${encodeURIComponent(booking?.eventId ?? eventId)}` : '/stadium';

  return (
    <main
      className="min-h-dvh text-[#16161a] scheme-light"
      style={{ backgroundColor: PAGE_BG }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[920px] flex-col px-4 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))] sm:px-8 sm:pt-14">
        {resolving ? (
          <div className="flex-1" aria-busy="true" />
        ) : booking ? (
          <Confirmed booking={booking} backHref={backHref} />
        ) : (
          <NotFound backHref={backHref} />
        )}
      </div>
    </main>
  );
}

function Confirmed({ booking, backHref }: { booking: StadiumBooking; backHref: string }) {
  const reduce = !!useReducedMotion();
  const event = getEvent(booking.eventId);
  const details = ticketDetails(booking);
  const vip = details.kind === 'vip';
  const qrValue = JSON.stringify({ ref: booking.ref, event: booking.eventId, seat: booking.label });
  const entry = vip ? 'the VIP entrance' : `Gate ${booking.gate}`;

  const tone = vip
    ? {
        card: 'bg-[#141418] text-white',
        muted: 'text-white/55',
        faint: 'text-white/40',
        line: 'border-white/15',
        price: '#FF7A45',
      }
    : {
        card: 'bg-white text-[#16161a]',
        muted: 'text-[#6b6f76]',
        faint: 'text-[#8a8e95]',
        line: 'border-black/[0.12]',
        price: '#E2412B',
      };

  return (
    <>
      <header className="flex items-center gap-3.5">
        <CheckBadge reduce={reduce} />
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">Ticket confirmed</h1>
          <p className="text-[14px] text-[#6b6f76]">
            Sent to {booking.email}. Show it at {entry}.
          </p>
        </div>
      </header>

      <motion.article
        aria-label={`Ticket for ${event?.title ?? 'event'}, ${booking.label}`}
        className={`relative mt-7 flex flex-col overflow-hidden rounded-[26px] shadow-[0_30px_70px_-24px_rgba(20,30,45,0.35),0_2px_6px_rgba(20,30,45,0.06)] md:flex-row ${tone.card}`}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 150, damping: 22, delay: 0.08 }}
      >
        {/* Main */}
        <div className="relative min-w-0 flex-1 p-6 sm:p-8">
          {vip && (
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -left-10 h-56 w-80 rounded-full opacity-25 blur-3xl"
              style={{ background: ORANGE }}
            />
          )}
          <div className="relative">
            <p className={`flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] ${tone.muted}`}>
              <span className="size-1.5 rounded-full" style={{ background: ORANGE }} aria-hidden />
              {details.areaLine}
            </p>
            <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{event?.title ?? booking.eventId}</p>
            {event && (
              <p className={`mt-1 text-[15px] ${tone.muted}`}>
                {event.dateLabel} · {event.time} · {event.venue}
              </p>
            )}

            <dl className={`mt-7 grid gap-x-4 gap-y-3 ${details.fields.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              {details.fields.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className={`text-[11px] font-medium uppercase tracking-[0.12em] ${tone.faint}`}>{f.label}</dt>
                  <dd className="tabular mt-1 truncate text-[30px] font-semibold leading-none tracking-tight sm:text-[40px]">{f.value}</dd>
                </div>
              ))}
            </dl>

            <dl className={`mt-7 grid grid-cols-2 gap-4 border-t pt-5 ${tone.line}`}>
              <Detail label="Ticket holder" value={booking.name} muted={tone.faint} />
              <Detail label="Booking ref" value={booking.ref} muted={tone.faint} mono />
            </dl>
          </div>
        </div>

        {/* Perforation: horizontal on mobile, vertical on desktop */}
        <div className="relative h-0 md:hidden" aria-hidden>
          <span className="absolute -left-3.5 -top-3.5 size-7 rounded-full" style={{ background: PAGE_BG }} />
          <span className="absolute -right-3.5 -top-3.5 size-7 rounded-full" style={{ background: PAGE_BG }} />
          <span className={`absolute inset-x-6 top-0 border-t-2 border-dashed ${tone.line}`} />
        </div>
        <div className="relative hidden w-0 md:block" aria-hidden>
          <span className="absolute -left-3.5 -top-3.5 size-7 rounded-full" style={{ background: PAGE_BG }} />
          <span className="absolute -bottom-3.5 -left-3.5 size-7 rounded-full" style={{ background: PAGE_BG }} />
          <span className={`absolute inset-y-6 left-0 border-l-2 border-dashed ${tone.line}`} />
        </div>

        {/* Stub */}
        <div className="relative flex flex-col items-center gap-4 p-6 sm:p-8 md:w-[272px] md:shrink-0">
          <div className="flex w-full items-baseline justify-between md:flex-col md:items-center md:gap-0.5">
            <span className={`text-[12px] font-semibold tracking-[0.12em] ${tone.muted}`}>{CURRENCY}</span>
            <span className="tabular text-[32px] font-semibold leading-none tracking-tight" style={{ color: tone.price }}>
              {formatAmount(booking.price, CURRENCY)}
            </span>
          </div>
          <div
            role="img"
            aria-label={`QR code for booking ${booking.ref}`}
            className="rounded-[18px] bg-white p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
          >
            <QRCodeSVG value={qrValue} size={132} level="M" fgColor="#16161a" bgColor="#ffffff" marginSize={0} />
          </div>
          <Barcode value={booking.ref} color={vip ? '#ffffff' : '#16161a'} className="h-12 w-full max-w-[220px]" />
          <p className={`tabular -mt-2 text-[12px] tracking-[0.3em] ${tone.muted}`}>{booking.ref}</p>
        </div>
      </motion.article>

      <motion.div
        className="mt-auto flex flex-col-reverse gap-3 pt-9 sm:mt-9 sm:flex-row sm:justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.2 : 0.5, delay: reduce ? 0 : 0.35 }}
      >
        <Link href={backHref} className={`${pillBase} border border-black/10 bg-white text-[#16161a] hover:bg-[#f7f8fa]`}>
          Back to the stadium
        </Link>
        <Link href="/stadium" className={`${pillBase} text-white hover:brightness-[1.05]`} style={{ background: ORANGE }}>
          Done
        </Link>
      </motion.div>
    </>
  );
}

function Detail({ label, value, muted, mono }: { label: string; value: string; muted: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className={`text-[11px] font-medium uppercase tracking-[0.12em] ${muted}`}>{label}</dt>
      <dd className={`mt-0.5 truncate text-[16px] font-medium ${mono ? 'tabular tracking-wide' : ''}`}>{value}</dd>
    </div>
  );
}

function CheckBadge({ reduce }: { reduce: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-full shadow-[0_8px_20px_-6px_rgba(242,106,33,0.6)]"
      style={{ background: ORANGE }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 18, delay: 0.2 }}
    >
      <svg viewBox="0 0 24 24" className="size-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.75}>
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.span>
  );
}

function NotFound({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span className="grid size-14 place-items-center rounded-full bg-white text-[#6b6f76] shadow-sm" aria-hidden>
        <Ticket size={24} />
      </span>
      <h1 className="mt-5 text-[22px] font-semibold tracking-tight">Ticket not found</h1>
      <p className="mt-1.5 max-w-[320px] text-[14px] text-[#6b6f76]">
        We couldn’t find this ticket on this device. It may have been booked in another browser session.
      </p>
      <div className="mt-8 flex w-full max-w-[320px] flex-col gap-3">
        <Link href={backHref} className={`${pillBase} text-white sm:w-full`} style={{ background: ORANGE }}>
          Back to the stadium
        </Link>
      </div>
    </div>
  );
}
