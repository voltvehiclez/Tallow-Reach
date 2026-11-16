// Rifts and instances (refactor step 14).
//
// An **instance** is a temporary, generated, harder place reached through a wormhole. A rift is not on
// the starmap and it is not a pocket of any system: it is a place record registered at runtime (see
// `registerInstancePlace` in data/places.js) whose features come from a template below. A wormhole
// the pilot spawns is called a **rift**; a **simple wormhole** (slice 14c) is a pocket that spawns
// itself inside an existing system — on that system's pocket map, warpable like its siblings, a grey
// sphere called "Simple Wormhole" hanging at its centre — and the pocket, not the instance, carries
// the clock: its 20 minutes run from the moment the pocket spawns, not from entry.
//
// Everything the owner decided on 2026-11-14 lives here as numbers and ids, never as code
// (docs/VISION.md, "Step 14: rifts, instances and how you may leave one"), and the spawn tuning for
// simple wormholes is data too (the owner, 2026-11-14: "There can be 75 simple wormholes in the
// universe at all times, these are spread out over all the systems. Try to avoid having more than 3
// wormholes per system. When a wormhole fades away after 20 minutes of being alive, a new one pops
// up somewhere in the universe." — and no notice when one spawns):
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
//                 Left out, a run gets `RIFT.defaultLifetimeSec` (20 minutes) instead.
//                 Simulation seconds only advance on unpaused ticks, so pausing never burns a
//                 clock. A rift's 20 minutes run from entry and are declared here. A simple
//                 wormhole's 20 minutes run from the moment its pocket spawns in normal space, so
//                 they live on that pocket's spawn record (slice 14c) and its instance says 0.
//   difficulty    { hp, dmg } multipliers applied to every hostile spawned inside
//   guardians     { enemy, count, spawnDist } the wave that opens on entry. `enemy` is an id from
//                 data/enemies.js; `spawnDist` is [min, max] metres from the arrival point, so
//                 nothing ever appears in the pilot's face. A template with a mixed wave declares
//                 `{ groups: [ { enemy, count, spawnDist }, ... ] }` instead — one entry per kind,
//                 each spawning independently (a smuggler site's escort and its freighter are two
//                 groups). `guardians: null` (or absent) means no wave at all: a peaceful site.
//   objective     { kind, n } what must be done. `kind` is one of OBJECTIVE_KINDS; `n` is the
//                 player-facing sentence the HUD shows. `mine-ore` adds `ore` (an item id from
//                 data/items.js) and `need` (how many).
//   reentrant     OPTIONAL true: the run may be left and re-entered at any time — the pilot is
//                 put back where they came from and the run keeps its live state (guardians,
//                 rocks, prize). Natural (simple) wormhole sites are re-enterable; a rift is not.
//   exit          { n, pos, r, requires: [{ type, message }] } — the way out is an object of its own
//                 in the world, lockable with F and labelled on the HUD: `pos` is where it hangs and
//                 `r` how big it is drawn. `n` names it as the pilot sees it (a natural wormhole's is
//                 a "Stable wormhole": lore says it never fades). `type` is one of
//                 EXIT_REQUIREMENT_TYPES and `message` is what the pilot is told while it refuses.
//                 Empty `requires` means it is never locked.
//   onExpire      { kind, message } — `kind` is one of EXPIRY_OUTCOME_TYPES.
//   cache         { n, loot, pos, r } the prize: a canister, locked but plainly visible from the
//                 moment the pilot arrives. Once the objective is done, flying within
//                 `RIFT.cacheRange` of it and pressing R opens a trade: the ship's hold and the
//                 canister side by side, and clicking moves cargo between them (shift-click moves
//                 the whole stack), in either direction, until the canister is empty and gone.
//                 `loot` is a table id from data/loot.js and its roll belongs to the instance, so
//                 one seed is one reward. Omit `cache` for an instance with no prize.
//   enter         { pos } the arrival point inside. The way out is its own object at `exit.pos`, so a
//                 pilot arrives looking at the run rather than sitting inside the door home.
//   sky           { kind, ... } the sky of somewhere else, drawn by `render/scene.js` from its
//                 `SKIES` registry: `kind` names the builder, everything else is that builder's data.
//                 `cube` is a generated cube-map skybox (owner 2026-11-15): six 90-degree faces,
//                 2048 px each, drawn on the inside of a box with `shards` broken rocks drifting in
//                 front of them. It carries `skybox` (an id in `data/skyboxes.js`, made with
//                 `tools/skybox/skybox.py`; recipe 24) and `shards`. A cube replaces the owner's
//                 equirect panoramas of 2026-11-14 because a cube has no poles and the same texel
//                 density everywhere, so nothing is stretched on a 4K screen. An instance has no planet: nothing here is
//                 copied from the space outside, and a collapsed pocket has no suns of its own to
//                 show (owner 2026-11-14).
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
  cacheRange: 60,      // inside, fly this close to the canister and press R to trade with it
  // The clock every run gets unless its template says otherwise (owner 2026-11-14: "rifts default
  // time is 20 minutes unless specified"). A template's own `lifetimeSec` still wins.
  defaultLifetimeSec: 1200,
  warnSec: 60,         // the HUD warns this long before an instance collapses

  // "At least 1 km from a big structure like asteroids or stations" (owner). Measured to the thing
  // itself: a station's position, an asteroid field's edge (its centre plus its radius), a planet's
  // surface, and — with a much smaller margin — any single rock, so a rift never opens inside one.
  clearance: { station: 1000, field: 1000, planet: 1000, rock: 150 },
};

