// Player weapons: the fitted primary modules (guns, the mining beam) and homing
// missiles (secondary).

import * as THREE from "three";
import { V, fwd, face, UP, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { SHIPS } from "../data/ships.js";
import { itemName } from "../data/items.js";
import { MISSILE } from "../data/weapons.js";
import { MODULES } from "../data/modules.js";
import { keys } from "../core/input.js";
import { tone, nz, oreGained } from "../core/audio.js";
import { scene, camera } from "../render/scene.js";
import { state, say, msg } from "../state/state.js";
import { holdLoad } from "./economy.js";
import { addItem } from "./inventory.js";
import { setDraw, hasPower } from "./power.js";
import { gunsOf, moduleListName } from "./guns.js";

export { gunsOf, refreshGuns } from "./guns.js";
import { fire, hitHostile } from "./combat.js";
import { boom, puff } from "./effects.js";
import { spawnAsteroid } from "./asteroids.js";

const ASTEROID_RESPAWN_MS = 30000;
// Metres between the linked barrels of a multi-barrel gun (the basic cannon links two).
// A twin-link sits on the two fixed nose hardpoints at -1.8 m and +1.8 m, the layout
// the cannons had before they were a module: one bolt per side of the nose. Private
// to the firing code; how many barrels a gun has is data (`barrels` on the module).
const BARREL_SPACING = 3.6;

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

/** Equip a primary weapon. Keys 1 and 2 cycle the primary slots: key 1 is the
 *  cannon slot (whatever the primary bays are holding), key 2 is the mining beam
 *  slot. A slot with nothing in it — the beam unbought, or every primary bay
 *  empty — is an "Empty weapon slot": left click does nothing. */
export function setWeapon(name) {
  const S = state.profile;
  S.pw = name;
  if (name === "beam")
    msg((state.beams || []).length > 0 ? `${moduleListName(state.beams)} equipped` : "Empty weapon slot", 1.5);
  else
    msg(state.guns.length > 0 ? `${moduleListName(state.guns)} equipped` : "Empty weapon slot", 1.5);
}

/** Primary fire: the fitted guns when held, or the mining beam if its slot is
 *  selected and one is fitted. */
export function updatePrimary(dt) {
  const F = state.flight,
    S = state.profile,
    P = state.player,
    d = SHIPS[S.ship];

  // Every fitted gun counts down on its own, so two guns can fire out of step.
  state.guns.forEach((g, i) => {
    F.gunCd[i] = Math.max(0, (F.gunCd[i] || 0) - dt);
  });

  // Weapons are offline during a warp: no cannons, no beam, and nothing is drawn.
  if (state.warp) {
    F.gunsOn = false;
    setDraw("guns", 0);
    F.beamOn = false;
    F.beamT = 0;
    setDraw("beam", 0);
    beamMesh.visible = false;
    return;
  }

  // Guns: whichever primary bays hold a gun fire together on left click, each on
  // its own cooldown. Firing costs 2 MJ/s a gun, and a ship with no power to spare
  // fires nothing — the same rule the thrusters and shields follow.
  const gunDraw = state.guns.reduce((sum, g) => sum + g.draw, 0);
  const wantGuns = keys.fire && S.pw !== "beam" && state.guns.length > 0;
  // Compare against the rest of the ship's bill, so the guns are not counted twice.
  const otherDraw = state.power.draw - (state.power.use.guns || 0);
  F.gunsOn = wantGuns && hasPower(otherDraw + gunDraw);
  setDraw("guns", F.gunsOn ? gunDraw : 0);

  if (F.gunsOn) {
    let fired = false;
    state.guns.forEach((g, i) => {
      if (F.gunCd[i] > 0) return;
      F.gunCd[i] = 1 / g.rate;
      fired = true;
      // One bolt per linked barrel. A multi-barrel gun fires from the fixed nose
      // hardpoints mirrored about the centerline (the basic cannon puts one bolt
      // per side, at -1.8 m and +1.8 m) wherever it sits in the bays — the way the
      // cannons fired before they were a module. A single barrel fires from its
      // bay mount as usual. Same cooldown and same power draw either way.
      const n = Math.max(1, g.barrels || 1),
        f = fwd(P.m);
      for (let b = 0; b < n; b++) {
        const x = n > 1 ? (b - (n - 1) / 2) * BARREL_SPACING : -1.8 + 3.6 * i;
        fire(
          P.m.localToWorld(V(x, -0.2, -5 * d.sc)),
          f,
          g.speed,
          true,
          g.dmg * d.dmg
        );
      }
    });
    if (fired) tone(700, 120, 0.09, 0.05, "square");
  }

  // The mining beam: the first beam module fitted in the primary bays, in bay
  // order. It needs the beam slot (key 2), a rock in reach and the power to cut;
  // it draws MJ/s only while it is actually cutting. One ore per `period`
  // seconds of uninterrupted contact with the same rock (scaled by the hull's
  // mine multiplier); the moment contact stops, the progress toward the next
  // ore is lost — the count starts over.
  const beam = (state.beams || [])[0];
  const beamOtherDraw = state.power.draw - (state.power.use.beam || 0);
  F.beamOn = false;
  beamMesh.visible = false;
  if (keys.fire && S.pw === "beam" && beam) {
    // Find the nearest asteroid inside the beam cone.
    const f = fwd(P.m),
      pp = P.m.position;
    let best = null,
      bestDist = 1e9;
    for (const a of state.world.asteroids) {
      const q = a.m.position.clone().sub(pp),
        along = q.dot(f);
      if (along < 5 || along > beam.range) continue;
      const off = Math.sqrt(Math.max(0, q.lengthSq() - along * along));
      if (off < a.r + 4 && along < bestDist) {
        bestDist = along;
        best = a;
      }
    }
    if (!best) {
      say("No asteroid in beam range");
    } else if (holdLoad() >= d.cargo) {
      say("Cargo hold full");
    } else if (!hasPower(beamOtherDraw + beam.draw)) {
      say("Not enough power");
    } else {
      // The beam cuts continuously. Draw it, charge for it, and bank whole ores
      // as they complete.
      const start = P.m.localToWorld(V(0, -1, -6 * d.sc)),
        end = pp.clone().addScaledVector(f, Math.max(0, bestDist - best.r * 0.5)),
        delta = end.clone().sub(start),
        len = delta.length();
      beamMesh.visible = true;
      F.beamOn = true;
      beamMesh.position.copy(start).addScaledVector(delta, 0.5);
      beamMesh.scale.set(1, len, 1);
      beamMesh.quaternion.setFromUnitVectors(UP, delta.normalize());

      F.beamT = (F.beamT || 0) + dt * (d.mine || 1);
      const gained = Math.floor(F.beamT / beam.period);
      say(`${itemName(best.type)}: ${Math.ceil(best.ore)} left in rock`);
      if (gained > 0) {
        F.beamT -= gained * beam.period;
        best.ore = Math.max(0, best.ore - gained);
        best.m.scale.copy(best.s0).multiplyScalar(0.3 + (0.7 * best.ore) / best.max);
        F.mineFrac = best.ore / best.max;
        P.acc += gained;
        oreGained();   // the beam sweep hits 100%: a resource is yours
        if (best.ore <= 0) {
          scene.remove(best.m);
          state.world.asteroids.splice(state.world.asteroids.indexOf(best), 1);
          boom(best.m.position, 12, 0x8a7a6a);
          setTimeout(spawnAsteroid, ASTEROID_RESPAWN_MS);
          F.beamT = 0;
        }
        while (P.acc >= 1 && holdLoad() < d.cargo) {
          if (!addItem(state.profile.ship, best.type, 1)) break;   // hold or stack is full
          P.acc--;
          emit("mined", { item: best.type });
        }
      }
    }
  }
  setDraw("beam", F.beamOn ? beam.draw : 0);

  // The moment contact stops — ship off the rock, trigger released, mine out of
  // reach — the progress toward the next ore is lost.
  if (!F.beamOn && F.beamT > 0) {
    F.beamT = 0;
    say("Beam contact lost — the ore starts again");
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

  // No lock-on or launches during a warp. Missiles already away keep flying.
  if (state.warp) {
    F.coneRadius = 0;
    ML.target = null;
    ML.locked = false;
    ML.t = 0;
    updateMissileFlight(dt);
    return;
  }

  // Which fitted launcher (if any) decides the damage, the stock and the reload.
  const launcher = (state.missiles || [])[0];
  if (!launcher) {
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
        fireMissile(ML.locked ? ML.target : null, launcher);
        F.missileCd = launcher.cd;
      }
    }
  }

  updateMissileFlight(dt);
}

function fireMissile(target, launcher) {
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
    dmg: launcher.dmg,
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
        hitHostile(e, s.dmg, e.m.position);
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
