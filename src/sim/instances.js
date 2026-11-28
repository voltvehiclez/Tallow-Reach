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
import {
  state,
  placeWorld,
  localPlayer,
  profileOf,
  worldOf,
  ownerOf,
  instanceAt,
  msg,
  say,
  sayForPlayer,
  clearInstances,
} from "../state/state.js";
import { cleanSlotList } from "../state/profile.js";
import { RIFT, riftDef, isInstanceTemplate, instanceTemplate, instanceIdFor, waveGroups } from "../data/instances.js";
import {
  registerInstancePlace,
  unregisterInstancePlace,
  isInstancePlace,
  featuresOf,
  placeAt,
  isPlace,
  DEFAULT_PLACE,
} from "../data/places.js";
import { ENEMIES } from "../data/enemies.js";
import { lootTable } from "../data/loot.js";
import { addEntity, dropEntity, clearEntities } from "./entity.js";
import { spawnEnemy } from "./ai.js";
import { rollLoot } from "./loot.js";
import { CACHE, countOf, moveItem } from "./inventory.js";
import { itemName, newStock } from "../data/items.js";
import { clearWorldObjects } from "./world.js";
import { enterPlace, loadPlace } from "./places.js";
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

/**
 * What a canister holds: one roll of its loot table from the instance's own seed, as stacks of
 * `{ i, c }`. Rolled when the instance is made rather than when it is opened, so the prize is part of
 * the instance — the same seed is the same reward, and a saved run comes back with exactly what was
 * still inside (slice 14b).
 */
/**
 * What a canister starts with, as an ordinary stock map (`{ itemId: count }`) — the same shape a
 * ship's hold and a station store use, so `sim/inventory.js` can treat the canister as one more
 * container and the trade panel needs no rules of its own (owner 2026-11-14: opening a cache shows
 * the ship's inventory beside the cache's, and clicking moves cargo between them).
 */
function rollCacheStock(lootId, seed) {
  if (!lootId || !lootTable(lootId)) return newStock();
  const rng = streamRng(seed, PURPOSE_CACHE);
  const stock = newStock();
  for (const drop of rollLoot(lootId, rng)) {
    const count = Math.max(1, Math.floor(Number(drop.count) || 1));
    stock[drop.item] = (stock[drop.item] || 0) + count;
  }
  return stock;
}

/** How many units are inside a canister (or 0 for a run with no prize). */
export const cacheUnits = cache => {
  const stock = cache && cache.stock;
  if (!stock) return 0;
  let n = 0;
  for (const id of Object.keys(stock)) n += Math.max(0, Math.floor(Number(stock[id]) || 0));
  return n;
};

/** A saved prize (`[{ i, c }]`, the shape slice 14b writes) back into a live stock map. */
function stockFromSaved(saved) {
  const stock = newStock();
  if (Array.isArray(saved)) {
    for (const stack of saved) {
      const c = Math.max(0, Math.floor(Number(stack?.c) || 0));
      if (stack && typeof stack.i === "string" && c > 0) stock[stack.i] = (stock[stack.i] || 0) + c;
    }
  } else if (saved && typeof saved === "object") {
    for (const id of Object.keys(saved)) {
      const c = Math.max(0, Math.floor(Number(saved[id]) || 0));
      if (c > 0) stock[id] = c;
    }
  }
  return stock;
}

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
  // `objective.need` units of `objective.ore` mined (counted off `mined` events by this file).
  "mine-ore": record => (record.mined || 0) >= Number(record.objective?.need || 1),
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

/** Notify every living pilot inside `placeId` (local via `msg`, remote guests via `mp-place-notice`). */
function notifyPlacePilots(placeId, text, secs = 8) {
  if (!placeId || !text) return;
  const local = localPlayer();
  if (local && (local.place || state.place) === placeId) {
    msg(text, secs);
  }
  for (const P of state.players) {
    if (!P || !P.guestId || P.dead || (P.place || state.place) !== placeId) continue;
    emit("mp-place-notice", { guestId: P.guestId, place: placeId, text });
  }
}

