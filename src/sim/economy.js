// Cargo, storage, the refinery, repairs and every purchase at a dockable station.
// Station levels (`base`) and station-local storage (`stationStores`) belong to
// `world` (`state.worldState`); `world.store` is the backward-compatible home
// alias. Credits, ships, holds, hull damage, loadouts and missiles belong to
// `profile` (`state.profile` by default, or an explicit pilot's `profile`).

import { state, profileOf } from "../state/state.js";
import { DEFAULT_PLACE, stationKeyAt } from "../data/places.js";
import { SHIPS, isShipType, nextShipId, shipDef, shipLabel, shipName, shipSellValue, shipTypeOf } from "../data/ships.js";
import { canSell, isItem, isModule, itemName, itemStack, itemValue, itemVol } from "../data/items.js";
import { BASE_MODULES, REFINERY_BONUS_PER_LEVEL } from "../data/station.js";
import { MISSILE } from "../data/weapons.js";
import { MODULES, STOCK_FIT } from "../data/modules.js";
import {
  SHOP_GROUPS, isShop, isShipRow, shopDef, shopGroupFor, shopModuleSubgroups, shopRow, shopRowKind,
} from "../data/shops.js";
import { ownedCount } from "./fitting.js";
import { setShip } from "./player.js";
import { addShipRecords, ensureShipRecords, shipStation, shipsAtStation } from "../state/profile.js";
import {
  STATION, addItem, buyItem as buyInto, capacityOf, countOf, freeOf, hasRoomFor, holdOf, loadOf, moveItem,
  spaceFor, stockOf, takeItem, unitsOf, valueOf,
} from "./inventory.js";
export { valueOf, shipStation, shipsAtStation };   // screens ask for local-station ships and stock values
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshHull, effectiveHullOf, shipBaseStats } from "./hull.js";
export { shipBaseStats };
import { refreshGuns } from "./guns.js";

function activeStationPlace(world = state.worldState, placeId = null) {
  const candidate = placeId
    || (world === state.worldState ? state.place || world?.place : world?.place || state.place)
    || DEFAULT_PLACE;
  return stationKeyAt(candidate) ? candidate : DEFAULT_PLACE;
}

/** Maximum ships a station hangar may hold for new purchases (`hangar` level + 1). */
export const hangarCap = (world = state.worldState) => Math.max(1, (world?.base?.hangar ?? 0) + 1);

/** Owned ship instance ids docked in `placeId`'s hangar (current station by default). */
export function localShips(profile = state.profile, world = state.worldState, placeId = null) {
  const at = activeStationPlace(world, placeId);
  return shipsAtStation(profile, at, { docked: true, fallback: at });
}

/** Free hangar berths available for buying ships at `placeId` (current station by default). */
export function freeBerths(profile = state.profile, world = state.worldState, placeId = null) {
  return Math.max(0, hangarCap(world) - localShips(profile, world, placeId).length);
}

/** How many ships of hull class `type` the pilot has parked at this station. */
export function localShipTypeCount(type, profile = state.profile, world = state.worldState, placeId = null) {
  return localShips(profile, world, placeId).filter(id => shipTypeOf(id) === type).length;
}

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
  const max = effectiveHullOf((profile.loadout || {})[id], id);
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

/**
 * Buy `qty` hulls of class `type` and park each as its own fitted ship instance
 * at the current station (visible in Outfitting here, never in Inventory).
 * Multiple copies of the same class receive distinct ids (`wasp`, `wasp#2`, ...).
 */
export function buyShip(
  type,
  profile = state.profile,
  world = state.worldState,
  qty = 1,
  unitPrice = null,
  P = null
) {
  if (!isShipType(type)) return undefined;
  const n = Math.max(1, Math.floor(+qty) || 1);
  const price = unitPrice == null ? SHIPS[type].price : unitPrice;
  const at = P && P !== state.player && P.place ? P.place : activeStationPlace(world);
  if (profile.cr < price * n) return undefined;
  if (freeBerths(profile, world, at) < n) {
    return "No free hangar berth at this station. Upgrade Hangar berth in Base.";
  }
  profile.cr -= price * n;
  const added = [];
  for (let i = 0; i < n; i++) {
    const id = nextShipId(type, profile.ships);
    profile.ships.push(id);
    // Its own empty hold, intact hull, stock modules and station berth.
    addShipRecords(profile, id, at);
    added.push(id);
  }
  // If the pilot had no active ship parked here (for example after losing every ship), board the first.
  const local = localShips(profile, world, at);
  if (!local.includes(profile.ship) && added.length) {
    const target = P || (profile === state.profile ? state.player : null);
    selectShip(added[0], target, profile, world);
  }
  const label = SHIPS[type].n;
  return n > 1
    ? `${n} ${label} stored in Hangar at this station.`
    : `${label} stored in Hangar at this station.`;
}

