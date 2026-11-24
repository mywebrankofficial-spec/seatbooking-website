'use client';
/**
 * Checkout bottom sheet. Mounted as the top layer of the booking column and
 * driven by the store's `checkoutOpen`. Holds the seat on open, collects name +
 * email, confirms the booking and navigates to the confirmation page.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { AlertCircle, Loader2, Timer, X } from 'lucide-react';
import { useBooking } from '@/store/booking';
import { confirmBooking, holdSeat, type SeatHold } from '@/lib/api';
import { formatPrice, seatTypeLabel } from '@/lib/format';
import { saveBooking } from '@/lib/booking-session';
import { exitToMap } from '@/lib/transitions';
import { FILM_TITLE, findSeat, getShowDetails, seatLongLabel } from './constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type HoldState =
  | { status: 'holding' }
  | { status: 'held'; hold: SeatHold }
  | { status: 'error'; message: string };

export function CheckoutSheet() {
  const open = useBooking((s) => s.checkoutOpen);
  const showtimeId = useBooking((s) => s.showtimeId);
  const seatId = useBooking((s) => s.selectedSeatId);

  return (
    <AnimatePresence>
      {open && seatId && <CheckoutLayer key={`${showtimeId}:${seatId}`} showtimeId={showtimeId} seatId={seatId} />}
    </AnimatePresence>
  );
}

function validateName(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Enter your name';
  if (t.length < 2) return 'Name looks too short';
  return null;
}

function validateEmail(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Enter your email';
  if (!EMAIL_RE.test(t)) return 'Enter a valid email, like name@example.com';
  return null;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function CheckoutLayer({ showtimeId, seatId }: { showtimeId: string; seatId: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const seats = useBooking((s) => s.seats);
  const seat = findSeat(showtimeId, seatId, seats);
  const show = getShowDetails(showtimeId);
  const price = seat?.price ?? 0;

  const titleId = useId();
  const nameId = useId();
  const emailId = useId();

  const sheetRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [hold, setHold] = useState<HoldState>({ status: 'holding' });
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState({ name: false, email: false });
  const [submitted, setSubmitted] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const holdRequest = useRef(0);
  const payingRef = useRef(false);

  const close = useCallback(() => {
    if (payingRef.current) return;
    useBooking.getState().setCheckoutOpen(false);
  }, []);

  // --- Seat hold -----------------------------------------------------------
  const runHold = useCallback(
    async (req: number) => {
      try {
        const h = await holdSeat(showtimeId, seatId);
        if (holdRequest.current !== req) return;
        setNow(Date.now());
        setHold({ status: 'held', hold: h });
      } catch (err) {
        if (holdRequest.current !== req) return;
        setHold({
          status: 'error',
          message: err instanceof Error ? err.message : 'We couldn’t hold this seat',
        });
      }
    },
    [showtimeId, seatId],
  );

  useEffect(() => {
    const counter = holdRequest;
    void runHold(++counter.current);
    return () => {
      // Invalidate any in-flight hold when the sheet closes.
      counter.current += 1;
    };
  }, [runHold]);

  const retryHold = () => {
    setHold({ status: 'holding' });
    void runHold(++holdRequest.current);
  };

  const expiresAt = hold.status === 'held' ? Date.parse(hold.hold.expiresAt) : 0;
  const remaining = expiresAt - now;
  const expired = hold.status === 'held' && remaining <= 0;

  useEffect(() => {
    if (hold.status !== 'held') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold.status]);

  // --- Focus management + Escape -------------------------------------------
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the dialog itself (not an input) so mobile keyboards don't pop up.
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus({ preventScroll: true });
      }
    };
  }, [close]);

  const onSheetKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !sheetRef.current) return;
    const focusables = Array.from(
      sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === sheetRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // --- Drag to dismiss (handle / header only, so inputs stay usable) ------
  const onHeaderPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (payingRef.current) return;
    dragControls.start(e);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) close();
  };

  // --- Form ------------------------------------------------------------------
  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const showNameError = (touched.name || submitted) && nameError;
  const showEmailError = (touched.email || submitted) && emailError;
  const canPay = hold.status === 'held' && !expired && !paying;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setPayError(null);
    if (nameError || emailError) {
      (nameError ? nameRef : emailRef).current?.focus();
      return;
    }
    if (hold.status !== 'held' || expired || payingRef.current) return;

    payingRef.current = true;
    setPaying(true);
    try {
      const booking = await confirmBooking({
        holdId: hold.hold.holdId,
        showtimeId,
        seatId,
        name: name.trim(),
        email: email.trim(),
      });
      const st = useBooking.getState();
      st.setLastBooking(booking);
      saveBooking(booking);
      payingRef.current = false;
      st.setCheckoutOpen(false);
      router.push(`/book/${encodeURIComponent(showtimeId)}/confirm?ref=${encodeURIComponent(booking.ref)}`);
    } catch (err) {
      payingRef.current = false;
      setPaying(false);
      setPayError(err instanceof Error ? err.message : 'Payment didn’t go through. Please try again.');
    }
  };

  const chooseAnotherSeat = () => {
    useBooking.getState().setCheckoutOpen(false);
    void exitToMap();
  };

  const spring = reduce ? { duration: 0.2 } : ({ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const);

  return (
    <>
      <motion.div
        aria-hidden
        className="absolute inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={close}
      />

      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onSheetKeyDown}
        className="absolute inset-x-0 bottom-0 z-[61] flex max-h-[92%] flex-col rounded-t-[24px] border-t border-white/[0.07] bg-surface shadow-[0_-24px_60px_rgba(0,0,0,0.55)] outline-none"
        initial={reduce ? { opacity: 0 } : { y: '100%' }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: '100%' }}
        transition={spring}
        drag={reduce ? false : 'y'}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.8 }}
        onDragEnd={onDragEnd}
      >
        {/* Handle + header: the drag zone */}
        <div className="shrink-0 cursor-grab touch-none px-5 pt-2.5 active:cursor-grabbing" onPointerDown={onHeaderPointerDown}>
          <div className="mx-auto h-[5px] w-9 rounded-full bg-white/20" aria-hidden />
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[20px] font-semibold tracking-tight">
                Checkout
              </h2>
              <HoldStatus hold={hold} expired={expired} remaining={remaining} />
            </div>
            <button
              type="button"
              onClick={close}
              disabled={paying}
              aria-label="Close checkout"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-fg-2 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
            >
              <X size={18} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
          {/* Ticket summary */}
          <section aria-label="Ticket summary" className="rounded-[20px] border border-white/[0.06] bg-card p-4">
            <p className="text-[17px] font-semibold tracking-tight">{FILM_TITLE}</p>
            <p className="mt-1 text-[13px] text-fg-2">{show.cinemaLine}</p>
            <p className="text-[13px] text-fg-2">{show.dateLine}</p>

            <div className="my-3.5 h-px bg-white/[0.07]" />

            <dl className="space-y-2 text-[14px]">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-2">
                  {seatLongLabel(seatId)}
                  {seat && <span className="text-fg-3"> · {seatTypeLabel(seat.type)}</span>}
                </dt>
                <dd className="tabular text-fg">{formatPrice(price)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-1">
                <dt className="font-medium">Total</dt>
                <dd className="tabular text-[17px] font-semibold">{formatPrice(price)}</dd>
              </div>
            </dl>
          </section>

          {hold.status === 'error' ? (
            <div role="alert" className="mt-4 rounded-[20px] border border-white/[0.06] bg-card p-4">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#f2a09a]" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">This seat was just taken</p>
                  <p className="mt-0.5 text-[13px] text-fg-2">{hold.message}. Pick another seat to continue.</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={chooseAnotherSeat}
                  className="h-11 flex-1 rounded-full bg-white text-[15px] font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Choose another seat
                </button>
                <button
                  type="button"
                  onClick={retryHold}
                  className="h-11 rounded-full border border-white/15 px-5 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <form noValidate onSubmit={onSubmit} className="mt-5" aria-busy={paying}>
              <div className="space-y-4">
                <Field
                  id={nameId}
                  inputRef={nameRef}
                  label="Name"
                  value={name}
                  onChange={setName}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  error={showNameError || null}
                  disabled={paying}
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  placeholder="Alex Morgan"
                />
                <Field
                  id={emailId}
                  inputRef={emailRef}
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  error={showEmailError || null}
                  disabled={paying}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder="you@example.com"
                />
              </div>

              {expired && (
                <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-card px-4 py-3">
                  <p className="text-[13px] text-fg-2">Your seat hold expired.</p>
                  <button
                    type="button"
                    onClick={retryHold}
                    className="rounded-full border border-white/15 px-4 py-1.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Hold again
                  </button>
                </div>
              )}

              {payError && (
                <p role="alert" className="mt-4 flex items-center gap-2 text-[13px] text-[#f2a09a]">
                  <AlertCircle size={15} aria-hidden className="shrink-0" />
                  {payError}
                </p>
              )}

              <button
                type="submit"
                disabled={!canPay}
                className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black transition-[opacity,transform] duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                {paying ? (
                  <>
                    <Loader2 size={18} className="animate-spin" aria-hidden />
                    <span>Processing…</span>
                  </>
                ) : (
                  <span className="tabular">Pay {formatPrice(price)}</span>
                )}
              </button>
              <p className="sr-only" aria-live="polite">
                {paying ? 'Processing payment' : ''}
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </>
  );
}

function HoldStatus({ hold, expired, remaining }: { hold: HoldState; expired: boolean; remaining: number }) {
  if (hold.status === 'error') return null;
  const text =
    hold.status === 'holding' ? 'Holding your seat…' : expired ? 'Hold expired' : `Seat held for ${formatCountdown(remaining)}`;
  const low = hold.status === 'held' && !expired && remaining < 60_000;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-fg-2">
      {hold.status === 'holding' ? (
        <Loader2 size={13} className="animate-spin text-fg-3" aria-hidden />
      ) : (
        <Timer size={13} className={expired ? 'text-fg-3' : 'text-accent'} aria-hidden />
      )}
      <span role="timer" aria-live="off" className={`tabular ${low ? 'text-fg' : ''}`}>
        {text}
      </span>
    </p>
  );
}

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur' | 'value'> {
  id: string;
  label: string;
  value: string;
  error: string | null;
  inputRef: React.Ref<HTMLInputElement>;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function Field({ id, label, value, error, inputRef, onChange, onBlur, ...rest }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-fg-2">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        name={label.toLowerCase()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        required
        className={`block h-12 w-full rounded-[14px] border bg-card px-4 text-[16px] text-fg placeholder:text-fg-3 outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent/70 focus:ring-[3px] focus:ring-accent/25 disabled:opacity-60 ${
          error ? 'border-[#f2a09a]/60' : 'border-white/[0.08]'
        }`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="mt-1.5 text-[12.5px] text-[#f2a09a]">
          {error}
        </p>
      )}
    </div>
  );
}
