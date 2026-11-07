// Cargo, storage, the refinery, repairs and every purchase at the outpost.
// Each action changes state.profile directly and returns an optional
// message for the panel to show.

import { state } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { canSell, isModule, itemName, itemValue } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE, SHOP_WEAPONS } from "../data/weapons.js";
import { MODULES } from "../data/modules.js";
import { setShip } from "./player.js";
import { stockFor } from "../state/profile.js";
import {
  STATION, buyItem, capacityOf, countOf, holdOf, loadOf, moveItem, stockOf, takeItem, unitsOf, valueOf,
} from "./inventory.js";
export { valueOf };   // the Base tab and the Inventory sell box both ask for it
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshHull, hullOf } from "./hull.js";
import { refreshGuns } from "./guns.js";

const S = () => state.profile;

/** m³ in use in the hold of the ship being flown: its ore plus any spare modules it carries. */
export const holdLoad = () => loadOf(S().ship);

/** m³ in use in the station's storage: ore plus spare modules. */
export const storedUnits = () => loadOf(STATION);

/** The station's storage capacity in m³. */
export const storageCap = () => capacityOf(STATION);

/** (Sell value lives in sim/inventory.js with the stock it prices; re-exported above.) */

/** Repair cost for a ship. Costs rise steeply with damage. Hull HP come from the
 *  fitted hull module — no module fitted means nothing to repair, and a free repair. */
export function repairCost(id) {
  const p = S();
  const frac = p.hp[id] ?? 1;
  const max = hullOf((p.loadout || {})[id]);
  if (max <= 0) return 0;
  const missing = max * (1 - frac);
  return Math.round(missing * (2 + (3 * missing) / max));
}

/**
 * Move every good in the flown ship's hold into the station (spare modules stay
 * put, as they always did: a part is moved in the Inventory tab if you want it
 * in storage).
 */
export function storeHold() {
  const p = S();
  const before = unitsOf(p.ship);
  for (const id of Object.keys(stockOf(p.ship))) {
    if (!isModule(id)) moveItem(p.ship, STATION, id, Infinity);
  }
  const moved = before - unitsOf(p.ship);
  return moved ? `Stored ${moved} units.` : "Storage is full.";
}

/** Load as much stored goods as fits into the flown ship's hold. */
export function withdrawStored() {
  const p = S();
  for (const id of Object.keys(stockOf(STATION))) {
    if (!isModule(id)) moveItem(STATION, p.ship, id, Infinity);
  }
}

/** Sell everything in the hold that has a value; spare modules stay in the ship. */
export function sellHold() {
  const p = S();
  const hold = stockOf(p.ship);
  p.cr += valueOf(hold);
  for (const id of Object.keys(hold)) if (canSell(id)) takeItem(p.ship, id, Infinity);
}

/** Sell everything saleable in the station's storage; spare modules stay there. */
export function sellStored() {
  const p = S();
  p.cr += valueOf(stockOf(STATION));
  for (const id of Object.keys(stockOf(STATION))) if (canSell(id)) takeItem(STATION, id, Infinity);
}

/** Sell `amount` of one item from the station's storage or a ship's hold. */
export function sellInventoryItem(id, where, amount = null) {
  if (!canSell(id)) return "Only cargo can be sold.";
  const p = S();
  const available = countOf(where, id);
  const count = amount === null ? available : amount;
  if (!Number.isInteger(count) || count < 1 || count > available) {
    return `Enter a whole number from 1 to ${available}.`;
  }
  // Same base value and refinery bonus as Base-tab selling.
  const value = Math.round(count * itemValue(id) * (1 + REFINERY_BONUS_PER_LEVEL * S().base.refinery));
  p.cr += value;
  takeItem(where, id, count);
  return `Sold ${count} ${itemName(id)} for ${value} cr.`;
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
  holdOf(id);                       // its own empty hold
  delete p.hp[id];
  p.loadout[id] = stockFor(id);   // comes with the stock modules fitted
}

export function selectShip(id) {
  const p = S();
  // Each ship has its own hold now, so cargo stays with the ship it is in and
  // nothing has to fit before you can switch.
  p.ship = id;
  setShip(id);
  refillPower();       // docked: the new hull's cells are full
  refreshDrive();      // and its thrusters decide the way it flies
  refreshShield();     // and its shields how much punishment it takes
  refreshGuns();       // and its primary bays what fires
  refreshHull();       // and its Hull HP
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
  const w = SHOP_WEAPONS[k];
  if (!w || p.cr < w.price) return;
  // The mining beam and the missiles are modules: buying one puts it in the
  // station's inventory (as many as you like, as long as there is room), and it
  // has to be fitted in a bay at Outfitting before it does anything.
  if (w.module) {
    const refusal = buyItem(w.module, w.price);
    if (refusal) return refusal;
    const gave = w.startStock && (p.msl || 0) < w.startStock;
    if (gave) p.msl = w.startStock;
    return `${w.n} in the station inventory. Fit it in a ${w.bay || "primary"} bay to use it.${gave ? ` ${w.startStock} missiles included.` : ""}`;
  }
  p.cr -= w.price;
  return `${w.n} installed.`;
}

export function restockMissiles() {
  const p = S();
  const cap = ((state.missiles || [])[0] || MODULES.missile_basic).cap,
    n = Math.min(cap - p.msl, Math.floor(p.cr / MISSILE.unitPrice));
  p.cr -= n * MISSILE.unitPrice;
  p.msl += n;
  return `Restocked ${n} missiles.`;
}