/**
 * Cargo and non-stock fitted modules on ship `id` that must move into station
 * storage when the hull is sold, so cargo, mission objects and bought upgrades
 * are never lost with a sale while factory stock stays with the sold hull.
 */
function shipUnpackMap(id, profile) {
  const out = {};
  const hold = profile?.holds?.[id];
  if (hold && typeof hold === "object") {
    for (const [item, count] of Object.entries(hold)) {
      if (isItem(item) && count > 0) out[item] = (out[item] || 0) + count;
    }
  }
  const fit = profile?.loadout?.[id];
  if (fit && typeof fit === "object") {
    for (const [group, slots] of Object.entries(fit)) {
      if (!Array.isArray(slots)) continue;
      const stockAllowance = {};
      for (const s of STOCK_FIT[group] || []) {
        if (s) stockAllowance[s] = (stockAllowance[s] || 0) + 1;
      }
      for (const mod of slots) {
        if (!mod || !isItem(mod)) continue;
        if (stockAllowance[mod] > 0) {
          stockAllowance[mod]--;
          continue;
        }
        out[mod] = (out[mod] || 0) + 1;
      }
    }
  }
  return out;
}

/**
 * Whether ship `id` may be sold right now at this station. Refuses selling the
 * active ship (the pilot must fly another ship first, and can never sell their
 * only ship here) or selling when station storage lacks space for its cargo and
 * non-stock fitted upgrades.
 */
export function canSellShip(id, P = state.player, profile = profileOf(P), world = state.worldState) {
  if (!profile?.ships?.includes(id) || !shipDef(id)) {
    return { ok: false, reason: "You do not own that ship.", price: 0, unpackVol: 0, label: shipName(id) };
  }
  const at = P && P !== state.player && P.place ? P.place : activeStationPlace(world);
  const local = localShips(profile, world, at);
  const label = shipLabel(id, local);
  const price = shipSellValue(id);
  if (!local.includes(id)) {
    return { ok: false, reason: "That ship is stored at another station.", price, unpackVol: 0, label };
  }
  if (id === profile.ship) {
    const reason = local.length <= 1
      ? "Cannot sell your only ship at this station."
      : "Fly another ship first before selling this one.";
    return { ok: false, reason, price, unpackVol: 0, label };
  }
  const unpack = shipUnpackMap(id, profile);
  let unpackVol = 0;
  for (const [item, count] of Object.entries(unpack)) {
    unpackVol += count * (itemVol(item) || 0);
    if (countOf(STATION, item, profile, world) + count > itemStack(item)) {
      return {
        ok: false,
        reason: `Station storage cannot stack any more ${itemName(item)} from ${label}.`,
        price,
        unpackVol,
        label,
      };
    }
  }
  if (unpackVol > freeOf(STATION, profile, world)) {
    return {
      ok: false,
      reason: `Need ${unpackVol} m³ free in station storage for ${label}'s cargo and fitted modules.`,
      price,
      unpackVol,
      label,
    };
  }
  return { ok: true, reason: "", price, unpackVol, unpack, label };
}

/**
 * Sell a stored ship at the current station: returns its cargo and non-stock
 * fitted modules to station storage, removes its fleet records and credits the
 * hull's resale value.
 */
