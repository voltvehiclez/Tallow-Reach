// Cargo, storage, the refinery, repairs and every purchase at the outpost.
// Each action changes state.profile directly and returns an optional
// message for the panel to show.

import { state } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { ITEM, KEYS, emptyCargo } from "../data/items.js";
import { BASE_MODULES, STORAGE_PER_LEVEL, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE, SHOP_WEAPONS } from "../data/weapons.js";
import { setShip } from "./player.js";

const S = () => state.profile;

/** Units currently in the hold. */
export const holdLoad = () => KEYS.reduce((sum, k) => sum + S().cargo[k], 0);

/** Units in the station store. */
export const storedUnits = () => KEYS.reduce((sum, k) => sum + S().store[k], 0);

/** Storage capacity in units. */
export const storageCap = () => STORAGE_PER_LEVEL * S().base.store;

/** Sell value of a cargo object, including the refinery bonus. */
export function valueOf(cargo) {
  const base = KEYS.reduce((sum, k) => sum + cargo[k] * ITEM[k].v, 0);
  return Math.round(base * (1 + REFINERY_BONUS_PER_LEVEL * S().base.refinery));
}

/** Repair cost for a ship. Costs rise steeply with damage. */
export function repairCost(id) {
  const frac = S().hp[id] ?? 1;
  const max = SHIPS[id].hull;
  const missing = max * (1 - frac);
  return Math.round(missing * (2 + (3 * missing) / max));
}

export function storeHold() {
  const p = S();
  let moved = 0;
  for (const k of KEYS) {
    const t = Math.min(p.cargo[k], storageCap() - storedUnits());
    p.cargo[k] -= t;
    p.store[k] += t;
    moved += t;
  }
  return moved ? `Stored ${moved} units.` : "Storage is full.";
}

export function withdrawStored() {
  const p = S();
  for (const k of KEYS) {
    const t = Math.min(p.store[k], SHIPS[p.ship].cargo - holdLoad());
    p.store[k] -= t;
    p.cargo[k] += t;
  }
}

export function sellHold() {
  const p = S();
  p.cr += valueOf(p.cargo);
  p.cargo = emptyCargo();
}

export function sellStored() {
  const p = S();
  p.cr += valueOf(p.store);
  p.store = emptyCargo();
}

export function upgradeBase(mod) {
  const p = S();
  const mdef = BASE_MODULES[mod];
  const cost = mdef.cost(p.base[mod]);
  if (p.base[mod] >= mdef.max || p.cr < cost) return;
  p.cr -= cost;
  p.base[mod]++;
}

export function buyShip(id) {
  const p = S();
  const price = SHIPS[id].price;
  if (p.cr < price || p.ships.length >= p.base.hangar + 1) return;
  p.cr -= price;
  p.ships.push(id);
  delete p.hp[id];
}

export function selectShip(id) {
  const p = S();
  if (holdLoad() > SHIPS[id].cargo) return "Store your cargo first. It will not fit in that ship.";
  p.ship = id;
  setShip(id);
  return undefined;
}

export function repairShip(id) {
  const p = S();
  const c = repairCost(id);
  if (p.cr < c || c <= 0) return;
  p.cr -= c;
  p.hp[id] = 1;
  if (id === p.ship) state.player.hull = state.player.hullMax;
  return `${SHIPS[id].n} repaired for ${c} cr.`;
}

export function buyWeapon(k) {
  const p = S();
  const price = SHOP_WEAPONS[k].price;
  if (p.cr < price) return;
  p.cr -= price;
  p.wp[k] = true;
  if (k === "msl") p.msl = Math.max(p.msl, MISSILE.startStock);
  return k === "beam"
    ? "Mining beam installed. Press 2 in flight to equip it."
    : `Missile launcher installed with ${MISSILE.startStock} missiles.`;
}

export function restockMissiles() {
  const p = S();
  const n = Math.min(MISSILE.cap - p.msl, Math.floor(p.cr / MISSILE.unitPrice));
  p.cr -= n * MISSILE.unitPrice;
  p.msl += n;
  return `Restocked ${n} missiles.`;
}
