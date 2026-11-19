// Simple wormholes (refactor step 14c): pockets that spawn themselves in normal space.
//
// A **simple wormhole** is a pocket of the system it spawned in — it appears on that system's
// pocket map, it is warpable like its siblings, and a grey dark sphere called "Simple Wormhole"
// hangs in its centre (an anomaly the pilot flies close to and enters with **R**, exactly like a
// rift). The far side is an ordinary instance: one of the re-enterable sites in `INSTANCE_TEMPLATES`
// (`reentrant: true`), with a one-time objective and stock, a way out that never locks and never
// expires, and no clock of its own. The 20 minutes belong to the *pocket*, and they run from the
// moment it spawns (owner, 2026-11-14).
//
// The standing population is a rule, not an event (the owner, 2026-11-14): there are always
// `WORMHOLE_SPAWN.population` simple wormholes hanging in the universe, spread over the systems,
// never more than `maxPerSystem` in one, and when one fades a new one pops up somewhere else. A
// fresh universe fills itself with lifetimes rolled from 0 to `lifetimeSec` at random so collapses
// never march in sync; a wormhole that respawns after an expiry always gets the full `lifetimeSec`.
// Nothing announces a spawn — the map is the notice.
//
// When the clock runs out the way in fades (`collapse` — never `kill`): the wormhole object goes,
// the instance stays open and its Stable wormhole way out keeps working. The outer pocket stays on
// the map only while somebody can be in it — the local pilot standing in it, in its instance, or
// warping towards it — and despawns the moment they leave. A pocket nobody is in is taken off the
// map at once, so the maps do not fill with dead wormholes.
//
// The pocket is **saved** (save v21, `world.wormholes`) with its remaining time, so a reload finds
// the wormhole still hanging wherever it was; the instance behind it is saved by the ordinary run
// rules (`sim/instances.js`). The seed rebuilds everything else. This file owns the records, the
// pocket registration and the clock; `sim/instances.js` owns the run behind the door.
//
// Nothing here imports `core/`, `render/` or `ui/` (`tests/layers.test.mjs`).

import { restoreConnectionDoors, tickConnections } from "./uncharted.js";
import { V, Q } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { random } from "../util/rng.js";
import {
  state, placeWorld, localPlayer, instanceAt, msg, clearWormholes,
} from "../state/state.js";
import {
  WORMHOLE_POCKET, WORMHOLE_SITE_POOL, WORMHOLE_SPAWN,
  instanceTemplate, instanceIdFor, wormholeIdFor,
} from "../data/instances.js";
import {
  registerWormholePlace, unregisterWormholePlace,
} from "../data/places.js";
import { addEntity, dropEntity } from "./entity.js";
import { clearWorldObjects } from "./world.js";
import { destroyInstance } from "./instances.js";

/* ------------------------------------------------------------------------- */
/* Which site a wormhole opens into: a weighted roll, like a rift kind         */
/* ------------------------------------------------------------------------- */

/**
 * Roll the far-side site a simple wormhole offers: one weighted pick from `WORMHOLE_SITE_POOL`.
 * A weight missing means 1; a weight of zero or less means never. Null when the pool holds nothing
 * usable, so bad data refuses rather than opening some other pocket.
 */
