// THE shared flight model: one way for every ship in the game to turn, strafe,
// accelerate and boost. The player and every NPC (hostile, friendly, story ship,
// escort) move through stepFlight(); only the numbers differ, and those numbers
// are data — the player's come from the fitted thrusters (sim/drive.js), an
// NPC's from its own `flight` block in data/enemies.js.
//
// A ship record needs: pos, quat, v, thr (-1..1), bs (boost ramp 0..1), boost.
// The stats object is:
//   { speed, turn, strafe, lift, reverse, ease, boostEase, boostSpeed }
// speed/turn are the raw drive numbers; the shared FLIGHT table in
// data/ships.js scales turning and supplies the axis factors, exactly as the
// player model always has. boostSpeed is the EXTRA forward speed a burning
// boost adds (a stock Wasp: +150 on top of its 150).
//
// Power, boost fuel and collisions are NOT here: the player keeps those in
// sim/player.js around this call, and NPCs fly on an unlimited drive today
// (pass `power: { hasPower: () => false }` later to change that — the hook is
// `boostAllowed`; nothing else needs to move).

import { V, Q, clamp } from "../util/math.js";
import { FLIGHT } from "../data/ships.js";

const _qx = Q(), _qy = Q(), _qz = Q();
const XAXIS = V(1, 0, 0), YAXIS = V(0, 1, 0), ZAXIS = V(0, 0, 1);

const deadzone = v => (Math.abs(v) < FLIGHT.deadzone ? 0 : v - Math.sign(v) * FLIGHT.deadzone);

/** Fill a flight-stats object out from the default set in data/ships.js. */
export function completeFlightStats(partial = {}) {
  const d = FLIGHT.defaultStats;
  const out = {};
  for (const key of Object.keys(d)) out[key] = Number.isFinite(+partial?.[key]) ? +partial[key] : d[key];
  return out;
}

/**
 * Move one ship for dt seconds. `input` is the pilot's intent, whoever the
 * pilot is:
 *   yaw, pitch, roll   stick, -1..1 (already deadzoned here, as the player's was)
 *   thrust             -1/0/1 throttle keys: thr moves at FLIGHT.throttleRate
 *   throttleTarget     instead of thrust: a number thr steers toward (NPC pilot)
 *   stop, brake        throttle cut / brake, as the player's X and Ctrl
 *   strafe, lift       -1..1 lateral intent
 *   boost              the pilot wants boost
 *   boostAllowed       the ship may light it (power/fuel/rules; NPCs: true)
 *   onBoostIgnite      called once, the tick the boost lights
 * Returns the ship, mutated.
 */
export function stepFlight(ship, stats, input = {}, dt = 0) {
  if (!(dt > 0)) return ship;
  const s = completeFlightStats(stats);
  ship.thr = clamp(+ship.thr || 0, -1, 1);
  ship.bs = clamp(+ship.bs || 0, 0, 1);

  // Turn on the ship's own axes — yaw, then pitch, then roll, each a local
  // rotation multiplied onto the end, exactly the player's old order.
  const turn = s.turn * FLIGHT.turn;
  ship.quat
    .multiply(_qy.setFromAxisAngle(YAXIS, -deadzone(clamp(+input.yaw || 0, -1, 1)) * FLIGHT.yawFactor * turn * dt))
    .multiply(_qx.setFromAxisAngle(XAXIS, -deadzone(clamp(+input.pitch || 0, -1, 1)) * FLIGHT.pitchFactor * turn * dt))
    .multiply(_qz.setFromAxisAngle(ZAXIS, clamp(+input.roll || 0, -1, 1) * FLIGHT.rollFactor * turn * dt));

  // Throttle. A pilot with keys walks thr up and down; a pilot with a target
  // (the NPC adapter) steers thr toward it at the same rate, so both are
  // limited by the same throttle, not just the same top speed.
  if (Number.isFinite(+input.throttleTarget) && input.throttleTarget !== null && input.throttleTarget !== undefined) {
    const target = clamp(+input.throttleTarget, -1, 1);
    const step = FLIGHT.throttleRate * dt;
    ship.thr = ship.thr < target ? Math.min(target, ship.thr + step) : Math.max(target, ship.thr - step);
  } else {
    if (+input.thrust > 0) ship.thr = Math.min(1, ship.thr + FLIGHT.throttleRate * dt);
    if (+input.thrust < 0) ship.thr = Math.max(-1, ship.thr - FLIGHT.throttleRate * dt);
  }
  if (input.stop) ship.thr = 0;
  if (input.brake) {
    ship.thr = ship.thr > 0
      ? Math.max(0, ship.thr - FLIGHT.brakeRate * dt)
      : ship.thr < 0 ? Math.min(0, ship.thr + FLIGHT.brakeRate * dt) : 0;
  }

  // Boost spool: 0.4 s up, fast down. Lighting it is the caller's one moment
  // (the player pays its ignition slug there; an NPC has nothing to pay).
  const wantBoost = !!input.boost && input.boostAllowed !== false && s.boostSpeed > 0;
  const wasBoosting = ship.boost === true;
  ship.bs = wantBoost ? Math.min(1, ship.bs + dt / FLIGHT.boostRampSec) : Math.max(0, ship.bs - dt * FLIGHT.boostFallRate);
  ship.boost = ship.bs >= 1;
  if (ship.boost && !wasBoosting) {
    ship.thr = 1;
    if (typeof input.onBoostIgnite === "function") input.onBoostIgnite(ship);
  }

  // Velocity eases toward the target the controls ask for; boost eases harder.
  const f = V(0, 0, -1).applyQuaternion(ship.quat);
  const right = V(1, 0, 0).applyQuaternion(ship.quat);
  const up = V(0, 1, 0).applyQuaternion(ship.quat);
  const throttle = ship.thr >= 0 ? ship.thr : ship.thr * s.reverse;
  const target = f
    .multiplyScalar(throttle * s.speed + (ship.boost ? s.boostSpeed : 0))
    .addScaledVector(right, clamp(+input.strafe || 0, -1, 1) * s.speed * s.strafe)
    .addScaledVector(up, clamp(+input.lift || 0, -1, 1) * s.speed * s.lift);
  ship.v.lerp(target, 1 - Math.exp(-dt * (ship.boost ? s.boostEase : s.ease)));
  ship.pos.addScaledVector(ship.v, dt);
  return ship;
}
