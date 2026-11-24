'use client';
/**
 * Camera "shot" system shared by venues.
 *
 * A CameraDirector holds the current Shot (position / target / fov) as plain numbers.
 * `flyTo` tweens it with GSAP (never touching the three.js camera); `useDirectedCamera`
 * applies it to the R3F camera every frame. `speed` (m/s) is exposed so post effects
 * can add blur during fast flights.
 */
import { gsap } from 'gsap';
import { useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import type { Shot, Vec3 } from './types';

export function cloneShot(s: Shot): Shot {
  return { position: { ...s.position }, target: { ...s.target }, fov: s.fov };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(out: Vec3, a: Vec3, b: Vec3, t: number): void {
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
}

export function lerpShot(out: Shot, a: Shot, b: Shot, t: number): Shot {
  lerpVec(out.position, a.position, b.position, t);
  lerpVec(out.target, a.target, b.target, t);
  out.fov = lerp(a.fov, b.fov, t);
  return out;
}

export function shotDistance(a: Shot, b: Shot): number {
  const p = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
  const t = Math.hypot(a.target.x - b.target.x, a.target.y - b.target.y, a.target.z - b.target.z);
  return Math.max(p, t * 0.6);
}

export interface FlyOptions {
  /** Seconds. Default scales with distance (about 1.0 to 2.6 s). */
  duration?: number;
  ease?: string;
  /** Extra height (m) added mid-flight along a sine arc, for "rise then dive" moves. */
  arc?: number;
  /** Target leads/lags position: >1 turns the camera earlier (default 1.15). */
  turnLead?: number;
  /** Instant cut (used for prefers-reduced-motion; the UI crossfades instead). */
  instant?: boolean;
}

export interface CameraDirector {
  /** The shot applied to the camera this frame (mutated in place while flying). */
  readonly current: Shot;
  /** Camera speed in m/s during the last frame (0 when still). */
  speed: number;
  /** 0..1 progress of the running flight, or 1 when idle. */
  progress: number;
  flying: boolean;
  flyTo(shot: Shot, opts?: FlyOptions): Promise<void>;
  /** Cut to a shot immediately (kills any flight). */
  jump(shot: Shot): void;
  kill(): void;
}

export function createCameraDirector(initial: Shot): CameraDirector {
  const from = cloneShot(initial);
  const to = cloneShot(initial);
  const proxy = { t: 1 };
  let tween: gsap.core.Tween | null = null;
  let waiters: Array<() => void> = [];
  let arc = 0;
  let lead = 1.15;

  const flush = () => {
    const w = waiters;
    waiters = [];
    w.forEach((fn) => fn());
  };

  const director: CameraDirector = {
    current: cloneShot(initial),
    speed: 0,
    progress: 1,
    flying: false,

    flyTo(shot, opts = {}) {
      if (tween) tween.kill();
      flush();
      Object.assign(from, cloneShot(director.current));
      Object.assign(to, cloneShot(shot));
      if (opts.instant) {
        director.jump(shot);
        return Promise.resolve();
      }
      arc = opts.arc ?? 0;
      lead = opts.turnLead ?? 1.15;
      const duration = opts.duration ?? Math.min(2.6, Math.max(1.0, 0.85 + shotDistance(from, to) / 160));
      proxy.t = 0;
      director.flying = true;
      director.progress = 0;
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        tween = gsap.to(proxy, {
          t: 1,
          duration,
          ease: opts.ease ?? 'power3.inOut',
          onUpdate: () => {
            const t = proxy.t;
            director.progress = t;
            lerpVec(director.current.position, from.position, to.position, t);
            director.current.position.y += arc * Math.sin(Math.PI * t);
            // The look target leads slightly, so the camera "turns into" the move.
            lerpVec(director.current.target, from.target, to.target, Math.min(1, t * lead));
            director.current.fov = lerp(from.fov, to.fov, t);
          },
          onComplete: () => {
            tween = null;
            director.flying = false;
            director.progress = 1;
            flush();
          },
        });
      });
    },

    jump(shot) {
      if (tween) tween.kill();
      tween = null;
      Object.assign(director.current.position, shot.position);
      Object.assign(director.current.target, shot.target);
      director.current.fov = shot.fov;
      director.flying = false;
      director.progress = 1;
      flush();
    },

    kill() {
      if (tween) tween.kill();
      tween = null;
      director.flying = false;
      flush();
    },
  };
  return director;
}

/**
 * Applies a director's current shot to the R3F default camera every frame.
 * `offset` lets callers add small extra motion (idle orbit, wheel zoom) on top.
 */
export function useDirectedCamera(
  director: CameraDirector,
  offset?: (shot: Shot, dt: number) => Shot,
): void {
  const last = { x: 0, y: 0, z: 0, init: false };
  useFrame((state, dt) => {
    const cam = state.camera as PerspectiveCamera;
    const shot = offset ? offset(director.current, dt) : director.current;
    const p = shot.position;
    if (last.init && dt > 0) {
      director.speed = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) / dt;
    }
    last.x = p.x;
    last.y = p.y;
    last.z = p.z;
    last.init = true;
    cam.position.set(p.x, p.y, p.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
    if (cam.isPerspectiveCamera && Math.abs(cam.fov - shot.fov) > 1e-3) {
      cam.fov = shot.fov;
      cam.updateProjectionMatrix();
    }
  });
}
