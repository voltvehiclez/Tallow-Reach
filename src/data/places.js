// Places: anything the ship can fly around in, plus the non-flyable systems that
// group them. A place record is { id, kind, def, parent, enter, leave }; `def`
// names an entry in PLACE_DEFS below. You are always in a pocket, never "in" a
// system itself. Internal ids are stable save ids: `reach` used to be shown as
// Tallow Reach and is now Meridian Station; `hollow` is Kestrel Hollow.
//
// Generic player-facing nouns live in data/terms.js. Proper names live here.
// Adding an authored pocket is one entry here plus a definition. Step 11B
// installs a resolved galaxy as the live lookup catalog; these tables remain
// the author source and the fallback for legacy/headless callers.

// Derived runtime catalog, never saved. sim/galaxy-session.js replaces it when
// a seed is loaded. Keeping lookup here lets existing sim/render callers use
// generated pockets without importing the map screen or knowing the generator.
import { sceneryFeatures } from "./scenery.js";
import { templateAt, templateFeatures } from "./place-templates.js";

let livePlaces = null;

// Runtime instance places (step 14): temporary, generated, never on the starmap and never saved as
// geography. They are kept apart from the resolved galaxy so that installing a catalog — a load, an
// import, a new game — drops every instance with it, and so `pocketsIn`/the map can never see one.
let instancePlaces = null;

// Runtime wormhole pockets (slice 14c): the simple wormholes that spawn themselves in normal
// space. Unlike an instance they ARE on the map — pockets of the system they spawned in, warpable
// like its siblings, saved with their remaining time — but they are still runtime geography, kept
// apart from the seeded galaxy for the same reason, and dropped/re-added by the wormhole module
// (`sim/wormholes.js`) on every load.
let wormholePlaces = null;
let merged = null;

// Built on first use, not at import time: `PLACES` is declared further down this file.
function rebuildCatalog() {
  const base = livePlaces || PLACES;
  let out = base;
  if (wormholePlaces) out = { ...out, ...wormholePlaces };
  if (instancePlaces) out = { ...out, ...instancePlaces };
  merged = out;
  return merged;
}

export function setPlaceCatalog(galaxy = null) {
  livePlaces = galaxy ? {
    ...(galaxy.systemsById || Object.fromEntries(galaxy.systems.map(s => [s.id, s]))),
    ...Object.fromEntries(Object.entries(galaxy.pockets).filter(([,p]) => !p.connection)),
  } : null;
  // A replaced world leaves no instance or wormhole behind: they belong to the session that made
  // them. The save carries the wormholes (slice 14c) and re-registers them on load.
  instancePlaces = null;
  wormholePlaces = null;
  rebuildCatalog();
}

/** Register a runtime instance place (`sim/instances.js`). Returns the record. */
export function registerInstancePlace(record) {
  if (!record || typeof record.id !== "string" || !record.id) return null;
  if (!instancePlaces) instancePlaces = {};
  instancePlaces[record.id] = record;
  rebuildCatalog();
  return record;
}

/** Forget one instance place. Returns whether there was one to forget. */
export function unregisterInstancePlace(id) {
  if (!instancePlaces || !Object.prototype.hasOwnProperty.call(instancePlaces, id)) return false;
  delete instancePlaces[id];
  if (!Object.keys(instancePlaces).length) instancePlaces = null;
  rebuildCatalog();
  return true;
}

/** Forget every instance place (a load, an import, a new game, a reset). */
export function clearInstancePlaces() {
  if (!instancePlaces) return false;
  instancePlaces = null;
  rebuildCatalog();
  return true;
}

/** Is this id a runtime instance rather than a pocket of the map? */
export const isInstancePlace = id =>
  !!instancePlaces && typeof id === "string" && Object.prototype.hasOwnProperty.call(instancePlaces, id);

/** Register a runtime wormhole pocket (slice 14c). The record must be a pocket of its parent
 *  system — `kind: "pocket"` — so `isPocket` accepts it and the map and the warp rules treat it
 *  like any sibling. Saves persist these records; the wormhole module re-registers them on load. */
export function registerWormholePlace(record) {
  if (!record || typeof record.id !== "string" || !record.id || record.kind !== "pocket") return null;
  if (!wormholePlaces) wormholePlaces = {};
  wormholePlaces[record.id] = record;
  rebuildCatalog();
  return record;
}

/** Forget one wormhole pocket. Returns whether there was one to forget. */
export function unregisterWormholePlace(id) {
  if (!wormholePlaces || !Object.prototype.hasOwnProperty.call(wormholePlaces, id)) return false;
  delete wormholePlaces[id];
  if (!Object.keys(wormholePlaces).length) wormholePlaces = null;
  rebuildCatalog();
  return true;
}