/** Every living pilot inside this instance. */
export function pilotsInside(record, players = state.players) {
  if (!record) return [];
  return players.filter(p => p && !p.dead && (p.place || state.place) === record.id);
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
    const notice = record.onExpire?.message || null;
    const inside = pilotsInside(record).filter(p => !p.docked);
    destroyInstance(record, "expiry");
    for (const P of inside) {
      state.deathNotice = notice;
      hurt(Infinity, P, profileOf(P));
    }
    state.deathNotice = null;
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
    if (record.onExpire?.message) notifyPlacePilots(record.id, record.onExpire.message, 8);
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

  // A template that does not declare a clock gets the game's default run length, so a new instance
  // is 20 minutes unless its own data says otherwise (owner 2026-11-14). `lifetimeSec: 0` is still a
  // template saying "no clock of its own", and it is honoured.
  const lifetime = typeof template.lifetimeSec === "number"
    ? Math.max(0, Number(template.lifetimeSec) || 0)
    : Math.max(0, Number(RIFT.defaultLifetimeSec) || 0);
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
    entries: new Map(),
    difficulty,
    // A natural (simple) wormhole's site may be left and re-entered at any time; a rift may not.
    reentrant: template.reentrant === true,
    mined: 0,
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
      // mine-ore carries its own wording of what is owed; destroy-guardians ignores both.
      ore: template.objective?.ore || null,
      need: Number(template.objective?.need) > 0 ? Math.floor(Number(template.objective.need)) : 1,
      met: false,
    },
    exit: {
      n: template.exit?.n || "Way out",
      r: Number(template.exit?.r) > 0 ? Number(template.exit.r) : 26,
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
          r: Number(template.cache.r) > 0 ? Number(template.cache.r) : 10,
          // Rolled once from the instance's own seed, so one seed is one reward — and what is still
          // inside is a plain stock map, which is what makes a saved run come back identical.
          stock: rollCacheStock(template.cache.loot, s),
          open: false,
          entity: null,
        }
      : null,
    enterPos: V(...(template.enter?.pos || [0, 0, 0])),
    // The way out is an object of its own in the world: seen, labelled, lockable and locked.
    exitPos: V(...(template.exit?.pos || template.enter?.pos || [0, 0, 0])),
    gate: null,
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
    // The sky of somewhere else: `render/scene.js` reads it and hides the ordinary starfield.
    environment: template.environment,
    sky: template.environment?.sky || template.sky || null,
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

function sendPilotHome(record, P) {
  if (!record || !P || (P.place || state.place) !== record.id) return false;
  const entry = record.entries?.get(ownerOf(P)) || record.entry;
  P.place = record.origin || P.place;
  if (entry) {
    P.pos.copy(entry.pos);
    P.quat.copy(entry.quat);
    P.sh = entry.sh;
    P.en = entry.en;
  }
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.warp = null;
  P.openCacheId = null;
  if (P.flight) {
    P.flight.lock = null;
    P.flight.missileLock = { target: null, t: 0, locked: false };
  }
  P.wxBursts = (P.wxBursts || 0) + 1;
  P.snap = true;
  if (P.guestWorld) P.guestWorld.place = P.place;
  if (P === state.player) {
    state.place = P.place;
    // The saved world follows the pilot out of a run: it names a place, and it is gone now.
    state.worldState.place = P.place;
  }
  return true;
}

/**
 * Put every pilot standing in this run back where they entered from, without touching the run
 * itself: the exit rules and the run's own records are untouched. `destroyInstance` calls this on
 * the way out, and so does leaving a re-enterable run — the place is the same, only the run stays.
 */
function sendPilotsHome(record) {
  for (const P of state.players) {
    sendPilotHome(record, P);
  }
  // The pocket the pilot comes back to has to BE a place again before they stand in it. A pilot who
  // entered this run without first loading its pocket (which is what happens after a reload: they
  // are put straight back into the run, so the pocket was never visited this session) used to land
  // in a pocket with no container behind it — nothing to draw, so its rock formations were
  // invisible until a warp out and back rebuilt it (owner bug report, 2026-11-15). Loading it here is
  // idempotent: a pocket already loaded just refreshes its persistent spawns.
  const home = record.origin;
  if (typeof home === "string" && home && isPlace(home)) loadPlace(home);
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
  clearEntities(W.gates);
  clearEntities(W.rifts);
  record.gate = null;
  if (record.cache) record.cache.entity = null;

  // Out first, then the place goes: `dock()` and every lookup resolve a pocket, never a dead id.
  sendPilotsHome(record);

  closeDoor(record);
  state.instances.delete(record.id);
  unregisterInstancePlace(record.id);
  state.places.delete(record.id);
  emit("instance-closed", { id: record.id, origin: record.origin, reason });
  return true;
}

/* ------------------------------------------------------------------------- */
/* A saved run comes back (slice 14b)                                         */
/* ------------------------------------------------------------------------- */

