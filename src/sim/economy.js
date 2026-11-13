// Cargo, storage, the refinery, repairs and every purchase at a dockable station.
// Station levels (`base`) and station-local storage (`stationStores`) belong to
// `world` (`state.worldState`); `world.store` is the backward-compatible home
// alias. Credits, ships, holds, hull damage, loadouts and missiles belong to
// `profile` (`state.profile` by default, or an explicit pilot's `profile`).

import { state, profileOf } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { canSell, isItem, isModule, itemName, itemValue } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { MODULES } from "../data/modules.js";
import { isShop, shopDef, shopRow } from "../data/shops.js";
import { ownedCount } from "./fitting.js";
import { setShip } from "./player.js";
import { addShipRecords, ensureShipRecords } from "../state/profile.js";
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

function assertEconomyPilot(P, profile) {
  if (P && P !== state.player && (!profile || profile === state.profile)) {
    throw new Error("Non-local economy action requires its own profile");
  }
}

/** m³ in use in the hold of the ship being flown: its ore plus any spare modules it carries. */
export const holdLoad = (profile = state.profile) => loadOf(profile.ship, profile);

/** m³ in use in the station's storage: ore plus spare modules. */
export const storedUnits = (world = state.worldState) => loadOf(STATION, state.profile, world);

/** The station's storage capacity in m³. */
export const storageCap = (world = state.worldState) => capacityOf(STATION, state.profile, world);

/** Repair cost for a ship. Costs rise steeply with damage. Hull HP come from the
 *  fitted hull module — no module fitted means nothing to repair, and a free repair. */
export function repairCost(id, profile = state.profile) {
  const frac = profile.hp[id] ?? 1;
  const max = hullOf((profile.loadout || {})[id]);
  if (max <= 0) return 0;
  const missing = max * (1 - frac);
  return Math.round(missing * (2 + (3 * missing) / max));
}

/**
 * Move every good in the flown ship's hold into the station (spare modules stay
 * put, as they always did: a part is moved in the Inventory tab if you want it
 * in storage).
 */
export function storeHold(profile = state.profile, world = state.worldState) {
  const before = unitsOf(profile.ship, profile, world);
  for (const id of Object.keys(stockOf(profile.ship, profile, world))) {
    if (!isModule(id)) moveItem(profile.ship, STATION, id, Infinity, profile, world);
  }
  const moved = before - unitsOf(profile.ship, profile, world);
  return moved ? `Stored ${moved} units.` : "Storage is full.";
}

/** Load as much stored goods as fits into the flown ship's hold. */
export function withdrawStored(profile = state.profile, world = state.worldState) {
  for (const id of Object.keys(stockOf(STATION, profile, world))) {
    if (!isModule(id)) moveItem(STATION, profile.ship, id, Infinity, profile, world);
  }
}

/**
 * Sell everything in the flown ship's hold that has a value. Spare modules sell
 * too (they have a sell value like any item); only a part fitted in a bay stays
 * put, because a fitted part is in no hold. Returns the message for the panel.
 */
export function sellHold(profile = state.profile, world = state.worldState) {
  const p = profile;
  const where = p.ship;
  const earned = valueOf(stockOf(where, p, world), world);
  const sold = countSaleable(where, p, world);
  if (!sold) return "Nothing in the hold can be sold.";
  p.cr += earned;
  for (const id of Object.keys(stockOf(where, p, world))) {
    if (canSell(id)) takeItem(where, id, Infinity, p, world);
  }
  return `Sold ${sold} ${sold === 1 ? "item" : "items"} for ${earned} cr.`;
}

/** Sell everything saleable in the station's storage. Returns the message. */
export function sellStored(profile = state.profile, world = state.worldState) {
  const p = profile;
  const earned = valueOf(stockOf(STATION, p, world), world);
  const sold = countSaleable(STATION, p, world);
  if (!sold) return "Nothing in the station can be sold.";
  p.cr += earned;
  for (const id of Object.keys(stockOf(STATION, p, world))) {
    if (canSell(id)) takeItem(STATION, id, Infinity, p, world);
  }
  return `Sold ${sold} ${sold === 1 ? "item" : "items"} for ${earned} cr.`;
}

/** How many whole items at a place have a sell value — goods and spare parts alike. */
function countSaleable(where, profile = state.profile, world = state.worldState) {
  const stock = stockOf(where, profile, world);
  let n = 0;
  for (const id of Object.keys(stock)) if (canSell(id)) n += stock[id];
  return n;
}

/** Sell `amount` of one item from the station's storage or a ship's hold — a good
 *  or a spare part; both have a sell value in the catalogue. */
export function sellInventoryItem(
  id,
  where,
  amount = null,
  profile = state.profile,
  world = state.worldState
) {
  if (!canSell(id)) return "That cannot be sold.";
  const available = countOf(where, id, profile, world);
  const count = amount === null ? available : amount;
  if (!Number.isInteger(count) || count < 1 || count > available) {
    return `Enter a whole number from 1 to ${available}.`;
  }
  // Same base value and refinery bonus as Base-tab selling.
  const value = Math.round(count * itemValue(id) * (1 + REFINERY_BONUS_PER_LEVEL * world.base.refinery));
  profile.cr += value;
  takeItem(where, id, count, profile, world);
  return `Sold ${count} ${itemName(id)} for ${value} cr.`;
}