/** What an objective can ask for. The handlers live in `sim/instances.js`. */
export const OBJECTIVE_KINDS = ["destroy-guardians", "mine-ore"];

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
 *   cube        a generated cube-map skybox (`sky.skybox` = an id in `data/skyboxes.js`, made with
 *               `tools/skybox/skybox.py`; recipe 24): six 90-degree faces on the inside of a box,
 *               with `shards` broken rocks drifting in front of them. Every sky in the game is one of
 *               these since 2026-11-15 — normal space included (`DEFAULT_SKY`, `data/places.js`).
 *
 * Every sky may carry `starfield: true` to ask for the drawn starfield on top of its picture. It is
 * off everywhere because the generated skies have their own stars in them (owner 2026-11-15),
 * and `render/scene.js` keeps the starfield switched off globally until the owner asks for it back.
 * An ordinary pocket's sky is `DEFAULT_SKY` (`data/places.js`), not a template's.
 */
export const SKY_KINDS = ["cube"];

export const INSTANCE_TEMPLATES = {
  // The Basic rift's usual run: four hardened guardians hold a small, rich pocket shut.
  guardian_rift: {
    n: "Guardian rift",
    d: "A collapsed pocket, held shut by its own guardians.",
    tier: 4,
    // No `lifetimeSec`: an ordinary run gets the default clock — 20 minutes of unpaused play.
    // The guardians are authored for a rift (`data/enemies.js`), so a run does not inflate them:
    // these multipliers are what a run would apply to a hostile it borrowed from the map.
    difficulty: { hp: 1, dmg: 1 },
    guardians: { enemy: "riftguardian", count: 4, spawnDist: [800, 1100] },
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
    // The rift's sky (owner 2026-11-15): a generated skybox — black space torn open by chaotic teal
    // gas — with shattered rock drifting in front of it. Made with tools/skybox/skybox.py.
    sky: { kind: "cube", skybox: "rift_chaos", shards: 30, starfield: false },
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
    // No `lifetimeSec`: a deep run gets the default clock, the same 20 minutes as any other rift
    // (owner 2026-11-14). What makes it deeper is the wave, the debris and the prize, not the time.
    difficulty: { hp: 1, dmg: 1 },
    guardians: { enemy: "deepguardian", count: 6, spawnDist: [900, 1300] },
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
    // A deeper collapse: the same generated rift sky, darker than the ordinary rift's, with more
    // rock and fewer stars in the picture. The owner asked for one rift look (2026-11-15); the deep
    // rift keeps its extra shards and its deeper damage, not a separate sky.
    sky: { kind: "cube", skybox: "rift_chaos", shards: 40, starfield: false },
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

  // -------------------------------------------------------------------------
  // Simple wormhole sites (slice 14c). A simple wormhole is a pocket that spawns itself in normal
  // space — warpable like any pocket, carrying its own 20 minutes from the moment it spawns — so
  // the *instance* on its far side has no clock of its own (`lifetimeSec: 0`) and its way out is a
  // **Stable wormhole** with no clock and no lock: every one of these can be left at any time,
  // which is what makes them "less hardcore rifts" (owner, 2026-11-14). They may be re-entered
  // until the pocket's timer ends, so what they pay is gone for good once taken. The owner will add
  // many more sites; these are the first three.
  //
  // Shared shape: `reentrant: true`, `lifetimeSec: 0`, `exit.requires: []`, `onExpire` declared as
  // `collapse` (only a rift kills; these collapse only at the *pocket* level, when their 20 minutes
  // are spent — the door in normal space fades, the pocket stays on the map until the pilot warps
  // off and then despawns, and anything still inside can always get out through the Stable
  // wormhole).

  // A pirate smuggling operation: escorts and a freighter hauling illegal goods. Destroy them all.
  // The freighter's wreck spills its cargo — that is the whole prize. No canister (owner,
  // 2026-11-14).
  wh_smugglers: {
    n: "Smuggling operation",
    d: "A smuggler's freighter and its escort, working a stolen lane through somewhere else.",
    tier: 3,
    lifetimeSec: 0,
    reentrant: true,
    difficulty: { hp: 1, dmg: 1 },
    // Two groups: the escort flies cover while the freighter runs its route. Both count toward the
    // same objective: a destroyed wave is a destroyed wave.
    guardians: {
      groups: [
        { enemy: "smuggler", count: 4, spawnDist: [700, 1100] },
        { enemy: "freighter", count: 1, spawnDist: [300, 500] },
      ],
    },
    objective: {
      kind: "destroy-guardians",
      n: "Destroy the smugglers and the freighter",
      done: "The freighter breaks apart with its cargo aboard.",
    },
    exit: {
      n: "Stable wormhole",
      pos: [0, 12, 480],
      r: 34,
      requires: [],
    },
    onExpire: { kind: "collapse", message: "The Simple Wormhole collapses." },
    enter: { pos: [0, 0, 320] },
    sky: { kind: "cube", skybox: "wormhole_grey", shards: 0, starfield: false },  // a dark grey somewhere else
    features: [
      {
        kind: "asteroidField",
        id: "debris",
        n: "Smuggler debris",
        pos: [850, 90, -620],
        radius: 330,
        height: 150,
        count: 18,
        ore: "asteroid",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 14, rMax: 55, orePerR: 1.5 },
        salvage: { spread: [600, 150, 600] },
      },
    ],
  },

  // A mining belt of rare Lumenite. Nothing here shoots at you; the prize is the ore itself, so it
  // is yours the moment it is in your hold — flying in and out is the whole game. No canister.
  wh_mining: {
    n: "Lumenite belt",
    d: "A drifting belt rich in lumenite, pulled somewhere else entirely.",
    tier: 2,
    lifetimeSec: 0,
    reentrant: true,
    difficulty: { hp: 1, dmg: 1 },
    guardians: null,               // a peaceful site: the belt never fought back
    objective: {
      kind: "mine-ore",
      ore: "lumenite",
      need: 4,
      n: "Mine 4 lumenite",
      done: "The belt has given up its lumenite.",
    },
    exit: {
      n: "Stable wormhole",
      pos: [0, -12, 470],
      r: 34,
      requires: [],
    },
    onExpire: { kind: "collapse", message: "The Simple Wormhole collapses." },
    enter: { pos: [0, 0, 330] },
    sky: { kind: "cube", skybox: "wormhole_grey", shards: 0, starfield: false },  // a dark grey somewhere else
    features: [
      {
        kind: "asteroidField",
        id: "veins",
        n: "Lumenite veins",
        pos: [650, 70, -550],
        radius: 420,
        height: 180,
        count: 26,
        ore: "wh_rock",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 18, rMax: 62, orePerR: 1.7 },
        salvage: { spread: [600, 150, 600] },
      },
      {
        kind: "asteroidField",
        id: "veins2",
        n: "Outer veins",
        pos: [-700, -60, 350],
        radius: 260,
        height: 140,
        count: 12,
        ore: "wh_rock",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 14, rMax: 48, orePerR: 1.5 },
        salvage: { spread: [500, 140, 500] },
      },
    ],
  },

  // A hive of guardians that pay well for their ruin. No canister (owner, 2026-11-14): the wrecks
  // themselves are the reward.
  wh_hive: {
    n: "Guardian hive",
    d: "Something made a nest of the pocket. It pays to break it.",
    tier: 4,
    lifetimeSec: 0,
    reentrant: true,
    difficulty: { hp: 1, dmg: 1 },
    guardians: { enemy: "hiveguardian", count: 6, spawnDist: [700, 1200] },
    objective: {
      kind: "destroy-guardians",
      n: "Destroy the hive guardians",
      done: "The last hive guardian breaks up.",
    },
    exit: {
      n: "Stable wormhole",
      pos: [0, 10, 460],
      r: 34,
      requires: [],
    },
    onExpire: { kind: "collapse", message: "The Simple Wormhole collapses." },
    enter: { pos: [0, 0, 330] },
    sky: { kind: "cube", skybox: "wormhole_grey", shards: 0, starfield: false },  // a dark grey somewhere else
    features: [
      {
        kind: "asteroidField",
        id: "shards",
        n: "Hive shards",
        pos: [-800, 70, -520],
        radius: 360,
        height: 160,
        count: 22,
        ore: "rift_rock",
        respawnSec: 420,
        stable: true,
        rock: { rMin: 16, rMax: 66, orePerR: 1.6 },
        salvage: { spread: [550, 150, 550] },
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

/* ------------------------------------------------------------------------- */
/* Simple wormholes (slice 14c): a pocket that spawns itself in normal space    */
/* ------------------------------------------------------------------------- */

/**
 * How many simple wormholes hang in the universe, spread over all the systems, and how long each
 * one lives (the owner, 2026-11-14). The population is a standing rule: when one fades away after
 * `lifetimeSec`, a new one pops up somewhere in the universe. A fresh universe (or the first load of
 * a save from before wormholes) fills itself with `population` wormholes whose remaining lives are
 * rolled from 0 to `lifetimeSec` at random, so collapses never march in sync; a wormhole that
 * respawns after an expiry always gets the full `lifetimeSec` Again. Tunable.
 */
export const WORMHOLE_SPAWN = {
  population: 75,
  maxPerSystem: 3,
  lifetimeSec: 1200,          // 20 minutes of simulation time from the moment a wormhole spawns
};

/**
 * Which sites a simple wormhole can open into, weighted. A pool of one-entry rows keeps the odds
 * readable, and a new site is one entry here — the owner will add many more (the first three are a
 * pirate smuggling operation, a lumenite belt and a guardian hive). Which template a wormhole
 * offers is a weighted roll, and it lives in `rollWormholeTemplate` in sim/instances.js.
 */
export const WORMHOLE_SITE_POOL = [
  { id: "wh_smugglers", w: 1 },
  { id: "wh_mining", w: 1 },
  { id: "wh_hive", w: 1 },
];

/**
 * The pocket a simple wormhole hangs in (owner, 2026-11-14): ordinary space in the system it
 * spawned in, some interesting
 * and in the centre a grey dark sphere called "Simple Wormhole" — a
 * F-lockable anomaly with a greyish radiance around it, similar to EVE Online's wormholes. The
 * pocket is a pocket of the system it spawned in: it appears on that system's pocket map, is
 * warpable like its siblings, carries the 20-minute clock itself (the instance inside has none) —
 * and it hangs the same starfield every sibling pocket hangs, always (owner, 2026-11-14: it is
 * the same solar system). Only the far side is somewhere else.
 */
export const WORMHOLE_POCKET = {
  n: "Simple Wormhole",
  d: "A wormhole hangs in open space.",
  enter: { pos: [0, 0, 420] },   // arrive off the sphere's shoulder; the sphere is a few fly-bys away
  // No `sky` on purpose: the pocket is the parent system's own space (owner, 2026-11-14) and
  // shows the ordinary starfield, like every other pocket.
  features: [
    {
      kind: "asteroidField", id: "formation", n: "Drifting formation",
      pos: [750, 130, -700], radius: 400, height: 170, count: 16,
      ore: "asteroid", respawnSec: 420, stable: true,
      rock: { rMin: 22, rMax: 95, orePerR: 1.6 }, salvage: { spread: [750, 160, 750] },
    },
    {
      kind: "asteroidField", id: "formation2", n: "Outer formation",
      pos: [-820, -90, 480], radius: 260, height: 130, count: 10,
      ore: "asteroid", respawnSec: 420, stable: true,
      rock: { rMin: 12, rMax: 40, orePerR: 1.4 }, salvage: { spread: [650, 140, 650] },
    },
  ],
};

/** The pocket id for a wormhole's seed: `wh-` plus the seed in base 36. Hand-authored ids never
 *  use this prefix, so a save can never name a pocket the game cannot rebuild. */
export const wormholeIdFor = seed => `wh-${(seed >>> 0).toString(36)}`;

/**
 * Normalise a template's `guardians` into the flat list of spawn groups it means — one group per
 * kind of hostile. Accepts the simple shape `{ enemy, count, spawnDist }`, the mixed shape
 * `{ groups: [...] }` and `null`/absent (no wave). Both `sim/instances.js` (to spawn) and the
 * completeness test in `tests/step14-instances.test.mjs` (to check) go through this, so the two
 * can never disagree about what a template declares.
 */
export function waveGroups(guardians) {
  const norm = g => {
    const enemy = typeof g?.enemy === "string" ? g.enemy : null;
    const count = Math.max(0, Math.floor(Number(g?.count) || 0));
    const [lo, hi] = Array.isArray(g?.spawnDist) && g.spawnDist.length === 2 ? g.spawnDist : [600, 900];
    const a = Number(lo), b = Number(hi);
    const min = Number.isFinite(a) && a > 0 ? a : 600;
    const max = Number.isFinite(b) && b >= min ? b : min;
    return enemy && count > 0 ? { enemy, count, spawnDist: [min, max] } : null;
  };
  if (!guardians || typeof guardians !== "object") return [];
  if (Array.isArray(guardians.groups)) return guardians.groups.map(norm).filter(Boolean);
  const one = norm(guardians);
  return one ? [one] : [];
}
