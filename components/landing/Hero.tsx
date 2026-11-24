'use client';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { VenueSwitcher } from '@/components/stadium-landing/VenueSwitcher';
import { ScreenArc } from './ScreenArc';
import { BOOK_HREF } from './links';

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export function Hero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col overflow-hidden">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6 md:px-10 md:pt-8">
        <span className="text-[15px] font-semibold tracking-tight">SeatView</span>
        <VenueSwitcher active="cinema" className="absolute left-1/2 -translate-x-1/2" />
        <Link
          href={BOOK_HREF}
          className="rounded-full px-4 py-2 text-[13px] font-medium text-fg-2 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          Book
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <motion.div {...rise(0.05)} className="w-[min(560px,88vw)]">
          <ScreenArc />
        </motion.div>

        <motion.h1
          {...rise(0.2)}
          className="mt-14 text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[64px]"
        >
          See your seat before you book it.
        </motion.h1>

        <motion.p {...rise(0.35)} className="mt-5 max-w-md text-pretty text-[17px] leading-relaxed text-fg-2 md:text-lg">
          Step into a real 3D model of the hall and look at the screen from any seat.
        </motion.p>

        <motion.div {...rise(0.5)} className="mt-10">
          <Link
            href={BOOK_HREF}
            className="inline-flex h-12 items-center rounded-full bg-accent px-7 text-[15px] font-semibold text-black transition-transform duration-300 ease-[var(--ease-premium)] hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Choose your seat
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.1 }}
        className="absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-1 text-fg-3"
        aria-hidden
      >
        <span className="text-[11px] font-medium uppercase tracking-[0.3em]">Take a seat</span>
        <ChevronDown className="size-4" strokeWidth={1.5} />
      </motion.div>
    </section>
  );
}

export default Hero;
