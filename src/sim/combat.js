// Projectiles, hostile kills, loot crates and pickups.
//
// Bullets and crates are plain data now (refactor step 7b): a bullet is
//
//     { id, kind: "bullet", pos, quat, v, own, dmg, l }
//
// and a crate is `{ id, kind: "crate", pos, quat, t, item, spin }`. What draws
// them is `render/views.js`, which watches `entity-spawned` / `entity-removed` and
// sweeps the lists every frame — nothing here imports a scene any more, so a whole
// fight runs in a test with no browser.

import { V, Q, R, faceQ, UP } from "../util/math.js";
import { rollLoot } from "./loot.js";
import { emit } from "../util/events.js";
import { itemName } from "../data/items.js";
import { placeAt } from "../data/places.js";
import { SHIPS } from "../data/ships.js";
import { state, msg, say, localPlayer, profileOf, placeWorld } from "../state/state.js";
import { dropEnemy, enemyPos } from "./enemy.js";
import { holdLoad } from "./economy.js";
import { addItem } from "./inventory.js";
import { hurt } from "./player.js";
import { boom } from "./effects.js";
import { playerPos, playerVel } from "./pilot.js";
import { addEntity, dropEntity, freshQuat } from "./entity.js";

const CRATE_LIFE = 240;      // seconds before loot despawns
const CRATE_PULL = 140;      // within this distance a crate drifts toward you
const CRATE_PICKUP = 20;     // within this distance you collect it
const CRATE_SPIN = 1;        // radians a second the crate turns in place

const _spin = Q();           // scratch, so a frame allocates nothing

function missionDropList(placeId, create = true) {
  const world = state.worldState;
  const states = world.missionState;
  if (!create && (!states || typeof states !== "object" || Array.isArray(states))) return [];
  if (!world.missionState || typeof world.missionState !== "object" || Array.isArray(world.missionState)) {
    world.missionState = {};
  }
  const place = world.missionState[placeId];
  if (!create && (!place || typeof place !== "object" || Array.isArray(place))) return [];
  if (!place || typeof place !== "object" || Array.isArray(place)) {
    world.missionState[placeId] = {};
  }
  const record = world.missionState[placeId];
  if (!Array.isArray(record.drops)) {
    if (!create) return [];
    record.drops = [];
  }
  return record.drops;
}

function missionDropFor(placeId, missionId, item) {
  return missionDropList(placeId, false).find(drop =>
    drop && drop.missionId === missionId && drop.item === item
  ) || null;
}

function missionDropPosition(drop) {
  return Array.isArray(drop?.pos) && drop.pos.length === 3 && drop.pos.every(Number.isFinite)
    ? V(drop.pos[0], drop.pos[1], drop.pos[2])
    : null;
}

function rememberMissionDrop(placeId, missionId, item, pos) {
  const drops = missionDropList(placeId);
  const existing = drops.find(drop => drop?.missionId === missionId && drop?.item === item);
  if (existing) return existing;
  const record = {
    missionId,
    item,
    pos: [Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.z) || 0],
    collected: false,
  };
  drops.push(record);
  return record;
}

function saveMissionDropPosition(crate) {
  if (!crate?.missionId || !crate.persistent) return;
  const drops = missionDropList(crate.place || state.place, false);
  const record = drops.find(drop => drop?.missionId === crate.missionId && drop?.item === crate.item);
  if (record && record.collected !== true) {
    record.pos = [Number(crate.pos.x) || 0, Number(crate.pos.y) || 0, Number(crate.pos.z) || 0];
  }
}

/** Mark a mission crate collected, or remove it when its mission is abandoned. */
export function removeMissionDrop(crate, collected = false) {
  if (!crate?.missionId || !crate.persistent) return;
  const drops = missionDropList(crate.place || state.place, false);
  const index = drops.findIndex(drop => drop?.missionId === crate.missionId && drop?.item === crate.item);
  if (index < 0) return;
  if (collected) drops[index].collected = true;
  else drops.splice(index, 1);
}

/** Remove all persisted drops owned by one mission, including already-collected markers. */
export function clearMissionDrops(missionId) {
  if (!missionId) return;
  const stateByPlace = state.worldState?.missionState;
  if (!stateByPlace || typeof stateByPlace !== "object" || Array.isArray(stateByPlace)) return;
  for (const place of Object.keys(stateByPlace)) {
    const drops = stateByPlace[place]?.drops;
    if (Array.isArray(drops)) {
      stateByPlace[place].drops = drops.filter(drop => drop?.missionId !== missionId);
      if (!stateByPlace[place].drops.length) delete stateByPlace[place].drops;
    }
  }
}

