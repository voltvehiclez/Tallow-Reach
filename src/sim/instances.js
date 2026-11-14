// Rifts and instances (refactor step 14): the runtime behind `data/instances.js`.
//
// An **instance** is a temporary place. It is generated from a template and a seed, registered at
// runtime as a place record (`registerInstancePlace`) so the ordinary `placeAt`/`placeDef`/
// `loadPlace` path fills it with rocks and scenery, and thrown away when the run ends. A **rift** is
// the wormhole object a pilot spawns in a pocket to reach one; the natural kind — a simple wormhole
// whose pocket spawns itself inside an existing system — arrives in slice 14c and reuses everything
// here unchanged.
//
// Every rule is data in `data/instances.js` (owner decisions 2026-11-14, `docs/VISION.md`):
//
//   * a rift opens where the ship is, and only in clear space (`RIFT.clearance`);
//   * going in and coming out are a deliberate close-range key press (**R**), never contact;
//   * whether an instance may be left is its `exit.requires`, resolved through `EXIT_REQUIREMENTS`
//     exactly the way `sim/travel.js` resolves a warp: a handler returns `true`, or the sentence the
//     pilot is shown;
//   * an instance has a lifetime, and running out does what `onExpire.kind` says through
//     `EXPIRY_OUTCOMES` — `kill` (a rift collapses with the ship inside it) or `collapse` (only the
//     way in goes; a simple wormhole's Stable wormhole way out keeps working);
//   * the reward is a physical **locked cache** that spills ordinary crates when the objective is
//     done, so nothing ever enters a hold by itself (LESSONS L6).
//
// Adding an objective, an exit criterion or an expiry outcome is one entry in a registry below plus
// a line of data — never a change to how a place, a pilot or a save works.
//
// Nothing here imports `core/`, `render/` or `ui/` (`tests/layers.test.mjs`), and this file owns no
// meshes: the rift door and the cache are records that `render/views.js` draws.

import { V, Q, UP } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { random, makeRng } from "../util/rng.js";
import { state, placeWorld, localPlayer, profileOf, instanceAt, msg, say } from "../state/state.js";
import { RIFT, riftDef, isInstanceTemplate, instanceTemplate, instanceIdFor } from "../data/instances.js";
import { registerInstancePlace, unregisterInstancePlace, isInstancePlace, featuresOf, placeAt } from "../data/places.js";
import { ENEMIES } from "../data/enemies.js";
import { lootTable } from "../data/loot.js";
import { addEntity, dropEntity, clearEntities } from "./entity.js";
import { spawnEnemy } from "./ai.js";
import { rollLoot } from "./loot.js";
import { spawnCrate } from "./combat.js";
import { clearWorldObjects } from "./world.js";
import { enterPlace } from "./places.js";
import { playerPos } from "./pilot.js";
import { hurt } from "./player.js";

/** A fresh orientation for a spin, reused so the tick allocates nothing. */
const _spin = Q();

/**
 * One deterministic stream per purpose from one instance seed. Guardians and the cache never share
 * rolls, so changing how many guardians a template spawns cannot reshuffle its loot — and the same
 * seed always gives the same instance, which `tests/step14-instances.test.mjs` pins.
 */
const PURPOSE_GUARDIANS = 1;
const PURPOSE_CACHE = 2;
const streamRng = (seed, purpose) => makeRng(((seed >>> 0) ^ Math.imul(purpose, 0x9e3779b1)) >>> 0);

/* ------------------------------------------------------------------------- */
/* Which template a rift opens                                                */
/* ------------------------------------------------------------------------- */

/**
 * Roll the template a rift kind opens: one weighted pick from `RIFTS[riftId].templates`. A weight
 * missing means 1; a weight of zero or less means never. Null when the kind does not exist or has
 * nothing it may open, so a bad line of data refuses rather than opening some other rift.
 */
