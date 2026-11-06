// The guns fitted in the primary weapon bays.
//
// A gun is a module in the `primary` group (data/modules.js). A hull has two
// primary bays; putting the same gun in either one works the same way, and both
// fire together on left click, each with its own cooldown. The bay only decides
// which barrel the shot comes out of.
//
// Kept out of sim/weapons.js so that sim/economy.js and sim/fitting.js can
// refresh the list without importing the shooting code.

import { MODULES } from "../data/modules.js";
import { state } from "../state/state.js";

/**
 * The guns fitted in the primary bays, in bay order. Only primary modules with a
 * `dmg` count as guns (the mining beam is a separate tool). Pure, so it can be
 * tested without a game.
 *
 *   i      bay index (0 or 1), used for the barrel the shot comes from
 *   id     module id, so the panel can name it
 *   dmg    damage a shot, before the hull's dmg multiplier
 *   rate   shots a second
 *   speed  bullet speed
 *   draw   MJ/s the gun asks for while the trigger is held
 */
export function gunsOf(loadout) {
  const guns = [];
  ((loadout && loadout.primary) || []).forEach((id, i) => {
    const m = MODULES[id];
    if (!m || m.g !== "primary" || !m.dmg) return;
    guns.push({
      i,
      id,
      n: m.n,
      dmg: m.dmg,
      rate: m.rate || 1,
      speed: m.bspd || 900,
      draw: m.draw || 0,
    });
  });
  return guns;
}

/**
 * Rebuild state.guns from the save. Call after a fit change, a ship change, a
 * save load or a dock, the way the drive and the shields are refreshed.
 */
export function refreshGuns() {
  const S = state.profile;
  state.guns = gunsOf((S.loadout || {})[S.ship]);
  state.flight.gunCd = state.guns.map(() => 0);
}
