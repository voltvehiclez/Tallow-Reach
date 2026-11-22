// Multiplayer (refactor step 16): the numbers and the lists, and nothing else.
//
// Two friends play co-op by one of them hosting their open world and the other
// joining it through a WebRTC link (step 16 in docs/REFACTOR_PLAN.md; the rules
// are in docs/architecture/multiplayer.md). This file is the one place that says
// what a pilot may carry between worlds. Change a rule here, not in code.
//
//   TRAVEL_FIELDS     the pilot-owned half of a profile: what crosses into someone
//                     else's world and comes home again (owner's list, 2026-11-21:
//                     credits, ships, loadouts, holds, hull damage, missiles,
//                     selected weapons, station lockers — the lockers are packed
//                     separately, from the world half of a save).
//   HOME_FIELDS       the half that never leaves the save that owns it: missions,
//                     story flags, statistics, campaign progress, and the two
//                     screen/home-station preferences that belong to one save.
//   ARRIVAL_STATION   where a pilot (and anything that cannot stay where it was)
//                     lands in a world that lacks its stations: Meridian Station.
//   NET               timings and limits, with the slice that reads each one.
//
// `tests/multiplayer-custody.test.mjs` checks that TRAVEL_FIELDS and HOME_FIELDS
// between them name every field of `newProfile()`, and name none twice. Adding a
// saved field to the profile therefore forces a decision — does it travel? —
// instead of silently defaulting to one answer.

import { DEFAULT_PLACE, PLACES, stationKeyAt } from "./places.js";

/**
 * The pilot-owned fields that travel. Order is not significant.
 */
export const TRAVEL_FIELDS = [
  "cr",       // credits
  "ships",    // the fleet, as hull ids (wasp, wasp#2, ...)
  "ship",     // the hull being flown
  "holds",    // per hull: { itemId: count }
  "holdSlots",// per hull: the optional slot layout of its hold
  "hp",       // per hull: hull damage, as a fraction 0..1
  "shipPlaces",// per hull: the station it is parked at (a hull parked elsewhere travels with its pilot)
  "loadout",  // per hull: the fitted modules, group -> bay array
  "msl",      // missiles carried
  "pw",       // selected primary bay, "1".."5"
  "sw",       // selected secondary bay, "1".."5"
  "lockers",  // station storage travels too; it is packed from the world half of a save
];

/**
 * The half that never leaves the save that owns it. A guest's missions, flags and
 * statistics are never run or written by a host's world, and the pilot's home
 * station and screen preferences stay with the save they were set in.
 */
export const HOME_FIELDS = [
  "v",                    // the save version of the half this profile belongs to
  "missions",             // active contracts and story missions
  "flags",                // remembered story facts
  "done",                 // contracts completed
  "kills",                // hostiles destroyed
  "campaign",             // authored campaign progress
  "homeStation",          // where this pilot recovers, set in this save
  "pocketFilterPresets",  // the seven N-panel filter presets (save v28), a screen preference
];

/**
 * The `away` marker's fields (save v29, slice 2), in the order they are written.
 * `suitcase` is the pilot as the host last wrote it — the copy "Go home" opens.
 * `token` is the guest's secret for that one host; it lives here because this is
 * the guest's own save, and a host only ever stores `hashToken(token, guestId)`.
 */
export const AWAY_FIELDS = ["worldId", "hostName", "guestId", "token", "epoch", "rev", "suitcase"];

/**
 * One record in `world.guests` (save v29, slice 2): the host's copy of a visiting
 * pilot. Deleting the entry is always safe, because the guest keeps a suitcase.
 */
export const GUEST_FIELDS = ["name", "tokenHash", "epoch", "rev", "bundle", "lastSeen"];

/** Pseudo-field name used for the lockers, which live in a save's `world`, not its profile. */
export const LOCKERS_FIELD = "lockers";

/**
 * Where a pilot arrives in a world, and where cargo goes when the station it was
 * stored at does not exist there. Meridian Station is every world's home station.
 */
export const ARRIVAL_STATION = DEFAULT_PLACE;

/**
 * The **station key** of the arrival station in a world — `placeId:featureId`, the
 * form `world.stationStores` and a locker stack are keyed by. Read from the authored
 * catalog rather than typed in: change the pocket or the station feature in
 * `data/places.js` and every part of custody follows (LESSONS L14: one fact, one place).
 */
