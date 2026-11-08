// The persistent part of a game, split in save v13 into:
//   - `profile`: portable character data (credits, ships, loadouts, holds, hull damage,
//     missiles carried, selected weapon, active mission and stats)
//   - `world`: hosted world data (station levels and storage, contract board,
//     galaxy and current pocket)
// Everything saved to disk goes through this file so older saves and export codes keep loading.

import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { isItem, isModule, newStock } from "../data/items.js";
import { BASE_DEFAULT, BASE_MODULES } from "../data/station.js";
import { CONTRACT_TYPES } from "../data/contracts.js";
import { MODULES, STOCK_FIT } from "../data/modules.js";
import { layoutFor } from "../data/outfitting.js";
import { PLACES, DEFAULT_PLACE, isPocket, PLACE_EXTENT } from "../data/places.js";

// Version history:
//   1  original prototype (no "v" field)
//   2  adds "v"; otherwise identical shape
//   3  adds "loadout": the modules fitted to each hull, bay by bay
//   4  adds "modules": the parts held in storage, ready to be fitted
//   5  basic thrusters become standard issue (auto-filled for < v5)
//   6  basic shields become standard issue (auto-filled for < v6)
//   7  basic cannons become standard issue in primary bay 0 (auto-filled for < v7)
//   8  mining beam becomes module `beam_basic` (wp.beam -> stored `beam_basic`)
//   9  missile launcher becomes module `missile_basic` (wp.msl -> stored `missile_basic`)
//   10 hull becomes module `hull_basic` (auto-filled for < v10)
//   11 per-ship holds `holds[shipId] = { cargo, modules }`
//   12 item catalogue (`data/items.js`): every place is `{ itemId: count }`
//   13 save split into portable `profile` and per-world `world` (`{ v: 13, profile, world }`);
//      `sanitizeWorld` walks `BASE_MODULES` rather than naming base modules by hand.
//   14 world.sector becomes world.place (a pocket id from data/places.js); v13 and
//      older sector ids migrate where valid, otherwise the starting pocket.
//   15 adds `world.resume`: null while docked, otherwise the exact spot the local
//      pilot was flying at (`pos`, `quat`) with their shield/boost levels. v14 and
//      older saves have none, so they keep the old behaviour (dock if the pocket
//      has a station, else fly in at the arrival point).
export const SAVE_VERSION = 15;

// A saved contract with a type not listed here is dropped on load, so this
// follows the contract definitions instead of keeping its own copy.
export const MISSION_TYPES = CONTRACT_TYPES;

/**
 * The modules hull `shipId` is delivered with: one entry per bay, `null` where
 * the bay is empty. Bay counts come from the hull's layout.
 */
export function stockFor(shipId) {
  const layout = layoutFor(shipId);
  const fit = {};
  for (const [g, slots] of Object.entries(layout)) {
    const list = Array.from({ length: slots }, () => null);
    (STOCK_FIT[g] || []).slice(0, slots).forEach((mod, i) => (list[i] = mod));
    fit[g] = list;
  }
  return fit;
}

/** An empty hold: nothing carried. One per owned ship (`profile.holds`). */
export const newHold = () => newStock();

/** A stock fit for every hull the game knows. */
function allStockFit() {
  const out = {};
  for (const id of Object.keys(SHIPS)) out[id] = stockFor(id);
  return out;
}

/** Fresh portable character profile (travels with a pilot across worlds). */
export function newProfile() {
  return {
    v: SAVE_VERSION,
    cr: 600,
    holds: { [DEFAULT_SHIP]: newHold() },   // per ship: { itemId: count } in its hold
    ships: [DEFAULT_SHIP],
    ship: DEFAULT_SHIP,
    mission: null,
    done: 0,           // contracts completed
    kills: 0,
    msl: 0,            // missiles carried
    pw: "cannon",      // equipped primary
    hp: { [DEFAULT_SHIP]: 1 },   // hull fraction per owned ship (1 = intact)
    loadout: allStockFit(),      // fitted modules per hull, group -> bay array
  };
}

/** Fresh hosted world record (station levels and storage, contract board, galaxy and current pocket). */
export function newWorld() {
  return {
    v: SAVE_VERSION,
    base: { ...BASE_DEFAULT },
    store: newStock(),
    board: [],
    galaxy: null,
    place: DEFAULT_PLACE,
    resume: null,      // null = docked; { pos, quat, sh, en } = flying at that spot
  };
}

/** Fresh combined save (`{ v, profile, world }`). */
export function newSave() {
  return {
    v: SAVE_VERSION,
    profile: newProfile(),
    world: newWorld(),
  };
}

/** Validate one contract (active `profile.mission` or an offer in `world.board`). */
function cleanContract(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!MISSION_TYPES.includes(raw.type)) return null;
  if (raw.o !== undefined && !isItem(raw.o)) return null;
  const n = Math.max(1, Math.floor(+raw.n || 1));
  const r = Math.max(0, Math.floor(+raw.r || 0));
  const tier = Math.max(1, Math.floor(+raw.tier || 1));
  const p = Math.max(0, Math.min(n, Math.floor(+raw.p || 0)));
  return { ...raw, tier, n, r, p };
}

