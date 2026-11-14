// Rifts and instances (refactor step 14).
//
// An **instance** is a temporary, generated, harder place reached through a wormhole. It is not on
// the starmap and it is not a pocket of any system: it is a place record registered at runtime (see
// `registerInstancePlace` in data/places.js) whose features come from a template below. A wormhole
// the pilot spawns is called a **rift**; the natural, map-visible kind arrives in slice 14c.
//
// Everything the owner decided on 2026-11-14 lives here as numbers and ids, never as code
// (docs/VISION.md, "Step 14: rifts, instances and how you may leave one"):
//
//   * a rift opens where the ship is, and only in clear space;
//   * entering and leaving is a key press at close range, never contact;
//   * whether an instance may be left is `exit.requires` — data, so new criteria need no code;
//   * every clock ends in a declared way: `onExpire.kind` says what running out of time does. A
//     rift **kills** the pilot still inside it; a natural wormhole only **collapses** — the way in
//     fades, the way out keeps working and the pilot leaves whenever they like;
//   * the reward that matters is a physical `cache` that stays locked until the objective is done.
//
// A template is one entry in INSTANCE_TEMPLATES:
//
//   n, d          name and description, shown as the place's own (the HUD's top-right line)
//   tier          advisory difficulty, above the map's 1..3 (it selects nothing by itself today;
//                 content reads it the way a pocket's tier selects encounters)
//   lifetimeSec   simulation seconds before this instance collapses; 0 = no limit of its own.
//                 Simulation seconds only advance on unpaused ticks, so pausing never burns a
//                 clock. A rift's 20 minutes run from entry and are declared here. A simple
//                 wormhole's 20 minutes run from the moment its pocket spawns in normal space, so
//                 they live on that pocket's spawn record (slice 14c) and its instance says 0.
//   difficulty    { hp, dmg } multipliers applied to every hostile spawned inside
//   guardians     { enemy, count, spawnDist } the wave that opens on entry. `enemy` is an id from
//                 data/enemies.js; `spawnDist` is [min, max] metres from the arrival point, so
//                 nothing ever appears in the pilot's face.
//   objective     { kind, n } what must be done. `kind` is one of OBJECTIVE_KINDS; `n` is the
//                 player-facing sentence the HUD shows.
//   exit          { n, requires: [{ type, message }] } — `n` names the way out as the pilot sees it
//                 (a natural wormhole's is a "Stable wormhole": lore says it never fades). `type`
//                 is one of EXIT_REQUIREMENT_TYPES and `message` is what the pilot is told while it
//                 refuses. Empty `requires` means the instance may always be left.
//   onExpire      { kind, message } — `kind` is one of EXPIRY_OUTCOME_TYPES.
//   cache         { n, loot, pos } the locked container: `loot` is a table id from data/loot.js,
//                 `pos` where it hangs. Omit it for an instance with no cache.
//   enter         { pos } the arrival point inside, and where the way out stays.
//   features      ordinary place features (asteroidField, planet, encounter, ...), read by the same
//                 generic loader a pocket uses (sim/places.js). Never a `spawner`: an instance's
//                 hostiles are its declared wave, so its content is exactly what this file says.
//
// `npm test` (tests/step14-instances.test.mjs) fails if a template is missing a field or names an
// enemy, loot table, objective, exit rule or outcome that does not exist.

/** How a pilot opens, uses and gets out of a rift. Distances are metres. */
export const RIFT = {
  enterRange: 200,     // fly this close to a rift in space and press R to go in
  exitRange: 220,      // inside, the way out is the entry point; press R this close to leave
  warnSec: 60,         // the HUD warns this long before an instance collapses

  // "At least 1 km from a big structure like asteroids or stations" (owner). Measured to the thing
  // itself: a station's position, an asteroid field's edge (its centre plus its radius), a planet's
  // surface, and — with a much smaller margin — any single rock, so a rift never opens inside one.
  clearance: { station: 1000, field: 1000, planet: 1000, rock: 150 },
};

/** What an objective can ask for. The handlers live in `sim/instances.js`. */
export const OBJECTIVE_KINDS = ["destroy-guardians"];

/** What may hold an exit shut. The handlers live in `sim/instances.js` (`EXIT_REQUIREMENTS`). */
export const EXIT_REQUIREMENT_TYPES = ["objective-done"];

/**
 * What running out of time can do. The handlers live in `sim/instances.js` (`EXPIRY_OUTCOMES`).
 *
 *   kill      the pilot still inside dies as in any death, and the instance and its way in despawn
 *             at once. A player-deployed rift: it collapses with your ship in it.
 *   collapse  only the way in goes. The instance stays open, its exit keeps working and the pilot
 *             leaves whenever they like — back to a pocket whose wormhole has already faded, so
 *             there is nothing there to fly through again. A natural (simple) wormhole: its 20
 *             minutes belong to the entry, never to the exit.
 */
