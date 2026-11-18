// Read-only instruments: no steering, targeting or projectile changes.
import { V } from '../util/math.js';
import { placeDef } from '../data/places.js';
import { state, placeWorld } from '../state/state.js';
import { itemName } from '../data/items.js';

/** A sensor policy can later filter by range/signature. Today every object is visible. */
export function pocketObjects(P, detect = () => true) {
  const place = P.place || state.place, world = placeWorld(place), rows = [];
  const add = (kind, object, name, position) => {
    const pos = Array.isArray(position) ? V(...position) : position;
    if (!pos || !Number.isFinite(pos.x + pos.y + pos.z)) return;
    const row = { kind, object, name, distance: P.pos.distanceTo(pos) };
    if (detect(row, P)) rows.push(row);
  };
  for (const f of placeDef(place).features) {
    // Encounter/spawner records are recipes, not additional physical objects.
    if (['encounter', 'spawner'].includes(f.kind)) continue;
    add(f.kind, f, f.n || f.kind, f.pos || f.center);
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
  return continuous && dt > 0 ? start.distanceTo(end)/dt : 0;
}
