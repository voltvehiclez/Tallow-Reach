// The asteroid field. Rocks carry ore and respawn after they are mined out.
// A rock is plain data: { id, kind: "rock", place, shape, pos, quat, s0, scale,
// r, type, ore, max }. Field position/count/ore/respawn come from a place feature.

import { V, Q, E, R } from "../util/math.js";
import { pickLoot } from "./loot.js";
import { addEntity } from "./entity.js";
import { state, placeWorld } from "../state/state.js";
import { fieldAt } from "./places.js";

/** How many rock shapes render/models.js can draw (the roll picks one of these). */
export const ROCK_SHAPE_COUNT = 6;

/** Spawn one rock in a place's field feature. Ore type depends on the roll. */
export function spawnAsteroid(placeId = state.place, field = fieldAt(placeId)) {
  if (!field) return null;
  const rock = field.rock || { rMin: 18, rMax: 70, orePerR: 1.6 };
  const r = R(rock.rMin, rock.rMax),
    type = pickLoot(field.ore);

  // Same roll order as before: size, ore, shape, position, then tumble.
  const shape = Math.floor(R(0, ROCK_SHAPE_COUNT));
  let p;
  do {
    p = V(R(-field.radius, field.radius), R(-field.height, field.height), R(-field.radius, field.radius));
  } while (p.length() > field.radius);

  const s0 = V(r * R(0.8, 1.2), r * R(0.8, 1.2), r * R(0.8, 1.2));
  const quat = Q().setFromEuler(E(R(0, 6), R(0, 6), R(0, 6)));

  return addEntity(placeWorld(placeId).asteroids, {
    kind: "rock",
    place: placeId,
    pos: V(...field.pos).add(p),
    quat,
    shape,
    s0,
    scale: s0.clone(),
    r,
    type,
    ore: r * rock.orePerR,
    max: r * rock.orePerR,
  });
}

/** Fill one field feature (called by the generic place loader). */
export function populateField(placeId, field = fieldAt(placeId)) {
  if (!field) return;
  for (let i = 0; i < field.count; i++) spawnAsteroid(placeId, field);
}
