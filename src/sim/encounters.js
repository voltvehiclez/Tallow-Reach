// Runtime assembly for static encounter features. The definitions and all tuning
// live in data/encounters.js; this file only turns a derelict or resource cache
// into the existing crate entities and listens for their pickup event.

import { encounterDef, encounterRespawn } from "../data/encounters.js";
import { random } from "../util/rng.js";
import { V } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { placeWorld } from "../state/state.js";
import { rollLoot } from "./loot.js";
import { spawnCrate } from "./combat.js";
import { memoryCooling, markEncounterCleared } from "./place-memory.js";

const rollCount = (range, rng = random) => {
  const [lo, hi] = range || [1, 1];
  return Math.max(0, lo + Math.floor(rng() * (hi - lo + 1)));
};

const scatter = (pos, metres, rng = random) =>
  V(pos[0] + (rng() * 2 - 1) * metres, pos[1] + (rng() * 2 - 1) * metres, pos[2] + (rng() * 2 - 1) * metres);

/** Spawn a static derelict/cache unless its saved cooldown is still running. */
export function spawnStaticEncounter(placeId, feature) {
  if (!feature?.id || !feature.encounter) return 0;
  const def = encounterDef(feature.encounter);
  if (!["derelict", "resourceCache"].includes(def.kind)) return 0;
  if (memoryCooling(placeId, "encounter", feature.id)) return 0;
  const W = placeWorld(placeId);
  if (W.crates.some(crate => crate.encounter === feature.id)) return 0;

  const position = feature.pos || [0, 0, 0];
  let made = 0;
  if (def.kind === "derelict") {
    for (const drop of rollLoot(def.loot)) {
      for (let i = 0; i < drop.count; i++) {
        spawnCrate(scatter(position, drop.scatter), drop.item, placeId, feature.id, feature.encounter);
        made++;
      }
    }
  } else {
    for (let i = 0; i < rollCount(def.count); i++) {
      spawnCrate(scatter(position, 20), def.item, placeId, feature.id, feature.encounter);
      made++;
    }
  }
  if (made) emit("encounter-spawned", { place: placeId, id: feature.id, encounter: feature.encounter });
  return made;
}

/** Clear a static encounter after its last crate is picked up. */
on("pickup", ({ item, player, place, encounter, encounterType } = {}) => {
  if (!place || !encounter) return;
  const W = placeWorld(place);
  if (W.crates.some(crate => crate.encounter === encounter)) return;
  // The feature id is the stable memory key; the encounter id is only needed
  // for the timer. The type travels with the crate, so hyphenated future ids do
  // not need to be parsed out of the feature id.
  const id = encounter;
  const defId = encounterType || (encounter.includes("-") ? encounter.split("-").slice(0, -1).join("-") : encounter);
  markEncounterCleared(place, id, encounterRespawn(defId));
  emit("encounter-cleared", { place, id, encounter: defId, item, player });
});