/**
 * Put one saved run back into the world as a live record. `createInstance`
 * reproduces everything the seed decides — the template, its guardians, its rocks
 * and its rolled prize — so only what the run lived through is copied back: the
 * clock, whether the objective is met, what is still inside the canister, and the
 * spot in the pocket the pilot entered from. Returns the record, or null when this
 * build cannot rebuild it (a template that no longer exists).
 */
function restoreInstance(saved) {
  const record = createInstance(saved.template, saved.seed, { origin: saved.origin, tier: saved.tier });
  if (!record) return null;
  record.lifetime = Math.max(0, Number(saved.lifetime) || 0);
  record.totalLifetime = Math.max(record.lifetime, Number(saved.totalLifetime) || 0);
  record.warned = saved.warned === true;
  // What a mine-ore objective had already mined comes back with the save (slice 14c).
  record.mined = Math.max(0, Math.floor(Number(saved.mined) || 0));
  // The objective's own words come from the template; only its state is saved.
  if (saved.objectiveMet === true) record.objective.met = true;
  const cache = record.cache;
  if (cache && saved.cache) {
    cache.stock = stockFromSaved(saved.cache.stock);
    cache.open = saved.cache.open === true;
  }
  const entry = saved.entry;
  const num = v => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
  record.entry = entry
    ? { pos: V(...entry.pos), quat: Q(...entry.quat), sh: num(entry.sh), en: num(entry.en) }
    : null;
  return record;
}

/**
 * Synchronise a visiting guest's active instance record (or clear stale ones when outside)
 * from a host `visit` snapshot so UI, map, and place lookups match host truth.
 */
export function syncGuestInstance(snap = null) {
  const keepId = snap && typeof snap.id === "string" ? snap.id : "";
  for (const [id, rec] of [...state.instances.entries()]) {
    if (id === keepId) continue;
    if (rec) rec.gone = true;
    state.instances.delete(id);
    unregisterInstancePlace(id);
    state.places.delete(id);
  }
  if (!snap || !keepId || typeof snap.template !== "string" || !snap.template) return null;
  let record = instanceAt(keepId);
  if (!record) record = restoreInstance(snap);
  if (!record) return null;
  record.gone = false;
  record.lifetime = Math.max(0, Number(snap.lifetime) || 0);
  record.totalLifetime = Math.max(record.lifetime, Number(snap.totalLifetime) || 0);
  record.warned = snap.warned === true;
  record.expired = snap.expired === true;
  record.mined = Math.max(0, Math.floor(Number(snap.mined) || 0));
  record.spawned = snap.spawned === true;
  if (record.objective) record.objective.met = snap.objectiveMet === true;
  if (record.cache && snap.cache) {
    record.cache.open = snap.cache.open === true;
    record.cache.stock = stockFromSaved(snap.cache.stock);
    const cleaned = Array.isArray(snap.cache.slots) ? cleanSlotList(snap.cache.slots, record.cache.stock) : null;
    if (cleaned) record.cache.slots = cleaned;
    else delete record.cache.slots;
  }
  return record;
}

/**
 * Rebuild every saved run and register its place, so a load that was made inside
 * one has somewhere to come back to. Call it **before** `resumeFromSave()`: the
 * pilot's saved place has to be a place by the time they are put in it, and
 * entering a place clears its world, so nothing is spawned here yet.
 *
 * Returns how many runs came back.
 */
export function restoreInstances() {
  // A load never keeps the runs of the save it replaced — nor their place containers, so `loadPlace`
  // rebuilds a restored run's rocks from its features instead of keeping whatever was flying in them.
  const stale = [...state.instances.keys()];
  for (const id of stale) state.places.delete(id);
  clearInstances();
  // `render/` is not allowed to know what a save is, so it is told which places stopped existing.
  if (stale.length) emit("instances-forgotten", { ids: stale });
  const saved = state.worldState.instances;
  for (const run of Array.isArray(saved) ? saved : []) {
    if (run && typeof run === "object") restoreInstance(run);   // registers itself in state.instances
  }
  // A run this build cannot rebuild leaves the pilot's saved place pointing at
  // nowhere. Send them home instead of into a pocket that is on no map.
  const place = state.worldState.place;
  if (typeof place === "string" && !state.instances.has(place) && !isPlace(place)) {
    state.worldState.place = DEFAULT_PLACE;
    state.worldState.resume = null;
  }
  return state.instances.size;
}

