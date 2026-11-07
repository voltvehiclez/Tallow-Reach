// Hostiles: spawning them from data/enemies.js, moving them and shooting.
//
// Every number comes from the enemy's def (src/data/enemies.js). A def names its
// behaviour with `ai`; AI_BEHAVIOURS is the table of those behaviours, so a new
// enemy is a data entry and a new *way of fighting* is one function here.

import { V, R, fwd, face } from "../util/math.js";
import { random } from "../util/rng.js";
import { sectorAt } from "../data/sectors.js";
import { ENEMIES, DEFAULT_ENEMY, enemyDef } from "../data/enemies.js";
import { tone } from "../core/audio.js";
import { scene } from "../render/scene.js";
import { mkShip } from "../render/models.js";
import { state } from "../state/state.js";
import { fire } from "./combat.js";
import { FIELD_CENTER } from "./world.js";

/**
 * "chase": close in quickly from far, circle once near. Used by the raider.
 * `toTarget` is the vector from the enemy to the player (not normalised).
 */
function chase(e, def, toTarget, dist, dt) {
  const f = fwd(e.m),
    side = V(1, 0, 0).applyQuaternion(e.m.quaternion);
  e.v.lerp(
    f.clone().multiplyScalar(dist > def.circleAt ? def.spdFar : def.spdNear).addScaledVector(side, e.o * def.spdOrbit),
    dt
  );
  e.m.position.addScaledVector(e.v, dt);
}

/** Behaviours an enemy def can name with `ai`. Add one here, then name it in data. */
export const AI_BEHAVIOURS = { chase };

/** Create enemy `id` (an entry in ENEMIES) at `pos`. Returns the new entity. */
export function spawnEnemy(id, pos) {
  const def = enemyDef(id);
  const m = mkShip(def.col, def.scale, true);
  m.position.copy(pos);
  scene.add(m);
  const e = {
    m,
    def: ENEMIES[id] ? id : DEFAULT_ENEMY,   // the id, so saves and events can name it
    n: def.n,                                // the lock marker's label
    f: def.f,                                // faction id (data/factions.js)
    loot: def.loot,                          // table id (data/loot.js)
    hp: def.hp,
    mx: def.hp,
    v: V(0, 0, 0),
    fire: def.fireDelay,                     // seconds until it may fire
    o: random() < 0.5 ? 1 : -1,              // circling direction
  };
  state.world.enemies.push(e);
  return e;
}

/** Per-frame update for hostiles, plus the spawner that keeps them coming. */
export function updateEnemies(dt) {
  const W = state.world,
    F = state.flight,
    S = state.profile,
    P = state.player,
    pp = P.m.position,
    E = W.enemies;

  for (let i = E.length - 1; i >= 0; i--) {
    const e = E[i];
    if (!e) continue;
    const def = enemyDef(e.def);
    const toPlayer = pp.clone().sub(e.m.position),
      dist = toPlayer.length();
    face(e.m, pp, dt * def.turn);

    // Move by whichever behaviour the def asks for.
    (AI_BEHAVIOURS[def.ai] || AI_BEHAVIOURS.chase)(e, def, toPlayer, dist, dt);

    if (dist > def.lostRange) {
      scene.remove(e.m);
      E.splice(i, 1);
      continue;
    }

    e.fire -= dt;
    if (dist < def.fireRange && fwd(e.m).dot(toPlayer.clone().normalize()) > 0.95 && e.fire <= 0) {
      e.fire = R(def.fireGap[0], def.fireGap[1]);
      // Small aim jitter so shots don't all land on the same line.
      const dir = toPlayer
        .add(V(R(-0.04, 0.04), R(-0.04, 0.04), R(-0.04, 0.04)))
        .normalize();
      fire(e.m.position, dir, def.bspd, false, def.dmg);
      if (dist < def.hearRange) tone(260, 80, 0.12, 0.03, "sawtooth");
    }
  }

  // Spawner: hunt contracts send their target enemy in, and wandering pirates
  // show up occasionally when you are near the asteroid field.
  F.spawnT -= dt;
  if (F.spawnT <= 0) {
    F.spawnT = R(4, 8);
    const m = S.mission,
      far = pp.length() > 600,
      hunting = m && m.type === "hunt" && m.p < m.n,
      nearField = pp.distanceTo(FIELD_CENTER) < 1400;
    // Hunt contracts name the enemy they want (old saves have none: use the default).
    const hunted = m && m.e ? m.e : DEFAULT_ENEMY;
    let want = 0;
    if (sectorAt(state.sector).foes) {
      if (far && hunting) {
        want = Math.min(3, m.n - m.p) - E.length;
      } else if (far && nearField && E.length < 2 && random() < 0.4) {
        want = 1 + (random() < 0.5 ? 1 : 0);
      }
    }
    for (let i = 0; i < want; i++) {
      const id = far && hunting ? hunted : DEFAULT_ENEMY,
        d = enemyDef(id);
      spawnEnemy(
        id,
        pp.clone().add(V(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize().multiplyScalar(R(d.spawnDist[0], d.spawnDist[1])))
      );
    }
  }
}
