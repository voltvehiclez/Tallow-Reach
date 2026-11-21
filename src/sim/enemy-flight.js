// Independent, bounded flight decisions. No target-velocity lead or weapon stat buffs.
import { V, fwdQ } from '../util/math.js';
import { makeRng } from '../util/rng.js';
import { enemyAI, AI_FLIGHT as T } from '../data/enemy-ai.js';
import { enemyDef } from '../data/enemies.js';
import { courseRemaining } from './flight-course.js';
import { enemyFwd, enemyHullRadius, turnEnemy } from './enemy.js';
import { placeCollidersOf, sweepColliders } from './colliders.js';

// Serializable per-pilot RNG state; does not consume combat's stream each tick.
function roll(brain) {
  brain.seed = (brain.seed + 0x9e3779b9) >>> 0;
  return makeRng(brain.seed)();
}
const between = (b, range) => range[0] + roll(b) * (range[1] - range[0]);
export function createBrain(seed) {
  const b = { seed, mode: 'approach', time: 0, dodge: 0, cooldown: 0, reaction: 0, probe: 0, avoidance: V() };
  b.phase = roll(b) * T.phaseSpread;
  b.hand = roll(b) < 0.5 ? -1 : 1;
  b.range = 1 + (roll(b) - 0.5) * T.rangeVariation;
  b.time = roll(b) * T.initialDecisionSpread;
  return b;
}

/** Closest future separation of two linear trajectories, within a bounded horizon. */
function closest(relative, velocity, horizon) {
  const time = Math.max(0, Math.min(horizon, -relative.dot(velocity) / Math.max(1e-9, velocity.lengthSq())));
  return relative.clone().addScaledVector(velocity, time);
}

export function flightAvoidance(e, world, desired, players = []) {
  const b = e.brain, avoid = V(), radius = enemyHullRadius(e);
  const sideways = V(Math.cos(b.phase), 0.25 * b.hand, Math.sin(b.phase)).normalize();
  const dodgeSphere = (pos, velocity, safe, strength, tie = 1) => {
    const delta = e.pos.clone().sub(pos);
    const future = closest(delta, desired.clone().sub(velocity), T.lookAhead);
    const distance = future.length();
    if (distance >= safe) return;
    // Closest-path displacement steers off the collision course before contact.
    if (distance < 1e-5) future.copy(sideways).multiplyScalar(tie);
    avoid.addScaledVector(future.normalize(), strength * (1 - distance / safe));
  };
  for (const other of world.enemies) {
    if (other === e || other.hp <= 0) continue;
    dodgeSphere(other.pos, other.v, T.separation + radius + enemyHullRadius(other), T.separationSpeed, e.id < other.id ? -1 : 1);
  }
  for (const player of players) {
    if (player.dead || player.docked || (player.place && player.place !== e.place)) continue;
    dodgeSphere(player.pos, player.v || V(), radius + T.playerMargin, T.avoidSpeed);
  }
  for (const rock of world.asteroids) {
    const scale = rock.scale || rock.s0;
    const r = scale ? Math.max(scale.x, scale.y, scale.z) * T.rockEnvelope : rock.r || 0;
    if (e.pos.distanceToSquared(rock.pos) > (r + T.rockMargin + desired.length() * T.lookAhead) ** 2) continue;
    dodgeSphere(rock.pos, V(), r + radius + T.rockMargin, T.avoidSpeed);
  }
  return avoid;
}

/** A story escort: hold station ahead of the pilot without firing or hurting them. */
export function flyEscort(e, def, toTarget, dist, dt, context) {
  const { target, world } = context;
  const ahead = target?.quat ? fwdQ(target.quat) : V(0, 0, 1);
  const anchor = target.pos.clone().addScaledVector(ahead, 170).add(V(0, 18, 0));
  const toAnchor = anchor.clone().sub(e.pos), distance = toAnchor.length();
  const desired = distance > 35
    ? toAnchor.normalize().multiplyScalar(Math.min(def.spdFar, distance * 1.25))
    : target.v?.clone?.() || V();
  desired.add(flightAvoidance(e, world, desired, context.players || [target])).clampLength(0, def.spdFar);
  const look = desired.lengthSq() > 1 ? e.pos.clone().add(desired) : anchor;
  turnEnemy(e, look, Math.min(1, dt * def.turn));
  e.v.lerp(desired, 1 - Math.exp(-dt * 3.2));
  e.pos.addScaledVector(e.v, dt);
}


