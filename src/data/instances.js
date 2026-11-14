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
//   exit          { n, pos, r, requires: [{ type, message }] } — the way out is an object of its own
//                 in the world, lockable with F and labelled on the HUD: `pos` is where it hangs and
//                 `r` how big it is drawn. `n` names it as the pilot sees it (a natural wormhole's is
//                 a "Stable wormhole": lore says it never fades). `type` is one of
//                 EXIT_REQUIREMENT_TYPES and `message` is what the pilot is told while it refuses.
//                 Empty `requires` means it is never locked.
//   onExpire      { kind, message } — `kind` is one of EXPIRY_OUTCOME_TYPES.
//   cache         { n, loot, pos, r } the prize: a canister, locked but plainly visible from the
//                 moment the pilot arrives. Once the objective is done, flying within
//                 `RIFT.cacheRange` of it and pressing R opens it and moves what is inside into the
//                 ship's hold — as much as fits, and the rest waits for the next press. `loot` is a
//                 table id from data/loot.js and its roll belongs to the instance, so one seed is one
//                 reward. Omit `cache` for an instance with no prize.
//   enter         { pos } the arrival point inside. The way out is its own object at `exit.pos`, so a
//                 pilot arrives looking at the run rather than sitting inside the door home.
//   sky           { kind, col, glow, cracks, shards } the sky of somewhere else, drawn by
//                 `render/scene.js` from its `SKIES` registry. An instance has no starfield and no
//                 planet: nothing here is copied from the space outside.
//   features      ordinary place features (asteroidField, ...), read by the same generic loader a
//                 pocket uses (sim/places.js). Never a `spawner` — an instance's hostiles are its
//                 declared wave, so its content is exactly what this file says — and never a `planet`.
//
// `npm test` (tests/step14-instances.test.mjs) fails if a template is missing a field or names an
// enemy, loot table, objective, exit rule or outcome that does not exist.

/** How a pilot opens, uses and gets out of a rift. Distances are metres. */
export const RIFT = {
  enterRange: 200,     // fly this close to a rift in space and press R to go in
  exitRange: 220,      // inside, fly this close to the way out (its own portal) and press R to leave
  cacheRange: 60,      // inside, fly this close to the canister and press R to open it
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

/**
 * What an instance's sky can be. The builders live in `render/scene.js` (`SKIES`), which is the only
 * file that knows how one is drawn: a template names a kind and its colours, so a new look for a new
 * kind of instance is a data line plus one builder.
 *
 *   shattered   a collapsing shell of dark panels with glowing fractures and drifting shards — no
 *               starfield, no planet: somewhere that is not the space outside.
 */
export const SKY_KINDS = ["shattered"];

export const INSTANCE_TEMPLATES = {
  // The Basic rift's usual run: four hardened guardians hold a small, rich pocket shut.
  guardian_rift: {
    n: "Guardian rift",
    d: "A collapsed pocket, held shut by pirate guardians.",
    tier: 4,
    lifetimeSec: 1200,           // 20 minutes of unpaused play
    difficulty: { hp: 1.6, dmg: 1.5 },
    guardians: { enemy: "raider", count: 4, spawnDist: [800, 1100] },
    objective: {
      kind: "destroy-guardians",
      n: "Destroy the rift guardians",
      // Said once, when the last one breaks up: the moment the canister and the way out both open.
      done: "The last rift guardian breaks up.",
    },
    exit: {
      n: "Rift gate",
      pos: [0, 10, 500],           // the way out hangs behind the arrival point, in plain sight
      r: 26,
      requires: [
        { type: "objective-done", message: "The way out is sealed until the rift guardians are destroyed." },
      ],
    },
    onExpire: { kind: "kill", message: "The rift collapsed with your ship inside it." },
    cache: { n: "Rift cache", loot: "rift_cache", pos: [0, -30, -520], r: 10 },
    enter: { pos: [0, 0, 320] },
    sky: { kind: "shattered", col: 0x1a0c06, glow: 0xff7a2a, cracks: 0xffb267, shards: 26 },
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
    objective: {
      kind: "destroy-guardians",
      n: "Destroy the rift guardians",
      done: "The last of the deep rift's guardians breaks up.",
    },
    exit: {
      n: "Rift gate",
      pos: [0, -20, 560],
      r: 30,
      requires: [
        { type: "objective-done", message: "The way out is sealed until the rift guardians are destroyed." },
      ],
    },
    onExpire: { kind: "kill", message: "The deep rift collapsed with your ship inside it." },
    cache: { n: "Deep rift cache", loot: "rift_cache_deep", pos: [0, -40, -640], r: 12 },
    enter: { pos: [0, 0, 360] },
    sky: { kind: "shattered", col: 0x14060a, glow: 0xff5a1e, cracks: 0xff9a5a, shards: 34 },
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
