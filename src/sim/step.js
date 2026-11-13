// The gameplay tick (step 8a). The browser controls how often it renders; this
// module runs only the sim, in the old update order and without a screen.
import { state } from "../state/state.js";
import { emit } from "../util/events.js";
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
import { updatePlaceMemory } from "./place-memory.js";
import { SIM_DT, MAX_FRAME_DT } from "../data/simulation.js";

/** The frame loop's pause gate. A hosted multiplayer world never pauses merely
 *  because the host opened a local chart; explicit pause still stops this session. */
export function isSimulationPaused() {
  // Only the pause card and the title screen stop the clock. The starmap and the
  // flight inventory are read-only overlays: the world keeps running behind them.
  return !!(state.paused || state.ui.intro);
}

/** One simulation tick. Caller does not step while paused. */
export function stepSim(dt) {
  state.time += dt;
  updatePlaceMemory(dt);
  // A hint lasts until the next sim tick, not just a display frame. This keeps
  // it visible when a display renders more than once between sim ticks.
  state.hud.prompt = "";
  // Local first preserves the old single-player ordering. Other players have
  // independent per-ship runtime; shared world systems are stepped exactly once.
  const local = state.player;
  const active = state.players.filter(p => p && !p.docked && !p.dead);
  const ordered = local && active.includes(local) ? [local, ...active.filter(p => p !== local)] : active;
  // Personal systems run local-first, exactly as before. A warp can move a
  // pilot mid-tick, so shared systems are grouped by where each pilot ends up.
  const byPlace = new Map();
  for (const player of ordered) {
    flight(dt, player);
    updateShield(dt, player);
    updatePower(dt, player);
    updateWarp(dt, player);
    updatePrimary(dt, player);
    updateMissiles(dt, player, false);
    emit("mission-tick", { dt, player });
    if (player !== local) pruneLock(player);
    if (!player.docked && !player.dead) {
      const id = player.place || state.place;
      if (!byPlace.has(id)) byPlace.set(id, true);
    }
  }
  for (const placeId of byPlace.keys()) {
    updateMissileFlight(dt, placeId);
    updateEnemies(dt, placeId);
    updateBullets(dt, placeId);
    updateCrates(dt, placeId);
  }
  for (const placeId of state.places.keys()) updateEffects(dt, placeId);
}

/**
 * Accumulate render time and call `step` in fixed increments. Long frames are
 * capped at the same 0.05 seconds as the old frame loop. Call only unpaused;
 * the fractional remainder survives a pause, but paused time is never added.
 * `alpha()` returns the `[0, 1]` fraction between the previous and latest tick
 * so `render/` can interpolate smoothly on high-refresh displays (e.g. 240 Hz).
 */
export function createSimClock(step = stepSim, hooks = {}) {
  let remainder = 0;
  return {
    advance(frameDt) {
      if (!Number.isFinite(frameDt) || frameDt <= 0) return 0;
      remainder += Math.min(MAX_FRAME_DT, frameDt);
      let count = 0;
      // A tiny rounding tolerance avoids losing a tick to floating-point sums.
      while (remainder + SIM_DT * 1e-9 >= SIM_DT) {
        if (hooks.beforeStep) hooks.beforeStep();
        step(SIM_DT);
        if (hooks.afterStep) hooks.afterStep();
        remainder = Math.max(0, remainder - SIM_DT);
        count++;
      }
      return count;
    },
    alpha() {
      return Math.min(1, Math.max(0, remainder / SIM_DT));
    },
  };
}
