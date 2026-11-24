'use client';
/**
 * Standard ticket (level 'ticket', face 'standard'), plus the shared ticket shell used by the
 * VIP face: a wide ticket with a perforated, notched stub on the right (desktop) or a bottom
 * sheet with the stub along the bottom (compact).
 */
import { useEffect, useMemo } from 'react';
import { Clock } from 'lucide-react';
import { requestView } from '@/lib/view-render';
import { boxInsideShot } from './VipTicketCard';
import { useStadium } from '@/store/stadium';
import { checkoutStandard, openSeatView, showUpgrade } from '@/lib/stadium-nav';
import { seatEyeShot } from '@/lib/stadium-geometry';
import { upgradePrice } from '@/data/stadium/event';
import { formatUpsell } from '@/lib/venue-engine/money';
import type { ViewRequest } from '@/lib/view-render';
import { ACCENT, Barcode, GREEN, INK, Label, MUTED, PRICE, RollingNumber, VIP_BG, ViewImage, describeSeat, useNow } from './ui-kit';

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

const STUB_W = 136;
const STUB_H = 76;
const NOTCH = 11;

function notchMask(compact: boolean): React.CSSProperties {
  const hole = (at: string) => `radial-gradient(circle ${NOTCH}px at ${at}, transparent ${NOTCH - 0.5}px, #000 ${NOTCH + 0.5}px)`;
  const image = compact
    ? `${hole(`0 calc(100% - ${STUB_H}px)`)}, ${hole(`100% calc(100% - ${STUB_H}px)`)}`
    : `${hole(`calc(100% - ${STUB_W}px) 0`)}, ${hole(`calc(100% - ${STUB_W}px) 100%`)}`;
  return {
    maskImage: image,
    WebkitMaskImage: image,
    maskComposite: 'intersect',
    WebkitMaskComposite: 'source-in',
  };
}

export interface TicketShellProps {
  dark?: boolean;
  compact: boolean;
  label: string;
  image: React.ReactNode;
  body: React.ReactNode;
  stub: React.ReactNode;
}

/** Ticket-shaped card: image | body ┆ stub, with perforation and notches. */
export function TicketShell({ dark = false, compact, label, image, body, stub }: TicketShellProps) {
  const surface = dark
    ? 'bg-[#141416]'
    : 'bg-white/[0.86] backdrop-blur-[20px] backdrop-saturate-[1.8]';
  const perfColor = dark ? 'rgba(255,255,255,0.16)' : 'rgba(22,22,26,0.16)';
  return (
    <section
      aria-label={label}
      className="relative"
      style={{ width: compact ? '100%' : 'min(880px, calc(100vw - 48px))', color: dark ? '#fff' : INK }}
    >
      {/* soft shadow (a box-shadow would be clipped by the notch mask) */}
      <div
        aria-hidden
        className="absolute inset-x-6 bottom-[-14px] top-6 rounded-[28px] blur-2xl"
        style={{ background: dark ? 'rgba(0,0,0,0.5)' : 'rgba(16,18,32,0.28)' }}
      />
      <div
        className={`relative overflow-hidden rounded-[22px] ${surface} ${compact ? 'flex flex-col' : 'flex'}`}
        style={{
          ...notchMask(compact),
          boxShadow: dark ? 'inset 0 0 0 1px rgba(255,255,255,0.07)' : 'inset 0 0 0 1px rgba(255,255,255,0.6)',
          background: dark ? VIP_BG : undefined,
        }}
      >
        <div className={compact ? 'p-2.5 pb-0' : 'shrink-0 p-3'}>{image}</div>
        <div className={compact ? 'px-5 pb-4 pt-4' : 'min-w-0 flex-1 py-5 pl-5 pr-7'}>{body}</div>
        {/* perforation */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={
            compact
              ? { left: NOTCH + 6, right: NOTCH + 6, bottom: STUB_H, borderTop: `2px dashed ${perfColor}` }
              : { top: NOTCH + 6, bottom: NOTCH + 6, right: STUB_W - 1, borderLeft: `2px dashed ${perfColor}` }
          }
        />
        <div
          className={compact ? 'flex items-center justify-between px-5' : 'flex shrink-0 flex-col items-center justify-between py-6'}
          style={compact ? { height: STUB_H } : { width: STUB_W }}
        >
          {stub}
        </div>
      </div>
    </section>
  );
}

/** Stub content: "AED", barcode, price. */
export function TicketStub({ id, price, compact, dark = false }: { id: string; price: number; compact: boolean; dark?: boolean }) {
  const bar = dark ? 'rgba(255,255,255,0.88)' : INK;
  const priceColor = dark ? '#FF5B3D' : PRICE;
  if (compact) {
    return (
      <>
        <div className="flex items-baseline gap-2">
          <Label dark={dark}>AED</Label>
          <span className="text-[24px] font-semibold leading-none tracking-[-0.02em]" style={{ color: priceColor }}>
            <RollingNumber value={price} />
          </span>
        </div>
        <Barcode id={id} width={128} height={34} color={bar} />
      </>
    );
  }
  return (
    <>
      <Label dark={dark}>AED</Label>
      <Barcode id={id} width={84} height={64} color={bar} />
      <span className="text-[25px] font-semibold leading-none tracking-[-0.02em]" style={{ color: priceColor }}>
        <RollingNumber value={price} />
      </span>
    </>
  );
}

export function Pair({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div>
      <Label dark={dark}>{label}</Label>
      <div className="mt-1.5 text-[19px] font-semibold leading-none tracking-[-0.01em]">{value}</div>
    </div>
  );
}

/** Pill overlaid on the ticket image. */
export function ViewPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-[#16161a]/75 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur-md">
      <span aria-hidden className="h-[6px] w-[6px] rounded-full" style={{ background: GREEN }} />
      {children}
    </span>
  );
}

