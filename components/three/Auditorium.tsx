'use client';
/**
 * The 3D auditorium inside the R3F <Canvas>: mounts the imperatively built
 * HallScene (seats, room, screen, lights), keeps the seat highlight in sync,
 * attaches the fog and ticks the film shader. Never moves the camera.
 */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DEFAULT_LAYOUT } from '@/lib/hall-geometry';
import { COMPOSER_SCREEN, HallScene } from './hallScene';
import { useTrailerVideo } from './useTrailerVideo';

export interface AuditoriumProps {
  /** Seat rendered mint green (null = none). */
  highlightSeatId: string | null;
  /** The bloom composer (with its own ACES pass) is active. */
  composer: boolean;
}

export function Auditorium({ highlightSeatId, composer }: AuditoriumProps) {
  const scene = useThree((s) => s.scene);
  const hall = useMemo(() => new HallScene(DEFAULT_LAYOUT), []);

  useEffect(() => () => hall.dispose(), [hall]);

  useEffect(() => {
    const prev = scene.fog;
    scene.fog = hall.fog;
    return () => {
      scene.fog = prev;
    };
  }, [scene, hall]);

  useEffect(() => {
    hall.setHighlight(highlightSeatId);
  }, [hall, highlightSeatId]);

  useEffect(() => {
    if (composer) hall.setScreenGain(COMPOSER_SCREEN.gain, COMPOSER_SCREEN.saturation);
    else hall.setScreenGain(1, 1);
  }, [hall, composer]);

  useTrailerVideo(hall);

  useFrame((state) => {
    hall.update(state.clock.elapsedTime, state.camera);
  });

  return <primitive object={hall.group} />;
}
