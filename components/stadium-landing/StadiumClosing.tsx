'use client';
import { motion } from 'framer-motion';
import { Crown, Eye, Ticket, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { CTA_CLASS } from './StadiumHero';
import { STADIUM_EVENT_HREF, STADIUM_EVENT_LINE } from './links';

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Eye, title: 'The real view', body: 'Rendered live from the exact seat, never a stock photo.' },
  { icon: Crown, title: 'Skyboxes built in', body: 'Upgrade to a glass-front box and pick your chair.' },
  { icon: Ticket, title: 'Book in seconds', body: 'Like what you see? One tap and the seat is yours.' },
];

const ease = [0.22, 1, 0.36, 1] as const;
const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
};

export function StadiumClosing() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-[#2b3949] via-[#142336] to-[#0a121d] px-6 pb-16 pt-32 text-white md:pt-44">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <motion.h2
          {...reveal}
          transition={{ duration: 0.9, ease }}
          className="text-balance text-[36px] font-semibold leading-[1.05] tracking-[-0.03em] md:text-[56px]"
        >
          Your seat is waiting.
        </motion.h2>
        <motion.p {...reveal} transition={{ duration: 0.9, delay: 0.1, ease }} className="mt-4 text-[17px] text-white/65">
          {STADIUM_EVENT_LINE}
        </motion.p>
        <motion.div {...reveal} transition={{ duration: 0.9, delay: 0.2, ease }} className="mt-9">
          <Link href={STADIUM_EVENT_HREF} className={CTA_CLASS}>
            Find your seat
          </Link>
        </motion.div>
      </div>

      <ul className="mx-auto mt-24 grid max-w-5xl gap-3 md:mt-32 md:grid-cols-3 md:gap-4">
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <motion.li
            key={title}
            {...reveal}
            transition={{ duration: 0.8, delay: 0.08 * i, ease }}
            className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl"
          >
            <Icon className="size-5 text-[#F26A21]" strokeWidth={1.6} aria-hidden />
            <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-white/60">{body}</p>
          </motion.li>
        ))}
      </ul>

      <footer className="mx-auto mt-24 flex max-w-5xl items-center justify-between border-t border-white/10 pt-6 text-[13px] text-white/40">
        <span className="font-medium text-white/65">Arena</span>
        <span>Procedural 3D stadium · demo</span>
      </footer>
    </section>
  );
}

export default StadiumClosing;
