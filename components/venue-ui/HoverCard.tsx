'use client';
/**
 * Floating preview card that follows the hovered 3D object (stand / block / seat / skybox / chair).
 * Desktop: anchored to `hoverAnchor` (flips near screen edges), 150 ms fade + 8 px rise,
 * content cross-fades per target, prices roll. Compact (phone/touch): a bottom sheet with
 * "Tap again to select".
 */
import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useAnimate } from 'framer-motion';
import { useStadium, type PickTarget, type StadiumLevel } from '@/store/stadium';
import { hoverAnchor, selectBlock, selectChair, selectSeat, selectStand, enterSkybox, useNavSignals } from '@/lib/stadium-nav';
import { useAnchorPosition, type ScreenAnchor } from '@/lib/venue-engine/anchor';
import { STAND_BY_ID, getStadiumLayout, seatEyeShot, TIERS } from '@/lib/stadium-geometry';
import { SKYBOX_SEAT_PRICE, VIP_LEVEL_LABEL, blockPrice, type StadiumAvailability } from '@/data/stadium/event';
import type { ViewRequest } from '@/lib/view-render';
import { ACCENT, EASE, GLASS, INK, Label, PRICE, RollingNumber, Status, ViewImage, describeSeat, useCompact } from './ui-kit';

/** Which hover target type each level previews. */
const LEVEL_TARGET: Partial<Record<StadiumLevel, PickTarget['type']>> = {
  aerial: 'stand',
  stand: 'block',
  block: 'seat',
  skyboxes: 'skybox',
  box: 'chair',
};

function targetKey(t: PickTarget): string {
  switch (t.type) {
    case 'stand':
      return `stand:${t.standId}`;
    case 'block':
      return `block:${t.blockId}`;
    case 'seat':
      return `seat:${t.seatIndex}`;
    case 'skybox':
      return `skybox:${t.skyboxId}`;
    case 'chair':
      return `chair:${t.skyboxId}:${t.chair}`;
  }
}

interface HoverModel {
  key: string;
  label: string;
  title: string;
  /** null = no status line */
  status: { ok: boolean; text: string } | null;
  price: number | null;
  /** Available to select. */
  selectable: boolean;
  seatIndex: number | null;
  select: () => void;
}

function model(t: PickTarget, av: StadiumAvailability | null): HoverModel {
  const L = getStadiumLayout();
  const key = targetKey(t);
  switch (t.type) {
    case 'stand': {
      const left = av?.standLeft[t.standId] ?? null;
      return {
        key,
        label: 'FROM',
        title: STAND_BY_ID[t.standId].name,
        status: left === null ? null : left > 0 ? { ok: true, text: `${left} left` } : { ok: false, text: 'Sold out' },
        price: av?.standFromPrice[t.standId] ?? null,
        selectable: true,
        seatIndex: null,
        select: () => void selectStand(t.standId),
      };
    }
    case 'block': {
      const b = L.blockById.get(t.blockId);
      const left = b && av ? av.blockLeft[b.index] : null;
      return {
        key,
        label: b ? TIERS[b.tier - 1].label : '',
        title: `Block ${t.blockId}`,
        status: left === null ? null : left > 0 ? { ok: true, text: `${left} left` } : { ok: false, text: 'Sold out' },
        price: b ? blockPrice(b) : null,
        selectable: left !== 0,
        seatIndex: null,
        select: () => void selectBlock(t.blockId),
      };
    }
    case 'seat': {
      const d = describeSeat(t.seatIndex);
      const ok = av ? av.seatAvailable[t.seatIndex] === 1 : true;
      return ok
        ? {
            key,
            label: `BLOCK ${d.block.id}`,
            title: `Row ${d.row} · Seat ${d.seat}`,
            status: null,
            price: d.price,
            selectable: true,
            seatIndex: t.seatIndex,
            select: () => void selectSeat(t.seatIndex),
          }
        : {
            key,
            label: `ROW ${d.row} · SEAT ${d.seat}`,
            title: 'Taken',
            status: null,
            price: null,
            selectable: false,
            seatIndex: null,
            select: () => {},
          };
    }
    case 'skybox': {
      const ok = av ? av.skyboxAvailable[t.skyboxId] !== false : true;
      return {
        key,
        label: VIP_LEVEL_LABEL,
        title: `Skybox ${t.skyboxId}`,
        status: ok ? { ok: true, text: 'Available' } : { ok: false, text: 'Sold out' },
        price: SKYBOX_SEAT_PRICE,
        selectable: ok,
        seatIndex: null,
        select: () => void enterSkybox(t.skyboxId),
      };
    }
    case 'chair': {
      const ok = av ? av.chairAvailable[t.skyboxId]?.[t.chair - 1] !== false : true;
      return {
        key,
        label: `SKYBOX ${t.skyboxId}`,
        title: `Seat ${t.chair}`,
        status: ok ? { ok: true, text: 'Available' } : { ok: false, text: 'Taken' },
        price: ok ? SKYBOX_SEAT_PRICE : null,
        selectable: ok,
        seatIndex: null,
        select: () => void selectChair(t.chair),
      };
    }
  }
}

/* ------------------------------------------------------------------ */

function SeatThumb({ seatIndex }: { seatIndex: number }) {
  const req = useMemo<ViewRequest>(
    () => ({ key: `seat:${seatIndex}`, shot: seatEyeShot(seatIndex), width: 96, height: 60 }),
    [seatIndex],
  );
  return <ViewImage req={req} label="Rendered view from this seat" className="h-[60px] w-[96px] shrink-0 rounded-[10px]" />;
}

