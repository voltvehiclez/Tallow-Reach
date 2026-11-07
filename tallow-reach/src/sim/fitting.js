// Moving modules between the ship and storage.
//
// Fitting costs nothing and is done at the outpost: a part comes out of storage
// and into a bay, and whatever was in that bay goes back into storage. Every
// change refreshes the ship's power budget (sim/power.js), its drive
// (sim/drive.js), its shields (sim/shield.js) and its guns (sim/guns.js),
// because that is what turns a fitted part into numbers the game uses.
//
// The save shape is one array per hull and group in profile.loadout (one entry
// per bay, null = empty) and one stock in profile.store — the station's
// inventory, where everything you buy lands, ore and spare parts alike, and where
// every bay is fitted from (any number of the same part). The station has limited
// room in m³, so a part coming off a ship needs space (sim/inventory.js). The
// Outfitting screen reads both; this file is the only thing that writes them.

import { MODULES } from "../data/modules.js";
import { layoutFor } from "../data/outfitting.js";
import { isModule, itemVol } from "../data/items.js";
import { state } from "../state/state.js";
import { STATION, addItem, countOf, freeOf, itemsAt, nameOf, takeItem } from "./inventory.js";
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshHull } from "./hull.js";
import { refreshGuns } from "./guns.js";

const S = () => state.profile;
const shipId = () => S().ship;

/**
 * The bay list for `group` on the ship being flown, or null if there is no such
 * bay. `i` is the bay index.
 */
function bayList(group, i) {
  const fit = S().loadout && S().loadout[shipId()];
  if (!fit) return null;
  const list = fit[group];
  if (!Array.isArray(list) || !Number.isInteger(i) || i < 0 || i >= list.length) return null;
  return list;
}

/**
 * Spare parts in storage that would fit a `group` bay, in the order they
 * arrived: one entry per part, so three beams are three "beam_basic"s.
 */
export function storedFor(group) {
  const out = [];
  for (const { id, n } of itemsAt(STATION)) {
    if (!isModule(id) || MODULES[id].g !== group) continue;
    for (let i = 0; i < n; i++) out.push(id);
  }
  return out;
}

/** The module fitted in one bay, or null. */
export function fittedAt(group, i) {
  const list = bayList(group, i);
  return list ? list[i] || null : null;
}

/**
 * Put stored module `id` into bay `i` of `group`. A part already in that bay
 * moves to storage. Returns a message for the panel, or undefined if the bay
 * does not exist (the screen is out of date).
 */
export function fitModule(group, i, id) {
  const list = bayList(group, i);
  if (!list) return undefined;

  const m = MODULES[id];
  if (!m || m.g !== group) return "That module does not fit in that bay.";

  if (!countOf(STATION, id)) return "That module is not in storage.";

  const replaced = list[i];
  // The part that comes out needs somewhere to go; the one going in frees its own space.
  if (replaced && itemVol(replaced) > freeOf(STATION) + itemVol(id)) {
    return `No room in ${nameOf(STATION)} for the ${MODULES[replaced].n}. Make space in the Inventory tab.`;
  }
  takeItem(STATION, id, 1);
  if (replaced) addItem(STATION, replaced, 1);
  list[i] = id;

  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  return replaced
    ? `Fitted ${m.n}. ${MODULES[replaced].n} moved to storage.`
    : `Fitted ${m.n}.`;
}

/** Take whatever is in bay `i` of `group` out and put it in storage. */
export function unequip(group, i) {
  const list = bayList(group, i);
  if (!list) return undefined;

  const id = list[i];
  if (!id) return "That bay is already empty.";
  if (itemVol(id) > freeOf(STATION)) {
    return `No room in ${nameOf(STATION)} for the ${MODULES[id].n}. Make space in the Inventory tab.`;
  }

  list[i] = null;
  addItem(STATION, id, 1);

  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  return `${MODULES[id].n} moved to storage.`;
}

/** True when `group` is a real bay group on the ship being flown. */
export const isBayGroup = group => Object.prototype.hasOwnProperty.call(layoutFor(shipId()), group);

/** How many of module `id` the player owns: in the station's storage, carried in
 *  any ship's hold, or fitted in any bay of any owned hull. */
export function ownedCount(id) {
  const p = S();
  let n = (p.store && p.store[id]) || 0;
  for (const hold of Object.values(p.holds || {})) n += (hold && hold[id]) || 0;
  for (const fit of Object.values(p.loadout || {})) {
    for (const bays of Object.values(fit || {})) {
      if (Array.isArray(bays)) n += bays.filter(m => m === id).length;
    }
  }
  return n;
}

/** True when the player owns at least one module `id` (see ownedCount). */
export const ownsModule = id => ownedCount(id) > 0;