/**
 * Build what a restored run is made of — its guardians, its canister and its way
 * out — for every run the pilot is standing in. Call it **after** `resumeFromSave()`,
 * because entering a place clears that place's objects first. The clock keeps
 * running from where the save left it, the canister stays sealed until the
 * objective is met, and the guardians come back whole: a half-destroyed wave is
 * not something a save carries.
 *
 * Returns how many runs were filled in.
 */
export function populateInstances() {
  let filled = 0;
  for (const record of state.instances.values()) {
    if (!record || record.gone || record.spawned) continue;
    const P = pilotInside(record);
    if (!P) continue;
    spawnRun(record);
    // The panel's own words rather than a sentence about something that is not happening now.
    msg(record.objective.met ? `${record.objective.n} — done` : record.objective.n || "Objective", 8);
    emit("instance-restored", { id: record.id, template: record.template, left: instanceTimeLeft(record) });
    filled++;
  }
  return filled;
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
    let d = at.distanceTo(V(...field.pos)) - radius;
    if (field.layout === "arc") {
      const x = at.x - field.pos[0], z = at.z - field.pos[2];
      const arc = field.arc;
      const relative = Math.atan2(Math.sin(Math.atan2(z, x) - arc.angle), Math.cos(Math.atan2(z, x) - arc.angle));
      const clampedAngle = Math.abs(relative) < arc.gap / 2
        ? arc.angle + (relative < 0 ? -1 : 1) * arc.gap / 2 : Math.atan2(z, x);
      const projection = x * Math.cos(clampedAngle) + z * Math.sin(clampedAngle);
      const nearestRadius = Math.max(arc.inner, Math.min(arc.inner + arc.width, projection));
      const horizontal = Math.hypot(x - Math.cos(clampedAngle) * nearestRadius, z - Math.sin(clampedAngle) * nearestRadius);
      // Include the maximum lump envelope at the edges of the arc volume.
      const margin = Math.max(field.rock?.rMax || 70, field.rock?.giantMax || 0) * 1.5;
      d = Math.hypot(horizontal, Math.max(0, Math.abs(at.y - field.pos[1]) - field.height)) - margin;
    }
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
  if (P) P.wxBursts = (P.wxBursts || 0) + 1;
  if (P === localPlayer()) emit("sfx", { name: "warp-burst" });
  emit("rift-opened", { id: rift.id, place: placeId, template: templateId, seed: s, player: P });
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
  if (rift.peer) {
    const denied = exitDenial(rift);
    if (denied) return denied;
    const peer = state.galaxy?.pocketsById?.[rift.peer];
    if (peer?.peer !== placeId || !enterPlace(peer.id, P)) return "That wormhole has collapsed.";
    P.pos.set(...peer.enter.pos);
    P.v.set(0, 0, 0);
    P.thr = 0;
    P.warp = null;
    P.openCacheId = null;
    if (P.flight) {
      P.flight.lock = null;
      P.flight.missileLock = { target: null, t: 0, locked: false };
    }
    P.wxBursts = (P.wxBursts || 0) + 1;
    P.snap = true;
    emit("place-changed", { from: placeId, to: peer.id, player: P });
    return true;
  }
  const record = createInstance(rift.template, rift.seed, { origin: placeId });
  if (!record) return "That rift leads nowhere.";

  // Where each pilot came from, so leaving — or dying, or an ejection — puts them back exactly there.
  const entry = {
    pos: playerPos(P).clone(),
    quat: P.quat.clone(),
    sh: P.sh,
    en: P.en,
  };
  if (!record.entries) record.entries = new Map();
  record.entries.set(ownerOf(P), entry);
  record.entry = entry;
  if (!enterPlace(record.id, P)) {
    if (!record.reentrant && !pilotsInside(record).length) destroyInstance(record, "refused");
    return "That rift leads nowhere.";
  }

  P.pos.copy(record.enterPos);
  P.quat.identity();
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.snap = true;
  P.warp = null;
  P.openCacheId = null;
  if (P.flight) {
    P.flight.lock = null;
    P.flight.missileLock = { target: null, t: 0, locked: false };
  }
  P.wxBursts = (P.wxBursts || 0) + 1;

  if (!record.spawned) {
    spawnRun(record);
  }
  if (P === localPlayer()) {
    emit("sfx", { name: "warp-burst" });
    msg(record.objective.n || "Objective", 8);
  }
  emit("rift-entered", { id: record.id, template: record.template, origin: record.origin, player: P });
  return true;
}