export function rollRiftTemplate(riftId, rng = random) {
  const def = riftDef(riftId);
  if (!def) return null;
  const pool = [];
  let total = 0;
  for (const entry of def.templates || []) {
    if (!entry || !isInstanceTemplate(entry.id)) continue;
    const w = entry.w == null ? 1 : Number(entry.w);
    if (!(w > 0)) continue;
    pool.push({ id: entry.id, w });
    total += w;
  }
  if (!pool.length || !(total > 0)) return null;
  let roll = Number(rng()) * total;
  if (!(roll >= 0)) roll = 0;
  for (const entry of pool) {
    roll -= entry.w;
    if (roll < 0) return entry.id;
  }
  return pool[pool.length - 1].id;
}

/* ------------------------------------------------------------------------- */
/* Objectives, exit rules and expiry outcomes: the three registries           */
/* ------------------------------------------------------------------------- */

/**
 * What an instance can ask for. A handler takes the instance record and returns true when the
 * objective is complete. Progress is read from the world rather than counted off events, so it
 * survives a reload (slice 14b) and a missed event can never strand a run.
 */
export const OBJECTIVES = {
  // Every hostile this instance declared is gone.
  "destroy-guardians": record => !!record.spawned && !placeWorld(record.id).enemies.length,
};

/** Is this instance's objective complete? An unknown kind is never complete (it fails shut). */
export function objectiveDone(record) {
  const handler = record ? OBJECTIVES[record.objective?.kind] : null;
  return handler ? handler(record) === true : false;
}

/**
 * What may hold the way out shut — the instance-side twin of `TRAVEL_REQUIREMENTS` in
 * `sim/travel.js`. A handler returns `true` when the exit may be used, or the sentence the pilot is
 * shown when it may not. `requirement` is one entry of a template's `exit.requires`.
 */
export const EXIT_REQUIREMENTS = {
  "objective-done": (record, requirement) =>
    objectiveDone(record) ||
    requirement.message ||
    "The way out is sealed until the objective is complete.",
};

/**
 * Why this instance may not be left right now, or null when it may. An unknown requirement type
 * refuses with a plain sentence: a data typo must never trap a pilot silently, and it must never
 * let them walk out of a sealed run either.
 */
export function exitDenial(record) {
  if (!record) return "There is no way out here.";
  for (const requirement of record.exit?.requires || []) {
    const handler = EXIT_REQUIREMENTS[requirement?.type];
    if (!handler) return `The way out cannot be checked ("${requirement?.type}").`;
    const allowed = handler(record, requirement);
    if (allowed !== true) return typeof allowed === "string" && allowed ? allowed : "The way out is sealed.";
  }
  return null;
}

/**
 * What running out of time does. One handler per `EXPIRY_OUTCOME_TYPES` entry, so a future kind of
 * wormhole declares its outcome in data instead of asking for code.
 */
export const EXPIRY_OUTCOMES = {
  /**
   * A rift collapses with the ship inside it. The ordinary death rules apply — the ship and its
   * whole hold are gone, the recovery fee is charged, a loaned Wasp follows if nothing is left —
   * and `sim/session.js` hears `dying` first, so the instance is already gone and the pilot already
   * back where they entered by the time the death is resolved.
   */
  kill(record) {
    state.deathNotice = record.onExpire?.message || null;
    const P = pilotInside(record);
    destroyInstance(record, "expiry");
    if (P && !P.dead && !P.docked) hurt(Infinity, P, profileOf(P));
  },

  /**
   * Only the way in goes: the door fades, the instance stays open and its exit keeps working, so
   * nobody is ever forced out or killed by the clock. Leaving afterwards returns the pilot to a
   * pocket with nothing there to fly through again. A simple wormhole's outer pocket is also doomed
   * — it leaves the map when the pilot warps off (slice 14c reads `doomOrigin`).
   */
  collapse(record) {
    record.collapsed = true;
    record.doomOrigin = true;
    closeDoor(record);
    if (record.onExpire?.message) msg(record.onExpire.message, 8);
  },
};

/* ------------------------------------------------------------------------- */
/* Creating and destroying an instance                                        */
/* ------------------------------------------------------------------------- */

/**
 * Make the instance for `(templateId, seed)` and register it as a runtime place. The same seed gives
 * the same instance: the id is derived from both, its rocks are deterministic from it, and so is its
 * cache. `opts.origin` is the pocket it was entered from and `opts.entry` the spot to be put back
 * at; both are filled in by `enterRift`.
 *
 * Returns the record, or null for a template that does not exist (a refusal, never a fallback).
 */
