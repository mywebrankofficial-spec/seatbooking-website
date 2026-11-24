/** Capability checks for the 3D hall (client only; safe to call during SSR). */

let webglCache: boolean | null = null;

/** True when a WebGL (2 or 1) context can be created. Cached after the first call. */
export function isWebGLAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    webglCache = !!(window.WebGLRenderingContext && gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/** Max device pixel ratio we render at. */
export const MAX_DPR = 2;
/** Pixel ratio range used after the performance monitor reports a sustained fps drop. */
export const DEGRADED_DPR: [number, number] = [1, 1.25];

/**
 * Whether the bloom composer is worth its cost on this device: skipped on
 * low core counts / low memory and when the backbuffer would be huge.
 */
export function shouldUseBloom(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.hardwareConcurrency ?? 8) <= 4) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  // The canvas lives in a <= 430 px column; guard anyway against huge buffers.
  const w = Math.min(window.innerWidth, 430) * dpr;
  const h = window.innerHeight * dpr;
  return w * h <= 3_000_000;
}

/** MSAA samples for the composer's render target (canvas antialias does not apply there). */
export function composerSamples(): number {
  if (typeof window === 'undefined') return 0;
  return (window.devicePixelRatio || 1) >= 2 ? 2 : 4;
}
