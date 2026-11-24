'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Info } from 'lucide-react';
import type { Cinema } from '@/types/cinema';
import { useBooking } from '@/store/booking';
import { DEFAULT_LAYOUT, RECLINER_ROWS, seatsPerRow } from '@/lib/hall-geometry';
import { PRICES } from '@/data/cinema';
import { formatPrice } from '@/lib/format';
import { EASE_PREMIUM, usePrefersReducedMotion } from './motion';

const roundBtn =
  'flex size-10 shrink-0 items-center justify-center rounded-full border border-white/6 bg-[#18181c] text-white/90 ' +
  'transition-colors duration-200 hover:bg-[#202025] active:bg-[#232328] outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70';

interface TopBarProps {
  cinema: Cinema;
}

export function TopBar({ cinema }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <header className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-3">
      <Link href="/" aria-label="Back" className={roundBtn}>
        <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
      </Link>

      <div className="min-w-0 text-center">
        <h1 className="truncate text-[17px] leading-tight font-bold tracking-[-0.01em] text-white">{cinema.name}</h1>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-fg-3">
          {cinema.hallName} · {cinema.dateLabel}
        </p>
      </div>

      <button
        ref={btnRef}
        type="button"
        aria-label="Hall information"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={roundBtn}
      >
        <Info className="size-[18px]" strokeWidth={2} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={`${cinema.hallName} information`}
            tabIndex={-1}
            className="glass absolute top-full right-4 w-64 origin-top-right rounded-[20px] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.55)] outline-none"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -6 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.24, ease: EASE_PREMIUM }}
          >
            <HallInfo cinema={cinema} />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function HallInfo({ cinema }: { cinema: Cinema }) {
  const seats = useBooking((s) => s.seats);
  const free = seats.filter((s) => s.status === 'available').length;
  const total = DEFAULT_LAYOUT.rows.length * seatsPerRow();
  const firstRow = DEFAULT_LAYOUT.rows[0];
  const lastRow = DEFAULT_LAYOUT.rows[DEFAULT_LAYOUT.rows.length - 1];
  const reclinerRows = `${RECLINER_ROWS[0]}–${RECLINER_ROWS[RECLINER_ROWS.length - 1]}`;

  const rows: [string, string][] = [
    ['Seats', `${total} · rows ${firstRow}–${lastRow}`],
    ['Free now', seats.length ? String(free) : '—'],
    ['Standard', formatPrice(PRICES.standard)],
    [`Recliner · ${reclinerRows}`, formatPrice(PRICES.recliner)],
  ];

  return (
    <>
      <p className="text-[14px] font-semibold text-white">{cinema.hallName}</p>
      <p className="mt-0.5 text-[11.5px] text-fg-3">
        {cinema.name} · {cinema.dateLabel}
      </p>
      <dl className="mt-3 space-y-2 border-t border-white/6 pt-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-[12px]">
            <dt className="text-fg-2">{k}</dt>
            <dd className="tabular font-medium text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-snug text-fg-3">Double-tap a seat to see the view from it.</p>
    </>
  );
}
