// Flight lifecycle: launching from the outpost, docking, and losing a ship.
// Launch and docking operate on an explicit pilot `P` and their `profile`
// (defaulting to the local pilot). Death recovery for non-local pilots belongs
// to step 16 (multiplayer respawn rules).

import { V, R } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { DEFAULT_PLACE } from "../data/places.js";
import { RECOVERY_FEE, REPAIR_MIN_HULL } from "../data/station.js";
import { state, msg, profileOf, currentSave, placeWorld } from "../state/state.js";
import { addShipRecords, ensureShipRecords } from "../state/profile.js";
import { saveAutosave } from "../state/storage.js";
import { clearTransient } from "./world.js";
import { stationAt, fieldAt, launchFace, enterPlace, arrivalPos } from "./places.js";
import { setShip } from "./player.js";
import { refillPower } from "./power.js";
import { refreshDrive, hasDrive } from "./drive.js";
import { refreshShield } from "./shield.js";
import { refreshGuns } from "./guns.js";
import { refreshHull } from "./hull.js";
import { spawnCrate, nextMissionCrateSlot } from "./combat.js";
import { boom } from "./effects.js";
import { ensureBoard } from "./contracts.js";
import { activeMissions, missionProgress, missionObjectivesDone } from "./missions.js";
import { cancelWarp } from "./sectors.js";
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

/**
 * Put one persistent crate in the field for every crate a recovery contract
 * still needs. Each crate belongs to its mission (`missionId` + `crateSlot`), so
 * it can be counted, restored from a save and cleared away when that mission is
 * handed in — while the salvage inside the hold stays ordinary cargo.
 */
function ensureSalvageCrates(placeId, profile) {
  const field = fieldAt(placeId);
  if (!field?.salvage) return;
  const W = placeWorld(placeId);
  const [sx, sy, sz] = field.salvage.spread;
  for (const mission of activeMissions(profile)) {
    if (mission?.type !== "salvage" || mission.failed || missionObjectivesDone(mission)) continue;
    const progress = missionProgress(mission);
    const missing = Math.max(0, progress.total - progress.done) -
      W.crates.filter(crate => crate?.missionId === mission.id && crate.item === "salv").length;
    let slot = nextMissionCrateSlot(placeId, mission.id, "salv");
    for (let i = 0; i < missing; i++) {
      const at = V(...field.pos).add(V(R(-sx, sx), R(-sy, sy), R(-sz, sz)));
      spawnCrate(at, "salv", placeId, null, null, mission.id, true, slot++);
    }
  }
}

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
  const placeId = P.place || state.place;
  const station = stationAt(placeId) || stationAt(DEFAULT_PLACE);
  P.pos.set(...station.launch.pos);
  facePlayer(launchFace(placeId, station), 1, P);
  P.v.set(0, 0, 0);
  P.snap = true;
  refillPower(P, profile);      // launched fully charged
  refreshDrive(P, profile);     // the bays may have changed while docked
  refreshShield(P, profile);
  refreshGuns(P, profile);      // and its primary bays what fires
  refreshHull(P, profile);      // and its Hull HP follow the fitted hull module
  P.en = P.drive.bmax;          // launched with a full boost tank

  // A recovery contract spawns its own crates in the field and counts only
  // those: two jobs running side by side each need their own crates flown out
  // and picked up. Top up whatever is still to be recovered on every launch, so
  // a crate lost with a reloaded pocket never leaves a contract unreachable.
  ensureSalvageCrates(placeId, profile);

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
    cancelWarp(P);
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

  const placeId = P.place || state.place;
  const anyOtherActive = state.players.some(p => p && p !== P && !p.docked && !p.dead && (p.place || state.place) === placeId);
  if (!anyOtherActive) clearTransient(placeId);

  P.flight.missileLock = { target: null, t: 0, locked: false };
  P.flight.lock = null;
  // Preserve the old fallback for empty pockets: docking there returns home.
  // A real station feature — including a generated friendly trader — keeps its
  // own pocket so its named shop can be used.
  const dockedAt = stationAt(placeId) ? placeId : DEFAULT_PLACE;
  if (local) enterPlace(dockedAt, P);
  // The board the pilot walks up to is this station's own (home keeps `board`).
  ensureBoard(world, dockedAt);
  if (local) saveAutosave(currentSave());
  emit("docked", { player: P });
}

