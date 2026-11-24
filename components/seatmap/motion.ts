'use client';
import { useReducedMotion } from 'framer-motion';
import { useBooking } from '@/store/booking';

/** Apple-like ease-out used across the seat map (matches --ease-premium). */
export const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

/** Seat palette (mirrors the theme tokens in app/globals.css). */
export const SEAT_COLORS = {
  available: '#2a2a2e',
  recliner: '#7a2e3a',
  selected: '#6ee7a0',
  takenBorder: 'rgba(255,255,255,0.22)',
  selectedText: '#0b0b0c',
} as const;

/** True when the user prefers reduced motion (OS setting or store flag). */
export function usePrefersReducedMotion(): boolean {
  const os = useReducedMotion();
  const store = useBooking((s) => s.reducedMotion);
  return Boolean(os) || store;
}
