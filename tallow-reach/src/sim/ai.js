// Hostiles: spawning them from data/enemies.js, moving them and shooting.
//
// Every enemy def names a reusable behaviour. Every place spawner names an
// encounter from data/encounters.js, so the rules do not contain a raider-only
// branch. Hunt contracts still take priority over the ambient encounter and use
// the same desired-count/enemy rules as before.

import { V, Q, R } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { random } from "../util/rng.js";
import { featuresOf, featureOf, featureById } from "../data/places.js";
import { ENEMIES, DEFAULT_ENEMY, enemyDef } from "../data/enemies.js";
import { encounterDef, encounterRespawn } from "../data/encounters.js";
import { profileOf } from "../state/state.js";
import { missionForObjective, remainingObjective } from "./missions.js";
import { state, placeWorld } from "../state/state.js";
import { markEncounterCleared, memoryCooling } from "./place-memory.js";
import { fire } from "./combat.js";
import { enemyFwd, turnEnemy, enemyPos, dropEnemy } from "./enemy.js";
import { dropEntity } from "./entity.js";
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
 * `encounter` is the stable spawner feature id, when this enemy belongs to a
 * generated one-shot patrol; old callers may omit it.
 */
export function spawnEnemy(id, pos, placeId = state.place, encounter = null) {
  const def = enemyDef(id);
  const e = {
    id: nextId++,
    kind: "enemy",
    place: placeId,
    encounter,
    def: ENEMIES[id] ? id : DEFAULT_ENEMY,
    n: def.n,
    f: def.f,
    loot: def.loot,
    hp: def.hp,
    mx: def.hp,
    pos: V(pos.x, pos.y, pos.z),
    quat: Q(),
    v: V(0, 0, 0),
    fire: def.fireDelay,
    o: random() < 0.5 ? 1 : -1,
  };
  placeWorld(placeId).enemies.push(e);
  emit("enemy-spawned", { id: e.id, def: e.def, place: placeId, encounter, pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z } });
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

const encounterIdFromFeature = id => String(id || "").replace(/-\d+$/, "");

/** Per-frame update for hostiles, plus the data-defined encounter spawner. */
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

    (AI_BEHAVIOURS[def.ai] || AI_BEHAVIOURS.chase)(e, def, toPlayer, dist, dt);

    if (dist > def.lostRange) {
      dropEnemy(e);
      continue;
    }

    e.fire -= dt;
    if (dist < def.fireRange && enemyFwd(e).dot(toPlayer.clone().normalize()) > 0.95 && e.fire <= 0) {
      e.fire = R(def.fireGap[0], def.fireGap[1]);
      const dir = toPlayer
        .add(V(R(-0.04, 0.04), R(-0.04, 0.04), R(-0.04, 0.04)))
        .normalize();
      const missionId = String(e.encounter || "").startsWith("mission:")
        ? String(e.encounter).slice("mission:".length)
        : null;
      const shot = fire(e.pos, dir, def.bspd, false, def.dmg);
      // Keep the projectile's place and mission ownership explicit even when
      // the generic fire helper defaults to the local pilot's place.
      shot.place = placeId;
      shot.missionId = missionId;
      if (dist < def.hearRange) emit("sfx", { name: "enemy-fire" });
    }
  }

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
    if (F.spawnT > 0) continue;

    const spawner = spawners[0];
    const encounter = spawner ? encounterDef(spawner.encounter) : null;
    F.spawnT = spawner ? R(spawner.interval?.[0] ?? encounter?.interval?.[0] ?? 4, spawner.interval?.[1] ?? encounter?.interval?.[1] ?? 8) : R(4, 8);
    const hunt = missionForObjective(prof, "kill"),
      hunting = !!hunt,
      hunted = hunt?.steps?.[hunt.step]?.enemy || hunt?.e || DEFAULT_ENEMY;
    let want = 0;
    let id = spawner?.enemy || encounter?.enemy || DEFAULT_ENEMY;
    let encounterKey = spawner?.id || null;
    if (spawner) {
      const anchor = featureById(placeId, spawner.anchor),
        anchorPos = anchor ? V(...anchor.pos) : spawner.pos ? V(...spawner.pos) : stationPos,
        far = pp.distanceTo(stationPos) > (spawner.farFromStation ?? encounter?.farFromStation ?? 600),
        nearField = pp.distanceTo(anchorPos) < (spawner.nearRadius ?? encounter?.nearRadius ?? Infinity),
        once = spawner.once === undefined ? encounter?.once === true : spawner.once === true,
        groupCount = encounterKey ? E.filter(enemy => enemy.encounter === encounterKey).length : 0,
        cooling = once && memoryCooling(placeId, "encounter", encounterKey);

      // This is intentionally the old hunt rule: the active contract chooses
      // its enemy, and the remaining target count is capped at three minus E.
      if (far && hunting && !cooling) {
        want = Math.min(3, remainingObjective(hunt)) - E.length;
        id = hunted;
      } else if (!cooling && far && nearField && (once ? groupCount < (spawner.maxWanderers ?? encounter?.maxActive ?? 1) : E.length < (spawner.maxWanderers ?? encounter?.maxActive ?? 2)) && random() < (spawner.chance ?? encounter?.chance ?? 0)) {
        const count = spawner.count || encounter?.count || [1, 1];
        want = count[0] + (random() < 0.5 ? (count[1] - count[0]) : 0);
      }
    }
    for (let i = 0; i < Math.max(0, want); i++) {
      const d = enemyDef(id), range = spawner?.spawnDist || encounter?.spawnDist || d.spawnDist;
      spawnEnemy(
        id,
        pp.clone().add(V(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize().multiplyScalar(R(range[0], range[1]))),
        placeId,
        encounterKey
      );
    }
  }
}

