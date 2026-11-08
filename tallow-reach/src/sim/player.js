// The player's ship: flight model, Shield HP and Hull HP, and taking damage.

import { V, Q, fwdQ, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { neutralControls } from "../state/controls.js";
import { FLIGHT } from "../data/ships.js";
import { warpSteerEase } from "../data/sectors.js";
import { sectorAt } from "../data/sectors.js";
import { REPAIR_MIN_HULL } from "../data/station.js";

import { state, msg, localPlayer } from "../state/state.js";
import { hasDrive, driveDraw } from "./drive.js";
import { hasPower, setDraw } from "./power.js";
import { refreshHull } from "./hull.js";
import { STATION_KEEPOUT } from "./world.js";

/**
 * How long the "Equip thrusters to move" warning stays on screen, and the gap
 * before it repeats while the player keeps a control held.
 */
const NO_DRIVE_WARN = 2.5;

// Scratch rotations for the turn, so a frame allocates nothing. The order is the
// turn code's own: a local turn about Y, then X, then Z — exactly what the
// model's `rotateY`, `rotateX` and `rotateZ` did (each multiplies the same
// axis-angle quaternion onto the end, which is what `quaternion.multiply` does).
const _qx = Q(), _qy = Q(), _qz = Q();
const XAXIS = V(1, 0, 0), YAXIS = V(0, 1, 0), ZAXIS = V(0, 0, 1);

/**
 * Is the pilot asking the ship to move, strafe, lift, roll or turn? Read from the
 * control record, not from the keyboard (step 6b).
 */
function tryingToMove(c, stick) {
  return !!(
    c.thrust || c.strafe || c.lift || c.boost || c.roll ||
    Math.abs(stick.x) > 0.03 || Math.abs(stick.y) > 0.03
  );
}

/**
 * Create the player record. Step 7b: the ship is plain data — `pos` and `quat` are
 * where it is and which way it points, exactly like a hostile (`sim/enemy.js`).
 * Its model belongs to `render/views.js`, which copies `pos`/`quat` onto it once a
 * frame, so no rule here needs a scene.
 */
export function createPlayerRecord(controls = neutralControls()) {
  return {
    controls: { ...controls, steer: { ...controls.steer } },
    kind: "ship",
    pos: V(0, 0, 0),    // where the ship is (world metres)
    quat: Q(),          // which way it points
    v: V(0, 0, 0),      // current velocity
    thr: 0,            // throttle, -1..1
    hull: 0,
    sh: 0,
    hullMax: 0,        // set from the fitted hull module (sim/hull.js)
    shMax: 0,          // set from the fitted shield module (sim/shield.js)
    en: 0,             // boost fuel in the tank
    enMax: 0,          // tank size, set from the fitted thrusters (sim/drive.js)
    bs: 0,             // boost ramp, 0..1
    boost: false,
    boostKeyWasDown: false, // detects a fresh Shift press without locking throttle while held
    last: 0,           // time of last hit (shields recharge after a pause)
    acc: 0,            // fractional ore carried over between frames
    snap: false,       // snap the camera to the ship on the next frame
    docked: true,
    shake: 0,
    noDriveT: 0,       // seconds until the "Equip thrusters to move" warning may repeat
  };
}

/** Create or replace the local ship, retaining the current input without sharing it. */
export function createPlayer() {
  state.player = createPlayerRecord(state.controls);
  return localPlayer();
}

/**
 * Swap the ship being flown to hull `id`, rebuilding its Hull HP from the fit.
 * The model is the view's: it is built from `profile.ship`, so naming the new hull
 * is the whole of the sim's part (step 7b).
 */
export function setShip(id) {
  const P = state.player;
  P.hullMax = 0;
  P.hull = 0;
  refreshHull();   // Hull HP come from the hull module fitted in the bay
}

/** Flight model. Mouse steers, WASD strafes and throttles, Shift boosts. */
export function flight(dt) {
  const P = state.player,
    fc = state.freeCam,
    c = P.controls;

  // A warp hands the controls to the drive: the throttle is released and the
  // stick eases back to neutral, so the ship coasts down and unwinds its turn
  // instead of stopping dead. Weapons are cut separately, in sim/weapons.js.
  const W = state.warp;
  const ease = W ? warpSteerEase(W.t) : 1;
  const stick = W
    ? W.steer
    : {
        x: fc.on ? 0 : c.steer.x,
        y: fc.on ? 0 : c.steer.y,
        roll: c.roll,
      };

  const dz = v => (Math.abs(v) < 0.1 ? 0 : v - Math.sign(v) * 0.1);
  // Speed and turn come from the fitted thrusters, not from the hull.
  const drv = state.drive;
  const powered = hasDrive(drv);         // no thruster fitted: a dead ship
  const turn = drv.turn * FLIGHT.turn;   // FLIGHT.turn tunes every ship at once

  // A dead ship cannot answer the controls, so warn the moment the player asks
  // it to move. The warning repeats while a control is still held, but slowly,
  // so it reads as a reminder rather than a flicker.
  P.noDriveT = Math.max(0, P.noDriveT - dt);
  if (!W && !powered && P.noDriveT === 0 && tryingToMove(c, stick)) {
    msg("Equip thrusters to move", NO_DRIVE_WARN);
    P.noDriveT = NO_DRIVE_WARN + 0.5;
  }
  // The ship turns on its own record; the view copies the rotation onto the model.
  P.quat
    .multiply(_qy.setFromAxisAngle(YAXIS, -dz(stick.x * ease) * 1.6 * turn * dt))
    .multiply(_qx.setFromAxisAngle(XAXIS, -dz(stick.y * ease) * 1.2 * turn * dt))
    .multiply(_qz.setFromAxisAngle(ZAXIS, stick.roll * ease * 1.5 * turn * dt));

  if (W) {
    // Throttle released, like pressing X: the drag model bleeds the speed off.
    P.thr = 0;
  } else if (!powered) {
    // No thrusters: the throttle does nothing and the engines stay cold.
    P.thr = 0;
  } else {
    if (c.thrust > 0) P.thr = Math.min(1, P.thr + dt * 0.5);
    if (c.thrust < 0) P.thr = Math.max(-1, P.thr - dt * 0.5);
    if (c.stop) P.thr = 0;
    if (c.brake) {
      P.thr = P.thr > 0 ? Math.max(0, P.thr - dt * 0.9) : P.thr < 0 ? Math.min(0, P.thr + dt * 0.9) : 0;
    }
  }

  // A fresh boost press snaps the throttle to full forward once. Holding boost
  // does not hold the throttle there; the pilot can still change it afterward.
  const boostKey = c.boost;
  if (boostKey && !P.boostKeyWasDown && powered && !W) P.thr = 1;
  P.boostKeyWasDown = boostKey;

  // Power budget for this frame: the thrusters draw while the throttle is off
  // centre, and a little more while the boost is burning. The boost figure comes
  // from last frame, so the extra starts the frame after it lights. Refilling the
  // boost meter is free — it never shows up in the draw, the way filling a car's
  // tank with fuel does not run the engine.
  setDraw("drive", driveDraw(drv, P.thr, P.boost));
  const supply = hasPower(state.power.draw);

  // The boost: lighting it is the hungry moment. It costs one big slug of stored
  // energy (20 MJ on the basic thrusters) once the spool-up has finished and the
  // shake fires, and the cells have to hold that much for it to light at all.
  // A tank with only a splash left cannot light the boost: keep a little in reserve.
  const wantBoost = powered && !W && boostKey && P.en > drv.bmax * 0.05;
  const canBoost = wantBoost && supply && state.power.stored >= (drv.ignite || 0);

  const wasBoosting = P.boost;
  P.bs = canBoost ? Math.min(1, P.bs + dt / 0.4) : Math.max(0, P.bs - dt * 5);
  P.boost = P.bs >= 1;
  if (P.boost && !wasBoosting) {
    P.shake = 1;
    emit("sfx", { name: "boost" });
    // The ignition: one flat gulp out of the cells, not a trickle.
    state.power.stored = Math.max(0, state.power.stored - (drv.ignite || 0));
  }
  // The tank fills by itself whenever the boost is not burning. Both rates come
  // from the fitted thrusters, so a bigger tank or a thirstier boost is a change in
  // data/modules.js and nothing else.
  P.en = clamp(P.en + (canBoost ? -drv.buse : drv.bfill) * dt, 0, P.enMax);

  // With no power left there is nothing to push with.
  const spd = supply ? drv.spd : 0;

  const f = fwdQ(P.quat);
  const right = V(1, 0, 0).applyQuaternion(P.quat);
  const up = V(0, 1, 0).applyQuaternion(P.quat);
  // Strafe and lift are ignored while warping, so the ship only bleeds speed.
  const strafe = W ? 0 : c.strafe;
  const lift = W ? 0 : c.lift;

  // Only the main drive reaches full speed; reversing is a fraction of it.
  const throttle = P.thr >= 0 ? P.thr : P.thr * FLIGHT.reverse;
  const target = f
    // Boost is an additional forward-only push, even if the pilot has moved
    // throttle into reverse. The ordinary throttle contribution is unchanged.
    .multiplyScalar(throttle * spd + (P.boost ? spd : 0))
    .addScaledVector(right, strafe * spd * FLIGHT.strafe)
    .addScaledVector(up, lift * spd * FLIGHT.lift);
  P.v.lerp(target, 1 - Math.exp(-dt * (P.boost ? 2.4 : 0.9)));
  P.pos.addScaledVector(P.v, dt);

  // Asteroid collisions: push out of the rock and bounce off it. A rock's drawn
  // size is its own `scale` (the view copies it), and `s0` the size it was born at.
  for (const a of state.world.asteroids) {
    const q = P.pos.clone().sub(a.pos);
    const r = a.r * Math.max(a.scale.x / a.s0.x, 0.4) * 0.9 + 4;
    const len = q.length();
    if (len < r) {
      const normal = q.divideScalar(len || 1);
      P.pos.addScaledVector(normal, r - len);
      const speed = P.v.length();
      P.v.reflect(normal).multiplyScalar(0.4);
      if (speed > 25) hurt(speed * 0.015);   // was 0.15 against a 100-point hull; the basic
                                             // hull has 10, so collision damage is 1/10th
    }
  }

  // Keep out of the outpost (only sectors that have one).
  if (sectorAt(state.sector).st && P.pos.length() < STATION_KEEPOUT) {
    P.pos.setLength(STATION_KEEPOUT);
    P.v.multiplyScalar(0.5);
  }

}

/** Apply `d` damage: shields first, then hull. Emits "player-dead" at zero hull. */
export function hurt(d) {
  const P = state.player;
  P.last = state.time;
  emit("sfx", { name: "hit" });
  if (P.sh > 0) {
    P.sh -= d;
    if (P.sh < 0) {
      P.hull += P.sh;
      P.sh = 0;
    }
  } else {
    P.hull -= d;
  }
  // Stamp the save with the fraction the ship is on, so damage is remembered
  // across fit changes, hangar visits and hull switches.
  if (P.hullMax > 0) {
    const frac = clamp(P.hull / P.hullMax, 0, 1);
    state.profile.hp[state.profile.ship] = Math.max(REPAIR_MIN_HULL, frac);
  }
  emit("hurt", { shielded: P.sh > 0 });
  if (P.hull <= 0) emit("player-dead");
}
