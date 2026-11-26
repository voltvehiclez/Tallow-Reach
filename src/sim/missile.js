// Guided missiles as plain data (refactor step 7b).
//
// A missile used to be a three.js mesh moved by `sim/weapons.js`. Now it is a
// record —
//
//     { id, kind: "missile", pos, quat, d, sp, t, l, dmg }
//
// `d` is the direction it is steering, `sp` its speed, `t` the hostile it is
// homing on (or null), `l` the life left and `dmg` what it deals. The mesh and its
// exhaust trail belong to `render/views.js`, which reads this record every frame.

import { V, Q, faceQ } from "../util/math.js";
import { MISSILE } from "../data/weapons.js";
import { shipDef } from "../data/ships.js";
import { emit } from "../util/events.js";
import { state, localPlayer, placeWorld, profileOf } from "../state/state.js";
import { enemyPos, enemyVel } from "./enemy.js";
import { hitHostile } from "./combat.js";
import { hurt, pilotHullRadius } from "./player.js";
import { boom, puff } from "./effects.js";
import { addEntity, dropEntity } from "./entity.js";
import { placeCollidersOf, sweepColliders } from "./colliders.js";

/** Scratch: the start of this tick's step, so a frame allocates nothing. */
const _from = V(0, 0, 0);

/**
 * Launch a missile at `target` (a hostile record, or null for unguided) from the
 * launcher fitted as `launcher` (see sim/guns.js). `dir` is the ship's nose and
 * `muzzle` the point on the ship it leaves from.
 */
export function launchMissile(target, launcher, dir, muzzle, player = localPlayer()) {
  const P = player;
  // The hull's own multiplier applies to everything it fires (the baseline
  // hulls carry 1; the Test Ship carries 10).
  const prof = P ? profileOf(P) : null;
  const dMul = (prof && shipDef(prof.ship)?.dmg) || (P && shipDef(P.ship)?.dmg) || 1;
  const m = {
    kind: "missile",
    place: P.place || state.place,
    owner: player,
    pos: muzzle.clone(),
    quat: pointing(muzzle, dir),
    d: dir.clone(),
    // A launch adds the ship's own speed along the nose, so a fast ship's missile
    // starts quicker — the same launch speed as before.
    sp: MISSILE.sp0 + Math.max(0, P.v.dot(dir)),
    t: target,
    l: MISSILE.life,
    dmg: launcher.dmg * dMul,
  };
  addEntity(placeWorld(m.place).missiles, m);
  if (m.place === state.place) emit("sfx", { name: "missile-fire" });
  return m;
}

/** A rotation that points something at `p` along `dir`. */
function pointing(p, dir) {
  const q = Q();
  faceQ(q, p, p.clone().add(dir), 1);
  return q;
}

/** Move every missile, steer it, trail it and resolve its hit. */
export function updateMissileFlight(dt, placeId = state.place) {
  const W = placeWorld(placeId),
    MS = W.missiles;
  for (let i = MS.length - 1; i >= 0; i--) {
    const s = MS[i];
    if (!s || MS.indexOf(s) === -1) continue;
    s.l -= dt;

    // Steer toward the target, leading it by its velocity.
    // Hostiles and other pilots (guest/host) share the same homing: missile copies hostile logic for pilots.
    let steerPos = null, steerVel = null;
    if (s.t && W.enemies.includes(s.t)) {
      steerPos = enemyPos(s.t);
      steerVel = enemyVel(s.t);
    } else if (s.t && s.t.pos && typeof s.t.pos.x === "number" && !s.t.dead) {
      // Pilot target (otherPilotsThere reference) — pos is interpolated render pose, v is lead velocity
      // Verify still present in this place via otherPilotsThere or state.players
      const stillThere = state.players.includes(s.t) || (state.otherPilots || []).includes(s.t);
      if (stillThere && (s.t.place || state.place) === placeId) {
        steerPos = s.t.pos;
        steerVel = s.t.v || null;
      } else {
        s.t = null;
      }
    } else {
      s.t = null;
    }
    if (steerPos) {
      const ev = steerVel || V(0,0,0);
      const tt = steerPos.clone().sub(s.pos).length() / Math.max(s.sp, 1);
      const aim = steerPos.clone().addScaledVector(ev, tt * 0.85).sub(s.pos).normalize();
      s.d.lerp(aim, Math.min(1, MISSILE.turn * dt)).normalize();
    }

    s.sp = Math.min(MISSILE.max, s.sp + MISSILE.acc * dt);
    _from.copy(s.pos);                       // where it was: this tick's segment starts here
    s.pos.addScaledVector(s.d, s.sp * dt);
    faceQ(s.quat, s.pos, s.pos.clone().add(s.d), 1);
    puff(s.pos.clone(), 0xaaa090, 0.5, placeId);   // the exhaust trail, one puff a frame

    let end = s.l <= 0;
    for (const e of W.enemies) {
      if (e.friendly) continue;
      if (enemyPos(e).distanceTo(s.pos) < 12) {
        hitHostile(e, s.dmg, enemyPos(e), s.owner, placeId);
        end = true;
        break;
      }
    }
    // **Another pilot's hull is a body here too** (playtest 23's second report: every ship takes
    // damage and is collidable unless something says otherwise). A warhead that reaches a friend's
    // hull bursts on it — shields first, through the same `hurt` — instead of sailing through and
    // blowing up on the rock behind it. Its own hull, a dead wreck and a pilot in another pocket are
    // all excluded, exactly as for the bolts.
    if (!end) {
      for (const player of state.players) {
        if (!player || player === s.owner || player.dead) continue;
        if ((player.place || state.place) !== placeId) continue;
        if (player.pos.distanceTo(s.pos) < 6 + pilotHullRadius(player)) {
          hurt(s.dmg, player);
          end = true;
          break;
        }
      }
    }
    if (!end) {
      // A wall, then the rocks — the same swath the ship cannot fly through, tested along the whole
      // step the missile covered this tick rather than at its end point. A missile is fast (480 m/s
      // is 8 m a tick) and a rock can be thin, so the segment is what makes the hit certain.
      const wall = sweepColliders(placeCollidersOf(placeId), W.asteroids, _from, s.pos);
      if (wall) {
        s.pos.set(wall.x, wall.y, wall.z);
        end = true;
      }
    }
    if (end) {
      // A warhead that meets a station or a rock bursts where it hit; one that simply expires
      // burns out. Same flash either way, so the pilot sees it happen.
      boom(s.pos, 16, 0xffa060, placeId);
      dropEntity(MS, s);
    }
  }
}
