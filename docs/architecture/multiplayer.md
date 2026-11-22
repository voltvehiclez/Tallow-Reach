# Multiplayer: host-run co-op (step 16)

*Last checked: 2026-11-21 (slice 3, reworked after the owner's playtest).* The plan and its six slices are step 16 of
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md); this file is how the code works, as it is built.

## The idea

One **host** runs their own open world, and one **guest** joins it through a WebRTC link. The host's
browser is the only writer of the truth: the guest sends what it is asking its ship to do, and draws
what the host sends back. Two players to start; nothing assumes exactly one.

**Open world only.** The campaign stays single player (owner, 2026-11-21): a campaign act's fixed
ships and scripted beats have no meaning in somebody else's galaxy.

**Guard rails against accidents, not cheating** (vision pillar 5): a crash, a double join, an old
backup, a link pasted into the wrong chat. Nothing tries to stop a determined player.

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

**Unknown content is kept.** A newer build's item, module or hull id is carried untouched — whole
unknown stacks in the bundle's lockers, and single unknown ids re-inserted after the save sanitizer
has run (it would otherwise drop them). Custody asserts that every stack that left comes back once.

## Where the save keeps it (slice 2, save v29)

| In the save | What |
| --- | --- |
| `save.away` (beside `profile` and `world`) | the marker: which world, which host, the secret token, `(epoch, rev)` and the suitcase |
| `world.worldId` | this world's id, `null` until it is first hosted |
| `world.guests[guestId]` | `{ name, tokenHash, epoch, rev, bundle, lastSeen }` — the host's copy of a visitor |
| browser key `away:<worldId>` | the suitcase on its own, so two tabs cannot overwrite each other |

**The marker is not inside the profile.** Where a pilot *is* is a fact about the pilot and the
save, not about the character (nothing in `profile.js`'s field lists), so it sits beside the two
halves and `checkIn` clears it. `state.away` mirrors it at runtime, `currentSave()` writes it, and
`installNestedSave` reads it, so a save made while visiting still says so after a reload.

**Every older save loads at home.** v28-and-older saves have no marker, no `worldId` and no
guests, and `sanitizeSave` gives them `away: null` / `worldId: null` / `guests: {}`. That is the
whole migration: nothing is converted, nothing is guessed.

**A suitcase is not sanitized like a profile.** `cleanSuitcase` checks the shape and drops wrong
types, but never second-guesses a content id, because while a pilot is away the suitcase is the
only copy of its cargo. A damaged suitcase is dropped and the marker stays — the host still has
the pilot, so the pilot can still come home.

**A host's record never carries the guest's secret.** Only `hashToken(token, guestId)` is stored
(`custody.guestRecord` strips the token from the bundle it saves), so a host's save is not a way to
take somebody's pilot. Deleting a record is always safe: the guest's suitcase has a copy.

**Writes are swapped in.** `state/storage.js` writes to `key:tmp`, swaps it in, then keeps what was
there under `key:prev` (one generation, `NET.keepPrevious`). A browser stopped mid-write leaves the
old save or the new one, never half of either, and `loadAutosave` falls back to `:prev` if the live
record will not parse. Slots are swapped in too but keep no history. Storage keys and `TR1:` did not
change.

## Stations are world-scoped facts (LESSONS L19, generalised)

Generated pocket ids are **not unique across galaxy seeds**: `sys-002-hub` is an unrelated pocket in
another galaxy, and a station key built from it names a station that does not exist there. So a
station key is always resolved with the world it belongs to: `net/world-places.js` indexes a world
from its own seed (`generateGalaxy(seed)`, pure) plus its saved wormhole pockets, and `custody.js`
asks that index. Building an index never touches `data/places.js`'s live catalog, so inspecting
somebody else's world cannot move the ground under the running game.

## The connection (slice 3)

**The owner's design:** the guest joins by pasting **one link**. **Join Multiplayer World** (on the
title) and Pause > **Open Multiplayer** open the same screen; the host's link is there to copy and the
guest's paste box is there to take it. That is the normal path.

