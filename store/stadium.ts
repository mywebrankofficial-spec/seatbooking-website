'use client';
/**
 * Stadium booking state machine.
 *
 * Levels (camera shot per level, see lib/stadium-geometry.ts shots):
 *   aerial → stand → block → ticket            (seat picked; ticket card shown, camera rushed into the row)
 *                             ticket → seatView (view thumbnail clicked: eye-level view from the seat)
 *                             ticket(vip face) → skyboxes → box → boxView
 * `back()` (lib/stadium-nav.ts) always goes one level up.
 */
import { create } from 'zustand';
import type { StandId } from '@/lib/stadium-geometry';
import type { Vec3 } from '@/lib/venue-engine/types';
import type { StadiumAvailability } from '@/data/stadium/event';

export type StadiumLevel = 'aerial' | 'stand' | 'block' | 'ticket' | 'seatView' | 'skyboxes' | 'box' | 'boxView';

export type PickTarget =
  | { type: 'stand'; standId: StandId }
  | { type: 'block'; blockId: number }
  | { type: 'seat'; seatIndex: number }
  | { type: 'skybox'; skyboxId: number }
  | { type: 'chair'; skyboxId: number; chair: number };

export interface StadiumBooking {
  ref: string;
  eventId: string;
  kind: 'standard' | 'vip';
  /** Standard: "Block 232 · Row 10 · Seat 8"; VIP: "Skybox 12 · Seat 5". */
  label: string;
  standName: string;
  gate: string;
  blockId: number | null;
  row: number | null;
  seat: number | null;
  skyboxId: number | null;
  chair: number | null;
  price: number;
  name: string;
  email: string;
  createdAt: string;
}

interface StadiumState {
  eventId: string;
  availability: StadiumAvailability | null;
  level: StadiumLevel;
  /** A camera flight is running (cards fade, input ignored). */
  transitioning: boolean;

  standId: StandId | null;
  blockId: number | null;
  seatIndex: number | null;
  /** Which face of the ticket card is showing. */
  ticketFace: 'standard' | 'vip';
  skyboxId: number | null;
  chair: number | null;

  hover: PickTarget | null;
  /** World point the hover card follows. */
  hoverPoint: Vec3 | null;

  checkoutOpen: boolean;
  /** What is being checked out. */
  checkoutKind: 'standard' | 'vip';
  holdExpiresAt: string | null;
  lastBooking: StadiumBooking | null;
  reducedMotion: boolean;
  /** Hover is not available (touch): first tap previews, second selects. */
  touchMode: boolean;
}

export const useStadium = create<StadiumState>(() => ({
  eventId: 'city-derby',
  availability: null,
  level: 'aerial',
  transitioning: false,
  standId: null,
  blockId: null,
  seatIndex: null,
  ticketFace: 'standard',
  skyboxId: null,
  chair: null,
  hover: null,
  hoverPoint: null,
  checkoutOpen: false,
  checkoutKind: 'standard',
  holdExpiresAt: null,
  lastBooking: null,
  reducedMotion: false,
  touchMode: false,
}));

export function sameTarget(a: PickTarget | null, b: PickTarget | null): boolean {
  if (!a || !b || a.type !== b.type) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
