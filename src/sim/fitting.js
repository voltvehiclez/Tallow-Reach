// Moving modules between a pilot's ship and the current station's storage.
//
// Fitting costs nothing and is done while docked: a part comes out of the
// current station inventory and into a bay in `profile.loadout[ship]`, and
// whatever was in that bay goes back into that same station. Every change
// refreshes the target pilot's power, drive, shields, hull and guns.

import { MODULES } from "../data/modules.js";
import { MODULE_GROUPS, layoutFor } from "../data/outfitting.js";
import { isModule, itemName, itemVol } from "../data/items.js";
import { shipDef, shipName } from "../data/ships.js";
import { shipStation } from "../state/profile.js";
import { state, profileOf } from "../state/state.js";
import {
  STATION,
  addItem,
  addItemToSlot,
  countOf,
  freeOf,
  itemsAt,
  nameOf,
  slotAt,
  spaceFor,
  takeItem,
  takeItemFromSlot,
} from "./inventory.js";
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshHull } from "./hull.js";
import { refreshGuns } from "./guns.js";

const groupTitle = key => MODULE_GROUPS.find(g => g.k === key)?.n || key;

function refreshFittedShip(P, profile) {
  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshHull(P, profile);
  refreshGuns(P, profile);
}

function activeShipHere(profile = state.profile, world = state.worldState) {
  const ship = profile?.ship;
  if (!ship || !shipDef(ship) || !Array.isArray(profile?.ships) || !profile.ships.includes(ship)) {
    return false;
  }
  if (!profile.shipAt || !profile.shipAt[ship]) return true;
  const here = world === state.worldState ? state.place : (world?.place || state.place);
  return shipStation(profile, ship, here) === here;
}

function assertFitTarget(P, profile) {
  if (P && P !== state.player && (!profile || profile === state.profile)) {
    throw new Error("Non-local fitting requires its own profile");
  }
}

/**
 * The bay list for `group` on `profile`'s active ship, or null if there is no
 * such bay. `i` is the bay index.
 */
function bayList(group, i, profile = state.profile) {
  const fit = profile.loadout && profile.loadout[profile.ship];
  if (!fit) return null;
  const list = fit[group];
  if (!Array.isArray(list) || !Number.isInteger(i) || i < 0 || i >= list.length) return null;
  return list;
}

/**
 * Spare parts in storage that would fit a `group` bay, in the order they
 * arrived: one entry per part, so three beams are three "beam_basic"s.
 */
