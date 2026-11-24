/**
 * Stadium navigation: state machine transitions + camera flights (owned by Interaction & Camera).
 *
 *   aerial → stand → block → ticket ─┬→ seatView
 *                                    └→ (vip face) skyboxes → box → boxView
 *
 * Every transition sets the store state immediately (UI reacts at once) and flies `director`
 * along an eased path (see lib/stadium-shots.ts). `transitioning` is true while flying; select
 * actions are ignored mid-flight, back()/goToLevel()/chooseAnotherSeat() interrupt and fly
 * from wherever the camera is. reducedMotion → instant cuts (UI crossfades).
 *
 * Rendering forwards pointer events to `pointer()`; UI calls the actions and reads `hoverAnchor`.
 */
import { gsap } from 'gsap';
import { create } from 'zustand';
import { useMemo } from 'react';
import { useStadium, sameTarget, type PickTarget, type StadiumLevel } from '@/store/stadium';
import {
  STANDS,
  STAND_BY_ID,
  getStadiumLayout,
  seatInfo,
  type StandId,
} from '@/lib/stadium-geometry';
import type { Shot, Vec3 } from '@/lib/venue-engine/types';
import { createCameraDirector, cloneShot, type CameraDirector } from '@/lib/venue-engine/shots';
import { createScreenAnchor, type ScreenAnchor } from '@/lib/venue-engine/anchor';
import {
  aerialAngleFor,
  anchorFor,
  copyShot,
  interpolateShots,
  lerpAngle,
  shotForState,
  tunedAerial,
  type ShotState,
} from '@/lib/stadium-shots';

/* ------------------------------------------------------------------ */
/* Shared objects                                                       */
/* ------------------------------------------------------------------ */

/** The camera director for the stadium (applied by StadiumCameraRig). */
export const director: CameraDirector = createCameraDirector(tunedAerial(0));
/** Anchor the HoverCard follows (projected by <ProjectAnchor anchor={hoverAnchor} /> in the canvas). */
export const hoverAnchor: ScreenAnchor = createScreenAnchor();

/** Mutable camera state shared with StadiumCameraRig (idle orbit). */
export const navCamera = {
  /** Current aerial orbit angle (rad); 0 = camera south of the stadium looking north. */
  orbitAngle: 0,
};

export interface NavSignals {
  /** Sold-out block clicked (UI shakes the card / block). `at` = performance.now(). */
  lastRejected: { blockId: number; at: number } | null;
  /** Any rejected selection (sold-out block, taken seat, sold-out box, taken chair). */
  rejected: { target: PickTarget; at: number } | null;
}

/** Small signal store for UI feedback that isn't booking state. */
export const useNavSignals = create<NavSignals>(() => ({ lastRejected: null, rejected: null }));

/** Level → which pick target type is interactive there. */
export const LEVEL_TARGET: Partial<Record<StadiumLevel, PickTarget['type']>> = {
  aerial: 'stand',
  stand: 'block',
  block: 'seat',
  skyboxes: 'skybox',
  box: 'chair',
};

type State = ReturnType<typeof useStadium.getState>;

/* ------------------------------------------------------------------ */
/* Availability helpers                                                 */
/* ------------------------------------------------------------------ */

function blockAvailable(id: number): boolean {
  const b = getStadiumLayout().blockById.get(id);
  if (!b) return false;
  const av = useStadium.getState().availability;
  return av ? av.blockLeft[b.index] > 0 : true;
}

function seatAvailable(i: number): boolean {
  const av = useStadium.getState().availability;
  return av ? av.seatAvailable[i] === 1 : true;
}

function skyboxAvailable(id: number): boolean {
  if (!getStadiumLayout().skyboxById.has(id)) return false;
  const av = useStadium.getState().availability;
  return av ? av.skyboxAvailable[id] !== false : true;
}

function chairAvailable(box: number, chair: number): boolean {
  const av = useStadium.getState().availability;
  return av ? av.chairAvailable[box]?.[chair - 1] === true : true;
}

function reject(target: PickTarget): void {
  const at = performance.now();
  useNavSignals.setState(
    target.type === 'block' ? { lastRejected: { blockId: target.blockId, at }, rejected: { target, at } } : { rejected: { target, at } },
  );
}

/** Is this target selectable right now (exists, belongs to the current level, available)? */
export function isSelectable(t: PickTarget): boolean {
  return belongsToLevel(t, useStadium.getState()) && available(t);
}