/** Forget every wormhole pocket (a load, an import, a new game, a reset). */
export function clearWormholePlaces() {
  if (!wormholePlaces) return false;
  wormholePlaces = null;
  rebuildCatalog();
  return true;
}

export const isWormholePlace = id => !!wormholePlaces && Object.prototype.hasOwnProperty.call(wormholePlaces, id);

const catalog = () => merged || rebuildCatalog();

/**
 * The sky every ordinary pocket is flown under — normal space, as opposed to the somewhere else
 * an instance is (`data/instances.js`, whose template carries its own `sky`). It is a generated
 * cube-map skybox (`data/skyboxes.js`, made with `tools/skybox/skybox.py`, recipe 24): six 90-degree
 * faces on the inside of a box, and it carries the stars itself.
 *
 * Owner 2026-11-15: "remove the existing starfield. This is because our previously generated
 * skybox already has some stars baked in it. I might re-add star fields in the future but not
 * now." So `render/scene.js` draws no starfield of its own: the picture is the stars, and two
 * sets of them would double up. Putting a starfield back is one flag there, not a data change.
 *
 * This is the default, not a rule: a place record may carry its own `sky` to override it, and a
 * runtime instance already does. A skybox id that is not installed is dropped here (the pocket
 * then falls back to plain black), so a typo costs a background and never the place — and
 * `npm test` names the typo.
 */
export const DEFAULT_SKY = { kind: "cube", skybox: "normal_space", shards: 0, starfield: false };

export const PLACE_DEFS = {
  // Today's Tallow Reach: the station, the asteroid belt and the raider spawner. Every position/radius/rule the sim used to hard-code
  // is a feature here. The station is a feature of this pocket, not a child place.
  meridian: {
    features: [
      {
        kind: "station",
        id: "meridian",
        n: "Meridian Station",
        model: "original-meridian",
        pos: [0, 0, 0],
        dockRange: 300,        // G docks inside this range
        dockSpeed: 70,         // ...and below this speed (m/s)
        launch: { pos: [0, 0, 200], face: "field" },
        shop: "meridian",      // names a row group in data/shops.js
      },
      {
        kind: "asteroidField",
        id: "field",
        n: "Asteroid field",
        pos: [0, -50, 600],
        layout: "arc",
        arc: { inner: 4000, width: 2000, gap: Math.PI / 2, angle: Math.PI / 2 },
        focus: [1800, 200, -1500],
        radius: 6000,
        height: 280,
        count: 469, // half-density follow-up; footprint and height unchanged
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 18, rMax: 85, giantChance: 0.025, giantMin: 180, giantMax: 360, orePerR: 1.6 },
        salvage: { spread: [750, 180, 750] },
      },
      {
        kind: "spawner",
        id: "raiders",
        encounter: "hostile_patrol",
        // The generic patrol spawner keeps today's wandering behaviour. Hunt
        // contracts still override its enemy and desired count in sim/ai.js.
        anchor: "field",
        nearRadius: 1400,
        farFromStation: 600,
        interval: [4, 8],
        chance: 0.4,
        maxWanderers: 2,
        count: [1, 2],
        once: false,
      },
    ],
  },
  // Korr Flight School: a compact training range with a station and ferrite rocks.
  // This place definition is shared by the campaign catalog only; open-world PLACES
  // does not register a pocket that uses it.
  auric_flight_school: {
    features: [
      {
        kind: "station", id: "korr-flight-school", n: "Korr Flight School",
        model: "original-meridian", pos: [0, 0, 0], dockRange: 300, dockSpeed: 70,
        launch: { pos: [0, 0, 260], face: "field" }, shop: "meridian",
      },
      {
        kind: "asteroidField", id: "training-field", n: "Training range",
        layout: "arc", arc: { inner: 950, width: 420, gap: Math.PI * 0.85, angle: Math.PI / 2 },
        focus: [700, 100, -600], pos: [0, -20, 750], radius: 1500, height: 180,
        count: 34, ore: "ferrite", respawnSec: 420, stable: true,
        rock: { rMin: 16, rMax: 58, giantChance: 0, giantMin: 120, giantMax: 200, orePerR: 1.35 },
      },
    ],
  },
  empty: { features: [] },
};