/**
 * Resume the local pilot from the loaded save: the same pocket, and the exact
 * spot and heading they quit at (`world.resume`). A save made while docked opens
 * the station menu. The pocket's arrival point is the fallback for older saves,
 * a damaged position, or a ship that cannot move.
 */
export function resumeFromSave(P = state.player, profile = profileOf(P)) {
  const placeId = state.worldState.place || DEFAULT_PLACE;
  enterPlace(placeId, P);
  emit("place-entered", { id: placeId, player: P });   // refresh scenery/views even when the id did not change
  P.ship = profile.ship;
  P.weapon = profile.pw;
  P.missileStock = profile.msl;
  P.warp = null;
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.acc = 0;
  P.snap = true;
  refillPower(P, profile);
  refreshDrive(P, profile);
  refreshShield(P, profile);
  refreshGuns(P, profile);
  refreshHull(P, profile);
  P.flight.lock = null;
  P.flight.missileLock = { target: null, t: 0, locked: false };

  // Come back where you left off. `world.resume` is null while docked, so an
  // older save (which has no resume point at all) keeps the old behaviour: dock
  // if this pocket has a station, otherwise fly in at its arrival point.
  const saved = state.worldState.resume;
  const station = stationAt(placeId);

  // Shields and boost return as they were, so quitting is not a free repair.
  // A save without them tops up. Speed is always zero: you load stationary.
  P.en = saved && saved.en !== null ? Math.min(saved.en, P.drive.bmax) : P.drive.bmax;
  P.sh = saved && saved.sh !== null ? Math.min(saved.sh, P.shMax) : P.shMax;

  let spot = null,
    facing = null;
  if (saved) {
    // A ship with no thrusters cannot fly home. If the saved spot would strand
    // it outside docking range, put it back at the station instead.
    const stranded = station && !hasDrive(P.drive) &&
      V(...saved.pos).distanceTo(V(...station.pos)) >= (station.dockRange ?? DOCK_RANGE);
    if (!stranded) {
      spot = saved.pos;
      facing = saved.quat;
    }
  }
  if (!spot && !station) spot = arrivalPos(placeId).toArray();   // empty pocket: the entry point

  if (spot) {
    P.docked = false;
    P.pos.set(...spot);
    if (facing) P.quat.set(...facing).normalize();
    emit("launched", { player: P });
  } else {
    P.docked = true;
    P.pos.set(...station.pos);
    emit("docked", { player: P });
  }
  return P;
}

/** Dock if close enough and slow enough. Otherwise do nothing. */
export function tryDock(P = state.player, profile = profileOf(P), world = state.worldState) {
  assertSessionPilot(P, profile, "tryDock");
  if (!P || P.docked || P.dead) return false;
  const station = stationAt(P.place || state.place);
  if (!station) return false;   // no station in this pocket
  const at = V(...station.pos);
  if (P.pos.distanceTo(at) < (station.dockRange ?? DOCK_RANGE) && P.v.length() < (station.dockSpeed ?? DOCK_MAX_SPEED)) {
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
    // A ship you fall back to must have its own hold, fit and hull fraction;
    // fill in anything a very old save left out rather than flying half a ship.
    ensureShipRecords(S, S.ship);
    setShip(S.ship);
  } else if (S.cr < SHIPS[DEFAULT_SHIP].price) {
    S.ships = [DEFAULT_SHIP];
    S.ship = DEFAULT_SHIP;
    // The lent Wasp is a complete ship: empty hold, no damage, stock modules.
    // Without this it had no bays, so it could not be fitted or flown at all.
    addShipRecords(S, DEFAULT_SHIP);
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
