/**
 * STUB — owned by the View-render agent, who replaces this file (keep the signatures).
 * Renders the real 3D view from a seat into an image (object URL / data URL), cached per key.
 */
import type { Shot } from '@/lib/venue-engine/types';

export interface ViewRequest {
  /** Cache key, e.g. "seat:3592" or "box:12:5". */
  key: string;
  shot: Shot;
  width: number;
  height: number;
}

/** Resolves with an image URL, or null if rendering is unavailable. */
export function requestView(req: ViewRequest): Promise<string | null> {
  void req;
  return Promise.resolve(null);
}

/** React hook: the image URL for a request (null while rendering). */
export function useViewImage(req: ViewRequest | null): string | null {
  void req;
  return null;
}
