// Inventory: where things are kept, how much room there is, and moving things.
//
// There are two kinds of place, and both are measured in m³:
//   - the STATION: the current pocket's station store. Every station uses its
//     own entry in `world.stationStores`, keyed by `${placeId}:${featureId}`;
//     Meridian's enumerable `world.store` is a backward-compatible alias.
//   - a SHIP's hold: `profile.holds[shipId]`. The room is the hull's `cargo`
//     (data/ships.js). Every owned ship has its own hold.
//
// Station storage and refinery levels live on `world` (`state.worldState` by
// default); ship holds and credits live on `profile` (`state.profile` by
// default, or an explicit pilot's `profile`).

import { state } from "../state/state.js";
import { DEFAULT_PLACE, stationKeyAt } from "../data/places.js";
import { SHIPS } from "../data/ships.js";
import { ITEMS, isItem, isModule, itemName, itemStack, itemValue, itemVol, newStock } from "../data/items.js";
import { REFINERY_BONUS_PER_LEVEL, STORAGE_PER_LEVEL } from "../data/station.js";

/** The id that means "the current station" wherever a place is asked for. */
export const STATION = "station";
const HOME_STATION_KEY = stationKeyAt(DEFAULT_PLACE) || `${DEFAULT_PLACE}:station`;

const isStation = where => where === STATION;

function activePlace(world, placeId) {
  if (placeId) return placeId;
  // Runtime state is authoritative for the local pilot; explicit test/load worlds
  // use their saved pocket when they are not the installed world object.
  if (world === state.worldState) return state.place || world?.place || DEFAULT_PLACE;
  return world?.place || state.place || DEFAULT_PLACE;
}

/** The stable key of the station in the local pilot's current pocket. */
export function currentStationKey(world = state.worldState) {
  return stationKeyAt(activePlace(world)) || HOME_STATION_KEY;
}

/** What a station keeps: `{ itemId: count }`, made on first use. */
export function stationStock(world = state.worldState, placeId = null) {
  const key = stationKeyAt(activePlace(world, placeId));
  const stores = world.stationStores || (world.stationStores = {});
  if (!stores[key]) {
    // A caller holding an unsanitized legacy world may still provide only
    // `world.store`; attach that one stock to the active station once. Normal
    // saves reach this function through sanitizeWorld and already have keys.
    stores[key] = world.store && Object.keys(stores).length === 0 ? world.store : newStock();
  }
  return stores[key];
}

/** What a place keeps: `{ itemId: count }`, made on first use. */
export function stockOf(where, profile = state.profile, world = state.worldState) {
  if (isStation(where)) return stationStock(world);
  const holds = profile.holds || (profile.holds = {});
  return holds[where] || (holds[where] = newStock());
}

/** The hold of ship `id` (the ship being flown by default). */
export const holdOf = (id, profile = state.profile) => stockOf(id ?? profile.ship, profile);

/** Room in m³. */
export function capacityOf(where, profile = state.profile, world = state.worldState) {
  return isStation(where) ? STORAGE_PER_LEVEL * world.base.store : SHIPS[where].cargo;
}

/** How many m³ are in use at a place. */
export function loadOf(where, profile = state.profile, world = state.worldState) {
  const stock = stockOf(where, profile, world);
  let used = 0;
  for (const id of Object.keys(stock)) used += stock[id] * itemVol(id);
  return used;
}

/** m³ still free at a place (never below 0, even in an over-full old save). */
export const freeOf = (where, profile = state.profile, world = state.worldState) =>
  Math.max(0, capacityOf(where, profile, world) - loadOf(where, profile, world));

/** How many of item `id` a place holds. */
export const countOf = (where, id, profile = state.profile, world = state.worldState) =>
  stockOf(where, profile, world)[id] || 0;

/** How many units of goods (anything that is not a module) a place holds. */
export function unitsOf(where, profile = state.profile, world = state.worldState) {
  const stock = stockOf(where, profile, world);
  let n = 0;
  for (const id of Object.keys(stock)) if (!isModule(id)) n += stock[id];
  return n;
}

/**
 * What a stock is worth in credits, with the station's refinery bonus. An item
 * the catalogue gives no value to is worth nothing here.
 */
export function valueOf(stock, world = state.worldState) {
  let base = 0;
  for (const id of Object.keys(stock || {})) base += (stock[id] || 0) * itemValue(id);
  return Math.round(base * (1 + REFINERY_BONUS_PER_LEVEL * world.base.refinery));
}

/** How many more of `id` the place can take: what the free m³ allow, and the stack rule. */
export const spaceFor = (where, id, profile = state.profile, world = state.worldState) =>
  Math.min(
    Math.floor(freeOf(where, profile, world) / (itemVol(id) || 1)),
    itemStack(id) - countOf(where, id, profile, world)
  );

/** Can the place take `n` more of `id`? */
export const hasRoomFor = (where, id, n = 1, profile = state.profile, world = state.worldState) =>
  n > 0 && spaceFor(where, id, profile, world) >= n;

/** The place's name for messages. */
export function nameOf(where) {
  return isStation(where) ? "the station" : `the ${SHIPS[where].n}`;
}

/**
 * Put `n` of item `id` into a place. Returns how many actually went in: fewer
 * than asked when the m³ or the stack rule runs out, 0 when the place is full.
 */
export function addItem(where, id, n = 1, profile = state.profile, world = state.worldState) {
  if (!isItem(id) || !(n > 0)) return 0;
  const put = Math.min(Math.floor(n), spaceFor(where, id, profile, world));
  if (!(put > 0)) return 0;
  const stock = stockOf(where, profile, world);
  stock[id] = (stock[id] || 0) + put;
  return put;
}

/**
 * Take `n` of item `id` out of a place. Returns how many actually came out.
 * A stack that reaches zero leaves the map, so the order things arrived in is
 * the order they are listed in.
 */
export function takeItem(where, id, n = 1, profile = state.profile, world = state.worldState) {
  const stock = stockOf(where, profile, world);
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
export function itemsAt(where, profile = state.profile, world = state.worldState) {
  const stock = stockOf(where, profile, world);
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
export function moveItem(from, to, id, n = Infinity, profile = state.profile, world = state.worldState) {
  if (!isItem(id)) return "Unknown item.";
  if (from === to) return "It is already there.";
  const have = countOf(from, id, profile, world);
  const count = Math.min(n, have, spaceFor(to, id, profile, world));
  if (!(count > 0)) {
    return have <= 0 ? `No ${itemName(id)} to move.` : `No room in ${nameOf(to)}.`;
  }
  takeItem(from, id, count, profile, world);
  addItem(to, id, count, profile, world);
  return `Moved ${count} ${itemName(id)} to ${nameOf(to)}.`;
}

/**
 * Buy `n` of item `id` for `price` credits each: they go into the station's
 * inventory (or the place given). Returns `null` when it worked, or the reason
 * it did not. Nothing is charged unless the items really were stored.
 */
export function buyItem(
  id,
  price,
  where = STATION,
  n = 1,
  profile = state.profile,
  world = state.worldState
) {
  if (!isItem(id)) return "Unknown item.";
  const count = Math.max(1, Math.floor(+n) || 1);
  const total = price * count;
  if (profile.cr < total) return "Not enough credits.";
  if (!hasRoomFor(where, id, count, profile, world)) {
    return `No room in ${nameOf(where)} for the ${itemName(id)}.`;
  }
  profile.cr -= total;
  addItem(where, id, count, profile, world);
  return null;
}
