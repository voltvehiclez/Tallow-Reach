// Inventory: where things are kept, how much room there is, and moving them.
//
// There are two kinds of place, and both are measured in m³:
//   - the STATION: ore in `profile.store`, parts in `profile.modules`. The room is
//     `storageCap()` — the Storage bay base module (data/station.js).
//   - a SHIP's hold: `profile.holds[shipId] = { cargo, modules }`. The room is the
//     hull's `cargo` (data/ships.js). Every owned ship has its own hold.
//
// One unit of ore is 1 m³ (`ITEM_VOL`); a module's volume is `vol` in
// data/modules.js. A module that is fitted in a bay takes no space anywhere —
// only parts that are being carried or stored do.
//
// Things you buy arrive in the station; the player moves them to a ship on demand
// (the Inventory tab), and the Outfitting bays are fitted from the station's parts
// (sim/fitting.js). This file is the only code that moves things between places,
// and the only reader of how full a place is.

import { state } from "../state/state.js";
import { SHIPS } from "../data/ships.js";
import { ITEM, KEYS, ITEM_VOL } from "../data/items.js";
import { MODULES } from "../data/modules.js";
import { STORAGE_PER_LEVEL } from "../data/station.js";
import { newHold } from "../state/profile.js";

const S = () => state.profile;

/** The id that means "the station" wherever a place is asked for. */
export const STATION = "station";

const isStation = where => where === STATION;

/** The hold of ship `id` (the ship being flown by default). Made on first use. */
export function holdOf(id = S().ship) {
  const holds = S().holds || (S().holds = {});
  return holds[id] || (holds[id] = newHold());
}

/** The ore a ship carries. */
export const cargoOf = id => holdOf(id).cargo;

/** What a place keeps: `{ cargo, modules }`. */
export function stockOf(where) {
  const p = S();
  if (isStation(where)) return { cargo: p.store, modules: p.modules || (p.modules = []) };
  return holdOf(where);
}

/** Room in m³. */
export function capacityOf(where) {
  return isStation(where) ? STORAGE_PER_LEVEL * S().base.store : SHIPS[where].cargo;
}

/** Volume of one module, in m³ (0 for an unknown id, so bad data cannot jam anything). */
export const volOf = id => (MODULES[id] ? MODULES[id].vol : 0);

/** How many m³ are in use at a place: ore plus carried parts. */
export function loadOf(where) {
  const { cargo, modules } = stockOf(where);
  return (
    KEYS.reduce((sum, k) => sum + cargo[k] * ITEM_VOL, 0) +
    modules.reduce((sum, id) => sum + volOf(id), 0)
  );
}

/** m³ still free at a place (never below 0, even in an over-full old save). */
export const freeOf = where => Math.max(0, capacityOf(where) - loadOf(where));

/** How many of module `id` a place holds. */
export const countModule = (where, id) => stockOf(where).modules.filter(m => m === id).length;

/** The place's name for messages. */
export function nameOf(where) {
  return isStation(where) ? "the station" : `the ${SHIPS[where].n}`;
}

/** The modules at a place as `[{ id, n }]`, one entry per kind, in the order first stored. */
export function moduleStacks(where) {
  const out = [];
  for (const id of stockOf(where).modules) {
    const hit = out.find(e => e.id === id);
    if (hit) hit.n++;
    else out.push({ id, n: 1 });
  }
  return out;
}

/** Can the place take `n` more of module `id`? */
export const hasRoomFor = (where, id, n = 1) => freeOf(where) >= volOf(id) * n;

/**
 * Put one new module straight into a place (a purchase). Returns false, and
 * changes nothing, when there is no room.
 */
export function addModule(where, id) {
  if (!MODULES[id] || !hasRoomFor(where, id)) return false;
  stockOf(where).modules.push(id);
  return true;
}

/**
 * Buy module `id` for `price` credits: it goes into the station's inventory (or the
 * place given). Returns `null` when it worked, or the reason it did not. Nothing is
 * charged unless the part really was stored. Buying the same part again is fine.
 */
export function buyModule(id, price, where = STATION) {
  const p = S();
  const m = MODULES[id];
  if (!m) return "Unknown module.";
  if (p.cr < price) return "Not enough credits.";
  if (!addModule(where, id)) return `No room in ${nameOf(where)} for the ${m.n}.`;
  p.cr -= price;
  return null;
}

/**
 * Move `n` units of ore `key` (or as many as there is room for) from one place
 * to another. Returns a message for the panel.
 */
export function moveCargo(from, to, key, n = Infinity) {
  if (!ITEM[key]) return "Unknown item.";
  if (from === to) return "It is already there.";
  const src = stockOf(from).cargo,
    dst = stockOf(to).cargo;
  const room = Math.floor(freeOf(to) / ITEM_VOL);
  const count = Math.min(n, src[key], room);
  if (count <= 0) {
    return src[key] <= 0 ? `No ${ITEM[key].n} to move.` : `No room in ${nameOf(to)}.`;
  }
  src[key] -= count;
  dst[key] += count;
  return `Moved ${count} ${ITEM[key].n} to ${nameOf(to)}.`;
}

/**
 * Move `n` copies of module `id` (or as many as there is room for) from one place
 * to another. Returns a message for the panel.
 */
export function moveModule(from, to, id, n = 1) {
  const m = MODULES[id];
  if (!m) return "Unknown module.";
  if (from === to) return "It is already there.";
  const src = stockOf(from).modules,
    dst = stockOf(to).modules;
  const have = src.filter(x => x === id).length;
  const room = m.vol > 0 ? Math.floor(freeOf(to) / m.vol) : Infinity;
  const count = Math.min(n, have, room);
  if (count <= 0) return have <= 0 ? `No ${m.n} to move.` : `No room in ${nameOf(to)}.`;
  for (let moved = 0; moved < count; moved++) {
    src.splice(src.indexOf(id), 1);
    dst.push(id);
  }
  return `Moved ${count} ${m.n} to ${nameOf(to)}.`;
}
