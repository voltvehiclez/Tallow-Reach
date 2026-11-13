// Moving modules between a pilot's ship and the current station's storage.
//
// Fitting costs nothing and is done while docked: a part comes out of the
// current station inventory and into a bay in `profile.loadout[ship]`, and
// whatever was in that bay goes back into that same station. Every change
// refreshes the target pilot's power, drive, shields, hull and guns.

import { MODULES } from "../data/modules.js";
import { layoutFor } from "../data/outfitting.js";
import { isModule, itemVol } from "../data/items.js";
import { state, profileOf } from "../state/state.js";
import { STATION, addItem, countOf, freeOf, itemsAt, nameOf, takeItem } from "./inventory.js";
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshHull } from "./hull.js";
import { refreshGuns } from "./guns.js";

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

  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshHull(P, profile);
  refreshGuns(P, profile);
  return `${MODULES[id].n} moved to storage.`;
}

/** True when `group` is a real bay group on the ship being flown. */
export const isBayGroup = (group, profile = state.profile) =>
  Object.prototype.hasOwnProperty.call(layoutFor(profile.ship), group);

/**
 * How many of module `id` are owned across `world`'s station storage,
 * `profile`'s ship holds, and bays of `profile`'s loadouts.
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
