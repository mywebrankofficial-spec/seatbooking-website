'use client';
/** Text panels over the pinned stadium flythrough: one headline + line per stage, and a stage rail. */
import { AnimatePresence, motion } from 'framer-motion';
import { STAGES, useStadiumStage } from './stadium-flythrough-store';

export function StadiumFlythroughOverlay() {
  const stage = useStadiumStage();
  const copy = STAGES[stage];

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* legibility scrims */}
      <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-[#c9dbe8]/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-linear-to-t from-[#07111d]/75 via-[#07111d]/30 to-transparent" />

      <div
        className="absolute inset-x-6 bottom-[max(40px,calc(env(safe-area-inset-bottom)+24px))] md:inset-x-auto md:bottom-16 md:left-16 md:max-w-xl"
        aria-live="polite"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <h2 className="text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-white [text-shadow:0_2px_24px_rgba(4,12,22,0.35)] md:text-[60px]">
              {copy.title}
            </h2>
            <p className="mt-3 max-w-md text-pretty text-[16px] leading-relaxed text-white/80 md:mt-4 md:text-[18px]">
              {copy.line}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* stage rail */}
      <ol className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 md:right-10" aria-hidden>
        {STAGES.map((s, i) => (
          <li
            key={s.title}
            className={`w-1.5 rounded-full transition-all duration-500 ${
              i === stage ? 'h-6 bg-[#F26A21]' : 'h-1.5 bg-white/55'
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

export default StadiumFlythroughOverlay;
