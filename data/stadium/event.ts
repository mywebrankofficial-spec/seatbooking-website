/**
 * Mock stadium event, prices and seeded availability (via lib/api.ts in the app).
 * The event is nearly sold out, like the reference ("79 left", "12 left", "Sold out").
 */
import type { StandId, StadiumLayout, BlockDef } from '@/lib/stadium-geometry';
import { STANDS, getStadiumLayout, seatIndexOf } from '@/lib/stadium-geometry';

export interface StadiumEvent {
  id: string;
  title: string;
  dateLabel: string;
  time: string;
  venue: string;
  currency: 'AED';
}

export const STADIUM_EVENT: StadiumEvent = {
  id: 'city-derby',
  title: 'City Derby',
  dateLabel: 'Sat 12 Dec',
  time: '20:00',
  venue: 'Arena',
  currency: 'AED',
};

export const SKYBOX_SEAT_PRICE = 3750;
export const VIP_LEVEL_LABEL = 'VIP · LEVEL 2';

/** Corners 850, long sides 1,250, ends 950, any upper-tier block 850. */
export function blockPrice(block: BlockDef): number {
  if (block.tier === 3) return 850;
  const kind = STANDS.find((s) => s.id === block.standId)!.kind;
  if (kind === 'corner') return 850;
  if (kind === 'side') return 1250;
  return 950;
}

export function upgradePrice(seatPrice: number): number {
  return Math.max(0, SKYBOX_SEAT_PRICE - seatPrice);
}

export interface StadiumAvailability {
  /** 1 = available, per global seat index. */
  seatAvailable: Uint8Array;
  /** Seats left per block (indexed like layout.blocks). */
  blockLeft: Int32Array;
  standLeft: Record<StandId, number>;
  /** Cheapest price among blocks with seats left (or cheapest overall if sold out). */
  standFromPrice: Record<StandId, number>;
  skyboxAvailable: Record<number, boolean>;
  /** Per box: chairs 1..8 available (index 0 = chair 1). */
  chairAvailable: Record<number, boolean[]>;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed facts from the reference video. */
const SOLD_OUT_BLOCKS = new Set([234]);
const BLOCK_LEFT: Record<number, number> = { 331: 73, 232: 21 };
const STAND_LEFT: Partial<Record<StandId, number>> = { SW: 79, NW: 12 };
const FORCE_AVAILABLE: Array<[number, number, number]> = [[232, 10, 8]];
const FORCE_TAKEN: Array<[number, number, number]> = [[232, 11, 12]];

export function generateStadiumAvailability(eventId: string, layout: StadiumLayout = getStadiumLayout()): StadiumAvailability {
  const rand = mulberry32([...eventId].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261));
  const seatAvailable = new Uint8Array(layout.seatCount);
  const blockLeft = new Int32Array(layout.blocks.length);

  // 1) Decide how many seats are left per block.
  for (const stand of STANDS) {
    const blocks = layout.blocksByStand[stand.id];
    const target = STAND_LEFT[stand.id];
    if (target !== undefined) {
      // Spread a fixed stand total over a few random blocks.
      let remaining = target;
      const open = blocks.filter(() => rand() < 0.5);
      if (open.length === 0) open.push(blocks[0]);
      open.forEach((b, i) => {
        const n = i === open.length - 1 ? remaining : Math.min(remaining, Math.floor(rand() * (remaining / 1.5)) + 1);
        blockLeft[b.index] = n;
        remaining -= n;
      });
      continue;
    }
    for (const b of blocks) {
      if (SOLD_OUT_BLOCKS.has(b.id)) blockLeft[b.index] = 0;
      else if (BLOCK_LEFT[b.id] !== undefined) blockLeft[b.index] = BLOCK_LEFT[b.id];
      else blockLeft[b.index] = rand() < 0.35 ? 0 : 2 + Math.floor(rand() * 38);
    }
  }

  // 2) Pick which seats are free inside each block.
  const forcedTaken = new Set(FORCE_TAKEN.map(([b, r, s]) => seatIndexOf(b, r, s)));
  for (const b of layout.blocks) {
    let left = Math.min(blockLeft[b.index], b.seatCount);
    for (const [bid, r, s] of FORCE_AVAILABLE) {
      if (bid !== b.id) continue;
      const i = seatIndexOf(bid, r, s);
      if (i !== null && !seatAvailable[i]) {
        seatAvailable[i] = 1;
        left--;
      }
    }
    let guard = 0;
    while (left > 0 && guard++ < 10000) {
      const i = b.seatStart + Math.floor(rand() * b.seatCount);
      if (seatAvailable[i] || forcedTaken.has(i)) continue;
      seatAvailable[i] = 1;
      left--;
    }
    let count = 0;
    for (let i = b.seatStart; i < b.seatStart + b.seatCount; i++) count += seatAvailable[i];
    blockLeft[b.index] = count;
  }

  const standLeft = {} as Record<StandId, number>;
  const standFromPrice = {} as Record<StandId, number>;
  for (const stand of STANDS) {
    const blocks = layout.blocksByStand[stand.id];
    standLeft[stand.id] = blocks.reduce((n, b) => n + blockLeft[b.index], 0);
    const open = blocks.filter((b) => blockLeft[b.index] > 0);
    standFromPrice[stand.id] = Math.min(...(open.length ? open : blocks).map(blockPrice));
  }

  const skyboxAvailable: Record<number, boolean> = {};
  const chairAvailable: Record<number, boolean[]> = {};
  for (const box of layout.skyboxes) {
    const avail = box.id === 12 ? true : box.id === 11 ? false : rand() > 0.5;
    skyboxAvailable[box.id] = avail;
    chairAvailable[box.id] = box.chairs.map((c) => avail && (box.id === 12 && c.n === 5 ? true : rand() > 0.3));
  }

  return { seatAvailable, blockLeft, standLeft, standFromPrice, skyboxAvailable, chairAvailable };
}
