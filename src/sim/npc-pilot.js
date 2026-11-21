// The NPC pilot: turns what the AI *wants* into the control inputs the shared
// flight model understands, so an NPC is limited by its own turn rate, throttle
// and top speed exactly like the player.
//
// The AI layers above this (sim/enemy-flight.js) still decide everything they
// always decided — approach, strafe, break, dodge, avoidance, story courses —
// and hand over a desired velocity plus a point to face. This adapter:
//   - works out the stick (yaw/pitch) that turns the nose toward that point,
//     proportional and clamped to -1..1, so the turn the model then applies can
//     never exceed the ship's own turn rate, and the stick eases off as the
//     nose arrives instead of swinging past and oscillating;
//   - splits the desired velocity into throttle / strafe / lift in the ship's
//     own frame, so a want faster than the drive becomes full throttle (and
//     boost, when the want needs more than the drive alone gives), never a
//     velocity the stats do not allow.
// Nothing here moves pos/quat/v itself, and nothing reads power: an NPC drive
// is unlimited today, and the one hook a later power system needs is
// `boostAllowed` (see sim/flight-model.js).

import { V, clamp } from "../util/math.js";
import { AI_FLIGHT } from "../data/enemy-ai.js";
import { flightStatsFor } from "../data/enemies.js";
import { stepFlight } from "./flight-model.js";

const _fwd = V(), _right = V(), _up = V(), _local = V(), _want = V();

/**
 * Fly enemy `e` for dt toward `desired` velocity (world m/s), facing `look`
 * (a world point; defaults to where the velocity points). `options.boost`
 * forces boost on/off; left undefined, boost lights when the desired forward
 * speed is more than the drive alone gives.
 */
export function flyNpc(e, def, desired, look, dt, options = {}) {
  if (!e.flight || typeof e.flight !== "object") e.flight = { thr: 0, bs: 0, boost: false };
  const stats = flightStatsFor(def);
  _fwd.set(0, 0, -1).applyQuaternion(e.quat);
  _right.set(1, 0, 0).applyQuaternion(e.quat);
  _up.set(0, 1, 0).applyQuaternion(e.quat);

  // Steering: where is the look point in the ship's own frame? Forward is -Z.
  let yaw = 0, pitch = 0;
  const aim = look || (desired && desired.lengthSq() > 1 ? _want.copy(desired).add(e.pos) : null);
  if (aim) {
    _local.copy(aim).sub(e.pos);
    const dist = _local.length();
    if (dist > 1e-6) {
      _local.multiplyScalar(1 / dist);
      const lx = _local.dot(_right), ly = _local.dot(_up), lz = _local.dot(_fwd);
      const gain = AI_FLIGHT.pilotGain;
      // The model's stick sense (pinned by tests/flight-model.test.mjs): a
      // positive yaw stick swings the nose toward the ship's right, and a
      // positive pitch stick pushes it down. So a target up and to the right
      // asks for +yaw and -pitch, each proportional to its angle off the nose.
      yaw = clamp(Math.atan2(lx, lz) * gain, -1, 1);
      pitch = clamp(-Math.atan2(ly, lz) * gain, -1, 1);
    }
  }

  _want.copy(desired || _fwd);
  const forwardWant = _want.dot(_fwd);
  const boost = options.boost !== undefined
    ? !!options.boost
    : forwardWant > stats.speed * AI_FLIGHT.pilotBoostAt;
  const input = {
    yaw, pitch, roll: 0,
    throttleTarget: stats.speed > 0 ? clamp(forwardWant / stats.speed, -1, 1) : 0,
    strafe: stats.speed > 0 && stats.strafe > 0 ? clamp(_want.dot(_right) / (stats.speed * stats.strafe), -1, 1) : 0,
    lift: stats.speed > 0 && stats.lift > 0 ? clamp(_want.dot(_up) / (stats.speed * stats.lift), -1, 1) : 0,
    boost,
    boostAllowed: true, // NPC drives are unlimited today; a power system gates here later.
  };
  // The model's ship record is the enemy record itself (pos/quat/v live there);
  // the throttle/boost state rides on e.flight so nothing saved changes shape.
  const ship = { pos: e.pos, quat: e.quat, v: e.v, thr: e.flight.thr, bs: e.flight.bs, boost: e.flight.boost };
  stepFlight(ship, stats, input, dt);
  e.flight.thr = ship.thr; e.flight.bs = ship.bs; e.flight.boost = ship.boost;
  e.boosting = ship.boost;
  return e;
}
