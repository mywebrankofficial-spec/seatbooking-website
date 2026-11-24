'use client';
/**
 * Tall scroll section with a pinned (sticky) full-viewport StadiumCanvas.
 * Lenis smooths the page scroll; a scrubbed GSAP tween maps the section's
 * scroll progress 0 -> 1 into the stadium landing store, which the rig reads
 * every frame and the overlay reads per stage.
 */
import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { setStadiumFlyProgress, setStadiumFlyReduced } from './stadium-flythrough-store';
import { StadiumFlythroughOverlay } from './StadiumFlythroughOverlay';

const StadiumLandingCanvas = dynamic(() => import('./StadiumLandingCanvas'), {
  ssr: false,
  loading: () => null,
});

export function StadiumFlythrough() {
  const sectionRef = useRef<HTMLElement>(null);

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
      setStadiumFlyReduced(reduced);

      // Lenis only for full motion; reduced motion keeps native scrolling and steps between stages.
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
            scrub: reduced ? true : 0.5,
            invalidateOnRefresh: true,
          },
          onUpdate: () => setStadiumFlyProgress(proxy.p),
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
      setStadiumFlyProgress(0);
    };
  }, []);

  return (
    <section ref={sectionRef} aria-label="Fly through the stadium" className="relative h-[500vh]">
      <div className="sticky top-0 h-dvh w-full overflow-hidden bg-[#9fb7c9]">
        <StadiumLandingCanvas className="absolute inset-0 h-full w-full" />
        <StadiumFlythroughOverlay />
      </div>
    </section>
  );
}

export default StadiumFlythrough;