export const ARRIVAL_STATION_KEY =
  (Object.values(PLACES).find(place => place.kind === "pocket" && place.id === DEFAULT_PLACE) &&
    stationKeyAt(DEFAULT_PLACE)) ||
  `${DEFAULT_PLACE}:meridian`;

/**
 * The connection and the suitcase. Numbers only: no behaviour lives here, so
 * retuning co-op is an edit to this table.
 *
 *   snapshotSec   (slice 4) how long after a change the host sends a guest its new suitcase
 *   heartbeatSec  (slice 3) how often the two sides say "still here"
 *   lastSeenSec   (slice 5) a guest unheard for this long is shown as disconnected
 *   offerSec      (slice 3) how long a join code stays valid before it must be re-made
 *   maxGuests     (slice 4) most visiting pilots one host holds at once
 *   nameMax       (slice 3) longest display name a player may set
 *   chatLineMax   (slice 3) longest chat message the host will pass on
 *   tokenBytes    (slice 1) size of the secret that names one guest to one host
 *   revStepMs     (slice 4) floor between two `rev` raises, so a busy second is one snapshot
 *   keepPrevious  (slice 2) how many older versions of a save to keep under `:prev`
 */
export const NET = {
  snapshotSec: 2,
  heartbeatSec: 5,
  lastSeenSec: 20,
  offerSec: 120,
  maxGuests: 4,
  nameMax: 24,
  chatLineMax: 240,
  tokenBytes: 24,
  // How often a guest repeats its hello until a welcome comes back. The data channel can open
  // seconds after the room says the peer is there (two machines, one strict network), and a
  // hello sent into a channel that is not open yet is simply gone.
  helloRetrySec: 2,
  // After this long with no welcome, say so instead of sitting there looking joined.
  helloWaitSec: 12,
  revStepMs: 250,
  keepPrevious: 1,
};

/**
 * The browser storage keys multiplayer owns (slice 2). Keys and the `tr1`/`tr_s1`
 * family in `state/storage.js` must never change, or a save is lost.
 *
 *   awayKey(worldId)   the suitcase on its own, under `away:<worldId>`, so two
 *                      browser tabs visiting two different worlds cannot overwrite
 *                      each other's copy of their pilot.
 *   PREVIOUS_SUFFIX    the previous version of any key, kept for one generation
 *                      (`tr1:prev`): a save is written to a temporary key and then
 *                      swapped in, so a crash mid-write leaves the old save intact.
 *   TEMP_SUFFIX        the scratch key a write goes through on its way in.
 */
export const KEY = {
  awayKey: worldId => `away:${String(worldId || "").trim()}`,
  PREVIOUS_SUFFIX: ":prev",
  TEMP_SUFFIX: ":tmp",
};

/**
 * The app id the signalling broker knows this game by (Trystero joins a room name
 * derived from it). Changing it cuts every existing connection and every link
 * already sent, so treat it as permanent: it is the closest thing this game has to
 * a fixed address with a broker we do not run.
 */
export const ROOM_NAMESPACE = "tallowreach.p2p";

/**
 * Where the connection lives. `transport.js` is the only file that may import the
 * network library (the owner's one-dependency allowance, 2026-11-21), and it joins
 * this many relays. `relayUrls` empty means "Trystero's own default list": the free
 * public relays, which are who makes a one-link join work with no server of ours.
 * If the defaults die, put two or three working `wss://` relays here and nothing
 * else in the game changes.
 */
export const RELAYS = {
  // Signalling relays. Empty = the library's free public ones.
  relayUrls: [],
  // An optional `RTCConfiguration` for the direct connection (a TURN server, when two
  // machines on different networks cannot reach each other directly: both behind symmetric
  // NAT, or a network that blocks WebRTC). Shape:
  //   rtcConfig: { iceServers: [{ urls: "turn:host:3478", username: "...", credential: "..." }] }
  // Nothing here is a credential for this game — it is the player's own TURN service.
  rtcConfig: null,
};

/**
 * Chat (slice 3). Short lines, recent history only: chat is for "over here" and
 * "dock with me", not for a conversation log, and nothing of it is ever saved.
 *
 *   recentLines   how many lines the panel keeps on screen
 *   lineLifeSec   how long a line stays after it was said (0 = it never fades)
 *   typingRateSec heartbeat while somebody is typing, so "… is typing" can lapse
 *   historyLines  how many lines the box can be scrolled back through, including the ones
 *                 only this screen ever saw (a host alone can still read what it typed)
 */
export const CHAT = {
  recentLines: 8,
  lineLifeSec: 45,
  typingRateSec: 4,
  historyLines: 40,
};
