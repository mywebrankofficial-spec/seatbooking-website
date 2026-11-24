'use client';
import { memo, useId } from 'react';
import { motion } from 'framer-motion';
import { DEFAULT_LAYOUT, MAP_WORLD_RECT, mapScale, worldToMap } from '@/lib/hall-geometry';
import { usePrefersReducedMotion } from './motion';

interface ScreenArcProps {
  frameWidth: number;
}

const BREATHE = { duration: 4.8, repeat: Infinity, ease: 'easeInOut' } as const;

/**
 * Glowing screen line drawn at world z = 0. The 3D screen's edges curve towards the
 * audience by `screen.curve`, so in top-down view the arc's centre bows up (away).
 */
export const ScreenArc = memo(function ScreenArc({ frameWidth: W }: ScreenArcProps) {
  const reduced = usePrefersReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `seatmap-arc-grad-${uid}`;
  const blurId = `seatmap-arc-blur-${uid}`;

  const { screen } = DEFAULT_LAYOUT;
  const halfScreen = screen.width / 2;
  const k = screen.curve / (halfScreen * halfScreen); // parabola z = k x^2
  const halfFrame = (MAP_WORLD_RECT.maxX - MAP_WORLD_RECT.minX) / 2;
  const a = Math.min(halfScreen, halfFrame - 0.12);
  const endZ = k * a * a;

  const p0 = worldToMap(-a, endZ, W);
  const p1 = worldToMap(a, endZ, W);
  // A parabola is exactly a quadratic Bezier with its control point mirrored about the apex.
  const c = worldToMap(0, -endZ, W);
  const apex = worldToMap(0, 0, W);
  const d = `M ${p0.left} ${p0.top} Q ${c.left} ${c.top} ${p1.left} ${p1.top}`;

  const s = mapScale(W);
  const stroke = Math.max(1.5, s * 0.055);
  const labelTop = worldToMap(0, Math.max(0.5, endZ + 0.08), W).top;

  const breathe = reduced ? { opacity: 0.9 } : { opacity: [0.68, 1, 0.68] };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* soft light falling from the screen onto the hall */}
      <motion.div
        className="absolute"
        style={{
          left: W * 0.04,
          width: W * 0.92,
          top: apex.top,
          height: W * 0.5,
          background:
            'radial-gradient(55% 100% at 50% 0%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 42%, rgba(255,255,255,0) 78%)',
        }}
        initial={false}
        animate={breathe}
        transition={reduced ? undefined : { ...BREATHE, delay: 0.4 }}
      />

      <svg className="absolute top-0 left-0 overflow-visible" width={W} height={apex.top + endZ * s + 40}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="16%" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="38%" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#fff" stopOpacity="1" />
            <stop offset="62%" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="84%" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <filter id={blurId} x="-20%" y="-400%" width="140%" height="900%">
            <feGaussianBlur stdDeviation={Math.max(3, s * 0.14)} />
          </filter>
        </defs>
        <motion.g initial={false} animate={breathe} transition={reduced ? undefined : BREATHE}>
          <path
            d={d}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke * 4}
            strokeLinecap="round"
            filter={`url(#${blurId})`}
            opacity={0.55}
          />
        </motion.g>
        <path d={d} fill="none" stroke={`url(#${gradId})`} strokeWidth={stroke} strokeLinecap="round" />
      </svg>

      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 pl-[0.55em] text-[8.5px] leading-none font-medium tracking-[0.55em] text-fg-3 uppercase"
        style={{ left: apex.left, top: labelTop }}
      >
        Screen
      </span>
    </div>
  );
});
