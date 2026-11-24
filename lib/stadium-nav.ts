/**
 * STUB — owned by the Interaction & Camera agent, who replaces this file.
 * Keep every exported signature. Rendering forwards pointer events here; UI calls the actions.
 */
import { useStadium, type PickTarget } from '@/store/stadium';
import type { StandId } from '@/lib/stadium-geometry';
import type { Vec3 } from '@/lib/venue-engine/types';
import { createCameraDirector, type CameraDirector } from '@/lib/venue-engine/shots';
import { aerialShot } from '@/lib/stadium-geometry';
import { createScreenAnchor, type ScreenAnchor } from '@/lib/venue-engine/anchor';

/** The camera director for the stadium (applied by StadiumCameraRig). */
export const director: CameraDirector = createCameraDirector(aerialShot());
/** Anchor the HoverCard follows (projected by <ProjectAnchor anchor={hoverAnchor} /> in the canvas). */
export const hoverAnchor: ScreenAnchor = createScreenAnchor();

/** Pointer events from 3D meshes. kind 'tap' = touch tap. */
export function pointer(target: PickTarget, kind: 'over' | 'move' | 'out' | 'click' | 'tap', point?: Vec3): void {
  if (kind === 'out') {
    useStadium.setState({ hover: null, hoverPoint: null });
    hoverAnchor.setWorld(null);
    return;
  }
  useStadium.setState({ hover: target, hoverPoint: point ?? null });
  if (point) hoverAnchor.setWorld(point);
}

export async function selectStand(id: StandId): Promise<void> {
  useStadium.setState({ level: 'stand', standId: id });
}
export async function selectBlock(id: number): Promise<void> {
  useStadium.setState({ level: 'block', blockId: id });
}
export async function selectSeat(seatIndex: number): Promise<void> {
  useStadium.setState({ level: 'ticket', seatIndex, ticketFace: 'standard' });
}
/** Ticket view thumbnail clicked: fly into the seat eye and turn to the pitch. */
export async function openSeatView(): Promise<void> {
  useStadium.setState({ level: 'seatView' });
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
/** "Choose your VIP seat →": fly out to the skybox ring. */
export async function chooseVipSeat(): Promise<void> {
  useStadium.setState({ level: 'skyboxes', skyboxId: 12 });
}
export async function enterSkybox(id: number): Promise<void> {
  useStadium.setState({ level: 'box', skyboxId: id });
}
/** Chair clicked inside a box: select it and turn to the pitch ("Another view"). */
export async function selectChair(chair: number): Promise<void> {
  useStadium.setState({ level: 'boxView', chair });
}
/** "Confirm ticket" from the VIP pitch view. */
export function checkoutVip(): void {
  useStadium.setState({ checkoutOpen: true, checkoutKind: 'vip' });
}
/** "Choose another seat": back to the block level (or skybox ring in VIP). */
export async function chooseAnotherSeat(): Promise<void> {
  useStadium.setState({ level: 'block' });
}
/** One level up (Esc / back button). */
export async function back(): Promise<void> {
  useStadium.setState({ level: 'aerial' });
}
/** Jump to a level via breadcrumbs (always flies). */
export async function goToLevel(level: 'aerial' | 'stand' | 'block' | 'ticket'): Promise<void> {
  useStadium.setState({ level });
}