export function rollWormholeTemplate(rng = random) {
  const pool = [];
  let total = 0;
  for (const entry of WORMHOLE_SITE_POOL) {
    if (!entry || !instanceTemplate(entry.id) || !instanceTemplate(entry.id)?.reentrant) continue;
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
/* Spawning                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * A deterministic 2D map position for a spawned pocket — its dot on the zoomed-in system map.
 * Authored `mapPos` wins in `systemPocketLayout`, so every sibling dot stays put when the
 * wormhole comes and goes; the band sits between the ordinary ring (140) and the gate ring (280)
 * so spawned pockets never sit on top of a gate. Derived from the seed, so it is the same dot
 * after every reload without being saved.
 */
export function wormholeMapPos(seed) {
  let h = (seed >>> 0) || 1;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  const angle = (h % 6283) / 1000;                 // 0..2π
  const radius = 195 + ((h >>> 11) % 40);          // 195..234: inside the gates, outside the ring
  return [Math.round(Math.cos(angle) * radius * 10) / 10, Math.round(Math.sin(angle) * radius * 10) / 10];
}

const pocketRecord = (record) => ({
  id: record.id,
  kind: "pocket",
  n: WORMHOLE_POCKET.n,
  d: WORMHOLE_POCKET.d,
  // An authored pocket with explicit features, loaded by the ordinary place loader.
  def: "empty",
  parent: record.parent,
  tier: record.tier,
  role: "ordinary",
  template: null,
  enter: { kind: "warp", pos: [...WORMHOLE_POCKET.enter.pos] },
  leave: { kind: "warp" },
  features: JSON.parse(JSON.stringify(WORMHOLE_POCKET.features)),
  // No `sky`: the pocket is ordinary space in the system it spawned in (owner, 2026-11-14),
  // so it hangs the same starfield every sibling pocket hangs — always. Only the far side of
  // the wormhole is somewhere else.
  mapPos: wormholeMapPos(record.seed),
});

/** Inject the pocket into a galaxy (the map and the free-warp rules read it). Defaults to the
 *  live one; the pre-save registration passes the candidate galaxy so the injection travels with it. */
function galaxyInject(record, galaxy = state.galaxy) {
  if (!galaxy) return;
  const pocket = pocketRecord(record);
  galaxy.pockets[record.id] = pocket;
  galaxy.pocketsById[record.id] = pocket;
}

/** Remove the pocket from the live galaxy. */
function galaxyEject(record) {
  const galaxy = state.galaxy;
  if (!galaxy) return;
  delete galaxy.pockets[record.id];
  delete galaxy.pocketsById[record.id];
}

/** How many wormholes are live (not faded) in system `systemId` right now. */
const liveInSystem = (systemId, wormholes = state.wormholes) => {
  let n = 0;
  for (const wh of wormholes.values()) if (wh && !wh.doomed && wh.parent === systemId) n++;
  return n;
};

/** Every system of the live galaxy that still has room for another wormhole. */
function systemsWithRoom(wormholes = state.wormholes) {
  const galaxy = state.galaxy;
  const systems = galaxy?.systems || [];
  const cap = Number(WORMHOLE_SPAWN.maxPerSystem) || 0;
  return systems.filter(system => liveInSystem(system.id, wormholes) < cap);
}

/**
 * Pick the system a new wormhole hangs in: uniformly at random among the systems that still have
 * room. Returns null when every system is full (so a `maxPerSystem` tweak can never overspawn).
 */
export function pickSpawnSystem(rng = random) {
  const candidates = systemsWithRoom();
  if (!candidates.length) return null;
  const index = Math.min(candidates.length - 1, Math.floor((Number(rng()) || 0) * candidates.length));
  return candidates[index]?.id || null;
}

/**
 * Hang one simple wormhole in `parent` (or in a system picked at random when omitted). `seed` is
 * rolled when omitted; everything else about the wormhole comes from that seed. `initial` is the
 * first fill of a fresh universe: its clock is rolled from 0 to `lifetimeSec` at random so the
 * collapses never march in sync (owner, 2026-11-14) — respawns always get the full clock.
 *
 * Returns the wormhole record, or null when there is nowhere it may hang.
 */
export function spawnWormhole(opts = {}) {
  const rng = typeof opts.rng === "function" ? opts.rng : random;
  const parent = typeof opts.parent === "string" && opts.parent ? opts.parent : pickSpawnSystem(rng);
  if (!parent) return null;
  if (liveInSystem(parent) >= (Number(WORMHOLE_SPAWN.maxPerSystem) || 0)) return null;
  const template = rollWormholeTemplate(rng);
  if (!template) return null;
  const seed = opts.seed == null ? (Number(rng()) * 0xffffffff) >>> 0 : (Number(opts.seed) >>> 0) || 0;
  const id = wormholeIdFor(seed);
  const existing = state.wormholes.get(id);
  if (existing) return existing;
  const total = Math.max(1, Number(WORMHOLE_SPAWN.lifetimeSec) || 1200);
  const lifetime = opts.initial
    ? Math.min(total, Math.max(1, Math.floor((Number(rng()) || 0.5) * total)))
    : total;
  const record = {
    id,
    parent,
    template,
    seed,
    tier: Math.max(1, Number(
      state.galaxy?.systemsById?.[parent]?.tier
      ?? state.galaxy?.systems?.find?.(s => s.id === parent)?.tier
    ) || 1),
    lifetime,
    totalLifetime: total,
    doomed: false,
    instanceId: instanceIdFor(template, seed),
  };
  state.wormholes.set(id, record);
  galaxyInject(record);
  registerWormholePlace(pocketRecord(record));
  ensureWormholeDoor(record);
  return record;
}

/**
 * Top the universe up to `WORMHOLE_SPAWN.population` live wormholes. `initial` marks the first
 * fill of a fresh universe (or the first load of a save from before simple wormholes), which rolls
 * staggered lifetimes so collapses never synchronise; replacements spawned after an expiry get the
 * full clock. Returns how many were spawned.
 */
export function topUpWormholes({ initial = false, rng = random } = {}) {
  const want = Number(WORMHOLE_SPAWN.population) || 0;
  let live = 0;
  for (const wh of state.wormholes.values()) if (wh && !wh.doomed) live++;
  let spawned = 0;
  while (live < want) {
    const record = spawnWormhole({ initial, rng });
    if (!record) break;
    live++;
    spawned++;
  }
  return spawned;
}

/* ------------------------------------------------------------------------- */
/* The door hanging in the pocket                                               */
/* ------------------------------------------------------------------------- */

/**
 * Make sure the wormhole's door hangs in its pocket (idempotent): a grey dark sphere called
 * "Simple Wormhole" — the same kind of object a rift is, in grey — which the pilot enters with
 * **R** inside `RIFT.enterRange` once they have flown close enough. A doomed pocket gets no door.
 *
 * Returns the door record, or null when the wormhole may hang no door.
 */
export function ensureWormholeDoor(record, placeId = null) {
  if (!record || record.doomed) return null;
  const id = placeId || record.id;
  if (id !== record.id) return null;
  const rifts = placeWorld(id).rifts;
  const existing = rifts.find(rift => rift && rift.instance === record.instanceId);
  if (existing) return existing;
  const door = addEntity(rifts, {
    kind: "rift",
    variant: "simple",       // the grey sphere; a rift is the orange anomaly
    place: id,
    wormhole: record.id,
    instance: record.instanceId,
    template: record.template,
    seed: record.seed,
    n: WORMHOLE_POCKET.n,
    dest: WORMHOLE_POCKET.n, // the sphere keeps its own name; the site is named on entering
    pos: V(0, 0, 0),         // the sphere hangs at the pocket's centre
    quat: Q(),
    spin: 0.12,              // the sphere turns slowly; a rift flickers fast
    r: 30,
    gone: false,
  });
  return door;
}

/** Take the door out of the pocket it hangs in. */
function dropDoor(record) {
  const rifts = record && placeWorld(record.id).rifts;
  if (!rifts) return 0;
  let dropped = 0;
  for (const rift of [...rifts]) {
    if (!rift || rift.instance !== record.instanceId) continue;
    dropEntity(rifts, rift);
    dropped++;
  }
  return dropped;
}

/* ------------------------------------------------------------------------- */
/* Fading, despawning and being done with it                                   */
/* ------------------------------------------------------------------------- */

/** Is the local pilot (or a warp in flight) in or headed for this pocket or its instance? */
function pocketOccupied(record) {
  const P = localPlayer();
  if (!P) return false;
  const here = P.place || state.place;
  if (here === record.id) return true;
  if (here === record.instanceId) return true;
  if (P.warp && P.warp.to === record.id) return true;
  return false;
}

/**
 * The wormhole fades: the way in goes, the instance stays open and its Stable wormhole way out
 * keeps working (never a `kill`). The pocket stays on the map only while somebody is in it — the
 * local pilot in the pocket, in its instance, or warping towards it — and despawns at once when
 * nobody is. A replacement pops up somewhere in the universe either way (owner, 2026-11-14).
 */
export function doomWormhole(record, { quiet = false } = {}) {
  if (!record || record.doomed) return false;
  record.doomed = true;
  record.lifetime = 0;
  dropDoor(record);
  const P = localPlayer();
  const inSameSystem = P && !P.docked && !P.dead &&
    (state.galaxy?.pocketsById?.[P.place || state.place]?.parent === record.parent);
  if (!quiet && inSameSystem) msg("The Simple Wormhole collapses.", 6);
  emit("wormhole-collapsed", { id: record.id, parent: record.parent, template: record.template });
  // A fresh wormhole takes the faded one's place somewhere in the universe.
  topUpWormholes();
  if (!pocketOccupied(record)) removeWormhole(record);
  return true;
}

/**
 * Take a wormhole pocket off the map for good: empty it, forget its scenery, remove it from the
 * galaxy and the place catalog, drop its record, and destroy the instance behind it if one exists
 * and nobody is inside (a pilot warping off the doomed pocket leaves the run unreachable forever).
 */
export function removeWormhole(record) {
  if (!record) return false;
  dropDoor(record);
  clearWorldObjects(record.id);
  galaxyEject(record);
  unregisterWormholePlace(record.id);
  state.wormholes.delete(record.id);
  state.places.delete(record.id);
  const instance = record.instanceId ? instanceAt(record.instanceId) : null;
  if (instance && !(localPlayer() && (localPlayer().place || state.place) === instance.id)) {
    destroyInstance(instance, "expiry");
  }
  emit("wormhole-gone", { id: record.id, parent: record.parent });
  return true;
}

/* ------------------------------------------------------------------------- */
/* Saving and restoring (save v21)                                              */
/* ------------------------------------------------------------------------- */

// `restoreWormholes()` is called at boot (before anything loads the saved place) and again from
// `resumeFromSave()`; both call it for the same `applySave`. The records rebuild from the world
// object, so the second call would only wipe the first fill and draw new clocks — including the
// staggered ones of a fresh universe. Restoring is idempotent per world object: the same
// `state.worldState` gets exactly one build. `applySave` swaps that object, which is what makes a
// load, a reset or an import restore again.
let restoredWorld = null;

/**
 * Pre-register the saved wormhole pockets so save validation can see them: `sanitizeWorld`
 * resolves a saved pocket id against the installed catalog and the galaxy, and this is what makes
 * a pocket the game spawned itself look like a place again. Called by `prepareGalaxySave` **before**
 * `sanitizeSave`, mirroring how a saved run inside an instance is handled. It does not build
 * doors — that is `restoreWormholes()`'s job, once the pilot is loaded.
 *
 * Unoccupied doomed pockets (saved while somebody was in them, nobody since) are dropped here
 * rather than restored: they can never be reached again.
 */
export function registerWormholePlaces(rawWorld, galaxy = state.galaxy) {
  const saved = Array.isArray(rawWorld?.wormholes) ? rawWorld.wormholes : [];
  const instances = Array.isArray(rawWorld?.instances) ? rawWorld.instances : [];
  const savedPlace = typeof rawWorld?.place === "string" ? rawWorld.place : null;
  const out = [];
  for (const entry of saved) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id : null;
    if (!id || state.wormholes.has(id)) continue;
    const parent = typeof entry.parent === "string" ? entry.parent : null;
    if (!parent || !galaxy?.systemsById?.[parent]) continue;
    const doomed = entry.doomed === true;
    const instanceId = typeof entry.template === "string" && typeof entry.seed === "number"
      ? instanceIdFor(entry.template, entry.seed >>> 0) : null;
    // A faded wormhole nobody is standing in (or standing in its run) is unreachable — drop it.
    if (doomed && savedPlace !== id && savedPlace !== instanceId &&
        !instances.some(run => run && run.id === instanceId)) continue;
    const seed = entry.seed >>> 0;
    const record = {
      id,
      parent,
      template: typeof entry.template === "string" ? entry.template : "wh_smugglers",
      seed,
      tier: Math.max(1, Number(entry.tier) || 1),
      lifetime: Math.max(0, Number(entry.lifetime) || 0),
      totalLifetime: Math.max(0, Number(entry.totalLifetime) || 0),
      doomed,
      instanceId: instanceId || instanceIdFor("wh_smugglers", seed),
    };
    state.wormholes.set(id, record);
    galaxyInject(record, galaxy);
    registerWormholePlace(pocketRecord(record));
    out.push(record);
  }
  return out;
}

/**
 * Rebuild the saved wormholes for this session and fill the universe up to its standing population.
 * Call it **after** `applySave` (it reads `world.wormholes` and `world.place`) and before anything
 * enters a pocket. Returns how many wormholes hang in the universe.
 */
export function restoreWormholes() {
  if (restoredWorld && restoredWorld === state.worldState) return state.wormholes.size;
  // A load never keeps the wormholes of the save it replaces.
  const stale = [...state.wormholes.keys()];
  clearWormholes();
  const saved = Array.isArray(state.worldState.wormholes) ? state.worldState.wormholes : [];
  for (const run of saved) {
    if (!run || typeof run !== "object") continue;
    const instanceId = typeof run.template === "string" && typeof run.seed === "number"
      ? instanceIdFor(run.template, run.seed >>> 0) : null;
    // An id the game would not produce, or a parent the galaxy does not know, is dropped.
    if (!instanceId || wormholeIdFor(run.seed >>> 0) !== run.id) continue;
    if (!state.galaxy?.systemsById?.[run.parent]) continue;
    const savedPlace = typeof state.worldState.place === "string" ? state.worldState.place : null;
    const inInstance = savedPlace === instanceId
      || (Array.isArray(state.worldState.instances) && state.worldState.instances.some(r => r && r.id === instanceId));
    // A faded wormhole nobody is in or in its run is unreachable — it does not come back.
    if (run.doomed === true && savedPlace !== run.id && !inInstance) continue;
    const record = {
      id: run.id,
      parent: run.parent,
      template: run.template,
      seed: run.seed >>> 0,
      tier: Math.max(1, Number(run.tier) || 1),
      lifetime: Math.max(0, Number(run.lifetime) || 0),
      totalLifetime: Math.max(0, Number(run.totalLifetime) || 0),
      doomed: run.doomed === true,
      instanceId,
    };
    state.wormholes.set(record.id, record);
    galaxyInject(record);
    registerWormholePlace(pocketRecord(record));
  }
  // The universe insists on its standing population: first fill staggers the clocks so the
  // collapses never march in sync, replacements get the full clock (owner, 2026-11-14).
  topUpWormholes({ initial: stale.length === 0 });
  for (const record of state.wormholes.values()) {
    if (record && !record.doomed) ensureWormholeDoor(record);
  }
  restoreConnectionDoors();
  restoredWorld = state.worldState;
  return state.wormholes.size;
}

/* ------------------------------------------------------------------------- */
/* One tick of every live wormhole pocket: the clock                            */
/* ------------------------------------------------------------------------- */

/**
 * One tick of every live wormhole pocket: the clock. A wormhole whose clock ends fades (see
 * `doomWormhole`). The clock runs on simulation time, so pausing never burns one.
 *
 * Faded pockets linger only while somebody can still reach them — the local pilot in the pocket, in
 * its run, or warping towards it (owner rule proposal, 2026-11-14). Any other exit — warping out,
 * dying, docking — is caught here within a tick: nobody is in it any more, so the pocket goes.
 */
export function updateWormholes(dt) {
  tickConnections(dt);
  if (!(dt > 0) || !state.wormholes.size) return;
  for (const record of [...state.wormholes.values()]) {
    if (!record) continue;
    if (record.doomed) {
      if (!pocketOccupied(record)) removeWormhole(record);
      continue;
    }
    if (record.lifetime > 0) {
      record.lifetime -= dt;
      if (record.lifetime <= 0) doomWormhole(record);
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Event wiring                                                                 */
/* ------------------------------------------------------------------------- */

// The pilot warped into a wormhole pocket (or the run behind it ended): make sure the door is
// hanging there. `place-entered` is emitted for every pocket entry, so arriving at the pocket and
// leaving its instance through the Stable wormhole both land here. A faded pocket that just lost
// its last occupant is taken away by `updateWormholes` on the next tick, not by the warp.
on("place-entered", ({ id } = {}) => {
  if (typeof id !== "string") return;
  const record = state.wormholes.get(id);
  if (record && !record.doomed) ensureWormholeDoor(record);
});

// Dying inside a natural run ends the run at once (ordinary death rules) — and the way in fades
// with it, the same way a rift despawns: the pocket lingers only while the pilot is in it (they
// are, for the moment the death resolves), the door is gone, and a replacement pops up somewhere
// in the universe.
on("instance-closed", ({ id, reason } = {}) => {
  if (reason !== "death") return;
  for (const record of state.wormholes.values()) {
    if (record && record.instanceId === id) doomWormhole(record, { quiet: true });
  }
});
