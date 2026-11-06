// Moving modules between the ship and storage.
//
// Fitting costs nothing and is done at the outpost: a part comes out of storage
// and into a bay, and whatever was in that bay goes back into storage. Every
// change refreshes the ship's power budget (sim/power.js), its drive
// (sim/drive.js), its shields (sim/shield.js) and its guns (sim/guns.js),
// because that is what turns a fitted part into numbers the game uses.
//
// The save shape is one array per hull and group in profile.loadout (one entry
// per bay, null = empty) and a flat list of spare parts in profile.modules. The
// Outfitting screen reads both; this file is the only thing that writes them.

import { MODULES } from "../data/modules.js";
import { layoutFor } from "../data/outfitting.js";
import { state } from "../state/state.js";
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

/** Spare parts in storage that would fit a `group` bay, in stored order. */
export function storedFor(group) {
  return (S().modules || []).filter(id => MODULES[id] && MODULES[id].g === group);
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

  const stored = S().modules || (S().modules = []);
  const at = stored.indexOf(id);
  if (at < 0) return "That module is not in storage.";

  stored.splice(at, 1);
  const replaced = list[i];
  if (replaced) stored.push(replaced);
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

  list[i] = null;
  (S().modules || (S().modules = [])).push(id);

  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  return `${MODULES[id].n} moved to storage.`;
}

/** True when `group` is a real bay group on the ship being flown. */
export const isBayGroup = group => Object.prototype.hasOwnProperty.call(layoutFor(shipId()), group);

/** True when the player owns module `id` — in storage, or fitted in any bay of any
 *  owned hull (a fitted part is owned, it is just not in storage right now). */
export function ownsModule(id) {
  const p = S();
  if ((p.modules || []).includes(id)) return true;
  for (const fit of Object.values(p.loadout || {})) {
    for (const bays of Object.values(fit || {})) {
      if (Array.isArray(bays) && bays.includes(id)) return true;
    }
  }
  return false;
}
