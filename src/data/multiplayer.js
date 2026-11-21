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
  revStepMs: 250,
};