function available(t: PickTarget): boolean {
  switch (t.type) {
    case 'stand':
      return true;
    case 'block':
      return blockAvailable(t.blockId);
    case 'seat':
      return seatAvailable(t.seatIndex);
    case 'skybox':
      return skyboxAvailable(t.skyboxId);
    case 'chair':
      return chairAvailable(t.skyboxId, t.chair);
  }
}

function belongsToLevel(t: PickTarget, s: State): boolean {
  if (LEVEL_TARGET[s.level] !== t.type) return false;
  const L = getStadiumLayout();
  switch (t.type) {
    case 'stand':
      return t.standId in STAND_BY_ID;
    case 'block':
      return L.blockById.has(t.blockId);
    case 'seat': {
      if (t.seatIndex < 0 || t.seatIndex >= L.seatCount) return false;
      const b = L.blocks[L.seatBlock[t.seatIndex]];
      return b.id === s.blockId;
    }
    case 'skybox':
      return L.skyboxById.has(t.skyboxId);
    case 'chair':
      return t.skyboxId === s.skyboxId && t.chair >= 1 && t.chair <= (L.skyboxById.get(t.skyboxId)?.chairs.length ?? 0);
  }
}

/* ------------------------------------------------------------------ */
/* Flights                                                              */
/* ------------------------------------------------------------------ */

interface FlightOpts {
  duration: number;
  ease?: string;
  /** Ease for the look direction (default = ease). */
  turnEase?: string;
  /** Extra height mid-flight (m). */
  arc?: number;
  /** >1: camera turns early; <1: turn starts late (pull back first, then turn). */
  turnLead?: number;
  /** Moving start shot (aerial spiral dive). Must equal the current shot at t = 0. */
  from?: (t: number) => Shot;
}

let flightTween: gsap.core.Tween | null = null;
let flightResolve: ((done: boolean) => void) | null = null;
let flightToken = 0;

function stopFlight(): void {
  if (flightTween) flightTween.kill();
  flightTween = null;
  const r = flightResolve;
  flightResolve = null;
  r?.(false);
}

/** Fly the director to `to`. Resolves true when it lands, false when superseded. */
function fly(to: Shot, opts: FlightOpts): Promise<boolean> {
  stopFlight();
  director.kill();
  const token = ++flightToken;
  const target = cloneShot(to);
  if (useStadium.getState().reducedMotion || opts.duration <= 0) {
    director.jump(target);
    useStadium.setState({ transitioning: false });
    return Promise.resolve(true);
  }
  const start = cloneShot(director.current);
  const easeP = gsap.parseEase(opts.ease ?? 'power3.inOut');
  const easeO = gsap.parseEase(opts.turnEase ?? opts.ease ?? 'power3.inOut');
  const lead = opts.turnLead ?? 1.1;
  const arc = opts.arc ?? 0;
  const proxy = { t: 0 };
  useStadium.setState({ transitioning: true });
  director.flying = true;
  director.progress = 0;

  return new Promise<boolean>((resolve) => {
    flightResolve = resolve;
    const finish = () => {
      copyShot(director.current, target);
      director.flying = false;
      director.progress = 1;
      flightTween = null;
      flightResolve = null;
      if (token === flightToken) useStadium.setState({ transitioning: false });
      resolve(true);
    };
    flightTween = gsap.to(proxy, {
      t: 1,
      duration: opts.duration,
      ease: 'none',
      onUpdate: () => {
        const t = proxy.t;
        const ep = easeP(t);
        const eo = lead >= 1 ? easeO(Math.min(1, t * lead)) : easeO(Math.max(0, (t - (1 - lead)) / lead));
        const a = opts.from ? opts.from(t) : start;
        interpolateShots(a, target, ep, eo, arc, director.current);
        director.flying = true;
        director.progress = ep;
      },
      onComplete: finish,
    });
  });
}

function horizontalDist(a: Shot, b: Shot): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

function shotStateOf(s: State): ShotState {
  return { level: s.level, standId: s.standId, blockId: s.blockId, seatIndex: s.seatIndex, skyboxId: s.skyboxId, chair: s.chair };
}

