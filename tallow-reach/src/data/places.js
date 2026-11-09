// Places: anything the ship can fly around in, plus the non-flyable systems that
// group them. A place record is { id, kind, def, parent, enter, leave }; `def`
// names an entry in PLACE_DEFS below. You are always in a pocket, never "in" a
// system itself. Internal ids are stable save ids: `reach` used to be shown as
// Tallow Reach and is now Meridian Station; `hollow` is Kestrel Hollow.
//
// Generic player-facing nouns live in data/terms.js. Proper names live here.
// Adding a pocket to a system is one entry here plus a definition. Step 11A
// adds explicit pocket links below for the generated starmap; the live M key
// still cycles siblings until step 11B wires the map screen.

export const PLACE_DEFS = {
  // Today's Tallow Reach: the station, the asteroid belt, the planet backdrop
  // and the raider spawner. Every position/radius/rule the sim used to hard-code
  // is a feature here. The station is a feature of this pocket, not a child place.
  meridian: {
    features: [
      {
        kind: "station",
        id: "meridian",
        n: "Meridian Station",
        pos: [0, 0, 0],
        keepout: 120,          // ships closer than this are pushed back out
        dockRange: 300,        // G docks inside this range
        dockSpeed: 70,         // ...and below this speed (m/s)
        launch: { pos: [0, 0, 200], face: "field" },
        shop: "meridian",      // names a row group in data/shops.js
      },
      {
        kind: "asteroidField",
        id: "field",
        n: "Asteroid field",
        pos: [1800, 200, -1500],
        radius: 700,           // horizontal spread
        height: 250,           // vertical spread
        count: 70,
        ore: "asteroid",       // loot table id (data/loot.js)
        respawnMs: 30000,      // wall-clock respawn delay (step 12 moves this to sim time)
        rock: { rMin: 18, rMax: 70, orePerR: 1.6 },
        salvage: { spread: [600, 150, 600] },
      },
      {
        kind: "spawner",
        id: "raiders",
        enemy: "raider",
        // Wandering raiders appear when an active pilot is far from the station
        // and near the field. Hunt contracts use the same rules as before.
        anchor: "field",
        nearRadius: 1400,
        farFromStation: 600,
        interval: [4, 8],
        chance: 0.4,
        maxWanderers: 2,
        count: [1, 2],
      },
      {
        kind: "planet",
        id: "planet",
        pos: [-7000, -1500, -10000],
        radius: 2800,
        atmosphere: 2950,
        col: 0x2c3b45,
        atmoCol: 0x4f7f95,
        spin: 0.003,           // radians a second (visual only)
      },
    ],
  },
  // Empty space. Nothing out here yet; the owner will add content later.
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
 *  system). Step 11A validates these records; step 11B makes travel use them.
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

export const isPlace = id => Object.prototype.hasOwnProperty.call(PLACES, id);
export const isPocket = id => isPlace(id) && PLACES[id].kind === "pocket";
export const isSystem = id => isPlace(id) && PLACES[id].kind === "system";

/** The place record for `id`, falling back to the starting pocket. */
export const placeAt = id => PLACES[id] || PLACES[DEFAULT_PLACE];

/** The definition named by a place record (empty when it has none). */
export const placeDef = id => PLACE_DEFS[placeAt(id).def] || { features: [] };

/** Every feature of one kind in a place definition, in data order. */
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
export const pocketsIn = systemId => PLACE_IDS.filter(id => PLACES[id].kind === "pocket" && PLACES[id].parent === systemId);

/** The pocket M warps to next inside the current system. */
export function nextPocket(id) {
  const here = placeAt(id);
  const siblings = pocketsIn(here.parent);
  if (!siblings.length) return id;
  const i = siblings.indexOf(here.id);
  return siblings[(i + 1) % siblings.length];
}
