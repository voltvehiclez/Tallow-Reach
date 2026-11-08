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
import { SHIPS } from "../data/ships.js";
import { state, msg, say, localPlayer, profileOf } from "../state/state.js";
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

/**
 * Spawn a bullet. Player bullets inherit the ship's velocity. Returns the new
 * record; its mesh is the view's business (step 7b).
 */
export function fire(p, dir, speed, own, dmg, player = localPlayer()) {
  // `p` may be a plain `{ x, y, z }` (the tests pass one) or a maths vector.
  const at = V(p.x, p.y, p.z);
  const quat = Q();
  faceQ(quat, at, at.clone().add(dir), 1);   // the record points the way it flies
  const e = {
    kind: "bullet",
    pos: at,
    quat,
    v: dir.clone().multiplyScalar(speed).add(own ? playerVel(player) : V(0, 0, 0)),
    own,
    owner: own ? player : null,
    dmg,
    l: 2.4,
  };
  return addEntity(state.world.bullets, e);
}

/** Apply damage to a hostile and handle its death. */
export function hitHostile(e, dmg, at, byPlayer = localPlayer()) {
  e.hp -= dmg;
  boom(at, 2, 0xffd080);
  if (e.hp <= 0) killHostile(e, byPlayer);
}

function killHostile(e, byPlayer = localPlayer()) {
  boom(enemyPos(e), 22, 0xff8a40);
  dropEnemy(e);          // out of the world, and render/views.js removes its mesh
  const prof = byPlayer ? profileOf(byPlayer) : state.profile;
  if (prof) prof.kills++;
  emit("enemy-killed", { def: e.def, faction: e.f, id: e.id, player: byPlayer });

  // Loot: whatever the enemy's table says (data/loot.js).
  for (const drop of rollLoot(e.loot)) {
    for (let k = 0; k < drop.count; k++) spawnCrate(scattered(enemyPos(e), drop.scatter), drop.item);
  }
  if (!byPlayer || byPlayer === state.player) msg("Hostile destroyed", 2);
}

/** A point up to `d` metres away from `p` in each direction (0 = exactly `p`). */
const scattered = (p, d) => (d > 0 ? p.clone().add(V(R(-d, d), R(-d, d), R(-d, d))) : p);

/** Drop a crate holding `item` at `p`. Cores are rarer and drawn in blue. */
export function spawnCrate(p, item = "salv") {
  const e = {
    kind: "crate",
    pos: V(p.x, p.y, p.z),
    quat: freshQuat(),      // the sim turns it; the view copies the turn
    t: CRATE_LIFE,
    item,
    spin: CRATE_SPIN,
  };
  return addEntity(state.world.crates, e);
}

/** Move bullets along their path and resolve hits. */
export function updateBullets(dt) {
  const W = state.world,
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
          hitHostile(e, b.dmg, b.pos, b.owner);
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
export function updateCrates(dt) {
  const C = state.world.crates;
  const active = state.players.filter(p => p && !p.docked && !p.dead);
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
        emit("pickup", { item: k, player: p });
        if (local) msg(`Picked up ${itemName(k)}`, 2);
        emit("sfx", { name: "pickup" });
        dropEntity(C, c);
        break;
      }
    }
  }
}