/** Timing per transition (durations ~1.2–2.4 s, power3.inOut; seat rush 0.9 s power2.inOut). */
function flightFor(from: StadiumLevel, to: StadiumLevel, toShot: Shot): FlightOpts {
  const key = `${from}>${to}`;
  switch (key) {
    case 'stand>block':
      return { duration: 1.6, turnLead: 1.15 };
    case 'block>stand':
      return { duration: 1.5, arc: 2 };
    case 'block>ticket':
      return { duration: 0.9, ease: 'power2.inOut', turnLead: 1.0 };
    case 'ticket>block':
    case 'seatView>block':
      return { duration: 1.25, arc: 1.5 };
    case 'ticket>seatView':
      return { duration: 1.7, arc: 0.5, turnLead: 1.05 };
    case 'seatView>ticket':
      return { duration: 1.4, arc: 0.5 };
    case 'ticket>skyboxes':
    case 'seatView>skyboxes':
      return { duration: 2.1, arc: 3, turnLead: 0.8 };
    case 'skyboxes>ticket':
      return { duration: 1.8, arc: 2, turnLead: 1.15 };
    case 'skyboxes>box':
      return { duration: 1.6, ease: 'power2.inOut', turnLead: 1.0 };
    case 'box>skyboxes':
    case 'boxView>skyboxes':
      return { duration: 1.4, ease: 'power2.inOut' };
    case 'box>boxView':
      return { duration: 1.8, arc: 0.3, turnLead: 1.05 };
    case 'boxView>box':
      return { duration: 1.4, arc: 0.3 };
  }
  const d = horizontalDist(director.current, toShot) + Math.abs(director.current.position.y - toShot.position.y);
  return { duration: Math.min(2.4, Math.max(1.2, 1.1 + d / 140)), arc: Math.min(12, d * 0.08) };
}

/** Set store state (clearing hover) and fly to the shot of the new state. */
function navigate(patch: Partial<State>): Promise<boolean> {
  const prev = useStadium.getState();
  const fromLevel = prev.level;
  clearHover();
  useStadium.setState({ ...patch, hover: null, hoverPoint: null });
  const next = useStadium.getState();
  const toLevel = next.level;

  if (toLevel === 'aerial') {
    // Smooth reverse of the dive: rise along an arc to the aerial shot that keeps the current view direction.
    const angle = aerialAngleFor(director.current);
    navCamera.orbitAngle = angle;
    const shot = tunedAerial(angle);
    const fromStand = fromLevel === 'stand';
    return fly(shot, { duration: fromStand ? 2.2 : 2.4, arc: fromStand ? 20 : 45, turnLead: 1.0, ease: 'power3.inOut' });
  }

  const shot = shotForState(shotStateOf(next), navCamera.orbitAngle);
  if (!shot) return Promise.resolve(false);

  if (fromLevel === 'aerial' && !director.flying) {
    // Spiral dive: the start point orbits round to face the stand while the camera descends.
    const a0 = navCamera.orbitAngle;
    const a1 = aerialAngleFor(shot);
    const spin = gsap.parseEase('power2.inOut');
    return fly(shot, {
      duration: 2.2,
      arc: 20,
      turnLead: 1.15,
      from: (t) => tunedAerial(lerpAngle(a0, a1, spin(Math.min(1, t / 0.8)))),
    });
  }
  return fly(shot, flightFor(fromLevel, toLevel, shot));
}

/** Snap the camera to the resting shot of the current state (rig mount / resize). */
export function syncCameraToState(): void {
  if (director.flying) return;
  const shot = shotForState(shotStateOf(useStadium.getState()), navCamera.orbitAngle);
  if (shot) director.jump(shot);
}

/* ------------------------------------------------------------------ */
/* Hover                                                                */
/* ------------------------------------------------------------------ */

function setHover(t: PickTarget): void {
  const s = useStadium.getState();
  if (sameTarget(s.hover, t)) return;
  const p = anchorFor(t);
  useStadium.setState({ hover: t, hoverPoint: p });
  hoverAnchor.setWorld(p);
}

/** Clear the hover/preview (e.g. tap on empty space). */
export function clearHover(): void {
  const s = useStadium.getState();
  if (s.hover || s.hoverPoint) useStadium.setState({ hover: null, hoverPoint: null });
  hoverAnchor.setWorld(null);
}

