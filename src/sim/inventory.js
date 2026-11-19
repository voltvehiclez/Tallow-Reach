// Inventory: where things are kept, how much room there is, and moving things.
//
// There are three kinds of place, and two of them are measured in m³:
//   - the STATION: the current pocket's station store. Every station uses its
//     own entry in `world.stationStores`, keyed by `${placeId}:${featureId}`;
//     Meridian's enumerable `world.store` is a backward-compatible alias.
//   - a SHIP's hold: `profile.holds[shipId]`. The room is the hull's `cargo`
//     (data/ships.js). Every owned ship has its own hold.
//   - the CACHE: the canister of the temporary run the local pilot is inside
//     (`sim/instances.js`), which is what a rift's prize is traded out of. Its
//     stock is the record's own, so a move to or from it is a move in the save.
//     A canister has no measured volume: it takes whatever is put in it, up to
//     the same stack rule every other container obeys.
//
// Station storage and refinery levels live on `world` (`state.worldState` by
// default); ship holds and credits live on `profile` (`state.profile` by
// default, or an explicit pilot's `profile`).

import { state } from "../state/state.js";
import { DEFAULT_PLACE, stationKeyAt } from "../data/places.js";
import { shipDef, shipName } from "../data/ships.js";
import { ITEMS, isItem, isModule, itemName, itemStack, itemValue, itemVol, newStock } from "../data/items.js";
import { REFINERY_BONUS_PER_LEVEL, STORAGE_PER_LEVEL } from "../data/station.js";

/** The id that means "the current station" wherever a place is asked for. */
export const STATION = "station";
/**
 * The id that means "the canister the local pilot has open" — a rift run's prize. Like `STATION` it
 * stands for a container the caller does not have to name, and like a station's store its stock is
 * shared with everybody: it belongs to the run, not to a pilot.
 */
export const CACHE = "cache";
const HOME_STATION_KEY = stationKeyAt(DEFAULT_PLACE) || `${DEFAULT_PLACE}:station`;

const isStation = where => where === STATION;
const isCache = where => where === CACHE;

/**
 * The instance record whose canister `CACHE` means, or null: the run the local pilot is inside, when
 * that run's prize is open to trade with (`sim/instances.js` `cacheTradeRecord` answers the same
 * question for the sim). Resolved from runtime state rather than handed in, because a canister is a
 * place in the world and not part of anybody's profile — exactly like `state.place` deciding which
 * station `STATION` is.
 */
function cacheRecord() {
  const record = state.instances.get(state.place);
  return record && record.cache && record.cache.open ? record : null;
}

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
  if (isCache(where)) return cacheRecord()?.cache.stock || newStock();
  const holds = profile.holds || (profile.holds = {});
  return holds[where] || (holds[where] = newStock());
}

/** The hold of ship `id` (the ship being flown by default). */
export const holdOf = (id, profile = state.profile) => stockOf(id ?? profile.ship, profile);

/**
 * Room in m³. A canister has none to give: while one is open it takes whatever the stack rule allows,
 * and with nothing open it takes nothing at all, so a move to `CACHE` outside a run is refused rather
 * than swallowing cargo.
 */
