/**
 * Imperative core of the 3D auditorium (plain three.js, no React), so the
 * scene is built exactly once, owns all GPU resources, and can be updated
 * without re-rendering React. `Auditorium.tsx` mounts `hall.group` via
 * <primitive> and forwards props / frame ticks.
 *
 * World coordinates follow `lib/hall-geometry.ts` exactly (screen plane z = 0
 * centred on x = 0, rows towards +z, row r floor at rowFloorY(r), seats facing -z).
 */
import {
  Color,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RectAreaLight,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
  type ShaderMaterial,
  type Texture,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { HallLayout, SeatType } from '@/types/cinema';
import { DEFAULT_LAYOUT, EYE_BACK_OFFSET, EYE_HEIGHT, screenCentre } from '@/lib/hall-geometry';
import { buildSeatGeometries, buildSeatInstances, type SeatLayoutInstances, type SeatPartGeometries } from './seatGeometry';
import {
  buildAisleLightGeometry,
  buildCeilingGeometry,
  buildContactShadowGeometry,
  buildFloorGeometry,
  buildScreenGeometry,
  buildStepStripGeometry,
  buildWallGeometry,
} from './roomGeometry';
import { createFilmMaterial } from './filmShader';
import {
  SEAT_COLORS,
  createGlowMaterial,
  createHighlightMaterial,
  createMaskingMaterial,
  createRoomMaterial,
  createShadowMaterial,
  createShellMaterial,
  createVelvetMaterial,
} from './materials';

export const SCENE_BACKGROUND = '#0b0b0e';

/** Lighting tuned so seat tops/back edges catch the screen light, hall stays dark. */
export const LIGHTING = {
  screenLightColor: '#ffe3bd',
  screenLightIntensity: 3.2,
  hemiSky: '#3b3442',
  hemiGround: '#0b090a',
  hemiIntensity: 0.8,
  /** Dim cool spill from the projection booth: lifts seat-back rears out of pure black. */
  boothColor: '#8c84a0',
  boothIntensity: 0.5,
};

/** Screen gain when the composer applies ACES globally (screen is not tone mapped otherwise). */
export const COMPOSER_SCREEN = { gain: 1.2, saturation: 1.25 };

/**
 * Fog: dense enough at seat level to add depth, fading out as the camera
 * rises so the overhead map view (~45 m up) is never washed out.
 */
export const FOG = { density: 0.028, fadeStartY: 7, fadeEndY: 18 };

const SEAT_TYPES: SeatType[] = ['standard', 'recliner'];

let rectAreaInit = false;

const _m = new Matrix4();
const _zero = new Matrix4().makeScale(0, 0, 0);
/** Camera within this distance (m) of a seat's eye point counts as sitting in it. */
const OWN_SEAT_HIDE_RADIUS_SQ = 0.3 * 0.3;
const _color = new Color();

interface TypeMeshes {
  geo: SeatPartGeometries;
  upholstery: InstancedMesh;
  shell: InstancedMesh;
  arm: InstancedMesh;
  highlight: Mesh;
}

export class HallScene {
  readonly group = new Group();
  readonly fog: FogExp2;
  readonly film: ShaderMaterial;
  readonly screen: Mesh;

  private readonly instances: SeatLayoutInstances;
  private readonly meshes: Record<SeatType, TypeMeshes>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private highlightId: string | null = null;
  private videoMaterial: MeshBasicMaterial | null = null;
  private gain = 1;

  constructor(layout: HallLayout = DEFAULT_LAYOUT) {
    if (!rectAreaInit) {
      RectAreaLightUniformsLib.init();
      rectAreaInit = true;
    }
    this.group.name = 'Auditorium';
    this.fog = new FogExp2(SCENE_BACKGROUND, FOG.density);

    /* ---------------- room ---------------- */
    const roomMat = this.track(createRoomMaterial());
    this.add(new Mesh(this.geo(buildFloorGeometry(layout)), roomMat), 'floor');
    this.add(new Mesh(this.geo(buildWallGeometry(layout)), roomMat), 'walls');
    this.add(new Mesh(this.geo(buildCeilingGeometry(layout)), roomMat), 'ceiling');
    const shadows = this.add(
      new Mesh(this.geo(buildContactShadowGeometry(layout)), this.track(createShadowMaterial())),
      'contact-shadows',
    );
    shadows.renderOrder = 1;
    this.add(new Mesh(this.geo(buildStepStripGeometry(layout)), this.track(createGlowMaterial(0.9))), 'step-strips');
    this.add(new Mesh(this.geo(buildAisleLightGeometry(layout)), this.track(createGlowMaterial(1))), 'aisle-lights');

    /* ---------------- screen ---------------- */
    this.film = this.track(createFilmMaterial(layout.screen.width / layout.screen.height));
    this.screen = this.add(new Mesh(this.geo(buildScreenGeometry(layout)), this.film), 'screen');
    this.add(
      new Mesh(this.geo(buildScreenGeometry(layout, 0.14, 0.02, 32)), this.track(createMaskingMaterial())),
      'screen-masking',
    );

    /* ---------------- lights ---------------- */
    const sc = screenCentre(layout);
    const rect = new RectAreaLight(
      LIGHTING.screenLightColor,
      LIGHTING.screenLightIntensity,
      layout.screen.width,
      layout.screen.height,
    );
    rect.position.set(sc.x, sc.y, 0.35);
    rect.lookAt(sc.x, sc.y, 30);
    this.add(rect, 'screen-light');
    this.add(new HemisphereLight(LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiIntensity), 'fill');
    const booth = new DirectionalLight(LIGHTING.boothColor, LIGHTING.boothIntensity);
    booth.position.set(0, 14, 24);
    booth.target.position.set(0, 0, 4);
    this.add(booth, 'booth-spill');
    this.add(booth.target, 'booth-spill-target');

    /* ---------------- seats ---------------- */
    this.instances = buildSeatInstances(layout);
    const velvet = this.track(createVelvetMaterial());
    const highlightMat = this.track(createHighlightMaterial());
    const armMats: Record<SeatType, Material> = {
      standard: this.track(createShellMaterial(SEAT_COLORS.armStandard)),
      recliner: this.track(createVelvetMaterial(SEAT_COLORS.armRecliner)),
    };
    const shellMat = this.track(createShellMaterial(SEAT_COLORS.shell));

    const meshes = {} as Record<SeatType, TypeMeshes>;
    for (const type of SEAT_TYPES) {
      const geo = buildSeatGeometries(type);
      this.geometries.push(geo.upholstery, geo.shell, geo.arm);
      const seats = this.instances.byType[type];
      const arms = this.instances.arms[type];
      const upholstery = new InstancedMesh(geo.upholstery, velvet, seats.length);
      const shell = new InstancedMesh(geo.shell, shellMat, seats.length);
      const arm = new InstancedMesh(geo.arm, armMats[type], arms.length);
      _color.set(SEAT_COLORS[type]);
      for (const s of seats) {
        _m.makeTranslation(s.position.x, s.position.y, s.position.z);
        upholstery.setMatrixAt(s.index, _m);
        shell.setMatrixAt(s.index, _m);
        upholstery.setColorAt(s.index, _color);
      }
      arms.forEach((p, i) => {
        _m.makeTranslation(p.x, p.y, p.z);
        arm.setMatrixAt(i, _m);
      });
      for (const m of [upholstery, shell, arm]) {
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
      if (upholstery.instanceColor) upholstery.instanceColor.needsUpdate = true;

      const highlight = new Mesh(geo.upholstery, highlightMat);
      highlight.visible = false;
      highlight.matrixAutoUpdate = false;

      this.add(upholstery, `seats-${type}`);
      this.add(shell, `seat-shells-${type}`);
      this.add(arm, `armrests-${type}`);
      this.add(highlight, `seat-highlight-${type}`);
      meshes[type] = { geo, upholstery, shell, arm, highlight };
    }
    this.meshes = meshes;

    // Static scene: no need to recompute world matrices every frame.
    this.group.traverse((o) => {
      if (o === this.group) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
  }

  /** Mint-highlight one seat (or none). Cheap: touches one instance. */
  setHighlight(seatId: string | null): void {
    if (seatId === this.highlightId) return;
    const prev = this.highlightId ? this.instances.byId.get(this.highlightId) : undefined;
    if (prev) {
      const m = this.meshes[prev.type];
      _m.makeTranslation(prev.position.x, prev.position.y, prev.position.z);
      m.upholstery.setMatrixAt(prev.index, _m);
      m.upholstery.instanceMatrix.needsUpdate = true;
      m.highlight.visible = false;
    }
    const next = seatId ? this.instances.byId.get(seatId) : undefined;
    if (next) {
      const m = this.meshes[next.type];
      m.upholstery.setMatrixAt(next.index, _zero); // hide the red instance
      m.upholstery.instanceMatrix.needsUpdate = true;
      m.highlight.matrix.makeTranslation(next.position.x, next.position.y, next.position.z);
      m.highlight.matrixWorldNeedsUpdate = true;
      m.highlight.visible = true;
    }
    this.highlightId = next ? next.id : null;
  }

  /** Multiplier for the screen image (compensates a global tone-mapping pass). */
  setScreenGain(gain: number, saturation = 1): void {
    this.gain = gain;
    this.film.uniforms.uGain.value = gain;
    this.film.uniforms.uSaturation.value = saturation;
    if (this.videoMaterial) this.videoMaterial.color.setScalar(gain);
  }

  /** Swap the procedural film for a playing video texture (null = back to the shader). */
  setVideoTexture(texture: Texture | null): void {
    if (this.videoMaterial) {
      this.videoMaterial.dispose();
      this.videoMaterial = null;
    }
    if (texture) {
      this.videoMaterial = new MeshBasicMaterial({ map: texture, toneMapped: false, fog: false });
      this.videoMaterial.color.setScalar(this.gain);
      this.screen.material = this.videoMaterial;
    } else {
      this.screen.material = this.film;
    }
  }

  /** Per-frame update: film time + camera-height fog fade. Allocation free. */
  update(elapsed: number, camera: Camera): void {
    this.film.uniforms.uTime.value = elapsed;
    const y = camera.position.y;
    const k = 1 - Math.min(1, Math.max(0, (y - FOG.fadeStartY) / (FOG.fadeEndY - FOG.fadeStartY)));
    this.fog.density = FOG.density * k * k;

    // The occupied (highlighted) seat is hidden while the camera sits in it, so its own
    // leg rest / cushion never fills the foreground; it reappears as soon as the camera
    // lifts out (reference 0:22: the green recliner is seen while rising).
    const hid = this.highlightId ? this.instances.byId.get(this.highlightId) : undefined;
    if (hid) {
      const p = hid.position;
      const dx = camera.position.x - p.x;
      const dy = camera.position.y - (p.y + EYE_HEIGHT);
      const dz = camera.position.z - (p.z + EYE_BACK_OFFSET);
      this.meshes[hid.type].highlight.visible = dx * dx + dy * dy + dz * dz > OWN_SEAT_HIDE_RADIUS_SQ;
    }
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.videoMaterial?.dispose();
    for (const type of SEAT_TYPES) {
      const m = this.meshes[type];
      m.upholstery.dispose();
      m.shell.dispose();
      m.arm.dispose();
    }
  }

  private add<T extends Object3D>(obj: T, name: string): T {
    obj.name = name;
    this.group.add(obj);
    return obj;
  }

  private geo<T extends BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private track<T extends Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
}