/** The declared wave, at its declared distance from the arrival point — never in the pilot's face. */
function spawnGuardians(record) {
  const template = instanceTemplate(record.template);
  const groups = waveGroups(template?.guardians);
  if (!groups.length) return;
  // One stream for the whole wave, rolled group by group in declaration order, so the same seed is
  // always the same fight.
  const rng = streamRng(record.seed, PURPOSE_GUARDIANS);
  for (const group of groups) {
    const [lo, hi] = group.spawnDist;
    if (!ENEMIES[group.enemy]) continue;
    for (let i = 0; i < group.count; i++) {
      // Evenly spread around the arrival point, each at its own rolled distance and height, so a
      // run is the same every time and nothing ever materialises on top of the pilot.
      const angle = (i / group.count) * Math.PI * 2 + rng() * 0.6;
      const dist = lo + rng() * Math.max(0, hi - lo);
      const at = V(
        record.enterPos.x + Math.cos(angle) * dist,
        record.enterPos.y + (rng() - 0.5) * dist * 0.3,
        record.enterPos.z + Math.sin(angle) * dist,
      );
      // `encounter` stays null: an instance's wave is not a pocket encounter, so it writes no
      // place memory and can never trip a mission's wave-clear trigger.
      spawnEnemy(group.enemy, at, record.id, null, {});
    }
  }
}

/** The locked cache: a physical container, visible from the start, collectable only once it opens. */
/**
 * What a run puts in the world: its guardians, its canister and its way out. One function so a run
 * entered through a door and a run restored from a save are filled in exactly the same way.
 */
function spawnRun(record) {
  record.spawned = true;
  // A run whose objective is met comes back met: its wave is gone for good, so a reload is never a
  // way to fight it — or its prize — again.
  if (!record.objective.met) spawnGuardians(record);
  // A canister the pilot already emptied stays emptied: it is gone from the world for good.
  if (cacheUnits(record.cache) > 0) spawnCache(record);
  spawnGate(record);
}

function spawnCache(record) {
  if (!record.cache || record.cache.entity) return;
  const cache = addEntity(placeWorld(record.id).caches, {
    kind: "cache",
    place: record.id,
    n: record.cache.n,
    loot: record.cache.loot,
    locked: !record.cache.open,
    pos: record.cache.pos.clone(),
    quat: Q(),
    spin: 0.35,
    r: record.cache.r,
  });
  record.cache.entity = cache;
}

/**
 * The way out: a portal of its own in the world, always visible, drawn like the door the pilot came
 * through, and locked until the instance's own exit rules are met.
 */
function spawnGate(record) {
  if (record.gate) return;
  record.gate = addEntity(placeWorld(record.id).gates, {
    kind: "gate",
    place: record.id,
    n: record.exit.n,
    exit: true,
    // A natural wormhole's way out is the same grey sphere as the way in (a rift's is the anomaly).
    variant: record.reentrant ? "simple" : undefined,
    locked: !!exitDenial(record),
    pos: record.exitPos.clone(),
    quat: Q(),
    spin: 0.35,
    r: record.exit.r,
  });
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
  if (at.distanceTo(record.exitPos) > range) {
    return `Fly back to ${record.exit.n} (within ${range} m of it) and press R.`;
  }
  const loss = exitDenial(record);
  if (loss) {
    if (P === localPlayer()) {
      msg(loss, 5);
      emit("travel-denied", { reason: loss, from: record.id, to: record.origin });
    }
    return loss;
  }
  const otherInside = pilotsInside(record).some(p => p !== P);
  // A natural (simple) wormhole's run may be left at any time and re-entered until the pocket's
  // 20 minutes are spent: the pilot goes back where they came from, the run keeps its state, the
  // door stays hanging in the pocket. A rift is one use and despawns once its last pilot leaves.
  if (record.reentrant || otherInside) {
    sendPilotHome(record, P);
    if (typeof record.origin === "string" && record.origin && isPlace(record.origin)) loadPlace(record.origin);
    if (!otherInside && P === localPlayer()) {
      emit("instance-closed", { id: record.id, origin: record.origin, reason: "left" });
    }
    emit("rift-left", { id: record.id, origin: record.origin, player: P });
    return true;
  }
  destroyInstance(record, "left");
  emit("rift-left", { id: record.id, origin: record.origin, player: P });
  return true;
}

/**
 * What R would do here, in the instance's own words, or null when nothing is in reach. The canister
 * comes first when the pilot is right beside it — it is small and it is the reason to be here — and
 * the way out answers everywhere else within its own range.
 */
