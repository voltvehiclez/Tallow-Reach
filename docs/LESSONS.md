# LESSONS: classes of bug earlier chats hit, so you do not repeat them

*Last checked: 2026-11-14.*

Read this before changing anything. Each entry is a **class** of bug (not a single instance): what the owner
saw, the general cause, the rule that prevents it, and the test that enforces it. A rule backed by a failing
test is stronger than a rule in a doc, so when you fix a bug, make a test fail first.

**When the owner reports a bug:** reproduce it as a test, fix the root cause for the whole class, add or extend
the test, then add or update an entry here (copy the template at the bottom). If it is a repeat of a lesson
below, say so in that entry and strengthen the test, because a repeat means the test was too narrow.

Mission lessons are first because missions are where most bugs have come from. The full rules are in
[MISSION_RULES.md](MISSION_RULES.md).

---

## Missions

### L1. Starting a mission again spawned more ships each time
- **Seen:** accepting and abandoning a mission repeatedly made more and more NPCs appear.
- **Cause:** nothing stopped the same story mission being active twice (only the Mission log hid it), so its
  script ran twice; and abandoning did not always remove the ships, shots and crates the mission had made.
- **Rule:** a story mission can be active only once. Everything a mission spawns carries the mission's identity
  and is removed when it is abandoned, failed or paid. Starting it again starts clean from step 0.