export function createInstance(templateId, seed, opts = {}) {
  const template = instanceTemplate(templateId);
  if (!template) return null;
  const s = (Number(seed) >>> 0) || 0;
  const id = instanceIdFor(templateId, s);
  const existing = instanceAt(id);
  if (existing) return existing;

  const lifetime = Math.max(0, Number(template.lifetimeSec) || 0);
  const difficulty = {
    hp: Number(template.difficulty?.hp) > 0 ? Number(template.difficulty.hp) : 1,
    dmg: Number(template.difficulty?.dmg) > 0 ? Number(template.difficulty.dmg) : 1,
  };
  const origin = typeof opts.origin === "string" && opts.origin ? opts.origin : null;
  const record = {
    id,
    template: templateId,
    n: template.n,
    seed: s,
    // Advisory, like a pocket's: content may read it, nothing scales off it by itself.
    tier: Number(opts.tier) > 0 ? Number(opts.tier) : Math.max(1, Number(template.tier) || 1),
    origin,
    entry: null,
    difficulty,
    lifetime,
    totalLifetime: lifetime,
    warned: false,
    expired: false,
    collapsed: false,
    doomOrigin: false,
    spawned: false,
    gone: false,
    objective: {
      kind: template.objective?.kind || null,
      n: template.objective?.n || "",
      done: template.objective?.done || "",
      met: false,
    },
    exit: {
      n: template.exit?.n || "Way out",
      requires: Array.isArray(template.exit?.requires) ? template.exit.requires.map(r => ({ ...r })) : [],
    },
    onExpire: {
      kind: template.onExpire?.kind || null,
      message: template.onExpire?.message || "",
    },
    cache: template.cache
      ? {
          n: template.cache.n || "Cache",
          loot: template.cache.loot || null,
          pos: V(...(template.cache.pos || [0, 0, 0])),
          open: false,
          entity: null,
        }
      : null,
    enterPos: V(...(template.enter?.pos || [0, 0, 0])),
  };

  state.instances.set(id, record);
  // A place record like any other, so `placeAt(id).n` works for the HUD and `placeDef(id).features`
  // feeds the ordinary loader — but it is kept out of `pocketsIn`, so no map can ever list it.
  registerInstancePlace({
    id,
    kind: "instance",
    n: record.n,
    d: template.d || "",
    tier: record.tier,
    instance: templateId,
    features: template.features || [],
    // The system the entry pocket belongs to, so a chart opened inside one still reads sensibly.
    parent: origin ? placeAt(origin).parent || null : null,
    enter: { pos: [...record.enterPos.toArray()] },
  });
  return record;
}

/** The pilot inside this instance, or null. */
export function pilotInside(record, players = state.players) {
  if (!record) return null;
  return players.find(p => p && !p.dead && (p.place || state.place) === record.id) || null;
}

/** Take the door out of the pocket it hangs in (the way in is gone). */
function closeDoor(record) {
  if (!record?.origin) return false;
  const rifts = placeWorld(record.origin).rifts;
  let closed = false;
  for (const rift of [...rifts]) {
    if (rift.instance !== record.id) continue;
    dropEntity(rifts, rift);
    closed = true;
  }
  return closed;
}

/**
 * End an instance for good: empty it, put every pilot inside it back at the spot they entered from,
 * take its door out of the pocket, and unregister the place. Safe to call twice and safe to call for
 * an instance nobody is inside.
 *
 * `reason` travels on the `instance-closed` event: `"left"`, `"expiry"`, `"death"`, `"reset"`.
 */
