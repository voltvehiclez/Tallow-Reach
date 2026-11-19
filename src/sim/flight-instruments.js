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
  for (const ship of state.players) if (ship !== P && ship.place === place && !ship.docked) add('Ship', ship, ship.profile?.name || 'Ship', ship.pos);
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
