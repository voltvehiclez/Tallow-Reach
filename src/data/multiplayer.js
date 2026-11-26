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
// `left` (playtest 14): the pilot has gone home, so this record is holding its suitcase
// rather than an identity — the next hello may re-admit it on a fresh link.
export const GUEST_FIELDS = ["name", "tokenHash", "epoch", "rev", "bundle", "lastSeen", "left"];

/** Pseudo-field name used for the lockers, which live in a save's `world`, not its profile. */
export const LOCKERS_FIELD = "lockers";

/**
 * **What travels about another pilot's ship** (slice 8a): the fields one entry of a `ships`
 * message carries, and nothing else. The plan's list — name, place, position, rotation,
 * velocity, throttle, docked, dead, hull fraction — plus the two a reader cannot work without:
 *
 *   id        which pilot this is (the guest's `guestId`; `HOST_PILOT_ID` for the host)
 *   ship      the hull id, so the reader builds the right hull. It is not on the plan's list
 *             because the plan assumed a reader that already knows the hull; a guest's screen
 *             does not — it knows nothing about the friend's fleet.
 *   shield    shield as a fraction 0..1, the same kind of number as `hull`. Also not on the
 *             plan's list, and added for one plain reason: the owner's playtest of 2026-11-25
 *             (playtest 23) said a friend's hull "must show hull/shield stats like any other
 *             ship", and a bar that is always 0% because the number never travelled is not a
 *             stat, it is a decoration. It is still only a picture: a fraction, never HP, never
 *             a fit, and nothing a rule reads.
 *
 * Everything here is a *picture*: a remote ship is a view, never sim state. Nothing in this
 * list can write to the guest's world, and a snapshot never carries a fit, a hold, credits,
 * hull damage taken, or anything a rule would read. `tests/multiplayer-slice8a.test.mjs` pins
 * the list against what the wire actually carries.
 */
export const SHIP_FIELDS = [
  "id",        // which pilot (a guestId, or HOST_PILOT_ID)
  "name",      // the name the host lists it under
  "ship",      // the hull id, so the far screen draws the right hull
  "place",     // the pocket it is in; a screen only draws pilots in the pocket it shows
  "pos",       // [x, y, z] metres
  "quat",      // [x, y, z, w]
  "velocity",  // [x, y, z] metres/second
  "throttle",  // -1..1, for the engine glow
  "docked",    // drawn parked at its station rather than in flight
  "dead",      // its hull is gone: not drawn at all
  "hull",      // hull as a fraction 0..1, for a reader that wants to show it
  "shield",    // shield as a fraction 0..1, for the second bar (playtest 23)
];

/**
 * The pilot id the host's own ship carries on the wire. A guest's id is its `guestId`; the host
 * has none (it never joins anybody's world), and a reader needs to tell the two apart.
 */
export const HOST_PILOT_ID = "host";

/**
 * The ship snapshot stream (slice 8a) — how often the host says where every pilot is, and how
 * long the far screen takes to draw it.
 *
 *   hz        snapshots per second, host to guest. **20–30 Hz is the owner's band** (2026-11-24);
 *             24 sits inside it with a tidy 41.7 ms gap. This is NOT `NET.snapshotSec` — that
 *             two-second value is the *profile* sync (the suitcase), which stays where it is.
 *   delayMs   the far screen draws the world this far in the past and interpolates between the
 *             two snapshots that straddle that moment (`render/shipstream.js`), so a lost or
 *             late packet shows as a slightly older pose, never a jump. One snapshot and a bit.
 *   samples   how many snapshots are kept per pilot: enough to straddle `delayMs` with room for
 *             jitter, and a hard cap so a long silence cannot grow a buffer.
 *   staleMs   a pilot unheard for this long is dropped from the screen (a guest that left, or a
 *             host that stopped sending). Longer than `delayMs` plus a few packets.
 *   snapM     a jump longer than this between two snapshots is a teleport (a launch, a warp, a
 *             respawn) and is drawn as a jump, not smeared across the screen.
 */
export const SHIP_STREAM = {
  hz: 24,
  delayMs: 100,
  samples: 6,
  staleMs: 1500,
  snapM: 50,
};

/**
 * What a guest asks its ship to do (slice 8b) — the fields of a `controls` message, and the two
 * timings that keep the other side honest.
 *
 * The fields are the **control record** `state/controls.js` already defines, one for one: the sim
 * reads `P.controls` and knows nothing about keys, so a guest's asking can be written into its
 * record with the same shape the local pilot's has. `aim` is the one field the record does not have
 * — each pilot aims with its own camera (`state.aimDirection` is the local one), so a guest's
 * looking direction travels beside its stick and lands in its record as `aimDirection`.
 *
 *   hz        messages a second, guest to host. Faster than `SHIP_STREAM.hz` (24) on purpose: a
 *             snapshot must never be the thing a control waits behind, and 30 Hz is one message per
 *             render frame on a 60 Hz screen every other frame.
 *   staleMs   silence this long and the guest's ship is asked for **nothing** — a closed tab, a
 *             backgrounded window or a lost channel must not leave a hull flying on forever. Set
 *             well above one message (33 ms) and above a frame hitch, well under `NET.lastSeenSec`.
 */
