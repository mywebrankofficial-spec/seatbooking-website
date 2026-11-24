'use client';
import { MotionConfig } from 'framer-motion';
import { StadiumClosing } from './StadiumClosing';
import { StadiumFlythrough } from './StadiumFlythrough';
import { StadiumHero } from './StadiumHero';

/** /stadium landing: light afternoon sky at the top, dusk at the bottom. */
export function StadiumLandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-dvh w-full bg-linear-to-b from-[#eef4f9] to-[#c9dbe8] text-[#0b1626] [color-scheme:light]">
        <StadiumHero />
        <StadiumFlythrough />
        <StadiumClosing />
      </main>
    </MotionConfig>
  );
}

export default StadiumLandingPage;
