# Multiplayer: host-run co-op (step 16)

*Last checked: 2026-11-25 (slices 1–5 and 7 playtest-confirmed, **8a built to `2026-11-25b`** including playtest 23's two fixes, 8b next, 6 last; step 17 planned).* The plan and its eight slices are step 16 of
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md); this file is how the code works as it is built.

## The idea

One **host** runs their own open world and **guests** join it through a WebRTC link — one to start, and no
cap now that a guest is its own browser (playtest 22). The host's browser is the only writer of the
truth: a guest sends what it asks its ship to do, and draws what the host sends back.

**Open world only.** The campaign stays single player (owner, 2026-11-21): its fixed ships and scripted
beats mean nothing in somebody else's galaxy.

## Step 17: dedicated servers (planned 2026-11-22, not built)

A headless build of this project hosting one world, star topology, `host:port` the way
Minecraft works. The design (four slices, the open dependency question) is step 17 of
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md); the summary that used to be here is archived
word for word in [archive/MULTIPLAYER_STEP17_NOTE.md](../archive/MULTIPLAYER_STEP17_NOTE.md).

**Guard rails against accidents, not cheating** (vision pillar 5; [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)).

## A pilot lives in exactly one world

The pilot's copy lives in exactly one place at a time, and its travels are the **suitcase**:

```
home save ──checkOut──▶ bundle ──▶ host's world.guests[guestId] ──▶ the guest flies here
     ▲                     (the suitcase the guest also keeps)              │
     └──────checkIn──────── bundle ◀── the host writes `rev` and sends ─────┘
```

- `save.away = { worldId, hostName, guestId, token, epoch, rev, suitcase }` while the pilot is away
  (v29, built). The **home pilot is frozen**: it cannot be flown at home.
- Each pilot has a random `guestId`; each host world has a random `worldId` (`world.worldId`,
  minted the first time the world is hosted and kept from then on, because a join code names it).
- **A guest's identity is its own browser's, not the link's** (playtest 22, L47). `tr_mp.pilotToken` in
  the browser's settings is made once (`makeToken`), never shown, never in a save, and sent as the
  guest's secret on both doors (`joinWorld` from a link, `acceptCode` from a paste code); `guestId` is
  derived from it. The link's `#token` is an **invitation** — one per world — so two friends sharing
  one link are two pilots. Before this, both arrived as the same pilot and the takeover below retired
  the first, which then could not rejoin. **No player cap:** `NET.maxGuests` (100) is a valve against a
  runaway room, and the real limit is the host's machine and connection (owner: *"unlimited players"*).
- **Higher `(epoch, rev)` wins; copies are never merged.** A guest's "Go home" raises `epoch`; the host
  raises `rev` on every change. `compare(a, b)` decides, and the choice screen shows both
  `summary()` lines so the player picks.

## What travels (`src/data/multiplayer.js`)

| Travels | Stays home |
| --- | --- |
| credits, the fleet and each hull's fit, hold, slot layout, remembered damage and station; missiles; the selected weapon bays | missions, story flags, contracts completed, kills, campaign progress |
| **station lockers** (`world.stationStores`), each stack remembering the station it came from | the hosted world itself: station levels, built stations, the contract board, the galaxy, world changes |

**Items are moved, never copied.** `checkOut` empties the stations it packs; a stock that cannot
legally sit at the destination is written into the bundle instead of the host's world. Home missions,
flags and stats are copied back from the home save *after* the merged half is sanitized, so nothing
can leak into them.

**Nothing is deleted for lack of room.** `relocate` sends a stack whose station a world lacks to
Meridian Station and keeps its `origin`, so it goes back the moment that station exists again. An
over-full station is flagged (`world.storageOverfull[key]`, `net/station-inventory.js`) and only
refuses *new* deposits. Hulls are treated the same way: a hull parked at a station this world lacks
moves to Meridian, and `bundle.shipsAt` remembers where it was.

**Unknown content is kept.** A newer build's item, module or hull id is carried untouched — unknown
stacks in the bundle's lockers, and single unknown ids re-inserted after the save sanitizer has run
(it would otherwise drop them). Custody asserts every stack that left comes back once.