export const PLACES = {
  meridian: {
    id: "meridian",
    kind: "system",
    n: "Meridian System",
    parent: null,
  },
  reach: {
    id: "reach",
    kind: "pocket",
    def: "meridian",
    parent: "meridian",
    n: "Meridian Station",
        model: "original-meridian",
    mapHeight: -0.049,       // AU below the sun’s system-space plane
    sunwardArrival: 1000,   // metres from the station, facing back toward it
    d: "Meridian Station and the asteroid belt.",
    enter: { kind: "warp", pos: [0, 0, 300] },
    leave: { kind: "warp" },
  },
  hollow: {
    id: "hollow",
    kind: "pocket",
    def: "empty",
    parent: "meridian",
    n: "Kestrel Hollow",
    d: "Empty space. Nothing out here yet.",
    enter: { kind: "warp", pos: [0, 0, 300] },
    leave: { kind: "warp" },
  },
};

/** Explicit routes between authored pockets. Generated gate/internal routes are
 *  added by sim/galaxy.js. A link is { id, kind, a, b, mode, cost, requires,
 *  enabled }; `kind` is "internal" (same system) or "gate" (one peer in another
 *  system). sim/travel.js validates these records before every live warp.
 *  Meridian Station <-> Kestrel Hollow is the only authored route today. */
export const PLACE_LINKS = {
  "reach-hollow": {
    id: "reach-hollow", kind: "internal", a: "reach", b: "hollow",
    mode: "warp", cost: {}, requires: [], enabled: true,
  },
};

/** How far from a pocket's origin a saved position may sit and still be trusted
 *  on load (metres). Anything beyond this, or not a finite number, is treated as
 *  a damaged save and the pilot falls back to the pocket's arrival point. */
export const PLACE_EXTENT = 1e7;

/** Where a new game starts. It must be a pocket with a station feature. */
export const DEFAULT_PLACE = "reach";

export const PLACE_IDS = Object.keys(PLACES);

export const isPlace = id => typeof id === "string" && Object.prototype.hasOwnProperty.call(catalog(), id);
export const isPocket = id => isPlace(id) && catalog()[id].kind === "pocket";
export const isSystem = id => isPlace(id) && catalog()[id].kind === "system";

/** The place record for `id`, falling back to the starting pocket. */
export const placeAt = id => (isPlace(id) ? catalog()[id] : null) || catalog()[DEFAULT_PLACE] || PLACES[DEFAULT_PLACE];

/**
 * The definition named by a place record. Generated pockets retain the legacy
 * `def: "empty"` marker for old map/save tools, so their explicit `template`
 * wins when present; authored definitions keep their original behaviour.
 */
export function placeDef(id) {
  const place = placeAt(id);
  if (place.template && templateAt(place.template)) return templateFeatures(place.template, place);
  const definition = PLACE_DEFS[place.def] || { features: [] };
  const explicit = [
    ...(Array.isArray(place.features) ? place.features : []),
    ...(Array.isArray(place.extraFeatures) ? place.extraFeatures : []),
  ];
  const additions = JSON.parse(JSON.stringify(explicit));
  return { ...definition, features: sceneryFeatures(place, [...(definition.features || []).map(feature => ({ ...feature })), ...additions]) };
}

/** Stable inventory key for the station feature in a pocket. Generated station
 * ids are namespaced by their pocket, so two traders with the same encounter
 * kind never share storage. The home key is also exposed through the legacy
 * `world.store` alias for old saves and callers. */
export function stationKeyAt(id = DEFAULT_PLACE) {
  if (!isPocket(id)) return null;
  const place = placeAt(id);
  const station = placeDef(place.id).features.find(feature => feature.kind === "station");
  return station?.id ? `${place.id}:${station.id}` : null;
}

/** Every feature of one kind, in data order. */
export const featuresOf = (id, kind) => placeDef(id).features.filter(f => f.kind === kind);

/** The first feature of one kind, or null. */
export const featureOf = (id, kind) => featuresOf(id, kind)[0] || null;

/** A named feature inside a place definition, or null. */
export function featureById(placeId, featureId) {
  return placeDef(placeId).features.find(f => f.id === featureId) || null;
}

/** The system a pocket belongs to (its parent), or null for a system/orphan. */
export function systemOf(id) {
  const p = placeAt(id);
  if (p.kind === "system") return p.id;
  return p.parent && isSystem(p.parent) ? p.parent : null;
}

/** Every pocket whose parent is system `systemId`, in data order. Never assumes two. */
export const pocketsIn = systemId => Object.keys(catalog()).filter(id => catalog()[id].kind === "pocket" && catalog()[id].parent === systemId);

/** Legacy sibling-cycle helper (kept for old tests/tools). Live M opens the map. */
export function nextPocket(id) {
  const here = placeAt(id);
  const siblings = pocketsIn(here.parent);
  if (!siblings.length) return id;
  const i = siblings.indexOf(here.id);
  return siblings[(i + 1) % siblings.length];
}
