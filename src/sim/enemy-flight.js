// Independent, bounded flight decisions. No target-velocity lead or weapon stat buffs.
import { V, fwdQ } from '../util/math.js';
import { makeRng } from '../util/rng.js';
import { enemyAI, AI_FLIGHT as T } from '../data/enemy-ai.js';
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
