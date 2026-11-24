'use client';
import { create } from 'zustand';
import type { Booking, Rect, Seat } from '@/types/cinema';
import { DEFAULT_SHOWTIME_ID } from '@/data/cinema';

/**
 * progress: 0 = 2D map fully shown (3D camera at the overhead pose aligned with the map)
 *           1 = camera seated at `cameraSeatId`.
 *   0.00 - CROSSFADE_END   2D map <-> 3D canvas crossfade (camera stays overhead)
 *   CROSSFADE_END - 1.00   camera flight overhead <-> seat eye
 * mode: 'map' (progress 0, map interactive), 'transition' (animating or scrubbing),
 *       'seat' (progress 1, seat view UI interactive).
 */
export const CROSSFADE_END = 0.15;

export type ViewMode = 'map' | 'transition' | 'seat';

interface BookingState {
  showtimeId: string;
  seats: Seat[];
  selectedSeatId: string | null;
  /** Seat the camera path currently targets (normally = selectedSeatId). */
  cameraSeatId: string | null;
  mode: ViewMode;
  progress: number;
  /** Bottom sheet expanded (extra info) in the seat view. */
  sheetExpanded: boolean;
  checkoutOpen: boolean;
  /** Viewport rect of the 2D map frame that MAP_WORLD_RECT is drawn into. */
  mapFrame: Rect | null;
  reducedMotion: boolean;
  /** 3D scene has rendered at least one frame. */
  sceneReady: boolean;
  lastBooking: Booking | null;

  setShowtime: (id: string, seats: Seat[]) => void;
  setSeats: (seats: Seat[]) => void;
  selectSeat: (id: string | null) => void;
  toggleSeat: (id: string) => void;
  setCameraSeat: (id: string | null) => void;
  setMode: (mode: ViewMode) => void;
  setProgress: (p: number) => void;
  setSheetExpanded: (v: boolean) => void;
  setCheckoutOpen: (v: boolean) => void;
  setMapFrame: (r: Rect | null) => void;
  setReducedMotion: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  setLastBooking: (b: Booking | null) => void;
}

export const useBooking = create<BookingState>((set, get) => ({
  showtimeId: DEFAULT_SHOWTIME_ID,
  seats: [],
  selectedSeatId: null,
  cameraSeatId: null,
  mode: 'map',
  progress: 0,
  sheetExpanded: false,
  checkoutOpen: false,
  mapFrame: null,
  reducedMotion: false,
  sceneReady: false,
  lastBooking: null,

  setShowtime: (id, seats) => set({ showtimeId: id, seats, selectedSeatId: null, cameraSeatId: null }),
  setSeats: (seats) => set({ seats }),
  selectSeat: (id) => set({ selectedSeatId: id, cameraSeatId: id ?? get().cameraSeatId }),
  toggleSeat: (id) => {
    const cur = get().selectedSeatId;
    if (cur === id) set({ selectedSeatId: null });
    else set({ selectedSeatId: id, cameraSeatId: id });
  },
  setCameraSeat: (id) => set({ cameraSeatId: id }),
  setMode: (mode) => set({ mode }),
  setProgress: (p) => set({ progress: Math.min(1, Math.max(0, p)) }),
  setSheetExpanded: (v) => set({ sheetExpanded: v }),
  setCheckoutOpen: (v) => set({ checkoutOpen: v }),
  setMapFrame: (r) => set({ mapFrame: r }),
  setReducedMotion: (v) => set({ reducedMotion: v }),
  setSceneReady: (v) => set({ sceneReady: v }),
  setLastBooking: (b) => set({ lastBooking: b }),
}));

/** Selector helpers */
export const selectSelectedSeat = (s: BookingState): Seat | null =>
  s.seats.find((x) => x.id === s.selectedSeatId) ?? null;
export const selectCameraSeat = (s: BookingState): Seat | null =>
  s.seats.find((x) => x.id === s.cameraSeatId) ?? null;
