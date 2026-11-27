// Read-only instruments: no steering, targeting or projectile changes.
import { V, fwdQ } from '../util/math.js';
import { placeDef } from '../data/places.js';
import { state, placeWorld } from '../state/state.js';
import { itemName } from '../data/items.js';

/** A sensor policy can later filter by range/signature. Today every object is visible. */
export function pocketObjects(P, detect = () => true) {
  const place = P.place || state.place, world = placeWorld(place), rows = [];
  const add = (kind, object, name, position, feature = false) => {
    const pos = Array.isArray(position) ? V(...position) : position;
    if (!pos || !Number.isFinite(pos.x + pos.y + pos.z)) return;
    const row = { kind, object, name, feature, distance: P.pos.distanceTo(pos) };
    if (detect(row, P)) rows.push(row);
  };
  for (const f of placeDef(place).features) {
    // Encounter/spawner records are recipes, not additional physical objects.
    if (['encounter', 'spawner'].includes(f.kind)) continue;
    add(f.kind, f, f.n || f.kind, f.pos || f.center, true);
  }
  for (const [key, kind] of [['enemies','Hostile'],['asteroids','Asteroid'],['crates','Cargo'],['rifts','Rift'],['gates','Gate'],['caches','Cache'],['bullets','Projectile'],['missiles','Missile']]) {
    for (const o of world[key] || []) {
      if (o.gone || (o.hp !== undefined && o.hp <= 0)) continue;
      add(kind, o, o.n || o.dest || (o.type ? itemName(o.type) : o.item ? itemName(o.item) : kind), o.pos);
    }
  }
  // Step 16 slice 8a (playtest 23): another pilot is a row like anything else in the pocket — and
  // the row is built from the **mirror** the screen draws (`state.otherPilots`, `render/views.js`)
  // rather than from `state.players`, because a guest has no record for a friend at all. That is
  // how a visiting pilot became selectable from the N list on both screens, with its own name.
  //
  // **Every ship in the pocket, docked or not** (owner, playtest 23's follow-up): *"the filter in N
  // tab for Ships shows ALL ships. Both player ships and ALL npc ships."* The row used to skip a
  // **docked** pilot, on the reasoning that a hull inside a station is not out in the pocket — but a
  // visitor cannot fly at all yet (controls are 8b), so it is docked for its whole visit, and the row
  // was therefore never there: the friend was missing from the list on the host's screen, and the
  // host's own hull was missing on the guest's while the host sat at a station. A visitor's hull is
  // **drawn** parked at the launch point its arrival put it on and, since `2026-11-25c`, it is solid
  // and takes damage — a body you can see and shoot is a ship in the list. Dead and another pocket
  // stay out: neither is a ship in this sky.
  for (const pilot of state.otherPilots || []) {
    if (!pilot || pilot.dead || pilot.place !== place) continue;
    add('Ship', pilot, pilot.name || 'Pilot', pilot.pos);
  }
  return rows.sort((a,b) => a.distance-b.distance || a.name.localeCompare(b.name));
}

/** Smallest future interception time; bullets inherit shooter velocity. */
export function interceptPoint(origin, shooterVelocity, target, targetVelocity, speed, lifetime = Infinity) {
  if (!(speed > 0)) return null;
  const r = target.clone().sub(origin), v = targetVelocity.clone().sub(shooterVelocity);
  const a = v.lengthSq()-speed*speed, b = 2*r.dot(v), c = r.lengthSq();
  let times;
  if (Math.abs(a) < 1e-8) times = Math.abs(b) < 1e-8 ? [] : [-c/b];
  else {
    const discriminant = b*b-4*a*c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    times = [(-b-root)/(2*a),(-b+root)/(2*a)];
  }
  const time = Math.min(...times.filter(t => t > 0 && t <= lifetime));
  return Number.isFinite(time) ? target.clone().addScaledVector(v,time) : null;
}

/** Measure only a single flight step, never the distance across travel/load boundaries. */
export function flightSpeed(start, end, dt, continuous = true) {
  return continuous && dt > 0 ? start.distanceTo(end) / dt : 0;
}

/** True current ship speed in m/s, including displacement caused by moving colliders. */
export function truePlayerSpeed(P, warping = false) {
  if (!P || P.docked || warping) return 0;
  const raw = P.measuredSpeed ?? P.v?.length?.() ?? 0;
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** True when the ship's motion has a backward component relative to its nose. */
function isReversing(P) {
  if (!P) return false;
  if (Number.isFinite(P.forwardSpeed) && (P.measuredSpeed > 0 || Math.abs(P.forwardSpeed) > 1e-4)) {
    return P.forwardSpeed < -0.01;
  }
  if (P.v && P.quat && typeof P.v.dot === "function") {
    return P.v.dot(fwdQ(P.quat)) < -0.01;
  }
  return false;
}

/** Sync scalar speed telemetry (`measuredSpeed`, `forwardSpeed`) from `P.v` and `P.quat` (for net-driven ships). */
export function syncSpeedFromVelocity(P, warping = false) {
  if (!P) return;
  if (P.docked || P.dead || warping || !P.v || typeof P.v.length !== "function") {
    if (P) {
      P.measuredSpeed = 0;
      P.forwardSpeed = 0;
    }
    return;
  }
  P.measuredSpeed = P.v.length();
  P.forwardSpeed = P.quat && typeof P.v.dot === "function" ? P.v.dot(fwdQ(P.quat)) : P.measuredSpeed;
}

/**
 * Whole-number signed HUD velocity readout in m/s: negative when moving
 * backwards relative to the ship's nose, and never rounding an active collider
 * push down to 0 m/s.
 */
export function displayedSpeed(P, warping = false) {
  const raw = truePlayerSpeed(P, warping);
  const rounded = Math.round(raw);
  const mag = rounded === 0 && P?.pushed && raw > 0.01 ? 1 : rounded;
  if (mag === 0) return 0;
  return isReversing(P) ? -mag : mag;
}
