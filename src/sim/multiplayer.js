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
// when it goes.

import { emit, on } from "../util/events.js";
import { state } from "../state/state.js";
import { createPlayerRecord } from "./player.js";
import { configurePlayer } from "./session.js";
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

/**
 * **A visitor's hull reached zero** (playtest 23's second report: every ship takes damage unless
 * something says otherwise).
 *
 * `hurt` already marks a non-local record `dead` at zero hull, and a dead record is not drawn (the
 * host's `render/views.js` and, through `SHIP_FIELDS.dead`, the guest's own sky agree). What was
 * missing is the *sentence*: a hull that simply vanishes is a mystery on both screens.
 *
 * Recovery is not built (a visitor has no respawn — step 16 debt, *death and recovery*), so the words
 * say exactly what is true: the ship is gone from this world for this visit, the pilot itself is safe
 * in its suitcase, and going home flies it again. Nothing here touches the visitor's copy.
 */
on("player-dead", ({ player } = {}) => {
  if (!isGuestRecord(player)) return;
  const name = player.name || guests.get(player.guestId)?.name || "";
  emit("mp-guest-destroyed", { guestId: player.guestId, name });
});

/** For tests: forget every visitor without emitting events. */
export function resetGuests() {
  guests.clear();
}