export function capacityOf(where, profile = state.profile, world = state.worldState) {
  if (isStation(where)) return STORAGE_PER_LEVEL * world.base.store;
  if (isCache(where)) return cacheRecord() ? Infinity : 0;
  return shipDef(where)?.cargo || 0;
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
  if (isStation(where)) return "the station";
  if (isCache(where)) return `the ${(cacheRecord()?.cache.n || "cache").toLowerCase()}`;
  return `the ${shipName(where)}`;
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

// ---------------------------------------------------------------------------
// Slot layouts (Minecraft-style inventory slots, split stacks, Stack all)
// ---------------------------------------------------------------------------

function trimNullSlots(list) {
  while (list.length && list[list.length - 1] === null) list.pop();
  return list;
}

function readRawSlots(where, profile = state.profile, world = state.worldState) {
  if (isStation(where)) {
    const key = currentStationKey(world);
    return world?.stationSlots?.[key] || null;
  }
  if (isCache(where)) return cacheRecord()?.cache.slots || null;
  return profile?.holdSlots?.[where] || null;
}

function writeRawSlots(where, list, profile = state.profile, world = state.worldState) {
  const clean = Array.isArray(list) ? trimNullSlots(list.map(s => (s && s[1] > 0 ? [s[0], s[1]] : null))) : [];
  if (isStation(where)) {
    const key = currentStationKey(world);
    const map = world.stationSlots || (world.stationSlots = {});
    if (clean.length) map[key] = clean;
    else delete map[key];
    return clean;
  }
  if (isCache(where)) {
    const rec = cacheRecord();
    if (rec?.cache) {
      if (clean.length) rec.cache.slots = clean;
      else delete rec.cache.slots;
    }
    return clean;
  }
  const map = profile.holdSlots || (profile.holdSlots = {});
  if (clean.length) map[where] = clean;
  else delete map[where];
  return clean;
}

function insertIntoSlotList(list, id, count) {
  let left = Math.max(0, Math.floor(count || 0));
  if (!(left > 0) || !isItem(id)) return list;
  const cap = itemStack(id);
  for (let i = 0; i < list.length && left > 0; i++) {
    const slot = list[i];
    if (!slot || slot[0] !== id || slot[1] >= cap) continue;
    const add = Math.min(left, cap - slot[1]);
    slot[1] += add;
    left -= add;
  }
  for (let i = 0; i < list.length && left > 0; i++) {
    if (list[i] !== null) continue;
    const add = Math.min(left, cap);
    list[i] = [id, add];
    left -= add;
  }
  while (left > 0) {
    const add = Math.min(left, cap);
    list.push([id, add]);
    left -= add;
  }
  return list;
}

/**
 * Reconcile a container's slot layout against its authoritative `stock` so
 * slot counts always sum to `stock` while preserving custom placements, empty
 * gaps and split stacks.
 */
function ensureSlotList(where, profile = state.profile, world = state.worldState) {
  const stock = stockOf(where, profile, world);
  const canonical = itemsAt(where, profile, world);
  const raw = readRawSlots(where, profile, world);
  if (!canonical.length) {
    if (raw) writeRawSlots(where, [], profile, world);
    return [];
  }
  if (!Array.isArray(raw) || !raw.length) {
    return canonical.map(({ id, n }) => [id, n]);
  }
  const list = raw.map(s => (Array.isArray(s) && isItem(s[0]) && s[1] > 0 ? [s[0], Math.floor(s[1])] : null));
  const have = {};
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s) continue;
    if (!(stock[s[0]] > 0)) { list[i] = null; continue; }
    have[s[0]] = (have[s[0]] || 0) + s[1];
  }
  // Shave any externally consumed units from the rightmost matching stack(s) first.
  for (const [id, total] of Object.entries(have)) {
    let drop = total - (stock[id] || 0);
    for (let i = list.length - 1; i >= 0 && drop > 0; i--) {
      const s = list[i];
      if (!s || s[0] !== id) continue;
      const take = Math.min(drop, s[1]);
      s[1] -= take;
      drop -= take;
      if (s[1] <= 0) list[i] = null;
    }
  }
  // Place any externally added units (mined ore, bought goods, crate loot) into matching or open slots.
  for (const { id, n } of canonical) {
    const extra = n - Math.min(n, have[id] || 0);
    if (extra > 0) insertIntoSlotList(list, id, extra);
  }
  return writeRawSlots(where, list, profile, world);
}

function originMeta(where, slot, id, n, profile = state.profile, world = state.worldState) {
  if (isStation(where)) {
    return { kind: "station", where, slot, id, n, stationKey: currentStationKey(world), ship: profile?.ship || null, instanceId: null };
  }
  if (isCache(where)) {
    const rec = cacheRecord();
    return { kind: "cache", where, slot, id, n, stationKey: null, ship: profile?.ship || null, instanceId: rec?.id || state.place };
  }
  return { kind: "ship", where, slot, id, n, stationKey: null, ship: where, instanceId: null };
}

