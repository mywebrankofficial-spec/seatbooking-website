'use client';
/**
 * The stadium building ("Arena"): bowl, seats (with LOD), skyboxes, roof, pitch, pick proxies.
 * Placed by the Environment agent inside the Canvas (with a shadow-casting sun).
 *
 *   <Stadium mode="booking" />  interactive: highlights + picking per store level
 *   <Stadium mode="landing" />  flythrough: red/blue seats only, no picking
 */
import { Bowl } from './Bowl';
import { Pickers } from './Pickers';
import { Pitch } from './Pitch';
import { Roof } from './Roof';
import { Seats } from './Seats';
import { Skyboxes } from './Skyboxes';
import { useStructureState } from './state';

export function Stadium({ mode }: { mode: 'booking' | 'landing' }) {
  useStructureState(mode);
  return (
    <group name="arena-stadium">
      <Pitch />
      <Bowl />
      <Seats mode={mode} />
      <Skyboxes mode={mode} />
      <Roof />
      {mode === 'booking' && <Pickers />}
    </group>
  );
}

export default Stadium;
