'use client';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { StadiumMark } from './StadiumMark';
import { VenueSwitcher } from './VenueSwitcher';
import { STADIUM_EVENT_HREF, STADIUM_EVENT_LINE } from './links';

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] as const },
});

export const CTA_CLASS =
  'inline-flex h-12 items-center rounded-full bg-[#F26A21] px-7 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(242,106,33,0.8)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.03] hover:bg-[#f47a37] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F26A21]';

export function StadiumHero() {
  return (
    <section className="relative flex min-h-svh flex-col overflow-hidden">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6 md:px-10 md:pt-8">
        <span className="text-[15px] font-semibold tracking-tight">Arena</span>
        <VenueSwitcher active="stadium" className="absolute left-1/2 -translate-x-1/2" />
        <Link
          href={STADIUM_EVENT_HREF}
          className="rounded-full px-4 py-2 text-[13px] font-medium text-[#0b1626]/60 transition-colors hover:text-[#0b1626] focus-visible:outline-2 focus-visible:outline-[#F26A21]"
        >
          Tickets
        </Link>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <motion.div {...rise(0.05)} className="w-[min(440px,82vw)]">
          <StadiumMark idPrefix="hero-mark" className="h-auto w-full" />
        </motion.div>

        <motion.h1
          {...rise(0.2)}
          className="mt-12 text-balance text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[64px]"
        >
          Every seat, before you buy it.
        </motion.h1>

        <motion.p
          {...rise(0.35)}
          className="mt-5 max-w-md text-pretty text-[17px] leading-relaxed text-[#0b1626]/60 md:text-lg"
        >
          Fly into a real 3D stadium and see the pitch from any seat, then book it.
        </motion.p>

        <motion.div {...rise(0.5)} className="mt-10 flex flex-col items-center gap-5">
          <Link href={STADIUM_EVENT_HREF} className={CTA_CLASS}>
            Find your seat
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-4 py-2 text-[13px] font-medium text-[#0b1626]/75 backdrop-blur-xl">
            <span className="size-1.5 rounded-full bg-[#2fae5b]" aria-hidden />
            {STADIUM_EVENT_LINE}
          </span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.1 }}
        className="absolute inset-x-0 bottom-8 z-10 flex justify-center text-[#0b1626]/40"
        aria-hidden
      >
        <ChevronDown className="size-5" strokeWidth={1.5} />
      </motion.div>
    </section>
  );
}

export default StadiumHero;
