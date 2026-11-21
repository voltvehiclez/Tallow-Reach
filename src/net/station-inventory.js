// Station inventories, in plain data (refactor step 16).
//
// A pilot's station storage is `world.stationStores[placeId:featureId]`, a stock of
// `{ itemId: count }` — the same shape a hold uses. This file answers the three
// questions custody and trading both need, without a screen or the live game state:
//
//   inventoryOf(world)                     every station key -> its stock
//   stationCapacity(world)                 how many m³ a station of that world can hold
//   stationRoom(world, stock)              m³ used by a stock
//   stockVolume(stock)                     m³ used by a stock
//   guardOverfull(world)                   flag stations holding more than they can, and never delete a unit
//
// The numbers come from the save half of the game (`data/station.js`), not from
// `sim/inventory.js`, so this stays a data question and the sim's own inventory
// layer keeps being the one that moves things during play. A station over its
// limit is marked `overfull` in the world (`world.storageOverfull[key] = true`)
// rather than trimmed: the vision is that nothing is ever deleted, and an
// over-full station merely refuses new deposits (the check on a deposit reads the
// same flag).

import { STORAGE_PER_LEVEL } from "../data/station.js";
import { itemStack, itemVol, newStock } from "../data/items.js";

/**
 * A stock as `{ itemId: count }`, whole counts above zero. Never mutates `raw`.
 *
 * An id this build does not know is KEPT: a build from the future may have written
 * something real, and custody must carry it rather than delete it. `stockVolume`
 * prices such a unit at nothing, so an unknown never makes a station look over-full
 * for a reason the game cannot explain.
 */
export function cleanStockCounts(raw) {
  const out = newStock();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== "string" || !id) continue;
    const count = Math.floor(Number(value) || 0);
    if (count > 0) out[id] = count;
  }
  return out;
}

/**
 * The stations of `source`, as `{ key: stock }`, cleaned.
 *
 * `source` may be a whole world (its `stationStores` are read) or a plain
 * `{ stationKey: stock }` map, which is what a caller already holds after cleaning
 * a world by hand. Anything else reads as no stations. Never mutates its argument.
 */
export function inventoryOf(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const stores = source.stationStores && typeof source.stationStores === "object"
    ? source.stationStores
    : source;
  if (!stores || typeof stores !== "object" || Array.isArray(stores)) return {};
  const out = {};
  for (const [key, stock] of Object.entries(stores)) {
    if (!key || !stock || typeof stock !== "object" || Array.isArray(stock)) continue;
    out[key] = cleanStockCounts(stock);
  }
  return out;
}

/** m³ one stock takes up. Unknown ids count as nothing, exactly as `data/items.js` prices them. */
export function stockVolume(stock) {
  let used = 0;
  if (!stock || typeof stock !== "object") return 0;
  for (const [id, count] of Object.entries(stock)) used += (Math.floor(Number(count) || 0)) * itemVol(id);
  return used;
}

/**
 * How many m³ a station of this world can hold. Storage is bought per level and
 * that one level is shared by every station of a world (`world.base.store`);
 * a world with none bought still gets the level-1 figure, so a locker moved into a
 * fresh world is never judged against zero.
 */
export function stationCapacity(world) {
  const level = Math.floor(Number(world?.base?.store) || 0);
  const perLevel = Math.max(1, Number(STORAGE_PER_LEVEL) || 1);
  return perLevel * Math.max(1, level);
}

/** m³ still free at station `key`; never below zero, even for an over-full legacy world. */
export function stationRoom(world, key, stock = null) {
  const held = stock || inventoryOf(world)[key] || newStock();
  return Math.max(0, stationCapacity(world) - stockVolume(held));
}

/**
 * Mark every station that holds more than it can, and unmark the ones that fit.
 * Writes `world.storageOverfull` (a plain `{ key: true }` map) and returns it.
 * Nothing is removed: the flag is what refuses a new deposit there.
 */
export function guardOverfull(world) {
  const flags = {};
  if (!world || typeof world !== "object") return flags;
  for (const [key, stock] of Object.entries(inventoryOf(world))) {
    if (stockVolume(stock) > stationCapacity(world)) flags[key] = true;
  }
  world.storageOverfull = flags;
  return flags;
}

/** Is this station refusing new deposits because it is over its limit? */
export const stationOverfull = (world, key) => !!(world?.storageOverfull || {})[key];

/**
 * How many more of item `id` station `key` can take: what its free m³ allow, and
 * never more than one stack. `Infinity` means "as many as you like".
 */
export function stationSpaceFor(world, key, id, stock = null) {
  if (stationOverfull(world, key)) return 0;
  const room = stationRoom(world, key, stock);
  const vol = itemVol(id) || 1;
  const stack = itemStack(id);
  return Math.max(0, Math.min(Number.isFinite(stack) ? stack : Infinity, Math.floor(room / vol)));
}
