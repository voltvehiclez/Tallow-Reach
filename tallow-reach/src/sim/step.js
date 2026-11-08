// The gameplay tick (step 8a). The browser controls how often it renders; this
// module runs only the sim, in the old update order and without a screen.
import { state } from "../state/state.js";
import { flight } from "./player.js";
import { updateShield } from "./shield.js";
import { updatePower } from "./power.js";
import { updateWarp } from "./sectors.js";
import { updatePrimary, updateMissiles } from "./weapons.js";
import { updateMissileFlight } from "./missile.js";
import { pruneLock } from "./targeting.js";
import { updateEnemies } from "./ai.js";
import { updateBullets, updateCrates } from "./combat.js";
import { updateEffects } from "./effects.js";
import { SIM_DT, MAX_FRAME_DT } from "../data/simulation.js";

/** One simulation tick. Caller does not step while paused. */
export function stepSim(dt) {
  state.time += dt;
  // A hint lasts until the next sim tick, not just a display frame. This keeps
  // it visible when a display renders more than once between sim ticks.
  state.hud.prompt = "";
  // Local first preserves the old single-player ordering. Other players have
  // independent per-ship runtime; shared world systems are stepped exactly once.
  const local = state.player;
  const active = state.players.filter(p => p && !p.docked && !p.dead);
  const ordered = local && active.includes(local) ? [local, ...active.filter(p => p !== local)] : active;
  for (const player of ordered) {
    flight(dt, player);
    updateShield(dt, player);
    updatePower(dt, player);
    // Sector/warp transition ownership belongs to step 10.
    if (player === local) updateWarp(dt);
    updatePrimary(dt, player);
    updateMissiles(dt, player, false);
    if (player !== local) pruneLock(player);
  }
  if (ordered.length) {
    updateMissileFlight(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateCrates(dt);
  }
  updateEffects(dt);
}

/**
 * Accumulate render time and call `step` in fixed increments. Long frames are
 * capped at the same 0.05 seconds as the old frame loop. Call only unpaused;
 * the fractional remainder survives a pause, but paused time is never added.
 */
export function createSimClock(step = stepSim) {
  let remainder = 0;
  return {
    advance(frameDt) {
      if (!Number.isFinite(frameDt) || frameDt <= 0) return 0;
      remainder += Math.min(MAX_FRAME_DT, frameDt);
      let count = 0;
      // A tiny rounding tolerance avoids losing a tick to floating-point sums.
      while (remainder + SIM_DT * 1e-9 >= SIM_DT) {
        step(SIM_DT);
        remainder = Math.max(0, remainder - SIM_DT);
        count++;
      }
      return count;
    },
  };
}
