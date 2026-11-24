'use client';
/**
 * Breadcrumbs: Stadium / North Stand / Block 232 / Row 10 Seat 8 / (VIP) Skyboxes / Skybox 12 / Seat 5.
 * Built locally from the store (the nav's breadcrumbs() helper may replace `useCrumbs`).
 * Each ancestor flies back to its level; compact mode shows only the current label.
 */
import { Fragment } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStadium, type StadiumLevel } from '@/store/stadium';
import { back, goToLevel } from '@/lib/stadium-nav';
import { STAND_BY_ID, seatInfo } from '@/lib/stadium-geometry';
import { INK, MUTED } from './ui-kit';

export interface Crumb {
  id: string;
  label: string;
  /** Undefined for the current crumb. */
  go?: () => void;
}

/** Depth of each level along its path (for "how many back() calls"). */
const VIP_DEPTH: Partial<Record<StadiumLevel, number>> = { skyboxes: 0, box: 1, boxView: 2 };

async function backTimes(n: number) {
  for (let i = 0; i < n; i++) await back();
}

export function useCrumbs(): Crumb[] {
  const s = useStadium(
    useShallow((st) => ({
      level: st.level,
      standId: st.standId,
      blockId: st.blockId,
      seatIndex: st.seatIndex,
      skyboxId: st.skyboxId,
      chair: st.chair,
    })),
  );
  const { level } = s;
  const crumbs: Crumb[] = [{ id: 'aerial', label: 'Stadium', go: () => void goToLevel('aerial') }];
  const deeper = (levels: StadiumLevel[]) => levels.includes(level);

  if (s.standId && level !== 'aerial') {
    crumbs.push({ id: 'stand', label: STAND_BY_ID[s.standId].name, go: () => void goToLevel('stand') });
  }
  if (s.blockId !== null && deeper(['block', 'ticket', 'seatView', 'skyboxes', 'box', 'boxView'])) {
    crumbs.push({ id: 'block', label: `Block ${s.blockId}`, go: () => void goToLevel('block') });
  }
  if (s.seatIndex !== null && deeper(['ticket', 'seatView', 'skyboxes', 'box', 'boxView'])) {
    const { row, seat } = seatInfo(s.seatIndex);
    crumbs.push({ id: 'ticket', label: `Row ${row} Seat ${seat}`, go: () => void goToLevel('ticket') });
  }
  if (level === 'seatView') crumbs.push({ id: 'seatView', label: 'Your view' });

  const vip = VIP_DEPTH[level];
  if (vip !== undefined) {
    crumbs.push({ id: 'skyboxes', label: 'VIP skyboxes', go: () => void backTimes(vip) });
    if (vip >= 1 && s.skyboxId !== null) {
      crumbs.push({ id: 'box', label: `Skybox ${s.skyboxId}`, go: () => void backTimes(vip - 1) });
    }
    if (vip >= 2 && s.chair !== null) crumbs.push({ id: 'boxView', label: `Seat ${s.chair}` });
  }

  // The last crumb is where we are: not a link.
  const last = crumbs[crumbs.length - 1];
  crumbs[crumbs.length - 1] = { id: last.id, label: last.label };
  return crumbs;
}

export function Breadcrumbs({ compact }: { compact: boolean }) {
  const crumbs = useCrumbs();
  const current = crumbs[crumbs.length - 1];

  if (compact) {
    return (
      <div
        aria-live="polite"
        className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em]"
        style={{ color: INK }}
      >
        {current.label}
      </div>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium">
        {crumbs.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 && (
              <li aria-hidden className="select-none text-[#16161a]/25">
                /
              </li>
            )}
            <li>
              {c.go ? (
                <button
                  type="button"
                  onClick={c.go}
                  className="rounded-md px-1 py-0.5 transition-colors hover:bg-[#16161a]/[0.05] hover:text-[#16161a] focus-visible:outline-2 focus-visible:outline-[#F26A21]"
                  style={{ color: MUTED }}
                >
                  {c.label}
                </button>
              ) : (
                <span aria-current="page" className="px-1 font-semibold" style={{ color: INK }}>
                  {c.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
