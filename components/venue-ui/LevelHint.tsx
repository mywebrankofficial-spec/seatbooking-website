'use client';
/** Quiet guidance: aerial headline (bottom-left) and captions on the VIP levels (bottom-centre). */
import { AnimatePresence, motion } from 'framer-motion';
import { useStadium } from '@/store/stadium';
import { EASE, GLASS, INK, MUTED } from './ui-kit';

export function LevelHint({ compact }: { compact: boolean }) {
  const level = useStadium((s) => s.level);
  const transitioning = useStadium((s) => s.transitioning);
  const skyboxId = useStadium((s) => s.skyboxId);
  const hover = useStadium((s) => s.hover);
  const hoverPoint = useStadium((s) => s.hoverPoint);
  const reduced = useStadium((s) => s.reducedMotion);
  const touch = useStadium((s) => s.touchMode);

  // The docked hover card (phone sheet / keyboard) takes the same spot.
  const sheetUp = !!hover && (compact || !hoverPoint);
  const caption =
    level === 'skyboxes' ? 'Choose a skybox' : level === 'box' ? `Choose your seat in Skybox ${skyboxId ?? ''}` : null;
  const showCaption = !!caption && !transitioning && !sheetUp;
  const showHeadline = level === 'aerial' && !transitioning && !sheetUp;

  return (
    <>
      <AnimatePresence>
        {showHeadline && (
          <motion.div
            key="headline"
            className={`pointer-events-none fixed z-20 rounded-[20px] ${GLASS} ${
              compact ? 'inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] px-5 py-4' : 'bottom-8 left-8 px-6 py-5'
            }`}
            style={{ color: INK }}
            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 10 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <h1 className={`${compact ? 'text-[20px]' : 'text-[24px]'} font-semibold leading-tight tracking-[-0.025em]`}>
              Pick your stand
            </h1>
            <p className="mt-1 text-[13px] font-medium" style={{ color: MUTED }}>
              {touch || compact ? 'Tap a stand to see prices, tap again to dive in.' : 'Hover a stand to see prices, click to dive in.'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-20 flex justify-center sm:bottom-8">
        <AnimatePresence mode="wait">
          {showCaption && (
            <motion.p
              key={caption}
              role="status"
              className={`rounded-full px-4 py-2 text-[13px] font-medium ${GLASS}`}
              style={{ color: INK }}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : 6 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
