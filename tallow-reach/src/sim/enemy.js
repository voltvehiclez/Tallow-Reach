// A hostile, as plain data (refactor step 7a).
//
// An enemy used to *be* a three.js mesh: `sim/ai.js` built it, and every system
// that touched it moved a mesh's `.position`. Now it is a record —
//
//     { id, kind: "enemy", def, n, f, loot, hp, mx, pos, quat, v, fire, o }
//
// — and `render/views.js` keeps a mesh in step with `pos`/`quat` for it. Nothing
// in `sim/` holds a scene object, so the sim can run in a test with no browser,
// and a host can send these records to a guest unchanged (step 16).
//
// `pos` and `quat` are three.js `Vector3`/`Quaternion` — maths types, not scene
// objects. The target architecture allows exactly that: positions may stay
// three.js maths but there are no meshes, scenes or materials in `sim/`.
//
// Every access to "where is this enemy, which way does it point" goes through
// the helpers below, so the storage can become plain `{ x, y, z }` in one place
// if the network ever wants it.

import { V, fwdQ, faceQ } from "../util/math.js";
import { emit } from "../util/events.js";
import { state } from "../state/state.js";

/** Where enemy `e` is. */
export const enemyPos = e => e.pos;

/** Which way enemy `e` points (-Z of its rotation), as a new vector. */
export const enemyFwd = e => fwdQ(e.quat);

/**
 * Turn enemy `e` to face `target`, by fraction `k` (k >= 1 snaps). This is the
 * old `face(mesh, target, k)` turned round: the sim turns the record's rotation
 * and the view copies it onto the mesh.
 */
export const turnEnemy = (e, target, k) => faceQ(e.quat, e.pos, target, k);

/** Distance from enemy `e` to point `p`. */
export const enemyDist = (e, p) => e.pos.distanceTo(p);

/**
 * Take enemy `e` out of the world: it is gone from `state.world.enemies` at once,
 * and `enemy-removed` tells `render/views.js` to delete its mesh. Used when it is
 * killed, when it drifts out of range, and when docking clears the field.
 */
export function dropEnemy(e) {
  const E = state.world.enemies,
    i = E.indexOf(e);
  if (i !== -1) E.splice(i, 1);
  emit("enemy-removed", { id: e.id });
}

/** An enemy's velocity (zero if it has none yet). */
export const enemyVel = e => e.v || V(0, 0, 0);

/** The fields `render/views.js` needs to draw an enemy, in the order it builds one. */
export const enemyLook = (e, def) => ({ col: def.col, scale: def.scale, foe: true });