/** Remove entities created by one mission without clearing ordinary place content. */
function clearMissionContents(missionId) {
  if (!missionId) return;
  const tag = String(missionId);
  const encounter = `mission:${tag}`;
  for (const placeId of state.places.keys()) {
    const W = placeWorld(placeId);
    for (const enemy of [...W.enemies]) {
      if (enemy.encounter === encounter) dropEnemy(enemy, placeId);
    }
    for (const bullet of [...W.bullets]) {
      if (bullet.missionId === tag) dropEntity(W.bullets, bullet);
    }
    for (const crate of [...W.crates]) {
      if (crate.missionId === tag) dropEntity(W.crates, crate);
    }
  }
}

// Abandoning a mission removes its scripted wave and any mission loot/shots,
// but leaves ordinary patrols, derelicts and other place content untouched.
on("mission-abandoned", ({ mission } = {}) => clearMissionContents(mission?.id));
on("mission-failed", ({ mission, action } = {}) => {
  if (action === "abandon") clearMissionContents(mission?.id);
});

// A generated patrol is clear only after its last member is destroyed. The
// encounter feature id, not the enemy type, is what is remembered in the world.
on("enemy-killed", ({ place, encounter, player } = {}) => {
  if (!place || !encounter) return;
  const W = placeWorld(place);
  // Mission waves use their mission id as an encounter tag. When the last
  // member dies, wake a matching data-defined wait step instead of requiring
  // the UI or a test harness to inject `mission-trigger` by hand.
  if (String(encounter).startsWith("mission:")) {
    if (!W.enemies.some(enemy => enemy.encounter === encounter)) {
      const missionId = String(encounter).slice("mission:".length);
      emit("mission-trigger", { trigger: "wave-clear", mission: missionId, place, player });
    }
    return;
  }
  const feature = featureById(place, encounter);
  // Ordinary authored wandering patrols retain their old repeat behaviour. Only
  // one-shot encounter features become persistent cleared-place memory.
  if (!feature?.once) return;
  if (W.enemies.some(enemy => enemy.encounter === encounter)) return;
  markEncounterCleared(place, encounter, encounterRespawn(encounterIdFromFeature(encounter)));
});

// Story scripts ask for a wave or ship through the event bus, keeping mission
// data independent from the hostile simulation. The ordinary encounter spawner
// above remains unchanged; these enemies belong to the mission that requested
// them and disappear through the normal enemy rules.
on("mission-script", ({ action, player, place, mission } = {}) => {
  const kind = action?.kind || action?.action;
  if (kind !== "spawn-wave" && kind !== "spawn-ship") return;
  const placeId = place || player?.place || state.place;
  const feature = featureById(placeId, action.feature || action.anchor);
  const origin = feature?.pos
    ? V(...feature.pos)
    : player?.pos?.clone?.() || V(0, 0, 0);
  const enemy = action.enemy || action.ship || DEFAULT_ENEMY;
  const def = enemyDef(enemy);
  const requested = kind === "spawn-ship" ? 1 : Math.max(1, Math.floor(+action.count || 1));
  const range = Array.isArray(action.spawnDist) ? action.spawnDist : def.spawnDist;
  for (let i = 0; i < requested; i++) {
    const distance = R(range[0], range[1]);
    const pos = origin.clone().add(V(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize().multiplyScalar(distance));
    spawnEnemy(enemy, pos, placeId, `mission:${mission?.id || "story"}`);
  }
});
