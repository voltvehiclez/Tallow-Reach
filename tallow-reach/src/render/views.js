// Views: one mesh per entity, built and kept in step by this file (refactor
// step 7a — hostiles first; bullets, crates, particles and rocks follow in 7b
// and 7c).
//
// The sim owns the entities (`state.world.enemies`) and an entity is plain data
// (see sim/enemy.js). This file owns the *meshes*. It watches the world and:
//
//   new entity             -> build its mesh with `mkShip` and add it to the scene
//   every frame            -> copy `pos` and `quat` onto the mesh
//   entity leaves the world-> take its mesh out of the scene
//
// The sim says `enemy-spawned` / `enemy-removed` so a mesh appears or goes the
// moment its enemy does; the per-frame sweep is the safety net, so a mesh can
// never be left behind or missing even if an event is missed. Nothing here
// changes a game rule, and nothing in `sim/` knows this file exists.

import { scene } from "./scene.js";
import { mkShip } from "./models.js";
import { state } from "../state/state.js";
import { on } from "../util/events.js";
import { enemyDef } from "../data/enemies.js";

/** Enemy id -> its mesh. */
const meshes = new Map();

/** Build the mesh for enemy `e` and put it in the scene. */
function addEnemy(e) {
  const def = enemyDef(e.def),
    m = mkShip(def.col, def.scale, true);
  m.position.copy(e.pos);
  m.quaternion.copy(e.quat);
  scene.add(m);
  meshes.set(e.id, m);
  return m;
}

/** Take enemy `id`'s mesh out of the scene. Doing it twice is harmless. */
function removeEnemy(id) {
  const m = meshes.get(id);
  if (!m) return;
  scene.remove(m);
  meshes.delete(id);
}

/**
 * Call once at boot, before the first frame, so the meshes follow the sim's
 * events from the start.
 */
export function installEnemyViews() {
  on("enemy-spawned", ({ id }) => {
    const e = state.world.enemies.find(x => x.id === id);
    if (e && !meshes.has(id)) addEnemy(e);
  });
  on("enemy-removed", ({ id }) => removeEnemy(id));
}

/**
 * Copy every enemy's position and rotation onto its mesh, and reconcile the two
 * lists. Call once per frame after the sim has run.
 */
export function updateEnemyViews() {
  const wanted = new Set();

  for (const e of state.world.enemies) {
    wanted.add(e.id);
    const m = meshes.get(e.id) || addEnemy(e);
    m.position.copy(e.pos);
    m.quaternion.copy(e.quat);
  }

  // Whatever is no longer in the world loses its mesh (this covers the cases no
  // event fired for, and a scene cleared by docking or a warp).
  for (const id of [...meshes.keys()]) if (!wanted.has(id)) removeEnemy(id);
}

/** How many enemy meshes exist (the tests check this number). */
export const enemyViewCount = () => meshes.size;
