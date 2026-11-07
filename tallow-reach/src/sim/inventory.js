// Inventory: where things are kept, how much room there is, and moving things.
//
// There are two kinds of place, and both are measured in m³:
//   - the STATION: `profile.store` — the station's storage. The room is
//     `storageCap()` — the Storage bay base module (data/station.js).
//   - a SHIP's hold: `profile.holds[shipId]`. The room is the hull's `cargo`
//     (data/ships.js). Every owned ship has its own hold.
//
// A place is one stock: `{ itemId: count }` — ore, salvage and spare modules all
// in the same map, because they are all items (data/items.js). A module that is
// fitted in a bay takes no space anywhere; only parts being carried or stored
// do. One unit takes `itemVol(id)` m³, so the catalogue decides how big things
// are and this file only counts them.
//
// Things you buy arrive in the station; the player moves them to a ship on
// demand (the Inventory tab), and the Outfitting bays are fitted from the
// station's stock (sim/fitting.js). This file is the only code that moves
// things between places, and the only reader of how full a place is.

import { state } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { ITEMS, isItem, isModule, itemName, itemStack, itemValue, itemVol, newStock } from "../data/items.js";
import { REFINERY_BONUS_PER_LEVEL, STORAGE_PER_LEVEL } from "../data/station.js";

const S = () => state.profile;

/** The id that means "the station" wherever a place is asked for. */
export const STATION = "station";

const isStation = where => where === STATION;

/** What a place keeps: `{ itemId: count }`, made on first use. */
export function stockOf(where) {
  const p = S();
  if (isStation(where)) return p.store || (p.store = newStock());
  const holds = p.holds || (p.holds = {});
  return holds[where] || (holds[where] = newStock());
}

/** The hold of ship `id` (the ship being flown by default). */
export const holdOf = (id = S().ship) => stockOf(id);

/** Room in m³. */
export function capacityOf(where) {
  return isStation(where) ? STORAGE_PER_LEVEL * S().base.store : SHIPS[where].cargo;
}

/** How many m³ are in use at a place. */
export function loadOf(where) {
  const stock = stockOf(where);
  let used = 0;
  for (const id of Object.keys(stock)) used += stock[id] * itemVol(id);
  return used;
}

/** m³ still free at a place (never below 0, even in an over-full old save). */
export const freeOf = where => Math.max(0, capacityOf(where) - loadOf(where));

/** How many of item `id` a place holds. */
export const countOf = (where, id) => stockOf(where)[id] || 0;

/** How many units of goods (anything that is not a module) a place holds. */
export function unitsOf(where) {
  const stock = stockOf(where);
  let n = 0;
  for (const id of Object.keys(stock)) if (!isModule(id)) n += stock[id];
  return n;
}

/**
 * What a stock is worth in credits, with the station's refinery bonus. An item
 * the catalogue gives no value to (a module) is worth nothing here.
 */
export function valueOf(stock) {
  let base = 0;
  for (const id of Object.keys(stock || {})) base += (stock[id] || 0) * itemValue(id);
  return Math.round(base * (1 + REFINERY_BONUS_PER_LEVEL * S().base.refinery));
}

/** How many more of `id` the place can take: what the free m³ allow, and the stack rule. */
export const spaceFor = (where, id) =>
  Math.min(Math.floor(freeOf(where) / (itemVol(id) || 1)), itemStack(id) - countOf(where, id));

/** Can the place take `n` more of `id`? */
export const hasRoomFor = (where, id, n = 1) => n > 0 && spaceFor(where, id) >= n;

/** The place's name for messages. */
export function nameOf(where) {
  return isStation(where) ? "the station" : `the ${SHIPS[where].n}`;
}

/**
 * Put `n` of item `id` into a place. Returns how many actually went in: fewer
 * than asked when the m³ or the stack rule runs out, 0 when the place is full.
 */
export function addItem(where, id, n = 1) {
  if (!isItem(id) || !(n > 0)) return 0;
  const put = Math.min(Math.floor(n), spaceFor(where, id));
  if (!(put > 0)) return 0;
  const stock = stockOf(where);
  stock[id] = (stock[id] || 0) + put;
  return put;
}

/**
 * Take `n` of item `id` out of a place. Returns how many actually came out.
 * A stack that reaches zero leaves the map, so the order things arrived in is
 * the order they are listed in.
 */
export function takeItem(where, id, n = 1) {
  const stock = stockOf(where);
  const have = stock[id] || 0;
  const took = Math.min(Math.floor(n), have);
  if (!(took > 0)) return 0;
  if (have - took <= 0) delete stock[id];
  else stock[id] = have - took;
  return took;
}

/**
 * What a place holds, in the order the Inventory tab lists it: goods in
 * catalogue order, then spare modules in the order they arrived.
 */
export function itemsAt(where) {
  const stock = stockOf(where);
  const out = [];
  for (const id of Object.keys(ITEMS)) {     // live: the catalogue decides the order
    if (!isModule(id) && stock[id] > 0) out.push({ id, n: stock[id] });
  }
  for (const id of Object.keys(stock)) {
    if (isModule(id) && stock[id] > 0) out.push({ id, n: stock[id] });
  }
  return out;
}

/**
 * Move `n` of item `id` (or as many as there is room for) from one place to
 * another. Returns a message for the panel.
 */
export function moveItem(from, to, id, n = Infinity) {
  if (!isItem(id)) return "Unknown item.";
  if (from === to) return "It is already there.";
  const have = countOf(from, id);
  const count = Math.min(n, have, spaceFor(to, id));
  if (!(count > 0)) {
    return have <= 0 ? `No ${itemName(id)} to move.` : `No room in ${nameOf(to)}.`;
  }
  takeItem(from, id, count);
  addItem(to, id, count);
  return `Moved ${count} ${itemName(id)} to ${nameOf(to)}.`;
}

/**
 * Buy `n` of item `id` for `price` credits each: they go into the station's
 * inventory (or the place given). Returns `null` when it worked, or the reason
 * it did not. Nothing is charged unless the items really were stored.
 */
export function buyItem(id, price, where = STATION, n = 1) {
  const p = S();
  if (!isItem(id)) return "Unknown item.";
  const count = Math.max(1, Math.floor(+n) || 1);
  const total = price * count;
  if (p.cr < total) return "Not enough credits.";
  if (!hasRoomFor(where, id, count)) return `No room in ${nameOf(where)} for the ${itemName(id)}.`;
  p.cr -= total;
  addItem(where, id, count);
  return null;
}
