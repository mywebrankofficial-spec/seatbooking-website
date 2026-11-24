'use client';
import { memo } from 'react';
import { motion } from 'framer-motion';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** Row height of one digit, in em (a touch taller than 1em so nothing clips). */
const LINE = 1.15;

interface RollingNumberProps {
  /** Already formatted value, e.g. "€12.50". Digits roll, other characters stay put. */
  value: string;
  reducedMotion?: boolean;
  className?: string;
}

/** Odometer-style text: each digit is a vertical strip of 0-9 that rolls to its value. */
export const RollingNumber = memo(function RollingNumber({ value, reducedMotion, className }: RollingNumberProps) {
  const chars = value.split('');
  return (
    <span className={`tabular relative inline-flex ${className ?? ''}`} style={{ lineHeight: `${LINE}em` }}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          // Key from the right so decimals stay matched when the length changes.
          const key = chars.length - i;
          const d = DIGITS.indexOf(ch);
          if (d < 0) {
            return (
              <span key={`c${key}`} className="inline-block">
                {ch}
              </span>
            );
          }
          return (
            <span
              key={`d${key}`}
              className="relative inline-block overflow-hidden"
              style={{ height: `${LINE}em` }}
            >
              <span className="invisible">0</span>
              <motion.span
                className="absolute top-0 left-0 flex flex-col"
                initial={false}
                animate={{ y: `${-d * LINE}em` }}
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 210, damping: 26, mass: 0.9 }}
              >
                {DIGITS.map((n) => (
                  <span key={n} style={{ height: `${LINE}em` }}>
                    {n}
                  </span>
                ))}
              </motion.span>
            </span>
          );
        })}
      </span>
    </span>
  );
});
