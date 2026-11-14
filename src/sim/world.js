// Clearing transient objects from a place. Geography itself lives in
// data/places.js; this file only empties entity lists and announces departures.

import { state, placeWorld } from "../state/state.js";
import { dropEnemy } from "./enemy.js";
import { clearEntities, dropEntity } from "./entity.js";

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
  // Mission drops are physical objectives, not transient scenery: they remain
  // in this pocket across a warp until the owning mission is abandoned or a
  // pilot actually picks them up.
  for (const crate of [...w.crates]) if (!crate.persistent) dropEntity(w.crates, crate);
  clearEntities(w.fx);
  // A rift door, the way out of a run and its prize canister belong to the session that made them,
  // not to the pocket's geography: leaving the pocket (or loading a world) takes them with it. Step 14.
  clearEntities(w.rifts);
  clearEntities(w.gates);
  clearEntities(w.caches);
}