export const EXPIRY_OUTCOME_TYPES = ["kill", "collapse"];

export const INSTANCE_TEMPLATES = {
  // The Basic rift's usual run: four hardened guardians hold a small, rich pocket shut.
  guardian_rift: {
    n: "Guardian rift",
    d: "A collapsed pocket, held shut by pirate guardians.",
    tier: 4,
    lifetimeSec: 1200,           // 20 minutes of unpaused play
    difficulty: { hp: 1.6, dmg: 1.5 },
    guardians: { enemy: "raider", count: 4, spawnDist: [800, 1100] },
    objective: { kind: "destroy-guardians", n: "Destroy the rift guardians" },
    exit: {
      n: "Rift gate",
      requires: [
        { type: "objective-done", message: "The way out is sealed until the rift guardians are destroyed." },
      ],
    },
    onExpire: { kind: "kill", message: "The rift collapsed with your ship inside it." },
    cache: { n: "Rift cache", loot: "rift_cache", pos: [0, -30, -520] },
    enter: { pos: [0, 0, 320] },
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Rift debris",
        pos: [900, 60, -700],
        radius: 480,
        height: 170,
        count: 26,
        ore: "rift_rock",
        respawnSec: 420,
        stable: true,             // deterministic per instance seed; an instance writes no place memory
        rock: { rMin: 20, rMax: 72, orePerR: 1.9 },
        salvage: { spread: [500, 120, 500] },
      },
      {
        kind: "planet",
        id: "planet",
        pos: [-5200, -1400, -8600],
        radius: 2000,
        atmosphere: 2140,
        col: 0x3b2f45,
        atmoCol: 0x7d5f96,
        spin: 0.0022,
      },
    ],
  },

  // The Basic rift's rarer, deadlier run: a deeper collapse that pays much better.
  deep_rift: {
    n: "Deep rift",
    d: "A deep collapse. Something heavier is holding it shut.",
    tier: 6,
    lifetimeSec: 1500,           // 25 minutes: a bigger run gets a longer clock
    difficulty: { hp: 2.2, dmg: 2 },
    guardians: { enemy: "raider", count: 6, spawnDist: [900, 1300] },
    objective: { kind: "destroy-guardians", n: "Destroy the rift guardians" },
    exit: {
      n: "Rift gate",
      requires: [
        { type: "objective-done", message: "The way out is sealed until the rift guardians are destroyed." },
      ],
    },
    onExpire: { kind: "kill", message: "The deep rift collapsed with your ship inside it." },
    cache: { n: "Deep rift cache", loot: "rift_cache_deep", pos: [0, -40, -640] },
    enter: { pos: [0, 0, 360] },
    features: [
      {
        kind: "asteroidField",
        id: "field",
        n: "Deep rift debris",
        pos: [-1000, -80, -820],
        radius: 620,
        height: 220,
        count: 34,
        ore: "rift_rock",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 22, rMax: 80, orePerR: 2.1 },
        salvage: { spread: [600, 140, 600] },
      },
      {
        kind: "planet",
        id: "planet",
        pos: [6400, 900, -9200],
        radius: 2400,
        atmosphere: 2560,
        col: 0x2b3a44,
        atmoCol: 0x4f8fa5,
        spin: 0.0018,
      },
    ],
  },
};

export const INSTANCE_TEMPLATE_IDS = Object.keys(INSTANCE_TEMPLATES);
export const DEFAULT_INSTANCE_TEMPLATE = INSTANCE_TEMPLATE_IDS[0];

export const isInstanceTemplate = id => Object.prototype.hasOwnProperty.call(INSTANCE_TEMPLATES, id);

/** A template by id, or null. A wrong id refuses rather than quietly opening a different rift. */
export const instanceTemplate = id => (isInstanceTemplate(id) ? INSTANCE_TEMPLATES[id] : null);

/**
 * The rift kinds an item can open. An item's `rift` field (data/items.js) names one; `templates`
 * is a weighted pool, so one item can open more than one kind of instance and the odds are a line
 * of data. Adding a rift item is one entry here, one in data/items.js and a shop row.
 */
export const RIFTS = {
  basic: {
    n: "Basic rift",
    templates: [
      { id: "guardian_rift", w: 85 },
      { id: "deep_rift", w: 15 },
    ],
  },
};

export const isRift = id => Object.prototype.hasOwnProperty.call(RIFTS, id);
export const riftDef = id => (isRift(id) ? RIFTS[id] : null);

// Which template a rift opens is a weighted roll, and a roll is behaviour: it lives in
// `rollRiftTemplate` in sim/instances.js, the way data/loot.js is rolled by sim/loot.js.

/** The instance id for a template and seed. Derived, never counted, so the same
 *  seed always gives the same instance — including its deterministic rock slots. */
export const instanceIdFor = (templateId, seed) => `rift-${templateId}-${(seed >>> 0).toString(36)}`;