export function sellShip(id, P = state.player, profile = profileOf(P), world = state.worldState) {
  assertEconomyPilot(P, profile);
  const check = canSellShip(id, P, profile, world);
  if (!check.ok) return check.reason;
  for (const [item, count] of Object.entries(check.unpack || {})) {
    addItem(STATION, item, count, profile, world);
  }
  profile.ships = profile.ships.filter(other => other !== id);
  if (profile.holds) delete profile.holds[id];
  if (profile.hp) delete profile.hp[id];
  if (profile.loadout) delete profile.loadout[id];
  if (profile.shipPlaces) delete profile.shipPlaces[id];
  profile.cr += check.price;
  if (profile === state.profile && state.ui.invShip === id) state.ui.invShip = null;
  return check.unpackVol > 0
    ? `Sold ${check.label} for ${check.price} cr. Cargo and fitted modules moved to station storage.`
    : `Sold ${check.label} for ${check.price} cr.`;
}

export function selectShip(id, P = state.player, profile = profileOf(P), world = state.worldState) {
  assertEconomyPilot(P, profile);
  if (!profile?.ships?.includes(id)) return "You do not own that ship.";
  const at = P && P !== state.player && P.place ? P.place : activeStationPlace(world);
  const parked = profile.shipPlaces?.[id];
  if (parked && parked !== at) return "That ship is stored at another station.";
  // Each ship instance keeps its own hold, hull fraction and fitted bays.
  ensureShipRecords(profile, id, at);
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
  return `${shipName(id)} repaired for ${c} cr.`;
}

function shopStockKey(shopId, row) {
  return shopRowKind(row) === "ship" ? `${shopId}:ship:${row.id}` : `${shopId}:${row.id}`;
}

/**
 * How much of shop `shopId`'s row for `id` is left, or `null` when that row
 * never runs out (no `max` in data/shops.js — every Meridian row today). The
 * count is made on first use and lives in `state.shops` (session only).
 */
export function shopStock(shopId, id, kind = null) {
  const row = shopRow(shopId, id, kind);
  if (!row || !(row.max > 0)) return null;
  const key = shopStockKey(shopId, row);
  const shops = state.shops || (state.shops = {});
  if (!(key in shops)) shops[key] = Math.floor(row.max);
  return shops[key];
}

/**
 * Set how much of a limited row is left. This is the hook a restock timer, a
 * restock event or a random roll uses later; nothing needs saving today, so
 * buying from a fresh save always starts from the row's `max`.
 */
export function setShopStock(shopId, id, n, kind = null) {
  const row = shopRow(shopId, id, kind);
  if (!row || !(row.max > 0)) return;
  const shops = state.shops || (state.shops = {});
  shops[shopStockKey(shopId, row)] = Math.max(0, Math.floor(+n || 0));
}

/**
 * Maximum whole units of `(shopId, id)` purchasable right now, capped by credits,
 * finite shop stock (`max`), and destination capacity (hangar berths for ships,
 * station storage m³ and stack limit for regular items).
 */
export function shopMaxBuy(
  shopId,
  id,
  profile = state.profile,
  world = state.worldState,
  kind = null
) {
  const row = shopRow(shopId, id, kind);
  if (!isShop(shopId) || !row || !(row.price > 0)) return 0;
  const ship = isShipRow(row);
  if (!ship && !isItem(row.id)) return 0;
  const byCr = Math.floor(Math.max(0, profile.cr) / row.price);
  const left = shopStock(shopId, row.id, shopRowKind(row));
  const byStock = left === null ? Infinity : Math.max(0, left);
  const byRoom = ship
    ? freeBerths(profile, world)
    : Math.max(0, spaceFor(STATION, row.id, profile, world));
  return Math.max(0, Math.min(byCr, byStock, byRoom));
}

/**
 * Flat list of rows the Shop sells for `shopId`, in data order, each with every
 * derived figure the compact tree and Buy-amount popup need.
 */