**One screen, one door each** (owner's rule, playtest 2): the same `#mp-screen` opened from the
**title menu** shows the join block, and opened from the **pause card** shows the host block —
`openMultiplayer({ from })` sets `screenModel().surface`, and `act()` refuses the other door's job a
second time. A guest who is mid-flight still gets their answer code and Leave on the pause card,
because that is the only screen they can reach; and quitting to the title closes the room, because
hosting is something you do while flying your own world.

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
sentence the guest can act on. A guest who is turned away learns why.

**Two machines need a path; one machine never does.** The signalling relay introduces the two
browsers and both sides then believe they are connected — but the *data* connection needs a network
path, and a home network often has none: no hairpin NAT, and the local addresses Chrome hides behind
`*.local` mDNS names get dropped by a firewall or a multicast-hostile router. Two tabs on one machine
share a process, so the failure is invisible there (LESSONS L35). The answer is `ICE.turn`
(`data/multiplayer.js`, the free Open Relay project) handed to the library as `turnConfig`, used
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
answers. Hence `ICE.gatherMs` (8 s, not 4) and three TURN families in `ICE.turn`, each with a TCP or
TLS 443 door because that is what a phone is allowed to open. `paste.js` counts the candidates by
kind (`paths()`, `hasRelayPath()`) and the screen says which kind of code the player is holding —
`relay: 0` means "same network only", before it is sent rather than after it fails.

**Diagnose by facts, not by mood.** `diagFacts()`/`diagReport()` (shown as **Connection details**,
copyable with one button) print the **build string**, the **world id**, the signalling state and its
sentence, **how many browsers are in the room**, the direct link's state, relay on/off, and
**messages sent versus received**. Read in that order they separate the three failures that all look
like "you are the only one there": different rooms (the world ids differ, or nobody is hosting), a
right room with no path (2 browsers, sent rising, received 0), and different builds (the two strings
differ). It exists because the first four playtests of this slice were diagnosed by guessing.

**Reachable is not the same as usable, and the code path is the floor.** Playtest 6 showed
`Relays reachable: 3 of 5` on both machines and still one browser in each room. A relay can accept a
plain WebSocket and then refuse the game's own events (`blocked:`, `restricted:`, `auth-required:`) —
the library **retires** such a relay silently — so the count that matters is the library's own,
`getRelaySockets()`, printed as **`Relays connected: N`**. The pinned list therefore keeps more than
one family of servers (popular ones *and* four of the library's curated defaults): a live relay that
will not carry this protocol is worse than a dead one, because it inflates a number.

Whatever the relays do, **the copy/paste codes work without any of them** — two players exchange two
codes through a chat window and the browsers connect directly. That is why it is no longer a
footnote: after `NET.helloWaitSec` with nobody in the room the session marks itself **stalled**
(`armStallTimer`), the host's screen auto-creates the offer (`autoOfferWhenStalled`, once per screen
opening), a stalled guest is given the paste box on the pause card instead of being told they are
already in a friend's world, and `net/paste.js` always offers `ICE.turn` beside its STUN — a player
who reached for the codes has already learned that the easy route failed, and the only remaining
question is whether a path exists at all.

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

**The hello is repeated until it is answered.** A hello "sent" is not a hello heard: the data
channel opens seconds after the room says the peer is there, and a message into an unopened channel
is gone without an error. So a guest repeats its hello every `NET.helloRetrySec` until a `welcome`
arrives — the reply is the latch — and clears its per-peer latch each round. The host logs "joined"
once per guest, however many hellos arrive, and re-sends the welcome freely. After `NET.helloWaitSec`
with no answer the guest is told, with a different sentence for "nobody is in the room" than for
"your friend is there but nothing gets through". The same retry covers the paste-code wire.

**Names are labels; a duplicate gets a star.** The secret in the link is the identity, the name is
what other people read. `net/session.js`'s `uniqueName(wanted, taken)` hands the joining guest the
first free variant — `Acey`, `Acey*`, `Acey**` — counted against the host's name and every guest but
its own row (so a rejoin does not grow another star). The host stores that name, lists it, and sends
it back in `welcome.youName`; the guest adopts it, says a sentence ("You are Acey* here — the host
already has a Acey.") and chats under it. The star is trimmed off the base rather than past
`NET.nameMax`, so a renamed name still fits the wire.

**The hello is per peer and retried.** `join()` returns as soon as the room is open, which is before
the other pilot has been introduced, so the guest's first hello has nobody to go to. It used to latch
"greeted" anyway and never retry: the host never admitted the guest, never listed it and never checked
its token, while chat — one broadcast per line — worked, so the guest's screen said *connected* and the
host's list stayed empty. Now `sayHello(peerId)` latches only on a send that left, and it is re-sent
when the channel reports a peer (`onPeer`) and over the paste wire when its channel opens.

**A code names the world.** `TRJOIN:` codes carry the host's `worldId` (`CODE_VERSION` 2; version 1 is
still read). A guest joining by code has no link to carry it, and without it the host's own handshake
would refuse the guest it had just invited. `session.codesAcceptFrom(offer)` builds the guest session
from the code, so the fallback works when the link is exactly what did not work.

Chat (**Enter**) and the list of connected players arrive in the same slice, so the pipe is proved
before anything of the player's crosses it. A hosted world **never pauses**, and the pause card
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

**What a session is not allowed to do yet:** it moves no pilot and draws no remote ship. That is
deliberate — the suitcase is slice 4, so this slice cannot lose a ship, and the owner can test it
without risking a save.

## Slices

1. **Custody** — `net/custody.js`, `net/station-inventory.js`, `net/world-places.js`,
   `data/multiplayer.js`, `tests/multiplayer-custody.test.mjs`. No networking. **Built 2026-11-21.**
2. **Save v29** — `save.away`, `world.guests`, the migration (old saves load with `away: null`),
   `guestId`/`worldId`, the temp-key-then-swap write that keeps the previous version, and the
   `away:<worldId>` storage key. **Built 2026-11-21.**
3. **The connection** — `net/transport.js` (Trystero for the one-link join, paste codes as the
   fallback), Pause > Open Multiplayer, chat and the player list. **Built 2026-11-21.**
4. **Join** — "Bring my pilot" (`checkOut`/`relocate` through the handshake slice 3 already
   answers), two-second snapshots, reconnects by `compare`, "Go home" from the suitcase with the
   host offline. **Next slice.**
5. **Crashes and reconnects** — the choice screen, "Your pilot is safe" with *Wait* and *Go home*,
   final snapshots on tab close, one session per `guestId`.
6. **Trading** — *View docked players*, a trade of items, a ship at that station, or credits, a first
   confirm that locks both sides and a second that commits; the host checks m³ in both station holds
   first and moves nothing if either side lacks room.

## Known gaps (until their slice lands)

- Nothing writes an `away` marker yet: `save.away` and `world.guests` exist and are validated (slice
  2), and slice 3 writes a guest record when a guest is admitted, but the pilot itself does not
  travel until slice 4 — so in play `away` is always `null` and the suitcase is empty.
- A pilot that is away is **frozen in words only**: `state.away` is set and `currentSave()` keeps it,
  but the screen that refuses to fly it (and offers *Rejoin* / *Bring pilot home*) is slice 4.
- The screen still draws and follows only the local pilot (`render/views.js`), and `core/input.js`
  fills only the local pilot's controls: a connected guest is a name in the list, not a ship on
  screen (slice 4). This is the largest visible gap.
- The player list is names (and `docked` once slice 4 sets it), not positions or ships.
- Nothing yet draws the remote pilot, so two connected players still fly their own worlds and see each
  other only in the list and in chat. A hosted world's pause card does not pause the world's *guests*,
  but the host's own clock follows `state.pause` as it always has.
- Non-local death recovery belongs to slice 5. The no-pause rule is **built** (slice 3).
