// STEP 9 LOCAL-ONLY: sector transitions and warp operate on the local ship and one shared sector.
// Moving between sectors. M starts a warp to the next sector in data/sectors.js.
//
// A warp is a sequence, timed by WARP in data/sectors.js and about two seconds
// long: the drive charges (state.warp.fx rises 0 -> 1), the sector switches at a
// white-out, then the drive settles (fx falls 1 -> 0). The ship cannot steer or
// fire for the whole sequence; sim/player.js and sim/weapons.js check state.warp.
//
// The outpost, the planet and the asteroid field belong to one sector each and
// are hidden while you are elsewhere, so a warp lands you in empty space.
// The sector you are in is runtime only (state.sector); it is not saved, so you
// always launch in the starting sector.

import {
  SECTORS,
  WARP,
  WARP_SWITCH_AT,
  WARP_TIME,
  sectorAt,
  nextSector,
  warpFlashAt,
} from "../data/sectors.js";
import { emit } from "../util/events.js";
import { state, msg, say } from "../state/state.js";
import { clearWorldObjects, swapField } from "./world.js";

/** True while a warp is in progress. */
export const isWarping = () => state.warp !== null;

/**
 * Make `id` the current sector: park the old sector's rocks, restore the new
 * sector's, and show the matching scenery. Does not move the player; see startWarp.
 */
export function enterSector(id) {
  if (id === state.sector) return;
  swapField(state.sector, id);
  state.sector = id;
  emit("sector-entered", { id });
}

/**
 * Begin a warp to the next sector. Returns false if one is already running.
 * The ship is pinned in place and control is locked until the sequence ends.
 */
export function startWarp() {
  if (state.warp) return false;

  const from = state.sector,
    to = nextSector(from),
    P = state.player;

  // Remember where the stick was, so sim/player.js can ease it back to neutral.
  state.warp = {
    from,
    to,
    t: 0,
    fx: 0,
    flash: 0,
    switched: false,
    // Where the stick is right now, from the control record: sim/player.js eases
    // it back to neutral during the warp, so the ship's turn unwinds.
    steer: {
      x: state.freeCam.on ? 0 : P.controls.steer.x,
      y: state.freeCam.on ? 0 : P.controls.steer.y,
      roll: P.controls.roll,
    },
  };

  // The drive takes over: the throttle is released here and the ship keeps its
  // momentum, so it coasts down instead of stopping dead (see sim/player.js).
  // The camera is left alone: it keeps tracking the ship, which is now easing
  // its turn out, so nothing jumps or swivels the moment M is pressed.
  P.acc = 0;
  state.freeCam.on = false;
  state.flight.beamOn = false;
  state.flight.beamT = 0;

  emit("sfx", { name: "warp-charge", dur: WARP.charge });
  emit("warp-start", { from, to });
  return true;
}

/** Advance the warp sequence. Call every frame while flying. */
export function updateWarp(dt) {
  const w = state.warp;
  if (!w) return;

  w.t += dt;
  if (!w.switched && w.t >= WARP_SWITCH_AT) {
    w.switched = true;
    arrive(w.from, w.to);
  }
  w.fx = warpFx(w.t);          // 0 -> 1 -> 0, drives the streaks and the FOV
  w.flash = warpFlashAt(w.t);  // white-out, peaks exactly at the switch

  if (w.t < WARP_TIME) {
    say("Warp drive engaged");
  } else {
    state.warp = null;
    emit("warp-end", { from: w.from, to: w.to });
  }
}

/**
 * Cancel a warp in progress without arriving anywhere. Used when the ship docks,
 * which includes dying mid-warp.
 */
export function cancelWarp() {
  const w = state.warp;
  if (!w) return;
  state.warp = null;
  emit("warp-end", { from: w.from, to: w.to });
}

/** Effect strength over the sequence: 0 -> 1 -> 0, so visuals can follow it. */
function warpFx(t) {
  if (t < WARP.charge) return t / WARP.charge;
  if (t < WARP_SWITCH_AT + WARP.flash) return 1;
  return Math.max(0, 1 - (t - WARP_SWITCH_AT - WARP.flash) / WARP.settle);
}

/** The moment of arrival: change sector and put the ship at its spawn point. */
function arrive(from, to) {
  const dest = sectorAt(to),
    P = state.player;

  enterSector(to);

  // Nothing follows you through: hostiles, crates, shots and sparks stay behind.
  clearWorldObjects();
  state.flight.lock = null;
  state.flight.missileLock = { target: null, t: 0, locked: false };

  // Arrive at the sector's spawn point, at rest, with the camera snapped.
  P.pos.set(dest.sn[0], dest.sn[1], dest.sn[2]);
  P.v.set(0, 0, 0);
  P.thr = 0;
  P.acc = 0;
  P.snap = true;

  emit("sfx", { name: "warp-burst" });
  msg(`Warp: ${SECTORS[from].n} to ${dest.n}. ${dest.d}`, 4);
  emit("sector-changed", { from, to });
}