## Where the save keeps it (slice 2, save v29)

| In the save | What |
| --- | --- |
| `save.away` (beside `profile` and `world`) | the marker: which world, which host, the secret token, `(epoch, rev)` and the suitcase |
| `world.worldId` | this world's id, `null` until it is first hosted |
| `world.guests[guestId]` | `{ name, tokenHash, epoch, rev, bundle, lastSeen }` — the host's copy of a visitor |
| browser key `away:<worldId>` | the suitcase on its own, so two tabs cannot overwrite each other |

**The marker is not inside the profile.** Where a pilot *is* is a fact about the pilot and the save,
not the character (nothing in `profile.js`'s field lists), so it sits beside the two halves and
`checkIn` clears it. `state.away` mirrors it at runtime, `currentSave()` writes it and
`installNestedSave` reads it, so a save made while visiting still says so after a reload.

**Every older save loads at home.** v28-and-older saves have no marker, no `worldId` and no
guests, and `sanitizeSave` gives them `away: null` / `worldId: null` / `guests: {}`. That is the whole
migration — nothing converted, nothing guessed.

**A suitcase is not sanitized like a profile.** `cleanSuitcase` checks the shape and drops wrong types
but never second-guesses a content id: while a pilot is away the suitcase is the only copy of its cargo.
A damaged suitcase is dropped and the marker stays — the host still has the pilot, so it can come home.

**A host's record never carries the guest's secret.** Only `hashToken(token, guestId)` is stored
(`custody.guestRecord` strips the token from the bundle it saves), so a host's save is not a way to
take somebody's pilot. Deleting a record is always safe: the guest's suitcase has a copy.

**Writes are swapped in.** `state/storage.js` writes `key:tmp`, swaps it in, then keeps what was there
under `key:prev` (one generation, `NET.keepPrevious`). A browser stopped mid-write leaves the old save
or the new one, never half of either; `loadAutosave` falls back to `:prev` if the live record will not
parse. Slots keep no history. Storage keys and `TR1:` did not change.

## Stations are world-scoped facts (LESSONS L19, generalised)

Generated pocket ids are **not unique across galaxy seeds**: `sys-002-hub` is an unrelated pocket in
another galaxy, and a station key built from it names a station that is not there. So a station key is
resolved with the world it belongs to: `net/world-places.js` indexes a world from its own seed
(`generateGalaxy(seed)`, pure) plus its saved wormhole pockets, and `custody.js` asks that index.
Building an index never touches `data/places.js`'s live catalog, so inspecting somebody else's world
cannot move the ground under the running game.

## The connection (slice 3)

**The owner's design:** the guest joins by pasting **one link**. **Join Multiplayer World** (title) and
Pause > **Open Multiplayer** open the same screen: the host's link to copy, the guest's paste box to take
it.

**One screen, one door each** (owner's rule, playtest 2): `#mp-screen` opened from the **title menu**
shows the join block, from the **pause card** the host block — `openMultiplayer({ from })` sets
`screenModel().surface`, and `act()` refuses the other door's job a second time. A guest mid-flight
still gets its answer code and Leave on the pause card, the only screen it can reach; quitting to the
title closes the room, because hosting is something you do while flying your own world.

**One screen, three blocks** — *your name*, *host your world* (switch → link + Copy → the paste
codes) and *join a friend's world* (one box for a link **or** a `TRJOIN:` code). It is one surface on
purpose: the first playtest had the join box rendered only for
a session that was already a guest, so the only entrance was behind itself; and its two front doors
must not drift apart. The screen is a modal surface (`state.ui.multiplayer`) with the card scrolling,
so a short window can never hide the link. **No username, no switch** — the switch is disabled, and
the action refuses too.

A browser cannot accept a connection on its own, so two browsers have to be introduced by something.
The owner's rules allow exactly one small networking library for this, behind `src/net/transport.js`;
nothing else in the game may name it. **The owner chose Trystero** (`trystero@0.27.0`, MIT, Nostr
build) on 2026-11-21 — the numbers it was chosen on are in [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)
("The library decision"). It is imported by `transport.js` and by nothing else, and the paste-code
path is built beside it for when a free relay is slow or down.

The shape the wrapper is written to, whichever library answers:

- **With a broker** (Trystero is the recommendation): the link is `?join=<worldId>#<token>`. The
  secret is after the `#`, which browsers never send to a server and never write to a log. Both
  browsers join a room named from the world id, the broker introduces them, and the game's traffic
  is peer-to-peer and encrypted by WebRTC itself.
- **Without one** (the fallback, and also buildable with no library at all): the host makes an
  **offer code**, the guest pastes it and gets an **answer code**, the guest sends that back and the
  host pastes it. One paste more, and the path that has to work when the broker does not.

Either way the handshake afterwards is the same, and it is already written and tested
(`net/custody.js` `handshake`): game version, `worldId` and the guest's secret, each refusal with a
sentence the guest can act on. A guest turned away learns why.

**Two machines need a path; one machine never does.** The signalling relay introduces the two
browsers and both sides then believe they are connected — but the *data* connection needs a network
path, and a home network often has none: no hairpin NAT, and the local addresses Chrome hides behind
`*.local` mDNS names get dropped by a firewall or a multicast-hostile router. Two tabs on one machine
share a process, so the failure is invisible there (LESSONS L35). The answer is `ICE.turn`
(`data/multiplayer.js` — the game's own **ExpressTURN free-tier** account since 2026-11-22, after the
three public relays it used to list were measured dead from the owner's PC) handed to the library as
`turnConfig`, used
**only after** `NET.helloWaitSec` of a direct attempt with a browser in the room and no hello
admitted — and **by both ends**, because a relayed path needs a relay candidate from each side: the
guest escalates from its hello timer, the host from its own ("a browser is here, nobody was
welcomed"). `transport.restart({ useTurn })` is a fresh join; the screen's **Reconnect** asks for the
same thing. A room that dies on its own (a backgrounded tab, a slept laptop, a dropped relay) stays
`lost` for ever, so `session.startKeepalive()` reopens it at most once every ten seconds.

**A code is a list of paths, and only some of them cross a network.** The codes proved that two
machines can connect without any broker — and then failed the moment one of them was on **4G**
(playtest 8). Nothing was wrong with the exchange: a laptop on a carrier network and a PC at home
sit behind different NATs with no address they both reach, so the only path that works is a
**relay (TURN) candidate**, and a code only gets one if gathering is still running when the server
answers. Hence `ICE.gatherMs` (8 s, not 4) and one TURN server in `ICE.turn` with **two doors** — 3478 over
UDP and 3478 over TCP — because a phone that blocks UDP can still open the TCP one. (ExpressTURN's
free plan is those two; the TLS door is a paid plan's, and listing a door that cannot answer is worse
than a shorter list.)
Measured: the owner's laptop on 4G joined a hosted link with no codes at all (2026-11-22), the first
time anything but same-wifi worked. `paste.js` counts the candidates by
kind (`paths()`, `hasRelayPath()`) and the screen says which kind of code the player is holding —
`relay: 0` means "same network only", before it is sent rather than after it fails.

**Diagnose by facts, not by mood.** `diagFacts()`/`diagReport()` (**Connection details**, copyable with
one button) print the **build string**, the **world id**, the signalling state and its sentence, **how
many browsers are in the room**, the direct link's state, relay on/off and **messages sent versus
received**. That order separates the three failures that all look like "you are the only one there":
wrong rooms (differing world ids), a right room with no path (2 browsers, sent rising, received 0), and
different builds. The first four playtests of this slice were diagnosed by guessing.

**The relays, in three facts that cost playtests 5, 6 and 8 to learn:** a relay can accept
a socket and refuse the game's events, so the count that matters is the library's own
`Relays connected: N`, never "reachable"; the relay list is **pinned** in
`RELAYS.relayUrls` because the library's shuffled five included dead servers; and a
copy/paste code works with no relay at all. The full account is archived word for word in
[archive/MULTIPLAYER_RELAY_NOTES.md](../archive/MULTIPLAYER_RELAY_NOTES.md).

**The hello is repeated until it is answered.** A hello "sent" is not a hello heard: the channel
opens seconds after the room says the peer is there, and a message into an unopened channel is gone
without an error. So a guest repeats its hello every `NET.helloRetrySec` until a `welcome` arrives —
the reply is the latch — clearing its per-peer latch each round. The host logs "joined" once per
guest however many hellos arrive. After `NET.helloWaitSec` with no answer the guest is told, with a
different sentence for "nobody is in the room" than for "nothing gets through".

**Names are labels; a duplicate gets a star.** Identity is the browser's own (see above); a name is
what other people read. `uniqueName(wanted, taken)` hands the joining guest the first free variant —
`Acey`, `Acey*`, `Acey**` — counted against the host's name and every guest but its own row (a rejoin
grows no second star). The host stores it and sends it back in `welcome.youName`; the guest adopts it
and chats under it, trimmed to fit `NET.nameMax`.

**The hello is per peer and retried.** `join()` returns when the room opens, before the other pilot is
introduced, so the first hello has nobody to go to. It used to latch "greeted" anyway: the host never
admitted the guest nor listed it, while chat (one broadcast per line) worked — *connected*, empty
list. `sayHello(peerId)` latches only on a send that left, and is re-sent on `onPeer` and when the
paste wire's channel opens.

**A code names the world.** `TRJOIN:` codes carry the host's `worldId` (`CODE_VERSION` 2; version 1 is
still read): a guest joining by code has no link to carry it, and without it the host's own handshake
would refuse the guest it just invited. `session.codesAcceptFrom(offer)` builds the guest session
from the code, so the fallback works when the link is exactly what did not work.

Chat (**Enter**) and the player list arrive in the same slice, so the pipe is proved before anything
of the player's crosses it. A hosted world **never pauses**, and the pause card
carries **Open Multiplayer** (on/off, the join link, the paste box) instead of a pause.

**What slice 3 built (2026-11-21)** is archived word for word in
[archive/MULTIPLAYER_SLICE3_NOTES.md](../archive/MULTIPLAYER_SLICE3_NOTES.md); the live
file-by-file list is `src/net/README.md`.

Three decisions worth keeping:

- **The secret after the `#`.** A fragment is never sent to a server and never appears in a referrer,
  so a host's token cannot be logged by whoever hosts the page, and the query needs no double
  escaping. `?join=` stays in the query because it has to reach the game.
- **A first hello is admitted by the link; a returning guest must prove the token.** Slice 3 has no
  join flow yet, so `session.js` has `firstHelloCheck` (build, world, a real name) for a first
  contact, and falls through to `custody.handshake` — token included — the moment a record exists.
  That branch is in **one** place, with the comment, so slice 4 does not have to guess.
- **A hosted world never pauses — and neither does a visited one.** `sim/step.js` reads
  `state.multiplayer`, which `ui/pause.js` sets to `isOn()` (a plain "is a session running"), not to
  "and the card is shut": the old `!v && isOn()` stopped the world at the one moment the flag was
  there for (owner's playtest 2). The card still releases every held control key on the way in, so
  the ship cannot fly itself behind it while the world keeps stepping.
- **The screen is drawn from a model, and its refusals from a sentence.** `screenModel()` turns the
  session snapshot and the screen's own view state into everything the player sees; `act(name)` does
  what a button does and returns whether it worked. Both are callable with no DOM, which is how
  `tests/multiplayer-ui.test.mjs` drives the real buttons. The switch is drawn from the **session**
  (`hosting`), never from the stored setting: a switch that says On for a world that is not open is a
  lie (LESSONS L32), so a failed host snaps it back to Off with the reason in `#mp-msg` — an element
  that is always in the card. The offer code lives in the screen's model, so a redraw cannot delete
  the code the player was told to send.

**What the connection still does not do:** it moves no pilot (8b), and it decides no ship's
position (the host's sim does). What slice 8a added is a *picture* — a guest's hull on the host's
screen, the host's hull on the guest's — and every number in it is drawn, never simulated.

## Slices

1. **Custody** — `net/custody.js`, `net/station-inventory.js`, `net/world-places.js`,
   `data/multiplayer.js`, `tests/multiplayer-custody.test.mjs`. No networking. **Built 2026-11-21.**
2. **Save v29** — `save.away`, `world.guests`, the migration (old saves load with `away: null`),
   `guestId`/`worldId`, the temp-key-then-swap write that keeps the previous version, and the
   `away:<worldId>` storage key. **Built 2026-11-21.**
3. **The connection** — `net/transport.js` (Trystero for the one-link join, paste codes as the
   fallback), Pause > Open Multiplayer, chat and the player list. **Built 2026-11-21.**
4. **Join** — "Bring my pilot" (`checkOut`/`relocate` through the handshake slice 3 already
   answers), two-second *profile* snapshots, reconnects by `compare`, "Go home" from the suitcase with the
   host offline. **Built 2026-11-23a, playtest-confirmed 2026-11-24** (rounds 14–19 fixed on top).
5. **Crashes and reconnects** — a lost host puts the player back on the main menu with **"Lost
   connection to host"**, the host's copy kept current, `compare` deciding between copies, rejoining
   keeps the copy the server has, a final copy on tab close, one session per `guestId`; and the
   away card on every Open World press, so a visiting pilot's own world really is paused.
   **Built 2026-11-24a, reworked 2026-11-24b** — see the next section.
6. **Trading** — a **Trade** station tab lists the pilots docked here; another's **Trade** opens
   two inventory-style halves on both screens (items, ships, credits), two confirms, and the host
   swaps at once only if station storage and hangar have room. **Built last** (order 7 → 8 → 6).
   Design: [trading.md](trading.md).

## Slices 7 and 8: the second pilot, then the second screen (7 built; 8a built)

The owner asked for **"one world, two ships visible"** on 2026-11-22. The plan's own model says what
that costs — the host's browser is the authority, and a guest's screen draws what the host sends back —
plus the two debts [../TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) still lists (*death and
recovery*, *player presentation and input*). Two slices, because neither half can be tested alone:

- **Slice 7 — the pilot is on the map (built 2026-11-24, playtest-confirmed 2026-11-24, `2026-11-24h`).** Slice 4 had already made
  the visitor a record in `state.players`, docked at its own station; what was left was visibility:
  `ui/starmap.js` `pilotBlips` reads `state.players` and draws the visitor's name under its **system**
  on the galaxy chart and under its **pocket** on the system map, and `pilotPanelMarkup` names every
  visitor with its system at the **top** of the side panel (it may have arrived elsewhere).
  `render/views.js` still draws one hull (8).
- **Slice 8 — one world on two screens.** Snapshots out (`SHIP_FIELDS`, **8a built**), controls in
  (`state.localInput`, a numbered input-rule change — see [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)),
  and the guest's screen following the **host's** pocket. 8a draws the second hull; only after 8c
  are two ships drawn in one sky on both screens. The guest predicts its own ship, and remotes are
  interpolated: [client-prediction.md](client-prediction.md).

## Slice 8a: ship snapshots (built 2026-11-25, re-sent as `2026-11-25b` with playtest 23's fixes)

**The host says where every pilot is; a guest draws it and simulates nothing.** Five pieces, and
every number below is in `src/data/multiplayer.js`:

- **`SHIP_FIELDS`** — the whole of what travels about one pilot: id, name, ship, place, position,
  rotation, velocity, throttle, docked, dead, hull as a fraction, and — since playtest 23 —
  **shield as a fraction**. `id` and `ship` are the two the plan's list did not name and a reader
  cannot do without: which pilot, and which hull to build. `shield` joined them for one plain
  reason: the owner asked a friend's lock to show *"hull/shield stats like any other ship"*, and a
  bar that is always 0% because the number never travelled is a decoration. Nothing else is on it —
  no fit, no hold, no credits, no damage taken — so a snapshot cannot move a rule on the far side.
  `HOST_PILOT_ID` is the host's own hull on the wire.
- **`SHIP_STREAM`** — `hz: 24` (**the owner's 20–30 Hz band**; `NET.snapshotSec` stays the 2 s
  *suitcase* sync, a different fact), `delayMs: 100`, `samples: 6`, `staleMs: 1500`, `snapM: 50`.
- **The message** is `ships` (`net/protocol.js`): cleaned on the way out **and** in like every other
  kind, capped at `LIMITS.ships` (24) pilots per packet. More pilots than that and `session.js`
  sends more packets — `NET.maxGuests` is a valve, not a cap (playtest 22), so nothing is dropped.
- **The sender** is `session.js` `broadcastShips`, on a `1000 / SHIP_STREAM.hz` timer, started by
  any hosting path. It does not read the simulation: it asks for the picture on the bus
  (`mp-ships-request`), and `main.js` answers with `net/ships.js` `shipEntries(state.players)`. No
  guests, no packets.
- **The receiver** is the guest's own screen. `session.js` drops the guest's own entry (it already
  draws its own hull) and emits `mp-ships`; `render/shipstream.js` keeps the last few snapshots per
  pilot and hands `render/views.js` a pose **100 ms in the past**, interpolated between the two
  snapshots that straddle it. Past the newest snapshot the pose is **held, never guessed**; a jump
  over `snapM` or a change of pocket is drawn as the step it is.

**The host needs no wire at all.** `render/views.js` draws every non-local record in
`state.players` as a hull, interpolated exactly as the local ship is, so a visitor appears on the
host's screen the moment it arrives — the half the owner most wanted to see.

**A docked visitor is drawn**, parked at the launch point its arrival put it on: a visitor cannot
fly in this world yet (controls are 8b), and a hull hidden until then would be no hull at all. A
dead pilot draws nothing; only pilots in the **pocket being drawn** get a mesh.

**Not in 8a:** controls in (8b), the guest's screen following the host's pocket (8c), any
prediction, ack/rewind, cosmetic muzzle and lag compensation (8d/8e —
[client-prediction.md](client-prediction.md)). No save change: the stream is runtime only and
`SAVE_VERSION` stays 29. Tests: `tests/multiplayer-slice8a.test.mjs`; guide:
[../../testing/TESTING-16-SLICE8A.md](../../testing/TESTING-16-SLICE8A.md).

**Away means this world is paused, and the card says so** (owner, playtests 18 and 20). The four
rules — the main menu is always the main menu, the card is raised by **every** Open World press, the
stand-in is a look rather than progress, and **nothing is compared** because the press always takes
the copy that world holds — are stated in full, word for word, in
[archive/MULTIPLAYER_SLICE5_NOTES.md](../archive/MULTIPLAYER_SLICE5_NOTES.md).

**Bring pilot home** is exactly what the owner described: the copy from the friend's world —
credits, ships, hull, holds, cargo and lockers — becomes the local save; missions, story flags and
statistics stay local (`custody.checkIn`). Campaign play never affects it.

## Slice 5: crashes and reconnects (built 2026-11-24a, reworked 2026-11-24b)

Playtest-confirmed on 2026-11-24. The rules — **a lost host is a lost room**, **rejoining keeps the
version the server has**, **the copy is kept current**, **`compare` decides, never arrival order**,
**the chat takes itself away**, **a departure is said and a pilot lives in one window** — are stated in
full, word for word, in
[archive/MULTIPLAYER_SLICE5_NOTES.md](../archive/MULTIPLAYER_SLICE5_NOTES.md). Playtest 23 added one
correction to the record-keeping those rules depend on: see below.

## Playtest 23: a friend is a ship like any other, and a pilot can always come back (built 2026-11-25b)

The owner's playtest of 8a reported two bugs. Both are fixed in the working tree **inside slice 8a**
— the slice was re-sent as `2026-11-25b` rather than renamed — and both are covered by tests that
fail on the old code.

**1. "Cannot select a friend's ship."** Slice 8a drew the hull and stopped there, and a visiting
pilot was never a target: `sim/targeting.js` offered only hostiles, rocks, crates, rifts, gates,
canisters and the station (a visitor is a `state.players` record, not a hostile, and on a guest there
is no record at all), `LOCK_KIND_BY_ROW` had no entry for the N list's pilot row so it became a
**name-only** lock with no health, and `ui/hud.js` drew bars for `k === "e"` alone.

The fix is one lock kind and one published fact:

- **`k: "p"`** is another pilot. `render/views.js` publishes **`state.otherPilots`** — the mirror of
  every pilot it draws, one **stable reference per pilot updated in place** (F compares targets by
  identity, so a fresh object each frame would drop the lock). It is the only place a friend exists on
  a guest's screen, which is why the renderer writes it and `sim/` and `ui/` only read it — never
  written back into a pilot, never saved.
- `sim/targeting.js` `otherPilotsThere(player)` is the list F offers (reticle first via
  `tagLockView` on the hull mesh, then the same cone hostiles get), `lockName` returns **the pilot's
  own name**, `lockPosition` returns the drawn pose, and `pruneLock` drops the lock the moment the
  hull stops being drawn (left, dead, another pocket).
- The N list's row keeps its kind (`Ship`, so the filters and icons already work) and now maps to
  `"p"`; `isPocketRowLocked`/`selectPocketObject` behave like any other row (including a second
  click releasing it).
- `ui/hud.js` gives a `"p"` lock **the same two bars as a hostile's** and labels an unlocked friend's
  hull with its name; `ui/target-display.js` gives `p`/`Pilot` the friendly tone.
- **`sim/pilot-stats.js`** (new) owns the two fractions so the host's own screen and the wire cannot
  disagree about a friend's bars; `shield` is on `SHIP_FIELDS`, clamped like `hull`.

**A pilot lock fires nothing.** `sim/weapons.js` only ever feeds a missile from `F.lock?.k === "e"`, so
locking a friend changes no weapon rule.

**2. "Stuck on 85% handshake — the link has already been used."** The link was never the problem:
`custody.guestRecord` hashed whatever token it was handed, and the host's **write-back** (the
two-second `syncGuests`), the `left` mark a departure writes and the final copy on `bye` all edit a
guest record **without** the guest's secret. Each such edit re-hashed `undefined` over the stored
`tokenHash`, so the record kept the hash of *nothing* and every later hello failed the handshake — for
ever. It read as intermittent because a `left` record is re-admitted without a token check.

The rule now, in one line: **an update that carries no secret never changes the secret's hash.**
`custody.recordTokenHash(token, tokenHash, salt)` prefers a real token, keeps the stored hash
otherwise, and only hashes "nothing" for a brand-new record (the old shape). `putGuest` passes
`tokenHash: previous?.tokenHash` through. A real token still replaces the hash — that is how a pilot is
renamed onto a new browser. Tests: `tests/multiplayer-rejoin.test.mjs` (all five fail on the old code).

## Known gaps (until their slice lands)

- A guest's own ship is drawn where **its own** screen put it; its controls do not reach the host
  (8b) and its screen does not follow the host's pocket (8c), so a friend's hull appears on the
  guest's screen only if both happen to be in the same pocket. The host's side is complete: every
  visitor is drawn from `state.players`.
- ~~A remote hull carries no name label and cannot be locked.~~ **Built (`2026-11-25b`)**: a friend is
  a lock (`k: "p"`) with its name and hull/shield bars, a Ship row in the N list, and its name over
  its hull. It still **cannot be hit**: weapons only ever act on a hostile lock (`k === "e"`), which
  is a rule for a later slice (damage on a remote is *death and recovery* debt).
- The invitation is **not checked** when a browser joins the room: one that knows the world id can join
  without the link. Step 17's job.
- The player list is names, not positions or ships; non-local death is step-16 work.
- A hosted world's pause card does not pause its *guests*; the host's own clock follows `state.pause`
  as it always has (the no-pause rule is built, slice 3).
