// The player's ship: flight model, shields and hull, and taking damage.

import { V, fwd, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { SHIPS } from "../data/ships.js";
import { keys, pointer } from "../core/input.js";
import { nz } from "../core/audio.js";
import { scene } from "../render/scene.js";
import { buildPlayerShip } from "../render/models.js";
import { state } from "../state/state.js";
import { STATION_KEEPOUT } from "./world.js";

/** Create the player record. The model is attached by setShip(). */
export function createPlayer() {
  state.player = {
    m: null,
    v: V(0, 0, 0),     // current velocity
    thr: 0,            // throttle, -1..1
    hull: 100,
    sh: 80,
    hullMax: 100,
    shMax: 80,
    en: 100,           // boost energy
    bs: 0,             // boost ramp, 0..1
    boost: false,
    last: 0,           // time of last hit (shields recharge after a pause)
    acc: 0,            // fractional ore carried over between frames
    snap: false,       // snap the camera to the ship on the next frame
    docked: true,
    shake: 0,
  };
  return state.player;
}

/** Swap the flying model to ship `id`, keeping hull fraction from the save. */
export function setShip(id) {
  const P = state.player,
    d = SHIPS[id];
  if (P.m) scene.remove(P.m);
  P.m = buildPlayerShip(id);
  scene.add(P.m);
  P.hullMax = d.hull;
  P.hull = d.hull * (state.profile.hp[id] ?? 1);
  P.shMax = P.sh = d.sh;
  P.m.visible = !P.docked;
}

/** Flight model. Mouse steers, WASD strafes and throttles, Shift boosts. */
export function flight(dt) {
  const P = state.player,
    m = P.m,
    d = SHIPS[state.profile.ship],
    fc = state.freeCam;
  const dz = v => (Math.abs(v) < 0.1 ? 0 : v - Math.sign(v) * 0.1);
  const mx = fc.on ? 0 : pointer.x,
    my = fc.on ? 0 : pointer.y;

  m.rotateY(-dz(mx) * 1.6 * d.turn * dt);
  m.rotateX(-dz(my) * 1.2 * d.turn * dt);
  m.rotateZ(((keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0)) * 1.5 * d.turn * dt);

  if (keys.KeyW) P.thr = Math.min(1, P.thr + dt * 0.5);
  if (keys.KeyS) P.thr = Math.max(-1, P.thr - dt * 0.5);
  if (keys.KeyX) P.thr = 0;
  if (keys.ControlLeft) {
    P.thr = P.thr > 0 ? Math.max(0, P.thr - dt * 0.9) : P.thr < 0 ? Math.min(0, P.thr + dt * 0.9) : 0;
  }

  const wantBoost = (keys.ShiftLeft || keys.ShiftRight) && P.en > 5 && P.thr > 0;
  const wasBoosting = P.boost;
  P.bs = wantBoost ? Math.min(1, P.bs + dt / 0.4) : Math.max(0, P.bs - dt * 5);
  P.boost = P.bs >= 1;
  if (P.boost && !wasBoosting) {
    P.shake = 1;
    nz(0.4, 500, 0.35);
  }
  P.en = clamp(P.en + (wantBoost ? -28 : 10) * dt, 0, 100);

  const f = fwd(m);
  const right = V(1, 0, 0).applyQuaternion(m.quaternion);
  const up = V(0, 1, 0).applyQuaternion(m.quaternion);
  const target = f
    .multiplyScalar(P.thr * d.spd * (P.boost ? 2 : 1))
    .addScaledVector(right, ((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0)) * d.spd * 0.45)
    .addScaledVector(up, ((keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)) * d.spd * 0.4);
  P.v.lerp(target, 1 - Math.exp(-dt * (P.boost ? 2.4 : 0.9)));
  m.position.addScaledVector(P.v, dt);
  m.eng.forEach(e => e.scale.set(1, 1, 0.5 + P.thr * 2 + P.bs * 2));

  // Asteroid collisions: push out of the rock and bounce off it.
  for (const a of state.world.asteroids) {
    const q = m.position.clone().sub(a.m.position);
    const r = a.r * Math.max(a.m.scale.x / a.s0.x, 0.4) * 0.9 + 4;
    const len = q.length();
    if (len < r) {
      const normal = q.divideScalar(len || 1);
      m.position.addScaledVector(normal, r - len);
      const speed = P.v.length();
      P.v.reflect(normal).multiplyScalar(0.4);
      if (speed > 25) hurt(speed * 0.15);
    }
  }

  // Keep out of the outpost.
  if (m.position.length() < STATION_KEEPOUT) {
    m.position.setLength(STATION_KEEPOUT);
    P.v.multiplyScalar(0.5);
  }

  // Shields recharge after four seconds without a hit.
  if (state.time - P.last > 4 && P.sh < P.shMax) P.sh = Math.min(P.shMax, P.sh + 12 * dt);
}

/** Apply `d` damage: shields first, then hull. Emits "player-dead" at zero hull. */
export function hurt(d) {
  const P = state.player;
  P.last = state.time;
  nz(0.25, 1500, 0.2);
  if (P.sh > 0) {
    P.sh -= d;
    if (P.sh < 0) {
      P.hull += P.sh;
      P.sh = 0;
    }
  } else {
    P.hull -= d;
  }
  emit("hurt", { shielded: P.sh > 0 });
  if (P.hull <= 0) emit("player-dead");
}
