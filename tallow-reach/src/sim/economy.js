// Cargo, storage, the refinery, repairs and every purchase at the outpost.
// Each action changes state.profile directly and returns an optional
// message for the panel to show.

import { state } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { canSell, isItem, isModule, itemName, itemValue } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { MODULES } from "../data/modules.js";
import { isShop, shopDef, shopRow } from "../data/shops.js";
import { ownedCount } from "./fitting.js";
import { setShip } from "./player.js";
import { stockFor } from "../state/profile.js";
import {
  STATION, buyItem as buyInto, capacityOf, countOf, hasRoomFor, holdOf, loadOf, moveItem, stockOf,
  takeItem, unitsOf, valueOf,
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

/**
 * Sell everything in the flown ship's hold that has a value. Spare modules sell
 * too (they have a sell value like any item); only a part fitted in a bay stays
 * put, because a fitted part is in no hold. Returns the message for the panel.
 */
export function sellHold() {
  const p = S();
  const where = p.ship;
  const earned = valueOf(stockOf(where));
  const sold = countSaleable(where);
  if (!sold) return "Nothing in the hold can be sold.";
  p.cr += earned;
  for (const id of Object.keys(stockOf(where))) if (canSell(id)) takeItem(where, id, Infinity);
  return `Sold ${sold} ${sold === 1 ? "item" : "items"} for ${earned} cr.`;
}

/** Sell everything saleable in the station's storage. Returns the message. */
export function sellStored() {
  const p = S();
  const earned = valueOf(stockOf(STATION));
  const sold = countSaleable(STATION);
  if (!sold) return "Nothing in the station can be sold.";
  p.cr += earned;
  for (const id of Object.keys(stockOf(STATION))) if (canSell(id)) takeItem(STATION, id, Infinity);
  return `Sold ${sold} ${sold === 1 ? "item" : "items"} for ${earned} cr.`;
}

/** How many whole items at a place have a sell value — goods and spare parts alike. */
function countSaleable(where) {
  const stock = stockOf(where);
  let n = 0;
  for (const id of Object.keys(stock)) if (canSell(id)) n += stock[id];
  return n;
}

/** Sell `amount` of one item from the station's storage or a ship's hold — a good
 *  or a spare part; both have a sell value in the catalogue. */
export function sellInventoryItem(id, where, amount = null) {
  if (!canSell(id)) return "That cannot be sold.";
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

/**
 * How much of shop `shopId`'s row for item `id` is left, or `null` when that row
 * never runs out (no `max` in data/shops.js — every Meridian row today). The
 * count is made on first use and lives in `state.shops` (session only).
 */
export function shopStock(shopId, id) {
  const row = shopRow(shopId, id);
  if (!row || !(row.max > 0)) return null;
  const key = `${shopId}:${id}`;
  const shops = state.shops || (state.shops = {});
  if (!(key in shops)) shops[key] = Math.floor(row.max);
  return shops[key];
}

/**
 * Set how much of a limited row is left. This is the hook a restock timer, a
 * restock event or a random roll uses later; nothing needs saving today, so
 * buying from a fresh save always starts from the row's `max`.
 */
export function setShopStock(shopId, id, n) {
  const row = shopRow(shopId, id);
  if (!row || !(row.max > 0)) return;
  const shops = state.shops || (state.shops = {});
  shops[`${shopId}:${id}`] = Math.max(0, Math.floor(+n || 0));
}

/**
 * The rows the Shop tab draws for shop `shopId`: for sale, in data order, each
 * with what the screen needs and nothing it has to work out. Pure apart from
 * reading the limited rows' counts.
 *
 *   id, n, d     the row and the pitch, from data/shops.js
 *   price        credits for one
 *   vol          m³ one takes in the station's storage (purchases go there)
 *   owned        how many you already own (storage, any hold, any bay)
 *   left         how many more this shop has, or null when it never runs out
 *   room         is there room in the station's storage for one more?
 */
export function shopList(shopId) {
  return (shopDef(shopId).stock || []).map(row => {
    const id = row.id;
    const bought = isItem(id);
    return {
      id,
      n: row.n || (bought ? itemName(id) : String(id)),
      d: row.d || "",
      price: row.price,
      vol: bought ? (MODULES[id] ? MODULES[id].vol : 1) : 0,
      owned: bought && isModule(id) && row.own !== false ? ownedCount(id) : 0,
      left: shopStock(shopId, id),
      room: bought ? hasRoomFor(STATION, id) : false,
    };
  });
}

/**
 * Buy `qty` of shop `shopId`'s row for item `id`. This is the one purchase at
 * any outpost: the shop is data (data/shops.js), a purchase lands in the
 * station's inventory as a normal item (sim/inventory.js), and a launcher comes
 * with its missiles (the module's `ammo`). Returns a message for the panel, or
 * `undefined` when nothing could happen (unknown shop, unknown row, not enough
 * credits, a full station, a row sold out) — the Buy button is disabled in those
 * cases, so the player never reads it.
 */
export function buyItem(shopId, id, qty = 1) {
  const p = S();
  const row = shopRow(shopId, id);
  if (!isShop(shopId) || !row || !isItem(id)) return;
  const n = Math.max(1, Math.floor(+qty) || 1);
  const total = row.price * n;
  const left = shopStock(shopId, id);
  if (p.cr < total) return;
  if (left !== null && left < n) return;
  if (!hasRoomFor(STATION, id, n)) return `No room in the station for the ${row.n || itemName(id)}.`;
  // Everything is checked, so nothing below can fail half way: `buyInto` takes
  // the credits and stores the items together.
  buyInto(id, row.price, STATION, n);
  if (left !== null) setShopStock(shopId, id, left - n);
  const mod = MODULES[id];
  const ammo = (mod && mod.ammo) || 0;
  const gave = ammo > 0 && p.msl < ammo;
  if (gave) p.msl = ammo;
  const name = row.n || itemName(id);
  if (n > 1) return `${n} ${name} in the station inventory.`;
  // A module has to be fitted before it does anything; its bay group is the
  // module's own `g` (primary, secondary, ...), so the message needs no data.
  const bay = (mod && mod.g) || "primary";
  return `${name} in the station inventory.${mod ? ` Fit it in a ${bay} bay to use it.` : ""}${
    gave ? ` ${ammo} missiles included.` : ""
  }`;
}

export function restockMissiles() {
  const p = S();
  const cap = ((state.missiles || [])[0] || MODULES.missile_basic).cap,
    n = Math.min(cap - p.msl, Math.floor(p.cr / MISSILE.unitPrice));
  p.cr -= n * MISSILE.unitPrice;
  p.msl += n;
  return `Restocked ${n} missiles.`;
}
