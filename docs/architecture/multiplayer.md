# Multiplayer: host-run co-op (step 16)

*Last checked: 2026-11-24 (slices 1–4 playtest-confirmed, 5 to `2026-11-24f`, 7 built to `2026-11-24g`, 8 next, 6 last; step 17 planned).* The plan and its eight slices are step 16 of
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md); this file is how the code works as it is built.

## The idea

One **host** runs their own open world and **guests** join it through a WebRTC link — one to start, and no
cap now that a guest is its own browser (playtest 22). The host's browser is the only writer of the
truth: a guest sends what it asks its ship to do, and draws what the host sends back.

**Open world only.** The campaign stays single player (owner, 2026-11-21): its fixed ships and scripted
beats mean nothing in somebody else's galaxy.

## Step 17: dedicated servers (planned 2026-11-22, not built)

The owner added **step 17**: a **dedicated server** hosts a world — step 16's host with no screen (a
headless build of the same project), stepping the fixed loop, holding the world and streaming snapshots
and controls in a **star** topology, so one port-forwarded server (`host:port`, Minecraft-style) can hold
a world for a measured number of players (the number goes in `src/data/multiplayer.js`). Peer-to-peer
stays the two-friend default; `src/net/transport.js` (still the only file naming a connection library)
gains a server role and the link gains the server's address. The one open dependency question is the
WebSocket-server library 17b needs (Node has no built-in one). Four slices — **17a** headless server,
**17b** server transport, **17c** snapshots and controls, **17d** scale, public address, auth, admin —
are **step 17 of [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)**.

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

**Reachable is not usable.** Playtest 6 showed `Relays reachable: 3 of 5` on both machines and still one
browser in each room: a relay can accept a WebSocket and then refuse the game's events (`blocked:`,
`restricted:`, `auth-required:`), and the library **retires** it silently. The count that matters is
its own, `getRelaySockets()`, printed as **`Relays connected: N`** — which is why the pinned list keeps
more than one family of servers: a live relay that will not carry this protocol is worse than a dead
one, because it inflates a number.

Whatever the relays do, **the copy/paste codes work without them** — two players swap two codes and the
browsers connect directly. After `NET.helloWaitSec` with nobody in the room the session marks itself
**stalled** (`armStallTimer`), the host's screen auto-creates the offer (`autoOfferWhenStalled`, once
per screen opening), a stalled guest gets the paste box on the pause card, and `net/paste.js` always
offers `ICE.turn` beside its STUN — a player reaching for codes has already learned the easy route
failed, so the only question left is whether a path exists at all.

**The relays are pinned, and their health is on screen.** This is the one failure that looks
impossible from inside the game: same build, same world id, both `finding`, **one browser in each
room and zero messages sent** — the introduction itself never happened, so the path, the relay and
the handshake are all irrelevant (playtest 5). The library picks *five of thirty* public signalling
relays by `shuffle(defaults, strToNum(appId)).slice(0, 5)`; the app id makes it the same five on every
machine, which makes the failure look like a contradiction — but this game's five were three obscure
or dead servers, so both players subscribed to the same silence. `RELAYS.relayUrls` in
`data/multiplayer.js` therefore **names the relays** (six long-running ones; the library uses the
first five) and `transport.checkRelays()` opens a WebSocket to each and counts the answers, shown as
**Relays reachable: N of 5** (asked when the screen opens, on Reconnect, cached 20 s). **0 of 5**
means the player's network blocks them and no retry can help — the block says so and points at the
copy/paste code path, which needs no relay at all. Tests must never probe: `setRelayProbe(null)`.

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

### What slice 3 built (2026-11-21)