/**
 * Validate and upgrade a character `profile` (either a standalone v13 profile
 * or a legacy v1..v12 flat save). World fields (`base`, `store`, `board`,
 * `galaxy`, `place`) are excluded here and handled by `sanitizeWorld`.
 */
export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.ships)) {
    throw new Error("not a Tallow Reach save");
  }
  const rawVersion = +raw.v || 1;
  const oldShape = rawVersion < 12;

  const cr = Math.max(0, Math.floor(+raw.cr || 0));
  let ships = [...new Set(raw.ships.filter(id => SHIPS[id]))];
  let ship = ships.includes(raw.ship) ? raw.ship : ships[0] || DEFAULT_SHIP;

  // Lost every ship and cannot afford another: the station lends a Wasp.
  if (!ships.length && cr < SHIPS.wasp.price) {
    ships = [DEFAULT_SHIP];
    ship = DEFAULT_SHIP;
  }

  const msl = Math.max(0, Math.min(MODULES.missile_basic.cap, Math.floor(+raw.msl || 0)));
  const pw = raw.pw === "beam" ? "beam" : "cannon";

  const hp = {};
  const rawHp = raw.hp && typeof raw.hp === "object" ? raw.hp : {};
  for (const id of ships) {
    const v = +rawHp[id];
    hp[id] = v > 0 && v <= 1 ? v : 1;
  }

  const loadout = cleanLoadouts(raw.loadout, rawVersion);

  // v11: every ship has its own hold. A save from before that carried one `cargo`
  // object for the ship being flown, so that ship gets it.
  const oldCargo = raw.holds ? null : raw.cargo;
  const holds = cleanHolds(raw.holds, ships, oldShape);
  if (oldCargo && holds[ship]) mergeStock(holds[ship], cleanStock(oldCargo));

  const done = Math.max(0, Math.floor(+raw.done || 0));
  const kills = Math.max(0, Math.floor(+raw.kills || 0));
  const mission = cleanContract(raw.mission);

  return {
    v: SAVE_VERSION,
    cr,
    holds,
    ships,
    ship,
    mission,
    done,
    kills,
    msl,
    pw,
    hp,
    loadout,
  };
}

/**
 * Validate a saved resume point. Returns null (meaning "docked, or no spot
 * saved") for anything missing, non-finite, the wrong shape, or implausibly far
 * from the pocket origin — a damaged or hand-edited save must never place the
 * ship somewhere it cannot fly back from.
 */
function cleanResume(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const vec = (a, n) =>
    Array.isArray(a) && a.length === n && a.every(v => typeof v === "number" && Number.isFinite(v))
      ? a.slice()
      : null;
  const pos = vec(raw.pos, 3);
  if (!pos || pos.some(v => Math.abs(v) > PLACE_EXTENT)) return null;
  let quat = vec(raw.quat, 4);
  if (quat) {
    const len = Math.hypot(...quat);
    if (len <= 1e-6) quat = [0, 0, 0, 1];
    else if (Math.abs(len - 1) > 1e-6) quat = quat.map(v => v / len);
  }
  const num = v => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return { pos, quat: quat || [0, 0, 0, 1], sh: num(raw.sh), en: num(raw.en) };
}

/**
 * Validate and upgrade a `world` record (either a v13 world object or the
 * world-owned fields of a legacy v1..v12 flat save). Base modules are walked
 * from `BASE_MODULES` rather than named by hand.
 */
export function sanitizeWorld(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("not a Tallow Reach save");
  }
  const isLegacyFlat = Array.isArray(raw.ships);
  const rawVersion = typeof raw.v === "number" ? raw.v : isLegacyFlat ? 1 : SAVE_VERSION;
  const oldShape = rawVersion < 12;

  const rb = raw.base && typeof raw.base === "object" ? raw.base : {};
  const base = {};
  for (const [id, m] of Object.entries(BASE_MODULES)) {
    const lo = BASE_DEFAULT[id] ?? 0;
    base[id] = clampLevel(rb[id], lo, m.max);
  }

  // Station storage (`store` since v1; loose `modules` list poured in for < v12;
  // unlocked `wp.beam` / `wp.msl` granted as a stored module for < v8 / < v9).
  const store = cleanStock(raw.store);
  if (oldShape) for (const id of cleanModuleList(raw.modules)) addToStock(store, id, 1);
  const hadOldBeam = !!((raw.wp || {}).beam);
  const hadOldLauncher = !!((raw.wp || {}).msl);
  if (rawVersion < 8 && hadOldBeam && !store.beam_basic) addToStock(store, "beam_basic", 1);
  if (rawVersion < 9 && hadOldLauncher && !store.missile_basic) addToStock(store, "missile_basic", 1);

  const board = Array.isArray(raw.board) ? raw.board.map(cleanContract).filter(Boolean) : [];
  const galaxy =
    raw.galaxy && typeof raw.galaxy === "object" && !Array.isArray(raw.galaxy)
      ? JSON.parse(JSON.stringify(raw.galaxy))
      : null;
  // v14: current pocket. v13 and older saves stored the same ids as `sector`.
  const place = typeof raw.place === "string" && isPocket(raw.place)
    ? raw.place
    : typeof raw.sector === "string" && isPocket(raw.sector)
      ? raw.sector
      : DEFAULT_PLACE;

  return {
    v: SAVE_VERSION,
    base,
    store,
    board,
    galaxy,
    place,
    resume: cleanResume(raw.resume),
  };
}

