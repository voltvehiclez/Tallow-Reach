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

### L20. A frame that throws stops the picture but not the loop, so a one-line bug plays as a dead game
- **Seen (owner, step 14 playtest):** "the game crashes … a few seconds after you've destroyed the last guardian" —
  a frozen screen, no message, and the only word about it a line in the browser console nobody was looking at.
- **Cause:** `main.js` asks for the next frame *before* it does the frame's work, so an exception inside a frame leaves
  the loop alive and the last good image on the glass: the game is running and looks dead. The pasted error was from a
  stale build, but the shape of the failure is the lesson — anything that can throw in front of the player takes the
  whole game down with it, silently.
- **Rule:** work that can throw in front of the player is caught where it happens, **said on screen in a sentence with
  the error's own first line** (`ui/crash.js`, `reportCrash`), and the picture is drawn anyway. A repeat is counted, not
  listed (a per-frame error would bury the sentence in a second); the card lists a few distinct problems and says how
  many it left out. The net listens only to what the browser reports as uncaught plus the frame loop's own catch — no
  `sim/` module may call it and no game rule may depend on it, and a test that expects an error still gets it thrown.
- **Enforced by:** `tests/crash.test.mjs` — the card's sentence and where it came from, repeat counting, the four-line
  cap with its "and N more" line, dismissal, and that a broken `document` cannot itself become the crash — plus the
  `frame`/`drawFrame` split in `main.js`.

---