| File | The one job |
|---|---|
| `net/transport.js` | the wrapper: `createChannel` → `join/send/broadcast/leave/peers/state`; `trystero` is named here and nowhere else (lazily, through a loader a test can replace); every failure becomes `lost` + a sentence |
| `net/session.js` | one session: `hostWorld`, `joinWorld`, the paste codes, the handshake through `custody.handshake`, the guest list, the recent chat, `mp-state` on the bus |
| `net/protocol.js` | seven message kinds, each cleaned and length-capped on the way out **and** in |
| `net/paste.js` | the broker-free fallback: a `TRJOIN:` offer code and an answer code, browser WebRTC only |
| `net/join-link.js` | `?join=<worldId>#<token>`, and reading one out of a pasted sentence |
| `net/settings.js` | the username (`tr_mp`), capped and cleaned; a number is refused rather than shown |
| `net/boot.js` | a `?join=` link in the address bar: asks first, used once, speaks through `mp-notice` |
| `ui/multiplayer.js` | the multiplayer screen (name, host, join, codes) and the chat box; every control is a `data-mp` action, and no connection state of its own |

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

**What a session is not allowed to do yet:** it moves no pilot and draws no remote ship —
deliberate, so it can be tested without risking a save.

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

## Slices 7 and 8: the second pilot, then the second screen (7 built; 8 planned)

The owner asked for **"one world, two ships visible"** on 2026-11-22. The plan's own model says what
that costs — the host's browser is the authority, and a guest's screen draws what the host sends back —
plus the two debts [../TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md) still lists (*death and
recovery*, *player presentation and input*). Two slices, because neither half can be tested alone:

- **Slice 7 — the pilot is on the map (built 2026-11-24).** Slice 4 had already turned the suitcase
  into a record in `state.players` (`custody.hostProfile` + `configurePlayer`, docked at its own
  station because flight positions never travel), and written it back. What was left was
  visibility: `ui/starmap.js` `pilotBlips` reads `state.players` and draws each visitor's name under
  the pocket it stands in on the system map, and `pilotPanelMarkup` names every visitor with its
  system in the side panel (a visitor arrives at *its own* home station, possibly another system).
  `render/views.js` still draws one hull (8).
- **Slice 8 — one world on two screens.** Snapshots out (`SHIP_FIELDS`), controls in
  (`state.localInput`, a numbered input-rule change — see [../REFACTOR_PLAN.md](../REFACTOR_PLAN.md)),
  and the guest's screen following the **host's** pocket. Only then are two ships drawn in one sky.
  The guest predicts its own ship, and remotes are interpolated:
  [client-prediction.md](client-prediction.md).

**Away means this world is paused, and the card says so** (owner, playtests 18 and 20 — playtest 20
replaced the "only if newer" gate):

- The **main menu is always the main menu** (playtest 18): leaving a friend's world lands somewhere
  ordinary, never on a save question.
- The title's **Open World** press lands on the card. A player already in a visit reaches the world
  from the multiplayer screen instead, and gets the **stand-in** (playtest 21): today that is this
  browser's own galaxy holding the pilot's latest copy, said in a notice when it opens, because the
  wire carries no world state until slices 7-8. The stand-in is a look, not progress — the travelling
  half is in the suitcase, and `captureActiveModeSave` folds no live facts into a save that is away.
- The card *"Your pilot is in Ada's world"* appears **only** on an **Open World** press, and it
  appears **every time** while the pilot is away: the press is a custody decision either way.
