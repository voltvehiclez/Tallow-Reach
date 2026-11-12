// Generic place loader. A place definition is a list of features; this file
// turns the entity-bearing features into runtime records and announces entry so
// render/ can build scenery. It imports no render code.

import { V } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { state, placeWorld } from "../state/state.js";
import { placeAt, placeDef, featureOf, featureById, isPocket } from "../data/places.js";
import { populateField, spawnAsteroid } from "./asteroids.js";
import { spawnStaticEncounter } from "./encounters.js";
import { restoreMissionDrops } from "./combat.js";
import { recordSystemVisit } from "./galaxy.js";

/** Build a place's entities once per session. Safe to call repeatedly. */
export function loadPlace(id) {
  const container = state.places.get(id) || (placeWorld(id), state.places.get(id));
  if (container.loaded) {
    refreshPlace(id);
    restoreMissionDrops(id);
    return container;
  }
  for (const feature of placeDef(id).features) {
    if (feature.kind === "asteroidField") populateField(id, feature);
    else if (feature.kind === "encounter") spawnStaticEncounter(id, feature);
    // station / planet / spawner features are read by the systems that use them;
    // scenery is built by render/ from the same definition on place-entered.
  }
  container.loaded = true;
  restoreMissionDrops(id);
  return container;
}

/** Rebuild only things whose persistent cooldown says they are ready. */
export function refreshPlace(id) {
  const container = state.places.get(id);
  if (!container?.loaded) return container || null;
  for (const feature of placeDef(id).features) {
    if (feature.kind === "encounter") spawnStaticEncounter(id, feature);
  }
  return container;
}

// A timer expiry is an event rather than a direct import from the memory system:
// a later story/event can use the same bus to force a respawn.
on("place-memory-ready", ({ placeId, kind, id } = {}) => {
  const container = state.places.get(placeId);
  if (!container?.loaded) return;
  if (kind === "encounter") {
    const feature = placeDef(placeId).features.find(f => f.kind === "encounter" && f.id === id);
    if (feature) spawnStaticEncounter(placeId, feature);
    return;
  }
  if (kind === "rock") {
    const field = placeDef(placeId).features.find(f => f.kind === "asteroidField");
    if (!field || !id) return;
    const prefix = `${field.id || "field"}:`;
    if (!String(id).startsWith(prefix)) return;
    const slot = Number(String(id).slice(prefix.length));
    if (!Number.isInteger(slot) || slot < 0) return;
    if (!container.entities.asteroids.some(rock => rock.memoryId === id)) spawnAsteroid(placeId, field, slot);
  }
});

/** Put a pilot in a pocket. The local alias/scenery follows only the local pilot. */
export function enterPlace(id, player = state.player) {
  if (!isPocket(id)) return false;
  loadPlace(id);
  const local = player === state.player;
  if (local) recordSystemVisit(state.galaxy, state.worldState.galaxy?.knowledge, id);
  if ((player ? player.place : state.place) === id) {
    if (local) state.place = id;
    return true;
  }
  if (player) player.place = id;
  if (local) {
    state.place = id;
    state.worldState.place = id;
  }
  emit("place-entered", { id, player });
  return true;
}

/** Arrival point of a pocket as a vector. */
export const arrivalPos = id => V(...placeAt(id).enter.pos);

/** The station feature in a pocket, or null. */
export const stationAt = id => featureOf(id, "station");

/** The first asteroid field feature in a pocket, or null. */
export const fieldAt = id => featureOf(id, "asteroidField");

/** Resolve a station launch `face` target (a named feature) to a vector. */
export function launchFace(placeId, station) {
  const target = station.launch && station.launch.face ? featureById(placeId, station.launch.face) : null;
  return target ? V(...target.pos) : V(...(station.launch?.pos || station.pos));
}