export function storedFor(group, world = state.worldState) {
  const out = [];
  for (const { id, n } of itemsAt(STATION, state.profile, world)) {
    if (!isModule(id) || MODULES[id].g !== group) continue;
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

/** The module fitted in one bay, or null. */
export function fittedAt(group, i, profile = state.profile) {
  const list = bayList(group, i, profile);
  return list ? list[i] || null : null;
}

/**
 * Put stored module `id` into bay `i` of `group`. A part already in that bay
 * moves to storage. Returns a message for the panel, or undefined if the bay
 * does not exist (the screen is out of date).
 */
export function fitModule(
  group,
  i,
  id,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  const list = bayList(group, i, profile);
  if (!list) return undefined;

  const m = MODULES[id];
  if (!m || m.g !== group) return "That module does not fit in that bay.";

  if (!countOf(STATION, id, profile, world)) return "That module is not in storage.";

  const replaced = list[i];
  // The part that comes out needs somewhere to go; the one going in frees its own space.
  if (replaced && itemVol(replaced) > freeOf(STATION, profile, world) + itemVol(id)) {
    return `No room in ${nameOf(STATION)} for the ${MODULES[replaced].n}. Make space in the Inventory tab.`;
  }
  takeItem(STATION, id, 1, profile, world);
  if (replaced) addItem(STATION, replaced, 1, profile, world);
  list[i] = id;

  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshHull(P, profile);
  refreshGuns(P, profile);
  return replaced
    ? `Fitted ${m.n}. ${MODULES[replaced].n} moved to storage.`
    : `Fitted ${m.n}.`;
}

/** Take whatever is in bay `i` of `group` out and put it in storage. */
export function unequip(
  group,
  i,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  const list = bayList(group, i, profile);
  if (!list) return undefined;

  const id = list[i];
  if (!id) return "That bay is already empty.";
  if (itemVol(id) > freeOf(STATION, profile, world)) {
    return `No room in ${nameOf(STATION)} for the ${MODULES[id].n}. Make space in the Inventory tab.`;
  }

  list[i] = null;
  addItem(STATION, id, 1, profile, world);

  refreshFittedShip(P, profile);
  return `${MODULES[id].n} moved to storage.`;
}

function pickReturnPlace(replacedId, fromWhere, freedVol, profile, world) {
  if (!replacedId) return STATION;
  const need = itemVol(replacedId) || 0;
  if (fromWhere && need <= freeOf(fromWhere, profile, world) + freedVol) return fromWhere;
  if (fromWhere !== STATION && need <= freeOf(STATION, profile, world)) return STATION;
  return null;
}

/**
 * Inspect whether item `id` in `fromWhere` can be equipped directly onto the
 * pilot's active ship (without opening Outfitting). Equips into the first empty
 * bay of its group, or swaps a 1-bay group when fitted with a different module.
 */
export function canEquipModule(
  id,
  fromWhere = STATION,
  profile = state.profile,
  world = state.worldState
) {
  if (!isModule(id) || !MODULES[id]) {
    return { ok: false, group: null, bay: -1, replaced: null, reason: "This item cannot be equipped." };
  }
  const m = MODULES[id];
  if (!activeShipHere(profile, world)) {
    return { ok: false, group: m.g, bay: -1, replaced: null, reason: "No active ship stored at this station." };
  }
  const shipLabelText = shipName(profile.ship);
  const fit = profile.loadout?.[profile.ship];
  const list = fit?.[m.g];
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, group: m.g, bay: -1, replaced: null, reason: `${m.n} does not fit on ${shipLabelText}.` };
  }
  const emptyBay = list.findIndex(cur => !cur);
  if (emptyBay >= 0) {
    return { ok: true, group: m.g, bay: emptyBay, replaced: null, reason: "" };
  }
  if (list.length === 1 && list[0] !== id) {
    const replaced = list[0];
    const dest = pickReturnPlace(replaced, fromWhere, itemVol(id) || 0, profile, world);
    if (!dest) {
      return {
        ok: false,
        group: m.g,
        bay: -1,
        replaced,
        reason: `No room to unequip ${MODULES[replaced]?.n || replaced}.`,
      };
    }
    return { ok: true, group: m.g, bay: 0, replaced, reason: "" };
  }
  if (list.length === 1 && list[0] === id) {
    return {
      ok: false,
      group: m.g,
      bay: -1,
      replaced: list[0],
      reason: `${m.n} is already equipped on ${shipLabelText}.`,
    };
  }
  return {
    ok: false,
    group: m.g,
    bay: -1,
    replaced: null,
    reason: `All ${groupTitle(m.g)} bays on ${shipLabelText} are full.`,
  };
}

/**
 * Fit one unit of module `id` from any docked inventory `(where, slotIndex)`
 * into `(group, i)` on `profile`'s active ship, placing any displaced module
 * back into `where` (or station storage if `where` is a full ship hold).
 */
export function fitModuleFrom(
  where,
  slotIndex,
  group,
  i,
  id,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  if (!isModule(id) || !MODULES[id]) {
    return { ok: false, replaced: null, message: `${itemName(id) || "That item"} cannot be equipped.` };
  }
  const m = MODULES[id];
  if (!activeShipHere(profile, world)) {
    return { ok: false, replaced: null, message: "No active ship stored at this station." };
  }
  if (m.g !== group) {
    return { ok: false, replaced: null, message: `${m.n} fits ${groupTitle(m.g)}, not ${groupTitle(group)}.` };
  }
  const list = bayList(group, i, profile);
  if (!list) {
    return { ok: false, replaced: null, message: `${m.n} does not fit on ${shipName(profile.ship)}.` };
  }
  const source = where || STATION;
  if (!(countOf(source, id, profile, world) > 0)) {
    return { ok: false, replaced: null, message: `${m.n} is not in ${nameOf(source)}.` };
  }
  const replaced = list[i] || null;
  if (replaced === id) {
    return { ok: false, replaced, message: `${m.n} is already fitted in that bay.` };
  }
  const returnWhere = pickReturnPlace(replaced, source, itemVol(id) || 0, profile, world);
  if (replaced && !returnWhere) {
    return {
      ok: false,
      replaced,
      message: `No room in ${nameOf(source)} for the ${MODULES[replaced].n}.`,
    };
  }
  const idx = Number.isInteger(slotIndex) ? slotIndex : -1;
  const took = takeItemFromSlot(source, idx, id, 1, profile, world);
  if (!(took > 0)) {
    return { ok: false, replaced: null, message: `${m.n} is not in ${nameOf(source)}.` };
  }
  if (replaced) {
    const returnSlot = returnWhere === source && idx >= 0 && !slotAt(source, idx, profile, world) ? idx : -1;
    addItemToSlot(returnWhere, returnSlot, replaced, 1, profile, world);
  }
  list[i] = id;
  refreshFittedShip(P, profile);
  return {
    ok: true,
    replaced,
    message: replaced
      ? `Equipped ${m.n}. ${MODULES[replaced].n} moved to ${nameOf(returnWhere)}.`
      : `Equipped ${m.n}.`,
  };
}

