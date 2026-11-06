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
// The drive also carries the thrusters' appetite for power (draw per second while
// the throttle is off centre, a top-up while the boost charges, and a flat cost
// each time the boost lights). sim/player.js asks `driveDraw()` for the figure and
// pays it out of the power cells in sim/power.js.
//
// Later thruster modules also carry acceleration and boost strength. Those land
// in this file and in the flight model, which already reads state.drive.

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
  if (!t) return { spd: 0, turn: 0, draw: 0, charge: 0, ignite: 0 };
  return {
    spd: t.spd,
    turn: t.turn,
    draw: t.draw || 0,     // MJ/s while the throttle is off centre
    charge: t.chg || 0,    // extra MJ/s while the boost meter is filling
    ignite: t.ign || 0,    // MJ spent once when the boost lights
  };
}

/** Does this drive move the ship at all? False with no thruster fitted. */
export const hasDrive = drive => !!drive && drive.spd > 0;

/**
 * Power the thrusters are asking for right now, in MJ/s. Any throttle setting
 * other than zero runs the drive (including reverse), and a filling boost meter
 * adds its top-up on top. Pure, so it can be tested.
 */
export function driveDraw(drive, throttle, chargingBoost) {
  if (!hasDrive(drive)) return 0;
  const running = throttle !== 0 ? drive.draw || 0 : 0;
  return running + (chargingBoost ? drive.charge || 0 : 0);
}

/**
 * Rebuild state.drive from the save. Call after a fit change, a ship change,
 * loading a game, or undocking, the way sim/power.js refreshes state.power.
 */
export function refreshDrive() {
  const S = state.profile;
  Object.assign(state.drive, driveOf((S.loadout || {})[S.ship]));
}
