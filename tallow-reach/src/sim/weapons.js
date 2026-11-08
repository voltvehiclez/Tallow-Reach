// Player weapons: the fitted primary modules (guns, the mining beam) and homing
// missiles (secondary).

import { V, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { itemName } from "../data/items.js";
import { MISSILE } from "../data/weapons.js";
import { SHIPS } from "../data/ships.js";

import { state, say, msg } from "../state/state.js";
import { holdLoad } from "./economy.js";
import { addItem } from "./inventory.js";
import { setDraw, hasPower } from "./power.js";
import { gunsOf, moduleListName } from "./guns.js";

export { gunsOf, refreshGuns } from "./guns.js";
import { fire } from "./combat.js";
import { boom } from "./effects.js";
import { enemyPos } from "./enemy.js";
import { playerPos, playerFwd, playerMount } from "./pilot.js";
import { launchMissile, updateMissileFlight } from "./missile.js";
import { dropEntity } from "./entity.js";
import { spawnAsteroid } from "./asteroids.js";

const ASTEROID_RESPAWN_MS = 30000;
// The mining beam's glow and the missiles' bodies are drawn by `render/views.js`
// (step 7b). The sim only says where the beam is and when it is on:
// `state.flight.beamStart` / `beamEnd` / `beamOn`, which the view copies.

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
    c = P.controls,
    d = SHIPS[S.ship];

  // Every fitted gun counts down on its own, so two guns can fire out of step.
  state.guns.forEach((g, i) => {
    F.gunCd[i] = Math.max(0, (F.gunCd[i] || 0) - dt);
  });

  // Weapons are offline during a warp: no cannons, no beam, and nothing is drawn.
  if (state.warp) {
    setDraw("guns", 0);
    F.beamOn = false;
    F.beamT = 0;
    setDraw("beam", 0);
    return;   // render/views.js hides the beam when F.beamOn is false
  }

  // Guns: whichever primary bays hold a gun fire together on left click, each on
  // its own cooldown. Firing costs 2 MJ/s a gun, and a ship with no power to spare
  // fires nothing — the same rule the thrusters and shields follow.
  const gunDraw = state.guns.reduce((sum, g) => sum + g.draw, 0);
  const wantGuns = c.fire && S.pw !== "beam" && state.guns.length > 0;
  // Compare against the rest of the ship's bill, so the guns are not counted twice.
  const otherDraw = state.power.draw - (state.power.use.guns || 0);
  const gunsOn = wantGuns && hasPower(otherDraw + gunDraw);
  setDraw("guns", gunsOn ? gunDraw : 0);

  if (gunsOn) {
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
        f = playerFwd();
      for (let b = 0; b < n; b++) {
        fire(
          playerMount("gun", i, b, n),
          f,
          g.speed,
          true,
          g.dmg * d.dmg
        );
      }
    });
    if (fired) emit("sfx", { name: "cannon" });
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
  if (c.fire && S.pw === "beam" && beam) {
    // Find the nearest asteroid inside the beam cone.
    const f = playerFwd(),
      pp = playerPos();
    let best = null,
      bestDist = 1e9;
    for (const a of state.world.asteroids) {
      const q = a.pos.clone().sub(pp),
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
      const start = playerMount("beam"),
        end = pp.clone().addScaledVector(f, Math.max(0, bestDist - best.r * 0.5));
      // The sim says where the beam starts and stops; render/views.js draws it.
      F.beamOn = true;
      F.beamStart = start;
      F.beamEnd = end;

      F.beamT = (F.beamT || 0) + dt * (d.mine || 1);
      const gained = Math.floor(F.beamT / beam.period);
      say(`${itemName(best.type)}: ${Math.ceil(best.ore)} left in rock`);
      if (gained > 0) {
        F.beamT -= gained * beam.period;
        best.ore = Math.max(0, best.ore - gained);
        // The rock shrinks as its ore leaves it. The size is the rock's own data
        // (the view copies it, and the collision rule reads it), so it is set
        // here, not by the drawing code.
        best.scale.copy(best.s0).multiplyScalar(0.3 + (0.7 * best.ore) / best.max);
        F.mineFrac = best.ore / best.max;
        P.acc += gained;
        emit("sfx", { name: "ore-gained" });   // the beam sweep hits 100%: a resource is yours
        if (best.ore <= 0) {
          dropEntity(state.world.asteroids, best);   // removes it, and its mesh with it
          boom(best.pos, 12, 0x8a7a6a);
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
    c = P.controls,
    W = state.world,
    ML = F.missileLock;

  F.missileCd -= dt;

  // No lock-on or launches during a warp. Missiles already away keep flying.
  if (state.warp) {
    F.coneAngle = 0;
    ML.target = null;
    ML.locked = false;
    ML.t = 0;
    updateMissileFlight(dt);
    return;
  }

  // Which fitted launcher (if any) decides the damage, the stock and the reload.
  const launcher = (state.missiles || [])[0];
  if (!launcher) {
    F.coneAngle = 0;
    ML.target = null;
    ML.locked = false;
    ML.t = 0;
    if (c.sec) say("No secondary weapon installed");
  } else {
    // The lock cone, in degrees. The sim stops here: turning it into the ring's
    // radius on screen needs the camera and the window size, which belong to
    // ui/hud.js (step 6b). The sim says the angle; the HUD draws it.
    F.coneAngle = MISSILE.cone;

    const cf = V(state.aimDirection.x, state.aimDirection.y, state.aimDirection.z),
      pp = playerPos();
    let best = null,
      bestAngle = (MISSILE.cone * Math.PI) / 180;
    if (!state.freeCam.on) {
      for (const e of W.enemies) {
        const q = enemyPos(e).clone().sub(pp),
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
        emit("sfx", { name: "missile-lock" });
      }
    } else {
      ML.target = best;
      ML.t = 0;
      ML.locked = false;
    }

    if (ML.target) {
      say(ML.locked ? "MISSILE LOCK" : "Acquiring lock " + Math.round(Math.min(1, ML.t / MISSILE.lock) * 100) + "%");
    }

    if (c.sec && F.missileCd <= 0) {
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
  const S = state.profile;
  S.msl--;
  // The missile itself is a record (`sim/missile.js`); its body and trail are
  // render/views.js's business.
  launchMissile(target, launcher, playerFwd(), playerMount("missile"));
}
