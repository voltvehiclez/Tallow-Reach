// Clearing transient objects from a place. Geography itself lives in
// data/places.js; this file only empties entity lists and announces departures.

import { state, placeWorld } from "../state/state.js";
import { dropEnemy } from "./enemy.js";
import { clearEntities } from "./entity.js";

/** Remove hostiles, bullets and missiles from one place (used when docking). */
export function clearTransient(placeId = state.place) {
  const w = placeWorld(placeId);
  for (const e of [...w.enemies]) dropEnemy(e, placeId);
  w.enemies.length = 0;
  clearEntities(w.bullets);
  clearEntities(w.missiles);
}

/** Clear transient objects plus crates and particles (used when warping away). */
export function clearWorldObjects(placeId = state.place) {
  const w = placeWorld(placeId);
  clearTransient(placeId);
  clearEntities(w.crates);
  clearEntities(w.fx);
}