/** Select a pick target at the current level (click / Enter / second tap / wheel-in). */
export async function selectTarget(t: PickTarget): Promise<void> {
  switch (t.type) {
    case 'stand':
      return selectStand(t.standId);
    case 'block':
      return selectBlock(t.blockId);
    case 'seat':
      return selectSeat(t.seatIndex);
    case 'skybox':
      return enterSkybox(t.skyboxId);
    case 'chair':
      return selectChair(t.chair);
  }
}

/** Pointer events from 3D meshes. kind 'tap' = touch tap. */
export function pointer(target: PickTarget, kind: 'over' | 'move' | 'out' | 'click' | 'tap', point?: Vec3): void {
  void point; // cards anchor to stable geometry points, not the raw ray hit
  const s = useStadium.getState();
  const touch = kind === 'tap' || (kind === 'click' && s.touchMode);

  if (kind === 'out') {
    if (s.touchMode) return; // touch previews persist until another tap
    if (sameTarget(s.hover, target)) clearHover();
    return;
  }
  if (s.transitioning || s.checkoutOpen) return;
  if (!belongsToLevel(target, s)) return;

  if (kind === 'over' || kind === 'move') {
    if (s.touchMode) return; // synthetic hover from taps; taps drive the preview
    setHover(target);
    return;
  }
  if (touch) {
    if (kind === 'tap' && !s.touchMode) useStadium.setState({ touchMode: true });
    if (sameTarget(s.hover, target)) void selectTarget(target);
    else setHover(target);
    return;
  }
  // click
  setHover(target);
  void selectTarget(target);
}

/* ------------------------------------------------------------------ */
/* Transitions                                                          */
/* ------------------------------------------------------------------ */

function busy(): boolean {
  const s = useStadium.getState();
  return s.transitioning || s.checkoutOpen;
}

export async function selectStand(id: StandId): Promise<void> {
  const s = useStadium.getState();
  if (busy() || !(id in STAND_BY_ID)) return;
  if (s.level !== 'aerial' && s.level !== 'stand') return;
  if (s.level === 'stand' && s.standId === id) return;
  await navigate({ level: 'stand', standId: id, blockId: null, seatIndex: null, skyboxId: null, chair: null, ticketFace: 'standard' });
}

export async function selectBlock(id: number): Promise<void> {
  const s = useStadium.getState();
  const b = getStadiumLayout().blockById.get(id);
  if (busy() || !b) return;
  if (s.level !== 'stand' && s.level !== 'block') return;
  if (!blockAvailable(id)) {
    reject({ type: 'block', blockId: id });
    return;
  }
  if (s.level === 'block' && s.blockId === id) return;
  await navigate({ level: 'block', standId: b.standId, blockId: id, seatIndex: null, skyboxId: null, chair: null });
}

export async function selectSeat(seatIndex: number): Promise<void> {
  const s = useStadium.getState();
  if (busy() || s.level !== 'block') return;
  if (!belongsToLevel({ type: 'seat', seatIndex }, s)) return;
  if (!seatAvailable(seatIndex)) {
    reject({ type: 'seat', seatIndex });
    return;
  }
  await navigate({ level: 'ticket', seatIndex, ticketFace: 'standard', skyboxId: null, chair: null });
}

/** Ticket view thumbnail clicked: fly into the seat eye and turn to the pitch. */
export async function openSeatView(): Promise<void> {
  const s = useStadium.getState();
  if (busy() || s.level !== 'ticket' || s.seatIndex === null) return;
  await navigate({ level: 'seatView' });
}

/** "Keep my seat" / "Confirm ticket" (standard). */
export function checkoutStandard(): void {
  useStadium.setState({ checkoutOpen: true, checkoutKind: 'standard' });
}

/** "Upgrade · +X AED": flip the ticket to its VIP face. */
export function showUpgrade(): void {
  useStadium.setState({ ticketFace: 'vip' });
}

/** "Keep my seat" from the VIP face. */
export function showStandardFace(): void {
  useStadium.setState({ ticketFace: 'standard' });
}

/** "Choose your VIP seat →": pull back out of the row, rise and turn to the skybox ring (Skybox 12). */
export async function chooseVipSeat(): Promise<void> {
  const s = useStadium.getState();
  if (busy() || (s.level !== 'ticket' && s.level !== 'seatView')) return;
  await navigate({ level: 'skyboxes', skyboxId: 12, chair: null, ticketFace: 'vip' });
}

