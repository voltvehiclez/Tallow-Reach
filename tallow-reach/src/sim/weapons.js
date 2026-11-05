// Player weapons: cannons and mining beam (primary), homing missiles (secondary).

import * as THREE from "three";
import { V, fwd, face, UP, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { SHIPS } from "../data/ships.js";
import { ITEM } from "../data/items.js";
import { PRIMARY, MISSILE } from "../data/weapons.js";
import { keys } from "../core/input.js";
import { tone, nz } from "../core/audio.js";
import { scene, camera } from "../render/scene.js";
import { state, say, msg } from "../state/state.js";
import { holdLoad } from "./economy.js";
import { fire, hitHostile } from "./combat.js";
import { boom, puff } from "./effects.js";
import { spawnAsteroid } from "./asteroids.js";

const ASTEROID_RESPAWN_MS = 30000;

const beamMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.3, 0.3, 1, 6),
  new THREE.MeshBasicMaterial({ color: 0xffb25a, transparent: true, opacity: 0.8 })
);
beamMesh.visible = false;
scene.add(beamMesh);

const missileGeo = new THREE.BoxGeometry(0.5, 0.5, 3);
const missileMat = new THREE.MeshStandardMaterial({
  color: 0x8a8f94,
  emissive: 0xff7a30,
  emissiveIntensity: 0.8,
});

/** Equip a primary weapon. The beam needs to be bought first. */
export function setWeapon(name) {
  const S = state.profile;
  if (name === "beam" && !S.wp.beam) {
    msg("No mining beam installed. Buy one in the station shop.", 3);
    return;
  }
  S.pw = name;
  msg(name === "beam" ? "Mining beam equipped" : "Cannons equipped", 1.5);
}

/** Primary fire: cannons when held, or the mining beam if it is equipped. */
export function updatePrimary(dt) {
  const F = state.flight,
    S = state.profile,
    P = state.player,
    d = SHIPS[S.ship];

  F.fireCd -= dt;
  if (keys.fire && S.pw !== "beam" && F.fireCd <= 0) {
    F.fireCd = PRIMARY.cannon.cooldown;
    tone(700, 120, 0.09, 0.05, "square");
    const f = fwd(P.m);
    [-1.8, 1.8].forEach(x =>
      fire(
        P.m.localToWorld(V(x, -0.2, -5 * d.sc)),
        f,
        PRIMARY.cannon.speed,
        true,
        PRIMARY.cannon.damage * d.dmg
      )
    );
  }

  F.beamOn = false;
  beamMesh.visible = false;
  if (!(keys.fire && S.pw === "beam" && S.wp.beam)) return;

  // Find the nearest asteroid inside the beam cone.
  const f = fwd(P.m),
    pp = P.m.position;
  let best = null,
    bestDist = 1e9;
  for (const a of state.world.asteroids) {
    const q = a.m.position.clone().sub(pp),
      along = q.dot(f);
    if (along < 5 || along > PRIMARY.beam.range) continue;
    const off = Math.sqrt(Math.max(0, q.lengthSq() - along * along));
    if (off < a.r + 4 && along < bestDist) {
      bestDist = along;
      best = a;
    }
  }
  if (!best) {
    say("No asteroid in beam range");
    return;
  }

  // Draw the beam from the gun to the rock.
  const start = P.m.localToWorld(V(0, -1, -6 * d.sc)),
    end = pp.clone().addScaledVector(f, Math.max(0, bestDist - best.r * 0.5)),
    delta = end.clone().sub(start),
    len = delta.length();
  beamMesh.visible = true;
  F.beamOn = true;
  beamMesh.position.copy(start).addScaledVector(delta, 0.5);
  beamMesh.scale.set(1, len, 1);
  beamMesh.quaternion.setFromUnitVectors(UP, delta.normalize());

  if (holdLoad() >= d.cargo) {
    say("Cargo hold full");
    return;
  }

  const mined = Math.min(PRIMARY.beam.rate * d.mine * dt, best.ore);
  best.ore -= mined;
  P.acc += mined;
  say(`${ITEM[best.type].n}: ${Math.ceil(best.ore)} left in rock`);
  while (P.acc >= 1 && holdLoad() < d.cargo) {
    S.cargo[best.type]++;
    P.acc--;
    emit("mined", { item: best.type });
  }

  best.m.scale.copy(best.s0).multiplyScalar(0.3 + (0.7 * best.ore) / best.max);
  F.mineFrac = best.ore / best.max;
  if (best.ore <= 0) {
    scene.remove(best.m);
    state.world.asteroids.splice(state.world.asteroids.indexOf(best), 1);
    boom(best.m.position, 12, 0x8a7a6a);
    setTimeout(spawnAsteroid, ASTEROID_RESPAWN_MS);
  }
}

