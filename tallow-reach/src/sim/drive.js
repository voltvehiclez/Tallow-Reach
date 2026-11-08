// The ship's drive: top speed and turn rate, taken from the thrusters fitted in
// the thruster bay.
//
// Movement reads the acting player's drive (state.drive aliases the local one), so swapping a thruster changes
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
// The drive also carries the thrusters' appetite for power: a trickle while the
// throttle is off centre, a little more while the boost is burning, and one big
// slug (20 MJ on the basic thrusters) each time the boost lights. sim/player.js
// asks `driveDraw()` for the trickle and pays the slug out of the cells in
// sim/power.js. Refilling the boost meter costs nothing.
//
// Later thruster modules also carry acceleration and boost strength. Those land
// in this file and in the flight model, which reads the acting player's drive.

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
  if (!t) return { spd: 0, turn: 0, draw: 0, boost: 0, ignite: 0, bmax: 0, buse: 0, bfill: 0 };
  return {
    spd: t.spd,
    turn: t.turn,
    draw: t.draw || 0,     // MJ/s while the throttle is off centre
    boost: t.boost || 0,   // extra MJ/s while the boost is burning
    ignite: t.ign || 0,    // MJ spent in one go when the boost lights
    bmax: t.bmax || 0,     // boost fuel units the tank holds
    buse: t.buse || 0,     // units a second burned while boosting
    bfill: t.bfill || 0,   // units a second the tank refills at
  };
}

/** Does this drive move the ship at all? False with no thruster fitted. */
export const hasDrive = drive => !!drive && drive.spd > 0;

/**
 * Power the thrusters are asking for right now, in MJ/s. Any throttle setting
 * other than zero runs the drive (including reverse), and a burning boost adds
 * its share on top. Filling the boost meter is free and never shows up here.
 * Pure, so it can be tested.
 */
export function driveDraw(drive, throttle, boosting) {
  if (!hasDrive(drive)) return 0;
  const running = throttle !== 0 ? drive.draw || 0 : 0;
  return running + (boosting ? drive.boost || 0 : 0);
}

/**
 * Rebuild state.drive from the save. Call after a fit change, a ship change,
 * loading a game, or undocking, the way sim/power.js refreshes state.power.
 */
export function refreshDrive(P = state.player, S = state.profile) {
  if (P && P !== state.player && arguments.length < 2) throw new Error("Non-local fitting requires an explicit fit profile");
  const drive = P?.drive || state.drive;
  Object.assign(drive, driveOf((S.loadout || {})[S.ship]));
  // The boost tank belongs to the drive, so a new thruster means a new tank size.
  // Docked, the outpost fills it; in flight the fuel already aboard is kept.
  if (!P) return;
  P.enMax = drive.bmax;
  P.en = P.docked ? P.enMax : Math.min(P.en, P.enMax);
}
