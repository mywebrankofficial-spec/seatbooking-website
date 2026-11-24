'use client';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import type { SeatViewStats } from '@/types/cinema';
import { formatDegrees, formatMetres, formatSide } from '@/lib/format';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Number that tweens to new values without re-rendering React per frame. */
export function AnimatedNumber({
  value,
  format,
  reducedMotion,
}: {
  value: number;
  format: (v: number) => string;
  reducedMotion: boolean;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (reducedMotion) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.7, ease: EASE });
    return () => controls.stop();
  }, [mv, value, reducedMotion]);

  return <motion.span aria-hidden>{text}</motion.span>;
}

function Tile({ value, caption, label }: { value: ReactNode; caption: string; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#1d1d21] px-3.5 pb-3 pt-3.5">
      <div className="tabular truncate text-[21px] font-semibold leading-none tracking-[-0.02em] text-white">
        {value}
      </div>
      <div className="mt-1.5 truncate text-[12px] leading-tight text-fg-2" aria-hidden>
        {caption}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function StatTiles({
  stats,
  reducedMotion,
  className = '',
}: {
  stats: SeatViewStats;
  reducedMotion: boolean;
  className?: string;
}) {
  const centre = stats.side === 'centre';
  return (
    <div className={`grid grid-cols-3 gap-2.5 ${className}`}>
      <Tile
        value={<AnimatedNumber value={stats.distance} format={formatMetres} reducedMotion={reducedMotion} />}
        caption="to screen"
        label={`${formatMetres(stats.distance)} to screen`}
      />
      <Tile
        value={<AnimatedNumber value={stats.fov} format={formatDegrees} reducedMotion={reducedMotion} />}
        caption="field of view"
        label={`${formatDegrees(stats.fov)} field of view`}
      />
      <Tile
        value={
          centre ? (
            <span aria-hidden>Centre</span>
          ) : (
            <AnimatedNumber value={stats.offset} format={formatMetres} reducedMotion={reducedMotion} />
          )
        }
        caption={centre ? 'of the row' : formatSide(stats.side)}
        label={centre ? 'Centre of the row' : `${formatMetres(stats.offset)} ${formatSide(stats.side)}`}
      />
    </div>
  );
}
