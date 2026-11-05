// Layout of the sector and helpers for clearing transient objects.

import { V } from "../util/math.js";
import { DEFAULT_SECTOR } from "../data/sectors.js";
import { scene } from "../render/scene.js";
import { state } from "../state/state.js";

/** Centre of the asteroid field, about 2 km from the outpost. */
export const FIELD_CENTER = V(1800, 200, -1500);

/** The asteroid field is geography of one sector, so its rocks only exist there. */
export const FIELD_SECTOR = DEFAULT_SECTOR;

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

/** Clear transient objects plus crates and particles (used when warping away). */
export function clearWorldObjects() {
  const w = state.world;
  clearTransient();
  for (const c of w.crates) scene.remove(c.m);
  w.crates.length = 0;
  for (const f of w.fx) {
    scene.remove(f.m);
    f.m.material.dispose();
  }
  w.fx.length = 0;
}

// Rocks belong to a sector. state.world.asteroids always holds the current
// sector's list, so every system keeps reading it directly; the other sectors'
// lists wait in `parked` until you warp back.
const parked = new Map();

/** The rock list of sector `id` (the live one while you are in that sector). */
export const fieldList = id => (id === state.sector ? state.world.asteroids : parked.get(id) || []);

/** Swap the live rock list when the player moves from sector `from` to `to`. */
export function swapField(from, to) {
  parked.set(from, state.world.asteroids);
  state.world.asteroids = parked.get(to) || [];
  parked.delete(to);
}
