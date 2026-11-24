'use client';
/**
 * Levels 'seatView' and 'boxView': top-centre card describing the view the camera shows,
 * plus "Confirm ticket" / "Choose another seat" actions bottom-right.
 */
import { motion } from 'framer-motion';
import { checkoutStandard, checkoutVip, chooseAnotherSeat } from '@/lib/stadium-nav';
import { SKYBOX_SEAT_PRICE } from '@/data/stadium/event';
import { ACCENT, EASE, GLASS, INK, Label, PRICE, RollingNumber, describeSeat } from './ui-kit';

export interface ViewCardProps {
  kind: 'seat' | 'box';
  seatIndex: number | null;
  skyboxId: number | null;
  chair: number | null;
  compact: boolean;
  reduced: boolean;
}

export function ViewCard({ kind, seatIndex, skyboxId, chair, compact, reduced }: ViewCardProps) {
  let from = '';
  let where = '';
  let price = SKYBOX_SEAT_PRICE;
  if (kind === 'seat' && seatIndex !== null) {
    const d = describeSeat(seatIndex);
    from = `FROM BLOCK ${d.block.id} · ROW ${d.row} SEAT ${d.seat}`;
    where = `${d.stand.name} · ${d.tier.name} tier`;
    price = d.price;
  } else {
    from = `FROM SKYBOX ${skyboxId ?? ''} · SEAT ${chair ?? ''}`;
    where = 'VIP · Level 2';
  }
  const title = kind === 'seat' ? 'Your view' : 'Another view';
  const confirm = kind === 'seat' ? checkoutStandard : checkoutVip;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[76px] z-20 flex justify-center px-3 sm:top-[84px]">
        <motion.section
          aria-label={`${title}, ${from.toLowerCase()}`}
          className={`pointer-events-auto rounded-[20px] ${GLASS}`}
          style={{ color: INK }}
          initial={{ opacity: 0, y: reduced ? 0 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -8 }}
          transition={{ duration: 0.35, ease: EASE }}
        >
          <div className="flex items-center gap-5 py-3.5 pl-5 pr-5">
            <div className="min-w-0">
              <Label>{from}</Label>
              <h2 className="mt-1.5 text-[20px] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
              <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[#45454d]">
                <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: ACCENT }} />
                {where}
              </div>
            </div>
            <div aria-hidden className="w-px self-stretch bg-[#16161a]/[0.09]" />
            <div>
              <Label>AED</Label>
              <div className="mt-1.5 text-[24px] font-semibold leading-none tracking-[-0.02em]" style={{ color: PRICE }}>
                <RollingNumber value={price} />
              </div>
            </div>
          </div>
        </motion.section>
      </div>

      <motion.div
        className={`pointer-events-auto fixed z-20 flex gap-2.5 ${
          compact
            ? 'inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] flex-col'
            : 'bottom-8 right-8 flex-row'
        }`}
        initial={{ opacity: 0, y: reduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduced ? 0 : 10 }}
        transition={{ duration: 0.35, ease: EASE, delay: reduced ? 0 : 0.08 }}
      >
        <button
          type="button"
          onClick={confirm}
          className="rounded-full px-6 py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(242,106,33,0.8)] transition-[filter,transform] hover:brightness-105 active:scale-[0.98]"
          style={{ background: ACCENT }}
        >
          Confirm ticket
        </button>
        <button
          type="button"
          onClick={() => void chooseAnotherSeat()}
          className={`rounded-full px-6 py-3 text-[14px] font-semibold transition-transform active:scale-[0.98] ${GLASS}`}
          style={{ color: INK }}
        >
          Choose another seat
        </button>
      </motion.div>
    </>
  );
}