export const CONTROLS = {
  hz: 30,
  staleMs: 400,
};

/** The fields one `controls` message carries, in the order `state/controls.js` documents them. */
export const CONTROL_FIELDS = [
  "steer",     // { x, y } -1..1
  "roll",      // -1..1
  "thrust",    // -1..1
  "strafe",    // -1..1
  "lift",      // -1..1
  "stop",      // held
  "brake",     // held
  "boost",     // held
  "fire",      // held
  "sec",       // held
  "aim",       // [x, y, z], the guest's own looking direction
];

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
 *   snapshotSec   (slice 4) how long after a change the host sends a guest its new suitcase;
 *                 slice 5 also runs the host's "has the visiting pilot changed?" check this often
 *   heartbeatSec  (slice 3) how often the two sides say "still here" (slice 5 sends the ping)
 *   lastSeenSec   (slice 5) a guest unheard for this long is shown as disconnected
 *   offerSec      (slice 3) how long a join code stays valid before it must be re-made
 *   maxGuests     (slice 4) a valve on a live hosted room, **not a player cap**: a world has no
 *                 player limit, and the practical limit is the host's machine and connection
 *                 (owner, playtest 22: *"i want unlimited players"*). Far past what one machine
 *                 carries, so it only stops a runaway room
 *   nameMax       (slice 3) longest display name a player may set
 *   chatLineMax   (slice 3) longest chat message the host will pass on
 *   tokenBytes    (slice 1) size of the secret that names one guest to one host
 *   revStepMs     (slice 4) floor between two `rev` raises, so a busy second is one snapshot
 *   keepPrevious  (slice 2) how many older versions of a save to keep under `:prev`
 *
 * **Not here: how often ships move.** Slice 8a's ship snapshots run at `SHIP_STREAM.hz` (24 Hz),
 * which is a different fact from `snapshotSec` (the 2 s suitcase sync) and lives in its own block
 * below so the two can never be confused for one another.
 */
/**
 * Which build this page is. Two machines that show different strings are not running the same
 * file, which is worth knowing before anything else is blamed. Bump it when a build is handed
 * over (it is shown in the multiplayer screen's connection details).
 */
export const BUILD = "2026-11-25g";

export const NET = {
  snapshotSec: 2,
  heartbeatSec: 5,
  lastSeenSec: 20,
  offerSec: 120,
  maxGuests: 100,
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
  // Slice 4: the biggest suitcase the wire will carry, in characters of JSON. A pilot's
  // travelled half is a few KB (a hold of stacks, a fleet, its fits); this cap is a
  // backstop so a corrupt or hostile bundle cannot be pushed through a data channel,
  // and so a refusal is a sentence instead of a dropped packet. Raised only with a
  // measured reason.
  suitcaseMaxBytes: 262144,
  // How often the host re-sends a guest its suitcase even when nothing changed, so a
  // copy lost on a flaky channel is healed without a reconnect. The plan's two seconds.
  suitcaseRepeatSec: 30,
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
  // Signalling relays: the servers that introduce two browsers to each other.
  //
  // **Pinned on purpose (playtest 5).** Left empty, the library shuffles its own list of 30
  // public relays — seeded by the app id, so every player gets the same *five* — and this game's
  // five included several obscure ones (chaima.info, circum.space, dwadziesciajeden.pl). Two
  // machines then sat in rooms with one browser each and never met: the introduction had nowhere
  // to happen. These are the long-running public relays; the first `redundancy` (5) are used.
  // If a player's network blocks all of them, the copy/paste code path needs no relay at all.
  relayUrls: [
    // Popular public relays.
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://relay.primal.net",
    "wss://nostr.mom",
    "wss://nostr-pub.wellorder.net",
    // Then the library's own curated relays. Opening a socket is not enough: a relay that
    // refuses these events (`blocked:`, `restricted:`, `auth-required:`) is retired by the
    // library and stops being a way for two players to meet, so the list keeps more than one
    // family of servers. Ten is a lot of sockets, but a silent room is worse.
    "wss://bucket.coracle.social",
    "wss://fanfares.nostr1.com",
    "wss://nostr-01.yakihonne.com",
    "wss://nostr.azzamo.net",
  ],
  // An optional `RTCConfiguration` for the direct connection, if a player has their own ICE
  // servers. Shape:
  //   rtcConfig: { iceServers: [{ urls: "stun:host:3478" }, { urls: "turn:host:3478",
  //   username: "...", credential: "..." }] }
  // Unset, the library's public STUN is used.
  rtcConfig: null,
};