/**
 * Reconciled slot array for `where`: each entry is `{ id, n }` or `null` (for an
 * explicit gap between placed stacks), with trailing empty slots trimmed.
 */
export function slotsAt(where, profile = state.profile, world = state.worldState) {
  return ensureSlotList(where, profile, world).map(s => (s ? { id: s[0], n: s[1] } : null));
}

/** Content of a single slot in `where` (`{ id, n }` or `null`). */
export function slotAt(where, slotIndex, profile = state.profile, world = state.worldState) {
  const idx = Math.floor(+slotIndex);
  if (!Number.isInteger(idx) || idx < 0) return null;
  const list = ensureSlotList(where, profile, world);
  const s = list[idx];
  return s ? { id: s[0], n: s[1] } : null;
}

/**
 * Remove up to `n` of `id` from `where`, deducting from `slotIndex` first when a
 * valid slot is named so selling or discarding one split stack leaves sibling
 * stacks untouched unless more than that slot's count was asked for.
 */
export function takeItemFromSlot(where, slotIndex, id, n = 1, profile = state.profile, world = state.worldState) {
  if (!isItem(id) || !(n > 0)) return 0;
  const list = ensureSlotList(where, profile, world).map(s => (s ? [s[0], s[1]] : null));
  const took = takeItem(where, id, n, profile, world);
  if (!(took > 0)) return 0;
  let rem = took;
  const idx = Number.isInteger(slotIndex) ? slotIndex : -1;
  if (idx >= 0 && idx < list.length && list[idx]?.[0] === id) {
    const cut = Math.min(rem, list[idx][1]);
    list[idx][1] -= cut;
    rem -= cut;
    if (list[idx][1] <= 0) list[idx] = null;
  }
  for (let i = list.length - 1; i >= 0 && rem > 0; i--) {
    const s = list[i];
    if (!s || s[0] !== id) continue;
    const cut = Math.min(rem, s[1]);
    s[1] -= cut;
    rem -= cut;
    if (s[1] <= 0) list[i] = null;
  }
  writeRawSlots(where, list, profile, world);
  return took;
}

/**
 * Add up to `n` of `id` into `where`, preferring `slotIndex` when it is empty
 * or holds a non-full stack of `id`, and spilling any remainder into matching
 * or first-open slots so stock and slot lists stay exact.
 */
export function addItemToSlot(where, slotIndex, id, n = 1, profile = state.profile, world = state.worldState) {
  if (!isItem(id) || !(n > 0)) return 0;
  const list = ensureSlotList(where, profile, world).map(s => (s ? [s[0], s[1]] : null));
  const put = addItem(where, id, n, profile, world);
  if (!(put > 0)) return 0;
  let rem = put;
  const cap = itemStack(id);
  const idx = Number.isInteger(slotIndex) ? slotIndex : -1;
  if (idx >= 0) {
    while (list.length <= idx) list.push(null);
    const cur = list[idx];
    if (!cur) {
      const add = Math.min(rem, cap);
      list[idx] = [id, add];
      rem -= add;
    } else if (cur[0] === id && cur[1] < cap) {
      const add = Math.min(rem, cap - cur[1]);
      cur[1] += add;
      rem -= add;
    }
  }
  if (rem > 0) insertIntoSlotList(list, id, rem);
  writeRawSlots(where, list, profile, world);
  return put;
}

/** Pick up the whole stack sitting in `(where, slotIndex)` onto the cursor. */
export function pickupSlot(where, slotIndex, profile = state.profile, world = state.worldState) {
  const idx = Math.floor(+slotIndex);
  if (!Number.isInteger(idx) || idx < 0) return null;
  const list = ensureSlotList(where, profile, world).map(s => (s ? [s[0], s[1]] : null));
  const slot = list[idx];
  if (!slot) return null;
  const [id, n] = slot;
  const took = takeItem(where, id, n, profile, world);
  if (!(took > 0)) return null;
  list[idx] = null;
  writeRawSlots(where, list, profile, world);
  return originMeta(where, idx, id, took, profile, world);
}

