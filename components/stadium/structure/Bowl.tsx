'use client';
/** Seating bowl (per stand, one merged mesh each) + outer white façade shell. */
import { useEffect, useMemo } from 'react';
import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import { STANDS } from '@/lib/stadium-geometry';
import { buildBowlGeometries, buildShellGeometry } from './bowlGeometry';
import { createBowlMaterial } from './materials';

function shellTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3f3f0';
  g.fillRect(0, 0, 128, 512);
  // horizontal panel seams (~3 m)
  g.fillStyle = 'rgba(120,124,130,0.35)';
  for (let y = 0; y < 512; y += 40) g.fillRect(0, y, 128, 2);
  // vertical seam + a tall slim glazing slot per tile
  g.fillStyle = 'rgba(110,114,120,0.45)';
  g.fillRect(0, 0, 2, 512);
  g.fillStyle = '#3c4654';
  g.fillRect(58, 70, 12, 330);
  // ground-floor glazing (y < ~4.5 m)
  const grad = g.createLinearGradient(0, 452, 0, 512);
  grad.addColorStop(0, '#2c3440');
  grad.addColorStop(1, '#4a4136');
  g.fillStyle = grad;
  g.fillRect(0, 452, 128, 60);
  g.fillStyle = 'rgba(255,214,160,0.55)';
  g.fillRect(8, 470, 112, 6);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function Bowl() {
  const r = useMemo(() => {
    const stands = buildBowlGeometries();
    const bowlMat = createBowlMaterial();
    const shell = buildShellGeometry();
    const tex = shellTexture();
    const shellMat = new MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, side: DoubleSide });
    return { stands, bowlMat, shell, tex, shellMat };
  }, []);
  useEffect(
    () => () => {
      r.stands.forEach((g) => g.dispose());
      r.bowlMat.dispose();
      r.shell.dispose();
      r.tex.dispose();
      r.shellMat.dispose();
    },
    [r],
  );
  return (
    <group name="arena-bowl">
      {r.stands.map((g, i) => (
        <mesh key={STANDS[i].id} name={`bowl-${STANDS[i].id}`} geometry={g} material={r.bowlMat} castShadow receiveShadow />
      ))}
      <mesh name="shell" geometry={r.shell} material={r.shellMat} castShadow receiveShadow />
    </group>
  );
}
