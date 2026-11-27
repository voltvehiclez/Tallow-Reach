# Multiplayer: host-run co-op (step 16)

*Last checked: 2026-11-25 (slices 1–5 and 7 playtest-confirmed, 8a built and played, **8b built to `2026-11-25f`**, playtested, confirmed, 6 last; step 17 planned).* The plan and its eight slices are step 16 of
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

**Guard rails against accidents, not cheating** (pillar 5; [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)).

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
- **A guest's identity is its own browser's, not the link's** (playtest 22, L47). `tr_mp.pilotToken` is
  made once (`makeToken`), never shown, never in a save, and sent as the secret on both doors;
  `guestId` is derived from it. The link's `#token` is an **invitation**, one per world, so two friends
  on one link are two pilots. **No player cap:** `NET.maxGuests` (100) is a valve against a runaway room
  (owner: *"unlimited players"*).
- **Higher `(epoch, rev)` wins; copies are never merged.** The host raises `rev` on every change;
  `compare(a, b)` decides, and the choice screen shows both `summary()`. A **`fresh`** carry (playtest
  24) is the one provenance a pair cannot express — see 8b below.

## What travels (`src/data/multiplayer.js`)

| Travels | Stays home |
| --- | --- |
| credits, the fleet and each hull's fit, hold, slot layout, remembered damage and station; missiles; the selected weapon bays | missions, story flags, contracts completed, kills, campaign progress |
| **station lockers** (`world.stationStores`), each stack remembering the station it came from | the hosted world itself: station levels, built stations, the contract board, the galaxy, world changes |

**Items are moved, never copied.** `checkOut` empties the stations it packs; a stock that cannot legally
sit at the destination goes into the bundle instead of the host's world. Home missions, flags and stats
are copied back *after* the merged half is sanitized, so nothing can leak into them.

**Nothing is deleted for lack of room.** `relocate` sends a stack whose station a world lacks to
Meridian and keeps its `origin`, so it goes back the moment that station exists again. An over-full
station is flagged (`world.storageOverfull`, `net/station-inventory.js`) and only refuses *new*
deposits. Hulls work the same way: one parked at a station this world lacks moves to Meridian, and
`bundle.shipsAt` remembers where it was.

**Unknown content is kept.** A newer build's id is carried untouched — unknown stacks in the lockers, and
single ids re-inserted after the save sanitizer has run. Custody asserts every stack that left comes back
once.

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
Pause > **Open Multiplayer** open the same screen.

**One screen, one door each** (owner's rule, playtest 2): `#mp-screen` from the **title menu** shows the
join block, from the **pause card** the host block, and `act()` refuses the other door's job twice. A guest
mid-flight still gets its answer code and Leave; quitting to the title closes the room, because hosting is
something you do while flying your own world.

**One screen, three blocks** — *your name*, *host your world* (switch → link + Copy → paste codes) and
*join a friend's world* (a link **or** a `TRJOIN:` code). One surface on purpose: the first playtest
rendered the join box only for a session that already was a guest, so the only entrance was behind
itself. **No username, no switch** — the switch is disabled and the action refuses too.

A browser cannot accept a connection on its own, so something has to introduce two of them. Exactly one
small networking library is allowed, behind `src/net/transport.js`, and nothing else in the game may name
it: **the owner chose Trystero** (`trystero@0.27.0`, MIT, Nostr build) on 2026-11-21, on the numbers in
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md) ("The library decision"). The paste-code path sits beside it
for when a free relay is slow or down.

The shape the wrapper is written to:

- **With a broker** (Trystero is the recommendation): the link is `?join=<worldId>#<token>`. The
  secret is after the `#`, which browsers never send to a server and never write to a log. Both
  browsers join a room named from the world id, the broker introduces them, and the game's traffic
  is peer-to-peer and encrypted by WebRTC itself.
- **Without one** (also buildable with no library at all): the host makes an **offer code**, the guest
  pastes it and gets an **answer code**, sends that back and the host pastes it. One paste more, and the
  path that has to work when the broker does not.

Either way the handshake afterwards is the same and is written and tested (`net/custody.js`
`handshake`): game version, `worldId` and the guest's secret, each refusal with a sentence the guest can
act on.

