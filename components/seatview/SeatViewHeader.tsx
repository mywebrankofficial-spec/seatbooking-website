'use client';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

export function SeatViewHeader({
  seatId,
  scrubAmount,
  reducedMotion,
  disabled,
  onBack,
}: {
  seatId: string;
  /** 0 seated .. 1 back at the map: the header fades out as the user scrubs away. */
  scrubAmount: MotionValue<number>;
  reducedMotion: boolean;
  disabled: boolean;
  onBack: () => void;
}) {
  const fade = useTransform(scrubAmount, [0, 0.45], [1, 0]);

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-[calc(env(safe-area-inset-top)+12px)]"
      initial={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -8, transition: { duration: reducedMotion ? 0.12 : 0.25 } }}
      transition={reducedMotion ? { duration: 0.15 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div className="relative flex h-10 items-center justify-center" style={{ opacity: fade }}>
        <motion.button
          type="button"
          onClick={onBack}
          disabled={disabled}
          aria-label="Back to seat map"
          whileTap={reducedMotion ? undefined : { scale: 0.92 }}
          className="glass pointer-events-auto absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden />
        </motion.button>

        <div className="glass flex h-9 items-center gap-2 rounded-full pl-3 pr-3.5 text-[14px] font-medium text-white">
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_1px_rgba(110,231,160,0.7)]"
            aria-hidden
          />
          <span className="tabular">View from {seatId}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
