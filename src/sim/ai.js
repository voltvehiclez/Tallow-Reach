// Hostiles: spawning them from data/enemies.js, moving them and shooting.
//
// Every enemy def names a reusable behaviour. Every place spawner names an
// encounter from data/encounters.js, so the rules do not contain a raider-only
// branch. Hunt contracts still take priority over the ambient encounter and use
// the same desired-count/enemy rules as before.

import { createBrain, flyFighter, flyEscort, flyStory, flyProwl, clearFriendlyLane } from "./enemy-flight.js";
import { startCourseAtBeginning } from "./flight-course.js";
import { BULLET_COLOURS } from "../data/weapons.js";
import { AI_FLIGHT } from "../data/enemy-ai.js";
import { V, Q, R } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { random } from "../util/rng.js";
import { featuresOf, featureOf, featureById } from "../data/places.js";
import { ENEMIES, DEFAULT_ENEMY, enemyDef } from "../data/enemies.js";
import { encounterDef, encounterRespawn } from "../data/encounters.js";
import { profileOf } from "../state/state.js";
import { missionForObjective, remainingObjective } from "./missions.js";
import { state, placeWorld, instanceAt } from "../state/state.js";
import { markEncounterCleared, memoryCooling } from "./place-memory.js";
import { clearMissionDrops, fire, removeMissionDrop } from "./combat.js";
import { boom } from "./effects.js";
import { enemyFwd, dropEnemy, enemyHullRadius, turnEnemy } from "./enemy.js";
import { collideRockAt, collideSphereAt, placeCollidersOf, reflectVelocity, sweepColliders } from "./colliders.js";
import { dropEntity } from "./entity.js";
import { playerPos } from "./pilot.js";

// Keep the reusable behaviour id for authored content; personality is data-driven.
export const AI_BEHAVIOURS = { chase: flyFighter, escort: flyEscort, story: flyStory };

let nextId = 1;

/**
 * Create enemy `id` (an entry in ENEMIES) at `pos`. Returns the new entity.
 * `encounter` is the stable spawner feature id, when this enemy belongs to a
 * generated one-shot patrol; old callers may omit it.
 */
