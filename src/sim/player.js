import { flightSpeed } from './flight-instruments.js';
// The player's ship: flight model, Shield HP and Hull HP, and taking damage.

import { V, Q, fwdQ, clamp } from "../util/math.js";
import { emit } from "../util/events.js";
import { neutralControls } from "../state/controls.js";
import { FLIGHT, shipDef } from "../data/ships.js";
import { warpSteerEase } from "../data/sectors.js";
import { collideRockAt, collideSphereAt, placeCollidersOf, SHIP_RADIUS, reflectVelocity } from "./colliders.js";
import { enemyHullRadius } from "./enemy.js";
import { REPAIR_MIN_HULL } from "../data/station.js";

import { state, msg, sayForPlayer, placeWorld, localPlayer, profileOf, createPlayerRuntime } from "../state/state.js";
import { hasDrive, driveDraw } from "./drive.js";
import { hasPower, setDraw } from "./power.js";
import { refreshHull } from "./hull.js";
import { stepFlight } from "./flight-model.js";


/**
 * How long the "Equip thrusters to move" warning stays on screen, and the gap
 * before it repeats while the player keeps a control held.
 */
const NO_DRIVE_WARN = 2.5;

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
    ...createPlayerRuntime(),
    controls: { ...controls, steer: { ...controls.steer } },
    kind: "ship",
    place: state.place,
    pos: V(0, 0, 0),    // where the ship is (world metres)
    quat: Q(),          // which way it points
    measuredSpeed: 0,
    forwardSpeed: 0,    // signed velocity along the ship's nose (negative when reversing)
    pushed: false,      // true when a solid collider displaced the ship this tick
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
  state.player.profile = state.profile;
  return localPlayer();
}

/**
 * Swap the ship being flown to hull `id`, rebuilding its Hull HP from the fit.
 * The model is the view's: it is built from `profile.ship`, so naming the new hull
 * is the whole of the sim's part (step 7b).
 */
export function setShip(id, P = state.player, profile = profileOf(P)) {
  if (P && P !== state.player && (!profile || profile === state.profile)) {
    throw new Error("Non-local ship change requires its own profile");
  }
  if (P) {
    P.ship = id;
    P.hullMax = 0;
    P.hull = 0;
  }
  refreshHull(P, profile);   // Hull HP come from the hull module fitted in the bay
}

