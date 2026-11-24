'use client';
/**
 * Afternoon sun (one shadow-casting DirectionalLight), sky/ground hemisphere fill and a
 * procedural IBL (drei <Environment> rendered once from a gradient sphere + Lightformers,
 * no network assets) so the white roof and glass get soft reflections.
 *
 * Shadows: the sun, stadium and trees are static apart from the canopy sway, so the
 * shadow map is re-rendered every `shadowEvery` frames instead of every frame.
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { BackSide, BufferAttribute, Color, SphereGeometry, type DirectionalLight } from 'three';
import {
  COLORS,
  SHADOW_DISTANCE,
  SHADOW_EXTENT,
  SKY_HORIZON,
  SKY_ZENITH,
  SUN_COLOR,
  SUN_DIR,
  SUN_INTENSITY,
} from './constants';

const SUN_POS: [number, number, number] = [
  SUN_DIR.x * SHADOW_DISTANCE,
  SUN_DIR.y * SHADOW_DISTANCE,
  SUN_DIR.z * SHADOW_DISTANCE,
];

/** Sky gradient sphere for the environment capture (vertex colours, linear). */
function useEnvSkyGeometry(): SphereGeometry {
  const geo = useMemo(() => {
    const g = new SphereGeometry(100, 32, 16);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const zen = new Color(SKY_ZENITH);
    const hor = new Color(SKY_HORIZON);
    const gnd = new Color(COLORS.hemiGround).multiplyScalar(0.6);
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 100;
      if (y >= 0) c.copy(hor).lerp(zen, Math.pow(y, 0.5));
      else c.copy(hor).lerp(gnd, Math.min(1, -y * 4));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

const ProceduralEnvironment = memo(function ProceduralEnvironment() {
  const skyGeo = useEnvSkyGeometry();
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.85}>
      <mesh geometry={skyGeo}>
        <meshBasicMaterial vertexColors side={BackSide} toneMapped={false} />
      </mesh>
      {/* Sun disc: crisp highlights on the roof membrane and glass. */}
      <Lightformer
        form="circle"
        intensity={24}
        color={SUN_COLOR}
        position={[SUN_DIR.x * 80, SUN_DIR.y * 80, SUN_DIR.z * 80]}
        scale={7}
        target={[0, 0, 0]}
      />
      {/* Bright overcast top + horizon strips: soft wrap-around reflections. */}
      <Lightformer form="rect" intensity={1.6} color="#eef4ff" position={[0, 70, 0]} rotation-x={Math.PI / 2} scale={[90, 90, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#f4f1ea" position={[0, 8, -80]} scale={[160, 14, 1]} target={[0, 8, 0]} />
      <Lightformer form="rect" intensity={1.0} color="#eef2f6" position={[80, 8, 0]} scale={[160, 14, 1]} target={[0, 8, 0]} />
      <Lightformer form="rect" intensity={1.0} color="#eef2f6" position={[-80, 8, 0]} scale={[160, 14, 1]} target={[0, 8, 0]} />
      <Lightformer form="rect" intensity={1.2} color="#f6f2ea" position={[0, 8, 80]} scale={[160, 14, 1]} target={[0, 8, 0]} />
      {/* Green bounce from the park. */}
      <Lightformer form="rect" intensity={0.35} color="#7f9a5a" position={[0, -40, 0]} rotation-x={-Math.PI / 2} scale={[200, 200, 1]} />
    </Environment>
  );
});

export interface LightingProps {
  shadowMapSize: number;
  /** Re-render the shadow map every N frames. */
  shadowEvery: number;
}

export function Lighting({ shadowMapSize, shadowEvery }: LightingProps) {
  const gl = useThree((s) => s.gl);
  const sun = useRef<DirectionalLight>(null);
  const frame = useRef(0);

  useEffect(() => {
    const prev = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = prev;
    };
  }, [gl]);

  // Resize the shadow map when quality changes.
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    if (l.shadow.mapSize.x !== shadowMapSize) {
      l.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      l.shadow.map?.dispose();
      l.shadow.map = null;
      gl.shadowMap.needsUpdate = true;
    }
  }, [shadowMapSize, gl]);

  useFrame(() => {
    frame.current++;
    if (frame.current % shadowEvery === 0) gl.shadowMap.needsUpdate = true;
  });

  return (
    <>
      <directionalLight
        ref={sun}
        position={SUN_POS}
        color={SUN_COLOR}
        intensity={SUN_INTENSITY}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.045}
        shadow-radius={3}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={SHADOW_DISTANCE - 220}
        shadow-camera-far={SHADOW_DISTANCE + 220}
      />
      <hemisphereLight args={[COLORS.hemiSky, COLORS.hemiGround, 0.55]} />
      <ProceduralEnvironment />
    </>
  );
}
