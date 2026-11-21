// Where a station is, in somebody else's world (refactor step 16).
//
// Custody asks one question of a world it is not playing in: "does station
// `placeId:featureId` exist here, and what pocket is it in?" A pilot's lockers move
// between worlds, and a world that lacks a station must be able to say so *without*
// being loaded into the live game.
//
// Two things make that harder than a lookup:
//
//  1. Generated pocket ids ARE NOT UNIQUE ACROSS SEEDS. `sys-002-hub` is a
//     different pocket, with a different station, in a galaxy with another seed. So
//     a station key is always resolved with the *world it belongs to* in hand, and a
//     station index carries that world's seed so two of them can never be mixed up
//     by accident.
//  2. The live game resolves a station through `data/places.js`'s catalog, which
//     belongs to the world being played. Flip-flopping that catalog to inspect
//     another world would move the ground under the running game, so this file walks
//     the world's own resolved galaxy by hand instead
//     (`sim/galaxy.js` `generateGalaxy(seed)`, which is pure).
//
// A "station index" is plain data: `{ seed, places: { stationKey: pocketId } }`.
//
//   stationsOf(galaxy)                 from a resolved galaxy (live, or generated)
//   stationsOfWorld(world)             from a save's `world`: its seed, its saved
//                                      wormhole pockets, and the pockets it is standing in
//   stationIn(index, key)              the one question custody asks
//   stationKeys(index)                 every station key, sorted
//
// Wormhole pockets exist at runtime, not in a seed: a world's own wormhole pockets are
// known from its `world.wormholes` rows (which hold the template the pocket had) and
// from its `world.place` / `world.instances[].origin` (the door a pilot entered). All
// of them are read here, so a hull parked in a wormhole pocket is not "lost".

import { generateGalaxy } from "../sim/galaxy.js";
import { PLACES, PLACE_DEFS, stationKeyAt } from "../data/places.js";
import { templateAt, templateFeatures } from "../data/place-templates.js";
import { sceneryFeatures } from "../data/scenery.js";
import { GALAXY } from "../data/galaxy.js";
import { WORMHOLE_POCKET } from "../data/instances.js";

/**
 * The features of one pocket record, using its template when it has one and its
 * authored definition otherwise — the same walk `data/places.js` `placeDef` does for
 * the live catalog, done here so that any world can be read.
 */
function featuresOfPlace(place) {
  if (!place || typeof place !== "object" || typeof place.id !== "string") return [];
  if (place.template && templateAt(place.template)) return templateFeatures(place.template, place).features;
  const definition = PLACE_DEFS[place.def] || { features: [] };
  const explicit = [
    ...(Array.isArray(place.features) ? place.features : []),
    ...(Array.isArray(place.extraFeatures) ? place.extraFeatures : []),
  ];
  const additions = JSON.parse(JSON.stringify(explicit));
  return sceneryFeatures(place, [...(definition.features || []).map(feature => ({ ...feature })), ...additions]);
}

/** The stable station key `placeId:featureId` of pocket record `place`, or null. */
export function stationKeyOfPlace(place) {
  const station = featuresOfPlace(place).find(feature => feature.kind === "station");
  return station && station.id ? `${place.id}:${station.id}` : null;
}

/**
 * A station index for a resolved galaxy — the shape `sim/galaxy.js`
 * `generateGalaxy(seed)` returns, or the live one in `state.galaxy`. Off-chart
 * systems are included: their pockets are ordinary pockets with templates, so a
 * hull parked in one stays there.
 */
export function stationsOf(galaxy, seed = galaxy?.seed) {
  const places = {};
  for (const place of Object.values(galaxy?.pockets || {})) {
    const key = stationKeyOfPlace(place);
    if (key) places[key] = place.id;
  }
  return { seed: Number.isFinite(seed) ? seed >>> 0 : null, places };
}

/** The pocket ids of a world's own wormhole pockets, and the template each had. */
function savedWormholePockets(world) {
  const out = new Map();
  for (const row of Array.isArray(world?.wormholes) ? world.wormholes : []) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    out.set(row.id, row.template || null);
  }
  return out;
}

/**
 * A station index for a saved world. The seed comes from `world.galaxy.seed`; its
 * wormhole pockets come from `world.wormholes` plus any pocket the save is standing
 * in (the guest arrives docked, and a hull may be parked at a trader inside one).
 * Nothing about the live game is touched.
 */
export function stationsOfWorld(world, options = {}) {
  const seed = Number.isFinite(world?.galaxy?.seed) ? world.galaxy.seed >>> 0 : GALAXY.seed;
  let galaxy = null;
  try {
    galaxy = generateGalaxy(seed);
  } catch {
    // A seed this build cannot generate (a newer build wrote the save). The index is
    // then the authored pockets plus the saved wormholes; a station it cannot see is
    // treated as missing, which sends cargo to Meridian rather than anywhere unsafe.
    galaxy = null;
  }
  const index = stationsOf(galaxy, seed);

  const wormholes = options.wormholes === false ? new Map() : savedWormholePockets(world);
  for (const [pocketId, template] of wormholes) {
    // A wormhole pocket is the ordinary "Simple Wormhole" pocket (`WORMHOLE_POCKET`)
    // under its own id; its parent system is the system it spawned in. The template
    // is kept because a station inside one comes from the template's trader.
    const place = {
      id: pocketId,
      kind: "pocket",
      def: "empty",
      role: "ordinary",
      parent: null,
      ...(template ? { template } : {}),
      features: WORMHOLE_POCKET.features,
    };
    const key = stationKeyOfPlace(place);
    if (key) index.places[key] = pocketId;
  }
  // The pocket the save is standing in is a place this world certainly has; if it is
  // a wormhole pocket that is younger than its saved row, it is still real now.
  if (typeof world?.place === "string" && world.place) {
    const fromGalaxy = galaxy?.pockets?.[world.place];
    if (fromGalaxy) {
      const key = stationKeyOfPlace(fromGalaxy);
      if (key) index.places[key] = world.place;
    } else if (!Object.values(index.places).includes(world.place)) {
      const place = { id: world.place, kind: "pocket", def: "empty", features: WORMHOLE_POCKET.features };
      const key = stationKeyOfPlace(place);
      if (key) index.places[key] = world.place;
    }
  }
  return index;
}

/** Does station `key` exist in the world this index describes? Its pocket id, or null. */
export const stationIn = (index, key) =>
  index && typeof key === "string" && Object.prototype.hasOwnProperty.call(index.places, key)
    ? index.places[key]
    : null;

/** Every station key an index knows, in a stable order. */
export const stationKeys = index => Object.keys(index?.places || {}).sort();

/** The authored pockets' stations, for a world whose galaxy could not be generated. */
export function authoredStations() {
  const places = {};
  for (const place of Object.values(PLACES)) {
    if (place.kind !== "pocket") continue;
    const key = stationKeyAt(place.id);
    if (key) places[key] = place.id;
  }
  return { seed: null, places };
}