/** Flight model. Mouse steers, WASD strafes and throttles, Shift boosts. */
export function flight(dt, P = state.player, runtime = null) {
  // Camera shake decays on the simulation clock, per pilot, so a shake triggered aboard a visiting
  // hull decays on the host's clock and reaches its screen on the wire (`SHIP_FIELDS.shake`).
  if (P && P.shake > 0) {
    const decayed = P.shake * Math.exp(-dt * 6);
    P.shake = decayed <= 0.005 ? 0 : decayed;
  }
  // Unconfigured non-local records cannot silently borrow the local fit or profile.
  if (
    P !== state.player &&
    ((!P.configured && !runtime) ||
      (!runtime &&
        (P.drive === state.drive ||
          P.power === state.power ||
          !P.profile ||
          P.profile === state.profile)) ||
      (runtime &&
        (!runtime.drive ||
          !runtime.power ||
          !runtime.profile ||
          runtime.drive === state.drive ||
          runtime.power === state.power ||
          runtime.profile === state.profile)))
  ) {
    throw new Error("Non-local flight requires its own drive, power and profile");
  }
  const r = runtime || {
    drive: P.drive,
    power: P.power,
    profile: P === state.player ? state.profile : P.profile,
    freeCam: P === state.player ? state.freeCam : null,
    warp: P === state.player ? state.warp : P.warp,
  };
  const stepStart = P.pos.clone(), stepPlace = P.place;
  const fc = r.freeCam || { on: false },
    c = P.controls;

  // A warp hands the controls to the drive: the throttle is released and the
  // stick eases back to neutral, so the ship coasts down and unwinds its turn
  // instead of stopping dead. Weapons are cut separately, in sim/weapons.js.
  const W = r.warp || null;
  const ease = W ? warpSteerEase(W.t) : 1;
  const stick = W
    ? W.steer
    : {
        x: fc.on ? 0 : c.steer.x,
        y: fc.on ? 0 : c.steer.y,
        roll: c.roll,
      };

  // Speed and turn come from the fitted thrusters, not from the hull. Thrusters
  // require both a fitted drive and stored MJ in the power cells: at 0 MJ the
  // engines stay cold and register 0 MJ/s draw.
  const drv = r.drive;
  const powered = hasDrive(drv);         // no thruster fitted: a dead ship
  const driveEnergy = powered && (!drv.draw || hasPower(drv.draw, r.power));

  // A dead or empty-tank ship cannot answer the controls, so warn the moment the
  // player asks it to move. The warning repeats while a control is still held,
  // but slowly, so it reads as a reminder rather than a flicker.
  P.noDriveT = Math.max(0, P.noDriveT - dt);
  if (!W && !powered && P.noDriveT === 0 && tryingToMove(c, stick)) {
    if (P === state.player) msg("Equip thrusters to move", NO_DRIVE_WARN);
    else sayForPlayer(P, "Equip thrusters to move", 0.5);
    P.noDriveT = NO_DRIVE_WARN + 0.5;
  } else if (!W && !driveEnergy && P.noDriveT === 0 && tryingToMove(c, stick)) {
    if (P === state.player) msg("No stored power", NO_DRIVE_WARN);
    else sayForPlayer(P, "No stored power", 0.5);
    P.noDriveT = NO_DRIVE_WARN + 0.5;
  }

  const boostKey = c.boost;

  // Power budget for this frame: the thrusters draw while running (throttle,
  // strafe, lift or active boost), and only when the power cells hold MJ to pay
  // for them — an unpowered drive never reports phantom MJ/s usage on the HUD.
  const activeAxis = !W && (P.thr !== 0 || c.strafe !== 0 || c.lift !== 0);
  const wantDrive = driveDraw(drv, P.thr !== 0 ? P.thr : activeAxis ? 1 : 0, P.boost && driveEnergy);
  const otherDriveDraw = r.power.draw - (r.power.use.drive || 0);
  const supply = driveEnergy && (wantDrive <= 0 || hasPower(otherDriveDraw + wantDrive, r.power));
  // Keep recorded draw strictly tied to paid thruster operation (throttle/boost,
  // or lateral thrusters when off centre).

  // The boost: lighting it is the hungry moment. It costs one big slug of stored
  // energy (20 MJ on the basic thrusters) once the spool-up has finished and the
  // shake fires, and the cells have to hold that much for it to light at all.
  // A tank with only a splash left cannot light the boost: keep a little in reserve.
  const wantBoost = powered && !W && boostKey && P.en > drv.bmax * 0.05;
  const canBoost = wantBoost && supply && r.power.stored >= (drv.ignite || 0);

  // With no power left there is nothing to push with.
  const spd = supply ? drv.spd : 0;

  // The movement itself is THE shared model (sim/flight-model.js) — the same
  // maths every NPC flies with. This function only decides what the pilot is
  // allowed to ask for (warp coast, a dead drive, an empty tank) and pays the
  // boost's costs; turning, throttle, easing and boost push happen in there.
  const hullFlight = (shipDef(P.ship) || {}).flight || {};
  stepFlight(P, {
    speed: spd,
    turn: driveEnergy ? drv.turn : 0,
    boostSpeed: spd,
    // This hull's own turning tweaks (yaw/pitch/roll/turnAll multipliers in
    // its SHIPS entry); absent fields fall back to 1 in the model.
    yaw: hullFlight.yaw, pitch: hullFlight.pitch,
    roll: hullFlight.roll, turnAll: hullFlight.turnAll,
  }, {
    yaw: stick.x, pitch: stick.y, roll: stick.roll,
    thrust: (!W && powered && driveEnergy) ? c.thrust : 0,
    stop: !!W || !powered || !!c.stop,
    brake: !!c.brake && (W || powered),
    strafe: W ? 0 : c.strafe,
    lift: W ? 0 : c.lift,
    boost: wantBoost,
    boostAllowed: canBoost,
    onBoostIgnite: () => {
      P.shake = 1;
      P.wxBoosts = (P.wxBoosts || 0) + 1;
      emit("sfx", { name: "boost" });
      // The ignition: one flat gulp out of the cells, not a trickle.
      r.power.stored = Math.max(0, r.power.stored - (drv.ignite || 0));
    },
  }, dt);

  // Recorded after the shared model has run, so the draw reads the throttle
  // and boost this tick actually used (the old inline model updated both
  // before this line too).
  const paidDrive = supply ? (P.thr !== 0 || P.boost ? driveDraw(drv, P.thr, P.boost) : 0) : 0;
  setDraw("drive", paidDrive, r.power);

  // The tank fills by itself whenever the boost is not burning. Both rates come
  // from the fitted thrusters, so a bigger tank or a thirstier boost is a change
  // in data/modules.js and nothing else.
  P.en = clamp(P.en + (canBoost ? -drv.buse : drv.bfill) * dt, 0, P.enMax);

  // Collision matches what is drawn (docs/GLB_MODELS.md): every rock is its own
  // lumpy triangle soup scaled/rotated onto the rock, and every scenery model — the
  // station's ring and hub, planets, a GLB cave — bakes its triangles into this
  // place's colliders. `collide: false` on a feature opts it out (glow shells). The
  // ship itself is a sphere of SHIP_RADIUS. Resolution is the same push-out bounce the
  // old sphere tests used; only the hull is different.
  let pushed = false;
  const pocket = placeWorld(P.place || state.place);
  for (const a of pocket.asteroids) {
    const speed = P.v.length();
    const hit = collideRockAt(a.shape || 0, a.pos, a.quat, a.scale, P.pos.x, P.pos.y, P.pos.z, SHIP_RADIUS);
    if (!hit) continue;
    P.pos.x += hit.x * hit.depth;
    P.pos.y += hit.y * hit.depth;
    P.pos.z += hit.z * hit.depth;
    if (hit.depth > 0) pushed = true;
    bounceOff(P, hit);
    if (speed > 25) hurt(speed * 0.015 * (hit.damage || 1), P);   // 1/10th of the old 100-point-hull rule
  }

  // Enemy hulls are solid, like rocks: the two ships separate and ricochet off each
  // other, and a hit above 25 m/s costs both sides the same collision damage the pilot
  // takes from a rock — shields first for them, raw hull for the hostile. A ram-kill
  // credits the pilot, via the same event the beam and bolts use.
  for (const e of pocket.enemies) {
    const rr = SHIP_RADIUS + enemyHullRadius(e);
    let dx = P.pos.x - e.pos.x, dy = P.pos.y - e.pos.y, dz = P.pos.z - e.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) continue;
    let d = Math.sqrt(d2), nx, ny, nz;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = 0; ny = 0; nz = 1; d = 0; }
    const overlap = rr - d, half = overlap * 0.5;
    P.pos.x += nx * half; P.pos.y += ny * half; P.pos.z += nz * half;
    e.pos.x -= nx * half; e.pos.y -= ny * half; e.pos.z -= nz * half;
    if (half > 0) pushed = true;
    // Impact energy: the relative speed at the moment of contact — the same 25 m/s /
    // 0.015 rule the pilot's rock hits use, applied to both ships of a collision.
    // (Absolute own-speed would let a stationary victim escape, which is not how
    // being rammed feels.)
    const impact = Math.hypot(P.v.x - e.v.x, P.v.y - e.v.y, P.v.z - e.v.z);
    // Measured before the ricochet, exactly like the rock rule measures before its bounce.
    const vnP = P.v.x * nx + P.v.y * ny + P.v.z * nz,
      vnE = e.v.x * nx + e.v.y * ny + e.v.z * nz;
    if (vnP < vnE) {   // approaching — equal hull masses swap normal velocity parts, restitution 0.4
      const REST = 0.4,
        newP = (vnP * (1 - REST) + vnE * (1 + REST)) / 2,
        newE = (vnE * (1 - REST) + vnP * (1 + REST)) / 2;
      P.v.x += (newP - vnP) * nx; P.v.y += (newP - vnP) * ny; P.v.z += (newP - vnP) * nz;
      e.v.x += (newE - vnE) * nx; e.v.y += (newE - vnE) * ny; e.v.z += (newE - vnE) * nz;
    }
    // n points from the enemy to the pilot; n-velocities behind each other means they are closing.
    if (impact > 25) {
      hurt(impact * 0.015, P);
      emit("enemy-rammed", { e, dmg: impact * 0.015, at: e.pos, byPlayer: P, placeId: P.place || state.place });
    }
  }

  // **Another pilot's hull is solid, like a rock or a hostile** (playtest 23, second report: *"the
  // guest ship that spawns in is not clippable and doesnt take damage. Every ship should by default
  // take damage and be collidable in tallow reach unless otherwise specified."*).
  //
  // A visiting pilot is a record in `state.players` and `render/views.js` draws its hull, so it is a
  // body: the two ships separate and ricochet off each other with the same maths and the same 25 m/s
  // / 0.015 damage rule the enemy hulls use. A **docked** visitor is included on purpose — its hull
  // is still drawn, parked at the launch point its arrival put it on, and a body you can see is a
  // body you can hit. It has no tick of its own (`step.js` skips a docked record), so it pays for the
  // collision here; an active visitor pays for itself in its own tick, which is why only this pilot
  // pays when the other one is flying. That keeps one collision one hit per tick per pilot.
  for (const other of state.players) {
    if (!other || other === P || other.dead || !other.pos) continue;
    if ((other.place || state.place) !== (P.place || state.place)) continue;
    const rr = SHIP_RADIUS + pilotHullRadius(other);
    let dx = P.pos.x - other.pos.x, dy = P.pos.y - other.pos.y, dz = P.pos.z - other.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr) continue;
    let d = Math.sqrt(d2), nx, ny, nz;
    if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = 0; ny = 0; nz = 1; d = 0; }
    const overlap = rr - d, half = overlap * 0.5;
    P.pos.x += nx * half; P.pos.y += ny * half; P.pos.z += nz * half;
    other.pos.x -= nx * half; other.pos.y -= ny * half; other.pos.z -= nz * half;
    if (half > 0) pushed = true;
    const impact = Math.hypot(P.v.x - other.v.x, P.v.y - other.v.y, P.v.z - other.v.z);
    const vnP = P.v.x * nx + P.v.y * ny + P.v.z * nz,
      vnO = other.v.x * nx + other.v.y * ny + other.v.z * nz;
    if (vnP < vnO) {   // approaching — equal hull masses swap normal velocity parts, restitution 0.4
      const REST = 0.4,
        newP = (vnP * (1 - REST) + vnO * (1 + REST)) / 2,
        newO = (vnO * (1 - REST) + vnP * (1 + REST)) / 2;
      P.v.x += (newP - vnP) * nx; P.v.y += (newP - vnP) * ny; P.v.z += (newP - vnP) * nz;
      other.v.x += (newO - vnO) * nx; other.v.y += (newO - vnO) * ny; other.v.z += (newO - vnO) * nz;
    }
    if (impact > 25) {
      hurt(impact * 0.015, P);
      // A parked hull cannot pay in its own tick, so it pays here — through the same shield-then-hull
      // path every other hit uses. A record with no profile of its own is not a pilot this sim may
      // hurt (`hurt` refuses to borrow the local fit, L16), so it is left alone.
      const theirs = profileOf(other);
      if (other.docked && theirs && theirs !== state.profile) hurt(impact * 0.015, other, theirs);
    }
  }

  const place = P.place || state.place;
  for (const collider of placeCollidersOf(place)) {
    const speed = P.v.length();
    const hit = collideSphereAt([collider], P.pos.x, P.pos.y, P.pos.z, SHIP_RADIUS);
    if (!hit) continue;
    P.pos.x += hit.x * hit.depth;
    P.pos.y += hit.y * hit.depth;
    P.pos.z += hit.z * hit.depth;
    if (hit.depth > 0) pushed = true;
    bounceOff(P, hit);
    // Everything solid hurts, at the same rate a rock does (owner, 2026-11-15): a station ring, a
    // planet, a cave wall. `collideDmg: 0` in a place's data is the only way to make one bounce
    // without damage, and `collide: false` the only way to have none at all.
    if (hit.damage > 0 && speed > 25) hurt(speed * 0.015 * hit.damage, P);
  }

  const continuous = !W && stepPlace === P.place && !P.docked && P.hull > 0;
  P.pushed = continuous && pushed;
  P.measuredSpeed = flightSpeed(stepStart, P.pos, dt, continuous);
  P.forwardSpeed = continuous && dt > 0
    ? V(P.pos.x - stepStart.x, P.pos.y - stepStart.y, P.pos.z - stepStart.z).dot(fwdQ(P.quat)) / dt
    : 0;
}

