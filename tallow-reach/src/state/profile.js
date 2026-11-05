// The persistent part of a game: credits, ships, base, contracts, and stats.
// Everything saved to disk goes through this file so old saves keep loading.

import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { KEYS, emptyCargo } from "../data/items.js";
import { BASE_DEFAULT, BASE_MODULES } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { CONTRACT_TYPES } from "../data/contracts.js";

// Version history:
//   1  original prototype (no "v" field)
//   2  adds "v"; otherwise identical shape
export const SAVE_VERSION = 2;

// A saved contract with a type not listed here is dropped on load, so this
// follows the contract definitions instead of keeping its own copy.
export const MISSION_TYPES = CONTRACT_TYPES;

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
