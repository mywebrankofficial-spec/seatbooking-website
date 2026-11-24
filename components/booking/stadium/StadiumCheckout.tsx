'use client';
/**
 * Stadium checkout. Light frosted modal (centred on desktop, bottom sheet on
 * mobile) over the 3D scene, driven by `useStadium.checkoutOpen`. Holds the
 * seat / skybox chair on open, collects name + email, confirms the booking and
 * navigates to /stadium/[eventId]/confirm.
 */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { AlertCircle, Loader2, Lock, Timer, X } from 'lucide-react';
import { useStadium } from '@/store/stadium';
import { confirmStadiumBooking, holdStadiumSeat, type SeatHold } from '@/lib/api';
import { formatMoney } from '@/lib/venue-engine/money';
import { saveStadiumBooking } from '@/lib/stadium-booking-session';
import { chooseAnotherSeat } from '@/lib/stadium-nav';
import { CURRENCY, eventLine, getEvent, selectionFromState, ticketDetails, type StadiumSelection } from './ticket-details';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ORANGE = '#F26A21';

type HoldState =
  | { status: 'holding' }
  | { status: 'held'; hold: SeatHold; expiresAt: number }
  | { status: 'error'; message: string };

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F26A21]';

/* ------------------------------------------------------------------ */

const desktopQuery = '(min-width: 640px)';
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(desktopQuery);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );
}