export async function enterSkybox(id: number): Promise<void> {
  const s = useStadium.getState();
  if (busy() || s.level !== 'skyboxes') return;
  if (!skyboxAvailable(id)) {
    reject({ type: 'skybox', skyboxId: id });
    return;
  }
  await navigate({ level: 'box', skyboxId: id, chair: null });
}

/** Chair clicked inside a box: select it and turn to the pitch ("Another view"). */
export async function selectChair(chair: number): Promise<void> {
  const s = useStadium.getState();
  if (busy() || (s.level !== 'box' && s.level !== 'boxView') || s.skyboxId === null) return;
  if (!chairAvailable(s.skyboxId, chair)) {
    reject({ type: 'chair', skyboxId: s.skyboxId, chair });
    return;
  }
  if (s.level === 'boxView' && s.chair === chair) return;
  await navigate({ level: 'boxView', chair });
}

/** "Confirm ticket" from the VIP pitch view. */
export function checkoutVip(): void {
  useStadium.setState({ checkoutOpen: true, checkoutKind: 'vip' });
}

/** "Choose another seat": back to the block level (or the skybox ring in VIP). */
export async function chooseAnotherSeat(): Promise<void> {
  const s = useStadium.getState();
  if (s.checkoutOpen) return;
  if (s.level === 'box' || s.level === 'boxView') {
    await navigate({ level: 'skyboxes', chair: null });
    return;
  }
  if ((s.level === 'ticket' || s.level === 'seatView' || s.level === 'skyboxes') && s.blockId !== null) {
    await navigate({ level: 'block', seatIndex: null, ticketFace: 'standard', skyboxId: null, chair: null });
  }
}

/** One level up (Esc / back button). Interrupts a running flight. */
export async function back(): Promise<void> {
  const s = useStadium.getState();
  if (s.checkoutOpen) return;
  switch (s.level) {
    case 'boxView':
      await navigate({ level: 'box', chair: null });
      return;
    case 'box':
      await navigate({ level: 'skyboxes', chair: null });
      return;
    case 'skyboxes':
      if (s.seatIndex !== null) await navigate({ level: 'ticket', ticketFace: 'vip', skyboxId: null, chair: null });
      else await navigate({ level: 'aerial', standId: null, blockId: null, skyboxId: null, chair: null });
      return;
    case 'seatView':
      await navigate({ level: 'ticket' });
      return;
    case 'ticket':
      await navigate({ level: 'block', seatIndex: null, ticketFace: 'standard', skyboxId: null, chair: null });
      return;
    case 'block':
      await navigate({ level: 'stand', blockId: null, seatIndex: null });
      return;
    case 'stand':
      await navigate({ level: 'aerial', standId: null, blockId: null, seatIndex: null, skyboxId: null, chair: null, ticketFace: 'standard' });
      return;
    case 'aerial':
      clearHover();
      return;
  }
}