export function destroyInstance(record, reason = "left") {
  if (!record || record.gone) return false;
  record.gone = true;

  const W = placeWorld(record.id);
  clearWorldObjects(record.id);
  clearEntities(W.caches);
  clearEntities(W.rifts);

  // Out first, then the place goes: `dock()` and every lookup resolve a pocket, never a dead id.
  for (const P of state.players) {
    if (!P || (P.place || state.place) !== record.id) continue;
    const entry = record.entry;
    P.place = record.origin || P.place;
    if (entry) {
      P.pos.copy(entry.pos);
      P.quat.copy(entry.quat);
      P.sh = entry.sh;
      P.en = entry.en;
    }
    P.v.set(0, 0, 0);
    P.thr = 0;
    P.snap = true;
    if (P === state.player) state.place = P.place;
  }

  closeDoor(record);
  state.instances.delete(record.id);
  unregisterInstancePlace(record.id);
  state.places.delete(record.id);
  emit("instance-closed", { id: record.id, origin: record.origin, reason });
  return true;
}

/* ------------------------------------------------------------------------- */
/* The door: spawning a rift in a pocket                                      */
/* ------------------------------------------------------------------------- */

/** The nearest rift door a pilot could enter, or null. Distance is `RIFT.enterRange`. */
export function nearestRift(player = localPlayer(), placeId = null) {
  const P = player || localPlayer();
  if (!P || P.docked || P.dead) return null;
  const id = placeId || P.place || state.place;
  if (isInstancePlace(id)) return null;
  const at = playerPos(P);
  let best = null;
  let bestDist = Infinity;
  for (const rift of placeWorld(id).rifts || []) {
    if (!rift || rift.gone) continue;
    const d = rift.pos.distanceToSquared(at);
    if (d < bestDist) {
      bestDist = d;
      best = rift;
    }
  }
  const range = Number(RIFT.enterRange) || 0;
  return best && bestDist <= range * range ? best : null;
}

/**
 * May a rift open here? Returns `true`, or the sentence the pilot is shown. Everything it measures
 * is `RIFT.clearance` in `data/instances.js`: a station's position, an asteroid field's edge (its
 * centre plus its radius), a planet's surface, and — with a much smaller margin — any single rock,
 * so a rift never opens inside one. Structures count as wholes, never as their parts.
 */
export function riftClearance(player = localPlayer(), placeId = null) {
  const P = player || localPlayer();
  if (!P) return "There is nobody to open a rift for.";
  if (P.docked) return "Undock before opening a rift.";
  if (P.dead) return "You are dead.";
  const id = placeId || P.place || state.place;
  if (isInstancePlace(id)) return "There is no room for a rift inside a rift.";
  const clear = RIFT.clearance || {};
  const at = playerPos(P);

  for (const station of featuresOf(id, "station")) {
    const need = Number(clear.station) || 0;
    const d = at.distanceTo(V(...station.pos));
    if (d < need) return `Too close to ${station.n || "the station"}: ${Math.round(need / 100) / 10} km of clear space is needed.`;
  }
  for (const field of featuresOf(id, "asteroidField")) {
    const need = Number(clear.field) || 0;
    const radius = Number(field.radius) || 0;
    const d = at.distanceTo(V(...field.pos)) - radius;
    if (d < need) return `Too close to ${field.n || "the asteroid field"}: ${Math.round(need / 100) / 10} km clear of its edge is needed.`;
  }
  for (const planet of featuresOf(id, "planet")) {
    const need = Number(clear.planet) || 0;
    const radius = Number(planet.radius) || 0;
    const d = at.distanceTo(V(...planet.pos)) - radius;
    if (d < need) return `Too close to the planet: ${Math.round(need / 100) / 10} km above its surface is needed.`;
  }
  const rockNeed = Number(clear.rock) || 0;
  for (const rock of placeWorld(id).asteroids || []) {
    if (!rock) continue;
    if (at.distanceTo(rock.pos) - (Number(rock.r) || 0) < rockNeed) {
      return `Too close to a rock: ${rockNeed} m of clear space is needed.`;
    }
  }
  return true;
}

/**
 * Open a rift where the pilot is: one door entity in this pocket, carrying the template and seed it
 * will generate. The item is consumed by `sim/consumables.js`, not here — this only builds the door,
 * so a mission or a story script can open one too.
 *
 * Returns the rift record, or a refusal string (never null: no silent failures).
 */
