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
import { emit } from "../util/events.js";
import { state, localPlayer } from "../state/state.js";
import { enemyPos, enemyVel } from "./enemy.js";
import { hitHostile } from "./combat.js";
import { boom, puff } from "./effects.js";
import { addEntity, dropEntity } from "./entity.js";

/**
 * Launch a missile at `target` (a hostile record, or null for unguided) from the
 * launcher fitted as `launcher` (see sim/guns.js). `dir` is the ship's nose and
 * `muzzle` the point on the ship it leaves from.
 */
export function launchMissile(target, launcher, dir, muzzle, player = localPlayer()) {
  const P = player;
  const m = {
    kind: "missile",
    owner: player,
    pos: muzzle.clone(),
    quat: pointing(muzzle, dir),
    d: dir.clone(),
    // A launch adds the ship's own speed along the nose, so a fast ship's missile
    // starts quicker — the same launch speed as before.
    sp: MISSILE.sp0 + Math.max(0, P.v.dot(dir)),
    t: target,
    l: MISSILE.life,
    dmg: launcher.dmg,
  };
  addEntity(state.world.missiles, m);
  emit("sfx", { name: "missile-fire" });
  return m;
}

/** A rotation that points something at `p` along `dir`. */
function pointing(p, dir) {
  const q = Q();
  faceQ(q, p, p.clone().add(dir), 1);
  return q;
}

/** Move every missile, steer it, trail it and resolve its hit. */
export function updateMissileFlight(dt) {
  const W = state.world,
    MS = W.missiles;
  for (let i = MS.length - 1; i >= 0; i--) {
    const s = MS[i];
    if (!s || MS.indexOf(s) === -1) continue;
    s.l -= dt;

    // Steer toward the target, leading it by its velocity.
    if (s.t && W.enemies.includes(s.t)) {
      const ep = enemyPos(s.t),
        ev = enemyVel(s.t),
        tt = ep.clone().sub(s.pos).length() / Math.max(s.sp, 1),
        aim = ep.clone().addScaledVector(ev, tt * 0.85).sub(s.pos).normalize();
      s.d.lerp(aim, Math.min(1, MISSILE.turn * dt)).normalize();
    } else {
      s.t = null;
    }

    s.sp = Math.min(MISSILE.max, s.sp + MISSILE.acc * dt);
    s.pos.addScaledVector(s.d, s.sp * dt);
    faceQ(s.quat, s.pos, s.pos.clone().add(s.d), 1);
    puff(s.pos.clone(), 0xaaa090, 0.5);   // the exhaust trail, one puff a frame

    let end = s.l <= 0;
    for (const e of W.enemies) {
      if (enemyPos(e).distanceTo(s.pos) < 12) {
        hitHostile(e, s.dmg, enemyPos(e), s.owner);
        end = true;
        break;
      }
    }
    if (!end) {
      for (const a of W.asteroids) {
        if (a.pos.distanceTo(s.pos) < a.r * 0.8) {
          end = true;
          break;
        }
      }
    }
    if (end) {
      boom(s.pos, 16, 0xffa060);
      dropEntity(MS, s);
    }
  }
}
