/**
 * Frosted segmented pill to switch between the two venue landings.
 * Used by the cinema landing (/) and the stadium landing (/stadium).
 */
import Link from 'next/link';
import { CINEMA_HOME_HREF, STADIUM_HOME_HREF } from './links';

export type Venue = 'cinema' | 'stadium';

const VENUES: { id: Venue; label: string; href: string }[] = [
  { id: 'cinema', label: 'Cinema', href: CINEMA_HOME_HREF },
  { id: 'stadium', label: 'Stadium', href: STADIUM_HOME_HREF },
];

const TONES = {
  /** On dark pages (cinema). */
  dark: {
    track: 'border-white/10 bg-white/[0.07] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]',
    active: 'bg-white text-black shadow-[0_1px_3px_rgba(0,0,0,0.35)]',
    idle: 'text-white/60 hover:text-white',
    ring: 'focus-visible:outline-white',
  },
  /** On light pages (stadium). */
  light: {
    track: 'border-white/70 bg-white/45 shadow-[0_6px_24px_-12px_rgba(20,40,70,0.35)]',
    active: 'bg-white text-[#0b1626] shadow-[0_1px_3px_rgba(20,40,70,0.22)]',
    idle: 'text-[#0b1626]/55 hover:text-[#0b1626]',
    ring: 'focus-visible:outline-[#F26A21]',
  },
} as const;

export function VenueSwitcher({
  active,
  tone = active === 'cinema' ? 'dark' : 'light',
  className = '',
}: {
  active: Venue;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <nav
      aria-label="Venue"
      className={`inline-flex items-center gap-0.5 rounded-full border p-1 backdrop-blur-xl backdrop-saturate-150 ${t.track} ${className}`}
    >
      {VENUES.map((v) => {
        const base = `rounded-full px-3.5 py-1.5 text-[13px] font-medium leading-none tracking-tight transition-colors duration-200 sm:px-4`;
        return v.id === active ? (
          <span key={v.id} aria-current="page" className={`${base} ${t.active}`}>
            {v.label}
          </span>
        ) : (
          <Link
            key={v.id}
            href={v.href}
            className={`${base} ${t.idle} focus-visible:outline-2 focus-visible:outline-offset-2 ${t.ring}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default VenueSwitcher;
