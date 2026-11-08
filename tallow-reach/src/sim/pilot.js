// The player's ship in the air: where it is, which way it faces.
//
// Before step 7b this lived on the ship's mesh (`state.player.m.position`), so
// every rule that needed the pilot's position read a three.js object. The mesh
// belongs to `render/views.js` now, and the ship is a position and a rotation on
// the player record (`state.player.pos` / `state.player.quat`), exactly the way a
// hostile is (`sim/enemy.js`).
//
// `pos` and `quat` are three.js `Vector3`/`Quaternion` — maths types, which the
// target architecture allows. The helpers below are the only way the rest of the
// sim touches them, so the storage can become plain `{ x, y, z }` in one place if
// the network ever wants it.
//
// The model is not gone: it is the *view's*, built from `profile.ship` and copied
// from `pos`/`quat` once a frame (refactor step 7c gives the player hull its own
// view class in `render/views.js`).

import { V, fwdQ, faceQ } from "../util/math.js";
import { SHIPS } from "../data/ships.js";
import { mountOffset } from "../data/mounts.js";
import { state } from "../state/state.js";

/** Where the pilot's ship is (the live vector; move it, do not replace it). */
export const playerPos = () => state.player.pos;

/** Which way the pilot's ship points (-Z of its rotation), as a new vector. */
export const playerFwd = () => fwdQ(state.player.quat);

/** Distance from the pilot's ship to point `p`. */
export const playerDist = p => state.player.pos.distanceTo(p);

/** Put the pilot's ship at `x, y, z`, facing whatever `quat` said before. */
export function setPlayerPos(x, y, z) {
  state.player.pos.set(x, y, z);
}

/**
 * Turn the pilot's ship to face `target`, by fraction `k` (k >= 1 snaps). This
 * is the old `face(P.m, target, 1)` turned round: the sim turns the record's
 * rotation and the view copies it onto the mesh.
 */
export const facePlayer = (target, k) => faceQ(state.player.quat, state.player.pos, target, k);

/**
 * A point on the ship's own frame (`x` right, `y` up, `z` back), in world space.
 *
 * This replaces `P.m.localToWorld(v)`, which read `matrixWorld` — three.js only
 * refreshes that when the scene is drawn, so during a frame it was one frame out
 * of date (see "matrixWorld is last frame's transform" in ARCHITECTURE.md). The
 * sim builds the point from `pos` and `quat` by hand instead, which is what the
 * chase camera already does. For a ship that has not moved yet the two agree
 * exactly.
 */
export function playerLocal(v) {
  const P = state.player;
  // The model is drawn at the hull's own scale (`SHIPS[id].sc`), so a point given
  // in the ship's frame is scaled, turned and then moved into the world — exactly
  // what the model's `localToWorld` did before the ship became data. Call sites
  // pass already-scaled offsets (5 * sc ahead, 1.8 m to a barrel); the extra
  // factor is the model's own and is kept, because it is what put the bolts
  // where the player sees the guns.
  return v.clone().multiplyScalar(shipScale()).applyQuaternion(P.quat).add(P.pos);
}

/** The model scale of the ship being flown. */
export const shipScale = () => SHIPS[state.profile.ship].sc;

/** The pilot's own velocity (zero before `createPlayer`). */
export const playerVel = () => state.player.v || V(0, 0, 0);

/** World-space position of a named weapon mount. */
export function playerMount(name, bay = 0, barrel = 0, count = 1) {
  const { x, y, z } = mountOffset(state.profile.ship, name, shipScale(), bay, barrel, count);
  return playerLocal(V(x, y, z));
}