export function instancePrompt(record, player = localPlayer()) {
  const P = player || localPlayer();
  if (!record || !P) return null;
  const at = playerPos(P);
  const cache = record.cache;
  if (cache?.entity && at.distanceTo(cache.pos) <= (Number(RIFT.cacheRange) || 0)) {
    if (!cache.open) return `The ${cache.n} is sealed`;
    return cacheUnits(cache) > 0 ? `Press R to open ${cache.n}` : `The ${cache.n} is empty`;
  }
  if (at.distanceTo(record.exitPos) <= (Number(RIFT.exitRange) || 0)) {
    return exitDenial(record) || `Press R to leave through ${record.exit.n}`;
  }
  return null;
}

/**
 * Perform the R action for `player` without forcing local HUD side-effects on non-local pilots.
 * Returns `{ ok, message, entered, left, openedCache }`.
 */
export function riftActionResult(player = localPlayer()) {
  const P = player || localPlayer();
  if (!P || P.dead) return { ok: false, message: "", entered: false, left: false, openedCache: false };
  const placeId = P.place || state.place;
  if (isInstancePlace(placeId)) {
    const record = instanceAt(placeId);
    const cache = record?.cache;
    if (cache?.entity && playerPos(P).distanceTo(cache.pos) <= (Number(RIFT.cacheRange) || 0)) {
      const out = openCacheTrade(record, P);
      return { ok: out === true, message: out === true ? "" : String(out || ""), entered: false, left: false, openedCache: out === true };
    }
    const out = leaveInstance(P);
    return { ok: out === true, message: out === true ? "" : String(out || ""), entered: false, left: out === true, openedCache: false };
  }
  const rift = nearestRift(P);
  if (!rift) {
    return { ok: false, message: "Nothing to enter here.", entered: false, left: false, openedCache: false };
  }
  const inResult = enterRift(rift, P);
  return { ok: inResult === true, message: inResult === true ? "" : String(inResult || ""), entered: inResult === true, left: false, openedCache: false };
}

/**
 * The **R** key, on the nearest thing it can act on: outside, a rift door within range; inside, the
 * canister beside the pilot if there is one to open, otherwise the way out. One binding, one
 * deliberate press — a ship can never drift in or out by contact, and flying past a canister never
 * opens it.
 */
