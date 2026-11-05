// Layout of the sector and helpers for clearing transient objects.

import { V } from "../util/math.js";
import { scene } from "../render/scene.js";
import { state } from "../state/state.js";

/** Centre of the asteroid field, about 2 km from the outpost. */
export const FIELD_CENTER = V(1800, 200, -1500);

/** Ships closer than this to the outpost are pushed back out. */
export const STATION_KEEPOUT = 120;

/** Remove pirates, bullets and missiles from the scene (used when docking). */
export function clearTransient() {
  const w = state.world;
  for (const e of w.enemies) scene.remove(e.m);
  w.enemies.length = 0;
  for (const b of w.bullets) scene.remove(b.m);
  w.bullets.length = 0;
  for (const s of w.missiles) scene.remove(s.m);
  w.missiles.length = 0;
}
