// The ship's Hull HP: how many Hull HP the fitted hull module grants.
//
// A hull module carries one number (data/modules.js):
//   hp      Hull HP the hull has
//
// Hull HP work exactly like Shield HP: the fitted module decides how
// many there are, and no module fitted means none at all. A ship at 0 or fewer
// Hull HP dies on the first hit that reaches the hull (see hurt() in
// sim/player.js). Shields, if a shield module is fitted, still absorb their hits
// first. (Shields are sim/shield.js — same rule, with recharge rules on top.)
//
// Hull HP do not recharge and do not cost power: damage is only ever
// repaired at the outpost, for credits.
//
// Which ship each fraction of Hull HP belongs to lives in profile.hp[ship];
// sim/player.js stamps it on every hull hit and docking saves it too, so a ship
// that changes hull module — or a hull that changes ships — never forgets the
// fraction it has left. Taking the module off at the outpost leaves the ship
// with no Hull HP until it is fitted again, but fitting it back restores
// the fraction it had; it takes actual repairs to top it up.

import { MODULES } from "../data/modules.js";
import { state } from "../state/state.js";
import { clamp } from "../util/math.js";

/** The best hull module in `loadout`, or null if none is fitted. */
function hullIn(loadout) {
  let best = null;
  for (const id of (loadout && loadout.hull) || []) {
    const m = MODULES[id];
    if (m && m.hp && (!best || m.hp > best.hp)) best = m;
  }
  return best;
}

/**
 * Hull Hull HP for a loadout. Pure, so it can be tested.
 * No hull module fitted is 0 — any hull damage then destroys the ship.
 */
export function hullOf(loadout) {
  const m = hullIn(loadout);
  return m ? m.hp : 0;
}

/**
 * Rebuild state.hull and the flying ship's Hull HP from the saved fit.
 * Call after a fit change, a ship change, a save load or a dock, the way
 * sim/shield.js refreshes the shields. The saved fraction (profile.hp[ship])
 * is applied: nothing here repairs the ship.
 */
export function refreshHull() {
  const S = state.profile;
  const cap = hullOf((S.loadout || {})[S.ship]);
  state.hull = { cap };
  const P = state.player;
  if (!P) return;
  P.hullMax = cap;
  P.hull = cap * clamp(S.hp[S.ship] ?? 1, 0, 1);
}