export function openRift(riftId, player = localPlayer(), seed = null) {
  const def = riftDef(riftId);
  if (!def) return `Nothing knows how to open "${riftId}".`;
  const P = player || localPlayer();
  const clear = riftClearance(P);
  if (clear !== true) return clear;
  const templateId = rollRiftTemplate(riftId);
  if (!templateId) return `${def.n || "That rift"} has no template to open.`;
  const template = instanceTemplate(templateId);
  const s = seed == null ? (Number(random()) * 0xffffffff) >>> 0 : (Number(seed) >>> 0) || 0;
  const id = instanceIdFor(templateId, s);
  const placeId = P.place || state.place;
  // One door per (template, seed): the same seed is the same instance, so a second door would be a
  // second way into a run that is already there.
  if (instanceAt(id) || (placeWorld(placeId).rifts || []).some(rift => rift && rift.instance === id)) {
    return "That rift is already open here.";
  }

  const rift = addEntity(placeWorld(placeId).rifts, {
    kind: "rift",
    place: placeId,
    rift: riftId,
    template: templateId,
    seed: s,
    instance: id,
    n: def.n || template.n,
    dest: template.n,
    pos: playerPos(P).clone(),
    quat: Q(),
    spin: 0.35,
    r: 26,
    gone: false,
  });
  emit("sfx", { name: "warp-burst" });
  emit("rift-opened", { id: rift.id, place: placeId, template: templateId, seed: s });
  return rift;
}

/* ------------------------------------------------------------------------- */
/* Going in and coming out                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Enter the instance a rift door leads to. The door stays in the pocket: it is the way back, and it
 * collapses when the run ends. The clock starts here, so a template's `lifetimeSec` is the time the
 * pilot actually has inside.
 *
 * Returns true, or a refusal string.
 */
export function enterRift(rift, player = localPlayer()) {
  const P = player || localPlayer();
  if (!rift || rift.gone) return "There is no rift there.";
  if (!P || P.docked || P.dead) return "You cannot enter a rift from here.";
  const placeId = P.place || state.place;
  if (rift.place !== placeId) return "That rift is somewhere else.";
  if (playerPos(P).distanceTo(rift.pos) > (Number(RIFT.enterRange) || 0)) {
    return `Fly closer to the ${rift.dest || rift.n || "rift"} (within ${Number(RIFT.enterRange) || 0} m) and press R again.`;
  }
  const record = createInstance(rift.template, rift.seed, { origin: placeId });
  if (!record) return "That rift leads nowhere.";

  // Where the pilot came from, so leaving — or dying, or an ejection — puts them back exactly there.
  record.entry = {
    pos: playerPos(P).clone(),
    quat: P.quat.clone(),
    sh: P.sh,
    en: P.en,
  };
  if (!enterPlace(record.id, P)) {
    destroyInstance(record, "refused");
    return "That rift leads nowhere.";
  }

  P.pos.copy(record.enterPos);
  P.quat.identity();
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.snap = true;
  P.warp = null;

  if (!record.spawned) {
    record.spawned = true;
    spawnGuardians(record);
    spawnCache(record);
  }
  msg(record.objective.n || "Objective", 8);
  emit("rift-entered", { id: record.id, template: record.template, origin: record.origin });
  return true;
}

/** The declared wave, at its declared distance from the arrival point — never in the pilot's face. */
function spawnGuardians(record) {
  const template = instanceTemplate(record.template);
  const wave = template?.guardians;
  if (!wave || !ENEMIES[wave.enemy]) return;
  const count = Math.max(0, Math.floor(Number(wave.count) || 0));
  if (!count) return;
  const [lo, hi] = Array.isArray(wave.spawnDist) && wave.spawnDist.length === 2 ? wave.spawnDist : [600, 900];
  const rng = streamRng(record.seed, PURPOSE_GUARDIANS);
  for (let i = 0; i < count; i++) {
    // Evenly spread around the arrival point, each at its own rolled distance and height, so a run
    // is the same every time and no guardian ever materialises on top of the pilot.
    const angle = (i / count) * Math.PI * 2 + rng() * 0.6;
    const dist = lo + rng() * Math.max(0, hi - lo);
    const at = V(
      record.enterPos.x + Math.cos(angle) * dist,
      record.enterPos.y + (rng() - 0.5) * dist * 0.3,
      record.enterPos.z + Math.sin(angle) * dist,
    );
    // `encounter` stays null: an instance's wave is not a pocket encounter, so it writes no place
    // memory and can never trip a mission's wave-clear trigger.
    spawnEnemy(wave.enemy, at, record.id, null, {});
  }
}

