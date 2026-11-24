'use client';
/** Expanded-sheet content: seat type, access info (derived from geometry) and better-view suggestions. */
import { Accessibility, Armchair, Sofa } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Seat } from '@/types/cinema';
import { seatTypeLabel } from '@/lib/format';
import { seatFacts, type SimilarSeat } from './seat-nav';
import { SimilarSeats } from './SimilarSeats';

const TYPE_COPY: Record<Seat['type'], string> = {
  standard: 'Upholstered velvet seat with a fixed back, shared armrests and a cup holder.',
  recliner: 'Wide padded recliner in the raised back rows, with a footrest and more space to lean back.',
};

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-fg-2" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
        <div className="mt-1 text-[14px] leading-snug text-fg-2">{children}</div>
      </div>
    </div>
  );
}

export function SeatDetails({
  seat,
  similar,
  disabled,
  onPick,
}: {
  seat: Seat;
  similar: SimilarSeat[];
  disabled: boolean;
  onPick: (seatId: string) => void;
}) {
  const f = seatFacts(seat);
  const facts = [
    `${f.seatWidthCm} cm wide`,
    `${f.rowSpacing.toFixed(2)} m row spacing`,
    ...(f.aisleSeat ? ['Aisle seat'] : []),
  ];

  return (
    <div className="space-y-5 pt-1">
      <div className="h-px bg-white/[0.06]" aria-hidden />
      <Row
        icon={seat.type === 'recliner' ? <Sofa size={16} /> : <Armchair size={16} />}
        title={seat.type === 'recliner' ? 'Recliner' : `${seatTypeLabel(seat.type)} seat`}
      >
        <p>{TYPE_COPY[seat.type]}</p>
        <p className="mt-1.5 text-[13px] text-fg-3">{facts.join(' · ')}</p>
      </Row>
      <Row icon={<Accessibility size={16} />} title="Access">
        <p>
          {f.steps === 0
            ? `Step-free from the ${f.entranceSide} entrance at the front of the hall.`
            : `${f.steps} steps up from the ${f.entranceSide} entrance at the front of the hall.`}
          {f.wheelchairSpace && ' Level space next to the side aisle for a wheelchair.'}
        </p>
      </Row>
      <SimilarSeats items={similar} disabled={disabled} onPick={onPick} />
    </div>
  );
}
