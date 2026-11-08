// Flight lifecycle: launching from the outpost, docking, and losing a ship.
// Launch and docking operate on an explicit pilot `P` and their `profile`
// (defaulting to the local pilot). Death recovery for non-local pilots belongs
// to step 16 (multiplayer respawn rules).

import { V, R } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { DEFAULT_SECTOR, sectorAt } from "../data/sectors.js";
import { RECOVERY_FEE, REPAIR_MIN_HULL } from "../data/station.js";
import { state, msg, profileOf, currentSave } from "../state/state.js";
import { saveAutosave } from "../state/storage.js";
import { FIELD_CENTER, clearTransient } from "./world.js";
import { setShip } from "./player.js";
import { refillPower } from "./power.js";
import { refreshDrive, hasDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshGuns } from "./guns.js";
import { refreshHull } from "./hull.js";
import { spawnCrate } from "./combat.js";
import { boom } from "./effects.js";
import { ensureBoard } from "./contracts.js";
import { cancelWarp, enterSector } from "./sectors.js";
import { facePlayer } from "./pilot.js";

function assertSessionPilot(P, profile, verb) {
  if (P && P !== state.player && (!profile || profile === state.profile)) {
    throw new Error(`Non-local ${verb} requires its own profile`);
  }
}

/** Attach `profile` to `P` and initialise its fitted subsystems. */
export function configurePlayer(P, profile) {
  if (P !== state.player && (!profile || profile === state.profile)) {
    throw new Error("Non-local player requires its own profile");
  }
  P.profile = profile;
  P.ship = profile.ship;
  P.weapon = profile.pw;
  P.missileStock = profile.msl;
  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshHull(P, profile);
  refreshGuns(P, profile);
  P.configured = true;
  return P;
}

const DOCK_RANGE = 300;     // metres from the outpost
const DOCK_MAX_SPEED = 70;  // m/s

/** Leave the outpost and head for the asteroid field. */
export function launch(P = state.player, profile = profileOf(P)) {
  assertSessionPilot(P, profile, "launch");
  const local = P === state.player;
  P.docked = false;
  P.ship = profile.ship;
  P.weapon = profile.pw;
  P.missileStock = profile.msl;
  // 200 m out is inside docking range (300), so a ship that cannot move can
  // still turn round and dock straight away. The model's visibility follows
  // `P.docked` in render/views.js (step 7b).
  P.pos.set(0, 0, 200);
  facePlayer(FIELD_CENTER, 1, P);
  P.v.set(0, 0, 0);
  P.snap = true;
  refillPower(P, profile);      // launched fully charged
  refreshDrive(P, profile);     // the bays may have changed while docked
  refreshShield(P, profile);
  refreshGuns(P, profile);      // and its primary bays what fires
  refreshHull(P, profile);      // and its Hull HP follow the fitted hull module
  P.en = P.drive.bmax;          // launched with a full boost tank

  // Salvage contracts need their crates out in the field.
  const m = profile.mission;
  if (m && m.type === "salvage" && state.world.crates.length === 0) {
    for (let i = 0; i < m.n - m.p; i++) {
      spawnCrate(FIELD_CENTER.clone().add(V(R(-600, 600), R(-150, 150), R(-600, 600))));
    }
  }

  emit("launched", { player: P });
  if (local) {
    if (hasDrive(P.drive)) msg("Launched. Fly to the asteroid field.", 4);
    else msg("No thrusters fitted: the ship cannot move. Press G to dock and fit one.", 6);
  }
}

/** Dock at the outpost: clear the field if nobody else is flying, repair shields, save. */
export function dock(P = state.player, profile = profileOf(P), world = state.worldState) {
  assertSessionPilot(P, profile, "dock");
  const local = P === state.player;
  if (local) {
    state.freeCam.on = false;
    cancelWarp();
  } else {
    P.warp = null;
  }
  P.docked = true;
  P.v.set(0, 0, 0);
  P.thr = 0;
  if (profile.ships.includes(profile.ship) && P.hullMax > 0) {
    profile.hp[profile.ship] = Math.max(REPAIR_MIN_HULL, P.hull / P.hullMax);
  }
  refillPower(P, profile);      // the outpost tops the cells up
  refreshDrive(P, profile);     // and the ship may have changed (death, hangar)
  refreshShield(P, profile);    // likewise its shields
  refreshGuns(P, profile);      // and its guns what they can shoot
  refreshHull(P, profile);      // and its Hull HP
  P.sh = P.shMax;               // and it leaves with them full

  const anyOtherActive = state.players.some(p => p && p !== P && !p.docked && !p.dead);
  if (!anyOtherActive) clearTransient();

  P.flight.missileLock = { target: null, t: 0, locked: false };
  P.flight.lock = null;
  if (local) enterSector(DEFAULT_SECTOR);   // the outpost is in the starting sector
  ensureBoard(world);
  if (local) saveAutosave(currentSave());
  emit("docked", { player: P });
}

/** Dock if close enough and slow enough. Otherwise do nothing. */
export function tryDock(P = state.player, profile = profileOf(P), world = state.worldState) {
  assertSessionPilot(P, profile, "tryDock");
  if (!P || P.docked || P.dead) return false;
  if (!sectorAt(state.sector).st) return false;   // no outpost in this sector
  if (P.pos.length() < DOCK_RANGE && P.v.length() < DOCK_MAX_SPEED) {
    dock(P, profile, world);
    return true;
  }
  return false;
}

/**
 * The ship is destroyed. It is lost for good, its cargo is gone, and a
 * recovery fee is charged. The player falls back to another ship, or
 * the station lends a Wasp if they have nothing left.
 */
export function die() {
  const S = state.profile,
    lost = S.ship;
  const fee = Math.min(S.cr, RECOVERY_FEE);
  boom(state.player.pos, 30, 0xffa050);

  let text = `Your ${SHIPS[lost].n} was destroyed and is gone for good. Cargo lost, ${fee} cr recovery fee.`;
  delete S.holds[lost];      // its ore and any spare modules it carried go with it
  S.cr -= fee;
  S.ships = S.ships.filter(id => id !== lost);
  delete S.hp[lost];
  delete S.loadout[lost];

  if (S.ships.length) {
    S.ship = S.ships[0];
    setShip(S.ship);
  } else if (S.cr < SHIPS[DEFAULT_SHIP].price) {
    S.ships = [DEFAULT_SHIP];
    S.ship = DEFAULT_SHIP;
    setShip(DEFAULT_SHIP);
    text += " The station lent you a spare Wasp.";
  } else {
    text += " Buy a new ship in the Hangar.";
  }

  dock();
  emit("died", text);
}

on("player-dead", ({ player } = {}) => {
  // Non-local death recovery belongs to step 16 (multiplayer respawn).
  if (!player || player === state.player) die();
});
