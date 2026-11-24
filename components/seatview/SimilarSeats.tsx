'use client';
import { ChevronRight } from 'lucide-react';
import { formatMetres } from '@/lib/format';
import type { SimilarSeat } from './seat-nav';

const zoneTitle = (z: string) => z.charAt(0) + z.slice(1).toLowerCase();

export function SimilarSeats({
  items,
  disabled,
  onPick,
}: {
  items: SimilarSeat[];
  disabled: boolean;
  onPick: (seatId: string) => void;
}) {
  return (
    <section aria-labelledby="similar-seats-title">
      <h3 id="similar-seats-title" className="text-[15px] font-semibold text-white">
        Similar seats with a better view
      </h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[14px] leading-snug text-fg-2">
          No available seat of this type has a better view.
        </p>
      ) : (
        <ul className="mt-2.5 overflow-hidden rounded-2xl bg-[#1d1d21]">
          {items.map(({ seat, zone, distance }, i) => (
            <li key={seat.id} className={i > 0 ? 'border-t border-white/[0.06]' : undefined}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(seat.id)}
                aria-label={`Move to Row ${seat.row}, Seat ${seat.number}, ${zoneTitle(zone)}, ${formatMetres(distance)} to screen`}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.05] active:bg-white/[0.05]"
              >
                <span className="tabular grid h-8 min-w-10 place-items-center rounded-[10px] bg-white/[0.06] px-2 text-[13px] font-semibold text-white">
                  {seat.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-white">
                    Row {seat.row}, Seat {seat.number}
                  </span>
                  <span className="block text-[12px] text-fg-3">{zoneTitle(zone)}</span>
                </span>
                <span className="tabular text-[13px] text-fg-2">{formatMetres(distance)}</span>
                <ChevronRight size={16} className="text-fg-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