/**
 * The relay used when two machines cannot reach each other directly.
 *
 * Two browsers on one machine always connect (they share a process). Two *machines* need a
 * path across the network, and the common home setup has none: the router will not send a
 * packet back to itself (no hairpin NAT), so the local-network candidates Chrome hides behind
 * `*.local` mDNS names are the only ones left — and a firewall or a router that blocks
 * multicast throws those away. That is the shape of the owner's playtest-4 report: joins on
 * the host's own PC, "you are the only one there" from the laptop.
 *
 * TURN relays the data through a server both sides can reach. It is slower, so it is only
 * used after a direct attempt has failed (`ICE.escalateSec`); if the relay below is ever
 * unavailable, nothing breaks — the direct path is still tried first, and two machines on
 * one wifi never needed it.
 *
 * The relay is the owner's free-tier account, whose login is therefore in this file, which is
 * public. That is deliberate: a login the player has to obtain is a login they will not
 * obtain. Nothing else here is a secret — a TURN server forwards encrypted packets it cannot
 * read, and it holds no game state. A player who brings their own server overrides it.
 */
export const ICE = {
  /**
   * How long a code waits for every network path before it is sent.
   *
   * The slow candidates are the relay ones: they come from a server, and on a mobile network
   * they arrive over TCP/TLS because UDP is often blocked. Cutting gathering off early
   * (it was 4 s) is how a code ended up carrying only local paths — so a laptop on 4G could
   * not reach a PC at home, while the same laptop on the same wifi could (owner, playtest 8).
   */
  gatherMs: 8000,
  /** Public STUN: only answers "what is my address". Free, no account, carries nothing. */
  stun: [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
  ],
  /**
   * The relay server this game brings with it — the owner's own ExpressTURN free-tier account,
   * measured working on 2026-11-22 (a laptop on 4G joined a link hosted by a PC at home; nothing
   * else had ever succeeded, because the three public relays listed here before were all dead
   * from the owner's machine: *"0 of 3 relay servers answered"*, playtest 11).
   *
   * **Why it is in the game file and not a setting.** A relay is the difference between "co-op
   * works" and "co-op only works on one wifi", and every player who was asked to find, sign up
   * for and type one would not. So a link now crosses networks on a fresh install with nothing
   * typed. A player's own server (`tr_mp.relay`, three boxes on the Multiplayer screen) is used
   * **first** — this one is the fallback, not the rule.
   *
   * **Two doors, and both are on the free plan**: 3478 over UDP (fastest, and what a phone usually
   * blocks) and 3478 over TCP (what got the owner's 4G laptop through). ExpressTURN's free plan is
   * exactly those two — a TLS door on 5349 exists on their paid plans only, so it is *not* listed
   * here: a door that cannot answer is worse than a shorter list. Add `turns:free.expressturn.com:5349`
   * to `urls` above if that ever changes. Each entry needs both strings: a TURN server with no login
   * answers `401` and looks like a network fault.
   *
   * **If these stop working** (a free tier has a monthly data cap, and the owner has regenerated
   * this login before): the fix is one entry here — the spaces below are the only thing to
   * change, in this file, nowhere else. `npm test` then `npm run build`.
   */
  turn: [
    {
      name: "ExpressTURN (free tier)",
      urls: [
        "turn:free.expressturn.com:3478",
        "turn:free.expressturn.com:3478?transport=tcp",
      ],
      username: "000000002110719494",
      credential: "33RDBDUZ38C6ScnNLjwkG1PermM=",
    },
  ],
  /**
   * What the screens call `turn[0]` when no server of the player's own is saved. Screens quote
   * this instead of inventing a name, so the words and the list cannot drift apart.
   */
  turnName: "ExpressTURN (free tier, built into the game)",
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
  // How many rows the players column draws before it stops and counts the rest: there is no
  // player cap any more (playtest 22), so a busy world can hold more pilots than a 60-pixel
  // column can name.
  whoRows: 10,
  // How long the box stays up by itself after somebody says something (owner, playtest 20:
  // *"Chat when a message is said then the chat is visible. However it doesnt go away. Should
  // go away after maybe 6-7 seconds unless the user has pinned the chat."* — raised to 12 on
  // playtest 21: *"When chat is viewed for a short time 7 sec right now. Increase time open to
  // 12 seconds."*). A line you have not read yet is why the box appears at all; the pin is the
  // switch that keeps it up.
  autoHideSec: 12,
};
