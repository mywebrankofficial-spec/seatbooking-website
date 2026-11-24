'use client';
/** STUB — owned by the 2D UI agent, who replaces this file. */
import type { Cinema, Showtime } from '@/types/cinema';

export interface SeatMapScreenProps {
  cinema: Cinema;
  showtimes: Showtime[];
  onShowtimeChange: (id: string) => void;
  /** Continue tapped (or a seat double-tapped) with a seat selected. */
  onContinue: () => void;
}

export function SeatMapScreen(props: SeatMapScreenProps) {
  void props;
  return null;
}