export function riftAction(player = localPlayer()) {
  const P = player || localPlayer();
  const res = riftActionResult(P);
  if (!res.ok && res.message && P === localPlayer()) {
    if (res.message === "Nothing to enter here.") say(res.message);
    else msg(res.message, 5);
  }
  return res.ok;
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

/**
 * The objective is done, so the canister unlocks — and stays exactly where it hangs. Taking what is
 * inside is the pilot's own act, at close range, with R: nothing enters a hold by itself (LESSONS L6).
 */
function unlockCache(record) {
  const cache = record.cache;
  if (!cache || cache.open) return false;
  cache.open = true;
  if (cache.entity) cache.entity.locked = false;
  return true;
}

/** "a, b and c" — the way the game lists things inside a sentence. */
const listWords = parts =>
  parts.length < 2 ? parts[0] || "" : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

/**
 * The canister a trade moves cargo in and out of: the prize of the run the pilot is inside, once its
 * objective has unlocked it. Null anywhere else — out in a pocket there is nothing to trade with, a
 * sealed canister is not open to trade with, and a run that has no prize has nothing to offer.
 *
 * An emptied canister still answers here: its stock is the record's own, so a pilot who took
 * everything out can put something back (`tradeCacheItem`), and the tick hangs it in the world again.
 *
 * `sim/inventory.js` resolves its `CACHE` container the same way (the local pilot's own run, once it
 * is open), so a move between a hold and the canister is an ordinary `moveItem` between two of them.
 */
export function cacheTradeRecord(player = localPlayer()) {
  const record = canisterAt(player);
  return record && record.cache.open ? record : null;
}

/**
 * The run's canister whether it is open or not, so a refusal can say which of the two it is: no
 * canister here at all, or one that is still sealed.
 */
function canisterAt(player = localPlayer()) {
  const P = player || localPlayer();
  const placeId = P?.place || state.place;
  const record = isInstancePlace(placeId) ? instanceAt(placeId) : null;
  return record && record.cache ? record : null;
}

/**
 * Open the canister the pilot is beside: a **trade**, not a transfer. Nothing moves by itself — the
 * panel (`ui/cache.js`) puts the ship's hold and the canister side by side and the pilot clicks cargo
 * across, one unit per click or a whole stack with Shift, in either direction (owner 2026-11-14:
 * "clicking and shift clicking moves items in between exactly like ship inv and station inv").
 *
 * Returns true when the trade is offered, or a sentence saying why it is not.
 */
export function openCacheTrade(record, player = localPlayer(), profile = null) {
  const cache = record?.cache;
  const P = player || localPlayer();
  const isLocal = P === localPlayer();
  // Every answer here is a sentence the pilot sees: a refusal is never swallowed (LESSONS L11).
  const refuse = text => {
    if (isLocal) msg(text, 6);
    return text;
  };
  if (!cache) return refuse("There is nothing to open here.");
  if (!P || P.dead) return refuse("There is nobody to open it.");
  if (!cache.open) return refuse(`The ${cache.n} is still sealed. ${record.objective.n || ""}`.trim());
  if (!cacheUnits(cache)) return refuse(`The ${cache.n} is empty.`);

  const prof = profile || profileOf(P) || state.profile;
  P.openCacheId = record.id;
  if (isLocal) emit("sfx", { name: "pickup" });
  emit("instance-cache-open", {
    id: record.id,
    loot: cache.loot,
    n: cache.n,
    left: cacheUnits(cache),
    profile: prof,
    player: P,
  });
  return true;
}

/**
 * Put the trade away. The canister keeps exactly what the pilot left in it and stays where it hangs,
 * so the next press of R beside it reopens the same trade — unless it was emptied, which drops it
 * from the world for good (see `tradeCacheItem`).
 */
export function closeCacheTrade(record = cacheTradeRecord(), player = localPlayer()) {
  const P = player || localPlayer();
  if (P) P.openCacheId = null;
  if (!record) return false;
  emit("instance-cache-closed", { id: record.id, left: cacheUnits(record.cache), player: P });
  return true;
}

/**
 * One click in the trade panel: move `n` units of `id` (a whole stack for Infinity, which is what
 * Shift-click asks for) between the canister and the pilot's hold. `dir` is `"take"` for canister to
 * hold and `"stow"` for the other way. The move itself is the ordinary inventory rule, so what does
 * not fit stays put and the pilot is told so in the panel's own words.
 *
 * Returns the sentence `moveItem` returns, which is what the panel shows.
 */
export function tradeCacheItem(dir, id, n = 1, player = localPlayer(), profile = null) {
  const record = canisterAt(player);
  if (!record) return "There is no canister here to trade with.";
  const cache = record.cache;
  // A trade is the one place cargo could leave a prize that was never unlocked, so the rule is stated
  // here and not only in the panel that would never open for it.
  if (!cache.open) return `The ${cache.n} is still sealed.`;
  const P = player || localPlayer();
  const prof = profile || profileOf(P) || state.profile;
  const world = worldOf(P);
  const take = dir === "take";
  const from = take ? CACHE : prof.ship;
  const to = take ? prof.ship : CACHE;

  const before = countOf(to, id, prof, world);
  const text = moveItem(from, to, id, n, prof, world);
  const moved = countOf(to, id, prof, world) - before;
  if (!(moved > 0)) return text;

  if (P === localPlayer()) emit("sfx", { name: "pickup" });
  emit("instance-cache-moved", { id: record.id, item: id, n: moved, dir: take ? "take" : "stow", player: P });
  // Emptied, the canister is gone from the world: there is nothing left to fly to. Something put back
  // into it brings it back (the tick rebuilds a run's objects from the record), so a pilot who wants
  // to leave cargo behind can still do it.
  if (take && !cacheUnits(cache)) {
    if (cache.entity) dropEntity(placeWorld(record.id).caches, cache.entity);
    cache.entity = null;
    for (const p of state.players) {
      if (p && p.openCacheId === record.id) p.openCacheId = null;
    }
    emit("instance-cache-empty", { id: record.id, loot: cache.loot });
    notifyPlacePilots(record.id, `The ${cache.n} is empty.`, 6);
  }
  return text;
}

/**
 * Report a completed slot move into or out of the open rift canister so sound,
 * events and world-entity cleanup match `tradeCacheItem`. While a stack lifted
 * from the canister is still held on the cursor (`heldFromCache: true`), the
 * canister is not declared emptied yet.
 */
export function notifyCacheMove(dir, id, moved, opts = {}) {
  if (!(moved > 0)) return;
  const P = opts.player || localPlayer();
  const record = canisterAt(P);
  if (!record?.cache?.open) return;
  const cache = record.cache;
  const take = dir === "take";
  if (P === localPlayer()) emit("sfx", { name: "pickup" });
  emit("instance-cache-moved", { id: record.id, item: id, n: moved, dir: take ? "take" : "stow", player: P });
  if (take && !cacheUnits(cache) && !opts.heldFromCache) {
    if (cache.entity) dropEntity(placeWorld(record.id).caches, cache.entity);
    cache.entity = null;
    for (const p of state.players) {
      if (p && p.openCacheId === record.id) p.openCacheId = null;
    }
    emit("instance-cache-empty", { id: record.id, loot: cache.loot });
    notifyPlacePilots(record.id, `The ${cache.n} is empty.`, 6);
  }
}

function completeObjective(record) {
  if (record.objective.met) return;
  record.objective.met = true;
  const unlocked = unlockCache(record);
  if (record.gate) record.gate.locked = !!exitDenial(record);
  const text = [record.objective.done || "Objective complete."];
  if (unlocked) text.push(`${record.cache.n} unlocked — fly to it and press R.`);
  if (!record.exit.requires.length || !exitDenial(record)) text.push("The way out is open.");
  notifyPlacePilots(record.id, text.join(" "), 8);
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
          notifyPlacePilots(record.id, warning, 8);
          emit("instance-warning", { id: record.id, left: instanceTimeLeft(record) });
        }
      }
      if (record.lifetime <= 0) {
        expireInstance(record);
        continue;
      }
    }
    if (!record.objective.met && objectiveDone(record)) completeObjective(record);

    // The two objects a run puts in the world turn in place, and their locks follow the instance's
    // own state rather than a flag somebody remembered to set. If one is missing — a place was
    // cleared, or a saved run is being restored — it is built again from the record.
    const cache = record.cache;
    const W = placeWorld(record.id);
    if (record.spawned && cache && !cache.entity && cacheUnits(cache) > 0) spawnCache(record);
    if (record.spawned && (!record.gate || !W.gates.includes(record.gate))) {
      record.gate = null;
      spawnGate(record);
    }
    if (cache?.entity) {
      cache.entity.locked = !cache.open;
      cache.entity.quat.multiply(_spin.setFromAxisAngle(UP, cache.entity.spin * dt));
    }
    if (record.gate) {
      record.gate.locked = !!exitDenial(record);
      record.gate.quat.multiply(_spin.setFromAxisAngle(UP, record.gate.spin * dt));
    }
    // Both offer themselves the way a door does: a hint only where R would work, in the instance's
    // own words, and the refusal instead while the way out is sealed.
    for (const P of state.players) {
      if (!P || P.dead || (P.place || state.place) !== record.id) continue;
      const prompt = instancePrompt(record, P);
      if (prompt) sayForPlayer(P, prompt);
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
  for (const P of state.players) {
    if (!P || P.docked || P.dead || (P.place || state.place) !== placeId) continue;
    const rift = nearestRift(P, placeId);
    if (rift) sayForPlayer(P, `Press R to enter ${rift.dest || rift.n}`);
  }
}