/**
 * Story ships: a friendly contact that follows authored story beats. `e.role`
 * comes from mission data (lead / observe / guard); the movement itself is the
 * ordinary NPC telegraphing, not a follow-the-player trick.
 */
export function flyStory(e, def, toTarget, dist, dt, context) {
  if (e.role === "observe") return flyObserve(e, def, toTarget, dist, dt, context);
  if (e.role === "guard") return flyGuard(e, def, toTarget, dist, dt, context);
  return flyCourse(e, def, toTarget, dist, dt, context);
}

/** Fly an authored course: to its start, wait for the pilot, then the legs. */
export function flyCourse(e, def, toTarget, dist, dt, context) {
  const { world, target } = context;
  const c = e.course;
  if (!c) return flyEscort(e, def, toTarget, dist, dt, context);
  let desired = V(), look = null;
  e.boosting = false;

  if (c.mode === "return" || c.mode === "wait") {
    const toStart = c.start.clone().sub(e.pos), d = toStart.length();
    if (d > T.courseArrive) {
      desired.copy(toStart).normalize().multiplyScalar(Math.min(def.spdFar, d * 1.1));
      look = c.start;
    } else {
      c.mode = "wait";
      // Wait at the beginning until the pilot is close enough to follow.
      // The step may tighten the gather distance (a close form-up before a run).
      const gather = Number(c.gather) > 0 ? Number(c.gather) : T.courseGather;
      const pilotNear = target ? target.pos.distanceTo(c.start) < gather : false;
      if (pilotNear) {
        c.mode = "run"; c.index = 0; c.travelled = 0; c.done = false;
      } else if (d > 25) {
        desired.copy(toStart).normalize().multiplyScalar(Math.min(35, d));
      }
    }
  }

  if (c.mode === "run") {
    const point = c.points[c.index];
    if (!point) {
      c.mode = "done"; c.done = true;
    } else {
      const toPoint = point.pos.clone().sub(e.pos), d = toPoint.length();
      e.boosting = point.boost === true;
      desired.copy(toPoint).normalize().multiplyScalar(point.speed);
      look = point.pos;
      if (d < T.courseWaypoint) {
        c.travelled += point.length;
        c.index++;
        if (c.index >= c.points.length) { c.mode = "done"; c.done = true; }
      }
    }
  }

  if (c.mode === "done") {
    // Lazy circle at the finish: visible, catchable, still flying like a ship.
    const b = e.brain; b.phase += dt * 0.25;
    const anchor = c.points.length
      ? c.points[c.points.length - 1].pos.clone().add(V(Math.cos(b.phase) * 220, 20, Math.sin(b.phase) * 220))
      : c.start.clone();
    const toAnchor = anchor.clone().sub(e.pos), d = toAnchor.length();
    if (d > 30) desired.copy(toAnchor).normalize().multiplyScalar(Math.min(def.spdNear, d * 1.1));
    look = anchor;
  }

  c.remaining = courseRemaining(c);
  desired.add(flightAvoidance(e, world, desired, context.players || (target ? [target] : []))).clampLength(0, def.spdFar);
  if (desired.lengthSq() > 1) turnEnemy(e, look || e.pos.clone().add(desired), Math.min(1, dt * def.turn));
  e.v.lerp(desired, 1 - Math.exp(-dt * 3.4));
  e.pos.addScaledVector(e.v, dt);
}

/** Watch a drill from a safe distance, always facing the pilot. */
export function flyObserve(e, def, toTarget, dist, dt, context) {
  const { world, target, players } = context;
  const b = e.brain;
  b.phase += dt * T.observeOrbitRate;
  const pilot = target;
  const anchor = pilot.pos.clone().add(V(Math.cos(b.phase) * T.observeRadius, 55 + Math.sin(b.phase * 0.6) * 20, Math.sin(b.phase) * T.observeRadius));
  const toAnchor = anchor.clone().sub(e.pos), d = toAnchor.length();
  const desired = d > 25 ? toAnchor.normalize().multiplyScalar(Math.min(def.spdNear, d * 1.2)) : pilot.v.clone().multiplyScalar(0.9);
  desired.add(flightAvoidance(e, world, desired, players)).clampLength(0, def.spdFar);
  const look = d > 90 && desired.lengthSq() > 1 ? e.pos.clone().add(desired) : pilot.pos;
  turnEnemy(e, look, Math.min(1, dt * def.turn));
  e.v.lerp(desired, 1 - Math.exp(-dt * 3));
  e.pos.addScaledVector(e.v, dt);
}

