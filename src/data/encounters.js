// Encounter content. An encounter is a named thing a place template can pull in;
// the simulation only knows the four kinds below and reads the rest from this
// table. Adding a patrol, trader, derelict or cache is therefore a data edit.
//
// Fields used by the generic systems:
//   kind       hostilePatrol | friendlyTrader | derelict | resourceCache
//   respawnSec how long a cleared encounter stays absent in simulation seconds
//   enemy      default enemy for a hostile patrol
//   shop       shop id used by a friendly trader's station feature
//   loot       loot table id used by a derelict
//   item/count resource cache contents

export const ENCOUNTERS = {
  hostile_patrol: {
    kind: "hostilePatrol",
    n: "Hostile patrol",
    d: "Pirate ships sweeping the pocket.",
    enemy: "raider",
    faction: "pirates",
    count: [1, 2],
    maxActive: 2,
    interval: [5, 10],
    chance: 0.65,
    nearRadius: 1500,
    farFromStation: 450,
    spawnDist: [800, 1100],
    once: true,
    respawnSec: 420,
  },

  friendly_trader: {
    kind: "friendlyTrader",
    n: "Wayfarer trader",
    d: "A friendly trader with a small weapons counter.",
    shop: "meridian",
    station: {
      keepout: 90,
      dockRange: 260,
      dockSpeed: 70,
      launch: { pos: [0, 0, 220], face: "field" },
    },
    // A trader is available again after a future story/event removes it. The
    // current station is not cleared by ordinary play, so this is an extension
    // point rather than an automatic respawn loop.
    respawnSec: 420,
  },

  derelict: {
    kind: "derelict",
    n: "Derelict freighter",
    d: "A dead ship tumbling with salvage still aboard.",
    loot: "derelict",
    respawnSec: 420,
  },

  resource_cache: {
    kind: "resourceCache",
    n: "Resource cache",
    d: "A sealed cache of useful ore.",
    item: "ferrite",
    count: [3, 6],
    respawnSec: 420,
  },
};

export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS);
export const DEFAULT_ENCOUNTER = "hostile_patrol";

/** Unknown encounter ids never crash a generated place. */
export const encounterDef = id => ENCOUNTERS[id] || ENCOUNTERS[DEFAULT_ENCOUNTER];

/** The configured timer for a cleared encounter, in simulation seconds. */
export const encounterRespawn = id => Math.max(0, encounterDef(id).respawnSec || 0);
