// The asteroid field. Rocks carry ore and respawn after they are mined out.
//
// A rock is plain data (refactor step 7b):
//
//     { id, kind: "rock", sector, pos, quat, scale, s0, r, type, ore, max }
//
// `scale` is how big it is drawn right now and `s0` the size it was born at, so
// mining shrinks it (the view copies `scale`; the collision rule reads the ratio).
// `render/views.js` builds the mesh from `r`, `type` and `scale`. Nothing here
// makes a three.js object any more.

import { V, Q, E, R } from "../util/math.js";
import { pickLoot } from "./loot.js";
import { addEntity } from "./entity.js";
import { FIELD_CENTER, FIELD_SECTOR, fieldList } from "./world.js";

export const FIELD_COUNT = 70;
/** How many rock shapes render/models.js can draw (the roll picks one of these). */
export const ROCK_SHAPE_COUNT = 6;
const FIELD_RADIUS = 700;   // horizontal spread
const FIELD_HEIGHT = 250;   // vertical spread

/** Spawn one rock somewhere in the field. Ore type depends on the roll. */
export function spawnAsteroid() {
  const r = R(18, 70),
    type = pickLoot("asteroid");   // the ore mix is data (data/loot.js)

  // The same rolls in the same order as before a rock became data — the mesh
  // used to make the first one — so a seed still builds exactly the field it
  // built then: shape, position, size, then the tumble.
  const shape = Math.floor(R(0, ROCK_SHAPE_COUNT));

  // Rejection-sample a point inside the field's horizontal radius.
  let p;
  do {
    p = V(R(-FIELD_RADIUS, FIELD_RADIUS), R(-FIELD_HEIGHT, FIELD_HEIGHT), R(-FIELD_RADIUS, FIELD_RADIUS));
  } while (p.length() > FIELD_RADIUS);

  const s0 = V(r * R(0.8, 1.2), r * R(0.8, 1.2), r * R(0.8, 1.2));
  const quat = Q().setFromEuler(E(R(0, 6), R(0, 6), R(0, 6)));

  return addEntity(fieldList(FIELD_SECTOR), {
    kind: "rock",
    sector: FIELD_SECTOR,               // rocks live in the field's own sector
    pos: FIELD_CENTER.clone().add(p),
    quat,
    shape,                              // which of the lumpy shapes it is drawn with
    s0,                                 // the size it was born at
    scale: s0.clone(),                  // how big it is drawn right now (mining shrinks it)
    r,
    type,
    ore: r * 1.6,
    max: r * 1.6,
  });
}

/** Fill the field at game start. */
export function populateField() {
  for (let i = 0; i < FIELD_COUNT; i++) spawnAsteroid();
}
