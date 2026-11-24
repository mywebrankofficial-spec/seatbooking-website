/** Venue-agnostic types shared by the cinema and the stadium. */
import type { Vec3 } from '@/types/cinema';
import type { Currency } from './money';

export type { Vec3 };

/** A camera framing: where the camera is, what it looks at, and its vertical fov (deg). */
export interface Shot {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/** A bookable seat in any venue. */
export interface VenueSeatRef {
  venue: 'cinema' | 'stadium';
  id: string;
  label: string; // "Row 10 · Seat 8"
  price: number;
  currency: Currency;
}

/** A group of seats (stand, block, hall row block...). */
export interface VenueSection {
  id: string;
  name: string;
  seatsLeft: number;
  fromPrice: number;
  currency: Currency;
}

export interface VenueDef {
  id: string;
  name: string;
  currency: Currency;
}

/** Generic drill-down level name (each venue defines its own union). */
export type ZoomLevel = string;
