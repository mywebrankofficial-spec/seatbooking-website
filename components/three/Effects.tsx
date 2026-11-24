'use client';
/**
 * Subtle bloom: high threshold so essentially only the screen (and the glow
 * at its edges) blooms. The composer renders to a linear HDR target, where
 * three skips tone mapping, so ACES is applied here as the last effect.
 */
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';

export const BLOOM = { threshold: 0.85, smoothing: 0.25, intensity: 0.7, radius: 0.72, levels: 6 };

export function Effects({ samples }: { samples: number }) {
  return (
    <EffectComposer multisampling={samples} stencilBuffer={false}>
      <Bloom
        mipmapBlur
        luminanceThreshold={BLOOM.threshold}
        luminanceSmoothing={BLOOM.smoothing}
        intensity={BLOOM.intensity}
        radius={BLOOM.radius}
        levels={BLOOM.levels}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
