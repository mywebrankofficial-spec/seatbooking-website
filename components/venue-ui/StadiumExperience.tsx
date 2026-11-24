'use client';
/**
 * Integration layer for /stadium/[eventId] (owned by the orchestrator).
 * Full-screen stadium canvas + DOM overlay (cards, breadcrumbs) + checkout sheet.
 */
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { useStadium } from '@/store/stadium';
import { getStadiumAvailability } from '@/lib/api';
import { StadiumOverlay } from '@/components/venue-ui/StadiumOverlay';
import { StadiumCheckout } from '@/components/booking/stadium/StadiumCheckout';

const StadiumCanvas = dynamic(() => import('@/components/stadium/StadiumCanvas'), { ssr: false });

export function StadiumExperience({ eventId }: { eventId: string }) {
  const hydrated = useRef(false);
  if (!hydrated.current) {
    hydrated.current = true;
    const st = useStadium.getState();
    if (st.eventId !== eventId || !st.availability) {
      useStadium.setState({ eventId, availability: getStadiumAvailability(eventId) });
    }
    useStadium.setState({
      level: 'aerial',
      standId: null,
      blockId: null,
      seatIndex: null,
      skyboxId: null,
      chair: null,
      hover: null,
      hoverPoint: null,
      ticketFace: 'standard',
      checkoutOpen: false,
      transitioning: false,
    });
  }

  // Test handle, only when the URL has ?e2e (Playwright drives the state machine with it).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('e2e')) return;
    let cancelled = false;
    void Promise.all([import('@/lib/stadium-nav'), import('@/lib/stadium-geometry')]).then(([nav, geo]) => {
      if (cancelled) return;
      (window as unknown as { __arenaTest?: unknown }).__arenaTest = { nav, geo, useStadium };
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touch = window.matchMedia('(hover: none)');
    const apply = () => useStadium.setState({ reducedMotion: rm.matches, touchMode: touch.matches });
    apply();
    rm.addEventListener('change', apply);
    touch.addEventListener('change', apply);
    return () => {
      rm.removeEventListener('change', apply);
      touch.removeEventListener('change', apply);
    };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#9fb7c9] text-[#16161a]">
      <StadiumCanvas className="absolute inset-0 h-full w-full" mode="booking" />
      <StadiumOverlay />
      <StadiumCheckout />
    </main>
  );
}
