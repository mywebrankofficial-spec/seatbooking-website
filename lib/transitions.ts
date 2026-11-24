/**
 * STUB — owned by the Camera & Motion agent, who replaces this file.
 * Public API (keep these exact signatures):
 */
import { useBooking } from '@/store/booking';

/** Map -> overhead 3D -> fly down into `seatId`. Resolves when seated (mode 'seat'). */
export async function enterSeat(seatId: string): Promise<void> {
  useBooking.setState({ cameraSeatId: seatId, progress: 1, mode: 'seat' });
}

/** Seat -> rise to overhead -> crossfade to 2D map. Resolves when mode is 'map'. */
export async function exitToMap(): Promise<void> {
  useBooking.setState({ progress: 0, mode: 'map', sheetExpanded: false });
}

/** While seated: glide the camera to another seat (neighbour in row / row in front or behind). */
export async function moveToSeat(seatId: string): Promise<void> {
  useBooking.setState({ selectedSeatId: seatId, cameraSeatId: seatId });
}

/** Begin a user-driven scrub (sheet drag / scroll). Kills running tweens. */
export function startScrub(): void {}

/** amount: 0 = seated, 1 = fully back at the map. */
export function scrubTo(amount: number): void {
  useBooking.setState({ progress: 1 - amount, mode: 'transition' });
}

/** Release the scrub. Past 50% (or a fast downward fling) completes to the map. */
export async function endScrub(velocity = 0): Promise<'seat' | 'map'> {
  const { progress } = useBooking.getState();
  if (progress < 0.5 || velocity > 800) {
    await exitToMap();
    return 'map';
  }
  useBooking.setState({ progress: 1, mode: 'seat' });
  return 'seat';
}
