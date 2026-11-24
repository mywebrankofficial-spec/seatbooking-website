'use client';
/**
 * Everything around the stadium: sky, haze, sun + IBL, park lawn, plaza, roads, trees,
 * and the sun shafts through the roof opening. One shared clock for every env shader.
 */
import { useFrame } from '@react-three/fiber';
import { FOG_FAR, FOG_NEAR, HAZE } from './constants';
import { envUniforms } from './shaderChunks';
import { makeCloudTexture } from './textures';
import { SkyDome } from './SkyDome';
import { Lighting } from './Lighting';
import { Ground } from './Ground';
import { Roads } from './Roads';
import { Trees } from './Trees';
import { SunShafts } from './SunShafts';

export interface StadiumEnvironmentProps {
  shadowMapSize?: number;
  shadowEvery?: number;
}

function EnvClock() {
  // Shared cloud-shadow noise for every env material (created before their first compile).
  // A tiny (64 KB) app-lifetime singleton: deliberately never disposed.
  if (!envUniforms.uCloudTex.value) envUniforms.uCloudTex.value = makeCloudTexture();
  useFrame((_, dt) => {
    // Clamp so a stalled tab doesn't make clouds jump.
    envUniforms.uEnvTime.value += Math.min(dt, 0.1);
  });
  return null;
}

export function StadiumEnvironment({ shadowMapSize = 4096, shadowEvery = 2 }: StadiumEnvironmentProps) {
  return (
    <>
      <color attach="background" args={[HAZE]} />
      <fog attach="fog" args={[HAZE, FOG_NEAR, FOG_FAR]} />
      <EnvClock />
      <Lighting shadowMapSize={shadowMapSize} shadowEvery={shadowEvery} />
      <SkyDome />
      <Ground />
      <Roads />
      <Trees />
      <SunShafts />
    </>
  );
}