export function spawnEnemy(id, pos, placeId = state.place, encounter = null, options = {}) {
  const def = enemyDef(id);
  const hasLootOverride = Object.prototype.hasOwnProperty.call(options || {}, "loot");
  // An instance declares a difficulty scalar (data/instances.js `difficulty`), so the same enemy is
  // harder inside one instead of the map getting harder. Everywhere else there is no instance and no
  // scaling at all, which is why an ordinary pocket's hostiles are byte-for-byte what they were.
  const hpScale = instanceAt(placeId)?.difficulty?.hp;
  const hp = hpScale > 0 ? Math.max(1, Math.round(def.hp * hpScale)) : def.hp;
  const e = {
    id: nextId++,
    kind: "enemy",
    place: placeId,
    encounter,
    def: ENEMIES[id] ? id : DEFAULT_ENEMY,
    n: def.n,
    f: def.f,
    loot: hasLootOverride ? options.loot : def.loot,
    friendly: def.friendly === true,
    invulnerable: def.invulnerable === true,
    dropOnDefeat: options?.dropOnDefeat || null,
    hp,
    mx: hp,
    pos: V(pos.x, pos.y, pos.z),
    quat: Q(),
    v: V(0, 0, 0),
    fire: def.fireDelay,
    o: random() < 0.5 ? 1 : -1,
    brain: createBrain(Math.floor(random() * 0xffffffff)),
  };
  if (options.role) e.role = options.role;
  if (options.course) {
    const course = startCourseAtBeginning(options.course, options.phase || "lesson");
    if (course) e.course = course;
  }
  e.boosting = Boolean(options.warpIn);
  if (options.warpIn) {
    e.warpIn = 0.9;
    const toward = options.toward || V(0, 0, 0);
    const dir = V(toward.x, toward.y, toward.z).sub(e.pos);
    if (dir.lengthSq() > 1) {
      dir.normalize();
      turnEnemy(e, V(toward.x, toward.y, toward.z), 1);
      e.v.copy(dir).multiplyScalar(420);
    }
    boom(e.pos, 10, 0x9fd9ff, placeId);
  }
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

/** Nearest live ship a story ally may shoot at (never another friendly). */
function nearestHostile(e, enemies) {
  let best = null, bestDist = Infinity;
  for (const other of enemies) {
    if (!other || other === e || other.hp <= 0) continue;
    if (enemyDef(other.def).friendly === true) continue;
    const d = e.pos.distanceToSquared(other.pos);
    if (d < bestDist) { bestDist = d; best = other; }
  }
  return best;
}

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
    if (!e.brain) e.brain = createBrain(e.id);

    const fly = e.role === "prowl" ? flyProwl : (AI_BEHAVIOURS[def.ai] || AI_BEHAVIOURS.chase);
    fly(e, def, toPlayer, dist, dt, { world: W, target, players: state.players });

    if (dist > def.lostRange) {
      dropEnemy(e);
      continue;
    }

    e.fire -= dt;
    // A prowling ship is still talking: it circles and holds fire until the
    // dialogue finishes or the pilot shoots first.
    if (e.role === "prowl") {
      e.fire = Math.max(e.fire, 0.35);
      continue;
    }
    // A story ally fires only when the act has put him on guard — the ambush, not
    // the drone pass (that is the pilot's test). His def decides the damage (zero
    // for Dane). Nothing about this touches the pilot.
    if (def.engages === "hostiles") {
      if (e.role === "guard") {
        const foe = nearestHostile(e, E);
        if (foe && e.fire <= 0) {
          const toFoe = foe.pos.clone().sub(e.pos), range = toFoe.length();
          if (range < def.fireRange && enemyFwd(e).dot(toFoe.clone().normalize()) > 0.94 && clearFriendlyLane(e, foe.pos, E)) {
            e.fire = R(def.fireGap[0], def.fireGap[1]);
            const spread = AI_FLIGHT.aimSpread;
            const dir = toFoe.normalize().add(V(R(-spread, spread), R(-spread, spread), R(-spread, spread))).normalize();
            // His guns are the same basic cannons the pilot flies with, so his rounds
            // are the same orange. The colour has to be on the record *before* it
            // enters the world: `entity-spawned` builds the mesh straight away.
            const shot = fire(e.pos, dir, def.bspd, false, def.dmg, undefined, placeId,
              String(e.encounter || "").startsWith("mission:") ? String(e.encounter).slice("mission:".length) : null,
              { colour: BULLET_COLOURS.cannon });
            if (range < def.hearRange) emit("sfx", { name: "enemy-fire" });
          }
        }
      }
    } else if (!def.friendly && dist < def.fireRange && enemyFwd(e).dot(toPlayer.clone().normalize()) > 0.95 && e.fire <= 0 && clearFriendlyLane(e, pp, E) && !sweepColliders(placeCollidersOf(placeId), W.asteroids, e.pos, pp)) {
      e.fire = R(def.fireGap[0], def.fireGap[1]);
      // Angular spread, not a centimetre offset that becomes perfect aim at range.
      const spread = AI_FLIGHT.aimSpread;
      const dir = toPlayer.clone().normalize()
        .add(V(R(-spread, spread), R(-spread, spread), R(-spread, spread)))
        .normalize();
      const missionId = String(e.encounter || "").startsWith("mission:")
        ? String(e.encounter).slice("mission:".length)
        : null;
      // The instance's damage scalar, if this place is one (data/instances.js `difficulty`).
      const dmgScale = instanceAt(placeId)?.difficulty?.dmg;
      const shot = fire(e.pos, dir, def.bspd, false, dmgScale > 0 ? def.dmg * dmgScale : def.dmg);
      // Keep the projectile's place and mission ownership explicit even when
      // the generic fire helper defaults to the local pilot's place.
      shot.place = placeId;
      shot.missionId = missionId;
      if (dist < def.hearRange) emit("sfx", { name: "enemy-fire" });
    }
  }

  // Collision: enemies are solid. Two hulls that drifted into each other separate and
  // ricochet — just enough kick for the AI to re-plan its approach next tick; no damage
  // (ramming a rival is not a contract). Rocks and scenery act exactly like they do for the
  // pilot: both damage at speed, credited to no one (a rock is not a pilot, and nor is a wall).
  // `collideDmg: 0` on a feature is the only no-damage surface, for the pilot and for hostiles.
  const ships = [...E];   // (a copy: a rock can kill one mid-pass, which splices E)
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i];
    if (!a) continue;
    const ra = enemyHullRadius(a);
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j];
      if (!b) continue;
      const rb = enemyHullRadius(b),
        rr = ra + rb;
      let dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2), nx, ny, nz;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = 1; ny = 0; nz = 0; d = 0; }
      const overlap = rr - d, half = overlap * 0.5;
      a.pos.x -= nx * half; a.pos.y -= ny * half; a.pos.z -= nz * half;
      b.pos.x += nx * half; b.pos.y += ny * half; b.pos.z += nz * half;
      // n points a -> b; approaching means a's normal speed beats b's.
      const vnA = a.v.x * nx + a.v.y * ny + a.v.z * nz,
        vnB = b.v.x * nx + b.v.y * ny + b.v.z * nz;
      if (vnA > vnB) {   // equal hull masses swap normal velocity parts, restitution 0.4
        const REST = 0.4,
          newA = (vnA * (1 - REST) + vnB * (1 + REST)) / 2,
          newB = (vnB * (1 - REST) + vnA * (1 + REST)) / 2;
        a.v.x += (newA - vnA) * nx; a.v.y += (newA - vnA) * ny; a.v.z += (newA - vnA) * nz;
        b.v.x += (newB - vnB) * nx; b.v.y += (newB - vnB) * ny; b.v.z += (newB - vnB) * nz;
      }
    }
  }
  for (const a of ships) {
    // A rock may have killed this one already this pass (hp <= 0, off the list): skip it,
    // or the kill would resolve twice — double boom, double loot, double event.
    if (!a || a.hp <= 0) continue;
    const ra = enemyHullRadius(a);
    // Same world, same rocks as the pilot — a rock that hurts a ship hurts an enemy.
    const W = placeWorld(placeId);
    for (const rock of W.asteroids) {
      if (a.hp <= 0) break;   // killed by an earlier rock this pass — stop hitting the corpse
      const hit = collideRockAt(rock.shape || 0, rock.pos, rock.quat, rock.scale, a.pos.x, a.pos.y, a.pos.z, ra);
      if (!hit) continue;
      const speed = a.v.length();   // impact speed, before the bounce changes it
      a.pos.x += hit.x * hit.depth; a.pos.y += hit.y * hit.depth; a.pos.z += hit.z * hit.depth;
      reflectVelocity(a.v, hit.x, hit.y, hit.z, 0.4);
      if (speed > 25) emit("enemy-rammed", { e: a, dmg: speed * 0.015 * (hit.damage || 1), at: a.pos, byPlayer: null, placeId });
    }
    // Scenery hurts a hostile the same way it hurts the pilot: solid means solid, at speed.
    // Credited to no one — `byPlayer: null` — so flying a raider into the ring is an
    // environmental kill, and every kill objective settles it (owner, 2026-11-15).
    for (const collider of placeCollidersOf(placeId)) {
      if (a.hp <= 0) break;   // an earlier collider this pass finished it
      const hit = collideSphereAt([collider], a.pos.x, a.pos.y, a.pos.z, ra);
      if (!hit) continue;
      const speed = a.v.length();   // impact speed, before the bounce changes it
      a.pos.x += hit.x * hit.depth; a.pos.y += hit.y * hit.depth; a.pos.z += hit.z * hit.depth;
      reflectVelocity(a.v, hit.x, hit.y, hit.z, 0.4);
      if (hit.damage > 0 && speed > 25) {
        emit("enemy-rammed", { e: a, dmg: speed * 0.015 * hit.damage, at: a.pos, byPlayer: null, placeId });
      }
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
      if (crate.missionId === tag) {
        removeMissionDrop(crate);
        dropEntity(W.crates, crate);
      }
    }
  }
  clearMissionDrops(tag);
}

