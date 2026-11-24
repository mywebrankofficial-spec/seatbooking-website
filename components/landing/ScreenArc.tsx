'use client';
/** Thin glowing screen arc (bright centre, fading ends) with soft light spilling below. Gently breathes. */
import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';

interface ScreenArcProps {
  className?: string;
  /** Show the tiny letter-spaced "SCREEN" caption. */
  caption?: boolean;
}

export function ScreenArc({ className, caption = false }: ScreenArcProps) {
  const reduce = useReducedMotion();
  const raw = useId();
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const stroke = `arc-stroke-${id}`;
  const blur = `arc-blur-${id}`;

  return (
    <div className={className} aria-hidden>
      <motion.div
        className="relative w-full"
        initial={{ opacity: 0.8 }}
        animate={reduce ? { opacity: 0.9 } : { opacity: [0.72, 1, 0.72] }}
        transition={reduce ? { duration: 0 } : { duration: 5.5, ease: 'easeInOut', repeat: Infinity }}
      >
        <svg viewBox="0 0 600 70" className="block h-auto w-full overflow-visible" fill="none">
          <defs>
            <linearGradient id={stroke} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id={blur} x="-20%" y="-200%" width="140%" height="500%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <path d="M 12 58 Q 300 0 588 58" stroke={`url(#${stroke})`} strokeWidth="6" filter={`url(#${blur})`} opacity="0.55" />
          <path d="M 12 58 Q 300 0 588 58" stroke={`url(#${stroke})`} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {/* soft grey light spilling down from the screen */}
        <div
          className="pointer-events-none absolute left-1/2 top-[45%] h-[220%] w-[80%] -translate-x-1/2"
          style={{
            background:
              'radial-gradient(ellipse 50% 45% at 50% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 55%, transparent 75%)',
          }}
        />
      </motion.div>
      {caption && (
        <p className="mt-3 text-center text-[9px] font-medium uppercase tracking-[0.5em] text-fg-3">Screen</p>
      )}
    </div>
  );
}

export default ScreenArc;