/** Jump to a level via breadcrumbs: flies directly there, clearing deeper selections. */
export async function goToLevel(level: StadiumLevel): Promise<void> {
  const s = useStadium.getState();
  if (s.checkoutOpen || level === s.level) return;
  const vipPath = s.level === 'skyboxes' || s.level === 'box' || s.level === 'boxView';
  switch (level) {
    case 'aerial':
      await navigate({ level: 'aerial', standId: null, blockId: null, seatIndex: null, skyboxId: null, chair: null, ticketFace: 'standard' });
      return;
    case 'stand':
      if (s.standId) await navigate({ level: 'stand', blockId: null, seatIndex: null, skyboxId: null, chair: null, ticketFace: 'standard' });
      return;
    case 'block':
      if (s.blockId !== null) await navigate({ level: 'block', seatIndex: null, skyboxId: null, chair: null, ticketFace: 'standard' });
      return;
    case 'ticket':
      if (s.seatIndex !== null) await navigate({ level: 'ticket', skyboxId: null, chair: null, ticketFace: vipPath ? 'vip' : s.ticketFace });
      return;
    case 'seatView':
      if (s.seatIndex !== null) await navigate({ level: 'seatView', skyboxId: null, chair: null });
      return;
    case 'skyboxes':
      if (vipPath) await navigate({ level: 'skyboxes', chair: null });
      return;
    case 'box':
      if (s.skyboxId !== null && vipPath) await navigate({ level: 'box', chair: null });
      return;
    case 'boxView':
      if (s.skyboxId !== null && s.chair !== null) await navigate({ level: 'boxView' });
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Keyboard highlight                                                   */
/* ------------------------------------------------------------------ */

export type HighlightDir = 'left' | 'right' | 'up' | 'down';

function viewDirXZ(): { x: number; z: number } {
  const c = director.current;
  const x = c.target.x - c.position.x;
  const z = c.target.z - c.position.z;
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

/** Map an index across rows/tiers of different lengths, proportionally. */
function remap(i: number, n: number, m: number): number {
  return Math.max(0, Math.min(m - 1, Math.round(((i + 0.5) / n) * m - 0.5)));
}

function defaultHighlight(s: State): PickTarget | null {
  const L = getStadiumLayout();
  switch (s.level) {
    case 'aerial': {
      // The stand facing the camera (far side of the bowl).
      const v = viewDirXZ();
      let best: StandId = 'N';
      let bestDot = -Infinity;
      for (const st of STANDS) {
        const a = (st.a0 + st.a1) / 2;
        const dot = Math.cos(a) * v.x + Math.sin(a) * v.z;
        if (dot > bestDot) {
          bestDot = dot;
          best = st.id;
        }
      }
      return { type: 'stand', standId: best };
    }
    case 'stand': {
      if (!s.standId) return null;
      const blocks = L.blocksByStand[s.standId].filter((b) => b.tier === 2);
      const b = blocks[Math.floor(blocks.length / 2)] ?? L.blocksByStand[s.standId][0];
      return b ? { type: 'block', blockId: b.id } : null;
    }
    case 'block': {
      const b = s.blockId !== null ? L.blockById.get(s.blockId) : undefined;
      if (!b) return null;
      const r = Math.floor(b.rows / 2);
      return { type: 'seat', seatIndex: b.rowStart[r] + Math.floor(b.seatsPerRow[r] / 2) };
    }
    case 'skyboxes':
      return { type: 'skybox', skyboxId: s.skyboxId ?? 12 };
    case 'box': {
      if (s.skyboxId === null) return null;
      const av = s.availability?.chairAvailable[s.skyboxId];
      const first = av ? av.findIndex(Boolean) : 0;
      return { type: 'chair', skyboxId: s.skyboxId, chair: (first >= 0 ? first : 0) + 1 };
    }
    default:
      return null;
  }
}

function step(t: PickTarget, dir: HighlightDir, s: State): PickTarget | null {
  const L = getStadiumLayout();
  const h = dir === 'right' ? 1 : dir === 'left' ? -1 : 0;
  const v = dir === 'up' ? 1 : dir === 'down' ? -1 : 0;
  switch (t.type) {
    case 'stand': {
      // Clockwise order; right/down = clockwise.
      const i = STANDS.findIndex((x) => x.id === t.standId);
      const d = h !== 0 ? h : -v;
      return { type: 'stand', standId: STANDS[(i + d + STANDS.length) % STANDS.length].id };
    }
    case 'block': {
      const b = L.blockById.get(t.blockId);
      if (!b) return null;
      const all = L.blocksByStand[b.standId];
      const inTier = (tier: number) => all.filter((x) => x.tier === tier).sort((p, q) => p.pos - q.pos);
      if (h !== 0) {
        const row = inTier(b.tier);
        const n = row[Math.max(0, Math.min(row.length - 1, b.pos + h))];
        return { type: 'block', blockId: n.id };
      }
      const tier = b.tier + v;
      if (tier < 1 || tier > 3) return t;
      const row = inTier(tier);
      if (!row.length) return t;
      const cur = inTier(b.tier);
      return { type: 'block', blockId: row[remap(b.pos, cur.length, row.length)].id };
    }
    case 'seat': {
      const blk = L.blocks[L.seatBlock[t.seatIndex]];
      const r = L.seatRow[t.seatIndex] - 1;
      const j = t.seatIndex - blk.rowStart[r];
      if (h !== 0) {
        const nj = Math.max(0, Math.min(blk.seatsPerRow[r] - 1, j + h));
        return { type: 'seat', seatIndex: blk.rowStart[r] + nj };
      }
      const nr = r + v;
      if (nr < 0 || nr >= blk.rows) return t;
      return { type: 'seat', seatIndex: blk.rowStart[nr] + remap(j, blk.seatsPerRow[r], blk.seatsPerRow[nr]) };
    }
    case 'skybox': {
      const box = L.skyboxById.get(t.skyboxId);
      if (!box || h === 0) return t;
      const side = L.skyboxes.filter((x) => x.side === box.side);
      const k = side.findIndex((x) => x.id === box.id);
      return { type: 'skybox', skyboxId: side[Math.max(0, Math.min(side.length - 1, k + h))].id };
    }
    case 'chair': {
      // Seen from the glass the chairs face us: screen-right = spectator's left = lower c.
      const row = t.chair > 4 ? 1 : 0;
      const c = (t.chair - 1) % 4;
      const nc = Math.max(0, Math.min(3, c - h));
      const nrow = Math.max(0, Math.min(1, row + v));
      void s;
      return { type: 'chair', skyboxId: t.skyboxId, chair: nrow * 4 + nc + 1 };
    }
  }
}

/** Arrow keys: move the hover highlight at the current level (shows the card). */
export function moveHighlight(dir: HighlightDir): void {
  const s = useStadium.getState();
  if (s.transitioning || s.checkoutOpen) return;
  const type = LEVEL_TARGET[s.level];
  if (!type) return;
  const cur = s.hover && s.hover.type === type && belongsToLevel(s.hover, s) ? s.hover : null;
  const next = cur ? step(cur, dir, s) : defaultHighlight(s);
  if (next) setHover(next);
}

/** Enter: select the highlighted target (rejections give the sold-out / taken feedback). */
export function activateHighlight(): void {
  const s = useStadium.getState();
  if (s.hover && belongsToLevel(s.hover, s)) void selectTarget(s.hover);
}

/** Wheel / pinch past the threshold: go one level deeper into the hovered target, if any. */
export function deeperIntoHover(): boolean {
  const s = useStadium.getState();
  if (busy() || !s.hover || !isSelectable(s.hover)) return false;
  void selectTarget(s.hover);
  return true;
}

/* ------------------------------------------------------------------ */
/* Breadcrumbs                                                          */
/* ------------------------------------------------------------------ */

export interface Breadcrumb {
  label: string;
  level: StadiumLevel;
  /** Last crumb = where the user is. */
  current: boolean;
}

type CrumbState = Pick<State, 'level' | 'standId' | 'blockId' | 'seatIndex' | 'skyboxId' | 'chair'>;

const DEPTH: Record<StadiumLevel, number> = {
  aerial: 0,
  stand: 1,
  block: 2,
  ticket: 3,
  seatView: 3,
  skyboxes: 4,
  box: 5,
  boxView: 6,
};

/** e.g. Stadium / North Stand / Block 232 / Row 10 Seat 8 / Skybox 12 / Seat 5. */
export function breadcrumbs(state: CrumbState = useStadium.getState()): Breadcrumb[] {
  const d = DEPTH[state.level];
  const out: Array<{ label: string; level: StadiumLevel }> = [{ label: 'Stadium', level: 'aerial' }];
  if (d >= 1 && state.standId) out.push({ label: STAND_BY_ID[state.standId].name, level: 'stand' });
  if (d >= 2 && state.blockId !== null) out.push({ label: `Block ${state.blockId}`, level: 'block' });
  if (d >= 3 && state.seatIndex !== null) {
    const info = seatInfo(state.seatIndex);
    out.push({ label: `Row ${info.row} Seat ${info.seat}`, level: state.level === 'seatView' ? 'seatView' : 'ticket' });
  }
  if (state.level === 'skyboxes') out.push({ label: 'VIP Skyboxes', level: 'skyboxes' });
  if (d >= 5 && state.skyboxId !== null) out.push({ label: `Skybox ${state.skyboxId}`, level: 'box' });
  if (d >= 6 && state.chair !== null) out.push({ label: `Seat ${state.chair}`, level: 'boxView' });
  return out.map((c, i) => ({ ...c, current: i === out.length - 1 }));
}

/** Reactive breadcrumbs for the UI. */
export function useBreadcrumbs(): Breadcrumb[] {
  const level = useStadium((s) => s.level);
  const standId = useStadium((s) => s.standId);
  const blockId = useStadium((s) => s.blockId);
  const seatIndex = useStadium((s) => s.seatIndex);
  const skyboxId = useStadium((s) => s.skyboxId);
  const chair = useStadium((s) => s.chair);
  return useMemo(
    () => breadcrumbs({ level, standId, blockId, seatIndex, skyboxId, chair }),
    [level, standId, blockId, seatIndex, skyboxId, chair],
  );
}
