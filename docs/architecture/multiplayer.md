# Multiplayer: host-run co-op (step 16)

*Last checked: 2026-11-21 (slice 2).* The plan and its six slices are step 16 of
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

**The owner's design:** the guest joins by pasting **one link**. Pause > **Open Multiplayer** shows
a join link; **Join Multiplayer World** takes it. That is the normal path.

A browser cannot accept a connection on its own, so two browsers have to be introduced by something.
The owner's rules allow exactly one small networking library for this, behind `src/net/transport.js`;
nothing else in the game may name it. The library question is asked with its numbers in
[../REFACTOR_PLAN.md](../REFACTOR_PLAN.md) ("The library decision"); it is **not decided yet**, so
slice 3 has not started.

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

Chat (**Enter**) and the list of connected players arrive in the same slice, so the pipe is proved
before anything of the player's crosses it. A hosted world **never pauses**, and the pause card
carries **Open Multiplayer** (on/off, the join link, the paste box) instead of a pause.

## Slices

1. **Custody** — `net/custody.js`, `net/station-inventory.js`, `net/world-places.js`,
   `data/multiplayer.js`, `tests/multiplayer-custody.test.mjs`. No networking. **Built 2026-11-21.**
2. **Save v29** — `save.away`, `world.guests`, the migration (old saves load with `away: null`),
   `guestId`/`worldId`, the temp-key-then-swap write that keeps the previous version, and the
   `away:<worldId>` storage key. **Built 2026-11-21.**
3. **The connection** — `net/transport.js`, the one-link join (with paste codes as the fallback),
   Pause > Open Multiplayer, chat and the player list. **Not started: waiting on the owner's answer
   to the library question** (see step 16 in `docs/REFACTOR_PLAN.md`).
4. **Join** — the handshake, "Bring my pilot", two-second snapshots, reconnects by `compare`, "Go
   home" from the suitcase with the host offline.
5. **Crashes and reconnects** — the choice screen, "Your pilot is safe" with *Wait* and *Go home*,
   final snapshots on tab close, one session per `guestId`.
6. **Trading** — *View docked players*, a trade of items, a ship at that station, or credits, a first
   confirm that locks both sides and a second that commits; the host checks m³ in both station holds
   first and moves nothing if either side lacks room.

## Known gaps (until their slice lands)

- Nothing writes a marker yet: `save.away` and `world.guests` exist and are validated (slice 2),
  but only the join flow (slice 4) sets one, so in play `away` is always `null`.
- A pilot that is away is **frozen in words only**: `state.away` is set and `currentSave()` keeps it,
  but the screen that refuses to fly it (and offers *Rejoin* / *Bring pilot home*) is slice 4.
- The screen still draws and follows only the local pilot (`render/views.js`), and `core/input.js`
  fills only the local pilot's controls: a remote ship is simulated but not yet drawn (slice 4).
- Non-local death recovery, and the no-pause rule in the pause card, belong to slices 3 and 5.
