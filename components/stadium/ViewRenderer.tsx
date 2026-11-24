'use client';
/**
 * <ViewRenderer /> — mount inside the stadium's R3F <Canvas> (booking mode). Services
 * `requestView()` / `useViewImage()` from lib/view-render.ts by rendering the REAL scene from the
 * requested seat shot into an offscreen render target and reading the pixels back.
 *
 * Scheduling: an R3F after-effect (runs after the main render / postprocessing composer of the frame,
 * without taking over the render loop the way a positive useFrame priority would) starts at most one
 * job every 2 frames and ≥ 60 ms apart; the next job starts only when the previous readback finished.
 *
 * Pipeline (no new shader variants are compiled — the render reuses the main render's programs):
 *  - Plain renderer (gl.toneMapping ≠ None): render into an RGBA8 MSAA target flagged
 *    `isXRRenderTarget`, which makes three apply the renderer's tone mapping + output colour space
 *    exactly as on screen.
 *  - Composer active (it forces gl.toneMapping = None and tone-maps in a pass): render linear HDR into
 *    a HalfFloat MSAA target (same programs as the composer's RenderPass), then a tiny full-screen pass
 *    applies `toneMapping` (default ACES, like the composer's ToneMapping effect) × exposure + sRGB.
 *    Bloom/DOF are not reproduced (a seat view should be sharp anyway).
 *  - Readback via readRenderTargetPixelsAsync (PBO + fence, no GPU stall), sync fallback.
 *  - Shadows: shadow maps were just rendered by the main pass and are view-independent, so the job
 *    disables shadowMap auto/needsUpdate for its own render (saves the cost, never consumes a pending
 *    needsUpdate) and restores both flags.
 *  - Restored afterwards: render target (+ cube face / mip level, hence viewport & scissor), autoClear,
 *    clear colour/alpha, xr.enabled, shadowMap flags, info.autoReset. The main camera is not touched.
 */