/** The locked cache: a physical container, visible from the start, collectable only once it opens. */
function spawnCache(record) {
  if (!record.cache || record.cache.entity) return;
  const cache = addEntity(placeWorld(record.id).caches, {
    kind: "cache",
    place: record.id,
    n: record.cache.n,
    loot: record.cache.loot,
    locked: true,
    pos: record.cache.pos.clone(),
    quat: Q(),
    spin: 0.35,
    r: 9,
  });
  record.cache.entity = cache;
}

/**
 * Leave the instance the pilot is inside. Refuses — with the template's own sentence — while an exit
 * requirement is unmet, so a sealed rift says why instead of doing nothing.
 *
 * Returns true, or a refusal string.
 */
export function leaveInstance(player = localPlayer()) {
  const P = player || localPlayer();
  if (!P) return "There is nobody to leave.";
  const record = instanceAt(P.place || state.place);
  if (!record) return "There is no way out here.";
  const at = playerPos(P);
  const range = Number(RIFT.exitRange) || 0;
  if (at.distanceTo(record.enterPos) > range) {
    return `Fly back to ${record.exit.n} (within ${range} m of where you came in) and press R.`;
  }
  const denial = exitDenial(record);
  if (denial) {
    msg(denial, 5);
    emit("travel-denied", { reason: denial, from: record.id, to: record.origin });
    return denial;
  }
  destroyInstance(record, "left");
  emit("rift-left", { id: record.id, origin: record.origin });
  return true;
}

/**
 * The **R** key: come out if you are inside, go in if a rift is within range. One binding, one
 * deliberate press — a ship can never drift in or out by contact.
 */
export function riftAction(player = localPlayer()) {
  const P = player || localPlayer();
  if (!P || P.dead) return false;
  if (isInstancePlace(P.place || state.place)) {
    const out = leaveInstance(P);
    if (out !== true) msg(out, 5);
    return out === true;
  }
  const rift = nearestRift(P);
  if (!rift) {
    say("Nothing to enter here.");
    return false;
  }
  const inResult = enterRift(rift, P);
  if (inResult !== true) msg(inResult, 5);
  return inResult === true;
}

/* ------------------------------------------------------------------------- */
/* The clock, the objective and the cache                                     */
/* ------------------------------------------------------------------------- */

/** How much of an instance's lifetime is left, in whole seconds (0 = no clock, or run out). */
export const instanceTimeLeft = record => (record ? Math.max(0, Math.ceil(record.lifetime)) : 0);

/** The HUD's warning line, or null while there is nothing to warn about. */
export function instanceWarning(record) {
  if (!record || record.gone || record.expired) return null;
  if (!(record.lifetime > 0)) return null;
  const warn = Number(RIFT.warnSec) || 0;
  if (!(warn > 0) || record.lifetime > warn) return null;
  const left = instanceTimeLeft(record);
  return `${record.n} collapses in ${left} second${left === 1 ? "" : "s"}.`;
}

/** Spill the cache as ordinary crates. They are collected one by one, so a full hold leaves them
 *  floating: the reward is never added to a hold by itself (LESSONS L6). */
function openCache(record) {
  const cache = record.cache;
  if (!cache || cache.open) return false;
  cache.open = true;
  const W = placeWorld(record.id);
  if (cache.loot && lootTable(cache.loot)) {
    const rng = streamRng(record.seed, PURPOSE_CACHE);
    for (const drop of rollLoot(cache.loot, rng)) {
      const count = Math.max(1, Math.floor(Number(drop.count) || 1));
      const scatter = Math.max(0, Number(drop.scatter) || 0);
      for (let i = 0; i < count; i++) {
        const at = V(
          cache.pos.x + (rng() * 2 - 1) * scatter,
          cache.pos.y + (rng() * 2 - 1) * scatter * 0.4,
          cache.pos.z + (rng() * 2 - 1) * scatter,
        );
        spawnCrate(at, drop.item, record.id, null, null, null, false);
      }
    }
  }
  if (cache.entity) dropEntity(W.caches, cache.entity);
  cache.entity = null;
  emit("instance-cache-open", { id: record.id, loot: cache.loot });
  return true;
}

