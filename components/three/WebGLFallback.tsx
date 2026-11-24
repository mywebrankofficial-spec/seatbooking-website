'use client';
/**
 * Shown instead of the 3D hall when WebGL is unavailable: a pre-rendered view
 * for the zone of the store's camera seat (`/media/fallback/<zone>.jpg`), or,
 * if that image is missing, a dark hall with a glowing warm screen.
 */
import { useState } from 'react';
import type { SeatViewStats } from '@/types/cinema';
import { blockOf, computeStats, parseSeatId } from '@/lib/hall-geometry';
import { useBooking } from '@/store/booking';

const ZONE_SLUG: Record<SeatViewStats['zone'], string> = {
  'UP CLOSE': 'up-close',
  'SWEET SPOT': 'sweet-spot',
  'FULL PICTURE': 'full-picture',
  'SIDE VIEW': 'side-view',
};

function zoneSlug(seatId: string | null): string {
  if (!seatId) return ZONE_SLUG['SWEET SPOT'];
  const { row, number } = parseSeatId(seatId);
  if (!row || !Number.isFinite(number)) return ZONE_SLUG['SWEET SPOT'];
  return ZONE_SLUG[computeStats({ row, number, block: blockOf(number) }).zone];
}

export function WebGLFallback({ className }: { className?: string }) {
  const cameraSeatId = useBooking((s) => s.cameraSeatId);
  const slug = zoneSlug(cameraSeatId);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', background: '#0b0b0e', width: '100%', height: '100%' }}
    >
      {failed !== slug ? (
        // eslint-disable-next-line @next/next/no-img-element -- static pre-rendered fallback, no optimisation needed
        <img
          key={slug}
          src={`/media/fallback/${slug}.jpg`}
          alt=""
          draggable={false}
          onError={() => setFailed(slug)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(120% 60% at 50% 22%, #2a2118 0%, #121014 45%, #0b0b0e 100%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              top: '14%',
              height: '17%',
              borderRadius: 4,
              background: 'linear-gradient(180deg, #ece4d6 0%, #f3e3c8 45%, #d9b98a 75%, #c79e6b 100%)',
              boxShadow: '0 0 40px 8px rgba(243, 222, 186, 0.35), 0 30px 80px 10px rgba(243, 222, 186, 0.12)',
            }}
          />
        </div>
      )}
    </div>
  );
}
