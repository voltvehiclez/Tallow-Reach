// Flight lifecycle: launching from the outpost, docking, and losing a ship.
// Menus and HUD react to the events emitted here (docked, launched, died).

import { V, R, face } from "../util/math.js";
import { emit, on } from "../util/events.js";
import { SHIPS, DEFAULT_SHIP } from "../data/ships.js";
import { DEFAULT_SECTOR, sectorAt } from "../data/sectors.js";
import { emptyCargo } from "../data/items.js";
import { RECOVERY_FEE, REPAIR_MIN_HULL } from "../data/station.js";
import { state, msg } from "../state/state.js";
import { saveAutosave } from "../state/storage.js";
import { FIELD_CENTER, clearTransient } from "./world.js";
import { setShip } from "./player.js";
import { refillPower } from "./power.js";
import { refreshDrive } from "./drive.js";
import { spawnCrate } from "./combat.js";
import { boom } from "./effects.js";
import { ensureBoard } from "./contracts.js";
import { cancelWarp, enterSector } from "./sectors.js";

const DOCK_RANGE = 300;     // metres from the outpost
const DOCK_MAX_SPEED = 70;  // m/s

/** Leave the outpost and head for the asteroid field. */
export function launch() {
  const P = state.player,
    S = state.profile;
  P.docked = false;
  P.m.visible = true;
  P.m.position.set(0, 0, 300);
  face(P.m, FIELD_CENTER, 1);
  P.v.set(0, 0, 0);
  P.en = 100;
  P.snap = true;
  refillPower();      // launched fully charged

  // Salvage contracts need their crates out in the field.
  const m = S.mission;
  if (m && m.type === "salvage" && state.world.crates.length === 0) {
    for (let i = 0; i < m.n - m.p; i++) {
      spawnCrate(FIELD_CENTER.clone().add(V(R(-600, 600), R(-150, 150), R(-600, 600))));
    }
  }

  emit("launched");
  msg("Launched. Fly to the asteroid field.", 4);
}

/** Dock at the outpost: clear the field, repair shields, save. */
export function dock() {
  const P = state.player,
    S = state.profile;
  state.freeCam.on = false;
  cancelWarp();
  P.docked = true;
  P.m.visible = false;
  P.v.set(0, 0, 0);
  P.thr = 0;
  if (S.ships.includes(S.ship)) {
    S.hp[S.ship] = Math.max(REPAIR_MIN_HULL, P.hull / P.hullMax);
  }
  P.sh = P.shMax;
  refillPower();      // the outpost tops the cells up
  refreshDrive();     // and the ship may have changed (death, hangar)
  clearTransient();
  state.flight.missileLock = { target: null, t: 0, locked: false };
  state.flight.lock = null;
  enterSector(DEFAULT_SECTOR);   // the outpost is in the starting sector
  ensureBoard();
  saveAutosave(S);
  emit("docked");
}

/** Dock if close enough and slow enough. Otherwise do nothing. */
export function tryDock() {
  const P = state.player;
  if (!sectorAt(state.sector).st) return;   // no outpost in this sector
  if (P.m.position.length() < DOCK_RANGE && P.v.length() < DOCK_MAX_SPEED) dock();
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
  boom(state.player.m.position, 30, 0xffa050);

  let text = `Your ${SHIPS[lost].n} was destroyed and is gone for good. Cargo lost, ${fee} cr recovery fee.`;
  S.cargo = emptyCargo();
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

on("player-dead", die);
