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
import { state, msg, say } from "../state/state.js";
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
export function fire(p, dir, speed, own, dmg) {
  // `p` may be a plain `{ x, y, z }` (the tests pass one) or a maths vector.
  const at = V(p.x, p.y, p.z);
  const quat = Q();
  faceQ(quat, at, at.clone().add(dir), 1);   // the record points the way it flies
  const e = {
    kind: "bullet",
    pos: at,
    quat,
    v: dir.clone().multiplyScalar(speed).add(own ? playerVel() : V(0, 0, 0)),
    own,
    dmg,
    l: 2.4,
  };
  return addEntity(state.world.bullets, e);
}

/** Apply damage to a hostile and handle its death. */
export function hitHostile(e, dmg, at) {
  e.hp -= dmg;
  boom(at, 2, 0xffd080);
  if (e.hp <= 0) killHostile(e);
}

function killHostile(e) {
  boom(enemyPos(e), 22, 0xff8a40);
  dropEnemy(e);          // out of the world, and render/views.js removes its mesh
  state.profile.kills++;
  emit("enemy-killed", { def: e.def, faction: e.f, id: e.id });

  // Loot: whatever the enemy's table says (data/loot.js).
  for (const drop of rollLoot(e.loot)) {
    for (let k = 0; k < drop.count; k++) spawnCrate(scattered(enemyPos(e), drop.scatter), drop.item);
  }
  msg("Hostile destroyed", 2);
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
    B = W.bullets,
    pp = playerPos();
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
          hitHostile(e, b.dmg, b.pos);
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
    } else if (!dead && !b.own && pp.distanceTo(b.pos) < 6) {
      hurt(b.dmg);
      dead = true;
    }

    if (dead) dropEntity(B, b);
  }
}

/** Drift, expire and collect loot crates. */
export function updateCrates(dt) {
  const C = state.world.crates,
    S = state.profile,
    pp = playerPos();
  for (let i = C.length - 1; i >= 0; i--) {
    const c = C[i];
    if (!c || C.indexOf(c) === -1) continue;
    const q = pp.clone().sub(c.pos),
      d = q.length();
    // The crate turns in place, a radian a second, the way it always has: the
    // rotation is on the record now, so a view (or a guest) can simply copy it.
    c.quat.multiply(_spin.setFromAxisAngle(UP, c.spin * dt));
    c.t -= dt;
    if (c.t <= 0) {
      dropEntity(C, c);
      continue;
    }
    if (d < CRATE_PULL) c.pos.addScaledVector(q.normalize(), Math.min(d, 60 * dt));
    if (d < CRATE_PICKUP) {
      const k = c.item;
      if (holdLoad() >= SHIPS[S.ship].cargo || !addItem(S.ship, k, 1)) {
        say("Cargo hold full");
      } else {
        emit("pickup", { item: k });
        msg(`Picked up ${itemName(k)}`, 2);
        emit("sfx", { name: "pickup" });
        dropEntity(C, c);
      }
    }
  }
}
