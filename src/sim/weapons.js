// Player weapons: the fitted primary modules (guns, the mining beam) and homing
// missiles (secondary).

import { V, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { itemName } from "../data/items.js";
import { MISSILE } from "../data/weapons.js";
import { shipDef } from "../data/ships.js";

import { state, say, profileOf, placeWorld } from "../state/state.js";
import { holdLoad } from "./economy.js";
import { addItem } from "./inventory.js";
import { setDraw, hasPower } from "./power.js";
import { gunsOf } from "./guns.js";

export { gunsOf, refreshGuns } from "./guns.js";
import { fire } from "./combat.js";
import { boom } from "./effects.js";
import { enemyPos } from "./enemy.js";
import { playerPos, playerFwd, playerMount } from "./pilot.js";
import { launchMissile, updateMissileFlight } from "./missile.js";
import { dropEntity } from "./entity.js";
import { rockMemoryId } from "./asteroids.js";
import { markRockMined } from "./place-memory.js";
import { fieldAt } from "./places.js";
import { placeCollidersOf, sweepColliders } from "./colliders.js";

// The mining beam's glow and the missiles' bodies are drawn by `render/views.js`
// (step 7b). The sim only says where the beam is and when it is on:
// `state.flight.beamStart` / `beamEnd` / `beamOn`, which the view copies.

/**
 * Which primary bay (0 through 4) the pilot has selected. Keys 1 and 2 select
 * primary slot 1 and primary slot 2; only the selected slot's module fires —
 * a gun from that bay, or the mining beam fitted there. Legacy values fold in:
 * "beam" was the old any-bay beam mode and "cannon" the old cannon mode, so a
 * guest or hand-fed profile that predates slot selection lands on the bay that
 * used to answer.
 */
export function primarySlotIndex(weapon, P) {
  if (/^[1-5]$/.test(String(weapon))) return Number(weapon) - 1;
  const guns = (P && P.guns) || [],
    beams = (P && P.beams) || [];
  if (weapon === "beam") {
    const b = beams[0];
    return b ? b.i : 0;
  }
  const g = guns[0];
  return g ? g.i : 0;   // "cannon" and anything unrecognised
}

/** Select primary slot `slot` (0–4 = numbered buttons 1–5). A slot with nothing in it
 *  is an "Empty weapon slot": left click does nothing. */
export function setWeapon(slot, P = state.player) {
  const s = typeof slot === "string" ? Number(slot) - 1 : slot;
  if (!Number.isInteger(s) || s < 0 || s >= 5) return;
  const value = String(s + 1);
  const prof = profileOf(P);
  if (P !== state.player) {
    if (prof) prof.pw = value;
    P.weapon = value;
    return;
  }
  const S = state.profile;
  S.pw = value;
  if (P) P.weapon = value;

}

/** Secondary bay selection is independent of primary; switching cannot bypass reload. */
export function setSecondaryWeapon(slot, P = state.player) {
  if (!P || !Number.isInteger(slot) || slot < 0 || slot >= 5) return;
  const profile = profileOf(P);
  if (profile) profile.sw = String(slot + 1);
  P.secondaryWeapon = String(slot + 1);
  const lock = P.flight.missileLock;
  lock.target = null; lock.t = 0; lock.locked = false;

}

/** Primary fire: the fitted guns when held, or the mining beam if its slot is
 *  selected and one is fitted. */
export function updatePrimary(dt, P = state.player) {
  const local = P === state.player,
    prof = profileOf(P),
    F = P.flight, power = P.power,
    ship = prof ? prof.ship : P.ship,
    weapon = prof ? prof.pw : P.weapon,
    slot = primarySlotIndex(weapon, P),
    c = P.controls,
    d = shipDef(ship),
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

  // Only the gun in the selected bay fires on left click, on its own cooldown.
  // A second gun fitted in the other bay stays silent until its slot is
  // selected. Firing costs what the gun asks (2 MJ/s for the basic cannon), and
  // a ship with no power to spare fires nothing — the same rule the thrusters
  // and shields follow.
  const gun = P.guns.find(g => g.i === slot) || null;
  const gunDraw = gun ? gun.draw : 0;
  const wantGuns = c.fire && !!gun;
  // Compare against the rest of the ship's bill, so the gun is not counted twice.
  const otherDraw = power.draw - (power.use.guns || 0);
  const gunsOn = wantGuns && hasPower(otherDraw + gunDraw, power);
  if (local) setDraw("guns", gunsOn ? gunDraw : 0);
  else setDraw("guns", gunsOn ? gunDraw : 0, power);
  if (wantGuns && !gunsOn && gunDraw > 0) sayFor("Not enough power");

  if (gunsOn) {
    const gi = P.guns.indexOf(gun);
    if (F.gunCd[gi] <= 0) {
      F.gunCd[gi] = 1 / gun.rate;
      // One bolt per linked barrel. A multi-barrel gun fires from the fixed nose
      // hardpoints mirrored about the centerline (the basic cannon puts one bolt
      // per side, at -1.8 m and +1.8 m) wherever it sits in the bays — the way the
      // cannons fired before they were a module. A single barrel fires from its
      // bay mount as usual. Same cooldown and same power draw either way.
      const n = Math.max(1, gun.barrels || 1),
        f = playerFwd(P);
      for (let b = 0; b < n; b++) {
        fire(
          playerMount("gun", gun.i, b, n, P, ship),
          f,
          gun.speed,
          true,
          gun.dmg * d.dmg,
          P
        );
      }
      emit("sfx", { name: "cannon" });
    }
  }

  // The mining beam: the beam module fitted in the selected bay. It needs that
  // slot selected (key 1 or key 2), a rock in reach and the power to cut;
  // it draws MJ/s only while it is actually cutting. One ore per `period`
  // seconds of uninterrupted contact with the same rock (scaled by the hull's
  // mine multiplier); the moment contact stops, the progress toward the next
  // ore is lost — the count starts over.
  const beam = (P.beams || []).find(b => b.i === slot) || null;
  const beamOtherDraw = power.draw - (power.use.beam || 0);
  F.beamOn = false;
  if (c.fire && beam) {
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
    // The beam is a cutting torch, not a ghost: it stops on whatever stops a shot, so a station wall
    // between the ship and the rock stops the cut. Without this the beam reached through the
    // station's hull to a rock on the far side of it.
    // Never light the beam — not even onto a wall — when the power tank is empty.
    if (best && !hasPower(beamOtherDraw + beam.draw, power)) {
      sayFor("Not enough power");
    } else if (best) {
      const reach = Math.max(0, bestDist - best.r * 0.5);
      const wall = sweepColliders(placeCollidersOf(P.place || state.place), [], pp, pp.clone().addScaledVector(f, reach));
      if (wall) {
        F.beamOn = true;
        F.beamStart = playerMount("beam", beam.i, 0, 1, P, ship);
        F.beamEnd = V(wall.x, wall.y, wall.z);
        setDraw("beam", beam.draw, power);
        sayFor("Beam blocked");
        F.beamT = 0;                 // no progress toward an ore through a wall
        return;
      }
    }
    if (!best) {
      sayFor("No asteroid in beam range");
    } else if (!hasPower(beamOtherDraw + beam.draw, power)) {
      sayFor("Not enough power");
    } else if (prof && holdLoad(prof) >= d.cargo) {
      sayFor("Cargo hold full");
    } else {
      // The beam cuts continuously. Draw it, charge for it, and bank whole ores
      // as they complete.
      const start = playerMount("beam", beam.i, 0, 1, P, ship),
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
          // The depleted slot is remembered with the world. Simulation time,
          // rather than wall-clock callbacks, keeps pause/save/load correct; an
          // event may clear this timer early through the place-memory bus.
          if (field && best.memoryId) {
            markRockMined(placeId, best.memoryId, field.respawnSec ?? ((field.respawnMs || 0) / 1000));
          } else if (field && best.slot !== undefined) {
            markRockMined(placeId, rockMemoryId(field, best.slot), field.respawnSec ?? ((field.respawnMs || 0) / 1000));
          }
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
  const secondary = Number(profileOf(P)?.sw || P.secondaryWeapon || "1") - 1;
  const launcher = (P.missiles || []).find(m => m.i === secondary);
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
      const selected = F.lock?.k === "e" && W.enemies.includes(F.lock.o) && F.lock.o.hp > 0 && !F.lock.o.friendly ? F.lock.o : null;
      for (const e of W.enemies) {
        if (e.hp <= 0 || e.friendly) continue;
        const q = enemyPos(e).clone().sub(pp),
          d = q.length();
        if (d > MISSILE.range) continue;
        const angle = Math.acos(clamp(q.dot(cf) / d, -1, 1));
        if (angle < bestAngle) {
          bestAngle = angle;
          best = e;
        }
      }
      // A valid F-selected hostile wins even when another ship crosses nearer the reticle.
      // Range/cone/free-camera limits still apply; there is no through-space lock cheat.
      if (selected) {
        const q = enemyPos(selected).clone().sub(pp), d = q.length();
        const angle = d > 0 ? Math.acos(clamp(q.dot(cf) / d, -1, 1)) : Infinity;
        if (d <= MISSILE.range && angle < (MISSILE.cone * Math.PI) / 180) best = selected;
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
      sayFor(ML.locked ? "MISSILE LOCK" : "Acquiring lock");
    }

    if (c.sec && F.missileCd <= 0) {
      const prof = profileOf(P);
      const stock = prof ? prof.msl : P.missileStock;
      const power = P.power || (P === state.player ? state.power : null);
      if (launcher.draw > 0 && power && !hasPower(power.draw + launcher.draw, power)) {
        sayFor("Not enough power");
      } else if (stock <= 0) sayFor("Out of missiles");
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
