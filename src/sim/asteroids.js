// The asteroid field. Rocks carry ore and respawn after they are mined out.
// A rock is plain data: { id, kind: "rock", place, slot, pos, quat, s0, scale,
// r, type, ore, max }. Field position/count/ore/timer come from data features.
// Stable field slots let world.placeMemory remember which rock was mined across
// a save/load; ad-hoc test rocks may still be spawned without a slot.

import { V, Q, E } from "../util/math.js";
import { pickLoot } from "./loot.js";
import { addEntity } from "./entity.js";
import { state, placeWorld } from "../state/state.js";
import { placeDef } from "../data/places.js";
import { builtInRockPositions } from "./colliders.js";
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

/** Generate slot attributes independently of the placement planner. */
function rockData(placeId, field, slot) {
  const stable = slot !== null && field.stable === true;
  const rng = stable
    ? makeRng(hash(`${placeId}:${field.id || "field"}:${slot}`))
    : random;
  const rock = field.rock || { rMin: 18, rMax: 70, orePerR: 1.6 };
  let r = roll(rng, rock.rMin, rock.rMax);
  const type = pickLoot(field.ore, rng);
  // Independent size stream preserves existing stable slots and combat RNG.
  const sizeRng = stable ? makeRng(hash(`giant:${placeId}:${field.id}:${slot}`)) : random;
  if (rock.giantChance > 0 && sizeRng() < rock.giantChance) {
    r = roll(sizeRng, rock.giantMin || 180, rock.giantMax || 400);
  }

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

  return {
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
  };
}

// Conservative bounds of the actual lumpy mesh, including nonuniform scale.
export function asteroidEnvelope(rock) {
  if (!rock.s0) return Number(rock.r) || 0;
  const vertices = builtInRockPositions(rock.shape || 0);
  let radius = 0;
  for (let i = 0; i < vertices.length; i += 3) {
    radius = Math.max(radius, Math.hypot(vertices[i] * rock.s0.x,
      vertices[i + 1] * rock.s0.y, vertices[i + 2] * rock.s0.z));
  }
  return radius;
}

const layouts = new Map();
/** Reserve ALL slots, even mined ones. Respawn/load order cannot move neighbours.
 * Pack largest first, across all fields, with a finite retry budget. If an authored
 * field is overfull, omit the unplaceable slot rather than intersect another rock. */
export function planAsteroids(placeId, fields) {
  const key = JSON.stringify([placeId, fields]);
  if (layouts.has(key)) return layouts.get(key);
  const slots = fields.flatMap(field => Array.from({ length: field.count }, (_, slot) => {
    const data = rockData(placeId, field, slot);
    return { field, slot, data, bound: asteroidEnvelope(data) };
  }));
  slots.sort((a, b) => b.bound - a.bound);
  const placed = [], result = new Map();
  for (const item of slots) {
    const { field, slot, data, bound } = item;
    const rng = makeRng(hash(`packing:${placeId}:${field.id}:${slot}`));
    for (let attempt = 0; attempt < 2500; attempt++) {
      let p;
      if (field.layout === "arc") {
        const arc = field.arc;
        const angle = arc.angle + arc.gap / 2 + rng() * (Math.PI * 2 - arc.gap);
        const radial = arc.inner + bound + rng() * Math.max(0, arc.width - 2 * bound);
        p = V(Math.cos(angle) * radial, roll(rng, -field.height, field.height), Math.sin(angle) * radial);
      } else {
        p = V(roll(rng, -field.radius, field.radius), roll(rng, -field.height, field.height), roll(rng, -field.radius, field.radius));
        if (p.length() > field.radius) continue;
      }
      p.add(V(...field.pos));
      if (placed.some(other => p.distanceToSquared(other.data.pos) < (bound + other.bound + 20) ** 2)) continue;
      data.pos = p;
      placed.push(item);
      result.set(rockMemoryId(field, slot), data);
      break;
    }
  }
  // Bounded cache: one plan per visited layout, not every system forever.
  if (layouts.size >= 24) layouts.delete(layouts.keys().next().value);
  layouts.set(key, result);
  return result;
}

export function spawnAsteroid(placeId = state.place, field = fieldAt(placeId), slot = null) {
  if (!field || (slot !== null && memoryCooling(placeId, "rock", rockMemoryId(field, slot)))) return null;
  let data;
  if (slot !== null && field.stable === true) {
    const fields = placeDef(placeId).features.filter(f => f.kind === "asteroidField" && f.stable === true && f.id !== field.id);
    fields.push(field);
    fields.sort((a, b) => a.id.localeCompare(b.id));
    data = planAsteroids(placeId, fields).get(rockMemoryId(field, slot));
    if (!data) return null;
  } else {
    for (let attempt = 0; attempt < 2500; attempt++) {
      data = rockData(placeId, field, slot);
      const bound = asteroidEnvelope(data);
      if (field.layout === "arc") {
        const arc = field.arc;
        const angle = arc.angle + arc.gap / 2 + random() * (Math.PI * 2 - arc.gap);
        const radial = arc.inner + bound + random() * Math.max(0, arc.width - 2 * bound);
        data.pos.set(field.pos[0] + Math.cos(angle) * radial, field.pos[1] + roll(random, -field.height, field.height), field.pos[2] + Math.sin(angle) * radial);
      }
      if (!placeWorld(placeId).asteroids.some(other => data.pos.distanceTo(other.pos) < bound + asteroidEnvelope(other) + 20)) break;
      data = null;
    }
    if (!data) return null;
  }
  return addEntity(placeWorld(placeId).asteroids, {
    ...data, pos: data.pos.clone(), quat: data.quat.clone(), s0: data.s0.clone(), scale: data.scale.clone(),
  });
}

/** Fill one field feature (called by the generic place loader). */
export function populateField(placeId, field = fieldAt(placeId)) {
  if (!field) return;
  for (let slot = 0; slot < field.count; slot++) spawnAsteroid(placeId, field, slot);
}
