// Visiting pilots (refactor step 16, slice 4): a guest's suitcase becomes a ship.
//
// `net/` owns the wire and the save; this file owns the one thing the WIRE cannot do,
// because it needs the running simulation: turn a bundle into a player record that the
// host's own `sim/step.js` will fly, and take it out again when the guest goes home.
//
//   arriveGuest({ guestId, name, profile, place })   a record in `state.players`, docked
//   leaveGuest(guestId)                              that record gone, nothing else touched
//   guestRecordOf(guestId)                           the live record, or null
//   guestPlayers()                                   every visitor's record
//   isGuestRecord(P)                                 is this pilot a visitor?
//
// **This file imports nothing from `net/`.** The arrow points one way — `net/` may import
// `sim/` (it already does, for the galaxy), `sim/` never imports `net/`. So the bundle
// rules stay in `net/custody.js`, and `net/session.js` reads a live visitor back out
// through `guestRecordOf` when it has a suitcase to send.
//
// **A guest arrives DOCKED.** Flight positions never travel (the plan's words): a guest
// in a rift, mid-warp, in a wormhole pocket or 40 km out in a field arrives at the
// station it calls home in this world — its own station if the host's galaxy has that
// pocket, otherwise Meridian, which is where `custody.relocate` puts everything else
// that cannot stay where it was. Its ship is safe, its cargo is with it, and nothing is
// ever left floating in a pocket the guest cannot see.
//
// **A visitor is a pilot, not a guest account.** It gets its own `profile` object (never
// `state.profile`), its own runtime and its own controls; `sim/player.js` and
// `sim/shield.js` both refuse a non-local record that borrows the local fit, which is
// what keeps the host's ship out of the visitor's hands and the other way round.
//
// **The event bus.** `mp-guest-arrive { guestId, name, profile, place }` -> this file.
// `mp-guest-arrived { player, guestId, name, place }` <- this file, for `net/` (the host
// now has a live pilot to write back) and for a notice. `mp-guest-left { guestId, name }`
// when it goes. A visitor that is destroyed is recovered by `sim/session.js`'s `die(P, profile)`
// — same losses, fee and home-station fallback as the local pilot, docked at that station —
// which is what `player-dead` reaches for every record.

import { emit, on } from "../util/events.js";
import { state } from "../state/state.js";
import { createPlayerRecord } from "./player.js";
import { configurePlayer, launch } from "./session.js";
import { CONTROLS } from "../data/multiplayer.js";
import { stationAt } from "./places.js";
import { isPocket, DEFAULT_PLACE } from "../data/places.js";
import { neutralControls } from "../state/controls.js";

/** The visiting pilots this world is holding, by guest id. Runtime only, never saved. */
const guests = new Map();

/** Is this record a visitor rather than the pilot at the controls? */
export const isGuestRecord = P => !!P && P !== state.player && typeof P.guestId === "string" && P.guestId !== "";

/** The live record for a visitor, or null. */
export const guestRecordOf = guestId => guests.get(guestId)?.player || null;

/** Every visiting pilot's live record, local pilot never included. */
export const guestPlayers = () => [...guests.values()].map(entry => entry.player).filter(Boolean);

/** How many visitors this host currently has in the world. */
export const guestPlayerCount = () => guests.size;

/**
 * Where a visitor docks: the station its own suitcase names, if this world has that
 * pocket at all; Meridian otherwise. A guest never lands somewhere it cannot be seen.
 */
export function arrivalPlace(profile = null, requested = null) {
  const candidates = [requested, profile?.homeStation];
  for (const id of candidates) {
    if (typeof id === "string" && id && isPocket(id) && stationAt(id)) return id;
  }
  return DEFAULT_PLACE;
}

/**
 * A visitor's ship exists in this world, docked at `place`.
 *
 * Returns the record. Refuses (and says so) rather than throwing: a bad suitcase must
 * cost the guest its visit, never the host's game.
 */
export function arriveGuest({ guestId, name = "", profile = null, place = null } = {}) {
  const id = typeof guestId === "string" ? guestId.trim() : "";
  if (!id) return null;
  if (!profile || typeof profile !== "object") return null;
  // One session per guest: a second arrival replaces the first rather than growing a
  // second ship (slice 5 handles a newer connection kicking an older one properly).
  if (guests.has(id)) leaveGuest(id);

  const P = createPlayerRecord(neutralControls());
  P.kind = "ship";
  P.guestId = id;
  P.name = String(name || "").slice(0, 40);
  P.place = arrivalPlace(profile, place);
  // Docked, with the station's own launch point as its position, so a snapshot has
  // somewhere sane to be even before the guest undocks.
  const station = stationAt(P.place);
  if (station?.launch?.pos) P.pos.set(...station.launch.pos);
  P.docked = true;
  P.thr = 0;
  P.v.set(0, 0, 0);

  try {
    configurePlayer(P, profile);
  } catch (error) {
    // A record that cannot be configured is not half a ship, it is nothing (L16): do not
    // put it in the world, and tell the host in words it can act on.
    emit("mp-notice", `A visiting pilot could not be brought in: ${error?.message || "its ship did not fit"}. It is still safe in its suitcase.`);
    return null;
  }

  guests.set(id, { player: P, name: P.name });
  state.players.push(P);
  emit("mp-guest-arrived", { player: P, guestId: id, name: P.name, place: P.place });
  emit("mp-notice", `${P.name || "A pilot"} arrived at ${stationAt(P.place)?.n || P.place}.`);
  return P;
}