/**
 * Prowl around the pilot and any nearby wingman during an ambush parley: streak
 * in out of warp and circle both hulls without opening fire until the threat is
 * finished (or the pilot shoots first).
 */
export function flyProwl(e, def, toTarget, dist, dt, context) {
  const { world, target, players } = context;
  const b = e.brain;
  const hand = e.o || b.hand || 1;
  b.phase += dt * 0.65 * hand;
  const ally = (world.enemies || []).find(
    other => other && other !== e && other.hp > 0 && enemyDef(other.def).friendly === true,
  );
  const center = ally && ally.pos.distanceTo(target.pos) < 900
    ? target.pos.clone().add(ally.pos).multiplyScalar(0.5)
    : target.pos.clone();
  const orbitRadius = 240;
  const anchor = center.clone().add(V(
    Math.cos(b.phase) * orbitRadius,
    24 + Math.sin(b.phase * 0.7) * 28,
    Math.sin(b.phase) * orbitRadius,
  ));
  const toAnchor = anchor.clone().sub(e.pos), d = toAnchor.length();
  if (e.warpIn > 0) {
    e.warpIn = Math.max(0, e.warpIn - dt);
    e.boosting = e.warpIn > 0;
  } else {
    e.boosting = false;
  }
  const maxSpd = e.warpIn > 0 ? 420 : def.spdFar;
  const cruise = e.warpIn > 0
    ? Math.min(420, Math.max(def.spdFar, d * 1.4))
    : Math.min(def.spdFar, Math.max(def.spdNear * 1.15, d * 1.1));
  const desired = d > 15
    ? toAnchor.normalize().multiplyScalar(cruise)
    : V(-Math.sin(b.phase) * hand, 0, Math.cos(b.phase) * hand).multiplyScalar(def.spdNear * 1.15);
  desired.add(flightAvoidance(e, world, desired, players)).clampLength(0, maxSpd);
  const look = desired.lengthSq() > 1 ? e.pos.clone().add(desired) : center;
  turnEnemy(e, look, Math.min(1, dt * def.turn * 1.4));
  e.v.lerp(desired, 1 - Math.exp(-dt * (e.warpIn > 0 ? 6 : 3.4)));
  e.pos.addScaledVector(e.v, dt);
}

/** Fight the act's other hostiles. Damage comes from the def (a story ally's is 0). */
export function flyGuard(e, def, toTarget, dist, dt, context) {
  const { world, target, players } = context;
  let foe = null, best = Infinity;
  for (const other of otherHostiles(e, world)) {
    const d = e.pos.distanceToSquared(other.pos);
    if (d < best) { best = d; foe = other; }
  }
  let aim;
  if (foe) {
    // Lead the target by its own speed; a raider weaving still gets shot at.
    aim = foe.pos.clone().addScaledVector(foe.v, 0.6);
  } else {
    const pilot = target;
    const behind = pilot.vel?.clone?.() || pilot.v?.clone?.() || V();
    aim = pilot.pos.clone().addScaledVector(behind.normalize(), -200).add(V(0, 30, 0));
  }
  const toAim = aim.clone().sub(e.pos), d = toAim.length();
  let desired = d > (foe ? T.guardStandoff : 90) ? toAim.normalize().multiplyScalar(def.spdFar * 0.8) : (foe ? foe.v.clone().multiplyScalar(0.8) : V());
  desired.add(flightAvoidance(e, world, desired, players)).clampLength(0, def.spdFar);
  turnEnemy(e, d > 40 ? aim : e.pos.clone().add(desired), Math.min(1, dt * def.turn));
  e.v.lerp(desired, 1 - Math.exp(-dt * 3));
  e.pos.addScaledVector(e.v, dt);
}