**Two machines need a path; one machine never does.** A home network often has none (no hairpin NAT,
`*.local` names dropped) and two tabs hide the failure, so `ICE.turn` (the game's own ExpressTURN free
tier) is used **only after** `NET.helloWaitSec` of a direct attempt with a browser in the room and no hello
admitted, **by both ends**. A code only crosses a network if gathering was still running when the server
answered, hence `ICE.gatherMs` 8 s and two doors on 3478. Measured 2026-11-22: the owner's laptop on 4G
joined with no codes at all. Full account:
[archive/MULTIPLAYER_RELAY_NOTES.md](../archive/MULTIPLAYER_RELAY_NOTES.md).

**Diagnose by facts, not by mood.** `diagFacts()`/`diagReport()` (**Connection details**) print the
**build string**, the **world id**, the signalling state, **how many browsers are in the room**, the direct
link, relay on/off and **messages sent versus received** — the order that separates the three failures
which look like "you are the only one there": wrong rooms, a right room with no path, different builds.

**The relays, in three facts that cost playtests 5, 6 and 8:** a relay can accept a socket and refuse the
game's events, so the count that matters is `Relays connected: N`, never "reachable"; the list is
**pinned** in `RELAYS.relayUrls` because the shuffled five included dead servers; and a code works with no
relay at all ([archive/MULTIPLAYER_RELAY_NOTES.md](../archive/MULTIPLAYER_RELAY_NOTES.md)).

**The hello is repeated, per peer, until it is answered.** A hello "sent" is not a hello heard: the
channel opens seconds after the room says the peer is there, and a message into an unopened channel is
gone without an error while `join()` returns before the other pilot is introduced. So `sayHello(peerId)`
latches only on a send that left, repeats every `NET.helloRetrySec` and on `onPeer`, and the `welcome` is
the real latch; after `NET.helloWaitSec` the guest is told, in one sentence for "nobody is in the room"
and another for "nothing gets through".

**Names are labels; a duplicate gets a star.** `uniqueName(wanted, taken)` hands the guest the first free
variant — `Acey`, `Acey*`, `Acey**` — counted against the host's name and every guest but its own row (a
rejoin grows no star), and it travels back in `welcome.youName`.


**A code names the world.** `TRJOIN:` codes carry the host's `worldId` (`CODE_VERSION` 2; version 1 is
still read), because a guest joining by code has no link to carry it and the host's handshake would refuse
the guest it just invited. `codesAcceptFrom(offer)` builds the session from the code, so the fallback works
when the link is what did not.

Chat (**Enter**) and the player list arrive in the same slice, so the pipe is proved before anything of
the player's crosses it.

**What slice 3 built (2026-11-21)** is archived word for word in
[archive/MULTIPLAYER_SLICE3_NOTES.md](../archive/MULTIPLAYER_SLICE3_NOTES.md); the live
file-by-file list is `src/net/README.md`.

Three decisions worth keeping:

- **The secret after the `#`.** A fragment is never sent to a server and never appears in a referrer, so
  a host's token cannot be logged by whoever hosts the page, and the query needs no double escaping.
  `?join=` stays in the query because it has to reach the game.
- **A first hello is admitted by the link; a returning guest must prove the token.** `session.js`
  `firstHelloCheck` (build, world, a real name) admits a first contact and falls through to
  `custody.handshake`, token included, the moment a record exists.
