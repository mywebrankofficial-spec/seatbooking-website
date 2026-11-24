'use client';
/** Live overlay on top of the pinned flythrough canvas: row label, zone and stat tiles. */
import { AnimatePresence, motion } from 'framer-motion';
import { useSyncExternalStore, type ReactNode } from 'react';
import { RECLINER_ROWS, blockOf, computeStats } from '@/lib/hall-geometry';
import { formatDegrees, formatSide, seatTypeLabel } from '@/lib/format';
import { AnimatedNumber } from './AnimatedNumber';
import {
  FLY_SEAT_NUMBER,
  INTRO_END,
  LANDING_ROWS,
  flythroughState,
  rowLetter,
  subscribeFlythrough,
  useActiveRowIndex,
} from './flythrough-store';

const SEATED_AT = INTRO_END * 0.7;
const getSeated = () => flythroughState.reduced || flythroughState.progress >= SEATED_AT;
const getServerSeated = () => false;

const fmtMetres = (v: number) => v.toFixed(1);
const fmtDegrees = (v: number) => formatDegrees(v).replace('°', '');

const swap = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

export function FlythroughOverlay() {
  const rowIdx = useActiveRowIndex();
  const seated = useSyncExternalStore(subscribeFlythrough, getSeated, getServerSeated);
  const row = rowLetter(rowIdx);
  const stats = computeStats({ row, number: FLY_SEAT_NUMBER, block: blockOf(FLY_SEAT_NUMBER) });
  const type = RECLINER_ROWS.includes(row) ? 'recliner' : 'standard';

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* legibility scrims */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/70 to-transparent" />
      <div className="absolute inset-y-0 left-0 hidden w-1/2 bg-linear-to-r from-black/50 to-transparent md:block" />
      <div className="absolute inset-x-0 top-0 h-28 bg-linear-to-b from-page to-transparent" />

      {/* intro hint */}
      <motion.p
        className="absolute inset-x-0 top-[14%] text-center text-[13px] font-medium tracking-wide text-fg-2"
        animate={{ opacity: seated ? 0 : 1, y: seated ? -8 : 0 }}
        transition={{ duration: 0.5 }}
      >
        Keep scrolling to take your seat
      </motion.p>

      {/* stats card: bottom card on mobile, bottom-left over the canvas on desktop */}
      <motion.div
        className="absolute inset-x-3 border border-white/6 bg-[rgba(22,22,26,0.72)] backdrop-blur-[18px] bottom-[max(12px,env(safe-area-inset-bottom))] rounded-card p-5 md:inset-x-auto md:bottom-12 md:left-12 md:w-105 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
        initial={false}
        animate={{ opacity: seated ? 1 : 0, y: seated ? 0 : 24 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        aria-live="polite"
      >
        <div className="relative h-4 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={stats.zone}
              {...swap}
              className="absolute inset-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent"
            >
              {stats.zone}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="mt-1 flex items-end justify-between gap-4 md:block">
          <h2 className="flex items-baseline gap-3 text-[34px] font-semibold leading-none tracking-[-0.03em] md:text-[72px]">
            <span>Row</span>
            <span className="relative inline-block w-[1ch] overflow-hidden pb-1 md:w-[0.9em]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={row} {...swap} className="inline-block">
                  {row}
                </motion.span>
              </AnimatePresence>
            </span>
          </h2>
          <p className="text-[13px] text-fg-2 md:mt-3 md:text-[15px]">
            Seat {FLY_SEAT_NUMBER} · {seatTypeLabel(type)}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 md:mt-7 md:gap-3">
          <Tile label="to screen">
            <AnimatedNumber value={stats.distance} format={fmtMetres} />
            <span className="ml-0.5 text-fg-2">m</span>
          </Tile>
          <Tile label="field of view">
            <AnimatedNumber value={stats.fov} format={fmtDegrees} />
            <span className="text-fg-2">°</span>
          </Tile>
          <Tile label={formatSide(stats.side)}>
            <AnimatedNumber value={stats.offset} format={fmtMetres} />
            <span className="ml-0.5 text-fg-2">m</span>
          </Tile>
        </div>
      </motion.div>

      {/* row rail (desktop) */}
      <ol
        className="absolute right-10 top-1/2 hidden -translate-y-1/2 flex-col items-center gap-2.5 md:flex"
        aria-hidden
      >
        {LANDING_ROWS.map((r, i) => (
          <li
            key={r}
            className={`text-[11px] font-medium tabular transition-all duration-500 ${
              i === rowIdx ? 'scale-125 text-accent' : 'text-fg-3'
            }`}
          >
            {r}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 md:border md:border-white/6 md:bg-[rgba(22,22,26,0.72)] md:px-4 md:py-4 md:backdrop-blur-[18px]">
      <div className="tabular text-[20px] font-semibold leading-none tracking-tight md:text-[26px]">{children}</div>
      <div className="mt-1.5 text-[11px] leading-tight text-fg-3 md:text-[12px]">{label}</div>
    </div>
  );
}

export default FlythroughOverlay;
