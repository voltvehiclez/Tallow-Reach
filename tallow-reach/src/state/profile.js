// The persistent part of a game: credits, ships, base, contracts, and stats.
// Everything saved to disk goes through this file so old saves keep loading.

import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { KEYS, emptyCargo } from "../data/items.js";
import { BASE_DEFAULT, BASE_MODULES } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { CONTRACT_TYPES } from "../data/contracts.js";
import { MODULES, STOCK_FIT } from "../data/modules.js";
import { layoutFor } from "../data/outfitting.js";

// Version history:
//   1  original prototype (no "v" field)
//   2  adds "v"; otherwise identical shape
//   3  adds "loadout": the modules fitted to each hull, bay by bay. Older saves
//      get the stock fit for their bays (stockFor), so nothing is lost.
//   4  adds "modules": the parts held in storage, ready to be fitted. Older
//      saves simply start with an empty store.
export const SAVE_VERSION = 4;

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

/** A stock fit for every hull the game knows. */
function allStockFit() {
  const out = {};
  for (const id of Object.keys(SHIPS)) out[id] = stockFor(id);
  return out;
}

export function newProfile() {
  return {
    v: SAVE_VERSION,
    cr: 600,
    cargo: emptyCargo(),
    store: emptyCargo(),
    ships: [DEFAULT_SHIP],
    ship: DEFAULT_SHIP,
    base: { ...BASE_DEFAULT },
    mission: null,
    done: 0,           // contracts completed
    kills: 0,
    wp: { beam: false, msl: false },
    msl: 0,            // missiles carried
    pw: "cannon",      // equipped primary
    hp: { [DEFAULT_SHIP]: 1 },   // hull fraction per owned ship (1 = intact)
    loadout: allStockFit(),      // fitted modules per hull, group -> bay array
    modules: [],                 // spare parts in storage, ready to be fitted
  };
}

/**
 * Validates and fills in a raw save object. Throws if it is not recognisable.
 * Used for autosaves, save slots and imported codes alike.
 */
export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.ships)) {
    throw new Error("not a Tallow Reach save");
  }
  const s = Object.assign(newProfile(), raw);

  s.cr = Math.max(0, +s.cr || 0);
  s.ships = s.ships.filter(id => SHIPS[id]);
  if (!SHIPS[s.ship]) s.ship = s.ships[0] || DEFAULT_SHIP;

  for (const key of ["cargo", "store"]) {
    const src = s[key] || {};
    const clean = emptyCargo();
    KEYS.forEach(k => (clean[k] = Math.max(0, +src[k] || 0)));
    s[key] = clean;
  }

  const base = s.base || {};
  s.base = {
    store: clampLevel(base.store, 1, BASE_MODULES.store.max),
    hangar: clampLevel(base.hangar, 1, BASE_MODULES.hangar.max),
    refinery: clampLevel(base.refinery, 0, BASE_MODULES.refinery.max),
  };

  s.wp = Object.assign({ beam: false, msl: false }, s.wp || {});
  s.msl = Math.max(0, Math.min(MISSILE.cap, +s.msl || 0));
  if (s.pw !== "beam") s.pw = "cannon";

  const hp = {};
  for (const id of s.ships) {
    const v = +(s.hp || {})[id];
    hp[id] = v > 0 && v <= 1 ? v : 1;
  }
  s.hp = hp;

  s.loadout = cleanLoadouts(raw.loadout);
  s.modules = cleanStorage(raw.modules);

  s.done = +s.done || 0;
  s.kills = +s.kills || 0;
  if (s.mission && !MISSION_TYPES.includes(s.mission.type)) s.mission = null;

  // Lost every ship and cannot afford another: the station lends a Wasp.
  if (!s.ships.length && s.cr < SHIPS.wasp.price) {
    s.ships = [DEFAULT_SHIP];
    s.ship = DEFAULT_SHIP;
  }

  s.v = SAVE_VERSION;
  return s;
}

function clampLevel(value, lo, hi) {
  return Math.min(hi, Math.max(lo, +value || lo));
}

/** Parts held in storage: known ids only, in the order they were stored. */
function cleanStorage(raw) {
  return Array.isArray(raw) ? raw.filter(id => MODULES[id]) : [];
}

/**
 * Rebuild every hull's loadout from a save. Unknown modules are dropped, a bay
 * beyond the hull's layout is dropped, and a hull with no saved loadout (an old
 * save, or a hull added in an update) gets the stock fit. A bay the player has
 * really left empty stays empty: only a missing hull or group falls back.
 */
function cleanLoadouts(saved) {
  const out = {};
  for (const id of Object.keys(SHIPS)) {
    const layout = layoutFor(id),
      stock = stockFor(id),
      forShip = saved && saved[id];
    const fit = {};
    for (const [g, slots] of Object.entries(layout)) {
      const src = forShip && Array.isArray(forShip[g]) ? forShip[g] : stock[g];
      fit[g] = Array.from({ length: slots }, (_, i) => {
        const m = src[i];
        return MODULES[m] && MODULES[m].g === g ? m : null;
      });
    }
    out[id] = fit;
  }
  return out;
}
