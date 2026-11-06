// Ship power: what the fitted powerplants make, what the power cells hold, and
// what the ship is drawing.
//
// Nothing consumes power yet, so the cells charge to full in the first seconds
// of a flight and then stay there. The accounting is real rather than faked, so
// the first system that needs energy (shields, the mining beam, ...) only has to
// add to `draw` and the bar starts moving.
//
// Figures come from the fitted modules in the save (profile.loadout[ship]),
// through MODULES in data/modules.js. The HUD reads state.power; it does not
// work anything out for itself.

import { MODULES } from "../data/modules.js";
import { state } from "../state/state.js";

/**
 * Energy figures for one hull's loadout ({ groupId: [moduleId | null, ...] }).
 * Pure, so it can be tested without a game. A powerplant adds `mjps`, a power
 * cell adds `mj`; other modules are ignored here.
 */
export function powerOf(loadout) {
  let gen = 0,
    cap = 0;
  for (const bays of Object.values(loadout || {})) {
    for (const id of bays) {
      const m = MODULES[id];
      if (!m) continue;
      if (m.mjps) gen += m.mjps;
      if (m.mj) cap += m.mj;
    }
  }
  return { gen, cap };
}

/** The loadout fitted to the ship being flown, or an empty object. */
const fitted = () => (state.profile.loadout || {})[state.profile.ship] || {};

/**
 * Rebuild state.power from the save. Call after anything that changes which
 * modules are fitted, or which ship is being flown. Energy already in the
 * cells is kept, but cannot exceed the new capacity.
 */
export function refreshPower() {
  const { gen, cap } = powerOf(fitted());
  const p = state.power;
  p.gen = gen;
  p.cap = cap;
  p.stored = Math.min(p.stored, cap);
  p.draw = 0;
}

/** Docked at the outpost: the cells are filled. Call on dock, launch and load. */
export function refillPower() {
  refreshPower();
  state.power.stored = state.power.cap;
}

/** One frame of the power budget: cells take in what is made, give out what is used. */
export function updatePower(dt) {
  const p = state.power;
  const net = p.gen - p.draw;      // MJ/s
  p.stored = Math.max(0, Math.min(p.cap, p.stored + net * dt));
}
