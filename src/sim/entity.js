// World entities: plain records with ids, and the one place that lists them.
//
// Since refactor step 7 a *thing in the world* is a record, not a three.js mesh
// (an enemy is the worked example, `sim/enemy.js`). This file holds the parts
// every kind shares — step 7b adds bullets, missiles, crates and particles; step
// 7c adds rocks and the player's ship:
//
//     { id, kind: "bullet" | "missile" | "crate" | "fx" | "rock", pos, quat, ... }
//
// `pos` and `quat` are three.js `Vector3`/`Quaternion` — maths types, which the
// target architecture allows. There is **no mesh, scene or material in here**: the
// meshes belong to `render/views.js`, which keys one mesh per id off these
// records and never changes a game rule.
//
// `entity-spawned` / `entity-removed` tell the view the moment one appears or
// goes, and its per-frame sweep is the safety net. (Enemies keep their own two
// events from step 7a, `enemy-spawned` / `enemy-removed`.)

import { Q } from "../util/math.js";
import { emit } from "../util/events.js";
import { nextId } from "../util/ids.js";

/** Put new entity `e` into `list` and announce it. Returns `e`. */
export function addEntity(list, e) {
  if (e.id == null) e.id = nextId();
  if (e.kind == null) throw new Error("an entity must have a kind");
  list.push(e);
  emit("entity-spawned", { id: e.id, kind: e.kind });
  return e;
}

/**
 * Take `e` out of `list` and announce it, so its mesh goes at the same moment.
 * Doing it twice (or for something already gone) is harmless.
 */
export function dropEntity(list, e) {
  const i = list.indexOf(e);
  if (i === -1) return;
  list.splice(i, 1);
  emit("entity-removed", { id: e.id, kind: e.kind });
}

/** Empty `list`, announcing each departure so no mesh is left behind. */
export function clearEntities(list) {
  for (let i = list.length - 1; i >= 0; i--) dropEntity(list, list[i]);
}

/** Where entity `e` is (the live vector: move it, do not replace it). */
export const entityPos = e => e.pos;

/** Distance from entity `e` to point `p`. */
export const entityDist = (e, p) => e.pos.distanceTo(p);

/** A fresh, unrotated orientation for a new entity. */
export const freshQuat = () => Q();
