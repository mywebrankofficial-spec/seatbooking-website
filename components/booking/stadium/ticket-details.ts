/**
 * Display details for a stadium ticket, derived either from the live selection
 * (checkout) or from a confirmed StadiumBooking (confirmation page).
 */
import type { StadiumBooking } from '@/store/stadium';
import { STADIUM_EVENT, SKYBOX_SEAT_PRICE, VIP_LEVEL_LABEL, blockPrice, type StadiumEvent } from '@/data/stadium/event';
import { STAND_BY_ID, TIERS, getStadiumLayout, seatInfo } from '@/lib/stadium-geometry';

export const CURRENCY = 'AED' as const;

export interface TicketField {
  label: string;
  value: string;
}

/** Everything the checkout needs to hold + confirm, minus name/email. */
export type StadiumSelection = Omit<StadiumBooking, 'ref' | 'createdAt' | 'name' | 'email'> & {
  /** Hold key: `seat:{index}` or `box:{id}:{chair}`. */
  holdKey: string;
};

export interface TicketDetails {
  kind: 'standard' | 'vip';
  /** "North Stand · Middle tier" or "VIP · Level 2". */
  areaLine: string;
  /** Block/Row/Seat/Gate or Skybox/Seat/Entry. */
  fields: TicketField[];
  price: number;
}

export function getEvent(eventId: string): StadiumEvent | null {
  return eventId === STADIUM_EVENT.id ? STADIUM_EVENT : null;
}

export function eventLine(ev: StadiumEvent): string {
  return `${ev.title} · ${ev.dateLabel} · ${ev.time} · ${ev.venue}`;
}

const VIP_LINE = VIP_LEVEL_LABEL.replace('LEVEL', 'Level');

function tierLine(tierId: number | null): string | null {
  const t = TIERS.find((x) => x.id === tierId);
  return t ? `${t.name} tier` : null;
}

/** Selection from the store state (null if the state is incomplete). */
export function selectionFromState(st: {
  eventId: string;
  checkoutKind: 'standard' | 'vip';
  seatIndex: number | null;
  skyboxId: number | null;
  chair: number | null;
}): StadiumSelection | null {
  if (st.checkoutKind === 'vip') {
    if (st.skyboxId === null || st.chair === null) return null;
    const box = getStadiumLayout().skyboxById.get(st.skyboxId);
    if (!box) return null;
    return {
      eventId: st.eventId,
      kind: 'vip',
      label: `Skybox ${st.skyboxId} · Seat ${st.chair}`,
      standName: STAND_BY_ID[box.side].name,
      gate: 'VIP',
      blockId: null,
      row: null,
      seat: null,
      skyboxId: st.skyboxId,
      chair: st.chair,
      price: SKYBOX_SEAT_PRICE,
      holdKey: `box:${st.skyboxId}:${st.chair}`,
    };
  }
  if (st.seatIndex === null) return null;
  const info = seatInfo(st.seatIndex);
  if (!info.block) return null;
  return {
    eventId: st.eventId,
    kind: 'standard',
    label: `Block ${info.block.id} · Row ${info.row} · Seat ${info.seat}`,
    standName: info.stand.name,
    gate: info.block.gate,
    blockId: info.block.id,
    row: info.row,
    seat: info.seat,
    skyboxId: null,
    chair: null,
    price: blockPrice(info.block),
    holdKey: `seat:${st.seatIndex}`,
  };
}

/** Works for both a selection and a confirmed booking. Block id = tier * 100 + n. */
export function ticketDetails(
  b: Pick<StadiumBooking, 'kind' | 'standName' | 'gate' | 'blockId' | 'row' | 'seat' | 'skyboxId' | 'chair' | 'price'>,
): TicketDetails {
  if (b.kind === 'vip') {
    return {
      kind: 'vip',
      areaLine: VIP_LINE,
      fields: [
        { label: 'Skybox', value: String(b.skyboxId ?? '—') },
        { label: 'Seat', value: String(b.chair ?? '—') },
        { label: 'Entry', value: 'VIP' },
      ],
      price: b.price,
    };
  }
  const tier = tierLine(b.blockId !== null ? Math.floor(b.blockId / 100) : null);
  return {
    kind: 'standard',
    areaLine: tier ? `${b.standName} · ${tier}` : b.standName,
    fields: [
      { label: 'Block', value: String(b.blockId ?? '—') },
      { label: 'Row', value: String(b.row ?? '—') },
      { label: 'Seat', value: String(b.seat ?? '—') },
      { label: 'Gate', value: b.gate },
    ],
    price: b.price,
  };
}