### L23. When a complaint is about *where* something shows, ask what root hides it — and a "fires together" rule is a selection missing, not a speed problem
- **Seen (owner):** world-space name tags ("Trade lane asteroid field") floating over the main menu; every fitted gun firing on one click; the free-cam ship turning under a level camera.
- **Cause:** the markers were created under `#mk`, a sibling of `#hud`, so every path that hid the HUD (`setReticle`) left them behind — a visibility root that did not cover everything it owned; and the fire loop walked *all* fitted guns because nothing modelled "which primary is selected" — the missing concept, not a cooldown or power bug, made twin cannons fire as one. The camera's lookAt carried its own world-up, ignoring the ship's roll.
- **Rule:** UI hidden together is hidden together: if a surface can show world-space overlays, the one switch that hides the HUD hides the overlays too. And when only one of N fitted modules should act, the game must store which one — an "active slot" is data and a key, not a special case in the fire loop. An orientation aid that has its own up vector must document whose up it uses (the world's, or the ship's — here the ship's, for the free camera).
- **Enforced by:** `tests/primary-slots.test.mjs` (only the selected bay fires, empty bay fires nothing, legacy `pw` migrates to the bay holding that kind of module) and the extended assertions in `tests/ui-cursor.test.mjs`'s siblings (markers ride in `setReticle`, so the `main-menu`, `docked` and boot paths cannot leave tags behind).

---

### L24. An objective about a "place" with no place on the record pays for anywhere
- **Seen (owner):** a hunt contract could be completed by killing any pirate raider anywhere in the universe, and the objective gave no hint where the job actually was.
- **Cause:** the kill step carried the enemy and nothing else, so `objectiveMatches` had no place to refuse against — an "area" job became a galaxy-wide job. The acceptance pocket is the anchor the game already had; it simply was not stamped onto the objective.
- **Rule:** any objective whose meaning is "here" stamps `step.place` (or its sector equivalent) at acceptance, the runner refuses events from any other place, and the player-facing sentence names the area from the same data the spawner uses (the field feature's own name) — never a vague "somewhere out there". And a popover that belongs to a right-click puts its action buttons in the popover's header, directly under the title on their own line: the footer-line confirm sits a popover-height below a displaced cursor, which is the whole "barely move the mouse" complaint (a second owner bug, 2026-11-14).
- **Enforced by:** `tests/hunt-place.test.mjs`; popover contract in `ui/menu.js` and `ui/discard.js` (`.inv-sell-head`).

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

### L21. When a new ask makes old code look like a special case, the shape underneath is usually the cause

The canister's prize began as a list of `{ i, c }` stacks because that was the shape a save could carry, and the same
shape is why the ordinary inventory rules could not reach it: `sim/inventory.js` speaks stock maps, so `openCache` had
to hand-carry cargo unit by unit, and every question about the canister — what is in it, is there room, move three of
these — needed a loop of its own. When the owner asked for a trade (two inventories side by side, clicks moving cargo
between them), the fix was not a panel bolted onto the old shape: it was making the canister an ordinary stock map
first, after which the panel was two columns of the grid that already existed and every move was the existing
`moveItem`. The save kept the list shape by converting at the two edges (`captureInstances`, `restoreInstance`), so no
save version moved. Before building UI for a container, ask what shape the container is: if the inventory layer cannot
address it, the panel will end up re-implementing the inventory layer.

### L22. When the owner says "remove the lines", remove the ability to draw lines

The first painted sky carried fractures and filaments because a nebula with nothing but blobs in it looked empty, and
they were painted the only way a canvas draws a thin bright thing: `beginPath`, `lineTo`, `stroke`, three times over
for the seam. The owner's verdict on the second round was that the sky was good *except* those lines — and the
temptation was to repaint them fainter, blurrier, fewer. Fainter lines are still lines: the eye reads a stroke as a
mark somebody made, which is exactly what "not realistic" means. The fix was structural instead — the painter lost its
`stroke` helper altogether, so a line in the sky is now impossible rather than discouraged, and the structure the lines
had been standing in for came back as shapes a real nebula actually has (bright cores where the gas is thick) plus one
pass of invisible dither grain, because a smooth dark gradient bands into contour lines of its own on an 8-bit screen
and those would have been "odd lines" by next round. The test that protects it asserts the recording canvas saw zero
strokes and no path ever started: when a complaint is about a kind of artifact, pin the absence of the capability, not
the absence of this week's instance of it.

### L25. Two skies for one picture: the same image installed twice, and a starfield that was already in the paint

- **Seen (owner, 2026-11-15):** "remove the existing starfield. This is because our previously generated skybox already
  has some stars baked in it. I might re-add star fields in the future but not now."
- **Cause:** the sky was one thing and the stars another, because until now no sky *was* a picture — the starfield was
  the only thing drawing stars. The moment normal space started wearing a generated skybox, two systems were drawing the
  same stars, and the fix was not to darken one of them: it was to stop drawing a second set. The same shape of mistake
  sat in the assets: the sky the owner kept had been installed under a working name and again under its real one, so the
  build inlined the same 140 KB picture twice.
- **Rule:** a picture that carries a thing must not be drawn under a second copy of that thing — ask *who draws this*
  before adding a layer. A sky's own look is data on the sky (`starfield`, `shards`), and one switch (`STARFIELD.enabled`)
  can turn a whole layer off without deleting the geometry, so the owner can ask for it back in one line. And an installed
  sky is a resource with a name: re-making it under the final name and `remove`-ing the old one is part of installing it
  (the tool has `remove` for exactly this, because `src/assets/skyboxes/` is the tool's folder and not a place to delete
  from by hand).
- **Enforced by:** `tests/skybox.test.mjs` — "normal space wears a generated sky, and the drawn starfield is off" reads
  `showPlace`'s own starfield expression (writer and reader cannot drift apart, as in L19) and pins the master switch;
  "nothing is in the skybox folder or the url map without being in data/skyboxes.js" plus the per-id budget check make a
  second copy of a picture a visible 140 KB, and the report's file size is quoted in the CHANGELOG entry.

### L23. Imported models need an explicit coordinate and size contract

An owner-supplied fighter faced +X and used small exporter units; loading successfully did not make it
a flight-ready model. Keep optional visual yaw and target length in hull data, rotate before measuring,
then scale and centre the bounds in a wrapper. Do not change gameplay `sc` to fix asset units. Test
forward direction, centred bounds, and size relative to the baseline hull before asking for a playtest.
