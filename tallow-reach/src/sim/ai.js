// Pirate raiders: spawning, flying, and shooting at the player.

import { V, R, fwd, face } from "../util/math.js";
import { tone } from "../core/audio.js";
import { scene } from "../render/scene.js";
import { mkShip } from "../render/models.js";
import { state } from "../state/state.js";
import { fire } from "./combat.js";
import { FIELD_CENTER } from "./world.js";

const PIRATE_SCALE = 1.2;
const PIRATE_MAX_RANGE = 4000;    // beyond this a raider is discarded
const PIRATE_FIRE_RANGE = 750;
const PIRATE_HEARD_RANGE = 600;   // within this, shots make a sound
const SPAWN_MIN = 800;
const SPAWN_MAX = 1000;

/** Create a raider at `p`. Its hit points scale with the current contract's tier. */
export function spawnPirate(p) {
  const m = mkShip(0x3a2420, PIRATE_SCALE, true);
  m.position.copy(p);
  scene.add(m);
  const tier = state.profile.mission ? state.profile.mission.tier : 1;
  const hp = 70 + 25 * tier;
  state.world.enemies.push({
    m,
    hp,
    mx: hp,
    v: V(0, 0, 0),
    fire: 2,                      // seconds until the next shot
    o: Math.random() < 0.5 ? 1 : -1,   // circling direction
  });
}

/** Per-frame update for raiders, plus the spawner that keeps them coming. */
export function updateEnemies(dt) {
  const W = state.world,
    F = state.flight,
    S = state.profile,
    P = state.player,
    pp = P.m.position,
    E = W.enemies;

  for (let i = E.length - 1; i >= 0; i--) {
    const e = E[i];
    const toPlayer = pp.clone().sub(e.m.position),
      dist = toPlayer.length();
    face(e.m, pp, dt * 1.4);
    const f = fwd(e.m),
      side = V(1, 0, 0).applyQuaternion(e.m.quaternion);

    // Close in quickly from far, circle when near.
    e.v.lerp(f.clone().multiplyScalar(dist > 260 ? 125 : 25).addScaledVector(side, e.o * 45), dt);
    e.m.position.addScaledVector(e.v, dt);

    if (dist > PIRATE_MAX_RANGE) {
      scene.remove(e.m);
      E.splice(i, 1);
      continue;
    }

    e.fire -= dt;
    if (dist < PIRATE_FIRE_RANGE && f.dot(toPlayer.clone().normalize()) > 0.95 && e.fire <= 0) {
      e.fire = R(0.4, 0.8);
      // Small aim jitter so shots don't all land on the same line.
      const dir = toPlayer
        .add(V(R(-0.04, 0.04), R(-0.04, 0.04), R(-0.04, 0.04)))
        .normalize();
      fire(e.m.position, dir, 520, false, 7);
      if (dist < PIRATE_HEARD_RANGE) tone(260, 80, 0.12, 0.03, "sawtooth");
    }
  }

  // Spawner: hunt contracts send raiders in, and wandering pirates show up
  // occasionally when you are near the asteroid field.
  F.spawnT -= dt;
  if (F.spawnT <= 0) {
    F.spawnT = R(4, 8);
    const m = S.mission,
      far = pp.length() > 600,
      hunting = m && m.type === "hunt" && m.p < m.n,
      nearField = pp.distanceTo(FIELD_CENTER) < 1400;
    let want = 0;
    if (far && hunting) {
      want = Math.min(3, m.n - m.p) - E.length;
    } else if (far && nearField && E.length < 2 && Math.random() < 0.4) {
      want = 1 + (Math.random() < 0.5 ? 1 : 0);
    }
    for (let i = 0; i < want; i++) {
      spawnPirate(
        pp.clone().add(V(R(-1, 1), R(-0.3, 0.3), R(-1, 1)).normalize().multiplyScalar(R(SPAWN_MIN, SPAWN_MAX)))
      );
    }
  }
}