// Abandoning a mission removes its scripted wave and any mission loot/shots,
// but leaves ordinary patrols, derelicts and other place content untouched.
on("mission-abandoned", ({ mission } = {}) => clearMissionContents(mission?.id));
on("mission-rewarded", ({ mission } = {}) => clearMissionContents(mission?.id));
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
  const dropOnDefeat = action.dropOnDefeat && typeof action.dropOnDefeat === "object"
    ? { ...action.dropOnDefeat }
    : null;
  const options = {
    loot: action.loot === false ? null : action.loot,
    ...(action.role ? { role: action.role } : {}),
    ...(action.warpIn ? { warpIn: true, toward: origin } : {}),
    ...(action.course ? { course: action.course, phase: action.phase || "lesson" } : {}),
    ...(dropOnDefeat ? { dropOnDefeat } : {}),
  };
  if (action.loot === undefined) delete options.loot;
  if (action.warpIn && placeId === state.place) emit("sfx", { name: "warp-burst" });
  for (let i = 0; i < requested; i++) {
    const distance = R(range[0], range[1]);
    const pos = origin.clone().add(V(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize().multiplyScalar(distance));
    // The authored courier is the first member of the wave; its mission drop
    // is a single physical crate, while the remaining patrol ships are ordinary
    // hostiles unless their action supplies another drop plan.
    const ship = spawnEnemy(enemy, pos, placeId, `mission:${mission?.id || "story"}`, {
      ...options,
      ...(dropOnDefeat && i > 0 ? { dropOnDefeat: null } : {}),
    });
    if (action.role === "prowl" && requested > 1) {
      ship.o = i % 2 === 0 ? 1 : -1;
      ship.brain.phase = (i / requested) * Math.PI * 2;
    }
  }
});
