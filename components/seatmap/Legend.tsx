import { SEAT_COLORS } from './motion';

const ITEMS = [
  { label: 'Available', style: { backgroundColor: SEAT_COLORS.available } },
  { label: 'Taken', style: { border: `1px solid ${SEAT_COLORS.takenBorder}` } },
  { label: 'Recliner', style: { backgroundColor: SEAT_COLORS.recliner } },
  { label: 'Selected', style: { backgroundColor: SEAT_COLORS.selected } },
] as const;

export function Legend() {
  return (
    <ul className="flex shrink-0 items-center justify-center gap-4 px-4 py-2.5" aria-label="Legend">
      {ITEMS.map(({ label, style }) => (
        <li key={label} className="flex items-center gap-1.5 text-[11px] leading-none text-fg-2">
          <span aria-hidden className="block size-2 rounded-[2.5px]" style={style} />
          {label}
        </li>
      ))}
    </ul>
  );
}
