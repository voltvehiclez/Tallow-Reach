# Testing step 16, slice 2: save v29

**What this slice is:** the save now records **where your pilot is**. Nothing you can click
has changed. Multiplayer is not connected yet (that is slice 3), so the game should play
exactly as it did before, and your existing save should open as if nothing happened.

**What the save gained** (both optional, both invisible until a pilot actually visits
somebody):

- `away` — beside your pilot and your world, not inside either: `null` when you are at home,
  and a marker naming the world and host when you are visiting.
- `world.worldId` and `world.guests` — your world's own id (empty until you first host) and
  the copy of each visiting pilot.

Version is now **29**. A v28 save (yours) loads at home with no guests: that is the whole
migration, and it is what most of the tests check.

---

## Before you start

1. **Keep a copy of your current save.** Saves → **Export**, paste the code into a text file.
   Nothing here should touch it, but this is the first slice that changes the save format, and
   the point of the test is to prove it does not.
2. Run **`npm run build`** and then **`npm test`**. The suite should show **881 pass / 0 fail**.
   Build prints the size of `game/tallow-reach.html`.
3. Start the game as usual (`npm start`, or open the built file the way you normally do).

---

## The test (about 4 minutes)

### 1. Your save opens unchanged

- Title screen → **Open World** → your autosave (or Saves → your slot).
- **Expect:** the same credits, ships, cargo, station storage, missions and position you left.
  Docked or flying, wherever you were.
- **Expect no message about an old save, a migration, or a conversion.** The migration is
  supposed to be silent.

### 2. Nothing about play changed

Fly for a minute: launch, steer, fire, mine one rock, dock again. Pause (P), the station tabs,
the starmap, the mission log — open each once.

- **Expect:** exactly what you had before this slice. Slice 2 touched the save, not the game.

### 3. The save survives being saved

- Dock, **undock**, fly, dock again (each of those autosaves), then **reload the page** and
  continue.
- **Expect:** the same game, at the same place. This is the swap-and-keep-the-old-version
  write path doing its job.
- Then Saves → **Save to slot 1**, reload, **Load slot 1**: same save.

### 4. Export and import still work

- Saves → **Export** → copy the code. Then **Import** the code you just copied.
- **Expect:** it loads, with a note that importing replaces the current game (that is the
  existing behaviour, unchanged).

### 5. Campaign is untouched

- Campaign → it opens as before, on its own pilot and progress. Leave and return to the open
  world: your open-world pilot is exactly as you left it.

### 6. An old save still loads (the migration itself)

Saves → **Import**, paste **code A** from `testing/TEST-OLD-CODES.txt`.

- **Expect:** credits 4,850, Wasp + Prospector, docked at Meridian Station.
- Export straight back out and import your own code from step 0 to get your game back.

---

## If something looks wrong

Tell me **what you did, what you expected, and what happened** — a screenshot of the crash card
is ideal. Three things are worth naming specifically:

- "my credits / ships / cargo changed" — the migration failing, which is the one thing this
  slice must not do.
- "the game did not load my save at all" — the swap or the recovery.
- "an error card appeared" — the first line of the card is enough.

## What is **not** in this slice (do not look for it yet)

- No multiplayer menu, no join code, no chat, no player list. Those are slice 3.
- No way to send your pilot anywhere. The `away` marker is written only by the join flow in
  slice 4, so today it is always `null` — which is why nothing should look different.
- No trading. Slice 6.
