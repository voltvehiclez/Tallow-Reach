// Cargo, storage, the refinery, repairs and every purchase at the outpost.
// Each action changes state.profile directly and returns an optional
// message for the panel to show.

import { state } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { ITEM, KEYS, emptyCargo } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE, SHOP_WEAPONS } from "../data/weapons.js";
import { MODULES } from "../data/modules.js";
import { setShip } from "./player.js";
import { stockFor } from "../state/profile.js";
import { STATION, cargoOf, holdOf, loadOf, capacityOf, buyModule, moveCargo } from "./inventory.js";
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

/** Sell value of a cargo object, including the refinery bonus. */
export function valueOf(cargo) {
  const base = KEYS.reduce((sum, k) => sum + cargo[k] * ITEM[k].v, 0);
  return Math.round(base * (1 + REFINERY_BONUS_PER_LEVEL * S().base.refinery));
}

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

/** Move all the ore in the flown ship's hold into the station (spare modules stay put). */
export function storeHold() {
  const p = S();
  const before = KEYS.reduce((sum, k) => sum + cargoOf(p.ship)[k], 0);
  for (const k of KEYS) moveCargo(p.ship, STATION, k);
  const moved = before - KEYS.reduce((sum, k) => sum + cargoOf(p.ship)[k], 0);
  return moved ? `Stored ${moved} units.` : "Storage is full.";
}

/** Load as much stored ore as fits into the flown ship's hold. */
export function withdrawStored() {
  const p = S();
  for (const k of KEYS) moveCargo(STATION, p.ship, k);
}

export function sellHold() {
  const p = S();
  const hold = cargoOf(p.ship);
  p.cr += valueOf(hold);
  KEYS.forEach(k => (hold[k] = 0));
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
    const refusal = buyModule(w.module, w.price);
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