/**
 * The visitor goes home (or was kicked). Its record leaves the world; the suitcase is
 * `net/`'s business and is already the newest copy by the time this runs.
 */
export function leaveGuest(guestId) {
  const id = typeof guestId === "string" ? guestId.trim() : "";
  const entry = guests.get(id);
  if (!entry) return false;
  guests.delete(id);
  const at = state.players.indexOf(entry.player);
  if (at >= 0) state.players.splice(at, 1);
  // The local screen only ever follows the local pilot, but if a record that is going
  // away happened to be indexed, point the index back at a pilot that still exists.
  if (state.localPlayerIndex >= state.players.length) state.localPlayerIndex = Math.max(0, state.players.length - 1);
  emit("mp-guest-left", { guestId: id, name: entry.name });
  emit("mp-notice", `${entry.name || "A pilot"} left.`);
  return true;
}

/* ------------------------------------------------------------------------- */
/* Slice 8b: the guest's controls reach its ship                             */
/* ------------------------------------------------------------------------- */

/** Nothing asked for: the shape a record's controls go back to when its pilot goes quiet. */
function quietControls(c) {
  c.thrust = c.strafe = c.lift = c.roll = 0;
  c.stop = c.brake = c.boost = c.fire = c.sec = false;
  c.steer.x = c.steer.y = 0;
}

/** Does this asking want the ship to do something? (Anything but "nothing".) */
function asksToFly(input = {}) {
  const axis = value => Math.abs(Number(value) || 0) > 0.001;
  const steer = input.steer || {};
  return axis(input.thrust) || axis(input.strafe) || axis(input.lift) || axis(input.roll) ||
    axis(steer.x) || axis(steer.y) || input.fire === true || input.sec === true || input.boost === true;
}

/**
 * **A guest says what it is asking its ship to do, and the host writes it down** (slice 8b).
 *
 * The rule the plan set (refactor principle 7, *input is a command*): a guest sends a command, not a
 * key. `net/protocol.js` has already rebuilt the message field by field and clamped every axis, and
 * `net/session.js` has already decided *which* pilot the message belongs to — the peer it came from,
 * never a name in the message. So this writes the asking into that record's own `controls`, exactly
 * where `core/input.js` writes the local pilot's, and the host's sim decides what it means: thrust
 * ramps the throttle, `fire` needs power and a gun, and every consequence — damage, kills, loot,
 * docking, warp — stays the host's. The guest's own ship at home is untouched.
 *
 * **A docked visitor launches the first time it asks to fly.** A visitor arrives docked at its
 * station; the only hull it has is the one in this world, so an asking that is not "nothing" is the
 * same thing the local pilot's launch is, and it goes through the same `launch()` — full power, the
 * station's launch point, a snap for the far screen. A guest standing at its own station counter
 * leaning on a key therefore does not move a hull; it launches one.
 *
 * Returns false for an unknown, dead, or already-gone visitor: a message from a peer that has left is
 * not an error, it is just late.
 */
export function applyGuestControls(guestId, input) {
  const id = typeof guestId === "string" ? guestId.trim() : "";
  const entry = guests.get(id);
  if (!entry || !input) return false;
  const P = entry.player;
  if (!P || P.dead) return false;
  const c = P.controls;
  const axis = value => Math.max(-1, Math.min(1, Number(value) || 0));
  c.thrust = axis(input.thrust);
  c.strafe = axis(input.strafe);
  c.lift = axis(input.lift);
  c.roll = axis(input.roll);
  c.stop = input.stop === true;
  c.brake = input.brake === true;
  c.boost = input.boost === true;
  c.fire = input.fire === true;
  c.sec = input.sec === true;
  c.steer.x = axis(input.steer?.x);
  c.steer.y = axis(input.steer?.y);
  // **Its own aim, not the host's.** `state.aimDirection` is the local screen's camera direction;
  // `sim/weapons.js` fires a non-local record along its own `aimDirection`, so this is what makes a
  // guest's shot go where the guest is looking rather than along the host's nose.
  const aim = input.aim;
  if (aim && Number.isFinite(aim[0] + aim[1] + aim[2])) {
    const len = Math.hypot(aim[0], aim[1], aim[2]);
    if (len > 1e-6) {
      P.aimDirection = P.aimDirection || { x: 0, y: 0, z: -1 };
      P.aimDirection.x = aim[0] / len;
      P.aimDirection.y = aim[1] / len;
      P.aimDirection.z = aim[2] / len;
    }
  }
  P.inputAt = state.time;
  if (P.docked && asksToFly(input)) launch(P, P.profile);
  return true;
}

/**
 * **A silent guest does not fly on** (slice 8b). Called once per sim tick.
 *
 * A closed tab, a backgrounded window or a lost channel stops the messages, and the record would
 * otherwise keep the last asking for ever — a hull holding its throttle into a rock, or firing with
 * nobody at the trigger. After `CONTROLS.staleMs` (data) the record is asked for nothing; the flight
 * model bleeds the throttle off by itself, which is what letting go of the stick does. A docked or
 * dead record is left alone (there is nothing to stop), and one that has never been asked anything
 * is skipped, so a visitor that has not touched a key is not "stale".
 */
export function ageGuestControls() {
  for (const entry of guests.values()) {
    const P = entry?.player;
    if (!P || P.docked || P.dead || !Number.isFinite(P.inputAt)) continue;
    if ((state.time - P.inputAt) * 1000 > CONTROLS.staleMs) quietControls(P.controls);
  }
}

/** For tests: forget every visitor without emitting events. */
export function resetGuests() {
  guests.clear();
}