/**
 * How big another pilot's hull is, in metres, for a collision with ours: the same base radius the
 * local ship is a sphere of, scaled by the hull's own model scale (`SHIPS[...].sc`) — the number the
 * screen draws it with, so what you see is what you hit.
 */
export const pilotHullRadius = P => SHIP_RADIUS * (shipDef(P?.ship)?.sc || 1);

/** Reflect the ship's velocity off a collision normal, keeping 40% of its energy. */
function bounceOff(P, hit) {
  reflectVelocity(P.v, hit.x, hit.y, hit.z, 0.4);
}

/** Apply `d` damage: shields first, then hull. Emits "player-dead" at zero hull. */
export function hurt(d, P = state.player, profile = null) {
  const S = profile || profileOf(P);
  if (P !== state.player && (!S || S === state.profile)) {
    throw new Error("Non-local damage requires its own profile");
  }
  P.last = state.time;
  P.wxHits = (P.wxHits || 0) + 1;
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
  // Stamp the pilot's profile with the fraction the ship is on, so damage is
  // remembered across fit changes, hangar visits and hull switches.
  if (S && P.hullMax > 0) {
    const frac = clamp(P.hull / P.hullMax, 0, 1);
    S.hp[S.ship] = Math.max(REPAIR_MIN_HULL, frac);
  }
  emit("hurt", { shielded: P.sh > 0, player: P });
  if (P.hull <= 0) {
    // Non-local death recovery belongs to step 16 (multiplayer respawn).
    if (P !== state.player) P.dead = true;
    // `lost` is the hold as it was at the moment of death, so a listener never has
    // to depend on whether the ship's cargo has already been cleared.
    emit("player-dead", { player: P, lost: { ...(S?.holds?.[S.ship] || {}) } });
  }
}
