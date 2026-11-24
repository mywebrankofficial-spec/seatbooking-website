'use client';
/**
 * Tall scroll section with a pinned (sticky) full-viewport 3D canvas.
 * Lenis smooths the page scroll; a scrubbed GSAP tween maps the section's
 * scroll progress 0 -> 1 into the landing flythrough store, which LandingRig
 * reads every frame and the overlay reads per row.
 */
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { FLY_SEAT_NUMBER, rowLetter, setFlythroughProgress, setFlythroughReduced, useActiveRowIndex } from './flythrough-store';
import { FlythroughOverlay } from './FlythroughOverlay';

const LandingCanvas = dynamic(() => import('./LandingCanvas'), {
  ssr: false,
  loading: () => null,
});

export function Flythrough() {
  const sectionRef = useRef<HTMLElement>(null);
  const rowIdx = useActiveRowIndex();
  const highlightSeatId = `${rowLetter(rowIdx)}${FLY_SEAT_NUMBER}`;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    gsap.registerPlugin(ScrollTrigger);

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let lenis: Lenis | null = null;
    let tick: ((time: number) => void) | null = null;
    let ctx: gsap.Context | null = null;

    const setup = () => {
      const reduced = mq.matches;
      setFlythroughReduced(reduced);

      // Lenis only for full motion; reduced motion keeps native scrolling.
      if (!reduced) {
        const l = new Lenis({ lerp: 0.1, smoothWheel: true });
        l.on('scroll', ScrollTrigger.update);
        tick = (time: number) => l.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        lenis = l;
      }

      ctx = gsap.context(() => {
        const proxy = { p: 0 };
        gsap.to(proxy, {
          p: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: 'bottom bottom',
            scrub: reduced ? true : 0.4,
            invalidateOnRefresh: true,
          },
          onUpdate: () => setFlythroughProgress(proxy.p),
        });
      }, section);
      ScrollTrigger.refresh();
    };

    const teardown = () => {
      ctx?.revert();
      ctx = null;
      if (tick) gsap.ticker.remove(tick);
      tick = null;
      lenis?.destroy();
      lenis = null;
    };

    const onChange = () => {
      teardown();
      setup();
    };

    setup();
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      teardown();
      gsap.ticker.lagSmoothing(500, 33);
      setFlythroughProgress(0);
    };
  }, []);

  return (
    <section ref={sectionRef} id="flythrough" aria-label="Fly through the hall" className="relative h-[400vh]">
      <div className="sticky top-0 h-[100dvh] w-full overflow-hidden bg-page">
        <LandingCanvas highlightSeatId={highlightSeatId} className="absolute inset-0 h-full w-full" />
        <FlythroughOverlay />
      </div>
    </section>
  );
}

export default Flythrough;