export function shopList(shopId, profile = state.profile, world = state.worldState) {
  return (shopDef(shopId).stock || []).map(row => {
    const id = row.id;
    const kind = shopRowKind(row);
    const ship = isShipRow(row);
    const bought = !ship && isItem(id);
    const { group, subgroup, subcat } = shopGroupFor(row);
    const left = shopStock(shopId, id, kind);
    const room = ship
      ? freeBerths(profile, world) > 0
      : bought
        ? hasRoomFor(STATION, id, 1, profile, world)
        : false;
    const byCr = row.price > 0 ? Math.floor(Math.max(0, profile.cr) / row.price) : 0;
    const byStock = left === null ? Infinity : Math.max(0, left);
    const byRoom = ship
      ? freeBerths(profile, world)
      : bought
        ? Math.max(0, spaceFor(STATION, id, profile, world))
        : 0;
    return {
      kind,
      group,
      subgroup,
      subcat,
      id,
      n: row.n || (ship ? shipDef(id).n : bought ? itemName(id) : String(id)),
      d: row.d || "",
      price: row.price,
      vol: ship ? 0 : bought ? itemVol(id) : 0,
      owned: ship
        ? row.own === false ? 0 : localShipTypeCount(id, profile, world)
        : bought && isModule(id) && row.own !== false
          ? ownedCount(id, profile, world)
          : 0,
      left,
      room,
      maxBuy: ship || bought ? Math.max(0, Math.min(byCr, byStock, byRoom)) : 0,
    };
  });
}

/**
 * Compact collapsible tree for `shopId`: top-level groups (`Ships`, `Modules`,
 * `Consumables`, `Ores`, `Loot`), with `Modules` split into one subgroup per
 * entry of `MODULE_GROUPS` (powerplants, power cells, thrusters, shield
 * generators, primary weapons, secondary weapons, hulls, plus any future group).
 */
export function shopCatalogue(shopId, profile = state.profile, world = state.worldState) {
  const rows = shopList(shopId, profile, world);
  const subDefs = shopModuleSubgroups();
  return SHOP_GROUPS.map(g => {
    if (g.nested) {
      const modRows = rows.filter(r => r.group === g.k);
      const known = new Set(subDefs.map(s => s.k));
      const subgroups = subDefs.map(sub => {
        const items = modRows.filter(r => r.subgroup === sub.k);
        if (sub.subgroups && sub.subgroups.length) {
          const knownSub = new Set(sub.subgroups.map(sc => sc.k));
          const nested = sub.subgroups.map(sc => {
            const scItems = items.filter(r => r.subcat === sc.k);
            return { k: sc.k, n: sc.n, count: scItems.length, items: scItems };
          });
          const direct = items.filter(r => !r.subcat || !knownSub.has(r.subcat));
          return { k: sub.k, n: sub.n, count: items.length, subgroups: nested, items: direct };
        }
        return { k: sub.k, n: sub.n, count: items.length, items };
      });
      const extras = modRows.filter(r => !known.has(r.subgroup));
      if (extras.length) subgroups.push({ k: "other", n: "Other modules", count: extras.length, items: extras });
      return { k: g.k, n: g.n, count: modRows.length, subgroups };
    }
    const items = rows.filter(r => r.group === g.k);
    return { k: g.k, n: g.n, count: items.length, items };
  });
}

/**
 * Buy `qty` of shop `shopId`'s row for `id` (optionally scoped by `kind`:
 * `"ship"` or `"item"`). Regular items land in this station's Inventory; ships
 * land in this station's Outfitting hangar as distinct ship instances.
 */
export function buyItem(
  shopId,
  id,
  qty = 1,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState,
  kind = null
) {
  assertEconomyPilot(P, profile);
  if (!isShop(shopId)) return;
  const row = shopRow(shopId, id, kind);
  if (!row) return;
  const rowKind = shopRowKind(row);
  const n = Math.max(1, Math.floor(+qty) || 1);
  const total = row.price * n;
  const left = shopStock(shopId, id, rowKind);
  if (profile.cr < total) return;
  if (left !== null && left < n) return;

  if (isShipRow(row)) {
    if (freeBerths(profile, world) < n) {
      return `No free hangar berth at this station for ${row.n || shipName(id)}. Upgrade Hangar berth in Base.`;
    }
    const msg = buyShip(id, profile, world, n, row.price, P);
    if (left !== null) setShopStock(shopId, id, left - n, rowKind);
    return msg;
  }

  if (!isItem(id)) return;
  if (!hasRoomFor(STATION, id, n, profile, world)) {
    return `No room in the station for the ${row.n || itemName(id)}.`;
  }
  // Everything is checked, so nothing below can fail half way: `buyInto` takes
  // the credits and stores the items together.
  buyInto(id, row.price, STATION, n, profile, world);
  if (left !== null) setShopStock(shopId, id, left - n, rowKind);
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
