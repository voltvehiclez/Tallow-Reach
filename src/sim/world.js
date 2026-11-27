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

/**
 * Remove every network-mirrored entity (`_net: true`) across all cached pockets,
 * plus any guest-visit pilot mirror / beam / remote lock state.
 * Used when returning from a host world or disconnecting so stale host records
 * (which have no local simulation velocity/direction) never crash local stepSim().
 */
export function clearNetEntities() {
  for (const [placeId, container] of state.places.entries()) {
    const w = container?.entities;
    if (!w) continue;
    for (const e of [...(w.enemies || [])]) if (e?._net === true) dropEnemy(e, placeId);
    for (const key of ["bullets", "missiles", "crates", "fx", "rifts", "gates", "caches", "asteroids"]) {
      const list = w[key];
      if (!Array.isArray(list)) continue;
      let removedNetRock = false;
      for (const item of [...list]) {
        if (item?._net === true) {
          dropEntity(list, item);
          if (key === "asteroids") removedNetRock = true;
        }
      }
      // If a visited pocket replaced local rocks with host rocks (e.g. same place id as home),
      // mark it unloaded so returning home regenerates local asteroids cleanly.
      if (removedNetRock) container.loaded = false;
    }
  }
  state.otherPilots = [];
  if (state.flight) {
    state.flight.beamOn = false;
    state.flight.mineFrac = 0;
    if (state.flight.lock && (state.flight.lock.k === "p" || state.flight.lock.o?._net === true)) {
      state.flight.lock = null;
    }
    if (state.flight.missileLock?.target?._net === true) {
      state.flight.missileLock = { target: null, t: 0, locked: false };
    }
  }
}

/**
 * Remove stale non-network transient objects from one pocket when syncing the host's truth
 * on a visiting guest screen so local boot/single-player NPCs never float frozen beside live ones.
 */
export function purgeNonNetEntities(placeId = state.place) {
  const w = placeWorld(placeId);
  if (!w) return;
  for (const e of [...(w.enemies || [])]) if (e && !e._net) dropEnemy(e, placeId);
  for (const key of ["bullets", "missiles", "fx"]) {
    const list = w[key];
    if (!Array.isArray(list)) continue;
    for (const item of [...list]) if (item && !item._net) dropEntity(list, item);
  }
  for (const crate of [...(w.crates || [])]) {
    if (crate && !crate._net && !crate.persistent) dropEntity(w.crates, crate);
  }
}
