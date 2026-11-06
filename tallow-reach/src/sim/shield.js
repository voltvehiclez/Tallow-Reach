// The ship's shields: how many points they hold, how fast they come back, and how
// long a lull in the fighting has to last before they start.
//
// A shield module carries three numbers (data/modules.js):
//   sh      points it holds when full
//   regen   points per second once it is recharging
//   delay   seconds without taking a hit before recharging starts again
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
  if (!m) return { cap: 0, regen: 0, delay: 0 };
  return { cap: m.sh, regen: m.regen || 0, delay: m.delay || 0 };
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
 * One frame of shields: recharge only once `delay` seconds have passed without a
 * hit, and never past the maximum.
 */
export function updateShield(dt) {
  const P = state.player;
  if (!P) return;
  if (P.shMax <= 0) {
    P.sh = 0;                       // no shield module: nothing to recharge
    return;
  }
  if (state.time - P.last < state.shield.delay) return;   // still under fire
  if (P.sh < P.shMax) P.sh = Math.min(P.shMax, P.sh + state.shield.regen * dt);
}
