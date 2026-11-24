'use client';
/** Top bar: round back button + breadcrumbs (left), event pill (right). */
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useStadium } from '@/store/stadium';
import { back } from '@/lib/stadium-nav';
import { STADIUM_EVENT } from '@/data/stadium/event';
import { Breadcrumbs } from './Breadcrumbs';
import { ACCENT, EASE, GLASS, INK, MUTED } from './ui-kit';

export function TopBar({ compact }: { compact: boolean }) {
  const level = useStadium((s) => s.level);
  const reduced = useStadium((s) => s.reducedMotion);
  const atTop = level === 'aerial';

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-3 px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5 sm:pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <AnimatePresence initial={false}>
          {!atTop && (
            <motion.button
              key="back"
              type="button"
              onClick={() => void back()}
              aria-label="Back"
              className={`pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95 ${GLASS}`}
              style={{ color: INK }}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.85 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              <ChevronLeft aria-hidden size={20} strokeWidth={2.2} />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.div
          layout={!reduced}
          transition={{ duration: 0.25, ease: EASE }}
          className={`pointer-events-auto flex h-10 min-w-0 items-center rounded-full ${compact ? 'px-4' : 'px-3'} ${GLASS}`}
        >
          <Breadcrumbs compact={compact} />
        </motion.div>
      </div>

      <div
        className={`pointer-events-auto flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-medium ${GLASS}`}
        style={{ color: INK }}
      >
        <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: ACCENT }} />
        <span className="font-semibold">{STADIUM_EVENT.title}</span>
        {!compact && (
          <>
            <span aria-hidden style={{ color: MUTED }}>
              ·
            </span>
            <span style={{ color: '#55555d' }}>{STADIUM_EVENT.dateLabel}</span>
          </>
        )}
        <span aria-hidden style={{ color: MUTED }}>
          ·
        </span>
        <span className="tabular-nums" style={{ color: '#55555d' }}>
          {STADIUM_EVENT.time}
        </span>
      </div>
    </header>
  );
}