/**
 * Pick up an exact partial/full `amount` from `(where, slotIndex)` onto the cursor
 * (right-click → `Take amount`). Leaves the remainder in the same slot.
 */
export function takeFromSlot(where, slotIndex, amount, profile = state.profile, world = state.worldState) {
  const idx = Math.floor(+slotIndex);
  if (!Number.isInteger(idx) || idx < 0) return { ok: false, held: null, message: "Empty slot." };
  const list = ensureSlotList(where, profile, world).map(s => (s ? [s[0], s[1]] : null));
  const slot = list[idx];
  if (!slot) return { ok: false, held: null, message: "Empty slot." };
  const [id, have] = slot;
  if (!Number.isInteger(amount) || amount < 1 || amount > have) {
    return { ok: false, held: null, message: `Enter a whole number from 1 to ${have}.` };
  }
  const took = takeItem(where, id, amount, profile, world);
  if (!(took > 0)) return { ok: false, held: null, message: `No ${itemName(id)} to take.` };
  if (have - took <= 0) list[idx] = null;
  else list[idx] = [id, have - took];
  writeRawSlots(where, list, profile, world);
  return { ok: true, held: originMeta(where, idx, id, took, profile, world), message: "" };
}

/**
 * Drop, merge, place-one (`one: true`), or swap a cursor-held stack onto
 * `(toWhere, toSlot)`. Never loses items: anything that cannot fit remains on
 * the returned `held` descriptor.
 */
export function placeHeldStack(
  held,
  toWhere,
  toSlot,
  opts = {},
  profile = state.profile,
  world = state.worldState
) {
  if (!held || !isItem(held.id) || !(held.n > 0)) {
    return { ok: false, moved: 0, swapped: false, held: null, message: "" };
  }
  const idx = Math.floor(+toSlot);
  if (!Number.isInteger(idx) || idx < 0 || idx >= 512) {
    return { ok: false, moved: 0, swapped: false, held, message: "" };
  }
  const one = opts.one === true;
  const list = ensureSlotList(toWhere, profile, world).map(s => (s ? [s[0], s[1]] : null));
  while (list.length <= idx) list.push(null);
  const dest = list[idx];

  // Empty slot or matching item stack: drop whole stack (or 1 on right-click) up to room & stack cap.
  if (!dest || dest[0] === held.id) {
    const ask = one ? 1 : held.n;
    const put = addItem(toWhere, held.id, ask, profile, world);
    if (!(put > 0)) {
      const capHit = countOf(toWhere, held.id, profile, world) >= itemStack(held.id);
      const message = capHit
        ? `Cannot stack any more ${itemName(held.id)} in ${nameOf(toWhere)}.`
        : `No room in ${nameOf(toWhere)}.`;
      return { ok: false, moved: 0, swapped: false, held, message };
    }
    list[idx] = [held.id, (dest ? dest[1] : 0) + put];
    writeRawSlots(toWhere, list, profile, world);
    const rem = held.n - put;
    const nextHeld = rem > 0 ? { ...held, n: rem } : null;
    const message = !one && rem > 0
      ? `Placed ${put} ${itemName(held.id)} in ${nameOf(toWhere)} (${rem} still held).`
      : "";
    return { ok: true, moved: put, swapped: false, held: nextHeld, message };
  }

  // Occupied by a different item: right-click does not overwrite; left-click swaps stacks atomically.
  if (one) {
    return { ok: false, moved: 0, swapped: false, held, message: "" };
  }
  const [destId, destN] = dest;
  const cap = capacityOf(toWhere, profile, world);
  const currentLoad = loadOf(toWhere, profile, world);
  const nextLoad = currentLoad - destN * (itemVol(destId) || 0) + held.n * (itemVol(held.id) || 0);
  if (nextLoad > cap + 1e-9) {
    return { ok: false, moved: 0, swapped: false, held, message: `No room in ${nameOf(toWhere)}.` };
  }
  if (countOf(toWhere, held.id, profile, world) + held.n > itemStack(held.id)) {
    return {
      ok: false,
      moved: 0,
      swapped: false,
      held,
      message: `Cannot stack any more ${itemName(held.id)} in ${nameOf(toWhere)}.`,
    };
  }
  const stock = stockOf(toWhere, profile, world);
  const destTotal = stock[destId] || 0;
  if (destTotal - destN <= 0) delete stock[destId];
  else stock[destId] = destTotal - destN;
  stock[held.id] = (stock[held.id] || 0) + held.n;
  list[idx] = [held.id, held.n];
  writeRawSlots(toWhere, list, profile, world);
  return {
    ok: true,
    moved: held.n,
    swapped: true,
    taken: { id: destId, n: destN },
    held: originMeta(toWhere, idx, destId, destN, profile, world),
    message: "",
  };
}

