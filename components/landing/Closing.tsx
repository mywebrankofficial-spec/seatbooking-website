'use client';
import { motion } from 'framer-motion';
import { Box, Ruler, Ticket, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ScreenArc } from './ScreenArc';
import { BOOK_HREF } from './links';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Box, title: 'Real 3D view', body: 'A true camera in every seat, not a stock photo.' },
  { icon: Ruler, title: 'Live distance & angle', body: 'Metres to the screen and field of view, per seat.' },
  { icon: Ticket, title: 'Book in seconds', body: 'Like the view? One tap and the seat is yours.' },
];

const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
};

export function Closing() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-32 md:pt-44">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <motion.div {...reveal} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="w-[min(420px,80vw)]">
          <ScreenArc />
        </motion.div>
        <motion.h2
          {...reveal}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[56px]"
        >
          Pick your seat.
        </motion.h2>
        <motion.p
          {...reveal}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-[17px] text-fg-2"
        >
          Meridian · Hall 3 · Tonight 19:45 IMAX
        </motion.p>
        <motion.div {...reveal} transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} className="mt-9">
          <Link
            href={BOOK_HREF}
            className="inline-flex h-12 items-center rounded-full bg-accent px-7 text-[15px] font-semibold text-black transition-transform duration-300 ease-[var(--ease-premium)] hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Choose your seat
          </Link>
        </motion.div>
      </div>

      <ul className="mx-auto mt-24 grid max-w-5xl gap-3 md:mt-32 md:grid-cols-3 md:gap-4">
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <motion.li
            key={title}
            {...reveal}
            transition={{ duration: 0.8, delay: 0.08 * i, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-card border border-line bg-surface p-6"
          >
            <Icon className="size-5 text-accent" strokeWidth={1.6} aria-hidden />
            <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-fg-2">{body}</p>
          </motion.li>
        ))}
      </ul>

      <footer className="mx-auto mt-24 flex max-w-5xl items-center justify-between border-t border-line pt-6 text-[13px] text-fg-3">
        <span className="font-medium text-fg-2">SeatView</span>
        <span>Procedural 3D hall · demo</span>
      </footer>
    </section>
  );
}

export default Closing;