export function StadiumCheckout() {
  const open = useStadium((s) => s.checkoutOpen);
  const eventId = useStadium((s) => s.eventId);
  const checkoutKind = useStadium((s) => s.checkoutKind);
  const seatIndex = useStadium((s) => s.seatIndex);
  const skyboxId = useStadium((s) => s.skyboxId);
  const chair = useStadium((s) => s.chair);

  const selection = useMemo(
    () => (open ? selectionFromState({ eventId, checkoutKind, seatIndex, skyboxId, chair }) : null),
    [open, eventId, checkoutKind, seatIndex, skyboxId, chair],
  );

  return <AnimatePresence>{selection && <CheckoutLayer key={`${eventId}:${selection.holdKey}`} selection={selection} />}</AnimatePresence>;
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
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function CheckoutLayer({ selection }: { selection: StadiumSelection }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const desktop = useIsDesktop();
  const dragControls = useDragControls();

  const { eventId, holdKey } = selection;
  const event = getEvent(eventId);
  const details = ticketDetails(selection);
  const vip = details.kind === 'vip';
  const priceLabel = formatMoney(details.price, CURRENCY);

  const titleId = useId();
  const descId = useId();
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
    useStadium.setState({ checkoutOpen: false });
  }, []);

  // --- Hold ----------------------------------------------------------------
  const runHold = useCallback(
    async (req: number, reuseExisting: boolean) => {
      // Reuse a hold the ticket card already started, if it is still running.
      const existing = reuseExisting ? Date.parse(useStadium.getState().holdExpiresAt ?? '') : NaN;
      try {
        const h = await holdStadiumSeat(eventId, holdKey);
        if (holdRequest.current !== req) return;
        const t = Date.now();
        const expiresAt = Number.isFinite(existing) && existing - t > 5_000 ? existing : Date.parse(h.expiresAt);
        useStadium.setState({ holdExpiresAt: new Date(expiresAt).toISOString() });
        setNow(t);
        setHold({ status: 'held', hold: h, expiresAt });
      } catch (err) {
        if (holdRequest.current !== req) return;
        setHold({ status: 'error', message: err instanceof Error ? err.message : 'We couldn’t hold this seat' });
      }
    },
    [eventId, holdKey],
  );

  useEffect(() => {
    const counter = holdRequest;
    void runHold(++counter.current, true);
    return () => {
      counter.current += 1;
    };
  }, [runHold]);

  const retryHold = () => {
    setHold({ status: 'holding' });
    void runHold(++holdRequest.current, false);
  };

  const remaining = hold.status === 'held' ? hold.expiresAt - now : 0;
  const expired = hold.status === 'held' && remaining <= 0;

  useEffect(() => {
    if (hold.status !== 'held') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hold.status]);

  // --- Focus management + Escape (capture, so the 3D "back" doesn't also fire)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus({ preventScroll: true });
      }
    };
  }, [close]);

  const onSheetKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keep keys (arrows, Enter) from reaching the 3D keyboard navigation.
    e.stopPropagation();
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

  // --- Drag to dismiss (handle / header only) --------------------------------
  const onHeaderPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (payingRef.current || reduce) return;
    dragControls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) close();
  };

  // --- Form --------------------------------------------------------------------
  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const showNameError = (touched.name || submitted) && nameError ? nameError : null;
  const showEmailError = (touched.email || submitted) && emailError ? emailError : null;
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
      const { holdKey: _key, ...rest } = selection;
      void _key;
      const booking = await confirmStadiumBooking({
        ...rest,
        holdId: hold.hold.holdId,
        name: name.trim(),
        email: email.trim(),
      });
      saveStadiumBooking(booking);
      payingRef.current = false;
      useStadium.setState({ lastBooking: booking, holdExpiresAt: null, checkoutOpen: false });
      router.push(`/stadium/${encodeURIComponent(eventId)}/confirm?ref=${encodeURIComponent(booking.ref)}`);
    } catch (err) {
      payingRef.current = false;
      setPaying(false);
      setPayError(err instanceof Error ? err.message : 'Payment didn’t go through. Please try again.');
    }
  };

  const onChooseAnother = () => {
    useStadium.setState({ checkoutOpen: false, holdExpiresAt: null });
    void chooseAnotherSeat();
  };

  const spring = reduce ? { duration: 0.2 } : ({ type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const);
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : desktop
      ? {
          initial: { opacity: 0, y: 24, scale: 0.97 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 16, scale: 0.98 },
        }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-0 z-[60] bg-[#0d1620]/45 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={close}
      />

      <div className="pointer-events-none fixed inset-0 z-[61] flex items-end justify-center sm:items-center sm:p-6">
        <motion.div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          tabIndex={-1}
          onKeyDown={onSheetKeyDown}
          className="pointer-events-auto flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-white/70 bg-white/[0.93] text-[#16161a] shadow-[0_-20px_60px_rgba(13,22,32,0.28)] outline-none backdrop-blur-2xl backdrop-saturate-150 [color-scheme:light] sm:max-h-[min(760px,92dvh)] sm:max-w-[460px] sm:rounded-[28px] sm:shadow-[0_30px_80px_-10px_rgba(13,22,32,0.45)]"
          {...motionProps}
          transition={spring}
          drag={reduce ? false : 'y'}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.8 }}
          onDragEnd={onDragEnd}
        >
          {/* Handle + header: drag zone */}
          <div
            className="shrink-0 cursor-grab touch-none px-5 pt-2.5 active:cursor-grabbing sm:px-6 sm:pt-5"
            onPointerDown={onHeaderPointerDown}
          >
            <div className="mx-auto h-[5px] w-9 rounded-full bg-black/15 sm:hidden" aria-hidden />
            <div className="mt-3 flex items-start justify-between gap-3 sm:mt-0">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[20px] font-semibold tracking-tight">
                  Checkout
                </h2>
                <HoldStatus hold={hold} expired={expired} remaining={remaining} vip={vip} />
              </div>
              <button
                type="button"
                onClick={close}
                disabled={paying}
                aria-label="Close checkout"
                className={`grid size-9 shrink-0 place-items-center rounded-full bg-black/[0.05] text-[#4a4e55] transition-colors hover:bg-black/[0.09] hover:text-[#16161a] disabled:opacity-40 ${focusRing}`}
              >
                <X size={18} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
            {/* Summary */}
            <section
              id={descId}
              aria-label="Ticket summary"
              className={`rounded-[20px] p-4 ${
                vip
                  ? 'bg-[#141418] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                  : 'border border-black/[0.06] bg-white/80'
              }`}
            >
              <p className={`text-[13px] ${vip ? 'text-white/60' : 'text-[#6b6f76]'}`}>
                {event ? eventLine(event) : eventId}
              </p>
              <p
                className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                  vip ? 'text-white/70' : 'text-[#6b6f76]'
                }`}
              >
                {vip && <span className="size-1.5 rounded-full" style={{ background: ORANGE }} aria-hidden />}
                {details.areaLine}
              </p>
              <dl className={`mt-2 grid gap-2 ${details.fields.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {details.fields.map((f) => (
                  <div key={f.label} className="min-w-0">
                    <dt className={`text-[10.5px] font-medium uppercase tracking-[0.1em] ${vip ? 'text-white/50' : 'text-[#8a8e95]'}`}>
                      {f.label}
                    </dt>
                    <dd className="tabular mt-0.5 truncate text-[20px] font-semibold leading-tight tracking-tight">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <div className={`my-3.5 h-px ${vip ? 'bg-white/10' : 'bg-black/[0.07]'}`} />
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-[14px] font-medium ${vip ? 'text-white/80' : ''}`}>Total</span>
                <span className="tabular text-[20px] font-semibold tracking-tight" style={{ color: vip ? '#FF7A45' : '#E2412B' }}>
                  {priceLabel}
                </span>
              </div>
            </section>

            {hold.status === 'error' ? (
              <div role="alert" className="mt-4 rounded-[20px] border border-black/[0.06] bg-white/80 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#C8321F]" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">This seat was just taken</p>
                    <p className="mt-0.5 text-[13px] text-[#6b6f76]">{hold.message}. Pick another seat to continue.</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={onChooseAnother}
                    className={`h-11 flex-1 rounded-full text-[15px] font-semibold text-white ${focusRing}`}
                    style={{ background: ORANGE }}
                  >
                    Choose another seat
                  </button>
                  <button
                    type="button"
                    onClick={retryHold}
                    className={`h-11 rounded-full border border-black/10 bg-white px-5 text-[15px] font-medium ${focusRing}`}
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
                    error={showNameError}
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
                    hint="Your ticket is sent here."
                    value={email}
                    onChange={setEmail}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    error={showEmailError}
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
                  <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-black/[0.04] px-4 py-3">
                    <p className="text-[13px] text-[#4a4e55]">Your hold expired.</p>
                    <button
                      type="button"
                      onClick={retryHold}
                      className={`rounded-full border border-black/10 bg-white px-4 py-1.5 text-[13px] font-medium ${focusRing}`}
                    >
                      Hold again
                    </button>
                  </div>
                )}

                {payError && (
                  <p role="alert" className="mt-4 flex items-center gap-2 text-[13px] text-[#C8321F]">
                    <AlertCircle size={15} aria-hidden className="shrink-0" />
                    {payError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canPay}
                  className={`mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full text-[17px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(242,106,33,0.65)] transition-[opacity,transform,filter] duration-200 hover:brightness-[1.04] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:scale-100 ${focusRing}`}
                  style={{ background: ORANGE }}
                >
                  {paying ? (
                    <>
                      <Loader2 size={18} className="animate-spin" aria-hidden />
                      <span>Processing…</span>
                    </>
                  ) : (
                    <span className="tabular">Pay {priceLabel}</span>
                  )}
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#8a8e95]">
                  <Lock size={12} aria-hidden />
                  Secure payment · Demo, no card is charged
                </p>
                <p className="sr-only" aria-live="polite">
                  {paying ? 'Processing payment' : ''}
                </p>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}

function HoldStatus({ hold, expired, remaining, vip }: { hold: HoldState; expired: boolean; remaining: number; vip: boolean }) {
  if (hold.status === 'error') return null;
  const text =
    hold.status === 'holding'
      ? `Holding your ${vip ? 'skybox seat' : 'seat'}…`
      : expired
        ? 'Hold expired'
        : `Held for ${formatCountdown(remaining)}`;
  const low = hold.status === 'held' && !expired && remaining < 60_000;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#6b6f76]">
      {hold.status === 'holding' ? (
        <Loader2 size={13} className="animate-spin text-[#8a8e95]" aria-hidden />
      ) : (
        <Timer size={13} className={expired ? 'text-[#8a8e95]' : ''} style={expired ? undefined : { color: ORANGE }} aria-hidden />
      )}
      <span role="timer" aria-live="off" className={`tabular ${low ? 'font-medium text-[#C8321F]' : ''}`}>
        {text}
      </span>
    </p>
  );
}

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'onBlur' | 'value'> {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error: string | null;
  inputRef: React.Ref<HTMLInputElement>;
  onChange: (v: string) => void;
  onBlur: () => void;
}

function Field({ id, label, hint, value, error, inputRef, onChange, onBlur, ...rest }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#4a4e55]">
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
        aria-describedby={describedBy}
        required
        className={`block h-12 w-full rounded-[14px] border bg-white px-4 text-[16px] text-[#16161a] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#a4a8ae] focus:border-[#F26A21] focus:ring-[3px] focus:ring-[#F26A21]/25 disabled:opacity-60 ${
          error ? 'border-[#C8321F]/60' : 'border-black/[0.1]'
        }`}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-center gap-1 text-[12.5px] text-[#C8321F]">
          <AlertCircle size={13} aria-hidden className="shrink-0" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-[12.5px] text-[#8a8e95]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