function Content({ m, prevPrice }: { m: HoverModel; prevPrice: number | null }) {
  return (
    <div className="flex items-center gap-3.5 py-3 pl-3.5 pr-4">
      {m.seatIndex !== null && <SeatThumb seatIndex={m.seatIndex} />}
      <div className={`min-w-0 flex-1 ${m.seatIndex === null ? 'pl-0.5' : ''}`}>
        <Label>{m.label}</Label>
        <div
          className="mt-1.5 whitespace-nowrap text-[15.5px] font-semibold leading-tight tracking-[-0.01em]"
          style={{ color: m.title === 'Taken' ? '#5b5b63' : INK }}
        >
          {m.title}
        </div>
        {m.status && <Status className="mt-1.5" ok={m.status.ok} text={m.status.text} />}
      </div>
      <div aria-hidden className="w-px self-stretch bg-[#16161a]/[0.09]" />
      <div className="min-w-[52px]">
        <Label>AED</Label>
        <div className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em]" style={{ color: m.price === null ? '#b4b4bb' : PRICE }}>
          <RollingNumber value={m.price} from={prevPrice} />
        </div>
      </div>
    </div>
  );
}

/** Edge-aware placement: above/right of the point; flips left/below near edges. */
function place(a: ScreenAnchor, el: HTMLElement) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const W = a.width || window.innerWidth;
  const H = a.height || window.innerHeight;
  let x = a.x + 22;
  let y = a.y - h - 18;
  if (x + w > W - 16) x = a.x - w - 22;
  if (y < 76) y = a.y + 26;
  x = Math.max(16, Math.min(W - w - 16, x));
  y = Math.max(76, Math.min(H - h - 16, y));
  return { x, y };
}

export function HoverCard() {
  const hover = useStadium((s) => s.hover);
  const hoverPoint = useStadium((s) => s.hoverPoint);
  const level = useStadium((s) => s.level);
  const transitioning = useStadium((s) => s.transitioning);
  const availability = useStadium((s) => s.availability);
  const checkoutOpen = useStadium((s) => s.checkoutOpen);
  const reduced = useStadium((s) => s.reducedMotion);
  const compact = useCompact();

  const relevant = hover && LEVEL_TARGET[level] === hover.type ? hover : null;
  const m = relevant ? model(relevant, availability) : null;
  const show = !!m && !transitioning && !checkoutOpen;

  // Keep the last model while fading out so content doesn't vanish mid-fade.
  const lastRef = useRef<HoverModel | null>(null);
  const prevPriceRef = useRef<{ key: string; price: number | null; prev: number | null }>({ key: '', price: null, prev: null });
  if (m) {
    if (prevPriceRef.current.key !== m.key) {
      prevPriceRef.current = { key: m.key, price: m.price, prev: prevPriceRef.current.price };
    }
    lastRef.current = m;
  }
  const shown = m ?? lastRef.current;
  const prevPrice = prevPriceRef.current.prev;

  // Rejected selection (sold-out block, taken seat, sold-out box, taken chair): gentle shake.
  // Driven by the nav's rejection signal (mouse, tap, keyboard Enter and wheel all funnel there).
  const [scope, animate] = useAnimate();
  const rejectedAt = useNavSignals((s) => s.rejected?.at ?? 0);
  useEffect(() => {
    if (!rejectedAt || reduced || !scope.current) return;
    animate(scope.current, { x: [0, -7, 7, -5, 5, -2, 0] }, { duration: 0.42, ease: 'easeInOut' });
  }, [rejectedAt, reduced, animate, scope]);

  // Desktop anchored card.
  const anchorRef = useRef<HTMLDivElement>(null);
  useAnchorPosition(hoverAnchor, anchorRef, place);
  // Re-place when the card's size changes (content swap without pointer movement).
  useEffect(() => {
    const el = anchorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => hoverAnchor.notify());
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);

  const docked = compact || !hoverPoint; // keyboard hover has no world point: dock at the bottom.

  const card = shown && (
    <div ref={scope} className={`relative overflow-hidden rounded-[18px] ${GLASS}`} style={{ color: INK }}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={shown.key}
          initial={{ opacity: 0, y: reduced ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -4 }}
          transition={{ duration: 0.16, ease: EASE }}
        >
          <Content m={shown} prevPrice={prevPrice} />
          {compact && (
            <div className="flex items-center justify-between gap-3 border-t border-[#16161a]/[0.07] px-4 py-2.5">
              <span className="text-[12.5px] font-medium" style={{ color: shown.selectable ? '#5b5b63' : '#a0a0a8' }}>
                {shown.selectable ? 'Tap again to select' : 'Not available'}
              </span>
              {shown.selectable && (
                <button
                  type="button"
                  onClick={shown.select}
                  className="pointer-events-auto rounded-full px-4 py-1.5 text-[13px] font-semibold text-white active:scale-[0.97]"
                  style={{ background: ACCENT }}
                  aria-label={`Select ${shown.title}`}
                >
                  Select
                </button>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return (
    <>
      {/* Anchored (desktop pointer) */}
      <div
        ref={anchorRef}
        className="pointer-events-none fixed left-0 top-0 z-30"
        style={{ display: docked ? 'none' : undefined }}
      >
        <motion.div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          initial={false}
          animate={show && !docked ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 8 }}
          transition={{ duration: 0.15, ease: EASE }}
        >
          {!docked && card}
        </motion.div>
      </div>

      {/* Docked (phone bottom sheet / keyboard) */}
      <div
        className={`pointer-events-none fixed z-30 ${
          compact ? 'inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))]' : 'bottom-8 left-1/2 -translate-x-1/2'
        }`}
      >
        <AnimatePresence>
          {docked && show && (
            <motion.div
              key="docked"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              initial={{ opacity: 0, y: reduced ? 0 : compact ? 24 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : compact ? 24 : 8 }}
              transition={{ duration: compact ? 0.28 : 0.15, ease: EASE }}
            >
              {card}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
