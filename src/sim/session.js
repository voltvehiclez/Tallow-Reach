// Flight lifecycle: launching from the outpost, docking, and losing a ship.
// Launch and docking operate on an explicit pilot `P` and their `profile`
// (defaulting to the local pilot). Death recovery for non-local pilots belongs
// to step 16 (multiplayer respawn rules).

import { V, R } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { DEFAULT_SHIP, nextShipId, shipName } from "../data/ships.js";
import { DEFAULT_PLACE, isPocket, isInstancePlace, isWormholePlace } from "../data/places.js";
import { RECOVERY_FEE, REPAIR_MIN_HULL } from "../data/station.js";
import { state, msg, profileOf, currentSave, placeWorld, saveCurrentGame } from "../state/state.js";
import { addShipRecords, ensureShipRecords } from "../state/profile.js";
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
import { activeMissions, missionProgress, missionObjectivesDone, launchBlockedReason } from "./missions.js";
import { campaignDockRefusal, activeCampaignMission } from "./campaign.js";
import { cancelWarp } from "./sectors.js";
import { facePlayer } from "./pilot.js";
import { restoreInstances, populateInstances } from "./instances.js";
import { restoreWormholes } from "./wormholes.js";

/** Permanent stations only; saved ids are resolved after the galaxy catalogue is restored. */
export function canSetHomeStation(id = state.place) {
  return isPocket(id) && !isInstancePlace(id) && !isWormholePlace(id) && !!stationAt(id);
}
export function homeStationPlace(profile = state.profile) {
  const id = profile?.homeStation || DEFAULT_PLACE;
  return canSetHomeStation(id) ? id : DEFAULT_PLACE;
}
export function setHomeStation(P = state.player, profile = profileOf(P)) {
  const id = P?.place || state.place;
  if (!P?.docked || !canSetHomeStation(id)) return "Dock at a permanent station to set your home.";
  profile.homeStation = id;
  if (P === state.player) saveCurrentGame();
  return `Home station set to ${stationAt(id).n}. You will recover here after death.`;
}

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
  // A station conversation is not skippable: undocking mid-briefing would leave
  // the story's next beat waiting behind a counter the pilot flew away from.
  const blocked = launchBlockedReason(profile, P.place || state.place);
  if (blocked) {
    if (local) msg(blocked, 4);
    emit("launch-denied", { player: P, message: blocked });
    return false;
  }
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
  P.dockedAt = state.time;
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.acc = 0;
  P.boost = false;
  if (P.controls) {
    P.controls.thrust = P.controls.strafe = P.controls.lift = P.controls.roll = 0;
    P.controls.stop = P.controls.brake = P.controls.boost = P.controls.fire = P.controls.sec = false;
    if (P.controls.steer) P.controls.steer.x = P.controls.steer.y = 0;
  }
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
  // A campaign act keeps its scene: docking puts the pilot at the counter but
  // does not wipe the ships, shots or positions the act put in the pocket.
  if (!anyOtherActive && !activeCampaignMission(profile)) clearTransient(placeId);

  P.flight.missileLock = { target: null, t: 0, locked: false };
  P.flight.lock = null;
  // Preserve the old fallback for empty pockets: docking there returns home.
  // A real station feature — including a generated friendly trader — keeps its
  // own pocket so its named shop can be used.
  const dockedAt = stationAt(placeId) ? placeId : DEFAULT_PLACE;
  if (local) enterPlace(dockedAt, P);
  else P.place = dockedAt;
  // Park the flown ship in this station's hangar so Outfitting and Inventory scope to it.
  if (profile.ships.includes(profile.ship)) {
    (profile.shipPlaces || (profile.shipPlaces = {}))[profile.ship] = dockedAt;
  }
  // The board the pilot walks up to is this station's own (home keeps `board`).
  ensureBoard(world, dockedAt);
  if (local) saveCurrentGame();
  emit("docked", { player: P });
}

/**
 * Resume the local pilot from the loaded save: the same pocket, and the exact
 * spot and heading they quit at (`world.resume`). A save made while docked opens
 * the station menu. The pocket's arrival point is the fallback for older saves,
 * a damaged position, or a ship that cannot move.
 */
export function resumeFromSave(P = state.player, profile = profileOf(P)) {
  // The save may have been made inside a temporary run (slice 14b). The run and its place are
  // rebuilt first — `enterPlace` refuses anything that is not a place — and filled in at the end,
  // because entering a place clears that place's objects. Simple wormhole pockets (slice 14c) are
  // rebuilt the same way: someone may be standing in one.
  restoreInstances();
  if (state.mode !== "campaign") restoreWormholes();
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
    if (profile.ships.includes(profile.ship)) {
      (profile.shipPlaces || (profile.shipPlaces = {}))[profile.ship] = placeId;
    }
    emit("docked", { player: P });
  }
  populateInstances();   // the pilot is standing in the run now, so it can be filled in
  return P;
}

/** Dock if close enough and slow enough. Otherwise do nothing. */
export function tryDock(P = state.player, profile = profileOf(P), world = state.worldState) {
  assertSessionPilot(P, profile, "tryDock");
  if (!P || P.docked || P.dead) return false;
  // Docking cannot be used to sit out a fight the act is still asking for.
  const refusal = campaignDockRefusal(profile);
  if (refusal) {
    if (P === state.player) msg(refusal, 4);
    emit("docking-denied", { player: P, reason: refusal });
    return false;
  }
  const station = stationAt(P.place || state.place);
  if (!station) return false;   // no station in this pocket
  const at = V(...station.pos);
  const dockSpd = Math.max(P.v.length(), P.measuredSpeed || 0);
  if (P.pos.distanceTo(at) < (station.dockRange ?? DOCK_RANGE) && dockSpd < (station.dockSpeed ?? DOCK_MAX_SPEED)) {
    dock(P, profile, world);
    return true;
  }
  return false;
}