- **Nothing is compared** (owner, playtest 20: *"even small things like pilot position can
  change"*): **Bring pilot home always installs the copy that world holds.** A `newerCopyAway` /
  `isNewerCopy` pair used to weigh credits and cargo first, and it is deleted — the travelling half
  is a photograph, not a rival, and `shipPlaces` or hull damage move with no number changing.
- The card has **two** buttons — **Bring pilot home** and **Main menu**. **Rejoin was removed**
  (playtest 18): rejoining is *main menu → Join Multiplayer World*, one path that explains itself.

**Bring pilot home** is exactly what the owner described: the copy from the friend's world —
credits, ships, hull, holds, cargo and lockers — becomes the local save; missions, story flags and
statistics stay local (`custody.checkIn`). Campaign play never affects it.

## Slice 5: crashes and reconnects (built 2026-11-24a, reworked 2026-11-24b)

Four rules, and one hole closed:

- **A lost host is a lost room** (owner, 2026-11-24: *"returned to the main menu with a prompt saying
  something like lost connection to host … Like Minecraft."*). Stated once by the session
  (`markHostLost`, `mp-host-left`), for a departing peer **and** for silence (`checkHostAlive`:
  nothing from the host for `NET.lastSeenSec` while a `ping` waits for its `pong`); then
  `ui/multiplayer.js` stops the session **quietly** (no one left to say `bye` to) **before** the
  menu shows **"Lost connection to host"** (`state.ui.lostHost`) with **one** door, *Main menu*. It
  asks no question about a save (L40) and touches none.
- **Rejoining keeps the version the server has** (owner: *"when reconnecting to the server after a
  disconnect your pilot's last version is already on the server"*). A rejoin is an ordinary join: the
  hello re-admits the pilot (a `left` record is proof of nothing), the guest re-sends its copy, and
  `compare` lets the newer win. **The secret is put back on the way out:** the copy a guest keeps is
  the host's copy and a host keeps no token, so `sendCarryMessage` fills it from `away.token` —
  without that, a rejoin in a fresh session was refused as "that link has already been used".
- **The copy is kept current.** `writeBack` had no caller until this slice: `syncGuests` asks `sim/` for
  each visitor's live profile every `NET.snapshotSec`, raises `rev` on a real change (`NET.revStepMs`
  floor) and re-sends an unchanged copy every `NET.suitcaseRepeatSec` — without it a guest came home
  from the copy it arrived with.
- **`compare` decides, never arrival order** (`onCarry`): a host loading an older save loses to a newer
  suitcase; a stale `carry` does not roll the world backwards (the record stands and its copy is sent
  back); a **`left` record hands over its own save**, because a pilot home since is the newest truth
  about itself. A *dropped connection* is not that case (the hello re-admits first). A tie takes the arriving
  copy.
- **The chat box takes itself away** (owner, playtest 20: *"it doesnt go away … unless the user has
  pinned the chat"*; 12 s since 21, and your own sent line counts). A line — anybody's — shows it for
  `CHAT.autoHideSec`; **Pin** keeps it, and so does an open field. `chatKeepsOpen({ pin, typing,
  saidAt, now })` is the whole rule; only the timer is untested (L45). **Glancing, typing and pinned
  are three boxes**: a glance is the chat alone, across the full width — the players column and the
  **Pin** button exist only while the field is open (`body:not(.mp-chat-open) #mp-chat-pin`, playtest
  22), which is also how a pinned box is unpinned (Enter brings the button back). The column is 54 px
  with no indent, names ellipsize at 12 px, and past `CHAT.whoRows` (10) it adds `+N more`. The button
  keeps the word **Pin**, its state in its colours (L32, L46).
- **A departure is said, and a pilot lives in one window.** New kind **`bye`** (a guest session
  stopping, and `pagehide`/`beforeunload`): the host writes the final copy back, marks the record
  `left` and takes the ship out. A hello for the same `guestId` from a different live peer is a
  **takeover**: the older window is told (`refuse` reason `replaced`), stops **quietly** (no `bye`),
  and the record is not marked `left`. `ping`/`pong` ride the keepalive, writing `lastSeen`.

## Known gaps (until their slice lands)

- A visiting pilot is **not drawn in space yet** (slice 8): `render/views.js` draws one hull. Since
  slice 7 it is a **named blip** on the system map and in the panel.
- A guest's screen is its own world, stand-in or not; it does not follow the host's pocket (8c).
- The invitation is **not checked** when a browser joins the room: one that knows the world id can join
  without the link. Step 17's job.
- The player list is names, not positions or ships; non-local death is step-16 work.
- A hosted world's pause card does not pause its *guests*; the host's own clock follows `state.pause`
  as it always has (the no-pause rule is built, slice 3).
