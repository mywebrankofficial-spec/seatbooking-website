'use client';
/**
 * Shared building blocks for the stadium overlay: frosted surfaces, labels, status dots,
 * rolling price digits, the rendered-view image (with shimmer), barcode, responsive hooks.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStadium } from '@/store/stadium';
import { useViewImage, type ViewRequest } from '@/lib/view-render';
import { formatAmount } from '@/lib/venue-engine/money';
import { TIERS, seatInfo } from '@/lib/stadium-geometry';
import { blockPrice } from '@/data/stadium/event';

/* ------------------------------------------------------------------ */
/* Tokens                                                               */
/* ------------------------------------------------------------------ */

export const INK = '#16161a';
export const MUTED = '#8a8a93';
export const PRICE = '#E2412B';
export const ACCENT = '#F26A21';
export const GREEN = '#22C55E';
export const RED = '#EF4444';
export const VIP_BG = '#141416';
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Light frosted card surface (rgba white .86 + blur 20 + saturate, white/60 border, soft shadow). */
export const GLASS =
  'bg-white/[0.86] backdrop-blur-[20px] backdrop-saturate-[1.8] border border-white/60 ' +
  'shadow-[0_18px_48px_-16px_rgba(16,18,32,0.32),0_2px_8px_rgba(16,18,32,0.06)]';

/** Glass without the shadow (for masked shapes where box-shadow would be clipped). */
export const GLASS_FLAT = 'bg-white/[0.86] backdrop-blur-[20px] backdrop-saturate-[1.8]';

export const LABEL = 'text-[10.5px] font-semibold uppercase leading-none tracking-[0.14em]';

/* ------------------------------------------------------------------ */
/* Small atoms                                                          */
/* ------------------------------------------------------------------ */

export function Label({ children, className = '', dark = false }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={`${LABEL} ${className}`} style={{ color: dark ? 'rgba(255,255,255,0.5)' : MUTED }}>
      {children}
    </div>
  );
}

export function Dot({ color, className = '' }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${className}`}
      style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }}
    />
  );
}

export function Status({ ok, text, className = '' }: { ok: boolean; text: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[12.5px] font-medium ${className}`}>
      <Dot color={ok ? GREEN : RED} />
      <span style={{ color: ok ? INK : RED }}>{text}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rolling digits                                                       */
/* ------------------------------------------------------------------ */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

function DigitColumn({ digit, reduced }: { digit: number; reduced: boolean }) {
  return (
    <span className="relative inline-block h-[1.1em] overflow-hidden align-top leading-[1.1em]">
      <span
        className="flex flex-col"
        style={{
          transform: `translateY(${-digit * 1.1}em)`,
          transition: reduced ? 'none' : 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="block h-[1.1em]">
            {d}
          </span>
        ))}
      </span>
      {/* invisible sizer keeps the column width of a digit */}
      <span className="invisible absolute left-0 top-0">0</span>
    </span>
  );
}

/**
 * Price that rolls its digits (odometer style) from `from` (or the previous value) to `value`.
 * `value === null` renders an em dash.
 */