/** Rebuild uncollected mission crates when a saved pocket is loaded. */
export function restoreMissionDrops(placeId = state.place) {
  const W = placeWorld(placeId);
  const drops = missionDropList(placeId, false);
  for (const drop of [...drops]) {
    if (!drop || drop.collected || !drop.missionId || !drop.item) continue;
    if (W.crates.some(crate => crate.missionId === drop.missionId && crate.item === drop.item && crate.persistent)) continue;
    const pos = missionDropPosition(drop);
    if (pos) spawnCrate(pos, drop.item, placeId, null, null, drop.missionId);
  }

  // A pre-physical-flow v19 save can already be waiting at Border Signal's
  // collect step without a mission-drop record: the old script handed the item
  // out directly and never saved a defeat position. Give that save one safe,
  // deterministic crate at the pocket arrival point rather than soft-locking it.
  for (const mission of state.profile?.missions || []) {
    // Only a mission that is still ON its collect step needs a legacy crate;
    // a failed one is gone and a finished one is past every step.
    if (mission.failed) continue;
    const step = mission.steps?.[mission.step ?? mission.current];
    if (step?.kind !== "collect" || step.missionItem !== true || step.place !== placeId || !step.item) continue;
    if (drops.some(drop => drop?.missionId === mission.id && drop.item === step.item)) continue;
    if (W.crates.some(crate => crate.missionId === mission.id && crate.item === step.item && crate.persistent)) continue;
    const arrival = placeAt(placeId)?.enter?.pos;
    const pos = Array.isArray(arrival) && arrival.length === 3 ? V(...arrival) : V(0, 0, 0);
    spawnCrate(pos, step.item, placeId, null, null, mission.id);
  }
}

/**
 * Spawn a bullet. Player bullets inherit the ship's velocity. Returns the new
 * record; its mesh is the view's business (step 7b).
 */
export function fire(p, dir, speed, own, dmg, player = localPlayer(), placeId = player?.place || state.place, missionId = null) {
  // `p` may be a plain `{ x, y, z }` (the tests pass one) or a maths vector.
  const at = V(p.x, p.y, p.z);
  const quat = Q();
  faceQ(quat, at, at.clone().add(dir), 1);   // the record points the way it flies
  const e = {
    kind: "bullet",
    place: placeId,
    missionId,
    pos: at,
    quat,
    v: dir.clone().multiplyScalar(speed).add(own ? playerVel(player) : V(0, 0, 0)),
    own,
    owner: own ? player : null,
    dmg,
    l: 2.4,
  };
  return addEntity(placeWorld(placeId).bullets, e);
}

/** Apply damage to a hostile and handle its death. */
export function hitHostile(e, dmg, at, byPlayer = localPlayer(), placeId = e.place || state.place) {
  e.hp -= dmg;
  boom(at, 2, 0xffd080, placeId);
  if (e.hp <= 0) killHostile(e, byPlayer, placeId);
}

function killHostile(e, byPlayer = localPlayer(), placeId = e.place || state.place) {
  boom(enemyPos(e), 22, 0xff8a40, placeId);
  dropEnemy(e);          // out of the world, and render/views.js removes its mesh
  const prof = byPlayer ? profileOf(byPlayer) : state.profile;
  if (prof) prof.kills++;
  emit("enemy-killed", {
    def: e.def,
    faction: e.f,
    id: e.id,
    player: byPlayer,
    place: placeId,
    encounter: e.encounter || null,
  });

  // Every hostile keeps its ordinary authored loot. A mission's authored item is
  // additive: it is another physical crate at this wreck, tagged so it can be
  // persisted and matched to the mission's collect objective.
  const missionId = String(e.encounter || "").startsWith("mission:")
    ? String(e.encounter).slice("mission:".length)
    : null;
  const authoredDrops = Array.isArray(e.dropOnDefeat)
    ? e.dropOnDefeat
    : e.dropOnDefeat && typeof e.dropOnDefeat === "object"
      ? [e.dropOnDefeat]
      : [];
  for (const drop of rollLoot(e.loot)) {
    const count = Math.max(1, Math.floor(+drop.count || 1));
    const scatter = Math.max(0, Number(drop.scatter) || 0);
    for (let k = 0; k < count; k++) {
      // Ordinary loot remains ordinary loot even when it came from a mission
      // wave. It keeps the normal expiry and pickup behavior, while its mission
      // tag still lets abandonment clear the scripted wave's leftovers.
      spawnCrate(scattered(enemyPos(e), scatter), drop.item, placeId, null, null, missionId, false);
    }
  }
  for (const drop of authoredDrops) {
    const count = Math.max(1, Math.floor(+drop.count || 1));
    const scatter = Math.max(0, Number(drop.scatter) || 0);
    for (let k = 0; k < count; k++) {
      spawnCrate(scattered(enemyPos(e), scatter), drop.item, placeId, null, null, missionId, true);
    }
  }
  if (!byPlayer || byPlayer === state.player) msg("Hostile destroyed", 2);
}

/** A point up to `d` metres away from `p` in each direction (0 = exactly `p`). */
const scattered = (p, d) => (d > 0 ? p.clone().add(V(R(-d, d), R(-d, d), R(-d, d))) : p);