/**
 * The ship is destroyed. It is lost for good, its cargo is gone, and a
 * recovery fee is charged. The player falls back to another ship, or
 * the station lends a Wasp if they have nothing left.
 *
 * `die()` is the local pilot's own death: it re-enters the home station's pocket and docks
 * there. `die(P, profile)` with a visiting record is the same recovery in the world that
 * holds the truth (the host's): the hull is lost, the fee is charged, the home-hangar
 * fallback or the lent Wasp follows, and the record wakes up **docked** at the home station
 * in that world — never standing on an undock point, never outside the ship's own fit.
 */
export function die(P = state.player, profile = profileOf(P)) {
  // Anything that has to happen while the pilot is still where they died runs here, before the ship
  // and its hold are removed and before the docking below resolves a station. An instance despawns
  // at once and puts the pilot back where they entered: `sim/instances.js` listens for `dying`.
  emit("dying", { player: P });
  const S = profile || profileOf(P),
    local = P === state.player,
    lost = S.ship;
  const fee = Math.min(S.cr, RECOVERY_FEE);
  boom(P.pos, 30, 0xffa050, P.place || state.place);

  let text = `Your ${shipName(lost)} was destroyed and is gone for good. Cargo lost, ${fee} cr recovery fee.`;
  // What ran out of time says why first (`onExpire.message` in data/instances.js), then the ordinary
  // sentence follows, so the notice is one line of lore and one line of consequences.
  if (state.deathNotice) {
    text = `${state.deathNotice} ${text}`;
    state.deathNotice = null;
  }
  delete S.holds[lost];      // its ore and any spare modules it carried go with it
  if (S.holdSlots) delete S.holdSlots[lost];
  S.cr -= fee;
  S.ships = S.ships.filter(id => id !== lost);
  delete S.hp[lost];
  delete S.loadout[lost];
  if (S.shipPlaces) delete S.shipPlaces[lost];

  const home = homeStationPlace(S);
  S.homeStation = home;
  // Fall back to a ship parked at the home station (or an unplaced legacy ship).
  // Ships explicitly parked at other stations stay safely parked where they were left,
  // and if the home hangar is empty the station lends a spare Wasp here.
  const atHome = S.ships.filter(id => !S.shipPlaces?.[id] || S.shipPlaces[id] === home);
  if (atHome.length) {
    S.ship = atHome[0];
    ensureShipRecords(S, S.ship, home);
    S.shipPlaces[S.ship] = home;
    setShip(S.ship, P, S);
  } else {
    const lent = nextShipId(DEFAULT_SHIP, S.ships);
    S.ships.push(lent);
    S.ship = lent;
    // The lent Wasp is a complete ship: empty hold, no damage, stock modules.
    addShipRecords(S, lent, home);
    setShip(S.ship, P, S);
    text += " The station lent you a spare Wasp.";
  }
  // The fresh hull is a fresh hull: every fitted system follows it, exactly as a swap does.
  // (Before this the lent Wasp flew on the lost ship's fitted thrusters and shields.)
  refillPower(P, S);
  refreshDrive(P, S);
  refreshShield(P, S);
  refreshGuns(P, S);
  refreshHull(P, S);

  // Only the local pilot's death pocket is cleared: `clearTransient` wipes enemies, bullets and
  // crates world-wide in that pocket, which is the home station's own sky when a visitor died.
  if (local) clearTransient(P.place || state.place);
  if (local) {
    enterPlace(home, P);
    dock();
    emit("died", text);
    return;
  }
  // A visitor dies in the world that holds its truth. No place change is emitted — a
  // `place-entered` here would drag the host's screen into the guest's home pocket; the
  // visitor's screen learns of the respawn from the ship stream and the suitcase. The
  // record is put **docked at the home station**, inside the station's own position, like
  // any other dock — never at the launch point.
  P.dead = false;
  P.warp = null;
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.place = home;
  const station = stationAt(home);
  if (station?.pos) P.pos.set(...station.pos);
  dock(P, S, state.worldState);
  const name = P.name || "A visiting pilot";
  emit("mp-guest-recovered", { guestId: P.guestId, name, home, text });
  emit("mp-notice", `${name} was destroyed and recovered at ${station?.n || home}. Cargo lost, ${fee} cr recovery fee.`);
}

on("player-dead", ({ player } = {}) => {
  // A visitor recovers like any other pilot (step 16 death rule): same losses, same fee,
  // docked at the home station in the world that holds the record — built-in, not a debt.
  if (!player) return;
  if (player === state.player) { die(); return; }
  const profile = player.profile || profileOf(player);
  // Only a record that is a hull (a real ship runtime) can be recovered — a bare payload that
  // merely *carries* the news is not a ship and has nothing to charge. And a recovery that
  // throws must never take the rest of the `player-dead` fan-out down with it.
  const isHull = !!(player.pos && player.hullMax !== undefined);
  if (profile && isHull) {
    try {
      die(player, profile);
      return;
    } catch (e) {
      console.error("visitor recovery failed", e);
      emit("mp-notice", `${player.name || "A visiting pilot"}'s ship was destroyed and the recovery failed.`);
      return;
    }
  }
  emit("mp-notice", `${player.name || "A pilot"}'s ship was destroyed.`);
});
