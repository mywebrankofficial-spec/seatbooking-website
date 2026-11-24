'use client';
/**
 * Integration layer (owned by the orchestrator). Stacks the four layers of the
 * booking flow inside the phone-sized column:
 *   1. 3D hall canvas  (fades in over progress 0 -> CROSSFADE_END)
 *   2. 2D seat map     (fades out over the same range, interactive only in 'map' mode)
 *   3. Seat view overlay (header pill + bottom sheet, owns its own visibility)
 *   4. Checkout sheet
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cinema, Seat, Showtime } from '@/types/cinema';
import { CROSSFADE_END, useBooking } from '@/store/booking';
import { generateSeats } from '@/data/cinema';
import { SeatMapScreen } from '@/components/seatmap/SeatMapScreen';
import { SeatViewOverlay } from '@/components/seatview/SeatViewOverlay';
import { CheckoutSheet } from '@/components/booking/CheckoutSheet';
import { enterSeat } from '@/lib/transitions';

/** Pause between picking a seat and flying into it. */
const AUTO_ENTER_DELAY_MS = 550;

const HallCanvas = dynamic(() => import('@/components/three/HallCanvas'), { ssr: false });

interface Props {
  cinema: Cinema;
  showtimes: Showtime[];
  showtimeId: string;
  seats: Seat[];
}

export function BookingExperience({ cinema, showtimes, showtimeId, seats }: Props) {
  // Hydrate the store synchronously before any child subscribes, so the very first
  // paint (and SSR) already has seats. Keeps the selection when returning to the same show.
  const hydrated = useRef(false);
  if (!hydrated.current) {
    hydrated.current = true;
    const st = useBooking.getState();
    if (st.showtimeId !== showtimeId || st.seats.length === 0) {
      useBooking.setState({ showtimeId, seats, selectedSeatId: null, cameraSeatId: null });
    }
    useBooking.setState({ mode: 'map', progress: 0, checkoutOpen: false, sheetExpanded: false });
  }

  const progress = useBooking((s) => s.progress);
  const mode = useBooking((s) => s.mode);
  const [load3D, setLoad3D] = useState(false);

  // Reduced motion preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => useBooking.getState().setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Show the 2D map instantly; preload the 3D scene right after first paint.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setLoad3D(true), { timeout: 600 });
    else setTimeout(() => setLoad3D(true), 200);
  }, []);

  const onShowtimeChange = useCallback((id: string) => {
    useBooking.getState().setShowtime(id, generateSeats(id));
    window.history.replaceState(null, '', `/book/${id}`);
  }, []);

  // Picking a seat on the map goes straight into the view from that seat: a short beat
  // so the seat visibly turns green (halo + price roll), then the camera flies in.
  // Tapping another seat during the beat retargets; deselecting cancels.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useBooking.subscribe((s, prev) => {
      if (s.selectedSeatId === prev.selectedSeatId) return;
      if (timer) clearTimeout(timer);
      timer = null;
      const id = s.selectedSeatId;
      if (!id || s.mode !== 'map') return;
      timer = setTimeout(() => {
        timer = null;
        const st = useBooking.getState();
        if (st.mode === 'map' && st.selectedSeatId === id) void enterSeat(id);
      }, AUTO_ENTER_DELAY_MS);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const onContinue = useCallback(() => {
    const id = useBooking.getState().selectedSeatId;
    if (id) void enterSeat(id);
  }, []);

  const t = Math.min(1, progress / CROSSFADE_END);

  return (
    <main className="app-column h-[100dvh] overflow-hidden">
      {/* The 3D hall fills the whole window (on desktop too), not just the phone column.
          CameraRig converts the map frame rect to canvas coordinates, so the overhead
          view still lands exactly on the 2D map. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ opacity: t, visibility: t > 0 ? 'visible' : 'hidden' }}
        aria-hidden={mode === 'map'}
      >
        {load3D && <HallCanvas className="h-full w-full" />}
      </div>

      <div
        className="absolute inset-0 origin-center"
        style={{
          opacity: 1 - t,
          transform: `scale(${1 + 0.025 * t})`,
          pointerEvents: mode === 'map' ? 'auto' : 'none',
          visibility: t < 1 ? 'visible' : 'hidden',
        }}
        aria-hidden={mode !== 'map'}
      >
        <SeatMapScreen
          cinema={cinema}
          showtimes={showtimes}
          onShowtimeChange={onShowtimeChange}
          onContinue={onContinue}
        />
      </div>

      <SeatViewOverlay />
      <CheckoutSheet />
    </main>
  );
}