/** Right-click `Equip` action from any Inventory slot onto the active ship. */
export function equipModuleFromInventory(
  where,
  slotIndex,
  id,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  const check = canEquipModule(id, where || STATION, profile, world);
  if (!check.ok) return { ok: false, replaced: null, message: check.reason };
  return fitModuleFrom(where || STATION, slotIndex, check.group, check.bay, id, P, profile, world);
}

/**
 * Unequip bay `(group, i)` from the active ship into `(toWhere, toSlot)`. If
 * dropped onto a slot holding a single compatible module of the same group,
 * swaps the two cleanly.
 */
export function unequipTo(
  group,
  i,
  toWhere = STATION,
  toSlot = -1,
  P = state.player,
  profile = profileOf(P),
  world = state.worldState
) {
  assertFitTarget(P, profile);
  if (!activeShipHere(profile, world)) {
    return { ok: false, id: null, message: "No active ship stored at this station." };
  }
  const list = bayList(group, i, profile);
  if (!list) return { ok: false, id: null, message: "That bay does not exist." };
  const id = list[i];
  if (!id) return { ok: false, id: null, message: "That bay is already empty." };
  const dest = toWhere || STATION;
  const idx = Number.isInteger(toSlot) ? toSlot : -1;
  if (idx >= 0) {
    const target = slotAt(dest, idx, profile, world);
    if (target && isModule(target.id) && MODULES[target.id]?.g === group && target.id !== id && target.n === 1) {
      const swapRes = fitModuleFrom(dest, idx, group, i, target.id, P, profile, world);
      return { ok: swapRes.ok, id, message: swapRes.message };
    }
  }
  if (spaceFor(dest, id, profile, world) < 1) {
    return {
      ok: false,
      id,
      message: `No room in ${nameOf(dest)} for the ${MODULES[id].n}.`,
    };
  }
  list[i] = null;
  addItemToSlot(dest, idx, id, 1, profile, world);
  refreshFittedShip(P, profile);
  return { ok: true, id, message: `Unequipped ${MODULES[id].n} to ${nameOf(dest)}.` };
}

/** Swap two bays within the same module group on the active ship. */
export function swapFittedBays(group, fromBay, toBay, P = state.player, profile = profileOf(P)) {
  assertFitTarget(P, profile);
  if (fromBay === toBay) return { ok: false, message: "" };
  const list = bayList(group, fromBay, profile);
  if (!list || !Number.isInteger(toBay) || toBay < 0 || toBay >= list.length) {
    return { ok: false, message: "" };
  }
  if (!list[fromBay] && !list[toBay]) return { ok: false, message: "" };
  const tmp = list[fromBay];
  list[fromBay] = list[toBay];
  list[toBay] = tmp;
  refreshFittedShip(P, profile);
  return { ok: true, message: "" };
}

/** True when `group` is a real bay group on the ship being flown. */
export const isBayGroup = (group, profile = state.profile) =>
  Object.prototype.hasOwnProperty.call(layoutFor(profile.ship), group);

/**
 * How many of module `id` are owned across `world`'s station storage,
 * `profile`'s ship holds, and fitted bays of `profile`'s loadouts.
 */
export function ownedCount(id, profile = state.profile, world = state.worldState) {
  let n = countOf(STATION, id, profile, world);
  for (const hold of Object.values(profile.holds || {})) n += (hold && hold[id]) || 0;
  for (const fit of Object.values(profile.loadout || {})) {
    for (const bays of Object.values(fit || {})) {
      if (Array.isArray(bays)) n += bays.filter(m => m === id).length;
    }
  }
  return n;
}

/** True when at least one module `id` is owned (see ownedCount). */
export const ownsModule = (id, profile = state.profile, world = state.worldState) =>
  ownedCount(id, profile, world) > 0;
