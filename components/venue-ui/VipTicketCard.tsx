'use client';
/** Dark VIP face of the ticket (level 'ticket', face 'vip'): Skybox upsell. */
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { chooseVipSeat, showStandardFace } from '@/lib/stadium-nav';
import { SKYBOX, chairEye, getStadiumLayout } from '@/lib/stadium-geometry';
import { SKYBOX_SEAT_PRICE, VIP_LEVEL_LABEL } from '@/data/stadium/event';
import type { Shot } from '@/lib/venue-engine/types';
import type { ViewRequest } from '@/lib/view-render';
import { HoldTimer, Pair, TicketShell, TicketStub, ViewPill, imageBoxClass } from './TicketCard';
import { Label, ViewImage } from './ui-kit';

/** From behind the back-row chairs, inside the box, looking out through the glass at the pitch. */
export function boxInsideShot(boxId: number): Shot | null {
  const box = getStadiumLayout().skyboxById.get(boxId);
  if (!box) return null;
  const e = chairEye(box, 6);
  const fx = Math.sin(box.yaw);
  const fz = Math.cos(box.yaw);
  return {
    position: { x: e.x - fx * 1.2, y: e.y + 0.15, z: e.z - fz * 1.2 },
    target: { x: e.x * 0.1, y: 0, z: e.z * 0.1 },
    fov: 64,
  };
}

export function VipTicketCard({ skyboxId, compact }: { skyboxId: number; compact: boolean }) {
  const req = useMemo<ViewRequest | null>(() => {
    const shot = boxInsideShot(skyboxId);
    return shot ? { key: `box:${skyboxId}:inside`, shot, width: 300, height: 200 } : null;
  }, [skyboxId]);

  const image = (
    <div className={`relative overflow-hidden ${imageBoxClass(compact)}`}>
      <ViewImage dark req={req} label={`Rendered view from inside Skybox ${skyboxId}`} className="h-full w-full" />
      <ViewPill>Your view from the box</ViewPill>
    </div>
  );

  const body = (
    <div className={`flex h-full flex-col ${compact ? 'gap-4' : 'justify-between'}`}>
      <div>
        <div className="flex items-start justify-between gap-3">
          <Label dark>{VIP_LEVEL_LABEL}</Label>
          <HoldTimer dark />
        </div>
        <h2 className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.025em] text-white">Skybox {skyboxId}</h2>
      </div>
      <div className="flex gap-8 text-white">
        <Pair dark label="SEATS" value={String(SKYBOX.chairsPerBox)} />
        <Pair dark label="ENTRY" value="VIP" />
      </div>
      <div className={compact ? 'flex items-center gap-4' : 'flex flex-col items-start gap-1.5'}>
        <button
          type="button"
          onClick={() => void chooseVipSeat()}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-[#16161a] transition-[filter,transform] hover:brightness-95 active:scale-[0.98]"
        >
          Choose your VIP seat
          <ArrowRight aria-hidden size={15} strokeWidth={2.3} />
        </button>
        <button
          type="button"
          onClick={showStandardFace}
          className="px-1 text-[12.5px] font-medium text-white/50 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
        >
          Keep my seat
        </button>
      </div>
    </div>
  );

  return (
    <TicketShell
      dark
      compact={compact}
      label={`VIP ticket: Skybox ${skyboxId}`}
      image={image}
      body={body}
      stub={<TicketStub dark id={`skybox-${skyboxId}`} price={SKYBOX_SEAT_PRICE} compact={compact} />}
    />
  );
}
