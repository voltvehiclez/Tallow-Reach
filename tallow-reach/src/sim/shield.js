// The ship's shields: how many points they hold, how fast they come back, and how
// long a lull in the fighting has to last before they start.
//
// A shield module carries five numbers (data/modules.js):
//   sh      points it holds when full
//   regen   points per second once it is recharging
//   delay   seconds without taking a hit before recharging starts again
//   draw    MJ/s the shields use all the time while they are up
//   chg     extra MJ/s while they are actually recharging
//
// Keeping shields up is not free: 1 MJ/s with the basic module, 2 MJ/s in total
// while they are filling. The figure goes into the ship's power bill through
// `setDraw("shield", ...)` in sim/power.js, so the HUD's "Using X of Y MJ/s"
// moves when the shields start and stop recharging.
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
 * Shield figures for a loadout: points, points per second, and the seconds of
 * peace needed before they start coming back. Pure, so it can be tested.
 * No shield fitted is 0 / 0 / 0.
 */
export function shieldOf(loadout) {
  const m = shieldIn(loadout);
  if (!m) return { cap: 0, regen: 0, delay: 0, draw: 0, charge: 0 };
  return {
    cap: m.sh,
    regen: m.regen || 0,
    delay: m.delay || 0,
    draw: m.draw || 0,      // MJ/s while the shields are up
    charge: m.chg || 0,     // extra MJ/s while they are recharging
  };
}

/**
 * Power the shields are asking for right now, in MJ/s: their standing draw plus
 * the extra while they are actually filling. No shields fitted is 0. Pure.
 */
export function shieldDraw(shield, recharging) {
  if (!shield || !(shield.cap > 0)) return 0;
  return (shield.draw || 0) + (recharging ? shield.charge || 0 : 0);
}

/**
 * Rebuild state.shield from the save. Call after a fit change, a ship change, a
 * save load or a dock, the way sim/drive.js refreshes the drive. While docked the
 * new shields are filled, because the outpost services the ship.
 */
export function refreshShield() {
  const S = state.profile;
  Object.assign(state.shield, shieldOf((S.loadout || {})[S.ship]));
  const P = state.player;
  if (!P) return;
  P.shMax = state.shield.cap;
  P.sh = P.docked ? P.shMax : Math.min(P.sh, P.shMax);
}

/**
 * One frame of shields: charge the ship for keeping them up, recharge only once
 * `delay` seconds have passed without a hit, and never past the maximum.
 */
export function updateShield(dt) {
  const P = state.player;
  if (!P) return;
  const sh = state.shield;

  if (P.shMax <= 0) {
    P.sh = 0;                       // no shield module: nothing to run or recharge
    setDraw("shield", 0);
    return;
  }

  // They are up, so they cost their standing draw; they add the extra only while
  // they are actually filling (past the lull and not already full).
  const lull = state.time - P.last >= sh.delay;
  let recharging = lull && P.sh < P.shMax;
  setDraw("shield", shieldDraw(sh, recharging));

  // No power to pay for it: the shields hold where they are and stop filling.
  if (recharging && !hasPower(state.power.draw)) {
    recharging = false;
    setDraw("shield", shieldDraw(sh, false));
  }

  if (recharging) P.sh = Math.min(P.shMax, P.sh + sh.regen * dt);
}
