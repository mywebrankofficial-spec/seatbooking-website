'use client';
/**
 * All DOM UI over the stadium canvas: top bar + breadcrumbs, hover card, ticket (standard / VIP
 * flip), view card, level hints. Cards fade out while the camera flies (`transitioning`).
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStadium } from '@/store/stadium';
import { HoverCard } from './HoverCard';
import { TicketCard } from './TicketCard';
import { VipTicketCard } from './VipTicketCard';
import { ViewCard } from './ViewCard';
import { TopBar } from './TopBar';
import { LevelHint } from './LevelHint';
import { EASE, useCompact } from './ui-kit';

const HOLD_MS = 10 * 60 * 1000;

/** Start a 10-minute hold when a ticket appears (adopts a valid hold set elsewhere for the same seat). */
function useSeatHold(level: string, seatIndex: number | null) {
  const heldFor = useRef<number | null>(null);
  useEffect(() => {
    if (level !== 'ticket' || seatIndex === null) return;
    const { holdExpiresAt } = useStadium.getState();
    const valid = !!holdExpiresAt && Date.parse(holdExpiresAt) > Date.now();
    if (valid && (heldFor.current === null || heldFor.current === seatIndex)) {
      heldFor.current = seatIndex;
      return;
    }
    heldFor.current = seatIndex;
    useStadium.setState({ holdExpiresAt: new Date(Date.now() + HOLD_MS).toISOString() });
  }, [level, seatIndex]);
}

function TicketStage({ compact }: { compact: boolean }) {
  const level = useStadium((s) => s.level);
  const transitioning = useStadium((s) => s.transitioning);
  const seatIndex = useStadium((s) => s.seatIndex);
  const face = useStadium((s) => s.ticketFace);
  const skyboxId = useStadium((s) => s.skyboxId);
  const checkoutOpen = useStadium((s) => s.checkoutOpen);
  const reduced = useStadium((s) => s.reducedMotion);
  useSeatHold(level, seatIndex);

  const show = level === 'ticket' && !transitioning && !checkoutOpen && seatIndex !== null;

  const flip = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { rotateY: face === 'vip' ? -90 : 90, opacity: 0.6 },
        animate: { rotateY: 0, opacity: 1, transition: { duration: 0.32, ease: EASE } },
        exit: { rotateY: face === 'vip' ? -90 : 90, opacity: 0.6, transition: { duration: 0.2, ease: [0.55, 0, 1, 0.45] as const } },
      };

  return (
    <div
      className={`pointer-events-none fixed z-20 ${
        compact
          ? 'inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] flex justify-center'
          : 'inset-0 flex items-center justify-center px-6 pt-10'
      }`}
      style={{ perspective: 1600 }}
    >
      <AnimatePresence>
        {show && (
          <motion.div
            key="ticket"
            className={`pointer-events-auto ${compact ? 'w-full max-w-[520px]' : ''}`}
            initial={{ opacity: 0, y: reduced ? 0 : compact ? 40 : 16, scale: reduced || compact ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduced ? 0 : compact ? 40 : 10, scale: reduced || compact ? 1 : 0.98 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={face} {...flip} transition={{ duration: 0.25 }}>
                {face === 'vip' ? (
                  <VipTicketCard skyboxId={skyboxId ?? 12} compact={compact} />
                ) : (
                  <TicketCard seatIndex={seatIndex} compact={compact} />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewStage({ compact }: { compact: boolean }) {
  const level = useStadium((s) => s.level);
  const transitioning = useStadium((s) => s.transitioning);
  const checkoutOpen = useStadium((s) => s.checkoutOpen);
  const seatIndex = useStadium((s) => s.seatIndex);
  const skyboxId = useStadium((s) => s.skyboxId);
  const chair = useStadium((s) => s.chair);
  const reduced = useStadium((s) => s.reducedMotion);
  const kind = level === 'seatView' ? 'seat' : level === 'boxView' ? 'box' : null;
  const show = !!kind && !transitioning && !checkoutOpen && (kind === 'box' || seatIndex !== null);
  return (
    <AnimatePresence>
      {show && kind && (
        <ViewCard
          key={kind}
          kind={kind}
          seatIndex={seatIndex}
          skyboxId={skyboxId}
          chair={chair}
          compact={compact}
          reduced={reduced}
        />
      )}
    </AnimatePresence>
  );
}

export function StadiumOverlay() {
  const compact = useCompact();
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    void Promise.all([import('@/lib/stadium-nav'), import('@/lib/stadium-geometry')]).then(([nav, geo]) => {
      (window as unknown as Record<string, unknown>).__arena = { useStadium, nav, geo };
    });
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none text-[#16161a] antialiased">
      <TopBar compact={compact} />
      <LevelHint compact={compact} />
      <HoverCard />
      <TicketStage compact={compact} />
      <ViewStage compact={compact} />
    </div>
  );
}