function completeObjective(record) {
  if (record.objective.met) return;
  record.objective.met = true;
  const opened = openCache(record);
  const text = [record.objective.done || "Objective complete."];
  if (opened) text.push(`${record.cache.n} is open.`);
  if (!record.exit.requires.length || !exitDenial(record)) text.push("The way out is open.");
  msg(text.join(" "), 8);
  emit("instance-objective-done", { id: record.id, kind: record.objective.kind });
}

/** Run out of time: do what the template's `onExpire.kind` declares. */
export function expireInstance(record) {
  if (!record || record.gone || record.expired) return false;
  record.expired = true;
  record.lifetime = 0;
  // Announced before the outcome runs, so a listener still sees the instance registered.
  emit("instance-expired", { id: record.id, kind: record.onExpire?.kind || null, origin: record.origin });
  const outcome = EXPIRY_OUTCOMES[record.onExpire?.kind];
  if (outcome) outcome(record);
  // An outcome nobody wrote must never trap a pilot inside a dead place: put them out.
  else destroyInstance(record, "expiry");
  return true;
}

/** One tick of every live instance: the clock, the warning, the objective, the cache's spin. */
export function updateInstances(dt) {
  if (!(dt > 0) || !state.instances.size) return;
  for (const record of [...state.instances.values()]) {
    if (!record || record.gone) continue;
    if (record.lifetime > 0) {
      record.lifetime -= dt;
      if (!record.warned) {
        const warning = instanceWarning(record);
        if (warning) {
          record.warned = true;
          msg(warning, 8);
          emit("instance-warning", { id: record.id, left: instanceTimeLeft(record) });
        }
      }
      if (record.lifetime <= 0) {
        expireInstance(record);
        continue;
      }
    }
    if (!record.objective.met && objectiveDone(record)) completeObjective(record);
    const cache = record.cache;
    if (cache?.entity) cache.entity.quat.multiply(_spin.setFromAxisAngle(UP, cache.entity.spin * dt));
    // The way out offers itself the way a door does: a prompt only where R would work, in the
    // instance's own words, and the refusal instead when the exit is still sealed.
    const P = localPlayer();
    if (
      P && !P.dead && (P.place || state.place) === record.id &&
      playerPos(P).distanceTo(record.enterPos) <= (Number(RIFT.exitRange) || 0)
    ) {
      say(exitDenial(record) || `Press R to leave through ${record.exit.n}`);
    }
  }
}

/** One tick of the doors hanging in a pocket: the spin, and the "press R" prompt. */
export function updateRifts(dt, placeId = state.place) {
  const rifts = placeWorld(placeId).rifts;
  if (!rifts || !rifts.length) return;
  for (const rift of rifts) {
    if (rift) rift.quat.multiply(_spin.setFromAxisAngle(UP, rift.spin * dt));
  }
  const P = localPlayer();
  if (!P || P.docked || P.dead || (P.place || state.place) !== placeId) return;
  const rift = nearestRift(P, placeId);
  if (rift) say(`Press R to enter ${rift.dest || rift.n}`);
}

/* ------------------------------------------------------------------------- */
/* Death inside an instance                                                   */
/* ------------------------------------------------------------------------- */

// `sim/session.js` emits `dying` as the first thing `die()` does, before the ship and its hold are
// removed and before the pilot is docked. An instance despawns at once when the pilot dies inside it
// (owner rule), and this puts them back where they entered so the ordinary death rules — recovery
// fee, loaned Wasp, docking at that pocket's station — then apply unchanged.
on("dying", ({ player } = {}) => {
  const record = instanceAt(player ? player.place || state.place : state.place);
  if (record) destroyInstance(record, "death");
});
