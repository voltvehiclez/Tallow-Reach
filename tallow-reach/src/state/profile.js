// The persistent part of a game: credits, ships, base, contracts, and stats.
// Everything saved to disk goes through this file so old saves keep loading.

import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { KEYS, emptyCargo } from "../data/items.js";
import { BASE_DEFAULT, BASE_MODULES } from "../data/station.js";
import { CONTRACT_TYPES } from "../data/contracts.js";
// The missile capacity comes from the launcher module; one source of truth.
import { MODULES, STOCK_FIT } from "../data/modules.js";
import { layoutFor } from "../data/outfitting.js";

// Version history:
//   1  original prototype (no "v" field)
//   2  adds "v"; otherwise identical shape
//   3  adds "loadout": the modules fitted to each hull, bay by bay. Older saves
//      get the stock fit for their bays (stockFor), so nothing is lost.
//   4  adds "modules": the parts held in storage, ready to be fitted. Older
//      saves simply start with an empty store.
//   5  the basic thrusters are standard issue. Saves from before 5 have their
//      empty thruster bay filled on load (they were made before thrusters
//      existed, so the bay was never a choice).
//   6  the basic shields are standard issue, the same way: saves from before 6
//      get their shield bay filled on load, and a v6 save where the player
//      emptied it stays shieldless.
//   7  the basic cannons are standard issue in the first primary bay. Saves from
//      before 7 gain them on load; weapon bays the player really left empty stay
//      empty from version 7 onwards.
//   8  the mining beam is a module (beam_basic) instead of the wp.beam flag. Saves
//      from before 8 whose owner had bought the beam get one beam_basic module in
//      storage instead; it is not auto-fitted — fit it in a primary bay. The shop
//      sells the module now. The wp.beam flag is gone from the save.
//   9  the missile launcher is a module (missile_basic) instead of the wp.msl
//      flag. Saves from before 9 whose owner had bought it get one missile_basic
//      module in storage instead; it is not auto-fitted — fit it in a secondary
//      bay. The Shop sells the module now. The whole wp object is gone from the
//      save. Missiles carried (msl) stay, clamped by the launcher's capacity.
//   10 the hull is a module (hull_basic) instead of the hull's built-in hit
//      Hull HP: the fitted module decides how many Hull HP the ship has, and
//      no module fitted means none — any hit reaching the hull kills the ship.
//      Saves from before 10 get hull_basic fitted into their hull bay (the bay
//      existed but could not hold anything), like the thrusters, shields and
//      cannons before it. A v10 save where the player emptied the bay stays
//      hull-less — a one-shot kill waiting to happen.
//   11 inventory. Every ship has its own hold, `holds[shipId] = { cargo, modules }`:
//      the ore it carries and the spare modules it hauls, together limited by the
//      hull's size in m³. This replaces the single `cargo` object, which belonged to
//      whichever ship was being flown. Saves from before 11 hand their `cargo` to the
//      ship they were flying; every other ship starts with an empty hold. The station
//      keeps `store` (ore) and `modules` (parts) as before, but both now count in m³
//      against the station's storage (data/station.js) and `modules` can be many of
//      the same part.
export const SAVE_VERSION = 11;

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

