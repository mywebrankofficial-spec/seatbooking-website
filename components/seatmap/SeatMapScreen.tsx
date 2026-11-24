'use client';
/**
 * Screen A: the 2D seat map. The map frame inside MapArea is a literal top-down
 * projection of MAP_WORLD_RECT and publishes its viewport rect to the store
 * (`mapFrame`) so the overhead 3D camera can take over pixel-perfectly.
 */
import { MotionConfig } from 'framer-motion';
import type { Cinema, Showtime } from '@/types/cinema';
import { TopBar } from './TopBar';
import { ShowtimePills } from './ShowtimePills';
import { MapArea } from './MapArea';
import { Legend } from './Legend';
import { BottomBar } from './BottomBar';

export interface SeatMapScreenProps {
  cinema: Cinema;
  showtimes: Showtime[];
  onShowtimeChange: (id: string) => void;
  /** Continue tapped (or a seat double-tapped) with a seat selected. */
  onContinue: () => void;
}

export function SeatMapScreen({ cinema, showtimes, onShowtimeChange, onContinue }: SeatMapScreenProps) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col overflow-hidden bg-[#0d0d10] text-white select-none">
        <TopBar cinema={cinema} />
        <ShowtimePills showtimes={showtimes} onShowtimeChange={onShowtimeChange} />
        <MapArea onContinue={onContinue} />
        <Legend />
        <BottomBar onContinue={onContinue} />
      </div>
    </MotionConfig>
  );
}