export function upgradeBase(mod, profile = state.profile, world = state.worldState) {
  const mdef = BASE_MODULES[mod];
  const cost = mdef.cost(world.base[mod]);
  if (world.base[mod] >= mdef.max || profile.cr < cost) return;
  profile.cr -= cost;
  world.base[mod]++;
}

export function buyShip(id, profile = state.profile, world = state.worldState) {
  const price = SHIPS[id].price;
  if (profile.cr < price || profile.ships.length >= world.base.hangar + 1) return;
  profile.cr -= price;
  profile.ships.push(id);
  // Its own empty hold, no damage and the stock modules fitted: one shared
  // definition of a complete ship, so a bought hull and a replacement hull can
  // never differ in which records exist.
  addShipRecords(profile, id);
}

export function selectShip(id, P = state.player, profile = profileOf(P)) {
  assertEconomyPilot(P, profile);
  // Each ship has its own hold now, so cargo stays with the ship it is in and
  // nothing has to fit before you can switch. Fill in anything an old save left
  // out: a hull with no fit has no bays and nothing to fly with.
  ensureShipRecords(profile, id);
  profile.ship = id;
  setShip(id, P, profile);
  refillPower(P, profile);       // docked: the new hull's cells are full
  refreshDrive(P, profile);      // and its thrusters decide the way it flies
  refreshShield(P, profile);     // and its shields how much punishment it takes
  refreshGuns(P, profile);       // and its primary bays what fires
  refreshHull(P, profile);       // and its Hull HP
  return undefined;
}

export function repairShip(id, P = state.player, profile = profileOf(P)) {
  assertEconomyPilot(P, profile);
  const c = repairCost(id, profile);
  if (profile.cr < c || c <= 0) return;
  profile.cr -= c;
  profile.hp[id] = 1;
  if (P && id === profile.ship) P.hull = P.hullMax;
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
 */
export function shopList(shopId, profile = state.profile, world = state.worldState) {
  return (shopDef(shopId).stock || []).map(row => {
    const id = row.id;
    const bought = isItem(id);
    return {
      id,
      n: row.n || (bought ? itemName(id) : String(id)),
      d: row.d || "",
      price: row.price,
      vol: bought ? (MODULES[id] ? MODULES[id].vol : 1) : 0,
      owned: bought && isModule(id) && row.own !== false ? ownedCount(id, profile, world) : 0,
      left: shopStock(shopId, id),
      room: bought ? hasRoomFor(STATION, id, 1, profile, world) : false,
    };
  });
}

/**
 * Buy `qty` of shop `shopId`'s row for item `id`. Purchases land in `world`'s
 * station storage, charge `profile.cr`, and top up `profile.msl` when a launcher
 * module defines `ammo`.
 */
export function buyItem(
  shopId,
  id,
  qty = 1,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertEconomyPilot(P, profile);
  const row = shopRow(shopId, id);
  if (!isShop(shopId) || !row || !isItem(id)) return;
  const n = Math.max(1, Math.floor(+qty) || 1);
  const total = row.price * n;
  const left = shopStock(shopId, id);
  if (profile.cr < total) return;
  if (left !== null && left < n) return;
  if (!hasRoomFor(STATION, id, n, profile, world)) {
    return `No room in the station for the ${row.n || itemName(id)}.`;
  }
  // Everything is checked, so nothing below can fail half way: `buyInto` takes
  // the credits and stores the items together.
  buyInto(id, row.price, STATION, n, profile, world);
  if (left !== null) setShopStock(shopId, id, left - n);
  const mod = MODULES[id];
  const ammo = (mod && mod.ammo) || 0;
  const gave = ammo > 0 && profile.msl < ammo;
  if (gave) {
    profile.msl = ammo;
    if (P) P.missileStock = profile.msl;
  }
  const name = row.n || itemName(id);
  if (n > 1) return `${n} ${name} in the station inventory.`;
  const bay = (mod && mod.g) || "primary";
  return `${name} in the station inventory.${mod ? ` Fit it in a ${bay} bay to use it.` : ""}${
    gave ? ` ${ammo} missiles included.` : ""
  }`;
}

export function restockMissiles(P = state.player, profile = profileOf(P)) {
  assertEconomyPilot(P, profile);
  const launchers = P ? P.missiles : state.missiles;
  const cap = ((launchers || [])[0] || MODULES.missile_basic).cap,
    n = Math.min(cap - profile.msl, Math.floor(profile.cr / MISSILE.unitPrice));
  profile.cr -= n * MISSILE.unitPrice;
  profile.msl += n;
  if (P) P.missileStock = profile.msl;
  return `Restocked ${n} missiles.`;
}