/**
 * Validate and upgrade a complete save. Accepts both the v13 split shape
 * `{ v: 13, profile, world }` and any legacy v1..v12 flat save object.
 */
export function sanitizeSave(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("not a Tallow Reach save");
  }
  if (raw.profile && typeof raw.profile === "object") {
    return {
      v: SAVE_VERSION,
      profile: sanitizeProfile(raw.profile),
      world: sanitizeWorld(raw.world && typeof raw.world === "object" ? raw.world : {}),
    };
  }
  if (Array.isArray(raw.ships)) {
    return {
      v: SAVE_VERSION,
      profile: sanitizeProfile(raw),
      world: sanitizeWorld(raw),
    };
  }
  throw new Error("not a Tallow Reach save");
}

/**
 * Extract a deep-cloned portable `profile` from `save` — the half a guest
 * carries into someone else's hosted world (credits, ships, loadouts, holds,
 * hull damage, missiles, active mission and stats, with zero station/world data).
 */
export function portableProfile(save) {
  const clean = sanitizeSave(save);
  return sanitizeProfile(JSON.parse(JSON.stringify(clean.profile)));
}

/**
 * Return a new save that merges an updated portable `profile` back into `save`
 * while keeping `save`'s own `world` (station levels, station storage, board,
 * galaxy, current pocket and resume point) untouched. Pure: neither input is mutated.
 */
export function mergeProfile(save, profile) {
  const cleanSave = sanitizeSave(save);
  const cleanProfile = sanitizeProfile(JSON.parse(JSON.stringify(profile)));
  const cleanWorld = sanitizeWorld(JSON.parse(JSON.stringify(cleanSave.world)));
  return {
    v: SAVE_VERSION,
    profile: cleanProfile,
    world: cleanWorld,
  };
}

/**
 * A stock — `{ itemId: count }` — as a save keeps it: known items only, whole
 * counts, and no entry for something that is not there.
 */
function cleanStock(src) {
  const out = newStock();
  if (!src || typeof src !== "object" || Array.isArray(src)) return out;
  for (const [id, n] of Object.entries(src)) {
    const count = Math.floor(+n || 0);
    if (isItem(id) && count > 0) out[id] = count;
  }
  return out;
}

/** Add `n` of `id` to a stock, whatever the room: a save is not a purchase. */
function addToStock(stock, id, n = 1) {
  if (!isItem(id) || !(n > 0)) return stock;
  stock[id] = (stock[id] || 0) + n;
  return stock;
}

/** Add every count of `src` to `stock`. */
function mergeStock(stock, src) {
  for (const [id, n] of Object.entries(src || {})) addToStock(stock, id, n);
  return stock;
}

/** An old `modules` list: real module ids only, in the order they were stored. */
function cleanModuleList(raw) {
  return Array.isArray(raw) ? raw.filter(id => isModule(id)) : [];
}

/**
 * One hold per owned ship. Before version 12 a hold was `{ cargo, modules }`
 * (goods and a list of parts); both are poured into the one stock now.
 */
function cleanHolds(raw, ships, oldShape) {
  const out = {};
  for (const id of ships) {
    const h = raw && typeof raw === "object" ? raw[id] : null;
    const stock = cleanStock(oldShape && h ? h.cargo : h);
    if (oldShape && h) for (const m of cleanModuleList(h.modules)) addToStock(stock, m, 1);
    out[id] = stock;
  }
  return out;
}

function clampLevel(value, lo, hi) {
  const n = value === undefined || value === null ? lo : Math.floor(+value || 0);
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Rebuild every hull's loadout from a save. Unknown modules are dropped, a bay
 * beyond the hull's layout is dropped, and a hull with no saved loadout (an old
 * save, or a hull added in an update) gets the stock fit. A bay the player has
 * really left empty stays empty: only a missing hull or group falls back.
 */
function cleanLoadouts(saved, version) {
  const addedLater = [];
  if (version < 5) addedLater.push("thruster");
  if (version < 6) addedLater.push("shield");
  if (version < 7) addedLater.push("primary");
  if (version < 10) addedLater.push("hull");
  const out = {};
  for (const id of Object.keys(SHIPS)) {
    const layout = layoutFor(id),
      stock = stockFor(id),
      forShip = saved && saved[id];
    const fit = {};
    for (const [g, slots] of Object.entries(layout)) {
      const src =
        addedLater.includes(g) || !forShip || !Array.isArray(forShip[g]) ? stock[g] : forShip[g];
      fit[g] = Array.from({ length: slots }, (_, i) => {
        const m = src[i];
        return MODULES[m] && MODULES[m].g === g ? m : null;
      });
    }
    out[id] = fit;
  }
  return out;
}
