// Projectiles, hostile kills, loot crates and pickups.

import * as THREE from "three";
import { V, R, face } from "../util/math.js";
import { rollLoot } from "./loot.js";
import { emit } from "../util/events.js";
import { itemName } from "../data/items.js";
import { SHIPS } from "../data/ships.js";
import { scene } from "../render/scene.js";
import { mm } from "../render/models.js";
import { state, msg, say } from "../state/state.js";
import { holdLoad } from "./economy.js";
import { addItem } from "./inventory.js";
import { hurt } from "./player.js";
import { boom } from "./effects.js";

const CRATE_LIFE = 240;      // seconds before loot despawns
const CRATE_PULL = 140;      // within this distance a crate drifts toward you
const CRATE_PICKUP = 20;     // within this distance you collect it

const bulletGeo = new THREE.BoxGeometry(0.3, 0.3, 5);
const playerBulletMat = new THREE.MeshBasicMaterial({ color: 0xffc870 });
const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff4a35 });
const crateGeo = new THREE.OctahedronGeometry(3);

/** Spawn a bullet. Player bullets inherit the ship's velocity. */
export function fire(p, dir, speed, own, dmg) {
  const m = new THREE.Mesh(bulletGeo, own ? playerBulletMat : enemyBulletMat);
  m.position.copy(p);
  face(m, p.clone().add(dir), 1);
  scene.add(m);
  state.world.bullets.push({
    m,
    v: dir.clone().multiplyScalar(speed).add(own ? state.player.v : V(0, 0, 0)),
    own,
    dmg,
    l: 2.4,
  });
}

/** Apply damage to a hostile and handle its death. */
export function hitHostile(e, dmg, at) {
  e.hp -= dmg;
  boom(at, 2, 0xffd080);
  if (e.hp <= 0) killHostile(e);
}

function killHostile(e) {
  const W = state.world;
  boom(e.m.position, 22, 0xff8a40);
  scene.remove(e.m);
  W.enemies.splice(W.enemies.indexOf(e), 1);
  state.profile.kills++;
  emit("enemy-killed", { def: e.def, faction: e.f });

  // Loot: whatever the enemy's table says (data/loot.js).
  for (const drop of rollLoot(e.loot)) {
    for (let k = 0; k < drop.count; k++) spawnCrate(scattered(e.m.position, drop.scatter), drop.item);
  }
  msg("Hostile destroyed", 2);
}

/** A point up to `d` metres away from `p` in each direction (0 = exactly `p`). */
const scattered = (p, d) => (d > 0 ? p.clone().add(V(R(-d, d), R(-d, d), R(-d, d))) : p);

/** Drop a crate holding `item` at `p`. Cores are rarer and drawn in blue. */
export function spawnCrate(p, item = "salv") {
  const m = new THREE.Mesh(
    crateGeo,
    item === "core" ? mm(0x3a6a7a, 0x1a5a6a) : mm(0x6a5a3a, 0x4a3510)
  );
  m.position.copy(p);
  scene.add(m);
  state.world.crates.push({ m, t: CRATE_LIFE, item });
}

/** Move bullets along their path and resolve hits. */
export function updateBullets(dt) {
  const W = state.world,
    B = W.bullets,
    pp = state.player.m.position;
  for (let i = B.length - 1; i >= 0; i--) {
    const b = B[i];
    // A hit can kill the player mid-loop and clear this array. Skip stale entries.
    if (!b) continue;
    b.m.position.addScaledVector(b.v, dt);
    b.l -= dt;
    let dead = b.l <= 0;

    if (!dead && b.own) {
      for (let j = W.enemies.length - 1; j >= 0; j--) {
        const e = W.enemies[j];
        if (e.m.position.distanceTo(b.m.position) < 9) {
          hitHostile(e, b.dmg, b.m.position);
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const a of W.asteroids) {
          if (a.m.position.distanceTo(b.m.position) < a.r * 0.8) {
            dead = true;
            break;
          }
        }
      }
    } else if (!dead && !b.own && pp.distanceTo(b.m.position) < 6) {
      hurt(b.dmg);
      dead = true;
    }

    if (dead) {
      scene.remove(b.m);
      B.splice(i, 1);
    }
  }
}

/** Drift, expire and collect loot crates. */
export function updateCrates(dt) {
  const C = state.world.crates,
    S = state.profile,
    pp = state.player.m.position;
  for (let i = C.length - 1; i >= 0; i--) {
    const c = C[i];
    if (!c) continue;
    const q = pp.clone().sub(c.m.position),
      d = q.length();
    c.m.rotation.y += dt;
    c.t -= dt;
    if (c.t <= 0) {
      scene.remove(c.m);
      C.splice(i, 1);
      continue;
    }
    if (d < CRATE_PULL) c.m.position.addScaledVector(q.normalize(), Math.min(d, 60 * dt));
    if (d < CRATE_PICKUP) {
      const k = c.item;
      if (holdLoad() >= SHIPS[S.ship].cargo || !addItem(S.ship, k, 1)) {
        say("Cargo hold full");
      } else {
        emit("pickup", { item: k });
        msg(`Picked up ${itemName(k)}`, 2);
        emit("sfx", { name: "pickup" });
        scene.remove(c.m);
        C.splice(i, 1);
      }
    }
  }
}