/** Drop a crate holding `item` at `p`. Cores are rarer and drawn in blue.
 * `missionId` owns a crate for abandonment cleanup; `persistent` is true only
 * for an authored mission objective, which survives warps and saves. */
export function spawnCrate(
  p,
  item = "salv",
  placeId = state.place,
  encounter = null,
  encounterType = null,
  missionId = null,
  persistent = !!missionId,
) {
  const W = placeWorld(placeId);
  let at = V(p.x, p.y, p.z);
  if (missionId && persistent) {
    const saved = missionDropFor(placeId, missionId, item);
    if (saved?.collected) return null;
    const existing = W.crates.find(crate =>
      crate.missionId === missionId && crate.item === item && crate.persistent
    );
    if (existing) return existing;
    const savedPos = missionDropPosition(saved);
    if (savedPos) at = savedPos;
    else rememberMissionDrop(placeId, missionId, item, at);
  }
  const e = {
    kind: "crate",
    place: placeId,
    encounter,
    encounterType,
    missionId,
    persistent: !!missionId && persistent,
    pos: at,
    quat: freshQuat(),      // the sim turns it; the view copies the turn
    t: missionId && persistent ? Infinity : CRATE_LIFE,
    item,
    spin: CRATE_SPIN,
  };
  return addEntity(W.crates, e);
}

/** Move bullets along their path and resolve hits. */
export function updateBullets(dt, placeId = state.place) {
  const W = placeWorld(placeId),
    B = W.bullets;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    // A hit can kill the player mid-loop and clear this array. Skip stale entries.
    if (!b || B.indexOf(b) === -1) continue;
    b.pos.addScaledVector(b.v, dt);
    b.l -= dt;
    let dead = b.l <= 0;

    if (!dead && b.own) {
      for (let j = W.enemies.length - 1; j >= 0; j--) {
        const e = W.enemies[j];
        if (enemyPos(e).distanceTo(b.pos) < 9) {
          hitHostile(e, b.dmg, b.pos, b.owner, placeId);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const a of W.asteroids) {
          if (a.pos.distanceTo(b.pos) < a.r * 0.8) {
            dead = true;
            break;
          }
        }
      }
    } else if (!dead && !b.own) {
      for (const player of state.players) {
        if (!player || player.docked || player.dead) continue;
        if ((player.place || state.place) !== placeId) continue;
        if (playerPos(player).distanceTo(b.pos) < 6) {
          hurt(b.dmg, player);
          dead = true;
          break;
        }
      }
    }

    if (dead) dropEntity(B, b);
  }
}

/** Drift, expire and collect loot crates across active pilots. */
export function updateCrates(dt, placeId = state.place) {
  const C = placeWorld(placeId).crates;
  const active = state.players.filter(p => p && !p.docked && !p.dead && (p.place || state.place) === placeId);
  for (let i = C.length - 1; i >= 0; i--) {
    const c = C[i];
    if (!c || C.indexOf(c) === -1) continue;
    const candidates = active.map(p => {
      const q = playerPos(p).clone().sub(c.pos);
      return { p, q, d: q.length() };
    });
    // The crate turns in place, a radian a second, the way it always has: the
    // rotation is on the record now, so a view (or a guest) can simply copy it.
    c.quat.multiply(_spin.setFromAxisAngle(UP, c.spin * dt));
    c.t -= dt;
    if (c.t <= 0) {
      dropEntity(C, c);
      continue;
    }
    if (!candidates.length) continue;

    let nearest = candidates[0];
    for (let k = 1; k < candidates.length; k++) {
      if (candidates[k].d < nearest.d) nearest = candidates[k];
    }
    if (nearest.d < CRATE_PULL) {
      c.pos.addScaledVector(nearest.q.normalize(), Math.min(nearest.d, 60 * dt));
      saveMissionDropPosition(c);
    }

    const inRange = candidates.filter(x => x.d < CRATE_PICKUP).sort((a, b) => a.d - b.d);
    for (const { p } of inRange) {
      const prof = profileOf(p);
      if (!prof) continue;
      const k = c.item,
        local = p === state.player;
      if (holdLoad(prof) >= SHIPS[prof.ship].cargo || !addItem(prof.ship, k, 1, prof)) {
        if (local) say("Cargo hold full");
      } else {
        // Remove it before announcing pickup so a place-memory listener can see
        // whether this was the encounter's last crate. Mission records keep a
        // consumed marker until the mission is rewarded or abandoned, preventing
        // a retry or reload from recreating the same physical item.
        if (c.missionId) removeMissionDrop(c, true);
        dropEntity(C, c);
        emit("pickup", {
          item: k,
          player: p,
          place: placeId,
          missionId: c.missionId || null,
          missionItem: !!c.persistent,
          encounter: c.encounter,
          encounterType: c.encounterType || null,
        });
        if (local) msg(`Picked up ${itemName(k)}`, 2);
        if (placeId === state.place) emit("sfx", { name: "pickup" });
        break;
      }
    }
  }
}
