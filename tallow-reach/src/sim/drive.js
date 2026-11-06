// The ship's drive: top speed and turn rate, taken from the thrusters fitted in
// the thruster bay.
//
// Movement reads state.drive and nothing else, so swapping a thruster changes
// the way the ship flies the moment it is fitted. With no thruster fitted the
// drive is 0 / 0 and the ship cannot move, turn or boost at all: undock with an
// empty thruster bay and you hang in space until you dock again (G) and fit one.
// The HUD says as much, and the launch message warns you.
//
// (An earlier version fell back to a speed of the hull's own, which let a ship
// with an empty bay fly anyway. That fallback is gone on purpose: a missing
// thruster now means a dead ship.)
//
// Today every hull uses the same drive, which is why a Bulwark flies like a
// Wasp: hull differences are a later job, and they belong here as multipliers on
// top of the thruster's numbers.
//
// Later thruster modules also carry acceleration, boost and power draw. Those
// land in this file and in the flight model, which already reads state.drive.

import { MODULES } from "../data/modules.js";
import { state } from "../state/state.js";

/** The strongest thruster in `loadout`, or null if none is fitted. */
function thrusterIn(loadout) {
  let best = null;
  for (const id of (loadout && loadout.thruster) || []) {
    const m = MODULES[id];
    if (m && m.spd && (!best || m.spd > best.spd)) best = m;
  }
  return best;
}

/**
 * Top speed and turn rate for `loadout`. Pure, so it can be tested.
 * No thruster fitted means 0 / 0: the ship is dead in space.
 */
export function driveOf(loadout) {
  const t = thrusterIn(loadout);
  return t ? { spd: t.spd, turn: t.turn } : { spd: 0, turn: 0 };
}

/** Does this drive move the ship at all? False with no thruster fitted. */
export const hasDrive = drive => !!drive && drive.spd > 0;

/**
 * Rebuild state.drive from the save. Call after a fit change, a ship change,
 * loading a game, or undocking, the way sim/power.js refreshes state.power.
 */
export function refreshDrive() {
  const S = state.profile;
  Object.assign(state.drive, driveOf((S.loadout || {})[S.ship]));
}
