# LESSONS: classes of bug earlier chats hit, so you do not repeat them

*Last checked: 2026-11-18.*

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

<!-- L1, L2, L4 and L5 were moved verbatim to docs/archive/LESSONS_1-5.md on 2026-11-15 to keep
     this file under its size limit. -->

### L3. Warping or undocking during a dialogue failed the mission
- **Seen:** leaving mid-conversation (warp, undock) marked the mission failed, or killed the dialogue.
- **Cause:** "the player left the place" was interpreted as abandonment.
- **Rule:** leaving **pauses**; it never fails a mission. Failure comes only from a declared, explained cause
  (`fails.on`, with `fails.message`). A conversation that needs the pilot docked simply waits and the objective
  says to return.
- **Enforced by:** the wandering invariant (the pilot is moved to a different place before every action); the
  linter (`fails.message`, allowed failure reasons); `step13b` warp-before-Close test.

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

### L24. A cube map has two independent ways to be wrong: the seams and the faces' own frames

Making six images agree at their edges and making each image land right way up are different problems, and passing the
seam check tells you nothing about the second. The generator builds every layer as a function of the **direction** a
pixel looks in (one sphere, sampled back per face), which makes the 24 edges agree by construction and even makes a
useless seam metric read low — so `cube_seam_error` measures edge pixels in direction space (`face_dirs`, then sample
the *neighbouring* face through a 24-entry `CUBE_NEIGHBOURS` table), and the three skies read 0.36–0.66 per 255.
Separately, the six files follow the OpenGL cube convention (`FACE_AXES`), which the generator's own preview cannot
verify, because the preview draws the net from the same rules that drew the pixels. `BoxGeometry` groups its faces in
the same order but frames **+Y and -Y the other way up**, so two faces would have arrived upside down and no file, no
preview and no seam number would have shown it. The fix is `src/render/cubemap.js` (`CUBE_FACES`, `CUBE_FACE_FLIP`,
`orientFace`), and the test reads `FACE_AXES` out of the Python, rebuilds `BoxGeometry`'s UV frames with three.js,
compares a 7×7 grid of texels per face, and asserts each flip **necessary** (unflipped is wrong) and none **redundant**
(flipping a correct face breaks it). A tautological test that only re-reads the constant would pass forever while the
sky hung upside down.

- **Rule:** for anything with a coordinate convention (cube faces, cubemaps, UVs, handedness), take the convention from
  the two files that own it — the producer's source and the consumer's source — and prove them against each other in a
  test. Do not infer it from a screenshot, a preview sheet, or a dimension that looks plausible.
- **Also:** a `CubeTexture` is not a drop-in for a `MeshBasicMaterial.map` in three r128; only `background`/`envMap`
  consult `isCubeTexture`. Six ordinary textures on the six material groups is the same picture with nothing to go wrong.
- **Enforced by:** `tests/skybox.test.mjs` — "the six faces are drawn the way the generator painted them" and "each flip
  in the table is necessary and no flip is redundant". It caught the real bug (worst mismatch 1.25 on `py`/`ny`, 0.0000
  on the other four).

### L25. A projectile's hit test must read the colliders the world already has, and sweep, not sample

Shots went through Meridian Station for months because `updateBullets` asked two questions and neither was "is
there scenery here": it checked hostiles (a sphere) and rocks (a distance-to-centre circle). The colliders existed
and the player's own ship already collided with them; the projectile path simply never asked. Whenever something new
must be hit, blocked or stopped, look for the hit test the game **already trusts** and reuse it — here
`sim/colliders.js`, which `render/` bakes and `player.js` and `ai.js` already read — rather than writing a second,
cheaper approximation beside it. A second approximation drifts: the old rock test used a bounding circle, so shots
also died in empty space beside a lumpy rock.

The other half is **sweeping**. A basic cannon bolt covers 15 m in one 60 Hz tick and a missile 8 m, so an end-point
test tunnels through anything thinner than that: a station spoke, a small rock, the edge of a hull. Test the segment
between the last tick's position and this one (`segmentColliderHit`), take the nearest hit's fraction `t`, and put the
projectile at the impact point so the explosion happens where it hit and not past it. The same sweep answers "would
this wall block the beam" for free.