- **A hosted world never pauses — and neither does a visited one.** `sim/step.js` reads
  `state.multiplayer`, which `ui/pause.js` sets to `isOn()` (a plain "is a session running"), not to
  "and the card is shut": the old `!v && isOn()` stopped the world at the one moment the flag was
  there for (owner's playtest 2). The card still releases every held control key on the way in, so
  the ship cannot fly itself behind it while the world keeps stepping.
- **The screen is drawn from a model, and its refusals from a sentence.** `screenModel()` turns the
  session snapshot and the screen's view state into everything the player sees; `act(name)` does what a
  button does. Both run with no DOM, which is how `tests/multiplayer-ui.test.mjs` drives the real
  buttons. The switch is drawn from the **session** (`hosting`), never from the stored setting (LESSONS
  L32), so a failed host snaps back to Off with the reason in `#mp-msg`. The offer code lives in the
  model, so a redraw cannot delete the code the player was told to send.

**What the connection still does not do:** it decides no ship's position — the host's sim does, and a
guest's asking travels there (8b) — and a guest still draws **its own galaxy** (8c).

## Slices

1. **Custody** — `net/custody.js`, `net/station-inventory.js`, `net/world-places.js`,
   `data/multiplayer.js`; no networking. **Built 2026-11-21.**
2. **Save v29** — `save.away`, `world.guests`, the migration (old saves load with `away: null`),
   `guestId`/`worldId`, the temp-key-then-swap write that keeps the previous version, and the
   `away:<worldId>` storage key. **Built 2026-11-21.**
3. **The connection** — `net/transport.js` (Trystero for the one-link join, codes as the fallback),
   Pause > Open Multiplayer, chat and the player list. **Built 2026-11-21.**
4. **Join** — "Bring my pilot" (`checkOut`/`relocate` through the handshake slice 3 already
   answers), two-second *profile* snapshots, reconnects by `compare`, "Go home" from the suitcase with the
   host offline. **Built 2026-11-23a, playtest-confirmed 2026-11-24** (rounds 14–19 fixed on top).
5. **Crashes and reconnects** — a lost host puts the player back on the main menu with **"Lost
   connection to host"**, the host's copy kept current, `compare` deciding between copies, rejoining
   keeps the server's copy, a final copy on tab close, one session per `guestId`, and the away card on
   every Open World press. **Built 2026-11-24a, reworked `b`** — see below.
6. **Trading** — a **Trade** station tab lists the pilots docked here; another's **Trade** opens
   two inventory-style halves on both screens (items, ships, credits), two confirms, and the host
   swaps at once only if station storage and hangar have room. **Built last** (order 7 → 8 → 6).
   Design: [trading.md](trading.md).

## Slices 7 and 8: the second pilot, then the second screen (7 built; 8a built)

The owner asked for **"one world, two ships visible"** on 2026-11-22. The plan's own model says what
that costs — the host's browser is the authority, and a guest's screen draws what the host sends back —
plus the two debts [../TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) still lists (*death and
recovery*, *player presentation and input*). Two slices, because neither half can be tested alone:

- **Slice 7 — the pilot is on the map (built and playtest-confirmed 2026-11-24, `2026-11-24h`).**
  Slice 4 had already made the visitor a record in `state.players`, docked at its own station; what was
  left was visibility: `ui/starmap.js` `pilotBlips` draws the visitor's name under its **system** on the
  galaxy chart and under its **pocket** on the system map, and `pilotPanelMarkup` names every visitor
  with its system at the **top** of the side panel (it may have arrived elsewhere).
- **Slice 8 — one world on two screens.** Snapshots out (`SHIP_FIELDS`, **8a built**), controls in
  (`state.localInput`, a numbered input-rule change — see [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md),
  **8b built**), and the guest's screen following the **host's** pocket (8c). Only after 8c are two
  ships drawn in one sky on both screens; only after 8d is the guest's own hull predicted
  ([client-prediction.md](client-prediction.md)).

## Slice 8a: ship snapshots (built 2026-11-25, re-sent as `2026-11-25b` with playtest 23's fixes)

**The host says where every pilot is; a guest draws it and simulates nothing.** Every number below is
in `src/data/multiplayer.js`:

- **`SHIP_FIELDS`** — id, name, ship, place, pos, quat, velocity, throttle, docked, dead, hull,
  shield (playtest 23), plus (`26b`) **boost** and **shake** (camera-shake amplitude, decayed on
  the sim clock) — nothing else: no fit, no hold, no credits; a snapshot can move no rule.
  `HOST_PILOT_ID` is the host's own hull.
- **`SHIP_STREAM`** — `hz: 24` (**the owner's 20–30 Hz band**, not the 2 s *suitcase* sync), `delayMs`
  100, `samples` 6, `staleMs` 1500, `snapM` 50.
- **The message** is `ships` (`net/protocol.js`): cleaned both ways like every other kind, capped at
  `LIMITS.ships` (24) pilots per packet — more pilots means more packets, since `NET.maxGuests` is a
  valve, not a cap (playtest 22). Nothing is ever dropped.
- **The sender** is `broadcastShips`, on a `1000 / SHIP_STREAM.hz` timer, started by any hosting path. It
  never reads the simulation: it asks on the bus (`mp-ships-request`) and `main.js` answers with
  `net/ships.js` `shipEntries(state.players)`. No guests, no packets.
- **The receiver** is the guest's screen: `session.js` drops the guest's own entry and emits `mp-ships`;
  `render/shipstream.js` holds the last few snapshots per pilot and hands `render/views.js` a pose **100 ms
  in the past**, interpolated. Past the newest the pose is **held, never guessed**; a jump over `snapM` or
  a change of pocket is drawn as the step it is.

**The host needs no wire.** `render/views.js` draws every non-local record in `state.players` as a hull,
interpolated as the local ship is, so a visitor appears the moment it arrives — parked at its arrival
launch point until 8b, flying it after. A dead pilot draws nothing, and only pilots in the **pocket being
drawn** get a mesh.

No save change: the stream is runtime only and `SAVE_VERSION` stays 29. Tests:
`tests/multiplayer-slice8a.test.mjs`; guide: [../../testing/TESTING-16-SLICE8A.md](../../testing/TESTING-16-SLICE8A.md).

## Slice 8b: controls in (built 2026-11-25e)

**The guest says what it is asking its ship to do; the host writes it into that pilot's own record.**
Four pieces, and the rule the plan called a numbered input change is the third:

- **The message** is `controls` — `steer{x,y}`, `roll`, `thrust`, `strafe`, `lift`, `stop`, `brake`,
  `boost`, `fire`, `sec` and **`aim[x,y,z]`**, which is why the aim travels per pilot: a guest's bolts
  leave **its** nose along **its** look (`sim/weapons.js` reads `P.aimDirection`, a field a record never
  had). Axes are clamped to ±1 on the way out **and** in, to three decimals; a flag is on only if it is
  literally `true`; `aim` is not normalised on the wire — the simulation normalises it.
- **Identity is the peer, never a name in the message.** A `controls` packet does not say which pilot it
  is for: `session.js` `onControls` resolves the sender's peer id to a `guestId`, marks the peer seen and
  emits `mp-guest-controls`; an unwelcomed peer is ignored. A guest therefore cannot fly somebody else's
  ship, and `main.js` hands the id to `sim/multiplayer.js` `applyGuestControls(guestId, input)`, which
  refuses an unknown, dead or absent pilot.
- **`state.localInput`** is the one new state: a copy of the local asking, written field by field by
  `core/input.js` `syncControls()` — its only writer — and read by the session's sender. The session
  never reads a DOM event or a keystroke, and `net/` still imports no `core/` or `sim/`.
- **`CONTROLS`** — `{ hz: 30, staleMs: 400 }`. A guest sends at 30 Hz while it is on, welcomed and
  flying a local ship; nothing is sent from a host, and nothing from a guest that has nothing to fly.
  **`ageGuestControls()`** (called by `step.js`) asks nothing of a visitor whose last packet is older
  than 400 ms — it coasts instead of flying on into a rock — and a docked or dead record is never aged.

**A docked visitor launches on its first asking.** `asksToFly(input)` — any axis or flag but nothing at
rest — is the trigger for `launch(P, P.profile)`, the same path the player's own undock takes, so the
host's world decides *where* the hull starts. Until then a neutral input leaves it parked exactly where
8a drew it; the first real key press is what puts a visitor in flight.

**Not in 8b:** the guest's screen following the host's pocket (8c); prediction, ack and rewind (8d —
[client-prediction.md](client-prediction.md)); cosmetic muzzle and lag compensation (8e). A guest cannot
dock, die and recover yet, so a launched visitor flies until it goes home. No save change:
`SAVE_VERSION` stays 29. Tests: `tests/multiplayer-controls.test.mjs`; guide:
[../../testing/TESTING-16-SLICE8B.md](../../testing/TESTING-16-SLICE8B.md).

### Playtest 24 (`2026-11-25f`): three corrections to what 8b shipped

The owner's first flight of 8b passed (*"the ship moves, rolls, shoots"*) and reported three things.

- **A repaired pilot came back damaged.** The guest's copy was right; this world refused it. The stale
  check trusted `record.left`, which is set by **both** a pilot going home and a dropped connection (and
  a returning hello clears it). And the pair cannot express it: a host raises `rev` on every write-back
  while a fresh `checkOut` starts at `epoch 0, rev 0`, so the copy with the repair looks older. A `carry`
  now carries **`fresh: true`** — "packed out of the pilot's own home save just now" — which only the
  guest can say. `sendCarry` sets it, a rejoin of a stored suitcase does not, and `onCarry` believes a
  fresh copy whatever the pair says. **`left` is admission only now**; the dropped-connection rule (this
  world's copy wins) keeps its own test.
- **The visitor's hull blurred** on a high-refresh host while it flew and the camera turned — the
  2026-11-08 sawtooth, on the one record that fix never reached. `snap` means "this frame is a jump, do
  not interpolate", and only `chaseView` cleared it, for the **local** hull; a visitor kept the flag from
  `launch()` for ever and so was placed at the last 60 Hz tick under a 240 Hz camera.
  `render/views.js` `poseOfRecord` consumes it after taking the pose: the jump frame is still a jump, and
  every frame after it interpolates like the rest of the sky.
- **The chat closed when its text was selected.** The field's `blur` handler closed an empty box, and a
  press on the lines blurs the field. A press on the conversation now starts a selection
  (`pressKeepsChat`, no DOM in it), redraws are held back so a line arriving mid-drag cannot wipe it, and
  text is selectable **only in the box opened with Enter** — a glance and a pinned box stay readouts.

Tests: `tests/playtest24-fixes.test.mjs` (5). No save change: `SAVE_VERSION` stays 29. Guide:
[../../testing/TESTING-16-SLICE8B-FIXES.md](../../testing/TESTING-16-SLICE8B-FIXES.md).

**Away means this world is paused, and the card says so** (owner, playtests 18 and 20): the four rules,
word for word, in [archive/MULTIPLAYER_SLICE5_NOTES.md](../archive/MULTIPLAYER_SLICE5_NOTES.md).

**Bring pilot home** is exactly what the owner described: the friend's copy — credits, ships, hull,
holds, cargo, lockers — becomes the local save, and missions, flags and statistics stay local
(`custody.checkIn`).

## Slice 5: crashes and reconnects (built 2026-11-24a, reworked 2026-11-24b)

Playtest-confirmed on 2026-11-24. The rules — **a lost host is a lost room**, **rejoining keeps the
version the server has**, **the copy is kept current**, **`compare` decides, never arrival order**,
**the chat takes itself away**, **a departure is said and a pilot lives in one window** — are stated in
full, word for word, in
[archive/MULTIPLAYER_SLICE5_NOTES.md](../archive/MULTIPLAYER_SLICE5_NOTES.md). Playtest 23 added one
correction to the record-keeping those rules depend on: see below.

## Playtest 23: a friend is a ship like any other, and a pilot can always come back (built `2026-11-25b`, repaired `2026-11-25c`)

The owner's playtest of 8a reported two bugs. Both were fixed **inside slice 8a** — re-sent as
`2026-11-25b`, not renamed — with tests that fail on the old code.

**1. "Cannot select a friend's ship."** 8a drew the hull and stopped there, and a visiting pilot was
never a target: `sim/targeting.js` offered only hostiles, rocks, crates, rifts, gates, canisters and the
station, `LOCK_KIND_BY_ROW` had no entry for the N list's pilot row (a **name-only** lock, no health),
and `ui/hud.js` drew bars for `k === "e"` alone.

The fix is one lock kind and one published fact:

- **`k: "p"`** is another pilot. `render/views.js` publishes **`state.otherPilots`** — the mirror of every
  pilot it draws, one **stable reference per pilot updated in place** (F compares by identity) and the
  only place a friend exists on a guest's screen, which is why the renderer writes it and `sim/`/`ui/`
  only read it, never back into a pilot and never into a save.
- `sim/targeting.js` `otherPilotsThere(player)` is the list F offers (reticle first, then the same cone
  hostiles get), `lockName` is **the pilot's own name**, and `pruneLock` drops the lock the moment the
  hull stops being drawn. The N list's `Ship` row maps to `"p"` like any other row, and **a docked pilot
  is a row too** (`d`): only **dead** and **another pocket** keep one out, so the filter carries every
  ship. `ui/hud.js` gives a `"p"` lock **the same two bars as a hostile's**, and **`sim/pilot-stats.js`**
  owns the two fractions so the host's screen and the wire cannot disagree; `shield` is on `SHIP_FIELDS`.

**A pilot lock fires nothing:** `sim/weapons.js` feeds a missile only from `F.lock?.k === "e"`.

**2. "Stuck on 85% handshake — the link has already been used."** The link was never the problem:
`custody.guestRecord` hashed whatever token it was handed, and the host's **write-back**, the `left`
mark and the final copy on `bye` all edit a guest record **without** the guest's secret. Each edit
re-hashed `undefined` over the stored `tokenHash`, so the record kept the hash of *nothing* and every
later hello failed the handshake — for ever, and read as intermittent because a `left` record is
re-admitted without a token check.

The rule now, in one line: **an update that carries no secret never changes the secret's hash.**
`custody.recordTokenHash(token, tokenHash, salt)` prefers a real token, keeps the stored hash
otherwise, and only hashes "nothing" for a brand-new record (the old shape). `putGuest` passes
`tokenHash: previous?.tokenHash` through. A real token still replaces the hash — that is how a pilot is
renamed onto a new browser. Tests: `tests/multiplayer-rejoin.test.mjs` (all five fail on the old code).

### Second round (`2026-11-25c`): the record the repair could not reach, and a hull that was only a picture

- **A repair cannot fix what is already stored.** A record whose `tokenHash` was the hash of *nothing*
  refused its own pilot for ever. `custody.recordHoldsNoSecret` now lets `handshake` admit it and answer
  **`repaired: true`** (and `putGuest` write the real hash), because a record that cannot identify
  anybody **must not refuse anybody**. **A record that does hold a secret still refuses a wrong one**: a
  narrow repair, not a weaker handshake (the unchecked invitation is step 17).
- **A `carry` never rewrites an existing record's hash** — the hello proved the identity and `away.token`
  may be an older build's leftover. **A refusal ends the attempt**, with the host's words in the chat and
  the menu notice.
- **A pilot's hull is a body.** `sim/player.js`'s **`pilotHullRadius(P)`** (`SHIP_RADIUS` × the hull's
  `SHIPS[...].sc`) and a **pilot-vs-pilot pass** in `flight()`: ships separate, ricochet (0.4) and pay the
  same `impact > 25 → 0.015/m·s` a rock does, a **docked** visitor included (its tick is skipped, so it is
  one hit per pilot per tick). Bolts and warheads stop on it, shields first, skipping the shooter, a wreck
  and another pocket.
- **Destroyed is said out loud:** `mp-guest-destroyed` (`sim/multiplayer.js` → `ui/multiplayer.js`) is a
  chat line saying the ship is gone and the pilot safe in its suitcase; recovery is still step-16 debt,
  so the words promise nothing. Tests: `tests/multiplayer-damage.test.mjs` (13).

## Known gaps (until their slice lands)

- A guest's own ship is drawn where **its own** screen put it and its screen does not follow the host's
  pocket (8c), so a friend's hull appears on the guest's screen only if both happen to be in the same
  pocket. The host's side is complete: every visitor is drawn from `state.players` and flown by its own
  asking (8b).
- ~~A remote hull carries no name label and cannot be locked or hit.~~ **Built (`2026-11-25b`, `c`)**:
  a friend is a lock (`k: "p"`) with its name and bars, a Ship row in the N list (`d`), and its name
  over its hull; every pilot's hull is solid and takes damage (collision, bolts, warheads, shields
  first). What is still missing is **recovery**: a destroyed visitor is marked `dead`, both screens say
  so, and nothing brings it back this visit (step 16 debt — its pilot is safe in its suitcase, and
  flying it home works).
- The invitation is **not checked** when a browser joins the room: one that knows the world id can join
  without the link. Step 17's job.
- The player list is names, not positions or ships; non-local death is step-16 work.
- A hosted world's pause card does not pause its *guests* (slice 3).