function otherHostiles(e, world) {
  return (world.enemies || []).filter(other => other && other !== e && other.hp > 0 && enemyDef(other.def).friendly !== true);
}

export function flyFighter(e, def, toTarget, dist, dt, context) {
  const { world, target } = context;
  const b = e.brain, profile = enemyAI(def);
  const forward = toTarget.clone().normalize();
  const side = V().crossVectors(forward, V(0, 1, 0));
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const range = def.circleAt * profile.range * b.range;
  b.time -= dt; b.cooldown -= dt; b.dodge = Math.max(0, b.dodge - dt); b.phase += dt * T.verticalRate;
  if (dist > range * 2) b.mode = 'approach';
  else if (dist < range * T.breakRange && b.mode !== 'break') {
    b.mode = 'break'; b.time = between(b, profile.breakTime);
  } else if (b.time <= 0 || b.mode === 'approach') {
    b.mode = roll(b) < profile.attackChance ? 'attack' : 'strafe';
    b.time = between(b, profile.decision);
    if (roll(b) < T.reverseChance) b.hand *= -1;
  }
  // React only to an approaching visible projectile, after a delay, with a cooldown.
  let threat = false;
  if (b.cooldown <= 0) for (const shot of world.bullets) {
    if (!shot.own) continue;
    const relative = shot.pos.clone().sub(e.pos);
    const velocity = shot.v.clone().sub(e.v);
    if (relative.dot(velocity) >= 0 || relative.dot(enemyFwd(e)) < 0) continue;
    if (closest(relative, velocity, T.bulletLookAhead).length() < T.bulletMissDistance) { threat = true; break; }
  }
  b.reaction = threat ? b.reaction + dt : 0;
  if (b.reaction >= profile.reaction) {
    if (roll(b) < profile.dodgeChance) { b.dodge = profile.dodgeTime; b.hand *= -1; }
    b.cooldown = profile.dodgeCooldown; b.reaction = 0;
  }
  let speed = dist > range * 2 ? def.spdFar : def.spdNear;
  if (b.mode === 'attack') speed *= T.attackSpeed;
  if (b.mode === 'break') speed *= -T.breakSpeed;
  const desired = forward.clone().multiplyScalar(speed)
    .addScaledVector(side, def.spdOrbit * profile.strafe * b.hand * (b.dodge > 0 ? T.dodgeStrafe : 1));
  desired.y += Math.sin(b.phase) * def.spdOrbit * profile.vertical;
  const avoid = flightAvoidance(e, world, desired, context.players || [target]);
  // Hull-width probes see station walls/arms instead of treating a ring as a solid ball.
  b.probe -= dt;
  if (b.probe <= 0) {
    b.probe = T.probeInterval;
    b.avoidance.set(0, 0, 0);
    for (const offset of [0, -T.probeSide, T.probeSide]) {
      const start = e.pos.clone().addScaledVector(side, offset);
      const end = start.clone().addScaledVector(desired, T.lookAhead);
      if (sweepColliders(placeCollidersOf(e.place), [], start, end)) {
        b.avoidance.copy(side).multiplyScalar(b.hand * T.avoidSpeed).addScaledVector(forward, -T.avoidSpeed);
        break;
      }
    }
  }
  avoid.add(b.avoidance);
  desired.add(avoid).clampLength(0, def.spdFar * T.maxSpeedFactor);
  const look = avoid.lengthSq() > T.separationSpeed ** 2
    ? e.pos.clone().add(desired) : target.pos;
  turnEnemy(e, look, Math.min(1, dt * def.turn));
  e.v.lerp(desired, 1 - Math.exp(-dt * T.response));
  e.pos.addScaledVector(e.v, dt);
}

/** Do not fire through another hostile's hull, even though friendly damage is disabled. */
export function clearFriendlyLane(e, targetPos, enemies) {
  const line = targetPos.clone().sub(e.pos), length = line.length();
  line.normalize();
  return !enemies.some(other => {
    if (other === e || other.hp <= 0) return false;
    const offset = other.pos.clone().sub(e.pos), along = offset.dot(line);
    if (along <= 0 || along >= length) return false;
    return offset.addScaledVector(line, -along).length() < enemyHullRadius(other) + T.probeSide;
  });
}
