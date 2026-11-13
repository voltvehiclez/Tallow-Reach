// The asteroid field. Rocks carry ore and respawn after they are mined out.
// A rock is plain data: { id, kind: "rock", place, slot, pos, quat, s0, scale,
// r, type, ore, max }. Field position/count/ore/timer come from data features.
// Stable field slots let world.placeMemory remember which rock was mined across
// a save/load; ad-hoc test rocks may still be spawned without a slot.

import { V, Q, E } from "../util/math.js";
import { pickLoot } from "./loot.js";
import { addEntity } from "./entity.js";
import { state, placeWorld } from "../state/state.js";
import { fieldAt } from "./places.js";
import { random, makeRng } from "../util/rng.js";
import { memoryCooling } from "./place-memory.js";

/** How many rock shapes render/models.js can draw (the roll picks one of these). */
export const ROCK_SHAPE_COUNT = 6;

const roll = (rng, a, b) => a + rng() * (b - a);

/** Stable hash for a field slot; it does not consume the combat RNG stream. */
function hash(value) {
  let h = 0x811c9dc5;
  for (const char of String(value)) h = Math.imul(h ^ char.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** The save key for a mined slot in a field. */
export const rockMemoryId = (field, slot) => `${field?.id || "field"}:${slot}`;

/** Spawn one rock in a place's field feature. Ore type depends on the roll. */
export function spawnAsteroid(placeId = state.place, field = fieldAt(placeId), slot = null) {
  if (!field) return null;
  if (slot !== null && memoryCooling(placeId, "rock", rockMemoryId(field, slot))) return null;

  const stable = slot !== null && field.stable === true;
  const rng = stable
    ? makeRng(hash(`${placeId}:${field.id || "field"}:${slot}`))
    : random;
  const rock = field.rock || { rMin: 18, rMax: 70, orePerR: 1.6 };
  const r = roll(rng, rock.rMin, rock.rMax),
    type = pickLoot(field.ore, rng);

  // Stable slots use the same order on every load: size, ore, shape, position,
  // then tumble. Unslotted callers retain the ordinary session RNG behaviour.
  const shape = Math.floor(roll(rng, 0, ROCK_SHAPE_COUNT));
  let p;
  do {
    p = V(roll(rng, -field.radius, field.radius), roll(rng, -field.height, field.height), roll(rng, -field.radius, field.radius));
  } while (p.length() > field.radius);

  const s0 = V(r * roll(rng, 0.8, 1.2), r * roll(rng, 0.8, 1.2), r * roll(rng, 0.8, 1.2));
  const quat = Q().setFromEuler(E(roll(rng, 0, 6), roll(rng, 0, 6), roll(rng, 0, 6)));
  const id = slot === null ? undefined : rockMemoryId(field, slot);

  return addEntity(placeWorld(placeId).asteroids, {
    ...(id ? { memoryId: id, slot } : {}),
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
  for (let slot = 0; slot < field.count; slot++) spawnAsteroid(placeId, field, slot);
}
