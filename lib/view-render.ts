/**
 * Seat-view images rendered from the REAL 3D scene (never stock photos).
 *
 * API
 *  - `requestView(req)` → Promise<string | null>: an image URL (object URL of a JPEG blob, data-URL
 *    fallback) of the scene seen through `req.shot` at `req.width × req.height` CSS px. Resolves null
 *    when WebGL is unavailable or no <ViewRenderer /> is mounted within ~3 s (not cached → retried later).
 *  - `useViewImage(req | null)` → string | null: React hook; null while rendering / for a null req.
 *    Re-requests when `req.key` (or the size) changes. Keys starting with "seat:" at thumbnail size
 *    (≤ 256 CSS px wide) are debounced 120 ms so sweeping the mouse over seats doesn't queue renders.
 *    SSR-safe (no window access at import time; server snapshot is null).
 *  - `<ViewRenderer />` (components/stadium/ViewRenderer.tsx) must be mounted inside the R3F Canvas;
 *    it drains this queue one job at a time after the main render.
 *
 * Images are rendered small and upscaled by the DOM: pixel width = width × min(dpr, 2), capped at
 * 256 px for thumbnails (req.width ≤ 256) and 720 px otherwise. Same `key` must mean same view.
 *
 * Cache: LRU of ~64 entries keyed by `${key}|${pxW}x${pxH}`; evicted object URLs are revoked, except
 * entries currently shown by a mounted `useViewImage` (pinned). Concurrent requests for the same key
 * share one job. Pending jobs run newest-first (the seat under the cursor wins); hook-only jobs whose
 * component unmounted before rendering are dropped.
 *
 * The render shows the scene in its CURRENT state (e.g. the hovered seat's highlight tint can be
 * visible in a thumbnail rendered from a neighbouring seat). Accepted; DOM UI is never in the image.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { Shot } from '@/lib/venue-engine/types';

export interface ViewRequest {
  /** Cache key, e.g. "seat:3592" or "box:12:5". */
  key: string;
  shot: Shot;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* Sizing                                                               */
/* ------------------------------------------------------------------ */

const THUMB_CSS_MAX = 256;
const THUMB_PX_MAX = 256;
const TICKET_PX_MAX = 720;
const CACHE_MAX = 64;
const HOST_TIMEOUT_MS = 3000;
const THUMB_DEBOUNCE_MS = 120;

function pixelSize(req: ViewRequest): { w: number; h: number } | null {
  if (!(req.width > 0) || !(req.height > 0)) return null;
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const cap = req.width <= THUMB_CSS_MAX ? THUMB_PX_MAX : TICKET_PX_MAX;
  const w = Math.max(16, Math.min(cap, Math.round(req.width * dpr)));
  const h = Math.max(16, Math.round((w * req.height) / req.width));
  return { w, h };
}

function jobIdOf(req: ViewRequest): string | null {
  const s = pixelSize(req);
  return s ? `${req.key}|${s.w}x${s.h}` : null;
}

/* ------------------------------------------------------------------ */
/* Cache (LRU) + external store                                         */
/* ------------------------------------------------------------------ */

const cache = new Map<string, string>(); // insertion order = LRU order (oldest first)
const pins = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function revoke(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

function cachePut(id: string, url: string) {
  const old = cache.get(id);
  if (old && old !== url) revoke(old);
  cache.delete(id);
  cache.set(id, url);
  if (cache.size > CACHE_MAX) {
    for (const [k, u] of cache) {
      if (cache.size <= CACHE_MAX) break;
      if ((pins.get(k) ?? 0) > 0) continue;
      cache.delete(k);
      revoke(u);
    }
  }
}

function cacheTouch(id: string): string | null {
  const url = cache.get(id);
  if (url === undefined) return null;
  cache.delete(id);
  cache.set(id, url);
  return url;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/* ------------------------------------------------------------------ */
/* Job queue                                                            */
/* ------------------------------------------------------------------ */

/** Internal: a pending render, consumed by <ViewRenderer />. */
export interface ViewJob {
  id: string;
  shot: Shot;
  /** Render size in device pixels. */
  pxW: number;
  pxH: number;
  /** Promise callers (non-cancellable). */
  waiters: Array<(url: string | null) => void>;
  /** Hook subscribers (cancellable). */
  leases: number;
  seq: number;
  started: boolean;
}

/** Internal: the mounted renderer. */
export interface ViewHost {
  /** Ask the frame loop for a frame (frameloop="demand"). */
  wake: () => void;
}

const jobs = new Map<string, ViewJob>();
let seqCounter = 0;
let host: ViewHost | null = null;
let hostTimer: ReturnType<typeof setTimeout> | null = null;

function armHostTimeout() {
  if (host || hostTimer || typeof window === 'undefined') return;
  hostTimer = setTimeout(() => {
    hostTimer = null;
    if (host) return;
    // No renderer (WebGL unavailable / canvas not mounted): fail everything not yet started.
    for (const job of [...jobs.values()]) if (!job.started) finishViewJob(job, null);
  }, HOST_TIMEOUT_MS);
}

function ensureJob(req: ViewRequest, id: string): ViewJob {
  let job = jobs.get(id);
  if (!job) {
    const s = pixelSize(req)!;
    job = { id, shot: req.shot, pxW: s.w, pxH: s.h, waiters: [], leases: 0, seq: 0, started: false };
    jobs.set(id, job);
  }
  job.seq = ++seqCounter; // newest request first
  if (host) host.wake();
  else armHostTimeout();
  return job;
}

/** Resolves with an image URL, or null if rendering is unavailable. */
export function requestView(req: ViewRequest): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const id = jobIdOf(req);
  if (!id) return Promise.resolve(null);
  const hit = cacheTouch(id);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    ensureJob(req, id).waiters.push(resolve);
  });
}

