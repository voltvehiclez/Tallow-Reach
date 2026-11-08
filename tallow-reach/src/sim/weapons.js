// Player weapons: the fitted primary modules (guns, the mining beam) and homing
// missiles (secondary).

import { V, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { itemName } from "../data/items.js";
import { MISSILE } from "../data/weapons.js";
import { SHIPS } from "../data/ships.js";

import { state, say, msg, profileOf, placeWorld } from "../state/state.js";
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
import { fieldAt } from "./places.js";

// The mining beam's glow and the missiles' bodies are drawn by `render/views.js`
// (step 7b). The sim only says where the beam is and when it is on:
// `state.flight.beamStart` / `beamEnd` / `beamOn`, which the view copies.

/** Equip a primary weapon. Keys 1 and 2 cycle the primary slots: key 1 is the
 *  cannon slot (whatever the primary bays are holding), key 2 is the mining beam
 *  slot. A slot with nothing in it — the beam unbought, or every primary bay
 *  empty — is an "Empty weapon slot": left click does nothing. */
export function setWeapon(name, P = state.player) {
  const prof = profileOf(P);
  if (P !== state.player) {
    if (prof) prof.pw = name;
    P.weapon = name;
    return;
  }
  const S = state.profile;
  S.pw = name;
  if (P) P.weapon = name;
  if (name === "beam")
    msg((state.beams || []).length > 0 ? `${moduleListName(state.beams)} equipped` : "Empty weapon slot", 1.5);
  else
    msg(state.guns.length > 0 ? `${moduleListName(state.guns)} equipped` : "Empty weapon slot", 1.5);
}

/** Primary fire: the fitted guns when held, or the mining beam if its slot is
 *  selected and one is fitted. */
export function updatePrimary(dt, P = state.player) {
  const local = P === state.player,
    prof = profileOf(P),
    F = P.flight, power = P.power,
    ship = prof ? prof.ship : P.ship,
    weapon = prof ? prof.pw : P.weapon,
    c = P.controls,
    d = SHIPS[ship],
    sayFor = text => { if (local) say(text); };

  // Every fitted gun counts down on its own, so two guns can fire out of step.
  P.guns.forEach((g, i) => {
    F.gunCd[i] = Math.max(0, (F.gunCd[i] || 0) - dt);
  });

  // Weapons are offline during a warp: no cannons, no beam, and nothing is drawn.
  if (local ? state.warp : P.warp) {
    setDraw("guns", 0, power);
    F.beamOn = false;
    F.beamT = 0;
    setDraw("beam", 0, power);
    return;   // render/views.js hides the beam when F.beamOn is false
  }

  // Guns: whichever primary bays hold a gun fire together on left click, each on
  // its own cooldown. Firing costs 2 MJ/s a gun, and a ship with no power to spare
  // fires nothing — the same rule the thrusters and shields follow.
  const gunDraw = P.guns.reduce((sum, g) => sum + g.draw, 0);
  const wantGuns = c.fire && weapon !== "beam" && P.guns.length > 0;
  // Compare against the rest of the ship's bill, so the guns are not counted twice.
  const otherDraw = power.draw - (power.use.guns || 0);
  const gunsOn = wantGuns && hasPower(otherDraw + gunDraw, power);
  if (local) setDraw("guns", gunsOn ? gunDraw : 0);
  else setDraw("guns", gunsOn ? gunDraw : 0, power);

  if (gunsOn) {
    let fired = false;
    P.guns.forEach((g, i) => {
      if (F.gunCd[i] > 0) return;
      F.gunCd[i] = 1 / g.rate;
      fired = true;
      // One bolt per linked barrel. A multi-barrel gun fires from the fixed nose
      // hardpoints mirrored about the centerline (the basic cannon puts one bolt
      // per side, at -1.8 m and +1.8 m) wherever it sits in the bays — the way the
      // cannons fired before they were a module. A single barrel fires from its
      // bay mount as usual. Same cooldown and same power draw either way.
      const n = Math.max(1, g.barrels || 1),
        f = playerFwd(P);
      for (let b = 0; b < n; b++) {
        fire(
          playerMount("gun", i, b, n, P, ship),
          f,
          g.speed,
          true,
          g.dmg * d.dmg,
          P
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
  const beam = (P.beams || [])[0];
  const beamOtherDraw = power.draw - (power.use.beam || 0);
  F.beamOn = false;
  if (c.fire && weapon === "beam" && beam) {
    // Find the nearest asteroid inside the beam cone.
    const f = playerFwd(P),
      pp = playerPos(P);
    let best = null,
      bestDist = 1e9;
    for (const a of placeWorld(P.place || state.place).asteroids) {
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
      sayFor("No asteroid in beam range");
    } else if (prof && holdLoad(prof) >= d.cargo) {
      sayFor("Cargo hold full");
    } else if (!hasPower(beamOtherDraw + beam.draw, power)) {
      sayFor("Not enough power");
    } else {
      // The beam cuts continuously. Draw it, charge for it, and bank whole ores
      // as they complete.
      const start = playerMount("beam", 0, 0, 1, P, ship),
        end = pp.clone().addScaledVector(f, Math.max(0, bestDist - best.r * 0.5));
      // The sim says where the beam starts and stops; render/views.js draws it.
      F.beamOn = true;
      F.beamStart = start;
      F.beamEnd = end;

      F.beamT = (F.beamT || 0) + dt * (d.mine || 1);
      const gained = Math.floor(F.beamT / beam.period);
      sayFor(`${itemName(best.type)}: ${Math.ceil(best.ore)} left in rock`);
      if (gained > 0) {
        F.beamT -= gained * beam.period;
        best.ore = Math.max(0, best.ore - gained);
        // The rock shrinks as its ore leaves it. The size is the rock's own data
        // (the view copies it, and the collision rule reads it), so it is set
        // here, not by the drawing code.
        best.scale.copy(best.s0).multiplyScalar(0.3 + (0.7 * best.ore) / best.max);
        F.mineFrac = best.ore / best.max;
        P.acc += gained;
        if (P === state.player) emit("sfx", { name: "ore-gained" });   // the beam sweep hits 100%: a resource is yours
        if (best.ore <= 0) {
          dropEntity(placeWorld(P.place || state.place).asteroids, best);   // removes it, and its mesh with it
          boom(best.pos, 12, 0x8a7a6a, P.place || state.place);
          const placeId = best.place || P.place || state.place, field = fieldAt(placeId);
          setTimeout(() => spawnAsteroid(placeId, field), field.respawnMs);
          F.beamT = 0;
        }
        while (prof && P.acc >= 1 && holdLoad(prof) < d.cargo) {
          if (!addItem(ship, best.type, 1, prof)) break;   // hold or stack is full
          P.acc--;
          emit("mined", { item: best.type, player: P });
        }
      }
    }
  }
  setDraw("beam", F.beamOn ? beam.draw : 0, power);

  // The moment contact stops — ship off the rock, trigger released, mine out of
  // reach — the progress toward the next ore is lost.
  if (!F.beamOn && F.beamT > 0) {
    F.beamT = 0;
    sayFor("Beam contact lost — the ore starts again");
  }
}

/**
 * Secondary fire and missile lock-on. Hostiles that stay in the lock cone
 * for MISSILE.lock seconds become a locked target.
 */
export function updateMissiles(dt, P = state.player, advanceWorld = true) {
  const local = P === state.player,
    F = P.flight,
    c = P.controls,
    sayFor = text => { if (local) say(text); },
    W = placeWorld(P.place || state.place),
    ML = F.missileLock;

  F.missileCd -= dt;

  // No lock-on or launches during a warp. Missiles already away keep flying.
  if (local ? state.warp : P.warp) {
    F.coneAngle = 0;
    ML.target = null;
    ML.locked = false;
    ML.t = 0;
    if (advanceWorld) updateMissileFlight(dt, P.place || state.place);
    return;
  }

  // Which fitted launcher (if any) decides the damage, the stock and the reload.
  const launcher = (P.missiles || [])[0];
  if (!launcher) {
    F.coneAngle = 0;
    ML.target = null;
    ML.locked = false;
    ML.t = 0;
    if (c.sec) sayFor("No secondary weapon installed");
  } else {
    // The lock cone, in degrees. The sim stops here: turning it into the ring's
    // radius on screen needs the camera and the window size, which belong to
    // ui/hud.js (step 6b). The sim says the angle; the HUD draws it.
    F.coneAngle = MISSILE.cone;

    const aim = local ? state.aimDirection : (P.aimDirection || playerFwd(P));
    const cf = V(aim.x, aim.y, aim.z),
      pp = playerPos(P);
    let best = null,
      bestAngle = (MISSILE.cone * Math.PI) / 180;
    if (!local || !state.freeCam.on) {
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
      sayFor(ML.locked ? "MISSILE LOCK" : "Acquiring lock " + Math.round(Math.min(1, ML.t / MISSILE.lock) * 100) + "%");
    }

    if (c.sec && F.missileCd <= 0) {
      const prof = profileOf(P);
      const stock = prof ? prof.msl : P.missileStock;
      if (stock <= 0) sayFor("Out of missiles");
      else {
        fireMissile(ML.locked ? ML.target : null, launcher, P);
        F.missileCd = launcher.cd;
      }
    }
  }

  if (advanceWorld) updateMissileFlight(dt, P.place || state.place);
}

function fireMissile(target, launcher, player) {
  const prof = profileOf(player);
  const ship = prof ? prof.ship : player.ship;
  if (prof) {
    prof.msl--;
    player.missileStock = prof.msl;
  } else {
    player.missileStock--;
  }
  // The missile itself is a record (`sim/missile.js`); its body and trail are
  // render/views.js's business.
  launchMissile(target, launcher, playerFwd(player), playerMount("missile", 0, 0, 1, player, ship), player);
}