- **Enforced by:** `tests/mission-invariants.test.mjs` ("cannot be active twice", "accepting and abandoning it
  over and over never multiplies its ships"); the guard in `acceptMission` (`sim/missions.js`).

### L2. A full hold made the mission skip, fail or abandon
- **Seen:** when the hold had no room for the mission item, the mission abandoned itself or moved on without the
  next dialogue.
- **Cause:** a resource shortfall (cargo space) was treated as a failure or as "done".
- **Rule:** a shortage makes a step **wait**, and the objective says what to do. A step that hands over an item
  advances only when the whole amount really fits. A mission item dropped in space stays there until collected.
- **Enforced by:** the full-hold invariant (every mission, every step); `tests/step13b-missions.test.mjs`
  (blocked beacon hand-off); `blockedScriptText` and the "Dock at a station and make room" hint.

### L3. Warping or undocking during a dialogue failed the mission
- **Seen:** leaving mid-conversation (warp, undock) marked the mission failed, or killed the dialogue.
- **Cause:** "the player left the place" was interpreted as abandonment.
- **Rule:** leaving **pauses**; it never fails a mission. Failure comes only from a declared, explained cause
  (`fails.on`, with `fails.message`). A conversation that needs the pilot docked simply waits and the objective
  says to return.
- **Enforced by:** the wandering invariant (the pilot is moved to a different place before every action); the
  linter (`fails.message`, allowed failure reasons); `step13b` warp-before-Close test.

### L4. A finished mission failed or vanished afterwards
- **Seen:** after completing the objective, a later sector change or death removed the mission before the reward
  could be claimed, and it re-appeared as a fresh "Start".
- **Cause:** failure rules were checked even after completion.
- **Rule:** a completed mission can no longer fail; it stays claimable until paid.
- **Enforced by:** `tests/step13b-missions.test.mjs` (return-home flow). *Partial: the invariants do not yet kill
  the pilot after completion, so add that case if this area changes.*

### L5. A dialogue button made things spawn, or ships appeared in the pilot's face
- **Seen:** pressing Continue triggered a spawn the briefing had not led up to; NPCs appeared on top of the pilot.
- **Cause:** world events were chained to dialogue progress; spawns were placed relative to nothing safe.
- **Rule:** dialogue and the world are separate (Continue only moves the conversation). Spawns happen because of
  what the pilot does in the world, from a declared distance of at least `MISSION_RULES.minSpawnDistance`, while
  flying.
- **Enforced by:** invariant (the world is snapshotted around every dialogue click and must be unchanged);
  invariant (measured spawn distance); linter (every spawn needs `spawnDist`, `requiresFlying`).

### L6. A mission item appeared in the hold by itself
- **Seen:** with a full hold the item dropped; after unloading cargo at the station the item suddenly appeared in
  the inventory instead of having to be retrieved.
- **Cause:** the game held the item aside and delivered it automatically once space freed up.
- **Rule (the realism rule):** nothing enters or leaves the hold or wallet except by a real pickup, purchase,
  loading at the dock or hand-over the player performs. Never as a side effect of space or a timer.
- **Enforced by:** the item-integrity invariant (a storm of docking, undocking, ticks and inventory events must
  not change mission items except through recorded pickups and hand-overs).

### L7. One mission's trigger advanced another mission
- **Seen:** two active missions interfered (a wave-clear for one moved the other).
- **Cause:** mission-tagged events were not scoped to the mission that owned them.
- **Rule:** every mission-tagged trigger carries its mission id and only that mission reacts.
- **Enforced by:** "two missions at once" invariants; `step13b` trigger-isolation test.

### L8. Authored mission fields were silently lost on save and load
- **Seen / risk:** a field added to a mission step worked in play but vanished after a save and load, because the
  save sanitizer (`cleanMissionStep` in `state/profile.js`) keeps only a list of known fields.
- **Rule:** any new step field must be added to that list. A save and load must keep every authored field.
- **Enforced by:** the save-and-load-at-every-step invariant, which compares every authored field of every step
  after a round trip through `sanitizeSave`.

### L9. A step kind that nothing could ever complete
- **Seen:** the `deliver` step kind existed, but nothing in the game emitted "delivered", so a mission using it
  could never finish.
- **Rule:** every step kind and trigger needs a real event source and a test before missions may use it. Until
  then the linter rejects it.
- **Enforced by:** the linter (`deliver` is an error); `tests/mission-lint.test.mjs`.

### L10. Death failed missions it should not have, or left a mission stuck without its item
- **Seen:** the owner wanted death to be punishment enough: a mission was failing on death for no good reason, and a mission
  whose parcel or beacon was lost with the ship had to fail clearly instead of waiting forever.
- **Rule:** dying does not fail a mission unless its data says so (`fails.on` has `player-dead`) or the ship was carrying a
  mission-only item (category `mission`) the mission needs, which is lost for good. Either way the failure carries a message
  and the HUD shows "Mission failed: <mission>" with the reason. Ordinary goods carry on. `player-dead` carries `lost`, the
  hold at that moment, so no listener depends on whether the cargo was already cleared.
- **Enforced by:** `tests/mission-death.test.mjs`; the die-at-every-step invariant in `tests/mission-invariants.test.mjs`.

### L11. Confusing or spoiling player-facing text
- **Seen:** `Progress 0/2` counted dialogue lines, not mission progress; an objective revealed an ambush before it
  happened.
- **Rule:** the HUD and Mission log show only the authored `objective` (which hints at the next action without
  revealing what has not happened yet). Never show internal counters, step numbers or trigger names.
- **Enforced by:** the linter (every step needs an `objective`); `tests/step13c-ui.test.mjs`.

### L15. A mission claimed to be accomplished before its items were handed in, then stuck when they were lost
- **Seen:** after the Border Signal's last in-space line the HUD said the mission was done and to return for the reward; dying
  then lost the beacon, the reward could never be collected, and the mission sat there forever. Contracts announced "Mission
  complete" before their crates were handed in, and called themselves missions rather than contracts.
- **Rule:** finishing the steps is `missionObjectivesDone`, never "accomplished". An item-bearing mission is paid only by
  `completeMission`, which consumes the hand-in first; until then its guidance shows `handIn.objective` and how much is still
  owed. A lost mission-only hand-in (the hold destroyed with the ship, or no copy anywhere) fails the mission with a message
  instead of waiting forever. Wording follows the mission's `kind`: a contract says "Contract ...". Never read
  `mission.completed` by hand; use `missionObjectivesDone`.
- **Enforced by:** the linter (`handIn.objective` required; no completion words in guidance; a contract may not say mission),
  `tests/mission-death.test.mjs` (death after the last step, and a hand-in that exists nowhere), the
  `last step does not accomplish it` invariant in `tests/mission-invariants.test.mjs`, `tests/step13-missions.test.mjs` and
  `tests/step13c-ui.test.mjs`.

---

## Everything else

### L12. A new way to change state skipped the normal refresh
- **Seen (step 10):** after loading a save the sound was dead, the start screen reappeared on docking, and
  Load/Import/Reset did not redraw the screen.
- **Rule:** state changes go through the one path that also does the refresh (events, `loadGame`-style
  functions). A new route that sets state directly must emit what the listeners expect.
- **Enforced by:** `tests/step10-fixes.test.mjs` and the baseline playtest.

### L13. Anything that accumulates per frame must be multiplied by the time step
- **Seen:** the ship blurred and warp roll differed on a 240 Hz display.
- **Rule:** use `dt`; render between ticks by interpolation. See `architecture/simulation-and-rendering.md`.
- **Enforced by:** `tests/sim-step.test.mjs` (the fixed-step tests).

### L14. `matrixWorld` is last frame's transform
- **Rule:** after moving an object, update its matrix before reading `matrixWorld` for a gun or camera position.
  See `architecture/simulation-and-rendering.md`.
- **Enforced by:** NOT YET: add a test if this bites again (it cannot be checked headlessly today, only by eye).

### L16. A hull id is not a ship
- **Seen (owner):** "If you die, you get a free wasp. Cant then equip equipment to the ship." The replacement Wasp had no bays in
  Outfitting and flew with no thrusters and no Hull HP.
- **Cause:** the lost hull's fleet records (`holds[id]`, `hp[id]`, `loadout[id]`) were deleted, and the replacement was added as
  an id only. Everything reads a ship *through* those records — `layoutFor` for its bays, `hullOf` for Hull HP, the fit for
  drive, shields and guns — so a hull without them is not half a ship, it is nothing. A save/reload hid the bug, because
  `cleanLoadouts` gives any hull without a saved fit the stock fit.
- **Rule:** a hull joins the fleet through `addShipRecords` (`state/profile.js`); nothing pushes to `profile.ships` without it, and
  a hull that becomes the flown ship goes through `ensureShipRecords` first. Never delete a ship's records without creating the
  ones its replacement needs, in the same step.
- **Enforced by:** `tests/ship-recovery.test.mjs`, and the post-death snapshots in `tests/single-player-combat-8b.test.mjs`
  (they record power, shields, hull, a gun bay and an empty hold for the replacement ship).

### L17. A recorded-state fixture only proves what changed if you diff it
- **Seen:** fixing the spare Wasp changed the recorded 8b lifecycle fixture, which failed as a long unreadable deep-equal.
- **Rule:** when behaviour changes on purpose, re-record the fixture and diff old against new. Accept it only if every difference
  sits inside the behaviour you meant to change — here snapshots from the death onwards changed and every earlier one was
  identical, which is the evidence the fix did nothing else. Say so in a comment beside the fixture's test. A blanket re-record
  that "makes the test pass" would hide real regressions.
- **Enforced by:** the comment above the fixture assertion in `tests/single-player-combat-8b.test.mjs`.

### L18. A rule about *where* something happens was left to the caller
- **Seen (owner):** "It doesn't seem like the game cares which location you hand in a mission in." Contracts and missions
  paid at whatever station the pilot happened to dock at, and the guidance named that station too.
- **Cause:** the reward step asked only "is the pilot docked?" — the *place* was never part of the mission record, so the
  runner, the HUD and both docked screens each invented their own idea of "the station". The data had the fact only in prose.
- **Rule:** a mission fact that decides an outcome is data on the mission, not a condition read from wherever the player is.
  The hand-in station is stored on the mission when it is taken (`handIn.station`, defaulting to the giving station), one
  runner function answers "which station" and "are we there", every screen asks it, and `completeMission` refuses anywhere
  else. Guidance names the station from that same field (`{station}`), never a second copy of the name.
- **Enforced by:** `tests/mission-handin-station.test.mjs` (a second station pocket proves the wrong counter pays nothing),
  the linter's `handIn.station` checks, and `docs/MISSION_RULES.md` rule 11.

### L19. A field was written on one object and read from another, so a feature silently never appeared
- **Seen (owner, step 14a playtest):** the rift sky was asked for and nothing in the game looked different — a rift
  still showed the ordinary starfield and the pocket's planet behind it.
- **Cause:** the sky was registered on the **place record** (`registerInstancePlace({ …, sky })`, read back with
  `placeAt(id)`) but the renderer looked for it on the **place definition** (`placeDef(id).sky`), which is built from
  features only. The lookup returned `undefined`, the `if` did nothing, and every test still passed: nothing in `sim/`
  or `data/` could see it, and no test asserted the field was where the reader reads it. A whole feature was missing
  and the only failure was a picture.
- **Rule:** when `render/` or `ui/` reads a field, name in a comment **which object carries it**, and add an assertion
  that reads the field back **the same way the reader does** — `placeAt(id).sky.kind`, not "the template has a sky".
  A visual or presentational feature that no test can see is a feature nobody has verified: the data being right is not
  the same as the reader finding it. Silence is the failure mode here, so prefer a test that would fail if the reader
  and the writer disagreed.
- **Enforced by:** `tests/step14-instances.test.mjs` — the reload test asserts `placeAt(record.id).sky.kind` is the
  template's declared kind (the reader's own path), and the template test asserts every template declares a `sky.kind`
  in `SKY_KINDS` and no `planet` feature.

---

## Template (copy for a new entry)

```
### Ln. Short name of the class of bug
- **Seen:** what the owner saw, in their words.
- **Cause:** the general cause, not the one line of code.
- **Rule:** what must always be true.
- **Enforced by:** the test(s) or linter rule that fail if it breaks. If there is none yet, write
  "NOT YET: add a test" and add it in the same change.
```