/** An empty hold: no ore, no spare modules. One per owned ship (`profile.holds`). */
export const newHold = () => ({ cargo: emptyCargo(), modules: [] });

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
    holds: { [DEFAULT_SHIP]: newHold() },   // per ship: { cargo, modules } carried in its hold
    store: emptyCargo(),               // ore in the station's storage
    ships: [DEFAULT_SHIP],
    ship: DEFAULT_SHIP,
    base: { ...BASE_DEFAULT },
    mission: null,
    done: 0,           // contracts completed
    kills: 0,
    msl: 0,            // missiles carried
    pw: "cannon",      // equipped primary
    hp: { [DEFAULT_SHIP]: 1 },   // hull fraction per owned ship (1 = intact)
    loadout: allStockFit(),      // fitted modules per hull, group -> bay array
    modules: [],                 // spare parts in the station's storage, ready to be fitted
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

  s.store = cleanCargo(s.store);

  const base = s.base || {};
  s.base = {
    store: clampLevel(base.store, 1, BASE_MODULES.store.max),
    hangar: clampLevel(base.hangar, 1, BASE_MODULES.hangar.max),
    refinery: clampLevel(base.refinery, 0, BASE_MODULES.refinery.max),
  };

  // The beam flag left the save in version 8, the missile flag in version 9:
  // whether the player owns those weapons is now "does modules storage or a bay
  // hold the module" (see ownsModule). The whole wp object is gone from the save.
  const hadOldBeam = !!((raw.wp || {}).beam);
  const hadOldLauncher = !!((raw.wp || {}).msl);
  delete s.wp;
  s.msl = Math.max(0, Math.min(MODULES.missile_basic.cap, +s.msl || 0));
  if (s.pw !== "beam") s.pw = "cannon";

  const hp = {};
  for (const id of s.ships) {
    const v = +(s.hp || {})[id];
    hp[id] = v > 0 && v <= 1 ? v : 1;
  }
  s.hp = hp;

  const rawVersion = +raw.v || 1;
  s.loadout = cleanLoadouts(raw.loadout, rawVersion);
  s.modules = cleanStorage(raw.modules);
  // v8: the old beam purchase becomes one Basic mining beam module in storage.
  // Not auto-fitted — the player fits it in a primary bay like any other module.
  if (rawVersion < 8 && hadOldBeam && !s.modules.includes("beam_basic")) s.modules.push("beam_basic");
  // v9: the old missile launcher purchase becomes one Basic missiles module in
  // storage. Not auto-fitted — the player fits it in a secondary bay.
  if (rawVersion < 9 && hadOldLauncher && !s.modules.includes("missile_basic")) s.modules.push("missile_basic");

  s.done = +s.done || 0;
  s.kills = +s.kills || 0;
  if (s.mission && !MISSION_TYPES.includes(s.mission.type)) s.mission = null;

  // Lost every ship and cannot afford another: the station lends a Wasp.
  if (!s.ships.length && s.cr < SHIPS.wasp.price) {
    s.ships = [DEFAULT_SHIP];
    s.ship = DEFAULT_SHIP;
  }

  // v11: every ship has its own hold. A save from before that carried one `cargo`
  // object for the ship being flown, so that ship gets it.
  const oldCargo = raw.holds ? null : raw.cargo;
  delete s.cargo;
  s.holds = cleanHolds(raw.holds, s.ships);
  if (oldCargo && s.holds[s.ship]) s.holds[s.ship].cargo = cleanCargo(oldCargo);

  s.v = SAVE_VERSION;
  return s;
}

/** Ore counts: known items only, never negative. */
function cleanCargo(src) {
  const out = emptyCargo();
  KEYS.forEach(k => (out[k] = Math.max(0, +((src || {})[k]) || 0)));
  return out;
}

/** One hold per owned ship; unknown parts and damaged shapes are dropped. */
function cleanHolds(raw, ships) {
  const out = {};
  for (const id of ships) {
    const h = raw && typeof raw === "object" ? raw[id] : null;
    out[id] = { cargo: cleanCargo(h && h.cargo), modules: cleanStorage(h && h.modules) };
  }
  return out;
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
function cleanLoadouts(saved, version) {
  // Modules arrived over several versions, and a save older than the version that
  // introduced a group has an empty bay because the group did not exist then, not
  // because the player emptied it. Those bays get the stock part.
  //   version 5: thrusters      version 6: shields      version 7: cannons
  // The hull bay is the same story as the others, from version 10: before the
  // hull module existed the bay was empty for lack of anything to fit, not by
  // choice. Saves from before 10 get the stock hull fitted.
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
