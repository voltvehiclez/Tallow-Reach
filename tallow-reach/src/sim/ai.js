// Hostiles: spawning them from data/enemies.js, moving them and shooting.
//
// Every number comes from the enemy's def (src/data/enemies.js). A def names its
// behaviour with `ai`; AI_BEHAVIOURS is the table of those behaviours, so a new
// enemy is a data entry and a new *way of fighting* is one function here.

import { V, Q, R } from "../util/math.js";
import { emit } from "../util/events.js";
import { random } from "../util/rng.js";
import { featuresOf, featureOf, featureById } from "../data/places.js";
import { ENEMIES, DEFAULT_ENEMY, enemyDef } from "../data/enemies.js";
import { profileOf } from "../state/state.js";
import { fire } from "./combat.js";
import { state, placeWorld } from "../state/state.js";
import { enemyFwd, turnEnemy, enemyPos, dropEnemy } from "./enemy.js";
import { playerPos } from "./pilot.js";

/**
 * "chase": close in quickly from far, circle once near. Used by the raider.
 * `toTarget` is the vector from the enemy to the player (not normalised).
 */
function chase(e, def, toTarget, dist, dt) {
  const f = enemyFwd(e),
    side = V(1, 0, 0).applyQuaternion(e.quat);
  e.v.lerp(
    f.clone().multiplyScalar(dist > def.circleAt ? def.spdFar : def.spdNear).addScaledVector(side, e.o * def.spdOrbit),
    dt
  );
  enemyPos(e).addScaledVector(e.v, dt);
}

/** Behaviours an enemy def can name with `ai`. Add one here, then name it in data. */
export const AI_BEHAVIOURS = { chase };

let nextId = 1;

/**
 * Create enemy `id` (an entry in ENEMIES) at `pos`. Returns the new entity.
 *
 * The record is plain data: `render/views.js` notices it and builds its mesh
 * (step 7a). An `id` that is not in ENEMIES is recorded as the default enemy, so
 * a bad spawn can never crash the game or an old save.
 */
export function spawnEnemy(id, pos, placeId = state.place) {
  const def = enemyDef(id);
  const e = {
    id: nextId++,
    kind: "enemy",
    place: placeId,
    def: ENEMIES[id] ? id : DEFAULT_ENEMY,   // the id, so saves and events can name it
    n: def.n,                                // the lock marker's label
    f: def.f,                                // faction id (data/factions.js)
    loot: def.loot,                          // table id (data/loot.js)
    hp: def.hp,
    mx: def.hp,
    pos: V(pos.x, pos.y, pos.z),
    quat: Q(),                               // rotation, a maths type (not a scene object)
    v: V(0, 0, 0),
    fire: def.fireDelay,                     // seconds until it may fire
    o: random() < 0.5 ? 1 : -1,              // circling direction
  };
  placeWorld(placeId).enemies.push(e);
  emit("enemy-spawned", { id: e.id, def: e.def, place: placeId, pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z } });
  return e;
}

/** Nearest active pilot, with list order breaking equal-distance ties. */
export function nearestPlayer(pos, players = state.players, placeId = null) {
  let best = null, bestDist = Infinity;
  for (const player of players) {
    if (!player || player.docked || player.dead) continue;
    if (placeId && (player.place || state.place) !== placeId) continue;
    const d = player.pos.distanceToSquared(pos);
    if (d < bestDist) { bestDist = d; best = player; }
  }
  return best;
}

/** Per-frame update for hostiles, plus the spawner that keeps them coming. */
export function updateEnemies(dt, placeId = state.place) {
  const W = placeWorld(placeId),
    E = W.enemies;

  for (let i = E.length - 1; i >= 0; i--) {
    const e = E[i];
    if (!e) continue;
    const target = nearestPlayer(e.pos, state.players, placeId);
    if (!target) continue;
    const pp = playerPos(target);
    const def = enemyDef(e.def);
    const toPlayer = pp.clone().sub(e.pos),
      dist = toPlayer.length();
    turnEnemy(e, pp, dt * def.turn);

    // Move by whichever behaviour the def asks for.
    (AI_BEHAVIOURS[def.ai] || AI_BEHAVIOURS.chase)(e, def, toPlayer, dist, dt);

    if (dist > def.lostRange) {
      dropEnemy(e);          // tells render/views.js to remove its mesh
      continue;
    }

    e.fire -= dt;
    if (dist < def.fireRange && enemyFwd(e).dot(toPlayer.clone().normalize()) > 0.95 && e.fire <= 0) {
      e.fire = R(def.fireGap[0], def.fireGap[1]);
      // Small aim jitter so shots don't all land on the same line.
      const dir = toPlayer
        .add(V(R(-0.04, 0.04), R(-0.04, 0.04), R(-0.04, 0.04)))
        .normalize();
      fire(e.pos, dir, def.bspd, false, def.dmg);
      if (dist < def.hearRange) emit("sfx", { name: "enemy-fire" });
    }
  }

  // Spawner: hunt contracts send their target enemy in, and wandering pirates
  // show up occasionally when an active pilot is near the asteroid field.
  const local = state.player;
  const active = state.players.filter(p => p && !p.docked && !p.dead && (p.place || state.place) === placeId);
  const ordered = local && active.includes(local) ? [local, ...active.filter(p => p !== local)] : active;
  const spawners = featuresOf(placeId, "spawner");
  const station = featureOf(placeId, "station");
  const stationPos = station ? V(...station.pos) : V(0, 0, 0);
  for (const player of ordered) {
    const prof = profileOf(player),
      F = player.flight;
    if (!prof || !F) continue;
    const pp = playerPos(player);
    F.spawnT -= dt;
    if (F.spawnT <= 0) {
      const spawner = spawners[0];
      F.spawnT = spawner ? R(spawner.interval[0], spawner.interval[1]) : R(4, 8);
      const m = prof.mission,
        hunting = m && m.type === "hunt" && m.p < m.n,
        hunted = m && m.e ? m.e : DEFAULT_ENEMY;
      let want = 0;
      let id = spawner ? spawner.enemy : DEFAULT_ENEMY;
      if (spawner) {
        const anchor = featureById(placeId, spawner.anchor),
          anchorPos = anchor ? V(...anchor.pos) : stationPos,
          far = pp.distanceTo(stationPos) > spawner.farFromStation,
          nearField = pp.distanceTo(anchorPos) < spawner.nearRadius;
        if (far && hunting) {
          want = Math.min(3, m.n - m.p) - E.length;
          id = hunted;
        } else if (far && nearField && E.length < spawner.maxWanderers && random() < spawner.chance) {
          want = spawner.count[0] + (random() < 0.5 ? (spawner.count[1] - spawner.count[0]) : 0);
        }
      }
      for (let i = 0; i < want; i++) {
        const d = enemyDef(id);
        spawnEnemy(
          id,
          pp.clone().add(V(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize().multiplyScalar(R(d.spawnDist[0], d.spawnDist[1]))),
          placeId
        );
      }
    }
  }
}
