// Explosions and exhaust puffs. These are cosmetic particles that fade out.
//
// A particle is plain data (refactor step 7b):
//
//     { id, kind: "fx", pos, v, l, t, col, size }
//
// `l` is the life left (0..1) and `t` is the life it started with; `col` is the
// colour and `size` how big the box is drawn. `render/views.js` owns the mesh and
// fades it by copying `l`, so nothing here holds a three.js material any more.

import { V, Q, R } from "../util/math.js";
import { state, placeWorld } from "../state/state.js";
import { emit } from "../util/events.js";
import { addEntity, dropEntity } from "./entity.js";

/** Burst of `count` particles from point `p`. Big bursts also make a rumble. */
export function boom(p, count, color, placeId = state.place) {
  // How loud an explosion is depends on its size, so the size goes with the event.
  if (count > 10 && placeId === state.place) emit("sfx", { name: "explosion", count });
  for (let i = 0; i < count; i++) {
    add({
      kind: "fx",
      pos: V(p.x, p.y, p.z),   // callers may pass a plain {x,y,z}: a boom needs no methods
      v: V(R(-1, 1), R(-1, 1), R(-1, 1)).normalize().multiplyScalar(R(10, 70)),
      l: 1,
      t: 1,
      col: color,
      size: 1,
    }, placeId);
  }
}

/** Single slow particle, used for missile exhaust. */
export function puff(p, color, life, placeId = state.place) {
  add({
    kind: "fx",
    pos: V(p.x, p.y, p.z),
    v: V(0, 0, 0),
    l: life || 0.6,
    t: life || 0.6,
    col: color,
    size: 0.4,     // the exhaust puff was always drawn at 0.4 of the bomb's size
  }, placeId);
}

/** Put one particle into the world and tell the view about it. */
function add(f, placeId) {
  f.quat = Q();
  f.place = placeId;
  return addEntity(placeWorld(placeId).fx, f);
}

export function updateEffects(dt, placeId = state.place) {
  const fx = placeWorld(placeId).fx;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.pos.addScaledVector(f.v, dt);
    f.l -= dt * 1.3;
    if (f.l <= 0) dropEntity(fx, f);   // the view disposes the mesh on `entity-removed`
  }
}