/**
 * Safely return a cursor-held stack back into its source slot/container (used
 * when pressing Escape, switching tabs, closing an inventory, docking, warping
 * or dying) so held cargo is never lost.
 */
export function returnHeldStack(held, profile = state.profile, world = state.worldState) {
  if (!held || !isItem(held.id) || !(held.n > 0)) return 0;
  let rem = held.n;

  const restoreInto = (where, preferredSlot) => {
    if (!(rem > 0)) return;
    if (Number.isInteger(preferredSlot) && preferredSlot >= 0) {
      const slot = slotAt(where, preferredSlot, profile, world);
      if (!slot || slot.id === held.id) {
        const res = placeHeldStack({ ...held, n: rem }, where, preferredSlot, {}, profile, world);
        if (res.moved > 0) rem -= res.moved;
      }
    }
    if (rem > 0) {
      const list = ensureSlotList(where, profile, world).map(s => (s ? [s[0], s[1]] : null));
      const put = addItem(where, held.id, rem, profile, world);
      if (put > 0) {
        insertIntoSlotList(list, held.id, put);
        writeRawSlots(where, list, profile, world);
        rem -= put;
      }
    }
  };

  if (held.kind === "station") {
    if (held.stationKey && held.stationKey !== currentStationKey(world)) {
      const stores = world.stationStores || (world.stationStores = {});
      const stock = stores[held.stationKey] || (stores[held.stationKey] = newStock());
      stock[held.id] = (stock[held.id] || 0) + rem;
      const slotMap = world.stationSlots || (world.stationSlots = {});
      if (Array.isArray(slotMap[held.stationKey])) {
        const list = slotMap[held.stationKey].map(s => (s ? [s[0], s[1]] : null));
        if (Number.isInteger(held.slot) && held.slot >= 0) {
          while (list.length <= held.slot) list.push(null);
          if (!list[held.slot]) { list[held.slot] = [held.id, rem]; rem = 0; }
        }
        if (rem > 0) { insertIntoSlotList(list, held.id, rem); rem = 0; }
        slotMap[held.stationKey] = trimNullSlots(list);
      } else {
        rem = 0;
      }
    } else {
      restoreInto(STATION, held.slot);
    }
  } else if (held.kind === "cache") {
    if (cacheRecord()) restoreInto(CACHE, held.slot);
    if (rem > 0 && held.instanceId) {
      const rec = state.instances.get(held.instanceId);
      if (rec?.cache?.stock) {
        rec.cache.stock[held.id] = (rec.cache.stock[held.id] || 0) + rem;
        if (Array.isArray(rec.cache.slots)) {
          insertIntoSlotList(rec.cache.slots, held.id, rem);
          trimNullSlots(rec.cache.slots);
        }
        rem = 0;
      }
    }
  } else if (held.ship && profile?.ships?.includes(held.ship)) {
    restoreInto(held.ship, held.slot);
  }

  // Fallback chain if the source ship/cache was full or gone: active ship -> station -> direct source stock.
  if (rem > 0 && profile?.ship) restoreInto(profile.ship, -1);
  if (rem > 0 && stationKeyAt(activePlace(world))) restoreInto(STATION, -1);
  if (rem > 0 && profile?.ship) {
    const stock = stockOf(profile.ship, profile, world);
    stock[held.id] = (stock[held.id] || 0) + rem;
    const list = ensureSlotList(profile.ship, profile, world);
    writeRawSlots(profile.ship, list, profile, world);
    rem = 0;
  }
  return held.n - rem;
}