export function RollingNumber({ value, from, className = '', style }: { value: number | null; from?: number | null; className?: string; style?: React.CSSProperties }) {
  const reduced = useStadium((s) => s.reducedMotion);
  const [shown, setShown] = useState<number | null>(from ?? value);
  useEffect(() => {
    if (shown === value) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(value)));
    return () => cancelAnimationFrame(id);
  }, [value, shown]);

  if (value === null) {
    return (
      <span className={`tabular-nums ${className}`} style={style}>
        —
      </span>
    );
  }
  const target = formatAmount(value, 'AED');
  const current = shown === null ? target : formatAmount(shown, 'AED');
  // Align from the right; missing positions roll from 0. Layout follows the target string.
  const cur = current.padStart(target.length, '0').slice(-target.length);
  return (
    <span className={`inline-flex tabular-nums leading-[1.1em] ${className}`} style={style}>
      {/* The digit reels below are decorative (aria-hidden); this is the real, readable value. */}
      <span className="sr-only">{target}</span>
      {target.split('').map((ch, i) => {
        const key = target.length - i;
        if (ch < '0' || ch > '9') {
          return (
            <span key={`s${key}`} aria-hidden>
              {ch}
            </span>
          );
        }
        const c = cur[i];
        const d = c >= '0' && c <= '9' ? Number(c) : 0;
        return (
          <span key={`d${key}`} aria-hidden>
            <DigitColumn digit={shown === value ? Number(ch) : d} reduced={reduced} />
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Rendered view image                                                  */
/* ------------------------------------------------------------------ */

/**
 * The REAL rendered view (lib/view-render). Shows a soft shimmering placeholder until the
 * renderer resolves, then fades the image in. `req` must be memoised by the caller.
 */
export function ViewImage({
  req,
  label,
  className = '',
  dark = false,
  children,
}: {
  req: ViewRequest | null;
  label: string;
  className?: string;
  dark?: boolean;
  children?: React.ReactNode;
}) {
  const url = useViewImage(req);
  const reduced = useStadium((s) => s.reducedMotion);
  return (
    <div
      role="img"
      aria-label={label}
      aria-busy={!url}
      className={`relative isolate overflow-hidden ${className}`}
      style={{
        background: dark
          ? 'linear-gradient(160deg,#2a2a30 0%,#1c1c20 55%,#202a22 100%)'
          : 'linear-gradient(170deg,#dfe7ee 0%,#cfdae2 52%,#c9d8c9 100%)',
      }}
    >
      {!url && !reduced && (
        <motion.div
          aria-hidden
          className="absolute inset-y-0 -left-1/2 w-1/2"
          style={{
            background: dark
              ? 'linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent)'
              : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.65),transparent)',
          }}
          animate={{ x: ['0%', '400%'] }}
          transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.2 }}
        />
      )}
      <AnimatePresence>
        {url && (
          <motion.div
            key={url}
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${url}")` }}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
          />
        )}
      </AnimatePresence>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barcode                                                              */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic barcode from an id. `vertical` stacks bars top-to-bottom (rotated code for stubs). */
export function Barcode({
  id,
  width,
  height,
  color = INK,
  vertical = false,
}: {
  id: string;
  width: number;
  height: number;
  color?: string;
  vertical?: boolean;
}) {
  const bars = useMemo(() => {
    let s = hash(id) || 1;
    const rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    const units: Array<{ at: number; w: number }> = [];
    let at = 0;
    // guard bars
    const push = (w: number, bar: boolean) => {
      if (bar) units.push({ at, w });
      at += w;
    };
    push(1, true);
    push(1, false);
    push(1, true);
    push(1, false);
    while (at < 62) {
      push(1 + Math.floor(rand() * 3), true);
      push(1 + Math.floor(rand() * 2), false);
    }
    push(1, true);
    push(1, false);
    push(1, true);
    return { units, total: at };
  }, [id]);
  const len = vertical ? height : width;
  const k = len / bars.total;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {bars.units.map((b, i) =>
        vertical ? (
          <rect key={i} x={0} y={b.at * k} width={width} height={Math.max(0.8, b.w * k - 0.15)} fill={color} />
        ) : (
          <rect key={i} x={b.at * k} y={0} width={Math.max(0.8, b.w * k - 0.15)} height={height} fill={color} />
        ),
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks                                                                */
/* ------------------------------------------------------------------ */

function subscribeMQ(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
}

const narrowSub = subscribeMQ('(max-width: 640px)');

/** Phone layout: ≤640 px wide or touch input (cards become bottom sheets). */
export function useCompact(): boolean {
  const narrow = useSyncExternalStore(
    narrowSub,
    () => window.matchMedia('(max-width: 640px)').matches,
    () => false,
  );
  const touch = useStadium((s) => s.touchMode);
  return narrow || touch;
}

/** Re-renders every `ms` while `active`. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

/** Everything the UI shows about a seat. */
export function describeSeat(index: number) {
  const { block, row, seat, stand } = seatInfo(index);
  const tier = TIERS[block.tier - 1];
  return {
    block,
    row,
    seat,
    stand,
    tier,
    price: blockPrice(block),
    gate: block.gate,
    /** "NORTH STAND · MIDDLE TIER" */
    where: `${stand.name.toUpperCase()} · ${tier.label}`,
  };
}
