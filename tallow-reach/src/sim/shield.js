// The ship's shields: how many Shield HP they hold, how fast they come back, and how
// long a lull in the fighting has to last before they start.
//
// A shield module carries five numbers (data/modules.js):
//   sh      Shield HP it holds when full
//   regen   Shield HP per second once it is recharging
//   delay   seconds without taking a hit before recharging starts again
//   draw    MJ/s the shields use, flat, all the while they are up
//   drain   Shield HP a second they lose when the ship cannot supply `draw`
//
// Keeping shields up is not free: the basic module wants a flat 2 MJ/s whether
// they are full, filling or under fire. That figure goes into the ship's power
// bill through `setDraw("shield", ...)` in sim/power.js, so the HUD's
// "Using X of Y MJ/s" always includes it while a shield module is fitted.
//
// If the ship cannot supply that much (no powerplant and flat cells) the shields
// stop holding themselves together: they bleed away at `drain` Shield HP a second,
// down to 0, and stay at 0 until the ship can pay for them again.
//
// Any hit stops the recharge dead: hurt() in sim/player.js stamps the time of the
// last hit, and the shields stay exactly where they are until that was `delay`
// seconds ago. After the lull they recharge at the full `regen` rate until full,
// which is why a fight you break off gets easier. With no shield module fitted the
// ship has no shields at all: every hit goes straight to the hull.
//
// Later shield modules will have special features, for example trickling back even
// while under fire. That belongs here as one more field on the module (say `live`
// for a reduced under-fire rate, read by updateShield) — nothing outside this file
// needs to know about it.

import { MODULES } from "../data/modules.js";
import { state } from "../state/state.js";
import { setDraw, hasPower } from "./power.js";

/** The best shield in `loadout`, or null if none is fitted. */
function shieldIn(loadout) {
  let best = null;
  for (const id of (loadout && loadout.shield) || []) {
    const m = MODULES[id];
    if (m && m.sh && (!best || m.sh > best.sh)) best = m;
  }
  return best;
}

/**
 * Shield figures for a loadout: Shield HP, Shield HP per second, and the seconds of
 * peace needed before they start coming back. Pure, so it can be tested.
 * No shield fitted is 0 / 0 / 0.
 */
export function shieldOf(loadout) {
  const m = shieldIn(loadout);
  if (!m) return { cap: 0, regen: 0, delay: 0, draw: 0, drain: 0 };
  return {
    cap: m.sh,
    regen: m.regen || 0,
    delay: m.delay || 0,
    draw: m.draw || 0,      // MJ/s the shields take, flat, while they are up
    drain: m.drain || 0,    // Shield HP a second lost when that cannot be paid
  };
}

/**
 * Power the shields are asking for, in MJ/s: one flat figure whenever a shield
 * module is fitted, no matter what the shields are doing. None fitted is 0. Pure.
 */
export function shieldDraw(shield) {
  if (!shield || !(shield.cap > 0)) return 0;
  return shield.draw || 0;
}

/**
 * Rebuild state.shield from the save. Call after a fit change, a ship change, a
 * save load or a dock, the way sim/drive.js refreshes the drive. While docked the
 * new shields are filled, because the outpost services the ship.
 */
export function refreshShield(P = state.player, S = state.profile) {
  if (P && P !== state.player && arguments.length < 2) throw new Error("Non-local fitting requires an explicit fit profile");
  const shield = P?.shield || state.shield;
  Object.assign(shield, shieldOf((S.loadout || {})[S.ship]));
  if (!P) return;
  P.shMax = shield.cap;
  P.sh = P.docked ? P.shMax : Math.min(P.sh, P.shMax);
}

/**
 * One frame of shields: charge the ship for keeping them up, recharge only once
 * `delay` seconds have passed without a hit, and never past the maximum. With no
 * power to pay the bill the shields bleed away instead, and if they reach 0 they
 * stay there until the ship can supply `draw` again.
 */
export function updateShield(dt, P = state.player, sh = null, power = null) {
  if (!P) return;
  if (P !== state.player && ((!P.configured && (!sh || !power)) || power === state.power || sh === state.shield)) {
    throw new Error("Non-local shield updates require their own shield and power");
  }
  sh = sh || P.shield || state.shield;
  power = power || P.power || state.power;
  if (P !== state.player && (sh === state.shield || power === state.power)) {
    throw new Error("Non-local shield updates require their own shield and power");
  }

  if (P.shMax <= 0) {
    P.sh = 0;                       // no shield module: nothing to run or recharge
    setDraw("shield", 0, power);
    return;
  }

  // One flat bill while they are up, whatever they are doing.
  setDraw("shield", shieldDraw(sh), power);

  // Cannot pay for them: the field collapses, slowly, and does not come back
  // until the ship can supply the draw again.
  if (!hasPower(power.draw, power)) {
    P.sh = Math.max(0, P.sh - sh.drain * dt);
    return;
  }

  // Powered, so the usual rule applies: no recharge until the lull is over.
  if (state.time - P.last < sh.delay) return;
  if (P.sh < P.shMax) P.sh = Math.min(P.shMax, P.sh + sh.regen * dt);
}