/**
 * Shift+left-click on `(from, slotIndex)`: move the entire slot's stack (or as
 * much as fits) directly into `to`, topping up matching stacks first and then
 * taking the first open slot.
 */
export function shiftMoveSlot(from, slotIndex, to, profile = state.profile, world = state.worldState) {
  if (!to || from === to) return { ok: false, id: null, moved: 0, message: "" };
  const idx = Math.floor(+slotIndex);
  if (!Number.isInteger(idx) || idx < 0) return { ok: false, id: null, moved: 0, message: "" };
  const fromList = ensureSlotList(from, profile, world).map(s => (s ? [s[0], s[1]] : null));
  const slot = fromList[idx];
  if (!slot) return { ok: false, id: null, moved: 0, message: "" };
  const [id, have] = slot;
  const count = Math.min(have, spaceFor(to, id, profile, world));
  if (!(count > 0)) {
    return { ok: false, id, moved: 0, message: `No room in ${nameOf(to)}.` };
  }
  const toList = ensureSlotList(to, profile, world).map(s => (s ? [s[0], s[1]] : null));
  takeItem(from, id, count, profile, world);
  if (have - count <= 0) fromList[idx] = null;
  else fromList[idx] = [id, have - count];
  writeRawSlots(from, fromList, profile, world);

  addItem(to, id, count, profile, world);
  insertIntoSlotList(toList, id, count);
  writeRawSlots(to, toList, profile, world);
  return {
    ok: true,
    id,
    moved: count,
    message: `Moved ${count} ${itemName(id)} to ${nameOf(to)}.`,
  };
}

/**
 * Consolidate all split stacks in `where` up to each item's stack cap and
 * compact empty gaps out, preserving first-seen item order.
 */
export function stackAll(where, profile = state.profile, world = state.worldState) {
  const before = ensureSlotList(where, profile, world);
  if (!before.length) return { changed: false, message: "Nothing to stack." };
  const order = [];
  const totals = {};
  for (const s of before) {
    if (!s) continue;
    if (!(s[0] in totals)) { order.push(s[0]); totals[s[0]] = 0; }
    totals[s[0]] += s[1];
  }
  const next = [];
  for (const id of order) {
    let left = totals[id];
    const cap = itemStack(id);
    while (left > 0) {
      const add = Math.min(left, cap);
      next.push([id, add]);
      left -= add;
    }
  }
  const changed = next.length !== before.length
    || next.some((s, i) => !before[i] || before[i][0] !== s[0] || before[i][1] !== s[1]);
  writeRawSlots(where, next, profile, world);
  return {
    changed,
    message: changed ? `Stacked all items in ${nameOf(where)}.` : "All items are already stacked.",
  };
}

/**
 * Throw `n` of item `id` away for good (the whole stack by default). The panel
 * asks how many and then confirms, so the pilot never loses goods to a silent
 * click. Returns a message either way.
 */
export function discardItem(where, id, n = Infinity, profile = state.profile, world = state.worldState, slotIndex = -1) {
  if (!isItem(id)) return "Unknown item.";
  const count = Number.isInteger(slotIndex) && slotIndex >= 0
    ? takeItemFromSlot(where, slotIndex, id, n, profile, world)
    : takeItem(where, id, n, profile, world);
  if (!(count > 0)) return `No ${itemName(id)} to discard.`;
  return `Discarded ${count} ${itemName(id)} from ${nameOf(where)}.`;
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
