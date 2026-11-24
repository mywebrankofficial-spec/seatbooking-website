'use client';
import { MotionConfig } from 'framer-motion';
import { Closing } from './Closing';
import { Flythrough } from './Flythrough';
import { Hero } from './Hero';

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-[100dvh] w-full bg-page text-fg">
        <Hero />
        <Flythrough />
        <Closing />
      </main>
    </MotionConfig>
  );
}

export default LandingPage;
