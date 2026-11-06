// The ship's drive: top speed and turn rate, taken from the thrusters fitted in
// the thruster bay.
//
// Movement reads state.drive and nothing else, so swapping a thruster changes
// the way the ship flies the moment it is fitted. Today every hull uses the same
// reference drive (data/modules.js), which is why a Bulwark flies like a Wasp:
// hull differences are a later job, and they belong here as multipliers on top
// of the thruster's numbers.
//
// Later thruster modules also carry acceleration, boost and power draw. Those
// land in this file and in the flight model, which already reads state.drive.
//
// A hull with no thruster fitted falls back to its own `spd`/`turn` from
// data/ships.js. That keeps a player who leaves the outpost with an empty
// bay from being stranded in space with no way back.

import { MODULES } from "../data/modules.js";
import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
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

/** Top speed and turn rate for `loadout` on hull `shipId`. Pure, so it can be tested. */
export function driveOf(loadout, shipId) {
  const t = thrusterIn(loadout),
    hull = SHIPS[shipId] || SHIPS[DEFAULT_SHIP];
  return t ? { spd: t.spd, turn: t.turn } : { spd: hull.spd, turn: hull.turn };
}

/**
 * Rebuild state.drive from the save. Call after a fit change, a ship change, or
 * loading a game, the way sim/power.js refreshes state.power.
 */
export function refreshDrive() {
  const S = state.profile;
  Object.assign(state.drive, driveOf((S.loadout || {})[S.ship], S.ship));
}
