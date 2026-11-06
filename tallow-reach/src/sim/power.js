// Ship power: what the fitted powerplants make, what the power cells hold, and
// what the ship is drawing.
//
// The thrusters are the only thing that draws power today: 2 MJ/s while the
// throttle is off centre, another 1 MJ/s while the boost is burning, and a flat
// 20 MJ each time the boost lights (see data/modules.js and sim/drive.js).
// Refilling the boost meter afterwards is free. sim/player.js writes the per-second
// figure to state.power.draw every frame and takes the 20 MJ straight out of
// `stored`; `hasPower()` answers whether the ship can pay a per-second demand at
// all. When something else needs energy (shields, the mining beam, ...) it adds
// its share to `draw` and asks `hasPower()` before it works.
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

/**
 * Can the ship pay for `mjps` right now, out of the cells or straight off the
 * powerplant? False when the cells are empty and the plants make less than the
 * demand, which is what stops the thrusters when a ship runs dry. Pure.
 */
export function hasPower(mjps = 0, p = state.power) {
  if (mjps <= 0) return true;
  if (p.stored > 0) return true;
  return p.gen >= mjps;
}

/** One frame of the power budget: cells take in what is made, give out what is used. */
export function updatePower(dt) {
  const p = state.power;
  const net = p.gen - p.draw;      // MJ/s
  p.stored = Math.max(0, Math.min(p.cap, p.stored + net * dt));
}
