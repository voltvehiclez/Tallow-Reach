// Ship power: what the fitted powerplants make, what the power cells hold, and
// what the ship is drawing.
//
// Three things draw power today, and every figure comes from the fitted modules
// in data/modules.js:
//
//   drive   2 MJ/s while the throttle is off centre, another 1 MJ/s while the
//           boost is burning, and a flat 20 MJ each time the boost lights.
//   shield  2 MJ/s whenever the shields are up (sim/shield.js).
//   guns    2 MJ/s a gun while the trigger is held (sim/guns.js).
//
// Refilling the boost meter is free.
//
// Each system writes its own figure with `setDraw("drive" | "shield" | "guns",
// mjps)` once a frame; `draw` is the sum, which is what the HUD shows and what
// `hasPower()` checks. The 20 MJ boost ignition is taken straight out of
// `stored` instead. A new consumer adds a name to `state.power.use` and calls
// `setDraw()` with it.
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
  for (const system of Object.keys(p.use)) setDraw(system, 0);
}

/**
 * Record what one system is asking for, in MJ/s, and rebuild the total. Systems
 * call this every frame while they are running; nothing else writes `draw`.
 */
export function setDraw(system, mjps) {
  const p = state.power;
  p.use[system] = Math.max(0, +mjps || 0);
  p.draw = Object.values(p.use).reduce((a, b) => a + b, 0);
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