function leaseView(req: ViewRequest, id: string): () => void {
  const job = ensureJob(req, id);
  job.leases++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    job.leases--;
    if (!job.started && job.leases <= 0 && job.waiters.length === 0 && jobs.get(id) === job) jobs.delete(id);
  };
}

/** Internal (ViewRenderer): register the renderer; returns an unregister fn. */
export function registerViewHost(h: ViewHost): () => void {
  host = h;
  if (hostTimer) {
    clearTimeout(hostTimer);
    hostTimer = null;
  }
  if (jobs.size) h.wake();
  return () => {
    if (host !== h) return;
    host = null;
    // Jobs that were mid-render on the old host will never finish: requeue them.
    for (const job of jobs.values()) job.started = false;
    if (jobs.size) armHostTimeout();
  };
}

/** Internal (ViewRenderer): newest pending job, marked started; null if none. */
export function takeNextViewJob(): ViewJob | null {
  let best: ViewJob | null = null;
  for (const job of jobs.values()) if (!job.started && (!best || job.seq > best.seq)) best = job;
  if (best) best.started = true;
  return best;
}

export function hasPendingViewJobs(): boolean {
  for (const job of jobs.values()) if (!job.started) return true;
  return false;
}

/** Internal (ViewRenderer): deliver a result (null = failed, not cached). */
export function finishViewJob(job: ViewJob, url: string | null) {
  if (jobs.get(job.id) === job) jobs.delete(job.id);
  if (url) {
    // Nobody wants it any more and nothing references it: still cache it (cheap, likely re-hovered).
    cachePut(job.id, url);
    emit();
  }
  for (const w of job.waiters) w(url);
  job.waiters.length = 0;
}

/* ------------------------------------------------------------------ */
/* Pixels → URL                                                         */
/* ------------------------------------------------------------------ */

let encodeCanvas: HTMLCanvasElement | null = null;

/** Internal (ViewRenderer): bottom-up RGBA pixels (GL order) → JPEG object URL (data URL fallback). */
export async function pixelsToUrl(pixels: Uint8Array, w: number, h: number): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  encodeCanvas ??= document.createElement('canvas');
  const cv = encodeCanvas;
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  const dst = img.data;
  const row = w * 4;
  for (let y = 0; y < h; y++) dst.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row); // flip Y
  for (let i = 3; i < dst.length; i += 4) dst[i] = 255; // opaque (blended glass can leave alpha < 1)
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      cv.toBlob(resolve, 'image/jpeg', 0.9);
    } catch {
      resolve(null);
    }
  });
  if (blob) return URL.createObjectURL(blob);
  try {
    return cv.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Timings (debug)                                                      */
/* ------------------------------------------------------------------ */

export interface ViewRenderStats {
  count: number;
  /** CPU time of the scene render (+ tone pass) on the main thread, ms. */
  lastRenderMs: number;
  /** GPU readback wait (async, off the main thread), ms. */
  lastReadMs: number;
  /** Flip + JPEG encode, ms. */
  lastEncodeMs: number;
  /** Request picked → URL ready, ms. */
  lastTotalMs: number;
  avgRenderMs: number;
  avgTotalMs: number;
}

export const viewRenderStats: ViewRenderStats = {
  count: 0,
  lastRenderMs: 0,
  lastReadMs: 0,
  lastEncodeMs: 0,
  lastTotalMs: 0,
  avgRenderMs: 0,
  avgTotalMs: 0,
};

export function recordViewTiming(renderMs: number, readMs: number, encodeMs: number, totalMs: number) {
  const s = viewRenderStats;
  s.count++;
  s.lastRenderMs = renderMs;
  s.lastReadMs = readMs;
  s.lastEncodeMs = encodeMs;
  s.lastTotalMs = totalMs;
  s.avgRenderMs += (renderMs - s.avgRenderMs) / s.count;
  s.avgTotalMs += (totalMs - s.avgTotalMs) / s.count;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

const serverSnapshot = () => null;

/** React hook: the image URL for a request (null while rendering). */
export function useViewImage(req: ViewRequest | null): string | null {
  const id = req && typeof window !== 'undefined' ? jobIdOf(req) : null;
  const url = useSyncExternalStore(subscribe, () => (id ? (cache.get(id) ?? null) : null), serverSnapshot);

  useEffect(() => {
    if (!id || !req) return;
    pins.set(id, (pins.get(id) ?? 0) + 1);
    let release: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (cacheTouch(id) === null) {
      const start = () => {
        timer = null;
        if (cache.has(id)) return;
        release = leaseView(req, id);
      };
      const debounce = req.key.startsWith('seat:') && req.width <= THUMB_CSS_MAX && !jobs.has(id);
      if (debounce) timer = setTimeout(start, THUMB_DEBOUNCE_MS);
      else start();
    }
    return () => {
      if (timer) clearTimeout(timer);
      release?.();
      const n = (pins.get(id) ?? 1) - 1;
      if (n > 0) pins.set(id, n);
      else pins.delete(id);
    };
    // `req.key` + size (in `id`) identify the view; a new shot object with the same key is the same view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return url;
}
