'use client';
/**
 * Mini map thumbnail: the same top-down projection as the 2D seat map
 * (worldToMap / seatMapPosition) rescaled into a small 84x64 box. The axes are
 * scaled independently so the wide hall fits the landscape thumbnail; dots are
 * computed in pixel space so they stay round.
 */
import { motion } from 'framer-motion';
import { memo, useId, useMemo } from 'react';
import type { Seat } from '@/types/cinema';
import { DEFAULT_LAYOUT, seatMapPosition, worldToMap } from '@/lib/hall-geometry';

const W = 84;
const H = 64;
const FRAME = 100; // reference frame width handed to worldToMap

// World window shown in the thumbnail (metres): a little wider than the screen, screen -> back row.
const X0 = -(DEFAULT_LAYOUT.screen.width / 2 + 0.4);
const X1 = -X0;
const Z0 = -0.5;
const Z1 = DEFAULT_LAYOUT.firstRowDistance + (DEFAULT_LAYOUT.rows.length - 1) * DEFAULT_LAYOUT.rowPitch + 0.45;
const PAD_X = 4;
const PAD_Y = 4;

const a = worldToMap(X0, Z0, FRAME);
const b = worldToMap(X1, Z1, FRAME);
const kx = (W - 2 * PAD_X) / (b.left - a.left);
const ky = (H - 2 * PAD_Y) / (b.top - a.top);

function toThumb(px: { left: number; top: number }) {
  return { x: PAD_X + (px.left - a.left) * kx, y: PAD_Y + (px.top - a.top) * ky };
}

export function seatThumbPosition(seat: Pick<Seat, 'row' | 'number'>) {
  return toThumb(seatMapPosition(seat, FRAME));
}

const screenArc = (() => {
  const half = DEFAULT_LAYOUT.screen.width / 2;
  const l = toThumb(worldToMap(-half * 0.82, DEFAULT_LAYOUT.screen.curve, FRAME));
  const r = toThumb(worldToMap(half * 0.82, DEFAULT_LAYOUT.screen.curve, FRAME));
  const c = toThumb(worldToMap(0, -DEFAULT_LAYOUT.screen.curve * 0.9, FRAME));
  return `M ${l.x.toFixed(2)} ${l.y.toFixed(2)} Q ${c.x.toFixed(2)} ${c.y.toFixed(2)} ${r.x.toFixed(2)} ${r.y.toFixed(2)}`;
})();

const SeatDots = memo(function SeatDots({ seats }: { seats: readonly Seat[] }) {
  return (
    <g>
      {seats.map((s) => {
        const p = seatThumbPosition(s);
        const taken = s.status === 'taken';
        const fill =
          s.type === 'recliner'
            ? taken
              ? 'rgba(122,46,58,0.35)'
              : 'rgba(150,58,72,0.95)'
            : taken
              ? 'rgba(255,255,255,0.09)'
              : 'rgba(255,255,255,0.3)';
        return <circle key={s.id} cx={p.x} cy={p.y} r={1.25} fill={fill} />;
      })}
    </g>
  );
});

export function MiniMap({
  seats,
  activeSeat,
  reducedMotion,
}: {
  seats: readonly Seat[];
  activeSeat: Pick<Seat, 'id' | 'row' | 'number'>;
  reducedMotion: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const pos = useMemo(() => seatThumbPosition(activeSeat), [activeSeat]);
  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 220, damping: 30, mass: 0.9 };

  return (
    <div
      className="relative h-16 w-[84px] shrink-0 overflow-hidden rounded-xl bg-white/[0.035] ring-1 ring-inset ring-white/[0.06]"
      aria-hidden
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
        <defs>
          <linearGradient id={`arc-${uid}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
        </defs>
        <path d={screenArc} fill="none" stroke={`url(#arc-${uid})`} strokeWidth={1.2} strokeLinecap="round" />
        <SeatDots seats={seats} />
        <motion.circle
          r={4.2}
          fill="#6ee7a0"
          opacity={0.55}
          filter={`url(#glow-${uid})`}
          initial={false}
          animate={{ cx: pos.x, cy: pos.y }}
          transition={transition}
        />
        <motion.circle
          r={1.9}
          fill="#6ee7a0"
          initial={false}
          animate={{ cx: pos.x, cy: pos.y }}
          transition={transition}
        />
      </svg>
    </div>
  );
}