/**
 * Secondary fire and missile lock-on. Hostiles that stay in the lock cone
 * for MISSILE.lock seconds become a locked target.
 */
export function updateMissiles(dt) {
  const F = state.flight,
    S = state.profile,
    P = state.player,
    W = state.world,
    ML = F.missileLock;

  F.missileCd -= dt;

  if (!S.wp.msl) {
    F.coneRadius = 0;
    ML.target = null;
    ML.locked = false;
    ML.t = 0;
    if (keys.sec) say("No secondary weapon installed");
  } else {
    // Radius of the lock ring on screen, matching the cone angle.
    F.coneRadius =
      (Math.tan((MISSILE.cone * Math.PI) / 180) / Math.tan((camera.fov * Math.PI) / 360)) *
      innerHeight / 2;

    const cf = V(0, 0, -1).applyQuaternion(camera.quaternion),
      pp = P.m.position;
    let best = null,
      bestAngle = (MISSILE.cone * Math.PI) / 180;
    if (!state.freeCam.on) {
      for (const e of W.enemies) {
        const q = e.m.position.clone().sub(pp),
          d = q.length();
        if (d > MISSILE.range) continue;
        const angle = Math.acos(clamp(q.dot(cf) / d, -1, 1));
        if (angle < bestAngle) {
          bestAngle = angle;
          best = e;
        }
      }
    }

    if (best && best === ML.target) {
      ML.t += dt;
      if (!ML.locked && ML.t >= MISSILE.lock) {
        ML.locked = true;
        tone(1300, 1300, 0.1, 0.06);
        setTimeout(() => tone(1300, 1300, 0.1, 0.06), 140);
      }
    } else {
      ML.target = best;
      ML.t = 0;
      ML.locked = false;
    }

    if (ML.target) {
      say(ML.locked ? "MISSILE LOCK" : "Acquiring lock " + Math.round(Math.min(1, ML.t / MISSILE.lock) * 100) + "%");
    }

    if (keys.sec && F.missileCd <= 0) {
      if (S.msl <= 0) say("Out of missiles");
      else {
        fireMissile(ML.locked ? ML.target : null);
        F.missileCd = MISSILE.cd;
      }
    }
  }

  updateMissileFlight(dt);
}

function fireMissile(target) {
  const S = state.profile,
    P = state.player;
  S.msl--;
  const d = fwd(P.m),
    p = P.m.localToWorld(V(0, -1.2, -5 * SHIPS[S.ship].sc)),
    m = new THREE.Mesh(missileGeo, missileMat);
  m.position.copy(p);
  face(m, p.clone().add(d), 1);
  scene.add(m);
  state.world.missiles.push({
    m,
    d: d.clone(),
    sp: MISSILE.sp0 + Math.max(0, P.v.dot(d)),
    t: target,
    l: MISSILE.life,
  });
  nz(0.35, 900, 0.15);
  tone(300, 120, 0.3, 0.05, "sawtooth");
}

function updateMissileFlight(dt) {
  const W = state.world,
    MS = W.missiles;
  for (let i = MS.length - 1; i >= 0; i--) {
    const s = MS[i],
      m = s.m;
    s.l -= dt;

    // Steer toward the target, leading it by its velocity.
    if (s.t && W.enemies.includes(s.t)) {
      const ep = s.t.m.position,
        ev = s.t.v || V(0, 0, 0),
        tt = ep.clone().sub(m.position).length() / Math.max(s.sp, 1),
        aim = ep.clone().addScaledVector(ev, tt * 0.85).sub(m.position).normalize();
      s.d.lerp(aim, Math.min(1, MISSILE.turn * dt)).normalize();
    } else {
      s.t = null;
    }

    s.sp = Math.min(MISSILE.max, s.sp + MISSILE.acc * dt);
    m.position.addScaledVector(s.d, s.sp * dt);
    face(m, m.position.clone().add(s.d), 1);
    puff(m.position, 0xaaa090, 0.5);

    let end = s.l <= 0;
    for (const e of W.enemies) {
      if (e.m.position.distanceTo(m.position) < 12) {
        hitHostile(e, MISSILE.dmg, e.m.position);
        end = true;
        break;
      }
    }
    if (!end) {
      for (const a of W.asteroids) {
        if (a.m.position.distanceTo(m.position) < a.r * 0.8) {
          end = true;
          break;
        }
      }
    }
    if (end) {
      boom(m.position, 16, 0xffa060);
      scene.remove(m);
      MS.splice(i, 1);
    }
  }
}