export function imageBoxClass(compact: boolean): string {
  return compact ? 'aspect-[16/9] w-full rounded-[14px]' : 'h-[200px] w-[300px] rounded-[14px]';
}

/* ------------------------------------------------------------------ */
/* Hold timer                                                           */
/* ------------------------------------------------------------------ */

export function HoldTimer({ dark = false }: { dark?: boolean }) {
  const holdExpiresAt = useStadium((s) => s.holdExpiresAt);
  const now = useNow(!!holdExpiresAt);
  if (!holdExpiresAt) return null;
  const left = Math.max(0, Math.round((Date.parse(holdExpiresAt) - now) / 1000));
  const expired = left === 0;
  const text = expired ? 'Hold expired' : `Held for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-medium tabular-nums"
      style={{ color: expired ? PRICE : dark ? 'rgba(255,255,255,0.5)' : MUTED }}
      role="timer"
      aria-live="off"
    >
      <Clock aria-hidden size={12} strokeWidth={2.2} />
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Standard face                                                        */
/* ------------------------------------------------------------------ */

export function TicketCard({ seatIndex, compact }: { seatIndex: number; compact: boolean }) {
  const d = describeSeat(seatIndex);
  const req = useMemo<ViewRequest>(
    () => ({ key: `seat:${seatIndex}:ticket`, shot: seatEyeShot(seatIndex), width: 300, height: 200 }),
    [seatIndex],
  );
  const upsell = upgradePrice(d.price);

  // Prefetch the VIP card's "view from the box" (same key/size as VipTicketCard) so the
  // Upgrade flip shows a finished render instead of a placeholder.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const shot = boxInsideShot(12);
      if (shot) void requestView({ key: 'box:12:inside', shot, width: 300, height: 200 });
    }, 900);
    return () => window.clearTimeout(t);
  }, []);

  const image = (
    <button
      type="button"
      onClick={() => void openSeatView()}
      aria-label="Your view: fly into the seat and see the view"
      className={`group relative block overflow-hidden ${imageBoxClass(compact)} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F26A21]`}
    >
      <ViewImage req={req} label={`Rendered view from Block ${d.block.id}, Row ${d.row}, Seat ${d.seat}`} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
      <ViewPill>Your view</ViewPill>
    </button>
  );

  const body = (
    <div className={`flex h-full flex-col ${compact ? 'gap-4' : 'justify-between'}`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <Label>{d.where}</Label>
          <HoldTimer />
        </div>
        <h2 className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.025em]">Block {d.block.id}</h2>
      </div>
      <div className="flex gap-8">
        <Pair label="ROW" value={String(d.row)} />
        <Pair label="SEAT" value={String(d.seat)} />
        <Pair label="GATE" value={d.gate} />
      </div>
      <div className={compact ? 'flex items-center gap-4' : 'flex flex-col items-start gap-1.5'}>
        {upsell > 0 && (
          <button
            type="button"
            onClick={showUpgrade}
            className="rounded-full px-4 py-2 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(242,106,33,0.7)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
            style={{ background: ACCENT }}
          >
            Upgrade · {formatUpsell(upsell, 'AED')}
          </button>
        )}
        <button
          type="button"
          onClick={checkoutStandard}
          className="px-1 text-[12.5px] font-medium underline-offset-2 transition-colors hover:text-[#16161a] hover:underline"
          style={{ color: MUTED }}
        >
          Keep my seat
        </button>
      </div>
    </div>
  );

  return (
    <TicketShell
      compact={compact}
      label={`Ticket: Block ${d.block.id}, Row ${d.row}, Seat ${d.seat}`}
      image={image}
      body={body}
      stub={<TicketStub id={`seat-${seatIndex}-${d.block.id}-${d.row}-${d.seat}`} price={d.price} compact={compact} />}
    />
  );
}
