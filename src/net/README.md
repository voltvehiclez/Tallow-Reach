# src/net: multiplayer (refactor step 16)

Two friends play co-op: one **hosts** their open world and the other **joins** it through a
WebRTC link. The host's browser runs the one true simulation; the guest sends what it is asking
its ship to do and draws what the host sends back.

**This folder is the only place a connection may live.** Nothing in `src/sim/` imports it (the
layer test does not need to list it: `sim/` imports it never), and `ui/` and `render/` talk to it
through `util/events.js` and through `state.players`, which already holds every pilot. Slices 3 to 6
add `transport.js` (the one thin wrapper around the connection library) and the host/join/sync code;
slice 1 is the custody rules on their own, with no networking at all.

| File | What it does |
|---|---|
| `custody.js` | **The pilot's suitcase.** `checkOut(save)` packs the open-world pilot into a `bundle` (the `TRAVEL_FIELDS` half of the profile plus the station lockers, each stack carrying its `origin` station) and writes the `away` marker; `checkIn(save, bundle)` puts it back into a *new* save, clearing `away`, merging the home half (missions, flags, stats) from the home save untouched; `relocate(bundle, world, options)` sends anything whose station a world lacks to Meridian and puts it back the moment that station exists again, never refusing or deleting, and flags an over-full station; `compare(a, b)` orders two copies by `(epoch, rev)`. It also holds the small facts a host needs: `hashToken`/`tokenCheck` (the host stores a hash, never the secret), `handshake` (version, world and token, each with a sentence for the refusal), `guestRecord`, `summary(bundle)` ("600 cr · 1 ship · 0 m³"), `uniqueName` (the host's name wins, joiners wear `*`, `**`), `mergeLockers`, `hostProfile` and `totals` (what left vs what arrived, for tests). Plain data in, plain data out: no DOM, no three.js, no save it was handed is mutated. |
| `station-inventory.js` | **Room at a station, defined once.** `inventoryOf(world)` reads `world.stationStores` (or a plain station map) into clean stocks — keeping an id this build does not know, because custody must carry it; `stockVolume`, `stationCapacity(world)` (the shared per-level figure in `data/station.js`), `stationRoom`, `stationSpaceFor` (free m³ and the stack rule); `guardOverfull(world)` flags any station holding more than it can as `world.storageOverfull[key]`, which only refuses *new* deposits and never deletes a unit. Slice 6's trade asks the same questions. |
| `world-places.js` | **Where a station is in somebody else's world.** Generated pocket ids are **not unique across galaxy seeds** (`sys-002-hub` is a different pocket in a different galaxy), so a station key is always read with the world it belongs to: `stationsOf(galaxy)` indexes a resolved galaxy; `stationsOfWorld(world)` indexes a save's own world from `world.galaxy.seed` plus its saved wormhole pockets; `stationIn(index, key)` is the one question custody asks; `stationKeys`, `sameWorld`, `authoredStations`. Building an index never touches the live catalog (`data/places.js`), so inspecting another world cannot move the ground under the running game. |

**Rules**

- Saves stay backward-compatible: `save.away` is a v29 field added in slice 2, and an old save loads
  with `away: null`.
- Only `data/multiplayer.js` says what travels. Adding a saved profile field makes
  `tests/multiplayer-custody.test.mjs` fail until it is listed as travelling or staying home.
- **Items are moved, never copied.** A stack that leaves is the only copy; `totals()` proves it.
- A host's copy of a guest is `world.guests[guestId]` (slice 2): `{ name, tokenHash, epoch, rev, bundle, lastSeen }`.
  Deleting that entry is always safe, because the guest's suitcase has a copy.
- **Nothing in this folder may import `core/`, `ui/` or `render/`** — it is below all three, like `sim/`.