Two consequences worth keeping:
- **`noclip` and `collide: false` must stay pass-through for projectiles as well as ships.** They are the owner's
  opt-out; a weapon that hits decoration makes the opt-out meaningless. Assert it, do not assume it.
- **Check what the new stop rule does to balance before shipping it.** Rocks now stop enemy fire, so a pilot can take
  cover — a real gameplay change. Measure it (here: 1 of 24 long lines from the station meets a rock in the Meridian
  belt) and say so, rather than discovering it in a playtest.

- **Enforced by:** `tests/projectile-collision.test.mjs` — the Meridian Station's real geometry stops a bolt on its hub
  and its ring, a thin wall between two ticks is caught, the nearest collider wins, a hostile's hull still resolves
  first, `noclip` scenery does not stop shots, a rock stops a hostile shot aimed at the pilot, and a missile and the
  mining beam obey the same rule.

### L26. A collider is a snapshot: if the part moves, transform the query, never re-bake the bake

A baked collider is a photograph — right for a still part, wrong at once for a turning one: Meridian's 180 m arms are
**144 m** from a still hitbox in a minute. Baking several angles is wrong too: fat between samples, N× the triangles. Both conflate *geometry* with *where it is*. Keep them apart: bake the soup **once, in its own space**, store
the live transform beside it (`mover = { pos, quat, scale }`, refreshed per frame), and carry the **query** in — segment
for weapons, sphere for hulls. Asteroid soups already worked this way (`segmentRockHit`). Rotate the
normal back to world space before moving a hull.

**Follow the owner's default:** match the model for anything noticeable; only tiny decoration earns `noclip`, and a
*workaround* tag is a smell. The arms also exposed a latent bug: `closestPointTriangle`'s face-interior branch was
guarded by a triple product that is **identically zero**, so interior queries fell back to *vertex A* — wrong normal
and depth, for every hull. Thin flat geometry probes it.

- **Enforced by:** `tests/moving-colliders.test.mjs` — on the arms at 24 spin phases, clear between them, arms named
  `spin`.

### L27. A default is a rule you did not write down: a silent `0` made every station harmless

Hitting Meridian Station did nothing for three sessions. The rock path carries `damage: 1` hardcoded, so rocks hurt;
the scenery path threaded a `damage` factor from data through the bake to a `hit.damage > 0` gate — defaulting to `0`
at every hop (`colliderFromObject`, `scene.js`'s `f.collideDmg ?? 0`). Zero passed every check, multiplied every
number, did nothing. A **factor defaulting to zero behind a `> 0` gate** is a feature that is dead rather than wrong,
and nothing crashes.

**The owner's rule is the right default:** everything solid hurts unless specifically told not to (2026-11-15). So the
factor defaults to `1` — the rock's own number — and the opt-out is explicit data (`collideDmg: 0`). When a system
has a knob whose zero means "never", make the *default* the behaviour the game wants, and make disabling it the
sentence a person has to write on purpose. Then apply the rule everywhere it is meant to hold in one pass: the pilot
**and** hostiles, which had the same free bounce for the same reason.

The second half is the test that was missing: nothing asserted scenery damage either way, so 633 green tests said
"fine" about a station that could not hurt anyone. Assert a rule at what the player feels — flying a hull into scenery
and reading the shield bar — not at the plumbing that carries it.

- **Enforced by:** `tests/collision-damage.test.mjs` (bake defaults, the hull really takes the rock-rate damage,
  the factor scales it, `collideDmg: 0` opts out, slow contact is free, rock and station cost the same) and
  `tests/enemy-collision.test.mjs` (scenery damages a hostile, `collideDmg: 0` does not).

### L28. A `[hidden]` toggle fails when a container selector outranks it or a checkbox traps the key

- **Seen (owner, 2026-11-18):** the `N` panel would not close with `N` or its Close button.
- **Cause:** `#hud > #pocket-objects` (`display: flex`, two IDs) outranked `#pocket-objects[hidden]`, and `core/input.js` blocked non-Escape keys on checkbox `INPUT`s.
- **Rule:** every `[hidden]` rule must outrank every `display` rule for that element; typing guards apply only to text/number/select controls, never checkboxes.
- **Enforced by:** `tests/pocket-list.test.mjs` (all 13 `.hidden` surfaces, checkbox `KeyN`, and live N/Close/Esc/dock tests).

[More lessons](archive/reticle-and-recovery-lessons.md)