/* ------------------------------------------------------------------------- */
/* Death inside an instance                                                   */
/* ------------------------------------------------------------------------- */

// `sim/session.js` emits `dying` as the first thing `die()` does, before the ship and its hold are
// removed and before the pilot is docked. An instance despawns at once when the pilot dies inside it
// (owner rule), and this puts them back where they entered so the ordinary death rules — recovery
// fee, loaned Wasp, docking at that pocket's station — then apply unchanged.
on("dying", ({ player } = {}) => {
  const P = player || localPlayer();
  const record = instanceAt(P ? P.place || state.place : state.place);
  if (!record) return;
  const otherInside = pilotsInside(record).some(p => p !== P);
  if (otherInside) {
    sendPilotHome(record, P);
    if (typeof record.origin === "string" && record.origin && isPlace(record.origin)) loadPlace(record.origin);
    emit("rift-left", { id: record.id, origin: record.origin, player: P });
  } else {
    destroyInstance(record, "death");
  }
});

// The beam put some ore in the hold (sim/weapons.js emits `mined`). A mine-ore objective counts
// only the ore it asked for — and only inside the instance that declared it. Completion itself is
// noticed by the tick, the same way a destroyed wave is, so a missed event can never strand a run.
on("mined", ({ item, player } = {}) => {
  const P = player || localPlayer();
  const id = P ? P.place || state.place : state.place;
  const record = isInstancePlace(id) ? instanceAt(id) : null;
  if (!record || record.gone || record.objective?.kind !== "mine-ore" || record.objective.met) return;
  if (item !== record.objective.ore) return;
  record.mined = (record.mined || 0) + 1;
});
