'use client';
import { motion } from 'framer-motion';
import type { Showtime } from '@/types/cinema';
import { useBooking } from '@/store/booking';
import { usePrefersReducedMotion } from './motion';

interface ShowtimePillsProps {
  showtimes: Showtime[];
  onShowtimeChange: (id: string) => void;
}

export function ShowtimePills({ showtimes, onShowtimeChange }: ShowtimePillsProps) {
  const activeId = useBooking((s) => s.showtimeId);
  const reduced = usePrefersReducedMotion();

  return (
    <div className="shrink-0 px-4 pt-1 pb-2">
      <div
        role="group"
        aria-label="Showtimes"
        className="mx-auto flex w-full max-w-86 rounded-full border border-white/4 bg-surface p-1"
      >
        {showtimes.map((st) => {
          const active = st.id === activeId;
          return (
            <button
              key={st.id}
              type="button"
              aria-pressed={active}
              aria-label={`${st.time}, ${st.format}`}
              onClick={() => {
                if (!active) onShowtimeChange(st.id);
              }}
              className={[
                'relative flex h-9 flex-1 touch-manipulation items-center justify-center rounded-full outline-none',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70',
                active ? '' : 'cursor-pointer',
              ].join(' ')}
            >
              {active && (
                <motion.span
                  layoutId="seatmap-showtime-highlight"
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-white"
                  style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.35)' }}
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative flex items-baseline gap-1.5">
              <span
                className={`tabular relative text-[13px] leading-none font-semibold transition-colors duration-300 ${
                  active ? 'text-[#0b0b0c]' : 'text-white/85'
                }`}
              >
                {st.time}
              </span>
              <span
                className={`relative text-[12px] leading-none font-semibold tracking-[0.06em] transition-colors duration-300 [font-variant-caps:all-small-caps] ${
                  active ? 'text-[#0b0b0c]/60' : 'text-fg-3'
                }`}
              >
                {st.format}
              </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
