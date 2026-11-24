'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { selectSelectedSeat, useBooking } from '@/store/booking';
import { formatPrice } from '@/lib/format';
import { RollingNumber } from './RollingNumber';
import { EASE_PREMIUM, usePrefersReducedMotion } from './motion';

interface BottomBarProps {
  onContinue: () => void;
}

export function BottomBar({ onContinue }: BottomBarProps) {
  const seat = useBooking(selectSelectedSeat);
  const reduced = usePrefersReducedMotion();
  const enabled = seat !== null;

  const label = seat ? `Row ${seat.row} · Seat ${seat.number}` : 'Choose your seat';
  const fade = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
      };

  return (
    <div className="shrink-0 px-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div
        className="flex items-center justify-between gap-4 rounded-[24px] border border-white/[0.06] bg-[#18181c] py-3.5 pr-3.5 pl-5"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 -12px 32px rgba(0,0,0,0.35)' }}
      >
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic="true">
          <div className="relative h-4 overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.p
                key={label}
                className="absolute inset-0 truncate text-[12px] leading-4 text-fg-3"
                transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                {...fade}
              >
                {label}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="relative mt-0.5 h-7">
            <AnimatePresence initial={false}>
              {seat ? (
                <motion.div
                  key="price"
                  className="absolute inset-0 flex items-center text-[20px] font-bold tracking-[-0.01em] text-white"
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                  {...fade}
                >
                  <RollingNumber value={formatPrice(seat.price)} reducedMotion={reduced} />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  className="absolute inset-0 flex items-center text-[20px] font-bold text-white"
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                  {...fade}
                >
                  <span aria-hidden>—</span>
                  <span className="sr-only">No seat selected</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.button
          type="button"
          disabled={!enabled}
          onClick={() => enabled && onContinue()}
          className="h-12 shrink-0 rounded-full px-7 text-[15px] font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 disabled:cursor-default"
          initial={false}
          animate={{
            backgroundColor: enabled ? '#6ee7a0' : '#2a2a2e',
            color: enabled ? '#0b0b0c' : 'rgba(255,255,255,0.32)',
            boxShadow: enabled ? '0 6px 22px rgba(110,231,160,0.22)' : '0 6px 22px rgba(110,231,160,0)',
          }}
          whileTap={enabled && !reduced ? { scale: 0.96 } : undefined}
          transition={{ duration: 0.35, ease: EASE_PREMIUM }}
        >
          Continue
        </motion.button>
      </div>
    </div>
  );
}