import { addAfterEffect, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  BufferGeometry,
  CineonToneMapping,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LinearToneMapping,
  Mesh,
  NeutralToneMapping,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  ReinhardToneMapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';
import {
  finishViewJob,
  hasPendingViewJobs,
  pixelsToUrl,
  recordViewTiming,
  registerViewHost,
  requestView,
  takeNextViewJob,
  viewRenderStats,
  type ViewJob,
} from '@/lib/view-render';

export interface ViewRendererProps {
  /** Tone mapping used when a postprocessing composer owns tone mapping (gl.toneMapping = None). */
  toneMapping?: ToneMapping;
  /** Sky colour used if the scene has no background and the canvas clears transparent. */
  fallbackBackground?: string;
}

const FRAMES_BETWEEN_JOBS = 2;
const MIN_JOB_INTERVAL_MS = 60;

const TONE_FN: Partial<Record<ToneMapping, string>> = {
  [LinearToneMapping]: 'LinearToneMapping',
  [ReinhardToneMapping]: 'ReinhardToneMapping',
  [CineonToneMapping]: 'CineonToneMapping',
  [ACESFilmicToneMapping]: 'ACESFilmicToneMapping',
  [AgXToneMapping]: 'AgXToneMapping',
  [NeutralToneMapping]: 'NeutralToneMapping',
};

type TargetKind = 'ldr' | 'hdr' | 'out';

/** GPU resources, created lazily per renderer. */
class ViewRig {
  readonly camera = new PerspectiveCamera(58, 16 / 9, 0.1, 2000);
  private readonly targets = new Map<string, WebGLRenderTarget>();
  private readonly toneScene = new Scene();
  private readonly toneCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly toneMat: ShaderMaterial;
  private readonly toneGeo = new BufferGeometry();
  private toneFn = '';
  private readonly tmpColor = new Color();
  private readonly fallbackColor = new Color();
  readonly samples: number;

  constructor(private readonly gl: WebGLRenderer) {
    this.samples = Math.min(4, gl.capabilities.maxSamples ?? 0);
    this.toneGeo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.toneGeo.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.toneMat = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: '',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new Mesh(this.toneGeo, this.toneMat);
    quad.frustumCulled = false;
    this.toneScene.add(quad);
  }

  private target(kind: TargetKind, w: number, h: number): WebGLRenderTarget {
    const id = `${kind}:${w}x${h}`;
    let t = this.targets.get(id);
    if (t) {
      // keep map order = recency
      this.targets.delete(id);
      this.targets.set(id, t);
      return t;
    }
    t = new WebGLRenderTarget(w, h, {
      type: kind === 'hdr' ? HalfFloatType : UnsignedByteType,
      samples: kind === 'out' ? 0 : this.samples,
      depthBuffer: kind !== 'out',
      stencilBuffer: false,
    });
    if (kind === 'ldr') {
      // three applies tone mapping + output colour space only to the screen or XR targets; flag
      // this target as XR so the render matches the screen and reuses the screen's programs.
      // Explicit RGBA8 storage: the shader already writes sRGB-encoded values.
      (t as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
      t.texture.colorSpace = this.gl.outputColorSpace;
      t.texture.internalFormat = 'RGBA8';
    }
    this.targets.set(id, t);
    // keep at most 4 targets (thumb + ticket sizes for each kind)
    for (const [k, old] of this.targets) {
      if (this.targets.size <= 4) break;
      old.dispose();
      this.targets.delete(k);
    }
    return t;
  }

  private setToneFn(tm: ToneMapping) {
    const fn = TONE_FN[tm] ?? 'ACESFilmicToneMapping';
    if (fn === this.toneFn) return;
    this.toneFn = fn;
    this.toneMat.fragmentShader = /* glsl */ `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      #include <tonemapping_pars_fragment>
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        gl_FragColor = sRGBTransferOETF(vec4(${fn}(c.rgb), 1.0));
      }`;
    this.toneMat.needsUpdate = true;
  }

  /**
   * Renders the job synchronously; returns the target holding the final RGBA8 sRGB image.
   * Must run outside the main render (after-effect).
   */
  render(
    job: ViewJob,
    scene: Scene,
    mainCamera: { layers: { mask: number }; far?: number },
    composerToneMapping: ToneMapping,
    fallbackBackground: string,
  ): WebGLRenderTarget {
    const gl = this.gl;
    const { pxW: w, pxH: h, shot } = job;
    const hdr = gl.toneMapping === NoToneMapping && composerToneMapping !== NoToneMapping;

    const cam = this.camera;
    cam.fov = shot.fov;
    cam.aspect = w / h;
    cam.near = 0.1;
    cam.far = Math.max(2000, mainCamera.far ?? 0);
    cam.layers.mask = mainCamera.layers.mask;
    cam.position.set(shot.position.x, shot.position.y, shot.position.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(shot.target.x, shot.target.y, shot.target.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // ---- save renderer state
    const prevTarget = gl.getRenderTarget();
    const prevFace = gl.getActiveCubeFace();
    const prevMip = gl.getActiveMipmapLevel();
    const prevAutoClear = gl.autoClear;
    const prevXr = gl.xr.enabled;
    const prevShadowAuto = gl.shadowMap.autoUpdate;
    const prevShadowNeeds = gl.shadowMap.needsUpdate;
    const prevInfoReset = gl.info.autoReset;
    gl.getClearColor(this.tmpColor);
    const prevClearAlpha = gl.getClearAlpha();

    try {
      gl.xr.enabled = false;
      gl.autoClear = true;
      gl.shadowMap.autoUpdate = false;
      gl.shadowMap.needsUpdate = false;
      gl.info.autoReset = false;
      if (prevClearAlpha < 1) {
        gl.setClearColor(scene.background ? this.tmpColor : this.fallbackColor.set(fallbackBackground), 1);
      }

      const sceneTarget = this.target(hdr ? 'hdr' : 'ldr', w, h);
      gl.setRenderTarget(sceneTarget);
      gl.render(scene, cam);
      if (!hdr) return sceneTarget;

      this.setToneFn(composerToneMapping);
      this.toneMat.uniforms.tDiffuse.value = sceneTarget.texture;
      this.toneMat.uniforms.toneMappingExposure.value = gl.toneMappingExposure;
      const out = this.target('out', w, h);
      gl.setRenderTarget(out);
      gl.render(this.toneScene, this.toneCam);
      this.toneMat.uniforms.tDiffuse.value = null;
      return out;
    } finally {
      gl.setRenderTarget(prevTarget, prevFace, prevMip);
      gl.setClearColor(this.tmpColor, prevClearAlpha);
      gl.autoClear = prevAutoClear;
      gl.xr.enabled = prevXr;
      gl.shadowMap.autoUpdate = prevShadowAuto;
      gl.shadowMap.needsUpdate = prevShadowNeeds;
      gl.info.autoReset = prevInfoReset;
    }
  }

  async read(target: WebGLRenderTarget): Promise<Uint8Array> {
    const gl = this.gl;
    const { width: w, height: h } = target;
    const buf = new Uint8Array(w * h * 4);
    const ctx = gl.getContext() as WebGL2RenderingContext;
    if (typeof gl.readRenderTargetPixelsAsync === 'function' && typeof ctx.fenceSync === 'function') {
      try {
        const p = gl.readRenderTargetPixelsAsync(target, 0, 0, w, h, buf);
        // three leaves the PBO bound while it waits; unbind so nothing else reads into it.
        ctx.bindBuffer(ctx.PIXEL_PACK_BUFFER, null);
        await p;
        return buf;
      } catch {
        /* fall through to the sync path */
      }
    }
    gl.readRenderTargetPixels(target, 0, 0, w, h, buf);
    return buf;
  }

  dispose() {
    for (const t of this.targets.values()) t.dispose();
    this.targets.clear();
    this.toneMat.dispose();
    this.toneGeo.dispose();
  }
}

export function ViewRenderer({ toneMapping = ACESFilmicToneMapping, fallbackBackground = '#9fb7c9' }: ViewRendererProps = {}): null {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const ctx = gl?.getContext?.();
    if (!ctx || !gl.capabilities) return; // not a WebGL renderer → requests time out to null

    const rig = new ViewRig(gl);
    let busy = false;
    let disposed = false;
    let framesSince = FRAMES_BETWEEN_JOBS;
    let lastStart = -Infinity;

    const run = async (job: ViewJob) => {
      const t0 = performance.now();
      let url: string | null = null;
      try {
        const state = get();
        const target = rig.render(job, state.scene, state.camera, toneMapping, fallbackBackground);
        const t1 = performance.now();
        const pixels = await rig.read(target);
        const t2 = performance.now();
        if (disposed || ctx.isContextLost()) {
          url = null;
        } else {
          url = await pixelsToUrl(pixels, job.pxW, job.pxH);
          const t3 = performance.now();
          recordViewTiming(t1 - t0, t2 - t1, t3 - t2, t3 - t0);
        }
      } catch (err) {
        console.warn('[ViewRenderer] render failed', err);
        url = null;
      }
      if (disposed) {
        if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        return; // registerViewHost's cleanup requeued the job
      }
      finishViewJob(job, url);
      busy = false;
      if (hasPendingViewJobs()) invalidate();
    };

    const tick = () => {
      if (disposed) return;
      framesSince++;
      if (busy || !hasPendingViewJobs()) return;
      const now = performance.now();
      if (framesSince < FRAMES_BETWEEN_JOBS || now - lastStart < MIN_JOB_INTERVAL_MS || ctx.isContextLost()) {
        invalidate(); // keep a frameloop="demand" canvas ticking until we can start
        return;
      }
      const job = takeNextViewJob();
      if (!job) return;
      busy = true;
      framesSince = 0;
      lastStart = now;
      void run(job);
    };

    const removeAfter = addAfterEffect(tick);
    const unregister = registerViewHost({ wake: () => invalidate() });
    if (process.env.NODE_ENV !== 'production') {
      // Debug handle: `await __arenaViews.requestView({...})`, `__arenaViews.stats`.
      (window as unknown as Record<string, unknown>).__arenaViews = { requestView, stats: viewRenderStats };
    }
    return () => {
      disposed = true;
      removeAfter();
      unregister();
      rig.dispose();
    };
  }, [gl, get, invalidate, toneMapping, fallbackBackground]);

  return null;
}

export default ViewRenderer;
